import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { hydrate, read, retire } from "../monitor/handoffStore";
import { useWorkouts } from "../api/useWorkouts";
import { ProgrammedMonitorSummary, TimerSummary } from "./LogSession";
import { parseReviewSelector } from "./reviewSelector";
import { buildSummaryModel } from "./summaryModel";
import { buildMonitorLogSteps } from "./logDraft";
import ReadOnlyRecording from "./ReadOnlyRecording";
import { JustRowSummary, type DoorEntry } from "../justrow/JustRowLog";
import { loadRun } from "./run";
import { clearSelectedTimer } from "./clearSelectedTimer";
import { freeRowTotals } from "../justrow/totals";
import { requireFiniteRecording } from "./recoveryValidation";
import { isComplete } from "./engine";

hydrate();

export default function ReviewSession() {
  const { search } = useLocation();
  return <SelectedReview key={search} search={search} />;
}

function SelectedReview({ search }: { search: string }) {
  const [selected] = useState<DoorEntry | null>(() => {
    const selector = parseReviewSelector(search);
    if (selector === null) return null;
    if (selector.source === "monitor") {
      const entry = read(selector.startedAt);
      return entry === null || entry.run.completedAt === null
        ? null
        : { kind: "monitor", entry };
    }
    const run = loadRun();
    return run !== null &&
      run.startedAt === selector.startedAt &&
      run.completedAt !== null &&
      isComplete(run)
      ? { kind: "timer", run }
      : null;
  });
  const entry = selected?.kind === "monitor" ? selected.entry : null;
  const library = useWorkouts();
  const workout =
    library.state === "ready"
      ? library.workouts.find((w) => w.id === entry?.run.workoutId)
      : undefined;
  if (
    selected !== null &&
    (selected.kind === "timer"
      ? selected.run.mode
      : selected.entry.run.mode) === "justrow"
  ) {
    const run = selected.kind === "timer" ? selected.run : selected.entry.run;
    try {
      requireFiniteRecording(run);
      const totals =
        selected.kind === "timer"
          ? selected.run.actuals[0]
          : freeRowTotals(selected.entry.run);
      if (totals == null) throw new Error("No measurements");
      requireFiniteRecording(totals);
    } catch {
      return (
        <ReadOnlyRecording
          run={run}
          source={selected.kind === "timer" ? "Timer" : "PM5"}
          onDiscard={() =>
            selected.kind === "timer"
              ? clearSelectedTimer(selected.run, null)
              : retire(
                  [
                    {
                      sessionKey: selected.entry.sessionKey,
                      revision: selected.entry.revision,
                    },
                  ],
                  "monitor-discard",
                )
          }
        />
      );
    }
    return <JustRowSummary door={selected} context="review" />;
  }
  if (selected?.kind === "timer")
    return <TimerSummary run={selected.run} context="review" />;
  if (entry !== null && entry.run.completedAt !== null) {
    try {
      requireFiniteRecording(entry.run);
      const steps = buildMonitorLogSteps(entry.run);
      if (steps.some((step) => typeof step.label !== "string"))
        throw new Error("Unreadable labels");
      Object.values(entry.run.logSeed!.paces);
      requireFiniteRecording(
        buildSummaryModel({ door: "monitor", run: entry.run }),
      );
    } catch {
      return (
        <ReadOnlyRecording
          run={entry.run}
          source="PM5"
          onDiscard={() =>
            retire(
              [{ sessionKey: entry.sessionKey, revision: entry.revision }],
              "monitor-discard",
            )
          }
        />
      );
    }
    return (
      <ProgrammedMonitorSummary
        entry={entry}
        context={{ kind: "review", workout }}
      />
    );
  }
  return (
    <main className="screen">
      <h1 className="screen-title">Recording unavailable</h1>
      <p className="unsaved-warning-copy">
        This recording is no longer available. No other workout has been opened
        or changed.
      </p>
      <Link className="unsaved-review" to="/today">
        Back to Today
      </Link>
    </main>
  );
}
