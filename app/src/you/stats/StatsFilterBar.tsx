import { PRESETS, type Preset } from "../../../domain/stats/calendar.js";
import OptionGroup from "../../onboarding/OptionGroup";

const LABEL: Record<Preset, string> = {
  all: "ALL",
  season: "SEASON",
  year: "YEAR",
  month: "MONTH",
  "30d": "30 DAYS",
  custom: "CUSTOM",
};

export const FROM_AFTER_TO = "FROM MUST NOT FOLLOW TO";
/** A cleared FROM or TO. Copy pending James at PR review (Gate 0 drew only
 *  the FROM > TO error). */
export const ENTER_BOTH_DATES = "ENTER BOTH DATES";
export type CustomProblem = null | "empty" | "order";

const PRESET_OPTIONS = PRESETS.map((p) => ({ value: p, label: LABEL[p] }));

/** Six 44 px chips as ONE roving-tabindex radiogroup — the house
 *  `OptionGroup` (RF8: reuse the pattern, never a fourth hand-rolled one)
 *  — plus the CUSTOM pair of 16 px date inputs (spec §5). */
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
  return (
    <div className="stats-filter">
      {/* The house radiogroup (RF8): `OptionGroup` owns the roving tabindex,
          the arrow keys and both wraps; this bar only names the chips. */}
      <OptionGroup
        options={PRESET_OPTIONS}
        value={preset}
        onChange={onPreset}
        ariaLabel="Range"
        className="stats-chips"
        optionClassName="stats-chip"
      />
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
