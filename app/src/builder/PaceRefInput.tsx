import { useRef, type KeyboardEvent } from "react";
import type { Effort, PaceBase } from "../../domain/types.js";

// One radiogroup, four chips: the two split bases the domain's PaceRef
// ever accepts, plus the two efforts (Phase 5G) — "8k" (the defect that
// started this phase) is no longer representable in the UI at all, and
// MAX/MIN are exactly as structurally valid as 2K/6K, never a free-text
// escape hatch. Order is the control's own display order (2K | 6K | MAX |
// MIN); `selectByIndex`'s wrap-around modulo and the arrow-key handler
// below both key off `CHIPS.length`, so this list is the only place a
// future fifth chip would need to be added.
const CHIPS: readonly { value: PaceBase | Effort; kind: "base" | "effort" }[] =
  [
    { value: "2k", kind: "base" },
    { value: "6k", kind: "base" },
    { value: "max", kind: "effort" },
    { value: "min", kind: "effort" },
  ];

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
  effort,
  onChange,
  rowLabel,
  invalid,
  errorId,
}: {
  base: PaceBase;
  off: number;
  // null = split mode (a base chip is checked, the offset stepper shows).
  // Set to an Effort when the user has tapped MAX/MIN — mirrors
  // BuilderRow.refEffort (builderState.ts) exactly, so a caller can pass a
  // row's three pace fields straight through without translating them.
  effort: Effort | null;
  // `base`/`off` are always both reported back, even when `effort` is set —
  // the caller (StepEditor via Builder) is what holds them steady across a
  // chip round trip (Task 3's contract: refBase/refOff on the row are left
  // as-is, not cleared, when an effort is selected). This control never
  // synthesizes or drops either on its own.
  onChange: (next: {
    base: PaceBase;
    off: number;
    effort: Effort | null;
  }) => void;
  rowLabel: string;
  // Optional error wiring from StepRowEditor's `fieldError("ref")` — the
  // radiogroup is the anchor (there's no single "ref" input any more to
  // carry aria-invalid/aria-describedby the way the old free-text field
  // did). Both are undefined/false when the row has no ref error.
  invalid?: boolean;
  errorId?: string;
}) {
  // Roving tabindex (WAI-ARIA radiogroup pattern), same pattern the deleted
  // PainPicker.tsx used: the group is one tab stop and arrow keys move
  // focus (and selection) within it.
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function reportChip(chip: (typeof CHIPS)[number]) {
    onChange(
      chip.kind === "base"
        ? { base: chip.value as PaceBase, off, effort: null }
        : { base, off, effort: chip.value as Effort },
    );
  }

  function selectByIndex(index: number) {
    const wrapped = (index + CHIPS.length) % CHIPS.length;
    chipRefs.current[wrapped]?.focus();
    reportChip(CHIPS[wrapped]!);
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
    onChange({ base, off: next, effort: null });
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
        {CHIPS.map((chip, index) => {
          const checked =
            chip.kind === "base"
              ? effort === null && base === chip.value
              : effort === chip.value;
          return (
            <button
              key={chip.value}
              ref={(el) => {
                chipRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${rowLabel} pace ${chip.value.toUpperCase()}`}
              className="pace-ref-chip"
              tabIndex={checked ? 0 : -1}
              onClick={() => reportChip(chip)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {chip.value.toUpperCase()}
            </button>
          );
        })}
      </div>
      {/* The offset stepper only makes sense in split mode — MAX/MIN have no
          offset of their own (toSteps skips the ±60 bound check entirely for
          an effort ref). Hidden, not removed-and-rebuilt: `off` keeps living
          on the row (Task 3), so a chip round trip back to a base restores
          exactly what was showing before, with no state to lose here. */}
      {effort === null && (
        <div className="pace-ref-offset">
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
      )}
    </div>
  );
}
