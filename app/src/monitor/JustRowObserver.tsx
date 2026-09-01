import { useCallback, useSyncExternalStore } from "react";
import { deriveAxes } from "./connectedAxes";
import {
  useMonitorSession,
  type MonitorSession,
  type MonitorSessionDeps,
} from "./useMonitorSession";

/** How often the capture counter re-reads the recording tap while the link
 *  is up. One second: fast enough that a walk operator can see the number
 *  move within a breath of the first stroke, slow enough that it costs
 *  nothing next to the frame rate the PM5 is already streaming at. */
const CAPTURE_POLL_MS = 1000;

/**
 * What the operator is looking at, as one closed set.
 *
 * The heading is this instrument's ONLY feedback, so every member here is a
 * state the operator would act on differently. The first cut of this screen
 * collapsed `offline`, `ended` and a silence-latched link into a single
 * "Waiting for monitor", which was wrong in two directions at once: nothing
 * is waiting after a deliberate Disconnect (the session is back at `idle`
 * and no connect is in flight), and a link the frame watchdog has given up
 * on was reported with the same four words as a fresh screen.
 */
/** `observing` carries the device name rather than leaving the component to
 *  re-derive it: this function is the only place that establishes the name is
 *  non-null (a live link with no name yet is still `connecting`), so carrying
 *  it here is what keeps `headingFor` total with no unreachable fallback. */
type ObserverState =
  | { kind: "offline" }
  | { kind: "connecting" }
  | { kind: "observing"; deviceName: string }
  | { kind: "lost" }
  | { kind: "failed" };

function observerState(session: MonitorSession): ObserverState {
  const axes = deriveAxes({
    phase: session.phase,
    frozen: session.frozen,
    runOpen: session.runOpen,
    failureLeavesLinkUp: null,
    frameSilence: session.frameSilence,
  });

  if (axes.program === "failed") return { kind: "failed" };
  if (axes.link === "connecting") return { kind: "connecting" };
  if (axes.link === "lost") return { kind: "lost" };
  if (
    axes.link === "up" &&
    axes.program === "none" &&
    axes.session === "none"
  ) {
    const { deviceName } = session;
    return deviceName === null
      ? { kind: "connecting" }
      : { kind: "observing", deviceName };
  }
  return { kind: "offline" };
}

/** Short state phrase for the serif line. Deliberately NOT the error's own
 *  `detail`: that string can be a raw trace (`ConnectedInterstitial`'s
 *  failed state gives it a scrolling panel for exactly that reason), and a
 *  36px serif line is the wrong register for it. The detail goes to the
 *  mono body line below instead — the same split the connected screens use.
 *  "Lost the monitor" is `ConnectedSurface`'s own `LOST THE MONITOR` copy
 *  rather than a fifth phrasing invented here. */
function headingFor(state: ObserverState): string {
  switch (state.kind) {
    case "offline":
      return "Not connected";
    case "connecting":
      return "Connecting to monitor";
    case "observing":
      return `${state.deviceName} connected`;
    case "lost":
      return "Lost the monitor";
    case "failed":
      return "Could not connect";
  }
}

function subscribeToCapture(onChange: () => void): () => void {
  const id = setInterval(onChange, CAPTURE_POLL_MS);
  return () => clearInterval(id);
}

/** A primitive, so React's own bail-out handles the common "no new bytes
 *  this second" case without a re-render. `null` when this build carries no
 *  recording tap at all. */
function captureSnapshot(): number | null {
  return window.__pm5Recording__?.eventCount() ?? null;
}

export default function JustRowObserver({
  deps,
}: {
  deps?: MonitorSessionDeps;
}) {
  const session = useMonitorSession({
    ...deps,
    requestStoragePersistence: false,
    requestDiagnosticStash: false,
  });
  const state = observerState(session);
  const linkUp = state.kind === "observing" || state.kind === "lost";

  // `null` means "no recording tap on this build" — the button that hands
  // the operator the file is not rendered at all then, the same
  // presence-gate `ConnectionLogSheet` uses. A MOVING NUMBER is the point:
  // "connected" proves a GATT connect and nothing else, so without it an
  // operator can row for thirty minutes into a file that was never receiving
  // notifications and have nothing on screen say so.
  //
  // `useSyncExternalStore` rather than state-plus-effect because that is
  // exactly what this is — a mutable value owned outside React, installed by
  // `resolveDefaultTransport()` during `connect()`. It also gets the first
  // read on the render that first sees the tap, instead of a poll interval
  // later, and cannot show a previous session's count after a reconnect.
  const captured = useSyncExternalStore(subscribeToCapture, captureSnapshot);
  const capture = linkUp && captured !== null ? { events: captured } : null;

  // NOT a mount effect. `navigator.bluetooth.requestDevice()` — which
  // `scan()` reaches on the real web arm — is transient-activation gated
  // (Web Bluetooth, "request Bluetooth devices" step 4: "Check that the
  // algorithm is triggered while its relevant global object has a transient
  // activation, otherwise throw a SecurityError and abort these steps";
  // Chromium `bluetooth.cc` rejects with "Must be handling a user gesture
  // to show a permission request."). `ConnectedInterstitial` gets away with
  // a mount-once connect because the tap on Connect navigates to it
  // same-document, inside the same Window's 5-second activation window.
  // This screen has no in-app entry — it is reached by typing its URL,
  // which creates a NEW Window whose activation timestamp starts at
  // positive infinity — so the gesture has to be ON the screen. It doubles
  // as the way back from Disconnect, which the mount-once version had no
  // answer for.
  const connect = useCallback(() => void session.connect(), [session]);
  const disconnect = useCallback(() => void session.cancel(), [session]);

  return (
    <main
      className="screen connected-interstitial"
      data-observer-kind="Just Row observer (instrument)"
    >
      <div className="connected-interstitial-body">
        <p className="connected-status-label">JUST ROW OBSERVER</p>
        <h1 className="connected-serif-line">{headingFor(state)}</h1>
        {state.kind === "failed" && session.error !== null && (
          <p className="connected-body-line">{session.error.detail}</p>
        )}
        {capture !== null && (
          <p className="connected-body-line">
            {capture.events} events captured
          </p>
        )}
        {/* Says what the screen IS, because nothing else on it does and the
            first version ("Observing only…") left that to be guessed. Both
            halves are load-bearing for the operator: this produces a
            diagnostic FILE and no log entry (the logged Just Row is PR 2's
            job, not this instrument's), and because it never programs the
            erg, the row is started on the monitor rather than here. */}
        <p className="connected-body-line">
          Records raw monitor frames to a file, not to your log. Start the row
          on the erg.
        </p>
      </div>
      <div className="action-stack connected-interstitial-actions">
        {capture !== null && (
          <button
            type="button"
            className="button-l3"
            onClick={() => void window.__pm5Recording__?.download()}
          >
            Download capture
          </button>
        )}
        {state.kind === "offline" || state.kind === "failed" ? (
          <button type="button" className="button-l1" onClick={connect}>
            Connect
          </button>
        ) : (
          <button type="button" className="button-l2" onClick={disconnect}>
            {state.kind === "connecting" ? "Cancel" : "Disconnect"}
          </button>
        )}
      </div>
    </main>
  );
}
