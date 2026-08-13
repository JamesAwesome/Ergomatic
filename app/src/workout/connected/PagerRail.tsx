// The labelled pager (handoff §3's "Pager dots", DEVIATIONS row 4 — the
// deliberate departure from ErgZone's bare dots: "Three unlabelled dots
// don't say what's behind them and a wet thumb shouldn't have to explore").
//
// ONE component for both orientations. The band/rail geometry is CSS
// (`index.css`'s `.connected-pager`, portrait 54px bottom band with two
// equal halves, landscape a 44px sensor-gutter column at the PHYSICAL
// edge holding two 44x44 targets, LIVE top and GRID bottom); the only
// thing that changes in the markup is which of the two label sets is
// rendered, and BOTH are always in the DOM — the wrong one is hidden by the
// orientation media query, never unmounted, so a rotation cannot reflow or
// re-mount the control the rower's thumb is already on.
//
// connected-revamp Task 2 (revision §1/§2): the timer pane is dropped from
// connected mode entirely — `PANES` is down to `["live","grid"]`.
//
// THE DECORATIVE HOUSING SPACER IS GONE (James's erg walk, 2026-08-13).
// The mockup drew an 11x104 ink bar between the two landscape targets to
// represent the phone's camera bump; on a real mounted phone it renders
// millimetres from the actual bump it depicts, so it reads as a smudge on
// the glass rather than as a picture of one. James: "i think it just takes
// up space." Deleting it also retires the `DEVIATIONS` row that existed
// solely to excuse its 6px radius against the house's 2px. `space-between`
// on the gutter still puts LIVE at the top and GRID at the bottom — the
// spacer was never what positioned them.

// eslint-disable-next-line react-refresh/only-export-components
export const PANES = ["live", "grid"] as const;

export type PaneId = (typeof PANES)[number];

/** Portrait labels (handoff §3), their landscape abbreviations, and the
 *  spoken name. Both visible labels ship in every orientation (see the file
 *  header) and are therefore BOTH `aria-hidden`: an accessible name built
 *  from them would read "LIVE LIVE" in every orientation (long and short
 *  forms are now identical text for both surviving panes), and would change
 *  meaning on rotation if only one were exposed. `spoken` is the button's
 *  own `aria-label`, stable in both. */
const LABELS: Record<PaneId, { long: string; short: string; spoken: string }> =
  {
    live: { long: "LIVE", short: "LIVE", spoken: "Live pane" },
    grid: { long: "GRID", short: "GRID", spoken: "Grid pane" },
  };

export interface PagerRailProps {
  active: PaneId;
  /** `target` is the button that was pressed. The shell needs it for two
   *  things the rail itself has no opinion about: counting the deliberate
   *  taps that open the diagnostics sheet (handoff §5), and giving that
   *  sheet the element to hand focus back to when it closes. */
  onSelect: (pane: PaneId, target: HTMLElement) => void;
}

function PagerTarget({
  pane,
  active,
  onSelect,
}: {
  pane: PaneId;
  active: PaneId;
  onSelect: (pane: PaneId, target: HTMLElement) => void;
}) {
  return (
    <button
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
      onClick={(event) => onSelect(pane, event.currentTarget)}
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
  );
}

export default function PagerRail({ active, onSelect }: PagerRailProps) {
  return (
    <nav className="connected-pager" aria-label="Connected panes">
      {/* Built off `PANES` itself (fix round, review Minor-8), not a fixed
          `PANES[0]`/`PANES[1]` pair: a hardcoded index still renders two
          targets if `PANES` ever grew a third, silently never showing it —
          passing the census test's own LENGTH check while failing its
          intent. */}
      {PANES.map((pane) => (
        <PagerTarget
          key={pane}
          pane={pane}
          active={active}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}
