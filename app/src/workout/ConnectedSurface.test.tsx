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
// warm-up, then 3 × 2000 m with 3:00 rest), never a hand-built minimum.

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
import { ARM_TIMEOUT_MS } from "../session/useStagedDiscard";
import { commentStrippedSource } from "../test/cssView";
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
  const phases = buildRun(draft, baselines, t0).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return {
    program,
    phases,
    identity: { workoutId: "filling-low", title: w.title },
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

/** The rail is the fallback; these are its three targets by accessible
 *  name (the visible `TIMER`/`TMR` pair is `aria-hidden` — both ship in
 *  every orientation, so neither can be the name). */
function railButton(pane: "Timer" | "Live" | "Grid") {
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
    await userEvent.click(railButton("Timer"));
    expect(localStorage.getItem(LAST_PANE_KEY)).toBe("timer");
    first.unmount();

    renderSurface();
    expect(railButton("Timer")).toHaveAttribute("aria-current", "page");
  });

  it("ignores a garbage stored value rather than rendering nothing", () => {
    localStorage.setItem(LAST_PANE_KEY, "not-a-pane");
    expect(loadLastPane()).toBe(DEFAULT_PANE);
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
    swipe(60);
    expect(railButton("Timer")).toHaveAttribute("aria-current", "page");
  });

  it("does nothing below the threshold", () => {
    expect(paneAfterSwipe("live", -(SWIPE_THRESHOLD_PX - 1))).toBe("live");
    expect(paneAfterSwipe("live", SWIPE_THRESHOLD_PX - 1)).toBe("live");
  });

  it("moves at exactly the threshold", () => {
    expect(paneAfterSwipe("live", -SWIPE_THRESHOLD_PX)).toBe("grid");
    expect(paneAfterSwipe("live", SWIPE_THRESHOLD_PX)).toBe("timer");
  });

  it("clamps at both ends rather than wrapping", () => {
    expect(paneAfterSwipe("timer", SWIPE_THRESHOLD_PX * 2)).toBe("timer");
    expect(paneAfterSwipe("grid", -SWIPE_THRESHOLD_PX * 2)).toBe("grid");
  });

  it("drives the real surface, and persists what it lands on", () => {
    renderSurface();
    expect(railButton("Live")).toHaveAttribute("aria-current", "page");

    swipe(SWIPE_THRESHOLD_PX + 10);
    expect(railButton("Timer")).toHaveAttribute("aria-current", "page");
    expect(localStorage.getItem(LAST_PANE_KEY)).toBe("timer");

    swipe(-(SWIPE_THRESHOLD_PX + 10));
    swipe(-(SWIPE_THRESHOLD_PX + 10));
    expect(railButton("Grid")).toHaveAttribute("aria-current", "page");
    expect(localStorage.getItem(LAST_PANE_KEY)).toBe("grid");
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
    renderSurface();
    const pager = screen.getByRole("navigation", { name: "Connected panes" });
    const text = pager.textContent ?? "";
    for (const label of ["TIMER", "LIVE", "GRID", "TMR"]) {
      expect(text).toContain(label);
    }
    // Three targets, and every one of them names what is behind it.
    expect(within(pager).getAllByRole("button")).toHaveLength(3);
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

describe("pane A — the connected timer", () => {
  beforeEach(() => {
    localStorage.setItem(LAST_PANE_KEY, "timer");
  });

  it("names the monitor, the interval and the state, all in ink", () => {
    renderSurface();
    expect(screen.getByText(DEVICE)).toBeInTheDocument();
    expect(screen.getByText("INTERVAL 2 OF 4 · WORK")).toBeInTheDocument();
    expect(screen.getByText("ROWING")).toBeInTheDocument();
    expect(document.querySelector(".connected-line-mark-hollow")).toBeNull();
  });

  it("puts the actual beside the target, four cards, targets never tinted", () => {
    renderSurface();
    expect(screen.getByText("NOW · /500M")).toBeInTheDocument();
    expect(screen.getByText("TARGET SPLIT")).toBeInTheDocument();
    expect(screen.getByText("RATE")).toBeInTheDocument();
    expect(screen.getByText("METERS")).toBeInTheDocument();
    // The TARGET SPLIT card's value carries no judgement class at all: a
    // programmed value is never judged, only what actually happened.
    const targetCard = screen.getByText("TARGET SPLIT").parentElement!;
    expect(
      targetCard.querySelector('[class*="timer-card-actual-"]'),
    ).toBeNull();
    expect(targetCard.querySelector(".timer-card-value-accent")).toBeNull();
  });

  it("keeps the phone timer's own segments, UP NEXT and ruler", () => {
    renderSurface();
    expect(document.querySelector(".timer-dots")).not.toBeNull();
    expect(document.querySelector(".timer-upnext")).not.toBeNull();
    expect(document.querySelector(".timer-total")).not.toBeNull();
    expect(document.querySelectorAll(".timer-dots .timer-dot")).toHaveLength(
      FIXTURE.phases.length,
    );
  });

  it("has no level-1 button anywhere: End is the level 2 (handoff §3)", () => {
    renderSurface();
    expect(document.querySelector(".button-l1")).toBeNull();
    expect(screen.getByRole("button", { name: "End session" })).toHaveClass(
      "button-l2",
    );
  });
});

describe("pane B — live", () => {
  it("never costs the rower their place: the SAME segments and UP NEXT as A", async () => {
    renderSurface();
    // Pane B is the landing pane.
    const bDots = document.querySelector(".timer-dots")!.outerHTML;
    const bUpNext = document.querySelector(".timer-upnext")!.outerHTML;
    const bRuler = document.querySelector(".timer-total")!.outerHTML;

    await userEvent.click(railButton("Timer"));
    expect(document.querySelector(".timer-dots")!.outerHTML).toBe(bDots);
    expect(document.querySelector(".timer-upnext")!.outerHTML).toBe(bUpNext);
    expect(document.querySelector(".timer-total")!.outerHTML).toBe(bRuler);
  });

  it("leads with the split, cut so the eye lands on the seconds", () => {
    renderSurface({ frame: frame({ currentSplit: 117.8 }) });
    const hero = document.querySelector(".connected-hero-value")!;
    expect(hero.textContent).toBe("1:57.8");
    expect(hero.querySelector(".connected-hero-tenths")!.textContent).toBe(
      ".8",
    );
  });

  it("shows METERS LEFT on a distance interval and time left on a time one", () => {
    const distance = renderSurface();
    expect(screen.getByText("METERS LEFT")).toBeInTheDocument();
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

  it("carries rate, HR and meters as three equal cards", () => {
    renderSurface();
    const triple = document.querySelector(".connected-cards-triple")!;
    expect(within(triple as HTMLElement).getByText("RATE")).toBeInTheDocument();
    expect(within(triple as HTMLElement).getByText("HR")).toBeInTheDocument();
    expect(
      within(triple as HTMLElement).getByText("METERS"),
    ).toBeInTheDocument();
  });

  it("puts the target under the hero in INK, never accent (the supersession)", () => {
    renderSurface();
    const target = document.querySelector(".connected-hero-target-value")!;
    expect(target.className).not.toContain("accent");
    // Accent appears NOWHERE on this pane.
    expect(document.querySelector(".timer-card-value-accent")).toBeNull();
    expect(document.querySelector(".button-l1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The judgement, through ONE code path
// ---------------------------------------------------------------------------

describe("judgement: one helper, every pane (handoff §3)", () => {
  const target = WORK_PHASE.targetSplit!;

  // Direction is the EFFORT's, not the number's: a smaller split is a
  // faster boat, so it is `over` (ochre). `domain/judge.ts` owns that rule
  // for both panes at once.
  it("tints pane A's NOW card ochre when faster and teal when slower", () => {
    localStorage.setItem(LAST_PANE_KEY, "timer");
    const fast = renderSurface({
      frame: frame({ currentSplit: target - 10 }),
    });
    expect(document.querySelector(".timer-card-actual-over")).not.toBeNull();
    fast.unmount();

    renderSurface({ frame: frame({ currentSplit: target + 10 }) });
    expect(document.querySelector(".timer-card-actual-under")).not.toBeNull();
  });

  it("tints pane B's hero by the same rule as pane A's card", () => {
    const a = renderSurface({ frame: frame({ currentSplit: target - 10 }) });
    const heroClass = document.querySelector(
      ".connected-hero-value",
    )!.className;
    expect(heroClass).toContain("timer-card-actual-over");
    a.unmount();

    localStorage.setItem(LAST_PANE_KEY, "timer");
    renderSurface({ frame: frame({ currentSplit: target - 10 }) });
    const nowCard = screen.getByText("NOW · /500M").parentElement!;
    expect(nowCard.querySelector(".timer-card-actual-over")).not.toBeNull();
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

  it("EVERY judged cell on pane A goes through the helper — none opts out", () => {
    localStorage.setItem(LAST_PANE_KEY, "timer");
    renderSurface({ frame: frame({ currentSplit: target - 10 }) });
    const cells = judgedCells();
    // NOW + RATE + METERS (the TARGET SPLIT card is not an actual)
    expect(cells).toHaveLength(3);
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
  it("replaces End with the status block, and says PAUSED", () => {
    // Pane A carries the status word (pane B's header is the device name
    // and the interval count — handoff §3's own two header shapes); the
    // block itself is the shell's, so it shows on every pane.
    localStorage.setItem(LAST_PANE_KEY, "timer");
    renderSurface({ phase: "paused" });
    expect(screen.getByText("PAUSED · PULL TO RESUME")).toBeInTheDocument();
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "End session" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "END" })).toBeInTheDocument();
  });

  it("NOTHING ABOVE SHIFTS: the swap happens inside one fixed-height slot", () => {
    const live = renderSurface();
    const liveFooter = document.querySelector(".connected-surface-footer")!;
    expect(liveFooter.children).toHaveLength(1);
    const liveBodyTag = document.querySelector(
      ".connected-surface-body",
    )!.previousElementSibling;
    live.unmount();

    renderSurface({ phase: "paused" });
    const pausedFooter = document.querySelector(".connected-surface-footer")!;
    // One child for one child, in the same slot — the footer itself is what
    // owns the height, so neither occupant can change it.
    expect(pausedFooter.children).toHaveLength(1);
    expect(
      document.querySelector(".connected-surface-body")!.previousElementSibling,
    ).toStrictEqual(liveBodyTag);
    // And the pager still follows the footer, in that order.
    expect(pausedFooter.nextElementSibling!.className).toContain(
      "connected-pager",
    );
  });

  it("index.css pins that slot, and both occupants, at 52px", () => {
    const css = readFileSync(indexCssPath(), "utf-8");
    const footer = /\.connected-surface-footer\s*\{([^}]*)\}/.exec(css);
    const paused = /\.connected-paused\s*\{([^}]*)\}/.exec(css);
    const endButton = /\.connected-end\s*\{([^}]*)\}/.exec(css);
    expect(footer).not.toBeNull();
    expect(footer![1]).toContain("height: 52px");
    expect(paused![1]).toContain("height: 52px");
    expect(endButton![1]).toContain("height: 52px");
  });

  it("index.css inverts the paused band: ink field, paper label (2026-08-08, the operator missed the grey one)", () => {
    const css = readFileSync(indexCssPath(), "utf-8");
    const paused = /\.connected-paused\s*\{([^}]*)\}/.exec(css);
    const label = /\.connected-paused-label\s*\{([^}]*)\}/.exec(css);
    expect(paused![1]).toContain("background: var(--ink)");
    expect(label![1]).toContain("color: var(--surface)");
  });

  it("the interval clock greys but holds its last value", () => {
    localStorage.setItem(LAST_PANE_KEY, "timer");
    renderSurface({
      phase: "paused",
      frame: frame({ intervalRemaining: { kind: "time", value: 41 } }),
    });
    const clock = document.querySelector(".connected-clock-value")!;
    expect(clock.textContent).toBe("0:41");
    expect(clock.className).toContain("connected-clock-value-held");
  });

  it("NOW reads `—` with NOT ROWING, because nobody is pulling", () => {
    localStorage.setItem(LAST_PANE_KEY, "timer");
    renderSurface({ phase: "paused" });
    const nowCard = screen.getByText("NOW · /500M").parentElement!;
    expect(nowCard.querySelector(".timer-card-value")!.textContent).toBe("—");
    expect(screen.getByText("NOT ROWING")).toBeInTheDocument();
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

  it("THE STALE OVERRIDE BEATS EVERY JUDGEMENT, on every cell of every pane", () => {
    const target = WORK_PHASE.targetSplit!;
    // Numbers that would otherwise scream "over" and "over".
    const wild = frame({ currentSplit: target - 40, spm: 60 });

    const b = renderSurface({ phase: "disconnected", frame: wild });
    let cells = judgedCells();
    expect(cells).toHaveLength(4);
    for (const cell of cells) expect(cell.judgement).toBe("stale");
    b.unmount();

    localStorage.setItem(LAST_PANE_KEY, "timer");
    renderSurface({ phase: "disconnected", frame: wild });
    cells = judgedCells();
    expect(cells).toHaveLength(3);
    for (const cell of cells) expect(cell.judgement).toBe("stale");
    expect(document.querySelector(".timer-card-actual-under")).toBeNull();
    expect(document.querySelector(".timer-card-actual-over")).toBeNull();
  });

  it("moves every stale card to the sunken fill", () => {
    renderSurface({ phase: "disconnected" });
    const cards = document.querySelectorAll(".timer-card");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.className).toContain("connected-card-stale");
    }
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

describe("no HR monitor (handoff §4)", () => {
  it("keeps the card, dashes its border, and explains once", () => {
    renderSurface({ frame: frame({ heartRateBpm: null }) });
    const hrCard = screen.getByText("HR").parentElement!;
    expect(hrCard.className).toContain("connected-card-absent");
    expect(hrCard.querySelector(".timer-card-value")!.textContent).toBe("—");
    expect(screen.getByText("NO HR MONITOR")).toBeInTheDocument();
  });

  it("becomes a number with no announcement when a belt appears", () => {
    renderSurface({ frame: frame({ heartRateBpm: 151 }) });
    const hrCard = screen.getByText("HR").parentElement!;
    expect(hrCard.className).not.toContain("connected-card-absent");
    expect(hrCard.querySelector(".timer-card-value")!.textContent).toBe("151");
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
    // And the interval count is the PROGRAM's, normalized by the driver —
    // interval 1 of Filling Low's 4 is its 8:00 warm-up, which is why the
    // kind word is WARM-UP and not WORK.
    expect(screen.getByText("1 OF 4 · WARM-UP")).toBeInTheDocument();

    // THE PIN FOR THE ORDINAL ABOVE (task-7 review, L4). Pane A carries the
    // status word, and it is the one thing on this surface that reads the
    // machine's `state` directly: put `WORKOUTSTATE_INTERVALREST` back in
    // the script and this says RESTING.
    await userEvent.click(screen.getByRole("button", { name: "Timer pane" }));
    expect(screen.getByText("ROWING")).toBeInTheDocument();
    expect(screen.queryByText("RESTING")).not.toBeInTheDocument();
  });
});
