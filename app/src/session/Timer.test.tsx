import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, Step, WorkoutType } from "../../domain/types.js";
import {
  buildDraft,
  loadDraft,
  saveDraft,
  startDraft,
  type SessionDraft,
} from "./draft";
import { buildFreeRowRun, buildRun, type EnginePhase } from "./engine";
import { loadRun, saveRun, type SessionRun } from "./run";
import {
  atRuleBodies,
  commentStrippedSource,
  type CssRule,
  cssRules,
  scopedRuleBodies,
} from "../test/cssView";
import {
  hasRemainingEstimate,
  isSuspectActual,
  phaseKindWord,
  segmentKind,
  totalSessionSeconds,
} from "./Timer";

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
const FIXED_NOW = new Date("2026-08-01T12:00:00.000Z");

function library(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return w;
}

// The phase-kind matrix fixture — the brief's own "a real starter workout
// with an added effort step via the draft," extended one further step for
// distance (no single library step list otherwise exercises
// work-effort-time/work-split/rest/work-effort-distance all in one run).
// Hoarfrost's own real split-ref work step (time, spm 22, its own embedded
// 5' rest) supplies work-split/rest; a distance split-ref step and an
// effort-ref step are appended directly onto the draft. Phase 0's 4:00 EASY
// piece was a `wu` row until 2026-08-09, then the rower's warm-up SETTING
// (`buildRun`'s fourth argument) until Phase WU deleted that too; it is an
// authored effort step now, with the same 240 s, so every phase index,
// STEP N OF M and countdown below is unchanged. The reps marker is
// deliberately NOT
// reused here — appending steps after a LIVE "reps" marker would repeat
// them too (domain/expand.ts's own `liveIndices`), doubling the appended
// phases for no reason; this fixture wants each kind exactly once.
//
// Resulting phases (baselines {k2:100,k6:120}). Ui-fix round, Item
// 1: the label/UP NEXT value is the EXACT split, never a "lo–hi" band; the
// TimerTargets sub-line is the ref it was resolved from instead, uppercased
// (refLabel(ref).toUpperCase()).
//   0 work     240s   effort "EASY"
//   1 work     720s   split  "2:12.0", ref "6K +12"  spm 22
//   2 rest     300s   "Rest"
//   3 work     —      distance 500m, split "1:40.0", ref "2K"
//   4 work     60s    effort "ALL OUT"
function kindMatrixDraft(): SessionDraft {
  const hoarfrost = library("Hoarfrost");
  const splitWork = hoarfrost.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;
  return buildDraft({
    id: "id-kind-matrix",
    title: hoarfrost.title,
    type: hoarfrost.type as WorkoutType,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { effort: "min" },
      },
      splitWork,
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 0 },
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
      },
    ],
  });
}

// No library workout authors a "test" (open-ended) step (Task 1's own
// report: none exists in the seeded library) — a hand-built minimal draft.
// Its 2:00 EASY opener came from the warm-up SETTING until Phase WU
// deleted it; an authored effort step gives the same two-phase run.
function testKindDraft(): SessionDraft {
  return buildDraft({
    id: "id-test-kind",
    title: "Sprint Check",
    type: "AN",
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "min" },
      },
      { k: "test", label: "2k test" },
    ],
  });
}

function buildAndSaveRun(
  draft: SessionDraft,
  now = FIXED_NOW,
  baselines: Baselines | null = BASELINES,
): SessionRun {
  saveDraft(startDraft(draft));
  const run = buildRun(draft, baselines, now);
  saveRun(run);
  return run;
}

function matrixRun(now = FIXED_NOW): SessionRun {
  return buildAndSaveRun(kindMatrixDraft(), now, BASELINES);
}

function testKindRun(): SessionRun {
  return buildAndSaveRun(testKindDraft(), FIXED_NOW, BASELINES);
}

function onboardingShapedRun(): SessionRun {
  return buildAndSaveRun(onboardingShapedDraft(), FIXED_NOW, null);
}

// Phase 6I: the shape Task 3 seeds as the two designated onboarding
// workouts (domain/onboarding.ts) — ONE distance work step at an effort
// ref, nothing after it (no reps, no embedded rest), preceded here by a
// 10:00 EASY time piece so the run has a priceable phase ahead of the
// unpriceable one (that lead used to come from the warm-up SETTING; Phase
// WU made it an authored step).
// Hand-built because the seed doesn't exist yet — this is the one shape in
// the whole app where a distance work phase is ALSO the run's own final
// phase, which is what actually exercises `hasRemainingEstimate`'s false
// branch: no real shipped effort-only workout (Dust Storm, Heat
// Lightning, …) has this shape, since every one of them embeds a rest
// phase after every occurrence including the last (see the real-fixture
// regression test below).
function onboardingShapedDraft(): SessionDraft {
  return buildDraft({
    id: "id-onboarding-shaped",
    title: "6K Test",
    type: "O2",
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { effort: "min" },
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 6000 },
        ref: { effort: "min" },
      },
    ],
  });
}

// Re-seeds `run` at a given phase index as if it had just started at
// `startedAt` — a direct construction for test SETUP only. engine.test.ts
// already owns proving `tick`/`advance` walk to a state like this
// correctly; Timer.tsx's own job is rendering a `SessionRun`, not deriving
// one.
function runAtIndex(
  run: SessionRun,
  index: number,
  startedAt: Date = FIXED_NOW,
): SessionRun {
  const seeded: SessionRun = {
    ...run,
    index,
    phaseStartedAt: startedAt.toISOString(),
    pausedAt: null,
    pausedTotalMs: 0,
  };
  saveRun(seeded);
  return seeded;
}

/** UP NEXT's own combined value (connected-revamp Task 6): `upNextText`
 *  plus, when there is one, `thenNextText` behind a " · then " run — ONE
 *  value span now (`UpNextStrip.tsx`'s own comment), not a value plus a
 *  separately-matchable second line, so `screen.getByText` can no longer
 *  isolate either half on its own. Reading `.timer-upnext-value`'s full
 *  `textContent` directly is the exact and unambiguous replacement. */
function upNextFullText(): string {
  return document.querySelector(".timer-upnext-value")?.textContent ?? "";
}

function mockKeepAwake() {
  const keepAwakeOn = vi.fn(async () => {});
  const keepAwakeOff = vi.fn(async () => {});
  vi.doMock("../adapters/keepAwake", () => ({ keepAwakeOn, keepAwakeOff }));
  return { keepAwakeOn, keepAwakeOff };
}

async function renderTimer(initialPath = "/session/run") {
  const { default: Timer } = await import("./Timer");
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/session/run" element={<Timer />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
        <Route path="/session/log" element={<p>SUMMARY SCREEN</p>} />
        <Route path="/justrow/log" element={<p>JUST ROW LOG SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

// A minimal but realistic EnginePhase builder, mirroring
// TimerTargets.test.tsx's own — every field the real engine always stamps,
// with the caller overriding only what a given test cares about.
function phase(overrides: Partial<EnginePhase>): EnginePhase {
  return { type: "work", label: "", originalIndex: 0, ...overrides };
}

// Fix round (spec review F6): isSuspectActual is now two-sided — elapsed
// under HALF the estimate is exactly as suspect as elapsed over DOUBLE it
// (the review's own live probe: NEXT at 1s elapsed on a 100s-estimate piece
// used to record splitSeconds ≈ 1.0, no staging at all). Both boundaries
// are exercised at just-under/at/just-over, matching the "boundary itself
// is not suspect" rule the upper bound already established.
describe("isSuspectActual", () => {
  // 500m @ 2k+0 (baselines k2=100) -> estimate = (500/500)*100 = 100s;
  // half = 50s, double = 200s.
  const distancePhase = phase({ meters: 500, targetSplit: 100 });

  it("is false well within both bounds", () => {
    expect(isSuspectActual(distancePhase, 75)).toBe(false);
  });

  it("is false for a phase with no estimate at all (phaseSeconds returns null)", () => {
    const openEnded = phase({ type: "test", label: "All out" }); // no seconds, no meters
    expect(isSuspectActual(openEnded, 999_999)).toBe(false);
  });

  describe("the upper bound (2x the estimate)", () => {
    it("is false EXACTLY at 2x — the boundary itself is not suspect", () => {
      expect(isSuspectActual(distancePhase, 200)).toBe(false);
    });

    it("is true one second past 2x", () => {
      expect(isSuspectActual(distancePhase, 201)).toBe(true);
    });

    it("is false one second under 2x", () => {
      expect(isSuspectActual(distancePhase, 199)).toBe(false);
    });
  });

  describe("the lower bound (half the estimate) — F6", () => {
    it("is false EXACTLY at half — the boundary itself is not suspect", () => {
      expect(isSuspectActual(distancePhase, 50)).toBe(false);
    });

    it("is true one second under half", () => {
      expect(isSuspectActual(distancePhase, 49)).toBe(true);
    });

    it("is false one second over half", () => {
      expect(isSuspectActual(distancePhase, 51)).toBe(false);
    });

    // The review's own live-probe example, pinned directly: 1s elapsed on
    // a 100s-estimate piece — a physically absurd 500m-in-one-second split
    // that used to record with NO staging at all.
    it("is true for the review's own 1s-on-a-100s-estimate mistap", () => {
      expect(isSuspectActual(distancePhase, 1)).toBe(true);
    });
  });
});

// PHASE WU, THE LEGACY-RECORD GUARD. `SessionRun` is PERSISTED
// (`src/session/run.ts`), so a run stored before Phase WU can still hand
// these two functions `type: "warmup"` — a value the shrunken
// `Phase["type"]` union no longer admits, which is why the cast is
// required to write the test at all. Both switches carry a `default` arm
// for exactly this: without one, an exhaustive switch returns `undefined`
// and the timer renders `STEP 1 OF 5 · undefined` over a dot the strip
// cannot paint. "WORK"/"work" is the honest answer — Phase WU's whole
// ruling is that a warm-up piece IS work.
describe("the phase-word helpers survive a legacy persisted warm-up phase", () => {
  const legacyWarmup = "warmup" as EnginePhase["type"];

  it("phaseKindWord reads WORK for it, never undefined", () => {
    expect(phaseKindWord(legacyWarmup)).toBe("WORK");
  });

  it("segmentKind reads work for it, never undefined", () => {
    expect(segmentKind(legacyWarmup)).toBe("work");
  });

  it("still tells REST and TEST apart from work — the default arm is a fallback, not a collapse", () => {
    expect(phaseKindWord("rest")).toBe("REST");
    expect(phaseKindWord("test")).toBe("TEST");
    expect(phaseKindWord("work")).toBe("WORK");
    expect(segmentKind("rest")).toBe("rest");
    expect(segmentKind("test")).toBe("work");
    expect(segmentKind("work")).toBe("work");
  });
});

describe("totalSessionSeconds", () => {
  it("sums every phase's full duration from the start: fixed seconds + a distance estimate + zero for an open-ended phase", () => {
    const phases: EnginePhase[] = [
      phase({ seconds: 300, label: "EASY" }), // Phase WU: was type "warmup"

      // (2000/500)*120 = 480
      phase({ meters: 2000, targetSplit: 120, label: "2:00.0" }),
      phase({ type: "test", label: "All out" }), // no seconds/meters -> 0
    ];
    const run = { phases } as SessionRun; // only `.phases` is read
    expect(totalSessionSeconds(run)).toBe(300 + 480 + 0);
  });

  it("is 0 for a run with no phases (never divides by a negative/undefined)", () => {
    expect(totalSessionSeconds({ phases: [] } as unknown as SessionRun)).toBe(
      0,
    );
  });
});

describe("hasRemainingEstimate — Phase 6I's shared gate for TOTAL LEFT + the phase bar", () => {
  const priceable = phase({ seconds: 300, label: "EASY" }); // Phase WU: was "warmup"
  // An effort work phase with null-baselines: no targetSplit, no seconds,
  // no meters priced — exactly what `phases()` (domain/expand.ts) produces
  // for a distance-duration effort step under null baselines.
  const unpriceable = phase({
    type: "work",
    targetKind: "effort",
    meters: 6000,
    label: "EASY",
  });

  it("is true when the CURRENT phase itself has an estimate", () => {
    expect(hasRemainingEstimate([priceable, unpriceable], 0)).toBe(true);
  });

  it("is true when the current phase has none but a LATER phase does", () => {
    expect(hasRemainingEstimate([unpriceable, priceable], 0)).toBe(true);
  });

  it("is false when every phase from fromIndex onward is unpriceable", () => {
    expect(hasRemainingEstimate([priceable, unpriceable], 1)).toBe(false);
  });

  it("is true for a lone priceable phase (mutation guard: an off-by-one on the loop bound would read this as false)", () => {
    expect(hasRemainingEstimate([priceable], 0)).toBe(true);
  });

  it("is false for an empty phase list", () => {
    expect(hasRemainingEstimate([], 0)).toBe(false);
  });
});

describe("Timer — guards", () => {
  // Real timers: these two only need <Navigate>'s own effect to settle,
  // the same precedent Countdown.test.tsx's identical guard tests use.
  it("redirects to /today when there is no draft and no run", async () => {
    mockKeepAwake();
    await renderTimer();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  // Resilience 5 (spec): "sessionRun with unknown v or malformed shape ->
  // null + clear, the timer redirects to /today, the DRAFT survives." A
  // draft with no run record at all is the simplest instance of this —
  // `run.ts`'s own `loadRun` already turns "malformed" into exactly this
  // "null" case, so this is Timer's own contribution: react to a null run.
  it("redirects to /today when a draft exists but the run record doesn't", async () => {
    mockKeepAwake();
    saveDraft(startDraft(kindMatrixDraft()));
    await renderTimer();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    // The draft survives — Resilience 5's other half.
    expect(loadDraft()).not.toBeNull();
  });
});

describe("Timer — phase-kind rendering (never a dash, per kind)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  it("effort time piece: 'EASY' target, 'Free', count-DOWN remaining", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 0);
    await renderTimer();

    // PHASE WU CHANGED BOTH STRINGS. Phase 0 was a warm-up, so the step
    // line read `· WARM-UP` (`phaseKindWord`'s deleted arm) and its target
    // was the warm-up's own `Easy` label. It is an authored EASY effort
    // step now: `· WORK`, and `effortWord`'s uppercase `EASY`.
    expect(screen.getByText("STEP 1 OF 5 · WORK")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("4:00")).toBeInTheDocument(); // 240s remaining
    expect(screen.getByText("EASY")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    // Ui-fix round, Item 1: UP NEXT is exact now, never a "lo–hi" band.
    // Connected-revamp Task 6: the "then" phase (the rest that follows the
    // named work phase) now rides along on the SAME value, duration and
    // all — `phaseAnnouncement`'s own extension.
    expect(upNextFullText()).toBe("WORK 2:12.0 · then REST 5:00");
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("work (split, time): the exact resolved split + its ref sub-line, spm", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1);
    await renderTimer();

    expect(screen.getByText("STEP 2 OF 5 · WORK")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument(); // 720s remaining
    expect(screen.getByText("2:12.0")).toBeInTheDocument();
    // Ui-fix round, Item 1: the sub-line is the ref, uppercased — not a
    // tolerance band.
    expect(screen.getByText("6K +12")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.getByText("spm")).toBeInTheDocument();
    // Fix round (whole-branch review, F4): a rest phase's own resolved
    // `label` is literally "Rest" (domain/expand.ts), which used to render
    // as the redundant "REST Rest" here — deduped to the kind word alone
    // now that it collides with `phaseKindWord`. Connected-revamp Task 6:
    // the collapsed word gains its own duration ("REST 5:00", the rest
    // phase's own `phaseSeconds`), and the phase AFTER it ("WORK 1:40.0")
    // rides along on the same value behind " · then ". The kind and its
    // target are separated by a SPACE, not a second "·" (task-6 fix round,
    // review M2 — revision §3 draws the dot between the two phases only).
    expect(upNextFullText()).toBe("REST 5:00 · then WORK 1:40.0");
    expect(screen.queryByText("REST Rest")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  // Hoarfrost's OWN unmodified reps block (`{k:"reps",count:2}` repeating its
  // one work+rest pair) — the SET N/M segment of the STEP line only ever
  // appears on a phase produced by a live reps marker (domain/expand.ts's
  // own `set` stamping), which `kindMatrixDraft` deliberately avoids
  // reusing (see its own comment) to keep that fixture's phase count exact.
  it("a repeated (SET) phase folds SET i/j into the STEP line", async () => {
    mockKeepAwake();
    const hoarfrost = library("Hoarfrost");
    const draft = buildDraft({
      id: "id-hoarfrost-set",
      title: hoarfrost.title,
      type: hoarfrost.type as WorkoutType,
      steps: hoarfrost.steps,
    });
    const run = buildAndSaveRun(draft);
    // Phases: [0 work(set 1/2), 1 rest(set 1/2), 2 work(set 2/2), 3 rest(set 2/2)].
    runAtIndex(run, 0);
    await renderTimer();

    expect(
      screen.getByText("STEP 1 OF 4 · WORK · SET 1/2"),
    ).toBeInTheDocument();
  });

  it("rest: 'Rest' target, 'Free'", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 2);
    await renderTimer();

    expect(screen.getByText("STEP 3 OF 5 · REST")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument(); // 300s remaining
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    // Ui-fix round, Item 1: UP NEXT is exact now, never a "lo–hi" band.
    // The phase after next ("WORK ALL OUT") rides along too.
    expect(upNextFullText()).toBe("WORK 1:40.0 · then WORK ALL OUT");
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("distance: meters folded into the STEP line, count-UP stopwatch, full-width NEXT →", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 3);
    await renderTimer();

    expect(screen.getByText("STEP 4 OF 5 · WORK · 500M")).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument(); // elapsed, not remaining
    expect(screen.getByText("1:40.0")).toBeInTheDocument();
    // Ui-fix round, Item 1: the sub-line is the ref, uppercased. off=0 ->
    // refLabel drops the sign entirely -> just the base, "2K".
    expect(screen.getByText("2K")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    // The phase after next is past the run's own last phase, so the "then"
    // half reads the hardcoded "FINISH" (never `phaseAnnouncement`'s own
    // dedupe/duration logic — `thenNextTextAt`'s own contract).
    expect(upNextFullText()).toBe("WORK ALL OUT · then FINISH");
    // Fix round (spec review F1/F2): distance mode keeps ◀/Pause — only the
    // rightmost control becomes NEXT → instead of ▶.
    expect(screen.getByRole("button", { name: "NEXT →" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous phase" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next phase" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("work (effort): the word only, NEVER the numeric estimate; FINISH past the last phase", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 4);
    await renderTimer();

    expect(screen.getByText("STEP 5 OF 5 · WORK")).toBeInTheDocument();
    // Both the numeral (60s remaining) AND TOTAL LEFT read "1:00" here —
    // this is the LAST phase, so TOTAL LEFT is just its own remainder —
    // scoped to the numeral to avoid colliding with the duplicate text.
    expect(document.querySelector(".timer-time")).toHaveTextContent("1:00");
    expect(screen.getByText("ALL OUT")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("FINISH")).toBeInTheDocument();
    // The estimate behind an effort target (baselines.k2Seconds=100, per
    // pace.ts's estimationSplit for "max") must never surface as text.
    expect(screen.queryByText("1:40.0")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  // The word "then" (handoff §6, restructured connected-revamp Task 6 —
  // see `UpNextStrip.tsx`'s own comment): rendered unconditionally, inside
  // `.timer-upnext-value`'s own text run rather than a second element
  // outside it, and hidden by CSS in portrait (index.css's own base rule
  // for `.timer-upnext-then`; jsdom never applies that rule, so these
  // assertions check the same markup a landscape viewport would actually
  // show). All three of `thenNextText`'s own branches, against the SAME
  // kindMatrixDraft fixture the rest of this describe block already uses.
  describe("the word 'then' — UP NEXT's landscape-only extra text", () => {
    it("names the phase AFTER the one UP NEXT already shows, when both exist", async () => {
      mockKeepAwake();
      const run = matrixRun();
      runAtIndex(run, 0); // next=work(split), afterNext=rest
      await renderTimer();

      // UP NEXT's own value — exact now (ui-fix round, Item 1), never a
      // "lo–hi" band. Same F4 dedupe as upNextText's own rest-phase case
      // elsewhere in this file, applied here via the shared
      // `phaseAnnouncement` helper — plus its Task 6 extension: the
      // collapsed "REST" carries its own duration now.
      expect(upNextFullText()).toBe("WORK 2:12.0 · then REST 5:00");
      expect(upNextFullText()).not.toContain("then REST Rest");
      const then = document.querySelector(".timer-upnext-then")!;
      expect(then.textContent).toBe("then ");
    });

    it("reads 'then FINISH' when the phase after next is the last one", async () => {
      mockKeepAwake();
      const run = matrixRun();
      runAtIndex(run, 3); // next=effort work (the last phase), afterNext=none
      await renderTimer();

      expect(upNextFullText()).toBe("WORK ALL OUT · then FINISH");
      const then = document.querySelector(".timer-upnext-then")!;
      expect(then.textContent).toBe("then ");
    });

    it("renders no 'then' word at all on the last phase — UP NEXT itself already reads FINISH there", async () => {
      mockKeepAwake();
      const run = matrixRun();
      runAtIndex(run, 4); // the last phase
      await renderTimer();

      expect(upNextFullText()).toBe("FINISH"); // upNextText's own value, alone
      expect(
        document.querySelector(".timer-upnext-then"),
      ).not.toBeInTheDocument();
    });
  });

  it("test (open-ended): 'All out' (lowercase, distinct from effort's ALL OUT), 'Free', count-UP, standard controls, NO phase bar or TOTAL LEFT row", async () => {
    mockKeepAwake();
    const run = testKindRun();
    runAtIndex(run, 1);
    await renderTimer();

    expect(screen.getByText("STEP 2 OF 2 · TEST")).toBeInTheDocument();
    // The big numeral still counts up normally (elapsed, no fixed duration
    // to count DOWN from).
    expect(document.querySelector(".timer-time")).toHaveTextContent("0:00");
    // Phase 6I: this phase (a "test" step) has no seconds/meters for
    // `phaseSeconds` to price, AND it's the LAST phase in this fixture —
    // `hasRemainingEstimate` reads false, so BOTH the phase progress bar
    // and the TOTAL LEFT row are absent entirely, never a frozen "0:00"/0%
    // (the pre-Phase-6I behavior this test used to pin).
    expect(document.querySelector(".timer-total")).not.toBeInTheDocument();
    expect(document.querySelector(".timer-phase-bar")).not.toBeInTheDocument();
    expect(screen.getByText("All out")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("FINISH")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous phase" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "NEXT →" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  // Phase 6I: at the EASY opener (phase 0) of the same fixture, the test phase
  // ahead has no estimate but that doesn't matter yet — nothing here reads
  // "remaining" per-phase, only whether ANYTHING from the current index
  // onward prices. The opener itself has a real duration, so both rows
  // still render normally here (this test would fail under a "whole
  // session" reading of the gate, which the module header's own comment
  // explains is deliberately NOT what this checks).
  it("still shows TOTAL LEFT and the phase bar during the opener, even though the test phase ahead of it has no estimate", async () => {
    mockKeepAwake();
    const run = testKindRun();
    runAtIndex(run, 0);
    await renderTimer();

    expect(screen.getByText("STEP 1 OF 2 · WORK")).toBeInTheDocument();
    expect(document.querySelector(".timer-total")).toBeInTheDocument();
    expect(document.querySelector(".timer-phase-bar")).toBeInTheDocument();
  });
});

describe("Timer — Phase 6I: the null-baselines onboarding session (TOTAL LEFT + phase bar hidden, never frozen)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  it("shows TOTAL LEFT and the phase bar during the opener of a null-baselines onboarding-shaped session", async () => {
    mockKeepAwake();
    const run = onboardingShapedRun();
    runAtIndex(run, 0);
    await renderTimer();

    expect(screen.getByText("STEP 1 OF 2 · WORK")).toBeInTheDocument();
    expect(document.querySelector(".timer-total")).toBeInTheDocument();
    expect(document.querySelector(".timer-phase-bar")).toBeInTheDocument();
  });

  it("hides TOTAL LEFT and the phase bar entirely once the null-baselines session reaches its un-priceable effort-distance piece — never a frozen 0:00/0%", async () => {
    mockKeepAwake();
    const run = onboardingShapedRun();
    runAtIndex(run, 1);
    await renderTimer();

    // The distance step's own meters fold into the STEP line (Timer.tsx's
    // own `stepLineText`), unaffected by this task.
    expect(screen.getByText("STEP 2 OF 2 · WORK · 6000M")).toBeInTheDocument();
    // The effort word only — {effort:"min"} -> "EASY" (domain/pace.ts) —
    // never a numeric target, the 5G rule, unaffected by this task.
    expect(screen.getByText("EASY")).toBeInTheDocument();
    expect(document.querySelector(".timer-total")).not.toBeInTheDocument();
    expect(document.querySelector(".timer-phase-bar")).not.toBeInTheDocument();
    // CONNECTED-REVAMP TASK 7 (revision §5, "distance pieces swap the
    // hero"): `.timer-time` now shows the piece's own static meters target
    // (6000), not the stopwatch. The stopwatch itself still counts up
    // normally — it just lives in `.timer-elapsed-value` beneath the hero
    // now, unaffected by the TOTAL/bar rows being hidden.
    expect(document.querySelector(".timer-time")).toHaveTextContent("6000");
    expect(document.querySelector(".timer-elapsed-value")).toHaveTextContent(
      "0:00",
    );
  });

  // Realistic-fixture guard (recurring failure #3): the real, SHIPPED
  // effort-only AN sprint workouts this guard loosening also opens up to
  // null baselines (Task 1's own review finding) never actually hit the
  // hidden branch, because every one of them embeds a rest phase after
  // EVERY occurrence, including the last — there is always a real,
  // priceable phase ahead until the run's true final phase, which is
  // itself a rest. Pinned here so nothing about this task's own domain
  // guard-loosening silently degrades an EXISTING library workout's timer
  // display.
  // (Fixture swapped from "Dust Storm" to "Scud Run": the 2026-08-10
  // library-rebalance's Task 4 replaced Dust Storm — no sketch could
  // stretch it into an unfilled seat; Scud Run is generated fresh with
  // the same property this test needs [effort-ref reps block, a real
  // rest after every occurrence including the last].)
  it("still shows TOTAL LEFT and the phase bar throughout a real shipped effort-only library workout (Scud Run) under null baselines", async () => {
    mockKeepAwake();
    const dustStorm = library("Scud Run");
    const draft = buildDraft({
      id: "id-scud-run",
      title: dustStorm.title,
      type: dustStorm.type as WorkoutType,
      steps: dustStorm.steps,
    });
    const run = buildAndSaveRun(draft, FIXED_NOW, null);
    // Phases: [0 work, 1 rest, 2 work, 3 rest, ... last=rest] — index 0 is
    // the FIRST work (effort-time) occurrence, immediately followed by
    // a real, priceable rest phase.
    runAtIndex(run, 0);
    await renderTimer();

    expect(document.querySelector(".timer-total")).toBeInTheDocument();
    expect(document.querySelector(".timer-phase-bar")).toBeInTheDocument();
  });
});

// Q3 (fix round 1): a `v:1` SessionRun written before this task shipped
// `Phase.ref` has phases with no `ref` field at all, and whatever `label`
// they were frozen with — for a split-ref phase written before this round,
// that's still the OLD "lo–hi" tolerance-band string (`run.ts`'s own loose
// `isSessionRun` validation admits this shape; it never checks per-phase
// fields). The reviewer traced this safe (no crash, a two-line TARGET
// SPLIT card, UP NEXT rendering the stored label verbatim) — this pins it
// directly rather than leaving it an unasserted trace.
describe("Timer — legacy pre-ref run (Q3, fix round 1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  function legacyKindMatrixRun(): SessionRun {
    const run = matrixRun();
    // Phase 1 is Hoarfrost's own split-ref work step (6k+12). Reshape it
    // into exactly what a pre-Task-2 `buildRun` would have frozen: no `ref`
    // at all, and `label` set to the old `toleranceRange(132, 1)` band
    // string (lo=131 -> "2:11.0", hi=133 -> "2:13.0") instead of the exact
    // split.
    const phases = run.phases.map((p, i) => {
      if (i !== 1) return p;
      const legacy = { ...p };
      delete (legacy as { ref?: unknown }).ref;
      legacy.label = "2:11.0–2:13.0";
      return legacy;
    });
    return { ...run, phases };
  }

  it("renders the legacy phase's UP NEXT label verbatim (the stored band, not recomputed)", async () => {
    mockKeepAwake();
    const run = legacyKindMatrixRun();
    runAtIndex(run, 0); // the opener; UP NEXT names phase 1, the legacy phase
    await renderTimer();

    expect(screen.getByText("STEP 1 OF 5 · WORK")).toBeInTheDocument();
    // The OLD band string, byte-for-byte, not "WORK 2:12.0" — this run's
    // frozen label is never recomputed against the current domain code.
    // The phase after it (phase 2, untouched by this fixture's legacy
    // reshape) still gets Task 6's own duration-carrying "then REST 5:00".
    expect(upNextFullText()).toBe("WORK 2:11.0–2:13.0 · then REST 5:00");
  });

  it("renders the legacy phase itself without crashing: a two-line TARGET SPLIT card (main value from targetSplit, no ref sub-line)", async () => {
    mockKeepAwake();
    const run = legacyKindMatrixRun();
    runAtIndex(run, 1); // the legacy split-ref phase itself
    await renderTimer();

    expect(screen.getByText("STEP 2 OF 5 · WORK")).toBeInTheDocument();
    // The main value still resolves — it comes from `targetSplit`
    // (untouched by the missing `ref`), not from `label` at all.
    expect(screen.getByText("2:12.0")).toBeInTheDocument();
    // No ref sub-line (nothing to reconstruct `refLabel` from) and no
    // leftover band text either — the card degrades to two lines, it
    // doesn't fall back to showing the old label as a caption.
    const cards = document.querySelector(".timer-cards")!;
    expect(cards.textContent).not.toContain("6K");
    expect(cards.textContent).not.toMatch(/–/);
    expect(screen.getByText("22")).toBeInTheDocument(); // spm, unaffected
  });
});

describe("Timer — controls", () => {
  // `toFake: ["Date"]` only — NOT setTimeout/setInterval: this repo's
  // installed @testing-library/user-event (14.6.1) + vitest (4.1.10)
  // combination hangs indefinitely on `userEvent.click` once
  // `vi.useFakeTimers()` fakes timer scheduling too (confirmed with a
  // minimal repro outside this component before writing these tests around
  // it — even `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`
  // or `{ delay: null }` still hung). Freezing only `Date` keeps every
  // engine computation deterministic (`new Date()` inside Timer.tsx's
  // handlers always returns the frozen instant) while leaving REAL
  // `setInterval`/`setTimeout` for userEvent's own internals to use
  // normally — the repaint interval this component installs won't fire
  // within a synchronous test's real few milliseconds regardless.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });

  it("Pause freezes the displayed remaining time regardless of how long the pause lasts; Resume continues it", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1, FIXED_NOW);
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 10_000)); // 10s in
    await renderTimer();
    expect(screen.getByText("11:50")).toBeInTheDocument(); // 720 - 10
    // The phase-progress bar's fill: 10s elapsed of the phase's 720s full
    // duration — a genuine non-zero, non-trivial fraction (unlike every
    // phase-kind-rendering test above, which all render at elapsed=0).
    const phaseBarWidth = parseFloat(
      (document.querySelector(".timer-phase-bar span") as HTMLElement).style
        .width,
    );
    expect(phaseBarWidth).toBeCloseTo((10 / 720) * 100, 6);

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    expect(screen.getByText("11:50")).toBeInTheDocument();

    // Time passes while paused — advancing the frozen clock directly and
    // forcing a repaint via `visibilitychange` exercises the SAME
    // recompute-against-`now` path the real 1s interval uses, without
    // needing setInterval itself to be fake (it isn't, in this describe
    // block — see the comment above).
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 40_000));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("11:50")).toBeInTheDocument(); // still frozen

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByText("RUNNING")).toBeInTheDocument();

    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 45_000));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("11:45")).toBeInTheDocument(); // 720 - 15
  });

  it("◀ rewinds to the previous phase, re-seeding its clock (not partially elapsed)", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1);
    await renderTimer();
    screen.getByText("STEP 2 OF 5 · WORK");

    await userEvent.click(
      screen.getByRole("button", { name: "Previous phase" }),
    );

    expect(screen.getByText("STEP 1 OF 5 · WORK")).toBeInTheDocument();
    expect(screen.getByText("4:00")).toBeInTheDocument();
  });

  it("▶ advances to the next phase, re-seeding its clock", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1);
    await renderTimer();
    screen.getByText("STEP 2 OF 5 · WORK");

    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));

    expect(screen.getByText("STEP 3 OF 5 · REST")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
  });

  // Fix round (spec review F5): completion is a documented one-way door
  // (engine.ts's own `isComplete` comment), so ▶ on the LAST phase must
  // stage a confirm rather than end the session on a single tap under the
  // unassuming "Next phase" aria-label.
  it("▶ on the last phase stages a finish confirm rather than completing immediately; Finish session then completes", async () => {
    mockKeepAwake();
    const draft = buildDraft({
      id: "id-one-phase",
      title: "One And Done",
      type: "AN",
      // One phase, full stop — a single 1' work step. (It was a lone `wu`
      // row before 2026-08-09's warmup setting; the run's SHAPE is what
      // this test needs, not the kind of its only phase.)
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "2k", off: 0 },
        },
      ],
    });
    const run = buildAndSaveRun(draft);
    runAtIndex(run, 0);
    await renderTimer();
    screen.getByText("STEP 1 OF 1 · WORK");

    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));

    // Not complete yet — still on the last phase, still shows the run.
    expect(screen.getByText(/Finish this session\?/)).toBeInTheDocument();
    expect(screen.getByText("STEP 1 OF 1 · WORK")).toBeInTheDocument();
    expect(screen.queryByText("SUMMARY SCREEN")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Finish session" }),
    );

    expect(screen.getByText("SUMMARY SCREEN")).toBeInTheDocument();
  });

  it("▶ on the last phase: Keep going cancels the staged finish, no completion", async () => {
    mockKeepAwake();
    const draft = buildDraft({
      id: "id-one-phase-2",
      title: "One And Done Too",
      type: "AN",
      // One phase, full stop — a single 1' work step. (It was a lone `wu`
      // row before 2026-08-09's warmup setting; the run's SHAPE is what
      // this test needs, not the kind of its only phase.)
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "2k", off: 0 },
        },
      ],
    });
    const run = buildAndSaveRun(draft);
    runAtIndex(run, 0);
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));
    expect(screen.getByText(/Finish this session\?/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(screen.queryByText(/Finish this session\?/)).not.toBeInTheDocument();
    expect(screen.queryByText("SUMMARY SCREEN")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next phase" }),
    ).toBeInTheDocument();
    // Nothing was paused/resumed by staging a finish (unlike END) — it was
    // running before, still running now.
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
  });

  // Defensive (fix round): ▶ must not stack a SECOND staged confirm on top
  // of END's own — reaching the last phase's ▶ while the abandon confirm is
  // already showing is a corner a rower could genuinely hit (nothing hides
  // the control row while END is staged).
  it("▶ on the last phase no-ops while END is already staged", async () => {
    mockKeepAwake();
    const draft = buildDraft({
      id: "id-one-phase-3",
      title: "One And Done Three",
      type: "AN",
      // One phase, full stop — a single 1' work step. (It was a lone `wu`
      // row before 2026-08-09's warmup setting; the run's SHAPE is what
      // this test needs, not the kind of its only phase.)
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "2k", off: 0 },
        },
      ],
    });
    const run = buildAndSaveRun(draft);
    runAtIndex(run, 0);
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "END →" }));
    expect(screen.getByText(/Abandon this session\?/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));

    // Still just the abandon confirm — no finish confirm stacked on top,
    // and definitely not completed.
    expect(screen.getByText(/Abandon this session\?/)).toBeInTheDocument();
    expect(screen.queryByText(/Finish this session\?/)).not.toBeInTheDocument();
    expect(screen.queryByText("SUMMARY SCREEN")).not.toBeInTheDocument();
  });

  // Fix round (spec review F1): `handleEndTap`/`handleKeepGoing` must be
  // exact inverses regardless of phase kind — tapping END while RUNNING
  // pauses (so the phase clock can't move while the rower decides); Keep
  // going must undo exactly that, back to RUNNING, not leave the rower
  // stuck paused with an extra manual step. Abandon still clears + returns
  // to Today.
  it("END stages an abandon confirm (BaselineEditor idiom) and pauses meanwhile; Keep going resumes back to RUNNING; Abandon clears the draft + run and returns to Today", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1);
    await renderTimer();
    screen.getByText("RUNNING");

    await userEvent.click(screen.getByRole("button", { name: "END →" }));

    expect(screen.getByText(/Abandon this session\?/)).toBeInTheDocument();
    expect(screen.getByText("PAUSED")).toBeInTheDocument(); // paused first

    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(
      screen.queryByText(/Abandon this session\?/),
    ).not.toBeInTheDocument();
    // The exact inverse of what tapping END did: it was running, END
    // paused it, Keep going resumes it — not stuck paused.
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "END →" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "END →" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Abandon session" }),
    );

    expect(screen.getByText("TODAY SCREEN")).toBeInTheDocument();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  // The other half of the inverse-operations rule: if the rower had
  // ALREADY paused the run themselves before ever tapping END, Keep going
  // must NOT resume it out from under them — `handleEndTap`'s own `pause`
  // call was a no-op in that case (already paused), so nothing needs
  // undoing.
  it("END on an already-paused run: Keep going leaves it paused (does not resume a pause the rower chose themselves)", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1);
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("PAUSED")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "END →" }));
    expect(screen.getByText(/Abandon this session\?/)).toBeInTheDocument();
    expect(screen.getByText("PAUSED")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));

    // Still paused — END's own pause call was a no-op here, so Keep going
    // has nothing of ITS OWN to undo.
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
  });

  // F1's own reported bug, reproduced then fixed: on a DISTANCE phase
  // (which had NO Resume control at all before this fix round), tapping
  // END then Keep going used to soft-brick the stopwatch, frozen forever.
  it("END on a DISTANCE phase: Keep going resumes the stopwatch (F1's own reported bug)", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 3, new Date(FIXED_NOW.getTime() - 2_000)); // 2s in
    await renderTimer();
    screen.getByText("STEP 4 OF 5 · WORK · 500M");
    // CONNECTED-REVAMP TASK 7 (revision §5, "distance pieces swap the
    // hero"): `.timer-time` is the static meters target now (500); the live
    // stopwatch this test is actually proving lives in
    // `.timer-elapsed-value` instead — see that assertion below.
    expect(document.querySelector(".timer-time")).toHaveTextContent("500");
    expect(document.querySelector(".timer-elapsed-value")).toHaveTextContent(
      "0:02",
    );

    await userEvent.click(screen.getByRole("button", { name: "END →" }));
    expect(screen.getByText("PAUSED")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.getByText("RUNNING")).toBeInTheDocument();

    // The stopwatch keeps counting up again — not frozen at 0:02 forever.
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 3_000));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(document.querySelector(".timer-elapsed-value")).toHaveTextContent(
      "0:05",
    );
  });

  it("turns keep-awake on while mounted and off on unmount", async () => {
    const { keepAwakeOn, keepAwakeOff } = mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 0);
    const { unmount } = await renderTimer();
    screen.getByText("RUNNING");

    expect(keepAwakeOn).toHaveBeenCalledOnce();
    expect(keepAwakeOff).not.toHaveBeenCalled();

    unmount();
    expect(keepAwakeOff).toHaveBeenCalledOnce();
  });
});

describe("Timer — distance mode: the suspect-actual seam", () => {
  // Fixture's distance phase (index 3): 500m @ 2k+0 (baselines k2=100) ->
  // estimate = (500/500) * 100 = 100s; the ledger's own threshold is
  // "elapsed > 2x the estimate", i.e. suspect past 200s. `toFake: ["Date"]`
  // only — see the "Timer — controls" describe block's own comment for why.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });

  it("records the actual normally when elapsed is within 2x the estimate (no staged choice)", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 3, new Date(FIXED_NOW.getTime() - 150_000)); // 150s < 200s
    await renderTimer();
    screen.getByText("STEP 4 OF 5 · WORK · 500M");

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));

    expect(screen.getByText("STEP 5 OF 5 · WORK")).toBeInTheDocument();
    expect(screen.queryByText(/Keep split/)).not.toBeInTheDocument();
    const saved = loadRun()!;
    expect(saved.actuals[3]).toStrictEqual({
      actualSource: "stopwatch",
      elapsedSeconds: 150,
      splitSeconds: 150, // (150/500)*500
    });
  });

  it("stages a Keep/Discard choice past 2x the estimate; Keep records the (suspect) actual and advances", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 3, new Date(FIXED_NOW.getTime() - 250_000)); // 250s > 200s
    await renderTimer();
    screen.getByText("STEP 4 OF 5 · WORK · 500M");

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));

    expect(screen.getByText(/looks off/)).toBeInTheDocument();
    // Not advanced yet — still on the distance phase.
    expect(screen.getByText("STEP 4 OF 5 · WORK · 500M")).toBeInTheDocument();
    expect(loadRun()!.actuals[3]).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: "Keep split" }));

    expect(screen.getByText("STEP 5 OF 5 · WORK")).toBeInTheDocument();
    const saved = loadRun()!;
    expect(saved.actuals[3]).toStrictEqual({
      actualSource: "stopwatch",
      elapsedSeconds: 250,
      splitSeconds: 250,
    });
  });

  // Fix round (spec review F3): staging the choice must FREEZE the
  // measurement at that instant — re-reading the stopwatch at Keep-split
  // time would let the deliberation window itself inflate the recorded
  // split, unbounded.
  it("Keep split records the elapsed AT STAGE TIME, not a re-measurement at confirm time", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 3, new Date(FIXED_NOW.getTime() - 250_000)); // 250s > 200s
    await renderTimer();
    screen.getByText("STEP 4 OF 5 · WORK · 500M");

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));
    screen.getByText(/looks off/);

    // 30s of deliberation pass BEFORE confirming.
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 30_000));

    await userEvent.click(screen.getByRole("button", { name: "Keep split" }));

    expect(screen.getByText("STEP 5 OF 5 · WORK")).toBeInTheDocument();
    const saved = loadRun()!;
    // The staged value (250s), NOT 250 + 30 = 280s.
    expect(saved.actuals[3]).toStrictEqual({
      actualSource: "stopwatch",
      elapsedSeconds: 250,
      splitSeconds: 250,
    });
  });

  it("Discard records NO actual but still advances", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 3, new Date(FIXED_NOW.getTime() - 250_000));
    await renderTimer();
    screen.getByText("STEP 4 OF 5 · WORK · 500M");

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));
    screen.getByText(/looks off/);

    await userEvent.click(
      screen.getByRole("button", { name: "Discard split" }),
    );

    expect(screen.getByText("STEP 5 OF 5 · WORK")).toBeInTheDocument();
    const saved = loadRun()!;
    expect(saved.actuals[3]).toBeUndefined();
  });

  // Defensive (mirrors handleNext's own guard): END staging doesn't hide
  // the control row, so NEXT on a distance phase while the abandon confirm
  // is already showing must not stack a second staged dialog on top.
  it("NEXT no-ops while END is already staged", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 3);
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "END →" }));
    expect(screen.getByText(/Abandon this session\?/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));

    expect(screen.getByText(/Abandon this session\?/)).toBeInTheDocument();
    expect(screen.queryByText(/looks off/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish this session\?/)).not.toBeInTheDocument();
  });
});

// Fix round (spec review F6): NEXT ending the session on the FINAL distance
// phase carried the exact same one-way-door risk ▶ already had (fixed as
// F5) — a live probe found NEXT at 1s elapsed on a 100s-estimate final
// piece recorded a physically absurd split AND completed the run,
// unrecoverable, with zero staging. `lastPhaseDistanceDraft`'s only work
// step (500m @ 2k+0, baselines k2=100 -> estimate 100s) is also the LAST
// phase, unlike `kindMatrixDraft`'s own distance phase (deliberately not
// last, so the ordinary suspect-actual tests above stay about resolving a
// split, not also about ending the run).
describe("Timer — distance mode: NEXT on the last phase (F6)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });

  function lastPhaseDistanceDraft(): SessionDraft {
    return buildDraft({
      id: "id-last-distance",
      title: "Final Piece",
      type: "TR",
      // A 2' time piece ahead of the distance one, so the distance phase
      // is the run's LAST but not its only phase. (The 2' piece was a `wu`
      // row until 2026-08-09's warmup setting; nothing here is about the
      // warm-up, so it became a real work step rather than a preference.)
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 2 },
          ref: { base: "2k", off: 0 },
        },
        {
          k: "w",
          duration: { kind: "distance", meters: 500 },
          ref: { base: "2k", off: 0 },
        },
      ],
    });
  }

  it("NEXT on the last phase (non-suspect actual) stages a Finish confirm rather than completing immediately", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(lastPhaseDistanceDraft());
    runAtIndex(run, 1, new Date(FIXED_NOW.getTime() - 80_000)); // 80s: within 50-200
    await renderTimer();
    screen.getByText("STEP 2 OF 2 · WORK · 500M");

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));

    // Staged, not completed yet — no suspect dialog either (not suspect).
    expect(screen.getByText(/Finish this session\?/)).toBeInTheDocument();
    expect(screen.queryByText(/looks off/)).not.toBeInTheDocument();
    expect(screen.getByText("STEP 2 OF 2 · WORK · 500M")).toBeInTheDocument();
    expect(screen.queryByText("SUMMARY SCREEN")).not.toBeInTheDocument();

    // Deliberation passes before confirming — the frozen elapsed (80s) must
    // still be what's recorded, not 80 + 30 = 110 (the same F3 reasoning,
    // now also covering the finish-confirm path).
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 30_000));

    await userEvent.click(
      screen.getByRole("button", { name: "Finish session" }),
    );

    expect(screen.getByText("SUMMARY SCREEN")).toBeInTheDocument();
    const saved = loadRun()!;
    expect(saved.actuals[1]).toStrictEqual({
      actualSource: "stopwatch",
      elapsedSeconds: 80,
      splitSeconds: 80, // (80/500)*500
    });
    expect(saved.completedAt).not.toBeNull();
  });

  it("NEXT on the last phase: Keep going cancels the staged finish, no completion, no actual recorded", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(lastPhaseDistanceDraft());
    runAtIndex(run, 1, new Date(FIXED_NOW.getTime() - 80_000));
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));
    expect(screen.getByText(/Finish this session\?/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(screen.queryByText(/Finish this session\?/)).not.toBeInTheDocument();
    expect(screen.queryByText("SUMMARY SCREEN")).not.toBeInTheDocument();
    expect(loadRun()!.actuals[1]).toBeUndefined();
    expect(screen.getByRole("button", { name: "NEXT →" })).toBeInTheDocument();
  });

  // The combined-stage decision (spec review F6, point 1): when the actual
  // is ALSO suspect on the last phase, only the SUSPECT dialog shows — no
  // separate finish confirm stacks on top of it. Its own Keep/Discard
  // actions already complete the run (advance/nextDistance set
  // `completedAt` themselves once index walks past the final phase, per
  // engine.ts's own contract), so a rower resolves the split and ends the
  // session with the SAME single tap, never two in sequence.
  it("combined stage: a SUSPECT actual on the last phase shows only the suspect dialog; Keep split both records and completes", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(lastPhaseDistanceDraft());
    runAtIndex(run, 1, new Date(FIXED_NOW.getTime() - 250_000)); // 250s > 200s
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));

    expect(screen.getByText(/looks off/)).toBeInTheDocument();
    expect(screen.queryByText(/Finish this session\?/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep split" }));

    expect(screen.getByText("SUMMARY SCREEN")).toBeInTheDocument();
    const saved = loadRun()!;
    expect(saved.actuals[1]!.elapsedSeconds).toBe(250);
    expect(saved.completedAt).not.toBeNull();
  });

  it("combined stage: Discard on a suspect last-phase actual completes with NO actual recorded", async () => {
    mockKeepAwake();
    const run = buildAndSaveRun(lastPhaseDistanceDraft());
    runAtIndex(run, 1, new Date(FIXED_NOW.getTime() - 10_000)); // 10s < 50s (lower bound)
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "NEXT →" }));
    expect(screen.getByText(/looks off/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Discard split" }),
    );

    expect(screen.getByText("SUMMARY SCREEN")).toBeInTheDocument();
    const saved = loadRun()!;
    expect(saved.actuals[1]).toBeUndefined();
    expect(saved.completedAt).not.toBeNull();
  });
});

describe("Timer — the repaint loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  it("auto-advances a short phase after enough 1s repaints (tick() on the interval)", async () => {
    mockKeepAwake();
    const draft = buildDraft({
      id: "id-short-phase",
      title: "Quick Check",
      type: "AN",
      // Two short REST rows (30s, then 1'): the auto-advance under test
      // needs nothing but two consecutive fixed-duration phases, and a
      // rest row is the shortest honest way to author one now that `wu`
      // rows are gone.
      steps: [
        { k: "r", minutes: 0.5 }, // 30s
        { k: "r", minutes: 1 },
      ],
    });
    buildAndSaveRun(draft);
    await renderTimer();
    screen.getByText("STEP 1 OF 2 · REST");

    await act(() => vi.advanceTimersByTimeAsync(31_000));

    expect(screen.getByText("STEP 2 OF 2 · REST")).toBeInTheDocument();
  });

  // A locked screen waking up: the catch-up walk must fire from
  // `visibilitychange`, not only from the next 1s interval tick.
  it("catches up multiple phases on visibilitychange (a simulated lock)", async () => {
    mockKeepAwake();
    // Diamond Dust: 10'/10'/10' rate-change, no reps/rest — three
    // SEQUENTIAL time work phases, ideal for the catch-up walk (each
    // phase's boundary is unambiguous). (Moderate Breeze used to hold this
    // role; the library rewrite turned it into a reps x8 workout — 17
    // phases instead of 4 — so this suite re-anchored to Diamond Dust, per
    // engine.test.ts's own re-anchor for the same reason. The 2026-08-10
    // library-rebalance retuned each piece from 8' to 10' to reach its new
    // 30-45 band — the phase count stayed 3, only the seconds.)
    const diamondDust = library("Diamond Dust");
    const draft = buildDraft({
      id: "id-diamond-dust",
      title: diamondDust.title,
      type: diamondDust.type as WorkoutType,
      steps: diamondDust.steps,
    });
    const run = buildAndSaveRun(draft);
    // work1 600s + work2 600s = 1200s boundary; 130s into work3 (index 2).
    runAtIndex(run, 0, new Date(FIXED_NOW.getTime() - 1_330_000));
    await renderTimer();

    // Before any tick fires, the stale phase 0 is still what renders.
    expect(screen.getByText(/^STEP 1 OF 3/)).toBeInTheDocument();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByText(/^STEP 3 OF 3/)).toBeInTheDocument();
  });
});

// --- The notched TOTAL LEFT bar, on the UNCONNECTED surface ----------------
//
// Design spec §5: "Both surfaces consume the same shape, so the unconnected
// timer gets the same bar rather than a fork." These are the phone timer's
// half of that — the component's own rendering rules are pinned in
// `TimerRuler.test.tsx`, and the arithmetic in `intervalBoundaries.test.ts`.

describe("Timer — the notched total bar", () => {
  /** The notches, left to right, as percentages of the bar. */
  function notchLefts(): number[] {
    return Array.from(document.querySelectorAll(".timer-total-notch")).map(
      (n) => Number.parseFloat((n as HTMLElement).style.left),
    );
  }

  it("notches the bar by INTERVAL, not by phase, and drops the quarter ruler", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 0);
    await renderTimer();

    // The kind-matrix fixture is five phases folding into four intervals
    // (warm-up · work+its rest · 500 m · effort), so the bar draws three
    // notches. Four — one per phase boundary — is the defect.
    expect(run.phases).toHaveLength(5);
    expect(notchLefts()).toHaveLength(3);
    expect(document.querySelector(".timer-ruler")).toBeNull();

    // 240s / 1420s total, 1260 / 1420, 1360 / 1420.
    const total = totalSessionSeconds(run);
    expect(total).toBe(1420);
    const [first, second, third] = notchLefts();
    expect(first).toBeCloseTo((240 / total) * 100, 6);
    expect(second).toBeCloseTo((1260 / total) * 100, 6);
    expect(third).toBeCloseTo((1360 / total) * 100, 6);
  });

  it("re-anchors on the stopwatch's own recorded actual for a distance piece", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 4);
    await renderTimer();
    const estimated = notchLefts();

    // The 500 m (phase 3, the third interval) actually took 60s against its
    // 100s estimate — the shape `nextDistance` records when the rower
    // presses NEXT. Its own notch moves LEFT; the notch before it does not.
    document.body.innerHTML = "";
    saveRun({
      ...run,
      index: 4,
      phaseStartedAt: FIXED_NOW.toISOString(),
      pausedAt: null,
      pausedTotalMs: 0,
      actuals: {
        3: { elapsedSeconds: 60, splitSeconds: 60, actualSource: "stopwatch" },
      },
    });
    await renderTimer();
    const anchored = notchLefts();

    expect(anchored[0]).toBeCloseTo(estimated[0]!, 6);
    expect(anchored[1]).toBeCloseTo(estimated[1]!, 6);
    expect(anchored[2]).toBeLessThan(estimated[2]!);
    expect(anchored[2]).toBeCloseTo((1320 / 1420) * 100, 6);
  });

  it("a measured interval sitting behind two unmeasured ones is still not a fact", async () => {
    mockKeepAwake();
    const run = matrixRun();
    saveRun({
      ...run,
      index: 4,
      phaseStartedAt: FIXED_NOW.toISOString(),
      actuals: {
        3: { elapsedSeconds: 60, splitSeconds: 60, actualSource: "stopwatch" },
      },
    });
    await renderTimer();

    // Intervals 0 and 1 were TIME phases the engine advanced at their own
    // programmed boundaries — nothing measured them, so their notches stay
    // estimates (`runIntervalBoundaries`'s own rule).
    expect(
      Array.from(document.querySelectorAll(".timer-total-notch")).map(
        (n) => (n as HTMLElement).dataset.predicted,
      ),
    ).toStrictEqual(["true", "true", "true"]);
  });

  it("a run that OPENS with a rest keeps its notches where that rest leaves them", async () => {
    mockKeepAwake();
    // Fix round 1 (task-4-review.md I-1). A rest as step 1 is authorable —
    // `domain/validate.ts` has no positional rule and the builder has no
    // leading-rest guard — and with the warm-up preference off it reaches the
    // timer exactly like this. `[5:00 rest, 4 x (4:00 + 1:00, last one bare)]`
    // prices at 1440s, and the first interval really ends at 600s: 41.7% of
    // the bar, not the 20.8% the dropped lead-in used to draw.
    const rest5: Step = { k: "r", minutes: 5 };
    const piece = (withRest: boolean): Step => ({
      k: "w",
      duration: { kind: "time", minutes: 4 },
      ref: { base: "6k", off: 0 },
      ...(withRest ? { restMinutes: 1 } : {}),
    });
    const draft = buildDraft({
      id: "id-rest-first",
      title: "Rest first",
      type: "O2" as WorkoutType,
      steps: [rest5, piece(true), piece(true), piece(true), piece(false)],
    });
    const run = buildAndSaveRun(draft, FIXED_NOW, BASELINES);
    runAtIndex(run, 0);
    await renderTimer();

    expect(totalSessionSeconds(run)).toBe(1440);
    const lefts = notchLefts();
    expect(lefts).toHaveLength(3);
    expect(lefts[0]).toBeCloseTo(41.667, 2);
    expect(lefts[1]).toBeCloseTo(62.5, 2);
    expect(lefts[2]).toBeCloseTo(83.333, 2);
  });

  // PHASE WU deleted the three cases that stood here (the warm-up fill
  // growing as it is rowed, capping at its own notch, and the no-warm-up
  // regression pin). `TimerRuler`'s lighter warm-up tone and the
  // `.timer-total-warmup` element it painted are gone with the concept, so
  // the bar has two tones again and the notch assertions above and below
  // are what remains to check.

  it("keeps the quarter ruler for a session with only one interval", async () => {
    mockKeepAwake();
    // One 20:00 work step: one interval, no interior boundary, so the bar
    // would otherwise be a bare rectangle.
    const draft = buildDraft({
      id: "id-single",
      title: "Single piece",
      type: "O2" as WorkoutType,
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 20 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    const run = buildAndSaveRun(draft, FIXED_NOW, BASELINES);
    runAtIndex(run, 0);
    await renderTimer();

    expect(document.querySelectorAll(".timer-total-notch")).toHaveLength(0);
    expect(document.querySelector(".timer-ruler")).not.toBeNull();
    expect(screen.getByText("¼")).toBeInTheDocument();
  });
});

// CONNECTED-REVAMP TASK 7 (revision §5): the gutter's structure and Pause's
// level/position, pinned at the COMPONENT layer — jsdom never evaluates a
// real `@media (orientation: landscape)` query (no browser layout engine
// backs it here), so these can't prove which orientation shows which
// arrangement; that half is the CSS-source describe block above plus
// `e2e/design.spec.ts`'s own landscape captures. What a component test CAN
// prove, and what a CSS assertion alone cannot: there is exactly ONE
// `.timer-end` button in the DOM (not two, one hidden per orientation —
// duplicating it would break `getByRole` uniqueness and double the tab
// stops), it sits inside `.timer-gutter` alongside the two decorative
// glyphs, and Pause has been extracted out of `.timer-controls` into its
// own row rather than merely restyled in place.
describe("Timer — the gutter's structure and Pause's own row (connected-revamp Task 7)", () => {
  // `toFake: ["Date"]` only, NOT setTimeout/setInterval (the last describe
  // block's own `userEvent.click` uses real timers internally and hangs
  // indefinitely if every timer is faked — see that block's own comment
  // for the full repro). This describe block's last test drives a real
  // `userEvent.click`, same as that one.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });

  it("renders exactly one END button, inside .timer-gutter beside the decorative back glyph and NOTHING else", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1);
    await renderTimer();

    const gutter = document.querySelector(".timer-gutter");
    expect(gutter).not.toBeNull();
    const back = gutter!.querySelector(".timer-gutter-back");
    expect(back).not.toBeNull();
    expect(back).toHaveAttribute("aria-hidden", "true");
    const ends = screen.getAllByRole("button", { name: "END →" });
    expect(ends).toHaveLength(1);
    expect(gutter!.contains(ends[0])).toBe(true);
    // THE DECORATIVE HOUSING SPACER IS GONE (James's erg walk, 2026-08-13
    // — `Timer.tsx`'s own gutter comment has the reasoning). Asserted as an
    // exact child census, not just `querySelector(...) === null`: landscape
    // lays this column out with `justify-content: space-between`, which
    // positions its children by COUNT, so "the housing is absent" and "back
    // and END are the only two things space-between is dividing" are
    // different claims and it is the second one the geometry depends on.
    expect(
      Array.from(gutter!.children).map((el) => el.className),
    ).toStrictEqual(["timer-gutter-back", "timer-end"]);
  });

  it("Pause lives in .timer-upnext-row, never inside .timer-controls — which now holds exactly Previous phase + Next phase", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1); // a work/split phase — the non-distance ▶ control
    await renderTimer();

    const upnextRow = document.querySelector(".timer-upnext-row");
    expect(upnextRow).not.toBeNull();
    const pause = screen.getByRole("button", { name: "Pause" });
    expect(upnextRow!.contains(pause)).toBe(true);
    expect(pause).toHaveClass("timer-control-pause");

    const controls = document.querySelector(".timer-controls");
    expect(controls).not.toBeNull();
    expect(pause.closest(".timer-controls")).toBeNull();
    const controlButtons = controls!.querySelectorAll("button");
    expect(controlButtons).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Previous phase" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next phase" }),
    ).toBeInTheDocument();
  });

  it("Pause disappears (with the rest of .timer-controls) once END is staged — the surface's only L1 control is suspended by the same confirm panels", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1);
    await renderTimer();

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "END →" }));
    expect(
      screen.queryByRole("button", { name: "Pause" }),
    ).not.toBeInTheDocument();
  });

  // The PAUSED arm of the same rule, split out of the test above
  // (test-integrity sweep, S0b): that run is never paused, so `Resume` was
  // absent BEFORE the click for reasons that have nothing to do with the
  // subject, and asserting its absence after proved nothing. Here the run
  // is paused first, so `Resume` is genuinely on screen and the confirm
  // panel genuinely has to take it away.
  it("Resume disappears too, when END is staged from a PAUSED run", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1);
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "END →" }));
    expect(
      screen.queryByRole("button", { name: "Resume" }),
    ).not.toBeInTheDocument();
  });

  // Fix round 1 (review Important-2): the workout title rejoins the
  // landscape label ROW as a decorative, `aria-hidden` duplicate — the
  // ACCESSIBLE instance stays `.timer-name` in the gutter's header row
  // (portrait's own visible copy). jsdom can't evaluate the
  // `@media (orientation: landscape)` toggle itself (no browser layout
  // engine — the CSS-source describe below pins that half); what a
  // component test CAN prove is the DOM shape this depends on: exactly one
  // extra, hidden-from-a11y title node, a TRUE SIBLING of
  // `.timer-phase-label` rather than nested inside it — nesting was this
  // fix round's own first attempt, and self-mutation testing below proves
  // exactly why it was wrong (it broke `getByText(/^STEP N OF M/)` across
  // the e2e suite; jsdom's `getNodeText` only reads DIRECT text-node
  // children, so the equivalent jsdom assertion never caught it — a real
  // engine-behavior gap, not a mistake in the pin itself).
  it("carries a decorative, aria-hidden title duplicate as .timer-phase-label's SIBLING, never nested inside it — and .timer-phase-label's own text is untouched", async () => {
    mockKeepAwake();
    const run = matrixRun();
    runAtIndex(run, 1);
    await renderTimer();

    const title = library("Hoarfrost").title;
    const head = document.querySelector(".timer-phase-head");
    expect(head).not.toBeNull();
    const inlineTitle = head!.querySelector(".timer-phase-title");
    expect(inlineTitle).not.toBeNull();
    expect(inlineTitle).toHaveAttribute("aria-hidden", "true");
    expect(inlineTitle!.textContent).toContain(title);
    // Real trailing separator, not just an adjacent word with no glyph
    // between them once CSS puts both on one line.
    expect(inlineTitle!.textContent).toMatch(/·\s*$/);

    // THE REGRESSION THIS FIX ROUND FOUND AND FIXED: `.timer-phase-label`'s
    // own text is byte-identical to the pre-merge shape — the title is
    // NEVER a descendant of it. `getNodeText` (jsdom/RTL) already proved
    // this indirectly (every `getByText("STEP …")` assertion elsewhere in
    // this file still passes), but this asserts the DOM shape directly:
    // `.timer-phase-title` must not be found by searching INSIDE the
    // label.
    const label = document.querySelector(".timer-phase-label");
    expect(label).not.toBeNull();
    expect(label!.querySelector(".timer-phase-title")).toBeNull();
    expect(label!.textContent).toBe("STEP 2 OF 5 · WORK");

    // The accessible instance is unaffected — still exactly one, still in
    // the gutter's header row, still carrying the bare title with no
    // `aria-hidden`.
    const accessibleName = screen.getByText(title, {
      selector: ".timer-name",
    });
    expect(accessibleName).not.toHaveAttribute("aria-hidden");
    expect(document.querySelectorAll(".timer-phase-title")).toHaveLength(1);
  });
});

// CONNECTED-REVAMP TASK 7 (revision §5, spec §7). jsdom never loads
// index.css as real stylesheet rules (TimerTargets.test.tsx's own header
// documents the empirical check), so these read the file's source text
// directly — the same `node:fs` + `commentStrippedSource` idiom every other
// structural CSS pin in this repo already uses, pinning the resolved
// declaration rather than "we looked and it seemed right."
const indexCssPath = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/session\/[^/]+\.test\.tsx$/, "index.css");
const indexCssRaw = readFileSync(indexCssPath, "utf-8");
const indexCssStripped = commentStrippedSource(indexCssRaw);

/** The body of the ONE rule for `selector`, anywhere in the stylesheet at
 *  any nesting depth. Exactly one, not the first: `.exec`'s
 *  first-match-only behaviour is what let a `.connected-end { width: 100% }`
 *  appended to `index.css` pass its own guard (test-integrity sweep, P17). */
function ruleBody(selector: string): string {
  const bodies = cssRules(indexCssStripped)
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body);
  expect(bodies, `expected exactly one rule for ${selector}`).toHaveLength(1);
  return bodies[0]!;
}

/** The body of the ONE TOP-LEVEL rule for `selector` — no media query. That
 *  is what "by default, in both orientations" means, and asserting it is
 *  the half `ruleBody` alone cannot give. */
function baseRuleBody(selector: string): string {
  const bodies = scopedRuleBodies(indexCssStripped, selector);
  expect(
    bodies,
    `expected exactly one TOP-LEVEL rule for ${selector}`,
  ).toHaveLength(1);
  return bodies[0]!;
}

/** The rule list of the phone timer's OWN landscape media query — the one
 *  of `index.css`'s FIVE `@media (orientation: landscape)` queries whose
 *  first rule is `.timer-screen`.
 *
 *  Parsed by `cssRules`/`atRuleBodies` (`../test/cssView`, a brace-depth
 *  scanner) rather than by regex-and-slice. The old `ruleBody` had no
 *  notion of enclosing at-rules at all, which is test-integrity sweep P7:
 *  `.timer-screen .timer-phase-title { display: inline; flex: none; }`
 *  moved OUT of this query to top level — a duplicate workout title
 *  becoming visible in portrait, exactly the regression the test below
 *  names — left all 79 tests in this file green. */
function timerLandscapeRules(): CssRule[] {
  const blocks = atRuleBodies(
    indexCssStripped,
    "@media (orientation: landscape)",
  )
    .map((body) => cssRules(body))
    .filter((rules) => rules[0]?.selectors[0] === ".timer-screen");
  expect(
    blocks,
    "expected exactly one landscape query opening on .timer-screen",
  ).toHaveLength(1);
  return blocks[0]!;
}

describe("index.css: RUNNING/countdown/ELAPSED/targets — the ink ruling and the token scale (spec §7)", () => {
  it("RUNNING (.timer-state) resolves to var(--ink), never var(--accent) — James's ruling 6, narrowing DEVIATIONS row 1", () => {
    const body = ruleBody(".timer-state");
    expect(body).toContain("var(--ink)");
    expect(body).not.toContain("var(--accent)");
  });

  // Fix round 1 (review Important-1): DEVIATIONS.md's segment-strip row
  // already named this exact issue on this exact surface ("the phone
  // timer's COMPLETED colour" repainted ink on the connected pane, with
  // the phone timer's own base rule left as the still-open half) — this
  // closed it, and Task 8 RETIRED the row rather than carrying it forward.
  // Cited by description, not line number: the row is gone, and a number
  // would now point at whatever moved up into its place.
  it("the segment dots' COMPLETED colour (.timer-dot-past) resolves to var(--ink), never var(--accent) — the segment-strip deviation, closed", () => {
    const body = ruleBody(".timer-dot-past");
    expect(body).toContain("var(--ink)");
    expect(body).not.toContain("var(--accent)");
  });

  it(".timer-time (the countdown, and the distance hero's meters) uses --size-countdown, never a raw literal", () => {
    const body = ruleBody(".timer-time");
    expect(body).toContain("var(--size-countdown)");
    expect(body).not.toMatch(/font-size:\s*\d/);
  });

  it(".timer-elapsed-value uses --size-elapsed, never a raw literal", () => {
    const body = ruleBody(".timer-elapsed-value");
    expect(body).toContain("var(--size-elapsed)");
    expect(body).not.toMatch(/font-size:\s*\d/);
  });

  it(".timer-card-value (both TARGET SPLIT and RATE) uses --size-subhero and ink, never a raw literal or accent", () => {
    const body = ruleBody(".timer-card-value");
    expect(body).toContain("var(--size-subhero)");
    expect(body).toContain("var(--ink)");
    expect(body).not.toMatch(/font-size:\s*\d/);
    expect(body).not.toContain("var(--accent)");
  });

  it("timer-card-value-accent has no rule left in index.css — TimerTargets.tsx's own JSX no longer applies it", () => {
    expect(indexCssStripped).not.toContain(".timer-card-value-accent");
  });

  // Fix round 1 (review Important-2): the title-merge's CSS half — hidden
  // by default (portrait keeps `.timer-name` as the only visible copy),
  // shown only inside the timer's own scoped landscape block.
  it(".timer-phase-title is hidden by default and shown only inside the timer's own scoped landscape block", () => {
    // "By default" = a TOP-LEVEL rule, so portrait gets it too.
    expect(baseRuleBody(".timer-phase-title")).toContain("display: none");
    // "Only inside the landscape block" = the `display: inline` override
    // is genuinely nested in the timer's own query, and nowhere else. The
    // second assertion is the one P7 was missing: at top level, the same
    // declaration would show a duplicate title in PORTRAIT.
    const shown = timerLandscapeRules().filter((rule) =>
      rule.selectors.includes(".timer-screen .timer-phase-title"),
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]!.body).toContain("display: inline");
    expect(
      cssRules(indexCssStripped).filter(
        (rule) =>
          rule.at.length === 0 &&
          rule.selectors.some((s) => s.includes(".timer-phase-title")) &&
          /display\s*:\s*inline/.test(rule.body),
      ),
    ).toStrictEqual([]);
  });

  it("Pause (.timer-control-pause) follows the mockup, not the pre-Task-7 accent fill: surface background, ink border, ink text", () => {
    const body = ruleBody(".timer-control-pause");
    expect(body).toContain("var(--surface)");
    expect(body).toContain("1px solid var(--ink)");
    expect(body).not.toContain("var(--accent)");
    expect(body).not.toContain("var(--on-color)");
  });

  it("the phase-progress fill and the total-bar fill both stay accent (two of the surface's three accent jobs)", () => {
    // One comma-joined rule in the source, across two lines. `ruleBody`
    // splits the selector list, so each half is asked for by name rather
    // than by reproducing the stylesheet's own line breaks.
    expect(ruleBody(".timer-phase-bar span")).toContain("var(--accent)");
    expect(ruleBody(".timer-total-bar span")).toContain("var(--accent)");
  });

  // EXHAUSTIVE (fix round 1, review Minor-4: the report's first-draft
  // inventory said "two jobs," missing the gutter's own accent-outlined
  // END — spec-consistent, but the CLAIM of exhaustiveness was wrong).
  // This scans every top-level `.timer-*` (never `.connected-*`) rule in
  // the WHOLE file — not just the two rules the test above already knows
  // about by name — for `var(--accent)`, and asserts the exact set,
  // sorted, so a future accent addition or removal on this surface fails
  // this test rather than silently drifting past a report's own prose. */
  // Timer-mode spec (2026-09-02, ruling 1): the third job moved from the
  // landscape-only `.timer-screen .timer-header .timer-end` to the base
  // `.timer-end` — still three jobs, the END control now in both
  // orientations.
  it("accent's exactly three jobs on this surface, and no others — the phase-progress fill, the total-bar fill, and the END control (both orientations)", () => {
    const ACCENT_TIMER_SELECTORS = [
      ".timer-phase-bar span",
      ".timer-total-bar span",
      ".timer-end",
    ].toSorted();

    const found = new Set<string>();
    for (const m of indexCssStripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selectorList, body] = m;
      if (!body!.includes("var(--accent)")) continue;
      for (const selector of selectorList!.split(",").map((s) => s.trim())) {
        if (selector.startsWith(".timer-") && !selector.includes("connected")) {
          found.add(selector);
        }
      }
    }
    expect(Array.from(found).toSorted()).toStrictEqual(ACCENT_TIMER_SELECTORS);
  });
});

describe("index.css: the landscape leak is closed (spec §7, adversarial finding)", () => {
  it("every selector inside the phone timer's own landscape media query is scoped under .timer-screen — none can reach a connected pane", () => {
    const rules = timerLandscapeRules();
    // EXACT, not `> 10` (test-integrity sweep, S0c): a floor still passed
    // with half the block deleted, and the per-selector loop below would
    // then have run against a truncated set. 28 rules today; a deliberate
    // addition or removal updates this line, and the author sees the
    // scoping rule it guards while doing so.
    //
    // 30 -> 31 -> 30 -> 29 -> 28, every move deliberate:
    //   29 -> 28 (timer-mode spec 2026-09-02, ruling 1). `.timer-screen
    //     .timer-header .timer-end` is deleted: the accent-outlined 44×44
    //     box it drew is `.timer-end`'s BASE rule now, one END in both
    //     orientations, so landscape has nothing left to override (the
    //     "one END and no dead band" describe below pins both halves).
    //   31 -> 30 (tail review M-3). James's 2026-08-12 ruling stretched the
    //     ◀/▶ pair across the column in PORTRAIT, so landscape needed a
    //     rule pinning them back to a fixed width — but it was added as a
    //     SECOND `.timer-screen .timer-control` rule beside the existing
    //     one rather than as a declaration inside it, the only duplicated
    //     selector in the whole block. They are merged now. The width
    //     itself never changed, only how many rules carried it, which is
    //     exactly the drift this ratchet exists to surface.
    //   30 -> 29 (James's erg walk, 2026-08-13). The gutter's decorative
    //     camera-housing spacer is deleted, and `.timer-screen
    //     .timer-header .timer-gutter-housing` went with it.
    expect(rules).toHaveLength(28);
    for (const rule of rules) {
      expect(rule.selectors.length).toBeGreaterThan(0);
      for (const selector of rule.selectors) {
        // The selector is asserted alongside the boolean so a failure's own
        // diff names which one leaked.
        expect([
          selector,
          selector === ".timer-screen" || selector.startsWith(".timer-screen "),
        ]).toStrictEqual([selector, true]);
      }
    }
  });

  // CR2 spec 3 Task 4 RETIRES THE LEAK'S OWN TARGET, not merely closes the
  // leak: `.connected-pane-live … .timer-upnext-then` (the rule this test
  // used to pin, compensating for the pre-fix leak) is GONE along with
  // `TimerRuler`/`UpNextStrip` themselves — `PaneLive` forks its own
  // progress bar and its own band now (`ConnectedProgressBar`,
  // `.connected-band-*`), neither carrying a `.timer-*` class. So there is
  // nothing left for the phone timer's landscape query to leak INTO, not
  // just a scoped rule keeping it from doing so — a stronger property than
  // the one this test used to prove, checked structurally rather than by
  // re-asserting one surviving override.
  it("no connected-surface selector carries a .timer-* class any more — the leak has no target left to reach", () => {
    const rules = cssRules(indexCssStripped).filter((rule) =>
      rule.selectors.some((s) => s.includes(".connected-")),
    );
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        if (!selector.includes(".connected-")) continue;
        expect([selector, selector.includes(".timer-")]).toStrictEqual([
          selector,
          false,
        ]);
      }
    }
  });
});

// TIMER MODE, BOTH WAYS UP (spec 2026-09-02-timer-mode-design, exit
// criterion 1 — the structural half; `e2e/design.spec.ts`'s "timer mode,
// both ways up" describe measures the same three facts as geometry). Read
// against the served stylesheet's source, comment-stripped, the same
// `ruleBody`/`baseRuleBody`/`timerLandscapeRules` readers as the block above.
describe("index.css: one END and no dead band, both ways up (timer-mode spec 2026-09-02)", () => {
  it("the base .timer-end rule IS the accent-outlined 44×44 box, and the landscape block carries no second .timer-end shape", () => {
    // Ruling 1: one END — the box landscape already drew (the connected
    // surface's own End) is now the base rule, so portrait wears it too.
    const body = baseRuleBody(".timer-end");
    expect(body).toContain("width: 44px");
    expect(body).toContain("height: 44px");
    expect(body).toContain("color: var(--accent)");
    expect(body).toContain("border: 1px solid var(--accent)");
    expect(body).not.toContain("border: none");
    // The landscape override that used to hold the box is gone — nothing
    // in the timer's own landscape query re-shapes END any more. `$`
    // anchors past `.timer-end-confirm`/`.timer-end-actions`, which are
    // different elements and stay.
    const landscapeEndRules = timerLandscapeRules().filter((rule) =>
      rule.selectors.some((selector) => /\.timer-end$/.test(selector)),
    );
    expect(landscapeEndRules).toHaveLength(0);
  });

  it(".timer-controls no longer clings to the viewport's bottom edge — no margin-top: auto", () => {
    // Ruling 2, portrait: the ◀ ▶ row follows Pause as one control group.
    // `margin-top: auto` was the whole dead band (the flex column's slack
    // went into that one margin — measured 264px at 393×852 on build 823).
    expect(baseRuleBody(".timer-controls")).not.toContain("margin-top: auto");
  });

  // Desk walk (James, 2026-09-02, build 834 on the phone): "the end button
  // is partially obscured, and the notch is in the way." The landscape frame
  // padded top/right/bottom with the safe-area insets and the LEFT with a
  // hard 0 "so the gutter reaches the physical edge" — which put the
  // gutter's CONTROLS under the rounded corner (both sides) and the sensor
  // housing (one side). Apple: safe areas exist for "avoiding a device's
  // interactive and display features, like Dynamic Island", and layouts
  // must accommodate "the corner radius, sensor housing" (HIG, Layout);
  // WebKit: `env(safe-area-inset-left)` grows in landscape "due to the
  // sensor housing" (webkit.org/blog/7929); this repo's own finding (Phase
  // CR2, Tech Talk 801): the landscape inset protects the rounded corners
  // too, and iOS reports it on BOTH sides. The connected surface already
  // encodes that as `--edge-inset: max(left, right)` with its gutter at
  // `calc(44px + var(--edge-inset))`: the sunken background still reaches
  // the edge, the controls sit inside the inset. The timer mirrors it.
  it("landscape: the frame defines --edge-inset as max(left, right) and the gutter column is 44px PLUS it, with the gutter's controls padded inside the inset — the connected surface's own rule", () => {
    const rules = timerLandscapeRules();
    const screen = rules.find((r) => r.selectors.includes(".timer-screen"));
    expect(screen, "landscape .timer-screen rule").toBeDefined();
    const flat = screen!.body.replace(/\s+/g, " ");
    expect(flat).toContain(
      "--edge-inset: max( env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px) )",
    );
    expect(flat).toContain(
      "grid-template-columns: calc(44px + var(--edge-inset)) 1fr 200px",
    );
    // Symmetric: the right edge takes the same inset, so RUNNING and the
    // arrows clear the other corner (and the housing, whichever side).
    expect(flat).toContain(
      "padding: env(safe-area-inset-top, 0px) var(--edge-inset) env(safe-area-inset-bottom, 0px) 0",
    );
    const gutter = rules.find((r) =>
      r.selectors.includes(".timer-screen .timer-header .timer-gutter"),
    );
    expect(gutter, "landscape gutter rule").toBeDefined();
    expect(gutter!.body.replace(/\s+/g, " ")).toContain(
      "padding: 12px 0 12px var(--edge-inset)",
    );
  });

  it("landscape: the hero row is the grid's one 1fr track and the grid fills the viewport — no reserved tab-bar strip in its min-height", () => {
    // Ruling 2, landscape. The middle (hero) row already grew — row 4 was
    // `1fr` before this spec — so the dead band was never the rows: it was
    // the min-height formula's `- 26px - var(--tap)` (a padding double-count
    // plus a strip reserved for a tab bar this route never renders), 70px
    // of page under a grid that had already stopped. The formula is now the
    // viewport itself, and the shell's reserved strip is dropped for this
    // screen the same way it is for the connected surface (the `:has()`
    // rule pinned below).
    const screen = timerLandscapeRules().filter((rule) =>
      rule.selectors.includes(".timer-screen"),
    );
    expect(screen).toHaveLength(1);
    const body = screen[0]!.body;
    expect(body).toContain(
      "grid-template-rows: auto auto auto 1fr auto auto auto",
    );
    expect(body).toMatch(/min-height:\s*100dvh/);
    expect(body).not.toContain("var(--tap)");
    expect(body).not.toContain("26px");

    const shellRules = atRuleBodies(
      indexCssStripped,
      "@media (orientation: landscape)",
    )
      .flatMap((block) => cssRules(block))
      .filter((rule) =>
        rule.selectors.includes(".app-shell:has(.timer-screen)"),
      );
    expect(
      shellRules,
      "expected exactly one landscape .app-shell:has(.timer-screen) rule",
    ).toHaveLength(1);
    expect(shellRules[0]!.body).toContain("padding-bottom: 0");
  });
});

// Just Row without the monitor (spec 2026-09-02, §Mechanism piece 3; plan
// Task 5). A `mode: "justrow"` run has NO draft behind it — the door saves
// `buildFreeRowRun` and navigates straight here, skipping the Countdown —
// so every branch this block pins is one the shipped workout path never
// reaches: the draft-less guard, the run-named header, the `JUST ROW` step
// slot, the `Free` target, the recorded actual, and the log-door route.
describe("Timer — Just Row without the monitor (mode justrow, no draft)", () => {
  // `toFake: ["Date"]` only — see "Timer — controls" above for why faking
  // setInterval too hangs userEvent in this repo. Every clock reading below
  // comes from `vi.setSystemTime` + a `visibilitychange` repaint, never
  // from a timer advance: criterion 5's whole point is that the display is
  // wall-clock arithmetic, not accumulated ticks.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });

  function heroText(): string {
    return document.querySelector(".timer-time")?.textContent ?? "";
  }

  function targetSplitValue(): string {
    // The TARGET SPLIT card is the first `.timer-card`; RATE is the second.
    const cards = document.querySelectorAll(".timer-card");
    return cards[0]?.querySelector(".timer-card-value")?.textContent ?? "";
  }

  function rateValue(): string {
    const cards = document.querySelectorAll(".timer-card");
    return cards[1]?.querySelector(".timer-card-value")?.textContent ?? "";
  }

  async function repaintAt(offsetMs: number) {
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + offsetMs));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }

  it("renders with no draft at all (criterion 8, the handoff's strings): name Just Row, STEP slot exactly JUST ROW, TARGET SPLIT and RATE both Free, UP NEXT FINISH, no dash, no phase bar, no TOTAL LEFT", async () => {
    mockKeepAwake();
    saveRun(buildFreeRowRun(FIXED_NOW));
    expect(loadDraft()).toBeNull();
    await renderTimer();

    expect(screen.queryByText("TODAY SCREEN")).not.toBeInTheDocument();
    expect(document.querySelector(".timer-name")).toHaveTextContent(
      /^Just Row$/,
    );
    // The step slot is the whole label — not "STEP 1 OF 1 · TEST", not
    // "JUST ROW · TEST": the handoff's board draws the one word pair alone.
    expect(document.querySelector(".timer-phase-label")?.textContent).toBe(
      "JUST ROW",
    );
    expect(screen.queryByText(/STEP 1 OF 1/)).not.toBeInTheDocument();
    expect(targetSplitValue()).toBe("Free");
    expect(rateValue()).toBe("Free");
    // The phase's own label ("Just Row") must not leak into the TARGET
    // SPLIT card the way a test phase's "All out" does for a workout.
    expect(screen.getAllByText("Free")).toHaveLength(2);
    expect(upNextFullText()).toBe("FINISH");
    expect(heroText()).toBe("0:00");
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(document.querySelector(".timer-total")).not.toBeInTheDocument();
    expect(document.querySelector(".timer-phase-bar")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next phase" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "NEXT →" }),
    ).not.toBeInTheDocument();
  });

  it("a WORKOUT run with no draft still redirects to /today — the draft-less guard opens only for mode justrow", async () => {
    mockKeepAwake();
    const run = buildRun(testKindDraft(), BASELINES, FIXED_NOW);
    saveRun(run);
    expect(loadDraft()).toBeNull();
    await renderTimer();

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  // Exit criterion 5 (backgrounding): the display is wall-clock
  // arithmetic against `phaseStartedAt`, never accumulated ticks — a run
  // started ten minutes ago reads 10:00 on its FIRST paint, with no timer
  // ever advanced (the interval is real and never fires in this test).
  it("criterion 5: a run whose phaseStartedAt is 10 minutes in the past renders 10:00 on mount with zero ticks", async () => {
    mockKeepAwake();
    saveRun(buildFreeRowRun(new Date(FIXED_NOW.getTime() - 600_000)));
    await renderTimer();

    expect(heroText()).toBe("10:00");
    expect(document.querySelector(".timer-elapsed-value")).toHaveTextContent(
      "10:00",
    );
  });

  // Exit criterion 1 / ⟨F10⟩: ▶ FREEZES the clock when it stages the
  // finish confirm, so deliberating over "Finish this session?" cannot
  // bank into the row. The recorded actual is the elapsed AT ▶ (12 s, an
  // independent literal), not the elapsed at Finish (42 s).
  it("▶ pauses the clock and stages Finish; 30 s later Finish session records { stopwatch-elapsed, 12 } (the elapsed at ▶), completes, and lands on /justrow/log", async () => {
    mockKeepAwake();
    saveRun(buildFreeRowRun(FIXED_NOW));
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 12_000));
    await renderTimer();
    expect(heroText()).toBe("0:12");

    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));

    expect(screen.getByText("Finish this session?")).toBeInTheDocument();
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    expect(screen.queryByText("JUST ROW LOG SCREEN")).not.toBeInTheDocument();

    // 30 s of deliberation: the display must not move.
    await repaintAt(42_000);
    expect(heroText()).toBe("0:12");

    await userEvent.click(
      screen.getByRole("button", { name: "Finish session" }),
    );

    expect(screen.getByText("JUST ROW LOG SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("SUMMARY SCREEN")).not.toBeInTheDocument();
    const stored = loadRun();
    expect(stored?.completedAt).toBe(
      new Date(FIXED_NOW.getTime() + 42_000).toISOString(),
    );
    expect(stored?.actuals).toStrictEqual({
      0: { actualSource: "stopwatch-elapsed", elapsedSeconds: 12 },
    });
  });

  it("Keep going after ▶ resumes the clock it paused: elapsed advances again from where ▶ froze it", async () => {
    mockKeepAwake();
    saveRun(buildFreeRowRun(FIXED_NOW));
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 12_000));
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    await repaintAt(42_000);

    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(screen.queryByText("Finish this session?")).not.toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(heroText()).toBe("0:12");
    // 8 s more of rowing: 12 + 8, the 30 s of deliberation excluded.
    await repaintAt(50_000);
    expect(heroText()).toBe("0:20");
    expect(loadRun()?.completedAt).toBeNull();
    expect(loadRun()?.actuals).toStrictEqual({});
  });

  it("Keep going leaves a pause the ROWER chose before ▶ alone (the exact inverse of what ▶ did, same rule as END's)", async () => {
    mockKeepAwake();
    saveRun(buildFreeRowRun(FIXED_NOW));
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 12_000));
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    await repaintAt(20_000);
    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));
    expect(screen.getByText("Finish this session?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    await repaintAt(30_000);
    expect(heroText()).toBe("0:12");
  });

  it("Finish on a run the rower paused themselves records the elapsed at THAT pause, not at ▶", async () => {
    mockKeepAwake();
    saveRun(buildFreeRowRun(FIXED_NOW));
    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 7_000));
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await repaintAt(25_000);
    await userEvent.click(screen.getByRole("button", { name: "Next phase" }));
    await repaintAt(60_000);
    await userEvent.click(
      screen.getByRole("button", { name: "Finish session" }),
    );

    expect(screen.getByText("JUST ROW LOG SCREEN")).toBeInTheDocument();
    expect(loadRun()?.actuals).toStrictEqual({
      0: { actualSource: "stopwatch-elapsed", elapsedSeconds: 7 },
    });
  });

  it("a completed justrow run on mount goes to /justrow/log, never the workout summary", async () => {
    mockKeepAwake();
    const run = buildFreeRowRun(FIXED_NOW);
    saveRun({
      ...run,
      index: 1,
      actuals: { 0: { actualSource: "stopwatch-elapsed", elapsedSeconds: 9 } },
      completedAt: new Date(FIXED_NOW.getTime() + 9_000).toISOString(),
    });
    await renderTimer();

    expect(await screen.findByText("JUST ROW LOG SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("SUMMARY SCREEN")).not.toBeInTheDocument();
  });

  it("END → Abandon session clears the run and lands on Today (no log, no actual)", async () => {
    mockKeepAwake();
    saveRun(buildFreeRowRun(FIXED_NOW));
    await renderTimer();

    await userEvent.click(screen.getByRole("button", { name: "END →" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Abandon session" }),
    );

    expect(screen.getByText("TODAY SCREEN")).toBeInTheDocument();
    expect(loadRun()).toBeNull();
  });
});
