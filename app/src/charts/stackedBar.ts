/**
 * Stacked-bar layout (Phase PS PR 1, spec §5): one row of segments in the
 * caller's order, each as wide as its share of the total, separated by a
 * fixed gap. Knows nothing about types, seconds or colours — the caller
 * maps keys to fills. No React, no DOM (this directory's own rule).
 */
export interface StackedSegment<K> {
  key: K;
  x: number;
  width: number;
}

/** Zero-value entries get no segment (the caller's legend rule mirrors
 *  this); a total of 0 yields no segments at all. */
export function layoutStackedBar<K>(
  values: readonly { key: K; value: number }[],
  width: number,
  gap: number,
): StackedSegment<K>[] {
  const live = values.filter((v) => v.value > 0);
  const total = live.reduce((s, v) => s + v.value, 0);
  if (total <= 0) return [];
  const usable = Math.max(0, width - gap * (live.length - 1));
  let x = 0;
  return live.map((v) => {
    const w = (v.value / total) * usable;
    const seg = { key: v.key, x, width: w };
    x += w + gap;
    return seg;
  });
}
