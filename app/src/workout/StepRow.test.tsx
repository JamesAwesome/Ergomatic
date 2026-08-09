import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StepRow from "./StepRow";

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

function renderStep(ui: React.ReactElement) {
  render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("StepRow durations (house clock format)", () => {
  it("renders a 45-second work step as 0:45, not 0.75′", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 0.75 },
          ref: { base: "6k", off: 0 },
        }}
        baselines={BASELINES}
        nudge={0}
        onNudge={() => {}}
      />,
    );
    expect(screen.getByText(/0:45/)).toBeInTheDocument();
    expect(screen.queryByText(/0\.75/)).not.toBeInTheDocument();
  });

  it("renders a 20-second work step without sixteen digits of float", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 20 / 60 },
          ref: { base: "6k", off: 0 },
        }}
        baselines={BASELINES}
        nudge={0}
        onNudge={() => {}}
      />,
    );
    expect(screen.getByText(/0:20/)).toBeInTheDocument();
  });

  // A LEGACY-DATA PROBE used to live here, exercising `StepRow.tsx`'s own
  // `TEMPORARY SHIM (2026-08-09, Task 1)` branch for stored/unmigrated data
  // carrying a `wu` step. Task 5 (this task) removes both together: Task
  // 2's migration guarantees no stored workout can carry a `wu` step by
  // the time any client fetches it (spec §6's ordering — migrations run at
  // server boot, before the api serves a request), so the branch this test
  // guarded is no longer reachable by anything, and `Step` itself has had
  // no `wu` member since Task 1.
  it("gives a rest step an accessible name built from the spoken duration", () => {
    renderStep(
      <StepRow
        step={{ k: "r", minutes: 2.5 }}
        baselines={null}
        nudge={0}
        onNudge={() => {}}
      />,
    );
    expect(screen.getByText("2:30")).toHaveAccessibleName(
      "2 minutes 30 seconds",
    );
  });

  // Realistic fixture: "Pressure Ridge" (app/server/seed/library/at.ts) — a
  // real seeded AT workout's work step: 3' at 6k+2, 23 spm, 1' rest between
  // reps. Exercises the composed left-hand label ("3:00 @ 6k +2") together
  // with the rest sub-line, both from real production data rather than a
  // hand-built minimal fixture.
  //
  // Pace text is "6k +4" (space, domain/pace.ts's refLabel), not the old
  // "6k+4" — this component used to carry its own private refLabel (Task 1's
  // interim guard) that formatted split refs without the space; Task 5
  // deletes it in favour of the domain's refLabel, which is what the builder
  // (StepCard.tsx, builderState.ts) already renders, so the two surfaces
  // agree on one format.
  it("renders a real seeded work step's composed duration+pace label with a spoken accessible name", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "6k", off: 2 },
          spm: 23,
          restMinutes: 1,
        }}
        baselines={BASELINES}
        nudge={0}
        onNudge={vi.fn()}
      />,
    );

    const label = screen.getByText("3:00 @ 6k +2");
    expect(label).toHaveAccessibleName("3 minutes at 6k +2");
    expect(screen.getByText(/23 spm/)).toBeInTheDocument();
    expect(screen.getByText(/1:00 rest/)).toBeInTheDocument();
  });

  // Ui-fix round, Item 1: the target sits as the single exact resolved
  // split — never a "lo–hi" tolerance band (this component no longer even
  // takes a tolerance prop; StepRow.tsx's own toleranceRange call site was
  // deleted, not just fed a zero). 6k=122, off=4, nudge=0 -> 126 ->
  // fmtSplit(126) = "2:06.0".
  it("shows the exact resolved split, never a tolerance band", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { base: "6k", off: 4 },
        }}
        baselines={BASELINES}
        nudge={0}
        onNudge={() => {}}
      />,
    );

    expect(screen.getByText("2:06.0")).toBeInTheDocument();
    // No EN DASH (U+2013) anywhere — a band would render one.
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it("a nudge moves the exact split shown, still no band", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { base: "6k", off: 4 },
        }}
        baselines={BASELINES}
        nudge={-2}
        onNudge={() => {}}
      />,
    );

    // 122 + 4 - 2 = 124 -> "2:04.0".
    expect(screen.getByText("2:04.0")).toBeInTheDocument();
    expect(screen.queryByText("2:06.0")).not.toBeInTheDocument();
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });
});

describe("StepRow effort refs (Phase 5G)", () => {
  // Realistic fixture: "Fork Lightning" (app/server/seed/library/an.ts,
  // AN, effort-ref work steps). This is that workout's step verbatim — one
  // of the generated library's many effort-ref AN entries — so what a
  // reader actually sees on the detail screen for a seeded workout is
  // exactly what this asserts.
  //
  // Mixed workout proving words survive alongside the round's exact-split
  // rule (task brief): this same describe block's split-ref tests above
  // render a plain number, while every test here renders "ALL OUT"/"EASY" —
  // an effort ref is never coerced into a number or a bare dash.
  it("renders an effort step's word where the target sits, with no nudges", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 0.5 },
          ref: { effort: "max" },
          spm: 32,
          restMinutes: 1.25,
        }}
        baselines={BASELINES}
        nudge={0}
        onNudge={() => {}}
      />,
    );

    expect(screen.getByText("0:30 @ MAX")).toBeInTheDocument();
    expect(screen.getByText("ALL OUT")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /nudge/i }),
    ).not.toBeInTheDocument();
    // No tolerance range (EN DASH, U+2013) — a word needs no range either.
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it("speaks 'at max effort', not the ambiguous MAX chip word", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 0.5 },
          ref: { effort: "max" },
        }}
        baselines={BASELINES}
        nudge={0}
        onNudge={() => {}}
      />,
    );

    // The VISIBLE label still reads the chip word ("MAX") — only the
    // accessible name substitutes effort language (domain/pace.ts's
    // effortSpoken), matching the spec's own example verbatim.
    const label = screen.getByText("0:30 @ MAX");
    expect(label).toHaveAccessibleName("30 seconds at max effort");
    // The effort word itself ("ALL OUT") is plain visible text needing no
    // aria-label override — it is already words, not digits.
    expect(screen.getByText("ALL OUT")).toBeInTheDocument();
  });

  it("speaks 'easy', not 'at MIN' or the clumsy 'at easy'", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 0.5 },
          ref: { effort: "min" },
        }}
        baselines={BASELINES}
        nudge={0}
        onNudge={() => {}}
      />,
    );

    // "MIN" spoken aloud is indistinguishable from "minutes" — the exact
    // confusion the display-word pair exists to prevent — so the
    // accessible name drops the chip word entirely for the natural rowing
    // idiom ("30 seconds easy"), not "30 seconds at MIN" nor the
    // grammatically symmetric but clumsier "30 seconds at easy".
    const label = screen.getByText("0:30 @ MIN");
    expect(label).toHaveAccessibleName("30 seconds easy");
    expect(screen.getByText("EASY")).toBeInTheDocument();
  });

  it("renders an effort word even with no baselines set, unlike a split ref's no-target fallback", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 0.5 },
          ref: { effort: "max" },
        }}
        baselines={null}
        nudge={0}
        onNudge={() => {}}
      />,
    );

    expect(screen.getByText("ALL OUT")).toBeInTheDocument();
    expect(screen.queryByText("no target")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /nudge/i }),
    ).not.toBeInTheDocument();
  });
});
