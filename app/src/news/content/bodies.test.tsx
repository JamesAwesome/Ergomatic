import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { WorkoutTypesBody } from "./bodies/workoutTypes";
import { BaselinesBody } from "./bodies/baselines";
import { PickingAWorkoutBody } from "./bodies/pickingAWorkout";
import { PainScaleBody } from "./bodies/painScale";
import { YourFirstRowBody } from "./bodies/yourFirstRow";
import { NotationBody } from "./bodies/notation";
import { LIBRARY_EXAMPLES } from "./bodies/notationExamples";
import { structureLine } from "../../../domain/display/stepDetail.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index.js";
import { ConnectTheMonitorBody } from "./bodies/connectTheMonitor";
import { PyramidFigure } from "./bodies/PyramidFigure";

describe("article body components", () => {
  it("WorkoutTypesBody renders with distinctive text, the sentence surviving intact across the inline O2 chip that now splits it", () => {
    // Wrapped in MemoryRouter: this body carries an `ArticleLink` (item I,
    // persona-review fix wave; ArticleLink itself since the crosslink
    // round), which calls `useLocation`/renders a `Link` and so throws
    // outside a router context.
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
    // Wrapped in MemoryRouter: this body carries an `ArticleLink` (item J,
    // persona-review fix wave; ArticleLink itself since the crosslink
    // round), which calls `useLocation`/renders a `Link` and so throws
    // outside a router context.
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

  it("YourFirstRowBody tells the three-door truth (Phase BL PR C): three ways in, and the post-save offer does the writing", () => {
    render(<YourFirstRowBody />);
    expect(screen.getByText(/Today offers three doors in/)).toBeInTheDocument();
    // The write is the OFFER's, post-save — the pre-BL "enter it under
    // You" instruction (a shipped lie about an automatic write that never
    // existed, then a manual chore) is gone.
    expect(
      screen.getByText(
        /the app offers your measured\s+average split as the new baseline/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Enter it under You/)).not.toBeInTheDocument();
  });

  it("YourFirstRowBody carries the strong-and-steady 6k framing (James's ruling) with the not-breakneck reminder, and the all-out 2k", () => {
    render(<YourFirstRowBody />);
    expect(
      screen.getByText(/a strong, steady 6k, or an all-out 2k/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not supposed to go at\s+breakneck speed/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/relaxed/i)).not.toBeInTheDocument();
  });

  // ui-notes round, item 3's honesty survives the PR C rewrite: the
  // derivation is an OFFER, leaving a side unset stays legitimate, and
  // the both-eventually sentence keeps its word-exact form.
  it("YourFirstRowBody still names the derivation offer, the honest unset option, and that declining records the test", () => {
    render(<YourFirstRowBody />);
    expect(
      screen.getByText(
        /The\s+app uses both baselines eventually: short, sharp workouts key off\s+your 2k, longer ones off your 6k\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/leave that side unset\s+and row the real test/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Decline the offer and\s+nothing is lost: the test is still recorded/,
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

describe("article body cross-links carry the reading chain's origin (crosslink round)", () => {
  it("no body source imports react-router-dom directly — ArticleLink is the only door an article body may use to link to another article (the pinned defect: a raw Link in a body is how the origin died before)", () => {
    // A SOURCE SWEEP, via Vite's own `?raw` glob (SheetShell.test.tsx's own
    // idiom) rather than a directory walk — the client tsconfig carries no
    // `@types/node`, so this needs no new ambient type at all.
    const sources = import.meta.glob("./bodies/*.tsx", {
      eager: true,
      query: "?raw",
      import: "default",
    }) as Record<string, string>;

    // Six bodies exist today (registry order: workoutTypes, baselines,
    // pickingAWorkout, painScale, yourFirstRow, connectTheMonitor) plus
    // PyramidFigure — asserting the glob found files at all keeps this test
    // from silently passing on an empty match if the path ever drifts.
    const files = Object.keys(sources);
    expect(files.length).toBeGreaterThan(0);

    for (const [file, text] of Object.entries(sources)) {
      expect(
        text,
        `${file} must not import react-router-dom directly`,
      ).not.toContain("react-router-dom");
    }
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

describe("NotationBody's library examples (drift pins)", () => {
  // The article decodes four REAL library rows. The library regenerates
  // from time to time (Phase CL's rebalance retuned 93 workouts), and an
  // example that drifts from what the Library actually shows teaches a
  // lie. Each pin recomputes the line from the live seed through the
  // same structureLine the Library row renders with — a failing case
  // here means the ARTICLE needs its example (and its decode prose)
  // updated, not that the code is wrong.
  it("every LIBRARY_EXAMPLES entry names a real workout and quotes its exact structure line", () => {
    for (const ex of LIBRARY_EXAMPLES) {
      const workout = LIBRARY_WORKOUTS.find((w) => w.title === ex.title);
      expect(
        workout,
        `"${ex.title}" is no longer in the library`,
      ).toBeDefined();
      expect(
        structureLine(workout!.steps),
        `"${ex.title}"'s line drifted — update the article's example and decode prose`,
      ).toBe(ex.line);
    }
  });

  it("the rendered body shows all four example lines verbatim", () => {
    render(
      <MemoryRouter>
        <NotationBody />
      </MemoryRouter>,
    );
    for (const ex of LIBRARY_EXAMPLES) {
      expect(
        screen.getByText(
          new RegExp(ex.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        ),
      ).toBeInTheDocument();
    }
  });
});
