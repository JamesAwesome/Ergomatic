import { vi } from "vitest";
import type { SessionStore } from "../auth/sessions.js";
import type { UserStore } from "../auth/users.js";
import type { WorkoutInput, WorkoutType } from "../../domain/types.js";
import { type Stores } from "../routes/data.js";
import type { BaselinesRow, BaselinesStore } from "../stores/baselines.js";
import type { LogInput, LogsStore } from "../stores/logs.js";
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
  const rows = new Map<string, BaselinesRow>();
  return {
    async get(userId: string) {
      return rows.get(userId) ?? null;
    },
    async put(
      userId: string,
      patch: { k2Seconds?: number | null; k6Seconds?: number | null },
    ) {
      const current = rows.get(userId) ?? { k2Seconds: null, k6Seconds: null };
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
    // Mirrors the real store's deleteGlobals (app/server/stores/workouts.ts):
    // wipes the global bucket only, never touches `byUser`.
    async deleteGlobals() {
      globals.clear();
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
  _advance: (userId: string, by?: number) => void;
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
    _advance(userId: string, by = 1) {
      const current = rows.get(userId) ?? { planKey: null, doneN: 0 };
      rows.set(userId, { ...current, doneN: current.doneN + by });
    },
  } as unknown as FakePlanStateStore;
}

function makeFakeLogsStore(planState: FakePlanStateStore): LogsStore {
  const byUser = new Map<
    string,
    Array<Omit<LogInput, "advancesPlan"> & { id: string; loggedAt: Date }>
  >();
  return {
    async list(userId: string, limit: number) {
      return (byUser.get(userId) ?? []).slice(0, limit);
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
      const row = { ...stored, id: crypto.randomUUID(), loggedAt: new Date() };
      rows.unshift(row);
      byUser.set(userId, rows);
      // Task 3: mirrors the real store's `if (input.advancesPlan)` guard
      // around the plan_state upsert (see stores/logs.ts's own `create`) —
      // a false row never touches plan_state at all, including never
      // creating a row for a user who had none yet.
      if (advancesPlan) planState._advance(userId);
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
    }>
  >();
  return {
    async list(userId: string) {
      return byUser.get(userId) ?? [];
    },
    async append(
      userId: string,
      input: { distance: "2k" | "6k"; splitSeconds: number },
    ) {
      const rows = byUser.get(userId) ?? [];
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
      };
      rows.push(row);
      byUser.set(userId, rows);
      return row;
    },
  } as unknown as TestHistoryStore;
}

/** Complete per-user in-memory implementation of all six data-router stores. */
export function makeFakeStores(): Stores {
  const planState = makeFakePlanStateStore();
  return {
    baselines: makeFakeBaselinesStore(),
    workouts: makeFakeWorkoutsStore(),
    logs: makeFakeLogsStore(planState),
    planState,
    preferences: makeFakePreferencesStore(),
    testHistory: makeFakeTestHistoryStore(),
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
