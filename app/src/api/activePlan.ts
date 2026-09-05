import type { PlanData, PlanState } from "./usePlan";

/** The plan a save door may offer to log against, or null.
 *
 *  ONE rule for "no active plan", shared by every save stack (`LogSession`'s
 *  three doors and `JustRowLog`) and matching what Today already renders
 *  as FREESTYLE (`Today.tsx`, `prescribedCode`): a plan is active only
 *  while it is CHOSEN (`planKey` non-null) AND has a session left at
 *  `sequence[doneN]`. Before this helper the doors tested `planKey` alone,
 *  so a rower who had logged every session met `Log against plan ·
 *  SESSION 85 OF 84` leading with `Save without logging` beneath it — the
 *  qualifier naming a choice they no longer had — while Today called the
 *  same account freestyle. With this rule the finished plan reads `Save`,
 *  the same lone button an unchosen plan gets, and the door posts
 *  `advancesPlan: false` so `doneN` never runs past the plan's end.
 *
 *  Loading and errored both read as null on purpose: logging is never
 *  hostage to the plan fetch (LogSession's M1/M2 rule). A rower whose plan
 *  fetch failed can still save the row, just without the option to count
 *  it against a plan the screen could not confirm. */
export function activePlan(state: PlanState): PlanData | null {
  if (state.state !== "ready") return null;
  const { plan } = state;
  return plan.planKey !== null && plan.sequence[plan.doneN] !== undefined
    ? plan
    : null;
}
