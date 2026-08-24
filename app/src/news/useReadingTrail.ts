import { useLocation } from "react-router-dom";
import { isSafeInAppPath } from "../shell/BackLink";

// An array only counts as a trail when EVERY element is independently a
// safe in-app path — one bad element (unsafe state, a future format
// change) invalidates the whole thing rather than leaving a
// partially-trusted array a caller might index into.
function safeTrail(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.every((v) => isSafeInAppPath(v)) ? (value as string[]) : [];
}

/**
 * The reading chain's own walkable stack (BACK-walks-the-stack round,
 * James's 2026-08-09 recordings, taken together with the crosslink round's
 * own report). `trail` is every article (or the entry surface) between
 * here and the reading session's true start, EARLIEST first — its own
 * last element, `back`, is where ← BACK / browser BACK should land from
 * THIS article. `origin` is where ✕ exits to directly, from ANY depth: the
 * reading session's true starting point.
 *
 * `trail` has to be a real array, not just a `back`/`origin` PAIR of
 * scalars: Reader's own ← BACK control PUSHES a fresh history entry rather
 * than truly going back (so it works even when the current entry wasn't
 * reached by a real in-app navigation), which means a SECOND press needs
 * the target article's own back-chain re-supplied explicitly — a plain
 * two-value contract can name "the previous article" once but has nothing
 * left to hand the NEXT press. Popping `trail`'s own last element off (see
 * Reader.tsx's own `backTrail`) and forwarding the remainder is what lets
 * repeated ← BACK presses retrace the whole stack, one article at a time,
 * exactly like real browser BACK already does for free (each pushed
 * history entry already carries its OWN originally-pushed trail).
 *
 * Both keys ride the same `location.state` a `<Link>` navigated here with
 * — `{ trail, origin }`, written by Reader's own NEXT link and
 * ArticleLink's cross-link hop (both PUSH). News's own entry links
 * (`News.tsx`'s `ArticleRow`) still send
 * only the legacy single `from` key — read here as an implicit
 * ONE-element trail, so the very first hop away still has something to
 * retrace to. `origin` defaults to `back` (the trail's own last element)
 * whenever the incoming state carries no `origin` field of its own — true
 * on first entry, since those same entry links never set one: the first
 * article's entry surface IS the reading session's true origin, so
 * there's nothing more specific to default to.
 *
 * Renamed from `useReadingOrigin` (a single value, replace-collapse era) —
 * that name described a single value this hook no longer returns.
 */
export function useReadingTrail(): {
  trail: string[];
  back: string | undefined;
  origin: string | undefined;
} {
  const location = useLocation();
  const state = location.state as {
    from?: unknown;
    trail?: unknown;
    origin?: unknown;
  } | null;
  const rawTrail = safeTrail(state?.trail);
  const trail =
    rawTrail.length > 0
      ? rawTrail
      : isSafeInAppPath(state?.from)
        ? [state.from]
        : [];
  const back = trail.length > 0 ? trail[trail.length - 1] : undefined;
  const safeOrigin = isSafeInAppPath(state?.origin) ? state.origin : undefined;
  return { trail, back, origin: safeOrigin ?? back };
}
