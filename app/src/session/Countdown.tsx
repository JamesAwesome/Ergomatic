import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { keepAwakeOff, keepAwakeOn } from "../adapters/keepAwake";
import { useBaselines } from "../api/useBaselines";
import { usePreferences } from "../api/usePreferences";
import { needsBaselines } from "../../domain/needsBaselines.js";
import type { Baselines } from "../../domain/types.js";
import { buildRun } from "./engine";
import {
  cancelStart,
  draftSteps,
  loadDraft,
  saveDraft,
  type SessionDraft,
} from "./draft";
import { clearRun, loadRun, saveRun, type SessionRun } from "./run";

// Phase 6I: the SAME predicate ConfirmTargets.tsx's own `isStartBlocked`
// uses, applied to the two places Countdown itself must agree with it —
// the build effect's own gate (below) and the render's redirect (further
// down). Missing either one reintroduces the exact bug a mismatched pair
// would produce: gate the effect but not the redirect, and an effort-only
// workout would render "Couldn't load…"-style limbo behind a redirect
// that fires anyway; gate the redirect but not the effect, and the run
// record this screen's whole job is to write never gets built at all — a
// rower stuck on a screen that looks like it's counting down toward a
// session that doesn't exist. `draftSteps` (not raw `d.steps`) is the
// EFFECTIVE view — removed rows dropped, nudges folded — the same one
// `buildRun` itself resolves against, so this can never disagree with what
// actually gets built.
function blocksWithoutBaselines(
  d: SessionDraft,
  baselines: Baselines | null,
): boolean {
  return baselines === null && needsBaselines(draftSteps(d));
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

/** Whether `run` already carries real progress a fresh `buildRun` would
 *  silently destroy (whole-branch review, F1): past phase 0, a recorded
 *  distance actual, or already complete (awaiting 6C's log screen). A run
 *  that's merely SITTING there with none of these (index 0, no actuals, not
 *  complete) is the ordinary "reload during the countdown" case this
 *  screen's own mount effect has always handled by rebuilding — see the
 *  component doc comment below (spec Resilience 4) — so this deliberately
 *  does NOT treat "a run record exists" alone as progress. Exported for
 *  direct testing, same pattern as `remainingSeconds` above. */
// eslint-disable-next-line react-refresh/only-export-components
export function hasRunProgress(run: SessionRun): boolean {
  return (
    run.index > 0 ||
    run.completedAt !== null ||
    Object.keys(run.actuals).length > 0
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
 *  countdown restarts"), not a bug to fix later — PROVIDED the existing run
 *  has no real progress yet (see `hasRunProgress` above). Whole-branch
 *  review, F1: this component used to rebuild unconditionally regardless of
 *  how it was reached, which made a browser BACK from the live timer (or
 *  twice back from Session Complete) silently overwrite an in-progress or
 *  completed run with a fresh `index: 0, completedAt: null` one — real
 *  progress/actuals, or a completed-but-unlogged record 6C still needs,
 *  thrown away by nothing more than a back-swipe. The guard below bounces
 *  straight back to the live timer instead whenever that's the case. */
export default function Countdown() {
  const navigate = useNavigate();
  // Lazy initializer: read the draft fresh from storage exactly once, the
  // same idiom ConfirmTargets.tsx/Timer.tsx already use, so a real browser
  // reload lands here exactly as if this were the first render.
  const [draft] = useState<SessionDraft | null>(() => loadDraft());
  // Same lazy-read-once idiom, for the F1 guard: whatever run record (if
  // any) was ALREADY sitting in storage the instant this component mounted
  // — never re-read later, since the whole point is to judge how this
  // mount was reached, not to react to the build effect's own `saveRun`
  // moments later overwriting the same key.
  const [existingRun] = useState<SessionRun | null>(() => loadRun());
  const baselinesState = useBaselines();
  const preferencesState = usePreferences();
  // Resolved once baselines are READY — `null` covers both "not ready yet"
  // (loading/error; the render below returns before this matters) and the
  // genuine case this exists to catch: ready, but the rower has never set
  // baselines. ConfirmTargets.tsx's own footer blocks START in that case
  // ONLY when `needsBaselines()` reads true for the draft's effective steps
  // (Phase 6I — before this task it blocked unconditionally); an
  // effort-only workout's `resolvedBaselines === null` is therefore a
  // GENUINE, expected case reaching this screen now, not just a
  // direct/deep-link that skipped Confirm's guard. `blocksWithoutBaselines`
  // (module scope, above) is what actually decides whether this null value
  // blocks the build effect/render below — see its own comment.
  // useMemo, not a plain `const`: `baselinesState` itself is a STABLE
  // reference across renders that don't touch it (the countdown's own 1s
  // repaint interval re-renders this component every second once running),
  // but a bare object-literal computation here would still allocate a NEW
  // object on every one of those unrelated re-renders — which would then
  // needlessly re-run the build effect below on every tick (harmlessly,
  // since `builtRef`/the unset-baselines branch both already no-op, but
  // there's no reason to ask react-hooks/exhaustive-deps to choose between
  // a stale-closure warning and that churn when memoizing costs nothing).
  const resolvedBaselines: Baselines | null = useMemo(
    () =>
      baselinesState.state === "ready" &&
      baselinesState.baselines.k2Seconds !== null &&
      baselinesState.baselines.k6Seconds !== null
        ? {
            k2Seconds: baselinesState.baselines.k2Seconds,
            k6Seconds: baselinesState.baselines.k6Seconds,
          }
        : null,
    [baselinesState],
  );
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
    // F1 guard: an existing run with real progress must never be rebuilt —
    // the render below redirects to the live timer instead (its own
    // `<Navigate replace>` covers this exact case), so this effect has
    // nothing to build here regardless of how baselines/preferences settle.
    if (existingRun !== null && hasRunProgress(existingRun)) return;
    if (baselinesState.state !== "ready") return;
    if (preferencesState.state !== "ready") return;
    // Ready but unset AND the draft actually needs baselines to resolve
    // (Phase 6I: `blocksWithoutBaselines`, module scope) — never build
    // here; the render below redirects to Confirm instead. `builtRef` is
    // deliberately NOT flipped in this branch: this isn't "built once,
    // never rebuild," it's "nothing to build yet," so a hypothetical future
    // render with real baselines (there isn't one today; nothing here
    // re-fetches) wouldn't be wrongly blocked by a stale guard. An
    // effort-only draft falls THROUGH this check even with
    // `resolvedBaselines === null` — `buildRun` accepts `Baselines | null`
    // and resolves an effort phase to no target/no estimate rather than
    // crashing (domain/expand.ts's `phases()`).
    if (blocksWithoutBaselines(draft, resolvedBaselines)) return;
    builtRef.current = true;

    const baselines = resolvedBaselines;
    const countdownSeconds = preferencesState.preferences.countdownSeconds;
    // The warm-up SETTING (2026-08-09's design §4). This effect already
    // waits for `preferencesState.state === "ready"` above (for
    // `countdownSeconds`), so the value is loaded, not guessed — the phone
    // timer door never builds a run against a half-loaded preference.
    // `?? null` covers the pre-Task-2 window where the route doesn't send
    // the field yet; `buildRun` treats absent and null identically anyway.
    const warmup = preferencesState.preferences.warmup ?? null;

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
    const run = buildRun(draft, baselines, now, warmup);
    saveRun(run);
    void Promise.resolve().then(() => {
      setBuilt({
        run,
        clock: { total: countdownSeconds, startedAtMs },
        nowMs: startedAtMs,
      });
    });
  }, [draft, existingRun, baselinesState, preferencesState, resolvedBaselines]);

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

  // F1 guard's render half (see `hasRunProgress`'s own comment and the
  // build effect's identical check above): bounce straight to the live
  // timer BEFORE any of the loading/error branches below get a chance to
  // render — this doesn't need baselines/preferences to settle first, since
  // nothing here is going to build anything.
  if (existingRun !== null && hasRunProgress(existingRun)) {
    return <Navigate to="/session/run" replace />;
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

  if (blocksWithoutBaselines(draft, resolvedBaselines)) {
    // Both hooks are READY by this point (every loading/error branch above
    // already returned), so this means baselines resolved to genuinely
    // unset AND this draft's effective steps need one — ConfirmTargets.tsx
    // blocks START in that exact case (Phase 6I: its footer shows the
    // no-target/`/you` idiom instead of a clickable START), so the only way
    // to land here with this true is a direct/deep navigation to
    // /session/countdown that skipped Confirm entirely. Bouncing back to
    // Confirm (rather than building a run against a dummy pair) puts the
    // rower exactly where they'd land had they tried to START from Confirm
    // in the first place. An effort-only draft never reaches this branch,
    // even with `resolvedBaselines === null` — see the build effect's own
    // identical gate above, and `blocksWithoutBaselines`'s own comment for
    // why BOTH must share this exact predicate.
    return <Navigate to="/session/confirm" replace />;
  }

  if (built === null) {
    // Both hooks above are "ready"-settled by this point (every loading/
    // error/unset-baselines branch above already returned otherwise), so
    // this is only the single render between that settling and the build
    // effect above committing its state — a true loading state, not a
    // stuck one.
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

  // Un-start the draft AND drop the run this screen already built — both,
  // together, are what makes CANCEL coherent (Phase 6B Task 2's own report
  // flagged the loop without this: ConfirmTargets redirects a STARTED draft
  // straight past its editable form, so navigating there with `startedAt`
  // still set would bounce right back here/to the timer instead of letting
  // the rower re-edit). Clearing the run too keeps the two keys from
  // disagreeing about whether a session is in progress — draft.ts's own
  // `cancelStart` doc comment carries the same reasoning. A named function
  // (not an inline arrow closing over `draft` directly), with its own
  // defensive re-check, same reasoning as `ConfirmTargets.tsx`'s
  // `handleStart`: TS's control-flow narrowing of `draft` from the guard
  // clause above doesn't propagate into a closure defined this much later
  // in the same function body.
  function handleCancel() {
    if (draft === null) return;
    saveDraft(cancelStart(draft));
    clearRun();
    navigate("/session/confirm");
  }

  return (
    <main className="screen countdown-screen">
      <p className="countdown-label">GET ON THE HANDLE</p>
      <p className="countdown-number">{remaining}</p>
      <p className="countdown-next">{nextLabel}</p>
      <div className="countdown-actions">
        <button
          type="button"
          className="countdown-cancel"
          onClick={handleCancel}
        >
          CANCEL
        </button>
        <button
          type="button"
          className="countdown-skip"
          onClick={() =>
            // `replace`, not push (whole-branch review, F1): SKIP hands off
            // to the live timer exactly like the auto-advance-at-zero branch
            // below already does (`<Navigate replace>`) — a plain push would
            // leave THIS countdown mount reachable via browser BACK, and
            // re-mounting it is exactly what used to rebuild/overwrite the
            // run Timer had already started progressing.
            navigate("/session/run", { replace: true })
          }
        >
          SKIP ›
        </button>
      </div>
    </main>
  );
}
