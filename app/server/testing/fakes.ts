import { vi } from "vitest";
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
  type LogInput,
  type LogPatch,
  type LogsStore,
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
};

// Log-delete spec (2026-08-18), §2: the SAME newest-wins resolution
// `listPlanLinks` and `delete` (both below) share — one function, not two
// independently-hand-rolled copies of the tiebreak, mirroring the real
// store's `resolveNewestPlanLink` (stores/logs.ts). `planIndex`, when
// given, scopes to that one index (delete's own use — see that method).
function resolveNewestFakeLink(
  rows: FakeLogRow[],
  planKey: string,
  planIndex?: number,
): { planIndex: number; id: string }[] {
  const byIndex = new Map<
    number,
    { id: string; loggedAt: Date; seq: number }
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
        loggedAt: row.loggedAt,
        seq: row.seq,
      });
    }
  }
  return [...byIndex.entries()].map(([idx, v]) => ({
    planIndex: idx,
    id: v.id,
  }));
}

function makeFakeLogsStore(planState: FakePlanStateStore): LogsStore {
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
      return source
        .slice(0, limit)
        .map(({ steps: _steps, series: _series, seq: _seq, ...rest }) => rest);
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
    // plan_index, logged_at DESC` — ties on `loggedAt` (a real
    // possibility for this fake's plain `Date`, unlike real Postgres)
    // resolve by `seq`, the fake's own insertion-order tiebreak.
    async listPlanLinks(userId: string, planKey: string) {
      const rows = byUser.get(userId) ?? [];
      return resolveNewestFakeLink(rows, planKey).sort(
        (a, b) => a.planIndex - b.planIndex,
      );
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
      if (advancesPlan) {
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

/** Complete per-user in-memory implementation of all seven data-router stores. */
export function makeFakeStores(): Stores {
  const planState = makeFakePlanStateStore();
  return {
    baselines: makeFakeBaselinesStore(),
    workouts: makeFakeWorkoutsStore(),
    logs: makeFakeLogsStore(planState),
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
