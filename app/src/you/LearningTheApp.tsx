import { useEffect, useRef, useState } from "react";
import BackLink from "../shell/BackLink";
import { useArticleReads } from "../api/useArticleReads";
import { usePreferences } from "../api/usePreferences";
import { ARM_TIMEOUT_MS } from "../session/useStagedDiscard";
import {
  START_HERE_STEPS,
  StepRow,
  startHereReadCount,
} from "../today/startHereSteps";

/** You › Learning the app (`/you/learning`, design spec screen 2e): the
 *  detail screen behind You's own `Learning the app` settings row. Same
 *  four step rows StartHere.tsx shows on Today (`startHereSteps.tsx`'s
 *  shared `StepRow`/`START_HERE_STEPS` — no second copy of the copy), plus
 *  two controls that manage the dismissed-on-Today/News-pin state that
 *  screen and News.tsx's own Start-here pin both read. */
export default function LearningTheApp() {
  const reads = useArticleReads();
  const preferences = usePreferences();
  const readCount = startHereReadCount(reads);
  const dismissed =
    preferences.state === "ready" && preferences.preferences.startHereDismissed;

  // Same local armed/disarm-timer shape as WorkoutDetail.tsx's own Delete
  // staged confirm (`ARM_TIMEOUT_MS` imported from the shared home rather
  // than reinvented) — NOT `useStagedDiscard` itself, whose `fire()` clears
  // the session draft/run records, a side effect this control has no
  // business triggering.
  const [armed, setArmed] = useState(false);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (disarmTimer.current !== null) clearTimeout(disarmTimer.current);
    };
  }, []);

  function disarm() {
    if (disarmTimer.current !== null) {
      clearTimeout(disarmTimer.current);
      disarmTimer.current = null;
    }
    setArmed(false);
  }

  function arm() {
    setArmed(true);
    disarmTimer.current = setTimeout(disarm, ARM_TIMEOUT_MS);
  }

  // The `preferences.state !== "ready"` branch is not reachable via the UI
  // today: this handler is only ever wired to the PUT IT BACK ON TODAY
  // button, which itself only renders inside `{dismissed && (...)}` —
  // `dismissed` is `false` unless `preferences.state === "ready"` already.
  // Kept as a real guard (not asserted away) rather than relying on that
  // cross-scope invariant staying true forever, same defensive-branch
  // reasoning `useArticleReads.ts`'s own `markRead`/`markUnread` comments
  // give for their equivalent unreachable-today branches.
  function handlePutBack() {
    if (preferences.state === "ready") {
      preferences.save({ startHereDismissed: false });
    }
  }

  // Second tap only: deletes all four step slugs from `article_reads` AND
  // clears the dismissed flag (spec: "so it starts from step one" — a reset
  // that left the block hidden on Today would reset nothing visible).
  // Guarded on each hook's own "ready" state — reachable if a rower double-
  // taps before either fetch resolves — rather than assuming either is
  // ready just because the button rendered at all.
  function handleMarkAllUnread() {
    if (armed) {
      disarm();
      if (reads.state === "ready") {
        for (const step of START_HERE_STEPS) {
          reads.markUnread(step.slug);
        }
      }
      if (preferences.state === "ready") {
        preferences.save({ startHereDismissed: false });
      }
    } else {
      arm();
    }
  }

  return (
    <main className="screen">
      <BackLink fallback="/you" />
      <h1 className="screen-title">Learning the app</h1>

      <div className="learning-progress-row">
        <span className="learning-progress-title">Start here</span>
        {readCount !== null && (
          <span className="learning-progress-count mono-status">
            {readCount} OF 4 READ
          </span>
        )}
      </div>

      {dismissed && (
        <p className="learning-status-line mono-status">
          DISMISSED ON TODAY · STILL PINNED IN NEWS
        </p>
      )}

      <div className="learning-actions">
        {/* Hidden (not disabled) when not dismissed — nothing to "put
            back" if it was never taken off Today. */}
        {dismissed && (
          <button type="button" className="button-l2" onClick={handlePutBack}>
            PUT IT BACK ON TODAY
          </button>
        )}
        <button
          type="button"
          className={armed ? "button-l4-armed" : "button-l4"}
          onClick={handleMarkAllUnread}
          onBlur={disarm}
        >
          {armed ? "TAP AGAIN" : "MARK ALL FOUR UNREAD"}
        </button>
      </div>

      <h2 className="section-heading">THE FOUR STEPS</h2>
      <div className="learning-steps">
        {START_HERE_STEPS.map((step) => (
          <StepRow
            key={step.slug}
            step={step}
            reads={reads}
            from="/you/learning"
          />
        ))}
      </div>
    </main>
  );
}
