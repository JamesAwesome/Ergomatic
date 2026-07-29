/** Staged editor state for the two baseline splits (docs/design/README.md
 * §Domain model → Baselines). The ± buttons only ever touch `draft`; nothing
 * re-paces until `commit` folds `draft` into `committed` (called after a
 * successful save). Pure, framework-free — no React here. */

export interface DraftState {
  committed: { k2: number; k6: number };
  draft: { k2: number; k6: number };
}

/** Per-500m split bounds in seconds, matching what the API enforces. */
export const MIN_SPLIT = 60;
export const MAX_SPLIT = 240;
/** Nudge granularity in seconds. */
export const STEP = 0.5;

export function initDraft(k2: number, k6: number): DraftState {
  return { committed: { k2, k6 }, draft: { k2, k6 } };
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
  return { ...s, draft: { ...s.draft, [which]: next } };
}

export function discard(s: DraftState): DraftState {
  return { ...s, draft: { ...s.committed } };
}

export function commit(s: DraftState): DraftState {
  return { committed: { ...s.draft }, draft: { ...s.draft } };
}

export function isDirty(s: DraftState): boolean {
  return s.draft.k2 !== s.committed.k2 || s.draft.k6 !== s.committed.k6;
}
