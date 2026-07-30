import { useRef, type ChangeEvent, type KeyboardEvent } from "react";

// The only two units `BuilderRow.durUnit` (builderState.ts) ever carries —
// this control can only ever produce one of these, mirroring how
// PaceRefInput's BASES constant can only ever produce "2k"/"6k".
const UNITS: readonly ("min" | "m")[] = ["min", "m"];

const UNIT_LABEL: Record<"min" | "m", string> = {
  min: "minutes",
  m: "meters",
};

const UNIT_TEXT: Record<"min" | "m", string> = {
  min: "MIN",
  m: "M",
};

export default function DurationInput({
  value,
  unit,
  onChange,
  rowLabel,
}: {
  value: string;
  unit: "min" | "m";
  onChange: (next: { value: string; unit: "min" | "m" }) => void;
  rowLabel: string;
}) {
  // Roving tabindex (WAI-ARIA radiogroup pattern), same as PainPicker.tsx
  // and PaceRefInput.tsx: the group is one tab stop and arrow keys move
  // focus (and selection) within it.
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectByIndex(index: number) {
    const wrapped = (index + UNITS.length) % UNITS.length;
    chipRefs.current[wrapped]?.focus();
    onChange({ value, unit: UNITS[wrapped]! });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        selectByIndex(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        selectByIndex(index - 1);
        break;
      default:
        break;
    }
  }

  function handleValueChange(event: ChangeEvent<HTMLInputElement>) {
    onChange({ value: event.target.value, unit });
  }

  return (
    <div className="duration-input">
      <input
        type="text"
        inputMode="decimal"
        className="duration-input-value"
        aria-label={`${rowLabel} duration`}
        value={value}
        onChange={handleValueChange}
      />
      <div
        className="duration-input-units"
        role="radiogroup"
        aria-label={`${rowLabel} duration unit`}
      >
        {UNITS.map((u, index) => {
          const checked = unit === u;
          return (
            <button
              key={u}
              ref={(el) => {
                chipRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${rowLabel} duration unit ${UNIT_LABEL[u]}`}
              className="duration-input-chip"
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange({ value, unit: u })}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {UNIT_TEXT[u]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
