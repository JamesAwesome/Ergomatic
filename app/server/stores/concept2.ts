import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { concept2AuthAttempts, concept2Links } from "../db/schema.js";
import { isUniqueViolation, pgConstraint } from "./errors.js";

// Fix round 2 (task-2-report.md): the real constraint names, read from the
// migrations that created them (not guessed) — `app/drizzle/0021_crazy_
// gamma_corps.sql:31-32` names both UNIQUE additions explicitly (the file
// was `0020_fearless_shape.sql` until #268 took index 0020 first, and the
// old citation's `:27-28` pointed at the header, not the statements); the
// nonce PK's name (`app/drizzle/0018_natural_chronomancer.sql:2-3`, an inline
// `PRIMARY KEY` with no explicit CONSTRAINT clause) is Postgres's own
// default `<table>_pkey` naming, confirmed empirically against a migrated
// test database (`select conname from pg_constraint where conrelid =
// 'concept2_auth_attempts'::regclass` — see task-2-report.md fix round 2).
const ATTEMPTS_NONCE_PK = "concept2_auth_attempts_pkey";
const LINKS_C2_USER_ID_UNIQUE = "concept2_links_c2_user_id_unique";

export type WeightClass = "H" | "L";
// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §1): which
// surface minted an attempt — derived by the route from `req.authVia`,
// never from the client body.
export type LinkSurface = "native" | "web";

// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD):
// mirrors `db/schema.ts`'s `concept2Links` row shape exactly. Tokens are
// never serialized to any client response — routes/concept2.ts owns that
// projection down to `{linked, weightClass, c2UserId, needsReauth}`, the
// account's numeric id but never a token (PR2's sent-state/
// View-on-Concept2 needs).
export interface Concept2Link {
  userId: string;
  c2UserId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  weightClass: WeightClass;
  needsReauthAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// The plan's serialized-refresh outcome union (plan deviation 4): exactly
// one of three things happened inside the lock, and the caller says which.
export type WithLinkLockOutcome<T> =
  | {
      action: "store";
      tokens: { accessToken: string; refreshToken: string; expiresAt: Date };
      result: T;
    }
  | { action: "flagReauth"; result: T }
  | { action: "none"; result: T };

export interface NewConcept2Attempt {
  nonce: string;
  userId: string;
  weightClass: WeightClass;
  surface: LinkSurface;
}

// `peekAttempt`'s projection: advisory only — it decides which page or
// error a presenter gets, never whether the row is consumed.
export interface PeekedConcept2Attempt {
  userId: string;
  weightClass: WeightClass;
  surface: LinkSurface;
}

// `consumeAttemptFor`'s projection. `userId` and `surface` are predicate
// INPUTS to that statement, so returning them could never disagree with
// the arguments (a green gate that cannot go red, RF21) — only the two
// things the caller does not already know come back.
export interface ConsumedConcept2Attempt {
  weightClass: WeightClass;
  fresh: boolean;
}

// The freshly minted 32-byte nonce collided with another row's primary key
// (design §2: "not worth designing around" — the route retries once, then
// 500s). Distinguished from a generic conflict so the route can tell the
// retryable case from anything else.
export class AttemptNonceCollisionError extends Error {
  constructor() {
    super("attempt nonce collision");
    this.name = "AttemptNonceCollisionError";
  }
}

// D1 (design §Decisions, APPROVED): `concept2_links.c2_user_id` is UNIQUE —
// the Concept2 account being linked already belongs to a DIFFERENT
// Ergomatic user. Both completion routes answer 409 and discard the tokens.
export class Concept2LinkConflictError extends Error {
  constructor() {
    super("concept2 account already linked to another user");
    this.name = "Concept2LinkConflictError";
  }
}

export function createConcept2Store(db: Db) {
  return {
    async getLink(userId: string): Promise<Concept2Link | null> {
      const rows = await db
        .select()
        .from(concept2Links)
        .where(eq(concept2Links.userId, userId));
      return rows[0] ?? null;
    },

    // `onConflictDoUpdate` on the PK (one row per user). `needsReauthAt` is
    // explicitly cleared to null on EVERY upsert, including the first
    // insert — a successful relink IS the recovery from a flagged link
    // (schema.ts's own `needsReauthAt` comment): the callback that reaches
    // this method already has a fresh token pair from C2, so whatever
    // reauth flag an earlier refresh failure set is now stale by
    // definition. `updatedAt` is bumped via `now()` on the conflict path
    // only — the insert path already gets its column default.
    //
    // PR1.75a D1: after the ON CONFLICT (user_id) arm, the unique violation
    // this is meant to catch is `concept2_links_c2_user_id_unique` — the
    // Concept2 account is held by ANOTHER user (the same user relinking the
    // same account updates in place). Mapped to a typed error so the route
    // can answer 409 without inspecting driver internals.
    //
    // Fix round 2: mapped by CONSTRAINT NAME, not merely by SQLSTATE
    // 23505 — a 23505 on this statement that is NOT this constraint (there
    // is none reachable today past the ON CONFLICT arm, but the check makes
    // that true by construction rather than by an invariant a future edit
    // could silently break) rethrows unchanged instead of being misreported
    // as a link conflict.
    async upsertLink(
      userId: string,
      link: {
        c2UserId: number;
        accessToken: string;
        refreshToken: string;
        expiresAt: Date;
        weightClass: WeightClass;
      },
    ): Promise<void> {
      try {
        await db
          .insert(concept2Links)
          .values({
            userId,
            c2UserId: link.c2UserId,
            accessToken: link.accessToken,
            refreshToken: link.refreshToken,
            expiresAt: link.expiresAt,
            weightClass: link.weightClass,
          })
          .onConflictDoUpdate({
            target: concept2Links.userId,
            set: {
              c2UserId: link.c2UserId,
              accessToken: link.accessToken,
              refreshToken: link.refreshToken,
              expiresAt: link.expiresAt,
              weightClass: link.weightClass,
              needsReauthAt: null,
              updatedAt: sql`now()`,
            },
          });
      } catch (err) {
        if (
          isUniqueViolation(err) &&
          pgConstraint(err) === LINKS_C2_USER_ID_UNIQUE
        ) {
          throw new Concept2LinkConflictError();
        }
        throw err;
      }
    },

    // User-initiated unlink ONLY (schema.ts's own comment on
    // `needsReauthAt`: an automatic failure path never deletes the link,
    // it flags it via `withLinkLock`'s "flagReauth" outcome instead).
    // Idempotent: deleting an absent link matches zero rows, no error.
    async deleteLink(userId: string): Promise<void> {
      await db.delete(concept2Links).where(eq(concept2Links.userId, userId));
    },

    // Serialized refresh (plan deviation 4): `SELECT ... FOR UPDATE` on the
    // user's own link row, inside a transaction, so two overlapping
    // refreshes for the SAME user serialize — the second's `fn` only runs
    // once the first's transaction has committed (or rolled back) and sees
    // whatever the first one wrote. The lock is held ACROSS `fn`'s await
    // (its wire call to Concept2's token endpoint) by design: this
    // serializes exactly one user's refreshes against each other, nothing
    // wider (a lock scoped to a `userId` in a `WHERE`, not a table lock).
    // Zero matching rows (no link at all) is a legitimate no-op lock —
    // `fn` still runs, with `null`, and can only sensibly answer "none".
    async withLinkLock<T>(
      userId: string,
      fn: (link: Concept2Link | null) => Promise<WithLinkLockOutcome<T>>,
    ): Promise<T> {
      return db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(concept2Links)
          .where(eq(concept2Links.userId, userId))
          .for("update");
        const link = rows[0] ?? null;

        const outcome = await fn(link);

        if (outcome.action === "store") {
          // Controller ruling R2 (task-6-brief.md, carrying Task 3's ruling
          // forward): a successful refresh proves the grant lives, so it
          // ALSO clears `needsReauthAt` — a stale flag left set here would
          // wrongly keep blocking uploads after the grant has recovered.
          await tx
            .update(concept2Links)
            .set({
              accessToken: outcome.tokens.accessToken,
              refreshToken: outcome.tokens.refreshToken,
              expiresAt: outcome.tokens.expiresAt,
              needsReauthAt: null,
              updatedAt: sql`now()`,
            })
            .where(eq(concept2Links.userId, userId));
        } else if (outcome.action === "flagReauth") {
          await tx
            .update(concept2Links)
            .set({ needsReauthAt: sql`now()` })
            .where(eq(concept2Links.userId, userId));
        }
        // "none": another request already refreshed (or there is nothing
        // to do) — no write, the lock still serialized the read.

        return outcome.result;
      });
    },

    // Mint is ONE atomic statement (design §2): `INSERT ... ON CONFLICT
    // (user_id) DO UPDATE SET nonce, surface, weight_class, created_at`.
    // Updating the PK in DO UPDATE is legal; two concurrent mints serialize
    // on `concept2_auth_attempts_user_id_unique` and exactly one row
    // survives — PROVEN by `concept2.integration.test.ts`'s deterministic
    // race test ("createAttempt genuinely BLOCKS on an uncommitted
    // conflicting row"), which holds a row open on one connection and shows
    // the concurrent insert blocks on the index rather than racing past it.
    // The old delete-then-insert image does NOT yield two rows on this
    // schema: measured against real Postgres (Task 2 fix round 2), it dies
    // with `concept2_auth_attempts_user_id_unique` propagating unmapped —
    // "two rows" was the PRE-0021 behaviour, before that index existed.
    // After that arm the unique violation this is meant to catch is the
    // PRIMARY KEY
    // (`concept2_auth_attempts_pkey`): the new nonce collided with another
    // row's (32 random bytes — the route retries once).
    //
    // Fix round 2: mapped by CONSTRAINT NAME, not merely by SQLSTATE 23505.
    // A 23505 on THIS statement can also be `concept2_auth_attempts_
    // user_id_unique` — for example a statement-level regression that
    // stopped using ON CONFLICT (Task 2's own mutation-testing found
    // exactly this: a delete-then-insert rewrite still passed the old
    // bare-SQLSTATE check and was misreported as a nonce collision). That
    // case rethrows unchanged instead.
    async createAttempt(a: NewConcept2Attempt): Promise<void> {
      try {
        await db
          .insert(concept2AuthAttempts)
          .values({
            nonce: a.nonce,
            userId: a.userId,
            weightClass: a.weightClass,
            surface: a.surface,
          })
          .onConflictDoUpdate({
            target: concept2AuthAttempts.userId,
            set: {
              nonce: a.nonce,
              surface: a.surface,
              weightClass: a.weightClass,
              createdAt: sql`now()`,
            },
          });
      } catch (err) {
        if (isUniqueViolation(err) && pgConstraint(err) === ATTEMPTS_NONCE_PK) {
          throw new AttemptNonceCollisionError();
        }
        throw err;
      }
    },

    // Advisory read (design §2): no delete, NO freshness predicate. It only
    // decides which page or error a presenter gets; `consumeAttemptFor` is
    // the authority on whether anything is consumed.
    async peekAttempt(nonce: string): Promise<PeekedConcept2Attempt | null> {
      const rows = await db
        .select({
          userId: concept2AuthAttempts.userId,
          weightClass: concept2AuthAttempts.weightClass,
          surface: concept2AuthAttempts.surface,
        })
        .from(concept2AuthAttempts)
        .where(eq(concept2AuthAttempts.nonce, nonce));
      return rows[0] ?? null;
    },

    // ONE conditional statement (design §2): `DELETE ... WHERE nonce=$1 AND
    // user_id=$2 AND surface=$3 RETURNING weight_class, <fresh>`. The
    // identity/surface predicate lives IN the statement, so a wrong
    // principal or wrong surface consumes nothing by construction, not by
    // step order. Freshness rides as a computed column exactly as PR1's
    // consume did: a right-principal expired row is still deleted (and
    // reported `fresh: false` so the caller answers Expired); a
    // wrong-principal one is left for the sweep. A null return means "no
    // row matched" — unknown nonce, wrong user, wrong surface, or a
    // concurrent completion/re-mint already removed it.
    async consumeAttemptFor(
      nonce: string,
      userId: string,
      surface: LinkSurface,
      maxAgeMs: number,
    ): Promise<ConsumedConcept2Attempt | null> {
      const rows = await db
        .delete(concept2AuthAttempts)
        .where(
          and(
            eq(concept2AuthAttempts.nonce, nonce),
            eq(concept2AuthAttempts.userId, userId),
            eq(concept2AuthAttempts.surface, surface),
          ),
        )
        .returning({
          weightClass: concept2AuthAttempts.weightClass,
          fresh: sql<boolean>`${concept2AuthAttempts.createdAt} >= now() - make_interval(secs => ${maxAgeMs / 1000})`,
        });
      const row = rows[0];
      if (!row) return null;
      return { weightClass: row.weightClass, fresh: row.fresh };
    },

    // Sweeps attempts nobody ever completed (the browser hop was
    // abandoned) — unlike `consumeAttemptFor`, this legitimately gates the
    // WHERE on age, because there is no single row to single-use here.
    async deleteExpiredAttempts(maxAgeMs: number): Promise<void> {
      await db
        .delete(concept2AuthAttempts)
        .where(
          sql`${concept2AuthAttempts.createdAt} < now() - make_interval(secs => ${maxAgeMs / 1000})`,
        );
    },
  };
}

export type Concept2Store = ReturnType<typeof createConcept2Store>;
