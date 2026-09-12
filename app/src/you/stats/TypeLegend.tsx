import type { TypeBucket } from "../../../domain/stats/aggregate.js";
import { fmtPercent, fmtSeconds } from "./format";

/** One row per NON-EMPTY bucket (invariant 17). The hero prints
 *  `AN 6% · AT 27% · …` on one line; the subpage a list with the time. */
export default function TypeLegend({
  buckets,
  withTime,
}: {
  buckets: readonly TypeBucket[];
  withTime: boolean;
}) {
  if (!withTime) {
    return (
      <p className="stats-legend-line">
        {buckets.map((b) => `${b.key} ${fmtPercent(b.share)}`).join(" · ")}
      </p>
    );
  }
  return (
    <ul className="stats-legend">
      {buckets.map((b) => (
        <li key={b.key} className="stats-legend-row" data-bucket={b.key}>
          <span
            className={`stats-swatch stats-swatch-${b.key === "NO TYPE" ? "none" : b.key.toLowerCase()}`}
            aria-hidden="true"
          />
          <span className="stats-legend-key">{b.key}</span>
          <span className="stats-legend-time">{fmtSeconds(b.seconds)}</span>
          <span className="stats-legend-pct">{fmtPercent(b.share)}</span>
        </li>
      ))}
    </ul>
  );
}
