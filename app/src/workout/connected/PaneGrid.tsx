// Pane C — the grid (handoff §3's "Pane C — the grid"). The whole session
// on one pane: what has been rowed, what is being rowed, what is coming.
//
// This component places cells and nothing else. Every value, every row
// state and the caption arrive already decided on `SurfaceModel.grid`
// (`surfaceModel.ts`'s `buildGridModel`), which is also where the actual
// cells go through the one `judgedValue` path panes A and B use — so the
// split judged ochre on pane B's hero is judged ochre in this grid's
// `/500M` cell by the same call, not by a second opinion.
//
// ONE MARKUP, TWO ORIENTATIONS, same technique the other two panes use.
// Portrait draws two lines per row (`# · TIME · METERS · /500M` at 15px,
// then `SPM · HR · REST` at 12px indented 30px under the interval number);
// landscape turns both line wrappers into `display: contents` so their
// seven cells become direct flex items of one row at the handoff's own
// weights (`26px / 1.1 / 1 / 1 / 0.7 / 0.7 / 0.9`). Nothing re-mounts on
// rotation and no cell exists twice.
//
// THE ONE SCROLL ON THIS SURFACE (DEVIATIONS row 2, handoff §3: "pane C is
// the single exception to the no-scroll rule, and it is contained"). The
// header row and the caption are pinned by being flex-none siblings of the
// scroller; End is pinned because it belongs to the shell's footer, outside
// this pane entirely. Only `.connected-grid-rows` scrolls, and the active
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
// order are scoped to `.connected-pane-timer` and `.connected-pane-live`,
// and this pane declares NO `order` anywhere. Its DOM sequence IS its
// reading sequence in both orientations, so the scroller is tabbed to
// exactly where it is seen — above End, which sits below the grid in the
// shell's footer. Pinned in jsdom AND in a real browser; see the task-7
// report for why the DOM was NOT reordered to put End first.

import { useEffect, useRef } from "react";
import ConnectionLine from "./ConnectionLine";
import type { GridRow, GridValue, SurfaceModel } from "./surfaceModel";

/** The tint class every judged actual on this surface wears — panes A and B
 *  put it on cards and a hero, this pane puts it on a table cell. A
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
      {/* The mockup's own header line: the device, then the whole session's
          time left. Pane C has no room for the shared `TimerRuler` that
          prints that figure on A and B, so the caption carries it. */}
      <ConnectionLine
        model={model}
        trailing={`${model.totalLeftDisplay} LEFT`}
      />
      <div className="connected-grid-head">
        <div className="connected-grid-line1">
          <span className="connected-grid-num">#</span>
          <span className="connected-grid-time">TIME</span>
          <span className="connected-grid-meters">METERS</span>
          <span className="connected-grid-pace">/500M</span>
        </div>
        {/* Landscape's remaining three headings. `display: contents` there
            folds them into the one header row; in portrait they are hidden,
            because the portrait rows label those three cells inline
            (`SPM 18`) exactly as the mockup does. */}
        <div className="connected-grid-line2">
          <span className="connected-grid-spm">SPM</span>
          <span className="connected-grid-hr">HR</span>
          <span className="connected-grid-rest">REST</span>
        </div>
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
      <div className="connected-grid-line1">
        <span className="connected-grid-num">
          {/* The 7x14 filled now-marker, beside a bold index (handoff §3's
              active-row treatment). Decorative: `aria-current` on the row
              itself is what carries the same fact to a screen reader. */}
          {row.state === "active" && (
            <span className="connected-grid-marker" aria-hidden="true" />
          )}
          {row.index + 1}
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
      </div>
      <div className="connected-grid-line2">
        <span className={cellClass("connected-grid-spm", row.spm)}>
          <span className="connected-grid-inline-label" aria-hidden="true">
            SPM{" "}
          </span>
          {row.spm.display}
        </span>
        <span className="connected-grid-hr">
          <span className="connected-grid-inline-label" aria-hidden="true">
            HR{" "}
          </span>
          {row.hr}
        </span>
        <span className="connected-grid-rest">
          <span className="connected-grid-inline-label" aria-hidden="true">
            REST{" "}
          </span>
          {row.rest}
        </span>
      </div>
      {row.remainingLine !== null && (
        <p className="connected-grid-remaining">{row.remainingLine}</p>
      )}
    </div>
  );
}
