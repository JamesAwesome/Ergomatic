import type { WorkoutType } from "../../domain/types.js";

// CSS custom property per workout type — never a raw hex (tokens.css).
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

export default function TypeBadge({ type }: { type: WorkoutType }) {
  return (
    <span
      className="type-badge"
      style={{ background: `var(${TYPE_COLOR_VAR[type]})` }}
    >
      {type}
    </span>
  );
}
