import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { api } from "../api";
import {
  buildDraft,
  loadDraft,
  saveDraft,
  startDraft,
  type SessionDraft,
} from "../session/draft";
import { buildRun } from "../session/engine";
import { loadRun, saveRun, type SessionRun } from "../session/run";
import {
  loadMonitorRun,
  saveMonitorRun,
  type MonitorRun,
} from "../monitor/monitorRun";
import { compileProgram } from "../../domain/monitor/program.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { WorkoutType } from "../../domain/types.js";
import type { WarmupSetting } from "../api/usePreferences";

// 6k baseline 2:02.0 (122s); off -2 -> 120s target; distance step reads its
// meters, never an estimated duration. (It opened with a `wu` row until
// 2026-08-09's warmup setting deleted that step kind — a real library
// workout carries none now, and the rower's own setting is prepended at
// `buildRun`.)
const WORKOUT: LibraryWorkout = {
  id: "w1",
  title: "Ladder Sets",
  type: "AT",
  difficulty: "medium",
  pain: 3,
  steps: [
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
// target, shown exact (ui-fix round). Its work step sits at raw index 1
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

// Phase 6I: an effort-only workout matching the shape Task 3 seeds for the
// two designated onboarding workouts (domain/onboarding.ts) — ONE distance
// work step at an effort ref, nothing else (no "test"/reps step, so
// `compileProgram` — exercised by the Connect describe block below — has
// no OTHER reason to refuse it; this fixture's whole point is isolating
// the baselines predicate). `needsBaselines()` reads false. It had a lead
// `wu` step until 2026-08-09's warmup setting, which the real onboarding
// seed no longer carries either.
const EFFORT_ONLY_WORKOUT: LibraryWorkout = {
  id: "w-effort",
  title: "Effort Only Row",
  type: "O2",
  difficulty: "easy",
  pain: 2,
  steps: [
    {
      k: "w",
      duration: { kind: "distance", meters: 6000 },
      ref: { effort: "min" },
    },
  ],
  isGlobal: true,
  lastDoneDaysAgo: null,
};

const NO_BASELINES = { k2Seconds: null, k6Seconds: null };

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

// A completed-but-unlogged run record for `draft` — the exact shape
// SessionComplete.tsx's own fixture builds (Phase 6B Task 4), constructed
// directly rather than driven through tick/advance (engine.test.ts and
// Timer.test.tsx already own proving that walk); this file's own job is
// WorkoutDetail's reaction to finding one sitting in storage, not deriving
// one. `startDraft`'s own timestamp doubles as the run's startedAt so the
// two agree, matching how a real session actually reaches this state (a
// run is only ever built from an already-started draft).
function completedRunFor(draft: SessionDraft): SessionRun {
  const now = new Date("2026-08-01T12:00:00.000Z");
  const built = buildRun(draft, BASELINES, now);
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt: new Date("2026-08-01T12:20:00.000Z").toISOString(),
  };
  // A JSON round-trip, not the raw object: `buildRun`'s own phases carry an
  // explicit `set: undefined` on every non-repeated phase (domain/expand.ts
  // stamps it unconditionally) — `JSON.stringify` drops undefined-valued
  // keys entirely, which is exactly what `saveRun`/`loadRun` do to this
  // object on every real round trip through localStorage. Comparing the
  // RAW built object against what `loadRun()` returns later would fail on
  // that key's mere presence, not on any actual data difference — same
  // "compare what storage will actually hand back" discipline as this
  // file's other fixtures.
  return JSON.parse(JSON.stringify(run)) as SessionRun;
}

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
  warmup: WarmupSetting | null = null,
  preferencesReady = true,
) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines }),
  }));
  // 2026-08-09's warmup setting: this screen reads `usePreferences` for
  // the CONNECT door's own `buildRun` call (design §9 — a connected
  // session prepends the rower's warm-up too). Mocked here for every test,
  // not just the Connect ones, so the hook's real fetch never reaches the
  // `api` spy several tests assert was never called. Defaults to OFF, the
  // production default.
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () =>
      preferencesReady
        ? {
            state: "ready",
            preferences: {
              difficulties: [],
              timeCapMinutes: 60,
              warmup,
              countdownSeconds: 10,
              startHereDismissed: true,
            },
          }
        : { state: "loading" },
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

// Renders `location.state.from` as plain text — the "prove the navigation,
// not the prop" idiom this task round's other probe-route tests all use.
function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return <p>PROBE from={String(from)}</p>;
}

// Renders WorkoutDetail with an initial history entry carrying `state` —
// the same `{pathname, state}` shape a real `<Link state={...}>` produces —
// alongside a `/library` route (BackLink's fallback/CTA target), a
// `/library/:id/edit` PROBE route, and a `/library/:id/log` PROBE route
// (must-fix minor, whole-branch review: "Log it after" forwards
// `state={{from}}` like the Edit link beside it), so BackLink's own target
// AND whatever either link forwards can be asserted against the ACTUAL
// origin received, not a bare pathname a plain string entry can't carry.
async function renderDetailWithState(pathname: string, state: unknown) {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
        <Route path="/library/:id/edit" element={<LocationProbe />} />
        <Route path="/library/:id/log" element={<LocationProbe />} />
        <Route path="/library" element={<p>LIBRARY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Renders WorkoutDetail alongside a real /session/countdown route (rather
// than just asserting a navigate() call), so the Start test proves the
// actual route change — and that a real draft is sitting in localStorage
// when it lands — rather than a mocked useNavigate call.
async function renderDetailWithCountdownRoute(initialPath: string) {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
        <Route path="/session/countdown" element={<p>COUNTDOWN SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Task 3: same "render alongside the real destination route" idiom as
// `renderDetailWithCountdownRoute` above, proving the Log it after link
// actually lands on `/library/:id/log`, not just that it carries the right
// `href`.
async function renderDetailWithLogRoute(initialPath: string) {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
        <Route path="/library/:id/log" element={<p>LOG SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("WorkoutDetail", () => {
  it("resolves a work step's target against real baselines into the exact split", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    // Hardcoded expectation — not recomputed via resolveSplit/fmtSplit,
    // which would make this tautological. Ui-fix round, Item 1: the exact
    // split, never a "lo–hi" tolerance band.
    expect(screen.getByText("2:00.0")).toBeInTheDocument();
  });

  it("shifts the resolved split one second faster after a single ▲ (faster) nudge", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Nudge faster" })[0]!,
    );

    expect(screen.getByText("1:59.0")).toBeInTheDocument();
    expect(screen.getByText(/nudged −1s/)).toBeInTheDocument();
  });

  it("labels a single ▼ (slower) press from neutral as a +1s nudge", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Nudge slower" })[0]!,
    );

    expect(screen.getByText(/nudged \+1s/)).toBeInTheDocument();
    // Hardcoded expectation — not recomputed via resolveSplit/fmtSplit,
    // which would make this tautological.
    expect(screen.getByText("2:01.0")).toBeInTheDocument();
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

  it("renders Log it after as a real, enabled link to /library/:id/log when baselines are set", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    expect(screen.getByRole("button", { name: "Start" })).not.toBeDisabled();
    const logItAfter = screen.getByRole("link", { name: "Log it after" });
    expect(logItAfter).toHaveAttribute("href", "/library/w1/log");
  });

  it("Log it after actually navigates to /library/:id/log", async () => {
    mockHooks(BASELINES);
    await renderDetailWithLogRoute("/library/w1");

    await userEvent.click(screen.getByRole("link", { name: "Log it after" }));

    expect(await screen.findByText("LOG SCREEN")).toBeInTheDocument();
  });

  // Phase 6I amendment: this test's fixture (the default WORKOUT) has a
  // split-ref work step — `needsBaselines()` reads true, so the gate below
  // still fires exactly as before this task. The sibling test right after
  // this one pins the OTHER branch the predicate now opens.
  it("Task 3 (the manual door): replaces Log it after with the no-target/Set baselines idiom when baselines are unset (split-ref workout)", async () => {
    mockHooks({ k2Seconds: null, k6Seconds: null });
    await renderDetail();

    // There is no "Log it after" control at all in this state — it's
    // replaced by the same no-target idiom the step rows use, not merely
    // disabled (buildManualLogSteps requires a concrete Baselines, so there
    // is nothing honest for this link to lead to yet).
    expect(
      screen.queryByRole("link", { name: "Log it after" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log it after" }),
    ).not.toBeInTheDocument();
    // At least one extra "no target" appears beyond the step rows' own —
    // the actions row's copy of the idiom.
    const noTargets = screen.getAllByText("no target");
    expect(noTargets.length).toBeGreaterThan(1);
  });

  // Phase 6I: `needsBaselines` (domain/needsBaselines.ts) is the single
  // predicate every coupled guard site shares — an effort-only workout's
  // "Log it after" link is no longer replaced by the no-target idiom just
  // because baselines happen to be unset, since there's nothing for it to
  // resolve against baselines at all.
  it("keeps Log it after as a real link for an effort-only workout even with baselines unset", async () => {
    mockHooks(NO_BASELINES, [EFFORT_ONLY_WORKOUT]);
    await renderDetail("/library/w-effort");

    const logItAfter = screen.getByRole("link", { name: "Log it after" });
    expect(logItAfter).toHaveAttribute("href", "/library/w-effort/log");
    // The step row's own "no target" never appears either — an effort ref
    // shows its effort word, unconditionally (StepRow's own established
    // rule, unaffected by this task).
    expect(screen.queryByText("no target")).not.toBeInTheDocument();
  });

  it("Start builds and saves a STARTED session draft, then navigates to /session/countdown", async () => {
    mockHooks(BASELINES);
    await renderDetailWithCountdownRoute("/library/w1");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.workoutId).toBe("w1");
    expect(draft!.title).toBe("Ladder Sets");
    expect(draft!.type).toBe("AT");
    expect(draft!.steps).toStrictEqual(WORKOUT.steps);
    // Fast-follow spec §3 (adversarial B1): every rewired entry point stamps
    // `startedAt` at this exact moment now that ConfirmTargets (the old
    // sole stamper) is gone.
    expect(draft!.startedAt).not.toBeNull();
  });

  // Phase 6I finding, now closed by fast-follow Task 4: WorkoutDetail's own
  // Start button used to never gate on baselines at all — ConfirmTargets'
  // own footer (`isStartBlocked`) was the ONE place that actually blocked
  // the split-ref case. That screen is gone; the SAME predicate
  // (`needsBaselines`) now lives on Start itself. This test pins the
  // branch it never blocks: an effort-only workout has nothing to resolve
  // against baselines at all, so Start stays enabled and reaches the
  // countdown directly.
  it("Start proceeds for an effort-only workout even with baselines unset — the guard's own predicate never blocks it", async () => {
    mockHooks(NO_BASELINES, [EFFORT_ONLY_WORKOUT]);
    await renderDetailWithCountdownRoute("/library/w-effort");

    expect(screen.getByRole("button", { name: "Start" })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.workoutId).toBe("w-effort");
  });

  // The split-ref regression companion — the branch the guard NOW blocks,
  // the exact gap fast-follow Task 4 closes (adversarial I1): before this
  // task, a split-ref workout's Start reached ConfirmTargets unconditionally
  // and relied on THAT screen's own footer to block it; that screen is
  // gone, so the block has to happen here or not at all.
  it("Start is disabled with a no-target caption for a split-ref workout when baselines are unset — the guard moved here", async () => {
    mockHooks(NO_BASELINES);
    await renderDetailWithCountdownRoute("/library/w1");

    const startButton = screen.getByRole("button", { name: "Start" });
    expect(startButton).toBeDisabled();
    expect(loadDraft()).toBeNull();
    // The caption sits immediately beside Start itself, not just anywhere
    // on the screen — the step rows and "Log it after" grow their own
    // "no target" idiom too, so this disambiguates THIS guard's own render
    // from theirs by DOM adjacency rather than counting matches.
    const caption = startButton.nextElementSibling as HTMLElement;
    expect(caption).toHaveTextContent(/no target/i);
    expect(
      within(caption).getByRole("link", { name: /set baselines/i }),
    ).toHaveAttribute("href", "/you");
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
    await renderDetailWithCountdownRoute("/library/w1");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(
      screen.getByText("Couldn't start this session. Try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("COUNTDOWN SCREEN")).not.toBeInTheDocument();
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
        steps: [{ k: "r", minutes: 5 }],
      }),
    );
    saveDraft(inProgress);
    await renderDetail();

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(
      screen.getByText("A session is in progress. Replace it?"),
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
        steps: [{ k: "r", minutes: 5 }],
      }),
    );
    saveDraft(inProgress);
    await renderDetail();

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(
      screen.queryByText("A session is in progress. Replace it?"),
    ).not.toBeInTheDocument();
    expect(loadDraft()).toStrictEqual(inProgress);
  });

  it("Replace session overwrites the in-progress draft and navigates to /session/countdown", async () => {
    mockHooks(BASELINES);
    const inProgress = startDraft(
      buildDraft({
        id: "w-other",
        title: "Other Session",
        type: "AN",
        steps: [{ k: "r", minutes: 5 }],
      }),
    );
    saveDraft(inProgress);
    await renderDetailWithCountdownRoute("/library/w1");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Replace session" }),
    );

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.workoutId).toBe("w1");
    expect(draft!.title).toBe("Ladder Sets");
    // The new draft, freshly started — not the old in-progress one.
    expect(draft!.startedAt).not.toBeNull();
  });

  it("does not stage a replace confirmation when the existing draft was never started", async () => {
    mockHooks(BASELINES);
    const notStarted = buildDraft({
      id: "w-other",
      title: "Other Session",
      type: "AN",
      steps: [{ k: "r", minutes: 5 }],
    });
    saveDraft(notStarted);
    await renderDetailWithCountdownRoute("/library/w1");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    expect(
      screen.queryByText("A session is in progress. Replace it?"),
    ).not.toBeInTheDocument();
  });

  // Fix round (whole-branch review, F5) — the actual finding: a rower
  // finishes session A (SessionComplete.tsx deliberately KEEPS its draft
  // and run record for 6C), doesn't log it, then opens a different
  // workout and taps Start. `handleStart`'s original F4 fix only ever
  // gated on the DRAFT's own `startedAt` — a completed draft still has
  // that set (nothing resets it), so the check technically fired, but with
  // the wrong copy ("in progress") for a session that's actually already
  // OVER; the real bug was one level down, in `startSession` silently
  // overwriting DRAFT_KEY with no warning that RUN_KEY still held a
  // finished, unlogged session about to become permanently unreachable.
  describe("a completed-but-unlogged run record from a PREVIOUS session", () => {
    function saveCompletedSessionA(): {
      draftA: SessionDraft;
      runA: SessionRun;
    } {
      const draftA = startDraft(
        buildDraft({
          id: "w-other",
          title: "Session A",
          type: "AN",
          steps: [{ k: "r", minutes: 5 }],
        }),
      );
      const runA = completedRunFor(draftA);
      saveDraft(draftA);
      saveRun(runA);
      return { draftA, runA };
    }

    it("stages a replace confirmation naming the unlogged session, not 'in progress'", async () => {
      mockHooks(BASELINES);
      const { draftA, runA } = saveCompletedSessionA();
      await renderDetail();

      await userEvent.click(screen.getByRole("button", { name: "Start" }));

      expect(
        screen.getByText(
          "You have an unlogged session. Starting a new one discards it.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("A session is in progress. Replace it?"),
      ).not.toBeInTheDocument();
      // The first press must not have touched storage at all.
      expect(loadDraft()).toStrictEqual(draftA);
      expect(loadRun()).toStrictEqual(runA);
    });

    it("Cancel leaves both the draft and run record intact, byte-identical", async () => {
      mockHooks(BASELINES);
      const { draftA, runA } = saveCompletedSessionA();
      await renderDetail();

      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(loadDraft()).toStrictEqual(draftA);
      expect(loadRun()).toStrictEqual(runA);
    });

    it("Replace clears the stale run record, builds a fresh STARTED draft, and proceeds to the countdown", async () => {
      mockHooks(BASELINES);
      saveCompletedSessionA();
      await renderDetailWithCountdownRoute("/library/w1");

      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Replace session" }),
      );

      expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
      // No half-state: the OLD run is gone, not just the old draft.
      expect(loadRun()).toBeNull();
      const draft = loadDraft();
      expect(draft).not.toBeNull();
      expect(draft!.workoutId).toBe("w1");
      expect(draft!.title).toBe("Ladder Sets");
      expect(draft!.startedAt).not.toBeNull();
    });
  });

  // Phase 7B Task 2, spec §3 — the OTHER direction of the same walk. Once
  // `startSession` cross-clears the `MonitorRun` (it does, as of this
  // commit — the mirror of `createMonitorRun` clearing the `SessionRun`),
  // a rower who finished a CONNECTED session and hadn't logged it yet
  // would lose it to one unwarned Start press. That record is 7C's entire
  // prefill input; losing it is the F5 shape exactly, so `handleStart`'s
  // guard is WIDENED to read it — the same direct-read pattern on a second
  // record, never rerouted onto `anyLiveSession()` (ROADMAP M-1, quoted at
  // the site).
  describe("a MonitorRun from a connected session", () => {
    // Realistic fixture (repo convention): a REAL seeded library workout
    // compiled through the real assembly, not a hand-built program.
    function monitorRunFor(completedAt: string | null): MonitorRun {
      const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
      if (!w) throw new Error("missing library fixture: Filling Low");
      const t0 = new Date("2026-08-05T12:00:00.000Z");
      const phases = buildRun(
        buildDraft({
          id: "fl-connected",
          title: w.title,
          type: w.type as WorkoutType,
          steps: w.steps,
        }),
        BASELINES,
        t0,
      ).phases;
      const compiled = compileProgram(phases);
      if ("code" in compiled) {
        throw new Error(`fixture failed to compile: ${compiled.code}`);
      }
      const run: MonitorRun = {
        v: 1,
        workoutId: "fl-connected",
        title: w.title,
        program: compiled,
        actuals: [],
        deviceName: "PM5 430123456",
        startedAt: t0.toISOString(),
        completedAt,
        terminated: false,
      };
      return JSON.parse(JSON.stringify(run)) as MonitorRun;
    }

    const FINISHED_AT = new Date("2026-08-05T12:41:00.000Z").toISOString();

    it("finished but unlogged: Start stages the unlogged warning and touches nothing", async () => {
      mockHooks(BASELINES);
      const connected = monitorRunFor(FINISHED_AT);
      saveMonitorRun(connected);
      await renderDetail();

      await userEvent.click(screen.getByRole("button", { name: "Start" }));

      // Survival asserted FIRST, deliberately: without the widening this
      // line is what fails, and it fails saying the record is gone — the
      // data loss itself, not a missing string.
      expect(loadMonitorRun()).toStrictEqual(connected);
      expect(
        screen.getByText(
          "You have an unlogged session. Starting a new one discards it.",
        ),
      ).toBeInTheDocument();
      expect(loadDraft()).toBeNull();
    });

    it("finished but unlogged: Cancel leaves the connected record byte-identical", async () => {
      mockHooks(BASELINES);
      const connected = monitorRunFor(FINISHED_AT);
      saveMonitorRun(connected);
      await renderDetail();

      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(loadMonitorRun()).toStrictEqual(connected);
      expect(loadDraft()).toBeNull();
    });

    it("finished but unlogged: Replace session clears it and proceeds — the reverse cross-clear", async () => {
      mockHooks(BASELINES);
      saveMonitorRun(monitorRunFor(FINISHED_AT));
      await renderDetailWithCountdownRoute("/library/w1");

      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Replace session" }),
      );

      expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
      expect(loadMonitorRun()).toBeNull();
      const draft = loadDraft();
      expect(draft).not.toBeNull();
      expect(draft!.workoutId).toBe("w1");
    });

    it("LIVE: Start stages the 'in progress' sentence — the erg is mid-piece, not finished", async () => {
      mockHooks(BASELINES);
      const live = monitorRunFor(null);
      saveMonitorRun(live);
      await renderDetail();

      await userEvent.click(screen.getByRole("button", { name: "Start" }));

      expect(
        screen.getByText("A session is in progress. Replace it?"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          "You have an unlogged session. Starting a new one discards it.",
        ),
      ).not.toBeInTheDocument();
      expect(loadMonitorRun()).toStrictEqual(live);
    });

    it("LIVE: Cancel preserves it, Replace session clears it", async () => {
      mockHooks(BASELINES);
      const live = monitorRunFor(null);
      saveMonitorRun(live);
      await renderDetailWithCountdownRoute("/library/w1");

      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(loadMonitorRun()).toStrictEqual(live);

      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Replace session" }),
      );
      expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
      expect(loadMonitorRun()).toBeNull();
    });

    it("an unlogged SessionRun still wins the copy when both records are stale", async () => {
      // The severity ordering: the phone-side record is checked first, and
      // "unlogged" is the accurate word for both, so nothing is lost by it.
      // Replace then clears BOTH — no half-state in either direction.
      mockHooks(BASELINES);
      const draftA = startDraft(
        buildDraft({
          id: "w-other",
          title: "Session A",
          type: "AN",
          steps: [{ k: "r", minutes: 5 }],
        }),
      );
      saveDraft(draftA);
      saveRun(completedRunFor(draftA));
      saveMonitorRun(monitorRunFor(FINISHED_AT));
      await renderDetailWithCountdownRoute("/library/w1");

      await userEvent.click(screen.getByRole("button", { name: "Start" }));
      expect(
        screen.getByText(
          "You have an unlogged session. Starting a new one discards it.",
        ),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Replace session" }),
      );
      expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
      expect(loadRun()).toBeNull();
      expect(loadMonitorRun()).toBeNull();
    });

    it("no MonitorRun at all: Start is unaffected — the cross-clear is a no-op removeItem", async () => {
      mockHooks(BASELINES);
      await renderDetailWithCountdownRoute("/library/w1");

      await userEvent.click(screen.getByRole("button", { name: "Start" }));

      expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
      expect(loadMonitorRun()).toBeNull();
    });
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

  it("renders a rest step's label and duration with no target split or nudge controls", async () => {
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
    // No target split (EN DASH, U+2013 — a band would render one) renders
    // in a rest row — resting has no pace target to nudge.
    expect(
      within(restRow as HTMLElement).queryByText(/–/),
    ).not.toBeInTheDocument();
  });

  it("renders a test step's label with no target split or nudge controls", async () => {
    mockHooks(BASELINES);
    await renderDetail();

    const testRow = screen.getByText("2k test").closest(".step-row");
    expect(testRow).not.toBeNull();
    expect(
      within(testRow as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
    // No target split (EN DASH, U+2013 — a band would render one) renders
    // in a test row — a test step is all-out effort, not paced to a target.
    expect(
      within(testRow as HTMLElement).queryByText(/–/),
    ).not.toBeInTheDocument();
  });

  it("renders one marker row above a repeat block instead of expanding it per repetition", async () => {
    mockHooks(BASELINES, [WORKOUT, WORKOUT_WITH_REPS]);
    await renderDetail("/library/w2");

    // liveSteps() would have expanded this into 4 separate work rows; the
    // handoff's raw-step model renders the block once with a marker above
    // it, so there is exactly one target and exactly one pair of nudge
    // buttons for the whole 4x block.
    expect(screen.getByText("4× the block below")).toBeInTheDocument();
    expect(screen.getByText("1:52.0")).toBeInTheDocument();
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
    // single displayed split, proving it's wired to the marker's raw
    // step, not silently a no-op or scoped to one repetition.
    await userEvent.click(screen.getByRole("button", { name: "Nudge faster" }));
    expect(screen.queryByText("1:52.0")).not.toBeInTheDocument();
    expect(screen.getByText("1:51.0")).toBeInTheDocument();
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
    // its neutral, un-nudged split — not w1's leftover nudge re-applied by
    // index.
    expect(screen.queryByText(/nudged/)).not.toBeInTheDocument();
    expect(screen.getByText("1:52.0")).toBeInTheDocument();
  });

  it("clamps a long run of same-direction nudges at MIN_SPLIT instead of drifting into a nonsense split", async () => {
    mockHooks(BASELINES, [WORKOUT, WORKOUT_WITH_REPS]);
    await renderDetail("/library/w2");

    // 2k baseline is 112s; unclamped, 80 "faster" nudges would drive the
    // resolved split to 112 - 80 = 32s (and further presses toward
    // negative, where fmtSplit renders garbage like "-1:-1.0"). Clamped to
    // MIN_SPLIT (60s), it should stop dead at "1:00.0" well before that.
    const faster = screen.getByRole("button", { name: "Nudge faster" });
    for (let i = 0; i < 80; i++) {
      await userEvent.click(faster);
    }

    expect(screen.getByText("1:00.0")).toBeInTheDocument();
  });

  it("renders Edit and Delete workout controls for a personal (non-global) workout", async () => {
    mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetail("/library/w3");

    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/library/w3/edit",
    );
    expect(
      screen.getByRole("button", { name: "Delete workout" }),
    ).toBeInTheDocument();
  });

  it("renders neither Edit nor Delete workout for a global workout, since the server 403s its mutations", async () => {
    mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [WORKOUT]);
    await renderDetail("/library/w1");

    expect(
      screen.queryByRole("link", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete workout" }),
    ).not.toBeInTheDocument();
  });

  // Fix round 1 (F2): the old two-button staged-confirm panel (Cancel
  // beside a second "Delete workout" button) is gone — Delete workout now
  // arms IN PLACE, the level system's own L4/L4-armed idiom, same shape as
  // Discard elsewhere in this round. The two-tap safety itself is
  // unchanged. Fix round 2 (whole-branch review Md5): the retired panel's
  // own reassurance copy is back too, restored as its own line beneath —
  // see the test below.
  it("asks for confirmation before deleting — the API is not called on the first Delete workout press", async () => {
    const api = mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetail("/library/w3");

    await userEvent.click(
      screen.getByRole("button", { name: "Delete workout" }),
    );

    expect(api).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Tap again to delete" }),
    ).toBeInTheDocument();
  });

  it("shows the logged-sessions-are-kept reassurance only once armed, not at rest", async () => {
    mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetail("/library/w3");

    expect(
      screen.queryByText(/Your logged sessions are kept/),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete workout" }),
    );

    expect(
      screen.getByText(
        "Your logged sessions are kept. They keep their own copy of the title and type.",
      ),
    ).toBeInTheDocument();
  });

  it("issues DELETE /api/workouts/:id once the armed 'Tap again to delete' press lands", async () => {
    const api = mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetailWithLibraryRoute("/library/w3");

    await userEvent.click(
      screen.getByRole("button", { name: "Delete workout" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to delete" }),
    );

    expect(api).toHaveBeenCalledWith("/api/workouts/w3", { method: "DELETE" });
    expect(await screen.findByText("LIBRARY SCREEN")).toBeInTheDocument();
  });

  // Same auto-disarm rule Discard uses elsewhere this round (DESIGN.md:
  // "Auto-disarms on blur or 4s") — proven here via blur, the cheaper of
  // the two to test (the 4s timer is exercised by its own fake-timers test
  // below).
  it("disarms on blur — a second press after focus moves away arms again instead of deleting", async () => {
    const api = mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetail("/library/w3");

    const del = screen.getByRole("button", { name: "Delete workout" });
    await userEvent.click(del);
    expect(
      screen.getByRole("button", { name: "Tap again to delete" }),
    ).toBeInTheDocument();

    // Focus moving away — a real Edit click would navigate this test's
    // single-route render out from under itself, so blur is fired directly
    // rather than routing through a real navigation.
    fireEvent.blur(screen.getByRole("button", { name: "Tap again to delete" }));
    expect(
      screen.getByRole("button", { name: "Delete workout" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete workout" }),
    );
    expect(api).not.toHaveBeenCalled();
  });

  it("disarms after 4 seconds with no second press", async () => {
    vi.useFakeTimers();
    try {
      mockApi(() => new Response(null, { status: 204 }));
      mockHooks(BASELINES, [PERSONAL_WORKOUT]);
      await renderDetail("/library/w3");

      // fireEvent (not userEvent, which schedules its own real-time delays
      // that fake timers would otherwise stall) fires the click directly.
      fireEvent.click(screen.getByRole("button", { name: "Delete workout" }));
      expect(
        screen.getByRole("button", { name: "Tap again to delete" }),
      ).toBeInTheDocument();

      // `act` wraps the fake-timer advance so the auto-disarm timeout's
      // `setArmed(false)` (called OUTSIDE any React event, from a raw
      // `setTimeout`) is flushed to the DOM before the next assertion —
      // same idiom as Countdown.test.tsx's own tick-down test.
      await act(() => vi.advanceTimersByTimeAsync(4000));

      expect(
        screen.getByRole("button", { name: "Delete workout" }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // The recorded bug this task round fixes: every ← BACK on this screen was
  // hardcoded to /library, so Today -> suggestion -> detail -> BACK always
  // skipped past Today. BackLink.tsx owns the general target logic
  // (BackLink.test.tsx's own table); this only pins that WorkoutDetail
  // actually wires it in, using a REAL origin a Link would carry.
  describe("← BACK", () => {
    it("returns to the origin recorded in location.state.from", async () => {
      mockHooks(BASELINES, [WORKOUT]);
      await renderDetailWithState("/library/w1", { from: "/today" });

      expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
        "href",
        "/today",
      );
    });

    it("falls back to /library with no state at all (a deep link)", async () => {
      mockHooks(BASELINES, [WORKOUT]);
      await renderDetailWithState("/library/w1", undefined);

      expect(screen.getByRole("link", { name: "← BACK" })).toHaveAttribute(
        "href",
        "/library",
      );
    });
  });

  // The chain's first real hop, from the detail side: WorkoutDetail must
  // forward the `from` it ITSELF received onto the Edit link, unchanged —
  // not its own pathname (`/library/w3`), which is what a naive
  // `state={{from: location.pathname}}` copy-paste of the general rule
  // would produce here and would collapse the chain back to detail instead
  // of preserving Today as the eventual double-BACK destination.
  it("forwards its own received `from` onto the Edit link, not its own pathname", async () => {
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetailWithState("/library/w3", { from: "/today" });

    await userEvent.click(screen.getByRole("link", { name: "Edit" }));

    expect(await screen.findByText("PROBE from=/today")).toBeVisible();
  });

  it("forwards undefined (no state to forward) onto the Edit link when detail itself has none", async () => {
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetailWithState("/library/w3", undefined);

    await userEvent.click(screen.getByRole("link", { name: "Edit" }));

    expect(await screen.findByText("PROBE from=undefined")).toBeVisible();
  });

  // Must-fix minor (whole-branch review): "Log it after" used to be a bare
  // `<Link to={...}>` with no `state` at all — unlike the Edit link right
  // beside it, which has always forwarded `from` (the pair above). Without
  // this, the manual door's own new `BackLink` (IMP-2) would fall all the
  // way back to its `/library` default instead of returning to wherever the
  // rower actually came from before this detail screen.
  it("forwards its own received `from` onto the 'Log it after' link, same as the Edit link beside it", async () => {
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetailWithState("/library/w3", { from: "/today" });

    await userEvent.click(screen.getByRole("link", { name: "Log it after" }));

    expect(await screen.findByText("PROBE from=/today")).toBeVisible();
  });

  it("forwards undefined (no state to forward) onto the 'Log it after' link when detail itself has none", async () => {
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetailWithState("/library/w3", undefined);

    await userEvent.click(screen.getByRole("link", { name: "Log it after" }));

    expect(await screen.findByText("PROBE from=undefined")).toBeVisible();
  });

  // Design doc: "Delete stays /library" — deliberate, since whatever the
  // rower came from (e.g. a Today suggestion) may no longer make sense once
  // the workout it pointed at is gone. Proves it holds even when the
  // origin WOULD otherwise resolve to somewhere else entirely.
  it("still navigates to /library on delete, even when entered from Today", async () => {
    const api = mockApi(() => new Response(null, { status: 204 }));
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetailWithState("/library/w3", { from: "/today" });

    await userEvent.click(
      screen.getByRole("button", { name: "Delete workout" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to delete" }),
    );

    expect(api).toHaveBeenCalledWith("/api/workouts/w3", { method: "DELETE" });
    expect(await screen.findByText("LIBRARY SCREEN")).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Phase 7B Task 5 — Connect: the button's three states, the caption, and the
// hand-off into the interstitial.
// ---------------------------------------------------------------------------

const LAST_DEVICE_KEY = "ergomatic.lastMonitorDevice";

/** Installs (or removes) a `navigator.bluetooth` stub for exactly one test.
 *  jsdom has no Web Bluetooth of its own — `navigator.bluetooth` is
 *  `undefined` by default, which IS the "absent" case; the other two
 *  states are stubbed in directly, restored after. */
function stubBluetooth(
  bt: { getAvailability?: () => Promise<boolean> } | undefined,
) {
  const original = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    "bluetooth",
  );
  Object.defineProperty(navigator, "bluetooth", {
    value: bt,
    configurable: true,
  });
  return () => {
    delete (navigator as { bluetooth?: unknown }).bluetooth;
    if (original)
      Object.defineProperty(Navigator.prototype, "bluetooth", original);
  };
}

describe("Connect (handoff §1: the button, the caption, the Bluetooth states)", () => {
  afterEach(() => {
    delete (navigator as { bluetooth?: unknown }).bluetooth;
  });

  it("available: a plain L2 'Connect' trigger, no dashed treatment", async () => {
    const restore = stubBluetooth({
      getAvailability: () => Promise.resolve(true),
    });
    mockHooks(BASELINES);
    await renderDetail();

    const button = await screen.findByRole("button", { name: "Connect" });
    expect(button).toHaveClass("button-l2");
    expect(button).not.toHaveClass("connect-block-dashed");
    expect(screen.queryByText("BLUETOOTH IS OFF")).not.toBeInTheDocument();
    restore();
  });

  it("Bluetooth off: dashed treatment, 'BLUETOOTH IS OFF' caption, still tappable", async () => {
    const restore = stubBluetooth({
      getAvailability: () => Promise.resolve(false),
    });
    mockHooks(BASELINES);
    await renderDetail();

    expect(await screen.findByText("BLUETOOTH IS OFF")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button.closest(".connect-block-dashed")).not.toBeNull();
    expect(button).not.toBeDisabled();
    restore();
  });

  it("no Web Bluetooth API at all: dashed treatment, a different caption", async () => {
    // No stub installed at all — the real jsdom default.
    mockHooks(BASELINES);
    await renderDetail();

    expect(
      await screen.findByText("NO BLUETOOTH ON THIS DEVICE"),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button.closest(".connect-block-dashed")).not.toBeNull();
    expect(button).not.toBeDisabled();
  });

  it("LAST USED · <name> appears only once available and only after a first pair", async () => {
    localStorage.setItem(LAST_DEVICE_KEY, "PM5 430123456");
    const restore = stubBluetooth({
      getAvailability: () => Promise.resolve(true),
    });
    mockHooks(BASELINES);
    await renderDetail();

    expect(
      await screen.findByText("LAST USED · PM5 430123456"),
    ).toBeInTheDocument();
    restore();
  });

  it("no LAST USED caption before any pair has ever succeeded", async () => {
    const restore = stubBluetooth({
      getAvailability: () => Promise.resolve(true),
    });
    mockHooks(BASELINES);
    await renderDetail();
    await screen.findByRole("button", { name: "Connect" });

    expect(screen.queryByText(/LAST USED/)).not.toBeInTheDocument();
    restore();
  });

  it("no baselines set: pressing Connect shows an inline error, no interstitial", async () => {
    mockHooks({ k2Seconds: null, k6Seconds: null });
    await renderDetail();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText(
        "Set your baselines first. Connect needs a target to program.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Connecting")).not.toBeInTheDocument();
  });

  // Phase 6I: an effort-only workout needs no target to program at all
  // (`compileProgram` already resolves an effort phase with no
  // `targetSplit`, Task 1's own comment fix to domain/monitor/program.ts)
  // — Connect proceeds straight to the interstitial with NO baselines
  // error, unlike WORKOUT's split-ref case just above. jsdom has no
  // `navigator.bluetooth`, so the interstitial's own REAL (unmocked)
  // `useMonitorSession` deterministically fails `transport-missing` the
  // instant it mounts — that message showing up (not the baselines error)
  // is what proves the interstitial actually mounted, i.e. that Connect's
  // own guard let this workout through.
  it("effort-only workout, baselines unset: Connect proceeds to the interstitial with NO baselines error", async () => {
    mockHooks(NO_BASELINES, [EFFORT_ONLY_WORKOUT]);
    await renderDetail("/library/w-effort");

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("This device has no Bluetooth transport.", {
        selector: ".connected-serif-line",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Set your baselines first. Connect needs a target to program.",
      ),
    ).not.toBeInTheDocument();
  });

  // 2026-08-09's warmup setting: this screen reads the preference for
  // Connect's own `buildRun` call, but deliberately does NOT hold the
  // whole workout behind it (see the hook's own comment in
  // WorkoutDetail.tsx). This test pins exactly one thing — that a
  // half-loaded hook neither blocks the button nor crashes the screen.
  //
  // IT DOES NOT PIN WHAT GETS BUILT, and must not be read as if it did
  // (arc review F6: a mutant hardcoding a 3' warm-up at the Connect door
  // left this test passing). This file has no way to see the phases or the
  // log seed — it renders the REAL interstitial. Both preference arms are
  // BEHAVIOUR-pinned next door, in
  // `WorkoutDetail.connectedEnd.test.tsx`'s "the Connect door and the
  // warm-up setting" describe, which intercepts the interstitial's props.
  it("Connect proceeds normally while the warm-up preference is still loading", async () => {
    mockHooks(NO_BASELINES, [EFFORT_ONLY_WORKOUT], null, false);
    await renderDetail("/library/w-effort");

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("This device has no Bluetooth transport.", {
        selector: ".connected-serif-line",
      }),
    ).toBeInTheDocument();
  });

  // WORKOUT's own "test" step (an open-ended all-out, no fixed time or
  // distance) is exactly what `compileProgram` exists to refuse — a real
  // `CompileError`, not a hand-built one, surfacing verbatim as the inline
  // error rather than ever mounting the interstitial.
  it("a workout that cannot be compiled for the PM5: the CompileError's own message shows inline, no interstitial", async () => {
    mockHooks(BASELINES); // defaults to [WORKOUT], which has a "test" step
    await renderDetail();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText(
        "An open-ended (all-out/test) interval has no fixed time or distance. The PM5 requires one to program a workout.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Connecting")).not.toBeInTheDocument();
  });

  // Chromium ships `navigator.bluetooth` without `getAvailability` on some
  // versions (the probe's own "can't tell" branch) — fails OPEN to
  // "available" rather than dashing a button that may work fine.
  it("Bluetooth API present but getAvailability is missing: fails open to available", async () => {
    const restore = stubBluetooth({});
    mockHooks(BASELINES);
    await renderDetail();

    const button = await screen.findByRole("button", { name: "Connect" });
    expect(button).not.toHaveClass("connect-block-dashed");
    expect(screen.queryByText("BLUETOOTH IS OFF")).not.toBeInTheDocument();
    expect(
      screen.queryByText("NO BLUETOOTH ON THIS DEVICE"),
    ).not.toBeInTheDocument();
    restore();
  });

  // MEDIUM-8, task-5 review: `getAvailability()` REJECTING (a real Chromium
  // behaviour in sandboxed/permission-policy contexts) is a different
  // branch than the "not a function" one above — both fail open the same
  // way, but only the second had a test.
  it("Bluetooth API present but getAvailability() rejects: also fails open to available", async () => {
    const restore = stubBluetooth({
      getAvailability: () => Promise.reject(new Error("permission denied")),
    });
    mockHooks(BASELINES);
    await renderDetail();

    const button = await screen.findByRole("button", { name: "Connect" });
    expect(button).not.toHaveClass("connect-block-dashed");
    expect(screen.queryByText("BLUETOOTH IS OFF")).not.toBeInTheDocument();
    restore();
  });

  it("Row on the phone timer instead: a saveDraft failure shows the inline error instead of navigating", async () => {
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetailWithCountdownRoute("/library/w3");

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText("This device has no Bluetooth transport.", {
      selector: ".connected-serif-line",
    });

    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    await userEvent.click(
      screen.getByRole("button", { name: "Row on the phone timer instead" }),
    );

    expect(
      screen.getByText("Couldn't start this session. Try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("COUNTDOWN SCREEN")).not.toBeInTheDocument();
    spy.mockRestore();
  });

  // The full wiring, real (unmocked) hook included: nothing on record, so
  // ConnectAction's guard proceeds immediately; jsdom has no
  // `navigator.bluetooth`, so the REAL `useMonitorSession` genuinely fails
  // `transport-missing` — a deterministic real failure, not a mock. "Row on
  // the phone timer instead" then has to prove its own promise: the SAME
  // nudge this screen's preview stack applied survives into the phone
  // session's own draft (not the always-empty one `startSession` builds).
  it("Connect -> a real transport-missing failure -> 'Row on the phone timer instead' keeps the nudge", async () => {
    // PERSONAL_WORKOUT, not WORKOUT: WORKOUT's own "test" step is
    // deliberately open-ended (no fixed time/distance) and so cannot
    // compile to a `WorkoutProgram` at all — the wrong fixture for a test
    // whose whole point is reaching the interstitial. PERSONAL_WORKOUT's
    // single time-duration work step is a real, compilable program.
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    const { default: WorkoutDetail } = await import("./WorkoutDetail");
    render(
      <MemoryRouter initialEntries={["/library/w3"]}>
        <Routes>
          <Route path="/library/:id" element={<WorkoutDetail />} />
          <Route path="/session/countdown" element={<p>COUNTDOWN SCREEN</p>} />
        </Routes>
      </MemoryRouter>,
    );

    // Nudge the (only) work step one press faster (-1s) before connecting —
    // "targets intact" only means something if a real nudge is on record.
    await userEvent.click(screen.getByRole("button", { name: "Nudge faster" }));

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("This device has no Bluetooth transport.", {
        selector: ".connected-serif-line",
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Row on the phone timer instead" }),
    );

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(draft!.nudges[0]).toBe(-1);
  });

  it("Cancel from the interstitial returns to Workout detail with nothing lost", async () => {
    mockHooks(BASELINES, [PERSONAL_WORKOUT]);
    await renderDetail("/library/w3");

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText("This device has no Bluetooth transport.", {
      selector: ".connected-serif-line",
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByRole("button", { name: "Start" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  // Task 5 review, HIGH-1 — the mirror of the "Start over a connected
  // session's record" describe block above, now for Connect's own door.
  // Before the fix: Start staged (Task 2's widened guard), Connect did not
  // (`connectGuardStage()` read only `RUN_KEY`) — a rower who finished a
  // connected session and pressed Connect on ANOTHER workout lost 7C's
  // entire prefill input with no sentence shown.
  describe("a finished-but-unlogged MonitorRun on record (HIGH-1)", () => {
    function monitorRunFor(completedAt: string | null): MonitorRun {
      const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
      if (!w) throw new Error("missing library fixture: Filling Low");
      const t0 = new Date("2026-08-05T12:00:00.000Z");
      const phases = buildRun(
        buildDraft({
          id: "fl-connected",
          title: w.title,
          type: w.type as WorkoutType,
          steps: w.steps,
        }),
        BASELINES,
        t0,
      ).phases;
      const compiled = compileProgram(phases);
      if ("code" in compiled) {
        throw new Error(`fixture failed to compile: ${compiled.code}`);
      }
      const run: MonitorRun = {
        v: 1,
        workoutId: "fl-connected",
        title: w.title,
        program: compiled,
        actuals: [],
        deviceName: "PM5 430123456",
        startedAt: t0.toISOString(),
        completedAt,
        terminated: false,
      };
      return JSON.parse(JSON.stringify(run)) as MonitorRun;
    }

    const FINISHED_AT = new Date("2026-08-05T12:41:00.000Z").toISOString();

    it("Connect stages the confirm too — not a straight walk into the interstitial", async () => {
      mockHooks(BASELINES, [PERSONAL_WORKOUT]);
      const connected = monitorRunFor(FINISHED_AT);
      saveMonitorRun(connected);
      await renderDetail("/library/w3");

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));

      // Survival asserted FIRST — without the widening this line is what
      // fails, and it fails saying the record is gone, not a missing
      // string (the same discipline `handleStart`'s own sibling test uses).
      expect(loadMonitorRun()).toStrictEqual(connected);
      expect(
        screen.getByText(
          "You have an unlogged session. Connecting discards it.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Connecting")).not.toBeInTheDocument();
    });

    it("Cancel preserves the connected record byte-identical", async () => {
      mockHooks(BASELINES, [PERSONAL_WORKOUT]);
      const connected = monitorRunFor(FINISHED_AT);
      saveMonitorRun(connected);
      await renderDetail("/library/w3");

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByRole("button", { name: "Connect" })).toBeVisible();
      expect(loadMonitorRun()).toStrictEqual(connected);
    });

    it("Connect anyway destroys it — deliberately, now with a warning first", async () => {
      mockHooks(BASELINES, [PERSONAL_WORKOUT]);
      const connected = monitorRunFor(FINISHED_AT);
      saveMonitorRun(connected);
      await renderDetail("/library/w3");

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Connect anyway" }),
      );

      // The compiled PERSONAL_WORKOUT program is a different one than the
      // stale connected record's own "Filling Low" — proceeding here
      // replaces the stale record outright once a new one opens (this
      // screen's own compile step never touches storage itself; the
      // destruction is `WorkoutDetail.handleRowInstead`'s `clearMonitorRun`
      // below, reached the same way Start's own "Connect anyway" analogue
      // reaches `startSession`'s cross-clear).
      await screen.findByText("This device has no Bluetooth transport.", {
        selector: ".connected-serif-line",
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Row on the phone timer instead" }),
      );

      expect(loadMonitorRun()).toBeNull();
    });

    it("a LIVE MonitorRun (the erg is mid-piece) stages the 'in progress' sentence instead", async () => {
      mockHooks(BASELINES, [PERSONAL_WORKOUT]);
      saveMonitorRun(monitorRunFor(null));
      await renderDetail("/library/w3");

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));

      expect(
        screen.getByText("A session is in progress. Replace it?"),
      ).toBeInTheDocument();
    });
  });
});
