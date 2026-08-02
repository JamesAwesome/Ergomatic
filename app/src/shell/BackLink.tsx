import { Link, useLocation } from "react-router-dom";

const DEFAULT_FALLBACK = "/library";

// Only a same-origin, single-leading-slash path is ever a safe BACK target.
// Rejects anything that doesn't start with exactly one "/" (an absolute URL
// like "https://evil", a protocol-relative "//evil", or an empty string)
// and anything containing "//" anywhere later in the string (a doubled
// slash can itself be interpreted as protocol-relative by some consumers).
// `location.state` is round-tripped through history entries a rower never
// directly controls (query params, old bookmarks, a future native bridge),
// so this treats it as untrusted input rather than a value this app always
// wrote itself.
function isSafeInAppPath(value: unknown): value is string {
  return (
    typeof value === "string" && value.startsWith("/") && !value.includes("//")
  );
}

/**
 * The app's one `← BACK` idiom (docs/superpowers/specs/2026-08-02-bugfix-
 * back-nav-scroll-design.md): targets wherever the CURRENT screen was
 * entered FROM (`location.state.from`, set by whichever `<Link>` navigated
 * here) instead of a hardcoded route. Every back link sharing this one
 * component is the fix for the recorded bug — Today → suggestion → detail →
 * BACK used to always land on `/library` because that Link was hardcoded,
 * predating Today being the landing screen.
 *
 * Falls back to `fallback` (default `/library`) when there's no `from` in
 * state at all (a deep link or a cold load never had one to carry) or the
 * value isn't a safe in-app path (see `isSafeInAppPath`).
 */
export default function BackLink({
  fallback = DEFAULT_FALLBACK,
}: {
  fallback?: string;
} = {}) {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  const target = isSafeInAppPath(from) ? from : fallback;
  return (
    <Link to={target} className="back-link">
      ← BACK
    </Link>
  );
}
