import { Link } from "react-router-dom";
import type { ArticleReadsState } from "../api/useArticleReads";

/** The four onboarding steps (design spec §"The four steps," screen 2b).
 *  Deliberately NOT read from the News registry (`content/articles.tsx`):
 *  this block's own copy/order is a fixed table the spec pins independently
 *  of whatever the registry says. `minutes` for all four now matches their
 *  real registry values (`baselines`: 3, `picking-a-workout`: 2,
 *  `your-first-row`: 2, `connect-the-monitor`: 2) rather than the design
 *  mock's own placeholder numbers (4 MIN/2 MIN for the first pair — sampled,
 *  not authoritative, per the handoff's own "Not built, and fabricated"
 *  section) or the 6I design spec's own pre-prose "~3 min" estimate for
 *  `connect-the-monitor` (Task 6 landed the real word count — 217 words
 *  after the disconnect paragraph's redraft, ceil(217/180) = 2 — which
 *  supersedes that estimate; `src/news/content/articles.tsx`'s own comment
 *  is the authoritative recount, this one restated to match after Task 8's
 *  close-out comment sweep).
 *
 *  Extracted from `StartHere.tsx` (Task 5) into this module (Task 7) so
 *  `You.tsx`/`you/LearningTheApp.tsx` can share the identical four rows
 *  — same copy, same links, same read styling — rather than a second
 *  hand-typed copy of the same four strings (recurring-failure #8's
 *  reasoning, applied to data rather than an ARIA pattern this time).
 *  `StartHere.tsx` re-exports `START_HERE_STEPS`/`StepRow` from here so its
 *  own public surface (and its test's `import { START_HERE_STEPS } from
 *  "./StartHere"`) is unchanged. */
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
    minutes: 2,
  },
];

// Same suppression rule as News.tsx's own `readStateFor`: `undefined`
// (never `false`) whenever read state isn't known yet, so nothing here ever
// claims read/unread while the fetch is loading or has failed.
// eslint-disable-next-line react-refresh/only-export-components
export function readStateFor(
  slug: string,
  reads: ArticleReadsState,
): boolean | undefined {
  return reads.state === "ready" ? reads.readSlugs.has(slug) : undefined;
}

/** The number of the four steps currently read, or `null` whenever read
 *  state isn't known yet (loading/error) — the same suppression rule
 *  `readStateFor` gives at row granularity, lifted to the header/meta count
 *  every surface that shows "N OF 4" needs (StartHere's own header, You's
 *  settings-row meta, the Learning screen's progress line, News's Start-here
 *  pin). Reading any of the four slugs from ANYWHERE (News, a cross-link)
 *  legitimately advances this count everywhere it's shown — there is no
 *  separate "onboarding progress" state, just this same read against the
 *  one real `article_reads` set (the spec's own "linking rather than
 *  restating" principle). */
// eslint-disable-next-line react-refresh/only-export-components
export function startHereReadCount(reads: ArticleReadsState): number | null {
  return reads.state === "ready"
    ? START_HERE_STEPS.filter((s) => reads.readSlugs.has(s.slug)).length
    : null;
}

/** One step row — News's own `ArticleRow` grammar (unread square, title
 *  weight/color flip on read, minutes meta with a " · READ" suffix)
 *  reused at a smaller scale (`.starthere-row` in index.css sets the
 *  reduced type sizes/padding; the row markup itself is the same shape as
 *  `News.tsx`'s `ArticleRow`) rather than a second hand-rolled version of
 *  the identical pattern (recurring-failure #8). `from` is the BackLink
 *  `state.from` value the caller wants Reader to return to — StartHere.tsx
 *  passes `/today`, `you/LearningTheApp.tsx` passes `/you/learning` — each
 *  surface's own rows open FROM that surface, not from a third, shared
 *  origin. */
export function StepRow({
  step,
  reads,
  from,
}: {
  step: StartHereStep;
  reads: ArticleReadsState;
  from: string;
}) {
  const isRead = readStateFor(step.slug, reads);
  return (
    <Link
      to={`/news/${step.slug}`}
      state={{ from }}
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
