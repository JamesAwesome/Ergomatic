// The labelled pager (handoff §3's "Pager dots", DEVIATIONS row 4 — the
// deliberate departure from ErgZone's bare dots: "Three unlabelled dots
// don't say what's behind them and a wet thumb shouldn't have to explore").
//
// ONE component for both orientations. The band/rail geometry is CSS
// (`index.css`'s `.connected-pager`, portrait 54px bottom band with two
// equal halves, landscape a 44px sensor-gutter column at the PHYSICAL edge
// with two 44x44 targets either side of a decorative housing spacer); the
// only thing that changes in the markup is which of the two label sets is
// rendered, and BOTH are always in the DOM — the wrong one is hidden by the
// orientation media query, never unmounted, so a rotation cannot reflow or
// re-mount the control the rower's thumb is already on.
//
// connected-revamp Task 2 (revision §1/§2): the timer pane is dropped from
// connected mode entirely — `PANES` is down to `["live","grid"]`, and the
// gutter's own housing spacer (`connected-pager-housing`, landscape-only)
// sits between the two remaining targets, matching the mockup's own
// LIVE/[housing]/GRID column order.

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
      <PagerTarget pane={PANES[0]} active={active} onSelect={onSelect} />
      {/* Decorative: the camera-housing bump the mockup draws between the
          two landscape targets (revision §2's own gutter diagram). Hidden
          entirely in portrait, where there is no gutter to share with a
          housing — `index.css` gives it zero footprint there rather than
          just visually hiding it, so it never perturbs the two-tab bar's
          `flex: 1` split. */}
      <span className="connected-pager-housing" aria-hidden="true" />
      <PagerTarget pane={PANES[1]} active={active} onSelect={onSelect} />
    </nav>
  );
}
