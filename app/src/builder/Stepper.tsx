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
  valueWidth,
  valueClassName,
}: {
  // Supplies the accessible names for the two buttons: `${label} down` /
  // `${label} up`. Callers pass something field-specific ("Row 1 stroke
  // rate", "Row 1 rest") so two steppers on the same row never collide.
  label: string;
  // Already formatted for display — "20", "FREE", "1:30", "NONE", "6k −2",
  // "×4". This component does no number formatting of its own.
  onDecrement: () => void;
  onIncrement: () => void;
  value: string;
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
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        aria-label={`${label} down`}
        onClick={onDecrement}
      >
        −
      </button>
      <span className={valueClass} style={valueStyle}>
        {value}
      </span>
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
