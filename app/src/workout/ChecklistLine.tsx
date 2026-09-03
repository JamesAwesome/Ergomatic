/**
 * One line of the connected flow's no-spinner checklist (connected handoff
 * §2, `DEVIATIONS.md` #5): a leading marker — "✓" done, a filled `--ink`
 * square current, a `--rule-3` square pending — then a mono label. This is
 * the ONLY progress indicator anywhere in the connected flow.
 *
 * **Lifted out of `ConnectedInterstitial.tsx` rather than copied** (spec
 * 2026-09-03 Part 2, Task 4). The free row's own sending card wants the
 * identical three lines with one word changed, and this repo has hand-rolled
 * the same pattern three times before (recurring failure 8) — so the second
 * caller gets the first caller's component, and the `.connected-checklist*`
 * rules in `index.css` keep exactly one consumer to answer to.
 *
 * The marker is `aria-hidden`: it is a state glyph, and the state it names
 * is already carried by the surrounding copy. A screen reader hearing
 * "✓ FOUND" would be hearing punctuation.
 */
export default function ChecklistLine({
  label,
  state,
}: {
  label: string;
  state: "done" | "current" | "pending";
}) {
  return (
    <p className={`connected-checklist-line connected-checklist-${state}`}>
      <span className="connected-checklist-marker" aria-hidden="true">
        {state === "done" ? "✓" : ""}
      </span>
      {label}
    </p>
  );
}
