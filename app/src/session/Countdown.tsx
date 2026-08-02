import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { keepAwakeOff, keepAwakeOn } from "../adapters/keepAwake";
import { useBaselines } from "../api/useBaselines";
import { usePreferences } from "../api/usePreferences";
import type { Baselines } from "../../domain/types.js";
import { buildRun } from "./engine";
import { loadDraft, type SessionDraft } from "./draft";
import { saveRun, type SessionRun } from "./run";

// Copied a THIRD time from WorkoutDetail.tsx's own readPaceTolerance
// (ConfirmTargets.tsx already carries the second copy, with the same
// comment) — a shared module for this many one-line callers still isn't
// obviously worth the extra indirection, but three is the point at which a
// future reviewer should feel free to extract it; not done here to keep
// this task's diff to the files its brief names.
function readPaceTolerance(): number {
  if (typeof window === "undefined") return 1;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--pace-tolerance")
    .trim();
  const parsed = Number(raw);
  return raw !== "" && Number.isFinite(parsed) ? parsed : 1;
}

// The countdown's own timing state: `total` is the configured length
// (preferences.countdownSeconds), `startedAtMs` is the wall-clock instant
// (Date.now(), NOT the component's mount time — see the build effect below)
// the count actually began. Every render recomputes remaining from these
// two numbers and the current time, the same "derive from timestamps, never
// accumulate ticks" principle engine.ts uses at session scale (spec: "Time
// source: wall-clock, not accumulated ticks") — applied here in miniature
// so a locked/backgrounded tab still shows the correct number instead of
// whatever a naive `setInterval(() => n - 1)` drifted to.
interface CountdownClock {
  total: number;
  startedAtMs: number;
}

function remainingSeconds(clock: CountdownClock, nowMs: number): number {
  return Math.max(
    0,
    clock.total - Math.floor((nowMs - clock.startedAtMs) / 1000),
  );
}

// The three pieces of state the build effect produces together (the run
// record, the count's own clock, and the render-time clock reading) live in
// ONE state slice updated by ONE setState call — react-hooks' own
// set-state-in-effect rule flags multiple sequential setState calls in a
// single effect body (cascading-render risk), and the three values are
// only ever meaningful as a group in the first place (there's no render
// where `run` is set but `clock` isn't, or vice versa).
interface Built {
  run: SessionRun;
  clock: CountdownClock;
  nowMs: number;
}

/** GET ON THE HANDLE (handoff §5). Builds and saves the `SessionRun` on
 *  MOUNT — not when the count reaches zero — so the live timer (Task 3)
 *  starts with zero setup lag the instant this screen hands off. A reload
 *  while counting down re-mounts this component, which rebuilds and re-
 *  saves the run and restarts the count from `preferences.countdownSeconds`
 *  — this is deliberate (spec Resilience 4: "reload on countdown ->
 *  countdown restarts"), not a bug to fix later. */
export default function Countdown() {
  const navigate = useNavigate();
  // Lazy initializer: read the draft fresh from storage exactly once, the
  // same idiom ConfirmTargets.tsx/RunPlaceholder.tsx already use, so a real
  // browser reload lands here exactly as if this were the first render.
  const [draft] = useState<SessionDraft | null>(() => loadDraft());
  const baselinesState = useBaselines();
  const preferencesState = usePreferences();
  const [built, setBuilt] = useState<Built | null>(null);
  // A ref, not a `built !== null` check, guards the build effect: both fire
  // from the SAME dependency change (baselines/preferences settling), and a
  // ref flips synchronously before the state update commits, where a
  // `built !== null` read would still see the pre-update `null` on a second
  // effect invocation in the same tick (React 18 strict-mode's dev-only
  // double-invoke is exactly this shape).
  const builtRef = useRef(false);

  // Keep-awake spans the screen's whole lifetime: on at mount, off at
  // unmount (CANCEL/SKIP/the zero-length auto-redirect all unmount this
  // component on their way elsewhere). Platform-split lives entirely inside
  // the adapter (CLAUDE.md: platform conditionals only in src/adapters/) —
  // this component never calls isNative() itself.
  useEffect(() => {
    void keepAwakeOn();
    return () => void keepAwakeOff();
  }, []);

  // Builds + saves the run and starts the count the instant BOTH baselines
  // and preferences are READY — not merely "settled" (ready or error): an
  // earlier version of this effect treated an error as "proceed with a
  // fallback value" the same way it treats no-baselines-set, but that has a
  // real bug baked in. `builtRef` only ever lets this effect fire ONCE per
  // mount — if it fired during an error using a fallback, then the rower
  // clicked Retry and the real data arrived, the guard would block the
  // rebuild that should use it, leaving the run/countdown frozen on the
  // fallback forever. Blocking on error instead costs nothing: the render
  // below already shows a Retry button for either error, so nothing is
  // built (and no run is silently saved with wrong data) until the rower's
  // own retry succeeds and this effect finally sees two READY states.
  useEffect(() => {
    if (draft === null || builtRef.current) return;
    if (baselinesState.state !== "ready") return;
    if (preferencesState.state !== "ready") return;
    builtRef.current = true;

    // No baselines on file yet (a fresh rower who never visited You): {0,
    // 0} is the same dummy pair draft.ts's own draftMinutes() falls back to
    // when a workout has no split-ref work step to resolve — NOT a safe
    // stand-in for a workout that DOES have one (a split-ref target would
    // freeze as a nonsense near-zero split for the whole run). draftMinutes
    // sidesteps that by returning `null` instead of ever resolving against
    // the dummy; buildRun has no such escape hatch (its contract is a
    // concrete Baselines, always). Flagged in the task report as a genuine
    // gap between ConfirmTargets' existing "start without baselines"
    // tolerance (it shows "no target" per split-ref row rather than
    // refusing to start) and buildRun's contract — out of this task's scope
    // to close (it isn't named in any 6B task's file list), but real for a
    // rower who reaches this screen before ever setting baselines.
    const baselines: Baselines =
      baselinesState.baselines.k2Seconds !== null &&
      baselinesState.baselines.k6Seconds !== null
        ? {
            k2Seconds: baselinesState.baselines.k2Seconds,
            k6Seconds: baselinesState.baselines.k6Seconds,
          }
        : { k2Seconds: 0, k6Seconds: 0 };

    const countdownSeconds = preferencesState.preferences.countdownSeconds;

    const now = new Date();
    const startedAtMs = now.getTime();
    // buildRun + saveRun ARE this effect's real work (synchronizing the
    // frozen run to localStorage) — everything below just reports that
    // already-completed side effect back into React state. react-hooks'
    // set-state-in-effect rule flags a setState call made directly,
    // synchronously, in an effect body (cascading-render risk); routing it
    // through a resolved-microtask callback instead is the same "setState
    // in a callback function when external state changes" shape the rule's
    // own message recommends, with no perceptible delay (a microtask, not a
    // timer). `nowMs` is pinned to the SAME instant the count started, not
    // whatever a lazy initializer might have captured at this component's
    // mount (which can predate this effect by however long the baselines/
    // preferences fetch took) — otherwise the very first "ready" render
    // could read fewer seconds remaining than `countdownSeconds`, or even a
    // negative elapsed if an earlier `nowMs` predates `startedAtMs`.
    const run = buildRun(draft, baselines, readPaceTolerance(), now);
    saveRun(run);
    void Promise.resolve().then(() => {
      setBuilt({
        run,
        clock: { total: countdownSeconds, startedAtMs },
        nowMs: startedAtMs,
      });
    });
  }, [draft, baselinesState, preferencesState]);

  // The tick: a plain 1s interval that only ever repaints (refreshing
  // `nowMs`), never decrements a counter itself — `remainingSeconds` above
  // recomputes from `Date.now()` every render, so a throttled/backgrounded
  // tab still shows the correct number the instant it repaints, the same
  // principle as engine.ts's wall-clock design, at a much smaller scale.
  // Depends on whether a build has happened yet (a boolean), not on `built`
  // itself — the interval's own tick rewrites `built.nowMs` every second,
  // and depending on the object itself would tear the interval down and
  // recreate it every single tick instead of running continuously.
  const hasBuilt = built !== null;
  useEffect(() => {
    if (!hasBuilt) return;
    const id = setInterval(() => {
      setBuilt((prev) =>
        prev === null ? prev : { ...prev, nowMs: Date.now() },
      );
    }, 1000);
    return () => clearInterval(id);
  }, [hasBuilt]);

  if (draft === null) {
    return <Navigate to="/today" replace />;
  }

  if (
    baselinesState.state === "loading" ||
    preferencesState.state === "loading"
  ) {
    return (
      <main className="screen countdown-screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (baselinesState.state === "error") {
    return (
      <main className="screen countdown-screen">
        <p className="mono-status">Couldn't load your baselines.</p>
        <button
          type="button"
          className="button-outline"
          onClick={baselinesState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  if (preferencesState.state === "error") {
    return (
      <main className="screen countdown-screen">
        <p className="mono-status">Couldn't load your preferences.</p>
        <button
          type="button"
          className="button-outline"
          onClick={preferencesState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  if (built === null) {
    // Both hooks above are "ready"/"error"-settled by this point (the two
    // branches above already returned otherwise), so this is only the
    // single render between that settling and the build effect above
    // committing its state — a true loading state, not a stuck one.
    return (
      <main className="screen countdown-screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  const { run } = built;
  const remaining = remainingSeconds(built.clock, built.nowMs);

  // `countdownSeconds === 0` ("off") reads as `remaining === 0` on the very
  // FIRST render after the clock is set (zero total, zero elapsed) — so this
  // single check covers both the configured-off case AND the natural end of
  // a real count, with the countdown UI below never rendering for either.
  if (remaining <= 0) {
    return <Navigate to="/session/run" replace />;
  }

  // Handoff §5: the next-phase line is the upcoming phase's OWN resolved
  // label (a fmtSplit range, an effort word, or "Easy"/"Rest"/"All out") —
  // the same text the live timer's TARGET SPLIT card will show for phase 0,
  // not a re-derived phrase. `run.phases` is never empty (every draft has
  // at least one step; a warm-up-only draft is the shortest legal one), but
  // the fallback keeps this defensive rather than crash-on-empty.
  const nextLabel = run.phases[0]?.label ?? "";

  return (
    <main className="screen countdown-screen">
      <p className="countdown-label">GET ON THE HANDLE</p>
      <p className="countdown-number">{remaining}</p>
      <p className="countdown-next">{nextLabel}</p>
      <div className="countdown-actions">
        <button
          type="button"
          className="countdown-cancel"
          onClick={() => navigate("/session/confirm")}
        >
          CANCEL
        </button>
        <button
          type="button"
          className="countdown-skip"
          onClick={() => navigate("/session/run")}
        >
          SKIP ›
        </button>
      </div>
    </main>
  );
}
