/** sessionStorage key for the history list's saved scroll position
 *  (from-the-log spec, 2026-08-18, §4 N2). Copies `news/newsScroll.ts`'s
 *  idiom exactly (same sessionStorage-not-localStorage reasoning: only
 *  worth remembering across a same-tab BACK round trip into a session,
 *  not across app restarts) rather than inventing a second one. Exported
 *  so callers (and tests) never hardcode it twice. */
export const LOG_SCROLL_KEY = "ergomatic.logScroll";

/** sessionStorage key for the "cleared" tombstone (final-review fix round,
 *  2026-08-18, finding IMPORTANT 2). `TabBar.tsx`'s TODAY `NavLink` clears
 *  `LOG_SCROLL_KEY` synchronously in its own `onClick` — but that SAME
 *  click's navigation unmounts `HistoryList`, whose own save effect
 *  flushes the last-known scroll position on cleanup. `HistoryList` is
 *  the one screen among `CLEAR_ON_TAB`'s three where this can happen at
 *  all: NEWS/LIBRARY clear a screen that, by construction, isn't
 *  currently mounted when their OWN tab is tapped from elsewhere (you can
 *  only be on News/Library, about to leave it, or already elsewhere —
 *  never navigating TO the tab that owns the scroll you're mid-unmount
 *  of), but tapping TODAY from `/today/log[/:id]` unmounts the one screen
 *  that owns `LOG_SCROLL_KEY` as a direct effect of that very click.
 *  React defers a passive effect's cleanup until after paint — strictly
 *  AFTER the click handler's synchronous clear — so the flush silently
 *  re-writes the value the tap just erased (live probe: scrolled 623,
 *  TODAY tap, storage read "623" again moments later). Nulling the value
 *  can't outlive a write that lands later than the null; a tombstone that
 *  OUTLIVES the null and is checked by every write can: `clearLogScroll`
 *  sets it, `saveLogScroll` declines to write while it's set, and
 *  `resetLogScrollTombstone` (called once by `HistoryList` on its own
 *  mount — a genuine new visit, never a race with the clear that already
 *  happened) clears it again, so ordinary navigate-away-and-back
 *  saving/restoring is untouched — only the TODAY-tap race is closed. */
const LOG_SCROLL_CLEARED_KEY = "ergomatic.logScroll.cleared";

/** Persists the current scroll position. sessionStorage can throw (quota,
 *  private-mode Safari, disabled storage) — mirrors `newsScroll.ts`'s own
 *  `saveNewsScroll`, never lets that escape uncaught: a lost scroll
 *  position is not worth surfacing to the rower. Declines to write while
 *  `clearLogScroll`'s tombstone is set — see that key's own comment for
 *  why a plain "remove and be done" clear isn't enough. */
export function saveLogScroll(y: number): void {
  try {
    if (sessionStorage.getItem(LOG_SCROLL_CLEARED_KEY) !== null) return;
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
 *  after a tab-tap never restores a stale offset"). Also sets the
 *  tombstone `LOG_SCROLL_CLEARED_KEY` documents — removing the value
 *  alone can't survive `HistoryList`'s own unmount-flush cleanup landing
 *  LATER than this call (a real race, not hypothetical — see that key's
 *  comment); the tombstone outlives the null and blocks that write too. */
export function clearLogScroll(): void {
  try {
    sessionStorage.removeItem(LOG_SCROLL_KEY);
    sessionStorage.setItem(LOG_SCROLL_CLEARED_KEY, "1");
  } catch {
    // best-effort, same rationale as saveLogScroll
  }
}

/** Resets the tombstone `clearLogScroll` sets, so this and every later
 *  `saveLogScroll` call goes through normally again. Called once by
 *  `HistoryList` on its own mount — a genuinely fresh visit, which by the
 *  time it happens is never racing the clear that already completed
 *  (that clear's own click, and any deferred flush it triggered, both
 *  belong to a screen instance that finished unmounting before this new
 *  one exists). Without this reset, a tab tap that clears the scroll
 *  would permanently disable saving for the rest of the tab's lifetime,
 *  not just for the one navigation N7 is actually about. */
export function resetLogScrollTombstone(): void {
  try {
    sessionStorage.removeItem(LOG_SCROLL_CLEARED_KEY);
  } catch {
    // best-effort, same rationale as saveLogScroll
  }
}
