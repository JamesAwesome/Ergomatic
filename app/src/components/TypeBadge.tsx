import { isWorkoutType, type WorkoutType } from "../../domain/types.js";

// CSS custom property per workout type — never a raw hex (tokens.css).
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

/** The fill for a type string this build does not know — a row written by a
 *  newer client, or the historical drift this column has always tolerated
 *  on read (`session_logs.workout_type` is plain `text`, never the pgEnum).
 *
 *  `--ink-3`, and deliberately NOT a fifth type colour: an unrecognised
 *  value is metadata, not a new intensity — the same reasoning
 *  `.workout-row-custom` already records for the custom tag. Contrast
 *  computed, not eyeballed (recurring failure 6): `--on-color` #fffdf7 on
 *  `--ink-3` #57544c = **7.43:1**, comfortably over the 4.5:1 AA floor.
 *
 *  Before this, an unknown string produced **`var(undefined)`** — the
 *  lookup below is keyed by the four literals, so indexing it with any
 *  other string yields `undefined` and the template interpolates that
 *  word. Either way it is not a declared custom property, so the whole
 *  `background` declaration was dropped at parse time and the label
 *  rendered at 1.110:1 on `--page` (1.000:1 on `--surface`): invisible
 *  text, not a fallback. (An earlier version of this comment said
 *  `var(--type-JustRow)`. The conclusion was right and the mechanism was
 *  wrong, which reads as evidence — PM gate, 2026-09-01.) */
const UNKNOWN_TYPE_VAR = "--ink-3";

/**
 * `null` renders NOTHING — an absence, never an empty badge (Phase JR PR 1,
 * exit criterion 2). A free row (Just Row) stores `workout_type: null`
 * because no intensity was prescribed, and there is no honest badge for
 * that. A badge with no label would still occupy its own `padding: 3px 7px`
 * plus the row's flex gap, which is exactly the "empty badge" the criterion
 * forbids — and which a contrast assertion would pass, since there are no
 * glyphs to measure.
 *
 * Returning `null` here rather than guarding at each call site keeps every
 * consumer correct by construction; there are five.
 */
export default function TypeBadge({ type }: { type: string | null }) {
  if (type === null) return null;
  return (
    <span
      className="type-badge"
      style={{
        background: `var(${
          isWorkoutType(type) ? TYPE_COLOR_VAR[type] : UNKNOWN_TYPE_VAR
        })`,
      }}
    >
      {type}
    </span>
  );
}
