// The interstitial (7B Task 5, handoff §2: "full screen, seven states").
// Owns the `useMonitorSession` hook for the whole connected flow — the
// SAME instance drives the setup states this file draws AND the live
// session that follows, so the radio is never torn down and rebuilt
// mid-handoff (see the SEAM COMMENT at the bottom of this file for exactly
// where Task 6 takes over).
//
// States 1-3 (the OS chooser) are NOT built here — `picking` renders
// nothing of ours (handoff's own C2 ruling: `requestDevice` is a modal,
// single-result chooser the app never sees a device list from, so there is
// no scan UI of ours to draw underneath it). States 4 (pairing), 5
// (programming), 6 (failed) and 7 (ready) are the whole of this file.
//
// Screens talk ONLY to `useMonitorSession` (the plan's own layering rule):
// this file never imports `createPm5Driver`, a `Transport`, or
// `monitorRun.ts` directly.

import { useEffect, useRef, useState } from "react";
import { fmtSplit } from "../../domain/format.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { Baselines } from "../../domain/types.js";
import {
  useMonitorSession,
  type ConnectedError,
  type MonitorSessionDeps,
  type RunIdentity,
} from "../monitor/useMonitorSession";
import type { EnginePhase } from "../session/engine";
import ConnectedSurface from "./ConnectedSurface";

/** localStorage key for the `LAST USED · <name>` caption (handoff §1) — a
 *  plain string, not a versioned record: there is nothing here to migrate,
 *  and a missing/garbage value reads identically to "never paired"
 *  (`loadLastDevice` returning `null`), matching every other best-effort
 *  read in this codebase (`session/run.ts`'s own Resilience #5 idiom,
 *  applied to the simplest possible shape). */
export const LAST_DEVICE_KEY = "ergomatic.lastMonitorDevice";

// eslint-disable-next-line react-refresh/only-export-components
export function saveLastDevice(name: string): void {
  try {
    localStorage.setItem(LAST_DEVICE_KEY, name);
  } catch {
    // best-effort: a failed persist never interrupts the caller
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function loadLastDevice(): string | null {
  try {
    return localStorage.getItem(LAST_DEVICE_KEY);
  } catch {
    return null;
  }
}

/** Handoff §2: "Ready dwell 1.2 s." The ONE sanctioned timer in this phase
 *  (this file's own header note, and `useMonitorSession.ts`'s "NO WALL
 *  CLOCK ANYWHERE" applies to the DRIVER conversation, not this screen's
 *  own auto-advance) — it drives no session state, only which of OUR two
 *  screens (ready vs. the phase-gate below) is currently on top. */
export const READY_DWELL_MS = 1200;

/** Every reason that is NOT the machine actively refusing a workout — the
 *  five that are OURS (about the phone/radio side, never the PM5's own
 *  vocabulary — `ConnectedError`'s own doc comment in
 *  `useMonitorSession.ts`), plus `"disconnected"` (task-5 review, MEDIUM-7):
 *  it IS one of the eight `ProgramRejectionReason` values, but it says the
 *  LINK died mid-conversation, not that the PM5 looked at the workout and
 *  said no — rendering "The monitor wouldn't take it" for a link that
 *  simply went quiet is the identical mis-attribution the task-4 review
 *  caught for `link-failed` vs `bluetooth-off` one layer down, reintroduced
 *  here for a different tag. The remaining seven `ProgramRejectionReason`
 *  values are genuine machine statements and share one serif line. */
const NOT_A_MACHINE_REFUSAL = new Set<ConnectedError["reason"]>([
  "busy",
  "bluetooth-off",
  "link-failed",
  "transport-missing",
  "scan-dismissed",
  "disconnected",
]);

/** `detail` is documented as copy-ready prose (`ConnectedError`'s own doc
 *  comment) for exactly this reason: reusing it here, rather than
 *  authoring six near-duplicate serif lines, is also what keeps
 *  `link-failed`'s copy from ever drifting back onto `bluetooth-off`'s by
 *  accident — the two mappers in `useMonitorSession.ts` already write
 *  different prose for the two tags (task-4 review MEDIUM-4's own
 *  finding), so keying off `detail` inherits that distinction rather than
 *  re-deriving it. */
function failedSerifLine(error: ConnectedError): string {
  if (NOT_A_MACHINE_REFUSAL.has(error.reason)) return error.detail;
  return "The monitor wouldn't take it";
}

function ChecklistLine({
  label,
  state,
}: {
  label: string;
  state: "done" | "current" | "pending";
}) {
  return (
    <p className={`connected-checklist-line connected-checklist-${state}`}>
      <span className="connected-checklist-marker" aria-hidden="true">
        {state === "done" ? "✓" : ""}
      </span>
      {label}
    </p>
  );
}

export interface ConnectedInterstitialProps {
  program: WorkoutProgram;
  /** The SAME phase list `program` was compiled from (`buildRun`'s output on
   *  the workout detail). The interstitial itself never reads it — it is
   *  the connected surface's half of the story past the phase gate below
   *  (what each target means, and where this interval sits in the session),
   *  and `WorkoutProgram` cannot supply it: the compiled wire IR carries no
   *  pace ref, no label and no rest phase of its own. Threaded through this
   *  screen rather than re-derived below it, for the same reason
   *  `baselines`/`identity` already are: this is the last seam where the
   *  workout's own data still lives. */
  phases: EnginePhase[];
  identity: RunIdentity;
  baselines: Baselines;
  /** How many of the workout's targets were nudged before Connect was
   *  pressed (the WorkoutDetail preview stack's own nudge state) — the
   *  handoff's "WHAT THE MONITOR IS GETTING" panel names this explicitly.
   *  See the file's own header note on where this number comes from
   *  (there is no Confirm step in the Connect flow yet). */
  nudgedCount: number;
  /** Cancel, from any of states 4-7: "always lands back on Workout detail
   *  with nothing lost" (handoff §2). */
  onExit: () => void;
  /** State 6's "Row on the phone timer instead": hands off to the existing
   *  Start path with the SAME targets this screen was about to send. */
  onRowInstead: () => void;
  /** The session ended (End pressed, or the machine got there first) —
   *  route to the post-session flow. The caller navigating is what unmounts
   *  this screen, and therefore the hook, and therefore hangs up the radio;
   *  see `ConnectedSurface.tsx`'s header for that decision in full. */
  onEnded: () => void;
  /** Test-only injection point (`useMonitorSession`'s own `deps`
   *  parameter). Production callers omit this — see the file's header
   *  note on why a production `createTransport` is NOT threaded through
   *  here despite Task 4's own concern about it. */
  deps?: MonitorSessionDeps;
}

export default function ConnectedInterstitial({
  program,
  phases,
  identity,
  baselines,
  nudgedCount,
  onExit,
  onRowInstead,
  onEnded,
  deps,
}: ConnectedInterstitialProps) {
  const session = useMonitorSession(deps);
  const [dwellDone, setDwellDone] = useState(false);
  // Guards a double-press race on Try Again: two pointer events landing in
  // the same tick both read the SAME pre-update `session.phase` (React
  // batches the state write `connect()`'s synchronous phase flip makes),
  // so a `phase !== "failed"` check alone cannot tell them apart — the
  // exact shape `program()`'s own double-fire pin guards, one level up.
  const retryingRef = useRef(false);
  // Keyed on the DEVICE NAME, not merely the phase transition (self-found
  // fix, this fix round): `connect()` sets `phase: "pairing"` BEFORE
  // `await transport.connect(...)` even starts, and only sets `deviceName`
  // (in the same synchronous block that builds the driver) once that await
  // resolves. A phase-only edge trigger fires this effect the instant
  // `phase` becomes `"pairing"` — which, on any transport slower than a
  // same-microtask fake (i.e. anything with a REAL radio), can run BEFORE
  // `driverRef.current` exists, so `program()` would hit its own
  // `driver === null` guard and fail with a false "No monitor is
  // connected." while pairing is still genuinely in flight. Gating on
  // `deviceName` instead means this can only ever fire once the driver is
  // known to exist. Reset to `null` whenever `deviceName` itself goes back
  // to `null` (a fresh `connect()` cycle, including a "no device known"
  // Try Again), so the SAME device re-pairing later fires it again.
  const programmedForDeviceRef = useRef<string | null>(null);

  // Mount-once: opens the OS picker the instant this screen exists. Not
  // gated on `session.phase` — this hook's own initial phase is always
  // "idle", and Try Again below calls `connect()`/`program()` directly
  // rather than relying on this effect firing again.
  useEffect(() => {
    void session.connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session.deviceName === null) {
      programmedForDeviceRef.current = null;
      return;
    }
    if (
      session.phase === "pairing" &&
      programmedForDeviceRef.current !== session.deviceName
    ) {
      programmedForDeviceRef.current = session.deviceName;
      void session.program(program, identity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phase, session.deviceName]);

  // Handoff §1: "After a first successful pair" — the picker's own result
  // already named the device before this fires; this just remembers it for
  // the NEXT visit to the button.
  useEffect(() => {
    if (session.deviceName !== null) saveLastDevice(session.deviceName);
  }, [session.deviceName]);

  // Handoff §2: "Ready dwell 1.2 s." No reset branch is needed for phases
  // other than "ready": the render logic below only consults `dwellDone`
  // while `session.phase === "ready"` itself, so once the phase moves on
  // (to the phase gate below) `dwellDone`'s stale `true` is simply never
  // read again — and nothing in the hook's state machine ever moves phase
  // BACKWARDS into "ready" a second time within one interstitial mount.
  useEffect(() => {
    if (session.phase !== "ready") return;
    const id = setTimeout(() => setDwellDone(true), READY_DWELL_MS);
    return () => clearTimeout(id);
  }, [session.phase]);

  const canRetry = session.phase === "failed";

  function handleCancel(): void {
    void session.cancel();
    onExit();
  }

  function handleRowInstead(): void {
    void session.cancel();
    onRowInstead();
  }

  function handleTryAgain(): void {
    if (!canRetry || retryingRef.current) return;
    retryingRef.current = true;
    // A device name already on record means `connect()` already built a
    // driver for this attempt (`useMonitorSession.ts`: `deviceName` is set
    // in the same synchronous block as `driverRef.current = driver`, and
    // nothing clears it short of `cancel()`, which this screen never calls
    // on a failure) — so the link is still up and only the PROGRAM needs
    // retrying. No device name means the failure happened before a driver
    // existed (transport-missing, bluetooth-off, scan-dismissed, or a
    // link failure during connect() itself), so retrying means reopening
    // the OS picker from scratch.
    const attempt =
      session.deviceName !== null
        ? session.program(program, identity)
        : session.connect();
    void attempt.finally(() => {
      retryingRef.current = false;
    });
  }

  if (session.phase === "idle" || session.phase === "picking") {
    // The OS chooser owns the screen right now (handoff's C2 ruling) —
    // render nothing of ours over it. Descoped per the plan (states 1-3
    // are not built this task).
    return null;
  }

  if (session.phase === "pairing") {
    return (
      <main className="screen connected-interstitial">
        <div className="connected-interstitial-body">
          <p className="connected-status-label">
            {session.deviceName ?? "CONNECTING"}
          </p>
          <p className="connected-serif-line">Connecting</p>
          <div className="connected-checklist">
            <ChecklistLine label="FOUND" state="done" />
            {/* Present tense while it's the CURRENT line (LOW-5, task-5
                review): README's own state-4 row and the mockup's frame
                both read "connecting", not the past-tense "CONNECTED" the
                canonical FOUND/CONNECTED/SENDING triple otherwise uses —
                the one line whose tense matters is the one the filled
                square is pointing at. */}
            <ChecklistLine label="CONNECTING" state="current" />
            <ChecklistLine label="SENDING THE WORKOUT" state="pending" />
          </div>
        </div>
        <div className="action-stack connected-interstitial-actions">
          <button type="button" className="button-l2" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </main>
    );
  }

  if (session.phase === "programming") {
    return (
      <main className="screen connected-interstitial">
        <div className="connected-interstitial-body">
          <p className="connected-status-label">
            {(session.deviceName ?? "CONNECTING") + " · CONNECTED"}
          </p>
          <p className="connected-serif-line">Sending the workout</p>
          <div className="connected-checklist">
            <ChecklistLine label="FOUND" state="done" />
            <ChecklistLine label="CONNECTED" state="done" />
            {/* NO interval counter (spec's I7 ruling, this task's own
                brief) — "SENDING THE WORKOUT" carries no "INTERVAL N OF M"
                suffix. */}
            <ChecklistLine label="SENDING THE WORKOUT" state="current" />
          </div>
          <div className="connected-panel-sunken">
            <p className="connected-panel-title">WHAT THE MONITOR IS GETTING</p>
            <p className="connected-panel-line">
              {program.intervals.length}{" "}
              {program.intervals.length === 1 ? "INTERVAL" : "INTERVALS"}
            </p>
            {/* 2K/6K, not K2/K6 (task-5 review, MEDIUM-5): the house's own
                baseline-label convention everywhere else in the app
                (LogSession.tsx's "2K …", the builder's 2K/6K/MAX/MIN
                toggle, the mockup's own panel). */}
            <p className="connected-panel-line">
              2K {fmtSplit(baselines.k2Seconds)} · 6K{" "}
              {fmtSplit(baselines.k6Seconds)}
            </p>
            {/* Omitted at zero (LOW-6) — the mockup's own "3 TARGETS NUDGED
                ON CONFIRM" phrasing has nothing to say when there weren't
                any. */}
            {nudgedCount > 0 && (
              <p className="connected-panel-line">{nudgedCount} NUDGED</p>
            )}
          </div>
        </div>
        <div className="action-stack connected-interstitial-actions">
          <button type="button" className="button-l2" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </main>
    );
  }

  if (session.phase === "failed") {
    const error = session.error;
    return (
      <main className="screen connected-interstitial">
        <div className="connected-interstitial-body">
          <p className="connected-status-label">
            {session.deviceName ?? "CONNECT"}
          </p>
          {error !== null && (
            <>
              <p className="connected-serif-line">{failedSerifLine(error)}</p>
              {!NOT_A_MACHINE_REFUSAL.has(error.reason) && (
                <p className="connected-body-line">
                  End whatever is showing on the monitor, then try again.
                </p>
              )}
              <p className="connected-reassurance">
                YOUR WORKOUT AND NUDGES ARE KEPT
              </p>
              <div className="connected-detail-panel">
                <p className="connected-detail-title">DETAIL</p>
                <p className="connected-detail-line">
                  {error.reason.toUpperCase()}
                </p>
                <p className="connected-detail-line">{error.detail}</p>
                {error.raw !== undefined && (
                  <p className="connected-detail-line connected-detail-raw">
                    {error.raw}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="action-stack connected-interstitial-actions">
          <button
            type="button"
            className="button-l1"
            // Unreachable while this branch renders at all (LOW-7,
            // task-5 review): `canRetry` is `phase === "failed"`, and this
            // button only exists inside the `phase === "failed"` render
            // branch, so it is always `true` here. Kept anyway, belt-and-
            // braces, same call `useMonitorSession.ts`'s own LOW-5 makes
            // for `armed`'s `error: null` — the real inertness guarantee is
            // "does not render outside failed" (the tests pin that), not
            // this attribute.
            disabled={!canRetry}
            onClick={handleTryAgain}
          >
            Try again
          </button>
          <button
            type="button"
            className="button-l2"
            onClick={handleRowInstead}
          >
            Row on the phone timer instead
          </button>
          <button type="button" className="button-l2" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </main>
    );
  }

  if (session.phase === "ready" && !dwellDone) {
    return (
      <main className="screen connected-interstitial">
        <div className="connected-interstitial-body">
          <p className="connected-status-label">
            {session.deviceName !== null
              ? `${session.deviceName} · PROGRAMMED`
              : "PROGRAMMED"}
          </p>
          <p className="connected-serif-line">Ready when you pull</p>
          <p className="connected-body-line">
            The monitor starts the clock on your first stroke.
          </p>
        </div>
        <div className="action-stack connected-interstitial-actions">
          <button
            type="button"
            className="button-l1"
            onClick={() => setDwellDone(true)}
          >
            Show me the numbers
          </button>
          {/* HIGH-2 (task-5 review): the handoff's own §2, verbatim —
              "Cancel is present in every state, always last." Its absence
              here left the erg ARMED with no clean way back once
              programmed; `handleCancel` already runs `useMonitorSession`'s
              `ready`-phase terminate (DEVIATIONS row 64). */}
          <button type="button" className="button-l2" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </main>
    );
  }

  // THE PHASE GATE (Task 5's seam, filled by Task 6). Every phase from here
  // on — "ready" past its dwell, "live", "paused", "disconnected", "ended"
  // — is the three-pane connected surface. The SAME `useMonitorSession`
  // instance this file owns keeps running underneath it: nothing unmounts
  // and nothing reconnects at the handoff, which is why `session` is handed
  // down as a value rather than the surface calling the hook a second time
  // (two hooks would mean two drivers and two records).
  return (
    <ConnectedSurface
      phases={phases}
      program={program}
      session={session}
      onEnded={onEnded}
    />
  );
}
