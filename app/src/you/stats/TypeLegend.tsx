import type { TypeBucket } from "../../../domain/stats/aggregate.js";
import { fmtPercent, fmtSeconds } from "./format";

const swatchClass = (key: TypeBucket["key"]) =>
  `stats-swatch-${key === "NO TYPE" ? "none" : key.toLowerCase()}`;

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
    // A2-H3's compact legend: one swatch chip per non-empty bucket, wrapping
    // (`build.mjs` `stackSvg(..., { compact: true })`). Each chip's text reads
    // `AN 6%`; the row is `.stats-legend-line` (the e2e clicks it as the
    // hero's deepest descendant).
    return (
      <p className="stats-legend-line">
        {buckets.map((b) => (
          <span key={b.key} className="stats-legend-chip" data-bucket={b.key}>
            <span
              className={`stats-swatch ${swatchClass(b.key)}`}
              aria-hidden="true"
            />
            <span className="stats-legend-key">{b.key}</span>{" "}
            <span className="stats-legend-pct">{fmtPercent(b.share)}</span>
          </span>
        ))}
      </p>
    );
  }
  return (
    <ul className="stats-legend">
      {buckets.map((b) => (
        <li key={b.key} className="stats-legend-row" data-bucket={b.key}>
          <span
            className={`stats-swatch ${swatchClass(b.key)}`}
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
