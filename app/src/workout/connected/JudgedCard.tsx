// One judged actual in a card (handoff §3's "Actual vs target" table). The
// ONLY thing this component decides is where the classes go — the verdict
// itself arrives already decided, from `surfaceModel.ts`'s single
// `judgedValue` path, so a pane can never form its own opinion about a
// number.
//
// Class contract, all of it Task 3's own vocabulary so the connected panes
// and the phone timer share one card language:
//  - `.timer-card` / `-label` / `-caption`: the shipped card geometry.
//  - `.timer-card-actual-{judgement}`: the tint hook Task 3 left for this
//    task. `-under` -> `--type-o2` teal, `-over` -> `--type-at` ochre,
//    `-within` -> plain ink, `-stale` -> `--ink-3` (task-3 review's own
//    measured AA table: 6.65:1 / 5.54:1 / 7.44:1 against `--surface`).
//  - `.connected-card-stale`: the card's fill moves to `--surface-sunken`
//    while the link is down (handoff §4: "Every stale value greys to
//    `--ink-3` and its card moves to the sunken fill").
//  - `.connected-card-absent`: the DASHED border — the app's established
//    "nothing here yet" idiom, and the HR card's alone (`absentIdiom:
//    "dashed"`). It means "no such thing is connected", which is why it
//    must NOT be what a paused NOW card wears: the pace reading exists, the
//    rower has simply stopped pulling. That card takes
//    `.connected-card-idle` instead — the sunken fill the handoff's own
//    paused frame draws it with.

import type { JudgedValue } from "./surfaceModel";

/** What a card looks like when it has no reading. `"dashed"` is the HR
 *  card's "nothing is connected"; `"idle"` is "the thing is connected and
 *  simply has nothing to say right now" (a paused erg's pace). */
export type AbsentIdiom = "dashed" | "idle";

export default function JudgedCard({
  label,
  value,
  caption,
  stale,
  absentIdiom = "idle",
}: {
  label: string;
  value: JudgedValue;
  caption: string;
  stale: boolean;
  absentIdiom?: AbsentIdiom;
}) {
  const classes = ["timer-card"];
  if (stale) classes.push("connected-card-stale");
  if (value.absent) {
    classes.push(
      absentIdiom === "dashed"
        ? "connected-card-absent"
        : "connected-card-idle",
    );
  }
  return (
    <div className={classes.join(" ")}>
      <span className="timer-card-label">{label}</span>
      <span
        className={`timer-card-value timer-card-actual-${value.judgement}${
          value.absent ? " connected-value-absent" : ""
        }`}
      >
        {value.display}
      </span>
      <span className="timer-card-caption">{caption}</span>
    </div>
  );
}
