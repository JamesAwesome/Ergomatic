/** Staged editor state for the two baseline splits (docs/design/README.md
 * §Domain model → Baselines). Every edit control — the typed `SplitInput`
 * fields (Option T, 2026-08-23) and the recommendation adjust step's ±
 * buttons — only ever touches `draft`; nothing re-paces until `commit`
 * folds `draft` into `committed` (called after a successful save). Pure,
 * framework-free — no React here.
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
 *  MIN_SPLIT/MAX_SPLIT bounds `nudge` enforces) — the derivation offer's
 *  write (ui-notes round, item 2, `domain/deriveBaseline.ts`'s two
 *  functions produce `value`) AND, since Option T, every typed keystroke
 *  (`SplitInput`'s parsed whole seconds). An ordinary draft edit like
 *  `nudge`: only `commit` (after the rower's own Apply) ever writes past
 *  `draft`, and further typing keeps working on whatever this fills in. */
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
 *  EXACT original value leaves it `touched` (an act, not a net change),
 *  so the confirm card renders with zero visible ConfirmLines and a live
 *  Apply/Discard pair. What Apply DOES with that state changed in Phase
 *  BL PR B — THE ORIGIN PREDICATE (James's ruling, 2026-08-22:
 *  provenance is ORIGIN, not act — a source describes where the NUMBER
 *  came from, so an unchanged value keeps its stamp): `BaselineEditor`'s
 *  Apply now sends a touched field only when its value actually differs
 *  from the SERVER's (or the server side is null), and an Apply where
 *  nothing changed makes no network call at all — it just settles the
 *  card via `commit`. `touched` itself deliberately keeps tracking the
 *  ACT (this module is pure display-session state and Finding 3's fix
 *  still needs act-tracking for confirm-card visibility); the
 *  value-identity comparison lives at the one place that owns the server
 *  truth, `BaselineEditor.tsx`'s own handleApply. PR A's interim
 *  behaviour (a touched-but-unmoved field resent with `manual`, silently
 *  demoting a stored tested/derived source) is GONE, not merely
 *  documented. */
export function isDirty(s: DraftState): boolean {
  return s.touched.k2 || s.touched.k6;
}
