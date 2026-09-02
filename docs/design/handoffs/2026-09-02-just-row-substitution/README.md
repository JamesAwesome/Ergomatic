# Handoff: a Just Row stands in for a plan session

**Origin:** Gate 0 for Phase JR follow-on item 5 (James, 2026-09-01:
"advances the record, records the stand-in"; 2026-09-02: checkpoint days
included). **Status: GATE 0 PASSED — James, 2026-09-02, on rev 1d ("design approved").
Board final; chips centred on both axes, the checkpoint mark cased as shipped.**

## Boards, and where each label comes from

| Board | Source | What changes |
| --- | --- | --- |
| `Main.dc.html` — the Just Row log door with a plan | `post-workout-summary.png` + `PostWorkoutSummary.tsx:592-640` | The shipped pair replaces "Save this row": `Log against plan · SESSION n OF N` (`.summary-save-lead`) then `Save without logging` (`.summary-save-secondary`). Same for the connected entry. |
| `LogDoorNoPlan.dc.html` | the same component's no-plan rule | `Log against plan` hidden outright; `Save without logging` leads alone. |
| `PlanRow.dc.html` — the Plan tab | `plan-linked.png` (row 4 is the shipped swap) + `plan-badge-unknown.png` | Row 5: JR chip CENTRED in the badge slot at TypeBadge's width (James: "still center the chips"), name `Just Row`, mark `INSTEAD OF AT`. Row 7: `INSTEAD OF 2K Test` (checkpoint: the prescription title in its own case, as the shipped mark prints it — `Plan.test.tsx:539`). |

**One thing changes beyond the two new rows** (second antagonist pass,
2026-09-02, after the board was approved — stated here because the
approval attaches to this README): the vertical centring James asked for
moves EVERY swapped row's badge, `TypeBadge` included. Today
`.plan-row-swapped` centres the badge within the name line; after this it
centres against name + mark (`grid-row: 1 / -1` on the slot). Row 4
(Slack Tide, O2) on the board shows the new position. Today's SESSION n
OF N advances as it does for any logged session; History and the detail
gain nothing new beyond what a linked row already shows.

## Contrast (computed, AA floor 4.5:1)

on-color on accent (lead) 5.94 · ink on surface (secondary) 17.11 · ink-3
on page (mark, JR chip) 6.69 · ink on page 15.41. Buttons 54 / 48 px.
