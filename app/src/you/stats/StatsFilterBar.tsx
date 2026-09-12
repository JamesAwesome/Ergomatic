import { useRef, type KeyboardEvent } from "react";
import { PRESETS, type Preset } from "../../../domain/stats/calendar.js";

const LABEL: Record<Preset, string> = {
  all: "ALL",
  season: "SEASON",
  year: "YEAR",
  month: "MONTH",
  "30d": "30 DAYS",
  custom: "CUSTOM",
};

export const RANGE_CAPTION =
  "RANGE APPLIES TO TOTALS · METRES PER WEEK · TIME BY TYPE. SEASON IS ALWAYS THIS SEASON. TEST TREND IS ALWAYS EVERY TEST.";
export const FROM_AFTER_TO = "FROM MUST NOT FOLLOW TO";
/** A cleared FROM or TO. Copy pending James at PR review (Gate 0 drew only
 *  the FROM > TO error). */
export const ENTER_BOTH_DATES = "ENTER BOTH DATES";
export type CustomProblem = null | "empty" | "order";

/** Six 44 px chips as ONE roving-tabindex radiogroup — `PaceRefInput`'s
 *  pattern (RF8) — plus the CUSTOM pair of 16 px date inputs (spec §5). */
export default function StatsFilterBar({
  preset,
  onPreset,
  custom,
  onCustom,
  customProblem,
}: {
  preset: Preset;
  onPreset: (p: Preset) => void;
  custom: { from: string; to: string };
  onCustom: (next: { from: string; to: string }) => void;
  customProblem: CustomProblem;
}) {
  const customInvalid = customProblem !== null;
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectByIndex(index: number) {
    const wrapped = (index + PRESETS.length) % PRESETS.length;
    chipRefs.current[wrapped]?.focus();
    onPreset(PRESETS[wrapped]!);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        selectByIndex(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        selectByIndex(index - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="stats-filter">
      <div className="stats-chips" role="radiogroup" aria-label="Range">
        {PRESETS.map((p, index) => (
          <button
            key={p}
            ref={(el) => {
              chipRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={preset === p}
            className="stats-chip"
            tabIndex={preset === p ? 0 : -1}
            onClick={() => onPreset(p)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {LABEL[p]}
          </button>
        ))}
      </div>
      <p className="stats-caption">{RANGE_CAPTION}</p>
      {preset === "custom" && (
        <div className="stats-custom">
          <label className="stats-date">
            FROM
            <input
              type="date"
              value={custom.from}
              aria-invalid={customInvalid || undefined}
              onChange={(e) => onCustom({ ...custom, from: e.target.value })}
            />
          </label>
          <label className="stats-date">
            TO
            <input
              type="date"
              value={custom.to}
              aria-invalid={customInvalid || undefined}
              onChange={(e) => onCustom({ ...custom, to: e.target.value })}
            />
          </label>
          {customInvalid && (
            <p className="stats-caption" role="alert">
              {customProblem === "empty" ? ENTER_BOTH_DATES : FROM_AFTER_TO}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
