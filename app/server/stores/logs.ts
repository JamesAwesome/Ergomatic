import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { planState, sessionLogs, workouts } from "../db/schema.js";
import type { PlanKey } from "./planState.js";

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
// Phase LL Task 4 (design spec §4, TRIAD): the server-side mirror of
// `src/monitor/monitorRun.ts`'s widened `MonitorRun.endedBy` — the SAME
// values, including `"interrupted"` (F6's pre-existing value, along
// for the ride so the widened union is one additive shape, not two). The
// pgEnum (`server/db/schema.ts`'s `endedByEnum`) is the value authority;
// this type mirrors it the same way `HeldResult`/`Thumbs` above already
// mirror theirs.
// Wave F PR 1 (lifecycle design spec §1, "The migration, owned"): this is
// a HAND-COPIED literal union, not derived from `CloseReason` — widening
// the client union typechecks clean and fails only at runtime on a phone
// unless this mirror (and `server/db/schema.ts`'s `endedByEnum`, and
// `server/routes/data.ts`'s `ENDED_BY_VALUES`) moves in the same commit.
// `"program-dropped"` added here for exactly that reason.
export type EndedBy =
  | "finished"
  | "rower"
  | "link-lost"
  | "program-failed"
  | "program-dropped"
  | "interrupted";

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
//
// Amendment (2026-08-18, Phase LT spec 1, §2 — the SPM overload split):
// `spm` used to hold the monitor door's MEASURED average with no target
// ever copied; it now holds the AUTHORED target on every door (timer,
// manual, and monitor — `src/session/logDraft.ts`'s `LogStep` doc comment
// carries the full rationale). `actualSpm` is new: the monitor door's
// measured average, additive, same "type-level change only, no migration"
// note (jsonb, no `.$type<>()` binding). A row saved before this split has
// `actualSource === "pm5"` and no `actualSpm` at all — its `spm` holds the
// OLD measured value; `src/session/logDraft.ts`'s exported
// `spmIsMeasured` is the one shared discriminant for that row-local fact.
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
  actualSpm?: number;
}

// Series capture spec (2026-08-19), §1/§3: a server-side MIRROR of the
// client's `src/monitor/seriesRecorder.ts` `Sample`/`SeriesData` shapes —
// not a shared import. Server code never imports from `src/` (the client
// tree); this is the same "independent, own-bounds mirror" idiom `LogStep`
// above already uses for the pm5-sourced fields it duplicates from
// `logDraft.ts` rather than sharing a type across the client/server
// boundary. `routes/data.ts`'s `validateSeries` is what actually
// constructs a value of this shape — every field here has already passed
// its own band check by the time it reaches this store.
export interface LogSeriesSample {
  t: number;
  d: number;
  p: number;
  spm: number;
  hr?: number;
  /** trace-truth Task 2 (spec §3): mirrors the client's `Sample.r` —
   *  present and `true` only for a sample recorded while the machine was
   *  resting; absent means work, same idiom as `hr` above. */
  r?: true;
}

export interface LogSeries {
  samples: LogSeriesSample[];
  truncated?: true;
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
  // Series capture spec (2026-08-19), §3: the 1 Hz trace, optional/
  // nullable, same convention as `deviceName`/`thumbs` above — absent or
  // explicit null both store null (an older client, a dropped series, or
  // a non-monitor door posts nothing). Shape-and-band validated at the
  // route (`routes/data.ts`'s `validateSeries`) before this type is ever
  // constructed, same trust-boundary posture as every other numeric field
  // on this interface. Deliberately excluded from `LOG_LIST_COLUMNS`
  // below — see that constant's own comment.
  series?: LogSeries | null;
  // Phase LL Task 4 (design spec §4, TRIAD): the honest close reason,
  // optional/nullable, same convention as `deviceName`/`thumbs` above —
  // absent or explicit null both store null (a phone-timer/manual log has
  // no monitor close to report; an older client posts nothing). Bounds-
  // checked at the route (`routes/data.ts`'s `endedByError`) against the
  // exact five known values before this type is ever constructed, same
  // trust-boundary posture as every other field here.
  endedBy?: EndedBy | null;
  // RC-1 (storage-spine design spec §3, TRIAD): work and rest, optional/
  // nullable, same convention as `deviceName`/`thumbs`/`endedBy` above —
  // absent or explicit null both store null (a phone-timer/manual log, an
  // older client, or a monitor close that isn't a natural `"finished"`
  // finish posts nothing — `src/monitor/monitorRun.ts`'s own writers only
  // ever compute these four for that one close reason). Bounds-checked at
  // the route (`routes/data.ts`'s `workRestQuantityError`) against a
  // non-negative-whole-number-or-absent rule before this type is ever
  // constructed, same trust-boundary posture as every other numeric field
  // on this interface.
  workSeconds?: number | null;
  workMeters?: number | null;
  restSeconds?: number | null;
  restMeters?: number | null;
  // RC-2/RC-3 wave design spec §1 ("The server tier (same PR)", TRIAD):
  // the machine's own end-of-workout summary, optional/nullable, same
  // convention as `workSeconds`/`endedBy` above — absent or explicit null
  // both store null (a phone-timer/manual log, an older client, or a save
  // that raced ahead of the burst posts nothing). Bounds-checked at the
  // route (`routes/data.ts`'s `workRestQuantityError`/
  // `validateMachineSummary`) before this type is ever constructed, same
  // trust-boundary posture as every other field on this interface.
  // `machineSummary` is untyped (`Record<string, unknown> | null`, not a
  // `MachineSummaryDetail` shape) — it is stored VERBATIM once validated,
  // same "monitor-observed, display-verbatim" contract `series` above
  // already has.
  machineWorkSeconds?: number | null;
  machineWorkMeters?: number | null;
  machineSummary?: Record<string, unknown> | null;
  // Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes):
  // the client's MonitorRun.completedAt and IANA zone, optional/nullable,
  // same convention as `deviceName`/`thumbs`/`endedBy` above — absent or
  // explicit null both store null (an older client, or a save this phase
  // doesn't post either field for, stores nothing). Posted at save from
  // PR2 on; bounds-checked at the route before this type is ever
  // constructed, same trust-boundary posture as every other field here.
  completedAt?: Date | null;
  tz?: string | null;
  // Deliberately absent from this interface: `c2ResultId`/`c2UserId` are
  // NEVER client input (see `db/schema.ts`'s `sessionLogs.c2ResultId`
  // doc comment) — a later task's upload route writes them itself, after
  // Concept2's own 2xx, the same "server-derived, not LogInput" posture
  // `planKey`/`planIndex` already have below. `create()` does not set
  // them yet; every row this task can produce reads them back null.
  //
  // Also absent: `plan_key`/`plan_index` are NEVER client input.
  // `create()` below derives them itself, inside the same transaction as
  // the log insert, from the plan_state upsert's own `.returning()` — see
  // that function's doc comment.
}

// From-the-log spec (2026-08-18), §3: the API's first UPDATE. Every key is
// independently optional at the TYPE level, but `update()` below reads
// PRESENCE with the `"held" in patch` idiom (`routes/data.ts`'s own
// comment on its PATCH handler has the full rationale — PUT /api/prefs's
// `warmup` field used the identical idiom before Phase WU removed it), not
// `!== undefined` — a key that is present and explicitly `null` clears
// that column; a key that is absent
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

// The list projection (below) explicitly OMITS `steps` AND `series`
// (series capture spec, 2026-08-19, §3 "List projection": a 720 KB-
// worst-case trace is dead weight for a list rendering meta + a hero
// snippet, exactly like `steps` already was) AND the `machineSummary`
// blob (RC-2/RC-3 wave, same size reasoning) — the drift pin in
// `storeContracts.ts` reads "list = get - steps - series - machineSummary
// + machineAvgPaceSecondsPer500m" (RC-5 §3, Task 4 added the one derived
// scalar below). This is the shape every `get()` column produces, minus
// those three, plus that one derived key, named once so `list()`'s
// return type reads intentionally rather than as an unlabeled inline
// object.
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
  // Phase LL Task 4: a small scalar, same idiom as `deviceName`/`thumbs`
  // above — included in the list projection (unlike `steps`/`series`,
  // which are excluded for size).
  endedBy: sessionLogs.endedBy,
  // RC-1: four more small scalars, same idiom — included in the list
  // projection.
  workSeconds: sessionLogs.workSeconds,
  workMeters: sessionLogs.workMeters,
  restSeconds: sessionLogs.restSeconds,
  restMeters: sessionLogs.restMeters,
  // RC-2/RC-3 wave: `machineWorkSeconds`/`machineWorkMeters` are two more
  // small scalars, same idiom as the RC-1 pair above — included. But
  // `machineSummary` joins `steps`/`series` in the EXCLUSION instead: a
  // ~2KB-worst-case jsonb blob is the same dead weight for a list row
  // those two already are (the size cap is deliberately generous — nine
  // fields plus up to 32 verification bytes — for the log-detail GET,
  // never sized with a 30-row list response in mind).
  machineWorkSeconds: sessionLogs.machineWorkSeconds,
  machineWorkMeters: sessionLogs.machineWorkMeters,
  // RC-5 (hero-truth design spec) §3, Task 4: ONE scalar projected OUT of
  // `machineSummary` — a narrow jsonb-path read, not the blob itself,
  // this task's own option (a) (the plan's stated preference over (b),
  // omitting AVG SPLIT on tier-A list rows entirely — no migration, no
  // schema change, `RecentLog`'s own doc comment names the display this
  // serves). `jsonb_typeof` gates the cast so a malformed stored value
  // (an authenticated client can post ANYTHING under this key — validated
  // for size/shape but never for the VALUE, `routes/data.ts`'s
  // `validateMachineSummary` own comment: "the nine fields ride along
  // VERBATIM") reads back `null` rather than throwing and 500ing the
  // WHOLE list query for every row of that user's history — a
  // non-numeric `avgPaceSecondsPer500m` on ANY row must not be able to
  // break every OTHER row's list response. `::double precision` (not
  // `::numeric`) matches `machineWorkSeconds`'s own column type — pg's
  // node-postgres driver decodes float8 (OID 701) to a real JS number by
  // default, unlike `numeric` (OID 1700), which decodes as a string.
  machineAvgPaceSecondsPer500m: sql<
    number | null
  >`case when jsonb_typeof(${sessionLogs.machineSummary}->'avgPaceSecondsPer500m') = 'number' then (${sessionLogs.machineSummary}->>'avgPaceSecondsPer500m')::double precision else null end`,
  // Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes):
  // four more small scalars, same idiom as `endedBy`/the RC-1 pair
  // above — included in the list projection (no jsonb blob to exclude
  // here).
  c2ResultId: sessionLogs.c2ResultId,
  c2UserId: sessionLogs.c2UserId,
  completedAt: sessionLogs.completedAt,
  tz: sessionLogs.tz,
};

// Log-delete spec (2026-08-18), §2: the newest-wins resolution rule,
// factored out so `listPlanLinks` (below) and `delete` (below) share
// EXACTLY one definition of "newest" — the brief's own requirement, after
// spec 2 already established this as the read-side rule and the antagonist
// proved a second, independently-derived copy is exactly the kind of drift
// this codebase has shipped before (see this file's own `list()` cursor
// comment on the microsecond-truncation class of bug). `executor` accepts
// either `db` (an ordinary read, `listPlanLinks`) or an open `tx` (`delete`
// needs this resolved INSIDE its transaction, before the row it might be
// about to remove stops being a candidate) — both expose the same
// `selectDistinctOn`/`from`/`where`/`orderBy` builder chain.
// `planIndex`, when given, scopes to that one index only (delete's own
// use: it only ever needs to ask "who wins index N", never the whole map).
// Typed structurally (`Pick<Db, "selectDistinctOn">`) rather than `Db`
// itself: an open `tx` inside `db.transaction` is a `PgTransaction`, not a
// `Db` (it lacks `Db`'s own `$client` handle) — both expose the identical
// `selectDistinctOn` builder chain this function actually calls.
/** One resolved plan slot: which log closed it, what that log RECORDED,
 *  and what the workout it LINKS TO actually is. Those last two are
 *  different things and the split is the point.
 *
 *  `workoutTitle`/`workoutType` are the SAVE-TIME snapshot columns, never
 *  a join — a workout that has since been edited, renamed or deleted must
 *  not change what the Plan screen says a rower did (`workoutId` is
 *  `ON DELETE SET NULL`; these two never move). They are what the row
 *  DISPLAYS.
 *
 *  `linkedTitle`/`workoutIsGlobal` are the joined row's own title and
 *  ownership: what the row IS. They travel as a PAIR because identity is
 *  a pair — a checkpoint prescribes its test with `globalOnly: true`
 *  (`domain/prescription.ts`) and `resolvePrescribed` answers it with
 *  `w.title === ref.title && w.isGlobal`, both read off ONE workout row.
 *
 *  Reading one of those from the snapshot and the other from the join was
 *  a live defect (re-review of 1b2e80f5): `POST /api/logs` resolves
 *  `workoutId` only to check ownership (`routes/data.ts`) and then trusts
 *  the submitted title and type independently, so the two sources can
 *  disagree — a request naming the global 6K Test's id with a `2K Test`
 *  snapshot was accepted, and the sprint checkpoint went unmarked. It is
 *  not only reachable by a forged POST either: renaming a prescribed
 *  global would break a snapshot-title comparison through the front door,
 *  where the id survives it.
 *
 *  Both are `null` together when there is no workout to read — the log
 *  carried no `workoutId` (an off-app or pre-link row), or the workout it
 *  pointed at has since been deleted. That is UNKNOWN identity, never
 *  "personal".
 *
 *  `workoutType` is typed `string`, not `WorkoutType`: the column is plain
 *  `text` (schema.ts:147 — deliberately NOT `workoutTypeEnum`, which is
 *  the `workouts` table's column). New writes are validated against the
 *  union at the route, but rows stored before that check exist, so every
 *  consumer still has to narrow it for itself. */
export interface PlanLink {
  planIndex: number;
  id: string;
  workoutTitle: string;
  workoutType: string;
  linkedTitle: string | null;
  workoutIsGlobal: boolean | null;
}

async function resolveNewestPlanLink(
  executor: Pick<Db, "selectDistinctOn">,
  userId: string,
  planKey: string,
  planIndex?: number,
): Promise<PlanLink[]> {
  const conditions = [
    eq(sessionLogs.userId, userId),
    eq(sessionLogs.planKey, planKey),
  ];
  if (planIndex !== undefined) {
    conditions.push(eq(sessionLogs.planIndex, planIndex));
  }
  // The workout columns ride the SAME `selectDistinctOn` as the id, so
  // they are read off the one row DISTINCT ON picked — never off a
  // separately-resolved row at the same index. A reset collision leaves
  // two rows on one index with different workouts; the contract suite's
  // own collision case is what holds this together.
  // The LEFT JOIN cannot change cardinality (`workouts.id` is the primary
  // key, so it matches at most one row) and so cannot disturb DISTINCT ON;
  // it is LEFT rather than INNER precisely so a log with no surviving
  // workout link still resolves its slot, with `workoutIsGlobal` null.
  const rows = await executor
    .selectDistinctOn([sessionLogs.planIndex], {
      planIndex: sessionLogs.planIndex,
      id: sessionLogs.id,
      workoutTitle: sessionLogs.workoutTitle,
      workoutType: sessionLogs.workoutType,
      // The linked row's OWN title and ownership — the identity pair.
      // `workouts.userId` is nullable and NULL marks a global row, the
      // same derivation `stores/workouts.ts` exposes as `isGlobal`; the
      // owner id itself never crosses the wire, only the boolean below.
      linkedTitle: workouts.title,
      workoutUserId: workouts.userId,
      workoutRowId: workouts.id,
    })
    .from(sessionLogs)
    .leftJoin(workouts, eq(workouts.id, sessionLogs.workoutId))
    .where(and(...conditions))
    .orderBy(
      sessionLogs.planIndex,
      desc(sessionLogs.loggedAt),
      desc(sessionLogs.id),
    );
  // planIndex is only ever null on a row whose planKey is also null
  // (create()'s "both linkage fields stay null together" invariant), and
  // the WHERE clause above already excludes those — the cast just works
  // around Drizzle's grouped-select typing still marking the column
  // nullable (same cast `listPlanLinks` itself used to do inline here).
  return rows.map((row) => ({
    planIndex: row.planIndex as number,
    id: row.id,
    workoutTitle: row.workoutTitle,
    workoutType: row.workoutType,
    // No joined workout row at all -> unknown identity: BOTH halves null
    // together, so a consumer can never pair a known title with an
    // unknown ownership or the reverse. A joined row -> its own title,
    // and global exactly when it has no owner. The two nulls (no row vs.
    // a global row's null owner) are genuinely different facts and must
    // not collapse, which is why the row id is selected alongside the
    // owner id.
    linkedTitle: row.workoutRowId === null ? null : row.linkedTitle,
    workoutIsGlobal:
      row.workoutRowId === null ? null : row.workoutUserId === null,
  }));
}

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
      // Task 2 review, LOW 2: no `?? null` fallback here (there was one,
      // briefly) — `LogPatch`'s own type is `T | null` on every field, so
      // a present key is never literally `undefined`; a fallback for a
      // shape the type already forbids was unreachable dead branch, not
      // defensive coding (unlike `PUT /api/prefs`'s analogous idiom,
      // which guards a real runtime possibility the prefs patch type
      // doesn't rule out).
      const set: Record<string, unknown> = {};
      if ("thumbs" in patch) set.thumbs = patch.thumbs;
      if ("held" in patch) set.held = patch.held;
      if ("pain" in patch) set.pain = patch.pain;
      if ("notes" in patch) set.notes = patch.notes;

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
    //
    // Final whole-branch review (2026-08-18), MINOR finding: `loggedAt`
    // alone has no tiebreak, so two advancing saves for the same index
    // landing in the same microsecond (both real transactions calling
    // `now()` — unlikely, not impossible) would pick a winner
    // nondeterministically; `sessionLogs.id`'s own gen_random_uuid()
    // default has no ordering relationship with insert order, so this
    // adds `desc(id)` purely as a deterministic, arbitrary-but-stable
    // final tiebreak (not a "pick the later insert" one — Postgres
    // offers no cheap monotonic column here) so the query itself can
    // never return a different answer for the same data twice. Mirrors
    // `server/testing/fakes.ts`'s own `seq` tiebreak in spirit, though
    // that one IS insertion-ordered (the fake's plain `Date` can tie in
    // ways real Postgres timestamps practically don't); a genuine
    // same-timestamp collision isn't cheaply reproducible against the
    // real store through the public `LogsStore` interface (`loggedAt` is
    // a DB-side default, not settable by `create()`'s input), so this
    // stays an ORDER BY change plus this comment rather than a new
    // test-only seam.
    async listPlanLinks(userId: string, planKey: string): Promise<PlanLink[]> {
      return resolveNewestPlanLink(db, userId, planKey);
    },

    // Log-delete spec (2026-08-18), §2: one `db.transaction` — the un-
    // count rule fires iff ALL THREE hold: (1) the deleted row's
    // `plan_key` equals plan_state's CURRENT `plan_key` (a Switch means
    // an old plan's logs never touch the new plan's counter); (2) the
    // deleted row's `plan_index` was the TERMINAL one (`done_n - 1`
    // exactly — a middle index never decrements, antagonist B1: the
    // counter is positional, indexes are immutable history, and un-
    // counting the middle strands every session above it); (3) the
    // deleted row was the NEWEST-WINS holder of its `(plan_key,
    // plan_index)` (spec 2's own resolution, shared via
    // `resolveNewestPlanLink` above — deleting an OLDER duplicate at a
    // linked index is a row-only delete).
    //
    // Transaction shape (antagonist B4 — read-committed makes a split
    // read-decide-write guard no guard at all): `SELECT … FOR UPDATE` on
    // plan_state runs FIRST, serializing against `create()`'s upsert
    // (which already row-locks) — this closes the window a concurrent
    // Reset/Switch could otherwise use to drive `done_n` to -1 between a
    // read and a later write. Condition (3) is resolved BEFORE the row
    // is removed (it stops being a candidate for its own index the
    // moment it's gone), via a narrow, non-locking two-column read —
    // `plan_key`/`plan_index` are immutable once a log is created (never
    // rewritten; spec 2's "linkage is history" rule), so reading them
    // ahead of the delete carries no race. Conditions (1) and (2) are
    // NOT pre-checked in JS: they live entirely in the conditional
    // UPDATE's own WHERE (`plan_key = $key AND done_n = $index + 1`), so
    // `unCounted` is exactly "that UPDATE's row count === 1" — the
    // update's own outcome, not a JS-computed guess about it. The
    // `GREATEST(done_n - 1, 0)` clamp stays as depth only: with the lock
    // and the WHERE, the floor is unreachable BY CONSTRUCTION.
    async delete(
      userId: string,
      id: string,
    ): Promise<{ deleted: boolean; unCounted: boolean }> {
      return db.transaction(async (tx) => {
        // Lock plan_state first (see comment above) — zero matching rows
        // (a user who never touched a plan) is a legitimate no-op lock,
        // nothing to serialize against.
        await tx
          .select()
          .from(planState)
          .where(eq(planState.userId, userId))
          .for("update");

        // Condition 3, resolved before the row can be removed.
        const [target] = await tx
          .select({
            planKey: sessionLogs.planKey,
            planIndex: sessionLogs.planIndex,
          })
          .from(sessionLogs)
          .where(and(eq(sessionLogs.userId, userId), eq(sessionLogs.id, id)));

        let isNewestWinsHolder = false;
        if (target && target.planKey !== null && target.planIndex !== null) {
          const [newest] = await resolveNewestPlanLink(
            tx,
            userId,
            target.planKey,
            target.planIndex,
          );
          isNewestWinsHolder = newest?.id === id;
        }

        const [deletedRow] = await tx
          .delete(sessionLogs)
          .where(and(eq(sessionLogs.userId, userId), eq(sessionLogs.id, id)))
          .returning();

        if (!deletedRow) {
          return { deleted: false, unCounted: false };
        }

        if (
          deletedRow.planKey === null ||
          deletedRow.planIndex === null ||
          !isNewestWinsHolder
        ) {
          return { deleted: true, unCounted: false };
        }

        // `plan_state.planKey` is enum-typed ("sprint"|"head"); the
        // deleted row's own `plan_key` column is plain text but is only
        // ever server-derived from that same enum column at create()
        // time (never client input — see LogInput's own comment), so
        // this narrowing cast reflects a real invariant, not a hope.
        const conditionalUpdate = await tx
          .update(planState)
          .set({ doneN: sql`GREATEST(${planState.doneN} - 1, 0)` })
          .where(
            and(
              eq(planState.userId, userId),
              eq(planState.planKey, deletedRow.planKey as PlanKey),
              eq(planState.doneN, deletedRow.planIndex + 1),
            ),
          )
          .returning({ userId: planState.userId });

        return { deleted: true, unCounted: conditionalUpdate.length === 1 };
      });
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
            series: input.series ?? null,
            endedBy: input.endedBy ?? null,
            workSeconds: input.workSeconds ?? null,
            workMeters: input.workMeters ?? null,
            restSeconds: input.restSeconds ?? null,
            restMeters: input.restMeters ?? null,
            machineWorkSeconds: input.machineWorkSeconds ?? null,
            machineWorkMeters: input.machineWorkMeters ?? null,
            machineSummary: input.machineSummary ?? null,
            completedAt: input.completedAt ?? null,
            tz: input.tz ?? null,
            planKey,
            planIndex,
          })
          .returning({ id: sessionLogs.id });

        return row;
      });
    },

    // Wave E PR1 Task 6 (task-6-brief.md): server-written only, after C2's
    // own 2xx (route's own comment) — never client input (LogInput's own
    // comment names why the two columns are absent from that interface).
    // Owner-scoped UPDATE, same idiom as `update()` above; the boolean
    // return is the route's seam for "row deleted concurrently between the
    // eligibility read and this write" (RF25: this route owns that
    // invariant, and the route's 502 branch is keyed on this return, not on
    // a re-read).
    async recordC2Result(
      userId: string,
      id: string,
      c2ResultId: number,
      c2UserId: number,
    ): Promise<boolean> {
      const rows = await db
        .update(sessionLogs)
        .set({ c2ResultId, c2UserId })
        .where(and(eq(sessionLogs.userId, userId), eq(sessionLogs.id, id)))
        .returning({ id: sessionLogs.id });
      return rows.length === 1;
    },

    // Wave E PR1 Task 6, plan deviation 2: legacy-row upload persist-on-
    // first-use. The `tz IS NULL` guard rides IN the WHERE clause (not a
    // read-then-write in JS) so a concurrent second upload attempt for the
    // same row can never clobber the zone the first attempt already wrote
    // — the route's own dedup-stability property (a retry must build the
    // SAME date string) depends on this write being idempotent-after-first,
    // never a plain unconditional SET.
    //
    // Fix round 1, M1: returns the EFFECTIVE stored zone, never `void` —
    // when the guard blocks this call's own write (a concurrent writer got
    // there first), the caller must build its payload from whatever zone
    // actually landed, not silently keep using its own `tz` argument as if
    // it had won. `RETURNING` on the guarded UPDATE reports the winning
    // value for free when THIS call wrote it; when it didn't (zero rows
    // returned), a plain re-read reports what the other writer stored.
    async recordTz(userId: string, id: string, tz: string): Promise<string> {
      const written = await db
        .update(sessionLogs)
        .set({ tz })
        .where(
          and(
            eq(sessionLogs.userId, userId),
            eq(sessionLogs.id, id),
            isNull(sessionLogs.tz),
          ),
        )
        .returning({ tz: sessionLogs.tz });
      if (written[0]) return written[0].tz as string;

      // The guard blocked this write — either a concurrent writer already
      // stored a zone (the expected race), or the row no longer exists
      // (caller has already resolved it to a row before calling this, so
      // this is defensive only). `?? tz` covers the defensive case with the
      // caller's own value rather than returning a nullable type for a
      // structurally-unreachable branch.
      const [current] = await db
        .select({ tz: sessionLogs.tz })
        .from(sessionLogs)
        .where(and(eq(sessionLogs.userId, userId), eq(sessionLogs.id, id)));
      return current?.tz ?? tz;
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
