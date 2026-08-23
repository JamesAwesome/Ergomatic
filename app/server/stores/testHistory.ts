import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { testHistory } from "../db/schema.js";

export type TestDistance = "2k" | "6k";

export function createTestHistoryStore(db: Db) {
  return {
    async list(userId: string) {
      return db
        .select()
        .from(testHistory)
        .where(eq(testHistory.userId, userId))
        .orderBy(desc(testHistory.loggedAt));
    },

    // Phase BL PR B (baseline-onboarding spec rev 2, "Recording
    // (decoupled)"): `sessionLogId`, when present, is the idempotency key
    // — a repeat append for the same saved log returns the ORIGINAL row
    // instead of inserting a second one. Without it a double-fire (a
    // client retry whose first request actually landed, a remount) would
    // write a row whose deltaSeconds is 0 — a fabricated "no change since
    // last test" data point, because delta is computed off the previous
    // same-distance row right here. Keyless appends (the legacy
    // isTestResult path on PUT /api/baselines, zero client senders) keep
    // their historical no-dedupe behaviour — the contract suite pins both
    // sides of that boundary.
    async append(
      userId: string,
      input: {
        distance: TestDistance;
        splitSeconds: number;
        sessionLogId?: string;
      },
    ) {
      if (input.sessionLogId !== undefined) {
        const [existing] = await db
          .select()
          .from(testHistory)
          .where(
            and(
              eq(testHistory.userId, userId),
              eq(testHistory.sessionLogId, input.sessionLogId),
            ),
          )
          .limit(1);
        if (existing) return existing;
      }

      const [previous] = await db
        .select()
        .from(testHistory)
        .where(
          and(
            eq(testHistory.userId, userId),
            eq(testHistory.distance, input.distance),
          ),
        )
        .orderBy(desc(testHistory.loggedAt))
        .limit(1);

      const deltaSeconds = previous
        ? input.splitSeconds - previous.splitSeconds
        : null;

      const [row] = await db
        .insert(testHistory)
        .values({
          userId,
          distance: input.distance,
          splitSeconds: input.splitSeconds,
          deltaSeconds,
          sessionLogId: input.sessionLogId ?? null,
        })
        // The race net behind the pre-check above: two concurrent keyed
        // appends can both miss the select; the column's UNIQUE
        // constraint makes the loser insert nothing instead of a
        // duplicate. Keyless inserts (sessionLogId null) never conflict —
        // Postgres UNIQUE treats NULLs as distinct.
        .onConflictDoNothing({ target: testHistory.sessionLogId })
        .returning();
      if (row) return row;

      // Lost the race: the winner's row is the record for this log.
      const [winner] = await db
        .select()
        .from(testHistory)
        .where(
          and(
            eq(testHistory.userId, userId),
            eq(testHistory.sessionLogId, input.sessionLogId!),
          ),
        )
        .limit(1);
      if (!winner) {
        // Only reachable if the conflicting row belongs to ANOTHER user —
        // impossible through the route (logId ownership is checked) and
        // through the FK (log ids are globally unique). Fail loudly
        // rather than return another user's row.
        throw new Error(
          "test_history: sessionLogId conflict outside this user's rows",
        );
      }
      return winner;
    },
  };
}

export type TestHistoryStore = ReturnType<typeof createTestHistoryStore>;
