import { useRef, type KeyboardEvent } from "react";

/** Phase BL PR C — the questionnaire's single-select control (canvas
 *  Question1/Question2). Roving tabindex (WAI-ARIA radiogroup pattern),
 *  copied from `builder/PaceRefInput.tsx`'s chips — the house radiogroup
 *  (recurring-failure #8: reuse the existing pattern AND its keyboard
 *  tests rather than hand-rolling a fourth one): the group is one tab
 *  stop, arrow keys move focus and selection together, wrapping at both
 *  ends. With nothing selected yet the FIRST option carries the tab stop
 *  so the group stays keyboard-reachable (PaceRefInput never has this
 *  state — its callers always arrive with a base checked — so that half
 *  is this control's own, covered by its own test).
 *
 *  Generic over the option value union so each questionnaire screen's
 *  answer state stays typed to `domain/estimateBaseline.ts`'s own keys —
 *  the answers themselves are TRANSIENT component state in the caller
 *  (the minimal-PII ruling: never persisted, never sent).
 *
 *  `onConfirm` (James's auto-advance feedback, 2026-08-23) fires on a
 *  deliberate ACTIVATION — tap/click, or Enter/Space on the focused
 *  option (both reach the button's native click) — after `onChange`.
 *  Arrow keys move selection and NEVER confirm: wiring advance into
 *  `onChange` instead would yank a keyboard user forward on every
 *  arrow press, which is exactly the roving-tabindex contract this
 *  control exists to keep. */
export default function OptionGroup<V extends string>({
  options,
  value,
  onChange,
  onConfirm,
  ariaLabel,
}: {
  options: readonly { value: V; label: string }[];
  value: V | null;
  onChange: (next: V) => void;
  onConfirm?: (next: V) => void;
  ariaLabel: string;
}) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectByIndex(index: number) {
    const wrapped = (index + options.length) % options.length;
    optionRefs.current[wrapped]?.focus();
    onChange(options[wrapped]!.value);
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

  return (
    <div className="onb-options" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const checked = value === option.value;
        // The single tab stop: the checked option, or — uniquely to this
        // control's nothing-selected-yet state — the first one.
        const tabStop = checked || (value === null && index === 0);
        return (
          <button
            key={option.value}
            ref={(el) => {
              optionRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            className="onb-option"
            tabIndex={tabStop ? 0 : -1}
            onClick={() => {
              // Click is the ACTIVATION path: a pointer tap, or Enter/
              // Space on the focused option (the button's native click).
              // Arrow moves go through handleKeyDown and never land here.
              onChange(option.value);
              onConfirm?.(option.value);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
