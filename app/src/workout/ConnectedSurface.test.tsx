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
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
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
import { ARM_TIMEOUT_MS } from "../session/useStagedDiscard";
import { commentStrippedSource } from "../test/cssView";
import { PANES } from "./connected/PagerRail";
import ConnectedInterstitial from "./ConnectedInterstitial";
import ConnectedSurface, {
  DEFAULT_PANE,
  LAST_PANE_KEY,
  SWIPE_THRESHOLD_PX,
  loadLastPane,
  paneAfterSwipe,
} from "./ConnectedSurface";

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

/** The first work phase's own resolved split — every "under"/"over"
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

/** The rail is the fallback; these are its two targets by accessible name
 *  (the visible long/short label pair is `aria-hidden` — both ship in
 *  every orientation, so neither can be the name). */
function railButton(pane: "Live" | "Grid") {
  return screen.getByRole("button", { name: `${pane} pane` });
}

function swipe(deltaX: number): void {
  const surface = document.querySelector(".connected-surface")!;
  fireEvent.touchStart(surface, { touches: [{ clientX: 200 }] });
  fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 200 + deltaX }] });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The shell: landing, persistence, swipe, the labelled rail
// ---------------------------------------------------------------------------

describe("landing and persistence (handoff §3: per ROWER, first-ever lands B)", () => {
  it("lands on pane B the first time this rower ever connects", () => {
    renderSurface();
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");
    expect(DEFAULT_PANE).toBe("live");
  });

  it("lands on whichever pane the rower last used, not on the workout's", async () => {
    const first = renderSurface();
    await userEvent.click(railButton("Grid"));
    expect(localStorage.getItem(LAST_PANE_KEY)).toBe("grid");
    first.unmount();

    renderSurface();
    expect(railButton("Grid")).toHaveAttribute("aria-current", "page");
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
    expect(PANES).toHaveLength(2);
    expect(PANES).not.toContain("timer");
    expect(PANES).toStrictEqual(["live", "grid"]);
  });

  it("a stored 'timer' — a real rower's pre-Task-2 value, not synthetic garbage — lands on live", () => {
    localStorage.setItem(LAST_PANE_KEY, "timer");
    expect(loadLastPane()).toBe(DEFAULT_PANE);
    // And the real surface renders it, not just the loader function.
    renderSurface();
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");
  });

  it("survives storage throwing outright", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadLastPane()).toBe(DEFAULT_PANE);
  });
});

describe("swipe is the real navigation, 60px (handoff §3)", () => {
  // The constant itself, not just behaviour relative to it: every other
  // test in this block reads `SWIPE_THRESHOLD_PX`, so a changed threshold
  // would move them all in lockstep and none of them would notice.
  it("is 60px, the handoff's own number", () => {
    expect(SWIPE_THRESHOLD_PX).toBe(60);
  });

  it("moves the pane at a literal 60px drag and not at 59", () => {
    renderSurface();
    swipe(59);
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");
    swipe(-60);
    expect(railButton("Grid")).toHaveAttribute("aria-current", "page");
  });

  it("does nothing below the threshold", () => {
    expect(paneAfterSwipe("live", -(SWIPE_THRESHOLD_PX - 1))).toBe("live");
    expect(paneAfterSwipe("live", SWIPE_THRESHOLD_PX - 1)).toBe("live");
  });

  it("moves at exactly the threshold", () => {
    expect(paneAfterSwipe("live", -SWIPE_THRESHOLD_PX)).toBe("grid");
    expect(paneAfterSwipe("grid", SWIPE_THRESHOLD_PX)).toBe("live");
  });

  it("clamps at both ends rather than wrapping", () => {
    expect(paneAfterSwipe("live", SWIPE_THRESHOLD_PX * 2)).toBe("live");
    expect(paneAfterSwipe("grid", -SWIPE_THRESHOLD_PX * 2)).toBe("grid");
  });

  it("drives the real surface, and persists what it lands on", () => {
    renderSurface();
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");

    swipe(-(SWIPE_THRESHOLD_PX + 10));
    expect(railButton("Grid")).toHaveAttribute("aria-current", "page");
    expect(localStorage.getItem(LAST_PANE_KEY)).toBe("grid");

    swipe(SWIPE_THRESHOLD_PX + 10);
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");
    expect(localStorage.getItem(LAST_PANE_KEY)).toBe("live");
  });

  it("ignores a touch end with no touch start behind it", () => {
    renderSurface();
    const surface = document.querySelector(".connected-surface")!;
    // A gesture that began somewhere else entirely (a scroll handed off, a
    // synthetic event): there is no origin to measure against.
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 500 }] });
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");
  });

  it("ignores a touch start that carries no touch, and its end", () => {
    renderSurface();
    const surface = document.querySelector(".connected-surface")!;
    fireEvent.touchStart(surface, { touches: [] });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 500 }] });
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");

    fireEvent.touchStart(surface, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(surface, { changedTouches: [] });
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");
  });

  it("a short drag leaves the pane alone", () => {
    renderSurface();
    swipe(SWIPE_THRESHOLD_PX - 1);
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");
  });
});

describe("the pager is LABELLED (handoff §3, DEVIATIONS row 4)", () => {
  it("carries both label sets in both orientations, never bare dots", () => {
    // LIVE and GRID's own long and short forms are IDENTICAL text (unlike
    // the retired TIMER/TMR pair), so a `textContent` check can no longer
    // prove both label spans exist — this checks the DOM shape instead:
    // every target renders both classes, whichever the orientation query
    // then shows or hides.
    renderSurface();
    const pager = screen.getByRole("navigation", { name: "Connected panes" });
    const buttons = within(pager).getAllByRole("button");
    // Two targets, and every one of them names what is behind it.
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(
        button.querySelector(".connected-pager-label-long"),
      ).not.toBeNull();
      expect(
        button.querySelector(".connected-pager-label-short"),
      ).not.toBeNull();
    }
  });

  it("reaches pane C, the grid (Task 7 filled the slot)", async () => {
    renderSurface();
    await userEvent.click(railButton("Grid"));
    expect(railButton("Grid")).toHaveAttribute("aria-current", "page");
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

describe("pane B — live (connected-revamp Task 3: two heroes)", () => {
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

  it("shows METERS LEFT on a distance interval and time left on a time one, in the metric row", () => {
    const distance = renderSurface();
    const row = document.querySelector(".connected-metric-row")!;
    expect(
      within(row as HTMLElement).getByText("METERS LEFT"),
    ).toBeInTheDocument();
    distance.unmount();

    renderSurface({
      frame: frame({
        intervalIndex: 0,
        intervalRemaining: { kind: "time", value: 41 },
      }),
    });
    expect(screen.getByText("LEFT IN INTERVAL")).toBeInTheDocument();
    expect(screen.getByText("0:41")).toBeInTheDocument();
  });

  // Cards are gone (revision §3: "the old three metric cards are gone").
  // RATE is a second hero, at the same scale as the split; METERS and HR
  // sit alongside the interval countdown in the metric row.
  it("promotes RATE to a second hero, and carries METERS/HR in the metric row — no cards anywhere", () => {
    renderSurface();
    const rateHero = document.querySelector(".connected-hero-rate")!;
    expect(
      within(rateHero as HTMLElement).getByText("NOW · SPM"),
    ).toBeInTheDocument();
    expect(rateHero.querySelector(".connected-hero-value")).not.toBeNull();
    expect(
      rateHero.querySelector(".connected-hero-target-value"),
    ).not.toBeNull();

    const row = document.querySelector(".connected-metric-row")!;
    expect(within(row as HTMLElement).getByText("METERS")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("HR")).toBeInTheDocument();

    expect(document.querySelector(".timer-card")).toBeNull();
    expect(document.querySelector(".connected-cards-triple")).toBeNull();
  });

  it("puts both targets under their hero in INK, never accent (the supersession)", () => {
    renderSurface();
    const targets = document.querySelectorAll(".connected-hero-target-value");
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(target.className).not.toContain("accent");
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

  // THE NO-TARGET STATE (design spec §6, adversarial finding): every REST
  // phase hits this. The target slot holds its space and reads the dash in
  // `--ink-3` (`connected-value-absent`); the actual above stays UNJUDGED
  // (plain ink — no `-over`/`-under`/`-stale` class), because a value with
  // nothing to compare against must not be tinted.
  it("during REST both targets read the dash, and both actuals above stay unjudged", () => {
    renderSurface({
      frame: frame({
        intervalIndex: 1,
        state: "resting",
        // Numbers that would scream "over"/"under" against any real
        // target, to prove the dash-target is what suppresses the tint.
        currentSplit: 60,
        spm: 40,
      }),
    });
    const targets = document.querySelectorAll<HTMLElement>(
      ".connected-hero-target-value",
    );
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(target.textContent).toBe("—");
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

  it("the metric row's three values sit on one baseline: left-in-interval, meters, HR", () => {
    renderSurface();
    const row = document.querySelector(".connected-metric-row")!;
    const cells = row.querySelectorAll(".connected-metric-cell");
    expect(cells).toHaveLength(3);
    const labels = Array.from(cells).map(
      (cell) => cell.querySelector(".connected-metric-label")!.textContent,
    );
    expect(labels).toStrictEqual(["METERS LEFT", "METERS", "HR"]);
    for (const cell of cells) {
      expect(cell.querySelector(".connected-metric-value")).not.toBeNull();
    }
  });

  it("index.css: both heroes are --size-hero over --size-target, tenths at --size-hero-tenths, nowrap", () => {
    const css = readFileSync(indexCssPath(), "utf-8");
    const heroValue = /\.connected-hero-value\s*\{([^}]*)\}/.exec(css);
    const heroTenths = /\.connected-hero-tenths\s*\{([^}]*)\}/.exec(css);
    const targetValue = /\.connected-hero-target-value\s*\{([^}]*)\}/.exec(css);
    const metricValue = /\.connected-metric-value\s*\{([^}]*)\}/.exec(css);
    expect(heroValue).not.toBeNull();
    expect(heroValue![1]).toContain("var(--size-hero)");
    expect(heroValue![1]).toContain("white-space: nowrap");
    expect(heroTenths).not.toBeNull();
    expect(heroTenths![1]).toContain("var(--size-hero-tenths)");
    expect(targetValue).not.toBeNull();
    expect(targetValue![1]).toContain("var(--size-target)");
    expect(metricValue).not.toBeNull();
    expect(metricValue![1]).toContain("var(--size-metric)");
  });
});

// ---------------------------------------------------------------------------
// The judgement, through ONE code path
// ---------------------------------------------------------------------------

describe("judgement: one helper, every pane (handoff §3)", () => {
  const target = WORK_PHASE.targetSplit!;

  // Direction is the EFFORT's, not the number's: a smaller split is a
  // faster boat, so it is `over` (ochre). `domain/judge.ts` owns that rule.
  it("tints pane B's hero ochre when faster and teal when slower", () => {
    const fast = renderSurface({
      frame: frame({ currentSplit: target - 10 }),
    });
    const heroClass = document.querySelector(
      ".connected-hero-value",
    )!.className;
    expect(heroClass).toContain("timer-card-actual-over");
    fast.unmount();

    renderSurface({ frame: frame({ currentSplit: target + 10 }) });
    expect(
      document.querySelector(".connected-hero-value")!.className,
    ).toContain("timer-card-actual-under");
  });

  it("judges within tolerance as plain ink, no tint class beyond -within", () => {
    renderSurface({ frame: frame({ currentSplit: target }) });
    const hero = document.querySelector(".connected-hero-value")!;
    expect(hero.className).toContain("timer-card-actual-within");
    expect(hero.className).not.toContain("timer-card-actual-over");
    expect(hero.className).not.toContain("timer-card-actual-under");
  });

  it("EVERY judged cell on pane B goes through the helper — none opts out", () => {
    renderSurface({ frame: frame({ currentSplit: target + 10, spm: 99 }) });
    const cells = judgedCells();
    // hero + rate + HR + meters
    expect(cells).toHaveLength(4);
    for (const cell of cells) {
      expect(["under", "within", "over", "stale"]).toContain(cell.judgement);
    }
    expect(cells.some((c) => c.judgement === "over")).toBe(true);
  });

  it("index.css paints the two verdicts with the handoff's own tokens", () => {
    const css = readFileSync(indexCssPath(), "utf-8");
    const under = /\.timer-card-actual-under\s*\{([^}]*)\}/.exec(css);
    const over = /\.timer-card-actual-over\s*\{([^}]*)\}/.exec(css);
    expect(under).not.toBeNull();
    expect(over).not.toBeNull();
    expect(under![1]).toContain("var(--type-o2)");
    expect(over![1]).toContain("var(--type-at)");
    // Accent is never a judgement colour: it is the target's, everywhere
    // else in the app, and on these panes the target is ink.
    expect(under![1]).not.toContain("--accent");
    expect(over![1]).not.toContain("--accent");
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
// Mid-session: paused
// ---------------------------------------------------------------------------

describe("paused (handoff §4)", () => {
  // Connected-revamp Task 6: End moved out of the footer into the header
  // (revision §2), where it now renders UNCONDITIONALLY — paused or not.
  // The paused block gets its OWN END/AGAIN affordance in the footer slot
  // End vacated; the two are not mutually exclusive any more, they are two
  // independent controls sharing the same armed state.
  it("End's header control survives paused, and the paused block adds its own END/AGAIN", () => {
    // `statusWord`'s own "says PAUSED" half of this test retired with pane
    // A (`PaneTimer.tsx`, connected-revamp Task 2): it was the field's only
    // renderer, and no surviving pane shows a status word at all.
    renderSurface({ phase: "paused" });
    expect(screen.getByText("PAUSED · PULL TO RESUME")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End session" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "END" })).toBeInTheDocument();
  });

  it("NOTHING ABOVE SHIFTS: the footer slot is reserved whether or not the paused block fills it", () => {
    // The header (End's new home) is a THIRD invariant alongside the
    // footer: it renders the same single child regardless of state, so its
    // own fixed height can never be what moves the pane body underneath
    // it.
    const live = renderSurface();
    const liveHeader = document.querySelector(".connected-header")!;
    expect(liveHeader.children).toHaveLength(1);
    const liveFooter = document.querySelector(".connected-surface-footer")!;
    // Reserved, but empty while rowing — End no longer lives here.
    expect(liveFooter.children).toHaveLength(0);
    live.unmount();

    renderSurface({ phase: "paused" });
    const pausedHeader = document.querySelector(".connected-header")!;
    expect(pausedHeader.children).toHaveLength(1);
    const pausedFooter = document.querySelector(".connected-surface-footer")!;
    // One child now — the paused block alone in the slot End vacated.
    expect(pausedFooter.children).toHaveLength(1);
    // The footer sits in the SAME place in the tree either way — directly
    // after the pane body, directly before the pager — so its own
    // reserved 52px (pinned by the CSS test below) is the only thing that
    // differs between the two states, never its position.
    expect(pausedFooter.previousElementSibling!.className).toContain(
      "connected-surface-body",
    );
    expect(pausedFooter.nextElementSibling!.className).toContain(
      "connected-pager",
    );
  });

  it("index.css pins the footer slot and the paused block at 52px", () => {
    const css = readFileSync(indexCssPath(), "utf-8");
    const footer = /\.connected-surface-footer\s*\{([^}]*)\}/.exec(css);
    const paused = /\.connected-paused\s*\{([^}]*)\}/.exec(css);
    expect(footer).not.toBeNull();
    expect(footer![1]).toContain("height: 52px");
    expect(paused![1]).toContain("height: 52px");
  });

  it("index.css inverts the paused band: ink field, paper label (2026-08-08, the operator missed the grey one)", () => {
    const css = readFileSync(indexCssPath(), "utf-8");
    const paused = /\.connected-paused\s*\{([^}]*)\}/.exec(css);
    const label = /\.connected-paused-label\s*\{([^}]*)\}/.exec(css);
    expect(paused![1]).toContain("background: var(--ink)");
    expect(label![1]).toContain("color: var(--surface)");
  });

  // Pane A's own versions of both its below (`.connected-clock-value`'s
  // greying, and "NOW reads `—` with NOT ROWING") retired with
  // `PaneTimer.tsx` (connected-revamp Task 2) — `paceCaption`'s only
  // renderer was that pane's `JudgedCard`, so "NOT ROWING" has no surviving
  // renderer anywhere and the caption half of that coverage genuinely
  // lapses (the field itself stays computed and model-tested,
  // `surfaceModel.test.ts`'s own paused describe). The dash and the
  // held-clock grey DO still render, on pane B, so those two get pane B's
  // own version here rather than being dropped along with pane A.
  // Connected-revamp Task 3 moved the interval clock's own cell from a
  // semi-hero (`.connected-second-value`) into the metric row
  // (`.connected-metric-value`) — the grey-but-holds behaviour, and the
  // reused `connected-clock-value-held` class, are unchanged.
  it("the metric row's interval-clock cell greys but holds its last value", () => {
    renderSurface({
      phase: "paused",
      frame: frame({ intervalRemaining: { kind: "time", value: 41 } }),
    });
    const clock = document.querySelector(".connected-metric-value")!;
    expect(clock.textContent).toBe("0:41");
    expect(clock.className).toContain("connected-clock-value-held");
  });

  it("pane B's split hero reads `—`, because nobody is pulling", () => {
    renderSurface({ phase: "paused" });
    const hero = document.querySelector(
      ".connected-hero-split .connected-hero-value",
    )!;
    expect(hero.textContent).toBe("—");
  });

  it("keeps the erg's own numbers live: paused is not stale", () => {
    renderSurface({ phase: "paused" });
    expect(screen.queryByText("LOST THE MONITOR")).not.toBeInTheDocument();
    expect(document.querySelector(".connected-line-mark-hollow")).toBeNull();
    expect(document.querySelector(".timer-card-actual-stale")).toBeNull();
  });

  it("END still works while stopped, staged like everywhere else", async () => {
    const { session: s } = renderSurface({ phase: "paused" });
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
    expect(screen.getByText("LAST · /500M")).toBeInTheDocument();
  });

  it("THE STALE OVERRIDE BEATS EVERY JUDGEMENT, on every cell of the pane", () => {
    const target = WORK_PHASE.targetSplit!;
    // Numbers that would otherwise scream "over" and "over".
    const wild = frame({ currentSplit: target - 40, spm: 60 });

    renderSurface({ phase: "disconnected", frame: wild });
    const cells = judgedCells();
    expect(cells).toHaveLength(4);
    for (const cell of cells) expect(cell.judgement).toBe("stale");
  });

  // Cards are gone from pane B (connected-revamp Task 3: "the old three
  // metric cards are gone", revision §3) — `.connected-card-stale`'s own
  // "moves to the sunken fill" idiom had no consumer left once `JudgedCard`
  // retired, and this pane now has no `.timer-card` at all. The stale
  // treatment survives entirely through the tint class every judged cell
  // still wears (the previous it, "THE STALE OVERRIDE BEATS EVERY
  // JUDGEMENT" — `judgedCells()` finds all 4 and confirms `"stale"`).
  it("carries no cards at all, stale or otherwise — the tint IS the stale treatment now", () => {
    renderSurface({ phase: "disconnected" });
    expect(document.querySelector(".timer-card")).toBeNull();
    expect(document.querySelectorAll(".timer-card-actual-stale").length).toBe(
      4,
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
// No HR monitor
// ---------------------------------------------------------------------------

// Connected-revamp Task 3 rewrites this idiom entirely for pane B (revision
// §3: "Missing HR renders `—` in place. No dashed card, no explanatory
// copy."). The dashed-border/"NO HR MONITOR" caption idiom was
// `JudgedCard`'s alone and had no other consumer; HR is now a plain metric-
// row cell like METERS, distinguished from a real reading only by the
// shared `connected-value-absent` grey every dash on this pane wears.
describe("no HR monitor: no dashed card, no explanatory copy (revision §3)", () => {
  it("reads `—`, greyed, with no card and no caption", () => {
    renderSurface({ frame: frame({ heartRateBpm: null }) });
    const cell = screen.getByText("HR").parentElement!;
    expect(cell.className).toBe("connected-metric-cell");
    const value = cell.querySelector(".connected-metric-value")!;
    expect(value.textContent).toBe("—");
    expect(value.className).toContain("connected-value-absent");
    expect(document.querySelector(".timer-card")).toBeNull();
    expect(screen.queryByText("NO HR MONITOR")).not.toBeInTheDocument();
  });

  it("becomes a number with no announcement when a belt appears", () => {
    renderSurface({ frame: frame({ heartRateBpm: 151 }) });
    const cell = screen.getByText("HR").parentElement!;
    const value = cell.querySelector(".connected-metric-value")!;
    expect(value.textContent).toBe("151");
    expect(value.className).not.toContain("connected-value-absent");
    expect(screen.queryByText("NO HR MONITOR")).not.toBeInTheDocument();
  });
});

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

  it("index.css never stretches the control to the surface's width", () => {
    const css = readFileSync(indexCssPath(), "utf-8");
    const end = /\.connected-end\s*\{([^}]*)\}/.exec(css);
    expect(end).not.toBeNull();
    // The old full-width footer button was `button-l2` (`width: 100%`) —
    // this control carries neither that class nor an equivalent rule of
    // its own: no width/flex-grow declaration anywhere in its own block
    // means it can only ever be as wide as its own padded text, never the
    // surface.
    expect(end![1]).not.toMatch(/width\s*:/);
    expect(end![1]).not.toMatch(/flex-grow\s*:/);
    expect(end![1]).toContain("flex: none");
    expect(end![1]).toContain("min-height: 44px");
    expect(end![1]).toContain("padding: 6px 10px");
    // The header itself doesn't stretch it either — it stays pinned to one
    // edge of a flex row, its own content-sized box.
    const header = /\.connected-header\s*\{([^}]*)\}/.exec(css);
    expect(header).not.toBeNull();
    expect(header![1]).toContain("justify-content: flex-end");
  });

  // THE MECHANISM (mutation-tested below in the report, not just asserted
  // here): `handleTouchStart`/`handleTouchEnd` live on `<main>`, the
  // surface's OWN element — a touch that starts on a descendant (End) still
  // bubbles to them exactly as one starting anywhere else on the surface
  // does, because nothing on End's own button stops that propagation. A
  // full 60px+ swipe whose pointerdown happens to land on End must
  // therefore still read as pane navigation, never as an arm.
  it("a swipe that starts ON End still changes pane — it never arms the confirm", () => {
    renderSurface();
    const endButton = screen.getByRole("button", { name: "End session" });
    fireEvent.touchStart(endButton, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(document.querySelector(".connected-surface")!, {
      changedTouches: [{ clientX: 200 - (SWIPE_THRESHOLD_PX + 10) }],
    });
    expect(railButton("Grid")).toHaveAttribute("aria-current", "page");
    // Still "End session", never staged — the swipe did not touch it.
    expect(
      screen.getByRole("button", { name: "End session" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tap again to end" }),
    ).not.toBeInTheDocument();
  });

  it("the SAME swipe, originating on End, works in the other direction too", () => {
    renderSurface();
    const endButton = screen.getByRole("button", { name: "End session" });
    fireEvent.touchStart(endButton, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(document.querySelector(".connected-surface")!, {
      changedTouches: [{ clientX: 200 + (SWIPE_THRESHOLD_PX + 10) }],
    });
    // Already on "live" (the default pane) — a rightward swipe clamps
    // there rather than wrapping (`paneAfterSwipe`'s own contract), so the
    // proof here is that it did NOT arm End, not that it changed pane.
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("button", { name: "Tap again to end" }),
    ).not.toBeInTheDocument();
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
