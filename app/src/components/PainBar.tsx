import type { WorkoutType } from "../../domain/types.js";

// CSS custom property per workout type — never a raw hex (tokens.css).
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

// Pain is 1–5 (docs/design/DEVIATIONS.md), not the handoff's 1–10 — this bar
// always renders exactly five segments regardless of the incoming pain value.
const SEGMENT_COUNT = 5;

export default function PainBar({
  pain,
  type,
}: {
  pain: number;
  type: WorkoutType;
}) {
  return (
    <span className="pain-bar" role="img" aria-label={`pain ${pain} of 5`}>
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
        const filled = i < pain;
        return (
          <span
            key={i}
            className="pain-bar-segment"
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
