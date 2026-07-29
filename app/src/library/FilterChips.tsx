import {
  clearFilters,
  setRecency,
  toggleDuration,
  togglePain,
  toggleType,
  type DurationBucket,
  type Filters,
} from "./filters";
import type { WorkoutType } from "../../domain/types.js";

// Chip order per docs/design/README.md §Screens → "2. Library" (AN before O2
// — not alphabetical).
const TYPE_CHIPS: { type: WorkoutType; label: string }[] = [
  { type: "AN", label: "AN" },
  { type: "O2", label: "O2" },
  { type: "AT", label: "AT" },
  { type: "TR", label: "TR" },
];

const DURATION_CHIPS: { bucket: DurationBucket; label: string }[] = [
  { bucket: "<30", label: "<30′" },
  { bucket: "30-45", label: "30–45′" },
  { bucket: "45-60", label: "45–60′" },
  { bucket: "60+", label: "60′+" },
];

function isEmptyFilters(f: Filters): boolean {
  return (
    f.type === null &&
    f.durations.length === 0 &&
    !f.painMax3 &&
    f.recency === null
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function FilterChips({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  return (
    <div className="chip-wrap">
      <Chip
        label="ALL"
        active={isEmptyFilters(filters)}
        onClick={() => onChange(clearFilters())}
      />
      {TYPE_CHIPS.map(({ type, label }) => (
        <Chip
          key={type}
          label={label}
          active={filters.type === type}
          onClick={() => onChange(toggleType(filters, type))}
        />
      ))}
      {DURATION_CHIPS.map(({ bucket, label }) => (
        <Chip
          key={bucket}
          label={label}
          active={filters.durations.includes(bucket)}
          onClick={() => onChange(toggleDuration(filters, bucket))}
        />
      ))}
      <Chip
        label="PAIN ≤3"
        active={filters.painMax3}
        onClick={() => onChange(togglePain(filters))}
      />
      <Chip
        label="RECENT"
        active={filters.recency === "recent"}
        onClick={() => onChange(setRecency(filters, "recent"))}
      />
      <Chip
        label="NOT RECENT"
        active={filters.recency === "not-recent"}
        onClick={() => onChange(setRecency(filters, "not-recent"))}
      />
    </div>
  );
}
