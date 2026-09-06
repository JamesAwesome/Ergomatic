import { fmtSplit } from "../../domain/format.js";
import type { BaselinesState } from "../api/useBaselines";

/** The BASELINES row's state line — the numbers a rower can read from You
 *  without opening `/you/baselines` (Gate 0, 2026-09-05: "I'd still like
 *  them to be visible when they are collapsed").
 *
 *  A separate module from the component for the reason `concept2RowState.ts`
 *  is one: the file that exports the component exports only the component,
 *  so Fast Refresh keeps working, and the decision table is testable without
 *  a router or a fetch.
 *
 *  `null` means the row draws its label and chevron and NOTHING else. That
 *  is the loading cell, and it is deliberately not "NOT SET": a rower with
 *  two stored baselines would otherwise be told they have none for as long
 *  as the read takes.
 *
 *  MINTS NO NEW COPY except the two words the numbers cannot say for
 *  themselves. `COULDN'T READ` is Concept2Row's own failed-read string, and
 *  `—` is the house data placeholder. `NOT SET` (both sides empty) is a
 *  word rather than two dashes on purpose: `2K — · 6K —` reads as a broken
 *  row, not an empty one.
 *
 *  Width is bounded by construction: the SERVER clamps a stored split to
 *  60..240s and 400s anything outside it (`server/routes/data.ts`'s
 *  MIN_SPLIT_SECONDS / MAX_SPLIT_SECONDS), so every split is six mono
 *  characters and the longest line this can return is
 *  `2K 1:52.3 · 6K 2:05.0` (171px at 320 CSS px, measured at Gate 0 —
 *  nothing here can wrap or clip). `baselineDraft.ts` carries the same two
 *  numbers, but that is the EDITOR's own draft clamp: it bounds what this
 *  client will send, never what the row can be asked to render. */
export function baselinesRowState(state: BaselinesState): string | null {
  if (state.state === "loading") return null;
  if (state.state === "error") return "COULDN'T READ";
  const { k2Seconds, k6Seconds } = state.baselines;
  if (k2Seconds === null && k6Seconds === null) return "NOT SET";
  return `2K ${side(k2Seconds)} · 6K ${side(k6Seconds)}`;
}

const side = (seconds: number | null): string =>
  seconds === null ? "—" : fmtSplit(seconds);
