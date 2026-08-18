import { useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import BackLink from "../shell/BackLink";
import { LogRow } from "./LogRow";
import { useLogHistory } from "./useLogHistory";
import {
  loadLogScroll,
  resetLogScrollTombstone,
  saveLogScroll,
} from "./logScroll";

// News.tsx's own throttle value/idiom, copied verbatim (see that file's
// own comment on `SCROLL_SAVE_THROTTLE_MS` for the reasoning) — this
// screen is exactly the same shape of scroll-saving screen §4 N2 names.
const SCROLL_SAVE_THROTTLE_MS = 100;

// How close to the bottom of the currently-rendered content triggers the
// next page (spec §1: "loads more on scroll"). Large enough that the next
// page has time to land before the rower actually reaches the true
// bottom, small enough that it never fires on a first page that already
// fills the viewport with room to spare.
const LOAD_MORE_THRESHOLD_PX = 600;

export default function HistoryList() {
  const state = useLogHistory();
  const restoredScrollRef = useRef(false);
  // Same reason News's own `rootRef` exists (News.tsx:166's comment): the
  // save effect below needs to tell "a real scroll of THIS screen" apart
  // from a scroll event that fires after this screen's own DOM has
  // already been replaced (the disconnected-root echo, PR #84).
  const rootRef = useRef<HTMLElement>(null);

  // Final whole-branch review (2026-08-18), finding IMPORTANT 2: resets
  // `clearLogScroll`'s own tombstone (`logScroll.ts`'s own comment) once
  // per genuine mount of THIS screen. Runs unconditionally (not gated on
  // `state.state`, unlike the two effects below) because it has nothing
  // to do with the fetch — it only needs to happen once, early, on a
  // fresh visit, well before any real scrolling could trigger the save
  // effect below.
  useEffect(() => {
    resetLogScrollTombstone();
  }, []);

  // Save scroll position — News.tsx:200-220's isConnected-guarded
  // throttled pair, PLUS one addition News's own screen never needed:
  // gated on `state.state !== "loading"` (found on real Chromium, not in
  // review — see below). News renders its full row set immediately on
  // every mount (its own comment: "News always renders its article rows
  // immediately... no LOADING placeholder branch"), so its document
  // height is stable from the first paint and `isConnected` alone is
  // enough. HistoryList is NOT shaped that way — it has a genuinely
  // shorter LOADING branch — and on a real browser, mounting that short
  // branch after a BACK return (while the PREVIOUS screen's taller
  // content is still what `window.scrollY` reflects) makes the browser
  // clamp `window.scrollY` down to fit, firing a real `scroll` event on
  // this STILL-CONNECTED root — `isConnected` alone doesn't catch this
  // one, because the root never disconnects; it's the same "echo
  // overwrites a real position with a smaller one" shape as PR #84, one
  // effect earlier. Caught by an e2e run: sessionStorage read back "0"
  // after a real BACK return despite the unmount flush on the PREVIOUS
  // screen having written the correct value — the loading branch's own
  // mount clamped it right back down before RESTORE (below) ever got a
  // chance to read it. Not attaching this listener until the real final
  // height is known (ready OR error — News's own "settled" definition)
  // closes it at the source.
  useEffect(() => {
    if (state.state === "loading") return;
    let lastKnownY = window.scrollY;
    let lastSavedAt = 0;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      lastSavedAt = Date.now();
      saveLogScroll(lastKnownY);
    };
    const onScroll = () => {
      if (!rootRef.current?.isConnected) return;
      lastKnownY = window.scrollY;
      const elapsed = Date.now() - lastSavedAt;
      if (elapsed >= SCROLL_SAVE_THROTTLE_MS) {
        flush();
      } else {
        clearTimeout(trailing);
        trailing = setTimeout(flush, SCROLL_SAVE_THROTTLE_MS - elapsed);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(trailing);
      // Flush the last KNOWN position synchronously on unmount — same
      // reasoning as News.tsx's own cleanup comment: navigating away
      // (tapping a row) within the throttle window would otherwise leave
      // the trailing save cancelled with nothing written.
      flush();
    };
  }, [state.state]);

  // Restores at most once per mount, gated on the fetch having settled
  // (ready OR error — loading has no real final height yet). `useLayout
  // Effect`, not `useEffect`: the scroll must land before the browser
  // paints the restored frame (News.tsx's own reasoning, same effect).
  // Spec §4 N2's honesty rule: this restores WITHIN whatever's loaded on
  // this fresh mount (page 1 only — `useLogHistory` never remembers a
  // prior mount's `loadMore` calls) and nothing more — a saved offset
  // deeper than page 1's own content clamps to page 1's bottom edge
  // exactly the way `window.scrollTo` already clamps to the document's
  // actual scrollable height, rather than this effect trying to fetch
  // further pages to reach it.
  useLayoutEffect(() => {
    if (state.state === "loading" || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const saved = loadLogScroll();
    if (saved !== null) {
      window.scrollTo(0, saved);
    }
  }, [state.state]);

  // Infinite scroll: fetch the next page once the rower is within
  // LOAD_MORE_THRESHOLD_PX of the bottom of whatever's currently
  // rendered. `useLogHistory`'s own `loadMore` no-ops while exhausted or
  // a fetch is already in flight, so this listener only needs to avoid
  // firing needlessly, not to be perfectly precise.
  useEffect(() => {
    if (state.state !== "ready" || state.exhausted) return;
    const { loadMore } = state;
    // The restore effect above (`useLayoutEffect`) may itself land the
    // page at or near its own bottom edge (a deep saved offset, clamped)
    // — real browsers dispatch a `scroll` event for that programmatic
    // jump. Reacting to THAT event here would auto-fetch the next page to
    // chase the rower's old, deeper position, exactly what §4 N2's
    // honesty rule forbids ("clamps to available height rather than
    // auto-fetching pages to chase a deep offset"). Swallowing the first
    // scroll tick after this effect (re-)attaches — whether it came from
    // the restore or was the rower's own first genuine scroll — is the
    // whole fix: a genuine scroll gesture fires many further events
    // within the same gesture, so real infinite scroll is unaffected.
    let ignoredFirstTick = false;
    const onScroll = () => {
      if (!ignoredFirstTick) {
        ignoredFirstTick = true;
        return;
      }
      const distanceFromBottom =
        document.documentElement.scrollHeight -
        window.scrollY -
        window.innerHeight;
      if (distanceFromBottom < LOAD_MORE_THRESHOLD_PX) {
        loadMore();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [state]);

  if (state.state === "loading") {
    return (
      <main className="screen" ref={rootRef}>
        <BackLink fallback="/today" />
        <h1 className="screen-title">History</h1>
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (state.state === "error") {
    return (
      <main className="screen" ref={rootRef}>
        <BackLink fallback="/today" />
        <h1 className="screen-title">History</h1>
        <p className="mono-status">Couldn&apos;t load your sessions.</p>
        <button type="button" className="button-outline" onClick={state.retry}>
          Retry
        </button>
      </main>
    );
  }

  const { logs } = state;

  return (
    <main className="screen history-screen" ref={rootRef}>
      <BackLink fallback="/today" />
      <h1 className="screen-title">History</h1>
      {logs.length === 0 ? (
        <p className="mono-status">No sessions logged yet.</p>
      ) : (
        <ul className="today-log-list history-log-list">
          {logs.map((log) => (
            <li key={log.id}>
              <Link
                to={`/today/log/${log.id}`}
                state={{ from: "/today/log" }}
                className="today-log-row"
              >
                <LogRow log={log} hero />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
