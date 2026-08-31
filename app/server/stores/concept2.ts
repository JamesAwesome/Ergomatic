import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { concept2AuthAttempts, concept2Links } from "../db/schema.js";

export type WeightClass = "H" | "L";

// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD):
// mirrors `db/schema.ts`'s `concept2Links` row shape exactly. Never
// serialized to any client response (routes/concept2.ts owns that
// projection down to `{linked, weightClass, needsReauth}`).
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
}

export interface ConsumedConcept2Attempt {
  userId: string;
  weightClass: WeightClass;
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

    async createAttempt(a: NewConcept2Attempt): Promise<void> {
      await db.insert(concept2AuthAttempts).values({
        nonce: a.nonce,
        userId: a.userId,
        weightClass: a.weightClass,
      });
    },

    // Single-use (spec §Architecture 1: the nonce IS the user binding).
    // ONE atomic `DELETE ... WHERE nonce = $1 RETURNING`, unconditional on
    // age — a second call for the same nonce always returns null because
    // the row is already gone, and an expired-but-never-consumed nonce is
    // deleted here too rather than lingering for `deleteExpiredAttempts`
    // to sweep later. The expiry predicate rides IN the same statement as
    // a computed boolean column (`fresh`), not in the WHERE clause: gating
    // the WHERE on age would let an expired row survive this call
    // undeleted (it wouldn't match), which the "an expired nonce must ALSO
    // be deleted" requirement rules out. Checking `fresh` in JS after an
    // unconditional, single-statement delete keeps consume-and-check
    // atomic (no separate read then delete, no window for a second caller
    // to observe the row between them) while still deleting every nonce
    // exactly once, expired or not.
    async consumeAttempt(
      nonce: string,
      maxAgeMs: number,
    ): Promise<ConsumedConcept2Attempt | null> {
      const rows = await db
        .delete(concept2AuthAttempts)
        .where(eq(concept2AuthAttempts.nonce, nonce))
        .returning({
          userId: concept2AuthAttempts.userId,
          weightClass: concept2AuthAttempts.weightClass,
          fresh: sql<boolean>`${concept2AuthAttempts.createdAt} >= now() - make_interval(secs => ${maxAgeMs / 1000})`,
        });
      const row = rows[0];
      if (!row || !row.fresh) return null;
      return { userId: row.userId, weightClass: row.weightClass };
    },

    // Sweeps attempts nobody ever completed (the browser hop was
    // abandoned) — unlike `consumeAttempt`, this legitimately gates the
    // WHERE on age, because there is no single row to single-use here.
    async deleteExpiredAttempts(maxAgeMs: number): Promise<void> {
      await db
        .delete(concept2AuthAttempts)
        .where(
          sql`${concept2AuthAttempts.createdAt} < now() - make_interval(secs => ${maxAgeMs / 1000})`,
        );
    },

    async deleteAttemptsFor(userId: string): Promise<void> {
      await db
        .delete(concept2AuthAttempts)
        .where(eq(concept2AuthAttempts.userId, userId));
    },
  };
}

export type Concept2Store = ReturnType<typeof createConcept2Store>;
