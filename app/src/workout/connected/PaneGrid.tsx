// Pane C — the grid (handoff §3's "Pane C — the grid"). The whole session
// on one pane: what has been rowed, what is being rowed, what is coming.
//
// This component places cells and nothing else. Every value, every row
// state and the caption arrive already decided on `SurfaceModel.grid`
// (`surfaceModel.ts`'s `buildGridModel`), which is also where the actual
// cells go through the one `judgedValue` path pane B uses — so the
// split judged ochre on pane B's hero is judged ochre in this grid's
// `/500M` cell by the same call, not by a second opinion.
//
// CONNECTED-REVAMP TASK 5 (design spec §6, revision §4): every row is now
// SINGLE-LINE at a FIXED height (32px landscape / 40px portrait, JAMES
// RULING 2026-08-12 superseding the packet's 8-at-36 for landscape — the
// measured landscape scroller is 232px and 8x36 cannot fit it). There is no
// second line and no third line — the OLD two-line portrait row
// (`.connected-grid-line1`/`-line2`, folded into one row by `display:
// contents` in landscape) and the active row's `REMAINING · TARGET …`
// caption both retired with this task (retirement-inventory.md §6). Every
// row, in both orientations, is now the SAME flat markup: `#` then six or
// seven columns as direct flex children of `.connected-grid-row`. The only
// orientation difference left is which columns are visible (portrait drops
// REST, `index.css`'s own `display: none` toggle) and the handful of size
// tokens (row height, `#` column width) the landscape media query steps.
//
// THE `#` CELL (design spec §5b, built by Task 4b's `intervalNumbering`):
// `row.ordinal` is `null` for the warm-up, which renders `WU` — never a
// number — and work numbering starts at 1 on the first work piece. This
// component does not decide that; it reads `GridRow.ordinal` exactly as
// `surfaceModel.ts` computed it, so the `#` column and the header's own
// `N OF M` (below) cannot disagree — they are the same `intervalNumbering`
// call.
//
// THE HEADER CARRIES THE SESSION TOTALS (revision §4): `3 OF 12 · WORK ·
// 0:47 LEFT` and `38:20 TOTAL`, composed from three scalar `SurfaceModel`
// fields that already exist for other panes
// (`intervalLabelShort`/`intervalClockValue`/`totalLeftDisplay`) — no new
// model field, the same precedent this component's old `trailing` prop
// already set. Portrait stacks this as its own line under the device row
// (390px has no room for one line carrying all of it — measured: device +
// interval + total exceeds the 354px content width); landscape folds both
// into ONE line the same way rows fold their own columns — `display:
// contents` on `.connected-line` and `.connected-grid-totals`, promoting
// their children to direct flex items of `.connected-grid-headline`.
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
import ConnectionLine from "./ConnectionLine";
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
      <div className="connected-grid-headline">
        <ConnectionLine model={model} />
        {/* The session totals (revision §4). `flex: 1` on the interval span
            and `flex: none` on the total is what leaves the growing space to
            the one field whose length actually varies (WARM-UP vs
            `3 OF 12 · WORK`); the total's own width is fixed by its digits. */}
        <div className="connected-grid-totals">
          <span className="connected-grid-interval">
            {model.intervalLabelShort} · {model.intervalClockValue} LEFT
          </span>
          <span className="connected-grid-total">
            {model.totalLeftDisplay} TOTAL
          </span>
        </div>
      </div>
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
  const countdownClass = (cell: "time" | "meters"): string =>
    row.countdown === cell ? " connected-grid-countdown" : "";
  return (
    <div
      ref={ref}
      className={`connected-grid-row connected-grid-${row.state}`}
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
        {/* THE WU CELL (design spec §5b): `ordinal === null` is the warm-up,
            and it is the ONLY row that ever reads `WU` — read straight off
            `GridRow.ordinal`, never re-derived from `row.index` (see this
            field's own doc comment on why). */}
        {row.ordinal === null ? "WU" : row.ordinal}
      </span>
      <span className={`connected-grid-time${countdownClass("time")}`}>
        {row.time}
      </span>
      <span className={`connected-grid-meters${countdownClass("meters")}`}>
        {row.meters}
      </span>
      <span className={cellClass("connected-grid-pace", row.pace)}>
        {row.pace.display}
      </span>
      <span className={cellClass("connected-grid-spm", row.spm)}>
        {row.spm.display}
      </span>
      <span className="connected-grid-hr">{row.hr}</span>
      <span className="connected-grid-rest">{row.rest}</span>
    </div>
  );
}
