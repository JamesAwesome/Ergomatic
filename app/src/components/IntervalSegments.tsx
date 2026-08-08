/** The phase-dot strip (`.timer-dots`), extracted verbatim from
 *  `session/Timer.tsx`'s own inline JSX (Phase 7B Task 3) so the connected
 *  panes can render the identical strip without reaching into the phone
 *  timer's file. Both panes A and B now do (Task 6): the handoff requires
 *  them to show the SAME strip, "so swiping between the two panes never
 *  costs the rower their place in the session". Neutral value props — this
 *  component knows nothing about `EnginePhase`/`SessionRun`; the phone
 *  timer still owns deriving `total`/`current` from its own run, exactly as
 *  it did inline before this extraction.
 *
 *  `kinds` is part of the pinned shape (Task 3's brief) but UNUSED by this
 *  render on purpose: the phone timer's own dot strip has never
 *  distinguished warm-up/work/rest visually (`.timer-dot-past/-current/
 *  -future` are the only three classes `index.css` defines, keyed purely
 *  off position relative to `current`) — a byte-identical extraction cannot
 *  start painting dots by kind without changing that DOM. It's threaded
 *  through the props today so a connected-pane consumer can pass real
 *  per-phase kinds without a signature change once THAT rendering rule
 *  exists; not destructured below, so no unused-variable lint noise either. */
export interface IntervalSegmentsProps {
  total: number;
  current: number;
  kinds: ("work" | "rest" | "wu")[];
}

export default function IntervalSegments({
  total,
  current,
}: IntervalSegmentsProps) {
  return (
    <div className="timer-dots">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            i < current
              ? "timer-dot timer-dot-past"
              : i === current
                ? "timer-dot timer-dot-current"
                : "timer-dot timer-dot-future"
          }
        />
      ))}
    </div>
  );
}
