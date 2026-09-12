import { layoutStackedBar } from "../../charts/stackedBar";
import type { TypeBucket } from "../../../domain/stats/aggregate.js";

const WIDTH = 320;
const HEIGHT = 24;
const GAP = 2;

const SEGMENT_CLASS: Record<TypeBucket["key"], string> = {
  AN: "stacked-bar-seg-an",
  AT: "stacked-bar-seg-at",
  O2: "stacked-bar-seg-o2",
  TR: "stacked-bar-seg-tr",
  "NO TYPE": "stacked-bar-seg-none",
};

/** The one 24 px stacked bar (Gate 0 H3 / spec §5): segments in the
 *  domain's stack order with 2 px surface gaps; NO TYPE in `--ink-4` so it
 *  cannot read as a fifth intensity. Decoration only — the legend text
 *  beside it carries the values, so it is `aria-hidden`. */
export default function StackedBar({
  buckets,
}: {
  buckets: readonly TypeBucket[];
}) {
  const segments = layoutStackedBar(
    buckets.map((b) => ({ key: b.key, value: b.seconds })),
    WIDTH,
    GAP,
  );
  return (
    <svg
      className="stacked-bar"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {segments.map((s) => (
        <rect
          key={s.key}
          className={SEGMENT_CLASS[s.key]}
          data-bucket={s.key}
          x={s.x}
          y={0}
          width={s.width}
          height={HEIGHT}
        />
      ))}
    </svg>
  );
}
