import type { Difficulty, WorkoutType } from "../../domain/types.js";
import { PAIN_WORDS } from "./builderState";

// Chip order per docs/design/README.md §Screens -> "2. Library" (AN before
// O2 — not alphabetical), matching src/library/FilterChips.tsx and
// Builder.tsx's own (pre-redesign) TYPE_CHIPS.
const TYPE_CHIPS: { type: WorkoutType; label: string }[] = [
  { type: "AN", label: "AN" },
  { type: "O2", label: "O2" },
  { type: "AT", label: "AT" },
  { type: "TR", label: "TR" },
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

// Difficulty reads EASY/MEDIUM/HARD (docs/design/DEVIATIONS.md), not the
// handoff's Introductory/Moderate/Advanced.
const DIFFICULTY_CHIPS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "EASY" },
  { value: "medium", label: "MEDIUM" },
  { value: "hard", label: "HARD" },
];

const PAIN_LEVELS = [1, 2, 3, 4, 5] as const;
type PainLevel = (typeof PAIN_LEVELS)[number];

// Selected pain-cell fill var per level — the handoff's pain ramp
// (docs/design/builder-redesign/README.md §3), added to tokens.css as its
// own named properties. Originally kept distinct from PainPicker.tsx's own
// --pain-N/--pain-N-fill tokens (the two ramps' hexes disagreed and
// PainPicker was still Builder.tsx's live consumer at the time this file
// was written) — Phase 5E Task 5 wired this card into Builder.tsx in
// PainPicker's place and deleted PainPicker.tsx/its tokens entirely (grepped
// first: nothing else, including Phase 6's not-yet-built log screen,
// imported it), leaving --pain-ramp-N as the sole surviving pain palette.
const PAIN_RAMP_VAR: Record<PainLevel, string> = {
  1: "--pain-ramp-1",
  2: "--pain-ramp-2",
  3: "--pain-ramp-3",
  4: "--pain-ramp-4",
  5: "--pain-ramp-5",
};

/** The classification card (docs/design/builder-redesign/README.md §3): one
 *  card holding TYPE, DIFFICULTY and EXPECTED PAIN so the three metadata
 *  pickers read as a single unit instead of three loose strips.
 *
 *  Two departures the handoff calls out explicitly:
 *  - PAIN drops the ink-stroke face graphics from the deleted
 *    PainPicker.tsx — numerals only, with the current level's word
 *    (PAIN_WORDS) rendered opposite the group label instead.
 *  - DIFFICULTY's selected fill moves off --accent onto --ink, so accent
 *    stays reserved for the in-row unit/pace toggles and Save. Enforced
 *    structurally here: `.classification-chip-difficulty` is a distinct
 *    class from the pre-existing `.chip` (whose `[aria-pressed="true"]`
 *    rule fills accent), and the selected DIFFICULTY chip carries no inline
 *    style at all — the ink fill lives entirely in one CSS rule that never
 *    references --accent (see index.css). */
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

  return (
    <div className="classification-card">
      <div className="classification-group">
        <p className="classification-group-label">TYPE</p>
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
                style={
                  selected
                    ? {
                        background: `var(${PAIN_RAMP_VAR[level]})`,
                        borderColor: `var(${PAIN_RAMP_VAR[level]})`,
                        color: "var(--on-color)",
                      }
                    : undefined
                }
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
