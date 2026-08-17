// Pane C — the grid (7B Task 7, handoff §3; rebuilt connected-revamp
// Task 5, design spec §6/revision §4: single-line fixed-height rows, 32px
// landscape / 40px portrait — no more two-line portrait row, no more
// active-row third line, and the `#` column reads `WU` for the warm-up
// with work numbering starting at 1, design spec §5b). Same two strategies
// as `ConnectedSurface.test.tsx`, for the same reasons:
//
// - **One fake-driven walk** rows a REAL seeded library workout through the
//   real `ConnectedInterstitial` -> real `useMonitorSession` -> real driver
//   -> `transports/fake.ts`'s CSAFE-correct simulator, past two real
//   interval boundaries, so the completed rows this grid draws are built
//   from actuals that came off a (simulated) wire.
// - **Per-state rendering** hands `ConnectedSurface` a session directly, so
//   a row state can be put on screen without scripting the machine into it.
//
// Every fixture is a real library workout with MIXED time and distance
// intervals, and every one of them opens with a warm-up (the rower's own
// preference, prepended by `buildRun` — none is a seeded `wu` step any
// more): "Filling Low" (8:00 warm-up, then 4 x 2000 m / 3:00 — so its `#`
// column reads `WU, 1, 2, 3, 4`, never `1, 2, 3, 4, 5`), "Split Front"
// (10:00 warm-up, 8000 m, then 4 x 3:00) and "Sea Smoke" (6:00 warm-up
// then 24 x 500 m — the 25-interval scroll case the handoff itself works
// through).

import { readFileSync } from "node:fs";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../../domain/monitor/program.js";
import type {
  IntervalActual,
  MonitorFrame,
} from "../../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import { createFakeTransport } from "../../monitor/transports/fake";
import type {
  ConnectedPhase,
  MonitorSession,
  RunIdentity,
} from "../../monitor/useMonitorSession";
import { buildDraft } from "../../session/draft";
import { buildRun, type EnginePhase } from "../../session/engine";
import type { LogSeed } from "../../session/logDraft";
import {
  atRuleBodies,
  commentStrippedSource,
  cssRules,
  scopedRuleBodies,
} from "../../test/cssView";
import ConnectedInterstitial from "../ConnectedInterstitial";
import ConnectedSurface, { LAST_PANE_KEY } from "../ConnectedSurface";
import {
  buildGridModel,
  DASH,
  intervalNumbering,
  type JudgedValue,
} from "./surfaceModel";

/** The active row's live cells when the machine has said nothing — enough
 *  for a caption-grammar test, which never looks at them. */
const NO_READING: JudgedValue = {
  display: DASH,
  judgement: "within",
  absent: true,
};

/** `index.css`'s path on disk — the same jsdom-quirk-avoiding string
 *  surgery `ConnectedSurface.test.tsx` documents. Vitest mocks every `.css`
 *  import to an empty string for this project, so a rule can only be
 *  asserted by reading the source text. */
function indexCssPath(): string {
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/workout\/connected\/[^/]+\.test\.tsx$/, "index.css");
}

/**
 * `index.css` WITH EVERY COMMENT STRIPPED (`commentStrippedSource`,
 * `../../test/cssView` — Task 8's house extraction of this exact idiom),
 * and the only view of the stylesheet this file has. Nothing here can read
 * prose, because the prose is gone before the first assertion runs.
 *
 * The task-7 review found why this matters (M1), and it is the same defect
 * `562ef55` fixed one commit before this pane existed: a rule-body regex
 * captures the block's own doc comment, so a comment that happens to say
 * `min-height: 0` in prose satisfies `toContain("min-height: 0")` after the
 * DECLARATION has been deleted. The scroll guard below shipped green through
 * every gate — unit AND browser — with `min-height: 0` gone, because its own
 * comment said the words. Stripping once, at the source, is what makes every
 * assertion in this file read code; a per-assertion strip is a thing the
 * next test to be added forgets.
 */
const DECLARATIONS = commentStrippedSource(
  readFileSync(indexCssPath(), "utf-8"),
);

const LANDSCAPE_QUERY = "@media (orientation: landscape)";
const PORTRAIT_QUERY = "@media (orientation: portrait)";

/**
 * SECOND HALF OF THE SAME DEFECT (test-integrity sweep, P10/P11/P12):
 * comment-stripping stopped this file reading PROSE, but it still read the
 * stylesheet as one flat string, so every "in portrait" / "in landscape"
 * claim below actually proved only "somewhere in 7,848 lines". Three
 * measured consequences, all with 46/46 green: the base
 * `.connected-grid-row` rule moved INTO the first landscape query (portrait
 * rows losing their height, flex and box-sizing) passed, including the test
 * that says "and portrait's 40px rule is untouched"; all four landscape
 * pane-C rules hoisted OUT to the file tail (32px rows, a 26px `#` and a
 * visible REST column leaking into portrait) passed, because
 * `slice(lastIndexOf("@media (orientation: landscape)"))` runs to EOF and
 * that query closes 186 lines early; and `.connected-grid-time { order: 2 }`
 * added inside the landscape query passed the `order` guard.
 *
 * `baseRule` and `landscapeRule` go through `scopedRuleBodies`, a
 * brace-depth scanner, so the scope is checked rather than assumed. Both
 * assert exactly one match: a landscape override must never be able to
 * stand in for a missing base rule, or the other way round.
 */
function baseRule(selector: string): string {
  const bodies = scopedRuleBodies(DECLARATIONS, selector);
  expect(
    bodies,
    `expected exactly one TOP-LEVEL rule for ${selector}`,
  ).toHaveLength(1);
  return bodies[0]!;
}

/** Every rule for `selector` genuinely inside a landscape media query.
 *  `index.css` has five of those; this searches all five and nothing
 *  between or after them. Plural because a selector legitimately appears in
 *  more than one landscape rule (`.connected-grid-row` takes its `gap` from
 *  a comma-joined rule and its `height` from its own). */
function landscapeRules(selector: string): string[] {
  return scopedRuleBodies(DECLARATIONS, selector, [LANDSCAPE_QUERY]);
}

/** The one rule for `selector` genuinely inside a landscape media query,
 *  where exactly one is the claim. */
function landscapeRule(selector: string): string {
  const bodies = landscapeRules(selector);
  expect(
    bodies,
    `expected exactly one landscape-scoped rule for ${selector}`,
  ).toHaveLength(1);
  return bodies[0]!;
}

/** Every value declared for `property` across `bodies`, in source order —
 *  so "declared once, as 32px" is one exact assertion rather than a
 *  `toMatch` that a second, contradicting declaration would slip past. The
 *  leading boundary keeps `height` from matching `min-height`. */
function declaredValuesOf(bodies: string[], property: string): string[] {
  return bodies.flatMap((body) =>
    [
      ...body.matchAll(
        new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+);`, "g"),
      ),
    ].map((m) => m[1]!.trim()),
  );
}
const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE = "PM5 432331249";

// 7C Task 1: `RunIdentity.logSeed` is required now. This file's subject is
// the grid's own rendering/judging, not seed content, so one placeholder
// fills the fixture below via a spread.
const TEST_SEED: { logSeed: LogSeed } = {
  logSeed: { steps: [], paces: {} },
};

interface Fixture {
  program: WorkoutProgram;
  phases: EnginePhase[];
  identity: RunIdentity;
}

// 2026-08-09's warmup setting: a seeded workout no longer carries a `wu`
// step, so the warm-up interval every fixture below opens with now comes
// from the rower's PREFERENCE — `buildRun`'s fourth argument, its one
// producer (`src/session/engine.ts`'s `warmupPhases`). The minutes passed
// per title are exactly what that workout's own `wu` row used to carry, so
// every interval index, count and duration asserted in this file is
// unchanged. The connected surface still has to render a warm-up interval
// correctly; this is the shape it arrives in now.
function libraryFixture(title: string, warmupMinutes: number): Fixture {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  const id = title.toLowerCase().replace(/ /g, "-");
  const draft = buildDraft({
    id,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0, {
    kind: "time",
    minutes: warmupMinutes,
  }).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return {
    program,
    phases,
    identity: { workoutId: id, title: w.title, ...TEST_SEED },
  };
}

/** Task 5 fix round (coordinator directive): a warm-up whose OWN `kind` is
 *  `"distance"` is real and reachable (`WarmupSetting.kind === "distance"`,
 *  `engine.ts`'s `warmupPhases` — a rower can set a metres warm-up, not
 *  only a minutes one), and it is the one shape `libraryFixture` above
 *  cannot build (its warmup arg is always `{ kind: "time" }`). Every other
 *  fixture in this file opens with a TIME warm-up, so nothing was pinning
 *  `distanceCaptionFor`'s exclusion of a distance-kind warm-up from the
 *  caption's row list — the same exclusion this task's own `#` column
 *  numbering bug (fixed, not caught by a test until now) should have
 *  warned against leaving unpinned. */
function distanceWarmupFixture(title: string, meters: number): Fixture {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  const id = `${title.toLowerCase().replace(/ /g, "-")}-distance-warmup`;
  const draft = buildDraft({
    id,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0, {
    kind: "distance",
    meters,
  }).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return {
    program,
    phases,
    identity: { workoutId: id, title: w.title, ...TEST_SEED },
  };
}

/** THE NO-WARM-UP SHAPE (task-5-review finding, coordinator-flagged): the
 *  warm-up preference is OFF by default (`usePreferences`'s own null
 *  column) — Filling Low's own four 2000 m reps with NO warm-up phase at
 *  all, so program index 0 is a real WORK interval (ordinal 1), not an
 *  unnumbered one. Built directly through `buildRun`'s `null` warm-up arg
 *  (`libraryFixture` above always passes a real one) rather than adding a
 *  `warmupMinutes: 0` case to that helper, since `0` and `null` are
 *  different inputs on the real form (`WarmupSetting | null`) and this
 *  fixture's whole point is to be the `null` one. */
function noWarmupFixture(title: string): Fixture {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  const id = `${title.toLowerCase().replace(/ /g, "-")}-no-warmup`;
  const draft = buildDraft({
    id,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0, null).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return {
    program,
    phases,
    identity: { workoutId: id, title: w.title, ...TEST_SEED },
  };
}

/** 5 intervals: `time 480` warm-up, then 4 x `distance 2000` with 180 s of
 *  rest. Mixed, and short enough to assert every row of. */
const FILLING_LOW = libraryFixture("Filling Low", 8);
/** The no-warm-up mirror of `FILLING_LOW`: 4 x `distance 2000`, program
 *  index 0 already a numbered work interval. */
const FILLING_LOW_NO_WARMUP = noWarmupFixture("Filling Low");
/** 6 intervals: `time 600`, ONE `distance 8000`, then 4 x `time 180` — the
 *  handoff's own single-distance-row caption case, and the mirror of
 *  Filling Low's shape. */
const SPLIT_FRONT = libraryFixture("Split Front", 10);
/** 25 intervals: `time 360` then 24 x `distance 500`. The scroll case. */
const SEA_SMOKE = libraryFixture("Sea Smoke", 6);

/** Sanity on the fixtures themselves, so a later library edit that changed
 *  their shape would break HERE with a clear message rather than in a
 *  dozen assertions about row 3. */
function kindsOf(f: Fixture): ("time" | "distance")[] {
  return f.program.intervals.map((i) => i.kind);
}

/** The session pair mirrors the raw pair unless a case overrides it — see
 *  `surfaceModel.test.ts`'s own copy of this factory for the full walk-4
 *  reasoning. */
function frame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  const f: MonitorFrame = {
    elapsedSeconds: 828,
    distanceMeters: 800,
    sessionElapsedSeconds: 828,
    sessionDistanceMeters: 800,
    currentSplit: 117.8,
    spm: 21,
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

/** A completed interval's actuals, derived from the PROGRAM's own numbers
 *  (never literals typed into this file): the programmed distance rowed 6
 *  s/500m faster than asked and one stroke under the rate, which is the
 *  two-verdict pair the handoff's mockup draws on its completed rows —
 *  blue `"faster"` and red `"slower"` since the 2026-08-13 repaint, ochre
 *  and teal in the mockup itself.
 *
 *  THE ROW MUST BE PHYSICALLY POSSIBLE (tail review M-6, and the close-out
 *  round's own item 6). An interval fixes ONE of its two dimensions — a
 *  time piece its seconds, a distance piece its metres — and the other
 *  follows AT THE PACE THIS ROW CLAIMS IT WAS ROWED, which is `avgSplit`,
 *  not the target. Both used to be free here: the warm-up's metres were a
 *  literal 2384 (8:00 at 1:40.7, faster than the workout's own 2:06 work
 *  target and impossible beside the 2:06.0 split printed in the same row),
 *  and a distance row's seconds were priced at the TARGET while its split
 *  claimed six seconds better.
 *
 *  `ConnectedSurface.screens.test.tsx` carries its own copy of this
 *  function, by the same deliberate-duplication convention `libraryFixture`
 *  above follows. The two must stay in step: that copy feeds the committed
 *  PNGs, this one does not, and a fix landing in only one of them is how
 *  the literal survived here after being corrected there. The
 *  "arithmetically possible" test below pins this copy independently, so
 *  the two cannot drift back apart in silence. */
function actualFor(index: number, program: WorkoutProgram): IntervalActual {
  const interval = program.intervals[index]!;
  const split = interval.targetSplit ?? 132;
  const avgSplit = split - 6;
  const meters =
    interval.kind === "distance"
      ? interval.value
      : Math.round((interval.value / avgSplit) * 500);
  const elapsedSeconds =
    interval.kind === "time" ? interval.value : (meters / 500) * avgSplit;
  return {
    index,
    elapsedSeconds,
    distanceMeters: meters,
    avgSplit,
    avgSpm: (interval.displaySpm ?? 20) - 4,
    avgHeartRateBpm: 158 + index,
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

function renderGrid(
  overrides: Partial<MonitorSession> = {},
  fixture: Fixture = FILLING_LOW,
) {
  localStorage.setItem(LAST_PANE_KEY, "grid");
  const current = session(overrides);
  const view = render(
    <ConnectedSurface
      phases={fixture.phases}
      program={fixture.program}
      session={current}
      onEnded={vi.fn()}
    />,
  );
  return { ...view, session: current };
}

/** Every row, in program order. */
function rows(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".connected-grid-rows > *"),
  );
}

function row(n: number): HTMLElement {
  const found = rows()[n - 1];
  if (found === undefined) throw new Error(`no row ${n}`);
  return found;
}

/** One row's seven columns as plain text, in the revision's own order
 *  (connected-revamp Task 5: portrait no longer labels SPM/HR/REST inline —
 *  it has real column headers now, the same as landscape, one fewer
 *  column). */
function cells(el: HTMLElement): Record<string, string> {
  const read = (cls: string): string =>
    (el.querySelector(`.connected-grid-${cls}`)?.textContent ?? "").trim();
  return {
    num: read("num"),
    time: read("time"),
    meters: read("meters"),
    pace: read("pace"),
    spm: read("spm"),
    hr: read("hr"),
    rest: read("rest"),
  };
}

beforeEach(() => {
  localStorage.clear();
  // jsdom implements no scrolling at all, so `scrollIntoView` is simply
  // absent from `Element.prototype`. Every test in this file needs it
  // defined for the pane to exercise its pin; the "scrolls the active row
  // into view" block is the one that reads the calls back.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The three row states, on a real workout, from the real machine
// ---------------------------------------------------------------------------

describe("the fixtures are what this file says they are", () => {
  it("Filling Low is a time warm-up then four distance reps", () => {
    expect(kindsOf(FILLING_LOW)).toStrictEqual([
      "time",
      "distance",
      "distance",
      "distance",
      "distance",
    ]);
  });

  it("Split Front is time, ONE distance, then four time intervals", () => {
    expect(kindsOf(SPLIT_FRONT)).toStrictEqual([
      "time",
      "distance",
      "time",
      "time",
      "time",
      "time",
    ]);
  });

  it("Sea Smoke is the 25-interval case the handoff works through", () => {
    expect(SEA_SMOKE.program.intervals).toHaveLength(25);
  });

  // The arithmetic, asserted directly rather than left to the rendered
  // strings. A cell-level snapshot records an impossible row exactly as
  // happily as a possible one — that is how the literal 2384 survived a
  // task review, a whole-branch review and a 997-line test-integrity sweep
  // in this very file. This checks the INVARIANT instead: whatever
  // dimension the interval does not fix, distance and time must agree with
  // the split the same row reports.
  it("every actualFor row is arithmetically possible: metres, seconds and split agree", () => {
    for (const [name, fixture] of [
      ["Filling Low", FILLING_LOW],
      ["Sea Smoke", SEA_SMOKE],
    ] as const) {
      fixture.program.intervals.forEach((_interval, index) => {
        const a = actualFor(index, fixture.program);
        // `avgSplit` is nullable on the wire type but never null here —
        // asserted rather than asserted-away, so a future `actualFor` that
        // stopped reporting a split would fail this test instead of
        // silently skipping the arithmetic it exists to check.
        expect(a.avgSplit).not.toBeNull();
        // split = seconds per 500 m, so metres = seconds / split * 500.
        // Within a metre: `actualFor` rounds the derived side.
        expect([
          `${name} #${index}`,
          Math.abs((a.elapsedSeconds / a.avgSplit!) * 500 - a.distanceMeters),
        ]).toStrictEqual([
          `${name} #${index}`,
          expect.closeTo(0, 0) as unknown as number,
        ]);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// The shell header's composed GRID trailing (CR2 spec 3 Task 5, design spec
// §2B's composition note): `PaneGrid.tsx`'s own headline dies this task, and
// the header's status caption — `ConnectionLine`'s `trailing` slot,
// `ConnectedSurface.tsx`'s `headerTrailing` — grows a GRID-only branch.
// Exercised here (not `ConnectedSurface.test.tsx`) because `renderGrid`
// already mounts the full surface with the GRID pane active, the same
// helper the row-state tests below share.
// ---------------------------------------------------------------------------

describe("the shell header's composed GRID trailing (design spec §2B)", () => {
  it("joins the ordinal with the session countdown, the countdown half in --marker gold", () => {
    // Default `frame()` (intervalIndex 1) is Filling Low's first work
    // piece — ordinal `1 OF 4` — with a real `totalLeftDisplay` behind it.
    renderGrid();
    const trailing = document.querySelector(".connected-line-trailing")!;
    const countdown = trailing.querySelector(".connected-header-countdown")!;
    expect(countdown).not.toBeNull();
    expect(countdown.textContent).toBe("39:48 LEFT");
    // The ordinal half sits OUTSIDE the marker span, in the trailing's own
    // inherited ink-3 — only the countdown wears the mark, never the whole
    // caption (spec §2B: "the countdown portion in --marker gold").
    expect(trailing.textContent).toBe("1 OF 4 · 39:48 LEFT");
  });

  it("falls back to the plain WARM-UP caption on the unnumbered warm-up — no ordinal to join TOTAL LEFT onto", () => {
    // intervalIndex 0 is Filling Low's own warm-up (`intervalOrdinalLabel`
    // is `null` there — `surfaceModel.test.ts`'s own pin on the field).
    renderGrid({ frame: frame({ intervalIndex: 0 }) });
    const trailing = document.querySelector(".connected-line-trailing")!;
    expect(trailing.textContent).toBe("WARM-UP");
    expect(trailing.querySelector(".connected-header-countdown")).toBeNull();
  });

  it("shows READY, not a running countdown, at armed — even with warm-up disabled and a non-null ordinal (task-5-review finding)", () => {
    // THE REGRESSION THIS PINS. Warm-up is OFF by default
    // (`usePreferences`'s own null column) — `FILLING_LOW_NO_WARMUP` means
    // program index 0 is a NUMBERED work interval (ordinal 1, not null),
    // so `headerTrailing`'s OTHER guard (`intervalOrdinalLabel === null`)
    // does not fire here. Only an explicit `status === "armed"` check can
    // stop the header composing a running countdown before the erg has
    // moved. Every other armed test in this file (and
    // `ConnectedSurface.test.tsx`'s own "armed's first frame" block) uses
    // a warm-up-bearing fixture, where the ordinal-null guard already
    // masked a missing status guard — this fixture is the one shape that
    // exposes it. `phase: "ready"` is what `deriveProgram`/`deriveSession`
    // turn into `status: "armed"` (`ConnectedSurface.test.tsx`'s own
    // "status precedence" describe block proves that mapping).
    renderGrid(
      {
        phase: "ready",
        frame: frame({
          state: "armed",
          intervalIndex: 0,
          elapsedSeconds: 0,
          distanceMeters: 0,
          rowingActive: false,
        }),
      },
      FILLING_LOW_NO_WARMUP,
    );
    const trailing = document.querySelector(".connected-line-trailing")!;
    expect(trailing.textContent).toBe("1 OF 4 · READY");
    expect(trailing.querySelector(".connected-header-countdown")).toBeNull();
  });

  it("index.css paints the composed countdown span in --marker gold, never accent or a verdict", () => {
    // The same negatives `.connected-grid-countdown`'s own census enforces,
    // pinned separately for this SEPARATE class (`index.css`'s own comment
    // on why the two rules stay apart) — a rule added to one must not be
    // assumed to cover the other.
    const rule = baseRule(".connected-header-countdown");
    expect(rule).toContain("color: var(--marker)");
    expect(rule).not.toContain("--accent");
    expect(rule).not.toContain("--judge-");
  });
});

describe("row states (handoff §3's three treatments)", () => {
  it("draws completed actuals, the active card and upcoming programmed values", () => {
    renderGrid({ actuals: [actualFor(0, FILLING_LOW.program)] });
    expect(rows()).toHaveLength(5);

    // 1 — COMPLETED: the machine's own numbers, over a solid rule. Row 1 is
    // the warm-up (design spec §5b): its `#` cell reads `WU`, never a
    // number, no matter that it is done.
    expect(row(1).className).toContain("connected-grid-completed");
    const done = cells(row(1));
    expect(done.num).toBe("WU");
    // The warm-up's programmed 480 s, as the machine reported rowing it —
    // and the metres that 480 s at this row's own reported split actually
    // buys (480 / 126 * 500), not a literal that contradicted the pace
    // printed two cells to its right.
    expect(done.time).toBe("8:00");
    expect(done.meters).toBe("1905");
    expect(done.hr).toBe("158");

    // 2 — ACTIVE: a filled row, a now-marker, a bold index. Work numbering
    // starts at 1 on the first work piece (§5b) — row 2 is that piece, so
    // its `#` reads `1`, not `2`.
    expect(row(2).className).toContain("connected-grid-active");
    expect(row(2).querySelector(".connected-grid-marker")).not.toBeNull();
    expect(row(2)).toHaveAttribute("aria-current", "step");
    expect(cells(row(2)).num).toBe("1");

    // 3, 4 and 5 — UPCOMING: the PROGRAMMED values, never an actual, and
    // work ordinals 2, 3, 4.
    for (const [n, ordinal] of [
      [3, "2"],
      [4, "3"],
      [5, "4"],
    ] as const) {
      expect(row(n).className).toContain("connected-grid-upcoming");
      const next = cells(row(n));
      expect(next.num).toBe(ordinal);
      expect(next.meters).toBe("2000");
      expect(next.pace).toBe("2:06.0");
      expect(next.spm).toBe("22");
      // Nothing has happened here, so there is no heart rate to report.
      expect(next.hr).toBe("—");
    }
  });

  it("the ACTIVE row is the machine's interval, and it moves with it", () => {
    const first = renderGrid();
    // Row 2 (program index 1) is the first work piece — ordinal 1, not the
    // raw program index 2 (design spec §5b: work numbering starts at 1).
    expect(cells(row(2)).num).toBe("1");
    first.unmount();

    renderGrid({ frame: frame({ intervalIndex: 3 }) });
    expect(row(4).className).toContain("connected-grid-active");
    expect(cells(row(4)).num).toBe("3");
    expect(row(2).className).toContain("connected-grid-completed");
  });

  it("A COMPLETED ROW WITH NO ACTUAL SAYS NOTHING IT CANNOT BACK", () => {
    // MISSED rows are NOT BUILT (descoped with auto-reconnect, design spec
    // C5 / handoff open question 2). A row the machine never reported an
    // actual for reads as dashes, and carries no second treatment.
    renderGrid({ frame: frame({ intervalIndex: 2 }), actuals: [] });
    for (const n of [1, 2]) {
      expect(row(n).className).toContain("connected-grid-completed");
      expect(row(n).className).not.toContain("missed");
      const empty = cells(row(n));
      expect(empty.time).toBe("—");
      expect(empty.meters).toBe("—");
      expect(empty.pace).toBe("—");
    }
    expect(document.body.textContent).not.toContain("MISSED");
  });

  it("files an actual whose own index is unknown against NO row", () => {
    // `IntervalActual.index`'s own contract: "A CONSUMER MUST NOT TREAT
    // `null` AS INTERVAL 0."
    renderGrid({
      frame: frame({ intervalIndex: 2 }),
      actuals: [{ ...actualFor(0, FILLING_LOW.program), index: null }],
    });
    expect(cells(row(1)).meters).toBe("—");
  });
});

describe("the dash carries 'not yet', colour does not (handoff §3)", () => {
  it("gives upcoming rows a DASHED border and completed rows a solid one", () => {
    // Base rules, in BOTH orientations — never a landscape-only override.
    expect(baseRule(".connected-grid-upcoming")).toContain(
      "1px dashed var(--rule-3)",
    );
    expect(baseRule(".connected-grid-completed")).toContain(
      "1px solid var(--rule-2)",
    );
  });

  it("keeps upcoming VALUES at --ink-3, never the AA-failing --ink-5", () => {
    // The handoff names `--ink-5` for this treatment and its own standing
    // law forbids it in the same breath ("no small mono label lighter than
    // `--ink-3`"): `--ink-5` measures 2.48:1 on `--page`, `--ink-3`
    // 6.68:1. The dash is what says "not yet"; the colour only has to be
    // readable. Connected-revamp Task 5 dropped the old line-wrapper
    // indirection — `color` is declared on the ROW itself now, inherited by
    // every cell that doesn't carry its own judged tint.
    const rule = baseRule(".connected-grid-upcoming");
    expect(rule).toContain("color: var(--ink-3)");
    expect(rule).not.toContain("--ink-5");
  });
});

// ---------------------------------------------------------------------------
// Distance intervals
// ---------------------------------------------------------------------------

describe("distance intervals (handoff §3's distance rules)", () => {
  it("a PENDING distance row shows `—` in TIME and its meters in METERS", () => {
    renderGrid();
    const pending = cells(row(3));
    expect(pending.time).toBe("—");
    expect(pending.meters).toBe("2000");
  });

  it("a PENDING time row shows its duration in TIME and `—` in METERS", () => {
    // The mirror rule, on the fixture whose upcoming rows are time-based.
    renderGrid({ frame: frame({ intervalIndex: 2 }) }, SPLIT_FRONT);
    const pending = cells(row(4));
    expect(pending.time).toBe("3:00");
    expect(pending.meters).toBe("—");
  });

  it("counts METERS down on an active distance interval, and time on a time one", () => {
    const distance = renderGrid({
      frame: frame({ intervalRemaining: { kind: "distance", value: 1200 } }),
    });
    // Row 2 of Filling Low is a 2000 m rep: meters count down, and the
    // dimension that is NOT programmed carries no fabricated number.
    expect(cells(row(2)).meters).toBe("1200");
    expect(cells(row(2)).time).toBe("—");
    expect(
      row(2).querySelector(".connected-grid-meters.connected-grid-countdown"),
    ).not.toBeNull();
    distance.unmount();

    renderGrid({
      frame: frame({
        intervalIndex: 0,
        intervalRemaining: { kind: "time", value: 41 },
      }),
    });
    expect(cells(row(1)).time).toBe("0:41");
    expect(cells(row(1)).meters).toBe("—");
    expect(
      row(1).querySelector(".connected-grid-time.connected-grid-countdown"),
    ).not.toBeNull();
  });

  it("ROADMAP CL item 7: once the driver reports intervalAccrued, the OTHER cell shows it instead of a bare dash", () => {
    const distance = renderGrid({
      frame: frame({
        intervalRemaining: { kind: "distance", value: 1200 },
        intervalAccrued: { kind: "time", value: 245 },
      }),
    });
    // Row 2 (the 2000 m rep): meters still counts down, and the time
    // cell — genuinely unknowable before this task, always a dash — now
    // carries the driver's own live accrual.
    expect(cells(row(2)).meters).toBe("1200");
    expect(cells(row(2)).time).toBe("4:05");
    // Still no countdown class on the accrual cell — only the PROGRAMMED
    // dimension wears the accent (DEVIATIONS row 77's own standing rule —
    // 78 until Task 8 retired the segment-strip row above it).
    expect(
      row(2).querySelector(".connected-grid-time.connected-grid-countdown"),
    ).toBeNull();
    distance.unmount();

    renderGrid({
      frame: frame({
        intervalIndex: 0,
        intervalRemaining: { kind: "time", value: 41 },
        intervalAccrued: { kind: "distance", value: 137 },
      }),
    });
    expect(cells(row(1)).time).toBe("0:41");
    expect(cells(row(1)).meters).toBe("137");
  });

  it("keeps the dash before the machine's first frame — the one genuinely unknowable case", () => {
    // Default `frame()` carries `intervalAccrued: null` (no reading yet).
    renderGrid();
    expect(cells(row(2)).time).toBe("—");
  });

  it("names the distance rows IN WORDS under the grid, never a glyph", () => {
    // The numbers here are WORK ordinals (design spec §5b), not raw program
    // indices — Filling Low's four 2000 m reps are program indices 1-4
    // (the warm-up occupies index 0), but the caption names them 1-4, the
    // same numbers their own `#` cells show, never 2-5.
    //
    // Every expected string below is prefixed `N MORE BELOW ·` (CR2 spec 3
    // Task 5, design spec §2B): the default `frame()` fixture's own
    // `intervalIndex: 1` puts the active row one past the warm-up, so `N`
    // is the program's own row count minus 2 (the warm-up plus the active
    // row itself) — `footerCaptionFor`'s own doc comment has the exact
    // formula (`surfaceModel.ts`).
    const many = renderGrid();
    expect(
      screen.getByText(
        "3 MORE BELOW · ROWS 1, 2, 3, 4 ARE 2000 M PIECES · METERS COUNT DOWN",
      ),
    ).toBeInTheDocument();
    many.unmount();

    // The handoff's own one-row sentence, on the fixture that has one.
    // Split Front's 8000 m piece is program index 1 (after its own
    // warm-up) but WORK ordinal 1 — the caption and the row's `#` agree.
    const one = renderGrid({}, SPLIT_FRONT);
    expect(
      screen.getByText(
        "4 MORE BELOW · ROW 1 IS AN 8000 M PIECE · METERS COUNT DOWN",
      ),
    ).toBeInTheDocument();
    one.unmount();

    // Twenty-four row numbers is not a caption. It counts instead.
    renderGrid({}, SEA_SMOKE);
    expect(
      screen.getByText(
        "23 MORE BELOW · 24 ROWS ARE DISTANCE PIECES · METERS COUNT DOWN",
      ),
    ).toBeInTheDocument();
  });

  it("dashes an upcoming row that carries no target of its own", () => {
    // A warm-up compiles to `targetSplit: null, displaySpm: null` (the H8
    // rule: the compiler never programs an estimate as a hard target), and
    // an upcoming row must show that as the house dash rather than
    // inventing a number. Reachable only when such an interval sits AFTER
    // the active one, which no seeded workout does — every library workout
    // opens with its warm-up — so the program is reassembled here from
    // three REAL compiled intervals rather than hand-written ones.
    const reordered: Fixture = {
      ...SPLIT_FRONT,
      program: {
        intervals: [
          SEA_SMOKE.program.intervals[1]!,
          SPLIT_FRONT.program.intervals[2]!,
          SPLIT_FRONT.program.intervals[0]!,
        ],
      },
    };
    expect(reordered.program.intervals[2]!.targetSplit).toBeNull();
    expect(reordered.program.intervals[2]!.displaySpm).toBeNull();

    renderGrid({ frame: frame({ intervalIndex: 1 }) }, reordered);
    expect(row(3).className).toContain("connected-grid-upcoming");
    const bare = cells(row(3));
    expect(bare.pace).toBe("—");
    expect(bare.spm).toBe("—");
    // THE WARM-UP READS `WU` EVEN OUT OF POSITION (design spec §5b): this
    // fixture is the one case in the file where the warm-up is NOT program
    // index 0 (every seeded workout opens with its own) — proof that the
    // `#` cell reads `GridRow.ordinal`, not "is this row 0".
    expect(bare.num).toBe("WU");
    // ...and the one distance row now reads with the indefinite article the
    // handoff's own sentence uses. `reordered` has 3 intervals total and
    // the active row is index 1, so exactly one row sits below it.
    expect(
      screen.getByText(
        "1 MORE BELOW · ROW 1 IS A 500 M PIECE · METERS COUNT DOWN",
      ),
    ).toBeInTheDocument();
  });

  it("says AN before a distance a rower speaks with a leading vowel", () => {
    // `buildGridModel` direct, because the single-distance-row caption is
    // otherwise reachable only through a workout that has exactly one — and
    // the grammar rule needs four of them. The interval is a REAL compiled
    // one with its `value` moved; every other field is the compiler's.
    const base = SEA_SMOKE.program.intervals[1]!;
    const captionFor = (meters: number): string | null => {
      const intervals = [{ ...base, value: meters }];
      return buildGridModel({
        intervals,
        actuals: [],
        activeIndex: 0,
        remaining: null,
        accrued: null,
        livePace: NO_READING,
        liveRate: NO_READING,
        liveHr: NO_READING,
        numbering: intervalNumbering(intervals),
        armed: false,
      }).caption;
    };

    // Eight, in any magnitude.
    expect(captionFor(800)).toContain("IS AN 800 M PIECE");
    expect(captionFor(8000)).toContain("IS AN 8000 M PIECE");
    // The two four-digit distances a rower says in hundreds.
    expect(captionFor(1100)).toContain("IS AN 1100 M PIECE");
    expect(captionFor(1800)).toContain("IS AN 1800 M PIECE");
    // ...and the neighbours that do not.
    expect(captionFor(500)).toContain("IS A 500 M PIECE");
    expect(captionFor(1500)).toContain("IS A 1500 M PIECE");
    expect(captionFor(1000)).toContain("IS A 1000 M PIECE");
    // A leading 1 alone is not the rule — three digits are spoken plainly.
    expect(captionFor(180)).toContain("IS A 180 M PIECE");
  });

  it("excludes a DISTANCE-KIND warm-up from the caption's row list (design spec §5b)", () => {
    // The warm-up here is itself a distance interval — 1000 m, not one of
    // Filling Low's own 2000 m work pieces. It gets no ordinal (§5b: "the
    // denominator counts WORKING intervals only"), so it must not be named
    // by the caption's row list either, even though its OWN `kind` is
    // "distance" and would otherwise satisfy the caption's filter.
    const fixture = distanceWarmupFixture("Filling Low", 1000);
    expect(fixture.program.intervals[0]).toMatchObject({
      type: "warmup",
      kind: "distance",
      value: 1000,
    });
    renderGrid({}, fixture);
    // The `#` cell still reads WU, exactly as the time-warm-up fixtures do.
    expect(cells(row(1)).num).toBe("WU");
    // If the warm-up leaked into the caption's count, the four uniform
    // 2000 m pieces plus one non-matching 1000 m warm-up would break
    // uniformity and fall to the OTHER branch entirely — "5 ROWS ARE
    // DISTANCE PIECES", not the four-item list. The exact list proves both
    // the count (4, not 5) and the numbers (1-4, not 2-5 or 1-5). Same
    // 5-interval shape as Filling Low itself, active row 1 by default: 3
    // rows sit below it.
    expect(
      screen.getByText(
        "3 MORE BELOW · ROWS 1, 2, 3, 4 ARE 2000 M PIECES · METERS COUNT DOWN",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing at all when there is no distance interval to explain", () => {
    // An empty caption is a claim; no caption is the truth. Built by
    // narrowing a real fixture to its time intervals, so the program is
    // still a compiler's output.
    const timeOnly: Fixture = {
      ...SPLIT_FRONT,
      program: {
        intervals: SPLIT_FRONT.program.intervals.filter(
          (i) => i.kind === "time",
        ),
      },
    };
    renderGrid({}, timeOnly);
    expect(document.querySelector(".connected-grid-caption")).toBeNull();
    expect(document.body.textContent).not.toContain("COUNT DOWN");
  });

  // CR2 spec 3 Task 5 (design spec §2B): the README's own "N MORE BELOW"
  // scroll hint, merged ahead of the distance sentence. The positive case
  // is already pinned above (Sea Smoke, a real seeded 25-row program, at
  // its default active row 1: "23 MORE BELOW"). These two pin the model's
  // own two deliberate suppressions (`footerCaptionFor`'s doc comment,
  // `surfaceModel.ts`).
  it("omits the prefix when the active row is the LAST one — never '0 MORE BELOW'", () => {
    // Sea Smoke: 25 intervals, so program index 24 is the very last row.
    // Nothing sits below it.
    renderGrid({ frame: frame({ intervalIndex: 24 }) }, SEA_SMOKE);
    expect(
      screen.getByText("24 ROWS ARE DISTANCE PIECES · METERS COUNT DOWN"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("MORE BELOW");
  });

  it("omits the prefix on a time-only program too, even with real rows below the active one", () => {
    // `below` would be positive here (Split Front's own warm-up plus its
    // four time reps, five rows total, active row 0 of 5 — four genuinely
    // sit below it) — but there is no distance caption for the hint to
    // merge into, and the hint's own job is to point at that sentence, not
    // to exist alone.
    const timeOnly: Fixture = {
      ...SPLIT_FRONT,
      program: {
        intervals: SPLIT_FRONT.program.intervals.filter(
          (i) => i.kind === "time",
        ),
      },
    };
    renderGrid({ frame: frame({ intervalIndex: 0 }) }, timeOnly);
    expect(document.querySelector(".connected-grid-caption")).toBeNull();
    expect(document.body.textContent).not.toContain("MORE BELOW");
  });
});

// ---------------------------------------------------------------------------
// THE ACCENT CENSUS
// ---------------------------------------------------------------------------

/** Every class `index.css` PAINTS with `var(--accent)`, read out of the
 *  stylesheet itself rather than listed here — so a rule added tomorrow
 *  joins the census without this test being edited.
 *
 *  `DECLARATIONS` is already comment-free (this file's own prose says
 *  "--accent" a dozen times, and index.css's says it more). Only the
 *  RIGHTMOST class of each comma-separated selector
 *  is collected, because that is the element the declaration actually
 *  lands on. And only `connected-*` classes are collected —
 *  the panes render no other class of their own, and the reused
 *  phone-timer components' own accent surfaces are covered by the
 *  neutralising-override test below. */
function accentClassesFromCss(): string[] {
  const found = new Set<string>();
  for (const [, selector, body] of DECLARATIONS.matchAll(
    /([^{}]*)\{([^{}]*)\}/g,
  )) {
    if (!body!.includes("var(--accent)")) continue;
    for (const part of selector!.split(",")) {
      const classes = [...part.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
      const last = classes.at(-1);
      if (last !== undefined && last.startsWith("connected-")) found.add(last);
    }
  }
  return [...found];
}

describe("THE ACCENT CENSUS: accent is a CONTROL colour, and nothing else", () => {
  it("finds the accent-bearing classes in the stylesheet, not in this test", () => {
    const classes = accentClassesFromCss();
    // Everything left is a CONTROL: the header's own End (connected-revamp
    // Task 6 — it belongs to the shell's header now, not to a pane, the
    // same reasoning the paused block's `END` outline established) and that
    // paused `END` outline with its armed state (handoff §4).
    //
    // The grid's countdown LEFT this list on 2026-08-13 (James: "use gold
    // for 'not a judgement' since we switched to red"). It was the only
    // accent that painted DATA rather than a control, and once
    // slower-than-target became red it sat one column from a colour meaning
    // the opposite kind of thing. Its absence here is the assertion.
    expect(classes).not.toContain("connected-grid-countdown");
    expect(classes.toSorted()).toStrictEqual([
      "connected-end",
      "connected-paused-end",
      "connected-paused-end-armed",
    ]);
  });

  it("NEITHER pane carries one: accent reaches no value on the surface", () => {
    const selector = accentClassesFromCss()
      .map((c) => `.${c}`)
      .join(",");
    const paneAccents = (pane: "live" | "grid"): Element[] => {
      localStorage.setItem(LAST_PANE_KEY, pane);
      render(
        <ConnectedSurface
          phases={FILLING_LOW.phases}
          program={FILLING_LOW.program}
          session={session({ actuals: [actualFor(0, FILLING_LOW.program)] })}
          onEnded={vi.fn()}
        />,
      );
      const found = Array.from(
        document
          .querySelector(".connected-surface-body")!
          .querySelectorAll(selector),
      );
      cleanupRender();
      return found;
    };

    // Task 6 proved this pane has none (pane A's own equal proof retired
    // with `PaneTimer.tsx`, connected-revamp Task 2). This re-proves it
    // from the STYLESHEET's own accent set rather than from a class name
    // typed here, so a rule added later is caught without this test
    // changing.
    expect(paneAccents("live")).toHaveLength(0);
    // ZERO now, not one. Pane C's countdown was the last accented value on
    // either pane; it is `--marker` gold as of 2026-08-13.
    expect(paneAccents("grid")).toHaveLength(0);
  });

  it("the countdown still MARKS the active row's counting cell, now in gold", () => {
    // The census above proves accent is gone. This proves the MARK is not —
    // deleting the rule outright would also have satisfied a zero-accent
    // assertion, and the rower would have lost the only indication of which
    // cell is counting down.
    localStorage.setItem(LAST_PANE_KEY, "grid");
    render(
      <ConnectedSurface
        phases={FILLING_LOW.phases}
        program={FILLING_LOW.program}
        session={session({ actuals: [actualFor(0, FILLING_LOW.program)] })}
        onEnded={vi.fn()}
      />,
    );
    const marked = Array.from(
      document
        .querySelector(".connected-surface-body")!
        .querySelectorAll(".connected-grid-countdown"),
    );
    expect(marked).toHaveLength(1);
    const only = marked[0]!;
    expect(only.closest(".connected-grid-row")!.className).toContain(
      "connected-grid-active",
    );
    expect(only.textContent).toBe("1200");
    cleanupRender();
  });

  it("no upcoming or completed row can reach the countdown mark", () => {
    renderGrid({
      frame: frame({ intervalIndex: 2 }),
      actuals: [actualFor(0, FILLING_LOW.program)],
    });
    for (const n of [1, 2, 4]) {
      expect(row(n).querySelector(".connected-grid-countdown")).toBeNull();
    }
    expect(row(3).querySelector(".connected-grid-countdown")).not.toBeNull();
  });

  // CR2 spec 3 Task 4 RETIRES THE OVERRIDE THIS TEST USED TO PIN, not just
  // the risk it guarded: `.connected-pane .timer-total-bar span` (the rule
  // that used to repaint `TimerRuler`'s own accent fill ink inside a
  // connected pane) is gone along with `TimerRuler` itself — `PaneLive`
  // forks its own `ConnectedProgressBar` now (Task 3/4), which paints ink
  // directly, never accent, with no override needed to correct it. Same
  // story `.timer-dot-past`/`-current`'s own retired overrides already
  // told (this test's own history, kept below): a component that is never
  // reused inside `.connected-pane` needs no neutralising rule, and a test
  // that pinned one would be pinning a vacuous invariant. This test now
  // proves the STRONGER fact directly — no reused phone-timer component
  // renders inside a connected pane at all, so there is no accent surface
  // left for a missing override to expose.
  it("no phone-timer component (TimerRuler, UpNextStrip, IntervalSegments) can render inside a connected pane any more", () => {
    expect(DECLARATIONS).not.toContain(".connected-pane .timer-total-bar");
    expect(DECLARATIONS).not.toContain(".connected-pane .timer-total-warmup");
    expect(DECLARATIONS).not.toContain(".connected-pane .timer-dot-past");
    expect(DECLARATIONS).not.toContain(".connected-pane .timer-dot-current");
    expect(DECLARATIONS).not.toMatch(/\.connected-pane[^{]*\.timer-upnext/);
    expect(DECLARATIONS).not.toMatch(/\.connected-pane[^{]*\.timer-total\b/);
  });

  it("the countdown's mark is a COLOUR, never an enlarged size — and gold, never accent or a verdict", () => {
    // Connected-revamp Task 5 dropped the old 22px/26px special case: the
    // revision's own mockup draws the countdown at the SAME `--c-size-row`
    // as every other value in the row, tinted, not enlarged — the density
    // this task exists for has no room for a bigger digit.
    const rule = baseRule(".connected-grid-countdown");
    // GOLD, and specifically NOT red (James, 2026-08-13: "use gold for 'not
    // a judgement' since we switched to red"). The negatives are the point:
    // this mark POINTS at the counting-down cell, so it must never wear
    // accent's brick red again, and never a verdict colour — either would
    // put "watch this" and "you are behind" in the same hue one column
    // apart, which is what it was doing before.
    expect(rule).toContain("color: var(--marker)");
    expect(rule).not.toContain("--accent");
    expect(rule).not.toContain("--judge-");
    expect(rule).not.toContain("font-size");
    // And no landscape query re-enlarges it behind the base rule's back.
    expect(
      scopedRuleBodies(DECLARATIONS, ".connected-grid-countdown", [
        LANDSCAPE_QUERY,
      ]),
    ).toStrictEqual([]);
  });
});

/** `render` twice in one test leaves two trees mounted; this drops them
 *  all so the next query in the same test sees one surface. */
function cleanupRender(): void {
  document.body.innerHTML = "";
}

// ---------------------------------------------------------------------------
// The one judgement path — pane C joins the count
// ---------------------------------------------------------------------------

/** Every judged cell on whatever is on screen. Pane B puts
 *  `timer-card-actual-{judgement}` on cards and a hero; pane C puts it on
 *  its actual `/500M` and `SPM` cells, and NOWHERE else. */
function judgedCells(): { text: string; judgement: string }[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[class*="timer-card-actual-"]'),
  ).map((el) => ({
    text: el.textContent ?? "",
    judgement: /timer-card-actual-(\w+)/.exec(el.className)?.[1] ?? "none",
  }));
}

describe("judged cells: pane C goes through the ONE helper", () => {
  it("judges the completed rows' /500M and SPM, and NOTHING programmed", () => {
    renderGrid({
      frame: frame({ intervalIndex: 2 }),
      actuals: [
        actualFor(0, FILLING_LOW.program),
        actualFor(1, FILLING_LOW.program),
      ],
    });
    // Two completed rows x 2 judged cells + the active row's 2 = SIX. The
    // two upcoming rows contribute NONE: a programmed value is not an
    // actual and structurally cannot carry a verdict.
    expect(judgedCells()).toHaveLength(6);
    expect(
      row(4).querySelectorAll('[class*="timer-card-actual-"]'),
    ).toHaveLength(0);

    // Row 2's actual was rowed 6 s/500m faster than asked -> blue "faster"
    // (the rower's direction, `domain/judge.ts`'s rule), and one stroke
    // under the programmed rate -> red "slower".
    expect(row(2).querySelector(".connected-grid-pace")!.className).toContain(
      "timer-card-actual-faster",
    );
    expect(row(2).querySelector(".connected-grid-spm")!.className).toContain(
      "timer-card-actual-slower",
    );
  });

  it("the WHOLE SURFACE's judged-cell count, pane by pane", () => {
    // The number the mutation round moves: pane B 2 (hero/rate — CR2 spec 3
    // Task 4 cut HR and session METERS off `PaneLive` outright, spec §3
    // fate table), pane C 4 on this frame (one completed row's two cells
    // plus the active row's two) — SIX in total. Break `judgeActual` and
    // every one of them lands on the same wrong verdict at once, which is
    // the property this file is here to keep. Pane A (3: NOW/RATE/METERS)
    // retired with `PaneTimer.tsx` (connected-revamp Task 2); a stored
    // `"timer"` now aliases to live via `PANES.includes`, so it is no
    // longer a distinct pane to count.
    const counts: Record<string, number> = {};
    for (const pane of ["live", "grid"] as const) {
      localStorage.setItem(LAST_PANE_KEY, pane);
      render(
        <ConnectedSurface
          phases={FILLING_LOW.phases}
          program={FILLING_LOW.program}
          session={session({ actuals: [actualFor(0, FILLING_LOW.program)] })}
          onEnded={vi.fn()}
        />,
      );
      counts[pane] = judgedCells().length;
      cleanupRender();
    }
    expect(counts).toStrictEqual({ live: 2, grid: 4 });
  });

  // THE STALE OVERRIDE, SCOPED (task-7 review, M2). Staleness is a property
  // of the FEED, so it reaches the live-fed cells and stops there. The two
  // pins below are deliberately a pair: together they say what one
  // "everything greys" assertion could not, which is WHERE the greying ends.
  function renderDisconnectedMidSession() {
    return renderGrid({
      phase: "disconnected",
      // Numbers that would otherwise scream a verdict, on a link we cannot
      // vouch for.
      frame: frame({ intervalIndex: 2, currentSplit: 60, spm: 60 }),
      actuals: [
        actualFor(0, FILLING_LOW.program),
        actualFor(1, FILLING_LOW.program),
      ],
    });
  }

  it("greys the ACTIVE row's live cells — a reading we cannot vouch for", () => {
    renderDisconnectedMidSession();
    expect(row(3).className).toContain("connected-grid-active");
    for (const cls of ["pace", "spm"]) {
      expect(
        row(3).querySelector(`.connected-grid-${cls}`)!.className,
      ).toContain("timer-card-actual-stale");
    }
  });

  it("LEAVES COMPLETED ROWS THEIR VERDICTS: history is not a reading", () => {
    // `disconnected` is TERMINAL in 7B (spec C5 descoped auto-reconnect), so
    // greying these would erase every judgement the rower had earned, for
    // good, on the one pane whose job is to show what they have done. A
    // closed `IntervalActual` was never `NOW`; the link's death cannot
    // retract it.
    renderDisconnectedMidSession();
    // Row 2 is the first 2000 m rep, rowed 6 s/500m fast and a stroke under
    // the rate: blue and red, and they stay blue and red.
    expect(row(2).className).toContain("connected-grid-completed");
    expect(row(2).querySelector(".connected-grid-pace")!.className).toContain(
      "timer-card-actual-faster",
    );
    expect(row(2).querySelector(".connected-grid-spm")!.className).toContain(
      "timer-card-actual-slower",
    );
    // Row 1 is the warm-up — no programmed target, so `within` either way.
    // What matters is that it is not GREY: it has nothing to be stale about.
    for (const cls of ["pace", "spm"]) {
      expect(
        row(1).querySelector(`.connected-grid-${cls}`)!.className,
      ).not.toContain("timer-card-actual-stale");
    }
    // Six judged cells still, and exactly two of them are stale — the active
    // row's, and only the active row's.
    const cells = judgedCells();
    expect(cells).toHaveLength(6);
    expect(cells.filter((c) => c.judgement === "stale")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Scroll containment — the ONE landscape scroll (DEVIATIONS row 2)
// ---------------------------------------------------------------------------

describe("contained scroll: only the rows move", () => {
  it("puts the header, the caption and End OUTSIDE the scroller", () => {
    renderGrid({}, SEA_SMOKE);
    const pane = document.querySelector(".connected-pane-grid")!;
    const scroller = pane.querySelector(".connected-grid-rows")!;
    // Every row is inside it...
    expect(scroller.children).toHaveLength(25);
    // ...and none of the three pinned things is.
    expect(scroller.querySelector(".connected-grid-head")).toBeNull();
    expect(scroller.querySelector(".connected-grid-caption")).toBeNull();
    expect(pane.querySelector(".connected-end")).toBeNull();
    // End is the SHELL's, one level up (connected-revamp Task 6: the
    // shell's HEADER now, not its footer), so it cannot scroll with the
    // rows even by accident.
    expect(
      document.querySelector(".connected-header .connected-end"),
    ).not.toBeNull();
  });

  it("index.css scrolls the rows and nothing else", () => {
    // READS DECLARATIONS, NOT PROSE (task-7 review, M1). This assertion
    // previously matched against the raw source, so the rule's own comment —
    // which argues about `flex: 1` and `min-height: 0` in words — satisfied
    // it whether or not either declaration existed. It also asserted
    // `flex: 1`, a value the stylesheet deliberately REJECTS.
    const scroller = baseRule(".connected-grid-rows");
    expect(scroller).toContain("overflow-y: auto");
    expect(scroller).toContain("min-height: 0");
    // `0 1 auto`, not `1` — the hug-then-shrink behaviour the caption's
    // position depends on. Asserting the value the code rejected was the
    // other half of M1.
    expect(scroller).toContain("flex: 0 1 auto");
    expect(scroller).not.toMatch(/flex:\s*1;/);

    expect(baseRule(".connected-grid-head")).toContain("flex: none");
    expect(baseRule(".connected-grid-caption")).toContain("flex: none");
  });

  it("truncates the caption to ONE line rather than letting a long 'N MORE BELOW' merge wrap into the control bar below it", () => {
    // Found in this task's own screenshot sweep (recurring failure #7): the
    // 25-interval fixture's caption wraps to a second line in portrait at
    // the old rule's own fixed single-line height, and that second line
    // paints straight through the box into `SegmentedControl`'s bottom bar
    // — jsdom cannot see the collision (no real layout), so this pins the
    // THREE declarations that prevent it from a real browser instead.
    const rule = baseRule(".connected-grid-caption");
    expect(rule).toContain("white-space: nowrap");
    expect(rule).toContain("overflow: hidden");
    expect(rule).toContain("text-overflow: ellipsis");
  });

  it("SCROLLS THE ACTIVE ROW INTO VIEW, and again when the machine moves on", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    const view = renderGrid({ frame: frame({ intervalIndex: 8 }) }, SEA_SMOKE);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.instances[0]).toBe(row(9));
    expect(row(9).className).toContain("connected-grid-active");

    view.rerender(
      <ConnectedSurface
        phases={SEA_SMOKE.phases}
        program={SEA_SMOKE.program}
        session={session({ frame: frame({ intervalIndex: 12 }) })}
        onEnded={vi.fn()}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.instances[1]).toBe(row(13));
    expect(row(13).className).toContain("connected-grid-active");
  });

  it("does NOT re-scroll on a frame that leaves the active interval alone", () => {
    // A status tick arrives ~2x a second. Scrolling on every one of them
    // would fight a rower who has scrolled ahead to look at row 20.
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    const view = renderGrid({ frame: frame({ intervalIndex: 8 }) }, SEA_SMOKE);
    expect(spy).toHaveBeenCalledTimes(1);
    view.rerender(
      <ConnectedSurface
        phases={SEA_SMOKE.phases}
        program={SEA_SMOKE.program}
        session={session({
          frame: frame({ intervalIndex: 8, elapsedSeconds: 900 }),
        })}
        onEnded={vi.fn()}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // `touch-action: pan-y` retired with the swipe handler (CR2 spec 3 task
  // 1, design spec Ruling 4, antagonist correction 3): the grid scroller
  // manages its own overflow with nothing left to coordinate with, so
  // there is no rule left to pin here.
});

// ---------------------------------------------------------------------------
// Fixed heights and the revision's own column weights (connected-revamp
// Task 5, design spec §6/revision §4). Every row is ALREADY one line in
// BOTH orientations (no more `display: contents` folding — that retired
// with the two-line portrait shape), so what differs between them is a
// handful of size tokens: the row's own fixed height, the `#` column's
// width, and REST's visibility.
// ---------------------------------------------------------------------------

describe("row height and column weights, both orientations (revision §4)", () => {
  it("fixes the row at 40px portrait, box-sizing border-box so the border can't grow it", () => {
    // TOP LEVEL, so it applies in portrait too. The old flat-string version
    // of this passed with the whole rule moved inside a landscape query.
    const rule = baseRule(".connected-grid-row");
    expect(declaredValuesOf([rule], "height")).toStrictEqual(["40px"]);
    expect(rule).toContain("box-sizing: border-box");
  });

  it("steps the row to 32px in landscape — JAMES RULING 2026-08-12, not the packet's 36", () => {
    // Exactly one landscape-scoped `height`, and it is 32px — a second
    // landscape rule quietly re-declaring it would fail this.
    expect(
      declaredValuesOf(landscapeRules(".connected-grid-row"), "height"),
    ).toStrictEqual(["32px"]);
    // And portrait's 40px rule is untouched — this is a landscape STEP, not
    // a redefinition of the base value.
    expect(
      declaredValuesOf([baseRule(".connected-grid-row")], "height"),
    ).toStrictEqual(["40px"]);
  });

  it("carries the revision's exact flex table, unchanged between orientations", () => {
    // TIME 1, METERS 1, /500M 1.1, SPM 0.6, HR 0.6 — the SAME weights in
    // both orientations (only `#`'s width and REST's visibility differ),
    // so these live in the base rules, never inside the landscape query.
    // Both halves are now checked: the weight is declared at the top level,
    // AND no landscape query redeclares `flex` for that column.
    const weights: [string, string][] = [
      [".connected-grid-time", "flex: 1;"],
      [".connected-grid-meters", "flex: 1;"],
      [".connected-grid-pace", "flex: 1.1;"],
      // One comma-joined rule in the source; `scopedRuleBodies` splits the
      // list, so each half is findable by name instead of by matching the
      // stylesheet's own line breaks.
      [".connected-grid-spm", "flex: 0.6;"],
      [".connected-grid-hr", "flex: 0.6;"],
    ];
    for (const [selector, declaration] of weights) {
      expect(baseRule(selector)).toContain(declaration);
      expect([
        selector,
        scopedRuleBodies(DECLARATIONS, selector, [LANDSCAPE_QUERY]).filter(
          (body) => /flex\s*:/.test(body),
        ),
      ]).toStrictEqual([selector, []]);
    }
  });

  it("widens `#` to 30px in landscape (design spec §2B's literal figure), 22px in portrait (today's geometry, unchanged)", () => {
    expect(
      declaredValuesOf([baseRule(".connected-grid-num")], "width"),
    ).toStrictEqual(["22px"]);
    expect(
      declaredValuesOf(
        [landscapeRule(".connected-pane-grid .connected-grid-num")],
        "width",
      ),
    ).toStrictEqual(["30px"]);
  });

  it("drops REST in portrait and brings it back at 0.8 in landscape", () => {
    // Revision §4's own column list: portrait's row has SIX columns, never
    // seven — REST is rendered (one markup, both orientations) and hidden.
    expect(baseRule(".connected-grid-rest")).toContain("display: none");
    const override = landscapeRule(".connected-pane-grid .connected-grid-rest");
    expect(override).toContain("flex: 0.8");
    expect(override).not.toContain("display: none");
  });

  it("stays a COLUMN and keeps its scroll where the other panes become rows", () => {
    expect(landscapeRule(".connected-pane-grid")).toContain(
      "flex-direction: column",
    );
  });

  it("renders the same six or seven columns in the DOM in both orientations — CSS hides REST, JSX never omits it", () => {
    renderGrid();
    // Every row (and the header) carries a `.connected-grid-rest` node
    // regardless of orientation; only `index.css` decides whether it
    // paints. A conditional-JSX implementation would make this assertion
    // fail in a portrait-styled jsdom render just as easily as a real one.
    expect(
      document.querySelector(".connected-grid-head .connected-grid-rest"),
    ).not.toBeNull();
    for (const el of document.querySelectorAll(".connected-grid-row")) {
      expect(el.querySelector(".connected-grid-rest")).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// The fake-driven walk: real hook, real driver, real (simulated) PM5
// ---------------------------------------------------------------------------

describe("the grid, fake-driven", () => {
  it("draws a completed row from an actual that came off the wire", async () => {
    localStorage.setItem(LAST_PANE_KEY, "grid");
    const warmup = FILLING_LOW.program.intervals[0]!;
    const fake = createFakeTransport({
      program: FILLING_LOW.program,
      deviceName: DEVICE,
      events: [
        {
          atMs: 100,
          kind: "status",
          // WORKOUTSTATE_INTERVALWORKTIME. FOUR, not three: three is
          // WORKOUTSTATE_INTERVALREST (`domain/monitor/pm5/parse.ts`), and
          // a `3` here puts the machine in a REST the script never meant —
          // which is exactly what this walk caught in the task-6 test's own
          // copy of it (its comment said INTERVALWORKTIME over a 3).
          workoutState: 4,
          elapsedSeconds: 240,
          distanceMeters: 1100,
          spm: 20,
          currentSplit: 130,
          heartRateBpm: 142,
          programIntervalIndex: 0,
        },
        {
          atMs: 200,
          kind: "status",
          workoutState: 4,
          elapsedSeconds: warmup.value,
          distanceMeters: 1908,
          spm: 20,
          currentSplit: 125.8,
          heartRateBpm: 142,
          programIntervalIndex: 0,
        },
        {
          atMs: 200,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: warmup.value,
            distanceMeters: 1908,
            avgSplit: 125.8,
            avgSpm: 18,
            avgHeartRateBpm: 142,
          },
          cumulativeElapsedSeconds: warmup.value,
          cumulativeDistanceMeters: 1908,
        },
        // Interval 1's own live tick, 60s/240m INTO IT — 0x0031's Elapsed
        // Time/Distance are per-interval on the wire (interface-notes.md
        // §20 items 12/17/24), not session-cumulative on top of the
        // warm-up's own 480s/1908m just above, so this reads 60/240, not
        // `warmup.value + 60`/`1908 + 240`.
        {
          atMs: 300,
          kind: "status",
          workoutState: 4,
          elapsedSeconds: 60,
          distanceMeters: 240,
          spm: 21,
          currentSplit: 117.8,
          heartRateBpm: 164,
          programIntervalIndex: 1,
        },
      ],
    });

    render(
      <ConnectedInterstitial
        program={FILLING_LOW.program}
        phases={FILLING_LOW.phases}
        identity={FILLING_LOW.identity}
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

    for (let i = 0; i < 40; i += 1) {
      await act(async () => {
        fake.tick(0);
        await Promise.resolve();
      });
      if (screen.queryByText("Ready when you pull")) break;
    }
    await screen.findByText("Ready when you pull");
    await userEvent.click(
      screen.getByRole("button", { name: "Show me the numbers" }),
    );
    // Past the first status, the boundary, and the status that follows it.
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        fake.tick(50);
        await Promise.resolve();
      });
    }

    // The grid is on screen, on the pane the rower last used.
    expect(document.querySelector(".connected-pane-grid")).not.toBeNull();

    // Row 1 is COMPLETED and carries numbers the machine reported, decoded
    // by the real codec: 8:00 / 1908 m / 2:05.8 / 18 spm / 142 bpm — the
    // handoff mockup's own first row, arrived at honestly. It is the
    // warm-up (design spec §5b), so its `#` reads `WU`, not `1`.
    //
    // 1908, not the 2384 this story used to script (close-out item 6). The
    // frames above are hand-authored and then run through the REAL codec,
    // so the codec cannot make an impossible row possible: 480 s at the
    // 125.8 s/500m this same row reports is 1908 m, while 2384 m in 480 s
    // is a 1:40.7 warm-up. The row printed both numbers side by side and
    // no assertion could see the contradiction, because every one of them
    // checked a rendered string rather than the arithmetic between them.
    expect(row(1).className).toContain("connected-grid-completed");
    expect(cells(row(1))).toStrictEqual({
      num: "WU",
      time: "8:00",
      meters: "1908",
      pace: "2:05.8",
      spm: "18",
      hr: "142",
      rest: "—",
    });

    // Row 2 is the one being rowed, and its countdown is the programmed
    // dimension — 2000 m less what the machine says has been covered.
    expect(row(2).className).toContain("connected-grid-active");
    expect(
      row(2).querySelector(".connected-grid-meters.connected-grid-countdown")
        ?.textContent,
    ).toBe("1760");
    expect(cells(row(2)).pace).toBe("1:57.8");
  });
});

// ---------------------------------------------------------------------------
// Tab order (the task-6 review's L4 trap, checked on the first pane that
// could have made it live)
// ---------------------------------------------------------------------------

describe("tab order through pane C", () => {
  it("declares no `order` for this pane, so DOM order IS reading order", () => {
    // Panes A and B trade DOM order for `order` in portrait, and `order`
    // moves paint without moving the tab sequence. Pane C introduces the
    // surface's first scrolling region; if it had inherited that trade, a
    // focusable inside it would be reached out of sequence.
    //
    // P12: the old guard only looked at selectors carrying the
    // `.connected-pane-grid` ancestor, and pane C's own columns are
    // declared without it (`.connected-grid-row`, `-num`, `-spm`, `-rest`),
    // so `.connected-grid-time { order: 2 }` inside the landscape query
    // passed. This censuses EVERY rule in the file whose selector names a
    // pane-C class, at every nesting depth, and pins the offenders to the
    // empty list — the accent census's idiom, applied to `order`.
    const paneCRules = cssRules(DECLARATIONS).filter((rule) =>
      rule.selectors.some((s) =>
        /\.connected-(pane-grid|grid-[\w-]+)(\s|$|:|\.|>)/.test(`${s} `),
      ),
    );
    // Non-empty guard, and specifically that the four classes P12 named as
    // escaping the old guard are inside the census now.
    const scanned = new Set(paneCRules.flatMap((rule) => rule.selectors));
    for (const selector of [
      ".connected-pane-grid",
      ".connected-grid-row",
      ".connected-grid-num",
      ".connected-grid-spm",
      ".connected-grid-rest",
      ".connected-grid-time",
    ]) {
      expect([selector, scanned.has(selector)]).toStrictEqual([selector, true]);
    }
    // CR2 spec 3 task 1 dropped three rules the census used to count: the
    // `.connected-pane-grid .connected-line`/`.connected-line-device`
    // landscape overrides and `.connected-grid-headline`'s own landscape
    // fold, all retired when `ConnectionLine` moved out of this pane into
    // the shell's header (32 -> 29, measured against this worktree). CR2
    // spec 3 Task 5 drops four more: `.connected-grid-headline` itself,
    // `.connected-grid-totals`, `.connected-grid-interval` and
    // `.connected-grid-total` — the whole headline this pane used to draw
    // is gone (29 -> 25, measured against this worktree).
    expect(paneCRules.length).toBeGreaterThanOrEqual(25); // measured: 25
    expect(
      paneCRules
        .filter((rule) => /\border\s*:/.test(rule.body))
        .map((rule) => rule.selectors.join(", ")),
    ).toStrictEqual([]);

    // P11's own portrait-specific check retired ITS OWN TARGET (CR2 spec 3
    // Task 4): the ONE `@media (orientation: portrait)` block index.css
    // ever had was the connected-pane-live hero/metric-row/ruler `order`
    // block this task deletes outright (natural DOM order already matches
    // §2C's own sequence once the metric row and `TimerRuler` are gone —
    // that deletion's own comment has the reasoning) — index.css is
    // mobile-first, so nothing else in the file ever needed a portrait
    // query of its own. `atRuleBodies` now finds ZERO, not one; the
    // `paneCRules` census above (whole-file, every nesting depth, no
    // slicing) is what still catches an `order` declaration wherever a
    // future rule might add one, portrait query or not — this assertion
    // is the current STRUCTURAL fact, not a re-run of P11's own slicing
    // bug proof (nothing here can regress into that bug: `atRuleBodies`
    // reads real brace nesting, never an `indexOf`/`slice` window).
    expect(atRuleBodies(DECLARATIONS, PORTRAIT_QUERY)).toStrictEqual([]);
  });

  it("has EXACTLY ONE focusable thing of its own: the named scroller", () => {
    // This test used to assert ZERO, and passed only because jsdom
    // implements none of Chromium's keyboard-focusable-scrollers behaviour
    // (task-7 review, M3 — measured in a real browser). The scroller was
    // already the surface's first tab stop, as an unnamed `<div>`. It is now
    // declared, so both engines agree and iOS Safari — which supplies no
    // implicit focus at all — gets the same behaviour.
    renderGrid({}, SEA_SMOKE);
    const pane = document.querySelector(".connected-pane-grid")!;
    const focusable = Array.from(
      pane.querySelectorAll("button, a, input, select, textarea, [tabindex]"),
    );
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toBe(pane.querySelector(".connected-grid-rows"));
    // Named, and not by its contents: a screen reader landing on a scroll
    // region needs to be told what it is holding.
    expect(focusable[0]).toHaveAttribute("aria-label", "Interval grid");
    expect(focusable[0]).toHaveAttribute("role", "group");
    // Not a row, not a cell — the rows themselves stay static text.
    for (const el of pane.querySelectorAll(".connected-grid-row")) {
      expect(el.hasAttribute("tabindex")).toBe(false);
    }
  });

  it("tabs End, then the grid, then the two control halves", async () => {
    // THE REAL BROWSER ORDER, REWRITTEN A SECOND TIME (design spec §9:
    // "Tab order changes twice" — Task 2 dropped Timer from the rail
    // (`scroller → End → Timer → Live → Grid` became `scroller → End →
    // Live → Grid`); connected-revamp Task 6 moves End itself, from the
    // shell's footer (after the pane body in DOM order) into its header
    // (before the pane body), which reorders the first two stops:
    // `End → scroller → Live → Grid` now. Still both the real browser's
    // order and jsdom's, because the scroller's `tabindex` is explicit
    // rather than implied, and it is also the READING order — End sits
    // above the grid on the screen in both orientations now (the safety
    // fix's own header placement, `ConnectedSurface.tsx`).
    renderGrid();
    const order: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      await userEvent.tab();
      order.push(
        (document.activeElement as HTMLElement).getAttribute("aria-label") ??
          document.activeElement!.textContent!,
      );
    }
    expect(order).toStrictEqual([
      "End session",
      "Interval grid",
      "Live pane",
      "Grid pane",
    ]);
  });
});

describe("the grid never grows a control of its own", () => {
  it("keeps End as the surface's only button outside the segmented control", () => {
    renderGrid();
    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(buttons).toStrictEqual(["End session", "Live pane", "Grid pane"]);
    expect(document.querySelector(".button-l1")).toBeNull();
  });

  // The swipe-reaches-pane-B pin retired with the swipe handler itself
  // (CR2 spec 3 task 1, design spec Ruling 4, antagonist correction 3):
  // `SegmentedControl` is the only navigation left, and its own click
  // tests (`SegmentedControl.test.tsx`, `ConnectedSurface.test.tsx`) cover
  // it reaching every pane.
});
