// The labelled pager (handoff §3's "Pager dots", DEVIATIONS row 4 — the
// deliberate departure from ErgZone's bare dots: "Three unlabelled dots
// don't say what's behind them and a wet thumb shouldn't have to explore").
//
// ONE component for both orientations. The band/rail geometry is CSS
// (`index.css`'s `.connected-pager`, portrait 56px bottom band with three
// 130x56 thirds, landscape 56px right-edge rail with three 56x56 targets);
// the only thing that changes in the markup is which of the two label sets
// is rendered, and BOTH are always in the DOM — the wrong one is hidden by
// the orientation media query, never unmounted, so a rotation cannot reflow
// or re-mount the control the rower's thumb is already on.

// eslint-disable-next-line react-refresh/only-export-components
export const PANES = ["timer", "live", "grid"] as const;

export type PaneId = (typeof PANES)[number];

/** Portrait labels (handoff §3), their landscape abbreviations, and the
 *  spoken name. Both visible labels ship in every orientation (see the file
 *  header) and are therefore BOTH `aria-hidden`: an accessible name built
 *  from them would read "TIMER TMR" in every orientation, and would change
 *  meaning on rotation if only one were exposed. `spoken` is the button's
 *  own `aria-label`, stable in both. */
const LABELS: Record<PaneId, { long: string; short: string; spoken: string }> =
  {
    timer: { long: "TIMER", short: "TMR", spoken: "Timer pane" },
    live: { long: "LIVE", short: "LIVE", spoken: "Live pane" },
    grid: { long: "GRID", short: "GRID", spoken: "Grid pane" },
  };

export interface PagerRailProps {
  active: PaneId;
  onSelect: (pane: PaneId) => void;
}

export default function PagerRail({ active, onSelect }: PagerRailProps) {
  return (
    <nav className="connected-pager" aria-label="Connected panes">
      {PANES.map((pane) => (
        <button
          key={pane}
          type="button"
          className={
            pane === active
              ? "connected-pager-target connected-pager-target-active"
              : "connected-pager-target"
          }
          // The pressed state, not a disabled one: the active target stays
          // tappable (a mis-swipe's fastest undo is tapping where you meant
          // to be), and `aria-current` is what tells a screen reader which
          // pane is showing.
          aria-current={pane === active ? "page" : undefined}
          aria-label={LABELS[pane].spoken}
          onClick={() => onSelect(pane)}
        >
          <span className="connected-pager-mark" aria-hidden="true" />
          <span
            className="connected-pager-label connected-pager-label-long"
            aria-hidden="true"
          >
            {LABELS[pane].long}
          </span>
          <span
            className="connected-pager-label connected-pager-label-short"
            aria-hidden="true"
          >
            {LABELS[pane].short}
          </span>
        </button>
      ))}
    </nav>
  );
}
