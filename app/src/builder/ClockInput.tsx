import type { ChangeEvent } from "react";
import { fmtDuration, parseClock } from "../../domain/duration.js";

// Five digits reaches 3:00:00, the domain's ceiling for a single step: the
// h:mm:ss branch below takes everything left of the last 4 digits as hours,
// so a 6th digit would produce a two-digit hour group (e.g. "300000" ->
// "30:00:00"), blowing past the ceiling instead of sitting at it.
const MAX_DIGITS = 5;

/** Digits, filled right to left into ss, then mm, then hh — the same order the
 *  format renders in. `""` stays empty (a legal state for REST), and so does
 *  an all-zero digit string: backspacing down to nothing should clear the
 *  field rather than leave it stuck on "0:00". */
// Pure helper exported for direct testing, same pattern as TabBar.tsx/auth.tsx.
// eslint-disable-next-line react-refresh/only-export-components
export function digitsToClock(digits: string): string {
  if (digits === "" || Number(digits) === 0) return "";
  const padded = digits.padStart(3, "0");
  const seconds = padded.slice(-2);
  // Never falsy: padStart(3) guarantees padded.length >= 3, so this slice is
  // always at least 1 character for every digit count MAX_DIGITS admits.
  const minutes = padded.slice(-4, -2);
  const hours = padded.slice(0, -4);
  return hours === ""
    ? `${Number(minutes)}:${seconds}`
    : `${Number(hours)}:${minutes.padStart(2, "0")}:${seconds}`;
}

/** The field owns the separator because the user cannot type one: a numeric
 *  keypad has no colon, which is exactly how a real user failed to enter 30
 *  seconds. Stripping to digits and reformatting also gives backspace its
 *  shift-right behaviour for free. */
export default function ClockInput({
  value,
  onChange,
  ariaLabel,
  invalid,
  errorId,
  className,
  placeholder,
  registerRef,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  invalid?: boolean;
  errorId?: string;
  className?: string;
  // Shown only while the field is empty, e.g. REST's "NONE" — never the
  // accessible name (`aria-label` already supplies that, and a placeholder
  // is stripped from the accessibility tree the moment a name is present).
  // The caller is responsible for its own contrast; see index.css's
  // `::placeholder` rule for the ink-4-on-surface pairing this app uses.
  placeholder?: string;
  registerRef?: (el: HTMLInputElement | null) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, MAX_DIGITS);
    onChange(digitsToClock(digits));
  }

  // Normalising beats rejecting: a keystroke that does nothing reads as a
  // broken field on a phone. `1:70` is 130 seconds, so it settles as `2:10`.
  function handleBlur() {
    if (value === "") return;
    const minutes = parseClock(value);
    if (minutes === null) return;
    onChange(fmtDuration(minutes));
  }

  return (
    <input
      ref={registerRef}
      type="text"
      inputMode="numeric"
      className={className ? `clock-input ${className}` : "clock-input"}
      aria-label={ariaLabel}
      aria-invalid={Boolean(invalid)}
      aria-describedby={errorId}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
