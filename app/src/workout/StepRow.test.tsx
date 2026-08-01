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
        tolerance={1}
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
        tolerance={1}
        nudge={0}
        onNudge={() => {}}
      />,
    );
    expect(screen.getByText(/0:20/)).toBeInTheDocument();
  });

  it("gives a warm-up an accessible name a screen reader can say", () => {
    renderStep(
      <StepRow
        step={{ k: "wu", minutes: 65 }}
        baselines={null}
        tolerance={1}
        nudge={0}
        onNudge={() => {}}
      />,
    );
    expect(screen.getByText("1:05:00")).toHaveAccessibleName(
      "1 hour 5 minutes",
    );
  });

  it("gives a rest step an accessible name built from the spoken duration", () => {
    renderStep(
      <StepRow
        step={{ k: "r", minutes: 2.5 }}
        baselines={null}
        tolerance={1}
        nudge={0}
        onNudge={() => {}}
      />,
    );
    expect(screen.getByText("2:30")).toHaveAccessibleName(
      "2 minutes 30 seconds",
    );
  });

  // Realistic fixture: "Tailwind" (app/server/seed/starter.ts) — a real
  // seeded AT workout's work step: 5' at 6k+4, 23 spm, 2.5' rest between
  // reps. Exercises the composed left-hand label ("5:00 @ 6k +4") together
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
          duration: { kind: "time", minutes: 5 },
          ref: { base: "6k", off: 4 },
          spm: 23,
          restMinutes: 2.5,
        }}
        baselines={BASELINES}
        tolerance={1}
        nudge={0}
        onNudge={vi.fn()}
      />,
    );

    const label = screen.getByText("5:00 @ 6k +4");
    expect(label).toHaveAccessibleName("5 minutes at 6k +4");
    expect(screen.getByText(/23 spm/)).toBeInTheDocument();
    expect(screen.getByText(/2:30 rest/)).toBeInTheDocument();
  });
});

describe("StepRow effort refs (Phase 5G)", () => {
  // Realistic fixture: "Microburst" (app/server/seed/starter.ts, AN, 10x30s)
  // — its real work step (0.5 min, spm 32, 2.5 min rest) with the ref PATCHED
  // from { base: "2k", off: -5 } to an effort ref. No starter workout carries
  // an effort ref yet (Task 6 is the seed audit that may add one), so this is
  // the closest thing to production data available for this branch.
  it("renders an effort step's word where the range sits, with no nudges", () => {
    renderStep(
      <StepRow
        step={{
          k: "w",
          duration: { kind: "time", minutes: 0.5 },
          ref: { effort: "max" },
          spm: 32,
          restMinutes: 2.5,
        }}
        baselines={BASELINES}
        tolerance={1}
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
        tolerance={1}
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
        tolerance={1}
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
        tolerance={1}
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
