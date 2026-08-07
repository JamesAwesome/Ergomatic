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

  it("shows 'rate free' with no caption when spm is unset — never a dash", () => {
    expect(rateDisplay(phase({}))).toStrictEqual({
      main: "rate free",
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

  it("renders 'rate free' with no stray caption for a warm-up phase", () => {
    render(<TimerTargets phase={phase({ type: "warmup", label: "Easy" })} />);
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.getByText("rate free")).toBeInTheDocument();
    expect(screen.queryByText("spm")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  // BYTE-IDENTICAL REGRESSION PIN (Phase 7B Task 3). Lifted from THIS
  // component's own pre-task render (HEAD at the start of this task, before
  // the `variant` prop existed) by rendering the real `Timer` component
  // against a distance work phase (split-ref "2k", no spm) and reading
  // `document.querySelector(".timer-cards")!.outerHTML` — the exact string
  // below, unedited. Proves `variant` omitted (and `variant="default"`
  // explicitly) both still produce the identical DOM this component always
  // rendered.
  const pinnedPhase = phase({
    type: "work",
    targetKind: "split",
    targetSplit: 100,
    ref: { base: "2k", off: 0 },
    label: "1:40.0",
  });
  const PINNED_DEFAULT_HTML =
    '<div class="timer-cards"><div class="timer-card"><span class="timer-card-label">TARGET SPLIT</span><span class="timer-card-value timer-card-value-accent">1:40.0</span><span class="timer-card-caption">2K</span></div><div class="timer-card"><span class="timer-card-label">RATE</span><span class="timer-card-value">rate free</span></div></div>';

  it("variant omitted renders byte-identical to the pre-Task-3 markup", () => {
    const { container } = render(<TimerTargets phase={pinnedPhase} />);
    expect(container.innerHTML).toBe(PINNED_DEFAULT_HTML);
  });

  it("variant='default' explicitly renders the identical byte-identical markup", () => {
    const { container } = render(
      <TimerTargets phase={pinnedPhase} variant="default" />,
    );
    expect(container.innerHTML).toBe(PINNED_DEFAULT_HTML);
  });
});

describe("TimerTargets: variant='connected'", () => {
  const splitPhase = phase({
    type: "work",
    targetKind: "split",
    targetSplit: 136,
    ref: { base: "6k", off: 16 },
    label: "2:16.0",
    spm: 22,
  });

  it("ink targets: the TARGET SPLIT value drops the accent class the default variant carries", () => {
    render(<TimerTargets phase={splitPhase} variant="connected" />);
    const value = screen.getByText("2:16.0");
    expect(value.className).toBe("timer-card-value");
    expect(value.className).not.toContain("timer-card-value-accent");
  });

  it("static third line: both cards render an unconditional caption the default variant never shows", () => {
    render(<TimerTargets phase={splitPhase} variant="connected" />);
    expect(screen.getByText("LIVE PACE")).toBeInTheDocument();
    expect(screen.getByText("LIVE RATE")).toBeInTheDocument();
  });

  it("with no judged actual supplied, the actual slot is absent entirely (not an empty element)", () => {
    const { container } = render(
      <TimerTargets phase={splitPhase} variant="connected" />,
    );
    expect(container.querySelector(".timer-card-actual")).toBeNull();
  });

  it("judged-actual slot: renders the caller's display string with a judgement-keyed class, per card independently", () => {
    render(
      <TimerTargets
        phase={splitPhase}
        variant="connected"
        paceActual={{ display: "2:19.4", judgement: "over" }}
        rateActual={{ display: "18", judgement: "stale" }}
      />,
    );
    const paceActualEl = screen.getByText("2:19.4");
    expect(paceActualEl.className).toBe(
      "timer-card-actual timer-card-actual-over",
    );
    const rateActualEl = screen.getByText("18", {
      selector: ".timer-card-actual",
    });
    expect(rateActualEl.className).toBe(
      "timer-card-actual timer-card-actual-stale",
    );
  });

  it("the default variant never renders any connected-only element (static line or actual slot), even if actuals are passed", () => {
    const { container } = render(
      <TimerTargets
        phase={splitPhase}
        paceActual={{ display: "2:19.4", judgement: "over" }}
      />,
    );
    expect(container.querySelector(".timer-card-static")).toBeNull();
    expect(container.querySelector(".timer-card-actual")).toBeNull();
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
// right." No route renders the connected variant yet for a real
// browser-level contrast check; this is the honest ceiling until one does.
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
