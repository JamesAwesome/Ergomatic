import type { TypeBucket } from "../../../domain/stats/aggregate.js";
import StackedBar from "./StackedBar";
import TypeLegend from "./TypeLegend";
import { NO_WORK_TIME_TO_DRAW } from "./YouStatsHero";

export const TWO_ROWS_MAKE_A_CHART = "TWO ROWS MAKE A CHART";

/** TIME BY TYPE (spec §5 item 4): the hero's bar again, with a legend of
 *  one row per non-empty bucket; under two rows in range it says so. */
export default function TimeByTypeGroup({
  buckets,
  rowsInRange,
}: {
  buckets: readonly TypeBucket[];
  rowsInRange: number;
}) {
  return (
    <section className="stats-group" aria-labelledby="stats-tbt-h">
      <h2 id="stats-tbt-h" className="stats-group-title">
        TIME BY TYPE
      </h2>
      {rowsInRange < 2 ? (
        <p className="stats-caption">{TWO_ROWS_MAKE_A_CHART}</p>
      ) : buckets.length === 0 ? (
        <p className="stats-caption">{NO_WORK_TIME_TO_DRAW}</p>
      ) : (
        <>
          <StackedBar buckets={buckets} />
          <TypeLegend buckets={buckets} withTime />
        </>
      )}
    </section>
  );
}
