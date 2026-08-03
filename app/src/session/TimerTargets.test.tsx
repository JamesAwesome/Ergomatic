import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

  // Defensive: a "split" targetKind phase with no `ref` at all shouldn't be
  // producible by domain/expand.ts's own `case "w"` (it always sets both
  // together), but the display helper degrades to no sub-line rather than
  // crashing on the missing field.
  it("split with no ref at all (defensive): no sub-line, never a crash", () => {
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
});
