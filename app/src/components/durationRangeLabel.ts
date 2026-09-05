import {
  DURATION_RANGE_MAX,
  isUnbounded,
  type DurationRange,
} from "../../domain/duration.js";

/** Phase SF PR2 (spec I-13): the TIME token's label for a range, shared by
 *  Library's and Today's token rows — one helper so the two screens can
 *  never drift the way the bucket-era labels once did. Whether a token
 *  RENDERS at all is the caller's decision (Library: not unbounded; Today:
 *  differs from the key's default), so an unbounded range has a label here
 *  too — Today shows it when the default is narrower (`ANY LENGTH`, a real
 *  deviation with its own ✕). The prime is the house minutes mark. */
export function formatRangeLabel(range: DurationRange): string {
  if (isUnbounded(range)) return "ANY LENGTH";
  if (range.max >= DURATION_RANGE_MAX) return `${range.min}′+`;
  if (range.min <= 0) return `≤${range.max}′`;
  if (range.min === range.max) return `${range.min}′`;
  return `${range.min}–${range.max}′`;
}

/** The two figures printed above the thumbs: the lower reads ANY at 0, the
 *  upper reads 120′+ at the top; anything else is the minute count. */
export function formatThumbValue(value: number, which: "min" | "max"): string {
  if (which === "min" && value <= 0) return "ANY";
  if (which === "max" && value >= DURATION_RANGE_MAX) {
    return `${DURATION_RANGE_MAX}′+`;
  }
  return `${value}′`;
}

/** `aria-valuetext` per the APG slider pattern ("if the value of
 *  aria-valuenow is not user-friendly"): the sentinels get words. */
export function thumbValueText(value: number, which: "min" | "max"): string {
  if (which === "min" && value <= 0) return "any";
  if (which === "max" && value >= DURATION_RANGE_MAX) return "no limit";
  return `${value} minutes`;
}
