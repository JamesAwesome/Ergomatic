import { describe, expect, it } from "vitest";
import type { WorkoutType } from "../../../domain/types.js";
import type { BaselinesStore } from "../baselines.js";
import type { LogInput, LogsStore } from "../logs.js";
import type { PlanStateStore } from "../planState.js";
import { PREFERENCES_DEFAULTS, type PreferencesStore } from "../preferences.js";
import type { TestDistance, TestHistoryStore } from "../testHistory.js";
import type { NewWorkoutInput, WorkoutsStore } from "../workouts.js";

// ---------------------------------------------------------------------------
// One suite-of-suites, run against BOTH the real (Postgres-backed) stores and
// the in-memory fakes. Real behavior is the specification: any case that
// doesn't match what the real stores do gets fixed HERE, not by changing the
// store under test. See contracts.real.integration.test.ts (run first, to
// prove the cases themselves are honest) and contracts.fake.test.ts (proves
// the fakes mirror that truth).
// ---------------------------------------------------------------------------

export interface SeededGlobalWorkout {
  id: string;
  sortOrder: number | null;
  title: string;
}

export interface StoresUnderTest {
  baselines: BaselinesStore;
  workouts: WorkoutsStore;
  logs: LogsStore;
  planState: PlanStateStore;
  preferences: PreferencesStore;
  testHistory: TestHistoryStore;
  /**
   * Registers a brand-new user and returns its id (real: inserts into
   * `users`; fake: mints and remembers an id). Every case below starts from
   * a fresh user nobody else has touched, so userId-scoping can be asserted
   * without cross-case interference or import-order coupling.
   */
  makeUser: () => Promise<string>;
  /**
   * Seeds a global (`userId: null`) workout row, exactly like
   * `seedGlobalLibrary` does at boot against Postgres (see
   * app/server/seed/seed.ts). The public `WorkoutsStore` surface
   * intentionally has no route from a caller to create a global — only
   * tests reach in this way (mirrors the `_seedGlobal` seam already used by
   * server/routes/data.test.ts).
   */
  seedGlobalWorkout: (input: NewWorkoutInput) => Promise<SeededGlobalWorkout>;
}

function workoutInput(
  overrides: Partial<NewWorkoutInput> = {},
): NewWorkoutInput {
  return {
    title: "Steady state",
    type: "AT",
    difficulty: "medium",
    pain: 2,
    steps: [{ k: "wu", minutes: 10 }],
    source: "user",
    ...overrides,
  };
}

function logInput(overrides: Partial<LogInput> = {}): LogInput {
  return {
    workoutId: null,
    workoutTitle: "Frozen title",
    workoutType: "AN",
    baselineK2: null,
    baselineK6: null,
    held: "held",
    pain: 2,
    notes: null,
    steps: [],
    // Task 3: true is the pre-Task-3 behavior every existing case in this
    // suite already assumes (every log here bumps done_n) — cases that
    // exercise the new `false` arm override it explicitly.
    advancesPlan: true,
    ...overrides,
  };
}

export function describeStoreContracts(
  makeStores: () => Promise<StoresUnderTest>,
  opts: { label: string },
) {
  describe(`store contracts (${opts.label})`, () => {
    describe("baselines", () => {
      it("get returns null before any put", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        expect(await stores.baselines.get(userId)).toBeNull();
      });

      it("put then get round-trips", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.baselines.put(userId, {
          k2Seconds: 420,
          k6Seconds: 1500,
        });
        expect(await stores.baselines.get(userId)).toStrictEqual({
          k2Seconds: 420,
          k6Seconds: 1500,
        });
      });

      it("a partial put preserves the other field", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.baselines.put(userId, { k2Seconds: 420 });
        await stores.baselines.put(userId, { k6Seconds: 1500 });
        expect(await stores.baselines.get(userId)).toStrictEqual({
          k2Seconds: 420,
          k6Seconds: 1500,
        });
      });
    });

    describe("preferences", () => {
      it("get returns spec defaults for a user with no prefs row", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        expect(await stores.preferences.get(userId)).toStrictEqual(
          PREFERENCES_DEFAULTS,
        );
      });

      it("put upserts a partial patch and get reflects the merge", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.preferences.put(userId, { accentColor: "#00ff00" });
        expect(await stores.preferences.get(userId)).toMatchObject({
          accentColor: "#00ff00",
          timeCapMinutes: PREFERENCES_DEFAULTS.timeCapMinutes,
        });
        await stores.preferences.put(userId, { timeCapMinutes: 45 });
        expect(await stores.preferences.get(userId)).toMatchObject({
          accentColor: "#00ff00",
          timeCapMinutes: 45,
        });
      });

      it("empty patch throws — the 2026-07-28 empty-update regression", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await expect(stores.preferences.put(userId, {})).rejects.toThrow();
      });
    });

    describe("workouts", () => {
      it("create/list/get round-trip, decorated isGlobal: false", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const created = await stores.workouts.create(
          userId,
          workoutInput({ title: "Row one" }),
        );
        expect(created).toMatchObject({
          title: "Row one",
          isGlobal: false,
        });

        const fetched = await stores.workouts.get(userId, created.id);
        expect(fetched).toMatchObject({ id: created.id, isGlobal: false });

        const list = await stores.workouts.list(userId);
        expect(list.some((w) => w.id === created.id)).toBe(true);
      });

      // Ordering is `sort_order ASC, created_at ASC`. Postgres puts NULLs
      // last for ASC by default, so authored globals (which carry a
      // sort_order) lead, and everything without one — every personal row —
      // follows in creation order. The real suite shares one database across
      // cases, so the assertion filters to this case's own four rows: what
      // is under test is their RELATIVE order, which unrelated rows can't
      // change.
      it("lists globals in their authored order, then personal rows by creation (2026-07-30: num retired)", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.workouts.createMany(null, [
          workoutInput({ title: "Ordering Global Two", sortOrder: 2 }),
          workoutInput({ title: "Ordering Global One", sortOrder: 1 }),
        ]);
        await stores.workouts.create(
          userId,
          workoutInput({ title: "Ordering Mine First" }),
        );
        await stores.workouts.create(
          userId,
          workoutInput({ title: "Ordering Mine Second" }),
        );

        const listed = await stores.workouts.list(userId);

        expect(
          listed.map((w) => w.title).filter((t) => t.startsWith("Ordering ")),
        ).toStrictEqual([
          "Ordering Global One",
          "Ordering Global Two",
          "Ordering Mine First",
          "Ordering Mine Second",
        ]);
      });

      it("accepts two personal workouts with the same title and no number", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.workouts.create(userId, workoutInput({ title: "Twice" }));
        await expect(
          stores.workouts.create(userId, workoutInput({ title: "Twice" })),
        ).resolves.toMatchObject({ title: "Twice" });
      });

      it("update against a global id cannot touch it: returns null, row unchanged", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const g = await stores.seedGlobalWorkout(
          workoutInput({ title: "Global Immutable" }),
        );
        const result = await stores.workouts.update(
          userId,
          g.id,
          workoutInput({ title: "Hijacked" }),
        );
        expect(result).toBeNull();
        const stillThere = await stores.workouts.get(userId, g.id);
        expect(stillThere).toMatchObject({
          title: "Global Immutable",
          isGlobal: true,
        });
      });

      it("remove against a global id cannot touch it: row still present afterward", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const g = await stores.seedGlobalWorkout(
          workoutInput({ title: "Global Survivor" }),
        );
        await stores.workouts.remove(userId, g.id);
        const stillThere = await stores.workouts.get(userId, g.id);
        expect(stillThere).toMatchObject({
          title: "Global Survivor",
          isGlobal: true,
        });
      });

      it("non-UUID input throws — the 2026-07-28 22P02 regression", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await expect(
          stores.workouts.get(userId, "not-a-uuid"),
        ).rejects.toThrow();
      });

      it("is invisible across users: list and get see nothing", async () => {
        const stores = await makeStores();
        const userA = await stores.makeUser();
        const userB = await stores.makeUser();
        const created = await stores.workouts.create(
          userA,
          workoutInput({ title: "Only visible to A" }),
        );
        expect(await stores.workouts.get(userB, created.id)).toBeNull();
        const listB = await stores.workouts.list(userB);
        expect(listB.some((w) => w.id === created.id)).toBe(false);
      });

      // count() is `where(eq(workouts.userId, userId))` in the real store —
      // a NULL user_id (a global) can never satisfy `= $userId`, so globals
      // are structurally excluded, not filtered out by an extra check.
      it("count reflects personal workouts only, excluding globals", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        expect(await stores.workouts.count(userId)).toBe(0);
        await stores.workouts.create(
          userId,
          workoutInput({ title: "Personal for count" }),
        );
        expect(await stores.workouts.count(userId)).toBe(1);
        await stores.seedGlobalWorkout(
          workoutInput({ title: "Global for count" }),
        );
        expect(await stores.workouts.count(userId)).toBe(1);
      });

      it("listGlobals returns seeded globals and excludes personal rows", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const g = await stores.seedGlobalWorkout(
          workoutInput({ title: "Global Listed" }),
        );
        await stores.workouts.create(
          userId,
          workoutInput({ title: "Personal Not Listed" }),
        );
        const globals = await stores.workouts.listGlobals();
        expect(globals.some((w) => w.id === g.id)).toBe(true);
        expect(globals.some((w) => w.title === "Personal Not Listed")).toBe(
          false,
        );
      });

      it("countGlobals matches listGlobals().length", async () => {
        const stores = await makeStores();
        const before = await stores.workouts.countGlobals();
        await stores.seedGlobalWorkout(
          workoutInput({ title: "Global Counted" }),
        );
        const after = await stores.workouts.countGlobals();
        expect(after).toBe(before + 1);
        expect(after).toBe((await stores.workouts.listGlobals()).length);
      });

      // Task 9: deleteGlobals is the seed-reconcile's swap primitive (see
      // app/server/seed/seed.ts, Task 10) — it must clear every global row
      // and leave personal rows completely untouched.
      it("deleteGlobals empties the global library and leaves personal workouts alone", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.workouts.createMany(null, [
          workoutInput({ title: "Global One" }),
          workoutInput({ title: "Global Two" }),
        ]);
        const personal = await stores.workouts.create(
          userId,
          workoutInput({ title: "Mine, Survives" }),
        );

        await stores.workouts.deleteGlobals();

        expect(await stores.workouts.countGlobals()).toBe(0);
        expect(await stores.workouts.get(userId, personal.id)).toMatchObject({
          title: "Mine, Survives",
          isGlobal: false,
        });
      });

      // createMany is one transaction in the real store. There are no num
      // clashes left to trigger a rollback, so the guarantee is proved with a
      // genuine failure instead: an out-of-enum `type`, which Postgres
      // rejects mid-statement.
      it("createMany rolls back the whole batch when one input is rejected", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await expect(
          stores.workouts.createMany(userId, [
            workoutInput({ title: "Batch one" }),
            workoutInput({
              title: "Batch invalid",
              type: "NOPE" as WorkoutType,
            }),
          ]),
        ).rejects.toThrow();
        const list = await stores.workouts.list(userId);
        expect(list.some((w) => w.title === "Batch one")).toBe(false);
      });
    });

    describe("logs", () => {
      it("create bumps plan_state.done_n atomically, verified via planState.get", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        expect(await stores.planState.get(userId)).toBeNull();
        await stores.logs.create(userId, logInput());
        expect(await stores.planState.get(userId)).toStrictEqual({
          planKey: null,
          doneN: 1,
        });
        await stores.logs.create(userId, logInput());
        expect(await stores.planState.get(userId)).toStrictEqual({
          planKey: null,
          doneN: 2,
        });
      });

      // Task 3: `advancesPlan: false` skips ONLY the plan_state upsert —
      // the log row itself is still created either way (proved via
      // `list`, not just the return value, since a failed insert would
      // never reach the return statement at all).
      it("create with advancesPlan:false still inserts the log but leaves plan_state untouched", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        expect(await stores.planState.get(userId)).toBeNull();

        const { id } = await stores.logs.create(
          userId,
          logInput({ advancesPlan: false }),
        );

        // No plan_state row is created at all — not even one pinned at 0 —
        // for a user who had none before this call.
        expect(await stores.planState.get(userId)).toBeNull();
        const list = await stores.logs.list(userId, 10);
        expect(list.some((row) => row.id === id)).toBe(true);
      });

      it("create with advancesPlan:false leaves an EXISTING plan_state row's done_n unchanged", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.logs.create(userId, logInput());
        expect(await stores.planState.get(userId)).toStrictEqual({
          planKey: null,
          doneN: 1,
        });

        await stores.logs.create(userId, logInput({ advancesPlan: false }));
        expect(await stores.planState.get(userId)).toStrictEqual({
          planKey: null,
          doneN: 1,
        });
      });

      it("create with advancesPlan:true behaves exactly like the absent-field default", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.logs.create(userId, logInput({ advancesPlan: true }));
        expect(await stores.planState.get(userId)).toStrictEqual({
          planKey: null,
          doneN: 1,
        });
      });

      it("list is scoped per user", async () => {
        const stores = await makeStores();
        const userA = await stores.makeUser();
        const userB = await stores.makeUser();
        await stores.logs.create(userA, logInput());
        await stores.logs.create(userA, logInput());
        expect(await stores.logs.list(userA, 10)).toHaveLength(2);
        expect(await stores.logs.list(userB, 10)).toHaveLength(0);
      });

      it("count reflects created logs and is scoped per user", async () => {
        const stores = await makeStores();
        const userA = await stores.makeUser();
        const userB = await stores.makeUser();
        expect(await stores.logs.count(userA)).toBe(0);
        await stores.logs.create(userA, logInput());
        expect(await stores.logs.count(userA)).toBe(1);
        await stores.logs.create(userA, logInput());
        expect(await stores.logs.count(userA)).toBe(2);
        expect(await stores.logs.count(userB)).toBe(0);
      });

      it("lastDonePerWorkout groups by workout, excludes workout-less logs, and is scoped per user", async () => {
        const stores = await makeStores();
        const userA = await stores.makeUser();
        const userB = await stores.makeUser();
        const wA = await stores.workouts.create(
          userA,
          workoutInput({ title: "Grouped A" }),
        );
        const wB = await stores.workouts.create(
          userA,
          workoutInput({ title: "Grouped B" }),
        );
        await stores.logs.create(userA, logInput({ workoutId: null }));
        await stores.logs.create(userA, logInput({ workoutId: wA.id }));
        await stores.logs.create(userA, logInput({ workoutId: wB.id }));

        const map = await stores.logs.lastDonePerWorkout(userA);
        expect(Object.keys(map).sort()).toStrictEqual([wA.id, wB.id].sort());
        expect(await stores.logs.lastDonePerWorkout(userB)).toStrictEqual({});
      });
    });

    describe("plan state", () => {
      it("get returns null by default", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        expect(await stores.planState.get(userId)).toBeNull();
      });

      it("set zeroes doneN even when progress already exists", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.planState.set(userId, "sprint");
        await stores.logs.create(userId, logInput());
        expect(await stores.planState.get(userId)).toMatchObject({
          doneN: 1,
        });

        await stores.planState.set(userId, "head");
        expect(await stores.planState.get(userId)).toStrictEqual({
          planKey: "head",
          doneN: 0,
        });
      });

      it("reset zeroes doneN without changing the plan key", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.planState.set(userId, "sprint");
        await stores.logs.create(userId, logInput());

        await stores.planState.reset(userId);
        expect(await stores.planState.get(userId)).toStrictEqual({
          planKey: "sprint",
          doneN: 0,
        });
      });
    });

    describe("test history", () => {
      it("append computes delta against the same-distance prior entry", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const first = await stores.testHistory.append(userId, {
          distance: "2k" as TestDistance,
          splitSeconds: 420,
        });
        expect(first.deltaSeconds).toBeNull();

        const second = await stores.testHistory.append(userId, {
          distance: "2k" as TestDistance,
          splitSeconds: 410,
        });
        expect(second.deltaSeconds).toBe(-10);

        // a different distance does not interfere
        const otherDistance = await stores.testHistory.append(userId, {
          distance: "6k" as TestDistance,
          splitSeconds: 1500,
        });
        expect(otherDistance.deltaSeconds).toBeNull();
      });

      it("list is scoped per user", async () => {
        const stores = await makeStores();
        const userA = await stores.makeUser();
        const userB = await stores.makeUser();
        await stores.testHistory.append(userA, {
          distance: "2k" as TestDistance,
          splitSeconds: 400,
        });
        expect(await stores.testHistory.list(userA)).toHaveLength(1);
        expect(await stores.testHistory.list(userB)).toHaveLength(0);
      });
    });
  });
}
