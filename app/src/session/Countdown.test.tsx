import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
import type { WorkoutType } from "../../domain/types.js";
import { buildDraft, saveDraft, type SessionDraft } from "./draft";
import { loadRun } from "./run";

// Realistic fixture, matching RunPlaceholder.test.tsx/ConfirmTargets.test.tsx:
// Doldrums (O2) — wu 4' + reps×2 marker + one split-ref work step. Its
// FIRST phase is always the warm-up ("Easy"), which is what makes it a good
// fixture for pinning the next-phase line: the assertion doesn't depend on
// baselines at all.
function doldrumsDraft(id = "id-doldrums"): SessionDraft {
  const w = STARTER_WORKOUTS.find((s) => s.title === "Doldrums");
  if (!w) throw new Error("missing starter fixture: Doldrums");
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
    saveDraft(doldrumsDraft());
    await renderCountdown();

    expect(screen.getByText("LOADING…")).toBeInTheDocument();
    expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();
  });

  it("shows LOADING while preferences are resolving", async () => {
    mockAdapters({ preferencesState: { state: "loading" } });
    saveDraft(doldrumsDraft());
    await renderCountdown();

    expect(screen.getByText("LOADING…")).toBeInTheDocument();
  });

  it("shows a retry control when baselines fail to load, and calling it retries", async () => {
    const retry = vi.fn();
    mockAdapters({ baselinesState: { state: "error", retry } });
    saveDraft(doldrumsDraft());
    await renderCountdown();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows a retry control when preferences fail to load, and calling it retries", async () => {
    const retry = vi.fn();
    mockAdapters({ preferencesState: { state: "error", retry } });
    saveDraft(doldrumsDraft());
    await renderCountdown();

    expect(
      screen.getByText("Couldn't load your preferences."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows a brief LOADING state between settled hooks and the run finishing its build", async () => {
    mockAdapters();
    saveDraft(doldrumsDraft());
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
    saveDraft(doldrumsDraft());
    mockAdapters();
    await renderCountdown();

    expect(await screen.findByText("GET ON THE HANDLE")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    // Doldrums' first phase is its warm-up: label "Easy" (domain/expand.ts).
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(loadRun()).not.toBeNull();
  });

  it("falls back to {0,0} baselines rather than crashing when none are set", async () => {
    saveDraft(doldrumsDraft());
    mockAdapters({
      baselinesState: {
        state: "ready",
        baselines: { k2Seconds: null, k6Seconds: null },
      },
    });
    await renderCountdown();

    expect(await screen.findByText("GET ON THE HANDLE")).toBeInTheDocument();
    const run = loadRun();
    expect(run).not.toBeNull();
    // Not just "didn't crash": Doldrums' work phase (phases[1]) is a
    // split-ref step at 6k+16 — with real baselines (k6Seconds 120) this
    // resolves to "2:15.0–2:17.0" (draft.test.ts's own pinned number for
    // this exact fixture); with the {0,0} dummy it MUST resolve to
    // "0:15.0–0:17.0" instead, proving the fallback pair was actually used
    // to build the frozen phases, not just accepted without crashing.
    expect(run!.phases[1]!.label).toBe("0:15.0–0:17.0");
  });

  it("does not build or save a run while baselines are in an error state", async () => {
    saveDraft(doldrumsDraft());
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
    saveDraft(doldrumsDraft());
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
    mockAdapters();
    const saveRunSpy = vi.fn(() => true);
    vi.doMock("./run", () => ({ saveRun: saveRunSpy }));
    saveDraft(doldrumsDraft());
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

  it("CANCEL navigates back to /session/confirm", async () => {
    saveDraft(doldrumsDraft());
    mockAdapters();
    await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");

    await userEvent.click(screen.getByRole("button", { name: "CANCEL" }));

    expect(await screen.findByText("CONFIRM SCREEN")).toBeInTheDocument();
  });

  it("SKIP navigates straight to /session/run", async () => {
    saveDraft(doldrumsDraft());
    mockAdapters();
    await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");

    await userEvent.click(screen.getByRole("button", { name: "SKIP ›" }));

    expect(await screen.findByText("RUN SCREEN")).toBeInTheDocument();
  });

  it("turns keep-awake on while mounted and off on unmount", async () => {
    saveDraft(doldrumsDraft());
    const { keepAwakeOn, keepAwakeOff } = mockAdapters();
    const { unmount } = await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");

    expect(keepAwakeOn).toHaveBeenCalledOnce();
    expect(keepAwakeOff).not.toHaveBeenCalled();

    unmount();

    expect(keepAwakeOff).toHaveBeenCalledOnce();
  });

  it("a countdownSeconds of 0 never renders the countdown UI and redirects immediately", async () => {
    saveDraft(doldrumsDraft());
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
    const draft = doldrumsDraft();
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
    saveDraft(doldrumsDraft());
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
