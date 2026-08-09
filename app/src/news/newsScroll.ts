/** sessionStorage key for News's saved scroll position (CL item / ROADMAP
 *  "News scroll memory": BACK from an article used to land News at the
 *  top — a tradeoff taken deliberately when the feed was about 1.15
 *  screens, revisited now that it's grown to six articles plus the
 *  Start-here pin). Copies `library/libraryScroll.ts`'s own idiom exactly
 *  (same sessionStorage-not-localStorage reasoning: only worth remembering
 *  across a same-tab BACK round trip into an article, not across app
 *  restarts) rather than inventing a second one. Exported so callers (and
 *  tests) never hardcode it twice. */
export const NEWS_SCROLL_KEY = "ergomatic.newsScroll";

/** Persists the current scroll position. sessionStorage can throw (quota,
 *  private-mode Safari, disabled storage) — mirrors
 *  `libraryScroll.ts`'s own `saveLibraryScroll`, never lets that escape
 *  uncaught: a lost scroll position is not worth surfacing to the rower. */
export function saveNewsScroll(y: number): void {
  try {
    sessionStorage.setItem(NEWS_SCROLL_KEY, String(y));
  } catch {
    // best-effort
  }
}

/** Returns the saved scroll position, or `null` when nothing's stored, the
 *  stored value isn't a finite number (garbage from some future format
 *  change, or a manually-edited value), or storage access itself throws. */
export function loadNewsScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(NEWS_SCROLL_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Clears the saved position. Called from the tab bar's own NEWS link
 *  (TabBar.tsx), NOT from News itself: `BackLink`'s `<Link>`/`ArticleLink`'s
 *  ✕ and the tab bar's `<NavLink>` all navigate to `/news` carrying no
 *  `location.state` at all, so News's own mount can't tell a BACK return
 *  from a fresh tab tap apart. Clearing at the tab's own click handler is
 *  the point of distinction the design calls for instead — same reasoning
 *  as `libraryScroll.ts`'s own `clearLibraryScroll`. */
export function clearNewsScroll(): void {
  try {
    sessionStorage.removeItem(NEWS_SCROLL_KEY);
  } catch {
    // best-effort, same rationale as saveNewsScroll
  }
}
