import { describe, expect, it } from "vitest";
import type { WorkoutType } from "../../../domain/types.js";
import type { ArticleReadsStore } from "../articleReads.js";
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

// Well-formed but guaranteed-absent from any backend (real Postgres or the
// in-memory fake) a fresh `makeStores()` call produces.
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

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
  articleReads: ArticleReadsStore;
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
    steps: [{ k: "r", minutes: 10 }],
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

      // Library-converge (2026-08-04 spec): the converge's update primitive.
      // Global-scoped and MAY write sortOrder — the exact inverse of the
      // user-scoped update()'s guarantees. A personal id must be
      // structurally unreachable.
      it("updateGlobal rewrites a global's content and sortOrder, and cannot touch a personal row", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const g = await stores.seedGlobalWorkout(
          workoutInput({ title: "Converge Me" }),
        );
        const personal = await stores.workouts.create(
          userId,
          workoutInput({ title: "Mine, Unmoved" }),
        );

        const updated = await stores.workouts.updateGlobal(g.id, {
          ...workoutInput({
            title: "Converge Me",
            difficulty: "hard",
            pain: 5,
          }),
          sortOrder: 7,
        });
        expect(updated).toMatchObject({
          id: g.id,
          title: "Converge Me",
          difficulty: "hard",
          pain: 5,
          sortOrder: 7,
          isGlobal: true,
        });

        const stolen = await stores.workouts.updateGlobal(personal.id, {
          ...workoutInput({ title: "Stolen" }),
          sortOrder: 1,
        });
        expect(stolen).toBeNull();
        expect(await stores.workouts.get(userId, personal.id)).toMatchObject({
          title: "Mine, Unmoved",
          isGlobal: false,
        });
      });

      // Library-converge: the converge's targeted delete. [] must be a
      // no-op, and a personal id in the list must be ignored, not deleted.
      it("deleteGlobalsByIds removes exactly the named globals, no-ops on [], ignores personal ids", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const before = await stores.workouts.countGlobals();
        const [doomed, spared] = await stores.workouts.createMany(null, [
          workoutInput({ title: "Doomed Global" }),
          workoutInput({ title: "Spared Global" }),
        ]);
        const personal = await stores.workouts.create(
          userId,
          workoutInput({ title: "Mine, Not Yours" }),
        );

        await stores.workouts.deleteGlobalsByIds([]);
        expect(await stores.workouts.countGlobals()).toBe(before + 2);

        await stores.workouts.deleteGlobalsByIds([doomed.id, personal.id]);
        expect(await stores.workouts.countGlobals()).toBe(before + 1);
        const titles = (await stores.workouts.listGlobals()).map(
          (g) => g.title,
        );
        expect(titles).toContain("Spared Global");
        expect(titles).not.toContain("Doomed Global");
        expect(spared.id).toBeTruthy();
        expect(await stores.workouts.get(userId, personal.id)).toMatchObject({
          title: "Mine, Not Yours",
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

      // Post-workout-summary spec (2026-08-17), §3: held/pain go nullable,
      // thumbs is a brand-new nullable column — create() must round-trip
      // null through to `list()` unchanged (not coerced to a default, not
      // dropped from the row).
      it("create round-trips held: null, pain: null, thumbs: null", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const { id } = await stores.logs.create(
          userId,
          logInput({ held: null, pain: null, thumbs: null }),
        );
        const list = await stores.logs.list(userId, 10);
        const row = list.find((r) => r.id === id);
        expect(row).toMatchObject({ held: null, pain: null, thumbs: null });
      });

      // thumbs is optional on LogInput (undefined ≠ explicit null on the
      // TYPE, but both must store identically) — an absent key must store
      // null the same way an explicit null does, mirroring `deviceName`'s
      // existing `?? null` convention in the real store's own `create`.
      it("create with thumbs omitted round-trips to null, same as an explicit null", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const overrides = logInput();
        // logInput()'s own spread never sets `thumbs` — deleting it here is
        // belt-and-braces against a future default creeping in.
        delete (overrides as { thumbs?: unknown }).thumbs;
        const { id } = await stores.logs.create(userId, overrides);
        const list = await stores.logs.list(userId, 10);
        const row = list.find((r) => r.id === id);
        expect(row).toMatchObject({ thumbs: null });
      });

      it("create round-trips thumbs: 'up' and thumbs: 'down'", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const { id: upId } = await stores.logs.create(
          userId,
          logInput({ thumbs: "up" }),
        );
        const { id: downId } = await stores.logs.create(
          userId,
          logInput({ thumbs: "down" }),
        );
        const list = await stores.logs.list(userId, 10);
        expect(list.find((r) => r.id === upId)).toMatchObject({
          thumbs: "up",
        });
        expect(list.find((r) => r.id === downId)).toMatchObject({
          thumbs: "down",
        });
      });

      // From-the-log spec (2026-08-18), §2: the three hero numbers must
      // round-trip through the REAL column type (double precision), not
      // just through a JS object — this is the B8 probe. Verified
      // independently against real Postgres (2026-08-18, docker
      // postgres:18.4) that the probe CAN go red: `SELECT
      // '2.7182818284'::real` returns `2.7182817` (float4 truncation),
      // while `SELECT '2.7182818284'::double precision` returns the value
      // unchanged — confirming a `real` column would fail this exact
      // assertion and proving `double precision` is required, not
      // decorative. That scratch verification is not committed as
      // product code; this assertion against the schema's actual double
      // precision columns is the permanent regression guard.
      it("create round-trips the three hero numbers exactly, including a value that would truncate under real (B8 probe)", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const { id } = await stores.logs.create(
          userId,
          logInput({
            avgSplitSeconds: 2.7182818284,
            timeSeconds: 3600.1234567891,
            distanceMeters: 5000,
          }),
        );
        const list = await stores.logs.list(userId, 10);
        const row = list.find((r) => r.id === id);
        expect(row).toMatchObject({
          avgSplitSeconds: 2.7182818284,
          timeSeconds: 3600.1234567891,
          distanceMeters: 5000,
        });
      });

      // Fix round 1 (task review, finding 3): `logInput()`'s own base
      // shape never sets avgSplitSeconds/timeSeconds/distanceMeters at all
      // (see the fixture's definition above) — the v0.11.0 body shape IS
      // `logInput()` with no overrides, so this needs no deletes.
      it("create with no hero numbers posted stores all three null (v0.11.0 body shape)", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        const { id } = await stores.logs.create(userId, logInput());
        const list = await stores.logs.list(userId, 10);
        const row = list.find((r) => r.id === id);
        expect(row).toMatchObject({
          avgSplitSeconds: null,
          timeSeconds: null,
          distanceMeters: null,
        });
      });

      // From-the-log spec (2026-08-18), §2 "the linkage mechanism": the
      // four cases the plan carries by name.
      describe("plan linkage", () => {
        it("an advancing save with a plan chosen stamps (planKey, planIndex)", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");

          const { id } = await stores.logs.create(userId, logInput());

          const list = await stores.logs.list(userId, 10);
          const row = list.find((r) => r.id === id);
          expect(row).toMatchObject({ planKey: "sprint", planIndex: 0 });
        });

        it("a non-advancing save stores planKey/planIndex null, even with a plan chosen", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");

          const { id } = await stores.logs.create(
            userId,
            logInput({ advancesPlan: false }),
          );

          const list = await stores.logs.list(userId, 10);
          const row = list.find((r) => r.id === id);
          expect(row).toMatchObject({ planKey: null, planIndex: null });
        });

        it("an advancing save with NO plan chosen stores planKey/planIndex null (counter moved, nothing named)", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          expect(await stores.planState.get(userId)).toBeNull();

          const { id } = await stores.logs.create(userId, logInput());

          const list = await stores.logs.list(userId, 10);
          const row = list.find((r) => r.id === id);
          expect(row).toMatchObject({ planKey: null, planIndex: null });
        });

        it("two sequential advancing saves stamp consecutive indexes", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "head");

          const first = await stores.logs.create(userId, logInput());
          const second = await stores.logs.create(userId, logInput());

          const list = await stores.logs.list(userId, 10);
          expect(list.find((r) => r.id === first.id)).toMatchObject({
            planKey: "head",
            planIndex: 0,
          });
          expect(list.find((r) => r.id === second.id)).toMatchObject({
            planKey: "head",
            planIndex: 1,
          });
        });
      });

      // From-the-log spec (2026-08-18), §3: the list projection explicitly
      // drops `steps` (zero client consumers — `RecentLog`, the response's
      // only reader, never carried it), while `get()` (the from-the-log
      // view's own fetch) keeps the full row.
      describe("list projection", () => {
        it("list rows never include steps", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.logs.create(
            userId,
            logInput({ steps: [{ label: "Work", targetSplit: 120 }] }),
          );
          const list = await stores.logs.list(userId, 10);
          expect(list[0]).not.toHaveProperty("steps");
        });

        it("get still returns the full row, steps included", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const { id } = await stores.logs.create(
            userId,
            logInput({ steps: [{ label: "Work", targetSplit: 120 }] }),
          );
          const row = await stores.logs.get(userId, id);
          expect(row).toMatchObject({
            steps: [{ label: "Work", targetSplit: 120 }],
          });
        });

        // Series capture spec (2026-08-19), §3: `series` joins `steps` in
        // the list projection's exclusion — same reason (dead weight for
        // a list row, zero client consumers there), same shape of proof.
        it("list rows never include series", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.logs.create(
            userId,
            logInput({
              series: { samples: [{ t: 10, d: 23, p: 140, spm: 24 }] },
            }),
          );
          const list = await stores.logs.list(userId, 10);
          expect(list[0]).not.toHaveProperty("series");
        });

        it("get still returns the full row, series included", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const series = { samples: [{ t: 10, d: 23, p: 140, spm: 24 }] };
          const { id } = await stores.logs.create(userId, logInput({ series }));
          const row = await stores.logs.get(userId, id);
          expect(row).toMatchObject({ series });
        });

        // Task 2 review, LOW 1: `LOG_LIST_COLUMNS` (stores/logs.ts) is a
        // hand-maintained mirror of `sessionLogs`' columns, minus `steps`
        // — nothing pinned it against drift before this test. A column
        // added to the schema later and forgotten here would silently
        // vanish from the list response with every other case in this
        // describe still green (they all assert PRESENCE/ABSENCE of
        // specific keys, never the full set). Comparing against `get()`'s
        // own key set (the real, un-projected row) means this pin tracks
        // the schema automatically — it never needs editing when a future
        // column is added, only when one is deliberately EXCLUDED again.
        // Series capture spec (2026-08-19), §3 "List projection": the
        // drift pin updates DELIBERATELY — `series` joins `steps` as the
        // second column the list projection excludes (a 720 KB
        // worst-case trace is the same dead weight for a list row that
        // `steps` already was), so this pin's own filter grows the
        // matching key, not the assertion shape.
        it("the list projection is exactly get()'s key set minus steps minus series — no column silently drops out", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const { id } = await stores.logs.create(
            userId,
            logInput({ steps: [{ label: "Work", targetSplit: 120 }] }),
          );
          const [listRow] = await stores.logs.list(userId, 10);
          const getRow = await stores.logs.get(userId, id);
          const expectedKeys = Object.keys(getRow!)
            .filter((k) => k !== "steps" && k !== "series")
            .sort();
          expect(Object.keys(listRow).sort()).toStrictEqual(expectedKeys);
        });
      });

      // From-the-log spec (2026-08-18), §3: cursor = the last row's id
      // alone. The same-millisecond microsecond-tiebreak trap (exit
      // criterion 9) can only be proved against REAL Postgres (a JS Date
      // can't mint two rows a genuine microsecond apart) — see that case
      // in `contracts.real.integration.test.ts`. These cases prove the
      // ordinary, backend-agnostic cursor contract both stores share.
      describe("cursor pagination", () => {
        it("before paginates forward through the full list with no gaps or duplicates", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const a = await stores.logs.create(userId, logInput());
          const b = await stores.logs.create(userId, logInput());
          const c = await stores.logs.create(userId, logInput());

          const page1 = await stores.logs.list(userId, 1);
          expect(page1.map((r) => r.id)).toStrictEqual([c.id]);

          const page2 = await stores.logs.list(userId, 1, page1[0].id);
          expect(page2.map((r) => r.id)).toStrictEqual([b.id]);

          const page3 = await stores.logs.list(userId, 1, page2[0].id);
          expect(page3.map((r) => r.id)).toStrictEqual([a.id]);

          const page4 = await stores.logs.list(userId, 1, page3[0].id);
          expect(page4).toStrictEqual([]);
        });

        it("before referencing an id that does not exist throws", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.logs.create(userId, logInput());
          await expect(
            stores.logs.list(userId, 10, NON_EXISTENT_UUID),
          ).rejects.toThrow();
        });

        // Owner-scoping applies to the cursor id itself, not just the rows
        // it would return: a foreign id must throw exactly like an absent
        // one, never leak "yes, that id exists (just not to you)".
        it("before referencing another user's id throws, not a silent empty page", async () => {
          const stores = await makeStores();
          const userA = await stores.makeUser();
          const userB = await stores.makeUser();
          const { id } = await stores.logs.create(userA, logInput());
          await stores.logs.create(userB, logInput());
          await expect(stores.logs.list(userB, 10, id)).rejects.toThrow();
        });
      });

      // From-the-log spec (2026-08-18), §3: the from-the-log view's fetch —
      // owner-checked, full row.
      describe("get", () => {
        it("returns the full row for the owner", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const { id } = await stores.logs.create(
            userId,
            logInput({ notes: "hello" }),
          );
          expect(await stores.logs.get(userId, id)).toMatchObject({
            id,
            notes: "hello",
          });
        });

        it("returns null for an absent id", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          expect(await stores.logs.get(userId, NON_EXISTENT_UUID)).toBeNull();
        });

        it("returns null for another user's id (no existence leak)", async () => {
          const stores = await makeStores();
          const userA = await stores.makeUser();
          const userB = await stores.makeUser();
          const { id } = await stores.logs.create(userA, logInput());
          expect(await stores.logs.get(userB, id)).toBeNull();
        });
      });

      // Series capture spec (2026-08-19), §3 "Server home": the run's 1 Hz
      // trace, a nullable jsonb column (migration 0011). S5's own check
      // (§4's table) — Postgres round-trips a 650 KB-class jsonb value
      // without surprises — is the worst-case case below; this suite runs
      // against BOTH real Postgres (`contracts.real.integration.test.ts`)
      // and the in-memory fakes (`contracts.fake.test.ts`), so the
      // worst-case round trip is proved against REAL Postgres here, and
      // the fake proved honest about matching it.
      describe("series", () => {
        it("absent series stores and reads back null", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const { id } = await stores.logs.create(userId, logInput());
          const row = await stores.logs.get(userId, id);
          expect(row!.series).toBeNull();
        });

        it("round-trips a small series exactly, hr included and omitted, truncated set", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const series = {
            samples: [
              { t: 10, d: 23, p: 1400, spm: 24, hr: 138 },
              { t: 20, d: 47, p: 1350, spm: 25 },
            ],
            truncated: true as const,
          };
          const { id } = await stores.logs.create(userId, logInput({ series }));
          const row = await stores.logs.get(userId, id);
          expect(row!.series).toStrictEqual(series);
        });

        // S5 (§4's table): the full 14,400-sample worst case (ruling 2's
        // cap; ~720 KB, the antagonist's own corrected arithmetic, §1)
        // round-trips sample-identical through the real store. This is
        // the "insert + GET read-back sample-identical" half of S5's own
        // check; the HTTP-layer half (through the real body-limit
        // middleware and the route's own validator) is
        // `server/routes/seriesCapture.integration.test.ts`.
        it("round-trips the full 14,400-sample worst case, sample-identical (S5)", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const samples = Array.from({ length: 14_400 }, (_, i) => ({
            t: (i + 1) * 10,
            d: (i + 1) * 23,
            p: 1400 + (i % 500),
            spm: 20 + (i % 10),
            ...(i % 3 === 0 ? { hr: 120 + (i % 100) } : {}),
          }));
          const series = { samples, truncated: true as const };
          const { id } = await stores.logs.create(userId, logInput({ series }));
          const row = await stores.logs.get(userId, id);
          expect(row!.series).toStrictEqual(series);
        });
      });

      // From-the-log spec (2026-08-18), §3: the API's first UPDATE.
      describe("update", () => {
        it("updates only the given subset, leaving the rest alone", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const { id } = await stores.logs.create(
            userId,
            logInput({
              held: "held",
              pain: 2,
              notes: "orig",
              thumbs: "up",
            }),
          );
          const updated = await stores.logs.update(userId, id, { pain: 4 });
          expect(updated).toMatchObject({
            held: "held",
            pain: 4,
            notes: "orig",
            thumbs: "up",
          });
        });

        it("an explicit null clears a field", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const { id } = await stores.logs.create(
            userId,
            logInput({ notes: "orig" }),
          );
          const updated = await stores.logs.update(userId, id, {
            notes: null,
          });
          expect(updated).toMatchObject({ notes: null });
        });

        // Task 2 review, LOW 2 fix-round coverage gap: the subset test
        // above only ever exercises `pain`'s (and, separately, `notes`')
        // own `"key" in patch` branch directly against the REAL store —
        // `held` and `thumbs` were only ever proven via the fake (through
        // the PATCH route's own tests), leaving those two branches
        // uncovered on `logs.ts` itself. One case per field closes it.
        it.each([
          ["held", "under"],
          ["thumbs", "down"],
        ] as const)(
          "updating only %s in isolation sets that column and leaves the rest untouched",
          async (field, value) => {
            const stores = await makeStores();
            const userId = await stores.makeUser();
            const { id } = await stores.logs.create(
              userId,
              logInput({ held: "held", pain: 2, notes: "orig", thumbs: "up" }),
            );
            const updated = await stores.logs.update(userId, id, {
              [field]: value,
            });
            expect(updated).toMatchObject({
              held: field === "held" ? value : "held",
              pain: 2,
              notes: "orig",
              thumbs: field === "thumbs" ? value : "up",
            });
          },
        );

        it("returns null for an absent id", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          expect(
            await stores.logs.update(userId, NON_EXISTENT_UUID, { pain: 3 }),
          ).toBeNull();
        });

        it("returns null for another user's id, and never touches that row", async () => {
          const stores = await makeStores();
          const userA = await stores.makeUser();
          const userB = await stores.makeUser();
          const { id } = await stores.logs.create(
            userA,
            logInput({ notes: "A's note" }),
          );
          expect(
            await stores.logs.update(userB, id, { notes: "hijacked" }),
          ).toBeNull();
          expect(await stores.logs.get(userA, id)).toMatchObject({
            notes: "A's note",
          });
        });
      });

      // From-the-log spec (2026-08-18), §2/§3: Plan's done-row link and
      // the `?plan=` route variant, newest-wins per index.
      describe("listPlanLinks", () => {
        it("returns the linked log id per plan index", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");
          const first = await stores.logs.create(userId, logInput());

          const links = await stores.logs.listPlanLinks(userId, "sprint");
          expect(links).toStrictEqual([{ planIndex: 0, id: first.id }]);
        });

        // The reset collision (spec §2, antagonist B5): after a reset, the
        // next advancing save stamps index 0 again — the OLDER row at that
        // index must not win.
        it("a reset collision resolves newest-wins: the later loggedAt row wins the index", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");
          await stores.logs.create(userId, logInput());
          await stores.planState.reset(userId);
          const second = await stores.logs.create(userId, logInput());

          const links = await stores.logs.listPlanLinks(userId, "sprint");
          expect(links).toStrictEqual([{ planIndex: 0, id: second.id }]);
        });

        it("is scoped per user", async () => {
          const stores = await makeStores();
          const userA = await stores.makeUser();
          const userB = await stores.makeUser();
          await stores.planState.set(userA, "sprint");
          await stores.logs.create(userA, logInput());
          expect(
            await stores.logs.listPlanLinks(userB, "sprint"),
          ).toStrictEqual([]);
        });
      });

      // Log-delete spec (2026-08-18), §2: the un-count rule — the §5.2
      // witness table. `delete()` returns `{deleted, unCounted}`; every
      // case here also asserts `done_n >= 0` (the GREATEST-as-depth clamp
      // must never be observed to matter, because the WHERE conditions
      // make the floor unreachable by construction — see the dedicated
      // floor test below).
      describe("delete", () => {
        it("returns deleted:false for an absent id, no plan_state touched", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          expect(
            await stores.logs.delete(userId, NON_EXISTENT_UUID),
          ).toStrictEqual({ deleted: false, unCounted: false });
        });

        it("returns deleted:false for another user's id, and never touches that row", async () => {
          const stores = await makeStores();
          const userA = await stores.makeUser();
          const userB = await stores.makeUser();
          const { id } = await stores.logs.create(userA, logInput());
          expect(await stores.logs.delete(userB, id)).toStrictEqual({
            deleted: false,
            unCounted: false,
          });
          expect(await stores.logs.get(userA, id)).not.toBeNull();
        });

        it("a non-plan-linked log deletes with unCounted:false, no plan_state row touched", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          const { id } = await stores.logs.create(userId, logInput());
          expect(await stores.logs.delete(userId, id)).toStrictEqual({
            deleted: true,
            unCounted: false,
          });
          expect(await stores.logs.get(userId, id)).toBeNull();
        });

        // Terminal newest link: the ONLY row at the terminal index — un-
        // counts, the index vanishes from listPlanLinks (the checkmark's
        // slot reopens: `?plan=` no longer lists it at done depth).
        it("terminal newest link decrements doneN by one and the index drops out of listPlanLinks", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");
          const first = await stores.logs.create(userId, logInput());
          const second = await stores.logs.create(userId, logInput());
          expect(await stores.planState.get(userId)).toMatchObject({
            doneN: 2,
          });

          const result = await stores.logs.delete(userId, second.id);
          expect(result).toStrictEqual({ deleted: true, unCounted: true });

          const planStateRow = await stores.planState.get(userId);
          expect(planStateRow).toStrictEqual({ planKey: "sprint", doneN: 1 });
          expect(planStateRow!.doneN).toBeGreaterThanOrEqual(0);

          const links = await stores.logs.listPlanLinks(userId, "sprint");
          expect(links).toStrictEqual([{ planIndex: 0, id: first.id }]);
        });

        // Wrong plan key: a Switch (planState.set to a different key)
        // means the deleted log's OLD plan_key no longer matches CURRENT
        // plan_state.planKey — the counter belongs to the new plan now,
        // and old-plan logs must never touch it.
        it("wrong plan key (Switch happened): unCounted false, counter untouched", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");
          const sprintLog = await stores.logs.create(userId, logInput());
          expect(await stores.planState.get(userId)).toMatchObject({
            planKey: "sprint",
            doneN: 1,
          });

          await stores.planState.set(userId, "head");
          expect(await stores.planState.get(userId)).toStrictEqual({
            planKey: "head",
            doneN: 0,
          });

          const result = await stores.logs.delete(userId, sprintLog.id);
          expect(result).toStrictEqual({ deleted: true, unCounted: false });

          const planStateRow = await stores.planState.get(userId);
          expect(planStateRow).toStrictEqual({ planKey: "head", doneN: 0 });
          expect(planStateRow!.doneN).toBeGreaterThanOrEqual(0);
        });

        // Task review H1: the case above doesn't isolate condition 1 —
        // after the Switch, head's doneN is 0, so condition 2's term
        // (`done_n = 0 + 1`) already declines before the key mismatch
        // ever matters. This fixture makes condition 2 PASS (the sprint
        // log's index 0 equals head's doneN-1) so ONLY the plan_key
        // mismatch protects the counter: a sprint-linked log surviving
        // into a HEAD advancing save (which makes head's doneN 1, the
        // same terminal position the sprint log's own index sits at)
        // must never un-count head's session just because the numbers
        // line up.
        it("wrong plan key with condition 2 otherwise satisfied: only the key mismatch protects the counter", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");
          const sprintLog = await stores.logs.create(userId, logInput());
          expect(await stores.planState.get(userId)).toStrictEqual({
            planKey: "sprint",
            doneN: 1,
          });

          await stores.planState.set(userId, "head");
          const headLog = await stores.logs.create(userId, logInput());
          expect(await stores.planState.get(userId)).toStrictEqual({
            planKey: "head",
            doneN: 1,
          });

          // Condition 2 alone would now pass: sprintLog.planIndex (0)
          // equals head's doneN - 1 (0). Only condition 1 (plan_key
          // match) can still decline this delete.
          const result = await stores.logs.delete(userId, sprintLog.id);
          expect(result).toStrictEqual({ deleted: true, unCounted: false });

          const planStateRow = await stores.planState.get(userId);
          expect(planStateRow).toStrictEqual({ planKey: "head", doneN: 1 });
          expect(planStateRow!.doneN).toBeGreaterThanOrEqual(0);

          const headLinks = await stores.logs.listPlanLinks(userId, "head");
          expect(headLinks).toStrictEqual([{ planIndex: 0, id: headLog.id }]);
        });

        // NON-TERMINAL index — the B1 orphan fixture (antagonist, spec
        // §2 condition 2): two advancing saves, delete the FIRST (index
        // 0, non-terminal since the terminal index is now 1). The tick
        // must stay (deleting old history never renumbers the plan) and
        // the still-terminal index-1 log must remain linked and
        // reachable — un-counting the middle would strand it.
        it("non-terminal index (B1 orphan): tick stays, counter unchanged, index-1 log still linked", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");
          const first = await stores.logs.create(userId, logInput());
          const second = await stores.logs.create(userId, logInput());
          expect(await stores.planState.get(userId)).toMatchObject({
            doneN: 2,
          });

          const result = await stores.logs.delete(userId, first.id);
          expect(result).toStrictEqual({ deleted: true, unCounted: false });

          const planStateRow = await stores.planState.get(userId);
          expect(planStateRow).toStrictEqual({ planKey: "sprint", doneN: 2 });
          expect(planStateRow!.doneN).toBeGreaterThanOrEqual(0);

          const links = await stores.logs.listPlanLinks(userId, "sprint");
          expect(links).toStrictEqual([{ planIndex: 1, id: second.id }]);
          expect(await stores.logs.get(userId, second.id)).not.toBeNull();
        });

        // Older same-index duplicate (a reset collision, spec §2
        // condition 3): the OLDER row at an index is never the newest-
        // wins holder — deleting it is a row-only delete, the newer
        // holder and the counter are both untouched.
        it("older same-index duplicate: row-only delete, counter and newer holder untouched", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");
          const older = await stores.logs.create(userId, logInput());
          await stores.planState.reset(userId);
          const newer = await stores.logs.create(userId, logInput());
          expect(await stores.planState.get(userId)).toMatchObject({
            planKey: "sprint",
            doneN: 1,
          });
          expect(
            await stores.logs.listPlanLinks(userId, "sprint"),
          ).toStrictEqual([{ planIndex: 0, id: newer.id }]);

          const result = await stores.logs.delete(userId, older.id);
          expect(result).toStrictEqual({ deleted: true, unCounted: false });

          const planStateRow = await stores.planState.get(userId);
          expect(planStateRow).toStrictEqual({ planKey: "sprint", doneN: 1 });
          expect(planStateRow!.doneN).toBeGreaterThanOrEqual(0);
          expect(
            await stores.logs.listPlanLinks(userId, "sprint"),
          ).toStrictEqual([{ planIndex: 0, id: newer.id }]);
        });

        // Deleting the NEWEST holder of a NON-TERMINAL index (a reset
        // collision where a later save has since moved the terminal
        // index elsewhere): tick stays (condition 2 fails), and the
        // `?plan=` link re-points to the older duplicate at that index —
        // it does not just vanish, because a row still exists there.
        it("newest holder of a non-terminal index: tick stays, link re-points to the older log", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");
          const older = await stores.logs.create(userId, logInput());
          await stores.planState.reset(userId);
          const newer = await stores.logs.create(userId, logInput());
          const terminal = await stores.logs.create(userId, logInput());
          expect(await stores.planState.get(userId)).toMatchObject({
            doneN: 2,
          });
          expect(
            await stores.logs.listPlanLinks(userId, "sprint"),
          ).toStrictEqual([
            { planIndex: 0, id: newer.id },
            { planIndex: 1, id: terminal.id },
          ]);

          const result = await stores.logs.delete(userId, newer.id);
          expect(result).toStrictEqual({ deleted: true, unCounted: false });

          const planStateRow = await stores.planState.get(userId);
          expect(planStateRow).toStrictEqual({ planKey: "sprint", doneN: 2 });
          expect(planStateRow!.doneN).toBeGreaterThanOrEqual(0);
          expect(
            await stores.logs.listPlanLinks(userId, "sprint"),
          ).toStrictEqual([
            { planIndex: 0, id: older.id },
            { planIndex: 1, id: terminal.id },
          ]);
        });

        // Floor-unreachability (spec §2, antagonist B4): the plan was
        // Reset AFTER the client fetched a now-stale "this is terminal"
        // view. The WHERE's condition-2 term (`done_n = index + 1`)
        // declines because doneN is back to 0 — never a bare decrement
        // that would drive it to -1 (which would read to the rower as
        // the word "undefined").
        it("floor-unreachability: delete a formerly-terminal log after a Reset — WHERE declines, doneN never goes below 0", async () => {
          const stores = await makeStores();
          const userId = await stores.makeUser();
          await stores.planState.set(userId, "sprint");
          const terminal = await stores.logs.create(userId, logInput());
          expect(await stores.planState.get(userId)).toStrictEqual({
            planKey: "sprint",
            doneN: 1,
          });

          await stores.planState.reset(userId);
          expect(await stores.planState.get(userId)).toStrictEqual({
            planKey: "sprint",
            doneN: 0,
          });

          const result = await stores.logs.delete(userId, terminal.id);
          expect(result).toStrictEqual({ deleted: true, unCounted: false });

          const planStateRow = await stores.planState.get(userId);
          expect(planStateRow).toStrictEqual({ planKey: "sprint", doneN: 0 });
          expect(planStateRow!.doneN).toBeGreaterThanOrEqual(0);
        });

        // §5.4 bystander byte-comparison: deleting a log never mutates
        // any other log's row — another user's row, and this user's OWN
        // other logs, must read back byte-identical.
        it("never mutates a bystander row — another user's, or this user's other logs (§5.4)", async () => {
          const stores = await makeStores();
          const userA = await stores.makeUser();
          const userB = await stores.makeUser();
          const doomed = await stores.logs.create(
            userA,
            logInput({ notes: "doomed" }),
          );
          const sibling = await stores.logs.create(
            userA,
            logInput({ notes: "sibling" }),
          );
          const strangers = await stores.logs.create(
            userB,
            logInput({ notes: "stranger" }),
          );
          const siblingBefore = await stores.logs.get(userA, sibling.id);
          const strangerBefore = await stores.logs.get(userB, strangers.id);

          await stores.logs.delete(userA, doomed.id);

          expect(await stores.logs.get(userA, sibling.id)).toStrictEqual(
            siblingBefore,
          );
          expect(await stores.logs.get(userB, strangers.id)).toStrictEqual(
            strangerBefore,
          );
        });
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

    // `articleReads` is a required member of StoresUnderTest (both
    // contracts.real.integration.test.ts and contracts.fake.test.ts's
    // `makeStores()` provide it), so every case below runs for real
    // against both backends — no runtime guard/skip needed.
    describe("article reads", () => {
      it("list returns [] for a user with no reads", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        expect(await stores.articleReads.list(userId)).toEqual([]);
      });

      it("markRead then list round-trips the slug", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.articleReads.markRead(userId, "workout-types");
        expect(await stores.articleReads.list(userId)).toEqual([
          "workout-types",
        ]);
      });

      it("markRead is idempotent: a repeated call doesn't duplicate the slug", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.articleReads.markRead(userId, "baselines");
        await stores.articleReads.markRead(userId, "baselines");
        expect(await stores.articleReads.list(userId)).toEqual(["baselines"]);
      });

      it("reads are scoped per user", async () => {
        const stores = await makeStores();
        const userA = await stores.makeUser();
        const userB = await stores.makeUser();
        await stores.articleReads.markRead(userA, "pain-scale");
        expect(await stores.articleReads.list(userB)).toEqual([]);
      });

      // Phase 6I: unmarkRead backs DELETE /api/article-reads/:slug and
      // You › Learning the app's MARK ALL FOUR UNREAD.
      it("unmarkRead then list round-trips the removal", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.articleReads.markRead(userId, "workout-types");
        await stores.articleReads.unmarkRead(userId, "workout-types");
        expect(await stores.articleReads.list(userId)).toEqual([]);
      });

      it("unmarkRead is idempotent: unmarking a slug never read is a no-op", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.articleReads.markRead(userId, "baselines");
        await stores.articleReads.unmarkRead(userId, "never-read-slug");
        expect(await stores.articleReads.list(userId)).toEqual(["baselines"]);
      });

      it("unmarkRead only removes the named slug, leaving the rest of the set intact", async () => {
        const stores = await makeStores();
        const userId = await stores.makeUser();
        await stores.articleReads.markRead(userId, "baselines");
        await stores.articleReads.markRead(userId, "picking-a-workout");
        await stores.articleReads.unmarkRead(userId, "baselines");
        expect(await stores.articleReads.list(userId)).toEqual([
          "picking-a-workout",
        ]);
      });

      it("unmarkRead is scoped per user: A's unmark never touches B's reads", async () => {
        const stores = await makeStores();
        const userA = await stores.makeUser();
        const userB = await stores.makeUser();
        await stores.articleReads.markRead(userA, "pain-scale");
        await stores.articleReads.markRead(userB, "pain-scale");
        await stores.articleReads.unmarkRead(userA, "pain-scale");
        expect(await stores.articleReads.list(userA)).toEqual([]);
        expect(await stores.articleReads.list(userB)).toEqual(["pain-scale"]);
      });
    });
  });
}
