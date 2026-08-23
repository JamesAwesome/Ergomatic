import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { baselines, baselineSourceEnum } from "../db/schema.js";

/** Phase BL PR A: the closed provenance vocabulary, sourced from the
 *  pgEnum itself so the route's wire validation and the DB column can
 *  never disagree about what a legal source is. */
export const BASELINE_SOURCES = baselineSourceEnum.enumValues;
export type BaselineSource = (typeof BASELINE_SOURCES)[number];

export interface BaselinesRow {
  k2Seconds: number | null;
  k6Seconds: number | null;
}

/** Per-field patch: a key that is absent touches NOTHING in Postgres —
 *  neither the number nor its source (the editor's `touched` machinery
 *  and PR A's untouched-source guarantee both ride this). A source key
 *  only ever arrives beside its own number (the route enforces that). */
export interface BaselinesPatch {
  k2Seconds?: number | null;
  k6Seconds?: number | null;
  k2Source?: BaselineSource;
  k6Source?: BaselineSource;
}

export function createBaselinesStore(db: Db) {
  return {
    async get(userId: string): Promise<BaselinesRow | null> {
      const rows = await db
        .select()
        .from(baselines)
        .where(eq(baselines.userId, userId));
      const row = rows[0];
      if (!row) return null;
      // Deliberately numbers-only (PR A's lean-GET decision): provenance
      // is stored, never shown, and no client consumer needs it yet — so
      // neither get() nor GET /api/baselines serves the source columns.
      // If a later phase needs them client-side, widen HERE first.
      return { k2Seconds: row.k2Seconds, k6Seconds: row.k6Seconds };
    },

    /** Phase BL PR C — Reset baseline setup's clear: deletes the row
     *  outright, numbers AND sources together (SOURCE-BESIDE-NULL means a
     *  row with nulled numbers would still carry source values; deleting
     *  the row is the one shape every consumer already reads as the true
     *  no-baseline state, and GET's `row ?? nulls` fallback serves the
     *  no-row shape unchanged). A deliberate operation with its own verb —
     *  PUT still rejects null on purpose. */
    async clear(userId: string): Promise<void> {
      await db.delete(baselines).where(eq(baselines.userId, userId));
    },

    async put(userId: string, patch: BaselinesPatch): Promise<void> {
      await db
        .insert(baselines)
        .values({ userId, ...patch, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: baselines.userId,
          set: { ...patch, updatedAt: new Date() },
        });
    },
  };
}

export type BaselinesStore = ReturnType<typeof createBaselinesStore>;
