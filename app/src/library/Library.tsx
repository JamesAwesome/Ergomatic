import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkouts } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { estimateMinutes } from "../../domain/expand.js";
import type { Baselines } from "../../domain/types.js";
import {
  applyFilters,
  clearFilters,
  EMPTY_FILTERS,
  type Filters,
} from "./filters";
import FilterChips from "./FilterChips";
import { loadLibraryScroll, saveLibraryScroll } from "./libraryScroll";
import WorkoutRow from "./WorkoutRow";

// Trailing-edge throttle: a save fires immediately if 100ms have passed
// since the last one, otherwise it's rescheduled for whatever's left of
// that window — so the FINAL scroll position before the rower stops always
// gets written, not just whichever one happened to land on a 100ms tick.
const SCROLL_SAVE_THROTTLE_MS = 100;

function Header() {
  return (
    <div className="library-header">
      <h1 className="screen-title">Library</h1>
      <div className="library-header-actions">
        <Link
          to="/library/import"
          state={{ from: "/library" }}
          className="library-import"
        >
          IMPORT
        </Link>
        <Link
          to="/library/new"
          state={{ from: "/library" }}
          className="library-new"
        >
          + NEW
        </Link>
      </div>
    </div>
  );
}

export default function Library() {
  const workoutsState = useWorkouts();
  const baselinesState = useBaselines();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const restoredScrollRef = useRef(false);
  // The list only has HEIGHT once both hooks land on "ready" — the same
  // condition every render branch below keys off (loading/error branches
  // never render the `<ul>`). Gating restoration on this, rather than on
  // mount, is the fix for the LOADING-race the design spec calls out: a
  // `window.scrollTo` while the placeholder "LOADING…" text is all that's
  // rendered has nothing to scroll TO and silently does nothing.
  const rowsReady =
    workoutsState.state === "ready" && baselinesState.state === "ready";

  // Save scroll position for the lifetime of this screen, throttled to
  // ~100ms (spec: "Scroll restoration, Library only"). Kept unconditional
  // (not gated on rowsReady) so the listener is torn down deterministically
  // on unmount regardless of which state the hooks were in.
  useEffect(() => {
    // Tracked on EVERY scroll event, unthrottled — only the sessionStorage
    // WRITE below is throttled. This is what the unmount flush below reads,
    // deliberately NOT a fresh `window.scrollY` read at cleanup time: by the
    // time a route-change unmount's cleanup runs, React has already
    // committed the NEW screen's (typically much shorter) DOM in place of
    // Library's, and the browser clamps `window.scrollY` to that new,
    // smaller document's max — reading it live at cleanup time was tried
    // first and measured 0 on a real navigation in e2e, not the position
    // the rower actually left at. `lastKnownY` was captured while Library's
    // own tall content was still on screen, so it's the value that's
    // actually meaningful to restore.
    let lastKnownY = window.scrollY;
    let lastSavedAt = 0;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      lastSavedAt = Date.now();
      saveLibraryScroll(lastKnownY);
    };
    const onScroll = () => {
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
      // Flush the last KNOWN position synchronously on unmount — navigating
      // away (e.g. tapping a row) within the throttle window would
      // otherwise leave the trailing save cancelled with nothing written,
      // so BACK would restore a stale, pre-scroll position.
      flush();
    };
  }, []);

  // Restores at most once per mount (`restoredScrollRef`) — without the
  // guard, a later re-render caused by e.g. a filter click would re-fire
  // this effect (rowsReady stays true) and yank the rower back to the
  // saved position mid-browse. `useLayoutEffect`, not `useEffect`: the
  // scroll must land before the browser paints the restored frame, or the
  // rower briefly sees the top of the list flash before it jumps.
  useLayoutEffect(() => {
    if (!rowsReady || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const saved = loadLibraryScroll();
    if (saved !== null) {
      window.scrollTo(0, saved);
    }
  }, [rowsReady]);

  if (workoutsState.state === "loading" || baselinesState.state === "loading") {
    return (
      <main className="screen">
        <Header />
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (workoutsState.state === "error") {
    return (
      <main className="screen">
        <Header />
        <p className="mono-status">Couldn't load your library.</p>
        <button
          type="button"
          className="button-outline"
          onClick={workoutsState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  if (baselinesState.state === "error") {
    return (
      <main className="screen">
        <Header />
        <p className="mono-status">Couldn't load your baselines.</p>
        <button
          type="button"
          className="button-outline"
          onClick={baselinesState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  // Duration filtering/display needs both baseline splits; a partially-set
  // pair (e.g. a brand-new account) is treated the same as "unknown".
  const baselines: Baselines | null =
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  const visible = applyFilters(workoutsState.workouts, filters, baselines);

  return (
    <main className="screen">
      <Header />
      <p className="library-count">{visible.length} ENTERED</p>
      <FilterChips filters={filters} onChange={setFilters} />
      {visible.length === 0 ? (
        <div className="library-empty">
          <p>No workouts match these filters.</p>
          {filters.customOnly && (
            <p>
              No custom workouts yet —{" "}
              <Link
                to="/library/new"
                state={{ from: "/library" }}
                className="library-new"
              >
                build one
              </Link>
            </p>
          )}
          <button
            type="button"
            className="button-outline"
            onClick={() => setFilters(clearFilters())}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="workout-list">
          {visible.map((workout) => (
            <li key={workout.id}>
              <WorkoutRow
                workout={workout}
                durationMinutes={
                  baselines
                    ? estimateMinutes(workout.steps, baselines).minutes
                    : null
                }
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
