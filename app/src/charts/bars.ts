/**
 * Bar-slot layout (Phase PS PR 2, spec §5 item 3): `count` equal slots
 * across `width`, one bar centred in each, no wider than `maxBarWidth`
 * and never wider than the slot less `slotGap`. Knows nothing about
 * weeks or metres. No React, no DOM (this directory's own rule).
 */
export interface BarSlot {
  /** The bar's left edge. */
  x: number;
  width: number;
  /** The slot's centre — where an x label sits. */
  centre: number;
}

export function layoutBars(
  count: number,
  width: number,
  maxBarWidth: number,
  slotGap = 6,
): BarSlot[] {
  if (count <= 0 || width <= 0) return [];
  const slot = width / count;
  const barWidth = Math.max(0, Math.min(maxBarWidth, slot - slotGap));
  return Array.from({ length: count }, (_, i) => ({
    x: slot * i + (slot - barWidth) / 2,
    width: barWidth,
    centre: slot * i + slot / 2,
  }));
}
