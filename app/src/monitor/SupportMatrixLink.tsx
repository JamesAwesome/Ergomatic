import { Link, useLocation } from "react-router-dom";

/**
 * THE ONE LINK FROM A REFUSAL SCREEN TO THE SUPPORT MATRIX (Phase MT, Gate 0
 * approved 2026-09-08).
 *
 * Both failure frames render it — `ConnectedInterstitial.tsx` (programmed
 * workouts) and `JustRow.tsx` (free rows) — so it lives here rather than being
 * hand-rolled twice. An asymmetry between the doors would be inventing a
 * second treatment for one message.
 *
 * WHY IT IS NOT `ArticleLink`. That component is the one way an ARTICLE BODY
 * links to another article, and it reads `useReadingTrail()` — a reading chain
 * a product screen has no place in. What it does teach us is the failure to
 * avoid, and this component copies that lesson rather than the code:
 * `state={{ from }}` is REQUIRED, because without it `Reader`'s ✕ resolves
 * `origin ?? "/news"` and drops the rower on the News tab. That is
 * `ArticleLink.tsx`'s own recorded field bug (James, 2026-08-09: "Today →
 * START HERE step 3 → the picking-a-workout article → the in-prose cross-link
 * → ✕ landed on NEWS, not Today").
 *
 * A ROUTER `Link`, never an `<a href>`: an href full-page-navigates and tears
 * the whole app down.
 *
 * THE COST, ACCEPTED AT GATE 0 AND WORTH KNOWING BEFORE ADDING A SECOND
 * CALLER: this is an EXIT, not a detour. `started` is local `useState` in both
 * `WorkoutDetail.tsx` and `JustRow.tsx`, so navigating here unmounts the
 * refusal frame — keep-awake off, mount lease released — and `from` returns
 * the rower to the ROUTE, which offers Connect again, not to this screen. It
 * is safe on THIS screen specifically because `fail()` has already
 * unsubscribed, disconnected and cleared `driverRef` by the time a refusal
 * renders, so there is no live session to strand. It would NOT be safe on any
 * earlier interstitial state.
 *
 * This is the app's first product→article link since James's 2026-08-23
 * teaching-surfaces ruling; the `product-manager` recommended against
 * spending that precedent here and James ruled for the link
 * (`.claude/agents/pm-ledger.md`, 2026-09-08).
 */
export default function SupportMatrixLink() {
  // READ HERE, not in the calling screens, and that is not a style choice.
  // Lifting it to `ConnectedInterstitial`/`JustRow` means calling
  // `useLocation()` unconditionally at the top of both components, which
  // demands a Router in every test that renders EITHER screen in ANY state —
  // 86 of them went red proving it. Reading it inside the one component that
  // is conditionally rendered keeps the routing requirement scoped to the
  // path that actually routes.
  const location = useLocation();
  return (
    <Link
      className="connected-support-link"
      to="/news/connect-the-monitor"
      state={{ from: location.pathname }}
    >
      WHICH ERGS WORK ›
    </Link>
  );
}
