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
  // reps. Exercises the composed left-hand label ("5:00 @ 6k+4") together
  // with the rest sub-line, both from real production data rather than a
  // hand-built minimal fixture.
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

    const label = screen.getByText("5:00 @ 6k+4");
    expect(label).toHaveAccessibleName("5 minutes at 6k+4");
    expect(screen.getByText(/23 spm/)).toBeInTheDocument();
    expect(screen.getByText(/2:30 rest/)).toBeInTheDocument();
  });
});
