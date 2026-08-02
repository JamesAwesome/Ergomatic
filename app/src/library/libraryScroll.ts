/** sessionStorage key for Library's saved scroll position (spec:
 *  docs/superpowers/specs/2026-08-02-bugfix-back-nav-scroll-design.md,
 *  "Scroll restoration, Library only"). sessionStorage rather than
 *  localStorage: this is only worth remembering across a same-tab BACK
 *  round trip into a workout's detail screen, not across app restarts.
 *  Exported so callers (and tests) never hardcode it twice — mirrors
 *  today/todayPick.ts's TODAY_PICK_KEY convention. */
export const LIBRARY_SCROLL_KEY = "ergomatic.libraryScroll";

/** Persists the current scroll position. sessionStorage can throw (quota,
 *  private-mode Safari, disabled storage) — mirrors session/draft.ts's
 *  saveDraft/today/todayPick.ts's saveTodayPick, never lets that escape
 *  uncaught: a lost scroll position is not worth surfacing to the rower. */
export function saveLibraryScroll(y: number): void {
  try {
    sessionStorage.setItem(LIBRARY_SCROLL_KEY, String(y));
  } catch {
    // best-effort
  }
}

/** Returns the saved scroll position, or `null` when nothing's stored, the
 *  stored value isn't a finite number (garbage from some future format
 *  change, or a manually-edited value), or storage access itself throws. */
export function loadLibraryScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(LIBRARY_SCROLL_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Clears the saved position. Called from the tab bar's own Library link
 *  (TabBar.tsx), NOT from Library itself: `BackLink`'s `<Link>` and the tab
 *  bar's `<NavLink>` both navigate to `/library` carrying no `location.state`
 *  at all (confirmed by reading both — neither passes a `state` prop), so
 *  Library's own mount can't tell a BACK return from a fresh tab tap apart.
 *  Clearing at the tab's own click handler is the point of distinction the
 *  design calls for instead: a fresh tab visit starts at the top, and only
 *  a BACK return (which never goes through this link) still has something
 *  saved to restore. */
export function clearLibraryScroll(): void {
  try {
    sessionStorage.removeItem(LIBRARY_SCROLL_KEY);
  } catch {
    // best-effort, same rationale as saveLibraryScroll
  }
}
