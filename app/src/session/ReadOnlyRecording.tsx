import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MonitorRun } from "../monitor/monitorRun";
import type { SessionRun } from "./run";
import { useStagedDiscard } from "./useStagedDiscard";

export default function ReadOnlyRecording({
  run,
  source,
  onDiscard,
}: {
  run: MonitorRun | SessionRun;
  source: "PM5" | "Timer";
  onDiscard: () => void;
}) {
  const navigate = useNavigate();
  const discard = useStagedDiscard();
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const text = JSON.stringify(run, null, 2);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }
  return (
    <main className="screen">
      <h1 className="screen-title">{run.title}</h1>
      <p className="unsaved-meta">
        {source} ·{" "}
        {new Date(run.startedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}{" "}
        · Not saved
      </p>
      <div className="recovery-panel">
        <h2 className="unsaved-warning-title">Can't rebuild this workout.</h2>
        <p>
          Some workout details are missing or unreadable, so we can't safely
          rebuild its summary. Your recording is still kept here.
        </p>
        <label htmlFor="recording-data">Recording data</label>
        <textarea id="recording-data" readOnly value={text} />
        <button className="button-outline" onClick={() => void handleCopy()}>
          Copy recording
        </button>
        {copy !== "idle" && (
          <p role="status">
            {copy === "copied"
              ? "Recording copied."
              : "Couldn't copy. Select the recording text to copy it."}
          </p>
        )}
      </div>
      <div className="recovery-stack">
        <Link className="unsaved-review" to="/today">
          Keep unsaved
        </Link>
        <button
          className={
            discard.armed
              ? "summary-discard-armed"
              : "button-outline unsaved-replace"
          }
          onBlur={discard.disarm}
          onClick={() => {
            if (!discard.armed) {
              discard.arm();
              return;
            }
            discard.disarm();
            onDiscard();
            void navigate("/today");
          }}
        >
          {discard.armed ? "Tap again to discard" : "Discard recording"}
        </button>
      </div>
    </main>
  );
}
