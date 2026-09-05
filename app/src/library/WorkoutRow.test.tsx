import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import WorkoutRow from "./WorkoutRow";

/** Builds a renderable LibraryWorkout from a real seed entry by title
 *  (task-3 brief: "pick one per format from the seeds"), rather than
 *  hand-building steps — the recurring-fixture-defect history (CLAUDE.md
 *  item 3) is exactly a hand-built/empty fixture passing while the real
 *  300-workout library exposes a defect a synthetic case never would. */
function fromSeed(
  title: string,
  overrides: Partial<LibraryWorkout> = {},
): LibraryWorkout {
  const seed = LIBRARY_WORKOUTS.find((w) => w.title === title);
  if (!seed) throw new Error(`no seed workout titled "${title}"`);
  return {
    id: `w-${title}`,
    title: seed.title,
    type: seed.type,
    difficulty: seed.difficulty,
    pain: seed.pain,
    steps: seed.steps,
    isGlobal: true,
    lastDoneDaysAgo: null,
    ...overrides,
  };
}

// Real seeded workout ("Hoarfrost", app/server/seed/library/o2.ts) —
// WorkoutRow doesn't compute duration itself (that's Library.tsx's job, via
// estimateMinutes), so its `steps` don't drive this test directly, but
// using a real library entry rather than a hand-built stub keeps the
// fixture honest per this repo's recurring-fixture-defect history.
const HOARFROST: LibraryWorkout = {
  id: "w-hoarfrost",
  title: "Hoarfrost",
  type: "O2",
  difficulty: "easy",
  pain: 2,
  steps: [
    { k: "reps", count: 2 },
    {
      k: "w",
      duration: { kind: "time", minutes: 12 },
      ref: { base: "6k", off: 12 },
      spm: 19,
      restMinutes: 3,
    },
  ],
  isGlobal: true,
  lastDoneDaysAgo: 5,
};

describe("WorkoutRow", () => {
  // This is the guard `Library.tsx`'s own render path can never exercise:
  // `estimateMinutes` (domain/expand.ts) already rounds internally, so a
  // fractional value never reaches WorkoutRow through that caller. Phase 6
  // adds distance-based estimation that may produce fractions, so the
  // component itself must not print one — hence rendering WorkoutRow
  // directly with a fractional prop rather than going through Library.
  it("rounds a fractional duration down at .25 rather than printing 2.25′", () => {
    render(
      <MemoryRouter>
        <WorkoutRow workout={HOARFROST} durationMinutes={2.25} />
      </MemoryRouter>,
    );

    expect(screen.getByText("2′")).toBeInTheDocument();
    expect(screen.queryByText("2.25′")).not.toBeInTheDocument();
  });

  it("rounds a fractional duration up at .5 (Math.round is half-up)", () => {
    render(
      <MemoryRouter>
        <WorkoutRow workout={HOARFROST} durationMinutes={2.5} />
      </MemoryRouter>,
    );

    expect(screen.getByText("3′")).toBeInTheDocument();
    expect(screen.queryByText("2.5′")).not.toBeInTheDocument();
  });

  it("renders a — fallback when duration is unknown", () => {
    render(
      <MemoryRouter>
        <WorkoutRow workout={HOARFROST} durationMinutes={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  describe("custom badge", () => {
    const CUSTOM: LibraryWorkout = {
      ...HOARFROST,
      id: "w-custom",
      isGlobal: false,
    };

    it("renders the CUSTOM badge for a non-global workout", () => {
      render(
        <MemoryRouter>
          <WorkoutRow workout={CUSTOM} durationMinutes={20} />
        </MemoryRouter>,
      );

      expect(screen.getByText("MY WORKOUTS")).toBeInTheDocument();
    });

    it("omits the CUSTOM badge for a real seeded library workout", () => {
      render(
        <MemoryRouter>
          <WorkoutRow workout={HOARFROST} durationMinutes={20} />
        </MemoryRouter>,
      );

      expect(screen.queryByText("MY WORKOUTS")).not.toBeInTheDocument();
    });

    it("adds ', one of my workouts' to the row's accessible name only for the rower's own workouts", () => {
      const { rerender } = render(
        <MemoryRouter>
          <WorkoutRow workout={HOARFROST} durationMinutes={20} />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link")).not.toHaveAccessibleName(
        /, one of my workouts/,
      );

      rerender(
        <MemoryRouter>
          <WorkoutRow workout={CUSTOM} durationMinutes={20} />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link")).toHaveAccessibleName(
        /, one of my workouts/,
      );
    });
  });

  // Same "prove the navigation, not the prop" idiom Today/Library's own
  // probe-route tests use — the fix this task round is for depends on this
  // Link carrying an origin the detail screen's own BackLink can read back.
  it("stamps state={from:'/library'} onto the row link", async () => {
    function LocationProbe() {
      const location = useLocation();
      const from = (location.state as { from?: unknown } | null)?.from;
      return <p>PROBE from={String(from)}</p>;
    }
    render(
      <MemoryRouter initialEntries={["/library"]}>
        <Routes>
          <Route
            path="/library"
            element={<WorkoutRow workout={HOARFROST} durationMinutes={20} />}
          />
          <Route path="/library/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("link"));
    expect(await screen.findByText("PROBE from=/library")).toBeVisible();
  });
});

// Task 3 (workout-step-detail): line 2 of 3, `structureLine(workout.steps)`
// (app/domain/display/stepDetail.ts, Task 1). Renders for EVERY row
// regardless of baselines — the function takes none — so the assertions
// below hold with durationMinutes both a number and null (Library.tsx
// passes null whenever the signed-in user has no baselines set, exactly
// the HOARFROST case below). Expected strings are hand-computed against
// structureLine's own precedence rules (see task-3-report.md), not
// produced by calling structureLine itself — a self-check would pass even
// if WorkoutRow stopped calling the real function and hardcoded its own
// wrong string that happened to match a stale expectation.
describe("structure line (line 2 of 3)", () => {
  it("shows the verbatim line for a real single-piece workout (format 1)", () => {
    // "Fine Weather" (server/seed/library/o2.ts): one 45:00 piece at
    // 6k+12, no rest — no reps marker, no chain.
    render(
      <MemoryRouter>
        <WorkoutRow workout={fromSeed("Fine Weather")} durationMinutes={45} />
      </MemoryRouter>,
    );

    expect(screen.getByText("45:00 @ 6K+12")).toBeInTheDocument();
  });

  it("shows the verbatim line for a real uniform-repeat workout (format 2)", () => {
    // "Sea Fret" (server/seed/library/o2.ts): 2×4:00 at 6k+12, 1' rest,
    // authored via the reps marker.
    render(
      <MemoryRouter>
        <WorkoutRow workout={fromSeed("Sea Fret")} durationMinutes={9} />
      </MemoryRouter>,
    );

    expect(screen.getByText("2 × 4:00 @ 6K+12 · 1′ REST")).toBeInTheDocument();
  });

  it("shows the verbatim line for a real chained workout (format 4)", () => {
    // "Millpond" (server/seed/library/o2.ts): 2-3-4-3-2 minutes, all at
    // 6k+12, 1' interior rest, no trailing rest on the last piece —
    // authored as five distinct "w" steps, no reps marker.
    render(
      <MemoryRouter>
        <WorkoutRow workout={fromSeed("Millpond")} durationMinutes={18} />
      </MemoryRouter>,
    );

    expect(screen.getByText("2-3-4-3-2 @ 6K+12 · 1′ REST")).toBeInTheDocument();
  });

  it("shows the verbatim line for a real workout whose pieces move through a RANGE of offsets — the base is named on the slow end (format 4 + offsetRange)", () => {
    // "Ground Fog" (server/seed/library/o2.ts): 4-6-8-6-4 minutes at
    // 6k+12/+11/+10/+11/+12, 1' interior rest. Before James's 2026-08-14
    // ruling this row read "4-6-8-6-4 @ +12 → +10 · 1′ REST" and named no
    // baseline at all — 94 of the 300 seeded lines were that shape, and a
    // rower cannot tell a 2k workout from a 6k one without it.
    render(
      <MemoryRouter>
        <WorkoutRow workout={fromSeed("Ground Fog")} durationMinutes={32} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("4-6-8-6-4 @ 6K+12 → +10 · 1′ REST"),
    ).toBeInTheDocument();
  });

  it("still shows the line when durationMinutes is null (no baselines set)", () => {
    // HOARFROST above: 2×12:00 at 6k+12, 3' rest — same reps-marker shape
    // as "Sea Fret". Library.tsx passes durationMinutes={null} for every
    // row exactly when the signed-in user has no baselines yet
    // (Library.tsx:337-343) — structureLine must not gate on that.
    render(
      <MemoryRouter>
        <WorkoutRow workout={HOARFROST} durationMinutes={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText("2 × 12:00 @ 6K+12 · 3′ REST")).toBeInTheDocument();
    // and the row's OWN duration fallback still renders alongside it —
    // proves the structure line isn't secretly swallowing/replacing the
    // existing line 1 duration slot.
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("index.css: .workout-row-structure carries the ellipsis contract", () => {
  it("is single-line, IBM Plex Mono 11px, --ink-2, with overflow hidden + ellipsis + nowrap", () => {
    // jsdom never loads index.css as real stylesheet rules (no browser
    // layout engine backs getComputedStyle here — TimerTargets.test.tsx's
    // own comment documents the same empirically-verified limitation), so
    // this reads the CSS source text straight off disk (node:fs, not an
    // ESM import: Vitest mocks every .css import to an empty string for
    // this project) rather than rendering and measuring. 15 real library
    // workouts produce lines up to 101 chars (task-3 brief) — ellipsis is
    // the only handling, so these three properties are the structural
    // contract, not decoration.
    const indexCssPath = import.meta.url
      .replace(/^file:\/\//, "")
      .replace(/library\/[^/]+\.test\.tsx$/, "index.css");
    const indexCss = readFileSync(indexCssPath, "utf-8");
    const match = /\.workout-row-structure\s*\{([^}]*)\}/.exec(indexCss);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toContain("var(--font-mono)");
    expect(body).toContain("11px");
    expect(body).toContain("var(--ink-2)");
    expect(body).toContain("overflow: hidden");
    expect(body).toContain("text-overflow: ellipsis");
    expect(body).toContain("white-space: nowrap");
  });
});
