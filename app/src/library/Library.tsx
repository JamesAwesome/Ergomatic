import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkouts } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { estimateMinutes } from "../../domain/expand.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { applyFilters, clearFilters, type Filters } from "./filters";
import { filterTokens } from "./filterTokens";
import FilterSheet from "./FilterSheet";
import { TokenRow, type Token } from "../components/TokenRow";
import { loadLibraryFilters, saveLibraryFilters } from "./libraryFilters";
import { loadLibraryScroll, saveLibraryScroll } from "./libraryScroll";
import WorkoutRow from "./WorkoutRow";

// Trailing-edge throttle: a save fires immediately if 100ms have passed
// since the last one, otherwise it's rescheduled for whatever's left of
// that window — so the FINAL scroll position before the rower stops always
// gets written, not just whichever one happened to land on a 100ms tick.
const SCROLL_SAVE_THROTTLE_MS = 100;

// CSS custom property per workout type — never a raw hex (tokens.css). Kept
// local per this repo's established per-file duplication convention
// (TypeBadge.tsx's own comment names the precedent) rather than importing
// FilterSheet.tsx's identical map.
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

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

/** filterTokens.ts's own Token (`{kind, label, clear}`, one per active
 *  GROUP) adapted to TokenRow's `{key, label, onClear, fill}` shape — the
 *  two don't share a type: filterTokens.ts's `clear` takes the CURRENT
 *  Filters (so a token stays correct after a later, unrelated change),
 *  while TokenRow's `onClear` is a plain callback with no arguments. `fill`
 *  carries a TYPE token's own `--type-*` color through as TokenRow's
 *  per-instance inline override (DESIGN.md's selected-state rule extended
 *  to tokens); every other kind leaves TokenRow's `--ink` default alone. */
function toRowTokens(
  tokens: ReturnType<typeof filterTokens>,
  filters: Filters,
  onRemove: (next: Filters) => void,
): Token[] {
  return tokens.map((token) => ({
    key: token.kind,
    label: token.label,
    onClear: () => onRemove(token.clear(filters)),
    fill:
      token.kind === "type"
        ? `var(${TYPE_COLOR_VAR[token.label as WorkoutType]})`
        : undefined,
  }));
}

export default function Library() {
  const workoutsState = useWorkouts();
  const baselinesState = useBaselines();
  // Lazy-initialized from sessionStorage so a BACK return re-applies the
  // filters SYNCHRONOUSLY, before the first render. This ordering is the
  // whole filter-BACK fix: the saved scroll position was measured against
  // the FILTERED list, and the restore effect below fires on the first
  // rowsReady render — if the filters arrived any later (an effect, a
  // fetch), that first ready render would be the unfiltered list and the
  // restored position would land on the wrong rows.
  const [filters, setFilters] = useState<Filters>(loadLibraryFilters);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The sheet's own scratch copy — nothing here reaches `filters` (or its
  // sessionStorage persistence) until "Show N workouts" commits it. Opening
  // the sheet seeds this from the currently-applied `filters`; every other
  // way out (backdrop tap, Escape, a tab tap, a hardware/browser back
  // navigation — none of which push a route for the sheet to intercept)
  // just unmounts it with the draft discarded. See FilterSheet.tsx's own
  // doc comment for the BACK-with-sheet-open decision this implements.
  const [draftFilters, setDraftFilters] = useState<Filters>(filters);
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

  // Every filter change is persisted immediately (the same "where you
  // were" lifecycle as the scroll position — cleared together by the tab
  // bar's LIBRARY link). Also fires once on mount, re-writing what was just
  // loaded: harmless, and cheaper than tracking a dirty flag.
  useEffect(() => {
    saveLibraryFilters(filters);
  }, [filters]);

  // Restores at most once per mount (`restoredScrollRef`) — without the
  // guard, a later re-render caused by e.g. a filter change would re-fire
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

  const total = workoutsState.workouts.length;
  const visible = applyFilters(workoutsState.workouts, filters, baselines);
  const tokens = filterTokens(filters);
  const hasFilters = tokens.length > 0;
  const draftCount = applyFilters(
    workoutsState.workouts,
    draftFilters,
    baselines,
  ).length;

  function openSheet() {
    setDraftFilters(filters);
    setSheetOpen(true);
  }

  function applySheet() {
    setFilters(draftFilters);
    setSheetOpen(false);
  }

  function dismissSheet() {
    setSheetOpen(false);
  }

  return (
    <main className="screen">
      <Header />
      <div className="library-filter-bar">
        <div className="library-filter-row">
          <button
            type="button"
            className="library-filter-toggle"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onClick={openSheet}
          >
            FILTER ⌄
          </button>
          <TokenRow tokens={toRowTokens(tokens, filters, setFilters)} />
          {!hasFilters && (
            <span className="library-count">{total} WORKOUTS</span>
          )}
        </div>
        {hasFilters && (
          <div className="library-count-row">
            <span className="library-count">
              {visible.length} OF {total} SHOWN
            </span>
            <button
              type="button"
              className="library-clear-all"
              onClick={() => setFilters(clearFilters())}
            >
              CLEAR ALL
            </button>
          </div>
        )}
      </div>
      {sheetOpen && (
        <FilterSheet
          draft={draftFilters}
          onChangeDraft={setDraftFilters}
          resultCount={draftCount}
          onApply={applySheet}
          onDismiss={dismissSheet}
        />
      )}
      {visible.length === 0 ? (
        <div className="library-empty">
          <p>No workouts match these filters.</p>
          {filters.source === "custom" && (
            <p>
              No custom workouts yet ·{" "}
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
