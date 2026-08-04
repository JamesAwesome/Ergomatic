import type { CSSProperties } from "react";

/**
 * One labelled group of toggleable cells inside a sheet (FilterSheet.tsx's
 * TYPE/TIME/PAIN/LAST DONE/SOURCE groups, lifted out whole) — single vs.
 * multi-select is the CALLER's own reducer (`toggleType` replaces,
 * `toggleDuration` accumulates), this component only ever reports which
 * `value` was pressed.
 *
 * The column count (`filter-sheet-grid-N`) is derived from `cells.length`
 * rather than taken as a prop: every existing group's column count already
 * equals its own cell count (TYPE/TIME are 4-wide with 4 cells, PAIN is
 * 5-wide with 5, LAST DONE/SOURCE are 2-wide with 2), so this stays a pure
 * function of what's passed rather than a second number the caller could
 * get out of sync with the array.
 *
 * `cell.style` is additive beyond the plan's own `{value, label, pressed}`
 * shape — needed to keep `FilterSheet.tsx`'s TYPE cells filling their own
 * `--type-*` color inline when active (pinned by FilterSheet.test.tsx's "a
 * TYPE cell fills its own type color inline when active"); every other
 * group simply omits it. `className` is likewise additive, letting a
 * caller apply a layout modifier (`filter-sheet-group-half`, for the LAST
 * DONE/SOURCE pair that shares a row) without this component needing to
 * know that modifier exists.
 */
export function CellGrid({
  label,
  cells,
  onToggle,
  className,
}: {
  label: string;
  cells: {
    value: string;
    label: string;
    pressed: boolean;
    style?: CSSProperties;
  }[];
  onToggle: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={["filter-sheet-group", className].filter(Boolean).join(" ")}
    >
      <span className="filter-sheet-group-label">{label}</span>
      <div className={`filter-sheet-grid filter-sheet-grid-${cells.length}`}>
        {cells.map((cell) => (
          <button
            key={cell.value}
            type="button"
            className="filter-sheet-cell"
            aria-pressed={cell.pressed}
            style={cell.style}
            onClick={() => onToggle(cell.value)}
          >
            {cell.label}
          </button>
        ))}
      </div>
    </div>
  );
}
