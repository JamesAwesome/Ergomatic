import { Link } from "react-router-dom";
import { useArticleReads } from "../api/useArticleReads";
import type { ArticleReadsState } from "../api/useArticleReads";

/** The four onboarding steps (design spec §"The four steps," screen 2b).
 *  Deliberately NOT read from the News registry (`content/articles.tsx`):
 *  two of these four slugs (`your-first-row`/`connect-the-monitor`) don't
 *  exist there yet — they land in Task 6 — and this block's own copy/order
 *  is a fixed table the spec pins independently of whatever the registry
 *  says. `minutes` for the two already-published articles matches their
 *  real registry values (`baselines`: 3, `picking-a-workout`: 2) rather
 *  than the design mock's own placeholder numbers (4 MIN/2 MIN respectively
 *  — sampled, not authoritative, per the handoff's own "Not built, and
 *  fabricated" section); the two unpublished slugs use the spec's own
 *  "~N min" prose estimate until Task 6 lands the real word-count figure.
 *
 *  Exported so a later screen needing the identical four rows (You ›
 *  Learning the app, Phase 6I Task 7) can import this ONE array rather than
 *  retyping the same four copy strings a second time — the same
 *  single-source-of-truth reasoning `domain/onboarding.ts`'s own
 *  `ONBOARDING_TITLES` comment gives for its fixed-title constants. */
export interface StartHereStep {
  slug: string;
  copy: string;
  minutes: number;
}

// eslint-disable-next-line react-refresh/only-export-components
export const START_HERE_STEPS: StartHereStep[] = [
  {
    slug: "your-first-row",
    copy: "Row 6k once. That is your baseline.",
    minutes: 2,
  },
  {
    slug: "baselines",
    copy: "Every pace is that baseline plus an offset.",
    minutes: 3,
  },
  {
    slug: "picking-a-workout",
    copy: "Pick a workout by how much it should hurt.",
    minutes: 2,
  },
  {
    slug: "connect-the-monitor",
    copy: "Connect the monitor and it drives the piece.",
    minutes: 3,
  },
];

// Same suppression rule as News.tsx's own `readStateFor`: `undefined`
// (never `false`) whenever read state isn't known yet, so nothing here ever
// claims read/unread while the fetch is loading or has failed.
function readStateFor(
  slug: string,
  reads: ArticleReadsState,
): boolean | undefined {
  return reads.state === "ready" ? reads.readSlugs.has(slug) : undefined;
}

/** One step row — News's own `ArticleRow` grammar (unread square, title
 *  weight/color flip on read, minutes meta with a " · READ" suffix)
 *  reused at a smaller scale (`.starthere-row` in index.css sets the
 *  reduced type sizes/padding; the row markup itself is the same shape as
 *  `News.tsx`'s `ArticleRow`) rather than a second hand-rolled version of
 *  the identical pattern (recurring-failure #8). `state={{from:"/today"}}`
 *  per the spec: these rows open from Today, not News, so Reader's own
 *  BackLink returns here. */
function StepRow({
  step,
  reads,
}: {
  step: StartHereStep;
  reads: ArticleReadsState;
}) {
  const isRead = readStateFor(step.slug, reads);
  return (
    <Link
      to={`/news/${step.slug}`}
      state={{ from: "/today" }}
      className="starthere-row"
      data-read={isRead}
    >
      {isRead !== undefined && (
        <span
          className="starthere-square"
          data-read={isRead}
          aria-hidden="true"
        />
      )}
      <span className="starthere-row-body">
        <span className="starthere-row-title">
          {step.copy}
          {isRead !== undefined && (
            <span className="visually-hidden">
              {isRead ? " Read" : " Unread"}
            </span>
          )}
        </span>
        <span className="starthere-row-meta">
          {step.minutes} MIN{isRead ? " · READ" : ""}
        </span>
      </span>
    </Link>
  );
}

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
  const readCount =
    reads.state === "ready"
      ? START_HERE_STEPS.filter((s) => reads.readSlugs.has(s.slug)).length
      : null;

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
          <StepRow key={step.slug} step={step} reads={reads} />
        ))}
      </div>
    </div>
  );
}
