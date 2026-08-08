import type { Difficulty, WorkoutType } from "../../domain/types.js";
import { PAIN_WORDS, TYPE_WORDS } from "./builderState";
import { DIFFICULTY_CHIPS } from "../components/difficultyChips";

// Chip order per docs/design/README.md §Screens -> "2. Library" (amended
// 2026-08-08: James's ordering decision — every left-to-right type row reads
// O2 · AT · TR · AN app-wide, the pyramid's base-first order), matching
// src/library/FilterSheet.tsx's TYPE cells and Today.tsx's own type-swap
// chips.
const TYPE_CHIPS: { type: WorkoutType; label: string }[] = [
  { type: "O2", label: "O2" },
  { type: "AT", label: "AT" },
  { type: "TR", label: "TR" },
  { type: "AN", label: "AN" },
];

// CSS custom property per workout type — never a raw hex (tokens.css). Kept
// local rather than importing from TypeBadge.tsx, matching the existing
// duplication convention (Builder.tsx, PainBar.tsx and TypeBadge.tsx each
// keep their own copy rather than sharing one module).
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

const PAIN_LEVELS = [1, 2, 3, 4, 5] as const;

/** The classification card (docs/design/builder-redesign/README.md §3): one
 *  card holding TYPE, DIFFICULTY and EXPECTED PAIN so the three metadata
 *  pickers read as a single unit instead of three loose strips.
 *
 *  Selected-state fills (docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md,
 *  ui-fix round Task 1 — supersedes this card's original handoff, which had
 *  PAIN filling its own per-level ramp colour):
 *  - TYPE fills the selected chip with THAT TYPE'S OWN colour (`TYPE_COLOR_
 *    VAR`, set inline below) — the one selection on this screen accent is
 *    never allowed to mean, and the one place a per-instance colour is
 *    unavoidable (four different types, four different fills).
 *  - DIFFICULTY and PAIN both fill plain ink, never accent, so accent stays
 *    reserved for the in-row unit/pace toggles and Save. Enforced
 *    structurally: `.classification-chip-difficulty`/`-pain` are distinct
 *    classes from the pre-existing `.chip` (whose `[aria-pressed="true"]`
 *    rule fills accent), and neither selected chip carries an inline style
 *    at all — the ink fill lives entirely in two CSS rules that never
 *    reference --accent (see index.css). PAIN's own per-level ramp colour
 *    (`--pain-ramp-1..5`, tokens.css) is no longer used here at all — it was
 *    DESIGN.md's own "Builder's gold pain selection goes" finding, since
 *    ramp-3 IS the AT type colour and briefly made a pain level read as a
 *    type. LogSession.tsx (a different, untouched-this-round screen) is
 *    still a live consumer of that same ramp.
 *
 *  Also, PAIN drops the ink-stroke face graphics from the deleted
 *  PainPicker.tsx — numerals only, with the current level's word
 *  (PAIN_WORDS) rendered opposite the group label instead.
 *
 *  A third addition, mid-phase (James's request, not the original handoff):
 *  TYPE gets the same treatment as PAIN — a short summary word (TYPE_WORDS)
 *  opposite its label. Unlike PAIN, a type is always selected (there's no
 *  "nothing chosen yet" state for TYPE), so the word never toggles
 *  in and out of existence the way the pain word does. It still reuses the
 *  pain row's reserved-line-box fix (`.classification-type-label-row`'s
 *  `min-height`, index.css) rather than relying on "the word is always
 *  there so the height is already constant" — belt and suspenders against a
 *  future change (e.g. a type gaining an unset state) reintroducing the
 *  exact nudge bug 5F shipped on the pain row. */
export default function ClassificationCard({
  type,
  difficulty,
  pain,
  onTypeChange,
  onDifficultyChange,
  onPainChange,
}: {
  type: WorkoutType;
  difficulty: Difficulty;
  pain: number | null;
  onTypeChange: (type: WorkoutType) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onPainChange: (pain: number) => void;
}) {
  const painWord = pain !== null ? PAIN_WORDS[pain - 1] : undefined;
  const typeWord = TYPE_WORDS[type];

  return (
    <div className="classification-card">
      <div className="classification-group">
        <div className="classification-type-label-row">
          <p className="classification-group-label">TYPE</p>
          <p className="classification-type-word">{typeWord}</p>
        </div>
        <div className="classification-chip-row">
          {TYPE_CHIPS.map(({ type: t, label }) => {
            const selected = type === t;
            return (
              <button
                key={t}
                type="button"
                className="classification-chip classification-chip-type"
                aria-pressed={selected}
                style={
                  selected
                    ? {
                        background: `var(${TYPE_COLOR_VAR[t]})`,
                        borderColor: `var(${TYPE_COLOR_VAR[t]})`,
                        color: "var(--on-color)",
                      }
                    : undefined
                }
                onClick={() => onTypeChange(t)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="classification-group">
        <p className="classification-group-label">DIFFICULTY</p>
        <div className="classification-chip-row">
          {DIFFICULTY_CHIPS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className="classification-chip classification-chip-difficulty"
              aria-pressed={difficulty === value}
              onClick={() => onDifficultyChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="classification-group">
        <div className="classification-pain-label-row">
          <p className="classification-group-label">EXPECTED PAIN</p>
          {painWord !== undefined && (
            <p className="classification-pain-word">{painWord}</p>
          )}
        </div>
        <div className="classification-chip-row">
          {PAIN_LEVELS.map((level) => {
            const selected = pain === level;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={selected}
                aria-label={`Pain ${level}`}
                className="classification-chip classification-chip-pain"
                onClick={() => onPainChange(level)}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
