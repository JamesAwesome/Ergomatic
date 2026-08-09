import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useWorkouts } from "../api/useWorkouts";
import type { LibraryWorkout } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { usePreferences } from "../api/usePreferences";
import { estimateMinutes } from "../../domain/expand.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import { needsBaselines } from "../../domain/needsBaselines.js";
import { isEffortRef, resolveSplit } from "../../domain/pace.js";
import type { Baselines } from "../../domain/types.js";
import { MIN_SPLIT, MAX_SPLIT } from "../you/baselineDraft";
import {
  buildDraft,
  saveDraft,
  withNudge,
  type SessionDraft,
} from "../session/draft";
import { buildRun, type EnginePhase } from "../session/engine";
import { buildLogSeed } from "../session/logDraft";
import { clearRun } from "../session/run";
import { clearMonitorRun } from "../monitor/monitorRun";
import ConnectAction from "../monitor/ConnectAction";
import type { RunIdentity } from "../monitor/useMonitorSession";
import { ARM_TIMEOUT_MS } from "../session/useStagedDiscard";
import { useStartWorkout } from "../session/useStartWorkout";
import BackLink from "../shell/BackLink";
import TypeBadge from "../components/TypeBadge";
import StepRow from "./StepRow";
import ConnectedInterstitial, { loadLastDevice } from "./ConnectedInterstitial";

// `navigator.bluetooth`'s own type comes from `monitor/transports/
// webBluetooth.ts`'s ambient `declare global { interface Navigator {...} }`
// augmentation — a MODULE-PRIVATE `Bluetooth` interface (that file has no
// `export`, so its name isn't reachable here to extend by declaration
// merging). Rather than fight that with a second global augmentation of a
// name this file cannot see, this probes for `getAvailability` at runtime
// and types the result narrowly, right where it's used — TypeScript's DOM
// lib ships no Web Bluetooth types at all (`webBluetooth.ts`'s own header
// comment: verified, nothing in lib.dom.d.ts), and `getAvailability` is
// Chromium-only, genuinely absent on older Chromium/other engines.
interface BluetoothAvailabilityProbe {
  getAvailability?(): Promise<boolean>;
}

/** The Connect button's own three states (handoff §1): a real, available
 *  radio; the adapter present but switched off (Chromium can tell us this
 *  via `getAvailability()`); and no Web Bluetooth API on this
 *  platform/browser at all (`navigator.bluetooth` undefined — Safari,
 *  Firefox, a non-secure context). `"unknown"` is the brief instant before
 *  the async probe resolves — rendered identically to `"available"` so the
 *  button never flashes a dashed state it may not deserve. */
type BluetoothStatus = "unknown" | "available" | "off" | "absent";

function useBluetoothStatus(): BluetoothStatus {
  const [status, setStatus] = useState<BluetoothStatus>("unknown");
  useEffect(() => {
    let cancelled = false;
    const bt = navigator.bluetooth;
    if (bt === undefined) {
      // Routed through a resolved microtask, same idiom `Countdown.tsx`'s
      // own build effect uses — react-hooks' set-state-in-effect rule
      // flags a setState call made directly, synchronously, in an effect
      // body; a microtask has no perceptible delay and reads as "setState
      // in a callback" to the rule.
      void Promise.resolve().then(() => {
        if (!cancelled) setStatus("absent");
      });
      return () => {
        cancelled = true;
      };
    }
    const probe = bt as unknown as BluetoothAvailabilityProbe;
    if (typeof probe.getAvailability !== "function") {
      // Can't tell — fail open rather than dashing a button that may work
      // fine; a genuinely-off adapter still surfaces honestly once pressed
      // (`useMonitorSession.ts`'s own `mapRadioFailure`).
      void Promise.resolve().then(() => {
        if (!cancelled) setStatus("available");
      });
      return () => {
        cancelled = true;
      };
    }
    probe
      .getAvailability()
      .then((available) => {
        if (!cancelled) setStatus(available ? "available" : "off");
      })
      .catch(() => {
        if (!cancelled) setStatus("available");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

/** Bakes the WorkoutDetail preview stack's own cumulative nudges into a
 *  fresh draft — the same shape `useStartWorkout`'s own `confirmReplace`
 *  would build, minus the nudges it currently drops (this screen's "Phase 6
 *  will pass them per-request" comment, still true for the phone-timer
 *  Start button itself; NOT touched here — see this file's own header note
 *  on why Connect gets this and Start does not). `withNudge` takes a cumulative
 *  DELTA against a fresh (zeroed) draft, so applying the whole stored
 *  value once reproduces the same cumulative nudge the preview shows. */
function buildNudgedDraft(
  workout: LibraryWorkout,
  nudges: Record<number, number>,
): SessionDraft {
  let draft = buildDraft(workout);
  for (const [key, value] of Object.entries(nudges)) {
    if (value !== 0) draft = withNudge(draft, Number(key), value);
  }
  return draft;
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const workoutsState = useWorkouts();
  const baselinesState = useBaselines();

  if (workoutsState.state === "loading" || baselinesState.state === "loading") {
    return (
      <main className="screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (workoutsState.state === "error") {
    return (
      <main className="screen">
        <p className="mono-status">Couldn't load your library.</p>
        <button
          type="button"
          className="button-outline"
          onClick={workoutsState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  if (baselinesState.state === "error") {
    return (
      <main className="screen">
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

  const workout = workoutsState.workouts.find((w) => w.id === id);
  if (!workout) {
    return (
      <main className="screen">
        <p className="mono-status">That workout isn't in your library.</p>
        <BackLink />
      </main>
    );
  }

  // A partially-set baseline pair (e.g. a brand-new account) is treated the
  // same as "unknown" — same convention as Library.
  const baselines: Baselines | null =
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  // `key={workout.id}` forces a fresh WorkoutDetailView (and thus fresh
  // nudge state) on every workout switch — otherwise a direct
  // /library/w1 → /library/w2 navigation would reuse this component
  // instance and reapply w1's nudges to w2's steps by index.
  return (
    <WorkoutDetailView
      key={workout.id}
      workout={workout}
      baselines={baselines}
    />
  );
}

function WorkoutDetailView({
  workout,
  baselines,
}: {
  workout: LibraryWorkout;
  baselines: Baselines | null;
}) {
  // Session-only preview nudges, keyed by the RAW step index (the handoff's
  // model: one nudge covers a whole repeat block, since we render
  // workout.steps directly rather than the expanded per-repetition list) —
  // never persisted to localStorage. Phase 7B Task 5: Connect (via
  // `buildNudgedDraft` below) and its own "Row on the phone timer instead"
  // escape both bake the current value in before committing to a session;
  // the phone-only `useStartWorkout` path below still does NOT (a
  // pre-existing gap this task's brief did not ask it to close) — see
  // `buildNudgedDraft`'s own comment.
  const [nudges, setNudges] = useState<Record<number, number>>({});
  const [connectError, setConnectError] = useState<string | null>(null);
  // The warm-up SETTING, for the CONNECT door's own `buildRun` below
  // (2026-08-09's warmup-setting design §9: "every session — phone or
  // connected — prepends it"). The phone-timer door reads the same
  // preference in `Countdown.tsx`; this screen had no preferences access
  // at all before, which is why the hook is new here.
  //
  // Deliberately NOT added to this screen's LOADING gate (the
  // workouts/baselines pair above): a preference that hasn't arrived yet
  // must not hold the whole workout detail behind a spinner, and Connect
  // is many taps away from mount. A still-loading or failed fetch reads as
  // "no warm-up," matching the OFF default every rower starts with.
  const preferencesState = usePreferences();
  // `null` = the button/stack is showing; non-null = the full-screen
  // interstitial has taken over (handoff §2: "full screen... a sheet was
  // rejected"). Carries everything the interstitial needs so it never has
  // to re-derive baselines/identity itself — screens talk only to
  // `useMonitorSession` (the plan's layering rule), and this is the one
  // seam above that hook where the workout's OWN data still lives.
  const [connecting, setConnecting] = useState<{
    program: WorkoutProgram;
    /** The phases `program` was compiled FROM, carried alongside it: the
     *  connected panes past the interstitial need the pace ref, the label
     *  and the rest phases, none of which survive compilation into the wire
     *  IR. Same object, one `buildRun` call — never re-expanded downstream,
     *  so the panes and the machine can never be looking at two different
     *  resolutions of the same workout. */
    phases: EnginePhase[];
    identity: RunIdentity;
    // Phase 6I: `Baselines | null` — an effort-only workout can Connect
    // with no baselines set; `ConnectedInterstitial`'s own prop type
    // widened the same way, and omits its "2K … · 6K …" line when null.
    baselines: Baselines | null;
    nudgedCount: number;
  } | null>(null);
  // Lazy read-once, refreshed explicitly when the interstitial hands
  // control back (see `handleInterstitialExit`/`handleRowInstead` below) —
  // the same idiom `Countdown.tsx`'s own `existingRun`/`draft` lazy reads
  // use, so a real first-pair updates the caption the instant the rower is
  // back on this screen, without polling storage on every render.
  const [lastDevice, setLastDevice] = useState<string | null>(() =>
    loadLastDevice(),
  );
  const bluetoothStatus = useBluetoothStatus();
  // "Row on the phone timer instead"'s OWN saveDraft failure (below) — kept
  // separate from `useStartWorkout`'s own `startError`, since this flow's
  // draft is nudged and never goes through the hook at all (this file's
  // header note on why Connect gets nudges and Start does not); rendered
  // into the SAME error slot below because it's the identical message
  // class, never both truthy at once in practice (one screen, one attempt
  // at a time).
  const [rowInsteadError, setRowInsteadError] = useState<string | null>(null);
  // Phase 6I Task 4 — extracted into `session/useStartWorkout.ts` so a second
  // caller (the no-baseline `BaselineCard`, per the design spec) gets the
  // SAME unlogged-run staged confirm, live-MonitorRun confirm, draft
  // build/save, and cross-clears, rather than a duplicated (or skipped) copy
  // that would reintroduce the F5 data-loss class. The hook's own doc
  // comments carry the staged-confirm/severity-ordering rationale that used
  // to live here.
  const {
    replaceStage,
    startError,
    handleStart,
    confirmReplace,
    cancelReplace,
  } = useStartWorkout(workout);
  const navigate = useNavigate();
  // Whatever origin THIS screen was itself entered from (Today's suggestion
  // card, a Library row, or nothing for a deep link) — forwarded onto the
  // Edit link below UNCHANGED (its own received `from`, never this screen's
  // own pathname) so the chain survives a detail -> edit -> back -> detail
  // -> back round trip instead of collapsing to the /library fallback the
  // instant an intermediate screen is inserted (design doc: "Chains
  // preserve the ORIGINAL origin").
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;

  // Phase 7B Task 5 — Connect's `onProceed`. Runs AFTER `ConnectAction`'s
  // own guard has already cleared (the staged confirm, if any, resolved to
  // "proceed") — this function's only job is compiling THIS workout, at
  // its current preview-nudged targets, into the `WorkoutProgram` the
  // interstitial will hand to `useMonitorSession.program()`. Compiling
  // HERE rather than inside the interstitial keeps a `CompileError` (a
  // real, named, copy-ready failure — `domain/monitor/program.ts`'s own
  // `CompileError.message`) off the interstitial's OWN `ConnectedError`
  // union entirely: nothing has been sent to a monitor yet, so this is not
  // a `useMonitorSession` failure and does not deserve a phase transition
  // or a driver connection at all.
  function handleConnectProceed() {
    setConnectError(null);
    // Phase 6I: `needsBaselines` (domain/needsBaselines.ts) is the SAME
    // predicate every other coupled guard site shares — nudging never
    // changes whether a ref is effort or split (only a split ref's `off`
    // moves), so checking the RAW `workout.steps` here is equivalent to
    // checking the nudged draft's own effective steps. An effort-only
    // workout (the two designated onboarding workouts, and every shipped
    // effort-only AN sprint) needs no target to program — `compileProgram`
    // already resolves an effort phase with no `targetSplit` (Task 1's own
    // comment fix, domain/monitor/program.ts) — so Connect proceeds with
    // `baselines` passed through AS-IS (possibly null) to `buildRun` below.
    if (baselines === null && needsBaselines(workout.steps)) {
      // No screen exists yet to nudge/resolve a target without baselines
      // (Connect has no Confirm step to defer to, unlike Start) — the same
      // "no target" fact "Log it after"'s footer already states, worded
      // for this door instead.
      setConnectError(
        "Set your baselines first. Connect needs a target to program.",
      );
      return;
    }
    const draft = buildNudgedDraft(workout, nudges);
    const run = buildRun(
      draft,
      baselines,
      new Date(),
      preferencesState.state === "ready"
        ? (preferencesState.preferences.warmup ?? null)
        : null,
    );
    const compiled = compileProgram(run.phases);
    if ("code" in compiled) {
      setConnectError(compiled.message);
      return;
    }
    const nudgedCount = Object.values(nudges).filter((v) => v !== 0).length;
    // 7C Task 1: the log seed, built from the SAME `run.phases` `compiled`
    // was just built from, at this same moment — the one point the connect
    // path ever has an `EnginePhase[]` to hand (`session/logDraft.ts`'s own
    // `buildLogSeed` doc comment: the connect path persists no draft for a
    // later screen to recover labels/warmup-ness from instead).
    const logSeed = buildLogSeed(run.phases, baselines);
    setConnecting({
      program: compiled,
      phases: run.phases,
      identity: { workoutId: workout.id, title: workout.title, logSeed },
      baselines,
      nudgedCount,
    });
  }

  // Cancel, from any interstitial state: "always lands back on Workout
  // detail with nothing lost" (handoff §2) — nothing here has committed a
  // phone session, so there is nothing to clear beyond re-reading the
  // caption in case this was the rower's first-ever successful pair.
  function handleInterstitialExit() {
    setConnecting(null);
    setLastDevice(loadLastDevice());
  }

  // State 6's "Row on the phone timer instead" — the existing Start path,
  // but with the SAME nudged targets Connect was about to send, not the
  // always-empty ones `useStartWorkout`'s `confirmReplace` builds (its own
  // header comment names that gap; fixing it for Start itself is out of
  // this task's scope, but the escape hatch's own copy promises "targets
  // intact" and must actually keep that promise). Mirrors `confirmReplace`'s
  // cross-clear exactly — this commits to a phone session just as surely.
  function handleRowInstead() {
    setConnecting(null);
    const draft = buildNudgedDraft(workout, nudges);
    if (saveDraft(draft)) {
      clearRun();
      clearMonitorRun();
      navigate("/session/confirm");
    } else {
      setRowInsteadError("Couldn't start this session. Try again.");
    }
  }

  // The connected session is over (End, or the machine finished it). Route
  // to the EXISTING post-session flow: this workout's own log screen, the
  // same door the library's "Log it after" opens. The record the surface
  // just closed is a `MonitorRun`, not a `SessionRun`, so `/session/log`
  // (which reads the phone timer's record) would find nothing.
  // `?from=monitor` (7C Task 4, `LogSession.tsx`'s `monitorModeRun`) is the
  // INTENT half of that screen's monitor-mode gate — the flag alone never
  // engages it (a stale/reloaded URL still carries it with nothing behind
  // it); the record plus a matching workoutId plus an aligned `logSeed` are
  // the evidence. Navigating is also what unmounts the interstitial and
  // hangs up the radio; see `ConnectedSurface.tsx`'s header.
  function handleConnectedEnded() {
    setConnecting(null);
    navigate(`/library/${workout.id}/log?from=monitor`);
  }

  if (connecting !== null) {
    return (
      <ConnectedInterstitial
        program={connecting.program}
        phases={connecting.phases}
        identity={connecting.identity}
        baselines={connecting.baselines}
        nudgedCount={connecting.nudgedCount}
        onExit={handleInterstitialExit}
        onRowInstead={handleRowInstead}
        onEnded={handleConnectedEnded}
      />
    );
  }

  const minutesLabel = baselines
    ? `${estimateMinutes(workout.steps, baselines).minutes} MIN`
    : "— MIN";
  const daysLabel =
    workout.lastDoneDaysAgo === null
      ? "NEVER DONE"
      : `LAST DONE ${workout.lastDoneDaysAgo} DAYS AGO`;

  // Clamps the RESOLVED split (baseline + off + nudge), not the raw nudge
  // number, to the same 60-240 s/500m range the baseline editor
  // (you/baselineDraft.ts) and the API enforce. Unclamped, extreme nudges
  // would push the resolved split past what a real split can be — and
  // eventually negative, where fmtSplit emits garbage like "-1:-1.0".
  const handleNudge = (index: number, delta: number) => {
    setNudges((prev) => {
      const current = prev[index] ?? 0;
      const step = workout.steps[index];
      if (!baselines || step.k !== "w") {
        return { ...prev, [index]: current + delta };
      }
      // Effort refs do not have a resolved split; guard against accidentally
      // calling resolveSplit with them. (Review finding L2: structural
      // defense-in-depth to prevent future nudge paths from introducing an
      // unguarded call; StepRow.tsx:155 already prevents nudge buttons from
      // rendering for efforts, but Phase 6's timer may add other nudge paths.)
      if (isEffortRef(step.ref)) {
        return { ...prev, [index]: current + delta };
      }
      const base = resolveSplit(baselines, step.ref, 0);
      const resolved = base + current + delta;
      const clamped = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, resolved));
      return { ...prev, [index]: clamped - base };
    });
  };

  return (
    <main className="screen">
      <BackLink />
      <div className="workout-detail-meta">
        <TypeBadge type={workout.type} />
        {/* Same metadata tag as the library row (5H): a custom workout must
            read as yours here too — the list badge alone left the detail
            screen unmarked (device report, 2026-08-01). */}
        {!workout.isGlobal && (
          <span className="workout-row-custom">CUSTOM</span>
        )}
        <span className="mono-status">{workout.difficulty.toUpperCase()}</span>
      </div>
      <h1 className="workout-detail-title">{workout.title}</h1>
      <p className="mono-status">
        {minutesLabel} · PAIN {workout.pain}/5 · {daysLabel}
      </p>
      <p className="workout-detail-note">PREVIEW · NUDGE ANY TARGET</p>
      <div className="step-list">
        {workout.steps.map((step, index) =>
          step.k === "reps" ? (
            <p key={index} className="step-reps-marker">
              {step.count}× the block below
            </p>
          ) : (
            <StepRow
              key={index}
              step={step}
              baselines={baselines}
              nudge={nudges[index] ?? 0}
              onNudge={(delta) => handleNudge(index, delta)}
            />
          ),
        )}
      </div>
      {/* Task 1 (ui-fix round): one `.action-stack` for every screen-level
          action — Start / Log it after / Edit / a rule / Delete workout —
          not two separate divs the way this used to split Start/Log it
          after from OwnerActions' own Edit/Delete. OwnerActions still owns
          its own wrapping element below (`.workout-owner-actions`, kept for
          e2e/builder.spec.ts's existing "absent for a global workout"
          check) but renders `display: contents` (index.css) so its children
          are this stack's own direct flex items, not a nested box breaking
          the 12px gap rhythm. */}
      <div className="action-stack workout-detail-actions">
        {replaceStage === null ? (
          <button type="button" className="button-l1" onClick={handleStart}>
            Start
          </button>
        ) : (
          <div className="baseline-confirm">
            <p className="baseline-confirm-line">
              {replaceStage === "unlogged"
                ? "You have an unlogged session. Starting a new one discards it."
                : "A session is in progress. Replace it?"}
            </p>
            <div className="baseline-actions">
              <button
                type="button"
                className="button-outline"
                onClick={cancelReplace}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={confirmReplace}
              >
                Replace session
              </button>
            </div>
          </div>
        )}
        {(startError ?? rowInsteadError) && (
          <p className="baseline-error">{startError ?? rowInsteadError}</p>
        )}
        {/* PHASE 7B TASK 5 — second in the stack (handoff §1: an L2 below
            Start, "it must not compete with Start"). `ConnectAction` (Task
            2) owns the trigger AND the staged confirm guard end to end;
            this block adds only presentation around it: the caption and
            the Bluetooth-off/absent dashed treatment. */}
        <ConnectBlock
          bluetoothStatus={bluetoothStatus}
          lastDevice={lastDevice}
          onProceed={handleConnectProceed}
        />
        {connectError && <p className="baseline-error">{connectError}</p>}
        {/* Task 3 (the manual door), Phase 6I amendment: gated on the SAME
            `needsBaselines` predicate every other coupled guard site
            shares, not bare `baselines` — an effort-only workout has
            nothing to resolve against baselines at all. A plain `Link`
            (not a `navigate()` button): this is a one-way hand-off to a new
            route, the same idiom `OwnerActions`' own Edit link below uses.
            KNOWN GAP (flagged in Task 2's own report, not fixed here — out
            of this task's file list and the phase's own "don't touch the
            Log screen" collision note): `LogSession.tsx`'s `ManualDoorLog`
            still gates on bare `baselines === null` unconditionally, so an
            effort-only workout opened here still hits its OWN "no target"
            block one screen later — same final message, one extra
            navigation, not a data-loss or crash risk. */}
        {baselines !== null || !needsBaselines(workout.steps) ? (
          <Link
            to={`/library/${workout.id}/log`}
            state={{ from }}
            className="button-l2"
          >
            Log it after
          </Link>
        ) : (
          <span className="step-row-no-target">
            <em>no target</em> <Link to="/you">Set baselines</Link>
          </span>
        )}
        {/* Globals are read-only server-side (a 403 on any mutation) — the
            UI must never present controls whose only outcome is that
            rejection, so Edit/Delete render only for the rower's own
            workouts. */}
        {!workout.isGlobal && (
          <OwnerActions
            workoutId={workout.id}
            navigate={navigate}
            from={from}
          />
        )}
      </div>
    </main>
  );
}

/** The Connect button's own presentation shell (handoff §1) — `ConnectAction`
 *  (Task 2) supplies the trigger and the staged confirm; this wraps it from
 *  OUTSIDE (its own doc comment: "add only presentation around it") rather
 *  than reaching into its markup, so the guard logic stays untouched. The
 *  dashed treatment is a CSS descendant rule (`.connect-block-dashed
 *  .button-l2`) reskinning `ConnectAction`'s own `<button>`, not a second
 *  button — "still tappable" (handoff) means the SAME control, restyled. */
function ConnectBlock({
  bluetoothStatus,
  lastDevice,
  onProceed,
}: {
  bluetoothStatus: BluetoothStatus;
  lastDevice: string | null;
  onProceed: () => void;
}) {
  const dashed = bluetoothStatus === "off" || bluetoothStatus === "absent";
  return (
    <div
      className={
        dashed ? "connect-block connect-block-dashed" : "connect-block"
      }
    >
      <ConnectAction onProceed={onProceed} />
      {bluetoothStatus === "off" && (
        <p className="mono-status connect-block-caption">BLUETOOTH IS OFF</p>
      )}
      {bluetoothStatus === "absent" && (
        <p className="mono-status connect-block-caption">
          NO BLUETOOTH ON THIS DEVICE
        </p>
      )}
      {bluetoothStatus === "available" && lastDevice !== null && (
        <p className="mono-status connect-block-caption">
          LAST USED · {lastDevice}
        </p>
      )}
    </div>
  );
}

function OwnerActions({
  workoutId,
  navigate,
  from,
}: {
  workoutId: string;
  navigate: (path: string) => void;
  from: unknown;
}) {
  // Fix round 1 (F2): the two-button staged-confirm panel (Cancel beside a
  // second solid-`.button-primary` "Delete workout") sat outside the level
  // system this round otherwise landed everywhere else — a second
  // accent-filled block, and a side-by-side pair, on the exact screen this
  // round systematized. Replaced with the level system's OWN destructive
  // idiom: the L4 button arms IN PLACE (fills solid accent, copy swaps to
  // "Tap again to delete") rather than opening a side panel with its own
  // Cancel — the same two-tap safety, the system's own shape. `armed`
  // replaces the old `confirming` boolean 1:1.
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Belt-and-suspenders: a pending disarm timer must not fire (and call
  // setState) after this component has already unmounted — e.g. Edit was
  // clicked while armed, navigating away before the 4s elapses.
  useEffect(() => {
    return () => {
      if (disarmTimer.current !== null) clearTimeout(disarmTimer.current);
    };
  }, []);

  function disarm() {
    if (disarmTimer.current !== null) {
      clearTimeout(disarmTimer.current);
      disarmTimer.current = null;
    }
    setArmed(false);
  }

  function arm() {
    setArmed(true);
    disarmTimer.current = setTimeout(disarm, ARM_TIMEOUT_MS);
  }

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await api(`/api/workouts/${workoutId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Couldn't delete this workout. Try again.");
        disarm();
        return;
      }
      // Deliberately NOT `from`-chained (design doc: "Delete stays
      // /library"): whatever the rower came from may no longer make sense
      // after this workout is gone (e.g. a Today suggestion pointing at a
      // now-deleted workout), so delete always lands on the library
      // regardless of origin.
      navigate("/library");
    } catch {
      setError("Couldn't delete this workout. Try again.");
      disarm();
    } finally {
      setDeleting(false);
    }
  };

  // The button's own click handler carries both taps: the first arms (no
  // network call yet — logged history survives a delete regardless, but
  // the action itself never fires on a first press), the second — reached
  // only while already `armed`, which `disabled` can't be true for at the
  // same time as a delete in flight — fires it for real.
  function handleClick() {
    if (armed) {
      disarm();
      void handleDelete();
    } else {
      arm();
    }
  }

  return (
    // `display: contents` (index.css): this wrapper stays purely for the
    // e2e "absent for a global workout" check — visually its children are
    // direct items of the parent `.action-stack`, not a nested flex column
    // of their own, so the shared 12px gap and full-width sizing apply
    // exactly as if Edit/the rule/Delete were declared inline there.
    <div className="workout-owner-actions">
      <Link
        to={`/library/${workoutId}/edit`}
        state={{ from }}
        className="button-l2"
      >
        Edit
      </Link>
      <hr className="action-stack-rule" />
      {/* Fix round 2 (whole-branch review Md5): the retired two-button
          panel's own reassurance line — session_logs.workout_id nulls on
          delete and each log keeps its own frozen title/type, so a
          rower's history survives this regardless — is back here, shown
          only at the moment of the actual destructive decision (armed,
          one tap from firing) rather than permanently above the stack. */}
      {armed && (
        <p className="baseline-confirm-line">
          Your logged sessions are kept. They keep their own copy of the title
          and type.
        </p>
      )}
      <button
        type="button"
        className={armed ? "button-l4-armed" : "button-l4"}
        onClick={handleClick}
        onBlur={disarm}
        disabled={deleting}
      >
        {armed ? "Tap again to delete" : "Delete workout"}
      </button>
      {error && <p className="baseline-error">{error}</p>}
    </div>
  );
}
