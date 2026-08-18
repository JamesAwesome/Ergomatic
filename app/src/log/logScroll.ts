/** sessionStorage key for the history list's saved scroll position
 *  (from-the-log spec, 2026-08-18, §4 N2). Copies `news/newsScroll.ts`'s
 *  idiom exactly (same sessionStorage-not-localStorage reasoning: only
 *  worth remembering across a same-tab BACK round trip into a session,
 *  not across app restarts) rather than inventing a second one. Exported
 *  so callers (and tests) never hardcode it twice. */
export const LOG_SCROLL_KEY = "ergomatic.logScroll";

/** Persists the current scroll position. sessionStorage can throw (quota,
 *  private-mode Safari, disabled storage) — mirrors `newsScroll.ts`'s own
 *  `saveNewsScroll`, never lets that escape uncaught: a lost scroll
 *  position is not worth surfacing to the rower. */
export function saveLogScroll(y: number): void {
  try {
    sessionStorage.setItem(LOG_SCROLL_KEY, String(y));
  } catch {
    // best-effort
  }
}

/** Returns the saved scroll position, or `null` when nothing's stored, the
 *  stored value isn't a finite number (garbage from some future format
 *  change, or a manually-edited value), or storage access itself throws. */
export function loadLogScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(LOG_SCROLL_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Clears the saved position. Called from the tab bar's own TODAY link
 *  (`TabBar.tsx`'s `CLEAR_ON_TAB`), NOT from `HistoryList` itself — same
 *  reasoning as `newsScroll.ts`'s own `clearNewsScroll`: the tab bar's
 *  `<NavLink to="/today">` is the one link that IS unambiguously a fresh
 *  visit (it never carries the history list's own reading state), so
 *  clearing at its own click handler is the point of distinction the
 *  design calls for (spec §4 N7: "a fresh visit through the heading link
 *  after a tab-tap never restores a stale offset"). */
export function clearLogScroll(): void {
  try {
    sessionStorage.removeItem(LOG_SCROLL_KEY);
  } catch {
    // best-effort, same rationale as saveLogScroll
  }
}
