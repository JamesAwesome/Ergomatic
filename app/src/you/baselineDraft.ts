/** Staged editor state for the two baseline splits (docs/design/README.md
 * §Domain model → Baselines). The ± buttons only ever touch `draft`; nothing
 * re-paces until `commit` folds `draft` into `committed` (called after a
 * successful save). Pure, framework-free — no React here.
 *
 * `touched` (task review round, Finding 1, BLOCKER): per-field, whether the
 * ROWER acted on that side this session — a stepper nudge, a typed entry,
 * or accepting the derivation offer (`setDraft`) all set it; `initDraft`
 * leaves both false. This is independent of whether the resulting number
 * differs from the seed: a rower who nudges away and back to the exact
 * seed value, or accepts an offer that happens to equal the seed, has still
 * ACTED on that field. `BaselineEditor.tsx`'s Apply reads this to decide
 * which fields to actually write — an untouched, still-server-null side
 * must never be fabricated onto the wire just because `draft` needs SOME
 * number to display (the "never a bare dash" rule forces a displayed
 * number; it must not also force a saved one). */
export interface DraftState {
  committed: { k2: number; k6: number };
  draft: { k2: number; k6: number };
  touched: { k2: boolean; k6: boolean };
}

/** Per-500m split bounds in seconds, matching what the API enforces. */
export const MIN_SPLIT = 60;
export const MAX_SPLIT = 240;
/** Nudge granularity in seconds. */
export const STEP = 0.5;

export function initDraft(k2: number, k6: number): DraftState {
  return {
    committed: { k2, k6 },
    draft: { k2, k6 },
    touched: { k2: false, k6: false },
  };
}

function clamp(value: number): number {
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value));
}

/** `direction: -1` is faster (subtracts STEP); `+1` is slower (adds STEP). */
export function nudge(
  s: DraftState,
  which: "k2" | "k6",
  direction: -1 | 1,
): DraftState {
  const next = clamp(s.draft[which] + direction * STEP);
  return {
    ...s,
    draft: { ...s.draft, [which]: next },
    touched: { ...s.touched, [which]: true },
  };
}

/** Sets one side of the DRAFT directly to `value` (clamped to the same
 *  MIN_SPLIT/MAX_SPLIT bounds `nudge` enforces) — the derivation offer's own
 *  write (ui-notes round, item 2, `domain/deriveBaseline.ts`'s two
 *  functions produce `value`). An ordinary draft edit like `nudge`: only
 *  `commit` (after the rower's own Apply) ever writes past `draft`, and the
 *  ± steppers keep working on whatever this fills in. */
export function setDraft(
  s: DraftState,
  which: "k2" | "k6",
  value: number,
): DraftState {
  return {
    ...s,
    draft: { ...s.draft, [which]: clamp(value) },
    touched: { ...s.touched, [which]: true },
  };
}

export function discard(s: DraftState): DraftState {
  return {
    ...s,
    draft: { ...s.committed },
    touched: { k2: false, k6: false },
  };
}

export function commit(s: DraftState): DraftState {
  return {
    committed: { ...s.draft },
    draft: { ...s.draft },
    touched: { k2: false, k6: false },
  };
}

/** Task-review round, Finding 3 (dissolved by Finding 1's touched-based
 *  Apply): this used to compare VALUES (`draft !== committed`), which reads
 *  false for a touched field whose value happens to equal committed/seed
 *  exactly (e.g. a derived estimate landing on the same number the seed
 *  already showed) — the confirm block and Apply button would never
 *  appear, so a real, deliberate edit was silently unreachable. Every
 *  mutator (`nudge`/`setDraft`) sets `touched` in the SAME call that
 *  changes `draft`, and `discard`/`commit` reset both together, so
 *  `draft[x] !== committed[x]` implies `touched[x]` always — `touched`
 *  alone is the complete, simpler answer to "is anything pending."
 *  Accepted edge (re-review round): nudging a field away and back to its
 *  EXACT original value leaves it `touched` (an act, not a net change), so
 *  Apply can fire a resend of an unchanged value — judged fine, not worth
 *  a "did anything actually move" check of its own. Since Phase BL PR A
 *  that resend is no longer value-idempotent in PROVENANCE: a touched
 *  field ships with a source, so an away-and-back nudge to the exact
 *  stored number, Applied, demotes a stored tested/derived source to
 *  manual — with zero visible ConfirmLines. That stance (an act on the
 *  field is a manual re-assertion of its number) is PR A's OWN decision,
 *  not a spec ruling: the demotion runs conservative (it downgrades to
 *  the least-claiming value, never fabricates a measurement) and
 *  provenance has zero consumers until `tested` exists. James RULED
 *  (2026-08-22): provenance is ORIGIN, not act — PR B replaces this
 *  with the value-identity predicate (stamp only when the value
 *  actually changed) alongside `tested`. Named here so nobody reads
 *  the interim behaviour as a bug or as settled. */
export function isDirty(s: DraftState): boolean {
  return s.touched.k2 || s.touched.k6;
}
