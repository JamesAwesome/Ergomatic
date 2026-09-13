import { useState } from "react";
import {
  rowsInRange,
  summarize,
  timeByType,
} from "../../../domain/stats/aggregate.js";
import {
  addDays,
  customRange,
  presetRange,
  type CalendarDate,
  type DateRange,
  type Preset,
} from "../../../domain/stats/calendar.js";
import type { DatedStatsRow } from "../../../domain/stats/statsRow.js";
import { useStatsRows } from "../../api/useStatsRows";
import BackLink from "../../shell/BackLink";
import { fmtDate, parseDate } from "./format";
import StatsFilterBar, { type CustomProblem } from "./StatsFilterBar";
import TimeByTypeGroup from "./TimeByTypeGroup";
import TotalsGroup from "./TotalsGroup";
import { NO_ROWS_YET } from "./YouStatsHero";

/**
 * `/you/stats` (career-stats spec §5, PR 1's half): the filter bar, TOTALS
 * and TIME BY TYPE, every empty state. Plain `.screen` like
 * `BaselinesScreen` (it carries inputs). Filter state is screen-local and
 * dies with the screen; the rows are the hook's per-mount fetch (§4.3).
 */
export default function StatsScreen() {
  const state = useStatsRows();
  const [preset, setPreset] = useState<Preset>("all");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(
    null,
  );
  // The last range CUSTOM applied — kept while FROM > TO (spec §5); set
  // in the change handler, never during render.
  const [applied, setApplied] = useState<DateRange | null>(null);

  function handleCustom(next: { from: string; to: string }) {
    setCustom(next);
    const from = parseDate(next.from);
    const to = parseDate(next.to);
    const r = from && to ? customRange(from, to) : null;
    if (r) setApplied(r);
  }

  return (
    <main className="screen">
      <BackLink fallback="/you" />
      <h1 className="screen-title">Stats</h1>
      {state.state === "loading" && <p className="stats-caption">LOADING…</p>}
      {state.state === "error" && (
        <p className="notice" role="alert">
          Couldn't load your stats.{" "}
          <button
            type="button"
            className="button-outline"
            onClick={state.retry}
          >
            Try again
          </button>
        </p>
      )}
      {state.state === "ready" && state.rows.length === 0 && (
        <p className="stats-caption">{NO_ROWS_YET}</p>
      )}
      {state.state === "ready" && state.rows.length > 0 && (
        <Body
          rows={state.rows}
          today={state.today}
          preset={preset}
          onPreset={setPreset}
          custom={
            custom ?? {
              from: fmtDate(addDays(state.today, -29)),
              to: fmtDate(state.today),
            }
          }
          onCustom={handleCustom}
          applied={applied}
        />
      )}
    </main>
  );
}

function Body({
  rows,
  today,
  preset,
  onPreset,
  custom,
  onCustom,
  applied,
}: {
  rows: readonly DatedStatsRow[];
  today: CalendarDate;
  preset: Preset;
  onPreset: (p: Preset) => void;
  custom: { from: string; to: string };
  onCustom: (c: { from: string; to: string }) => void;
  applied: DateRange | null;
}) {
  const from = parseDate(custom.from);
  const to = parseDate(custom.to);
  // Two ways the pair can be unusable, each with its own sentence; while
  // either holds, `applied` (the last VALID range) is what renders.
  const customProblem: CustomProblem =
    preset !== "custom"
      ? null
      : from === null || to === null
        ? "empty"
        : customRange(from, to) === null
          ? "order"
          : null;
  // The seeded pair IS the 30 DAYS range, so an untouched CUSTOM reads it.
  const range: DateRange =
    preset === "custom"
      ? (applied ?? presetRange("30d", today))
      : presetRange(preset, today);
  const inRange = rowsInRange(rows, range);
  const summary = summarize(rows, range);
  return (
    <>
      <StatsFilterBar
        preset={preset}
        onPreset={onPreset}
        custom={custom}
        onCustom={onCustom}
        customProblem={customProblem}
      />
      {inRange.length === 0 ? (
        <p className="stats-caption">
          NO ROWS BETWEEN {range.from ? fmtDate(range.from) : "THE START"} AND{" "}
          {range.to ? fmtDate(range.to) : "TODAY"}
        </p>
      ) : (
        <>
          <TotalsGroup summary={summary} />
          <TimeByTypeGroup
            buckets={timeByType(rows, range)}
            rowsInRange={inRange.length}
          />
        </>
      )}
    </>
  );
}
