import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import BaselineCard from "./BaselineCard";
import type { StartableWorkout } from "../session/useStartWorkout";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import {
  buildDraft,
  loadDraft,
  saveDraft,
  startDraft,
  type SessionDraft,
} from "../session/draft";
import { buildRun } from "../session/engine";
import { saveRun, type SessionRun } from "../session/run";

// Realistic fixtures (repo convention): the SAME two designated seed
// workouts the real server ships (server/seed/library/onboarding.ts),
// never a hand-built minimum — title/type/steps come straight from there,
// only `id` is test-assigned (the server generates a real one).
function onboardingWorkout(title: string, id: string): StartableWorkout {
  const w = ONBOARDING_LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing onboarding fixture: ${title}`);
  return { id, title: w.title, type: w.type, steps: w.steps };
}

const K6_WORKOUT = onboardingWorkout("First 6k", "id-first-6k");
const K2_WORKOUT = onboardingWorkout("First 2k", "id-first-2k");

// A completed-but-unlogged run for K6_WORKOUT — same fixture shape as
// WorkoutDetail.test.tsx's own `completedRunFor` (a JSON round-trip via
// saveRun/loadRun, not the raw built object). `null` baselines: this
// workout is effort-only and needs none (domain/needsBaselines.ts).
function completedRunFor(workout: StartableWorkout): SessionRun {
  const draft: SessionDraft = startDraft(buildDraft(workout));
  const now = new Date("2026-08-01T12:00:00.000Z");
  const built = buildRun(draft, null, now);
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt: new Date("2026-08-01T12:20:00.000Z").toISOString(),
  };
  return JSON.parse(JSON.stringify(run)) as SessionRun;
}

function LocationProbe() {
  const location = useLocation();
  return <p>PROBE path={location.pathname}</p>;
}

function renderCard(props: {
  k6Missing: boolean;
  k2Missing: boolean;
  k6Workout?: StartableWorkout;
  k2Workout?: StartableWorkout;
}) {
  // `"key" in props` rather than `?? K6_WORKOUT`: the defensive test below
  // passes `k6Workout: undefined` DELIBERATELY (a real absent-lookup), and
  // `undefined ?? K6_WORKOUT` would silently substitute the real fixture
  // right back in, defeating that exact test.
  const k6Workout = "k6Workout" in props ? props.k6Workout : K6_WORKOUT;
  const k2Workout = "k2Workout" in props ? props.k2Workout : K2_WORKOUT;
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route
          path="/today"
          element={
            <BaselineCard
              k6Missing={props.k6Missing}
              k2Missing={props.k2Missing}
              k6Workout={k6Workout}
              k2Workout={k2Workout}
            />
          }
        />
        <Route path="/session/confirm" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("BaselineCard", () => {
  it("both baselines missing: defaults to the 6k, with a 2K INSTEAD toggle", () => {
    renderCard({ k6Missing: true, k2Missing: true });

    expect(screen.getByText("SUGGESTED · SETS YOUR BASELINE")).toBeVisible();
    expect(screen.getByRole("heading", { name: "First 6k" })).toBeVisible();
    expect(screen.getByText("ABOUT 25 MIN")).toBeVisible();
    expect(
      screen.getByText("6K BASELINE · NOT SET · ROW IT HOW IT FEELS"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
    expect(screen.getByRole("button", { name: "2K INSTEAD" })).toBeVisible();
  });

  it("2K INSTEAD swaps the card to the 2k variant, and back via 6K INSTEAD", async () => {
    renderCard({ k6Missing: true, k2Missing: true });

    await userEvent.click(screen.getByRole("button", { name: "2K INSTEAD" }));
    expect(screen.getByRole("heading", { name: "First 2k" })).toBeVisible();
    expect(screen.getByText("ABOUT 8 MIN")).toBeVisible();
    expect(
      screen.getByText("2K BASELINE · NOT SET · ROW IT HOW IT FEELS"),
    ).toBeVisible();

    const back = screen.getByRole("button", { name: "6K INSTEAD" });
    await userEvent.click(back);
    expect(screen.getByRole("heading", { name: "First 6k" })).toBeVisible();
    expect(screen.getByRole("button", { name: "2K INSTEAD" })).toBeVisible();
  });

  it("only the 6k missing (2k already set): offers only the 6k, no toggle at all", () => {
    renderCard({ k6Missing: true, k2Missing: false });

    expect(screen.getByRole("heading", { name: "First 6k" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /INSTEAD/ }),
    ).not.toBeInTheDocument();
  });

  it("only the 2k missing (6k already set): offers only the 2k, no toggle at all", () => {
    renderCard({ k6Missing: false, k2Missing: true });

    expect(screen.getByRole("heading", { name: "First 2k" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /INSTEAD/ }),
    ).not.toBeInTheDocument();
  });

  it("Start with no stale session commits immediately, landing on Confirm", async () => {
    renderCard({ k6Missing: true, k2Missing: true });

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(
      await screen.findByText("PROBE path=/session/confirm"),
    ).toBeVisible();
  });

  it("an unlogged completed run stages the replace confirmation, naming it correctly", async () => {
    saveRun(completedRunFor(K6_WORKOUT));
    renderCard({ k6Missing: true, k2Missing: true });

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(
      screen.getByText(
        "You have an unlogged session. Starting a new one discards it.",
      ),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
  });

  it("Replace session, from the staged panel, still lands on Confirm", async () => {
    saveRun(completedRunFor(K6_WORKOUT));
    renderCard({ k6Missing: true, k2Missing: true });

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Replace session" }),
    );
    expect(
      await screen.findByText("PROBE path=/session/confirm"),
    ).toBeVisible();
  });

  it("an in-progress (started, not completed) draft for ANOTHER workout stages the in-progress confirmation", async () => {
    const inProgress = startDraft(
      buildDraft({
        id: "w-other",
        title: "Other Session",
        type: "AN",
        steps: [{ k: "wu", minutes: 5 }],
      }),
    );
    saveDraft(inProgress);
    renderCard({ k6Missing: true, k2Missing: true });

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(
      screen.getByText("A session is in progress. Replace it?"),
    ).toBeVisible();
    // First press must not have touched storage.
    expect(loadDraft()).toStrictEqual(inProgress);
  });

  it("shows an inline error and does not navigate when saving the draft fails (quota)", async () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    renderCard({ k6Missing: true, k2Missing: true });

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(
      screen.getByText("Couldn't start this session. Try again."),
    ).toBeVisible();
    expect(
      screen.queryByText("PROBE path=/session/confirm"),
    ).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("renders nothing when the needed designated workout isn't in the caller's library (defensive)", () => {
    const { container } = renderCard({
      k6Missing: true,
      k2Missing: true,
      k6Workout: undefined,
      k2Workout: undefined,
    });
    expect(container).toBeEmptyDOMElement();
  });
});
