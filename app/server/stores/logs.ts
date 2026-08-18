import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { planState, sessionLogs } from "../db/schema.js";

// From-the-log spec (2026-08-18), §3: thrown by `list()` when a caller
// supplies a well-formed `before` id that does not resolve to one of THIS
// user's own rows (absent entirely, or belonging to someone else — the
// same "no existence leak" shape as every other owner-scoped lookup in
// this file). The route (`routes/data.ts`) catches this specific class and
// 400s field-named, distinct from a plain empty page (which is a valid,
// ordinary end-of-list result, not an error).
export class CursorNotFoundError extends Error {
  constructor(id: string) {
    super(`before id not found: ${id}`);
    this.name = "CursorNotFoundError";
  }
}

export type ActualSource = "assumed" | "stopwatch" | "pm5";
// UNDER = FASTER than target (under the target NUMBER), OVER = SLOWER
// (post-workout-summary spec, ruling option B, James 2026-08-17): stored
// members unchanged, only the button labels/direction reading changed.
// Mirrored at the options array (LogSession.tsx's HELD_OPTIONS), the
// client's own copy (src/api/useRecentLogs.ts), and the pgEnum
// (server/db/schema.ts's `heldResultEnum`).
export type HeldResult = "held" | "under" | "over";
// Post-workout-summary spec (2026-08-17), §3: the reflection card's
// thumbs-up/down question. Stored now even though nothing reads it yet
// (generation's own thumbs consumption is explicitly OUT this phase —
// spec §4).
export type Thumbs = "up" | "down";

// Amendment (2026-08-02, Phase 6C Task 1.5): targetSplit is now OPTIONAL (an
// effort step's frozen split is an estimate, never a prescription — the 5G
// rule — so it's omitted rather than logged as a fake target), and
// actualSplit/actualSource are now a PAIRED unit, both optional together
// (both present, or both absent — never one without the other). Enforced in
// `routes/data.ts`'s `validateLogStepEntry`; see that function's comment for
// the full rationale. `steps` is stored as a plain jsonb column (`db/
// schema.ts`, untyped — no `.$type<LogStep[]>()` binding), so this is a
// type-level change only: the column already accepts any JSON shape,
// including one with these keys omitted, with no migration required.
// Amendment (2026-08-08, Phase 7C Task 3, spec §6): avgHr (integer,
// HR_MIN..HR_MAX), actualSeconds (>= 0), and actualMeters (>= 0) are new,
// independently optional fields — a matched pm5 actual carries all three
// (`src/session/logDraft.ts`'s `buildMonitorLogSteps`) regardless of
// whether `actualSplit` itself is present (the PM5 PAIRING EXCEPTION,
// enforced in `routes/data.ts`'s `validateLogStepEntry`). Same "type-level
// change only" note as the amendment above applies here too.
export interface LogStep {
  label: string;
  targetSplit?: number;
  actualSplit?: number;
  actualSource?: ActualSource;
  spm?: number;
  meters?: number;
  seconds?: number;
  avgHr?: number;
  actualSeconds?: number;
  actualMeters?: number;
}

export interface LogInput {
  workoutId: string | null;
  workoutTitle: string;
  workoutType: string;
  baselineK2: number | null;
  baselineK6: number | null;
  // Post-workout-summary spec (2026-08-17), §3: nullable now (R-A ordered
  // this after the null-tolerant READ side shipped and tagged v0.10.1) —
  // the redesigned reflection card makes every answer optional, so a saved
  // session with no HELD/PAIN chosen is now a real, storable shape, not a
  // client-side bug.
  held: HeldResult | null;
  pain: number | null;
  notes: string | null;
  steps: LogStep[];
  // Post-workout-summary spec (2026-08-17), §3: optional/nullable, same
  // shape as `deviceName` below — absent or explicit null both store null.
  thumbs?: Thumbs | null;
  // Task 3 (outside-plan logging): true (the default the route falls back
  // to when the client omits the field — routes/data.ts) means this log
  // counts toward the active plan's progress, exactly like every log
  // before this field existed. false is an off-app/free row the rower
  // explicitly doesn't want counted (e.g. a make-up row logged twice in
  // one day, or a workout done outside the plan entirely) — `create`
  // below skips the plan_state upsert for it, but the log row itself is
  // always inserted either way.
  advancesPlan: boolean;
  // Phase 7C Task 3 (spec §5/§6): session-scoped provenance, optional —
  // absent means null (a phone-timer log has no device to name). Not part
  // of `steps`: see `db/schema.ts`'s `sessionLogs.deviceName` doc comment
  // for why this is its own column, not a `steps` jsonb field.
  deviceName?: string | null;
  // From-the-log spec (2026-08-18), §2/§3: the three hero numbers the
  // summary showed at save time — the MODEL's numbers, not its
  // pre-formatted display strings (SummaryHeroes deliberately carries
  // both; the POST site posts the numbers the strings were formatted
  // from, never re-derives one). Optional/nullable, same convention as
  // `deviceName`/`thumbs` above: absent or explicit null both store null
  // (a hero the summary didn't show posts nothing). Bounds-checked at the
  // route (routes/data.ts), same as every other numeric field — this is
  // sanity, not truth: an authenticated client can still post a wrong
  // number about its own rowing, accepted and recorded here as the
  // trust-boundary the server cannot close (spec §2).
  avgSplitSeconds?: number | null;
  timeSeconds?: number | null;
  distanceMeters?: number | null;
  // Deliberately absent from this interface: `plan_key`/`plan_index` are
  // NEVER client input. `create()` below derives them itself, inside the
  // same transaction as the log insert, from the plan_state upsert's own
  // `.returning()` — see that function's doc comment.
}

// From-the-log spec (2026-08-18), §3: the API's first UPDATE. Every key is
// independently optional at the TYPE level, but `update()` below reads
// PRESENCE with the `"held" in patch` idiom (the `PUT /api/prefs`/warmup
// precedent, `routes/data.ts`), not `!== undefined` — a key that is
// present and explicitly `null` clears that column; a key that is absent
// from `patch` leaves the existing value alone. `routes/data.ts`'s PATCH
// handler builds this object from only the request body's recognized
// keys (unknown keys never reach here at all — they're ignored before
// this type is even constructed) and never calls `update()` with an empty
// object (an empty accepted-key set is a no-op READ at the route, exactly
// like `PUT /api/prefs`'s empty-patch guard).
export interface LogPatch {
  thumbs?: Thumbs | null;
  held?: HeldResult | null;
  pain?: number | null;
  notes?: string | null;
}

// The list projection (below) explicitly OMITS `steps` — see that
// method's own comment. This is the shape every column BUT `steps`
// produces, named once so `list()`'s return type reads intentionally
// rather than as an unlabeled inline object.
const LOG_LIST_COLUMNS = {
  id: sessionLogs.id,
  userId: sessionLogs.userId,
  workoutId: sessionLogs.workoutId,
  workoutTitle: sessionLogs.workoutTitle,
  workoutType: sessionLogs.workoutType,
  loggedAt: sessionLogs.loggedAt,
  baselineK2: sessionLogs.baselineK2,
  baselineK6: sessionLogs.baselineK6,
  held: sessionLogs.held,
  pain: sessionLogs.pain,
  notes: sessionLogs.notes,
  deviceName: sessionLogs.deviceName,
  thumbs: sessionLogs.thumbs,
  avgSplitSeconds: sessionLogs.avgSplitSeconds,
  distanceMeters: sessionLogs.distanceMeters,
  timeSeconds: sessionLogs.timeSeconds,
  planKey: sessionLogs.planKey,
  planIndex: sessionLogs.planIndex,
};

export function createLogsStore(db: Db) {
  return {
    // From-the-log spec (2026-08-18), §3: two changes from the pre-spec
    // shape. (1) The projection explicitly selects every column BUT
    // `steps` (LOG_LIST_COLUMNS) — 30 rows of full step jsonb is dead
    // weight for a list rendering meta + a hero snippet, and `steps` has
    // zero client consumers on this response (`RecentLog`, the response's
    // only reader, never carried it). `GET /api/logs/:id` (this store's
    // `get()`) still returns the full row. (2) `before`, when given,
    // cursor-paginates: the antagonist PROVED a JSON-round-tripped
    // timestamp cursor skips rows (Postgres stores microseconds, but
    // Drizzle's `Date` mapping truncates to milliseconds — a truncated
    // cursor can sit EARLIER than its own row). The fix is to never let
    // the timestamp leave SQL at all, not even server-side into a JS
    // `Date`: the existence check below selects only `id` (text, no
    // precision to lose), and the actual comparison is a nested SELECT
    // inside the SAME statement via `sql` — `(logged_at, id) < (SELECT
    // logged_at, id FROM session_logs WHERE id = $before AND user_id =
    // $user)`, `ORDER BY logged_at DESC, id DESC`. The trailing `id` in
    // both the ORDER BY and the tuple comparison is the tiebreak two rows
    // in the same millisecond need — `ORDER BY logged_at DESC` alone
    // (today's pre-cursor shape) has no total order under a tie, and a
    // single-column cursor comparison on `logged_at` alone reproduces the
    // exact skip/duplicate the antagonist demonstrated. See
    // `contracts.real.integration.test.ts`'s dedicated same-millisecond
    // case (criterion 9) — this can only be proved against real Postgres:
    // a JS-side fake can't mint two rows a genuine microsecond apart.
    async list(userId: string, limit: number, before?: string) {
      const conditions = [eq(sessionLogs.userId, userId)];

      if (before !== undefined) {
        const [cursorRow] = await db
          .select({ id: sessionLogs.id })
          .from(sessionLogs)
          .where(
            and(eq(sessionLogs.id, before), eq(sessionLogs.userId, userId)),
          );
        if (!cursorRow) {
          throw new CursorNotFoundError(before);
        }
        conditions.push(
          sql`(${sessionLogs.loggedAt}, ${sessionLogs.id}) < (select ${sessionLogs.loggedAt}, ${sessionLogs.id} from ${sessionLogs} where ${sessionLogs.id} = ${before} and ${sessionLogs.userId} = ${userId})`,
        );
      }

      return db
        .select(LOG_LIST_COLUMNS)
        .from(sessionLogs)
        .where(and(...conditions))
        .orderBy(desc(sessionLogs.loggedAt), desc(sessionLogs.id))
        .limit(limit);
    },

    // The from-the-log view's fetch (spec §3): full row, steps included.
    // Owner-scoped the same way `workouts.get`'s personal branch is
    // (`and(eq(userId), eq(id))`) — a foreign or absent id both produce
    // zero rows, so the caller can't tell the two apart (no existence
    // leak). Unlike `workouts.get`, there is no global/shared bucket to
    // union in: every session log has exactly one owner.
    async get(userId: string, id: string) {
      const rows = await db
        .select()
        .from(sessionLogs)
        .where(and(eq(sessionLogs.userId, userId), eq(sessionLogs.id, id)));
      return rows[0] ?? null;
    },

    // The API's first UPDATE (spec §3). `patch`'s keys are read with `in`
    // (see `LogPatch`'s own comment) so only fields the caller actually
    // named are included in the SQL `SET` clause — an absent key is never
    // written, an explicit `null` clears the column. Owner-scoped exactly
    // like `get()` above: a foreign or absent id updates zero rows and
    // returns null, never a silent no-op that LOOKS like success.
    // `routes/data.ts` never calls this with an empty `patch` (that's a
    // no-op READ at the route, via `get()`) — an empty `SET` clause would
    // 500 against real Postgres, the same class of bug
    // `PUT /api/prefs`'s own empty-patch guard exists to dodge.
    async update(userId: string, id: string, patch: LogPatch) {
      const set: Record<string, unknown> = {};
      if ("thumbs" in patch) set.thumbs = patch.thumbs ?? null;
      if ("held" in patch) set.held = patch.held ?? null;
      if ("pain" in patch) set.pain = patch.pain ?? null;
      if ("notes" in patch) set.notes = patch.notes ?? null;

      const rows = await db
        .update(sessionLogs)
        .set(set)
        .where(and(eq(sessionLogs.userId, userId), eq(sessionLogs.id, id)))
        .returning();
      return rows[0] ?? null;
    },

    // Plan's done-row link (spec §3, "one NEW fetch on Plan mount") and
    // the `?plan=` route variant. Reset/Switch make `(plan_key,
    // plan_index)` non-unique by design (spec §2 — a plan_state reset
    // restarts the index sequence while old rows persist), so this
    // resolves NEWEST WINS per index via `DISTINCT ON`: Postgres keeps
    // the first row per `DISTINCT ON` group under the given ORDER BY, so
    // ordering by `plan_index, logged_at DESC` keeps the latest-logged
    // row for each index. A row with `planKey` null (never advanced a
    // named plan) can never match `eq(planKey, planKey)` — SQL `= NULL`
    // is never true — so only genuinely-linked rows are eligible,
    // structurally, with no extra `isNotNull` guard needed.
    async listPlanLinks(
      userId: string,
      planKey: string,
    ): Promise<{ planIndex: number; id: string }[]> {
      const rows = await db
        .selectDistinctOn([sessionLogs.planIndex], {
          planIndex: sessionLogs.planIndex,
          id: sessionLogs.id,
        })
        .from(sessionLogs)
        .where(
          and(eq(sessionLogs.userId, userId), eq(sessionLogs.planKey, planKey)),
        )
        .orderBy(sessionLogs.planIndex, desc(sessionLogs.loggedAt));
      // planIndex is only ever null on a row whose planKey is also null
      // (create()'s "both linkage fields stay null together" invariant),
      // and the WHERE clause above already excludes those — the cast just
      // works around Drizzle's grouped-select typing still marking the
      // column nullable.
      return rows.map((row) => ({
        planIndex: row.planIndex as number,
        id: row.id,
      }));
    },

    async count(userId: string): Promise<number> {
      const rows = await db
        .select({ id: sessionLogs.id })
        .from(sessionLogs)
        .where(eq(sessionLogs.userId, userId));
      return rows.length;
    },

    // Inserts the log and bumps plan_state.done_n in one transaction so the
    // two writes can never diverge (e.g. a crash after the log lands but
    // before progress advances).
    //
    // Task 3: `input.advancesPlan` wraps ONLY the plan_state upsert below —
    // the log insert is unchanged and still happens unconditionally, inside
    // the same transaction, regardless of the flag. A `false` row still
    // logs (the rower did the work; they just don't want it counted toward
    // the plan), it simply leaves plan_state untouched — including never
    // creating a plan_state row at all for a user who had none yet.
    //
    // From-the-log spec (2026-08-18), §2 "the linkage mechanism": the
    // plan_state upsert now runs FIRST, still inside this same transaction,
    // and gains `.returning({doneN, planKey})` on the SAME atomic
    // statement — post-update values, so two concurrent advancing saves
    // cannot stamp the same index (the read-then-increment race is
    // designed out, not tested out). `plan_index` is the returned
    // `doneN - 1`; both linkage fields stay null when this save doesn't
    // advance the plan at all, OR when it does but the returned `planKey`
    // is null (the counter moved with no plan chosen — possible today):
    // "advanced the counter" without a named plan records no linkage. The
    // key is server-derived from the plan_state row, never posted by the
    // client (LogInput carries no plan_key/plan_index field at all — see
    // that interface's own comment).
    async create(userId: string, input: LogInput): Promise<{ id: string }> {
      return db.transaction(async (tx) => {
        let planKey: string | null = null;
        let planIndex: number | null = null;

        if (input.advancesPlan) {
          const [advanced] = await tx
            .insert(planState)
            .values({ userId, doneN: 1 })
            .onConflictDoUpdate({
              target: planState.userId,
              set: { doneN: sql`${planState.doneN} + 1` },
            })
            .returning({ doneN: planState.doneN, planKey: planState.planKey });

          if (advanced.planKey !== null) {
            planKey = advanced.planKey;
            planIndex = advanced.doneN - 1;
          }
        }

        const [row] = await tx
          .insert(sessionLogs)
          .values({
            userId,
            workoutId: input.workoutId,
            workoutTitle: input.workoutTitle,
            workoutType: input.workoutType,
            baselineK2: input.baselineK2,
            baselineK6: input.baselineK6,
            held: input.held,
            pain: input.pain,
            notes: input.notes,
            steps: input.steps,
            deviceName: input.deviceName ?? null,
            thumbs: input.thumbs ?? null,
            avgSplitSeconds: input.avgSplitSeconds ?? null,
            timeSeconds: input.timeSeconds ?? null,
            distanceMeters: input.distanceMeters ?? null,
            planKey,
            planIndex,
          })
          .returning({ id: sessionLogs.id });

        return row;
      });
    },

    // Most-recent log per workout, as whole days since that log — feeds the
    // suggestion pool's "least recently done" ordering. Logs with no
    // workoutId (workout since deleted, or ad-hoc) are excluded: there's
    // nothing to attribute recency to.
    async lastDonePerWorkout(userId: string): Promise<Record<string, number>> {
      const rows = await db
        .select({
          workoutId: sessionLogs.workoutId,
          lastLoggedAt: sql<Date>`max(${sessionLogs.loggedAt})`,
        })
        .from(sessionLogs)
        .where(
          and(eq(sessionLogs.userId, userId), isNotNull(sessionLogs.workoutId)),
        )
        .groupBy(sessionLogs.workoutId);

      const now = Date.now();
      const result: Record<string, number> = {};
      for (const row of rows) {
        // The `isNotNull` filter above guarantees workoutId is set; the cast
        // just works around Drizzle's grouped-select typing still marking
        // the column nullable.
        const workoutId = row.workoutId as string;
        const days = Math.floor(
          (now - new Date(row.lastLoggedAt).getTime()) / 86_400_000,
        );
        result[workoutId] = days;
      }
      return result;
    },
  };
}

export type LogsStore = ReturnType<typeof createLogsStore>;
