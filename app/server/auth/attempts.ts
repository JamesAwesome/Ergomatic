import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  AuthProvider,
  AuthPurpose,
  AuthUser,
  SignedIn,
  UnlinkOutcome,
} from "../../shared/auth.js";
import { AuthFailure } from "./frontDoorErrors.js";
import type { VerifiedIdentity } from "./providers.js";
import { hashToken, SESSION_TTL_MS } from "./sessions.js";
import type { AccessPolicy } from "./accessPolicy.js";
import type { AppleGrant, RevokeApple } from "./appleRevoke.js";

export type Surface = "native" | "web";
export type Stage =
  | "authorize"
  | "exchanging"
  | "confirm"
  | "reauth_authorize"
  | "reauth_exchanging"
  | "target_authorize"
  | "target_exchanging"
  | "link_ready"
  | "delete_ready";
export interface Attempt {
  id: string;
  bindingHash: string;
  surface: Surface;
  purpose: AuthPurpose;
  targetProvider: AuthProvider;
  existingProvider: AuthProvider | null;
  stage: Stage;
  version: number;
  state: string;
  nonce: string;
  originalSessionId: string | null;
  createdAt: Date;
  expiresAt: Date;
  reauthenticatedAt: Date | null;
  verifiedSubject: string | null;
  verifiedEmail: string | null;
  verifiedName: string | null;
  appleClientId: string | null;
  appleRefreshToken: string | null;
}
/** A deletion has ONE success shape: the account is gone either way.
 *  `appleRevoked` says whether NOTHING IS LEFT OUTSTANDING AT APPLE — every
 *  grant we held was accepted by Apple, OR there was no grant to revoke. It
 *  is vacuously `true` for a Google-only account, because `createAppleRevoke`
 *  returns `true` on an empty list, so it never means "Apple was contacted".
 *  False means we held at least one grant and at least one revoke failed. */
export interface DeleteOutcome {
  outcome: "deleted";
  appleRevoked: boolean;
}
export interface AttemptResult {
  attempt?: Attempt;
  signedIn?: SignedIn;
  linked?: true;
}
const projection = `id,binding_hash AS "bindingHash",surface,purpose,target_provider AS "targetProvider",existing_provider AS "existingProvider",stage,version,state,nonce,original_session_id AS "originalSessionId",created_at AS "createdAt",expires_at AS "expiresAt",reauthenticated_at AS "reauthenticatedAt",verified_subject AS "verifiedSubject",verified_email AS "verifiedEmail",verified_name AS "verifiedName",apple_client_id AS "appleClientId",apple_refresh_token AS "appleRefreshToken"`;
const ttl = 300000;
const random = () => randomBytes(32).toString("base64url");
const subjectColumn = (provider: AuthProvider) =>
  provider === "apple" ? "apple_sub" : "google_sub";
export function attemptProvider(a: Attempt): AuthProvider {
  return a.stage.startsWith("reauth_") ? a.existingProvider! : a.targetProvider;
}
function same(a: Attempt, b: Attempt) {
  return (
    a.bindingHash === b.bindingHash &&
    a.surface === b.surface &&
    a.purpose === b.purpose &&
    a.targetProvider === b.targetProvider &&
    a.existingProvider === b.existingProvider &&
    a.stage === b.stage &&
    a.version === b.version &&
    a.state === b.state &&
    a.nonce === b.nonce &&
    a.originalSessionId === b.originalSessionId
  );
}
function consistent(a: Attempt) {
  const signup = ["authorize", "exchanging", "confirm"].includes(a.stage);
  const verified = ["confirm", "link_ready"].includes(a.stage);
  if (
    (a.purpose === "signin") !== signup ||
    (verified &&
      (!a.verifiedSubject || a.verifiedEmail === null || !a.verifiedName)) ||
    Boolean(a.appleClientId) !== Boolean(a.appleRefreshToken) ||
    ((a.stage.startsWith("target_") ||
      a.stage === "link_ready" ||
      a.stage === "delete_ready") &&
      !a.reauthenticatedAt) ||
    // A PURPOSE-TERMINAL STAGE BELONGS TO ITS PURPOSE. `accept()`'s tail
    // reads `a.purpose === "signin" ? "confirm" : "link_ready"`, so a delete
    // arriving there would be stamped `link_ready` — and every clause above
    // would accept it, because the tail fills every `verified_*` column. It
    // is unreachable today only because `claim()`'s `next` map has no
    // `delete_ready` entry, so a delete can never reach `target_exchanging`;
    // that is an invariant held up by the current call graph with nothing
    // naming it (RF18). This names it, and closes the mirror case too
    // rather than the one counterexample (RF34). The signin-only stages are
    // already covered by the `signup` rule at the top.
    ((a.stage.startsWith("target_") || a.stage === "link_ready") &&
      a.purpose !== "link") ||
    (a.stage === "delete_ready" && a.purpose !== "delete")
  )
    throw new AuthFailure("attempt_expired");
}
export function createAttempts(
  pool: pg.Pool,
  accessPolicy: AccessPolicy,
  // Required, not defaulted (RF25): a defaulted no-op would silently report
  // a revoke that never happened.
  revokeApple: RevokeApple,
) {
  let healthy = false;
  function requireAccess(email: string): void {
    if (!accessPolicy.allows(email))
      throw new AuthFailure("access_denied", email);
  }
  async function transaction<T>(
    work: (tx: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      const result = await work(tx);
      await tx.query("COMMIT");
      return result;
    } catch (error) {
      await tx.query("ROLLBACK");
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505" &&
        "constraint" in error &&
        ["users_apple_sub_unique", "users_google_sub_unique"].includes(
          String(error.constraint),
        )
      )
        throw new AuthFailure("account_conflict");
      throw error;
    } finally {
      tx.release();
    }
  }
  async function load(
    tx: pg.Pool | pg.PoolClient,
    id: string,
    lock = false,
  ): Promise<Attempt> {
    const row = (
      await tx.query<Attempt>(
        `SELECT ${projection} FROM auth_attempts WHERE id=$1 AND expires_at>now()${lock ? " FOR UPDATE" : ""}`,
        [id],
      )
    ).rows[0];
    if (!row) throw new AuthFailure("attempt_expired");
    consistent(row);
    if (row.originalSessionId) await original(tx, row.originalSessionId, lock);
    return row;
  }
  async function original(
    tx: pg.Pool | pg.PoolClient,
    id: string,
    lock = false,
  ): Promise<{ id: string; userId: string; email: string }> {
    const session = (
      await tx.query<{ id: string; userId: string; email: string }>(
        `SELECT sessions.id,sessions.user_id AS "userId",users.email FROM sessions INNER JOIN users ON sessions.user_id=users.id WHERE sessions.id=$1 AND sessions.expires_at>now()${lock ? " FOR UPDATE" : ""}`,
        [id],
      )
    ).rows[0];
    if (!session) throw new AuthFailure("account_changed");
    requireAccess(session.email);
    return session;
  }
  async function bound(tx: pg.PoolClient, expected: Attempt) {
    // Link mint and session deletion lock the session before its attempts.
    // Keep that order for every transition so concurrent replacement cannot cycle.
    if (expected.originalSessionId)
      await original(tx, expected.originalSessionId, true);
    const a = await load(tx, expected.id, true);
    if (!same(a, expected)) throw new AuthFailure("attempt_expired");
    return a;
  }
  async function save(tx: pg.PoolClient, a: Attempt): Promise<Attempt> {
    consistent(a);
    const result = await tx.query<Attempt>(
      `UPDATE auth_attempts SET stage=$2,version=version+1,state=$3,nonce=$4,expires_at=$5,reauthenticated_at=$6,verified_subject=$7,verified_email=$8,verified_name=$9,apple_client_id=$10,apple_refresh_token=$11 WHERE id=$1 AND binding_hash=$12 AND surface=$13 AND purpose=$14 AND target_provider=$15 AND version=$16 AND expires_at>now() RETURNING ${projection}`,
      [
        a.id,
        a.stage,
        a.state,
        a.nonce,
        a.expiresAt,
        a.reauthenticatedAt,
        a.verifiedSubject,
        a.verifiedEmail,
        a.verifiedName,
        a.appleClientId,
        a.appleRefreshToken,
        a.bindingHash,
        a.surface,
        a.purpose,
        a.targetProvider,
        a.version,
      ],
    );
    if (!result.rows[0]) throw new AuthFailure("attempt_expired");
    return result.rows[0];
  }
  async function find(
    tx: pg.PoolClient,
    provider: AuthProvider,
    sub: string,
  ): Promise<AuthUser | undefined> {
    return (
      await tx.query<AuthUser>(
        `SELECT id,email,name FROM users WHERE ${subjectColumn(provider)}=$1`,
        [sub],
      )
    ).rows[0];
  }
  async function grant(
    tx: pg.PoolClient,
    userId: string,
    a: Pick<Attempt, "appleClientId" | "appleRefreshToken">,
  ) {
    if (a.appleClientId && a.appleRefreshToken)
      await tx.query(
        "INSERT INTO apple_grants(user_id,client_id,refresh_token) VALUES($1,$2,$3) ON CONFLICT(user_id,client_id) DO UPDATE SET refresh_token=excluded.refresh_token,updated_at=now()",
        [userId, a.appleClientId, a.appleRefreshToken],
      );
  }
  async function mintSession(
    tx: pg.PoolClient,
    user: AuthUser,
  ): Promise<SignedIn> {
    const token = random();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await tx.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)",
      [user.id, hashToken(token), expiresAt],
    );
    return {
      outcome: "signed_in",
      user,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }
  async function finishSignin(
    tx: pg.PoolClient,
    a: Attempt,
    user: AuthUser,
  ): Promise<AttemptResult> {
    requireAccess(user.email);
    await grant(tx, user.id, a);
    const signedIn = await mintSession(tx, user);
    await tx.query("DELETE FROM auth_attempts WHERE id=$1", [a.id]);
    return { signedIn };
  }
  return {
    healthy: () => healthy,
    async sweep(): Promise<void> {
      try {
        await pool.query("DELETE FROM auth_attempts WHERE expires_at<=now()");
        healthy = true;
      } catch (error) {
        healthy = false;
        throw error;
      }
    },
    async begin(input: {
      surface: Surface;
      purpose: AuthPurpose;
      targetProvider: AuthProvider;
      originalSessionId?: string;
      replace?: { id: string; bindingSecret: string };
    }): Promise<{ attempt: Attempt; bindingSecret: string }> {
      if (input.purpose === "signin" && !healthy)
        throw new AuthFailure("unavailable");
      return transaction(async (tx) => {
        if (input.purpose === "signin") {
          await tx.query("SELECT pg_advisory_xact_lock(173496,1)");
          await tx.query("DELETE FROM auth_attempts WHERE expires_at<=now()");
        }
        let existing: AuthProvider | null = null;
        if (input.purpose === "link" || input.purpose === "delete") {
          if (!input.originalSessionId)
            throw new AuthFailure("account_changed");
          const session = await original(tx, input.originalSessionId, true);
          // A link re-proves the OPPOSITE provider; a delete re-proves the
          // SAME one. `auth_attempts_session_check`'s delete arm carries no
          // `<> target_provider` clause, so this line is the ONLY thing
          // keeping existing and target equal for a delete — the database
          // does not enforce it (DBA gate, 2026-09-13).
          existing =
            input.purpose === "delete"
              ? input.targetProvider
              : input.targetProvider === "apple"
                ? "google"
                : "apple";
          const user = (
            await tx.query<{ existing: string | null; target: string | null }>(
              `SELECT ${subjectColumn(existing)} AS existing,${subjectColumn(input.targetProvider)} AS target FROM users WHERE id=$1`,
              [session.userId],
            )
          ).rows[0];
          if (input.purpose === "link") {
            if (!user?.existing || user.target)
              throw new AuthFailure("account_conflict");
          } else if (!user?.existing)
            // A delete must name a provider the rower actually holds; there
            // is nothing to re-prove otherwise.
            throw new AuthFailure("account_conflict");
          // `auth_attempts_link_session_unique` is keyed on
          // original_session_id ALONE, so it collides across purposes: this
          // sweep is what lets the insert below succeed at all.
          await tx.query(
            "DELETE FROM auth_attempts WHERE original_session_id=$1",
            [input.originalSessionId],
          );
        }
        if (input.replace)
          await tx.query(
            "DELETE FROM auth_attempts WHERE id=$1 AND binding_hash=$2 AND surface=$3",
            [
              input.replace.id,
              hashToken(input.replace.bindingSecret),
              input.surface,
            ],
          );
        if (input.purpose === "signin") {
          const count = (
            await tx.query<{ count: number }>(
              "SELECT count(*)::int AS count FROM auth_attempts WHERE purpose='signin'",
            )
          ).rows[0].count;
          if (count >= 512) throw new AuthFailure("rate_limited");
        }
        const bindingSecret = random();
        const now = new Date();
        const row = (
          await tx.query<Attempt>(
            `INSERT INTO auth_attempts(id,binding_hash,surface,purpose,target_provider,existing_provider,stage,version,state,nonce,original_session_id,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12) RETURNING ${projection}`,
            [
              randomUUID(),
              hashToken(bindingSecret),
              input.surface,
              input.purpose,
              input.targetProvider,
              existing,
              input.purpose === "signin" ? "authorize" : "reauth_authorize",
              random(),
              random(),
              input.purpose === "signin" ? null : input.originalSessionId,
              now,
              new Date(now.getTime() + ttl),
            ],
          )
        ).rows[0];
        return { attempt: row, bindingSecret };
      });
    },
    async read(
      id: string,
      bindingSecret: string,
      surface: Surface,
    ): Promise<Attempt> {
      const a = await load(pool, id);
      if (a.bindingHash !== hashToken(bindingSecret) || a.surface !== surface)
        throw new AuthFailure("invalid_proof");
      return a;
    },
    async claim(expected: Attempt): Promise<Attempt> {
      return transaction(async (tx) => {
        const a = await bound(tx, expected);
        const next: Partial<Record<Stage, Stage>> = {
          authorize: "exchanging",
          reauth_authorize: "reauth_exchanging",
          target_authorize: "target_exchanging",
        };
        const stage = next[a.stage];
        if (!stage) throw new AuthFailure("attempt_expired");
        return save(tx, { ...a, stage });
      });
    },
    async accept(
      expected: Attempt,
      identity: VerifiedIdentity,
    ): Promise<AttemptResult> {
      return transaction(async (tx) => {
        const a = await bound(tx, expected);
        if (
          !["exchanging", "reauth_exchanging", "target_exchanging"].includes(
            a.stage,
          )
        )
          throw new AuthFailure("attempt_expired");
        const now = new Date();
        if (identity.grant) {
          a.appleClientId = identity.grant.clientId;
          a.appleRefreshToken = identity.grant.refreshToken;
        }
        if (a.stage === "reauth_exchanging") {
          const session = await original(tx, a.originalSessionId!, true);
          const user = await find(tx, a.existingProvider!, identity.sub);
          if (user?.id !== session.userId)
            throw new AuthFailure("account_changed");
          // A delete has no second provider to authorize: the reauth IS the
          // whole proof, so it lands on delete_ready with its state and nonce
          // untouched (nothing more will be exchanged against them).
          if (a.purpose === "delete")
            return {
              attempt: await save(tx, {
                ...a,
                stage: "delete_ready",
                reauthenticatedAt: now,
                expiresAt: new Date(now.getTime() + ttl),
              }),
            };
          return {
            attempt: await save(tx, {
              ...a,
              stage: "target_authorize",
              state: random(),
              nonce: random(),
              reauthenticatedAt: now,
              expiresAt: new Date(now.getTime() + ttl),
            }),
          };
        }
        if (a.stage === "exchanging") {
          const user = await find(tx, a.targetProvider, identity.sub);
          if (user) return finishSignin(tx, a, user);
          if (!identity.emailVerified || !identity.email)
            throw new AuthFailure("email_required");
          requireAccess(identity.email);
        } else if (
          !a.reauthenticatedAt ||
          now.getTime() - a.reauthenticatedAt.getTime() >= ttl
        )
          throw new AuthFailure("attempt_expired");
        return {
          attempt: await save(tx, {
            ...a,
            stage: a.purpose === "signin" ? "confirm" : "link_ready",
            verifiedSubject: identity.sub,
            verifiedEmail: identity.email,
            verifiedName: identity.name,
            expiresAt:
              a.purpose === "signin"
                ? new Date(now.getTime() + ttl)
                : a.expiresAt,
          }),
        };
      });
    },
    async confirm(expected: Attempt): Promise<AttemptResult> {
      return transaction(async (tx) => {
        const a = await bound(tx, expected);
        if (a.stage !== "confirm") throw new AuthFailure("attempt_expired");
        requireAccess(a.verifiedEmail!);
        const column = subjectColumn(a.targetProvider);
        const user = (
          await tx.query<AuthUser>(
            `INSERT INTO users(${column},email,name) VALUES($1,$2,$3) ON CONFLICT(${column}) DO UPDATE SET ${column}=excluded.${column} RETURNING id,email,name`,
            [a.verifiedSubject, a.verifiedEmail, a.verifiedName],
          )
        ).rows[0];
        return finishSignin(tx, a, user);
      });
    },
    async finalize(
      expected: Attempt,
      currentSessionId: string,
    ): Promise<AttemptResult> {
      return transaction(async (tx) => {
        const a = await bound(tx, expected);
        if (
          a.stage !== "link_ready" ||
          !a.reauthenticatedAt ||
          Date.now() - a.reauthenticatedAt.getTime() >= ttl
        )
          throw new AuthFailure("attempt_expired");
        if (currentSessionId !== a.originalSessionId)
          throw new AuthFailure("account_changed");
        const session = await original(tx, currentSessionId, true);
        const column = subjectColumn(a.targetProvider);
        const updated = await tx.query(
          `UPDATE users SET ${column}=$1 WHERE id=$2 AND (${column} IS NULL OR ${column}=$1) RETURNING id`,
          [a.verifiedSubject, session.userId],
        );
        if (!updated.rowCount) throw new AuthFailure("account_conflict");
        await grant(tx, session.userId, a);
        await tx.query("DELETE FROM auth_attempts WHERE id=$1", [a.id]);
        return { linked: true };
      });
    },
    // Failure cleanup owns one snapshot, unlike an explicit holder cancel.
    // A single conditional DELETE locks only the attempt and cannot erase a
    // newer authorization stage after another callback wins its transition.
    async discard(expected: Attempt): Promise<boolean> {
      const result = await pool.query(
        `DELETE FROM auth_attempts WHERE id=$1 AND binding_hash=$2 AND surface=$3 AND purpose=$4 AND target_provider=$5 AND existing_provider IS NOT DISTINCT FROM $6 AND stage=$7 AND version=$8 AND state=$9 AND nonce=$10 AND original_session_id IS NOT DISTINCT FROM $11`,
        [
          expected.id,
          expected.bindingHash,
          expected.surface,
          expected.purpose,
          expected.targetProvider,
          expected.existingProvider,
          expected.stage,
          expected.version,
          expected.state,
          expected.nonce,
          expected.originalSessionId,
        ],
      );
      return result.rowCount === 1;
    },
    async cancel(
      id: string,
      bindingSecret: string,
      surface: Surface,
    ): Promise<void> {
      await pool.query(
        "DELETE FROM auth_attempts WHERE id=$1 AND binding_hash=$2 AND surface=$3",
        [id, hashToken(bindingSecret), surface],
      );
    },
    async methods(
      userId: string,
    ): Promise<{ apple: boolean; google: boolean }> {
      const result = await pool.query<{ apple: boolean; google: boolean }>(
        "SELECT apple_sub IS NOT NULL AS apple,google_sub IS NOT NULL AS google FROM users WHERE id=$1",
        [userId],
      );
      if (!result.rows[0]) throw new AuthFailure("account_changed");
      return result.rows[0];
    },
    async unlink(
      userId: string,
      provider: AuthProvider,
    ): Promise<UnlinkOutcome> {
      const settled = await transaction(
        async (
          tx,
        ): Promise<
          UnlinkOutcome | { outcome: "unlinked"; grants: AppleGrant[] }
        > => {
          const column = subjectColumn(provider);
          const other = subjectColumn(
            provider === "apple" ? "google" : "apple",
          );
          // The guard lives in the WHERE clause, not a read-then-write. The
          // database enforces the invariant, so two tabs unlinking different
          // providers cannot both pass.
          const updated = await tx.query(
            `UPDATE users SET ${column}=NULL
            WHERE id=$1 AND ${column} IS NOT NULL AND ${other} IS NOT NULL`,
            [userId],
          );
          if (!updated.rowCount) {
            // Zero rows has three causes and a rower whose account is gone
            // must not be told they cannot remove their last sign-in method.
            // A second read names the cause; it cannot change the outcome,
            // only describe it.
            const row = (
              await tx.query<{ mine: string | null }>(
                `SELECT ${column} AS mine FROM users WHERE id=$1`,
                [userId],
              )
            ).rows[0];
            if (!row) return { outcome: "account_gone" };
            if (!row.mine) return { outcome: "not_connected" };
            return { outcome: "last_provider" };
          }
          if (provider !== "apple") return { outcome: "unlinked", grants: [] };
          // BOTH grants, if the rower used phone and web. `frontDoor.ts`
          // refuses to boot if the native and web client ids are equal, so
          // these are distinct.
          const grants = await tx.query<AppleGrant>(
            `DELETE FROM apple_grants WHERE user_id=$1
            RETURNING client_id AS "clientId", refresh_token AS "refreshToken"`,
            [userId],
          );
          return { outcome: "unlinked", grants: grants.rows };
        },
      );
      if (!("grants" in settled)) return settled;
      // AFTER the commit, never inside it. Our copy of the credential is
      // already destroyed; this only asks Apple to forget too, and a
      // failure cannot and must not undo the unlink. The try/catch is what
      // makes that true: the type says `Promise<boolean>`, which cannot
      // forbid a rejection, and any injected revoker can reject.
      let appleRevoked = false;
      try {
        appleRevoked = await revokeApple(settled.grants);
      } catch {
        console.warn(JSON.stringify({ event: "apple_revoke_threw" }));
      }
      return { outcome: "unlinked", appleRevoked };
    },
    async deleteAccount(
      expected: Attempt,
      currentSessionId: string,
    ): Promise<DeleteOutcome> {
      const grants = await transaction(async (tx) => {
        // LOCK ORDER, AND IT MUST HAPPEN BEFORE bound(). Putting the ordered
        // locks below bound() is inert: bound() -> original() runs an
        // unqualified FOR UPDATE over `sessions INNER JOIN users` and takes
        // the users row there. With TWO live sessions (phone + web, the
        // normal case) that order deadlocks a concurrent original() on the
        // other session -- "a sign-in that fails for no reason", the exact
        // outcome the ordering exists to buy off.
        //
        // Learning the owner WITHOUT a lock, then taking every session of
        // that user in a deterministic order, puts this transaction on the
        // same sessions-then-users path original() uses, so no cycle exists.
        const owner = (
          await tx.query<{ userId: string }>(
            `SELECT user_id AS "userId" FROM sessions WHERE id=$1`,
            [currentSessionId],
          )
        ).rows[0];
        if (!owner) throw new AuthFailure("account_changed");
        await tx.query(
          "SELECT id FROM sessions WHERE user_id=$1 ORDER BY id FOR UPDATE",
          [owner.userId],
        );
        const a = await bound(tx, expected);
        if (
          a.stage !== "delete_ready" ||
          !a.reauthenticatedAt ||
          Date.now() - a.reauthenticatedAt.getTime() >= ttl
        )
          throw new AuthFailure("attempt_expired");
        if (currentSessionId !== a.originalSessionId)
          throw new AuthFailure("account_changed");
        const session = await original(tx, currentSessionId, true);
        const row = (
          await tx.query<{ id: string }>(
            `SELECT id FROM users WHERE id=$1 FOR UPDATE`,
            [session.userId],
          )
        ).rows[0];
        if (!row) throw new AuthFailure("account_changed");
        // DELETE ... RETURNING, NOT a SELECT. A plain read can be STALE:
        // grant()'s `ON CONFLICT DO UPDATE` leaves the FK column unchanged,
        // so Postgres runs no RI check and takes no lock on the parent, and a
        // concurrent sign-in refreshes the token straight past this
        // transaction's users lock. Apple's 200 covers "previously invalid",
        // so a stale revoke reports SUCCESS while a live credential survives
        // at Apple -- the precise outcome this design exists to prevent.
        // `unlink` already had this shape.
        // UNCONDITIONAL, never gated on `users.apple_sub`. That gate would
        // rest on a cross-table invariant nothing enforces: it holds today
        // (one writer, and `unlink` deletes every grant when it nulls
        // `apple_sub`), but the day it stops, the grants cascade away
        // unrevoked and `revokeApple([])` returns `true` — the rower is told
        // `appleRevoked: true` over a live credential, exactly what the
        // paragraph above says this design exists to prevent. The statement
        // costs nothing: the `DELETE FROM users` below issues it by cascade
        // regardless.
        const held = (
          await tx.query<AppleGrant>(
            `DELETE FROM apple_grants WHERE user_id=$1
            RETURNING client_id AS "clientId", refresh_token AS "refreshToken"`,
            [session.userId],
          )
        ).rows;
        // The attempt's own credential, which would otherwise cascade away
        // through sessions with nothing revoked. Guarded on the grant's own
        // fields rather than on apple_sub, which an unlink can null between
        // accept() and here.
        if (a.appleClientId && a.appleRefreshToken)
          held.push({
            clientId: a.appleClientId,
            refreshToken: a.appleRefreshToken,
          });
        const deleted = await tx.query("DELETE FROM users WHERE id=$1", [
          session.userId,
        ]);
        // RF25's owner is the THROW, not this line: anything raised inside
        // this transaction propagates past the route, which must not catch it
        // into a success, and the trigger test gates exactly that.
        //
        // This particular guard CANNOT fire today and no mutation makes it —
        // `original()` and the `apple_sub` read above both hold this row
        // FOR UPDATE, so the DELETE is guaranteed one row. It stays as the
        // tripwire for the day either lock moves: without it, a DELETE that
        // silently matched nothing would be reported to the rower as a
        // completed deletion. Measured 2026-09-14: removing it leaves the
        // whole integration suite green.
        if (!deleted.rowCount) throw new AuthFailure("account_changed");
        return held;
      });
      // AFTER the commit. The account is gone and cannot come back, so this
      // call can only add latency. The try/catch is what makes that true: the
      // type says `Promise<boolean>`, which cannot forbid a rejection, and any
      // injected revoker can reject.
      let appleRevoked = false;
      try {
        appleRevoked = await revokeApple(grants);
      } catch {
        console.warn(JSON.stringify({ event: "apple_revoke_threw" }));
      }
      return { outcome: "deleted", appleRevoked };
    },
    async legacyGoogle(identity: VerifiedIdentity): Promise<SignedIn> {
      // `access_denied`, not `invalid_proof`: this is the SAME refusal
      // `signInWithClaims` answers with `{outcome:"denied", email}` on the
      // path this replaces when the front door is configured (`signin.ts`'s
      // stated sequence, "email_verified -> existing-sub -> policy -> ..."),
      // and `login`'s catch maps only `access_denied` back to that outcome.
      // Throwing `invalid_proof` here rethrew instead, so configuring Apple
      // turned a client-class refusal into a 500 on native and the wrong
      // notice on web — one invariant, two paths, applied to one of them.
      if (!identity.emailVerified || !identity.email)
        throw new AuthFailure("access_denied", identity.email || undefined);
      return transaction(async (tx) => {
        const user = (
          await tx.query<AuthUser>(
            "INSERT INTO users(google_sub,email,name) VALUES($1,$2,$3) ON CONFLICT(google_sub) DO UPDATE SET name=excluded.name RETURNING id,email,name",
            [identity.sub, identity.email, identity.name],
          )
        ).rows[0];
        requireAccess(user.email);
        return mintSession(tx, user);
      });
    },
  };
}
export type Attempts = ReturnType<typeof createAttempts>;
