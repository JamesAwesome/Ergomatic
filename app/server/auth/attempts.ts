import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  AuthProvider,
  AuthPurpose,
  AuthUser,
  SignedIn,
} from "../../shared/auth.js";
import { AuthFailure } from "./frontDoorErrors.js";
import type { VerifiedIdentity } from "./providers.js";
import { hashToken, SESSION_TTL_MS } from "./sessions.js";
import type { AccessPolicy } from "./accessPolicy.js";

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
    ((a.stage.startsWith("target_") || a.stage === "link_ready") &&
      !a.reauthenticatedAt)
  )
    throw new AuthFailure("attempt_expired");
}
export function createAttempts(pool: pg.Pool, accessPolicy: AccessPolicy) {
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
        if (input.purpose === "link") {
          if (!input.originalSessionId)
            throw new AuthFailure("account_changed");
          const session = await original(tx, input.originalSessionId, true);
          existing = input.targetProvider === "apple" ? "google" : "apple";
          const user = (
            await tx.query<{ existing: string | null; target: string | null }>(
              `SELECT ${subjectColumn(existing)} AS existing,${subjectColumn(input.targetProvider)} AS target FROM users WHERE id=$1`,
              [session.userId],
            )
          ).rows[0];
          if (!user?.existing || user.target)
            throw new AuthFailure("account_conflict");
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
              input.purpose === "link" ? input.originalSessionId : null,
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
