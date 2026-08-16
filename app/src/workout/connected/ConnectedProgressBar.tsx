// The redesigned progress bar (CR2 spec 3 task 3, design spec §2A). Not
// mounted anywhere this task — task 4 wires it into `PaneLive` in place of
// `TimerRuler`'s equal-height/notch bar — so this component and its CSS
// ship complete and standalone, tested against fixtures it builds itself.
//
// ONE SEGMENT PER INTERVAL, DURATION-PROPORTIONAL (design spec §2A: "the
// old ruler's proportional truth carries over; the README does not say
// equal, and equal-width would lie about a 10:00 piece beside a 0:30
// rest"). `boundaries.seconds` gives the INTERIOR edges only
// (`intervalBoundaries.ts`'s own doc comment — `groups.length - 1` entries,
// the end of the last interval is the bar's own right edge); this file
// turns those edges plus `totalSeconds` into `edges.length - 1` segments,
// each drawn as a flex ratio of its own duration so the 3px gaps stay
// exact regardless of segment count.
//
// THE SEGMENT STATE RULE (design spec §2A + §2D's armed frame, the
// antagonist correction this task shipped against):
//   - at `elapsedSeconds <= 0` (the armed frame, before the first stroke):
//     every segment is UPCOMING, including the first — there is no
//     "active" segment yet, because nothing has been rowed.
//   - otherwise, a segment is DONE once its own END has been reached or
//     passed (`end <= elapsedSeconds`); it is ACTIVE if elapsed sits at or
//     past its START but has not yet reached its end (the one segment
//     currently being rowed); every segment elapsed has not reached yet is
//     UPCOMING.
//   - `elapsedSeconds >= totalSeconds` needs no special case: every
//     segment's own `end <= totalSeconds <= elapsedSeconds`, so the DONE
//     rule above already marks all of them done.
//
// DENSITY FALLBACK (design spec §2A, `TimerRuler.tsx`'s own
// `MAX_NOTCH_BOUNDARIES` threshold, reproduced rather than imported — see
// `MAX_NOTCH_BOUNDARIES` below): above 16 interior boundaries the segments
// give way to ONE proportional fill (`elapsedSeconds / totalSeconds`) plus
// the quarter-tick row (`¼`/`½`/`¾`/session-minutes), the same fallback
// `TimerRuler`'s notch bar already uses for the identical reason — but the
// fallback here DRAWS THE FILL ITSELF (spec §2A: "the bar consumes
// `boundaries` + `totalSeconds` + elapsed for both modes"), it does not
// degrade to an unfilled ruler the way the retired notch bar did.
//
// WHY THIS FILE REPRODUCES RATHER THAN IMPORTS `TimerRuler`'s helpers: the
// CR2 spec 3 binding preamble forbids `connected/` files importing
// `TimerRuler`/`UpNextStrip` — the connected surface and the phone timer
// are meant to diverge now, not share a component whose next edit could
// silently move both. `MAX_NOTCH_BOUNDARIES` and the quarter-tick labels
// are therefore this file's own small copies, not re-exports.

import type { IntervalBoundaries } from "../../session/intervalBoundaries";

/** DENSITY (design spec §2A, `TimerRuler.tsx`'s `MAX_NOTCH_BOUNDARIES`
 *  verbatim): "16 gapped segments stay >=18px even at portrait's 342px."
 *  Same arithmetic as the notch bar's own threshold — landscape's content
 *  column is 390px at its widest, 390 / 17 spans = 22.9px, already under
 *  the 24px density floor; 16 boundaries (17 spans) is the last count
 *  that clears it. Kept as its own constant per this task's antagonist
 *  correction 2, not a shared import (see this file's header). */
export const MAX_NOTCH_BOUNDARIES = 16;

export type SegmentState = "done" | "active" | "upcoming";

export interface ProgressSegment {
  start: number;
  end: number;
  duration: number;
  state: SegmentState;
}

/** One segment's state — see this file's header comment for the full
 *  rule. `start`/`end` are absolute seconds from the session's start,
 *  exactly the shape `boundaries.seconds` and `totalSeconds` already use. */
// eslint-disable-next-line react-refresh/only-export-components
export function segmentState(
  start: number,
  end: number,
  elapsedSeconds: number,
): SegmentState {
  // The armed frame: nothing rowed yet, so nothing is "active" — not even
  // the segment starting at 0, which `start <= elapsedSeconds` below would
  // otherwise call active at `elapsedSeconds === 0`.
  if (elapsedSeconds <= 0) return "upcoming";
  if (end <= elapsedSeconds) return "done";
  if (start <= elapsedSeconds) return "active";
  return "upcoming";
}

/** The interior boundaries plus the session total, turned into edge-to-edge
 *  segments — one per interval, `edges.length - 1` of them. A
 *  single-interval session (`boundaries.seconds` empty) yields exactly one
 *  segment spanning the whole bar, matching `notchPercents`'s own
 *  single-interval fallthrough in `TimerRuler.tsx`. */
// eslint-disable-next-line react-refresh/only-export-components
export function buildSegments(
  boundaries: IntervalBoundaries,
  totalSeconds: number,
  elapsedSeconds: number,
): ProgressSegment[] {
  const edges = [0, ...boundaries.seconds, Math.max(0, totalSeconds)];
  const segments: ProgressSegment[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const start = edges[i]!;
    const end = edges[i + 1]!;
    segments.push({
      start,
      end,
      duration: Math.max(0, end - start),
      state: segmentState(start, end, elapsedSeconds),
    });
  }
  return segments;
}

/** The fallback fill's own width, 0-100 — `elapsed/total`, clamped exactly
 *  as `TimerRuler.tsx`'s `totalProgressPct` clamps its own fill (a
 *  zero/negative `totalSeconds` is an unpriceable session, priced at 0%
 *  rather than dividing by zero). */
// eslint-disable-next-line react-refresh/only-export-components
export function fallbackFillPercent(
  elapsedSeconds: number,
  totalSeconds: number,
): number {
  if (totalSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100));
}

/** The quarter-tick row's four labels — `TimerRuler.tsx`'s own
 *  `rulerLabels` verbatim, reproduced rather than imported (see this
 *  file's header). */
// eslint-disable-next-line react-refresh/only-export-components
export function quarterTickLabels(totalSeconds: number): string[] {
  return ["¼", "½", "¾", `${Math.round(totalSeconds / 60)}′`];
}

export default function ConnectedProgressBar({
  boundaries,
  totalSeconds,
  elapsedSeconds,
}: {
  boundaries: IntervalBoundaries;
  totalSeconds: number;
  elapsedSeconds: number;
}) {
  // Decorative throughout: the same state is redundantly in the status
  // text beside this bar (`3 OF 12 · WORK`, design spec §2A) — see the
  // `--progress-active` contrast disclosure in `index.css`'s matching
  // rule for why that redundancy is load-bearing, not incidental.
  if (boundaries.seconds.length > MAX_NOTCH_BOUNDARIES) {
    const fillPercent = fallbackFillPercent(elapsedSeconds, totalSeconds);
    return (
      <div className="connected-progress" aria-hidden="true">
        <div className="connected-progress-track">
          <div
            className="connected-progress-fill"
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <div className="connected-progress-ticks">
          {quarterTickLabels(totalSeconds).map((label, i) => (
            <div className="connected-progress-tick" key={i}>
              <span className="connected-progress-tick-mark" />
              <span className="connected-progress-tick-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const segments = buildSegments(boundaries, totalSeconds, elapsedSeconds);
  return (
    <div className="connected-progress" aria-hidden="true">
      <div className="connected-progress-track">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`connected-progress-seg connected-progress-seg-${seg.state}`}
            style={{ flexGrow: seg.duration, flexBasis: 0, flexShrink: 0 }}
          />
        ))}
      </div>
    </div>
  );
}
