import { useEffect } from "react";
import { deriveAxes } from "./connectedAxes";
import {
  useMonitorSession,
  type MonitorSession,
  type MonitorSessionDeps,
} from "./useMonitorSession";

function observerStatus(session: MonitorSession): string {
  const axes = deriveAxes({
    phase: session.phase,
    frozen: session.frozen,
    runOpen: session.runOpen,
    failureLeavesLinkUp: null,
    frameSilence: session.frameSilence,
  });

  if (axes.program === "failed") return session.error!.detail;
  if (axes.link === "connecting") return "Connecting to monitor";
  if (
    axes.link === "up" &&
    axes.program === "none" &&
    axes.session === "none"
  ) {
    return session.deviceName === null
      ? "Connecting to monitor"
      : `${session.deviceName} connected`;
  }
  return "Waiting for monitor";
}

export default function JustRowObserver({
  deps,
}: {
  deps?: MonitorSessionDeps;
}) {
  const session = useMonitorSession(deps);

  useEffect(() => {
    void session.connect();
    // Mount once: reconnecting is a deliberate future control, not an effect retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recording = window.__pm5Recording__;
  return (
    <main
      className="screen just-row-observer"
      data-observer-kind="Just Row observer (instrument)"
    >
      <p className="connected-status-label">JUST ROW OBSERVER</p>
      <h1 className="connected-serif-line">{observerStatus(session)}</h1>
      <p className="just-row-observer-note">
        Observing only — no workout is sent to the monitor.
      </p>
      {recording && (
        <button
          type="button"
          className="button-l3"
          onClick={() => void recording.download()}
        >
          Download capture
        </button>
      )}
      <button
        type="button"
        className="button-l2"
        onClick={() => void session.cancel()}
      >
        Disconnect
      </button>
    </main>
  );
}
