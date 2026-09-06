import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { useConcept2Link } from "../api/useConcept2Link";
import BackLink from "../shell/BackLink";
import Concept2Card from "./Concept2Card";

// Wave E PR1.5 fix round 2 (P1a-device), moved here from You by PR A (Gate 0
// amendment §8, A12: "move it behind /you/concept2"): a dynamic `import()`
// behind a build-time-folded condition, so this card and its distinctive
// `data-c2-link-probe` literal are absent from a production build with the
// flag unset (dist-grep proof:
// `docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`). It needed a
// TAPPABLE entry point for on-device walks (no address bar on iOS); the
// CONCEPT2 row on You is one, one tap away, and this is where Concept2
// diagnostics live now.
const c2LinkProbeEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_C2_LINK_PROBE === "1";
const Concept2LinkProbe = c2LinkProbeEnabled
  ? lazy(() => import("../monitor/Concept2LinkProbe"))
  : null;

/**
 * `/you/concept2` — the screen behind You's CONCEPT2 row (spec
 * 2026-09-04-concept2-walk-fixes §5.1, invariant R5). Diagnostics' shape:
 * `screen overlay-screen`, a BackLink falling back to `/you`, a title. The
 * card is mounted exactly as it was on You (R6 — its markup does not change;
 * `email` is what You passed it).
 *
 * A SCREEN THE ROWER ASKED FOR ALWAYS ANSWERS (R5): chrome renders in EVERY
 * state of THIS hook — before the first read resolves, and on a read that
 * failed (the card draws 1i's own panel and Retry then, retained link or
 * not). It never renders nothing WHILE ITS OWN READ IS THE AUTHORITY. The
 * card runs a second `useConcept2Link` (below) and can go silent
 * (`Concept2Card.tsx`, its `!link.available` return) while this one still
 * holds `null` from a read that failed — the card's Retry re-reads only the
 * card's instance. That window leaves chrome over an empty body with a
 * working BACK; it is pinned by `Concept2Screen.test.tsx`'s disagreement
 * case and ACCEPTED rather than fixed (found at the plan's hardening),
 * because closing it means giving the card a callback (R6 forbids) or
 * lifting its hook out (the 1,000-line card test), for a case that needs the
 * account to lose Concept2 between two reads on one visit.
 *
 * `available: false` — reachable only by a typed URL or a stale history
 * entry, since the row is absent then — returns the rower to `/you` rather
 * than drawing a blank or naming a capability they do not have.
 * THE PREDICATE IS `link !== null && !link.available`, and the shape matters:
 * `link` is `null` until the first read lands, so `!link?.available` or
 * `link === null` would bounce on EVERY mount and make the screen unopenable
 * behind a row that reads as a dead door — RF25/AUD-015's exact shape
 * (`Countdown.tsx` navigating to a Timer that silently bounced to Today).
 * "Still loading" is a third value, not a falsy one.
 *
 * A SECOND `useConcept2Link` INSTANCE, on purpose: the card owns its own
 * (R6 keeps its signature), and nothing else here can observe the card's
 * `null` return. The cost is one extra `GET /api/concept2/link` per screen
 * mount and foreground; the alternative is lifting the hook out of the card
 * and re-plumbing the 1,000-line card test for a screen with one child.
 */
export default function Concept2Screen({ email }: { email: string }) {
  const { link } = useConcept2Link();
  if (link !== null && !link.available) {
    return <Navigate to="/you" replace />;
  }
  return (
    <main className="screen overlay-screen" tabIndex={0}>
      <BackLink fallback="/you" />
      <h1 className="screen-title">Concept2</h1>
      <Concept2Card email={email} />
      {Concept2LinkProbe && (
        <Suspense fallback={null}>
          <Concept2LinkProbe />
        </Suspense>
      )}
    </main>
  );
}
