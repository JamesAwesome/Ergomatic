import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkouts } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { estimateMinutes } from "../../domain/expand.js";
import { isOnboardingTitle } from "../../domain/onboarding.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import {
  applyFilters,
  clearFilters,
  toggleType,
  type Filters,
} from "./filters";
import { filterTokens } from "./filterTokens";
import FilterSheet from "./FilterSheet";
import { TokenRow, type Token } from "../components/TokenRow";
import { TYPE_WORDS } from "../components/typeWords";
import { loadLibraryFilters, saveLibraryFilters } from "./libraryFilters";
import { loadLibraryScroll, saveLibraryScroll } from "./libraryScroll";
import WorkoutRow from "./WorkoutRow";

// Trailing-edge throttle: a save fires immediately if 100ms have passed
// since the last one, otherwise it's rescheduled for whatever's left of
// that window — so the FINAL scroll position before the rower stops always
// gets written, not just whichever one happened to land on a 100ms tick.
const SCROLL_SAVE_THROTTLE_MS = 100;

// Chip order: O2, AT, TR, AN — the pyramid's base-first order, matching
// Today.tsx's own TYPE_CHIPS and FilterSheet.tsx's pre-Task-1 TYPE group
// (docs/design/README.md §Screens → "2. Library", amended 2026-08-08).
const TYPE_CHIPS: WorkoutType[] = ["O2", "AT", "TR", "AN"];

// CSS custom property per workout type — never a raw hex (tokens.css). Kept
// local per this repo's established per-file duplication convention
// (TypeBadge.tsx's own comment names the precedent) rather than importing
// Today.tsx's identical map. Library-filter-unification round, Task 2: this
// map now colours the chip row's own active fill (below) — it no longer
// backs `toRowTokens`' fill (that now passes `filterTokens.ts`'s own
// `Token.fill` straight through, spec finding 1), but the chip row needs the
// identical per-type colour Today's own TodayChip applies inline.
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

/** filterTokens.ts's own Token (`{kind, label, clear, fill}`, one per active
 *  GROUP) adapted to TokenRow's `{key, label, onClear, fill}` shape — the
 *  two don't share a type: filterTokens.ts's `clear` takes the CURRENT
 *  Filters (so a token stays correct after a later, unrelated change),
 *  while TokenRow's `onClear` is a plain callback with no arguments.
 *
 * Library-filter-unification round, Task 2 (spec finding 1): `fill` is
 * passed straight through from `filterTokens.ts` rather than re-derived
 * here by looking the token's own LABEL up in a WorkoutType-keyed map — that
 * lookup only worked while a type token's label was a bare code, and broke
 * silently the moment `types` went multi-select (`"O2 · AT"` resolves no
 * single WorkoutType). `filterTokens.ts` already knows which case it's in
 * (one selected type has a colour; several don't) and sets `fill`
 * accordingly, so this function no longer needs its own type-colour map at
 * all. */
function toRowTokens(
  tokens: ReturnType<typeof filterTokens>,
  filters: Filters,
  onRemove: (next: Filters) => void,
): Token[] {
  return tokens.map((token) => ({
    key: token.kind,
    label: token.label,
    onClear: () => onRemove(token.clear(filters)),
    fill: token.fill,
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
  // sessionStorage persistence) until "Apply Filter" commits it. Opening
  // the sheet seeds this from the currently-applied `filters`; every other
  // way out (backdrop tap, Escape, a tab tap, a hardware/browser back
  // navigation — none of which push a route for the sheet to intercept)
  // just unmounts it with the draft discarded. See FilterSheet.tsx's own
  // doc comment for the BACK-with-sheet-open decision this implements.
  const [draftFilters, setDraftFilters] = useState<Filters>(filters);
  const restoredScrollRef = useRef(false);
  // This screen's own root, read by the scroll listener's disconnected-root
  // guard below (News.tsx's `rootRef` twin, same reason).
  const rootRef = useRef<HTMLElement | null>(null);
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
      // Ignore a scroll event delivered after THIS screen's root has left
      // the document — the disconnected-root echo News.tsx already guards
      // against, and the cause of main's CI failure on 2026-08-11 (twice,
      // through the retry). When a row tap navigates away, React commits
      // the detail screen's much shorter DOM, the browser CLAMPS
      // window.scrollY to ~0, and delivers that clamp as a scroll event.
      // This listener is removed in a PASSIVE effect cleanup, which runs
      // after paint, so under load the clamp arrives first, poisons
      // `lastKnownY`, and both the trailing save and the unmount flush
      // write 0 over the position the rower actually left at. Reproduced
      // 1-in-8 at 15x CPU throttle; storage read 0 while a CDP scrollY
      // read said 2868.
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
      <main className="screen" ref={rootRef}>
        <Header />
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (workoutsState.state === "error") {
    return (
      <main className="screen" ref={rootRef}>
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
      <main className="screen" ref={rootRef}>
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

  // Controller addendum (Phase 6I Task 7, design spec's "invisible outside
  // onboarding" rule): the two designated GLOBAL onboarding workouts never
  // appear in the Library list or its counts — their detail routes stay
  // reachable by id (BaselineCard's own Start, Today.tsx, which runs the
  // session directly off a workout it already has in hand and never goes
  // through this filtered array). Filtered once, up front, so
  // `total`/`visible`/`draftCount` and the FILTER sheet's own live count
  // all agree by construction rather than each re-deriving the exclusion.
  // Final-review fix (2026-08-09): also require `isGlobal` — a rower's own
  // CUSTOM workout that happens to collide with one of these titles is a
  // real, ownable workout; excluding it by title alone orphaned it from
  // the Library list with no way back.
  const workouts = workoutsState.workouts.filter(
    (w) => !(isOnboardingTitle(w.title) && w.isGlobal),
  );

  const total = workouts.length;
  const visible = applyFilters(workouts, filters, baselines);
  const tokens = filterTokens(filters);
  const hasFilters = tokens.length > 0;
  const draftCount = applyFilters(workouts, draftFilters, baselines).length;

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
    <main className="screen" ref={rootRef}>
      <Header />
      {/* Library-filter-unification round, Task 2 (spec §2): TYPE's own
          chip row, outside the sheet — same `.chip`/aria-pressed convention
          Today's own type-swap row uses, MULTI-select (unlike Today's
          single-select swap): tapping toggles that type in `filters.types`
          and persists immediately via the effect below, the same as every
          other filter change. `.type-chip-grid` (index.css, extracted from
          Today's own `.today-type-chips`) lays these out as the identical
          4-column grid Today's row uses — a pure rename, not a new layout.

          Fix round (whole-branch review, finding D): `role="group"` +
          `aria-label="TYPE"` — before this fix the row was four bare
          `aria-pressed` buttons with no group semantics and no name in ANY
          modality, a real regression from the OLD sheet-based TYPE control
          (a `CellGrid`, `role="group"` + a visible "TYPE" label) this chip
          row replaced. `aria-label` rather than a visible label: the row's
          own visual design has no static "TYPE" heading anywhere (the
          `TYPE_WORDS` descriptor beneath it is deliberately conditional —
          exactly one selection — and itself `aria-hidden`), and adding one
          would be a visible layout change this fix isn't scoped to; a
          screen-reader user still needs the name spoken since nothing else
          on screen tells them these four buttons are a group at all. */}
      <div className="chip-wrap type-chip-grid" role="group" aria-label="TYPE">
        {TYPE_CHIPS.map((type) => {
          const selected = filters.types.includes(type);
          return (
            <button
              key={type}
              type="button"
              className="chip"
              aria-pressed={selected}
              style={
                selected
                  ? {
                      background: `var(${TYPE_COLOR_VAR[type]})`,
                      borderColor: `var(${TYPE_COLOR_VAR[type]})`,
                      color: "var(--on-color)",
                    }
                  : undefined
              }
              onClick={() => setFilters(toggleType(filters, type))}
            >
              {type}
            </button>
          );
        })}
      </div>
      {/* The selected type's descriptor WORD (spec §2) shows ONLY while
          exactly one type is selected (zero or several: no text at all) —
          but the `.type-word-row` WRAPPER itself is always mounted (review
          fix I-1), not conditional on that same count. Reusing `.type-word`
          (extracted from Today's own `.today-type-word` — M-7, the fourth
          of this round's class extractions) inside a wrapper that only
          sometimes mounts left the section's own bottom spacing dependent
          on whether the descriptor happened to render: `.type-chip-grid`'s
          4px margin-bottom assumes a `.type-word-row` sibling always
          follows to own the real 16px gap (true on Today, where a type is
          always effectively selected) — on Library, at zero or several
          selections, that sibling was ABSENT, so the chip row sat only 4px
          from `.library-filter-bar` instead of 16px, and toggling a chip in
          or out of exactly-one shifted every row below by ~34px. Always
          mounting the wrapper (aria-hidden regardless, harmless when empty)
          reserves the identical 18px/16px box Today's own row always
          occupies, so the spacing is now constant in every state — the
          word text is still the only thing that comes and goes. */}
      <div className="type-word-row" aria-hidden="true">
        {filters.types.length === 1 && (
          <p className="type-word">{TYPE_WORDS[filters.types[0]]}</p>
        )}
      </div>
      <div className="library-filter-bar">
        <div className="library-filter-row">
          <button
            type="button"
            className="button-outline filter-trigger"
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
              No custom workouts yet:{" "}
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
