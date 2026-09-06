import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  DURATION_RANGE_MAX,
  DURATION_STEP,
  type DurationRange as Range,
} from "../../domain/duration.js";
import { formatThumbValue, thumbValueText } from "./durationRangeLabel";

/** Phase SF PR2 (spec §1.3, §3.4): TIME as a two-thumb minutes range on one
 *  rail — a CUSTOM control per the WAI-ARIA APG Multi-Thumb Slider pattern,
 *  not two overlaid native `<input type="range">`s (the anchor pass showed
 *  the overlay needs `pointer-events` on `::-webkit-slider-thumb`, which
 *  MDN labels non-standard, and the CSSWG's replacement has an open "no
 *  multiple thumbs" issue; MUI's and the APG's own examples are custom
 *  `role="slider"` nodes). Each thumb is a 44 px `<button role="slider">`
 *  carrying `aria-valuemin/max/now/valuetext` and a label, in the tab
 *  order; keys per the base Slider pattern: arrows step `DURATION_STEP`,
 *  Home/End to the bounds, Page Up/Down a larger step. "In many two-thumb
 *  sliders, the thumbs are not allowed to pass one another" (APG): the
 *  moving thumb stops at the other's value. Pointer drag via Pointer
 *  Events with capture; a tap on the rail moves the NEARER thumb. The
 *  value is controlled — the caller owns it like every other sheet group.
 *  0 reads ANY (no lower bound), 120 reads 120′+ (no upper bound). */
export function DurationRange({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Range;
  onChange: (next: Range) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  // Which thumb a pointer is dragging, if any — set on pointerdown with
  // capture, cleared on up/cancel, so a stray move after release is inert.
  const draggingRef = useRef<"min" | "max" | null>(null);
  const labelId = `filter-sheet-group-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const PAGE = DURATION_STEP * 3;

  function snap(n: number): number {
    const stepped = Math.round(n / DURATION_STEP) * DURATION_STEP;
    return Math.min(DURATION_RANGE_MAX, Math.max(0, stepped));
  }

  function set(which: "min" | "max", raw: number) {
    // The no-cross clamp: the moving thumb stops at the other's value.
    const n = snap(raw);
    if (which === "min") {
      const min = Math.min(n, value.max);
      if (min !== value.min) onChange({ min, max: value.max });
    } else {
      const max = Math.max(n, value.min);
      if (max !== value.max) onChange({ min: value.min, max });
    }
  }

  function handleKeyDown(which: "min" | "max", event: KeyboardEvent) {
    const current = which === "min" ? value.min : value.max;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = current + DURATION_STEP;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = current - DURATION_STEP;
        break;
      case "PageUp":
        next = current + PAGE;
        break;
      case "PageDown":
        next = current - PAGE;
        break;
      case "Home":
        next = which === "min" ? 0 : value.min;
        break;
      case "End":
        next = which === "min" ? value.max : DURATION_RANGE_MAX;
        break;
      default:
        return;
    }
    event.preventDefault();
    set(which, next);
  }

  function valueAt(clientX: number): number {
    const rail = railRef.current;
    if (!rail) return 0;
    const box = rail.getBoundingClientRect();
    if (box.width <= 0) return 0;
    const ratio = (clientX - box.left) / box.width;
    return ratio * DURATION_RANGE_MAX;
  }

  function handleThumbPointerDown(
    which: "min" | "max",
    event: PointerEvent<HTMLButtonElement>,
  ) {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    // Keep keyboard focus on the thumb being dragged so a following arrow
    // key continues from where the finger left it.
    event.currentTarget.focus();
    draggingRef.current = which;
  }

  function handleThumbPointerMove(
    which: "min" | "max",
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (draggingRef.current !== which) return;
    set(which, valueAt(event.clientX));
  }

  function handleThumbPointerUp(event: PointerEvent<HTMLButtonElement>) {
    draggingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleRailPointerDown(event: PointerEvent<HTMLDivElement>) {
    // A tap on the rail itself (not on a thumb — thumbs stop propagation)
    // moves whichever thumb is nearer to the tapped value.
    // Outside the range the choice is forced (and a collapsed range — both
    // thumbs on one value — would otherwise send every tap to the clamped
    // thumb and move nothing: delta pass F5); inside it, the nearer one.
    const tapped = snap(valueAt(event.clientX));
    const nearer =
      tapped > value.max
        ? "max"
        : tapped < value.min
          ? "min"
          : Math.abs(tapped - value.min) <= Math.abs(tapped - value.max)
            ? "min"
            : "max";
    set(nearer, tapped);
  }

  const pct = (n: number) => `${(n / DURATION_RANGE_MAX) * 100}%`;

  return (
    <div className="filter-sheet-group">
      <span id={labelId} className="filter-sheet-group-label">
        {label}
      </span>
      <div className="duration-range" role="group" aria-labelledby={labelId}>
        <div className="duration-range-values" aria-hidden="true">
          <span className="duration-range-value">
            {formatThumbValue(value.min, "min")}
          </span>
          <span className="duration-range-value">
            {formatThumbValue(value.max, "max")}
          </span>
        </div>
        <div
          className="duration-range-rail"
          ref={railRef}
          onPointerDown={handleRailPointerDown}
        >
          <div
            className="duration-range-span"
            style={{
              left: pct(value.min),
              right: `${100 - (value.max / DURATION_RANGE_MAX) * 100}%`,
            }}
          />
          {(["min", "max"] as const).map((which) => {
            const current = which === "min" ? value.min : value.max;
            return (
              <button
                key={which}
                type="button"
                role="slider"
                className={`duration-range-thumb duration-range-thumb-${which}`}
                aria-label={which === "min" ? "Shortest" : "Longest"}
                // APG multi-thumb: "When the range … of another slider is
                // dependent on the current value of a slider, the values of
                // aria-valuemin or aria-valuemax of the dependent sliders are
                // updated when the value changes." The clamp makes the lower
                // thumb's real maximum the upper's value and vice versa
                // (delta pass F2).
                aria-valuemin={which === "max" ? value.min : 0}
                aria-valuemax={which === "min" ? value.max : DURATION_RANGE_MAX}
                aria-valuenow={current}
                aria-valuetext={thumbValueText(current, which)}
                style={{ left: pct(current) }}
                onKeyDown={(event) => handleKeyDown(which, event)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  handleThumbPointerDown(which, event);
                }}
                onPointerMove={(event) => handleThumbPointerMove(which, event)}
                onPointerUp={handleThumbPointerUp}
                onPointerCancel={handleThumbPointerUp}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
