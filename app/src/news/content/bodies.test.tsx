import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WorkoutTypesBody } from "./bodies/workoutTypes";
import { BaselinesBody } from "./bodies/baselines";
import { PickingAWorkoutBody } from "./bodies/pickingAWorkout";
import { PainScaleBody } from "./bodies/painScale";
import { YourFirstRowBody } from "./bodies/yourFirstRow";
import { ConnectTheMonitorBody } from "./bodies/connectTheMonitor";
import { PyramidFigure } from "./bodies/PyramidFigure";

describe("article body components", () => {
  it("WorkoutTypesBody renders with distinctive text, the sentence surviving intact across the inline O2 chip that now splits it", () => {
    // Wrapped in MemoryRouter: this body now carries a real `<Link>` (item I,
    // persona-review fix wave), which throws outside a router context.
    const { container } = render(
      <MemoryRouter>
        <WorkoutTypesBody />
      </MemoryRouter>,
    );
    const paragraphs = [...container.querySelectorAll("p")].map(
      (p) => p.textContent,
    );
    expect(
      paragraphs.some((text) =>
        text?.includes("Most of your metres should be O2 metres."),
      ),
    ).toBe(true);
  });

  it("WorkoutTypesBody's closing cross-link points at /news/picking-a-workout (item I)", () => {
    render(
      <MemoryRouter>
        <WorkoutTypesBody />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: "Picking a workout" }),
    ).toHaveAttribute("href", "/news/picking-a-workout");
  });

  it("BaselinesBody renders with distinctive text and reader-inset aside", () => {
    render(<BaselinesBody />);
    expect(
      screen.getByText(/A baseline is nothing more than the average split/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/IN THE APP · Your 6k baseline: 2:02.4/),
    ).toBeInTheDocument();
  });

  // ui-notes round, item 3: the two-baselines paragraph gains one sentence
  // pointing at the derivation offer (item 2) — word-exact per the brief,
  // James reviews the diff.
  it("BaselinesBody's two-baselines paragraph names the derivation offer (ui-notes round, item 3)", () => {
    render(<BaselinesBody />);
    expect(
      screen.getByText(
        /Keep both current and every workout in the library speaks your language\. If you've only rowed one, the editor can estimate the other from it until you row the real thing\./,
      ),
    ).toBeInTheDocument();
  });

  it("PickingAWorkoutBody renders with distinctive text", () => {
    // Wrapped in MemoryRouter: this body now carries a real `<Link>` (item J,
    // persona-review fix wave), which throws outside a router context.
    render(
      <MemoryRouter>
        <PickingAWorkoutBody />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        /Standing in front of a library of three hundred workouts/,
      ),
    ).toBeInTheDocument();
  });

  it("PickingAWorkoutBody's inline cross-link points at /news/pain-scale (item J)", () => {
    render(
      <MemoryRouter>
        <PickingAWorkoutBody />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: "pain from 1 to 5" }),
    ).toHaveAttribute("href", "/news/pain-scale");
  });

  it("PainScaleBody renders with distinctive text", () => {
    render(<PainScaleBody />);
    expect(
      screen.getByText(/You don't need a heart rate monitor to train well/),
    ).toBeInTheDocument();
  });

  it("PainScaleBody draws the sharp-pain boundary before the numbered levels (item K)", () => {
    render(<PainScaleBody />);
    expect(
      screen.getByText(/stop, and let it settle before you row again/),
    ).toBeInTheDocument();
  });

  it("YourFirstRowBody renders with distinctive text (Phase 6I Task 6)", () => {
    render(<YourFirstRowBody />);
    expect(
      screen.getByText(
        /the average split you can hold for six thousand metres/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/your average split is on the summary screen and/),
    ).toBeInTheDocument();
  });

  // ui-notes round, item 3: the "Prefer the short test?" paragraph is
  // REPLACED in full — word-exact per the brief, James reviews the diff.
  // Pinned here so a future edit can't silently drift back toward the old
  // "the app wants both eventually" white lie the brief's root-cause names.
  it("YourFirstRowBody's replaced 'Prefer the short test?' paragraph names the derivation offer and the honest unset option (ui-notes round, item 3)", () => {
    render(<YourFirstRowBody />);
    expect(
      screen.getByText(
        /The app uses both baselines eventually: short, sharp workouts key off your 2k, longer ones off your 6k\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /After\s+your first row, the baselines editor can estimate the one you haven't/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /or\s+you can leave it unset and row the real test when you're ready\./,
      ),
    ).toBeInTheDocument();
  });

  it("ConnectTheMonitorBody renders with distinctive text (Phase 6I Task 6)", () => {
    render(<ConnectTheMonitorBody />);
    expect(
      screen.getByText(/Every workout in this app can run two ways/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Intervals advance themselves, rest counts itself/),
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
