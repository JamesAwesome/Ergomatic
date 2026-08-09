import { useLocation } from "react-router-dom";
import { isSafeInAppPath } from "../shell/BackLink";

/**
 * The reading chain's origin, exactly as Reader.tsx read it before this
 * extraction (crosslink round) — pulled out so `ArticleLink`'s cross-link
 * hop can carry forward the same un-fallback-substituted value Reader's own
 * NEXT link does, instead of a raw `Link` inside an article body dropping
 * it on the floor (the field bug this round fixes).
 *
 * Returns `location.state.from` when it's a safe in-app path
 * (`BackLink.tsx`'s own `isSafeInAppPath`), `undefined` otherwise — NEVER a
 * resolved fallback. Carrying an already-resolved default (e.g. "/news")
 * forward would silently turn "no origin was ever recorded" into "the
 * origin is literally /news" for every later hop in the chain — harmless
 * today (Reader's own fallback IS /news) but no longer true if that default
 * ever changes. Callers that need a resolved value for actually leaving the
 * screen (BACK/✕) apply their own fallback on top of this
 * (`resolveBackTarget`/`Reader.tsx`'s own `origin`), the same two-value
 * split Reader.tsx has kept since the ui-notes round.
 */
export function useReadingOrigin(): string | undefined {
  const location = useLocation();
  const rawFrom = (location.state as { from?: unknown } | null)?.from;
  return isSafeInAppPath(rawFrom) ? rawFrom : undefined;
}
