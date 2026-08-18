// Two strategies, the same split `ConnectedInterstitial.test.tsx` uses and
// for the same reason:
//
// - **Per-state rendering** hands `ConnectedSurface` a `MonitorSession`
//   directly. This component's whole job is "draw whatever session you are
//   given"; the hook's own mapping from a driver outcome to a phase is
//   Task 4's proven territory, and re-deriving `paused`'s four-frame freeze
//   here would test the hook a second time instead of the panes.
// - **One fake-driven walk** renders the REAL `ConnectedInterstitial` over
//   the REAL `useMonitorSession` over `transports/fake.ts`'s CSAFE-correct
//   simulator, on a REAL seeded library workout, and pumps it until the
//   machine is rowing — so the numbers the panes show are numbers that
//   actually came off a (simulated) wire, through the real driver and the
//   real interval-index normalization, not values a test typed in.
//
// Every fixture in this file is "Filling Low" from the seeded 300 (8:00
// warm-up, then 4 × 2000 m with 3:00 rest — retuned from 3 reps in Task 3,
// 2026-08-10 library-rebalance, to reach its new 45-60 band), never a
// hand-built minimum.

import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import { fmtDuration } from "../../domain/duration.js";
import { WORKOUTSTATE_INTERVALWORKTIME } from "../../domain/monitor/pm5/parse.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { createFakeTransport } from "../monitor/transports/fake";
import type {
  ConnectedPhase,
  MonitorSession,
  RunIdentity,
} from "../monitor/useMonitorSession";
import { buildDraft } from "../session/draft";
import { buildRun, type EnginePhase } from "../session/engine";
import type { LogSeed } from "../session/logDraft";
import { totalSessionSecondsOf } from "../session/Timer";
import { ARM_TIMEOUT_MS } from "../session/useStagedDiscard";
import { commentStrippedSource, type CssRule, cssRules } from "../test/cssView";
import { buildSurfaceModel } from "./connected/surfaceModel";
import { PANES } from "./connected/SegmentedControl";
import { useSurfaceSwipe } from "./connected/swipe";
import ConnectedInterstitial from "./ConnectedInterstitial";
import ConnectedSurface, {
  DEFAULT_PANE,
  LAST_PANE_KEY,
  loadLastPane,
} from "./ConnectedSurface";

// A spy over the REAL implementation, not a stub (the same
// `vi.importActual` idiom `ConnectedInterstitial.test.tsx` uses for
// `useMonitorSession`) — every pane in this file still renders off a real
// `SurfaceModel`, so nothing else in this suite has to change; the spy
// exists purely so the tests below can read what `status` ConnectedSurface
// actually PASSED, which is otherwise unobservable once `"armed"` and
// `"live"` render identically (Task 3 owns the armed pane; task-2 review
// finding: the ternary that picks `"armed"` had no test that could detect
// its own deletion — self-mutation #5 in the task-2 report proved it,
// 138/138 unaffected with the branch removed).
vi.mock("./connected/surfaceModel", async () => {
  const actual = await vi.importActual<
    typeof import("./connected/surfaceModel")
  >("./connected/surfaceModel");
  return { ...actual, buildSurfaceModel: vi.fn(actual.buildSurfaceModel) };
});

const mockBuildSurfaceModel = vi.mocked(buildSurfaceModel);

/** `index.css`'s path on disk. Plain string surgery on `import.meta.url`,
 *  not the global `URL` constructor: this project's jsdom environment
 *  resolves `new URL("../index.css", import.meta.url)` against
 *  `http://localhost:3000/` instead of the given `file://` base — a jsdom
 *  quirk `TimerTargets.test.tsx` documented first. Reading the source text is
 *  necessary because Vitest mocks every `.css` import to an empty string for
 *  this project, so there is no rule for `getComputedStyle` to see. */
function indexCssPath(): string {
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/workout\/[^/]+\.test\.tsx$/, "index.css");
}

/** `index.css` with every comment stripped — the only view of the
 *  stylesheet the assertions below get, so none of them can be satisfied by
 *  a rule's own prose (the defect `cssView.ts`'s header records three times
 *  over). Several tests in this file used to regex the RAW source. */
const INDEX_CSS = commentStrippedSource(readFileSync(indexCssPath(), "utf-8"));

/** `ConnectedSurface.tsx`'s own source, RAW — not comment-stripped, on
 *  purpose: the no-PAUSED-noun sweep (task 5, connected-axes 2a) checks the
 *  whole file, comments included, because a stale doc comment quoting the
 *  retired copy is exactly the kind of drift `.claude/agent-briefing.md`'s
 *  own "grep for comments describing what you just changed" rule exists to
 *  catch — this test automates that check for this one string rather than
 *  trusting a sweep at review time. Same `import.meta.url` path-surgery
 *  idiom `indexCssPath()` uses just above, one directory shallower (this
 *  test file and its subject share `src/workout/`). */
function connectedSurfaceSourcePath(): string {
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/ConnectedSurface\.test\.tsx$/, "ConnectedSurface.tsx");
}

const CONNECTED_SURFACE_SOURCE = readFileSync(
  connectedSurfaceSourcePath(),
  "utf-8",
);

/** Every rule for `selector` in the stylesheet, at any nesting depth,
 *  outermost first. Plural on purpose: `.exec`'s first-match-only behaviour
 *  is test-integrity sweep P17 — `.connected-end { width: 100%; flex-grow:
 *  1 }` appended to `index.css` passed the very test that says "no
 *  width/flex-grow declaration ANYWHERE in its own block". */
function rulesFor(selector: string): CssRule[] {
  return cssRules(INDEX_CSS).filter((rule) =>
    rule.selectors.includes(selector),
  );
}

/** The body of the ONE rule for `selector`. */
function ruleBody(selector: string): string {
  const rules = rulesFor(selector);
  expect(rules, `expected exactly one rule for ${selector}`).toHaveLength(1);
  return rules[0]!.body;
}

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE = "PM5 432331249";

// 7C Task 1: `RunIdentity.logSeed` is required now. This file's subject is
// the connected panes' rendering/wiring, not seed content, so one
// placeholder fills the fixture below via a spread.
const TEST_SEED: { logSeed: LogSeed } = {
  logSeed: { steps: [], paces: {} },
};

function fillingLow(): {
  program: WorkoutProgram;
  phases: EnginePhase[];
  identity: RunIdentity;
} {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "filling-low",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  // 2026-08-09's warmup setting: Filling Low's own 8:00 `wu` row is gone
  // from the seed; the warm-up interval this whole file's indices assume
  // now comes from the rower's PREFERENCE, `buildRun`'s one producer for
  // it. Same 480s interval 0, same everything downstream.
  const phases = buildRun(draft, baselines, t0, {
    kind: "time",
    minutes: 8,
  }).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return {
    program,
    phases,
    identity: { workoutId: "filling-low", title: w.title, ...TEST_SEED },
  };
}

const FIXTURE = fillingLow();

/** The first work phase's own resolved split — every "slower"/"faster"
 *  fixture below is built relative to the WORKOUT's number, never a
 *  literal typed into this file. */
const WORK_PHASE = (() => {
  const p = FIXTURE.phases.find((x) => x.type === "work");
  if (!p?.targetSplit) throw new Error("fixture has no split work phase");
  return p;
})();

/** Interval 1 is the first 2000 m work interval (interval 0 is the
 *  warm-up), so a frame with `intervalIndex: 1` sits on `WORK_PHASE`. */
function frame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  // The session pair mirrors the raw pair unless a case overrides it — see
  // `connected/surfaceModel.test.ts`'s own copy of this factory for the
  // full walk-4 reasoning.
  const f: MonitorFrame = {
    elapsedSeconds: 600,
    distanceMeters: 2400,
    sessionElapsedSeconds: 600,
    sessionDistanceMeters: 2400,
    currentSplit: WORK_PHASE.targetSplit!,
    spm: WORK_PHASE.spm ?? 22,
    heartRateBpm: 164,
    splitAvgPace: null,
    intervalIndex: 1,
    intervalRemaining: { kind: "distance", value: 1200 },
    intervalAccrued: null,
    state: "rowing",
    rowingActive: true,
    ...overrides,
  };
  return {
    ...f,
    sessionElapsedSeconds: overrides.sessionElapsedSeconds ?? f.elapsedSeconds,
    sessionDistanceMeters: overrides.sessionDistanceMeters ?? f.distanceMeters,
  };
}

function session(overrides: Partial<MonitorSession> = {}): MonitorSession {
  return {
    phase: "live" as ConnectedPhase,
    error: null,
    deviceName: DEVICE,
    frame: frame(),
    actuals: [],
    endedBy: null,
    handoffHeld: false,
    frozen: false,
    runOpen: true,
    connect: vi.fn().mockResolvedValue(undefined),
    program: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    exportLog: vi.fn().mockReturnValue("[]"),
    ...overrides,
  };
}

function renderSurface(
  overrides: Partial<MonitorSession> = {},
  onEnded: () => void = vi.fn(),
) {
  const current = session(overrides);
  const view = render(
    <ConnectedSurface
      phases={FIXTURE.phases}
      program={FIXTURE.program}
      session={current}
      onEnded={onEnded}
    />,
  );
  return { ...view, session: current, onEnded };
}

/** The segmented control's two halves, by accessible name (the visible
 *  `LIVE`/`GRID` word is `aria-hidden` — RULING, antagonist correction 2:
 *  the names carry over from the retired `PagerRail` unchanged, since ~27
 *  selectors across unit/e2e/fixtures already anchor on them). */
function controlHalf(pane: "Live" | "Grid") {
  return screen.getByRole("button", { name: `${pane} pane` });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// THE STATUS PRECEDENCE reaches buildSurfaceModel (connected-axes design
// spec §1, task 2). CALLER-level, not model-level: `surfaceModel.test.ts`
// already proves `buildSurfaceModel` renders correctly FOR a given status;
// these two prove `ConnectedSurface` computes the RIGHT status from a
// session in the first place — the ternary this component owns. Both cases
// are otherwise unobservable through the DOM today: nothing renders
// `"armed"` differently from `"live"` yet (Task 3's job), which is exactly
// why the task-2 review found this gap — reading the spy's own call args is
// the only way to catch a regression here before Task 3 gives it a pixel.
// ---------------------------------------------------------------------------

describe("the status precedence reaches buildSurfaceModel (task-2 review finding)", () => {
  it('phase "ready" (numbers already requested) — an armed program with no session open — calls buildSurfaceModel with status "armed"', () => {
    // `"ready"` reaching this component at all only happens once the rower
    // has asked for the numbers (`ConnectedInterstitial.tsx`'s own phase
    // gate) — this test renders `ConnectedSurface` directly with that
    // phase, the same "hand it a session, it draws whatever it's given"
    // strategy every other describe block in this file uses (see header).
    renderSurface({ phase: "ready" });
    expect(mockBuildSurfaceModel).toHaveBeenCalled();
    const lastCall = mockBuildSurfaceModel.mock.calls.at(-1)!;
    expect(lastCall[0].status).toBe("armed");
  });

  it('the freeze predicate having fired ("frozen") calls buildSurfaceModel with status "paused", even at phase "live"', () => {
    // The mirror case, isolated from the armed branch on purpose: `"live"`
    // with an open session never satisfies `session === "none"`, so this
    // proves the SEPARATE `activity === "frozen"` arm of the same ternary,
    // not a second path to the same result.
    renderSurface({ phase: "live", frozen: true, runOpen: true });
    const lastCall = mockBuildSurfaceModel.mock.calls.at(-1)!;
    expect(lastCall[0].status).toBe("paused");
  });
});

// I-1, final whole-branch review fix wave — "Task 3 owns the armed pane"
// (this file's own comment above), finally given a pixel: `armed` now
// renders visibly differently from `live`, not merely a different `status`
// string the model happened to receive.
describe("armed's first frame, in the DOM (I-1)", () => {
  it("neither hero shows NOW — the label is gone, not merely relabelled", () => {
    renderSurface({
      phase: "ready",
      frame: frame({ state: "armed", elapsedSeconds: 0, distanceMeters: 0 }),
    });
    expect(screen.queryByText("NOW")).toBeNull();
    expect(screen.queryByText("LAST")).toBeNull();
  });

  it("the grid's active row carries no gold countdown mark", () => {
    localStorage.setItem(LAST_PANE_KEY, "grid");
    renderSurface({
      phase: "ready",
      frame: frame({ state: "armed", elapsedSeconds: 0, distanceMeters: 0 }),
    });
    expect(document.querySelector(".connected-grid-countdown")).toBeNull();
  });

  it("TOTAL LEFT reads the whole session — never the default fixture's mid-session 600s", () => {
    renderSurface({
      phase: "ready",
      // The default `frame()` fixture is deliberately mid-session-shaped
      // (`sessionElapsedSeconds: 600`, `intervalIndex: 1`) — this is the
      // exact carried-over shape that would leak a partial bar if the
      // armed suppression were removed.
      frame: frame({ state: "armed" }),
    });
    // Pane defaults to "live" (`DEFAULT_PANE`): read the band's own TOTAL
    // LEFT cell directly (`.timer-total-value` died with `TimerRuler`,
    // CR2 spec 3 Task 4 — `.connected-band-cell-value` is its replacement).
    expect(
      document.querySelector(".connected-band-cell-value")!.textContent,
    ).toBe(fmtDuration(totalSessionSecondsOf(FIXTURE.phases) / 60));
  });
});

// ---------------------------------------------------------------------------
// The shell: landing, persistence, swipe, the labelled rail
// ---------------------------------------------------------------------------

describe("landing and persistence (handoff §3: per ROWER, first-ever lands B)", () => {
  it("lands on pane B the first time this rower ever connects", () => {
    renderSurface();
    expect(controlHalf("Live")).toHaveAttribute("aria-current", "page");
    expect(DEFAULT_PANE).toBe("live");
  });

  it("lands on whichever pane the rower last used, not on the workout's", async () => {
    const first = renderSurface();
    await userEvent.click(controlHalf("Grid"));
    expect(localStorage.getItem(LAST_PANE_KEY)).toBe("grid");
    first.unmount();

    renderSurface();
    expect(controlHalf("Grid")).toHaveAttribute("aria-current", "page");
  });

  it("ignores a garbage stored value rather than rendering nothing", () => {
    localStorage.setItem(LAST_PANE_KEY, "not-a-pane");
    expect(loadLastPane()).toBe(DEFAULT_PANE);
  });

  // connected-revamp Task 2: `PANES` drops "timer" (the pane, and the
  // string). A rower who connected before this shipped can still have it
  // sitting in their own `localStorage`, and design spec §6 rules that this
  // is PINNED, not migrated — the existing `PANES.includes` guard in
  // `loadLastPane` already treats any value outside the current `PANES` as
  // garbage, so "timer" needs no special case at all, only proof that the
  // general path actually catches THIS specific value now that it is one.
  it("has exactly two panes, and neither of them is the retired timer pane", () => {
    // One exact pin. The `toHaveLength(2)` and `not.toContain("timer")`
    // that used to bracket it could not fail once it passed (S0g).
    expect(PANES).toStrictEqual(["live", "grid"]);
  });

  it("a stored 'timer' — a real rower's pre-Task-2 value, not synthetic garbage — lands on live", () => {
    localStorage.setItem(LAST_PANE_KEY, "timer");
    expect(loadLastPane()).toBe(DEFAULT_PANE);
    // And the real surface renders it, not just the loader function.
    renderSurface();
    expect(controlHalf("Live")).toHaveAttribute("aria-current", "page");
  });

  it("survives storage throwing outright", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadLastPane()).toBe(DEFAULT_PANE);
  });
});

// The swipe handler is GONE (CR2 spec 3 task 1, design spec Ruling 4: "not
// riding the phase's only canary build. It can return later behind a device
// verification"). `SegmentedControl` is the only way to change panes now —
// its own `SegmentedControl.test.tsx` covers the control in isolation; the
// describe block below covers it wired into the real shell (triple-tap,
// focus restore, landmark structure).

describe("the control is LABELLED (handoff §3, DEVIATIONS row 4)", () => {
  it("carries exactly two labelled halves, never bare dots", () => {
    // `SegmentedControl` (CR2 spec 3 task 1) drops `PagerRail`'s decorative
    // mark and its long/short label pair entirely — a single visible word
    // per half, `--c-size-control` the same size in every orientation
    // (design spec §1), so unlike the retired rail there is no second class
    // pair for a media query to toggle.
    renderSurface();
    const nav = screen.getByRole("navigation", { name: "Connected panes" });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    // …and the control holds NOTHING BUT those two (carried over from the
    // rail's own child census, James's erg walk 2026-08-13): a child census
    // rather than a `querySelector` null check because landscape divides
    // this column with CSS that places children by COUNT, so a third child
    // reappearing would push LIVE and GRID off the ends it puts them on.
    expect(Array.from(nav.children).map((el) => el.tagName)).toStrictEqual([
      "BUTTON",
      "BUTTON",
    ]);
    expect(buttons.map((b) => b.textContent)).toStrictEqual(["LIVE", "GRID"]);
  });

  it("reaches pane C, the grid (Task 7 filled the slot)", async () => {
    renderSurface();
    await userEvent.click(controlHalf("Grid"));
    expect(controlHalf("Grid")).toHaveAttribute("aria-current", "page");
    expect(document.querySelector(".connected-pane-grid")).not.toBeNull();
    // The placeholder this replaced is gone for good — a stale rule left
    // behind is what makes a dead class look load-bearing.
    expect(
      document.querySelector(".connected-pane-grid-placeholder"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Both panes, per state
// ---------------------------------------------------------------------------

/** Every judged value on whichever pane is showing, as
 *  `[label, text, judgement class]`. The panes' cards and pane B's hero all
 *  wear `timer-card-actual-{judgement}`, which is what makes this one query
 *  able to sweep them. */
function judgedCells(): { text: string; judgement: string }[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[class*="timer-card-actual-"]'),
  ).map((el) => ({
    text: el.textContent ?? "",
    judgement: /timer-card-actual-(\w+)/.exec(el.className)?.[1] ?? "none",
  }));
}

describe("pane B — live (connected-revamp Task 3: two heroes; CR2 spec 3 Task 4 rebuilt the pane — see PaneLive.test.tsx for the tables' own checklist)", () => {
  it("leads with the split, cut so the eye lands on the seconds", () => {
    renderSurface({ frame: frame({ currentSplit: 117.8 }) });
    const hero = document.querySelector(
      ".connected-hero-split .connected-hero-value",
    )!;
    expect(hero.textContent).toBe("1:57.8");
    expect(hero.querySelector(".connected-hero-tenths")!.textContent).toBe(
      ".8",
    );
  });

  // The metric row (LEFT IN INTERVAL/METERS LEFT, TOTAL M, HR) is CUT
  // outright (CR2 spec 3 Task 4, spec §3 fate table) — its old test lived
  // here; `PaneLive.test.tsx`'s "cut from LIVE" describe block is where
  // that absence is proven now.

  // Cards are gone (revision §3: "the old three metric cards are gone").
  // RATE is a second hero, at the same scale as the split — METERS and HR
  // have no slot on this pane any more at all (Task 4 cut the metric row
  // that used to carry them; `PaneLive.test.tsx` covers the target/unit
  // detail this test used to check).
  it("promotes RATE to a second hero — no cards anywhere", () => {
    renderSurface();
    const rateHero = document.querySelector(".connected-hero-rate")!;
    // No NOW label above the hero (CR2 spec 3 Task 2, design spec §2A's
    // own "Cut from LIVE: NO NOW/TARGET/UP NEXT labels"): `nowLabel`
    // collapses to `stale ? "LAST" : ""`, so PaneLive's existing `!== ""`
    // guard renders no `.connected-hero-label` at all for a live status.
    expect(rateHero.querySelector(".connected-hero-label")).toBeNull();
    expect(rateHero.querySelector(".connected-hero-value")).not.toBeNull();
    expect(
      rateHero.querySelector(".connected-hero-target-value"),
    ).not.toBeNull();

    expect(document.querySelector(".timer-card")).toBeNull();
    expect(document.querySelector(".connected-cards-triple")).toBeNull();
    expect(document.querySelector(".connected-metric-row")).toBeNull();
  });

  it("renders the split target's ref line only when there IS one — no empty span on a no-target phase", () => {
    // BOTH BRANCHES, on the same real fixture, because "renders nothing"
    // is only meaningful beside a case that renders something (tail review
    // M-5). Filling Low's interval 1 is a work piece at a 6K ref; its
    // warm-up carries no target at all, which is the shape most phases
    // have — Easy, Rest, All out and both effort words all caption blank.
    renderSurface({ frame: frame({ intervalIndex: 1 }) });
    const withRef = document.querySelector(".connected-hero-target-ref");
    expect(withRef).not.toBeNull();
    expect(withRef!.textContent).not.toBe("");
    cleanup();

    renderSurface({
      frame: frame({
        intervalIndex: 0,
        intervalRemaining: { kind: "time", value: 120 },
      }),
    });
    // Not "is empty" — ABSENT. An empty span still occupies a flex slot and
    // still lands in the accessibility tree, which is exactly what M-5 was
    // about, so a `textContent === ""` assertion would pass against the
    // defect it is meant to catch.
    expect(document.querySelector(".connected-hero-target-ref")).toBeNull();
    // …and the slot it used to sit in still holds what's really there —
    // just the value now (CR2 spec 3 Task 4 cut the TARGET label word
    // outright, spec §2A: "no NOW/TARGET/UP NEXT labels"), so this is a
    // deletion and not a collapse.
    const box = document.querySelector(".connected-hero-target")!;
    expect(Array.from(box.children).map((c) => c.className)).toStrictEqual([
      "connected-hero-target-value connected-value-absent",
    ]);
  });

  it("puts both targets under their hero in INK, never accent (the supersession)", () => {
    renderSurface();
    const targets = document.querySelectorAll(".connected-hero-target-value");
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(target.className).not.toContain("accent");
    }
    // ...but that className loop structurally CANNOT fail (test-integrity
    // sweep, P16): `PaneLive.tsx`'s two possible class strings for this
    // span are `connected-hero-target-value` and `… connected-value-absent`,
    // neither of which can contain "accent", and jsdom loads no stylesheet
    // here — so the COLOUR was decided entirely by CSS and nothing in this
    // file read it. Proven: `color: var(--accent)` added to the rule, the
    // exact regression this test names, passed 71/71.
    //
    // The target is ink BY INHERITANCE — the rule declares no `color` at
    // all — so that absence is what gets asserted, across every rule the
    // stylesheet has for the class at any nesting depth.
    const targetRules = rulesFor(".connected-hero-target-value");
    expect(targetRules).toHaveLength(1);
    for (const rule of targetRules) {
      expect(rule.body).not.toMatch(/color\s*:/);
    }
    // Accent appears NOWHERE on this pane.
    expect(document.querySelector(".timer-card-value-accent")).toBeNull();
    expect(document.querySelector(".button-l1")).toBeNull();
  });

  // THE HERO CANNOT CLIP (design spec §6/revision §3): `min-width: 0` on
  // the column and `white-space: nowrap` on the numeral (index.css) are the
  // layout half; the model half is this cap, so the hero never has more
  // characters to lay out than it was sized for in the first place.
  it("caps a split slower than 9:59.9 at the dash, rather than growing the numeral", () => {
    renderSurface({ frame: frame({ currentSplit: 700 }) });
    const hero = document.querySelector(
      ".connected-hero-split .connected-hero-value",
    )!;
    expect(hero.textContent).toBe("—");
    expect(hero.className).toContain("timer-card-actual-within");
  });

  // THE NO-TARGET STATE (design spec §6, as revised 2026-08-13): every REST
  // phase hits this. The target slot holds its space and names the PHASE
  // (`Rest`/`Free`) in `--ink-3` (`connected-value-absent`) where §6
  // originally put a dash; the actual above stays UNJUDGED (plain ink — no
  // `-faster`/`-slower`/`-stale` class), because a value with nothing to
  // compare against must not be tinted.
  it("during REST both targets name the phase (Rest / Free) in the absent tone, and both actuals above stay unjudged", () => {
    renderSurface({
      frame: frame({
        intervalIndex: 1,
        state: "resting",
        // Numbers that would scream "faster"/"slower" against any real
        // target, to prove the absent target is what suppresses the tint.
        currentSplit: 60,
        spm: 40,
      }),
    });
    const targets = document.querySelectorAll<HTMLElement>(
      ".connected-hero-target-value",
    );
    expect(targets).toHaveLength(2);
    // The WORDS, in order (split hero then rate hero) — a shared loop over
    // both would pass if the two slots swapped, which is exactly the kind
    // of thing this rename could break. The absent CLASS is what keeps
    // §6's concern answered now that the slot carries a word: greyed, so
    // it cannot read as a programmed number.
    expect(targets[0]!.textContent).toBe("Rest");
    expect(targets[1]!.textContent).toBe("Free");
    for (const target of targets) {
      expect(target.className).toContain("connected-value-absent");
    }

    const paceValue = document.querySelector(
      ".connected-hero-split .connected-hero-value",
    )!;
    const rateValue = document.querySelector(
      ".connected-hero-rate .connected-hero-value",
    )!;
    expect(paceValue.className).toContain("timer-card-actual-within");
    expect(paceValue.className).not.toContain("connected-value-absent");
    expect(rateValue.className).toContain("timer-card-actual-within");
    expect(rateValue.className).not.toContain("connected-value-absent");
  });

  // The metric row (three values on one baseline) and its own CSS rule
  // (`--size-hero`/`--size-target`/`--size-metric`) both died with CR2
  // spec 3 Task 4 — the pane's own hero/target/band CSS is now on the
  // `--c-size-*` family, checked by `PaneLive.test.tsx`'s own token tests
  // rather than duplicated here.
});

// ---------------------------------------------------------------------------
// The judgement, through ONE code path
// ---------------------------------------------------------------------------

describe("judgement: one helper, every pane (handoff §3)", () => {
  const target = WORK_PHASE.targetSplit!;

  // Direction is the ROWER's, not the number's: a smaller split is a
  // faster boat, so it is `"faster"` (blue). `domain/judge.ts` owns that
  // rule.
  it("tints pane B's hero blue when faster and red when slower", () => {
    const fast = renderSurface({
      frame: frame({ currentSplit: target - 10 }),
    });
    const heroClass = document.querySelector(
      ".connected-hero-value",
    )!.className;
    expect(heroClass).toContain("timer-card-actual-faster");
    fast.unmount();

    renderSurface({ frame: frame({ currentSplit: target + 10 }) });
    expect(
      document.querySelector(".connected-hero-value")!.className,
    ).toContain("timer-card-actual-slower");
  });

  it("judges within tolerance as plain ink, no tint class beyond -within", () => {
    renderSurface({ frame: frame({ currentSplit: target }) });
    const hero = document.querySelector(".connected-hero-value")!;
    expect(hero.className).toContain("timer-card-actual-within");
    expect(hero.className).not.toContain("timer-card-actual-faster");
    expect(hero.className).not.toContain("timer-card-actual-slower");
  });

  it("EVERY judged cell on pane B goes through the helper — none opts out", () => {
    renderSurface({ frame: frame({ currentSplit: target + 10, spm: 99 }) });
    const cells = judgedCells();
    // hero + rate — HR and meters DIED off `PaneLive` (CR2 spec 3 Task 4,
    // spec §3 fate table): they had no other judged-cell renderer on this
    // pane, so "every" now means these two.
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(["slower", "within", "faster", "stale"]).toContain(cell.judgement);
    }
    expect(cells.some((c) => c.judgement === "faster")).toBe(true);
  });

  it("index.css paints faster BLUE and slower RED, from the judgement's own tokens", () => {
    const slower = ruleBody(".timer-card-actual-slower");
    const faster = ruleBody(".timer-card-actual-faster");
    // Tester feedback via James, 2026-08-13. `--judge-*` now, NOT the
    // handoff's `--type-o2`/`--type-at`: a workout's TYPE and a live verdict
    // are unrelated facts that happened to share a swatch. The negative
    // assertion pins the separation, so a palette move on the type side
    // cannot quietly repaint a verdict.
    expect(faster).toContain("var(--judge-faster)");
    expect(slower).toContain("var(--judge-slower)");
    expect(faster).not.toContain("--type-");
    expect(slower).not.toContain("--type-");
    // Accent is never a judgement colour: it is the target's, everywhere
    // else in the app, and on these panes the target is ink.
    expect(slower).not.toContain("--accent");
    expect(faster).not.toContain("--accent");
  });

  it("the two verdict tokens are declared, distinct, and actually blue and red", () => {
    // Without this, the rule above only proves the CLASSES reference the
    // tokens: a token never declared, or declared twice as the same colour,
    // would leave both verdicts identical and still pass. Read from
    // tokens.css because that is where they live.
    const tokens = readFileSync(
      indexCssPath().replace(/index\.css$/, "theme/tokens.css"),
      "utf-8",
    );
    const faster = /--judge-faster:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1];
    const slower = /--judge-slower:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1];
    expect(faster).toBeDefined();
    expect(slower).toBeDefined();
    expect(faster).not.toBe(slower);
    const rgb = (hex: string) => ({
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    });
    const f = rgb(faster!);
    const s = rgb(slower!);
    // The testers asked for blue and red by name, so assert the hue, not
    // just that two different strings are present.
    expect(f.b).toBeGreaterThan(f.r); // blue, not the old teal
    expect(s.r).toBeGreaterThan(s.b); // red, not the old ochre
  });
});

// ---------------------------------------------------------------------------
// The tab bar the surface hides
// ---------------------------------------------------------------------------

/** jsdom loads no stylesheet for this project (Vitest mocks every `.css`
 *  import to an empty string — `node-fs-raw.d.ts` records the empirical
 *  check), so a `getComputedStyle` assertion here would pass against any CSS
 *  at all. This reads the rule out of `index.css`'s own source text, the same
 *  idiom `TimerTargets.test.tsx` uses for the stale token and the paused
 *  block uses for its 52px. The BROWSER-side half — that the bar actually
 *  computes away, and that these captures are taken against a DOM the device
 *  produces — is `e2e/screenshots.spec.ts`'s own `.tabbar` node and its
 *  `toBeHidden()` assertion (task-6 review, M1: both halves were unguarded,
 *  and deleting the two rules broke nothing).
 *
 *  Task 8 converted `.connected-interstitial` to the SAME `:has()`
 *  mechanism this surface already used, in one commit with removing the
 *  interstitial's own `- var(--tap)` height term (task-6 review's own
 *  carry) — this describe block is REWRITTEN, not merely extended, to pin
 *  the POST-conversion pair: the two class names now share ONE selector
 *  list on each shell rule, and `.connected-interstitial`'s height no
 *  longer subtracts the tab bar's height at all. `commentStrippedSource`
 *  (`../test/cssView`) is load-bearing on the third assertion below — this
 *  file's own PRE-conversion version of this test named the exact trap it
 *  closes (task-6 re-review, L6): the block's own doc comment says the
 *  words "var(--tap)" in prose even in the FIXED file (see this file's own
 *  height-rule comment), so a naive `.toContain("var(--tap)")` over raw
 *  source can't tell a real term from a sentence describing its absence. */
describe("index.css: both connected screens hide the shell's tab bar (the post-:has()-conversion pair)", () => {
  const css = commentStrippedSource(readFileSync(indexCssPath(), "utf-8"));

  it("hides the bar whenever EITHER connected screen is on screen, in one rule", () => {
    const rule =
      /\.app-shell:has\(\.connected-surface\)\s+\.tabbar,\s*\.app-shell:has\(\.connected-interstitial\)\s+\.tabbar\s*\{([^}]*)\}/.exec(
        css,
      );
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("display: none");
  });

  it("reclaims the 44px the shell reserves for it, for EITHER connected screen", () => {
    // `.app-shell`'s unconditional `padding-bottom: calc(var(--tap) + ...)`
    // is what left 320px of usable height at 844x390 — enough to clip pane
    // A's ruler and UP NEXT away entirely. Hiding the bar without dropping
    // the padding fixes nothing.
    const rule =
      /\.app-shell:has\(\.connected-surface\),\s*\.app-shell:has\(\.connected-interstitial\)\s*\{([^}]*)\}/.exec(
        css,
      );
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("padding-bottom: 0");
  });

  // THE PAIRED EDIT (task-6 review's carry, landed by Task 8). Doing either
  // half alone re-creates a real defect, in opposite directions: the
  // selector reaching the interstitial with the height term LEFT IN
  // re-creates the dead 44px of scroll the term used to cover for (now
  // double-reserved: once by the removed padding, once by the still-present
  // subtraction); the height term REMOVED with the selector NOT extended
  // uncovers the 151px landscape overflow the term existed to prevent,
  // against a tab bar that's still on screen. Both halves are asserted here
  // together so a revert of either one fails this ONE test, not two
  // separately-skippable ones.
  it("THE PAIRED EDIT: the selector reaches the interstitial AND its height term is gone — never one without the other", () => {
    const selectorRule =
      /\.app-shell:has\(\.connected-surface\),\s*\.app-shell:has\(\.connected-interstitial\)\s*\{([^}]*)\}/.exec(
        css,
      );
    expect(selectorRule).not.toBeNull();
    const heightRule = /\.connected-interstitial\s*\{([^}]*)\}/.exec(css);
    expect(heightRule).not.toBeNull();
    expect(heightRule![1]).not.toContain("var(--tap)");
  });
});

// ---------------------------------------------------------------------------
// Mid-session: frozen (connected-axes 2a, task 5 — `phase: "paused"` retired
// off `ConnectedPhase`; every fixture below is `phase: "live", frozen: true`
// now, `useMonitorSession.ts`'s own new shape)
// ---------------------------------------------------------------------------

describe("frozen (handoff §4, restyled by connected-axes 2a task 5)", () => {
  // Connected-revamp Task 6: End moved out of the footer into the header
  // (revision §2), where it now renders UNCONDITIONALLY — frozen or not.
  // The frozen block gets its OWN END/AGAIN affordance in the footer slot
  // End vacated; the two are not mutually exclusive any more, they are two
  // independent controls sharing the same armed state.
  it("End's header control survives a freeze, and the frozen block adds its own END/AGAIN", () => {
    // `statusWord`'s own "says PAUSED" half of this test retired with pane
    // A (`PaneTimer.tsx`, connected-revamp Task 2): it was the field's only
    // renderer, and no surviving pane shows a status word at all.
    renderSurface({ frozen: true });
    expect(screen.getByText("PULL TO RESUME")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End session" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "END" })).toBeInTheDocument();
  });

  // THE NOUN IS GONE (task 5 step 1 — spec 2a's own trigger: the PM5 has no
  // paused state, and the block covered the one number, TOTAL LEFT, that
  // would have told the rower the clock never stopped). Source-sweep half
  // alongside the rendered half: the component's own source carries no
  // instance of the caps noun any more, not even in a comment describing a
  // retired string — `ConnectedSurface.tsx`'s own copy has moved on. The
  // `SurfaceStatus` member `"paused"` is untouched by this (`surfaceModel
  // .ts`'s own doc comment: the internal name stays, the user-facing noun
  // is what died) and never trips this regex since it is lower-case.
  it("no PAUSED noun anywhere: not rendered, not in the component's own source", () => {
    renderSurface({ frozen: true });
    expect(screen.getByText("PULL TO RESUME")).toBeInTheDocument();
    expect(screen.queryByText(/PAUSED/)).not.toBeInTheDocument();
    expect(CONNECTED_SURFACE_SOURCE).not.toMatch(/PAUSED/);
  });

  it("THE FOOTER GROWS INTO THE PANE, NOT OVER IT: the header and the pane's own top row never move", () => {
    // The header (End's own home) is a THIRD invariant alongside the
    // footer: it renders the same three children regardless of state
    // (`ConnectionLine` + the status span + End — three since Task 6's fix
    // round split the status out to its own direct child, CRITICAL 1; was
    // two before that, one before CR2 spec 3 task 1 moved `ConnectionLine`
    // here from the panes), so its own fixed height can never be what
    // moves the pane body underneath it.
    const live = renderSurface();
    const liveHeader = document.querySelector(".connected-header")!;
    expect(liveHeader.children).toHaveLength(3);
    const liveFooter = document.querySelector(".connected-surface-footer")!;
    // Empty while rowing — End no longer lives here, and the task-6 ruling's
    // zero-cost-while-rowing property survives task 5's own rework of the
    // mechanism (see the CSS test below for what changed and what didn't).
    expect(liveFooter.children).toHaveLength(0);
    live.unmount();

    renderSurface({ frozen: true });
    const frozenHeader = document.querySelector(".connected-header")!;
    expect(frozenHeader.children).toHaveLength(3);
    const frozenFooter = document.querySelector(".connected-surface-footer")!;
    // One child now — the frozen block alone in the slot End vacated, IN
    // FLOW (task 5) rather than overlaid — the mechanism behind the
    // no-occlusion fix the CSS test below pins directly.
    expect(frozenFooter.children).toHaveLength(1);
    // The footer sits in the SAME place in the tree either way — directly
    // after the pane body, directly before the segmented control — so the
    // only thing that differs between the two states is whether it has a
    // child; task 5 deliberately spends the footer's own HEIGHT to buy
    // that (it used to cost nothing at all, via the overlay this task
    // retires — see the CSS test's own comment for why that overlay was
    // the occlusion bug).
    expect(frozenFooter.previousElementSibling!.className).toContain(
      "connected-surface-body",
    );
    expect(frozenFooter.nextElementSibling!.className).toContain(
      "connected-control",
    );
  });

  it("index.css: the frozen block is IN FLOW, not overlaid — no occlusion by construction", () => {
    // TASK 5's OWN FIX (connected-axes 2a — corrects the task-6 fix round's
    // overlay). That overlay bought "nothing above shifts" for free by
    // painting the block OVER the pane's own last 52px — which covered
    // TOTAL LEFT, the one number the frozen state exists to keep the rower
    // reading (spec 2a's own trigger). A normal-flow child cannot paint
    // over anything by construction: it has no `position: absolute` left to
    // do it with, so this is a STRUCTURAL guarantee, not a pixel one — the
    // real geometry (TOTAL LEFT's own bounding box never intersecting the
    // block's) is `design.spec.ts`'s job, the same idiom its no-overlap
    // pane-B test already uses; jsdom computes no real layout for this file
    // to check that with.
    const footers = rulesFor(".connected-surface-footer");
    // Two rules, and now WHICH is which is checked rather than assumed:
    // the base one at the top level, the landscape query's placement
    // override genuinely inside a landscape query.
    expect(footers.map((rule) => rule.at)).toStrictEqual([
      [],
      ["@media (orientation: landscape)"],
    ]);
    // No fixed height and no positioning left to anchor an overlay against
    // — a normal flex row that costs nothing empty and exactly its child's
    // height once it has one.
    expect(footers[0]!.body).not.toMatch(/height\s*:/);
    expect(footers[0]!.body).not.toContain("position");
    expect(footers[1]!.body).not.toMatch(/height\s*:/);

    const paused = ruleBody(".connected-paused");
    expect(paused).not.toContain("position: absolute");
    expect(paused).not.toContain("bottom: 0");
    // `flex: 1` is what spans the footer's own width now that `left: 0;
    // right: 0` (the absolute version's own full-bleed mechanism) is gone.
    expect(paused).toContain("flex: 1");
  });

  it("index.css inverts the frozen band: ink field, paper label (2026-08-08, the operator missed the grey one)", () => {
    expect(ruleBody(".connected-paused")).toContain("background: var(--ink)");
    expect(ruleBody(".connected-paused-label")).toContain(
      "color: var(--surface)",
    );
  });

  // Pane A's own versions of both its below (`.connected-clock-value`'s
  // greying, and "NOW reads `—` with NOT ROWING") retired with
  // `PaneTimer.tsx` (connected-revamp Task 2) — `paceCaption`'s only
  // renderer was that pane's `JudgedCard`, so "NOT ROWING" has no surviving
  // renderer anywhere and the caption half of that coverage genuinely
  // lapses (the field itself stays computed and model-tested,
  // `surfaceModel.test.ts`'s own paused describe). The dash DOES still
  // render, on pane B, so that gets pane B's own version below.
  //
  // THE METRIC ROW'S OWN INTERVAL-CLOCK CELL (and `.connected-clock-value-
  // held`, its own grey-but-holds class) DIED HERE (CR2 spec 3 Task 4):
  // `intervalClockLabel` off `SurfaceModel`, spec §3 fate table — the cell
  // it captioned is cut outright, so nothing on this pane holds a
  // frozen-but-visible value through a freeze any more. Its own test used
  // to live here.

  it("pane B's split hero reads `—`, because nobody is pulling", () => {
    renderSurface({ frozen: true });
    const hero = document.querySelector(
      ".connected-hero-split .connected-hero-value",
    )!;
    expect(hero.textContent).toBe("—");
  });

  // Task 5's own rate-suppression fix (`surfaceModel.ts`'s `liveRate`):
  // pane B's SECOND hero used to keep showing the erg's last pinned spm
  // through a freeze — the split hero's own dash treatment, promoted.
  it("pane B's rate hero reads `—` too, not the erg's last pinned spm", () => {
    renderSurface({ frozen: true, frame: frame({ spm: 68 }) });
    const hero = document.querySelector(
      ".connected-hero-rate .connected-hero-value",
    )!;
    expect(hero.textContent).toBe("—");
  });

  it("keeps the erg's own numbers live: frozen is not stale", () => {
    renderSurface({ frozen: true });
    expect(screen.queryByText("LOST THE MONITOR")).not.toBeInTheDocument();
    expect(document.querySelector(".connected-line-mark-hollow")).toBeNull();
    expect(document.querySelector(".timer-card-actual-stale")).toBeNull();
  });

  it("END still works while stopped, staged like everywhere else", async () => {
    const { session: s } = renderSurface({ frozen: true });
    await userEvent.click(screen.getByRole("button", { name: "END" }));
    expect(s.endSession).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "AGAIN" }));
    expect(s.endSession).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Mid-session: the link is gone
// ---------------------------------------------------------------------------

describe("disconnected: lose and degrade (spec C5)", () => {
  it("banners the fact, with no reconnect promise anywhere on the screen", () => {
    renderSurface({ phase: "disconnected" });
    expect(screen.getByText("LOST THE MONITOR")).toBeInTheDocument();
    const surface = document.querySelector(".connected-surface")!;
    const text = surface.textContent ?? "";
    expect(text).not.toContain("RECONNECTING");
    expect(text).not.toContain("TRYING");
    expect(text).not.toContain("CAUGHT UP");
  });

  it("hollows the indicator and reads LAST, not NOW", () => {
    renderSurface({ phase: "disconnected" });
    expect(
      document.querySelector(".connected-line-mark-hollow"),
    ).not.toBeNull();
    expect(screen.getByText(`${DEVICE} · LOST`)).toBeInTheDocument();
    // BOTH heroes, not one: the labels are bare NOW/LAST now that the unit
    // moved next to the numeral (testers via James, 2026-08-13), so a
    // `getByText` would throw on the second match rather than assert it.
    // Exactly two, and no NOW left anywhere on the pane.
    expect(screen.getAllByText("LAST")).toHaveLength(2);
    expect(screen.queryByText("NOW")).toBeNull();
  });

  it("THE STALE OVERRIDE BEATS EVERY JUDGEMENT, on every cell of the pane", () => {
    const target = WORK_PHASE.targetSplit!;
    // Numbers that would otherwise scream "faster" and "faster".
    const wild = frame({ currentSplit: target - 40, spm: 60 });

    renderSurface({ phase: "disconnected", frame: wild });
    const cells = judgedCells();
    // hero + rate only (CR2 spec 3 Task 4 cut HR/meters off this pane —
    // see the "EVERY judged cell on pane B" test above for the same count).
    expect(cells).toHaveLength(2);
    for (const cell of cells) expect(cell.judgement).toBe("stale");
  });

  // Cards are gone from pane B (connected-revamp Task 3: "the old three
  // metric cards are gone", revision §3) — `.connected-card-stale`'s own
  // "moves to the sunken fill" idiom had no consumer left once `JudgedCard`
  // retired, and this pane now has no `.timer-card` at all. The stale
  // treatment survives entirely through the tint class every judged cell
  // still wears (the previous it, "THE STALE OVERRIDE BEATS EVERY
  // JUDGEMENT" — `judgedCells()` finds both and confirms `"stale"`).
  it("carries no cards at all, stale or otherwise — the tint IS the stale treatment now", () => {
    renderSurface({ phase: "disconnected" });
    expect(document.querySelector(".timer-card")).toBeNull();
    expect(document.querySelectorAll(".timer-card-actual-stale").length).toBe(
      2,
    );
  });

  it("keeps End live: the run is still closeable and loggable", async () => {
    const { session: s } = renderSurface({ phase: "disconnected" });
    const end = screen.getByRole("button", { name: "End session" });
    await userEvent.click(end);
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to end" }),
    );
    expect(s.endSession).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// No HR monitor — RETIRED (CR2 spec 3 Task 4)
// ---------------------------------------------------------------------------

// This describe block used to test pane B's own HR cell (a plain metric-row
// numeral, revision §3's "no dashed card, no explanatory copy" idiom). HR
// has no slot on `PaneLive` at all any more (`SurfaceModel.hr` off the
// model, spec §3 fate table) — the redesign's own pane has nowhere for a
// belt reading to render. HR survives only as the grid's own column, with
// its own coverage in `PaneGrid.test.tsx`.

// ---------------------------------------------------------------------------
// End, staged
// ---------------------------------------------------------------------------

describe("End session, staged for 4s (handoff §3)", () => {
  it("the first tap arms and does NOT end the session", async () => {
    const { session: s } = renderSurface();
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(s.endSession).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Tap again to end" }),
    ).toBeInTheDocument();
  });

  it("the second tap ends it", async () => {
    const { session: s } = renderSurface();
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to end" }),
    );
    expect(s.endSession).toHaveBeenCalledTimes(1);
  });

  it("disarms itself after 4s, so a stray touch mid-piece cannot finish it", () => {
    vi.useFakeTimers();
    try {
      const { session: s } = renderSurface();
      fireEvent.click(screen.getByRole("button", { name: "End session" }));
      expect(
        screen.getByRole("button", { name: "Tap again to end" }),
      ).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(ARM_TIMEOUT_MS - 1);
      });
      expect(
        screen.getByRole("button", { name: "Tap again to end" }),
      ).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(
        screen.getByRole("button", { name: "End session" }),
      ).toBeInTheDocument();
      expect(s.endSession).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("blurring an UNARMED End is a no-op, not a crash", async () => {
    const { session: s } = renderSurface();
    fireEvent.blur(screen.getByRole("button", { name: "End session" }));
    expect(
      screen.getByRole("button", { name: "End session" }),
    ).toBeInTheDocument();
    expect(s.endSession).not.toHaveBeenCalled();
  });

  it("blurring an ARMED End disarms it (DESIGN.md: blur or 4s)", async () => {
    renderSurface();
    const end = screen.getByRole("button", { name: "End session" });
    await userEvent.click(end);
    fireEvent.blur(screen.getByRole("button", { name: "Tap again to end" }));
    expect(
      screen.getByRole("button", { name: "End session" }),
    ).toBeInTheDocument();
  });

  it("armed reads as ink, never accent: accent appears nowhere on the surface", async () => {
    renderSurface();
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    const armed = screen.getByRole("button", { name: "Tap again to end" });
    expect(armed.className).toContain("connected-end-armed");
    expect(armed.className).not.toContain("button-l4-armed");
  });
});

// ---------------------------------------------------------------------------
// End moves to the header — a SAFETY FIX, not a layout change (James,
// 2026-08-12, looking at the captures): the old full-width footer bar
// "could easily be touched accidentally if somebody tries to change views
// mid-row." The acceptance below is behavioural, not cosmetic — the
// control's hit box must not span the surface, must not sit in the swipe
// corridor, and a swipe crossing its row must still change pane.
// ---------------------------------------------------------------------------

describe("End's hit box is small and out of the swipe corridor (safety fix, James 2026-08-12)", () => {
  it("moved out of the footer entirely — the header holds it now, alone", () => {
    renderSurface();
    const header = document.querySelector<HTMLElement>(".connected-header")!;
    expect(
      within(header).getByRole("button", { name: "End session" }),
    ).toBeInTheDocument();
    // The footer no longer has ANY occupant while rowing — End left it.
    const footer = document.querySelector(".connected-surface-footer")!;
    expect(footer.children).toHaveLength(0);
  });

  it("wears the mockup's word, keeps the sentence as its accessible name", async () => {
    // Task-6 review, M3: the visible label is what the box is WIDE for, and
    // "End session" is why it measured 109px on the one control this task
    // exists to shrink. The mockup draws `END` (and revision §2's staging
    // says `TAP AGAIN`); the accessible name keeps the sentence, so every
    // selector that keys on "End session" survives and the paused block's
    // own visible `END` stays distinguishable from this one.
    const read = (): [string, string] => {
      const el = document.querySelector(".connected-end")!;
      return [el.textContent!, el.getAttribute("aria-label")!];
    };
    renderSurface();
    const unarmed = read();
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    const states: [string, string][] = [unarmed, read()];

    // WCAG 2.5.3, label in name: the visible word has to be findable inside
    // the spoken one, or voice control cannot reach the control. FIRST, and
    // over BOTH states (test-integrity sweep, P18): the old version put this
    // last, behind exact pins of both of its own operands, so it reduced to
    // `"tap again to end".includes("tap again")` and no mutation could
    // reach it — changing the armed `aria-label` to "Confirm", a genuine
    // label-in-name violation, failed two lines earlier. The unarmed pair
    // had no such check at all.
    expect(states).toHaveLength(2);
    for (const [text, label] of states) {
      expect([
        text,
        label.toLowerCase().includes(text.toLowerCase()),
      ]).toStrictEqual([text, true]);
    }

    // Then the strings themselves, exactly.
    expect(states).toStrictEqual([
      ["END", "End session"],
      ["TAP AGAIN", "Tap again to end"],
    ]);
  });

  it("index.css never stretches the control to the surface's width", () => {
    // The old full-width footer button was `button-l2` (`width: 100%`) —
    // this control carries neither that class nor an equivalent rule of
    // its own: no width/flex-grow declaration anywhere in its own block
    // means it can only ever be as wide as its own padded text, never the
    // surface.
    //
    // "ANYWHERE" is now true of the assertion as well as the comment
    // (test-integrity sweep, P17): the old `.exec` read only the FIRST
    // `.connected-end` block, so `.connected-end { width: 100%; flex-grow:
    // 1; }` appended to a 7,000-line stylesheet with per-orientation
    // overrides throughout passed this test. Every rule the file has for
    // the class is checked, at every nesting depth.
    const endRules = rulesFor(".connected-end");
    expect(endRules.map((rule) => rule.at)).toStrictEqual([[]]);
    for (const rule of endRules) {
      expect(rule.body).not.toMatch(/width\s*:/);
      expect(rule.body).not.toMatch(/flex-grow\s*:/);
    }
    const end = endRules[0]!.body;
    expect(end).toContain("flex: none");
    expect(end).toContain("min-height: 44px");
    expect(end).toContain("padding: 6px 10px");
    // The header itself doesn't stretch it either — it stays pinned to one
    // edge of a flex row, its own content-sized box. Its landscape copy
    // only re-places it in the grid, so the base rule is the one asked for.
    const headerRules = rulesFor(".connected-header");
    expect(headerRules.map((rule) => rule.at)).toStrictEqual([
      [],
      ["@media (orientation: landscape)"],
    ]);
    expect(headerRules[0]!.body).toContain("justify-content: flex-end");
    expect(headerRules[1]!.body).not.toMatch(/justify-content\s*:/);
  });

  // Swipe is back (Phase CS Item A, task-2 brief), but End's hit box still
  // does not share a gesture surface with pane navigation: `isSwipeBlocked`
  // (`workout/connected/swipe.ts`) refuses ANY `<button>` target, End
  // included, so a drag starting on End can never be misread as a pane
  // swipe — see "a drag starting on a rail button never swipes" below,
  // which is this invariant's own test now that there is a swipe to
  // collide with. The remaining safety-fix invariant this describe block
  // covers (small, out of the footer, never full-width) is above.
});

// ---------------------------------------------------------------------------
// The finger moves the panes again (Phase CS Item A, task-2 brief).
// `useSurfaceSwipe` (`workout/connected/swipe.ts`) attaches native pointer
// listeners to the ref this component hands it — every case below drives a
// real `PointerEvent` at the actual `<main class="connected-surface">` DOM
// node `ConnectedSurface` renders, never a spy over the hook.
// ---------------------------------------------------------------------------

describe("the finger moves the panes again (Phase CS Item A, task-2 brief)", () => {
  // jsdom HAS a `PointerEvent` constructor but does NOT implement
  // `setPointerCapture`/`releasePointerCapture`/`hasPointerCapture`
  // (verified) — stubbed so `swipe.ts`'s own optional-chained calls have
  // something to call instead of silently no-oping. This stub proves
  // NOTHING about capture retargeting: the device probe
  // (docs/monitor/sessions/probe-2026-08-17-swipe/README.md) is what showed
  // a real WKWebView flips `event.target` to the surface after the first
  // move, and no jsdom test — including every one below — can exercise
  // that; `e2e/screenshots.spec.ts`'s own pin is what re-checks it on a
  // real engine.
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  /** `new PointerEvent(...)` defaults `pointerType` to `""` and `isPrimary`
   *  to `false` in jsdom (verified) — both set explicitly on every fixture
   *  event below, or a handler branch keyed on either would be silently
   *  dead (or inverted) while this describe block still read green. */
  function surfacePointerEvent(
    type: "pointerdown" | "pointerup" | "pointercancel",
    x: number,
    opts: { pointerId?: number } = {},
  ): PointerEvent {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: opts.pointerId ?? 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: 300,
    });
  }

  const DRAG_START_X = 300;

  /** A complete pointerdown -> pointerup drag on `target`, `dx` pixels of
   *  horizontal travel from a fixed origin. No `pointermove` — `swipe.ts`'s
   *  own hook never listens for one; the delta is read once, at up. */
  function drag(
    target: Element,
    dx: number,
    opts: { pointerId?: number } = {},
  ): void {
    fireEvent(target, surfacePointerEvent("pointerdown", DRAG_START_X, opts));
    fireEvent(
      target,
      surfacePointerEvent("pointerup", DRAG_START_X + dx, opts),
    );
  }

  it("down on the hero, move -80px, up: GRID's content is on screen and the rail agrees", () => {
    renderSurface();
    const hero = document.querySelector(".connected-hero")!;
    drag(hero, -80);
    expect(
      screen.getByRole("group", { name: "Interval grid" }),
    ).toBeInTheDocument();
    expect(controlHalf("Grid")).toHaveAttribute("aria-current", "page");
  });

  it("down on a grid row cell, move +80px, up: the pane changes (the probe's own convicted case, end to end)", () => {
    localStorage.setItem(LAST_PANE_KEY, "grid");
    renderSurface();
    const cell = document.querySelector<HTMLElement>(
      ".connected-grid-rows .connected-grid-pace",
    )!;
    // The probe's whole finding lived here: a hand-built cell with no real
    // `role="group"` ancestor would pass this test against the OLD, broken
    // `[role]` predicate too (`swipe.test.ts`'s own comment) — this is the
    // real `PaneGrid`, so the ancestor is real.
    expect(cell.closest('[role="group"]')).not.toBeNull();
    drag(cell, 80);
    expect(controlHalf("Live")).toHaveAttribute("aria-current", "page");
    expect(document.querySelector(".connected-pane-grid")).toBeNull();
  });

  it("down on a rail button, move -80px, up: the drag never changes panes", () => {
    renderSurface();
    drag(controlHalf("Grid"), -80);
    // `isSwipeBlocked` refused this at pointerdown (the target is a
    // `<button>`) — still "live", not "grid".
    expect(controlHalf("Live")).toHaveAttribute("aria-current", "page");
  });

  it("with the log sheet open, a drag never changes panes underneath it", () => {
    renderSurface();
    // Three clicks on the same target: the door (handoff §5), and each one
    // also selects the pane (`handleControlPress`), so the sheet opens
    // already sitting on "grid".
    fireEvent.click(controlHalf("Grid"));
    fireEvent.click(controlHalf("Grid"));
    fireEvent.click(controlHalf("Grid"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const cell = document.querySelector<HTMLElement>(
      ".connected-grid-rows .connected-grid-pace",
    )!;
    drag(cell, 80); // would retreat grid -> live if not blocked
    expect(controlHalf("Grid")).toHaveAttribute("aria-current", "page");
  });

  it("pointercancel mid-drag discards it, and a later clean drag still works (no stuck state)", () => {
    renderSurface();
    const hero = document.querySelector(".connected-hero")!;
    fireEvent(hero, surfacePointerEvent("pointerdown", DRAG_START_X));
    fireEvent(hero, surfacePointerEvent("pointercancel", DRAG_START_X - 50));
    expect(controlHalf("Live")).toHaveAttribute("aria-current", "page");
    // A fresh gesture, same target: if `pointercancel` had left the tracked
    // state set, this `pointerdown` would be refused as "a gesture is
    // already tracking" and the pane would never move.
    drag(hero, -80);
    expect(controlHalf("Grid")).toHaveAttribute("aria-current", "page");
  });

  it("pointercancel leaves evidence with the travelled deltas — the phone leg's only instrument for the WebKit-only cancel", () => {
    // The spec's Design bullet 1 ("logged … so a field failure finally
    // leaves evidence"). The one risk the device probe could not close is a
    // WebKit directional-lock `pointercancel` that no Chromium run can
    // observe (W3C pointerevents#303), so the walk is the only instrument —
    // and a walker with nothing to read can only report a subjective "it
    // didn't take". Asserting the DELTAS, not merely that something was
    // logged: a readout that omits how far the finger travelled cannot
    // distinguish "WebKit cancelled a real swipe" from "a stray tap".
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    try {
      renderSurface();
      const hero = document.querySelector(".connected-hero")!;
      fireEvent(hero, surfacePointerEvent("pointerdown", DRAG_START_X));
      fireEvent(hero, surfacePointerEvent("pointercancel", DRAG_START_X - 137));
      expect(debug).toHaveBeenCalledWith(
        expect.stringContaining("[swipe] pointercancel dx=-137"),
      );
    } finally {
      debug.mockRestore();
    }
  });

  it("a completed drag under the threshold reaches pointerup but never calls onChange (coverage: the no-op half of the commit branch)", () => {
    renderSurface();
    const hero = document.querySelector(".connected-hero")!;
    drag(hero, -10); // tracked (not blocked), but paneAfterSwipe("live", -10, 0) === "live"
    expect(controlHalf("Live")).toHaveAttribute("aria-current", "page");
  });

  // The DOM-level case just above cannot prove `onChange` was actually
  // SKIPPED, not merely called with a value equal to the current pane:
  // `choosePane("live")` while already on "live" calls `setPane("live")`,
  // which React bails out of re-rendering for (`Object.is` equality) — so
  // "onChange fires unconditionally" and "onChange fires only on a real
  // change" are DOM-indistinguishable through `ConnectedSurface`. Proven by
  // mutation: deleting `if (next !== paneRef.current)` in `swipe.ts` left
  // the whole client suite green. This drives `useSurfaceSwipe` directly
  // with a spy, the only vantage point the guard is observable from.
  it("useSurfaceSwipe's own onChange spy: silent under threshold, fires exactly once, with the right value, once it commits", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const ref = { current: el };
    const onChange = vi.fn();
    renderHook(() =>
      useSurfaceSwipe(ref, { pane: "live", blocked: false, onChange }),
    );
    fireEvent(el, surfacePointerEvent("pointerdown", DRAG_START_X));
    fireEvent(el, surfacePointerEvent("pointerup", DRAG_START_X - 10));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent(el, surfacePointerEvent("pointerdown", DRAG_START_X));
    fireEvent(el, surfacePointerEvent("pointerup", DRAG_START_X - 80));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("grid");
    document.body.removeChild(el);
  });

  it("a second concurrent pointerdown does not start a second gesture", () => {
    renderSurface();
    const hero = document.querySelector(".connected-hero")!;
    fireEvent(
      hero,
      surfacePointerEvent("pointerdown", DRAG_START_X, { pointerId: 1 }),
    );
    fireEvent(
      hero,
      surfacePointerEvent("pointerdown", DRAG_START_X, { pointerId: 2 }),
    );
    // The second pointer's own up does not commit: the tracked gesture is
    // still pointer 1's, and pointer 2 never matched it.
    fireEvent(
      hero,
      surfacePointerEvent("pointerup", DRAG_START_X - 80, { pointerId: 2 }),
    );
    expect(controlHalf("Live")).toHaveAttribute("aria-current", "page");
    // The FIRST pointer's own up still completes the original gesture.
    fireEvent(
      hero,
      surfacePointerEvent("pointerup", DRAG_START_X - 80, { pointerId: 1 }),
    );
    expect(controlHalf("Grid")).toHaveAttribute("aria-current", "page");
  });

  it("a swipe never counts towards the triple-tap diagnostics gesture (the old handler's own property, carried over)", () => {
    renderSurface();
    drag(document.querySelector(".connected-hero")!, -80); // live -> grid
    drag(
      document.querySelector<HTMLElement>(
        ".connected-grid-rows .connected-grid-pace",
      )!,
      80,
    ); // grid -> live
    drag(document.querySelector(".connected-hero")!, -80); // live -> grid, third swipe
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The house rule this sweep makes structural (task-2 brief Step 5): within
// `src/workout/connected/**` and `ConnectedSurface.tsx` itself,
// `onClick`/`onPointerDown` land only on a real `<button>` or on an element
// carrying `data-swipe-ignore` — because `isSwipeBlocked`
// (`workout/connected/swipe.ts`) only refuses those two shapes, and a THIRD
// operable-but-unmarked element would silently start swipe gestures no
// finger should ever get to keep. Same `import.meta.glob` + `?raw` +
// comment-stripped idiom `SheetShell.test.tsx`'s own "EVERY caller ships an
// action" sweep uses, for the same reason: this needs no `@types/node`
// directory walk, and stripping comments first is what stops this file's
// own prose (which says "onClick" and "onPointerDown" several times over)
// from satisfying its own sweep.
// ---------------------------------------------------------------------------

describe("onClick/onPointerDown structural sweep (task-2 brief Step 5)", () => {
  it("every onClick/onPointerDown in src/workout/connected/** and ConnectedSurface.tsx is on <button> or [data-swipe-ignore]", () => {
    const connectedDirSources = import.meta.glob("./connected/*.tsx", {
      eager: true,
      query: "?raw",
      import: "default",
    }) as Record<string, string>;
    const files: [string, string][] = Object.entries(connectedDirSources)
      .filter(([file]) => !file.includes(".test."))
      .map(([file, text]) => [file, commentStrippedSource(text)]);
    files.push([
      "ConnectedSurface.tsx",
      commentStrippedSource(CONNECTED_SURFACE_SOURCE),
    ]);
    expect(files.length).toBeGreaterThanOrEqual(7); // 6 connected/*.tsx + this file, today

    const attrRegex = /\b(onClick|onPointerDown)=/g;
    const violations: string[] = [];
    for (const [file, source] of files) {
      for (const match of source.matchAll(attrRegex)) {
        const tagStart = source.lastIndexOf("<", match.index);
        const tagName = /^<([A-Za-z][\w.]*)/.exec(source.slice(tagStart))?.[1];
        const tagSlice = source.slice(tagStart, match.index);
        const ok =
          tagName === "button" || tagSlice.includes("data-swipe-ignore");
        if (!ok) {
          violations.push(`${file}: ${match[1]} on <${tagName ?? "?"}>`);
        }
      }
    }
    expect(violations).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ended
// ---------------------------------------------------------------------------

describe("ended: the surface hands off and unmounts", () => {
  it("calls onEnded exactly once, and shows no pane", () => {
    const onEnded = vi.fn();
    const { rerender, session: s } = renderSurface({ phase: "ended" }, onEnded);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("navigation", { name: "Connected panes" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("SESSION ENDED")).toBeInTheDocument();

    // A re-render on the same ended phase must not fire it a second time.
    // The callback identity is deliberately FRESH here, because that is what
    // production does: `WorkoutDetail`'s `handleConnectedEnded` is a new
    // function on every render of that screen, so the effect's dependency
    // list changes on every parent re-render and the once-guard is the only
    // thing standing between the rower and a double navigation.
    rerender(
      <ConnectedSurface
        phases={FIXTURE.phases}
        program={FIXTURE.program}
        session={s}
        onEnded={() => onEnded()}
      />,
    );
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("HOLDS the hand-off while the last split is still coming, then fires it once (walk day 2)", () => {
    // The device defect this exists for: `onEnded` navigates, navigating
    // unmounts the interstitial, and unmounting tears down the driver
    // subscription the final interval's split arrives on ~1 ms later. The
    // rower is told the session ended immediately either way — only the
    // HAND-OFF waits.
    const onEnded = vi.fn();
    const { rerender, session: held } = renderSurface(
      { phase: "ended", endedBy: "machine", handoffHeld: true },
      onEnded,
    );

    expect(onEnded).not.toHaveBeenCalled();
    // The ending is on screen regardless — the wait is invisible to the
    // rower, who is reading this frame while it happens.
    expect(screen.getByText("SESSION ENDED")).toBeInTheDocument();
    expect(
      screen.getByText("The monitor finished it. Your numbers are kept."),
    ).toBeInTheDocument();

    // The split lands (or the hold's backstop expires) — the hook clears the
    // flag, and the hand-off goes through, once.
    rerender(
      <ConnectedSurface
        phases={FIXTURE.phases}
        program={FIXTURE.program}
        session={{ ...held, handoffHeld: false }}
        onEnded={() => onEnded()}
      />,
    );
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("says who ended it, without making the rower care", () => {
    const machine = renderSurface({ phase: "ended", endedBy: "machine" });
    expect(
      screen.getByText("The monitor finished it. Your numbers are kept."),
    ).toBeInTheDocument();
    machine.unmount();

    renderSurface({ phase: "ended", endedBy: "user" });
    expect(screen.getByText("Your numbers are kept.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The fake-driven walk: real hook, real driver, real (simulated) PM5
// ---------------------------------------------------------------------------

describe("the connected walk, fake-driven", () => {
  it("rows a real library workout and draws the machine's own numbers", async () => {
    const fake = createFakeTransport({
      program: FIXTURE.program,
      deviceName: DEVICE,
      events: [
        {
          atMs: 100,
          kind: "status",
          // THE CONSTANT, not its ordinal (task-7 review, L4). This was a
          // literal `3` under a comment naming INTERVALWORKTIME — and three
          // is INTERVALREST. The old assertions survived the lie because
          // interval 1's phase is the warm-up with no rest phase after it,
          // so `phaseIndexForInterval`'s two branches resolved to the same
          // place. Naming the constant makes the slip impossible to retype,
          // and the status-word assertion below makes it impossible to
          // reintroduce silently.
          workoutState: WORKOUTSTATE_INTERVALWORKTIME,
          elapsedSeconds: 20,
          distanceMeters: 70,
          spm: 21,
          currentSplit: 117.8,
          heartRateBpm: 164,
          programIntervalIndex: 0,
        },
      ],
    });

    render(
      <ConnectedInterstitial
        program={FIXTURE.program}
        phases={FIXTURE.phases}
        identity={FIXTURE.identity}
        baselines={baselines}
        nudgedCount={0}
        onExit={vi.fn()}
        onRowInstead={vi.fn()}
        onEnded={vi.fn()}
        deps={{
          createTransport: () => fake,
          now: () => t0,
          driverOptions: { settleTicks: 0, prepareSettleTicks: 0 },
        }}
      />,
    );

    // Pump the fake's ack-gated programming exchange — chunk-by-chunk
    // microtask hops, never timed, the same `tick(0)` pattern
    // `useMonitorSession.test.ts`'s own harness uses — until the machine
    // arms.
    for (let i = 0; i < 40; i += 1) {
      await act(async () => {
        fake.tick(0);
        await Promise.resolve();
      });
      if (screen.queryByText("Ready when you pull")) break;
    }
    await screen.findByText("Ready when you pull");

    // Press past the ready screen (no dwell exists anymore — it holds
    // until the rower acts), then let the machine's own first status
    // tick land.
    await userEvent.click(
      screen.getByRole("button", { name: "Show me the numbers" }),
    );
    await act(async () => {
      fake.tick(200);
      await Promise.resolve();
    });

    expect(
      screen.getByRole("navigation", { name: "Connected panes" }),
    ).toBeInTheDocument();
    // The device's REAL advertised name, off the fake's own scan result.
    expect(screen.getByText(DEVICE)).toBeInTheDocument();
    // A number that came off the (simulated) wire, through the real codec.
    expect(document.querySelector(".connected-hero-value")!.textContent).toBe(
      "1:57.8",
    );
    // And the interval the driver normalized to is Filling Low's 8:00
    // warm-up (the program's interval 0), so the caption is that word alone:
    // design spec §5b takes the warm-up out of the rower's count rather than
    // making them read `1 OF 5` on a workout they know as four pieces.
    expect(screen.getByText("WARM-UP")).toBeInTheDocument();
    expect(screen.queryByText(/ OF /)).toBeNull();

    // THE PIN FOR THE ORDINAL ABOVE used to live here (task-7 review, L4):
    // pane A's status word was the one thing on this surface that read the
    // machine's `state` directly, so clicking into it and asserting ROWING
    // (not RESTING) proved `WORKOUTSTATE_INTERVALWORKTIME` — not
    // `WORKOUTSTATE_INTERVALREST` — actually reached `frame.state` for THIS
    // scripted event. `statusWord` retired with pane A (`PaneTimer.tsx`,
    // connected-revamp Task 2), and nothing that survives reads `state`
    // unconditionally the way it did: `resting`'s only other consumer,
    // `phaseIndexForInterval`, is insensitive to this exact script (interval
    // 0's warm-up has no adjacent rest phase for the boundary logic to pick
    // between — confirmed against `server/seed/library/at.ts`'s "Filling
    // Low" fixture), so no surviving DOM text distinguishes the two
    // ordinals for this event. The wire-level decode itself stays
    // thoroughly pinned at the driver layer (`monitor/driver.test.ts`'s own
    // extensive `WORKOUTSTATE_INTERVALWORKTIME`/`_INTERVALREST` coverage);
    // only THIS integration test's UI-level double-check is gone.
  });
});
