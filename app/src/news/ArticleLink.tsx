import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useReadingTrail } from "./useReadingTrail";

/**
 * THE one way an article body links to another article (crosslink round —
 * James's field bug, 2026-08-09: Today → START HERE step 3 → the
 * picking-a-workout article → the in-prose "pain from 1 to 5" cross-link →
 * ✕ landed on NEWS, not Today). The two body cross-links
 * (`content/bodies/workoutTypes.tsx`, `pickingAWorkout.tsx`) used to render
 * a raw `react-router-dom` `Link` (added in the persona round) — no
 * `replace`, no origin carried — so the reading chain's true origin died at
 * that hop and Reader's own BACK/✕ fell back to /news.
 *
 * BACK-walks-the-stack round (James's report 2, same day): a cross-link hop
 * now PUSHES rather than replaces, and carries `{ trail, origin }`, the
 * same shape Reader's own NEXT link carries — `trail` grows by THIS
 * article's own path (so BACK from the linked article retraces to here,
 * not to the true origin), `origin` threads the reading chain's true
 * origin forward unchanged via `useReadingTrail()`, exactly the way NEXT
 * does. Both doors sharing this one component (rather than each
 * hand-rolling its own copy) is what keeps a NEXT/cross-link mix from ever
 * dropping either half.
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
  const { trail, origin } = useReadingTrail();
  const location = useLocation();
  return (
    <Link to={to} state={{ trail: [...trail, location.pathname], origin }}>
      {children}
    </Link>
  );
}
