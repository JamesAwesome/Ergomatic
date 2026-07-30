import type { ChangeEvent } from "react";

// Mirrors the domain's own storable bound (domain/validate.ts's
// `int(s.spm, 10, 60)`) — NOT the 18-32 authoring guidance used for starter
// content. This control clamps user *input* to what a save could ever
// accept; it doesn't enforce the narrower coaching range.
const MIN_SPM = 10;
const MAX_SPM = 60;

// James's rule: a new row starts empty, and the first press of EITHER
// button lands on exactly 20 — not 21, not 19. Only presses after that
// move by 1 off the current value.
const WAKE_SPM = 20;

function clamp(n: number): number {
  return Math.min(MAX_SPM, Math.max(MIN_SPM, n));
}

// `undefined` here (not just NaN) stands for "empty or unparseable" — both
// wake at WAKE_SPM rather than stepping off some coerced number.
function parseSpm(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export default function SpmInput({
  value,
  onChange,
  rowLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  rowLabel: string;
}) {
  function step(delta: number) {
    const current = parseSpm(value);
    const next = current === undefined ? WAKE_SPM : clamp(current + delta);
    onChange(String(next));
  }

  function handleValueChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="spm-input">
      <button
        type="button"
        className="spm-input-step"
        aria-label={`${rowLabel} stroke rate decrease`}
        onClick={() => step(-1)}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="spm-input-value"
        aria-label={`${rowLabel} stroke rate`}
        value={value}
        onChange={handleValueChange}
      />
      <button
        type="button"
        className="spm-input-step"
        aria-label={`${rowLabel} stroke rate increase`}
        onClick={() => step(1)}
      >
        +
      </button>
    </div>
  );
}
