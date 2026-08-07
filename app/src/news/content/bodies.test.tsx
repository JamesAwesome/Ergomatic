import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WorkoutTypesBody } from "./bodies/workoutTypes";
import { BaselinesBody } from "./bodies/baselines";
import { PickingAWorkoutBody } from "./bodies/pickingAWorkout";
import { PainScaleBody } from "./bodies/painScale";

describe("article body components", () => {
  it("WorkoutTypesBody renders with distinctive text", () => {
    render(<WorkoutTypesBody />);
    expect(
      screen.getByText(/Most of your metres should be O2 metres/),
    ).toBeInTheDocument();
  });

  it("BaselinesBody renders with distinctive text and reader-inset aside", () => {
    render(<BaselinesBody />);
    expect(
      screen.getByText(/A baseline is nothing more than the average split/),
    ).toBeInTheDocument();
    expect(screen.getByText(/IN THE APP — 6K 2:02.4/)).toBeInTheDocument();
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
      screen.getByText(/You don't need a heart rate strap to train well/),
    ).toBeInTheDocument();
  });
});
