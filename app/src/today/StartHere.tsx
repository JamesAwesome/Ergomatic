import { useArticleReads } from "../api/useArticleReads";
import {
  START_HERE_STEPS,
  StepRow,
  startHereReadCount,
} from "./startHereSteps";

// Re-exported so this file's own public surface (and StartHere.test.tsx's
// `import { START_HERE_STEPS } from "./StartHere"`) is unchanged now that
// the four-step table itself lives in startHereSteps.tsx (Task 7: You ›
// Learning the app needs the identical rows without a second hand-typed
// copy).
export { START_HERE_STEPS };
export type { StartHereStep } from "./startHereSteps";

/** START HERE (design spec, screen 2b): the dismissible four-step block at
 *  the very top of Today. Mounting (`!preferences.startHereDismissed`) is
 *  the CALLER's job (Today.tsx) — this component only knows how to render
 *  itself and fire `onDismiss`, never whether it should exist at all, so
 *  "no layout reservation once dismissed" falls out of Today.tsx simply not
 *  rendering this component rather than this component rendering `null`. */
export default function StartHere({ onDismiss }: { onDismiss: () => void }) {
  const reads = useArticleReads();
  // `null` (not 0) whenever read state isn't known — the header renders
  // bare "START HERE" with no count/progress claim in that case, the same
  // suppression rule the spec's own Error handling section states for
  // News's suppressed unread count.
  const readCount = startHereReadCount(reads);

  return (
    <div className="starthere-block">
      <div className="starthere-header">
        <span className="starthere-label mono-status">
          START HERE{readCount !== null ? ` · ${readCount} OF 4 READ` : ""}
        </span>
        <button type="button" className="starthere-dismiss" onClick={onDismiss}>
          DISMISS
        </button>
      </div>
      <div className="starthere-steps">
        {START_HERE_STEPS.map((step) => (
          <StepRow key={step.slug} step={step} reads={reads} from="/today" />
        ))}
      </div>
    </div>
  );
}
