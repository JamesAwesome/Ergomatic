import { useRef, type KeyboardEvent } from "react";
import type { PaceBase } from "../../domain/types.js";

// The only two bases the domain's PaceRef ever accepts (domain/types.ts) —
// this is the whole point of the control: it can only ever produce a base
// from this list, so "8k" (the defect that started this phase) is no longer
// representable in the UI at all.
const BASES: readonly PaceBase[] = ["2k", "6k"];

// Mirrors the domain's own ±60 bound (builderState.ts's `toSteps`, ultimately
// domain/validate.ts). Clamping here keeps the stepper from running away
// past what a save could ever accept — but see builderState.ts's comment on
// why the domain-side check stays too: this control clamps user *input*, it
// doesn't sanitize a value that arrived some other way (e.g. edit mode
// loading a stored step whose ref happens to be out of range).
const OFFSET_BOUND = 60;

// U+2212 MINUS SIGN, not the ASCII hyphen — matches domain/pace.ts's own
// rendering convention for a negative offset. No sign at all when off is 0,
// so "6k" (unmodified) doesn't read as "6k+0".
function formatRef(base: PaceBase, off: number): string {
  if (off === 0) return base;
  const sign = off < 0 ? "−" : "+";
  return `${base} ${sign}${Math.abs(off)}`;
}

export default function PaceRefInput({
  base,
  off,
  onChange,
  rowLabel,
  invalid,
  errorId,
}: {
  base: PaceBase;
  off: number;
  onChange: (next: { base: PaceBase; off: number }) => void;
  rowLabel: string;
  // Optional error wiring from StepRowEditor's `fieldError("ref")` — the
  // radiogroup is the anchor (there's no single "ref" input any more to
  // carry aria-invalid/aria-describedby the way the old free-text field
  // did). Both are undefined/false when the row has no ref error.
  invalid?: boolean;
  errorId?: string;
}) {
  // Roving tabindex (WAI-ARIA radiogroup pattern), same as PainPicker.tsx:
  // the group is one tab stop and arrow keys move focus (and selection)
  // within it.
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectByIndex(index: number) {
    const wrapped = (index + BASES.length) % BASES.length;
    chipRefs.current[wrapped]?.focus();
    onChange({ base: BASES[wrapped]!, off });
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

  function step(delta: number) {
    const next = Math.min(OFFSET_BOUND, Math.max(-OFFSET_BOUND, off + delta));
    onChange({ base, off: next });
  }

  return (
    <div className="pace-ref-input">
      <div
        className="pace-ref-bases"
        role="radiogroup"
        aria-label={`${rowLabel} pace base`}
        aria-invalid={Boolean(invalid)}
        aria-describedby={errorId}
      >
        {BASES.map((b, index) => {
          const checked = base === b;
          return (
            <button
              key={b}
              ref={(el) => {
                chipRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${rowLabel} pace ${b.toUpperCase()}`}
              className="pace-ref-chip"
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange({ base: b, off })}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {b.toUpperCase()}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="pace-ref-step"
        aria-label={`${rowLabel} pace faster`}
        onClick={() => step(-1)}
      >
        −
      </button>
      <span className="pace-ref-display">{formatRef(base, off)}</span>
      <button
        type="button"
        className="pace-ref-step"
        aria-label={`${rowLabel} pace slower`}
        onClick={() => step(1)}
      >
        +
      </button>
    </div>
  );
}
