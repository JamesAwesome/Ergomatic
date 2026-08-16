// The header segmented control (CR2 spec 3, task 1 — design spec §3
// "Components"). Replaces `PagerRail.tsx` (retired whole with this file):
// no more decorative mark, no more long/short label pair for a
// gutter-vs-band shape — one plain two-button pill that the SHELL positions
// by CSS alone, landscape beside the header content, portrait as the 54px
// bottom bar (`index.css`'s own `.connected-control` comment has the
// mechanism). This component renders the same markup in both orientations
// and takes no position of its own.
//
// RULING (antagonist correction 2, task-1 brief) — accessible names KEEP
// PagerRail's values: `aria-label="Live pane"` / `"Grid pane"`. ~27 existing
// selectors across unit, e2e and the committed fixtures already anchor on
// those names; renaming them for a shell restructure is a 27-site sweep for
// no rower-facing benefit. The visible `LIVE`/`GRID` word stays
// `aria-hidden`, the rail's own shipped pattern, so a screen reader never
// reads the pane's name twice.
//
// KEYBOARD: no roving tabindex (spec §3: "no APG tablist invention") — two
// independent buttons in normal tab order, exactly PagerRail's own
// semantics. `aria-current="page"` on the active half is the one shipped
// use of `"page"` in this app (carried over from the rail, spec §3 notes
// it), not a new idiom.

// eslint-disable-next-line react-refresh/only-export-components
export const PANES = ["live", "grid"] as const;

export type PaneId = (typeof PANES)[number];

/** The visible word and the spoken name, per pane — a single size in every
 *  orientation now (`--c-size-control` is 13px landscape AND portrait,
 *  design spec §1's role mapping), so unlike the rail this needs no
 *  long/short pair. */
const LABELS: Record<PaneId, { visible: string; spoken: string }> = {
  live: { visible: "LIVE", spoken: "Live pane" },
  grid: { visible: "GRID", spoken: "Grid pane" },
};

export interface SegmentedControlProps {
  active: PaneId;
  /** `target` is the button that was pressed — `ConnectedSurface` needs it
   *  for the triple-tap diagnostics gesture (which target the taps landed
   *  on) and to hand the log sheet a focus-restore anchor, the same two
   *  jobs `PagerRail`'s own `onSelect` served. */
  onSelect: (pane: PaneId, target: HTMLElement) => void;
}

export default function SegmentedControl({
  active,
  onSelect,
}: SegmentedControlProps) {
  return (
    <nav className="connected-control" aria-label="Connected panes">
      {/* Built off `PANES` itself, not a hardcoded pair (the same guard
          `PagerRail.tsx` carried, review Minor-8 there): a third pane would
          otherwise render silently unreachable rather than failing a
          length check that expects two. */}
      {PANES.map((pane) => (
        <button
          key={pane}
          type="button"
          className={
            pane === active
              ? "connected-control-half connected-control-half-active"
              : "connected-control-half"
          }
          aria-current={pane === active ? "page" : undefined}
          aria-label={LABELS[pane].spoken}
          onClick={(event) => onSelect(pane, event.currentTarget)}
        >
          <span aria-hidden="true">{LABELS[pane].visible}</span>
        </button>
      ))}
    </nav>
  );
}
