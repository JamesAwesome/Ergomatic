import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
import type { WorkoutType } from "../../domain/types.js";
import RunPlaceholder from "./RunPlaceholder";
import { buildDraft, saveDraft } from "./draft";

// Realistic fixture, matching draft.test.ts/ConfirmTargets.test.tsx: Doldrums
// (wu + a reps marker + one split-ref work step) — 3 raw steps, so the
// removed-step tests below have real headroom to shrink the effective count.
function doldrumsDraft(id = "id-doldrums") {
  const w = STARTER_WORKOUTS.find((s) => s.title === "Doldrums");
  if (!w) throw new Error("missing starter fixture: Doldrums");
  return buildDraft({
    id,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
}

async function renderRun() {
  return render(
    <MemoryRouter initialEntries={["/session/run"]}>
      <Routes>
        <Route path="/session/run" element={<RunPlaceholder />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("RunPlaceholder", () => {
  it("redirects to /today when there is no draft", async () => {
    await renderRun();

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("renders the draft's title, the effective step count, and the 6B note", async () => {
    saveDraft(doldrumsDraft());
    await renderRun();

    expect(
      screen.getByRole("heading", { name: "Doldrums" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 steps")).toBeInTheDocument();
    expect(screen.getByText("6B builds the timer here.")).toBeInTheDocument();
  });

  it("excludes removed steps from the effective count", async () => {
    const draft = doldrumsDraft();
    saveDraft({ ...draft, removed: [0] });
    await renderRun();

    expect(screen.getByText("2 steps")).toBeInTheDocument();
  });

  it('uses the singular "step" when only one step remains', async () => {
    const draft = doldrumsDraft();
    saveDraft({ ...draft, removed: [0, 1] });
    await renderRun();

    expect(screen.getByText("1 step")).toBeInTheDocument();
    expect(screen.queryByText("1 steps")).not.toBeInTheDocument();
  });

  it("reads the draft fresh from storage on every mount (reload-safe)", async () => {
    saveDraft(doldrumsDraft());
    const { unmount } = await renderRun();
    expect(
      screen.getByRole("heading", { name: "Doldrums" }),
    ).toBeInTheDocument();

    unmount();
    await renderRun();

    expect(
      screen.getByRole("heading", { name: "Doldrums" }),
    ).toBeInTheDocument();
  });
});
