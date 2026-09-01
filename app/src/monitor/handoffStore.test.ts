// Hand-off store unit tests (plan Task 2, docs/superpowers/plans/
// 2026-08-30-handoff-store.md; design spec docs/superpowers/specs/
// 2026-08-30-handoff-protocol-design.md §1/§6/§7/§8, rev 4). Every §1
// semantic named in the plan's Task 2 bullet, asserted by CONSEQUENCE
// (CLAUDE.md RF4) rather than existence throughout.
//
// **Fresh module per test.** `handoffStore.ts` is a deliberate module-level
// singleton (§1: "the store IS this state" — see that file's own header
// note) — `vi.resetModules()` + a dynamic re-import in `beforeEach` is this
// codebase's own established idiom for exactly this shape
// (`useMonitorSession.test.ts`'s many `vi.resetModules()` blocks;
// `src/monitor/*Replay.test.ts`'s fresh-hook-per-replay convention), never a
// bespoke test-only reset export that would exist for nothing else.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import type { LogSeed } from "../session/logDraft";
import { MONITOR_RUN_KEY, type MonitorRun } from "./monitorRun";
import type { SeriesData } from "./seriesRecorder";
import type { HandoffReceipt } from "./handoffStore";

type StoreModule = typeof import("./handoffStore");

// Realistic fixture, this file's own neighbour's convention
// (`monitorRun.test.ts`'s own header comment): compiled through the REAL
// assembly a session would use (buildDraft -> buildRun ->
// compileProgram(run.phases)) against a real 300-library title, not a
// hand-built minimum WorkoutProgram. RF3's own bar ("at least one test per
// client task starts from a real library workout") is met by every test in
// this file sharing this one builder, since none of this module's
// semantics depend on program CONTENT — only on there being a real,
// non-trivial `MonitorRun.program` riding along.
const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const t0 = new Date("2026-08-05T12:00:00.000Z");

const TEST_SEED: LogSeed = {
  steps: [{ label: "8:00 warm-up", kind: "warmup" }],
  paces: {},
};

function fillingLowProgram(): WorkoutProgram {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: `fl-${Math.random()}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const run = buildRun(draft, baselines, t0);
  const result = compileProgram(run.phases);
  if ("code" in result) {
    throw new Error(`fixture failed to compile: ${result.code}`);
  }
  return result;
}

// Built once — every test that needs "a real program" reuses this object
// (revision/session-key mechanics never touch `program`'s own contents, so
// there is nothing to gain from recompiling per test, and compiling per
// test would materially slow this file for no assertion payoff).
const REAL_PROGRAM = fillingLowProgram();

function freshRun(
  startedAt: string,
  extra: Partial<MonitorRun> = {},
): MonitorRun {
  return {
    v: 2,
    workoutId: "fl-workout-id",
    title: "Filling Low",
    program: REAL_PROGRAM,
    logSeed: TEST_SEED,
    actuals: [],
    deviceName: "PM5 12345",
    startedAt,
    completedAt: null,
    terminated: false,
    ...extra,
  };
}

const SERIES: SeriesData = {
  samples: [{ t: 0, d: 0, p: 120, spm: 24 }],
};

let store: StoreModule;
let receipts: HandoffReceipt[];

async function freshStore(): Promise<void> {
  vi.resetModules();
  store = await import("./handoffStore");
  receipts = [];
  store.setReceiptChannel((r) => receipts.push(r));
}

beforeEach(async () => {
  localStorage.clear();
  await freshStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function receiptsOfKind<K extends HandoffReceipt["kind"]>(
  kind: K,
): Extract<HandoffReceipt, { kind: K }>[] {
  return receipts.filter(
    (r): r is Extract<HandoffReceipt, { kind: K }> => r.kind === kind,
  );
}

describe("setReceiptChannel", () => {
  it("null resets to the default no-op — no throw, nothing to assert on since there is nowhere for a receipt to go", () => {
    store.setReceiptChannel(null);
    expect(() => store.claim("k", 0)).not.toThrow();
  });

  it("the module's own OWN default (before anything ever configures a channel) is a real no-op, not merely un-exercised", async () => {
    vi.resetModules();
    const fresh = await import("./handoffStore");
    // No `setReceiptChannel` call at all — this is the module's true
    // out-of-the-box default, distinct from every other test in this file
    // (which always installs a spy in `beforeEach`).
    expect(() => fresh.claim("k", 0)).not.toThrow();
  });
});

// THE FREE-ROW SHAPE, THROUGH THE PRODUCTION WRITER (Phase JR PR 1 Task 3;
// re-review of 83438df4, finding 3).
//
// An earlier version of this gate lived in `monitorRun.test.ts` and wrote
// through `saveMonitorRun`, claiming to span the writer and the reader. It
// did not: that function's own doc comment says it has **NO PRODUCTION
// CALLERS** — every production write of `MONITOR_RUN_KEY` goes through this
// store's `commit`/`retryDurable`, and `saveMonitorRun` survives only as a
// fixture seeder. Testing a shape through a writer nothing uses proves the
// shape is storable, not that the path that stores it keeps it.
//
// So it lives here, against the real committer, and asserts BOTH tiers: the
// store's own read and the durable localStorage record that a cold start
// hydrates from.
describe("commit — the free-row shape (Phase JR)", () => {
  it("round-trips mode, an empty program and an empty seed through commit and durable hydration", () => {
    const run = freshRun(t0.toISOString(), {
      mode: "justrow",
      workoutId: null,
      title: "Just Row",
      program: { intervals: [] },
      logSeed: { steps: [], paces: {} },
      actuals: [],
    });

    const result = store.commit(run.startedAt, null, run);
    expect(result).toStrictEqual({
      accepted: true,
      revision: 0,
      verdict: "saved",
    });

    // Tier 1: the store's own read.
    expect(store.read(run.startedAt)?.run).toStrictEqual(run);

    // Tier 2: the DURABLE record — what a cold start actually reads back,
    // and where an unknown-key-intolerant validator would drop `mode`.
    const durable = JSON.parse(
      localStorage.getItem(MONITOR_RUN_KEY)!,
    ) as MonitorRun;
    expect(durable.mode).toBe("justrow");
    expect(durable.program.intervals).toStrictEqual([]);
    expect(durable.logSeed).toStrictEqual({ steps: [], paces: {} });
  });
});

describe("commit — create (expectedRevision: null)", () => {
  it("accepts a create against an empty store at revision 0, verdict saved, and persists durably", () => {
    const run = freshRun(t0.toISOString());
    const result = store.commit(run.startedAt, null, run);

    expect(result).toStrictEqual({
      accepted: true,
      revision: 0,
      verdict: "saved",
    });
    expect(store.read(run.startedAt)).toStrictEqual({
      sessionKey: run.startedAt,
      revision: 0,
      run,
    });
    expect(JSON.parse(localStorage.getItem(MONITOR_RUN_KEY)!)).toStrictEqual(
      JSON.parse(JSON.stringify(run)),
    );
    expect(receiptsOfKind("commit-accepted")).toStrictEqual([
      {
        kind: "commit-accepted",
        sessionKey: run.startedAt,
        revision: 0,
        verdict: "saved",
      },
    ]);
  });

  it("refuses a second create for the SAME key as stale (expected absent, found something) and does not bump the revision", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);

    const again = store.commit(run.startedAt, null, freshRun(run.startedAt));

    expect(again.accepted).toBe(false);
    if (again.accepted) throw new Error("unreachable");
    expect(again.reason).toBe("stale");
    expect(store.read(run.startedAt)!.revision).toBe(0);
    expect(receiptsOfKind("commit-refused")).toStrictEqual([
      {
        kind: "commit-refused",
        sessionKey: run.startedAt,
        reason: "stale",
        expectedRevision: null,
        currentRevision: 0,
      },
    ]);
  });

  // §1's single-unretired-session invariant, THE binding fact this task's
  // mutation list names by name ("second-key accepted (must fail)" —
  // see the self-mutation section below for the probe).
  it("refuses a create for a DIFFERENT key while one is unretired, with store-second-key-refused — and touches nothing about the existing entry", () => {
    const first = freshRun("2026-08-05T12:00:00.000Z");
    store.commit(first.startedAt, null, first);

    const second = freshRun("2026-08-05T13:00:00.000Z");
    const result = store.commit(second.startedAt, null, second);

    expect(result).toStrictEqual({
      accepted: false,
      reason: "second-key",
      current: { sessionKey: first.startedAt, revision: 0, run: first },
    });
    expect(store.currentUnretired()).toStrictEqual({
      sessionKey: first.startedAt,
      revision: 0,
      run: first,
    });
    expect(store.read(second.startedAt)).toBeNull();
    expect(receiptsOfKind("store-second-key-refused")).toStrictEqual([
      {
        kind: "store-second-key-refused",
        sessionKey: second.startedAt,
        existingKey: first.startedAt,
      },
    ]);
    // The generic refusal receipt is NOT also emitted for this case — one
    // dedicated kind, not two overlapping ones for the same event.
    expect(receiptsOfKind("commit-refused")).toStrictEqual([]);
  });
});

describe("commit — update (expectedRevision matches)", () => {
  it("accepts a sequence of updates, incrementing the revision by exactly one each time", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);

    const withActual = freshRun(run.startedAt, { actuals: [] });
    const r1 = store.commit(run.startedAt, 0, withActual);
    expect(r1).toStrictEqual({ accepted: true, revision: 1, verdict: "saved" });

    const r2 = store.commit(run.startedAt, 1, withActual);
    expect(r2).toStrictEqual({ accepted: true, revision: 2, verdict: "saved" });

    expect(store.read(run.startedAt)!.revision).toBe(2);
  });

  it("refuses a stale expectedRevision (behind the current one), receipts it, bumps nothing", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    store.commit(run.startedAt, 0, run); // now at revision 1

    const stale = store.commit(run.startedAt, 0, run); // stale: current is 1

    expect(stale).toStrictEqual({
      accepted: false,
      reason: "stale",
      current: { sessionKey: run.startedAt, revision: 1, run },
    });
    expect(store.read(run.startedAt)!.revision).toBe(1);
    expect(receiptsOfKind("commit-refused")).toContainEqual({
      kind: "commit-refused",
      sessionKey: run.startedAt,
      reason: "stale",
      expectedRevision: 0,
      currentRevision: 1,
    });
  });

  it("refuses an update naming a revision ahead of the current one too — CAS is exact-match, not <=", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run); // revision 0

    const aheadOfReality = store.commit(run.startedAt, 5, run);

    expect(aheadOfReality.accepted).toBe(false);
    expect(store.read(run.startedAt)!.revision).toBe(0);
  });

  it("refuses an update naming a key the store has NOTHING current for at all (never created) as stale, with no `current` in the refusal", () => {
    const run = freshRun(t0.toISOString());

    const result = store.commit(run.startedAt, 3, run);

    expect(result).toStrictEqual({
      accepted: false,
      reason: "stale",
      current: undefined,
    });
    expect(receiptsOfKind("commit-refused")).toStrictEqual([
      {
        kind: "commit-refused",
        sessionKey: run.startedAt,
        reason: "stale",
        expectedRevision: 3,
        currentRevision: null,
      },
    ]);
  });
});

describe("verdict caching (§7) — refusals never touch it", () => {
  it("caches the last ACCEPTED commit's verdict, not overwritten by a later refusal", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    expect(store.cachedVerdict(run.startedAt)).toBe("saved");

    // A stale attempt refuses; the cached verdict must read exactly as it
    // did before this call.
    store.commit(run.startedAt, 99, run);
    expect(store.cachedVerdict(run.startedAt)).toBe("saved");
  });

  // task-2 review, finding I3: `store.durableState(...)` returns the LIVE
  // map-value object, not a copy — capturing it as `before` and later
  // asserting `toStrictEqual(before)` is a SELF-comparison if that object
  // were ever mutated in place, since `before` is the same reference and
  // would show the mutation too. Asserted against a literal expectation
  // instead, which an in-place mutation genuinely cannot fool.
  it("a refused commit is invisible to durable bookkeeping too — durableRevision/durableComplete unchanged (asserted as literals, not a captured reference)", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);

    store.commit(run.startedAt, 99, run);

    expect(store.durableState(run.startedAt)).toStrictEqual({
      durableRevision: 0,
      durableComplete: true,
    });
  });
});

describe("durable bookkeeping — durableRevision/durableComplete (§8)", () => {
  it("a successful write records durableRevision === the accepted revision and durableComplete: true", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);

    expect(store.durableState(run.startedAt)).toStrictEqual({
      durableRevision: 0,
      durableComplete: true,
    });
  });

  it("the saved-without-series sacrifice: a full write that throws, WITH a series present, retries without it — verdict saved-without-series, durableComplete: false, durableRevision still bumped, and the IN-MEMORY entry keeps its series untouched", () => {
    const run = freshRun(t0.toISOString(), { series: SERIES });
    // Real passthrough after the FIRST call (the primary, series-included
    // write) — the sacrifice's own retry (series stripped) must actually
    // land, not also throw, so this test proves the RETRY succeeding, not
    // merely that a first failure was swallowed.
    const realSetItem = Storage.prototype.setItem.bind(localStorage);
    let attempt = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      key: string,
      value: string,
    ) {
      attempt++;
      if (key === MONITOR_RUN_KEY && attempt === 1) {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
      realSetItem(key, value);
    });

    const result = store.commit(run.startedAt, null, run);

    expect(result).toStrictEqual({
      accepted: true,
      revision: 0,
      verdict: "saved-without-series",
    });
    expect(store.durableState(run.startedAt)).toStrictEqual({
      durableRevision: 0,
      durableComplete: false,
    });
    // Memory tier keeps the FULL run, series included — only the durable
    // copy paid the sacrifice (§3's own ordering: "the trace is what gets
    // sacrificed, never the run").
    expect(store.read(run.startedAt)!.run.series).toStrictEqual(SERIES);
    const persisted = JSON.parse(
      localStorage.getItem(MONITOR_RUN_KEY)!,
    ) as MonitorRun;
    expect(persisted.series).toBeUndefined();
    expect(persisted.seriesDropped).toBe(true);
  });

  it("a write that fails with NO series present skips the sacrifice retry outright — verdict failed, durableState left as it was", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const run = freshRun(t0.toISOString());

    const result = store.commit(run.startedAt, null, run);

    expect(result).toStrictEqual({
      accepted: true,
      revision: 0,
      verdict: "failed",
    });
    expect(store.durableState(run.startedAt)).toBeUndefined();
    // Memory tier still accepted — a durable failure is not a commit
    // refusal (§1: "memory written; durable attempted").
    expect(store.read(run.startedAt)).toStrictEqual({
      sessionKey: run.startedAt,
      revision: 0,
      run,
    });
  });

  it("a write that fails with a series present, whose sacrifice retry ALSO fails, reports failed and leaves durableState untouched from any prior success", () => {
    const first = freshRun(t0.toISOString());
    store.commit(first.startedAt, null, first); // durableState: {0, true}

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const withSeries = freshRun(first.startedAt, { series: SERIES });
    const result = store.commit(first.startedAt, 0, withSeries);

    expect(result).toStrictEqual({
      accepted: true,
      revision: 1,
      verdict: "failed",
    });
    // UNCHANGED from the prior successful write — never reset, never
    // advanced to revision 1 (§8: "Failed attempts leave both unchanged").
    expect(store.durableState(first.startedAt)).toStrictEqual({
      durableRevision: 0,
      durableComplete: true,
    });
  });
});

describe("tombstones — post-retire refusal and masking", () => {
  it("a commit(create) for a retired key is refused retired, receipted, and the physical bytes are removed", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    store.retire(
      [{ sessionKey: run.startedAt, revision: 0 }],
      "monitor-discard",
    );

    const resurrection = store.commit(
      run.startedAt,
      null,
      freshRun(run.startedAt),
    );

    expect(resurrection).toStrictEqual({ accepted: false, reason: "retired" });
    expect(store.read(run.startedAt)).toBeNull();
    expect(receiptsOfKind("commit-refused")).toContainEqual({
      kind: "commit-refused",
      sessionKey: run.startedAt,
      reason: "retired",
      expectedRevision: null,
      currentRevision: null,
    });
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("masks a failed physical removal: the tombstone still refuses a resurrection even when removeItem itself throws, and receipts the failure distinctly", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("boom", "SecurityError");
    });

    expect(() =>
      store.retire(
        [{ sessionKey: run.startedAt, revision: 0 }],
        "monitor-discard",
      ),
    ).not.toThrow();

    expect(receiptsOfKind("storage-getter-error")).toContainEqual({
      kind: "storage-getter-error",
      operation: "remove",
    });
    const resurrection = store.commit(
      run.startedAt,
      null,
      freshRun(run.startedAt),
    );
    expect(resurrection).toStrictEqual({ accepted: false, reason: "retired" });
  });
});

describe("retire — sets, per-entry receipts, claim states, no-op", () => {
  it("no-op retire: a set naming a key the store has nothing current for emits NOTHING", () => {
    store.retire(
      [{ sessionKey: "never-existed", revision: 0 }],
      "monitor-discard",
    );
    expect(receipts).toStrictEqual([]);
  });

  // ADDED at the final fix round (2026-08-30), adversarial pass F-1: the
  // no-op test directly above runs against an EMPTY store, so it passes
  // whether or not `retire` reads `sessionKey` at all — the probe (make
  // the per-entry lookup ignore `sessionKey` and retire whatever is
  // current) left all 5638 tests green. `handoffStore.ts`'s per-entry
  // lookup is the ONLY thing standing between an authorization staged for
  // one session and the destruction of a DIFFERENT one, and until this
  // test it had no gate of its own.
  it("KEY-BINDING: a retire set naming key A leaves key B's entry ALIVE — the authorization destroys the key it names, never 'whatever is current' (§1: authorization is KEY-BOUND)", () => {
    const keyB = t0.toISOString();
    const runB = freshRun(keyB);
    store.commit(keyB, null, runB);
    const keyA = new Date(t0.getTime() - 60_000).toISOString();
    expect(keyA).not.toBe(keyB);
    receipts.length = 0;

    store.retire([{ sessionKey: keyA, revision: 0 }], "monitor-discard");

    // B SURVIVES, whole: still the current unretired entry, at its own
    // revision, still readable, still durable.
    expect(store.read(keyB)).toStrictEqual({
      sessionKey: keyB,
      revision: 0,
      run: runB,
    });
    expect(store.currentUnretired()).not.toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).not.toBeNull();
    // ...and B was never TOMBSTONED either — a mutant that removed the
    // entry but left the tombstone unarmed would fail the read above, but
    // one that armed the tombstone while leaving the entry in place would
    // not: a later commit for B must still be accepted.
    expect(
      store.commit(keyB, 0, { ...runB, title: "B is still writable" }),
    ).toStrictEqual({ accepted: true, revision: 1, verdict: "saved" });

    // NOTHING was retired, so NOTHING was receipted (§1: "nothing found ->
    // nothing emitted") — asserted on the retire receipts specifically,
    // since the accepted commit above emits its own.
    expect(receiptsOfKind("retire")).toStrictEqual([]);
    expect(receiptsOfKind("handoff-dropped")).toStrictEqual([]);
  });

  it("an unclaimed entry retires with claimState unclaimed", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);

    store.retire([{ sessionKey: run.startedAt, revision: 0 }], "today-discard");

    expect(receiptsOfKind("retire")).toStrictEqual([
      {
        kind: "retire",
        sessionKey: run.startedAt,
        authorizedRevision: 0,
        retiredRevision: 0,
        superseded: false,
        claimState: "unclaimed",
        reason: "today-discard",
      },
    ]);
  });

  it("a claimed-then-abandoned entry retires with claimState claimed (an abandon-counted drop) for any reason other than save-success", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    store.claim(run.startedAt, 0);

    store.retire(
      [{ sessionKey: run.startedAt, revision: 0 }],
      "manual-discard",
    );

    expect(receiptsOfKind("retire")[0]!.claimState).toBe("claimed");
    expect(receiptsOfKind("retire")[0]!.claimedRenderedRevision).toBe(0);
  });

  it("a save-success retire on the claimed revision reports consumed and emits NO handoff-dropped receipt", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    store.claim(run.startedAt, 0);

    store.retire([{ sessionKey: run.startedAt, revision: 0 }], "save-success");

    expect(receiptsOfKind("retire")).toStrictEqual([
      {
        kind: "retire",
        sessionKey: run.startedAt,
        authorizedRevision: 0,
        retiredRevision: 0,
        superseded: false,
        claimState: "consumed",
        claimedRenderedRevision: 0,
        reason: "save-success",
      },
    ]);
    expect(receiptsOfKind("handoff-dropped")).toStrictEqual([]);
  });

  // §6/§10 row 3, ratified condition 1: a producer update landed AFTER the
  // consumer claimed but BEFORE it saved — save-success still proceeds
  // (never rejected), consumed by construction, and the richer revision
  // is counted.
  it("a save-success retire against a RICHER current revision (a late producer update after the claim) reports consumed, superseded, and a handoff-dropped receipt naming both revisions", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run); // revision 0, claimed here
    store.claim(run.startedAt, 0);
    store.commit(run.startedAt, 0, freshRun(run.startedAt)); // revision 1, unclaimed richer update

    store.retire([{ sessionKey: run.startedAt, revision: 0 }], "save-success");

    expect(receiptsOfKind("retire")).toStrictEqual([
      {
        kind: "retire",
        sessionKey: run.startedAt,
        authorizedRevision: 0,
        retiredRevision: 1,
        superseded: true,
        claimState: "consumed",
        claimedRenderedRevision: 0,
        reason: "save-success",
      },
    ]);
    expect(receiptsOfKind("handoff-dropped")).toStrictEqual([
      {
        kind: "handoff-dropped",
        reason: "richer-at-save",
        sessionKey: run.startedAt,
        claimedRevision: 0,
        currentRevision: 1,
      },
    ]);
  });

  it("a non-save-success retire against a superseded revision still proceeds (§1: superseded never rejects) and reports superseded without a handoff-dropped receipt", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    store.commit(run.startedAt, 0, freshRun(run.startedAt)); // now revision 1

    store.retire(
      [{ sessionKey: run.startedAt, revision: 0 }],
      "connect-guard-armed",
    );

    expect(receiptsOfKind("retire")[0]).toMatchObject({
      retiredRevision: 1,
      superseded: true,
      reason: "connect-guard-armed",
    });
    expect(receiptsOfKind("handoff-dropped")).toStrictEqual([]);
  });

  it("the abandoned-claim count: three claimed sessions retired for reasons other than save-success all count as claimed drops, a fourth save-success does not", () => {
    const keys = [
      "2026-08-05T12:00:00.000Z",
      "2026-08-05T13:00:00.000Z",
      "2026-08-05T14:00:00.000Z",
      "2026-08-05T15:00:00.000Z",
    ];
    const reasons = [
      "monitor-discard",
      "manual-discard",
      "today-discard",
      "save-success",
    ];
    for (let i = 0; i < keys.length; i++) {
      const run = freshRun(keys[i]!);
      store.commit(run.startedAt, null, run);
      store.claim(run.startedAt, 0);
      store.retire([{ sessionKey: run.startedAt, revision: 0 }], reasons[i]!);
    }

    const abandonedCount = receiptsOfKind("retire").filter(
      (r) => r.claimState === "claimed",
    ).length;
    const consumedCount = receiptsOfKind("retire").filter(
      (r) => r.claimState === "consumed",
    ).length;
    expect(abandonedCount).toBe(3);
    expect(consumedCount).toBe(1);
  });

  it("retire releases the claim: a subsequent create for the SAME key (after tombstoning aside) starts unclaimed again in a fresh scenario", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    store.claim(run.startedAt, 0);
    store.retire([{ sessionKey: run.startedAt, revision: 0 }], "today-discard");

    // A DIFFERENT key, never claimed, retiring afterward proves the
    // claims map isn't leaking cross-key state.
    const other = freshRun("2026-08-06T12:00:00.000Z");
    store.commit(other.startedAt, null, other);
    store.retire(
      [{ sessionKey: other.startedAt, revision: 0 }],
      "today-discard",
    );

    expect(receiptsOfKind("retire")[1]!.claimState).toBe("unclaimed");
  });
});

describe("claim — registration, idempotence, replacement", () => {
  it("registers without touching revision and cannot fail even against a key the store has never heard of", () => {
    expect(() => store.claim("nonexistent-key", 0)).not.toThrow();
    expect(receiptsOfKind("claim")).toStrictEqual([
      { kind: "claim", sessionKey: "nonexistent-key", renderedRevision: 0 },
    ]);
  });

  it("is idempotent by value — an identical re-claim (StrictMode double-invoke) emits no second receipt", () => {
    store.claim("k", 3);
    store.claim("k", 3);
    expect(receiptsOfKind("claim")).toHaveLength(1);
  });

  it("a new claim (different renderedRevision) replaces the old one and emits a fresh receipt", () => {
    store.claim("k", 0);
    store.claim("k", 1);
    expect(receiptsOfKind("claim")).toStrictEqual([
      { kind: "claim", sessionKey: "k", renderedRevision: 0 },
      { kind: "claim", sessionKey: "k", renderedRevision: 1 },
    ]);
  });
});

describe("retryDurable (§1/§7) — never bumps revision", () => {
  it("re-attempts the durable write of the CURRENT memory entry and updates the cached verdict without touching revision", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    expect(store.read(run.startedAt)!.revision).toBe(0);
    expect(store.cachedVerdict(run.startedAt)).toBe("failed");

    vi.restoreAllMocks();
    const verdict = store.retryDurable(run.startedAt);

    expect(verdict).toBe("saved");
    expect(store.cachedVerdict(run.startedAt)).toBe("saved");
    expect(store.durableState(run.startedAt)).toStrictEqual({
      durableRevision: 0,
      durableComplete: true,
    });
    // THE headline case (§1): the revision is UNCHANGED — a later
    // producer commit must still see revision 0 as current, not stale.
    expect(store.read(run.startedAt)!.revision).toBe(0);
    expect(receiptsOfKind("retry-durable")).toStrictEqual([
      { kind: "retry-durable", sessionKey: run.startedAt, verdict: "saved" },
    ]);

    // The headline-loss case this exists to prevent: a producer commit
    // immediately after Retry, at the SAME expectedRevision the hook's
    // ref still holds, must be ACCEPTED, not refused stale.
    const nextUpdate = store.commit(run.startedAt, 0, run);
    expect(nextUpdate.accepted).toBe(true);
  });

  it("returns null when there is nothing current for that key to retry", () => {
    expect(store.retryDurable("never-existed")).toBeNull();
    expect(receiptsOfKind("retry-durable")).toStrictEqual([]);
  });

  it("returns null after the key has been retired", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    store.retire([{ sessionKey: run.startedAt, revision: 0 }], "today-discard");

    expect(store.retryDurable(run.startedAt)).toBeNull();
  });
});

describe("hydration — outside render, §8", () => {
  it("read() before ANY non-render access returns null even though valid durable bytes exist — the render-safety property", async () => {
    const run = freshRun(t0.toISOString());
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    await freshStore(); // re-import AFTER seeding storage, nothing has hydrated yet

    // Simulates many repeated render-context reads (StrictMode's double
    // render, or ordinary re-renders) — none of them may hydrate.
    expect(store.read()).toBeNull();
    expect(store.read()).toBeNull();
    expect(store.read(run.startedAt)).toBeNull();
    expect(receipts).toStrictEqual([]); // hydration never even attempted

    // The NON-render path (a guard) is what actually discovers it.
    expect(store.currentUnretired()).toStrictEqual({
      sessionKey: run.startedAt,
      revision: 0,
      run,
    });
    // And now that hydration has happened, read() serves it too.
    expect(store.read()).toStrictEqual({
      sessionKey: run.startedAt,
      revision: 0,
      run,
    });
  });

  // task-2 review, finding I1: `hydrate()` is the EXPLICIT non-render
  // trigger Task 3/4 must call before any render that needs to see a
  // durable-only record (`Today.tsx`/`LogSession.tsx`'s own mount
  // snapshots are both render-context reads via `useState` lazy init —
  // confirmed real by the review, not a hypothetical).
  it("hydrate() is the explicit, idempotent, non-render trigger — read() sees nothing before it, everything after", async () => {
    const run = freshRun(t0.toISOString());
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    await freshStore();

    expect(store.read()).toBeNull(); // the render-context read, before hydrate()
    expect(receipts).toStrictEqual([]);

    store.hydrate();

    expect(store.read()).toStrictEqual({
      sessionKey: run.startedAt,
      revision: 0,
      run,
    });

    // Idempotent: a second call does not re-read storage — mutate the
    // physical bytes behind the store's back and confirm they're ignored.
    const different = freshRun("2026-08-09T00:00:00.000Z");
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(different));
    store.hydrate();

    expect(store.read()!.sessionKey).toBe(run.startedAt);
  });

  // task-2 review, finding I1: the §5 manual-door row needs a KEY-FILTERED
  // non-render read ("the stored key only"). `currentUnretired(sessionKey)`
  // is that read, mirroring `read()`'s own filtering.
  it("currentUnretired(sessionKey) filters the same way read() does — a mismatched key returns null even though something else is current", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);

    expect(store.currentUnretired("some-other-key")).toBeNull();
    expect(store.currentUnretired(run.startedAt)).toStrictEqual({
      sessionKey: run.startedAt,
      revision: 0,
      run,
    });
    expect(store.currentUnretired()).not.toBeNull();
  });

  it("malformed bytes: a render-context read() can NEVER trigger the self-clear — the physical bytes survive untouched across repeated read() calls", async () => {
    localStorage.setItem(MONITOR_RUN_KEY, "{not json");
    await freshStore();

    expect(store.read()).toBeNull();
    expect(store.read()).toBeNull();
    expect(receipts).toStrictEqual([]); // still never hydrated
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe("{not json"); // untouched

    // The deferral: hydration (the non-render path) is what finally
    // notices, receipts it, and STILL does not clear the bytes.
    expect(store.currentUnretired()).toBeNull();
    expect(receiptsOfKind("hydration-malformed")).toStrictEqual([
      { kind: "hydration-malformed", rawPreview: "{not json", rawLength: 9 },
    ]);
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe("{not json");
  });

  it("hydration-malformed truncates a large payload to a short preview plus the true length, never the full bytes", async () => {
    const huge = "x".repeat(5000);
    localStorage.setItem(MONITOR_RUN_KEY, huge);
    await freshStore();

    store.currentUnretired();

    const [receipt] = receiptsOfKind("hydration-malformed");
    expect(receipt).toBeDefined();
    expect(receipt!.rawPreview).toBe("x".repeat(200));
    expect(receipt!.rawPreview.length).toBe(200);
    expect(receipt!.rawLength).toBe(5000);
  });

  // task-2 review, finding I2: the ORIGINAL claim ("the next accepted
  // commit or the next retire is what eventually replaces [malformed
  // bytes]") was only half true. Split into the two legs the review
  // named, each asserted on its own terms.
  describe("the deferred malformed-clear (I2) — exactly what is and isn't reachable", () => {
    it("the COMMIT leg: an accepted commit whose durable write LANDS physically overwrites the malformed bytes (the slot is single)", async () => {
      localStorage.setItem(MONITOR_RUN_KEY, "{not json");
      await freshStore();
      store.currentUnretired(); // discovers + receipts, does NOT clear

      const run = freshRun(t0.toISOString());
      const result = store.commit(run.startedAt, null, run);

      expect(result).toStrictEqual({
        accepted: true,
        revision: 0,
        verdict: "saved",
      });
      expect(JSON.parse(localStorage.getItem(MONITOR_RUN_KEY)!)).toStrictEqual(
        JSON.parse(JSON.stringify(run)),
      );
    });

    it("the COMMIT leg's flag actually clears once the write lands — a LATER retire of the fresh entry does not ALSO re-sweep the slot it just wrote", async () => {
      localStorage.setItem(MONITOR_RUN_KEY, "{not json");
      await freshStore();
      store.currentUnretired();

      const run = freshRun(t0.toISOString());
      store.commit(run.startedAt, null, run); // write lands — should clear the pending flag

      const removeSpy = vi.spyOn(Storage.prototype, "removeItem");
      store.retire(
        [{ sessionKey: run.startedAt, revision: 0 }],
        "today-discard",
      );

      // Exactly the entry's OWN removal — a still-set flag would fire the
      // sweep's own removeItem call first, then the entry's, i.e. twice.
      expect(removeSpy).toHaveBeenCalledTimes(1);
    });

    it("the COMMIT leg is CONDITIONAL on the write landing — a commit whose durable write also fails leaves the old garbage untouched", async () => {
      localStorage.setItem(MONITOR_RUN_KEY, "{not json");
      await freshStore();
      store.currentUnretired();

      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
      const run = freshRun(t0.toISOString());
      const result = store.commit(run.startedAt, null, run);

      expect(result).toStrictEqual({
        accepted: true,
        revision: 0,
        verdict: "failed",
      });
      expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe("{not json");
    });

    it("the RETIRE leg NOW sweeps the malformed slot even when retire's own set matches nothing at all — previously permanently unreachable (proven on review: three retires, bytes unchanged)", async () => {
      localStorage.setItem(MONITOR_RUN_KEY, "{not json");
      await freshStore();
      store.currentUnretired(); // current stays null — nothing for retire to "find"

      store.retire(
        [{ sessionKey: "irrelevant-key", revision: 0 }],
        "today-discard",
      );

      expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
      // Still no spurious "retire" receipt for a key nothing found.
      expect(receiptsOfKind("retire")).toStrictEqual([]);
    });

    it("the RETIRE leg's sweep is a one-time thing — repeated retires afterward don't keep re-attempting removeItem", async () => {
      localStorage.setItem(MONITOR_RUN_KEY, "{not json");
      await freshStore();
      store.currentUnretired();
      const removeSpy = vi.spyOn(Storage.prototype, "removeItem");

      store.retire([], "today-discard");
      store.retire([], "today-discard");
      store.retire([], "today-discard");

      expect(removeSpy).toHaveBeenCalledTimes(1);
    });

    it("the RETIRE leg's sweep itself is wrapped: a throwing removeItem during the sweep is absorbed and receipted, never thrown out of retire()", async () => {
      localStorage.setItem(MONITOR_RUN_KEY, "{not json");
      await freshStore();
      store.currentUnretired();
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new DOMException("boom", "SecurityError");
      });

      expect(() => store.retire([], "today-discard")).not.toThrow();
      expect(receiptsOfKind("storage-getter-error")).toStrictEqual([
        { kind: "storage-getter-error", operation: "remove" },
      ]);
    });
  });

  it("a valid record with a malformed nested series still hydrates, with series stripped (stripMalformedSeries)", async () => {
    const run = freshRun(t0.toISOString());
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, series: "not-an-object" }),
    );
    await freshStore();

    const entry = store.currentUnretired();
    expect(entry).not.toBeNull();
    expect(entry!.run.series).toBeUndefined();
    expect(receiptsOfKind("hydration-malformed")).toStrictEqual([]);
  });

  it("valid JSON that is NOT a MonitorRun shape at all (a bare number) also receipts hydration-malformed and treats the durable tier as absent", async () => {
    localStorage.setItem(MONITOR_RUN_KEY, "42");
    await freshStore();

    expect(store.currentUnretired()).toBeNull();
    expect(receiptsOfKind("hydration-malformed")).toStrictEqual([
      { kind: "hydration-malformed", rawPreview: "42", rawLength: 2 },
    ]);
    // Never cleared during hydration either — same deferral as garbage
    // JSON (the loader's own historical self-clear anti-pattern).
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBe("42");
  });

  it("hydration runs at MOST ONCE per process — a second non-render call never re-reads storage", async () => {
    const run = freshRun(t0.toISOString());
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    await freshStore();
    store.currentUnretired(); // hydrates

    // Mutate storage behind the store's back — a real hydration would
    // pick this up; the ALREADY-hydrated store must not.
    const different = freshRun("2026-08-09T00:00:00.000Z");
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(different));

    expect(store.currentUnretired()!.sessionKey).toBe(run.startedAt);
    expect(store.read()!.sessionKey).toBe(run.startedAt);
  });

  it("absent durable bytes hydrate to null cleanly (no receipt, no throw)", () => {
    expect(store.currentUnretired()).toBeNull();
    expect(receipts).toStrictEqual([]);
  });

  it("a saved-without-series record hydrates with durableComplete: false, inferred from seriesDropped", async () => {
    const run = freshRun(t0.toISOString(), { seriesDropped: true });
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run));
    await freshStore();

    store.currentUnretired();

    expect(store.durableState(run.startedAt)).toStrictEqual({
      durableRevision: 0,
      durableComplete: false,
    });
    expect(store.cachedVerdict(run.startedAt)).toBe("saved-without-series");
  });
});

describe("the storage getter SecurityError wrap (§1 WHATWG primary)", () => {
  it("a throwing localStorage GETTER during hydration is absorbed: treated as durable-absent, receipted, never an unhandled throw", () => {
    vi.spyOn(globalThis, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(() => store.currentUnretired()).not.toThrow();
    expect(store.currentUnretired()).toBeNull();
    expect(receiptsOfKind("storage-getter-error")).toStrictEqual([
      { kind: "storage-getter-error", operation: "get" },
    ]);
  });

  it("a throwing localStorage GETTER during a commit's durable attempt still accepts the entry in memory, with verdict failed — never an unhandled throw", () => {
    vi.spyOn(globalThis, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const run = freshRun(t0.toISOString());

    let result: ReturnType<StoreModule["commit"]> | undefined;
    expect(() => {
      result = store.commit(run.startedAt, null, run);
    }).not.toThrow();

    expect(result).toStrictEqual({
      accepted: true,
      revision: 0,
      verdict: "failed",
    });
    // Memory tier is a plain JS Map/variable, never touches `localStorage`
    // at all — it is unaffected by the getter being broken.
    expect(store.currentUnretired()).toStrictEqual({
      sessionKey: run.startedAt,
      revision: 0,
      run,
    });
  });

  it("a throwing localStorage GETTER during retire's removal is absorbed and receipted as operation remove", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);
    vi.spyOn(globalThis, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(() =>
      store.retire(
        [{ sessionKey: run.startedAt, revision: 0 }],
        "today-discard",
      ),
    ).not.toThrow();
    expect(receiptsOfKind("storage-getter-error")).toContainEqual({
      kind: "storage-getter-error",
      operation: "remove",
    });
  });
});

describe("read() — precedence (§8)", () => {
  // task-2 review, minor: renamed from "memory wins on ties" — that is
  // NOT what this test proves, and per §8's own tie language it cannot
  // be proven at all against THIS module's design. §8 says "equal
  // revisions — memory wins," which presumes memory and the hydrated
  // durable baseline can be two DISTINCT candidates at the same revision
  // simultaneously. This module has no such pair: `current` is a single
  // reference, hydration only ever populates it when `current === null`
  // (see `ensureHydrated`'s own guard), and every later mutation replaces
  // it outright via `commit`/`retire` — there is never a moment where a
  // memory entry and a durable entry of the SAME revision both exist for
  // `read()` to choose between. What this test actually shows is the
  // ordinary, un-tied case: a later commit (revision 0 -> 1) replaces the
  // hydrated baseline with a genuinely different object, proving the live
  // entry serves afterward rather than a stale hydrated reference — the
  // tie itself is unrepresentable by construction, which is a STRONGER
  // guarantee than resolving it correctly would be.
  it("a later commit replaces the hydrated durable baseline outright — there is no separate durable candidate left for read() to fall back to", async () => {
    const durableCopy = freshRun(t0.toISOString(), {
      deviceName: "durable device",
    });
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(durableCopy));
    await freshStore();
    store.currentUnretired(); // hydrates: current becomes the durable copy at revision 0

    // A fresh commit at the SAME key/revision-baseline (0 -> 1) replaces
    // memory with a DIFFERENT object — the reference the hydrated durable
    // entry held is gone, proving the live memory entry served afterward,
    // not a stale hydrated reference.
    const memoryCopy = freshRun(t0.toISOString(), {
      deviceName: "memory device",
    });
    store.commit(t0.toISOString(), 0, memoryCopy);

    expect(store.read()!.run.deviceName).toBe("memory device");
  });

  it("read(sessionKey) filters — a mismatched key returns null rather than some other key's entry", () => {
    const run = freshRun(t0.toISOString());
    store.commit(run.startedAt, null, run);

    expect(store.read("some-other-key")).toBeNull();
    expect(store.read(run.startedAt)).not.toBeNull();
  });
});

describe("the single-unretired-session invariant, end to end", () => {
  it("retiring the current key frees the slot for a genuinely different key to be created", () => {
    const first = freshRun("2026-08-05T12:00:00.000Z");
    store.commit(first.startedAt, null, first);
    store.retire(
      [{ sessionKey: first.startedAt, revision: 0 }],
      "connect-guard-armed",
    );

    const second = freshRun("2026-08-05T13:00:00.000Z");
    const result = store.commit(second.startedAt, null, second);

    expect(result.accepted).toBe(true);
    expect(store.currentUnretired()!.sessionKey).toBe(second.startedAt);
  });

  it("at most one unretired session exists at any time — a second concurrent create is always refused, regardless of how many updates the first has accumulated", () => {
    const first = freshRun("2026-08-05T12:00:00.000Z");
    store.commit(first.startedAt, null, first);
    store.commit(first.startedAt, 0, first);
    store.commit(first.startedAt, 1, first);

    const second = freshRun("2026-08-05T13:00:00.000Z");
    const result = store.commit(second.startedAt, null, second);

    expect(result).toStrictEqual({
      accepted: false,
      reason: "second-key",
      current: { sessionKey: first.startedAt, revision: 2, run: first },
    });
  });

  // task-2 review, finding I1/minor: the invariant's own ONLY
  // production-reachable form — a rower reloads with yesterday's session
  // still unretired in DURABLE storage (never explicitly committed or
  // claimed THIS process), and the very next thing that happens is a
  // fresh Connect attempting to CREATE today's session. Every other test
  // in this file establishes the "first" entry via an explicit `commit`
  // call first; this is the one path where the invariant's protection
  // comes ENTIRELY from hydration, with no prior commit in this process
  // at all.
  it("a durable session from a PRIOR process (hydrated, never committed this process) still refuses a same-process create for a different key", async () => {
    const yesterday = freshRun("2026-08-04T09:00:00.000Z");
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(yesterday));
    await freshStore(); // fresh process — nothing committed yet

    const today = freshRun("2026-08-05T09:00:00.000Z");
    const result = store.commit(today.startedAt, null, today);

    expect(result).toStrictEqual({
      accepted: false,
      reason: "second-key",
      current: { sessionKey: yesterday.startedAt, revision: 0, run: yesterday },
    });
    expect(receiptsOfKind("store-second-key-refused")).toStrictEqual([
      {
        kind: "store-second-key-refused",
        sessionKey: today.startedAt,
        existingKey: yesterday.startedAt,
      },
    ]);
  });
});
