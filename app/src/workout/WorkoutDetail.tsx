import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useWorkouts } from "../api/useWorkouts";
import type { LibraryWorkout } from "../api/useWorkouts";
import { usePreferences } from "../api/usePreferences";
import { useBaselines } from "../api/useBaselines";
import {
  probeBluetoothStatus,
  type BluetoothCapability,
} from "../adapters/bluetoothCapability";
import { estimateMinutes } from "../../domain/expand.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import { needsBaselines } from "../../domain/needsBaselines.js";
import { isPaceWordRef, resolveSplit } from "../../domain/pace.js";
import type { Baselines } from "../../domain/types.js";
import { MIN_SPLIT, MAX_SPLIT } from "../you/baselineDraft";
import { buildNudgedDraft, saveDraft, startDraft } from "../session/draft";
import { buildRun, type EnginePhase } from "../session/engine";
import { buildLogSeed } from "../session/logDraft";
import { clearRun } from "../session/run";
import {
  currentUnretired as currentUnretiredHandoff,
  retire as retireHandoff,
} from "../monitor/handoffStore";
import ConnectAction, {
  type ConnectionEntryIntent,
} from "../monitor/ConnectAction";
import { discardStagedRetire } from "../monitor/handoffStore";
import type { ConnectionAttemptTrace } from "../monitor/nfc/connectionAttemptTrace";
import {
  useNfcEntry,
  type NfcCapabilityState,
} from "../monitor/nfc/useNfcEntry";
import type { RunIdentity } from "../monitor/useMonitorSession";
import type {
  ConnectionAttemptId,
  MonitorDiscoveryRequest,
} from "../../domain/monitor/types.js";
import { ARM_TIMEOUT_MS } from "../session/useStagedDiscard";
import { useStartWorkout } from "../session/useStartWorkout";
import UnsavedWorkoutWarning from "../session/UnsavedWorkoutWarning";
import BackLink from "../shell/BackLink";
import TypeBadge from "../components/TypeBadge";
import StepRow from "./StepRow";
import ConnectedInterstitial, { loadLastDevice } from "./ConnectedInterstitial";

/** The Connect button's own three states (handoff §1): a real, available
 *  radio; the adapter present but switched off (Chromium can tell us this
 *  via `getAvailability()`); and no Web Bluetooth API on this
 *  browser at all (Safari, Firefox, a non-secure context). Native is
 *  always "available": the Capacitor plugin owns permission/off detection
 *  at connect time. `"unknown"` is the brief instant before the async
 *  probe resolves — rendered identically to `"available"` so the button
 *  never flashes a dashed state it may not deserve. The probe lives in the
 *  bluetoothCapability adapter now. */
type BluetoothStatus = "unknown" | BluetoothCapability;

function useBluetoothStatus(): BluetoothStatus {
  const [status, setStatus] = useState<BluetoothStatus>("unknown");
  useEffect(() => {
    let cancelled = false;
    void probeBluetoothStatus().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const workoutsState = useWorkouts();
  const baselinesState = useBaselines();
  const preferencesState = usePreferences();

  // Phase RW PR C: `preferencesState` is in this guard because the caption's
  // "Set one up" needs the writer to clear the skip. Without it the caption
  // renders while `/api/prefs` is still in flight, `onSetOneUp` is null, and
  // the tap falls through to a bare navigate — landing a skipped rower on
  // Today's own "Set one up" row, the double-offer the phase's antagonist
  // pass raised as blocking (branch review, finding 2). The three fetches
  // start together, so this costs nothing unless prefs is the slowest.
  if (
    workoutsState.state === "loading" ||
    baselinesState.state === "loading" ||
    preferencesState.state === "loading"
  ) {
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
      // Phase RW PR C (spec §2.1): the caption's "Set one up" clears the
      // skip on the way to Today, so a skipped rower lands on the doors
      // card rather than on Today's own "Set one up" row. Null while
      // preferences are loading or errored — the caption falls back to
      // navigating, which is what it did before this PR.
      // Null only when preferences ERRORED (loading is guarded above): the
      // caption still navigates, so a rower is never trapped on this screen
      // by a failed fetch.
      onSetOneUp={
        preferencesState.state === "ready"
          ? () => preferencesState.setBaselinesSkipped(false)
          : null
      }
      // Which side IS stored when the pair collapses to null: the caption
      // must not tell a rower with a tested 2k that they have no baseline.
      halfPairSide={
        baselines !== null
          ? null
          : baselinesState.baselines.k2Seconds !== null
            ? "k2"
            : baselinesState.baselines.k6Seconds !== null
              ? "k6"
              : null
      }
    />
  );
}

function WorkoutDetailView({
  workout,
  baselines,
  onSetOneUp,
  halfPairSide,
}: {
  workout: LibraryWorkout;
  baselines: Baselines | null;
  onSetOneUp: (() => Promise<boolean>) | null;
  halfPairSide: "k2" | "k6" | null;
}) {
  // Session-only preview nudges, keyed by the RAW step index (the handoff's
  // model: one nudge covers a whole repeat block, since we render
  // workout.steps directly rather than the expanded per-repetition list) —
  // never persisted to localStorage. Phase 7B Task 5: Connect (via
  // `buildNudgedDraft`, `../session/draft`) and its own "Row on the phone
  // timer instead" escape both bake the current value in before committing
  // to a session; fast-follow Task 4 closes the gap this comment used to
  // flag — Start's own `useStartWorkout(workout, nudges)` call below now
  // threads the SAME live state through, so one nudge model feeds every
  // door off this screen.
  const [nudges, setNudges] = useState<Record<number, number>>({});
  const [connectError, setConnectError] = useState<string | null>(null);
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
    /** Phase NF: how the interstitial finds the monitor for THIS attempt. */
    request: MonitorDiscoveryRequest;
    /** Phase NF: the attempt's trace, when the NFC route produced one. */
    trace?: ConnectionAttemptTrace;
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
  // Phase NF: the reader, the capability probe, the busy/accepted flags and
  // the live attempt's abort owner all live in `useNfcEntry` (shared with
  // Just Row since the follow-on); this screen only routes the outcome.
  const nfc = useNfcEntry();
  // "Row on the phone timer instead"'s OWN saveDraft failure (below) — kept
  // separate from `useStartWorkout`'s own `startError` since this flow
  // never goes through the hook at all (Connect's own guard, not Start's,
  // already cleared before this escape is reachable); rendered into the
  // SAME error slot below because it's the identical message class, never
  // both truthy at once in practice (one screen, one attempt at a time).
  const [rowInsteadError, setRowInsteadError] = useState<string | null>(null);
  // Phase 6I Task 4 — extracted into `session/useStartWorkout.ts` so any
  // second caller (Phase 6I's BaselineCard then; nothing today — Phase BL
  // PR C's doors card is pure navigation) gets the
  // SAME unlogged-run staged confirm, live-MonitorRun confirm, draft
  // build/save, and cross-clears, rather than a duplicated (or skipped) copy
  // that would reintroduce the F5 data-loss class. The hook's own doc
  // comments carry the staged-confirm/severity-ordering rationale that used
  // to live here. `nudges` (fast-follow spec §3, entry 2): this screen's own
  // live preview state, so Start bakes in the SAME targets Connect and "Row
  // instead" already do.
  const {
    replaceStage,
    startError,
    handleStart,
    confirmReplace,
    cancelReplace,
    unsavedCount,
  } = useStartWorkout(workout, nudges);
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
  function handleConnectProceed(attemptId: ConnectionAttemptId) {
    proceedWithRequest({ kind: "picker", attemptId });
  }

  // Phase NF: the NFC attempt itself lives in `useNfcEntry` (the follow-on
  // made Just Row a second caller). This screen supplies the two things
  // that differ per screen: where a decoded target goes (the interstitial,
  // via `proceedWithRequest`) and where an inline outcome renders.
  function handleNfcProceed(attemptId: ConnectionAttemptId) {
    setConnectError(null);
    void nfc.run(attemptId, {
      onTarget: (request, trace) => proceedWithRequest(request, trace),
      onInlineError: setConnectError,
    });
  }

  function handleEntryProceed(intent: ConnectionEntryIntent) {
    if (intent.kind === "nfc") {
      handleNfcProceed(intent.attemptId);
      return;
    }
    handleConnectProceed(intent.attemptId);
  }

  /** Compiles THIS workout at its preview-nudged targets and mounts the
   *  interstitial with `request`. Returns whether the handoff happened; a
   *  `false` return has already shown its inline reason AND discarded the
   *  attempt's staged receipt (spec §3: every pre-handoff terminal path). */
  function proceedWithRequest(
    request: MonitorDiscoveryRequest,
    trace?: ConnectionAttemptTrace,
  ): boolean {
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
    // Phase RW PR B: no baseline gate. A split ref with no baseline
    // compiles as an effort-kind phase (no pace target on the wire), the
    // same shape the effort-only onboarding workouts have always programmed.
    const draft = buildNudgedDraft(workout, nudges);
    const run = buildRun(draft, baselines, new Date());
    const compiled = compileProgram(run.phases);
    if ("code" in compiled) {
      setConnectError(compiled.message);
      discardStagedRetire(request.attemptId);
      return false;
    }
    const nudgedCount = Object.values(nudges).filter((v) => v !== 0).length;
    // 7C Task 1: the log seed, built from the SAME `run.phases` `compiled`
    // was just built from, at this same moment — the one point the connect
    // path ever has an `EnginePhase[]` to hand (`session/logDraft.ts`'s own
    // `buildLogSeed` doc comment: the connect path persists no draft for a
    // later screen to recover labels from instead).
    const logSeed = buildLogSeed(run.phases, baselines);
    setConnecting({
      program: compiled,
      phases: run.phases,
      identity: { workoutId: workout.id, title: workout.title, logSeed },
      baselines,
      nudgedCount,
      request,
      ...(trace !== undefined ? { trace } : {}),
    });
    return true;
  }

  // Cancel, from any interstitial state: lands back on Workout detail, and
  // this function itself destroys nothing — it drops the interstitial and
  // re-reads the caption in case this was the rower's first successful pair.
  //
  // "Nothing lost" is true of a `SessionRun` always, and of a `MonitorRun`
  // only BEFORE the wire "armed" event: reaching armed IS the acceptance
  // point (spec §5), so it has already retired the staged record and a
  // Cancel from the "ready" screen cannot undo that. Sanctioned, not a leak
  // — `ConnectAction.tsx`'s own corrected paragraphs carry the mechanism,
  // and `useMonitorSession.test.ts`'s "arm then Cancel: the accepted loss"
  // pins it.
  function handleInterstitialExit() {
    setConnecting(null);
    setLastDevice(loadLastDevice());
  }

  // State 6's "Row on the phone timer instead" — the existing Start path,
  // but with the SAME nudged targets Connect was about to send (the escape
  // hatch's own copy promises "targets intact" and must actually keep that
  // promise). Mirrors `confirmReplace`'s cross-clear AND its `startDraft`
  // stamp exactly (fast-follow spec §3: every rewired entry point stamps
  // `startedAt` at the same moment it navigates to the countdown) — this
  // commits to a phone session just as surely.
  //
  // Hand-off store design spec §5, plan Task 5: the legacy `clearMonitorRun()`
  // is gone. This is the CENSUS'S "row-instead" row: this site has no
  // confirm of its own — it is a single-tap escape in the interstitial's
  // failure card, reachable only after `program()` FAILED, which means
  // the guard's own staged authorization was never executed here:
  // `ConnectAction.tsx`'s "armed" retire (spec §5's "armed acceptance"
  // row, `useMonitorSession.ts`) only fires on a SUCCESSFUL connect —
  // "Connect -> program -> armed | failure-card" (spec §5's census), armed
  // and failure-card are the two ALTERNATIVE outcomes of program(), never
  // both. **CORRECTED (Task 5 review fix round, 2026-08-30): a first
  // draft of this comment claimed the guard's retire "has usually already"
  // run by the time this door fires — false; on this door's own path it
  // never runs at all** (the staged set is DISCARDED, not retired, by
  // `useMonitorSession.ts`'s own `cancel()` — `ConnectedInterstitial.tsx`'s
  // own `handleRowInstead` calls `session.cancel()` immediately before
  // `onRowInstead`, and `cancel()` runs synchronously to completion for a
  // FAILED phase, so the discard has already happened by the time this
  // function runs). This fresh, non-render `currentUnretired()` read is
  // therefore the FIRST and ONLY thing that retires the leftover record
  // on the fail-then-row-instead path — matching `useStartWorkout.ts`'s
  // own `confirmReplace` (Task 5's other door): whatever remains gets
  // retired, key-bound; "nothing found -> nothing emitted" (§1) only when
  // there was genuinely nothing to protect in the first place.
  function handleRowInstead() {
    setConnecting(null);
    const draft = startDraft(buildNudgedDraft(workout, nudges));
    if (saveDraft(draft)) {
      clearRun();
      const stale = currentUnretiredHandoff();
      if (stale !== null) {
        retireHandoff(
          [{ sessionKey: stale.sessionKey, revision: stale.revision }],
          "row-instead",
        );
      }
      navigate("/session/countdown");
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
        request={connecting.request}
        trace={connecting.trace}
      />
    );
  }

  // Phase RW PR A: with no baseline the estimate is priced off the assumed
  // pair and reads with a tilde; a time-only workout prices exactly either
  // way and is never marked (`estimateMinutes`, domain/expand.ts).
  const minutesEstimate = estimateMinutes(workout.steps, baselines);
  const minutesLabel = `${minutesEstimate.assumed ? "~" : ""}${minutesEstimate.minutes} MIN`;
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
      // PaceWord refs do not have a resolved split; guard against accidentally
      // calling resolveSplit with them. (Review finding L2: structural
      // defense-in-depth to prevent future nudge paths from introducing an
      // unguarded call; StepRow.tsx:155 already prevents nudge buttons from
      // rendering for efforts, but Phase 6's timer may add other nudge paths.)
      if (isPaceWordRef(step.ref)) {
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
          <span className="workout-row-custom">MY WORKOUTS</span>
        )}
      </div>
      <h1 className="workout-detail-title">{workout.title}</h1>
      <p className="mono-status">
        {minutesLabel} · EFFORT {workout.effort}/5 · {daysLabel}
      </p>
      {/* Phase RW PR B: nudging needs a resolved split, and `StepRow` only
          renders the nudge controls when one exists — so with no baseline
          this note would head a list with nothing to nudge (branch review,
          finding 9). The caption under the actions says what the words are
          instead. */}
      {baselines !== null && (
        <p className="workout-detail-note">PREVIEW · NUDGE ANY TARGET</p>
      )}
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
          action — Connect / Start Timer / Log it after / Edit / a rule /
          Delete workout — not two separate divs the way this used to split
          Start/Log it after from OwnerActions' own Edit/Delete. OwnerActions
          still owns its own wrapping element below (`.workout-owner-actions`,
          kept for e2e/builder.spec.ts's existing "absent for a global
          workout" check) but renders `display: contents` (index.css) so its
          children are this stack's own direct flex items, not a nested box
          breaking the 12px gap rhythm. */}
      <div className="action-stack workout-detail-actions">
        {/* Fast-follow spec §4 (James's ruling 3, §2): Connect holds L1
            geometry, its own `--action-connect` blue, FIRST in the stack,
            ahead of Start Timer. Supersedes the old "second in the stack,
            after Start" ordering (`ConnectAction.tsx`'s own doc comment
            carries the history). Phase NF (Gate 0, James's ruling 4) then
            made it ONE OF TWO equal hardware primaries: on an NFC-capable
            iPhone, `Scan NFC` sits directly above it at the same 56 px;
            everywhere else Connect is still the single primary. Both live
            inside `ConnectAction`, which owns the trigger AND the staged
            confirm guard end to end; this block adds only presentation
            around it: the caption and the Bluetooth-off/absent dashed
            treatment — both travel with it to its new position, unchanged. */}
        <ConnectBlock
          bluetoothStatus={bluetoothStatus}
          lastDevice={lastDevice}
          onProceed={handleEntryProceed}
          nfcCapability={nfc.capability}
          busy={nfc.busy}
          accepted={nfc.accepted}
        />
        {connectError && <p className="baseline-error">{connectError}</p>}
        {/* Start Timer — spec §4: renamed from "Start" and demoted from L1
            to L2 now that the hardware primaries hold L1. Phase RW PR B
            removed the `startBlocked` arm this ternary used to open with:
            nothing gates Start on a baseline any more. */}
        {replaceStage === null ? (
          <button type="button" className="button-l2" onClick={handleStart}>
            Start Timer
          </button>
        ) : replaceStage === "unlogged" ? (
          <UnsavedWorkoutWarning
            count={unsavedCount}
            replacement="Starting a new one"
            replaceLabel="Replace session"
            onReplace={confirmReplace}
            onCancel={cancelReplace}
            onView={() => {
              cancelReplace();
              void navigate("/today");
            }}
          />
        ) : (
          <div className="baseline-confirm">
            <p className="baseline-confirm-line">
              A session is in progress. Replace it?
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
        {/* The manual door. Ungated since Phase RW PR B: every workout can
            be logged with or without a baseline (the KNOWN GAP this comment
            used to record, `ManualDoorLog`'s own bare `baselines === null`
            block, went with it). A plain `Link` (not a `navigate()`
            button): a one-way hand-off to a new route, the same idiom
            `OwnerActions`' own Edit link below uses. */}
        <Link
          to={`/library/${workout.id}/log`}
          state={{ from }}
          className="button-l2"
        >
          Log it after
        </Link>
        {/* Phase RW PR B (spec §2.1, Gate 0 copy): one quiet caption while
            this workout has numbers waiting behind a baseline. Effort-only
            workouts show nothing. */}
        {baselines === null && needsBaselines(workout.steps) && (
          <p className="workout-detail-caption">
            {halfPairSide === null
              ? "Targets are words until you set a baseline. "
              : `Your ${halfPairSide === "k2" ? "2k" : "6k"} is set. Targets stay words until the ${halfPairSide === "k2" ? "6k" : "2k"} is too. `}
            {/* Phase RW PR C (spec §2.1): this CLEARS the skip on the way,
                so the rower lands on the doors card. A plain Link would
                land a skipped rower on Today's return row, showing the
                same three words a second time for one job. */}
            <button
              type="button"
              className="workout-detail-caption-link"
              onClick={() => {
                // Clear the skip, then go — the navigation happens either
                // way, so a failed write never traps the rower here.
                const go = () => {
                  void navigate("/today");
                };
                if (onSetOneUp === null) {
                  go();
                  return;
                }
                void onSetOneUp().then(go, go);
              }}
            >
              {/* Naming the missing side: "Set one up" is the same class of
                  falsehood this caption exists to fix when the rower has
                  one up already. Both labels lead to the same place —
                  Today, with the skip cleared — which now carries the
                  half-set row and its one-tap offer rather than the doors
                  card. */}
              {halfPairSide === null
                ? "Set one up"
                : halfPairSide === "k2"
                  ? "Set your 6k"
                  : "Set your 2k"}
            </button>
          </p>
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
 *  .button-connect`, fast-follow spec §4 — retargeted from `.button-l2` in
 *  the same edit that swapped `ConnectAction`'s own class) reskinning
 *  `ConnectAction`'s own `<button>`, not a second button. The shared ConnectAction disables unsupported
 *  browsers; radio-off remains tappable so the rower can recover. */
function ConnectBlock({
  bluetoothStatus,
  lastDevice,
  onProceed,
  nfcCapability,
  busy,
  accepted,
}: {
  bluetoothStatus: BluetoothStatus;
  lastDevice: string | null;
  onProceed: (intent: ConnectionEntryIntent) => void;
  nfcCapability: NfcCapabilityState;
  busy: boolean;
  accepted: boolean;
}) {
  const dashed = bluetoothStatus === "off" || bluetoothStatus === "absent";
  return (
    <div
      className={
        dashed ? "connect-block connect-block-dashed" : "connect-block"
      }
    >
      <ConnectAction
        onProceed={onProceed}
        nfcCapability={nfcCapability}
        busy={busy}
        accepted={accepted}
      />
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
