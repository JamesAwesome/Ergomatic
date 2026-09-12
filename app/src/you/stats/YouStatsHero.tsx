import { Link } from "react-router-dom";
import { summarize, timeByType } from "../../../domain/stats/aggregate.js";
import { presetRange, seasonOf } from "../../../domain/stats/calendar.js";
import { useStatsRows } from "../../api/useStatsRows";
import { fmtMeters } from "./format";
import StackedBar from "./StackedBar";
import TypeLegend from "./TypeLegend";

export const NO_ROWS_YET =
  "NO ROWS YET · YOUR FIRST SAVED ROW STARTS THE COUNT";
/** Rows exist but none carries work SECONDS (every one on the steps tier
 *  with metres only), so the bar has nothing to draw. Copy pending James
 *  at PR review (a Gate 0 addition — the seed never reaches this state). */
export const NO_WORK_TIME_TO_DRAW = "NO WORK TIME TO DRAW YET";
const FIGURES_ID = "you-stats-figures";

/**
 * Gate 0's H3 hero (career-stats spec §5, §14 rulings 9-10): LIFETIME and
 * SEASON work metres (ALL column) over one WORK TIME BY TYPE bar — and it
 * IS the door: ONE focusable control named `Stats`, ≥ 44 px, no nested
 * interactive element; tapping anywhere opens `/you/stats` (invariant
 * 16). Fetches and computes on its own; `You.tsx` passes it nothing, so
 * this file is inside the §8.4 structural scan and `You.tsx` need not
 * be.
 */
export default function YouStatsHero() {
  const state = useStatsRows();
  return (
    <Link
      to="/you/stats"
      state={{ from: "/you" }}
      className="you-stats-hero"
      aria-label="Stats"
      // The accessible NAME stays `Stats` (invariant 16); the figures are
      // the DESCRIPTION, so a screen reader still hears LIFETIME and SEASON.
      aria-describedby={state.state === "ready" ? FIGURES_ID : undefined}
    >
      {state.state === "loading" && <p className="stats-caption">LOADING…</p>}
      {state.state === "error" && (
        <p className="stats-caption">COULDN'T LOAD STATS · TAP TO OPEN</p>
      )}
      {state.state === "ready" && <HeroBody {...state} />}
    </Link>
  );
}

function HeroBody({
  rows,
  today,
}: Extract<ReturnType<typeof useStatsRows>, { state: "ready" }>) {
  const all = presetRange("all", today);
  const lifetime = summarize(rows, all).all.meters;
  const season = summarize(rows, presetRange("season", today)).all.meters;
  const buckets = timeByType(rows, all);
  return (
    <>
      <p className="you-stats-figures" id={FIGURES_ID}>
        <span>LIFETIME · {fmtMeters(lifetime)} M</span>
        <span>
          SEASON {seasonOf(today).name} · {fmtMeters(season)} M
        </span>
      </p>
      {rows.length === 0 ? (
        <p className="stats-caption">{NO_ROWS_YET}</p>
      ) : buckets.length === 0 ? (
        <p className="stats-caption">{NO_WORK_TIME_TO_DRAW}</p>
      ) : (
        <>
          <StackedBar buckets={buckets} />
          <TypeLegend buckets={buckets} withTime={false} />
          <p className="stats-caption">WORK TIME BY TYPE · ALL ROWS</p>
        </>
      )}
    </>
  );
}
