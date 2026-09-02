# Handoff: a Just Row stands in for a plan session

**Origin:** Gate 0 for Phase JR follow-on item 5 (James, 2026-09-01:
"advances the record, records the stand-in"; 2026-09-02: checkpoint days
included). **Status: REV 1d PRESENTED 2026-09-02 (chips centred both axes per James; `2K Test` cased as shipped per the antagonist), awaiting approval.**

## Boards, and where each label comes from

| Board | Source | What changes |
| --- | --- | --- |
| `Main.dc.html` — the Just Row log door with a plan | `post-workout-summary.png` + `PostWorkoutSummary.tsx:592-640` | The shipped pair replaces "Save this row": `Log against plan · SESSION n OF N` (`.summary-save-lead`) then `Save without logging` (`.summary-save-secondary`). Same for the connected entry. |
| `LogDoorNoPlan.dc.html` | the same component's no-plan rule | `Log against plan` hidden outright; `Save without logging` leads alone. |
| `PlanRow.dc.html` — the Plan tab | `plan-linked.png` (row 4 is the shipped swap) + `plan-badge-unknown.png` | Row 5: JR chip CENTRED in the badge slot at TypeBadge's width (James: "still center the chips"), name `Just Row`, mark `INSTEAD OF AT`. Row 7: `INSTEAD OF 2K Test` (checkpoint: the prescription title in its own case, as the shipped mark prints it — `Plan.test.tsx:539`). |

Nothing else changes: Today's SESSION n OF N advances as it does for any
logged session; History and the detail are unchanged.

## Contrast (computed, AA floor 4.5:1)

on-color on accent (lead) 5.94 · ink on surface (secondary) 17.11 · ink-3
on page (mark, JR chip) 6.69 · ink on page 15.41. Buttons 54 / 48 px.
