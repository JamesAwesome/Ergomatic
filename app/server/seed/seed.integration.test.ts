import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createDb, type Db } from "../db/index.js";
import { workouts } from "../db/schema.js";
import { createUserStore, type UserStore } from "../auth/users.js";
import { createWorkoutsStore, type WorkoutsStore } from "../stores/workouts.js";
import { createLogsStore, type LogsStore } from "../stores/logs.js";
import { seedGlobalLibrary, SEED_LOCK_KEY } from "./seed.js";
import { GLOBAL_LIBRARY_SEED, LIBRARY_WORKOUTS } from "./library/index.js";
import {
  ONBOARDING_TITLES,
  isOnboardingTitle,
} from "../../domain/onboarding.js";
import warmupsBefore from "../../scripts/library-warmups-before.json";

describe("seedGlobalLibrary against real Postgres", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let users: UserStore;
  let wk: WorkoutsStore;
  let logs: LogsStore;

  // Shared by the converge tests below: creates a log referencing the given
  // workout for a fresh user (same shape as the swap test's inline
  // logs.create call, factored out since three cases below need it) and
  // returns its id.
  async function createLogFor(
    userId: string,
    workoutId: string,
    workoutTitle: string,
    workoutType: string,
  ): Promise<string> {
    const { id } = await logs.create(userId, {
      workoutId,
      workoutTitle,
      workoutType,
      baselineK2: null,
      baselineK6: null,
      held: "held",
      pain: 2,
      notes: null,
      steps: [],
      advancesPlan: false,
    });
    return id;
  }

  // logs has no get-by-id; list() (scoped per user, per stores/logs.ts) is
  // the store's own lookup pattern, reused from the converge cases below.
  async function findLog(userId: string, logId: string) {
    return (await logs.list(userId, 50)).find((l) => l.id === logId);
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });
    users = createUserStore(db);
    wk = createWorkoutsStore(db);
    logs = createLogsStore(db);
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("seeds all GLOBAL_LIBRARY_SEED as global (user_id null), source starter, on a fresh DB", async () => {
    await seedGlobalLibrary(db);

    const globals = await wk.listGlobals();
    expect(globals).toHaveLength(GLOBAL_LIBRARY_SEED.length);
    expect(globals).toHaveLength(302); // 300-workout library + 2 onboarding rows
    expect(globals.every((w) => w.userId === null)).toBe(true);
    expect(globals.every((w) => w.isGlobal === true)).toBe(true);
    expect(globals.every((w) => w.source === "starter")).toBe(true);
    expect(globals.map((w) => w.sortOrder)).toStrictEqual(
      GLOBAL_LIBRARY_SEED.map((w) => w.sortOrder).sort((a, b) => a - b),
    );
    // Phase 6I: the two designated onboarding workouts land as real global
    // rows via the default converge input (GLOBAL_LIBRARY_SEED), not just
    // LIBRARY_WORKOUTS — the no-baseline card looks them up by title.
    const titles = new Set(globals.map((w) => w.title));
    expect(titles.has(ONBOARDING_TITLES.k6)).toBe(true);
    expect(titles.has(ONBOARDING_TITLES.k2)).toBe(true);
  });

  it("running seedGlobalLibrary twice from empty produces the identical set of global ids (match ⇒ no-op, no churn)", async () => {
    await db.delete(workouts);

    await seedGlobalLibrary(db);
    const idsAfterFirst = (await wk.listGlobals()).map((w) => w.id).sort();
    expect(idsAfterFirst).toHaveLength(GLOBAL_LIBRARY_SEED.length);

    await seedGlobalLibrary(db);
    const idsAfterSecond = (await wk.listGlobals()).map((w) => w.id).sort();

    expect(idsAfterSecond).toStrictEqual(idsAfterFirst);
  });

  it("is visible to any user (new or old) via list(), without per-user seeding", async () => {
    const before = await users.createUser({
      googleSub: "seed-before",
      email: "before@x.com",
      name: "Before",
    });
    await seedGlobalLibrary(db);
    const after = await users.createUser({
      googleSub: "seed-after",
      email: "after@x.com",
      name: "After",
    });

    const listBefore = await wk.list(before.id);
    const listAfter = await wk.list(after.id);
    expect(listBefore).toHaveLength(GLOBAL_LIBRARY_SEED.length);
    expect(listAfter).toHaveLength(GLOBAL_LIBRARY_SEED.length);
    expect(listBefore.every((w) => w.isGlobal)).toBe(true);
    expect(listAfter.every((w) => w.isGlobal)).toBe(true);
  });

  // Converge semantics, zero-overlap case: a global set with NO titles in
  // common with LIBRARY_WORKOUTS — e.g. the retired 35-workout library still
  // sitting in a deployed DB — converges via the degenerate delete-everything
  // + insert-everything path (every old title is "removed", every new title
  // is "missing"). Starts from a deliberately reset table so the "old"
  // globals are the ONLY globals present, standing in for a pre-migration
  // production DB.
  it("converges a zero-overlap global set via full delete+insert; session logs keep their row with workoutId nulled, personal workouts are untouched", async () => {
    await db.delete(workouts);

    const user = await users.createUser({
      googleSub: "swap-test",
      email: "swap@x.com",
      name: "Swap Tester",
    });

    const [oldA] = await wk.createMany(null, [
      {
        sortOrder: 1,
        title: "Old Ghost",
        type: "AT",
        difficulty: "medium",
        pain: 2,
        source: "starter",
        steps: [],
      },
      {
        sortOrder: 2,
        title: "Old Relic",
        type: "O2",
        difficulty: "easy",
        pain: 1,
        source: "starter",
        steps: [],
      },
      {
        sortOrder: 3,
        title: "Old Fossil",
        type: "TR",
        difficulty: "hard",
        pain: 4,
        source: "starter",
        steps: [],
      },
    ]);

    const personal = await wk.create(user.id, {
      title: "My Own Row",
      type: "AN",
      difficulty: "hard",
      pain: 3,
      source: "user",
      steps: [],
    });

    const { id: logId } = await logs.create(user.id, {
      workoutId: oldA.id,
      workoutTitle: oldA.title,
      workoutType: oldA.type,
      baselineK2: null,
      baselineK6: null,
      held: "held",
      pain: 2,
      notes: null,
      steps: [],
      advancesPlan: false,
    });

    await seedGlobalLibrary(db);

    const globalsAfter = await wk.listGlobals();
    expect(globalsAfter).toHaveLength(GLOBAL_LIBRARY_SEED.length);
    const titlesAfter = new Set(globalsAfter.map((w) => w.title));
    expect(titlesAfter.has("Old Ghost")).toBe(false);
    expect(titlesAfter.has("Old Relic")).toBe(false);
    expect(titlesAfter.has("Old Fossil")).toBe(false);

    const logRow = (await logs.list(user.id, 10)).find((l) => l.id === logId);
    expect(logRow).toBeDefined();
    expect(logRow!.workoutId).toBeNull();

    const personalAfter = await wk.get(user.id, personal.id);
    expect(personalAfter).not.toBeNull();
    expect(personalAfter!.title).toBe("My Own Row");
    expect(personalAfter!.isGlobal).toBe(false);
  });

  // seedGlobalLibrary's check-then-converge is not atomic on its own: two
  // booters can both observe a mismatch and both attempt to converge. Until
  // 2026-07-30 the two partial unique indexes on `num` stopped a losing
  // write from landing; those went with the column, so the mutual exclusion
  // is now a transaction-scoped advisory lock inside seedGlobalLibrary
  // (SEED_LOCK_KEY, exported from seed.ts for exactly this test).
  //
  // A test that races two REAL seedGlobalLibrary() calls and only checks the
  // final count is a coin flip: depending on scheduling, one call can fully
  // commit before the other's SELECT even runs, in which case the assertion
  // passes whether or not the lock exists at all — measured at ~50% pass
  // rate with the `pg_advisory_xact_lock` call deleted outright. Instead,
  // take the SAME lock first from an independent session-level connection.
  // Postgres advisory locks share one key space regardless of whether
  // they're taken with the session-scoped (`pg_advisory_lock`) or the
  // transaction-scoped (`pg_advisory_xact_lock`) variant, so holding it here
  // forces seedGlobalLibrary's own lock call to genuinely block — proved via
  // a real timing assertion (it must NOT have finished after a generous
  // delay), not a hope that the scheduler happened to interleave badly.
  // Deleting the `pg_advisory_xact_lock` line from seed.ts makes this test
  // fail every time: `settled` flips to `true` well inside the 300ms window
  // because nothing blocks it any more (verified locally before writing
  // this comment).
  it("blocks on the advisory lock while another session holds it, and proceeds once released", async () => {
    await db.delete(workouts);
    expect(await wk.countGlobals()).toBe(0);

    const lockClient = await pool.connect();
    try {
      await lockClient.query("select pg_advisory_lock($1)", [SEED_LOCK_KEY]);

      let settled = false;
      const seeding = seedGlobalLibrary(db).then(() => {
        settled = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);
      expect(await wk.countGlobals()).toBe(0);

      await lockClient.query("select pg_advisory_unlock($1)", [SEED_LOCK_KEY]);
      await seeding;

      expect(settled).toBe(true);
      expect(await wk.countGlobals()).toBe(GLOBAL_LIBRARY_SEED.length);
    } finally {
      lockClient.release();
    }
  });

  // Library-converge (2026-08-04 spec): the headline behavior this task
  // adds — a content-only edit to an already-deployed title reaches the
  // existing row instead of requiring a title change to be noticed.
  it("converges a content edit in place: same row id, log link intact, new content", async () => {
    await seedGlobalLibrary(db);
    const target = (await wk.listGlobals())[0]!;
    const user = await users.createUser({
      googleSub: "converge-edit-in-place",
      email: "converge-edit-in-place@x.com",
      name: "Converge Edit",
    });
    const logId = await createLogFor(
      user.id,
      target.id,
      target.title,
      target.type,
    );

    const edited = LIBRARY_WORKOUTS.map((w) =>
      w.title === target.title
        ? { ...w, difficulty: "hard" as const, pain: 5 }
        : w,
    );
    await seedGlobalLibrary(db, edited);

    const after = (await wk.listGlobals()).find(
      (g) => g.title === target.title,
    )!;
    expect(after.id).toBe(target.id); // the headline: same row survives
    expect(after).toMatchObject({ difficulty: "hard", pain: 5 });
    const logRow = await findLog(user.id, logId);
    expect(logRow!.workoutId).toBe(target.id); // link intact
  });

  // The warmup-setting spec's own converge scenario (design spec §6/M4,
  // docs/superpowers/specs/2026-08-09-warmup-setting-design.md): a
  // deployed DB still carries the OLD (pre-strip) `wu`-including shape for
  // a title the code's library no longer matches byte-for-byte. The
  // reconcile mechanism is content-addressed, not title-addressed
  // (server/seed/seed.ts:33's `contentEqual`: `isDeepStrictEqual(row.steps,
  // w.steps)`), and the line that ACTS on a mismatch —
  // server/seed/seed.ts:86, `if (row && !contentEqual(row, w)) await
  // workouts.updateGlobal(row.id, w);` — updates the existing row in
  // place rather than falling through to the title-missing insert path.
  // Deleting that `!contentEqual(row, w)` check (always skipping the
  // update) is exactly what this test would catch: the row would keep its
  // stale `wu` step forever, since the title still matches.
  it("converges a workout whose STEPS changed (the warmup-setting strip): same row id, log link intact, wu gone", async () => {
    await db.delete(workouts);
    const target = LIBRARY_WORKOUTS[0]!;
    const historicalWarmupMinutes = (warmupsBefore as Record<string, number>)[
      target.title
    ];
    // Sanity: every one of the 300 library workouts carried a wu step
    // before Task 3's strip (task-1-report.md / task-3-report.md), so this
    // must be defined for whichever title happens to sort first.
    expect(historicalWarmupMinutes).toBeDefined();

    // The OLD shape this row carried in a deployed DB before this PR:
    // today's steps, plus the real historical `wu` lead-in this exact
    // title used to have (frozen at scripts/library-warmups-before.json,
    // captured from the pre-strip seed content in the same commit that
    // deleted it) — a raw insert, bypassing seedGlobalLibrary entirely,
    // standing in for "a row seeded by an older deploy."
    const oldSteps = [
      { k: "wu", minutes: historicalWarmupMinutes },
      ...target.steps,
    ];
    const [oldRow] = await wk.createMany(null, [
      {
        sortOrder: target.sortOrder,
        title: target.title,
        type: target.type,
        difficulty: target.difficulty,
        pain: target.pain,
        source: "starter" as const,
        steps: oldSteps as unknown as typeof target.steps,
      },
    ]);

    const user = await users.createUser({
      googleSub: "converge-wu-strip",
      email: "converge-wu-strip@x.com",
      name: "Converge WU Strip",
    });
    const logId = await createLogFor(
      user.id,
      oldRow!.id,
      target.title,
      target.type,
    );

    await seedGlobalLibrary(db);

    const after = (await wk.listGlobals()).find(
      (g) => g.title === target.title,
    )!;
    expect(after.id).toBe(oldRow!.id); // same row — converge-in-place, not delete+insert
    expect(after.steps).toStrictEqual(target.steps); // wu gone, everything else byte-identical
    expect(
      (after.steps as Array<{ k: string }>).some((s) => s.k === "wu"),
    ).toBe(false);

    const logRow = await findLog(user.id, logId);
    expect(logRow!.workoutId).toBe(oldRow!.id); // link intact, not nulled
  });

  it("deletes a dropped title (its log link nulls) and inserts a new one", async () => {
    await seedGlobalLibrary(db);
    const victim = (await wk.listGlobals())[0]!;
    const user = await users.createUser({
      googleSub: "converge-drop-title",
      email: "converge-drop-title@x.com",
      name: "Converge Drop",
    });
    const logId = await createLogFor(
      user.id,
      victim.id,
      victim.title,
      victim.type,
    );

    const edited = LIBRARY_WORKOUTS.filter(
      (w) => w.title !== victim.title,
    ).concat([
      { ...LIBRARY_WORKOUTS[0]!, title: "Brand New Weather", sortOrder: 301 },
    ]);
    await seedGlobalLibrary(db, edited);

    const titles = (await wk.listGlobals()).map((g) => g.title);
    expect(titles).not.toContain(victim.title);
    expect(titles).toContain("Brand New Weather");
    const logRow = await findLog(user.id, logId);
    expect(logRow).toBeTruthy(); // row survives
    expect(logRow!.workoutId).toBeNull(); // link nulls
  });

  it("is idempotent: a second converge from identical state writes nothing", async () => {
    await seedGlobalLibrary(db);
    // .getTime(), not String(<Date>): Date#toString() truncates to
    // whole seconds, so a spurious re-write landing within the same
    // wall-clock second as the snapshot (routine for a local, in-process
    // test) would silently pass a String()-based comparison even though
    // updatedAt actually moved — caught via self-mutation (see task
    // report) before this was tightened to millisecond precision.
    const before = new Map(
      (await wk.listGlobals()).map((g) => [g.id, g.updatedAt.getTime()]),
    );
    await seedGlobalLibrary(db);
    const after = await wk.listGlobals();
    expect(after).toHaveLength(before.size);
    for (const g of after) expect(g.updatedAt.getTime()).toBe(before.get(g.id));
  });

  it("jsonb round-trip does not cause phantom writes (steps deep-equal, not string-equal)", async () => {
    // Regression pin for the spec's equality rule: seed once, converge again
    // with the SAME library object — if the implementation compared
    // serialized steps, Postgres's jsonb key canonicalization would make
    // every row look changed and updatedAt would move. .getTime(), not
    // String(<Date>) — see the idempotency test above for why.
    await seedGlobalLibrary(db);
    const stamp = (await wk.listGlobals()).map((g) => g.updatedAt.getTime());
    // The full converge input, not just LIBRARY_WORKOUTS — passing the
    // 300-only array here would legitimately delete the two onboarding
    // rows (title missing from the explicit arg), which is correct
    // convergence behavior but would desync stamp/stamp2's lengths and
    // defeat this test's actual point (no phantom writes on a no-op).
    await seedGlobalLibrary(db, [...GLOBAL_LIBRARY_SEED]);
    const stamp2 = (await wk.listGlobals()).map((g) => g.updatedAt.getTime());
    expect(stamp2).toStrictEqual(stamp);
  });

  // Coverage (task brief Step 6): seed.ts's duplicate-title branch
  // (`byTitle.has(g.title)` in the converge loop) is defensive — this
  // seed's own inserts always come from LIBRARY_WORKOUTS, whose titles are
  // unique by construction, so seedGlobalLibrary can never itself produce
  // two global rows sharing a title. It IS reachable via an integration
  // test though: reach in through wk.createMany directly (bypassing
  // seedGlobalLibrary) to simulate legacy/out-of-band duplicate data, no
  // fake needed.
  it("collapses a duplicate global title down to one surviving row (defensive branch)", async () => {
    await seedGlobalLibrary(db);
    const target = (await wk.listGlobals())[0]!;
    const libEntry = LIBRARY_WORKOUTS.find((w) => w.title === target.title)!;
    await wk.createMany(null, [{ ...libEntry, source: "starter" as const }]);
    expect(
      (await wk.listGlobals()).filter((g) => g.title === target.title),
    ).toHaveLength(2);

    await seedGlobalLibrary(db);

    const survivors = (await wk.listGlobals()).filter(
      (g) => g.title === target.title,
    );
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.id).toBe(target.id); // the earlier (original) row wins
  });

  // ------------------------------------------------------------------
  // Phase 8A PR B: the legacy-title rename pre-pass (LEGACY_TITLE_RENAMES).
  // A deployed DB carries "First 6k"/"First 2k" rows that pre-rename logs
  // point at via session_logs.workout_id (ON DELETE SET NULL). Without the
  // pre-pass, the converge sees those titles as unknown, deletes them, and
  // every such log loses its workout link. The literal legacy titles below
  // are frozen history — this is the ONE place old titles legitimately
  // survive in tests, because these tests exercise the legacy-rename path
  // itself.
  //
  // The OLD rows exactly as a pre-rename deploy seeded them (frozen
  // pre-8A-PR-B shape: title, classification, steps, sortOrder).
  const LEGACY_ONBOARDING_ROWS = [
    {
      sortOrder: 301,
      title: "First 6k",
      type: "O2",
      difficulty: "easy",
      pain: 2,
      source: "starter" as const,
      steps: [
        {
          k: "w",
          duration: { kind: "distance", meters: 6000 },
          ref: { effort: "min" },
        },
      ],
    },
    {
      sortOrder: 302,
      title: "First 2k",
      type: "AN",
      difficulty: "easy",
      pain: 2,
      source: "starter" as const,
      steps: [
        {
          k: "w",
          duration: { kind: "distance", meters: 2000 },
          ref: { effort: "max" },
        },
      ],
    },
  ] as unknown as Parameters<WorkoutsStore["createMany"]>[1];

  it("renames legacy-titled onboarding rows IN PLACE: same id, log link intact, new title, new classification — and a second boot is idempotent", async () => {
    await db.delete(workouts);
    const [oldK6, oldK2] = await wk.createMany(null, LEGACY_ONBOARDING_ROWS);

    const user = await users.createUser({
      googleSub: "legacy-rename",
      email: "legacy-rename@x.com",
      name: "Legacy Rename",
    });
    // A pre-rename log against the old 2k — workout_title is a save-time
    // snapshot and keeps the old spelling forever; only workout_id must
    // survive the rename.
    const logId = await createLogFor(user.id, oldK2!.id, "First 2k", "AN");

    await seedGlobalLibrary(db);

    const globals = await wk.listGlobals();
    expect(globals).toHaveLength(GLOBAL_LIBRARY_SEED.length);
    const titles = new Set(globals.map((g) => g.title));
    expect(titles.has("First 6k")).toBe(false);
    expect(titles.has("First 2k")).toBe(false);

    // Renamed IN PLACE — the ids the pre-rename rows carried survive.
    const k6After = globals.find((g) => g.title === ONBOARDING_TITLES.k6)!;
    const k2After = globals.find((g) => g.title === ONBOARDING_TITLES.k2)!;
    expect(k6After.id).toBe(oldK6!.id);
    expect(k2After.id).toBe(oldK2!.id);

    // The log recorded against "First 2k" still resolves to its workout.
    const logRow = await findLog(user.id, logId);
    expect(logRow!.workoutId).toBe(oldK2!.id);

    // The rename pre-pass lands BEFORE listGlobals(), so the converge sees
    // the row under its NEW title and the ordinary content-diff path
    // applies the reclassification (2K: AN/hard/5, 6K: AT/hard/4) — a
    // rename that left the old classification in place fails here.
    expect(k2After).toMatchObject({ type: "AN", difficulty: "hard", pain: 5 });
    expect(k6After).toMatchObject({ type: "AT", difficulty: "hard", pain: 4 });

    // Second boot: idempotent — no dupes, no deletes, no writes.
    const stampBefore = new Map(
      (await wk.listGlobals()).map((g) => [g.id, g.updatedAt.getTime()]),
    );
    await seedGlobalLibrary(db);
    const globals2 = await wk.listGlobals();
    expect(globals2).toHaveLength(GLOBAL_LIBRARY_SEED.length);
    expect(globals2.filter((g) => isOnboardingTitle(g.title))).toHaveLength(2);
    for (const g of globals2)
      expect(g.updatedAt.getTime()).toBe(stampBefore.get(g.id));
  });

  // Defensive guard: if a global row already carries the NEW title (never
  // produced by this seed's own history, but cheap to be wrong about), the
  // pre-pass must NOT rename the legacy row on top of it — that would mint
  // a duplicate title and hand the dedup pass a coin-flip over which row
  // keeps its log links. Instead the legacy row is left for the converge's
  // ordinary unknown-title delete (its links null, matching what any
  // unknown title gets).
  it("skips the rename when a global row already holds the new title (no duplicate-title carnage)", async () => {
    await db.delete(workouts);
    const [oldK2] = await wk.createMany(null, [LEGACY_ONBOARDING_ROWS[1]!]);
    // A pre-existing global already under the NEW title.
    const newEntry = GLOBAL_LIBRARY_SEED.find(
      (w) => w.title === ONBOARDING_TITLES.k2,
    )!;
    const [existingNew] = await wk.createMany(null, [
      { ...newEntry, source: "starter" as const },
    ]);

    await seedGlobalLibrary(db);

    const survivors = (await wk.listGlobals()).filter(
      (g) => g.title === ONBOARDING_TITLES.k2,
    );
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.id).toBe(existingNew!.id);
    // The legacy row went through the ordinary delete path, not a rename.
    expect((await wk.listGlobals()).some((g) => g.id === oldK2!.id)).toBe(
      false,
    );
  });

  // Pins BOTH user_id IS NULL scopings inside renameGlobalByTitle
  // (adversarial review, 2026-08-22: all 181 prior tests stayed green with
  // either scoping deleted). A rower's own rows colliding with BOTH sides
  // of the rename map must be inert to the pre-pass: a personal "2K Test"
  // must not trip the NOT EXISTS guard (that would silently skip the
  // global rename and hand the legacy row to the delete pass), and a
  // personal "First 2k" must never itself be renamed (the outer scope).
  it("personal rows sharing either title are invisible to the rename: the guard ignores them and the outer scope never touches them", async () => {
    await db.delete(workouts);
    const [oldK2] = await wk.createMany(null, [LEGACY_ONBOARDING_ROWS[1]!]);

    const user = await users.createUser({
      googleSub: "legacy-rename-personal",
      email: "legacy-rename-personal@x.com",
      name: "Legacy Rename Personal",
    });
    // A personal row already under the NEW title (the guard's bait) and a
    // personal row under the OLD title (the outer scope's bait) — both
    // real, ownable rows the seed must never read or write.
    const personalNew = await wk.create(user.id, {
      title: ONBOARDING_TITLES.k2,
      type: "AN",
      difficulty: "hard",
      pain: 5,
      source: "user",
      steps: [],
    });
    const personalOld = await wk.create(user.id, {
      title: "First 2k",
      type: "AN",
      difficulty: "easy",
      pain: 2,
      source: "user",
      steps: [],
    });
    const logId = await createLogFor(user.id, oldK2!.id, "First 2k", "AN");

    await seedGlobalLibrary(db);

    // (a) The GLOBAL rename still happened: renamed in place, same id,
    // log link intact — a guard that counts personal rows would have
    // skipped it and let the delete pass null the link.
    const k2Global = (await wk.listGlobals()).find(
      (g) => g.title === ONBOARDING_TITLES.k2,
    )!;
    expect(k2Global.id).toBe(oldK2!.id);
    const logRow = await findLog(user.id, logId);
    expect(logRow!.workoutId).toBe(oldK2!.id);

    // (b) Both personal rows untouched: same ids, same titles — an outer
    // scope without user_id IS NULL would have renamed personalOld.
    const newAfter = await wk.get(user.id, personalNew.id);
    expect(newAfter!.title).toBe(ONBOARDING_TITLES.k2);
    expect(newAfter!.isGlobal).toBe(false);
    const oldAfter = await wk.get(user.id, personalOld.id);
    expect(oldAfter!.title).toBe("First 2k");
    expect(oldAfter!.isGlobal).toBe(false);
  });
});
