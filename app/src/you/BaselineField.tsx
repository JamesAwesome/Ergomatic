import { useRef, useState, type ReactNode } from "react";
import { fmtSplit } from "../../domain/format.js";
import SplitInput from "./SplitInput";
import { MAX_SPLIT, MIN_SPLIT, STEP, clampSplit } from "./baselineDraft";

/** THE baseline entry control — `[−][typable split][+]`, one component on
 *  all three baseline surfaces (the You editor, door 2's
 *  `/onboarding/know`, door 1's adjust step).
 *
 *  Why it exists (James's report, 2026-08-24): entry affordances were split
 *  across surfaces — the You editor and door 2 could only be TYPED into,
 *  door 1's adjust step could only be NUDGED. Whichever a rower learned
 *  first was the wrong one somewhere else. Both work everywhere now.
 *
 *  The visual is the house's shipped `Stepper` (builder/Stepper.tsx): one
 *  joined container, 44×44 `−`/`+` cells, a value cell between them with
 *  side borders. Like that control it is NOT a roving-tabindex widget —
 *  three independently tabbable controls inside a labelled `role="group"`,
 *  exactly as the builder's steppers already are.
 *
 *  Three behaviours worth knowing, each a decision rather than a detail:
 *
 *  - **Settle first, then nudge.** A stepper tap while a digit buffer is
 *    live BLURS the field first (the buffer drops, the resting display
 *    shows the settled draft) and only then applies the ±STEP. The
 *    steppers never read the buffer, so "type 158, tap +" is 1:58.5 and
 *    never some half-parsed reading of the digits. The blur is explicit
 *    (`inputRef.current?.blur()`) rather than left to the browser: WebKit
 *    does not focus a `<button>` on tap, so on the primary surface — the
 *    iOS app — nothing would have blurred the input for us.
 *
 *  - **The first tap on an EMPTY field materialises the seed exactly**, no
 *    offset applied, from either button. The placeholder was already
 *    showing that number as a suggestion; a rower reaching for `−` is
 *    saying "start me here", not "start me half a second faster". The
 *    field then turns from dim placeholder to accent value, and subsequent
 *    taps nudge normally.
 *
 *  - **A dead-end button is `aria-disabled`, not `disabled`.** At
 *    MIN_SPLIT/MAX_SPLIT the button keeps its place in the tab order and
 *    keeps focus if it has it (a real `disabled` would drop focus to the
 *    document mid-interaction); it renders in a dimmed ink and does
 *    nothing. Typed out-of-range entry keeps the draft's own
 *    clamp-on-commit behaviour instead — that is `setDraft`'s job.
 *
 *  Stepper taps move no focus and change no text the rower is reading, so
 *  the change would otherwise be SILENT to a screen reader. The
 *  visually-hidden `aria-live="polite"` region below announces the settled
 *  value after each one — and an announcement is tied to the value it
 *  describes, so it clears the instant the field moves for any other
 *  reason. See `announcement` below for the two bugs that buys. */
export default function BaselineField({
  label,
  seconds,
  seed,
  onType,
  onNudge,
  className,
  children,
}: {
  label: "2k" | "6k";
  /** `null` = unset: the field renders empty with `seed` as its dim
   *  placeholder, and the first stepper tap materialises `seed`. */
  seconds: number | null;
  seed: number;
  onType: (seconds: number) => void;
  onNudge: (direction: -1 | 1) => void;
  /** Extra class for the value input — each surface sizes its own cell
   *  (`.baseline-input` 24px on You, `.onb-field-input` 28px on door 2). */
  className?: string;
  /** Rendered inside the value cell beside the input — door 2's `/500m`
   *  unit, which belongs to the field rather than to the row. */
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // An announcement is bound to the value it describes, and rendered only
  // while the field still holds that value (review fix, 2026-08-24). This
  // is one line of derivation standing in for two bugs, both invisible to
  // a sighted user:
  //
  //  1. STALE TEXT. This is component state and nothing remounts the
  //     field, so a Discard upstream emptied the field while the region
  //     went on saying "2k 2:25.0" — a spoken claim about a value that no
  //     longer existed.
  //  2. SILENCE ON A REAL CHANGE, which is the worse half. A polite region
  //     fires on a DOM mutation, not on a render. Materialise, Discard,
  //     materialise again produced the identical string both times, so
  //     React bailed on the state write, the text node never changed, and
  //     the second — entirely real — change was announced to nobody.
  //     Clearing on the value's departure is what makes the next
  //     announcement a genuine mutation.
  //
  // Derived at render rather than synced by an effect: an effect would
  // announce a frame late and would need its own teardown to avoid
  // exactly the staleness above.
  const [announced, setAnnounced] = useState<{
    text: string;
    forValue: number | null;
  }>({ text: "", forValue: null });
  const announcement = announced.forValue === seconds ? announced.text : "";

  // Both bounds are inclusive in `clampSplit`, so "at the bound" is where
  // a further tap in that direction can no longer change anything. An
  // UNSET side has no bound to be at: its first tap materialises the seed,
  // which is what both buttons must stay live for.
  const atMin = seconds !== null && seconds <= MIN_SPLIT;
  const atMax = seconds !== null && seconds >= MAX_SPLIT;

  const step = (direction: -1 | 1) => {
    // Settle any live digit buffer BEFORE anything else — see the header.
    inputRef.current?.blur();
    if (seconds === null) {
      onType(seed);
      setAnnounced({ text: `${label} ${fmtSplit(seed)}`, forValue: seed });
      return;
    }
    // aria-disabled does not stop a click the way `disabled` does; this is
    // what actually makes a dead-end button dead.
    if (direction === -1 ? atMin : atMax) return;
    onNudge(direction);
    // The same `clampSplit` the draft applies, not a second copy of the
    // bounds: an announcement derived from a drifting clamp would tell a
    // screen-reader user a number the field does not hold.
    const next = clampSplit(seconds + direction * STEP);
    setAnnounced({ text: `${label} ${fmtSplit(next)}`, forValue: next });
  };

  return (
    <div
      className="baseline-field"
      role="group"
      aria-label={`${label} baseline split`}
    >
      <button
        type="button"
        className="baseline-field-btn"
        aria-label={`${label} faster`}
        aria-disabled={atMin}
        onClick={() => step(-1)}
      >
        −
      </button>
      <span className="baseline-field-value">
        <SplitInput
          label={label}
          seconds={seconds}
          seed={seed}
          onType={onType}
          className={className}
          registerRef={(el) => {
            inputRef.current = el;
          }}
        />
        {children}
      </span>
      <button
        type="button"
        className="baseline-field-btn"
        aria-label={`${label} slower`}
        aria-disabled={atMax}
        onClick={() => step(1)}
      >
        +
      </button>
      <span className="visually-hidden" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
