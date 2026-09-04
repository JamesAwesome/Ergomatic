import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type SessionRun } from "../session/run";
import { loadDraft } from "../session/draft";
import { clearSelectedTimer } from "../session/clearSelectedTimer";
import { completeInterruptedRun } from "../monitor/monitorRun";
import {
  commit as commitHandoff,
  retire as retireHandoff,
  type HandoffEntry,
} from "../monitor/handoffStore";
import { useStagedDiscard } from "../session/useStagedDiscard";
import { reviewLocation } from "../session/reviewSelector";
import { freeRowTotals } from "../justrow/totals";
import { fmtDuration } from "../../domain/duration.js";

type Recording =
  { kind: "timer"; run: SessionRun } | { kind: "monitor"; entry: HandoffEntry };

/** Kept outside fetch-dependent Today content so loading/Retry cannot reset an armed discard. */
export default function UnsavedWorkouts({
  run,
  monitorEntry,
}: {
  run: SessionRun | null;
  monitorEntry: HandoffEntry | null;
}) {
  const [timerDismissed, setTimerDismissed] = useState(false);
  const [monitorDismissed, setMonitorDismissed] = useState(false);
  const timer = !timerDismissed && run !== null && run.completedAt !== null;
  const monitor = !monitorDismissed && monitorEntry !== null;
  const count = Number(timer) + Number(monitor);
  if (count === 0) return null;
  return (
    <section className="unsaved-group" aria-label="Unsaved workouts">
      <h2 className="unsaved-heading">
        UNSAVED {count === 1 ? "WORKOUT" : "WORKOUTS"}
      </h2>
      {monitor && (
        <UnsavedRow
          recording={{ kind: "monitor", entry: monitorEntry }}
          onDismiss={() => setMonitorDismissed(true)}
        />
      )}
      {timer && (
        <UnsavedRow
          recording={{ kind: "timer", run }}
          onDismiss={() => setTimerDismissed(true)}
        />
      )}
    </section>
  );
}

function UnsavedRow({
  recording,
  onDismiss,
}: {
  recording: Recording;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const discard = useStagedDiscard();
  const armedButtonRef = useRef<HTMLButtonElement>(null);
  const run = recording.kind === "timer" ? recording.run : recording.entry.run;
  const source = recording.kind === "timer" ? "Timer" : "PM5";
  let freeRowEvidence: string | null = null;
  if (recording.kind === "monitor" && recording.entry.run.mode === "justrow") {
    try {
      const totals = freeRowTotals(recording.entry.run);
      if (
        totals !== null &&
        Number.isFinite(totals.seconds) &&
        Number.isFinite(totals.meters)
      ) {
        freeRowEvidence = `${fmtDuration(totals.seconds / 60)} · ${new Intl.NumberFormat("en-US").format(Math.round(totals.meters))} m`;
      }
    } catch {
      /* A malformed recording still has a read-only review door. */
    }
  }
  const [draft] = useState(() => {
    if (recording.kind !== "timer") return null;
    const current = loadDraft();
    return current?.workoutId === run.workoutId ? current : null;
  });
  // Arming replaces the action row with a new button; focus must follow it
  // for a real blur to disarm, just as in the original Today rows.
  useEffect(() => {
    if (discard.armed) armedButtonRef.current?.focus();
  }, [discard.armed]);
  function handleDiscard() {
    if (!discard.armed) {
      discard.arm();
      return;
    }
    discard.disarm();
    if (recording.kind === "timer") clearSelectedTimer(recording.run, draft);
    else
      retireHandoff(
        [
          {
            sessionKey: recording.entry.sessionKey,
            revision: recording.entry.revision,
          },
        ],
        "today-discard",
      );
    onDismiss();
  }
  function handleReview() {
    if (recording.kind !== "monitor") return;
    const { entry } = recording;
    // Only this explicit action closes an interrupted monitor. A refused
    // CAS leaves the direct review gate to report Recording unavailable.
    if (entry.run.completedAt === null) {
      const stamped = completeInterruptedRun(entry.run, new Date());
      commitHandoff(entry.sessionKey, entry.revision, stamped);
    }
    void navigate(reviewLocation("monitor", entry.sessionKey));
  }
  return (
    <section
      className="unsaved-row"
      aria-label={`Unsaved ${source} workout ${run.title}`}
    >
      {discard.armed ? (
        <>
          <p className="unsaved-warning-copy">
            Discard <strong>{run.title}</strong> without saving?
          </p>
          <button
            type="button"
            ref={armedButtonRef}
            className="today-unlogged-discard-armed"
            onClick={handleDiscard}
            onBlur={discard.disarm}
          >
            Tap again to discard
          </button>
        </>
      ) : (
        <>
          <h3 className="unsaved-title">{run.title}</h3>
          <p className="unsaved-meta">
            {source} ·{" "}
            {new Date(run.startedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            · Not saved
          </p>
          {freeRowEvidence !== null && (
            <p className="unsaved-meta">{freeRowEvidence}</p>
          )}
          <div className="unsaved-actions">
            {recording.kind === "timer" ? (
              <Link
                className="today-unlogged-link"
                to={reviewLocation("timer", run.startedAt)}
                aria-label={`Review & save Timer workout ${run.title}`}
              >
                Review &amp; save
              </Link>
            ) : (
              <button
                type="button"
                className="today-unlogged-link"
                onClick={handleReview}
                aria-label={`Review & save PM5 workout ${run.title}`}
              >
                Review &amp; save
              </button>
            )}
            <button
              type="button"
              className="today-unlogged-discard"
              onClick={handleDiscard}
              onBlur={discard.disarm}
              aria-label={`Discard ${source} workout ${run.title}`}
            >
              ✕
            </button>
          </div>
        </>
      )}
    </section>
  );
}
