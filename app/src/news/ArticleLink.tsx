import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useReadingOrigin } from "./useReadingOrigin";

/**
 * THE one way an article body links to another article (crosslink round —
 * James's field bug, 2026-08-09: Today → START HERE step 3 → the
 * picking-a-workout article → the in-prose "pain from 1 to 5" cross-link →
 * ✕ landed on NEWS, not Today). The two body cross-links
 * (`content/bodies/workoutTypes.tsx`, `pickingAWorkout.tsx`) used to render
 * a raw `react-router-dom` `Link` (added in the persona round) — no
 * `replace`, no origin carried — so the reading chain's true origin died at
 * that hop and Reader's own BACK/✕ fell back to /news. Reader's NEXT link
 * already got both halves of this contract right (PR #66); this component
 * gives an article BODY the same two halves without hand-rolling them a
 * second time: `replace` (so a cross-link hop occupies its article's own
 * history entry rather than growing the stack by one) plus the exact
 * `useReadingOrigin()` value NEXT carries (`{ from: origin }`, or no state
 * at all when there was never an origin to carry).
 *
 * A raw `react-router-dom` `Link` inside `src/news/content/bodies/*.tsx` is
 * a pinned defect — `bodies.test.tsx`'s source sweep fails the build if one
 * ever reappears. Reach for `ArticleLink` instead, always.
 */
export default function ArticleLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  const origin = useReadingOrigin();
  return (
    <Link to={to} replace state={origin ? { from: origin } : undefined}>
      {children}
    </Link>
  );
}
