import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { api } from "../api";
import { buildDraft, loadDraft, saveDraft, startDraft } from "../session/draft";

// 6k baseline 2:02.0 (122s); off -2 -> 120s target; distance step reads its
// meters, never an estimated duration.
const WORKOUT: LibraryWorkout = {
  id: "w1",
  title: "Ladder Sets",
  type: "AT",
  difficulty: "medium",
  pain: 3,
  steps: [
    { k: "wu", minutes: 10 },
    {
      k: "w",
      duration: { kind: "time", minutes: 5 },
      ref: { base: "6k", off: -2 },
      spm: 22,
    },
    {
      k: "w",
      duration: { kind: "distance", meters: 2500 },
      ref: { base: "2k", off: -4 },
      restMinutes: 2,
    },
    { k: "r", minutes: 3 },
    { k: "test", label: "2k test" },
  ],
  isGlobal: true,
  lastDoneDaysAgo: 12,
};

// A repeat-block workout for the handoff's nudge model: one raw "reps"
// marker step governs everything after it, so the block is nudged once
// rather than per-repetition. 2k baseline 1:52.0 (112s); off 0 -> 112s
// target; tolerance 1 -> 1:51.0-1:53.0. Its work step sits at raw index 1
// — the SAME index as WORKOUT's first nudgeable work step — so the
// per-workout scoping test below actually exercises the bug (stale nudge
// state reappearing at a matching index) rather than passing by
// coincidence.
const WORKOUT_WITH_REPS: LibraryWorkout = {
  id: "w2",
  title: "Rep City",
  type: "AN",
  difficulty: "hard",
  pain: 4,
  steps: [
    { k: "reps", count: 4 },
    {
      k: "w",
      duration: { kind: "time", minutes: 1 },
      ref: { base: "2k", off: 0 },
    },
  ],
  isGlobal: true,
  lastDoneDaysAgo: null,
};

// A personal (non-global) workout, otherwise identical in shape to
// WORKOUT_WITH_REPS's simplicity — used to exercise the Edit/Delete
// affordances that only a workout's owner is allowed to see (the server
// 403s a global workout's mutations, so the UI must never offer them).
const PERSONAL_WORKOUT: LibraryWorkout = {
  id: "w3",
  title: "My Own Session",
  type: "O2",
  difficulty: "easy",
  pain: 2,
  steps: [
    {
      k: "w",
      duration: { kind: "time", minutes: 20 },
      ref: { base: "2k", off: 10 },
    },
  ],
  isGlobal: false,
  lastDoneDaysAgo: null,
};

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

// Typed against the real `api` signature (matching Builder.test.tsx's
// helper) so `.mock.calls` carry the real `[path, RequestInit]` shape.
function mockApi(handler: () => Response) {
  const fn = vi.fn<typeof api>(async () => handler());
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

function mockHooks(
  baselines: { k2Seconds: number | null; k6Seconds: number | null },
  workouts: LibraryWorkout[] = [WORKOUT],
) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines }),
  }));
}

async function renderDetail(initialPath = "/library/w1") {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Renders WorkoutDetail alongside sibling links to other /library/:id
// paths, all matched by the SAME <Route>, so clicking one changes just the
// :id param rather than unmounting/remounting the route element — the
// exact shape of the "no key on the route" scoping bug (finding 2).
async function renderWithSiblingLinks(initialPath: string) {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/library/:id"
          element={
            <>
              <WorkoutDetail />
              <Link to="/library/w1">Go to w1</Link>
              <Link to="/library/w2">Go to w2</Link>
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// Renders WorkoutDetail alongside a real /library route (rather than just
// asserting a navigate() call), so the delete-then-redirect test proves the
// actual route change rather than a mocked useNavigate call.
async function renderDetailWithLibraryRoute(initialPath: string) {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
        <Route path="/library" element={<p>LIBRARY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Renders WorkoutDetail alongside a real /session/confirm route (rather
// than just asserting a navigate() call), so the Start test proves the
// actual route change — and that a real draft is sitting in localStorage
// when it lands — rather than a mocked useNavigate call.
async function renderDetailWithConfirmRoute(initialPath: string) {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
        <Route path="/session/confirm" element={<p>CONFIRM SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("WorkoutDetail", () => {
  it("resolves a work step's target against real baselines into a tolerance range", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    // Hardcoded expectation (EN DASH, U+2013) — not recomputed via
    // resolveSplit/toleranceRange, which would make this tautological.
    expect(screen.getByText("1:59.0–2:01.0")).toBeInTheDocument();
  });

  it("shifts the resolved range one second faster after a single ▲ (faster) nudge", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Nudge faster" })[0]!,
    );

    expect(screen.getByText("1:58.0–2:00.0")).toBeInTheDocument();
    expect(screen.getByText(/nudged −1s/)).toBeInTheDocument();
  });

  it("labels a single ▼ (slower) press from neutral as a +1s nudge", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Nudge slower" })[0]!,
    );

    expect(screen.getByText(/nudged \+1s/)).toBeInTheDocument();
    // Hardcoded expectation (EN DASH, U+2013) — not recomputed via
    // resolveSplit/toleranceRange, which would make this tautological.
    expect(screen.getByText("2:00.0–2:02.0")).toBeInTheDocument();
  });

  it("shows the step's stroke rate in the sub-line", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByText(/22 spm/)).toBeInTheDocument();
  });

  it("shows the difficulty in the meta line with no catalogue number", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
    expect(screen.queryByText(/NO\.\s*\d+/i)).not.toBeInTheDocument();
  });

  it("renders a distance step's meters, never an estimated minute count", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByText(/2500 m/)).toBeInTheDocument();
  });

  it("renders the italic no-target state with a link to set baselines when both are unset", async () => {
    mockHooks({ k2Seconds: null, k6Seconds: null });
    await renderDetail();

    const noTargets = screen.getAllByText("no target");
    expect(noTargets.length).toBeGreaterThan(0);
    expect(noTargets.every((el) => el.tagName === "EM")).toBe(true);
    expect(
      screen.getAllByRole("link", { name: /set baselines/i })[0],
    ).toHaveAttribute("href", "/you");
  });

  it("renders Log it after disabled — logging arrives in Phase 6C — but Start enabled", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByRole("button", { name: "Start" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Log it after" })).toBeDisabled();
  });

  it("Start builds and saves the session draft, then navigates to /session/confirm", async () => {
    mockHooks(BASELINES);
    await renderDetailWithConfirmRoute("/library/w1");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("CONFIRM SCREEN")).toBeInTheDocument();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.workoutId).toBe("w1");
    expect(draft!.title).toBe("Ladder Sets");
    expect(draft!.type).toBe("AT");
    expect(draft!.steps).toStrictEqual(WORKOUT.steps);
    expect(draft!.startedAt).toBeNull();
  });

  it("deep-copies the workout's steps into the draft — mutating one never touches the other", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    const draft = loadDraft();
    expect(draft!.steps).not.toBe(WORKOUT.steps);
  });

  it("shows an inline error and does not navigate when saving the draft fails (quota)", async () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    mockHooks(BASELINES);
    await renderDetailWithConfirmRoute("/library/w1");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(
      screen.getByText("Couldn't start this session. Try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("CONFIRM SCREEN")).not.toBeInTheDocument();
    spy.mockRestore();
  });

  // F4 fix (final whole-branch review): a STARTED draft already sitting in
  // storage (a session in progress somewhere — this workout or another)
  // used to be overwritten silently the instant Start was pressed here.
  // The staged-confirm idiom (src/you/BaselineEditor.tsx, also copied by
  // this file's own OwnerActions delete flow) now gates the overwrite
  // behind an explicit second press.
  it("stages a replace confirmation instead of overwriting an in-progress draft on the first Start press", async () => {
    mockHooks(BASELINES);
    const inProgress = startDraft(
      buildDraft({
        id: "w-other",
        title: "Other Session",
        type: "AN",
        steps: [{ k: "wu", minutes: 5 }],
      }),
    );
    saveDraft(inProgress);
    await renderDetail();

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(
      screen.getByText("A session is in progress — replace it?"),
    ).toBeInTheDocument();
    // The first press must not have touched storage at all.
    expect(loadDraft()).toStrictEqual(inProgress);
  });

  it("Cancel on the replace confirmation leaves the in-progress draft untouched and restores Start", async () => {
    mockHooks(BASELINES);
    const inProgress = startDraft(
      buildDraft({
        id: "w-other",
        title: "Other Session",
        type: "AN",
        steps: [{ k: "wu", minutes: 5 }],
      }),
    );
    saveDraft(inProgress);
    await renderDetail();

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(
      screen.queryByText("A session is in progress — replace it?"),
    ).not.toBeInTheDocument();
    expect(loadDraft()).toStrictEqual(inProgress);
  });

  it("Replace session overwrites the in-progress draft and navigates to /session/confirm", async () => {
    mockHooks(BASELINES);
    const inProgress = startDraft(
      buildDraft({
        id: "w-other",
        title: "Other Session",
        type: "AN",
        steps: [{ k: "wu", minutes: 5 }],
      }),
    );
    saveDraft(inProgress);
    await renderDetailWithConfirmRoute("/library/w1");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Replace session" }),
    );

    expect(await screen.findByText("CONFIRM SCREEN")).toBeInTheDocument();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.workoutId).toBe("w1");
    expect(draft!.title).toBe("Ladder Sets");
    expect(draft!.startedAt).toBeNull(); // the new, un-started draft — not the old one
  });

  it("does not stage a replace confirmation when the existing draft was never started", async () => {
    mockHooks(BASELINES);
    const notStarted = buildDraft({
      id: "w-other",
      title: "Other Session",
      type: "AN",
      steps: [{ k: "wu", minutes: 5 }],
    });
    saveDraft(notStarted);
    await renderDetailWithConfirmRoute("/library/w1");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("CONFIRM SCREEN")).toBeInTheDocument();
    expect(
      screen.queryByText("A session is in progress — replace it?"),
    ).not.toBeInTheDocument();
  });

  it("exposes nudge buttons with accessible names and the 44px hit-target class", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    const faster = screen.getAllByRole("button", { name: "Nudge faster" })[0]!;
    const slower = screen.getAllByRole("button", { name: "Nudge slower" })[0]!;

    expect(faster).toHaveClass("nudge-btn");
    expect(slower).toHaveClass("nudge-btn");
  });

  it("shows a work step's between-sets rest duration in the sub-line, in house clock format", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByText(/2:00 rest/)).toBeInTheDocument();
    expect(screen.queryByText(/2′ rest/)).not.toBeInTheDocument();
  });

  it("renders a rest step's label and duration with no target range or nudge controls", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    const restRow = screen.getByText("Rest").closest(".step-row");
    expect(restRow).not.toBeNull();
    expect(
      within(restRow as HTMLElement).getByText("3:00"),
    ).toBeInTheDocument();
    expect(
      within(restRow as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
    // No target range (EN DASH, U+2013) renders in a rest row — resting has
    // no pace target to nudge.
    expect(
      within(restRow as HTMLElement).queryByText(/–/),
    ).not.toBeInTheDocument();
  });

  it("renders a test step's label with no target range or nudge controls", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    const testRow = screen.getByText("2k test").closest(".step-row");
    expect(testRow).not.toBeNull();
    expect(
      within(testRow as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
    // No target range (EN DASH, U+2013) renders in a test row — a test
    // step is all-out effort, not paced to a target.
    expect(
      within(testRow as HTMLElement).queryByText(/–/),
    ).not.toBeInTheDocument();
  });

  it("renders one marker row above a repeat block instead of expanding it per repetition", async () => {
    mockHooks(BASELINES, [WORKOUT, WORKOUT_WITH_REPS]);
    await renderDetail("/library/w2");

    // liveSteps() would have expanded this into 4 separate work rows; the
    // handoff's raw-step model renders the block once with a marker above
    // it, so there is exactly one range and exactly one pair of nudge
    // buttons for the whole 4x block.
    expect(screen.getByText("4× the block below")).toBeInTheDocument();
    expect(screen.getByText("1:51.0–1:53.0")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Nudge faster" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Nudge slower" }),
    ).toHaveLength(1);

    // The header expands via estimateMinutes (phases()/liveSteps(), which
    // DOES expand repeats), while the step list below renders the raw
    // authored steps (which does NOT) — a 4x block of a 1-minute work step
    // is 4 minutes of rowing even though it's a single row on screen.
    expect(screen.getByText("4 MIN", { exact: false })).toBeInTheDocument();

    // One nudge covers the whole block: clicking the single ▲ moves the
    // single displayed range, proving it's wired to the marker's raw
    // step, not silently a no-op or scoped to one repetition.
    await userEvent.click(screen.getByRole("button", { name: "Nudge faster" }));
    expect(screen.queryByText("1:51.0–1:53.0")).not.toBeInTheDocument();
    expect(screen.getByText("1:50.0–1:52.0")).toBeInTheDocument();
  });

  it("does not carry nudges from one workout to another when the route id changes without a component remount", async () => {
    mockHooks(BASELINES, [WORKOUT, WORKOUT_WITH_REPS]);
    await renderWithSiblingLinks("/library/w1");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Nudge slower" })[0]!,
    );
    expect(screen.getByText(/nudged \+1s/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Go to w2" }));

    // w2's step at the same raw index (its first work step) must render
    // its neutral, un-nudged range — not w1's leftover nudge re-applied by
    // index.
    expect(screen.queryByText(/nudged/)).not.toBeInTheDocument();
    expect(screen.getByText("1:51.0–1:53.0")).toBeInTheDocument();
  });

  it("clamps a long run of same-direction nudges at MIN_SPLIT instead of drifting into a nonsense split", async () => {
    mockHooks(BASELINES, [WORKOUT, WORKOUT_WITH_REPS]);
    await renderDetail("/library/w2");

    // 2k baseline is 112s; unclamped, 80 "faster" nudges would drive the
    // resolved split to 112 - 80 = 32s (and further presses toward
    // negative, where fmtSplit renders garbage like "-1:-1.0"). Clamped to
    // MIN_SPLIT (60s), it should stop dead at "0:59.0–1:01.0" (tolerance 1)
    // well before that.
    const faster = screen.getByRole("button", { name: "Nudge faster" });
    for (let i = 0; i < 80; i++) {
      await userEvent.click(faster);
    }

    expect(screen.getByText("0:59.0–1:01.0")).toBeInTheDocument();
  });

  it("renders Edit and Delete controls for a personal (non-global) workout", async () => {
    mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetail("/library/w3");

    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/library/w3/edit",
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("renders neither Edit nor Delete for a global workout, since the server 403s its mutations", async () => {
    mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [WORKOUT]);
    await renderDetail("/library/w1");

    expect(
      screen.queryByRole("link", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("asks for confirmation before deleting — the API is not called on the first Delete press", async () => {
    const api = mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetail("/library/w3");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(api).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Delete workout" }),
    ).toBeInTheDocument();
  });

  it("issues DELETE /api/workouts/:id once the confirmation is pressed", async () => {
    const api = mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetailWithLibraryRoute("/library/w3");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete workout" }),
    );

    expect(api).toHaveBeenCalledWith("/api/workouts/w3", { method: "DELETE" });
    expect(await screen.findByText("LIBRARY SCREEN")).toBeInTheDocument();
  });

  it("tells the rower their logged history survives in the delete confirmation copy", async () => {
    mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetail("/library/w3");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText(/logged sessions are kept/i)).toBeInTheDocument();
  });
});

describe("custom badge on the detail screen", () => {
  // Device report (2026-08-01): the 5H CUSTOM tag lived only in the library
  // list, so an opened custom workout showed nothing marking it yours.
  it("shows CUSTOM beside the type badge for a personal workout", async () => {
    await renderDetail("/library/w3"); // PERSONAL_WORKOUT, isGlobal: false
    expect(screen.getByText("CUSTOM")).toBeInTheDocument();
  });

  it("shows no CUSTOM tag for a seeded global workout", async () => {
    await renderDetail("/library/w1"); // WORKOUT, isGlobal: true
    expect(screen.queryByText("CUSTOM")).not.toBeInTheDocument();
  });
});
