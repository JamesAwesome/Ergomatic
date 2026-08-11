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
import type { WarmupSetting } from "../api/usePreferences";
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

// Realistic fixture, matching Timer.test.tsx:
// Hoarfrost (O2) — a reps×2 marker + one split-ref work step (12' @
// 6k+12, spm 22, 5' rest). Its first phase is that work step, labelled
// with the resolved split ("2:12.0" against this file's BASELINES).
// (It used to open on a `wu` row labelled "Easy"; 2026-08-09's warmup
// setting removed warm-ups from workouts entirely — the "warm-up SETTING"
// describe block below covers the one way a run gets one now.)
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

// Phase 6I: a REAL, shipped effort-only library workout (needsBaselines()
// reads false — Task 1's own review finding: this pre-existing AN sprint
// content, not just the future onboarding pair, is what the guard
// loosening opens up) — the realistic fixture the repo convention
// requires.
function heatLightningDraft(id = "id-heat-lightning"): SessionDraft {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Heat Lightning");
  if (!w) throw new Error("missing library fixture: Heat Lightning");
  return buildDraft({
    id,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
}

const NO_BASELINES = { k2Seconds: null, k6Seconds: null };

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
const READY_PREFS = {
  difficulties: [] as never[],
  timeCapMinutes: 60,
  // The warm-up SETTING (2026-08-09's design §2), OFF by default for
  // everyone — so the default fixture below builds runs with no warm-up
  // phase at all, exactly like production's default.
  warmup: null as WarmupSetting | null,
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
        <Route path="/library/:id" element={<p>DETAIL SCREEN</p>} />
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
    // Hoarfrost's first phase is its 12' work step, labelled with the
    // resolved split (domain/expand.ts's `case "w"`: `fmtSplit(132)`).
    expect(screen.getByText("2:12.0")).toBeInTheDocument();
    // The setting is OFF in READY_PREFS, so no warm-up was prepended.
    const built = loadRun();
    expect(built).not.toBeNull();
    expect(built!.phases.some((p) => p.type === "warmup")).toBe(false);
  });

  // Phase 6I: `needsBaselines()` (domain/needsBaselines.ts) is the SAME
  // predicate WorkoutDetail's own Start guard uses (fast-follow spec §3
  // moved it there from ConfirmTargets' old footer) — an effort-only draft
  // (a REAL shipped library workout, Heat Lightning) must build and save a
  // real run and proceed to "GET ON THE HANDLE," never bounce to /today,
  // even though `resolvedBaselines` is null.
  //
  // Regression pin for the redirect loop the brief warns about: this
  // screen has TWO gates that must share the exact same predicate — the
  // build effect's own early-return AND the render's redirect. Getting
  // either one wrong in isolation reproduces a real bug class: gate only
  // the redirect (leave the build effect blocking on bare
  // `resolvedBaselines === null`) and this test's `loadRun()` assertion
  // fails (no run record ever gets written, even though nothing visibly
  // redirects); gate only the build effect (leave the render redirecting
  // unconditionally) and this test's "GET ON THE HANDLE" assertion fails
  // instead (a run WOULD be written, but the rower never sees it — bounced
  // straight back to /today, which would send them right back here on the
  // next Start, building a SECOND run, forever). Both assertions together
  // are what actually catches a one-sided fix.
  it("builds and saves a run for an effort-only workout with null baselines, and proceeds to GET ON THE HANDLE (no redirect loop)", async () => {
    saveDraft(heatLightningDraft());
    mockAdapters({
      baselinesState: { state: "ready", baselines: NO_BASELINES },
    });
    await renderCountdown();

    expect(await screen.findByText("GET ON THE HANDLE")).toBeInTheDocument();
    expect(screen.queryByText("TODAY SCREEN")).not.toBeInTheDocument();
    const run = loadRun();
    expect(run).not.toBeNull();
    // Heat Lightning's first phase is its effort work step, labelled with
    // the effort WORD (domain/pace.ts's `effortWord`) — never a number.
    expect(screen.getByText("ALL OUT")).toBeInTheDocument();
  });

  it("an effort-only workout's built run carries no targetSplit on its effort work phase, and its label is the effort word (never a numeric estimate)", async () => {
    saveDraft(heatLightningDraft());
    mockAdapters({
      baselinesState: { state: "ready", baselines: NO_BASELINES },
    });
    await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");

    const run = loadRun()!;
    const workPhase = run.phases.find((p) => p.type === "work")!;
    expect(workPhase).toBeDefined();
    expect(workPhase.targetKind).toBe("effort");
    expect(workPhase.targetSplit).toBeUndefined();
    expect(workPhase.label).toBe("ALL OUT");
  });

  // Phase 6B Task 3 superseded the old `{0,0}` fallback (Task 2's own review
  // flagged it): WorkoutDetail's own Start button now blocks (disabled +
  // caption, fast-follow spec §3 relocated the guard from ConfirmTargets'
  // old footer) whenever baselines are unset AND the draft needs one
  // (Phase 6I narrowed "whenever" to that condition), so the only way to
  // reach Countdown with `resolvedBaselines === null` for a SPLIT-REF draft
  // is a direct/deep navigation that skipped that guard entirely. Rather
  // than build a run against a dummy pair, Countdown bounces to /today —
  // where BaselineCard, the no-baselines door, lives. Regression pin: this
  // must stay true even though the identical predicate now lets an
  // effort-only draft (the test above) through.
  it("still redirects to /today without building a run for a SPLIT-REF workout when baselines are ready but unset", async () => {
    saveDraft(hoarfrostDraft());
    mockAdapters({
      baselinesState: {
        state: "ready",
        baselines: { k2Seconds: null, k6Seconds: null },
      },
    });
    await renderCountdown();

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
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

  // Ledger item 1 (routed from Task 2's own report), revised by fast-follow
  // spec §3 item 4 (adversarial I3): CANCEL must not just navigate — it has
  // to clear the draft AND the run it already built, or `connectGuardStage`
  // would stage a bogus "session in progress" confirm on the very screen
  // CANCEL just landed on. ConfirmTargets used to un-start the draft
  // instead of clearing it (so its own editable form could reopen); that
  // screen is gone, so CANCEL clears the draft outright and lands on the
  // workout's own detail page instead.
  it("CANCEL clears the draft, clears the run, and navigates back to the workout's own detail page", async () => {
    // startDraft first — the real flow (every rewired entry point) always
    // stamps startedAt BEFORE navigating here.
    saveDraft(startDraft(hoarfrostDraft()));
    mockAdapters();
    await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");
    expect(loadDraft()!.startedAt).not.toBeNull();
    expect(loadRun()).not.toBeNull(); // built on mount

    await userEvent.click(screen.getByRole("button", { name: "CANCEL" }));

    expect(await screen.findByText("DETAIL SCREEN")).toBeInTheDocument();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  it("CANCEL falls back to /today when the draft carries no workoutId", async () => {
    const draft = startDraft(hoarfrostDraft());
    saveDraft({ ...draft, workoutId: null });
    mockAdapters();
    await renderCountdown();
    await screen.findByText("GET ON THE HANDLE");

    await userEvent.click(screen.getByRole("button", { name: "CANCEL" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(loadDraft()).toBeNull();
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

// 2026-08-09's warmup-setting design §4/§9: the phone-timer door is one of
// the two places a session is born, and it must thread the rower's own
// preference into `buildRun` — otherwise the setting is a screen that
// changes nothing. This screen already waits for `usePreferences` to be
// READY (it needs `countdownSeconds`), so there is no half-loaded window
// to guess in.
describe("Countdown — the warm-up setting reaches buildRun", () => {
  function prefsWith(warmup: WarmupSetting | null) {
    return {
      state: "ready",
      preferences: { ...READY_PREFS, warmup },
    } as unknown;
  }

  it("prepends a TIME warm-up to the saved run, ahead of the workout's own first phase", async () => {
    saveDraft(hoarfrostDraft("id-warmup-time"));
    mockAdapters({
      preferencesState: prefsWith({ kind: "time", minutes: 10 }),
    });
    await renderCountdown();

    expect(await screen.findByText("GET ON THE HANDLE")).toBeInTheDocument();
    const run = loadRun()!;
    expect(run.phases[0]).toStrictEqual({
      type: "warmup",
      seconds: 600,
      label: "Easy",
      originalIndex: -1,
    });
    // Hoarfrost's own four phases follow it, unshifted.
    expect(run.phases).toHaveLength(5);
    // GET ON THE HANDLE's own next-phase line names the warm-up now.
    expect(screen.getByText("Easy")).toBeInTheDocument();
  });

  it("prepends a DISTANCE warm-up and its trailing rest, in that order", async () => {
    saveDraft(hoarfrostDraft("id-warmup-distance"));
    mockAdapters({
      preferencesState: prefsWith({
        kind: "distance",
        meters: 2000,
        restSeconds: 90,
      }),
    });
    await renderCountdown();

    expect(await screen.findByText("GET ON THE HANDLE")).toBeInTheDocument();
    const run = loadRun()!;
    expect(run.phases.slice(0, 2)).toStrictEqual([
      {
        type: "warmup",
        meters: 2000,
        // estimationSplit's easy band against this file's 6k baseline:
        // 120 + 20 (domain/pace.ts:103).
        targetSplit: 140,
        label: "Easy",
        originalIndex: -1,
      },
      { type: "rest", seconds: 90, label: "Rest", originalIndex: -1 },
    ]);
    expect(run.phases).toHaveLength(6);
  });

  it("prepends nothing when the setting is OFF (the default for everyone)", async () => {
    saveDraft(hoarfrostDraft("id-warmup-off"));
    mockAdapters({ preferencesState: prefsWith(null) });
    await renderCountdown();

    expect(await screen.findByText("GET ON THE HANDLE")).toBeInTheDocument();
    const run = loadRun()!;
    expect(run.phases.some((p) => p.type === "warmup")).toBe(false);
    expect(run.phases).toHaveLength(4);
  });
});
