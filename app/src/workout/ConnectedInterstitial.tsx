// The interstitial (7B Task 5, handoff §2: "full screen, seven states").
// Owns the `useMonitorSession` hook for the whole connected flow — the
// SAME instance drives the setup states this file draws AND the live
// session that follows, so the radio is never torn down and rebuilt
// mid-handoff (see the SEAM COMMENT at the bottom of this file for exactly
// where Task 6 takes over).
//
// States 1-3 remain unbuilt here — `idle` renders nothing, and `picking`
// renders a quiet backdrop, not a scan UI of our own (phone-BLE spec §5):
// on iOS the platform's monitor chooser is the plugin's OWN in-process list
// sheet, floated over this file's backdrop rather than blank white; on web
// it is the browser's own `requestDevice` chrome, a modal single-result
// chooser the app never sees a device list from either way. States 4
// (pairing), 5 (programming), 6 (failed) and 7 (ready) are the rest of this
// file.
//
// Screens talk ONLY to `useMonitorSession` (the plan's own layering rule):
// this file never imports `createPm5Driver`, a `Transport`, or
// `monitorRun.ts` directly.

import { useEffect, useRef, useState } from "react";
import { fmtSplit } from "../../domain/format.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { Baselines } from "../../domain/types.js";
import { canOpenAppSettings, openAppSettings } from "../adapters/appSettings";
import { deriveAxes } from "../monitor/connectedAxes";
import ConnectionLogSheet from "./connected/ConnectionLogSheet";
import { DASH } from "./connected/surfaceModel";
import {
  useMonitorSession,
  type ConnectedError,
  type MonitorSessionDeps,
  type RunIdentity,
} from "../monitor/useMonitorSession";
import type { EnginePhase } from "../session/engine";
import ConnectedSurface from "./ConnectedSurface";
import { keepAwakeOn, keepAwakeOff } from "../adapters/keepAwake";

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

/** Every reason that is NOT the machine actively refusing a workout — the
 *  six that are OURS (about the phone/radio side, never the PM5's own
 *  vocabulary — `ConnectedError`'s own doc comment in
 *  `useMonitorSession.ts`), plus `"disconnected"` (task-5 review, MEDIUM-7):
 *  it IS one of the eight `ProgramRejectionReason` values, but it says the
 *  LINK died mid-conversation, not that the PM5 looked at the workout and
 *  said no — rendering "The monitor wouldn't take it" for a link that
 *  simply went quiet is the identical mis-attribution the task-4 review
 *  caught for `link-failed` vs `bluetooth-off` one layer down, reintroduced
 *  here for a different tag. The remaining seven `ProgramRejectionReason`
 *  values are genuine machine statements and share one serif line.
 *
 *  An exhaustive `Record`, not a `Set` (phone-BLE adversarial review, I3):
 *  a `Set<ConnectedError["reason"]>` compiles even if a future reason is
 *  never added to it, so a rower would read a silent WRONG headline for a
 *  brand-new tag rather than the compiler catching the gap. Every arm of
 *  the union is listed here by name; adding a member to `ConnectedError`
 *  without extending this object is a type error, not a runtime surprise. */
const NOT_A_MACHINE_REFUSAL: Record<ConnectedError["reason"], boolean> = {
  busy: true,
  "bluetooth-off": true,
  "link-failed": true,
  "transport-missing": true,
  "scan-dismissed": true,
  "permission-denied": true,
  disconnected: true,
  // The seven genuine machine statements share one serif line.
  nak: false,
  bad: false,
  "not-ready": false,
  garbled: false,
  timeout: false,
  "not-observed": false,
  "structure-mismatch": false,
};

/** `detail` is documented as copy-ready prose (`ConnectedError`'s own doc
 *  comment) for exactly this reason: reusing it here, rather than
 *  authoring six near-duplicate serif lines, is also what keeps
 *  `link-failed`'s copy from ever drifting back onto `bluetooth-off`'s by
 *  accident — the two mappers in `useMonitorSession.ts` already write
 *  different prose for the two tags (task-4 review MEDIUM-4's own
 *  finding), so keying off `detail` inherits that distinction rather than
 *  re-deriving it. `permission-denied` gets its own fixed title (spec §7) —
 *  the door, not the detail, is the headline. */
function failedSerifLine(error: ConnectedError): string {
  if (error.reason === "permission-denied")
    return "Bluetooth permission needed";
  if (NOT_A_MACHINE_REFUSAL[error.reason]) return error.detail;
  return "The monitor wouldn't take it";
}

/** Connected-axes 2a, Task 4: stands in for `session.error` at
 *  `phase === "disconnected"`, which is always `null` there —
 *  `useMonitorSession.ts`'s own `event.kind === "disconnected"` handler
 *  sets `phase: "disconnected"` directly and never goes through `fail()`,
 *  so there is no `ConnectedError` this raw link drop ever produces. Reused
 *  rather than invented (house rule: new user-facing strings need James's
 *  eyes) — `detail` is `mapRadioFailure`'s own EXISTING fallback text for a
 *  connect-time link failure (`useMonitorSession.ts`'s `link-failed` case),
 *  already shown to a rower today; it says only that the link failed, with
 *  no claim about which step was interrupted (unlike `driver.ts`'s
 *  `REJECTION_VERBS.disconnected`, "…before completing", which is
 *  specifically about an in-flight programming send this case never had).
 *  `reason: "disconnected"` (not `"link-failed"`) so `failedSerifLine`/
 *  `NOT_A_MACHINE_REFUSAL` read it as the non-machine-refusal case it is —
 *  the DETAIL panel's own reason line is cosmetic only, unlike this. */
const LINK_LOST_NO_RUN_ERROR: ConnectedError = {
  reason: "disconnected",
  detail: "The link to the monitor failed.",
};

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
  /** Phase 6I: `Baselines | null` — an effort-only workout (`domain/
   *  needsBaselines.ts`) can Connect with no baselines set at all
   *  (`WorkoutDetail.tsx`'s own guard loosening); `compileProgram` has
   *  already resolved `program` successfully by the time this screen ever
   *  mounts either way. `null` here means only that the WHAT panel's own
   *  "2K … · 6K …" line has nothing honest to show — it's omitted entirely
   *  (never a fabricated pair, the same "no bare dash/fake number" house
   *  rule every other baselines-null display in this codebase follows),
   *  not that anything else about the connected flow is degraded. */
  baselines: Baselines | null;
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
  // Handoff §2 wrote "Ready dwell 1.2 s" — an auto-advance past this
  // screen. REMOVED, deliberately (2026-08-08, hardware walks 2-3: the
  // operator reported the skip as a bug three separate times before the
  // timer was even suspected — the ready screen exists to be READ at the
  // erg, and 1.2s is one breath). The only ways forward are the rower's
  // own: the button below, or the first real pull flipping the phase to
  // `live` (the machine's side of the same promise). With the timer gone,
  // NOTHING in the connected flow runs on a wall clock. DEVIATIONS row
  // records the ruling.
  const [numbersRequested, setNumbersRequested] = useState(false);
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

  // Phase LL Task 1 (link-truth design spec §1, exit criterion 7): THE
  // RING DOOR ON THE FAILURE SCREEN. `ConnectedSurface.tsx`'s own
  // diagnostics sheet (triple-tap a pager target) is only reachable from
  // `live`/`disconnected`/`ended` — every state downstream of a session
  // actually starting. The 2026-08-20 walk's F-1 finding was lost
  // precisely because THIS screen, `"failed"` (state 6), had no door at
  // all: whatever the liveness decorator and the ring had already
  // recorded about a connect/program failure was unreachable the instant
  // it mattered most. A plain button rather than the triple-tap gesture
  // `ConnectedSurface` uses — this screen already has explicit buttons
  // for everything else (Try again, Row on the phone timer instead,
  // Cancel), and a failure screen is exactly the moment a rower is
  // looking for a way to see more, not a gesture to discover.
  const [logOpen, setLogOpen] = useState(false);
  const logOpener = useRef<HTMLElement | null>(null);

  // Keep-awake spans the WHOLE connected flow: on at mount, off at
  // unmount — the same lifetime idiom Countdown/Timer use, absent here
  // since 7B because the flow was desktop-born. On a phone the rower's
  // hands are on the handle, nothing touches the screen, and iOS slept
  // mid-row (James, first tester row after phone-BLE, 2026-08-11). The
  // platform split lives in the adapter; this component never calls
  // isNative() itself.
  useEffect(() => {
    void keepAwakeOn();
    return () => void keepAwakeOff();
  }, []);

  // Mount-once: opens the monitor chooser the instant this screen exists. Not
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
    // existed (transport-missing, bluetooth-off, scan-dismissed,
    // permission-denied, or a link failure during connect() itself), so
    // retrying means reopening the monitor chooser from scratch.
    const attempt =
      session.deviceName !== null
        ? session.program(program, identity)
        : session.connect();
    void attempt.finally(() => {
      retryingRef.current = false;
    });
  }

  if (session.phase === "idle") return null;

  if (session.phase === "picking") {
    // The chooser (plugin sheet on iOS, browser chrome on web) floats over
    // this quiet backdrop — before phone-BLE this branch returned null and
    // iOS drew its sheet over blank white (spec §5). Deliberate side effect:
    // mounting `.connected-interstitial` also trips `index.css`'s
    // `.app-shell:has(.connected-interstitial)` rule, hiding the tab bar
    // for the duration of the chooser too, same as every other connected
    // state — the chooser is modal, and this is a monitor-flow screen like
    // the rest of them, not a moment to show tab navigation underneath.
    return (
      <main className="screen connected-interstitial">
        <div className="connected-interstitial-body">
          <p className="connected-status-label">CONNECT</p>
          <p className="connected-serif-line">Choosing your monitor</p>
        </div>
      </main>
    );
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
                toggle, the mockup's own panel). Phase 6I: omitted entirely
                for an effort-only workout run with no baselines set —
                there is no pair to report, and this line has no "no
                target" idiom of its own to fall back to (unlike a step
                row), so silence is the honest choice. */}
            {baselines !== null && (
              <p className="connected-panel-line">
                2K {fmtSplit(baselines.k2Seconds)} · 6K{" "}
                {fmtSplit(baselines.k6Seconds)}
              </p>
            )}
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

  /** State 6's element, now shared with the new `disconnected`-no-run
   *  branch below (Task 4, connected-axes 2a) rather than duplicated —
   *  reusing the JSX is what makes reusing its COPY honest too. `disabled=
   *  {!canRetry}` is no longer unreachable-by-construction the way the old
   *  LOW-7 note (task-5 review) had it: `canRetry` is still `phase ===
   *  "failed"`, so this button really is always enabled at THIS call site,
   *  but the second call site (`disconnected`, no run open) renders the
   *  same element with `canRetry` `false` — belt-and-braces there is load-
   *  bearing now, not merely defensive. */
  function renderFailureScreen(error: ConnectedError | null) {
    return (
      <main className="screen connected-interstitial">
        <div className="connected-interstitial-body">
          <p className="connected-status-label">
            {session.deviceName ?? "CONNECT"}
          </p>
          {error !== null && (
            <>
              <p className="connected-serif-line">{failedSerifLine(error)}</p>
              {!NOT_A_MACHINE_REFUSAL[error.reason] && (
                <p className="connected-body-line">
                  End whatever is showing on the monitor, then try again.
                </p>
              )}
              {error.reason === "permission-denied" && (
                <p className="connected-body-line">{error.detail}</p>
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
          {error !== null &&
            error.reason === "permission-denied" &&
            canOpenAppSettings() && (
              <button
                type="button"
                className="button-l1"
                // Best-effort, the same idiom `keepAwake.ts`'s own catches
                // use: a rejected `BleClient.openAppSettings()` never
                // breaks the card — there's nothing more useful to do with
                // a plugin failure here, and Try again still stands either
                // way.
                onClick={() => void openAppSettings().catch(() => undefined)}
              >
                Open Settings
              </button>
            )}
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
          {/* THE RING DOOR (this file's own header comment on
              `logOpen`/`logOpener` has the full reasoning: the walk's own
              lost-evidence finding, and why this is a plain button rather
              than `ConnectedSurface`'s triple-tap). `.button-l2`, same
              class every other secondary action on this screen already
              uses — no new visual weight for a diagnostics escape hatch.
              BEFORE Cancel, on purpose: Cancel is this screen's own exit
              and stays the LAST action (pinned by
              `ConnectedInterstitial.test.tsx`'s "Cancel is present and
              last"). */}
          <button
            type="button"
            className="button-l2"
            onClick={(e) => {
              // Imperative capture, not a JSX `ref` prop — same idiom
              // `ConnectedSurface.tsx`'s own triple-tap handler uses for
              // this exact ref (`logOpener.current = target`): `SheetShell`
              // restores focus to whatever opened it on dismiss, and this
              // is the one element that should get it back.
              logOpener.current = e.currentTarget;
              setLogOpen(true);
            }}
          >
            View connection log
          </button>
          <button type="button" className="button-l2" onClick={handleCancel}>
            Cancel
          </button>
        </div>
        {logOpen && (
          <ConnectionLogSheet
            deviceCaption={session.deviceName ?? "CONNECT"}
            // No live session clock exists on this screen — `"failed"` is
            // reached only from `picking`/`pairing`/`programming`, all
            // strictly before `live` (`fail()`'s only call sites,
            // `useMonitorSession.ts`). `DASH`, the house's own
            // "genuinely unknowable" placeholder every other connected
            // pane already uses for exactly this case.
            elapsedDisplay={DASH}
            readLog={session.exportLog}
            program={program}
            opener={logOpener}
            onClose={() => setLogOpen(false)}
          />
        )}
      </main>
    );
  }

  if (session.phase === "failed") {
    return renderFailureScreen(session.error);
  }

  if (session.phase === "ready" && !numbersRequested) {
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
            onClick={() => setNumbersRequested(true)}
          >
            Show me the numbers
          </button>
          {/* HIGH-2 (task-5 review): the handoff's own §2, verbatim —
              "Cancel is present in every state, always last." Its absence
              here left the erg ARMED with no clean way back once
              programmed; `handleCancel` already runs `useMonitorSession`'s
              `ready`-phase terminate (DEVIATIONS row 63). */}
          <button type="button" className="button-l2" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </main>
    );
  }

  // Task 4 (connected-axes 2a, design spec §1): `link lost ∧ session none
  // ⇒ the interstitial's own disconnected treatment, never the surface`.
  // Before this branch existed, `disconnected` fell straight off the
  // ladder into `<ConnectedSurface>` below with no run ever opened and no
  // frame ever received — a link drop during `pairing`/`ready` landed the
  // rower on three panes with nothing to show. `axes.session` (not `phase`
  // alone) is what decides, because `deriveSession` reads
  // `session.runOpen`: the record deliberately stays open across a drop
  // that happens AFTER a run began (`connectedAxes.ts`'s own header
  // comment) — that is the OTHER path through this same phase, the
  // mid-session drop, and it must keep reaching the surface
  // (`ConnectedSurface.tsx`'s own `stale` treatment, unchanged by this
  // task). `axes.link` is unconditionally `"lost"` whenever `phase` is
  // `"disconnected"` (`deriveLink`'s own switch), so the phase check below
  // already carries that half of the spec's rule.
  const axes = deriveAxes({
    phase: session.phase,
    frozen: session.frozen,
    runOpen: session.runOpen,
    // Always `null` here: `session.phase === "failed"` already returned
    // above, so `deriveLink`'s `"failed"` case never runs off this call
    // (M-1, `AxesInput.failureLeavesLinkUp`'s own doc comment).
    failureLeavesLinkUp: null,
  });
  if (session.phase === "disconnected" && axes.session === "none") {
    return renderFailureScreen(LINK_LOST_NO_RUN_ERROR);
  }

  // THE PHASE GATE (Task 5's seam, filled by Task 6). Every phase from here
  // on — "ready" once the rower asked for the numbers, "live" (frozen or
  // not — connected-axes 2a task 5 retired the separate "paused" phase;
  // `frozen` is a fact ALONGSIDE "live", not a different phase), "ended",
  // and "disconnected" WITH a run open (the mid-session drop, above) — is
  // the three-pane connected surface. The SAME
  // `useMonitorSession` instance this file owns keeps running underneath
  // it: nothing unmounts and nothing reconnects at the handoff, which is
  // why `session` is handed down as a value rather than the surface
  // calling the hook a second time (two hooks would mean two drivers and
  // two records).
  return (
    <ConnectedSurface
      phases={phases}
      program={program}
      session={session}
      onEnded={onEnded}
    />
  );
}
