import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WorkoutTypesBody } from "./bodies/workoutTypes";
import { BaselinesBody } from "./bodies/baselines";
import { PickingAWorkoutBody } from "./bodies/pickingAWorkout";
import { PainScaleBody } from "./bodies/painScale";
import { PyramidFigure } from "./bodies/PyramidFigure";

describe("article body components", () => {
  it("WorkoutTypesBody renders with distinctive text, the sentence surviving intact across the inline O2 chip that now splits it", () => {
    const { container } = render(<WorkoutTypesBody />);
    const paragraphs = [...container.querySelectorAll("p")].map(
      (p) => p.textContent,
    );
    expect(
      paragraphs.some((text) =>
        text?.includes("Most of your metres should be O2 metres."),
      ),
    ).toBe(true);
  });

  it("BaselinesBody renders with distinctive text and reader-inset aside", () => {
    render(<BaselinesBody />);
    expect(
      screen.getByText(/A baseline is nothing more than the average split/),
    ).toBeInTheDocument();
    expect(screen.getByText(/IN THE APP · 6K 2:02.4/)).toBeInTheDocument();
  });

  it("PickingAWorkoutBody renders with distinctive text", () => {
    render(<PickingAWorkoutBody />);
    expect(
      screen.getByText(
        /Standing in front of a library of three hundred workouts/,
      ),
    ).toBeInTheDocument();
  });

  it("PainScaleBody renders with distinctive text", () => {
    render(<PainScaleBody />);
    expect(
      screen.getByText(/You don't need a heart rate monitor to train well/),
    ).toBeInTheDocument();
  });
});

describe("PyramidFigure (item 5)", () => {
  it("renders as an img with an accessible name describing all four bands, and carries every band's own label text", () => {
    render(<PyramidFigure />);

    const figure = screen.getByRole("img", {
      name: /wide O2 general endurance base carries an AT threshold band, a TR hard intervals band, and a small AN speed tip/,
    });
    expect(figure).toBeInTheDocument();
    expect(figure.tagName.toLowerCase()).toBe("svg");

    for (const label of ["AN", "TR", "AT", "O2"]) {
      expect(screen.getByText(label, { selector: "text" })).toBeInTheDocument();
    }
  });
});
