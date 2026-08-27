// Pane C — the grid (handoff §3's "Pane C — the grid"). The whole session
// on one pane: what has been rowed, what is being rowed, what is coming.
//
// This component places cells and nothing else. Every value, every row
// state and the caption arrive already decided on `SurfaceModel.grid`
// (`surfaceModel.ts`'s `buildGridModel`), which is also where the actual
// cells go through the one `judgedValue` path pane B uses — so the
// split judged `"faster"` (blue) on pane B's hero is judged blue in this
// grid's `/500M` cell by the same call, not by a second opinion.
//
// CONNECTED-REVAMP TASK 5 (design spec §6, revision §4): every row is now
// SINGLE-LINE at a FIXED height (32px landscape / 40px portrait, JAMES
// RULING 2026-08-12 superseding the packet's 8-at-36 for landscape). The
// ruling was made against a landscape scroller measured at 232px, which
// 8x36 = 288 cannot fit; the figure has moved several times since (Task 5
// measured 239 — an un-zeroed UA margin on a caption `<p>` — Task 6's
// footer reclaim took it to 276, and CR2 spec 3 Task 1's header restructure
// left it there too, after correcting its own fix-round defect (a real
// `border` on `.connected-control` briefly grew grid row 1 past its own
// 44px — `index.css`'s own review Important-2 comment has the fix). CR2
// spec 3 TASK 5 MOVES IT AGAIN: this task deletes the headline outright
// (below), so the scroller's own three flex-none siblings drop from three
// to two (the column head and the caption) — `index.css`'s own
// `.connected-pane-grid`/`.connected-grid-rows` comments carry the current
// measured figure and `e2e/screenshots.spec.ts`'s
// `LANDSCAPE_GRID_SCROLLER_PX`/`PORTRAIT_GRID_SCROLLER_PX` pin it. There is
// no second line and no third line — the OLD two-line portrait row
// (`.connected-grid-line1`/`-line2`, folded into one row by `display:
// contents` in landscape) and the active row's `REMAINING · TARGET …`
// caption both retired earlier (retirement-inventory.md §6). Every row, in
// both orientations, is now the SAME flat markup: `#` then six or seven
// columns as direct flex children of `.connected-grid-row`. The only
// orientation difference left is which columns are visible (portrait drops
// REST, `index.css`'s own `display: none` toggle) and the handful of size
// tokens (row height, `#` column width) the landscape media query steps.
//
// RC-24 (2026-08-26): the ACTIVE row now has a rest-countdown form, and
// WHICH CELL WEARS IT DIFFERS BY ORIENTATION — JAMES RULING 2026-08-26,
// after the first capture showed the row saying REST twice (`0:59` in
// `/500M`, the programmed `3:00` in the REST column, on the same row): in
// PORTRAIT (no REST column at all — `.connected-grid-rest`'s own
// `display: none`) the `/500M` cell carries it, exactly as shipped; in
// LANDSCAPE it moves into the REST column instead, and `/500M` reverts to
// its ORDINARY (coast-pace) form. ONE MODEL, NOT TWO CODE PATHS:
// `row.restCountdown` is rendered into BOTH cells unconditionally whenever
// `row.countdown === "rest"` — the `/500M` cell always carries both its
// rest-form and its coast-pace form, and CSS (`.connected-grid-rest-
// countdown` / `.connected-grid-pace-coast`, the landscape query) is what
// decides which one a given orientation shows; this component never asks
// what orientation it is in.
//
// THE COAST-PACE FORM DASHES DURING A REST — fix round 2 (James, spotting
// it in the committed landscape capture: "So /500m in landscape isn't '-'
// during rest???"). `row.pace` is NOT `livePace` on this row while
// resting: `buildGridModel`'s active branch (`surfaceModel.ts`) already
// replaces it with the house dash, unjudged, before this component ever
// sees it — `livePace`/`frame.currentSplit` during a rest is a coasting
// flywheel's split, judged against a work target it no longer means, and
// that number is worse than the tint already removed (round 1): it is
// precisely the number a rower could mistake for their result, on the row
// whose REST column is counting down beside it. `cellClass` is never
// called on the coast span either way, but the span's own TEXT is now the
// dash the model hands it, not a coasting reading. See
// `GridRow.countdown`'s own doc comment (`surfaceModel.ts`) for the wire
// reasoning and the design spec's "superseded" ruling for the record of
// why landscape changed, twice.
//
// THE `#` CELL (design spec §5b, built by Task 4b's `intervalNumbering`):
// numbering starts at 1 on the first piece. `row.ordinal` used to be `null`
// for a warm-up row, which rendered `WU`; Phase WU removed that case. This
// component does not decide the numbering; it reads `GridRow.ordinal` as
// `surfaceModel.ts` computed it, so the `#` column and the shell header's
// own `N OF M` (see `ConnectedSurface.tsx`) cannot disagree — they are the
// same `intervalNumbering` call.
//
// THE HEADLINE IS GONE (CR2 spec 3 Task 5, design spec §2B's composition
// note): the session totals this pane used to draw for itself
// (`3 OF 12 · WORK · 0:47 LEFT` / `38:20 TOTAL`) duplicated the shell
// header's own status caption, which read `3 OF 12 · WORK` one row above
// this pane's headline on the SAME screen. The redesign closes that gap by
// deleting this pane's own copy outright and composing the ONE surviving
// header instead: `ConnectedSurface.tsx` now feeds `ConnectionLine`'s
// trailing slot `intervalOrdinalLabel · <totalLeftDisplay LEFT>` (marker
// gold) whenever the GRID pane is active, reusing `SurfaceModel` fields
// that already existed for other panes — no new model field, the same
// precedent this component's own old `trailing` prop used to set. This
// pane's DOM starts directly at `.connected-grid-head` now; there is no
// `.connected-grid-headline` any more.
//
// THE ONE SCROLL ON THIS SURFACE (DEVIATIONS row 2, handoff §3: "pane C is
// the single exception to the no-scroll rule, and it is contained"). The
// header row and the caption are pinned by being flex-none siblings of the
// scroller; End is pinned because it belongs to the shell's HEADER, above
// this pane entirely (connected-revamp Task 6's safety fix moved it there
// out of the footer). Only `.connected-grid-rows` scrolls, and the active
// row is scrolled into view whenever the machine moves on.
//
// TAB ORDER (task-6 review's L4 trap, and the task-7 review's M3 — this
// comment used to be wrong, in a way only a browser could show).
//
// The claim it made was "this pane contains no focusable element at all".
// That is true in jsdom and FALSE in Chromium: a scroll container with no
// focusable children is keyboard-focusable by default there, so
// `.connected-grid-rows` was already the surface's first tab stop — as an
// unnamed `<div>`. It is now focusable ON PURPOSE and NAMED: `tabIndex={0}`
// plus `role="group"` and an accessible name. Keyboard operability of a
// scrollable region is WCAG 2.1.1's requirement, not an accident to
// suppress, and iOS Safari — the real target — does NOT supply it
// implicitly, so declaring it is also the only way the two engines agree.
// (It is what axe's `scrollable-region-focusable` will look for when Task
// 8's browser sweep reaches this pane.)
//
// The L4 trap itself is still not live, for the reason it always was: the
// portrait `order` declarations that make DOM order diverge from reading
// order are scoped to `.connected-pane-live` (connected-revamp Task 2
// retired `.connected-pane-timer`'s own order block along with the file
// that rendered it), and this pane declares NO `order` anywhere. Its DOM
// sequence IS its
// reading sequence in both orientations, so the scroller is tabbed to
// exactly where it is seen — BELOW End, which sits above the grid in the
// shell's header (connected-revamp Task 6; the tab order pinned in
// `PaneGrid.test.tsx` and `e2e/screenshots.spec.ts` is End first, then this
// scroller, then the two pager targets). Pinned in jsdom AND in a real
// browser; the DOM did not need reordering for that to be the reading
// order — moving End is what put the two in agreement.

import { useEffect, useRef } from "react";
import type { GridRow, GridValue, SurfaceModel } from "./surfaceModel";

/** The tint class every judged actual on this surface wears — pane B puts
 *  it on cards and a hero, this pane puts it on a table cell. A
 *  PROGRAMMED value has `judged: null` and gets no such class, which is how
 *  "programmed values are never tinted" is enforced by the data rather than
 *  by each cell remembering. */
function cellClass(base: string, value: GridValue): string {
  return value.judged === null
    ? base
    : `${base} timer-card-actual-${value.judged.judgement}`;
}

export default function PaneGrid({ model }: { model: SurfaceModel }) {
  const activeRow = useRef<HTMLDivElement>(null);
  const activeIndex = model.grid.activeIndex;

  // "The active row is always scrolled into view" (handoff §3). `block:
  // "nearest"` so a row already on screen does not jerk the list around
  // every time the machine ticks. The optional call is for jsdom, which
  // does not implement `scrollIntoView` at all — the behaviour is asserted
  // by a spy in `PaneGrid.test.tsx`, and by the landscape screenshot.
  useEffect(() => {
    activeRow.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="connected-pane connected-pane-grid">
      <div className="connected-grid-head">
        <span className="connected-grid-num">#</span>
        <span className="connected-grid-time">TIME</span>
        <span className="connected-grid-meters">METERS</span>
        <span className="connected-grid-pace">/500M</span>
        <span className="connected-grid-spm">SPM</span>
        <span className="connected-grid-hr">HR</span>
        {/* Landscape-only column (revision §4's own table); hidden in
            portrait by `index.css`, never omitted from the DOM — one markup,
            two orientations, same rule the rows below follow for the same
            cell. */}
        <span className="connected-grid-rest">REST</span>
      </div>
      {/* Focusable and named on purpose — see this file's TAB ORDER note.
          `role="group"` rather than `region`: this is a scrollable list
          inside a pane, not a landmark of the surface. */}
      <div
        className="connected-grid-rows"
        tabIndex={0}
        role="group"
        aria-label="Interval grid"
      >
        {model.grid.rows.map((row) => (
          <Row
            key={row.index}
            row={row}
            ref={row.state === "active" ? activeRow : undefined}
          />
        ))}
      </div>
      {model.grid.caption !== null && (
        <p className="connected-grid-caption">{model.grid.caption}</p>
      )}
    </div>
  );
}

function Row({ row, ref }: { row: GridRow; ref?: React.Ref<HTMLDivElement> }) {
  // Fix round (review D3): narrowed back to the two cells this is actually
  // called for. `GridRow.countdown` itself still admits `"rest"` — the
  // /500M cell and the REST column both read it directly (below), never
  // through this helper, so widening this signature to match was dead.
  const countdownClass = (cell: "time" | "meters"): string =>
    row.countdown === cell ? " connected-grid-countdown" : "";
  return (
    <div
      ref={ref}
      // RC-24: a running rest sinks the row (`--surface-sunken`), the third
      // of the three channels that carry "a rest is running" — the word
      // REST and the gold mark are the other two, none of them alone.
      className={`connected-grid-row connected-grid-${row.state}${
        row.countdown === "rest" ? " connected-grid-resting" : ""
      }`}
      // The colour-free half of "this is the one you are on": the marker
      // square and the ink border say it visually, this says it to a
      // screen reader.
      aria-current={row.state === "active" ? "step" : undefined}
    >
      <span className="connected-grid-num">
        {/* The 4x20 filled now-marker, beside a bold index (revision §4's
            active-row treatment). Decorative: `aria-current` on the row
            itself is what carries the same fact to a screen reader. */}
        {row.state === "active" && (
          <span className="connected-grid-marker" aria-hidden="true" />
        )}
        {/* THE `#` CELL (design spec §5b): read straight off
            `GridRow.ordinal`, never re-derived from `row.index` (see that
            field's own doc comment on why). */}
        {row.ordinal}
      </span>
      <span className={`connected-grid-time${countdownClass("time")}`}>
        {row.time}
      </span>
      <span className={`connected-grid-meters${countdownClass("meters")}`}>
        {row.meters}
      </span>
      {row.countdown === "rest" ? (
        /* RC-24 fix round (James, 2026-08-26): BOTH forms render
           unconditionally — this component does not know or ask which
           orientation is live, CSS does (the landscape query flips which
           span is `display: none`). Neither form is judged: see this
           file's own header note on why the coast span carries no
           `cellClass` either, in either orientation. */
        <span className="connected-grid-pace">
          <span className="connected-grid-rest-countdown">
            <span className="connected-grid-rest-word">R</span>{" "}
            {row.restCountdown}
          </span>
          <span className="connected-grid-pace-coast">{row.pace.display}</span>
        </span>
      ) : (
        <span className={cellClass("connected-grid-pace", row.pace)}>
          {row.pace.display}
        </span>
      )}
      <span className={cellClass("connected-grid-spm", row.spm)}>
        {row.spm.display}
      </span>
      <span className="connected-grid-hr">{row.hr}</span>
      {/* RC-24 fix round: the REST column's own content decision — this
          row's PROGRAMMED rest, or (active row, resting) the machine's
          live countdown, gold like the /500M form landscape suppresses.
          Not an orientation branch: this ternary reads `row.countdown`,
          the same field the /500M cell above reads, and runs identically
          whether or not the column is even visible — the column's OWN
          existing display:none/block toggle (portrait/landscape) is what
          orientation actually governs here, unchanged by this task. */}
      <span
        className={
          row.countdown === "rest"
            ? "connected-grid-rest connected-grid-rest-live"
            : "connected-grid-rest"
        }
      >
        {row.countdown === "rest" ? row.restCountdown : row.rest}
      </span>
    </div>
  );
}
