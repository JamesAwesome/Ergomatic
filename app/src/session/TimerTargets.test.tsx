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
  it("warmup: the label alone ('Easy'), no range", () => {
    expect(
      targetSplitDisplay(phase({ type: "warmup", label: "Easy" })),
    ).toStrictEqual({
      main: "Easy",
      range: null,
    });
  });

  it("rest: the label alone ('Rest'), no range", () => {
    expect(
      targetSplitDisplay(phase({ type: "rest", label: "Rest" })),
    ).toStrictEqual({
      main: "Rest",
      range: null,
    });
  });

  it("test: the label alone ('All out'), no range", () => {
    expect(
      targetSplitDisplay(phase({ type: "test", label: "All out" })),
    ).toStrictEqual({
      main: "All out",
      range: null,
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
    expect(result).toStrictEqual({ main: "ALL OUT", range: null });
  });

  it("split with a non-zero tolerance: the central value, and the range beneath it", () => {
    // 6k=120, off=16 -> 136 -> fmtSplit "2:16.0"; tol 1 -> "2:15.0–2:17.0"
    // (draft.test.ts's own pinned number for this exact split).
    const result = targetSplitDisplay(
      phase({
        type: "work",
        targetKind: "split",
        targetSplit: 136,
        label: "2:15.0–2:17.0",
      }),
    );
    expect(result).toStrictEqual({ main: "2:16.0", range: "2:15.0–2:17.0" });
  });

  it("split with ZERO tolerance: the range collapses onto the central value — no duplicate line", () => {
    const result = targetSplitDisplay(
      phase({
        type: "work",
        targetKind: "split",
        targetSplit: 136,
        label: "2:16.0", // toleranceRange's own tol=0 branch: bare fmtSplit
      }),
    );
    expect(result).toStrictEqual({ main: "2:16.0", range: null });
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
  it("renders both cards for a split-ref work phase", () => {
    render(
      <TimerTargets
        phase={phase({
          type: "work",
          targetKind: "split",
          targetSplit: 136,
          label: "2:15.0–2:17.0",
          spm: 18,
        })}
      />,
    );
    expect(screen.getByText("TARGET SPLIT")).toBeInTheDocument();
    expect(screen.getByText("2:16.0")).toBeInTheDocument();
    expect(screen.getByText("2:15.0–2:17.0")).toBeInTheDocument();
    expect(screen.getByText("RATE")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("spm")).toBeInTheDocument();
  });

  it("renders 'rate free' with no stray caption for a warm-up phase", () => {
    render(<TimerTargets phase={phase({ type: "warmup", label: "Easy" })} />);
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.getByText("rate free")).toBeInTheDocument();
    expect(screen.queryByText("spm")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
