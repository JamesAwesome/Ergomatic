import { vi } from "vitest";
import { isFreeRow } from "../../domain/types.js";
import type { SessionStore } from "../auth/sessions.js";
import type { UserStore } from "../auth/users.js";
import type { WorkoutInput, WorkoutType } from "../../domain/types.js";
import { type Stores } from "../routes/data.js";
import type { ArticleReadsStore } from "../stores/articleReads.js";
import type {
  BaselinesPatch,
  BaselinesRow,
  BaselinesStore,
} from "../stores/baselines.js";
import {
  CursorNotFoundError,
  PARTIAL_ENDED_BY,
  type LogInput,
  type LogPatch,
  type LogsStore,
  type PlanLink,
} from "../stores/logs.js";
import type {
  PlanKey,
  PlanStateRow,
  PlanStateStore,
} from "../stores/planState.js";
import {
  PREFERENCES_DEFAULTS,
  type PreferencesPatch,
  type PreferencesRow,
  type PreferencesStore,
} from "../stores/preferences.js";
import type { TestHistoryStore } from "../stores/testHistory.js";
import type { NewWorkoutInput, WorkoutsStore } from "../stores/workouts.js";
import {
  AttemptNonceCollisionError,
  Concept2LinkConflictError,
  type Concept2Link,
  type Concept2Store,
  type ConsumedConcept2Attempt,
  type LinkSurface,
  type NewConcept2Attempt,
  type PeekedConcept2Attempt,
} from "../stores/concept2.js";

// ---------------------------------------------------------------------------
// In-memory fakes, keyed by userId, mirroring the real stores' signatures
// exactly (per app/server/stores/*.ts). This is the API contract shared by
// every server test that exercises the data router or its stores directly.
// ---------------------------------------------------------------------------

interface WorkoutRow extends WorkoutInput {
  id: string;
  userId: string | null;
  source: "starter" | "user";
  sortOrder: number | null;
  seq: number;
  createdAt: Date;
  updatedAt: Date;
}

// Postgres orders `sort_order ASC, created_at ASC` with NULLs last (see
// app/server/stores/workouts.ts). `createdAt` here can tie inside a single
// millisecond, so insertion order is tracked separately as `seq` and used as
// the creation-order key — same observable ordering, without a fake-only
// flake the real store can't have.
let insertionSeq = 0;

const WORKOUT_TYPES: WorkoutType[] = ["AN", "O2", "AT", "TR"];

// The `workout_type` enum rejects anything else outright, and createMany
// runs in one transaction, so a bad type anywhere in a batch takes the whole
// batch down. Mirrored here so the contract suite's rollback case is honest.
function assertWorkoutType(type: WorkoutType): void {
  if (!WORKOUT_TYPES.includes(type)) {
    throw new Error(`invalid input value for enum workout_type: "${type}"`);
  }
}

function byListOrder(a: WorkoutRow, b: WorkoutRow): number {
  if (a.sortOrder !== b.sortOrder) {
    if (a.sortOrder === null) return 1;
    if (b.sortOrder === null) return -1;
    return a.sortOrder - b.sortOrder;
  }
  return a.seq - b.seq;
}

function newWorkoutRow(
  input: NewWorkoutInput,
  userId: string | null,
): WorkoutRow {
  assertWorkoutType(input.type);
  insertionSeq += 1;
  return {
    ...input,
    sortOrder: input.sortOrder ?? null,
    seq: insertionSeq,
    id: crypto.randomUUID(),
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Fakes are cast with `as unknown as <RealStoreType>` (the same pattern the
// existing auth tests use for fake stores) rather than relying on
// contextual typing from the real store types: the real stores' `get`/
// `update` methods are inferred (via a Drizzle `rows[0] ?? null` idiom,
// with `noUncheckedIndexedAccess` off) as NEVER returning null at the type
// level even though they do at runtime — matching that exactly would make
// the fakes lie about the very null case the routes need to handle.

// Postgres uuid columns 500 on a malformed literal (SQLSTATE 22P02) rather
// than finding no row — see app/server/routes/data.ts's UUID_RE guard,
// added after that shipped as a live regression. The fakes must throw here
// too so tests written against them can't quietly diverge from real
// Postgres on this path again (app/server/stores/contracts/storeContracts.ts
// asserts it explicitly).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuidShape(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new Error(`invalid input syntax for type uuid: "${id}"`);
  }
}

function makeFakeBaselinesStore(): BaselinesStore {
  // Internal rows carry the provenance columns exactly like Postgres does
  // (insert defaults 'manual', an update touches only the patch's own
  // keys), but get() projects them off — mirroring the real store's
  // deliberate numbers-only projection (PR A's lean-GET decision).
  const rows = new Map<
    string,
    BaselinesRow & { k2Source: string; k6Source: string }
  >();
  return {
    async get(userId: string) {
      const row = rows.get(userId);
      if (!row) return null;
      return { k2Seconds: row.k2Seconds, k6Seconds: row.k6Seconds };
    },
    async put(userId: string, patch: BaselinesPatch) {
      const current = rows.get(userId) ?? {
        k2Seconds: null,
        k6Seconds: null,
        k2Source: "manual",
        k6Source: "manual",
      };
      rows.set(userId, { ...current, ...patch });
    },
    // Phase BL PR C: mirrors the real store's whole-row delete (numbers
    // and sources go together; a later put starts from the defaults).
    async clear(userId: string) {
      rows.delete(userId);
    },
  } as unknown as BaselinesStore;
}

// Mirrors the real store's global-library semantics (app/server/stores/
// workouts.ts): globals live in their own bucket, keyed by nothing but id
// (no owning user), and every personal bucket's list/get is unioned with
// them. update/remove only ever touch a caller's own personal bucket — they
// structurally cannot reach `globals`, exactly like the real store's
// `user_id = $userId` predicate can never match a NULL user_id row.
function makeFakeWorkoutsStore(): WorkoutsStore & {
  _seedGlobal: (input: NewWorkoutInput) => WorkoutRow;
} {
  const byUser = new Map<string, Map<string, WorkoutRow>>();
  const globals = new Map<string, WorkoutRow>();
  const forUser = (userId: string) => {
    let m = byUser.get(userId);
    if (!m) {
      m = new Map();
      byUser.set(userId, m);
    }
    return m;
  };
  // `seq` is a fake-only bookkeeping field (see byListOrder/newWorkoutRow
  // above) — real rows never carry it, so it must never flow out through a
  // route response (L2).
  const withIsGlobal = (row: WorkoutRow) => {
    const { seq: _seq, ...rest } = row;
    return { ...rest, isGlobal: row.userId === null };
  };
  const create = async (
    userId: string,
    input: NewWorkoutInput,
  ): Promise<WorkoutRow> => {
    // Always a personal row: mirror the real store's create() (H1) — force
    // sortOrder null regardless of what `input` carries, since a
    // client-supplied value on the request body must never take effect.
    // Only createMany(null, …)/_seedGlobal below (the seed path) author one.
    const row = newWorkoutRow({ ...input, sortOrder: null }, userId);
    forUser(userId).set(row.id, row);
    return withIsGlobal(row) as unknown as WorkoutRow;
  };
  return {
    async list(userId: string) {
      const all = [...globals.values(), ...forUser(userId).values()];
      return all.sort(byListOrder).map(withIsGlobal);
    },
    async get(userId: string, id: string) {
      assertUuidShape(id);
      const g = globals.get(id);
      if (g) return withIsGlobal(g);
      const row = forUser(userId).get(id);
      return row ? withIsGlobal(row) : null;
    },
    create,
    // The real store wraps this in a db.transaction: a rejected row anywhere
    // in the batch rolls the WHOLE batch back, not just that input. Build
    // (and so validate) every row BEFORE writing any of them, so a mid-batch
    // throw here can't leave earlier inputs committed the way a naive
    // per-input loop would. `userId: null` seeds globals, exactly as
    // seedGlobalLibrary does against Postgres.
    async createMany(userId: string | null, inputs: NewWorkoutInput[]) {
      const rows: WorkoutRow[] = inputs.map((input) =>
        newWorkoutRow(input, userId),
      );
      const target = userId === null ? globals : forUser(userId);
      for (const row of rows) target.set(row.id, row);
      return rows.map((row) => withIsGlobal(row) as unknown as WorkoutRow);
    },
    async update(userId: string, id: string, input: WorkoutInput) {
      assertUuidShape(id);
      const m = forUser(userId);
      const existing = m.get(id);
      if (!existing) return null;
      assertWorkoutType(input.type);
      // Mirror the real store's UPDATE exactly (app/server/stores/
      // workouts.ts): only title/type/difficulty/pain/steps/updatedAt are
      // ever set — sortOrder (and every other column) is left alone. Built
      // from an explicit field list, NOT `{ ...existing, ...input }` (M1):
      // `input` is the same object reference as the request body at
      // runtime, so a naive spread would let a client-supplied `sortOrder`
      // reorder the fake even though the real UPDATE never sets that
      // column, silently diverging fake from real.
      const row: WorkoutRow = {
        ...existing,
        title: input.title,
        type: input.type,
        difficulty: input.difficulty,
        pain: input.pain,
        steps: input.steps,
        updatedAt: new Date(),
      };
      m.set(id, row);
      return withIsGlobal(row);
    },
    async remove(userId: string, id: string) {
      assertUuidShape(id);
      forUser(userId).delete(id);
    },
    async count(userId: string) {
      return forUser(userId).size;
    },
    async listGlobals() {
      return [...globals.values()].sort(byListOrder).map(withIsGlobal);
    },
    async countGlobals() {
      return globals.size;
    },
    // Mirrors the real store's updateGlobal: globals bucket only, sortOrder
    // writable, personal rows unreachable (they live in byUser).
    async updateGlobal(
      id: string,
      input: NewWorkoutInput & { sortOrder: number },
    ) {
      const existing = globals.get(id);
      if (!existing) return null;
      const row: WorkoutRow = {
        ...existing,
        title: input.title,
        type: input.type,
        difficulty: input.difficulty,
        pain: input.pain,
        steps: input.steps,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      };
      globals.set(id, row);
      return withIsGlobal(row);
    },
    // Mirrors deleteGlobalsByIds: targeted, [] no-op, personal ids ignored
    // (they never live in `globals` in the first place).
    async deleteGlobalsByIds(ids: string[]) {
      for (const id of ids) globals.delete(id);
    },
    // Test-only seam: the real store's globals come from seedGlobalLibrary
    // at boot, never through this router. Injects a global row directly.
    _seedGlobal(input: NewWorkoutInput) {
      const row = newWorkoutRow(input, null);
      globals.set(row.id, row);
      return withIsGlobal(row) as unknown as WorkoutRow;
    },
  } as unknown as WorkoutsStore & {
    _seedGlobal: (input: NewWorkoutInput) => WorkoutRow;
  };
}

type FakePlanStateStore = PlanStateStore & {
  _advance: (userId: string, by?: number) => PlanStateRow;
  // Log-delete spec (2026-08-18), §2: mirrors the real store's
  // conditional `UPDATE plan_state SET done_n = GREATEST(done_n - 1, 0)
  // WHERE user_id = $1 AND plan_key = $planKey AND done_n = $expectedDoneN`
  // (stores/logs.ts's `delete()`) — conditions 1+2 (current plan key,
  // terminal index) live entirely in THIS check, exactly like the real
  // UPDATE's own WHERE, so `logs.delete()` below can derive `unCounted`
  // from this call's return value the same way the real store derives it
  // from the UPDATE's row count, rather than re-deriving the conditions
  // itself. Returns false (a no-op) on any mismatch, never throws.
  _decrementIfCurrent: (
    userId: string,
    planKey: PlanKey,
    expectedDoneN: number,
  ) => boolean;
};

// set/reset are plain (not vi.fn-wrapped) here: consumers that need to
// assert on calls do so per-test via `vi.spyOn(stores.planState, "set")`
// (vitest spies call through to the original implementation by default, so
// behavior is unaffected), rather than every fake baking in call-tracking
// that most tests never use.
function makeFakePlanStateStore(): FakePlanStateStore {
  const rows = new Map<string, PlanStateRow>();
  return {
    async get(userId: string) {
      return rows.get(userId) ?? null;
    },
    async set(userId: string, planKey: PlanKey | null) {
      rows.set(userId, { planKey, doneN: 0 });
    },
    async reset(userId: string) {
      const current = rows.get(userId) ?? { planKey: null, doneN: 0 };
      rows.set(userId, { ...current, doneN: 0 });
    },
    // test-only helper mimicking the real store's transactional done_n bump
    // from inside logs.create — not part of the real store's interface.
    // From-the-log spec (2026-08-18): now RETURNS the post-bump row,
    // mirroring the real store's `.returning({doneN, planKey})` on the
    // same atomic upsert (stores/planState.ts has no such method — this
    // stays a logs.create()-only concern in both the real and fake
    // stores) — the fake logs store needs the same post-update values the
    // real transaction gets, not a separate re-read that could race.
    _advance(userId: string, by = 1): PlanStateRow {
      const current = rows.get(userId) ?? { planKey: null, doneN: 0 };
      const next = { ...current, doneN: current.doneN + by };
      rows.set(userId, next);
      return next;
    },
    _decrementIfCurrent(
      userId: string,
      planKey: PlanKey,
      expectedDoneN: number,
    ): boolean {
      const current = rows.get(userId);
      if (
        !current ||
        current.planKey !== planKey ||
        current.doneN !== expectedDoneN
      ) {
        return false;
      }
      rows.set(userId, {
        ...current,
        doneN: Math.max(current.doneN - 1, 0),
      });
      return true;
    },
  } as unknown as FakePlanStateStore;
}

// From-the-log spec (2026-08-18), §3: a fake-only tiebreak counter for
// `listPlanLinks`' newest-wins resolution (mirrors `loggedAt DESC` +
// `id DESC` in spirit; the fake's `loggedAt` is a plain JS `Date`, which
// two `new Date()` calls inside the same test can plausibly tie on down
// to the millisecond, unlike real Postgres — see `workouts.ts`'s own
// `insertionSeq` for the identical pattern already used in this file).
// Never exposed on a stored row; strictly a same-process ordering aid.
let logsInsertionSeq = 0;

type FakeLogRow = Omit<LogInput, "advancesPlan"> & {
  id: string;
  loggedAt: Date;
  planKey: string | null;
  planIndex: number | null;
  seq: number;
  // Wave E PR1 Task 6 (task-6-brief.md): server-written only, never on
  // `LogInput` (that interface's own comment) — `create()` below always
  // stamps both null, and `recordC2Result` is the ONE writer after that.
  c2ResultId: number | null;
  c2UserId: number | null;
};

// Log-delete spec (2026-08-18), §2: the SAME newest-wins resolution
// `listPlanLinks` and `delete` (both below) share — one function, not two
// independently-hand-rolled copies of the tiebreak, mirroring the real
// store's `resolveNewestPlanLink` (stores/logs.ts). `planIndex`, when
// given, scopes to that one index (delete's own use — see that method).
//
// The `loggedAt` tie resolves by `seq`, this fake's insertion order, and
// DELIBERATELY not by `id DESC` — which is the real store's own second
// ORDER BY term. Tried and reverted at the 2026-08-30 review, which asked
// for the two to be aligned:
//
// The real store's `id DESC` is unreachable in practice. Postgres stores
// `logged_at` to the microsecond, so two ordinary saves never tie and the
// winner is always decided by `logged_at DESC` alone — observably, newest
// wins. This fake's `loggedAt` is a plain JS `Date`, so two saves in one
// test tie constantly. `seq` exists to substitute for the PRECISION the
// fake lacks, which reproduces that same observable "newest wins"; `id`
// is a random UUID and would pick a winner at random instead. Aligning
// the literal tiebreak therefore breaks the agreement it was meant to
// create — proven, not argued: the change turned two delete contract
// cases red against the fake while the real store kept passing them.
//
// A genuine same-microsecond tie cannot be forced through either store's
// public API, so no contract case can pin `id DESC` without reaching past
// the stores into raw SQL, which the shared suite does not do.
/** The winning row per index, BEFORE provenance is resolved. `workoutId`
 *  here is the row's STORED id, the fake's stand-in for the real store's
 *  LEFT JOIN key: only `listPlanLinks` (which can reach the workouts
 *  store) turns it into `PlanLink.workoutIsGlobal` — and into the
 *  projected `PlanLink.workoutId`, which the FK would already have nulled
 *  for a deleted workout in Postgres. `delete` reads nothing but `id`. */
type FakeLinkWinner = Omit<PlanLink, "workoutIsGlobal" | "linkedTitle">;

function resolveNewestFakeLink(
  rows: FakeLogRow[],
  planKey: string,
  planIndex?: number,
): FakeLinkWinner[] {
  // The workout snapshot and provenance are carried on the SAME winner
  // record as the id, mirroring the real store's single `selectDistinctOn`
  // projection — so a reset collision cannot pair one row's id with
  // another row's workout.
  const byIndex = new Map<
    number,
    {
      id: string;
      workoutTitle: string;
      workoutType: string | null;
      workoutId: string | null;
      loggedAt: Date;
      seq: number;
    }
  >();
  for (const row of rows) {
    if (row.planKey !== planKey || row.planIndex === null) continue;
    if (planIndex !== undefined && row.planIndex !== planIndex) continue;
    const existing = byIndex.get(row.planIndex);
    if (
      !existing ||
      row.loggedAt.getTime() > existing.loggedAt.getTime() ||
      (row.loggedAt.getTime() === existing.loggedAt.getTime() &&
        row.seq > existing.seq)
    ) {
      byIndex.set(row.planIndex, {
        id: row.id,
        workoutTitle: row.workoutTitle,
        workoutType: row.workoutType,
        workoutId: row.workoutId,
        loggedAt: row.loggedAt,
        seq: row.seq,
      });
    }
  }
  return [...byIndex.entries()].map(([idx, v]) => ({
    planIndex: idx,
    id: v.id,
    workoutTitle: v.workoutTitle,
    workoutType: v.workoutType,
    workoutId: v.workoutId,
  }));
}

function makeFakeLogsStore(
  planState: FakePlanStateStore,
  // The real store resolves a log's provenance with a LEFT JOIN onto
  // `workouts`; this fake has to ask the workouts store instead. Passed in
  // rather than reached for globally so `makeFakeStores` still wires one
  // object graph with no hidden singleton.
  workouts: WorkoutsStore,
): LogsStore {
  const byUser = new Map<string, FakeLogRow[]>();
  return {
    // From-the-log spec (2026-08-18), §3: mirrors the real store's list()
    // exactly — drops `steps` from the projection (zero client consumers;
    // `GET /api/logs/:id` below still returns the full row), and
    // cursor-paginates via `before`. `byUser`'s array is already
    // newest-first (every `create()` unshifts), which is this fake's
    // equivalent of `ORDER BY logged_at DESC, id DESC` — a `before` id's
    // position in THIS user's own array marks the cursor; everything
    // after it (older) is the next page. An id absent from this user's
    // array (never existed, or belongs to someone else — `byUser` is
    // already scoped per userId, so a foreign id can never be found here)
    // throws `CursorNotFoundError`, matching the real store's explicit
    // existence check.
    async list(userId: string, limit: number, before?: string) {
      const rows = byUser.get(userId) ?? [];
      let source = rows;
      if (before !== undefined) {
        const idx = rows.findIndex((r) => r.id === before);
        if (idx === -1) {
          throw new CursorNotFoundError(before);
        }
        source = rows.slice(idx + 1);
      }
      // Series capture spec (2026-08-19), §3: `series` drops from the
      // list projection the same way `steps` already does — see
      // `stores/logs.ts`'s `LOG_LIST_COLUMNS` comment for the reason.
      // RC-2/RC-3 wave: `machineSummary` joins them (same size-based
      // exclusion; `machineWorkSeconds`/`machineWorkMeters` stay, same
      // idiom as the RC-1 pair). RC-5 §3, Task 4: ONE scalar comes back
      // OUT of the excluded blob — `machineAvgPaceSecondsPer500m`, mirrors
      // the real store's `jsonb_typeof`-gated cast (`LOG_LIST_COLUMNS`'s
      // own comment): a non-numeric stored value reads back `null`
      // rather than this fake throwing, matching the real store's own
      // "never break the whole list over one bad row" contract.
      // Door spec (2026-09-02) §1.3, Task 4: a SECOND derived key comes
      // out of an excluded column — `partial`, the four PARTIAL clauses
      // evaluated over the `steps` this projection drops. Real Postgres
      // defines truth (`LOG_LIST_COLUMNS`'s `coalesce(... exists ...)`);
      // this is the fake's honest re-statement of it, and the four
      // `describeStoreContracts` "list rows carry partial" cases run
      // against BOTH stores so the two cannot drift. Clause 4 is a value
      // ALLOWLIST, never `!== "finished"`: `endedBy` is nullable and a
      // negation would mark every legacy row partial.
      return source
        .slice(0, limit)
        .map(
          ({ steps, series: _series, machineSummary, seq: _seq, ...rest }) => ({
            ...rest,
            machineAvgPaceSecondsPer500m:
              typeof machineSummary?.avgPaceSecondsPer500m === "number"
                ? machineSummary.avgPaceSecondsPer500m
                : null,
            partial:
              rest.source === "pm5" &&
              steps.length > 0 &&
              PARTIAL_ENDED_BY.some((r) => r === rest.endedBy) &&
              steps.some((s) => s.actualSource === undefined),
          }),
        );
    },
    // From-the-log spec (2026-08-18), §3: full row (steps included),
    // owner-scoped by construction — `byUser.get(userId)` can never see
    // another user's rows at all, the same structural guarantee the real
    // store's `WHERE user_id = $userId` gives.
    async get(userId: string, id: string) {
      const rows = byUser.get(userId) ?? [];
      const found = rows.find((r) => r.id === id);
      if (!found) return null;
      const { seq: _seq, ...row } = found;
      return row;
    },
    // From-the-log spec (2026-08-18), §3: mirrors the real store's `"key"
    // in patch` presence check (LogPatch's own doc comment) — an absent
    // key leaves the existing value untouched, present-and-null clears
    // it. Owner-scoped the same way `get()` above is.
    async update(userId: string, id: string, patch: LogPatch) {
      const rows = byUser.get(userId) ?? [];
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      const existing = rows[idx];
      const updated = { ...existing };
      if ("thumbs" in patch) updated.thumbs = patch.thumbs ?? null;
      if ("held" in patch) updated.held = patch.held ?? null;
      if ("pain" in patch) updated.pain = patch.pain ?? null;
      if ("notes" in patch) updated.notes = patch.notes ?? null;
      rows[idx] = updated;
      byUser.set(userId, rows);
      const { seq: _seq, ...row } = updated;
      return row;
    },
    // From-the-log spec (2026-08-18), §3: newest-wins per plan_index,
    // mirroring the real store's `DISTINCT ON (plan_index) ... ORDER BY
    // plan_index, logged_at DESC, id DESC` — including the `id DESC`
    // tiebreak, which `resolveNewestFakeLink`'s own comment explains.
    //
    // Provenance is resolved here rather than in that helper because only
    // this closure holds the workouts store: `get` checks the globals
    // first and then the caller's own rows, which is the same reachable
    // set the real LEFT JOIN can match (a log's `workoutId` only ever
    // points at a global or at its own owner's row). A miss — the workout
    // was deleted, or the log never carried an id — is null, which means
    // UNKNOWN provenance and never "personal".
    async listPlanLinks(userId: string, planKey: string) {
      const rows = byUser.get(userId) ?? [];
      const winners = resolveNewestFakeLink(rows, planKey);
      const resolved: PlanLink[] = [];
      for (const winner of winners) {
        const { workoutId, ...link } = winner;
        const workout =
          workoutId === null ? null : await workouts.get(userId, workoutId);
        resolved.push({
          ...link,
          // `session_logs.workout_id` is ON DELETE SET NULL in Postgres;
          // this fake's `workouts.remove` never reaches the log rows, so
          // the FK is answered here instead: a stored id whose workout is
          // gone reads back null, the way the real column already does.
          // (`list`/`get` still hand back the stale id — a pre-existing
          // gap this projection does not widen.)
          workoutId: workout === null ? null : workoutId,
          // Both halves of identity move together — null with no joined
          // row, the row's own pair otherwise. Mirrors the real store's
          // `workoutRowId === null` guard.
          linkedTitle: workout === null ? null : workout.title,
          workoutIsGlobal: workout === null ? null : workout.isGlobal,
        });
      }
      return resolved.sort((a, b) => a.planIndex - b.planIndex);
    },

    // Log-delete spec (2026-08-18), §2: mirrors the real store's
    // delete() exactly (see that method's own comment in stores/logs.ts
    // for the full rationale) — newest-wins (condition 3) is resolved
    // via `resolveNewestFakeLink` BEFORE the row is spliced out (it
    // stops being a candidate for its own index the moment it's gone),
    // and conditions 1+2 (current plan key, terminal index) are never
    // pre-checked here: they live entirely in `planState._decrementIfCurrent`,
    // the fake's stand-in for the real UPDATE's own WHERE clause, so
    // `unCounted` is exactly that call's return value.
    async delete(userId: string, id: string) {
      const rows = byUser.get(userId) ?? [];
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) {
        return { deleted: false, unCounted: false };
      }
      const target = rows[idx];

      let isNewestWinsHolder = false;
      if (target.planKey !== null && target.planIndex !== null) {
        const [newest] = resolveNewestFakeLink(
          rows,
          target.planKey,
          target.planIndex,
        );
        isNewestWinsHolder = newest?.id === id;
      }

      rows.splice(idx, 1);
      byUser.set(userId, rows);

      if (
        target.planKey === null ||
        target.planIndex === null ||
        !isNewestWinsHolder
      ) {
        return { deleted: true, unCounted: false };
      }

      const unCounted = planState._decrementIfCurrent(
        userId,
        target.planKey as PlanKey,
        target.planIndex + 1,
      );
      return { deleted: true, unCounted };
    },
    async count(userId: string) {
      return (byUser.get(userId) ?? []).length;
    },
    async create(userId: string, input: LogInput) {
      const rows = byUser.get(userId) ?? [];
      // Fix round 2 (whole-branch review, L2): `advancesPlan` is destructured
      // OUT rather than spread into the stored row. It's an input-only flag
      // (stores/logs.ts's own `create` uses it purely to gate the plan_state
      // upsert; the real `sessionLogs` table has no `advances_plan` column at
      // all), so the real store's `list` can never return it. Spreading the
      // whole `input` here used to leak it into this fake's `list` (and thus
      // `GET /api/logs`) — a shape production can never produce.
      const { advancesPlan, ...stored } = input;

      // From-the-log spec (2026-08-18), §2: mirrors the real store's
      // reordered create() — the plan_state bump runs FIRST (still gated
      // by `advancesPlan`, exactly like the guard below used to run
      // AFTER) so its returned {doneN, planKey} can be stamped onto the
      // row this call stores, exactly like the real transaction's
      // `.returning()`. Both fields stay null when this save doesn't
      // advance the plan, or when it does but the counter moved with no
      // plan chosen (returned planKey null).
      let planKey: string | null = null;
      let planIndex: number | null = null;
      // Substitution spec (2026-09-02): mirrors the real store's PLAN
      // DEFAULT (`stores/logs.ts`'s `create`) — an absent flag resolves,
      // once, to "advance unless this is a free row"; a free row advances
      // only when asked. Kept in step by the shared contract suite rather
      // than by this comment: `storeContracts.ts` runs the twelve-row
      // truth table (four pairs × true/false/absent) against BOTH
      // implementations, which is the only thing that can catch this fake
      // and the real store disagreeing.
      const advances =
        advancesPlan ?? !isFreeRow(input.workoutId, input.workoutType);
      if (advances) {
        const advanced = planState._advance(userId);
        if (advanced.planKey !== null) {
          planKey = advanced.planKey;
          planIndex = advanced.doneN - 1;
        }
      }

      // Post-workout-summary spec (2026-08-17), §3: mirrors the real
      // store's `thumbs: input.thumbs ?? null` (stores/logs.ts's own
      // `create`) — `thumbs` is OPTIONAL on `LogInput` (absent means
      // "not provided", same as `deviceName`), but the real column always
      // reads back either a real value or null, never an absent key.
      // Spreading `stored` as-is would leave the key off the row entirely
      // when the caller omitted it, a shape the real store can never
      // produce — the exact class of fake/real drift this contract suite
      // exists to catch. The three hero fields (2026-08-18) get the same
      // treatment.
      const row = {
        ...stored,
        thumbs: stored.thumbs ?? null,
        avgSplitSeconds: stored.avgSplitSeconds ?? null,
        timeSeconds: stored.timeSeconds ?? null,
        distanceMeters: stored.distanceMeters ?? null,
        series: stored.series ?? null,
        // Phase LL Task 4: same "absent means the real column reads back
        // null, never a missing key" treatment as `thumbs`/`series` above.
        endedBy: stored.endedBy ?? null,
        // RC-1 (storage-spine design spec §3): same treatment, four more
        // fields.
        workSeconds: stored.workSeconds ?? null,
        workMeters: stored.workMeters ?? null,
        restSeconds: stored.restSeconds ?? null,
        restMeters: stored.restMeters ?? null,
        // RC-2/RC-3 wave (migration 0016): same treatment, three more
        // fields.
        machineWorkSeconds: stored.machineWorkSeconds ?? null,
        machineWorkMeters: stored.machineWorkMeters ?? null,
        machineSummary: stored.machineSummary ?? null,
        // Wave E PR1 (migration 0018): same treatment. `c2ResultId`/
        // `c2UserId` are deliberately absent here — they're not on
        // `LogInput` at all yet (see that interface's own comment), so
        // this fake never produces them, matching every current caller
        // of the real store, which also never sets them.
        completedAt: stored.completedAt ?? null,
        tz: stored.tz ?? null,
        // Wave E PR1 Task 6: server-written only (see `FakeLogRow`'s own
        // comment) — every row this fake's `create()` produces starts with
        // both null, matching the real store's `create()`, which never
        // sets either column either.
        c2ResultId: null,
        c2UserId: null,
        planKey,
        planIndex,
        id: crypto.randomUUID(),
        loggedAt: new Date(),
        seq: (logsInsertionSeq += 1),
      };
      rows.unshift(row);
      byUser.set(userId, rows);
      return { id: row.id };
    },
    async lastDonePerWorkout(userId: string) {
      const result: Record<string, number> = {};
      for (const row of byUser.get(userId) ?? []) {
        if (row.workoutId) result[row.workoutId] = 0;
      }
      return result;
    },
    // Wave E PR1 Task 6: mirrors the real store's owner-scoped UPDATE
    // (stores/logs.ts's own comment) — a foreign or absent id writes
    // nothing and returns false, the same "row deleted concurrently" seam
    // the route's 502 branch is keyed on.
    async recordC2Result(
      userId: string,
      id: string,
      c2ResultId: number,
      c2UserId: number,
    ) {
      const rows = byUser.get(userId) ?? [];
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return false;
      rows[idx] = { ...rows[idx], c2ResultId, c2UserId };
      byUser.set(userId, rows);
      return true;
    },
    // Wave E PR1 Task 6, plan deviation 2: mirrors the real store's
    // `tz IS NULL` guard (stores/logs.ts's own comment) — a row that
    // already carries a tz is left untouched, never overwritten.
    // Mirrors the real store's return-the-effective-zone contract
    // (stores/logs.ts's own comment) — a blocked write reports whatever's
    // actually stored, never `void`.
    async recordTz(userId: string, id: string, tz: string): Promise<string> {
      const rows = byUser.get(userId) ?? [];
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return tz;
      // `?? tz` only ever guards TS's optional-property widening
      // (`LogInput.tz` is `tz?: ...`) — `create()` always stamps a real
      // `string | null`, never leaves the key absent.
      if (rows[idx].tz !== null) return rows[idx].tz ?? tz;
      rows[idx] = { ...rows[idx], tz };
      byUser.set(userId, rows);
      return tz;
    },
  } as unknown as LogsStore;
}

// put() is plain (not vi.fn-wrapped) for the same reason as planState above:
// tests that need to prove the empty-patch guard short-circuits BEFORE the
// store is touched spy on it per-test via `vi.spyOn(stores.preferences,
// "put")`.
function makeFakePreferencesStore(): PreferencesStore {
  const rows = new Map<string, PreferencesRow>();
  return {
    async get(userId: string) {
      return rows.get(userId) ?? { ...PREFERENCES_DEFAULTS };
    },
    async put(userId: string, patch: PreferencesPatch) {
      // Real regression (see storeContracts.ts): an empty patch reaches the
      // real store's `onConflictDoUpdate({ set: patch })` with nothing in
      // `set`, which Postgres rejects outright. A plain `{...current,
      // ...patch}` merge can't reproduce that on its own, so it's asserted
      // explicitly here.
      if (Object.keys(patch).length === 0) {
        throw new Error("empty patch: no columns to set");
      }
      const current = rows.get(userId) ?? { ...PREFERENCES_DEFAULTS };
      rows.set(userId, { ...current, ...patch });
    },
  } as unknown as PreferencesStore;
}

function makeFakeTestHistoryStore(): TestHistoryStore {
  const byUser = new Map<
    string,
    Array<{
      id: string;
      distance: "2k" | "6k";
      splitSeconds: number;
      deltaSeconds: number | null;
      sessionLogId: string | null;
    }>
  >();
  return {
    async list(userId: string) {
      return byUser.get(userId) ?? [];
    },
    async append(
      userId: string,
      input: {
        distance: "2k" | "6k";
        splitSeconds: number;
        sessionLogId?: string;
      },
    ) {
      const rows = byUser.get(userId) ?? [];
      // Phase BL PR B: mirrors the real store's sessionLogId idempotency
      // (stores/testHistory.ts — pre-check plus the column's UNIQUE
      // constraint): a keyed repeat returns the ORIGINAL row; keyless
      // appends keep the historical no-dedupe behaviour. The contract
      // suite pins both arms against both backends.
      if (input.sessionLogId !== undefined) {
        const existing = rows.find(
          (r) => r.sessionLogId === input.sessionLogId,
        );
        if (existing) return existing;
      }
      const previous = [...rows]
        .reverse()
        .find((r) => r.distance === input.distance);
      const row = {
        id: crypto.randomUUID(),
        distance: input.distance,
        splitSeconds: input.splitSeconds,
        deltaSeconds: previous
          ? input.splitSeconds - previous.splitSeconds
          : null,
        sessionLogId: input.sessionLogId ?? null,
      };
      rows.push(row);
      byUser.set(userId, rows);
      return row;
    },
  } as unknown as TestHistoryStore;
}

// Mirrors the real store's idempotency semantics (app/server/stores/
// articleReads.ts): a repeated markRead for the same user+slug is a no-op,
// same as the real store's onConflictDoNothing.
function makeFakeArticleReadsStore(): ArticleReadsStore {
  const byUser = new Map<string, Set<string>>();
  return {
    async list(userId: string) {
      return [...(byUser.get(userId) ?? new Set<string>())];
    },
    async markRead(userId: string, slug: string) {
      let slugs = byUser.get(userId);
      if (!slugs) {
        slugs = new Set();
        byUser.set(userId, slugs);
      }
      slugs.add(slug);
    },
    // Idempotent: unmarking a slug never read (or already unmarked) is a
    // no-op, mirroring the real store's DELETE ... WHERE (matches zero rows
    // silently).
    async unmarkRead(userId: string, slug: string) {
      byUser.get(userId)?.delete(slug);
    },
  } as unknown as ArticleReadsStore;
}

// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD):
// mirrors `stores/concept2.ts`'s `createConcept2Store` signature EXACTLY
// (`routes/concept2.test.ts` consumes this fake). Deliberately NOT part of
// `makeFakeStores`/`Stores` — the concept2 router takes its own store dep.
//
// `withLinkLock`'s serialization is a per-user promise-chain gate, not a
// real lock: each call first awaits the PREVIOUS call's gate for the same
// userId, then installs its OWN gate (resolved in a `finally`, so a
// throwing `fn` still releases the next caller) before doing any work.
// This reproduces the real store's observable guarantee — two overlapping
// calls for the same user never interleave their read-decide-write — but
// cannot prove real row-locking the way `concept2.integration.test.ts`'s
// `FOR UPDATE` case does; that test exists precisely because no fake can
// stand in for it.
//
// PR1.75a: the two unique constraints migration 0021 added are mirrored
// here as the same typed errors the real store throws
// (`AttemptNonceCollisionError` on a nonce held by another user's row,
// `Concept2LinkConflictError` on a c2UserId held by another user's link),
// and `createAttempt` is the same one-row-per-user REPLACE the real upsert
// is. The concurrent-mint invariant itself is only provable on real
// Postgres (the integration test) — a Map cannot race.
//
// `clock` is injectable so a caller can control `consumeAttemptFor`'s and
// `deleteExpiredAttempts`' notion of "now" without a real sleep — the real
// store instead computes elapsed time in SQL against Postgres's own
// `now()`, which a unit test has no equivalent lever for.
export function makeFakeConcept2Store(
  clock: () => Date = () => new Date(),
): Concept2Store {
  const links = new Map<string, Concept2Link>();
  const attempts = new Map<string, NewConcept2Attempt & { createdAt: Date }>();
  const gates = new Map<string, Promise<void>>();

  return {
    async getLink(userId: string) {
      return links.get(userId) ?? null;
    },

    // Same posture as the real store: `needsReauthAt` is cleared on EVERY
    // upsert, insert or replace alike — a successful relink IS the
    // recovery (schema.ts's own `needsReauthAt` comment). D1: a c2UserId
    // already held by a DIFFERENT user is the real store's unique
    // violation, thrown as the same typed error.
    async upsertLink(userId, link) {
      for (const [otherUserId, other] of links) {
        if (otherUserId !== userId && other.c2UserId === link.c2UserId) {
          throw new Concept2LinkConflictError();
        }
      }
      const existing = links.get(userId);
      const now = clock();
      links.set(userId, {
        userId,
        c2UserId: link.c2UserId,
        accessToken: link.accessToken,
        refreshToken: link.refreshToken,
        expiresAt: link.expiresAt,
        weightClass: link.weightClass,
        needsReauthAt: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },

    async deleteLink(userId: string) {
      links.delete(userId);
    },

    async withLinkLock(userId, fn) {
      const previousGate = gates.get(userId) ?? Promise.resolve();
      let releaseGate: () => void = () => {};
      const ownGate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      gates.set(userId, ownGate);

      await previousGate;
      try {
        const current = links.get(userId) ?? null;
        const outcome = await fn(current);

        if (outcome.action === "store") {
          const existing = links.get(userId);
          if (existing) {
            // Controller ruling R2 (task-6-brief.md): mirrors the real
            // store's own `needsReauthAt: null` on a successful refresh
            // (concept2.ts's own comment on this branch).
            links.set(userId, {
              ...existing,
              accessToken: outcome.tokens.accessToken,
              refreshToken: outcome.tokens.refreshToken,
              expiresAt: outcome.tokens.expiresAt,
              needsReauthAt: null,
              updatedAt: clock(),
            });
          }
        } else if (outcome.action === "flagReauth") {
          const existing = links.get(userId);
          if (existing) {
            links.set(userId, { ...existing, needsReauthAt: clock() });
          }
        }
        // "none": no write.

        return outcome.result;
      } finally {
        releaseGate();
      }
    },

    // One row per user, REPLACED on every mint (the real store's ON
    // CONFLICT (user_id) DO UPDATE). A nonce already held by ANOTHER
    // user's row is the real store's PK violation.
    async createAttempt(a: NewConcept2Attempt) {
      const holder = attempts.get(a.nonce);
      if (holder && holder.userId !== a.userId) {
        throw new AttemptNonceCollisionError();
      }
      for (const [nonce, row] of attempts) {
        if (row.userId === a.userId) attempts.delete(nonce);
      }
      attempts.set(a.nonce, { ...a, createdAt: clock() });
    },

    async peekAttempt(nonce: string): Promise<PeekedConcept2Attempt | null> {
      const row = attempts.get(nonce);
      if (!row) return null;
      return {
        userId: row.userId,
        weightClass: row.weightClass,
        surface: row.surface,
      };
    },

    // The real store's single conditional DELETE: the row is removed ONLY
    // when all three predicates hold; freshness is reported, never gated
    // on (see `concept2.ts`'s own `consumeAttemptFor` comment).
    async consumeAttemptFor(
      nonce: string,
      userId: string,
      surface: LinkSurface,
      maxAgeMs: number,
    ): Promise<ConsumedConcept2Attempt | null> {
      const row = attempts.get(nonce);
      if (!row || row.userId !== userId || row.surface !== surface) {
        return null;
      }
      attempts.delete(nonce);
      const ageMs = clock().getTime() - row.createdAt.getTime();
      return { weightClass: row.weightClass, fresh: ageMs <= maxAgeMs };
    },

    async deleteExpiredAttempts(maxAgeMs: number) {
      const now = clock().getTime();
      for (const [nonce, row] of attempts) {
        if (now - row.createdAt.getTime() > maxAgeMs) {
          attempts.delete(nonce);
        }
      }
    },
  };
}

/** Complete per-user in-memory implementation of all seven data-router stores. */
export function makeFakeStores(): Stores {
  const planState = makeFakePlanStateStore();
  const workouts = makeFakeWorkoutsStore();
  return {
    baselines: makeFakeBaselinesStore(),
    workouts,
    logs: makeFakeLogsStore(planState, workouts),
    planState,
    preferences: makeFakePreferencesStore(),
    testHistory: makeFakeTestHistoryStore(),
    articleReads: makeFakeArticleReadsStore(),
  };
}

// ---------------------------------------------------------------------------
// Auth-test fakes: unlike the data-router stores above, auth tests assert on
// call counts/args in nearly every test, so these stay fully vi.fn-wrapped
// by default. Pass overrides for the specific returns a test needs.
// ---------------------------------------------------------------------------

export function makeFakeSessions(
  overrides: Partial<SessionStore> = {},
): SessionStore {
  return {
    createSession: vi.fn(async () => ({
      token: "tok",
      expiresAt: new Date(Date.now() + 1_000_000),
    })),
    resolveSession: vi.fn(async () => null),
    deleteSession: vi.fn(async () => {}),
    sweepExpired: vi.fn(async () => {}),
    ...overrides,
  } as unknown as SessionStore;
}

export function makeFakeUsers(overrides: Partial<UserStore> = {}): UserStore {
  return {
    findByGoogleSub: vi.fn(async () => null),
    createUser: vi.fn(async () => null),
    updateProfile: vi.fn(async () => {}),
    ...overrides,
  } as unknown as UserStore;
}
