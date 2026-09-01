import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConnectAction from "../monitor/ConnectAction";
import { deriveAxes } from "../monitor/connectedAxes";
import { useMonitorSession } from "../monitor/useMonitorSession";
import ConnectedSurface from "../workout/ConnectedSurface";

/**
 * `/justrow` — the free row.
 *
 * **The door is shaped like a workout detail on purpose** (Gate 0, James,
 * 2026-09-01: "when you click it, then it'll say connect, almost as though
 * it was a normal workout"). The rower arrives from a two-word control on
 * Today and finds the same anatomy every workout has, with the parts a free
 * row does not have simply missing: no type badge, no difficulty, no pain
 * estimate, no duration, no steps. What is left is the title, one line
 * saying what this is, and Connect.
 *
 * **ONE action, and its absences are rulings rather than omissions.** No
 * Start Timer and no "log it after": ruling 2 makes this phase
 * connected-only, so a door offering a phone-timer path would promise
 * something the phase deliberately does not build.
 *
 * **The guard in front of Connect is load-bearing.** `ConnectAction` stages
 * a confirm whenever an unlogged phone-timer session or an unretired monitor
 * record is on disk, because `createMonitorRun`'s `clearRun()` destroys the
 * former unconditionally the moment the rower starts pulling. Reusing that
 * component rather than calling `connect()` here is what makes this door
 * keep the same promise the workout screen does — the F5 data-loss class,
 * and this phase's exit criterion 6.
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
      axes.program === "none"
    ) {
      armedThisStart.current = true;
      session.beginFreeRow();
    }
  }, [started, axes.link, axes.program, session]);

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

        <h1 className="screen-title">Just Row</h1>
        <p className="justrow-meta">
          NO TARGETS &middot; NO PLAN &middot; NEEDS THE MONITOR
        </p>

        {/* The workout detail's own preview band, carrying the two facts a
            rower cannot get anywhere else: the machine keeps its own clock,
            so the row is the erg's rather than ours, and the numbers appear
            here once they pull. The capture settled that pulling from the
            main menu enters Just Row by itself, so there is nothing to
            select on the monitor either. */}
        <p className="justrow-band">
          The monitor keeps its own time. Pull when you are ready and the
          numbers appear here.
        </p>

        <div className="action-stack">
          <ConnectAction onProceed={handleProceed} />
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
    return (
      <ConnectedSurface
        freeRow={true}
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

  // The connecting and ready frames.
  //
  // `"armed"` is the axis's word for the phase this screen reaches, and it
  // is the internal name rather than a claim about the machine: a free row
  // arms nothing, which is exactly why `beginFreeRow` sends no bytes.
  const ready = axes.program === "armed";
  return (
    <main className="screen connected-interstitial">
      <div className="connected-interstitial-body">
        <p className="connected-status-label">
          {ready ? `${session.deviceName ?? "PM5"} · CONNECTED` : "JUST ROW"}
        </p>
        <h1 className="connected-serif-line">
          {ready ? "Ready when you pull" : "Connecting to monitor"}
        </h1>
        <p className="connected-body-line">
          {ready
            ? "Nothing is programmed. The monitor keeps its own time, and the clock starts on your first stroke."
            : "Wake the monitor if its screen is dark."}
        </p>
        {ready && (
          <p className="connected-ready-warning">KEEP YOUR PHONE SCREEN ON</p>
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
