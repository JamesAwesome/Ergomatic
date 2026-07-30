import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { createDb, type Db } from "../db/index.js";
import { preferences } from "../db/schema.js";
import { createUserStore } from "../auth/users.js";
import { createBaselinesStore } from "./baselines.js";
import { createWorkoutsStore, type NewWorkoutInput } from "./workouts.js";
import { createLogsStore } from "./logs.js";
import { createPlanStateStore } from "./planState.js";
import { createPreferencesStore } from "./preferences.js";
import { createTestHistoryStore } from "./testHistory.js";
import type { WorkoutType } from "../../domain/types.js";
import type { LogInput } from "./logs.js";

describe("domain stores against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let userA: string;
  let userB: string;

  const workoutInput = (
    overrides: Partial<NewWorkoutInput> = {},
  ): NewWorkoutInput => ({
    title: "Steady state",
    type: "AT",
    difficulty: "medium",
    pain: 2,
    steps: [{ k: "wu", minutes: 10 }],
    source: "user",
    ...overrides,
  });

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
    const users = createUserStore(db);
    const a = await users.createUser({
      googleSub: "store-user-a",
      email: "a@stores.test",
      name: "A",
    });
    const b = await users.createUser({
      googleSub: "store-user-b",
      email: "b@stores.test",
      name: "B",
    });
    userA = a.id;
    userB = b.id;
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  describe("baselines store", () => {
    const store = () => createBaselinesStore(db);

    it("returns null when no row exists", async () => {
      expect(await store().get(userA)).toBeNull();
    });

    it("put creates then updates, and get round-trips", async () => {
      const s = store();
      await s.put(userA, { k2Seconds: 420 });
      expect(await s.get(userA)).toMatchObject({
        k2Seconds: 420,
        k6Seconds: null,
      });

      await s.put(userA, { k6Seconds: 1500 });
      expect(await s.get(userA)).toMatchObject({
        k2Seconds: 420,
        k6Seconds: 1500,
      });
    });

    it("is invisible across users", async () => {
      const s = store();
      await s.put(userB, { k2Seconds: 999 });
      const a = await s.get(userA);
      expect(a?.k2Seconds).not.toBe(999);
    });
  });

  describe("workouts store", () => {
    const store = () => createWorkoutsStore(db);

    it("creates, gets, lists, updates, removes, and counts, scoped to userId", async () => {
      const s = store();
      const created = await s.create(userA, workoutInput({ title: "Row one" }));
      expect(created).toMatchObject({
        userId: userA,
        title: "Row one",
        source: "user",
      });

      const fetched = await s.get(userA, created.id);
      expect(fetched).toMatchObject({ id: created.id, title: "Row one" });

      expect(await s.get(userB, created.id)).toBeNull();

      const list = await s.list(userA);
      expect(list.some((w) => w.id === created.id)).toBe(true);

      const updated = await s.update(
        userA,
        created.id,
        workoutInput({ title: "Row one updated" }),
      );
      expect(updated).toMatchObject({ title: "Row one updated" });

      expect(await s.count(userA)).toBeGreaterThan(0);

      await s.remove(userA, created.id);
      expect(await s.get(userA, created.id)).toBeNull();
    });

    it("createMany inserts multiple rows for a user", async () => {
      const s = store();
      const before = await s.count(userA);
      const created = await s.createMany(userA, [
        workoutInput({ title: "Bulk one" }),
        workoutInput({ title: "Bulk two" }),
      ]);
      expect(created).toHaveLength(2);
      expect(await s.count(userA)).toBe(before + 2);
    });

    // 2026-07-30 (Phase 5C): `num` and its two partial unique indexes are
    // retired, so nothing about a workout is unique any more — duplicates
    // are simply allowed. What still has to hold is createMany's all-or-
    // nothing transaction, proved below with an input Postgres genuinely
    // rejects.
    it("allows a duplicate of an existing workout, for the same user", async () => {
      const s = store();
      await s.create(userA, workoutInput({ title: "Duplicated" }));
      const again = await s.create(
        userA,
        workoutInput({ title: "Duplicated" }),
      );
      expect(again).toMatchObject({ userId: userA, title: "Duplicated" });
    });

    it("rolls the whole createMany batch back when one row is rejected", async () => {
      const s = store();
      await expect(
        s.createMany(userA, [
          workoutInput({ title: "Batch one" }),
          workoutInput({ title: "Batch invalid", type: "NOPE" as WorkoutType }),
        ]),
      ).rejects.toThrow();
      // the whole batch rolled back: neither row landed
      const list = await s.list(userA);
      expect(list.some((w) => w.title === "Batch one")).toBe(false);
    });

    it("orders globals by sort_order, then everything without one by creation", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "order-user",
        email: "order@x.com",
        name: "OU",
      });

      await s.createMany(null, [
        workoutInput({ title: "Ordered Global Two", sortOrder: 2 }),
        workoutInput({ title: "Ordered Global One", sortOrder: 1 }),
      ]);
      await s.create(fresh.id, workoutInput({ title: "Ordered Mine First" }));
      await s.create(fresh.id, workoutInput({ title: "Ordered Mine Second" }));

      const list = await s.list(fresh.id);
      expect(
        list.map((w) => w.title).filter((t) => t.startsWith("Ordered ")),
      ).toStrictEqual([
        "Ordered Global One",
        "Ordered Global Two",
        "Ordered Mine First",
        "Ordered Mine Second",
      ]);
    });

    it("cross-user list and get see nothing", async () => {
      const s = store();
      const created = await s.create(userA, workoutInput({ title: "Only A" }));
      const listForB = await s.list(userB);
      expect(listForB.some((w) => w.id === created.id)).toBe(false);
    });

    describe("global library (nullable user_id)", () => {
      it("createMany(null, ...) inserts global rows visible to every user via list/get, tagged isGlobal", async () => {
        const s = store();
        const users = createUserStore(db);
        const fresh = await users.createUser({
          googleSub: "global-fresh",
          email: "globalfresh@x.com",
          name: "GF",
        });

        const globals = await s.createMany(null, [
          workoutInput({ title: "Global Alpha", sortOrder: 800 }),
          workoutInput({ title: "Global Beta", sortOrder: 801 }),
        ]);
        expect(globals).toHaveLength(2);
        expect(globals.every((w) => w.userId === null)).toBe(true);
        expect(globals.every((w) => w.isGlobal === true)).toBe(true);

        const list = await s.list(fresh.id);
        const seen = list.filter(
          (w) => w.title === "Global Alpha" || w.title === "Global Beta",
        );
        expect(seen).toHaveLength(2);
        expect(seen.every((w) => w.isGlobal === true)).toBe(true);

        const got = await s.get(fresh.id, globals[0].id);
        expect(got).toMatchObject({
          id: globals[0].id,
          title: "Global Alpha",
          isGlobal: true,
        });

        expect(await s.countGlobals()).toBeGreaterThanOrEqual(2);
        const globalList = await s.listGlobals();
        expect(globalList.some((w) => w.id === globals[0].id)).toBe(true);
      });

      it("list for a fresh user returns globals plus their own creations, each correctly tagged", async () => {
        const s = store();
        const users = createUserStore(db);
        const fresh = await users.createUser({
          googleSub: "global-mix",
          email: "globalmix@x.com",
          name: "GM",
        });

        const [g] = await s.createMany(null, [
          workoutInput({ title: "Global Mix", sortOrder: 810 }),
        ]);
        const personal = await s.create(
          fresh.id,
          workoutInput({ title: "Personal Mix" }),
        );

        const list = await s.list(fresh.id);
        const gRow = list.find((w) => w.id === g.id);
        const pRow = list.find((w) => w.id === personal.id);
        expect(gRow).toMatchObject({ isGlobal: true });
        expect(pRow).toMatchObject({ isGlobal: false });
      });

      it("update against a global id no-ops: returns null, row unchanged", async () => {
        const s = store();
        const [g] = await s.createMany(null, [
          workoutInput({ title: "Global Immutable", sortOrder: 820 }),
        ]);

        const result = await s.update(
          userA,
          g.id,
          workoutInput({ title: "Hijacked" }),
        );
        expect(result).toBeNull();

        const stillThere = await s.get(userA, g.id);
        expect(stillThere).toMatchObject({
          title: "Global Immutable",
          isGlobal: true,
        });
      });

      it("remove against a global id no-ops: row still present afterward", async () => {
        const s = store();
        const [g] = await s.createMany(null, [
          workoutInput({ title: "Global Survivor", sortOrder: 821 }),
        ]);

        await s.remove(userA, g.id);

        const stillThere = await s.get(userB, g.id);
        expect(stillThere).toMatchObject({
          title: "Global Survivor",
          isGlobal: true,
        });
      });

      // Nothing about a global row is unique any more (the two partial
      // unique indexes went with `num` on 2026-07-30), so a personal row may
      // freely duplicate a global's title AND its sort_order.
      it("a personal row may duplicate a global's title and sort_order", async () => {
        const s = store();
        const users = createUserStore(db);
        const fresh = await users.createUser({
          googleSub: "global-dup",
          email: "globaldup@x.com",
          name: "GD",
        });

        await s.createMany(null, [
          workoutInput({ title: "Shared 830", sortOrder: 830 }),
        ]);
        const personal = await s.create(
          fresh.id,
          workoutInput({ title: "Shared 830", sortOrder: 830 }),
        );
        expect(personal).toMatchObject({
          title: "Shared 830",
          sortOrder: 830,
          userId: fresh.id,
          isGlobal: false,
        });

        // And a second global at the same sort_order is accepted too.
        await expect(
          s.createMany(null, [
            workoutInput({ title: "Shared 830 again", sortOrder: 830 }),
          ]),
        ).resolves.toHaveLength(1);
      });
    });
  });

  describe("plan state store", () => {
    const store = () => createPlanStateStore(db);

    it("returns null when absent", async () => {
      const s = store();
      const fresh = await createUserStore(db).createUser({
        googleSub: "plan-fresh",
        email: "pf@x.com",
        name: "PF",
      });
      expect(await s.get(fresh.id)).toBeNull();
    });

    it("set stores a plan key with doneN reset to 0, reset zeroes doneN keeping the key", async () => {
      const s = store();
      await s.set(userA, "sprint");
      expect(await s.get(userA)).toStrictEqual({ planKey: "sprint", doneN: 0 });

      await s.set(userA, "head");
      expect(await s.get(userA)).toStrictEqual({ planKey: "head", doneN: 0 });

      await s.set(userA, null);
      expect(await s.get(userA)).toStrictEqual({ planKey: null, doneN: 0 });
    });

    it("is invisible across users", async () => {
      const s = store();
      await s.set(userA, "sprint");
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "plan-cross",
        email: "pc@x.com",
        name: "PC",
      });
      expect(await s.get(fresh.id)).toBeNull();
    });

    it("reset zeroes doneN on an existing row without touching planKey", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "plan-reset",
        email: "presetf@x.com",
        name: "PR",
      });
      await s.set(fresh.id, "head");
      const logs = createLogsStore(db);
      await logs.create(fresh.id, {
        workoutId: null,
        workoutTitle: "Reset test",
        workoutType: "AN",
        baselineK2: null,
        baselineK6: null,
        held: "held",
        pain: 1,
        notes: null,
        steps: [],
      });
      expect(await s.get(fresh.id)).toStrictEqual({
        planKey: "head",
        doneN: 1,
      });

      await s.reset(fresh.id);
      expect(await s.get(fresh.id)).toStrictEqual({
        planKey: "head",
        doneN: 0,
      });
    });

    it("reset creates a fresh row when none exists", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "plan-reset-new",
        email: "presetn@x.com",
        name: "PRN",
      });
      await s.reset(fresh.id);
      expect(await s.get(fresh.id)).toStrictEqual({ planKey: null, doneN: 0 });
    });
  });

  describe("preferences store", () => {
    const store = () => createPreferencesStore(db);

    it("returns spec defaults when absent, without inserting a row", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "prefs-fresh",
        email: "pref@x.com",
        name: "Pref",
      });
      const defaults = await s.get(fresh.id);
      expect(defaults).toStrictEqual({
        difficulties: ["easy", "medium", "hard"],
        timeCapMinutes: 60,
        warmupMinutes: 10,
        warmupOverride: false,
        countdownSeconds: 10,
        paceToleranceSeconds: 1,
        accentColor: "#b5341f",
      });

      // get()-when-absent must not have inserted a row
      const rows = await db
        .select()
        .from(preferences)
        .where(eq(preferences.userId, fresh.id));
      expect(rows).toHaveLength(0);
    });

    it("put upserts a partial and get reflects merged values", async () => {
      const s = store();
      await s.put(userA, { accentColor: "#00ff00", timeCapMinutes: 45 });
      const prefs = await s.get(userA);
      expect(prefs).toMatchObject({
        accentColor: "#00ff00",
        timeCapMinutes: 45,
      });

      await s.put(userA, { warmupOverride: true });
      const after = await s.get(userA);
      expect(after).toMatchObject({
        accentColor: "#00ff00",
        timeCapMinutes: 45,
        warmupOverride: true,
      });
    });

    it("is invisible across users", async () => {
      const s = store();
      await s.put(userA, { accentColor: "#123456" });
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "prefs-cross",
        email: "prefcross@x.com",
        name: "PC",
      });
      expect(await s.get(fresh.id)).toMatchObject({ accentColor: "#b5341f" });
    });

    // Real regression: an empty patch reaches onConflictDoUpdate's `set`
    // clause with nothing in it, which Postgres rejects outright — a plain
    // JS fake (`{...current, ...patch}`) can't reproduce this, since
    // merging in an empty object is silently harmless there. This is
    // exactly why app/server/routes/data.ts's PUT /api/prefs short-circuits
    // before calling put() when the patch is empty.
    it("put with an empty patch throws (fresh row), which is why the route must guard against {}", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "prefs-empty-fresh",
        email: "prefemptyfresh@x.com",
        name: "PEF",
      });
      await expect(s.put(fresh.id, {})).rejects.toThrow();
    });

    it("put with an empty patch throws (existing row, real conflict path)", async () => {
      const s = store();
      await s.put(userA, { accentColor: "#654321" });
      await expect(s.put(userA, {})).rejects.toThrow();
    });
  });

  describe("logs store + plan_state transaction", () => {
    const logInput = (overrides: Partial<LogInput> = {}): LogInput => ({
      workoutId: null,
      workoutTitle: "Frozen title",
      workoutType: "AN",
      baselineK2: 420,
      baselineK6: 1500,
      held: "held",
      pain: 2,
      notes: null,
      steps: [
        {
          label: "Step 1",
          targetSplit: 100,
          actualSplit: 101,
          actualSource: "stopwatch",
        },
      ],
      ...overrides,
    });

    it("create inserts the log and bumps plan_state.done_n from absent to 1", async () => {
      const logs = createLogsStore(db);
      const planState = createPlanStateStore(db);
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "log-fresh",
        email: "logfresh@x.com",
        name: "LF",
      });

      expect(await planState.get(fresh.id)).toBeNull();

      const { id } = await logs.create(fresh.id, logInput());
      expect(id).toBeDefined();

      expect(await planState.get(fresh.id)).toStrictEqual({
        planKey: null,
        doneN: 1,
      });

      const list = await logs.list(fresh.id, 10);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id, workoutTitle: "Frozen title" });
    });

    it("create increments an existing plan_state.done_n", async () => {
      const logs = createLogsStore(db);
      const planState = createPlanStateStore(db);
      await planState.set(userA, "sprint");
      await logs.create(userA, logInput());
      expect(await planState.get(userA)).toStrictEqual({
        planKey: "sprint",
        doneN: 1,
      });
      await logs.create(userA, logInput());
      expect(await planState.get(userA)).toStrictEqual({
        planKey: "sprint",
        doneN: 2,
      });
    });

    it("list respects limit and is invisible across users", async () => {
      const logs = createLogsStore(db);
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "log-limit",
        email: "loglimit@x.com",
        name: "LL",
      });
      await logs.create(fresh.id, logInput());
      await logs.create(fresh.id, logInput());
      await logs.create(fresh.id, logInput());
      const limited = await logs.list(fresh.id, 2);
      expect(limited).toHaveLength(2);

      const other = await users.createUser({
        googleSub: "log-cross",
        email: "logcross@x.com",
        name: "LC",
      });
      expect(await logs.list(other.id, 10)).toHaveLength(0);
    });

    it("count reflects inserted logs and is scoped per user", async () => {
      const logs = createLogsStore(db);
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "log-count",
        email: "logcount@x.com",
        name: "LC",
      });
      expect(await logs.count(fresh.id)).toBe(0);

      await logs.create(fresh.id, logInput());
      expect(await logs.count(fresh.id)).toBe(1);
      await logs.create(fresh.id, logInput());
      expect(await logs.count(fresh.id)).toBe(2);

      const other = await users.createUser({
        googleSub: "log-count-cross",
        email: "logcountcross@x.com",
        name: "LCX",
      });
      expect(await logs.count(other.id)).toBe(0);
    });

    it("lastDonePerWorkout maps each logged workout to days-ago, ignores workout-less logs, and is scoped per user", async () => {
      const logs = createLogsStore(db);
      const wk = createWorkoutsStore(db);
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "log-lastdone",
        email: "lastdone@x.com",
        name: "LD",
      });

      const workoutA = await wk.create(fresh.id, workoutInput({ title: "A" }));
      const workoutB = await wk.create(fresh.id, workoutInput({ title: "B" }));

      // A workout-less log (e.g. an ad-hoc session) must not appear in the map.
      await logs.create(fresh.id, logInput({ workoutId: null }));
      await logs.create(fresh.id, logInput({ workoutId: workoutA.id }));
      await logs.create(fresh.id, logInput({ workoutId: workoutB.id }));

      const map = await logs.lastDonePerWorkout(fresh.id);
      expect(Object.keys(map).sort()).toStrictEqual(
        [workoutA.id, workoutB.id].sort(),
      );
      // logged moments ago: days-ago is 0 for both
      expect(map[workoutA.id]).toBe(0);
      expect(map[workoutB.id]).toBe(0);

      const other = await users.createUser({
        googleSub: "log-lastdone-cross",
        email: "lastdonecross@x.com",
        name: "LDC",
      });
      expect(await logs.lastDonePerWorkout(other.id)).toStrictEqual({});
    });
  });

  describe("test history store", () => {
    const store = () => createTestHistoryStore(db);

    it("first entry for a distance has a null delta", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "th-fresh",
        email: "thfresh@x.com",
        name: "TH",
      });
      const row = await s.append(fresh.id, {
        distance: "2k",
        splitSeconds: 420,
      });
      expect(row.deltaSeconds).toBeNull();
    });

    it("computes delta against the previous entry of the same distance", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "th-delta",
        email: "thdelta@x.com",
        name: "THD",
      });
      await s.append(fresh.id, { distance: "2k", splitSeconds: 420 });
      const second = await s.append(fresh.id, {
        distance: "2k",
        splitSeconds: 410,
      });
      expect(second.deltaSeconds).toBe(-10);

      // a different distance does not interfere
      const firstSix = await s.append(fresh.id, {
        distance: "6k",
        splitSeconds: 1500,
      });
      expect(firstSix.deltaSeconds).toBeNull();

      const third = await s.append(fresh.id, {
        distance: "2k",
        splitSeconds: 415,
      });
      expect(third.deltaSeconds).toBe(5);
    });

    it("list is invisible across users", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "th-cross",
        email: "thcross@x.com",
        name: "THC",
      });
      await s.append(fresh.id, { distance: "2k", splitSeconds: 400 });
      const other = await users.createUser({
        googleSub: "th-cross-2",
        email: "thcross2@x.com",
        name: "THC2",
      });
      expect(await s.list(other.id)).toHaveLength(0);
      expect(await s.list(fresh.id)).toHaveLength(1);
    });
  });
});
