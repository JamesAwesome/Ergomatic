> **Archived 2026-08-28** from `ROADMAP.md` (lines 6377-6421 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase PW — The post-workout summary

**Status:** OPENED 2026-08-17 (absorbs Phase LG's precondition). Design
handoff committed at `docs/design/handoffs/2026-08-12-post-workout/`
(README + PROVENANCE with James's four brainstorm rulings and five
corrections — the 2026-08-12 handoff predates the CR2 walks and is
overruled where they falsified it). Spec 1 at
`docs/superpowers/specs/2026-08-17-post-workout-summary-design.md`,
phase-open gates run (PM GO-WITH-CONDITIONS + antagonist anchor, both
folded in; the anchor's vetted ground is the spec's §7).
**Goal:** the post-row flow tells the rower what they did before asking
how it felt — avg-split/time/distance heroes, per-interval deviation
bars, an optional reflection (thumbs feeds future generation), and save
choices; restores an erg-checkable session distance.
**Decomposition (James):** spec 1 = the summary replacing
SessionComplete + all log doors, from data already recorded (plus the
one wire addition: 0x0037's Interval Rest Distance, so DISTANCE matches
the machine); spec 2 = from-the-log (history surface + the API's first
UPDATE — may split); spec 3 = traces + HR, GATED on series-capture
research (sampling rate, storage budget).
**Standing rulings:** UNDER = FASTER than target; reflection optional
(nothing blocks saving); the null-tolerant READ ships and tags
(v0.10.1) BEFORE the nullable writer merges; TIME on monitor doors is
measured (work + completed rests), never wall-clock — the notes PR says
times read lower; `MONITOR_SPM_MIN` is its own triad PR, not spec 1's.
**Exit:** spec 1's §6 criteria; spec 2 and 3 add theirs at their own
opens; the v0.11.0 tag follows spec 1's notes PR per the release
process.

**Spec 2 "from-the-log" (James's 2026-08-18 brainstorm; design spec
`docs/superpowers/specs/2026-08-18-from-the-log-design.md`):** OPENED
2026-08-18 as a six-task decomposition — migration 0010 + the API's
first UPDATE; the API's round trip + posting; the from-the-log view's
own pure model; the history list + Today's link into it; the detail
view's read-back/edit/back-label; Plan's done-row links + the §4
navigation-flow sweep + reconciliation. Tasks 1-5 landed on branch
`pw-log`; **Task 6 (this branch's final task) completes the
decomposition** — Plan's tap-through, the §4 N1-N7 sweep gathered into
one describe (spec §7 criterion 1's own requirement), the remaining §5
design witnesses, and criterion 4's own e2e (advance a plan by saving,
the done row opens the log that advanced it, Reset leaves that log's own
footer unchanged). §7's nine exit criteria are evidenced in the task-6
report; branch PENDING James's review before merge and the v0.12.0 tag
(§7 criterion 7 names that version for the notes PR).
