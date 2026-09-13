/**
 * A polyline's `points` attribute from data points through two scales
 * (Phase PS PR 2: the season curve and the test trend). One decimal, so
 * an SVG attribute never carries float noise. No React, no DOM.
 */
import type { ChartPoint } from "./scale.js";

export function polylinePoints(
  points: readonly ChartPoint[],
  xScale: (v: number) => number,
  yScale: (v: number) => number,
): string {
  return points
    .map((p) => `${xScale(p.x).toFixed(1)},${yScale(p.y).toFixed(1)}`)
    .join(" ");
}
