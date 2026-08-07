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

/** The five reasons that are OURS — about the phone/radio side, never the
 *  PM5's own vocabulary (`ConnectedError`'s own doc comment in
 *  `useMonitorSession.ts`). Every other `reason` is one of the eight
 *  `ProgramRejectionReason` values, all MACHINE statements, and they share
 *  one serif line ("The monitor wouldn't take it") rather than six
 *  near-duplicate ones. */
const OUR_REASONS = new Set<ConnectedError["reason"]>([
  "busy",
  "bluetooth-off",
  "link-failed",
  "transport-missing",
  "scan-dismissed",
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
  if (OUR_REASONS.has(error.reason)) return error.detail;
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
  /** Test-only injection point (`useMonitorSession`'s own `deps`
   *  parameter). Production callers omit this — see the file's header
   *  note on why a production `createTransport` is NOT threaded through
   *  here despite Task 4's own concern about it. */
  deps?: MonitorSessionDeps;
}

export default function ConnectedInterstitial({
  program,
  identity,
  baselines,
  nudgedCount,
  onExit,
  onRowInstead,
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
  // Edge-triggered (not level-triggered): fires `program()` exactly once
  // per TRANSITION into "pairing", so a Try Again retry (which re-enters
  // "pairing" via a fresh `connect()`) fires it again too, without a
  // persistent "already programmed" flag that would block the retry.
  const prevPhaseRef = useRef(session.phase);

  // Mount-once: opens the OS picker the instant this screen exists. Not
  // gated on `session.phase` — this hook's own initial phase is always
  // "idle", and Try Again below calls `connect()`/`program()` directly
  // rather than relying on this effect firing again.
  useEffect(() => {
    void session.connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = session.phase;
    if (session.phase === "pairing" && prev !== "pairing") {
      void session.program(program, identity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phase]);

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
        <p className="connected-status-label">
          {session.deviceName ?? "CONNECTING"}
        </p>
        <p className="connected-serif-line">Connecting</p>
        <div className="connected-checklist">
          <ChecklistLine label="FOUND" state="done" />
          <ChecklistLine label="CONNECTED" state="current" />
          <ChecklistLine label="SENDING THE WORKOUT" state="pending" />
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
        <p className="connected-status-label">
          {(session.deviceName ?? "CONNECTING") + " · CONNECTED"}
        </p>
        <p className="connected-serif-line">Sending the workout</p>
        <div className="connected-checklist">
          <ChecklistLine label="FOUND" state="done" />
          <ChecklistLine label="CONNECTED" state="done" />
          {/* NO interval counter (spec's I7 ruling, this task's own brief) —
              "SENDING THE WORKOUT" carries no "INTERVAL N OF M" suffix. */}
          <ChecklistLine label="SENDING THE WORKOUT" state="current" />
        </div>
        <div className="connected-panel-sunken">
          <p className="connected-panel-title">WHAT THE MONITOR IS GETTING</p>
          <p className="connected-panel-line">
            {program.intervals.length} INTERVALS
          </p>
          <p className="connected-panel-line">
            K2 {fmtSplit(baselines.k2Seconds)} · K6{" "}
            {fmtSplit(baselines.k6Seconds)}
          </p>
          <p className="connected-panel-line">{nudgedCount} NUDGED</p>
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
        <p className="connected-status-label">
          {session.deviceName ?? "CONNECT"}
        </p>
        {error !== null && (
          <>
            <p className="connected-serif-line">{failedSerifLine(error)}</p>
            {!OUR_REASONS.has(error.reason) && (
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
        <div className="action-stack connected-interstitial-actions">
          <button
            type="button"
            className="button-l1"
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
        <p className="connected-status-label">
          {(session.deviceName ?? "") + " · PROGRAMMED"}
        </p>
        <p className="connected-serif-line">Ready when you pull</p>
        <p className="connected-body-line">
          The monitor starts the clock on your first stroke.
        </p>
        <div className="action-stack connected-interstitial-actions">
          <button
            type="button"
            className="button-l1"
            onClick={() => setDwellDone(true)}
          >
            Show me the numbers
          </button>
        </div>
      </main>
    );
  }

  // SEAM COMMENT (Task 5's own choice, for Task 6 to replace): every phase
  // from here on — "ready" past its dwell, "live", "paused",
  // "disconnected", "ended" — is Task 6/7's three-pane surface. This one
  // line is the whole of Task 5's "phase gate": the SAME `useMonitorSession`
  // instance this file already owns keeps running underneath it (nothing
  // unmounts, nothing reconnects), so Task 6 only has to replace this
  // return with the real surface, reading `session` exactly as this file
  // does above.
  return (
    <main className="screen connected-interstitial">
      <p className="mono-status">CONNECTED — the live surface is Task 6's.</p>
    </main>
  );
}
