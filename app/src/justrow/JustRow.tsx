import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConnectAction from "../monitor/ConnectAction";
import {
  connectGuardStage,
  type ConnectGuardStage,
} from "../monitor/monitorRun";
import {
  currentUnretired as currentUnretiredHandoff,
  retire as retireHandoff,
} from "../monitor/handoffStore";
import { buildFreeRowRun } from "../session/engine";
import { loadRun, saveRun } from "../session/run";
import UnsavedWorkoutWarning from "../session/UnsavedWorkoutWarning";
// Review #1, finding 4: the keep-awake lock. The programmed flow acquires
// it in ConnectedInterstitial's mount effect; this screen bypasses that
// component entirely, and without its own acquire the phone sleeps mid-row
// — the exact iOS data-loss failure the lifecycle work exists to prevent.
import { keepAwakeOn, keepAwakeOff } from "../adapters/keepAwake";
import { deriveAxes } from "../monitor/connectedAxes";
import { NAMELESS_MONITOR_CAPTION } from "../monitor/deviceCaption";
import { read as readHandoff } from "../monitor/handoffStore";
import { useMonitorSession } from "../monitor/useMonitorSession";
import ChecklistLine from "../workout/ChecklistLine";
import ConnectedSurface from "../workout/ConnectedSurface";
import FreeRowChip from "../workout/FreeRowChip";
import { freeRowTotals } from "./totals";

/**
 * `/justrow` — the free row.
 *
 * **The door is shaped like a workout detail on purpose** (Gate 0, James,
 * 2026-09-01: "when you click it, then it'll say connect, almost as though
 * it was a normal workout"). The rower arrives from a two-word control on
 * Today and finds the same anatomy every workout has, with the parts a free
 * row does not have simply missing: no type badge (the badge row carries
 * the derived JR chip instead — `FreeRowChip.tsx`), no difficulty, no pain
 * estimate, no duration, no steps. What is left is the chip, the title, one
 * line saying what this is, and Connect.
 *
 * **Two actions, in the detail's own order: Connect, then Start Timer**
 * (Just Row without the monitor, spec 2026-09-02, §Mechanism piece 2 —
 * the reversal of Phase JR's connected-only ruling 2, and the detail's own
 * outlined second action in the same slot under Connect). Still no "log it
 * after": a free row has nothing to log by hand. The absence is a ruling,
 * not an omission.
 *
 * **The guard in front of BOTH actions is load-bearing.** `ConnectAction`
 * stages a confirm whenever an unlogged phone-timer session or an unretired
 * monitor record is on disk, because `createMonitorRun`'s `clearRun()`
 * destroys the former unconditionally the moment the rower starts pulling.
 * Reusing that component rather than calling `connect()` here is what
 * makes this door keep the same promise the workout screen does — the F5
 * data-loss class, and this phase's exit criterion 6. `StartTimerAction`
 * below asks the SAME predicate (`connectGuardStage`) before it overwrites
 * `RUN_KEY`, for the same reason, in the other direction.
 */
export default function JustRow() {
  const navigate = useNavigate();
  const session = useMonitorSession();
  const [started, setStarted] = useState(false);
  // The rower asked for the numbers before pulling — the ready screen's own
  // lead action, inherited from the programmed interstitial (Gate 0 kept
  // both of its buttons). Motion makes this moot: once the record opens the
  // surface takes over regardless.
  const [showNumbers, setShowNumbers] = useState(false);

  const handleProceed = useCallback(() => {
    setStarted(true);
    void session.connect();
  }, [session]);

  // AXES, NEVER `session.phase`. `connectedAxes.ts` exists so that no
  // screen switches on the raw machine state, and its enum-reader pin
  // treats the two files that still do as migrating debt rather than a
  // precedent — so this screen asks the four axes the same questions
  // `JustRowObserver` asks.
  const axes = deriveAxes({
    phase: session.phase,
    frozen: session.frozen,
    runOpen: session.runOpen,
    failureLeavesLinkUp: null,
    frameSilence: session.frameSilence,
  });

  // THE ARM FIRES ONCE THE LINK IS UP, not at the press. `connect()` goes
  // through the platform's picker, so there is no moment inside
  // `handleProceed` where a driver exists to arm yet.
  //
  // ONCE PER CONNECT PRESS, tracked here — this ref IS the spec's third
  // detection clause ("Once Ended, the observer NEVER re-opens on frames
  // ... a new row requires a new user action") said in React. The first
  // version armed on the axes alone (`link up && program none`), and the
  // e2e flow found what that means AFTER the end: `deriveProgram("ended")`
  // reads "none" again, the link is still up, so the effect re-armed the
  // instant the row ended, phase bounced back to ready over a closed
  // record, and the next frame opened a second session — the surface
  // visibly returned to "Ready when you pull" after END. The hook now
  // refuses at "ended" too, but this component must not lean on another
  // file's guard for its own loop.
  const armedThisStart = useRef(false);
  useEffect(() => {
    if (
      started &&
      !armedThisStart.current &&
      axes.link === "up" &&
      axes.program === "none" &&
      // Review #1, finding 1: `deriveLink` reads "up" from `pairing`
      // ONWARD — before the transport has actually connected and before
      // `driverRef` exists — so arming on the axes alone can call
      // `beginFreeRow()` with no driver on a real, slow radio and fail
      // the whole flow as `transport-missing`. The device name is the
      // driver-ready fact this screen can see: it is null until the
      // picker's result has been threaded through `createPm5Driver`
      // (`JustRowObserver`'s own rule — "a live link with no name yet is
      // still `connecting`").
      session.deviceName !== null
    ) {
      armedThisStart.current = true;
      session.beginFreeRow();
    }
  }, [started, axes.link, axes.program, session]);

  // Review #1, finding 4: the phone stays awake for the whole Just Row
  // connection — ready through live through the ended hand-off — exactly
  // as ConnectedInterstitial holds it for a programmed one. Keyed on
  // `started`, not on a phase: the lock must survive every frame change
  // between Connect and leaving, and release on unmount or Cancel (the
  // cleanup runs for both).
  useEffect(() => {
    if (!started) return;
    void keepAwakeOn();
    return () => void keepAwakeOff();
  }, [started]);

  if (!started) {
    return (
      <main className="screen">
        <button
          type="button"
          className="back-link"
          onClick={() => void navigate(-1)}
        >
          &larr; BACK
        </button>

        {/* The workout detail's own badge row, above the title, holding the
            one chip a free row has (handoff "The JR chip"). The door IS the
            free row, so the pair it hands the chip is the pair a free row
            stores — the chip stays derived from `isFreeRow`, never keyed on
            this screen. */}
        <div className="workout-detail-meta">
          <FreeRowChip workoutId={null} workoutType={null} />
        </div>
        <h1 className="screen-title">Just Row</h1>
        {/* `NEEDS THE MONITOR` left this line the day Start Timer arrived
            (handoff 2026-09-02: "no longer true; no new words"). */}
        <p className="justrow-meta">NO TARGETS &middot; NO PLAN</p>

        {/* The workout detail's own preview band. James's own line
            (timer-mode handoff rev 1c, 2026-09-02, ruling 3): the door says
            what it is and the two buttons below say how — the previous
            copy described only the monitor's half ("pull and the numbers
            appear") on a door that has offered Start Timer since the
            unconnected spec landed. Exact string; `JustRow.test.tsx` pins
            it. --ink-2 on --surface-sunken: 9.16:1. */}
        <p className="justrow-band">Start a free row session.</p>

        <div className="action-stack">
          <ConnectAction onProceed={handleProceed} />
          <StartTimerAction />
        </div>
      </main>
    );
  }

  // THE SURFACE TAKES OVER once a session exists (the record opened on
  // motion, or the close/hand-off is under way), or the moment the rower
  // asks for the numbers from ready — the same hand-over the programmed
  // interstitial makes, on the same axis. The one `useMonitorSession`
  // instance this component owns is handed DOWN, never re-called: two
  // hooks would mean two drivers and two records.
  if (axes.session !== "none" || (showNumbers && axes.program === "armed")) {
    // THE KEPT PAIR, read here because this component owns the store read
    // (`ConnectedSurface` is store-blind by its own layering rule) and
    // resolved by `freeRowTotals` — the same single source the log door
    // and Today's recovery row use, per the PM gate's B1: the ended frame
    // must never name a different number than the door one tap away. This
    // re-reads on every render, and the session updates that matter (the
    // close, the summary folding during the hand-off hold) each re-render
    // this component, so by the hold's release the figure is the
    // machine's own.
    const entry = readHandoff();
    const kept =
      entry !== null && entry.run.mode === "justrow"
        ? freeRowTotals(entry.run)
        : null;
    return (
      <ConnectedSurface
        freeRow={{ kept }}
        phases={[]}
        program={{ intervals: [] }}
        session={session}
        // The workout-less log door. Today's recovery row is the net under
        // this navigation either way: the record is closed and committed
        // before onEnded ever fires.
        onEnded={() => void navigate("/justrow/log")}
      />
    );
  }

  // Review #1, finding 5: the failure frames. Before these existed, scan
  // dismissal, permission denial, a connect failure and the pre-driver race
  // all fell through to "Connecting to monitor" forever — a false promise
  // with only Cancel under it. Both frames reuse the observer's own copy
  // register: heading from the closed state set, the error's own `detail`
  // on the mono body line, and a real way forward.
  if (axes.program === "failed") {
    return (
      <main className="screen connected-interstitial">
        <div className="connected-interstitial-body">
          <p className="connected-status-label">JUST ROW</p>
          <h1 className="connected-serif-line">Could not connect</h1>
          {session.error !== null && (
            <p className="connected-body-line">{session.error.detail}</p>
          )}
        </div>
        <div className="action-stack connected-interstitial-actions">
          <button
            type="button"
            className="button-l1"
            onClick={() => {
              armedThisStart.current = false;
              void session.connect();
            }}
          >
            Try again
          </button>
          <button
            type="button"
            className="button-l2"
            onClick={() => {
              void session.cancel();
              armedThisStart.current = false;
              setStarted(false);
            }}
          >
            Cancel
          </button>
        </div>
      </main>
    );
  }
  if (axes.link === "lost") {
    // A link lost BEFORE any run opened (a run in flight renders the
    // surface above, which owns the mid-row lost treatment). The monitor
    // does not advertise while a Just Row is open, so Try again is honest
    // here only because no row was under way.
    return (
      <main className="screen connected-interstitial">
        <div className="connected-interstitial-body">
          <p className="connected-status-label">JUST ROW</p>
          <h1 className="connected-serif-line">Lost the monitor</h1>
        </div>
        <div className="action-stack connected-interstitial-actions">
          <button
            type="button"
            className="button-l1"
            onClick={() => {
              armedThisStart.current = false;
              void session.connect();
            }}
          >
            Try again
          </button>
          <button
            type="button"
            className="button-l2"
            onClick={() => {
              void session.cancel();
              armedThisStart.current = false;
              setStarted(false);
            }}
          >
            Cancel
          </button>
        </div>
      </main>
    );
  }

  // The connecting, SENDING and ready frames, in the order the rower meets
  // them (Gate 0, James, 2026-09-03: `docs/design/handoffs/
  // 2026-09-03-free-row-sending/`).
  //
  // `"armed"` is the axis's word for the phase this screen reaches, and it
  // is the internal name rather than a claim about the machine: a free row
  // arms no interval structure. What it now DOES claim is real, which is
  // the point of the middle card — this comment used to end "that send is
  // detached and nothing here reads its outcome — the Ready line below is
  // true whether or not it landed", and that was the defect wearing a
  // rationale. "Ready when you pull" is a promise about the erg, and the
  // erg takes about two seconds to accept the p.80 program; the door made
  // it in eight milliseconds. `beginFreeRow()` now leaves the session at
  // `"programming"` until the send settles (spec 2026-09-03 Part 2), which
  // `deriveProgram` reads as `"sending"` — so the wait has a screen.
  const sending = axes.program === "sending";
  const ready = axes.program === "armed";
  // RC-18 (door spec §3): the `??` arm is DEAD, and the argument now has to
  // cover BOTH cards that render this caption, so it is stated here rather
  // than beside one of them. `sending` is `axes.program === "sending"` and
  // `ready` is `"armed"`, which `deriveProgram` produces only from phases
  // "programming" and "ready"/"live"; the sole route into any of them from
  // this screen is the arm effect above, which refuses to fire until
  // `session.deviceName !== null`, and the `failed`/`picking` patches that
  // null the name always move `phase` off those in the same `update()`. So
  // the name is never null while either flag is true and this fallback has
  // no supported producer. Kept for consistency with the other seven sites;
  // deliberately UNTESTED (RC-18's own reachability rule).
  const deviceCaption = `${session.deviceName ?? NAMELESS_MONITOR_CAPTION} · CONNECTED`;
  if (sending) {
    // GATE 0'S CARD, VALUES LIFTED RATHER THAN CHOSEN: the status label and
    // serif line are the ready card's own, the checklist is the workout
    // interstitial's own component with one word changed
    // (`workout/ChecklistLine.tsx` — shared for exactly this, recurring
    // failure 8), and Cancel is the same `.button-l2` every card here uses.
    //
    // NO BODY LINE and NO KEEP-ON STRIP, both deliberate: the checklist is
    // already saying what is happening, and "KEEP YOUR PHONE SCREEN ON"
    // belongs to the row, which has not started.
    //
    // NO "Show me the numbers": there are no numbers yet. Its absence is
    // also what keeps the ready card's lead action meaning something.
    return (
      <main className="screen connected-interstitial">
        <div className="connected-interstitial-body">
          <p className="connected-status-label">{deviceCaption}</p>
          <h1 className="connected-serif-line">Starting your row</h1>
          <div className="connected-checklist">
            <ChecklistLine label="FOUND" state="done" />
            <ChecklistLine label="CONNECTED" state="done" />
            <ChecklistLine label="STARTING THE ROW" state="current" />
          </div>
        </div>
        <div className="action-stack connected-interstitial-actions">
          {/* CANCEL STILL TERMINATES ON THE ERG from here, and that is the
              walk's own finding rather than an inference (finding 4,
              `docs/monitor/sessions/walk-2026-09-03-jr-connect/`): the p.80
              frame has already gone, so the machine is in a Just Row
              session whether or not its ack has come back, and a Cancel
              that walks away leaves the rower in front of it.
              `useMonitorSession`'s `cancel()` treats `"programming"` as
              armed for exactly this reason. */}
          <button
            type="button"
            className="button-l2"
            onClick={() => {
              void session.cancel();
              armedThisStart.current = false;
              setStarted(false);
            }}
          >
            Cancel
          </button>
        </div>
      </main>
    );
  }
  return (
    <main className="screen connected-interstitial">
      <div className="connected-interstitial-body">
        <p className="connected-status-label">
          {ready ? deviceCaption : "JUST ROW"}
        </p>
        <h1 className="connected-serif-line">
          {ready ? "Ready when you pull" : "Connecting to monitor"}
        </h1>
        <p className="connected-body-line">
          {ready
            ? "The clock starts on your first stroke."
            : "Wake the monitor if its screen is dark."}
        </p>
        {ready && (
          <p className="connected-keep-on">KEEP YOUR PHONE SCREEN ON</p>
        )}
      </div>
      <div className="action-stack connected-interstitial-actions">
        {/* Gate 0 kept BOTH of the programmed ready screen's buttons. The
            lead one hands over to the surface pre-pull; a free row has no
            armed workout to check there, but the screen is where the
            numbers will appear, and "worth a look" was answered by keeping
            the reuse. */}
        {ready && (
          <button
            type="button"
            className="button-l1"
            onClick={() => setShowNumbers(true)}
          >
            Show me the numbers
          </button>
        )}
        <button
          type="button"
          className="button-l2"
          onClick={() => {
            void session.cancel();
            // A fresh press is a fresh authorization: Cancel clears the
            // once-latch so the NEXT Connect can arm again.
            armedThisStart.current = false;
            setStarted(false);
          }}
        >
          Cancel
        </button>
      </div>
    </main>
  );
}

/**
 * Start Timer — the unconnected free row (spec 2026-09-02, §Mechanism
 * piece 2; exit criteria 1 and 6).
 *
 * **The guard is Connect's own predicate, `connectGuardStage`, with the
 * detail's own Start Timer panel in front of it.** The predicate is what
 * the coexistence guard IS — an unlogged or live `SessionRun` and an
 * unretired `MonitorRun` both stage, in the same severity order Connect
 * uses — and it is shared as a function so the two doors can never
 * disagree about what is on disk. The PANEL is `WorkoutDetail`'s Start
 * Timer one, not `ConnectAction`'s: its sentence names the press
 * ("Starting a new one discards it", "Replace session"), and putting
 * Connect's "Connecting discards it" / "Connect anyway" under a Start Timer
 * press would promise a connection the button does not make. No
 * `stageRetire` on the hand-off store either — that authorization is
 * consumed by `useMonitorSession`'s "armed" event, which a timer never
 * reaches, so staging it here would leave a live authorization for some
 * later, unrelated Connect press to inherit (`ConnectAction`'s own F-3).
 *
 * **On proceed, in this order:** `saveRun(buildFreeRowRun(now))` FIRST —
 * it overwrites `RUN_KEY`, which is the destruction the confirm authorised
 * — then, only once that write succeeded, retire any stale monitor record
 * the same way `useStartWorkout.confirmReplace` does (`"start-replace"`),
 * then `/session/run`. The Countdown is skipped: it exists to set targets,
 * and there are none. A failed write (`saveRun` returns false — quota,
 * private-mode Safari) says so inline and destroys nothing (RF25: the
 * caller of a boolean-returning persist branches on it); navigating to a
 * Timer with nothing behind it would bounce to Today with no word.
 *
 * Retiring the monitor record on proceed is what keeps the log door's
 * both-records case (exit criterion 7c) a VIOLATED invariant rather than a
 * designed one: the rower has just been told the stale session is
 * discarded, and a record left behind would surface beside the finished
 * timer run at `/justrow/log`.
 */
function StartTimerAction() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<ConnectGuardStage>(null);
  const [unsavedCount, setUnsavedCount] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);

  function proceed() {
    if (!saveRun(buildFreeRowRun(new Date()))) {
      setStage(null);
      setStartError("Couldn't start this session. Try again.");
      return;
    }
    const stale = currentUnretiredHandoff();
    if (stale !== null) {
      retireHandoff(
        [{ sessionKey: stale.sessionKey, revision: stale.revision }],
        "start-replace",
      );
    }
    void navigate("/session/run");
  }

  function handleStart() {
    const monitor = currentUnretiredHandoff();
    const run = loadRun();
    setUnsavedCount(
      Number(run !== null && run.completedAt !== null) +
        Number(monitor !== null),
    );
    const staged = connectGuardStage(monitor !== null);
    if (staged !== null) {
      setStage(staged);
      return;
    }
    proceed();
  }

  if (stage === "unlogged")
    return (
      <UnsavedWorkoutWarning
        count={unsavedCount}
        replacement="Starting a new one"
        replaceLabel="Replace session"
        onReplace={proceed}
        onCancel={() => setStage(null)}
        onView={() => {
          setStage(null);
          void navigate("/today");
        }}
      />
    );

  if (stage !== null) {
    return (
      <div className="baseline-confirm">
        <p className="baseline-confirm-line">
          A session is in progress. Replace it?
        </p>
        <div className="baseline-actions">
          <button
            type="button"
            className="button-outline"
            onClick={() => setStage(null)}
          >
            Cancel
          </button>
          <button type="button" className="button-primary" onClick={proceed}>
            Replace session
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="button-l2" onClick={handleStart}>
        Start Timer
      </button>
      {startError !== null && <p className="baseline-error">{startError}</p>}
    </>
  );
}
