import type { WorkoutType } from "../../domain/types.js";

// CSS custom property per workout type — never a raw hex (tokens.css).
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

// Effort is 1–5 (docs/design/DEVIATIONS.md), not the handoff's 1–10 — this bar
// always renders exactly five segments regardless of the incoming effort value.
const SEGMENT_COUNT = 5;

export default function EffortBar({
  effort,
  type,
}: {
  effort: number;
  type: WorkoutType;
}) {
  return (
    <span
      className="effort-bar"
      role="img"
      aria-label={`effort ${effort} of 5`}
    >
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
        const filled = i < effort;
        return (
          <span
            key={i}
            className="effort-bar-segment"
            data-filled={filled}
            style={
              filled
                ? { background: `var(${TYPE_COLOR_VAR[type]})` }
                : undefined
            }
          />
        );
      })}
    </span>
  );
}
