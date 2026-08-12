import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { EnginePhase } from "./engine";
import TimerTargets, { rateDisplay, targetSplitDisplay } from "./TimerTargets";

// A minimal but realistic EnginePhase builder — every field the real engine
// always stamps, with the caller only overriding what a given test cares
// about. `originalIndex`/`label` are the two fields every phase kind always
// carries; the rest vary by kind (domain/expand.ts's own `Phase` shape).
function phase(overrides: Partial<EnginePhase>): EnginePhase {
  return {
    type: "work",
    label: "",
    originalIndex: 0,
    ...overrides,
  };
}

describe("targetSplitDisplay", () => {
  it("warmup: the label alone ('Easy'), no sub-line", () => {
    expect(
      targetSplitDisplay(phase({ type: "warmup", label: "Easy" })),
    ).toStrictEqual({
      main: "Easy",
      sub: null,
    });
  });

  it("rest: the label alone ('Rest'), no sub-line", () => {
    expect(
      targetSplitDisplay(phase({ type: "rest", label: "Rest" })),
    ).toStrictEqual({
      main: "Rest",
      sub: null,
    });
  });

  it("test: the label alone ('All out'), no sub-line", () => {
    expect(
      targetSplitDisplay(phase({ type: "test", label: "All out" })),
    ).toStrictEqual({
      main: "All out",
      sub: null,
    });
  });

  it("effort: the word, NEVER the numeric estimate behind it", () => {
    const result = targetSplitDisplay(
      phase({
        type: "work",
        targetKind: "effort",
        targetSplit: 100, // the estimate — must never surface anywhere
        label: "ALL OUT",
      }),
    );
    expect(result).toStrictEqual({ main: "ALL OUT", sub: null });
  });

  // Ui-fix round, Item 1: the sub-line is now the REF the split was
  // resolved from, uppercased — not a tolerance band. 6k=120, off=16 ->
  // 136 -> fmtSplit "2:16.0"; refLabel({base:"6k",off:16}) = "6k +16" ->
  // uppercased "6K +16" (the design handoff's own literal example).
  it("split: the exact resolved value, and the REF beneath it, uppercased", () => {
    const result = targetSplitDisplay(
      phase({
        type: "work",
        targetKind: "split",
        targetSplit: 136,
        ref: { base: "6k", off: 16 },
        label: "2:16.0",
      }),
    );
    expect(result).toStrictEqual({ main: "2:16.0", sub: "6K +16" });
  });

  // A ref with no offset still gets its own sub-line (the base alone) —
  // there is always something to say about "where this number came from",
  // never a collapsed/omitted line the way the old tolerance-band branch
  // dropped it when tol was 0.
  it("split with a zero-offset ref: the sub-line is the bare base, uppercased", () => {
    const result = targetSplitDisplay(
      phase({
        type: "work",
        targetKind: "split",
        targetSplit: 100,
        ref: { base: "2k", off: 0 },
        label: "1:40.0",
      }),
    );
    expect(result).toStrictEqual({ main: "1:40.0", sub: "2K" });
  });

  // Q3 (fix round 1): this is NOT unreachable/defensive — it's the exact
  // shape of a `v:1` SessionRun frozen before this round shipped `Phase.ref`
  // at all. `domain/expand.ts`'s own `case "w"` always sets `ref` together
  // with `targetKind: "split"` for a run built TODAY, but an old stored
  // record loaded via `run.ts`'s own loose `isSessionRun` validation (which
  // only checks `v`/top-level shape, never per-phase fields) can genuinely
  // have `targetKind: "split"` with no `ref` at all. The card degrades to
  // no sub-line (two lines, not three) rather than crashing — see
  // Timer.test.tsx's own dedicated legacy-run test for the full timer-level
  // proof (no crash, two-line card, UP NEXT shows the stored label as-is).
  it("split with no ref at all (a legacy pre-ref run, not a defensive/unreachable case): no sub-line, never a crash", () => {
    const result = targetSplitDisplay(
      phase({
        type: "work",
        targetKind: "split",
        targetSplit: 136,
        label: "2:16.0",
      }),
    );
    expect(result).toStrictEqual({ main: "2:16.0", sub: null });
  });
});

describe("rateDisplay", () => {
  it("shows the spm value with its caption when set", () => {
    expect(rateDisplay(phase({ spm: 24 }))).toStrictEqual({
      main: "24",
      caption: "spm",
    });
  });

  it("shows 'free' with no caption when spm is unset — never a dash", () => {
    expect(rateDisplay(phase({}))).toStrictEqual({
      main: "free",
      caption: null,
    });
  });

  it("spm 0 is still a set rate, not 'unset' (0 !== undefined)", () => {
    // A guard against the classic falsy-vs-undefined mixup: `phase.spm !==
    // undefined` must be the check, not `phase.spm` truthiness.
    expect(rateDisplay(phase({ spm: 0 }))).toStrictEqual({
      main: "0",
      caption: "spm",
    });
  });
});

describe("TimerTargets (component)", () => {
  it("renders both cards for a split-ref work phase, sub-line as the uppercased ref", () => {
    render(
      <TimerTargets
        phase={phase({
          type: "work",
          targetKind: "split",
          targetSplit: 136,
          ref: { base: "6k", off: 16 },
          label: "2:16.0",
          spm: 18,
        })}
      />,
    );
    expect(screen.getByText("TARGET SPLIT")).toBeInTheDocument();
    expect(screen.getByText("2:16.0")).toBeInTheDocument();
    expect(screen.getByText("6K +16")).toBeInTheDocument();
    expect(screen.getByText("RATE")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("spm")).toBeInTheDocument();
    // No tolerance band (EN DASH, U+2013) anywhere on the card.
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it("renders 'free' with no stray caption for a warm-up phase", () => {
    render(<TimerTargets phase={phase({ type: "warmup", label: "Easy" })} />);
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.getByText("free")).toBeInTheDocument();
    expect(screen.queryByText("spm")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  // BYTE-IDENTICAL REGRESSION PIN (Phase 7B Task 3, updated Task 8). Lifted
  // from THIS component's own pre-Task-3 render (HEAD before the now-retired
  // `variant` prop ever existed) by rendering the real `Timer` component
  // against a distance work phase (split-ref "2k", no spm) and reading
  // `document.querySelector(".timer-cards")!.outerHTML` — the exact string
  // below, unedited. Task 8 retired `variant` entirely (task-6 review
  // ruling: it shipped with no consumer and never gained one — Task 7 built
  // rows, not this component's cards); this component takes only `phase`
  // now, so there is exactly one render to pin rather than two.
  const pinnedPhase = phase({
    type: "work",
    targetKind: "split",
    targetSplit: 100,
    ref: { base: "2k", off: 0 },
    label: "1:40.0",
  });
  const PINNED_DEFAULT_HTML =
    '<div class="timer-cards"><div class="timer-card"><span class="timer-card-label">TARGET SPLIT</span><span class="timer-card-value timer-card-value-accent">1:40.0</span><span class="timer-card-caption">2K</span></div><div class="timer-card"><span class="timer-card-label">RATE</span><span class="timer-card-value">free</span></div></div>';

  it("renders byte-identical to the pre-Task-3 markup", () => {
    const { container } = render(<TimerTargets phase={pinnedPhase} />);
    expect(container.innerHTML).toBe(PINNED_DEFAULT_HTML);
  });
});

// Task-3 review, HIGH-1: `.timer-card-actual-stale` shipped this task
// pointing at `--ink-5` (2.76:1 against `--surface` — FAILS the house's
// binding >=4.5:1 AA rule), against the connected-mode handoff's explicit
// "every stale value greys to --ink-3" (7.44:1, passes). jsdom never loads
// `index.css` as real stylesheet rules (no browser layout engine backs
// `getComputedStyle` here), so a rendered-element assertion can't catch a
// wrong token the way `e2e/design.spec.ts` does for routes that actually
// exist — this reads the CSS source text straight off disk instead (via
// `node:fs`, not an ESM import: Vitest's own CSS handling for this project
// mocks every `.css` import — including `?raw`/`?inline` suffixed ones,
// verified empirically — to an empty string), pinning the resolved
// custom-property structurally rather than "we looked and it seemed
// right." Task 8: `TimerTargets`'s own `variant="connected"` JSX (and the
// class hooks the removed describe block above used to exercise through
// it) is RETIRED — Task 7 built pane C/A's judged cells as rows in
// `PaneTimer.tsx`/`PaneGrid.tsx` directly, never through this component —
// but `.timer-card-actual-{judgement}` itself is very much live, rendered
// today by `PaneLive.tsx`'s hero and `PaneGrid.tsx`'s judged cells on the
// real `/library/:id` connected surface (connected-revamp Task 2 retired
// `PaneTimer.tsx`, pane A, an earlier renderer of the same hook); this
// test's own CSS-source-reading approach remains the honest ceiling for a
// token jsdom cannot compute.
describe("index.css: .timer-card-actual-stale resolves to the AA-passing token (review HIGH-1)", () => {
  it("uses var(--ink-3), never the AA-failing var(--ink-5) this task originally shipped", () => {
    // Plain string surgery on `import.meta.url`, not the global `URL`
    // constructor: this project's jsdom test environment resolves
    // `new URL("../index.css", import.meta.url)` against
    // `http://localhost:3000/` instead of the given `file://` base
    // (verified empirically) — a jsdom quirk, not a real bug in the path
    // being computed.
    const indexCssPath = import.meta.url
      .replace(/^file:\/\//, "")
      .replace(/session\/[^/]+\.test\.tsx$/, "index.css");
    const indexCss = readFileSync(indexCssPath, "utf-8");
    const match = /\.timer-card-actual-stale\s*\{([^}]*)\}/.exec(indexCss);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toContain("var(--ink-3)");
    expect(body).not.toContain("--ink-5");
  });
});
