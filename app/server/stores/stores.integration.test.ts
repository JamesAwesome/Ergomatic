import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import type pg from "pg";
import { createDb, type Db } from "../db/index.js";
import { articleReads, baselines, preferences } from "../db/schema.js";
import { createUserStore } from "../auth/users.js";
import { createArticleReadsStore } from "./articleReads.js";
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
    steps: [{ k: "r", minutes: 10 }],
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

    // Phase BL PR A: the store is a dumb per-key patch — it writes exactly
    // the keys it is handed and nothing else (the route owns the
    // manual-defaulting policy). Read back raw via the schema, because
    // get() deliberately projects the source columns off (lean-GET).
    it("writes a source only when the patch names it, and an absent key touches neither number nor source", async () => {
      const s = store();
      // A fresh user, so the first put below genuinely exercises the
      // INSERT path (userA/userB already have rows from the cases above).
      const fresh = await createUserStore(db).createUser({
        googleSub: "store-user-provenance",
        email: "provenance@stores.test",
        name: "P",
      });
      const uid = fresh.id;
      const raw = async () =>
        (await db.select().from(baselines).where(eq(baselines.userId, uid)))[0];

      await s.put(uid, { k2Seconds: 118, k2Source: "tested" });
      let row = await raw();
      expect(row.k2Source).toBe("tested");
      // Insert path: the unnamed side's source comes from the DB default.
      expect(row.k6Source).toBe("manual");

      // Update path: a patch naming only k6 leaves k2's source alone.
      await s.put(uid, { k6Seconds: 127, k6Source: "derived" });
      row = await raw();
      expect(row.k2Source).toBe("tested");
      expect(row.k6Source).toBe("derived");
      expect(row.k2Seconds).toBe(118);
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
      // freely duplicate a global's title. It may NOT, however, carry a
      // client-supplied sort_order (H1): create() is always a personal row,
      // and personal rows order strictly by created_at, so any `sortOrder`
      // an input carries is ignored and the stored row's sort_order is NULL
      // — verified below straight off the object create() returns AND via a
      // fresh read from Postgres, so a bug that only mis-shaped the return
      // value (but wrote the real column correctly, or vice versa) would
      // still be caught.
      it("a personal row may duplicate a global's title, but a client-supplied sort_order is ignored and stored as NULL", async () => {
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
          sortOrder: null,
          userId: fresh.id,
          isGlobal: false,
        });

        const reFetched = await s.get(fresh.id, personal.id);
        expect(reFetched).toMatchObject({ sortOrder: null });

        // And a second global at the same sort_order is still accepted (the
        // seed path is the only one allowed to author sort_order at all).
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
        advancesPlan: true,
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
        countdownSeconds: 10,
        paceToleranceSeconds: 1,
        accentColor: "#b5341f",
        startHereDismissed: false,
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

      await s.put(userA, { timeCapMinutes: 90 });
      const after = await s.get(userA);
      expect(after).toMatchObject({
        accentColor: "#00ff00",
        timeCapMinutes: 90,
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
      // Task 3: true matches every pre-Task-3 call in this file (a log
      // always advanced the plan) — the new advancesPlan:false cases below
      // override it explicitly.
      advancesPlan: true,
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

    // Phase 7C Task 3 (spec §6): deviceName lives in a real column
    // (`db/schema.ts`'s `sessionLogs.deviceName`), not inside the `steps`
    // jsonb blob — this proves the real INSERT/SELECT round trip through
    // Postgres itself, which `routes/data.test.ts`'s fake-store-backed
    // tests can't: a route-level regression that stops passing `deviceName`
    // to `stores.logs.create` at all would still pass those (the fake store
    // just spreads whatever `LogInput` it's given), but only the real
    // column proves the migration actually wired the value through.
    it("round-trips deviceName through a real column: set and absent-stays-null", async () => {
      const logs = createLogsStore(db);
      const withDevice = await logs.create(
        userA,
        logInput({ deviceName: "PM5 432331249 Row" }),
      );
      const withoutDevice = await logs.create(userA, logInput());

      const list = await logs.list(userA, 10);
      const found = (id: string) => list.find((row) => row.id === id)!;
      expect(found(withDevice.id).deviceName).toBe("PM5 432331249 Row");
      expect(found(withoutDevice.id).deviceName).toBeNull();
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

    // Task 3: real-Postgres proof that `advancesPlan:false` skips ONLY the
    // plan_state upsert inside `create`'s own transaction — the log insert
    // itself is unconditional (verified via `list`, not just the return
    // value) and, for a user with no plan_state row at all yet, `false`
    // must not create one.
    it("create with advancesPlan:false inserts the log without creating a plan_state row", async () => {
      const logs = createLogsStore(db);
      const planState = createPlanStateStore(db);
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "log-outside-plan-fresh",
        email: "logoutsideplanfresh@x.com",
        name: "LOF",
      });

      expect(await planState.get(fresh.id)).toBeNull();
      const { id } = await logs.create(
        fresh.id,
        logInput({ advancesPlan: false }),
      );
      expect(await planState.get(fresh.id)).toBeNull();

      const list = await logs.list(fresh.id, 10);
      expect(list.some((row) => row.id === id)).toBe(true);
    });

    it("create with advancesPlan:false leaves an EXISTING plan_state.done_n unchanged", async () => {
      const logs = createLogsStore(db);
      const planState = createPlanStateStore(db);
      await planState.set(userA, "sprint");
      await logs.create(userA, logInput());
      expect(await planState.get(userA)).toStrictEqual({
        planKey: "sprint",
        doneN: 1,
      });

      await logs.create(userA, logInput({ advancesPlan: false }));
      expect(await planState.get(userA)).toStrictEqual({
        planKey: "sprint",
        doneN: 1,
      });
    });

    // THE FREE-ROW PREDICATE, against real Postgres (Phase JR PR 1 Task 1;
    // spec rev 4, James's sign-off 2026-09-01). Three rows, and the second
    // and third are the regressions — the first is the easy one.
    //
    // The predicate is the PAIR (`workoutId` AND `workoutType` both null),
    // never `workoutId` alone. Row 2 is why: `LogSession.tsx:780-790`
    // retries a save with `workoutId: null` when the server 400s
    // specifically on `workoutId` (the workout was deleted between that
    // door's mount and the Save click). That is a legitimate
    // plan-advancing session posting a null workout id, and an id-only
    // predicate would stall its plan silently — a 201, and SESSION n OF 84
    // does not move.
    it("a FREE ROW (both null) never advances the plan, even asking to", async () => {
      const logs = createLogsStore(db);
      const planState = createPlanStateStore(db);
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "jr-free-row",
        email: "jrfreerow@x.com",
        name: "JR",
      });
      await planState.set(fresh.id, "sprint");

      const { id } = await logs.create(
        fresh.id,
        logInput({ workoutId: null, workoutType: null, advancesPlan: true }),
      );

      expect(await planState.get(fresh.id)).toStrictEqual({
        planKey: "sprint",
        doneN: 0,
      });
      const list = await logs.list(fresh.id, 10);
      const stored = list.find((row) => row.id === id);
      expect(stored?.planKey ?? null).toBeNull();
    });

    it("a null workout id that still carries a type DOES advance (the deleted-workout retry)", async () => {
      const logs = createLogsStore(db);
      const planState = createPlanStateStore(db);
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "jr-deleted-workout-retry",
        email: "jrdeleted@x.com",
        name: "JR",
      });
      await planState.set(fresh.id, "sprint");

      await logs.create(
        fresh.id,
        logInput({ workoutId: null, workoutType: "O2", advancesPlan: true }),
      );

      expect(await planState.get(fresh.id)).toStrictEqual({
        planKey: "sprint",
        doneN: 1,
      });
    });

    it("a row naming a workout with no type DOES advance (not a free row)", async () => {
      const logs = createLogsStore(db);
      const planState = createPlanStateStore(db);
      const users = createUserStore(db);
      const workoutsStore = createWorkoutsStore(db);
      const fresh = await users.createUser({
        googleSub: "jr-named-no-type",
        email: "jrnamed@x.com",
        name: "JR",
      });
      const w = await workoutsStore.create(
        fresh.id,
        workoutInput({ title: "JR named" }),
      );
      await planState.set(fresh.id, "sprint");

      await logs.create(
        fresh.id,
        logInput({ workoutId: w.id, workoutType: null, advancesPlan: true }),
      );

      expect(await planState.get(fresh.id)).toStrictEqual({
        planKey: "sprint",
        doneN: 1,
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

    // Wave E PR1 Task 6 (task-6-brief.md): real-Postgres proof of the
    // owner-scoped UPDATE and its row-count return — the router's own unit
    // suite (concept2.test.ts) only ever exercises the FAKE for this
    // method.
    describe("recordC2Result", () => {
      it("writes both columns and returns true for the owning user's row", async () => {
        const logs = createLogsStore(db);
        const users = createUserStore(db);
        const fresh = await users.createUser({
          googleSub: "log-c2-result-owner",
          email: "c2resultowner@x.com",
          name: "LCO",
        });
        const { id } = await logs.create(fresh.id, logInput());

        const wrote = await logs.recordC2Result(fresh.id, id, 85557, 2211);
        expect(wrote).toBe(true);

        const row = await logs.get(fresh.id, id);
        expect(row?.c2ResultId).toBe(85557);
        expect(row?.c2UserId).toBe(2211);
      });

      it("returns false and writes nothing for a foreign user's id (no existence leak)", async () => {
        const logs = createLogsStore(db);
        const users = createUserStore(db);
        const owner = await users.createUser({
          googleSub: "log-c2-result-real-owner",
          email: "c2resultrealowner@x.com",
          name: "LCRO",
        });
        const stranger = await users.createUser({
          googleSub: "log-c2-result-stranger",
          email: "c2resultstranger@x.com",
          name: "LCS",
        });
        const { id } = await logs.create(owner.id, logInput());

        const wrote = await logs.recordC2Result(stranger.id, id, 1, 1);
        expect(wrote).toBe(false);

        const row = await logs.get(owner.id, id);
        expect(row?.c2ResultId).toBeNull();
        expect(row?.c2UserId).toBeNull();
      });
    });

    // Wave E PR1 Task 6, plan deviation 2: the `tz IS NULL` guard rides IN
    // the WHERE clause (stores/logs.ts's own comment) — proven here against
    // real Postgres because the router's own `row.tz === null` pre-check
    // makes a SECOND recordTz call for the same row unreachable through the
    // router itself (a sequential router-level retry never re-enters this
    // branch once the first call has stored a zone), so only a DIRECT
    // second call against the store can exercise the guard at all — the
    // same reasoning this task's mutation probe against the fake surfaced.
    describe("recordTz", () => {
      it("writes tz on a null column", async () => {
        const logs = createLogsStore(db);
        const users = createUserStore(db);
        const fresh = await users.createUser({
          googleSub: "log-tz-null",
          email: "logtznull@x.com",
          name: "LTN",
        });
        const { id } = await logs.create(fresh.id, logInput());

        // `recordTz` returns the EFFECTIVE stored zone, never `void` —
        // asserted here, not just via a follow-up `get()`.
        const returned = await logs.recordTz(
          fresh.id,
          id,
          "America/Los_Angeles",
        );
        expect(returned).toBe("America/Los_Angeles");
        const row = await logs.get(fresh.id, id);
        expect(row?.tz).toBe("America/Los_Angeles");
      });

      it("a second call for the same row is a no-op — first write wins, and its return value proves it", async () => {
        const logs = createLogsStore(db);
        const users = createUserStore(db);
        const fresh = await users.createUser({
          googleSub: "log-tz-guard",
          email: "logtzguard@x.com",
          name: "LTG",
        });
        const { id } = await logs.create(fresh.id, logInput());

        const first = await logs.recordTz(fresh.id, id, "America/Los_Angeles");
        expect(first).toBe("America/Los_Angeles");
        // The SECOND call's own return value must report the zone that
        // actually won (the first one), never echo back its
        // own "UTC" argument as if it had written it — this is the exact
        // property a concurrent writer needs to build the SAME payload.
        const second = await logs.recordTz(fresh.id, id, "UTC");
        expect(second).toBe("America/Los_Angeles");

        const row = await logs.get(fresh.id, id);
        expect(row?.tz).toBe("America/Los_Angeles");
      });

      it("never overwrites a tz the row was CREATED with, and reports THAT zone back", async () => {
        const logs = createLogsStore(db);
        const users = createUserStore(db);
        const fresh = await users.createUser({
          googleSub: "log-tz-created",
          email: "logtzcreated@x.com",
          name: "LTC",
        });
        const { id } = await logs.create(
          fresh.id,
          logInput({ tz: "America/New_York" }),
        );

        const returned = await logs.recordTz(fresh.id, id, "UTC");
        expect(returned).toBe("America/New_York");

        const row = await logs.get(fresh.id, id);
        expect(row?.tz).toBe("America/New_York");
      });
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

  describe("articleReads store", () => {
    const store = () => createArticleReadsStore(db);

    // Raw select, bypassing the store, so the idempotency case below can
    // prove read_at genuinely didn't move on the second markRead.
    async function readAtOf(userId: string, slug: string): Promise<Date> {
      const [row] = await db
        .select({ readAt: articleReads.readAt })
        .from(articleReads)
        .where(
          and(eq(articleReads.userId, userId), eq(articleReads.slug, slug)),
        );
      return row.readAt;
    }

    it("lists nothing for a user with no reads", async () => {
      // First test in this describe: userA has had no article_reads writes
      // yet, so this holds even though userA is shared across the file.
      expect(await store().list(userA)).toStrictEqual([]);
    });

    // Uses a fresh user (not userA) so this test's exact-list assertion
    // can't be contaminated by reads other tests in this describe give
    // userA — the store itself is scoped per user regardless.
    it("markRead then list round-trips the slug", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "article-reads-roundtrip",
        email: "ar-roundtrip@stores.test",
        name: "AR Roundtrip",
      });
      await s.markRead(fresh.id, "workout-types");
      expect(await s.list(fresh.id)).toStrictEqual(["workout-types"]);
    });

    it("markRead is idempotent and keeps the original read_at", async () => {
      const s = store();
      const users = createUserStore(db);
      const fresh = await users.createUser({
        googleSub: "article-reads-idempotent",
        email: "ar-idempotent@stores.test",
        name: "AR Idempotent",
      });
      await s.markRead(fresh.id, "baselines");
      const before = await readAtOf(fresh.id, "baselines");
      await s.markRead(fresh.id, "baselines");
      expect(await s.list(fresh.id)).toStrictEqual(["baselines"]);
      expect(await readAtOf(fresh.id, "baselines")).toStrictEqual(before);
    });

    it("reads are per-user", async () => {
      const s = store();
      await s.markRead(userA, "pain-scale");
      expect(await s.list(userB)).toStrictEqual([]);
    });
  });
});
