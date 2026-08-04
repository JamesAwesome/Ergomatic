import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  Routes,
  RouterProvider,
} from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { WorkoutType } from "../../domain/types.js";
import {
  buildDraft,
  loadDraft,
  saveDraft,
  startDraft,
  type SessionDraft,
} from "./draft";
import { buildRun } from "./engine";
import { hasRunProgress } from "./Countdown";
import { loadRun, saveRun, type SessionRun } from "./run";

// Realistic fixture, matching Timer.test.tsx/ConfirmTargets.test.tsx:
// Hoarfrost (O2) — wu 10' + reps×2 marker + one split-ref work step. Its
// FIRST phase is always the warm-up ("Easy"), which is what makes it a good
// fixture for pinning the next-phase line: the assertion doesn't depend on
// baselines at all.
function hoarfrostDraft(id = "id-hoarfrost"): SessionDraft {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Hoarfrost");
  if (!w) throw new Error("missing library fixture: Hoarfrost");
  return buildDraft({
    id,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
}

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
const READY_PREFS = {
  difficulties: [] as never[],
  timeCapMinutes: 60,
  warmupMinutes: 10,
  countdownSeconds: 10,
};

function mockAdapters({
  baselinesState = { state: "ready", baselines: BASELINES } as unknown,
  preferencesState = {
    state: "ready",
    preferences: READY_PREFS,
  } as unknown,
} = {}) {
  const keepAwakeOn = vi.fn(async () => {});
  const keepAwakeOff = vi.fn(async () => {});
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => baselinesState,
  }));
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () => preferencesState,
  }));
  vi.doMock("../adapters/keepAwake", () => ({ keepAwakeOn, keepAwakeOff }));
  return { keepAwakeOn, keepAwakeOff };
}

async function renderCountdown(initialPath = "/session/countdown") {
  const { default: Countdown } = await import("./Countdown");
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/session/countdown" element={<Countdown />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
        <Route path="/session/confirm" element={<p>CONFIRM SCREEN</p>} />
        <Route path="/session/run" element={<p>RUN SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  // `vi.doMock` registrations, unlike `vi.mock`, are NOT reset by
  // `vi.resetModules()` in beforeEach — they'd otherwise survive past the
  // one test that mocks "./run" (the StrictMode test below) and silently
  // swallow every later test's real `loadRun`/`saveRun` calls. A no-op for
  // every other test, which never touches this mock in the first place.
  vi.doUnmock("./run");
});

describe("Countdown", () => {
  it("redirects to /today when there is no draft", async () => {
    mockAdapters();
    await renderCountdown();

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("shows LOADING while baselines are resolving", async () => {
    mockAdapters({ baselinesState: { state: "loading" } });
    saveDraft(hoarfrostDraft());
    await renderCountdown();

    expect(screen.getByText("LOADING…")).toBeInTheDocument();
    expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();
  });

  it("shows LOADING while preferences are resolving", async () => {
    mockAdapters({ preferencesState: { state: "loading" } });
    saveDraft(hoarfrostDraft());
    await renderCountdown();

    expect(screen.getByText("LOADING…")).toBeInTheDocument();
  });

  it("shows a retry control when baselines fail to load, and calling it retries", async () => {
    const retry = vi.fn();
    mockAdapters({ baselinesState: { state: "error", retry } });
    saveDraft(hoarfrostDraft());
    await renderCountdown();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows a retry control when preferences fail to load, and calling it retries", async () => {
    const retry = vi.fn();
    mockAdapters({ preferencesState: { state: "error", retry } });
    saveDraft(hoarfrostDraft());
    await renderCountdown();

    expect(
      screen.getByText("Couldn't load your preferences."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows a brief LOADING state between settled hooks and the run finishing its build", async () => {
    mockAdapters();
    saveDraft(hoarfrostDraft());
    // Deliberately NOT awaiting anything before this assertion: the build
    // effect defers its setState to a microtask (see Countdown.tsx's own
    // comment on why), so the very first synchronous render after mount is
    // still `built === null` even though both hooks already report ready.
    await renderCountdown();
    // render() itself flushes effects but the microtask queue only drains
    // once this synchronous block finishes — nothing has awaited yet, so
    // this reads the render exactly at that window.
    expect(screen.getByText("LOADING…")).toBeInTheDocument();
  });

  it("builds and saves the run on mount, and renders the configured countdown", async () => {
    saveDraft(hoarfrostDraft());
    mockAdapters();
    await renderCountdown();

    expect(await screen.findByText("GET ON THE HANDLE")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    // Hoarfrost's first phase is its warm-up: label "Easy" (domain/expand.ts).
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(loadRun()).not.toBeNull();
  });

  // Phase 6B Task 3 superseded the old `{0,0}` fallback (Task 2's own review
  // flagged it): ConfirmTargets.tsx now blocks START whenever baselines are
  // unset, so the only way to reach Countdown with `resolvedBaselines ===
  // null` is a direct/deep navigation that skipped Confirm's own guard.
  // Rather than build a run against a dummy pair, Countdown bounces back to
  // Confirm — the same place a rower trying to START without baselines
  // lands anyway.
  it("redirects to /session/confirm without building a run when baselines are ready but unset", async () => {
    saveDraft(hoarfrostDraft());
    mockAdapters({
      baselinesState: {
        state: "ready",
        baselines: { k2Seconds: null, k6Seconds: null },
      },
    });
    await renderCountdown();

    expect(await screen.findByText("CONFIRM SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();
    expect(loadRun()).toBeNull();
  });

  it("does not build or save a run while baselines are in an error state", async () => {
    saveDraft(hoarfrostDraft());
    mockAdapters({ baselinesState: { state: "error", retry: vi.fn() } });
    await renderCountdown();

    expect(
      screen.getByText("Couldn't load your baselines."),
    ).toBeInTheDocument();
    // The build effect's `builtRef` guard only ever lets it fire ONCE per
    // mount — building here (even with a fallback) would permanently
    // strand a rower who later clicks Retry on a run frozen with the wrong
    // data, since the guard would then block the correct rebuild. Blocking
    // entirely on error, rather than degrading with a fallback, is what
    // this test pins.
    expect(loadRun()).toBeNull();
  });

  it("does not build or save a run while preferences are in an error state", async () => {
    saveDraft(hoarfrostDraft());
    mockAdapters({ preferencesState: { state: "error", retry: vi.fn() } });
    await renderCountdown();

    expect(
      screen.getByText("Couldn't load your preferences."),
    ).toBeInTheDocument();
    expect(loadRun()).toBeNull();
  });

  it("builds and saves the run exactly ONCE even under StrictMode's dev double-invoke", async () => {
    // React 18/19 StrictMode deliberately double-invokes effects in
    // development to surface impure ones — the ONE realistic way this
    // effect's own `builtRef` guard (comment: "React 18 strict-mode's
    // dev-only double-invoke") actually gets exercised, since the mocked
    // hooks otherwise return stable references across renders and never
    // naturally re-trigger the effect on their own. `./run`'s `saveRun` is
    // mocked here (not the usual `loadRun` check) specifically so this test
    // can count invocations directly rather than infer them from storage.
    // `loadRun` still has to return something (F1's own mount guard reads
    // it too, now) — `null`, the ordinary "nothing sitting in storage yet"
    // case this test's own fixture actually is.
    mockAdapters();
    const saveRunSpy = vi.fn(() => true);
    vi.doMock("./run", () => ({ saveRun: saveRunSpy, loadRun: () => null }));
    saveDraft(hoarfrostDraft());
    const { default: Countdown } = await import("./Countdown");

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/session/countdown"]}>
          <Routes>
            <Route path="/session/countdown" element={<Countdown />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    await screen.findByText("GET ON THE HANDLE");

    expect(saveRunSpy).toHaveBeenCalledTimes(1);
  });

  // Ledger item 1 (routed from Task 2's own report): CANCEL must not just
  // navigate — it has to un-start the draft AND clear the run it already
  // built, or ConfirmTargets' own `startedAt !== null` guard would bounce
  // the rower straight back to the timer instead of letting them re-edit.
  it("CANCEL un-starts the draft, clears the run, and navigates back to /session/confirm", async () => {
    // startDraft first — the real flow (ConfirmTargets' handleStart) always
    // stamps startedAt BEFORE navigating here; a never-started draft
    // wouldn't distinguish "CANCEL un-starts it" from "it was never
    // started."
    saveDraft(startDraft(hoarfrostDraft()));
    mockAdapters();
    await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");
    expect(loadDraft()!.startedAt).not.toBeNull();
    expect(loadRun()).not.toBeNull(); // built on mount

    await userEvent.click(screen.getByRole("button", { name: "CANCEL" }));

    expect(await screen.findByText("CONFIRM SCREEN")).toBeInTheDocument();
    expect(loadDraft()!.startedAt).toBeNull();
    expect(loadRun()).toBeNull();
  });

  it("SKIP navigates straight to /session/run", async () => {
    saveDraft(hoarfrostDraft());
    mockAdapters();
    await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");

    await userEvent.click(screen.getByRole("button", { name: "SKIP ›" }));

    expect(await screen.findByText("RUN SCREEN")).toBeInTheDocument();
  });

  // Whole-branch review, F1: SKIP used to PUSH /session/run, leaving this
  // countdown mount reachable via browser BACK — re-mounting it silently
  // rebuilt/overwrote whatever progress the live timer had already made.
  // `createMemoryRouter` (not the plain `<MemoryRouter>` the rest of this
  // file uses), so the test can drive a REAL browser-style back navigation
  // via `router.navigate(-1)` and read the router's own settled location —
  // proving `replace`, not merely that SKIP still lands on /session/run.
  it("SKIP replaces this screen in history — browser BACK from the live timer does not return to the countdown", async () => {
    saveDraft(hoarfrostDraft());
    mockAdapters();
    const { default: Countdown } = await import("./Countdown");
    const router = createMemoryRouter(
      [
        { path: "/today", Component: () => <p>TODAY SCREEN</p> },
        { path: "/session/countdown", Component: Countdown },
        { path: "/session/run", Component: () => <p>RUN SCREEN</p> },
      ],
      { initialEntries: ["/today", "/session/countdown"], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);
    await screen.findByText("GET ON THE HANDLE");

    await userEvent.click(screen.getByRole("button", { name: "SKIP ›" }));
    await screen.findByText("RUN SCREEN");

    router.navigate(-1);
    // The countdown entry no longer exists to go back TO — replaced, not
    // pushed — so one BACK from the (now former) countdown position lands
    // on /today, the entry that was there before it.
    await screen.findByText("TODAY SCREEN");
    expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();
  });

  it("turns keep-awake on while mounted and off on unmount", async () => {
    saveDraft(hoarfrostDraft());
    const { keepAwakeOn, keepAwakeOff } = mockAdapters();
    const { unmount } = await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");

    expect(keepAwakeOn).toHaveBeenCalledOnce();
    expect(keepAwakeOff).not.toHaveBeenCalled();

    unmount();

    expect(keepAwakeOff).toHaveBeenCalledOnce();
  });

  it("a countdownSeconds of 0 never renders the countdown UI and redirects immediately", async () => {
    saveDraft(hoarfrostDraft());
    mockAdapters({
      preferencesState: {
        state: "ready",
        preferences: { ...READY_PREFS, countdownSeconds: 0 },
      },
    });

    await renderCountdown();
    // Same "no await yet" window as the LOADING test above: even once the
    // build effect's microtask has resolved, remaining computes to 0 on
    // its very first possible render (zero total, zero elapsed) — the
    // "GET ON THE HANDLE" branch must never render in between.
    expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();

    expect(await screen.findByText("RUN SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();
    // The run is still built + saved even though the count is skipped —
    // the live timer (Task 3) needs it regardless of countdown length.
    expect(loadRun()).not.toBeNull();
  });

  it("reads the draft fresh on every mount and rebuilds the run (reload-on-countdown restarts, deliberately)", async () => {
    const draft = hoarfrostDraft();
    saveDraft(draft);
    mockAdapters();
    const { unmount } = await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");
    const firstRun = loadRun();
    expect(firstRun).not.toBeNull();

    unmount();
    vi.resetModules();
    mockAdapters();
    await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");
    const secondRun = loadRun();

    // Both builds are real SessionRuns (not the same reference — a fresh
    // build happened on the second mount too), which is what "reload
    // restarts the countdown" (spec Resilience 4) actually requires: a
    // stale run from the FIRST mount is never silently reused.
    expect(secondRun).not.toBeNull();
    expect(secondRun).not.toBe(firstRun);
  });

  it("ticks the numeral down each second and redirects to /session/run at zero", async () => {
    vi.useFakeTimers();
    saveDraft(hoarfrostDraft());
    mockAdapters({
      preferencesState: {
        state: "ready",
        preferences: { ...READY_PREFS, countdownSeconds: 2 },
      },
    });

    await renderCountdown();
    await vi.waitFor(() =>
      expect(screen.getByText("GET ON THE HANDLE")).toBeInTheDocument(),
    );
    expect(screen.getByText("2")).toBeInTheDocument();

    // `act` wraps the fake-timer advance so the interval callback's
    // `setBuilt` (called OUTSIDE any React event/render, from a raw
    // `setInterval`) is flushed to the DOM before the next assertion —
    // `vi.advanceTimersByTimeAsync` alone resolves once the timer callback
    // itself has run, but not necessarily once React has committed the
    // state update it triggered.
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByText("1")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByText("RUN SCREEN")).toBeInTheDocument();
  });
});

// Whole-branch review, F1: pure-function coverage for the mount guard's own
// predicate, direct and mutation-friendly — the integration tests below
// cover the component's REACTION to it.
describe("hasRunProgress", () => {
  const BASE_RUN = buildRun(
    hoarfrostDraft(),
    BASELINES,
    new Date("2026-08-01T12:00:00.000Z"),
  );

  it("is false for a freshly built run — index 0, no actuals, not complete", () => {
    expect(hasRunProgress(BASE_RUN)).toBe(false);
  });

  it("is true once index has advanced past 0", () => {
    expect(hasRunProgress({ ...BASE_RUN, index: 1 })).toBe(true);
  });

  it("is true once completedAt is set", () => {
    expect(
      hasRunProgress({
        ...BASE_RUN,
        completedAt: "2026-08-01T12:10:00.000Z",
      }),
    ).toBe(true);
  });

  it("is true once any actual has been recorded, even at index 0", () => {
    expect(
      hasRunProgress({
        ...BASE_RUN,
        actuals: {
          0: {
            elapsedSeconds: 10,
            splitSeconds: 100,
            actualSource: "stopwatch",
          },
        },
      }),
    ).toBe(true);
  });
});

// Whole-branch review, F1: the mount guard's REACTION — a BACK-button
// re-mount (simulated directly here by seeding an existing run before the
// component ever mounts, the same shape a real BACK produces) must bounce
// straight to the live timer instead of silently rebuilding over real
// progress or a completed-but-unlogged record.
describe("Countdown — F1 mount guard against rebuilding a progressed run", () => {
  it("redirects to /session/run without rebuilding when the existing run already shows progress (index > 0)", async () => {
    const draft = hoarfrostDraft();
    saveDraft(draft);
    const progressed: SessionRun = {
      ...buildRun(draft, BASELINES, new Date()),
      index: 1,
    };
    const saveRunSpy = vi.fn(() => true);
    vi.doMock("./run", () => ({
      loadRun: () => progressed,
      saveRun: saveRunSpy,
      clearRun: vi.fn(),
    }));
    mockAdapters();
    await renderCountdown();

    expect(await screen.findByText("RUN SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();
    expect(saveRunSpy).not.toHaveBeenCalled();
  });

  it("redirects to /session/run without rebuilding when the existing run is already complete", async () => {
    const draft = hoarfrostDraft();
    saveDraft(draft);
    const built = buildRun(draft, BASELINES, new Date());
    const completed: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date().toISOString(),
    };
    const saveRunSpy = vi.fn(() => true);
    vi.doMock("./run", () => ({
      loadRun: () => completed,
      saveRun: saveRunSpy,
      clearRun: vi.fn(),
    }));
    mockAdapters();
    await renderCountdown();

    expect(await screen.findByText("RUN SCREEN")).toBeInTheDocument();
    expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();
    expect(saveRunSpy).not.toHaveBeenCalled();
  });

  it("still rebuilds — the ordinary reload-during-countdown case — when an existing run has no progress yet", async () => {
    const draft = hoarfrostDraft();
    saveDraft(draft);
    // Real run.ts (not mocked): a run already sitting in storage with none
    // of hasRunProgress's three signals — exactly what Countdown's OWN
    // first mount leaves behind, and what a reload immediately afterward
    // would see. Resilience 4 still requires this to rebuild, not redirect.
    saveRun(buildRun(draft, BASELINES, new Date()));
    mockAdapters();
    await renderCountdown();

    expect(await screen.findByText("GET ON THE HANDLE")).toBeInTheDocument();
  });
});
