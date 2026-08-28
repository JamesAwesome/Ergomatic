> **Archived 2026-08-28** from `ROADMAP.md` (lines 185-200 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 5D — Builder simplification from device feedback

**Status:** Done (2026-07-30, PR #26)
**Goal:** Make the row authorable with a thumb, on a phone, without instructions.

- [x] Repeat is implicit — every step but the warm-up repeats, set once at the bottom; the per-row `SET` cell (a bare ↻ nobody could identify) is gone
- [x] Explicit clone button per row: how you build `5×1′`
- [x] Duration takes a number plus a MIN/M unit toggle; rest gained the same treatment and stays minutes-only (rest carries no pace, so metres could never convert to time)
- [x] SPM stays optional, with 44px steppers either side that wake at 20 from empty
- [x] Selected states read as filled, not outlined — the red outline was easy to miss and caused frustration taps
- [x] Warm-up comes from preferences and is never authored into a workout; a `BOOKEND_ROW_KINDS` seam is left for cooldowns
- [x] `hasMidSpanReps` refuses to open workouts whose stored repeat marker the row model cannot place, rather than silently relocating it (a `[w 10', reps 3, w 2']` workout re-saved as 36 min instead of 16)
- [x] Column header strip removed once the row went multi-line; per-field affixes label the controls instead

**Exit:** MET.
