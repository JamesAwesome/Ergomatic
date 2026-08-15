/** The four real library rows the notation article decodes, in their own
 *  module because notation.tsx may only export components (react-refresh
 *  lint). Exported so a test can pin each string to `structureLine`'s
 *  actual output for that workout — the library regenerates from time to
 *  time, and a drifted example would teach a line the Library no longer
 *  shows. */
export const LIBRARY_EXAMPLES = [
  { title: "Sea Fret", line: "2 × 4:00 @ 6K+12 · 1′ REST" },
  { title: "Millpond", line: "2-3-4-3-2 @ 6K+12 · 1′ REST" },
  { title: "Squall Gust", line: "10 × 0:45 @ 2K−1 · 1:15 REST" },
  { title: "Quartering Sea", line: "1100m-3-550m-1 @ 2K+3 → −1" },
] as const;
