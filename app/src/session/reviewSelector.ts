export type ReviewSource = "timer" | "monitor";
export interface ReviewSelector {
  source: ReviewSource;
  startedAt: string;
}
export function parseReviewSelector(search: string): ReviewSelector | null {
  const params = new URLSearchParams(search);
  const sources = params.getAll("source");
  const keys = params.getAll("startedAt");
  if (sources.length !== 1 || keys.length !== 1) return null;
  const source = sources[0];
  const startedAt = keys[0];
  if ((source !== "timer" && source !== "monitor") || !startedAt) return null;
  return { source, startedAt };
}
export function reviewLocation(
  source: ReviewSource,
  startedAt: string,
): string {
  return `/session/review?source=${source}&startedAt=${encodeURIComponent(startedAt)}`;
}
