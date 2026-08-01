import ClockInput from "./ClockInput";

// The shared "− value +" control (docs/design/builder-redesign/README.md,
// the "Stepper pattern" paragraph): one joined container, 44×44 `−`/`+`
// cells, and a value cell between them with side borders. Used by PACE
// offset (via PaceRefInput's own bespoke offset stepper, restyled to match
// this visual — see index.css), SPM and REST (StepEditor.tsx, both built
// directly on this component) and REPEAT (Task 5).
//
// This component owns no state and no domain logic of its own — every
// caller supplies its own current/next value and clamping rules (SPM wakes
// at 20 and floors at 10; REST snaps to 30s steps; PACE offset clamps
// ±60; REPEAT clamps 1..12) because each one's rules differ. Keeping the
// control itself dumb is what lets four very different steppers share one
// visual and one accessible-name convention.
export default function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  onValueChange,
  valueInput,
  valueWidth,
  valueClassName,
  placeholder,
  invalid,
  errorId,
  registerRef,
}: {
  // Supplies the accessible names for the two buttons: `${label} down` /
  // `${label} up`, and for the control's own `role="group"` (below).
  // Callers pass something field-specific ("Row 1 stroke rate", "Row 1
  // rest") so two steppers on the same row never collide.
  label: string;
  // Already formatted for display — "20", "FREE", "1:30", "NONE", "6k −2",
  // "×4". This component does no number formatting of its own.
  onDecrement: () => void;
  onIncrement: () => void;
  value: string;
  // Optional (Task 5): when supplied, the value cell becomes a typable input
  // instead of a plain `<span>` — the affordance that lets SPM return to
  // FREE by clearing the field (steppers alone can only ever floor at 10,
  // never clear) and lets REST be reached directly instead of thirty 30s
  // taps from empty. Omitted entirely by REPEAT and PACE (via
  // PaceRefInput), which keep the plain span — this control does no
  // clamping or formatting of what it's given either way, so every digit
  // this emits passes straight through to the caller's own rules.
  onValueChange?: (next: string) => void;
  // "text" (default): a bare numeric-pad `<input>`, digits only, capped at
  // two characters — used by SPM. "clock": renders `ClockInput` instead —
  // used by REST, whose value is a clock string, not a bare integer.
  // Ignored when `onValueChange` is omitted.
  valueInput?: "text" | "clock";
  // "flex" (default): the value cell fills the row, used by PACE/SPM/REST
  // where the stepper is the only thing on its line. A number: a fixed
  // pixel width, used by REPEAT's own value cell (Task 5), which sits
  // beside other content rather than filling a full-width row.
  valueWidth?: "flex" | number;
  // Extra class appended to the value cell — used by StepEditor.tsx to mark
  // the empty/zero "FREE"/"NONE" reading in the muted ink-4 colour, since
  // that's a display-state distinction this generic control has no opinion
  // of its own about.
  valueClassName?: string;
  // Shown only while the value cell is empty (e.g. SPM's "FREE", REST's
  // "NONE") — restores the pre-Task-5 literal reading now that an empty
  // cell is a typable input rather than a `<span>` rendering that word.
  // Never the accessible name: `aria-label` above already supplies that,
  // and a placeholder drops out of the accessibility tree once a name is
  // present. Ignored entirely when `onValueChange` is omitted (REPEAT/PACE
  // keep the plain span, which has no notion of a placeholder). Callers
  // rely on index.css's `::placeholder` rule for AA-contrast styling
  // (ink-4 on the shared --surface background), not on anything here.
  placeholder?: string;
  // Optional error wiring (Phase 5E Task 5, fix-wave item 4): SPM/REST used
  // to anchor their save-time error to a role-less wrapping <div
  // aria-invalid> in StepEditor.tsx — a failed Save's `.focus()` landed on a
  // target nothing announced. Delegating to this control's own `role="group"`
  // instead mirrors how PACE already anchors to PaceRefInput's real
  // `role="radiogroup"`. Both undefined/false when the caller has no error.
  invalid?: boolean;
  errorId?: string;
  // Exposes the group element itself (not either button) for a caller's
  // fieldRefs map — same idiom as DurationInput/PaceRefInput's own
  // registerRef props, and what makes the group focusable at all
  // (`tabIndex={-1}` below; a bare `role="group"` div isn't natively
  // focusable).
  registerRef?: (el: HTMLDivElement | null) => void;
}) {
  const fixedWidth = typeof valueWidth === "number" ? valueWidth : undefined;
  const valueStyle =
    fixedWidth === undefined
      ? undefined
      : { flex: `0 0 ${fixedWidth}px`, width: `${fixedWidth}px` };
  const valueClass = valueClassName
    ? `stepper-value ${valueClassName}`
    : "stepper-value";

  return (
    <div
      className="stepper"
      role="group"
      aria-label={label}
      aria-invalid={Boolean(invalid)}
      aria-describedby={errorId}
      tabIndex={-1}
      ref={registerRef}
    >
      <button
        type="button"
        className="stepper-btn"
        aria-label={`${label} down`}
        onClick={onDecrement}
      >
        −
      </button>
      {onValueChange === undefined ? (
        <span className={valueClass} style={valueStyle}>
          {value}
        </span>
      ) : valueInput === "clock" ? (
        <ClockInput
          value={value}
          onChange={onValueChange}
          ariaLabel={`${label} value`}
          className={valueClass}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          inputMode="numeric"
          className={`${valueClass} stepper-value-input`}
          style={valueStyle}
          aria-label={`${label} value`}
          placeholder={placeholder}
          value={value}
          onChange={(event) =>
            onValueChange(event.target.value.replace(/\D/g, "").slice(0, 2))
          }
        />
      )}
      <button
        type="button"
        className="stepper-btn"
        aria-label={`${label} up`}
        onClick={onIncrement}
      >
        +
      </button>
    </div>
  );
}
