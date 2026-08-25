import { useState, type ChangeEvent } from "react";
import { fmtSplit } from "../../domain/format.js";

// Option T (James, 2026-08-23, canvas OptionTypeIt): the builder's shipped
// ClockInput digit entry, adapted for baseline splits — entering 1:58 from
// the 2:25 seed used to take 27 stepper taps per field. Splits live in the
// 60..240s band (1:00..4:00 per 500m), so three digits — m then ss — cover
// every legal entry: "152" reads as 1:52. A 4th digit could only start a
// two-digit minute group ("1234" -> 12:34), a value that reads as wildly
// wrong before the rower even reaches Save; merely-out-of-range three-digit
// entries ("500" -> 5:00) are settled by the draft's own MIN/MAX_SPLIT
// clamp (baselineDraft.ts) and re-display normalised on blur.
const MAX_DIGITS = 3;

/** Digits, filled right to left into ss then m — the same order the resting
 *  m:ss.t display renders in (ClockInput's `digitsToClock`, minus the hours
 *  branch no split can reach). `""` stays empty: an in-progress field shows
 *  its placeholder, never a fabricated 0:00. */
// Pure helper exported for direct testing, same pattern as ClockInput.tsx.
// eslint-disable-next-line react-refresh/only-export-components
export function digitsToSplitDisplay(digits: string): string {
  if (digits === "") return "";
  const padded = digits.padStart(3, "0");
  return `${Number(padded.slice(0, -2))}:${padded.slice(-2)}`;
}

/** The typed digits as whole seconds ("152" -> 112). `null` for "" — an
 *  empty buffer is "nothing typed yet", not a value, so the caller's draft
 *  is never touched by a mere focus or a backspaced-to-empty field. */
// eslint-disable-next-line react-refresh/only-export-components
export function digitsToSplitSeconds(digits: string): number | null {
  if (digits === "") return null;
  const padded = digits.padStart(3, "0");
  return Number(padded.slice(0, -2)) * 60 + Number(padded.slice(-2));
}

/** Typed baseline-split entry — the value cell of the unified
 *  `BaselineField` control on all three baseline surfaces (the You editor,
 *  door 2's `/onboarding/know`, door 1's adjust step). The field owns the
 *  separator because a numeric keypad has no colon — ClockInput's
 *  reasoning, verbatim.
 *
 *  The tenths decision (this component's contract): typed entry is WHOLE
 *  seconds. At rest the field displays the draft through `fmtSplit`
 *  (m:ss.t), so a stored tenth — a tested write, a 0.5-step nudge —
 *  renders intact; on focus the field clears to a digit buffer (the prior
 *  value stays visible as the placeholder) and each keystroke commits the
 *  parsed whole-second value to the caller's draft; on blur the buffer
 *  drops and the resting display returns, so a typed 152 settles as
 *  "1:52.0". Leaving without typing commits nothing.
 *
 *  UNSET (`seconds === null`, the honest-empty round 2026-08-24): the
 *  field renders EMPTY with `seed` as its placeholder. That is the whole
 *  point of the round — a baseline the rower has never entered used to be
 *  unrenderable, because this prop was non-nullable, so the seed went in
 *  as the VALUE and wore a saved number's accent ink. Empty-and-dim versus
 *  filled-and-accent is now a structural difference, not a shade. It also
 *  satisfies `baselineDraft.ts`'s own never-a-bare-dash rule without
 *  fabricating anything: the rower still reads a sensible number, but the
 *  field does not claim it. */
export default function SplitInput({
  label,
  seconds,
  seed,
  onType,
  className,
  registerRef,
}: {
  label: "2k" | "6k";
  /** `null` = this side is unset; the field renders empty. */
  seconds: number | null;
  /** The suggestion shown as the dim placeholder while `seconds` is null.
   *  Never committed by this component — only `BaselineField`'s first
   *  stepper tap, or the rower's own typing, ever turns it into a value. */
  seed: number;
  /** Called with the parsed whole-second value on every complete keystroke.
   *  The caller owns clamping (baselineDraft's `setDraft`) and provenance —
   *  this field reports what was typed, nothing more. */
  onType: (seconds: number) => void;
  className?: string;
  /** Exposes the input element itself — the same idiom Stepper/
   *  DurationInput use. `BaselineField` needs it to SETTLE the field (blur
   *  it, dropping any live digit buffer) before a stepper tap applies its
   *  nudge, because WebKit does not focus a `<button>` on tap and so
   *  cannot be relied on to blur the input for us. */
  registerRef?: (el: HTMLInputElement | null) => void;
}) {
  // null = resting (display the draft's own m:ss.t); "".."999" = the
  // in-progress digit buffer while the field is focused.
  const [buffer, setBuffer] = useState<string | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    // Leading zeros are stripped BEFORE the cap: the controlled redisplay
    // feeds its own padding back through this handler ("1" renders as
    // "0:01", so the next keystroke arrives as "0:015"), and a left-anchored
    // 3-digit cap would keep the zeros and drop the rower's real digits
    // ("001" -> 1s, forever). ClockInput never hits this only because its
    // 5-digit cap happens to absorb the padding; a split's zeros carry no
    // meaning regardless (nothing below 1:00 is storable).
    const digits = event.target.value
      .replace(/\D/g, "")
      .replace(/^0+/, "")
      .slice(0, MAX_DIGITS);
    setBuffer(digits);
    const parsed = digitsToSplitSeconds(digits);
    if (parsed !== null) onType(parsed);
  }

  // Two distinct reasons for a placeholder, one appearance: the value the
  // field held before this tap (so clearing-on-focus never reads as data
  // loss), and the SEED on an unset side (so the rower sees a suggestion
  // without the field claiming it). Both are ink-4 on --surface — 5.29:1,
  // computed — via the shared `::placeholder` rule. A resting field that
  // holds a real value shows NO placeholder: dim means "not a value at
  // all", and a saved number must never wear it.
  const resting = buffer === null;
  return (
    <input
      type="text"
      inputMode="numeric"
      className={className ? `split-input ${className}` : "split-input"}
      aria-label={`${label} split`}
      placeholder={
        resting && seconds !== null ? undefined : fmtSplit(seconds ?? seed)
      }
      value={
        resting
          ? seconds === null
            ? ""
            : fmtSplit(seconds)
          : digitsToSplitDisplay(buffer)
      }
      onFocus={() => setBuffer("")}
      onChange={handleChange}
      onBlur={() => setBuffer(null)}
      ref={registerRef}
    />
  );
}
