import { Link } from "react-router-dom";

/** Phase BL PR C — the three-door onboarding card (canvas Main,
 *  docs/design/baseline-onboarding/), replacing the single-offer
 *  BaselineCard in Today's no-baseline slot. Renders whenever the
 *  baseline PAIR is incomplete (the caller's existing `baselines ===
 *  null` gate — a superset of the old card's states, deliberately: a
 *  partial pair re-enters through the same three doors). Outcome-framed
 *  (James's ruling): recommend it, enter it, or row it.
 *
 *  Navigation plus one write: the three doors start nothing, and the skip
 *  line below them stores "go on without a baseline" (Phase RW PR C). Each
 *  door's screen owns its own flow (Recommend / KnowBaseline /
 *  RowToFind under /onboarding). Door 3's sub-copy carries James's
 *  2026-08-23 ruling: the 6k is "strong and steady" (with the
 *  not-breakneck reminder living on the RowPath card's own chip),
 *  replacing the canvas's earlier "relaxed" framing — the committed
 *  canvas is updated in the same commit, so this IS the design. */
const DOORS: readonly { to: string; title: string; sub: string }[] = [
  {
    to: "/onboarding/recommend",
    title: "Recommend my baseline",
    sub: "Answer a few quick questions. Works whether you are brand new or coming back.",
  },
  {
    to: "/onboarding/know",
    title: "I know my baseline",
    sub: "Enter your 2k and 6k splits directly.",
  },
  {
    to: "/onboarding/row",
    title: "Row to find my baseline",
    sub: "A strong, steady 6k, or race a 2k. Your time sets it.",
  },
];

export default function DoorsCard({ onSkip }: { onSkip: () => void }) {
  return (
    <section className="doorscard">
      <span className="doorscard-label mono-status">SET UP YOUR BASELINE</span>
      <h2 className="doorscard-title">How do you want to start?</h2>
      <p className="doorscard-body">
        Every workout's targets come from your 2k and 6k baseline splits. Both
        set means a recommendation here and a pace target on every workout. Pick
        whichever door suits you. You can change the numbers any time.
      </p>
      <div className="doorscard-doors">
        {DOORS.map((door) => (
          <Link
            key={door.to}
            to={door.to}
            state={{ from: "/today" }}
            className="doorscard-door"
          >
            <span className="doorscard-door-title">{door.title}</span>
            <span className="doorscard-door-sub">{door.sub}</span>
          </Link>
        ))}
      </div>
      {/* Phase RW PR C (spec §3.3): the fourth, quieter line. A button, not
          a door, because it WRITES; the doors above are plain navigation. */}
      <button type="button" className="doorscard-skip" onClick={onSkip}>
        Row without one for now
      </button>
    </section>
  );
}
