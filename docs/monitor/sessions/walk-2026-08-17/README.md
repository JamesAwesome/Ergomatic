# Walk 2026-08-17 — Phase CR2 exit, wire pass (Pass A)

Rowed against `cr2-redesign` at PR #109's final head (merged same day as
`3dc3b06`); runsheet: `../walk-phase-cr2-exit/RUNSHEET.md`. Chrome + Web
Bluetooth, recording tap foregrounded. Photos live in James's
`~/Desktop/walk-spec3` (HEIC, not committed); the armed-frame screenshot
and PM5 memory-screen readings are transcribed below. Diagnostics rings
are committed beside the recordings (`*-ring.json`, pasted from the live
sheet during the walk).

| Session | Program | File | Verdict |
| --- | --- | --- | --- |
| 0 dry run | none (chooser cancel) | `step-1-*.jsonl` | PASS — `pm5-recording/v1` header + 1 disconnect event, gzip arm proven |
| 1 keystone | 2×250m r0, no wu | `step-2-*.jsonl` + `step-2-ring.json` | PASS — `final-totals` accumulator 499.8 vs machine 500 (0.2m ≤ 1.5m); READY frame confirmed on screen (2D); tap-neutral: 391× 0x0031 at 1.97/s, modal 0.54s, max 0.72s; PM5 memory interval 2 = 1:14.7 matches wire 74.71s exactly; no 0x0039 (5th natural finish without one) |
| 2 rest-bearing | wu 1:00 r0 + 1:00 r30 + 2:00 r30 + 500m r30 + 1:00 (compressed: reloaded mid-500m for F6) | `step-3-*.jsonl` (downloaded AT rest 2, before boundary 3) + `step-3-ring.json` (stashed at teardown, carries all 3 boundaries) | PASS with finding F-1 — **the #104 clamp FIRED TWICE live and keyed correctly** (`resting key 0 lifted to 1`, `resting key 1 lifted to 2`); registers per-piece honest; teardown `final-totals` accumulator 823 vs machineTotal 808 mid-piece (TWD lag at snapshot, see F-2) |
| 4 (F6) | same session, reload mid-500m | (same files) | Row appeared, Log it landed — **F-1: header read `AUG 17 · 6 MIN` where the wire computes 5** (below) |
| 3 (END) | 2×250m keystone, END ~44s in | `step-4-*.jsonl` + `step-4-ring.json` | PASS — `final-totals` written at END (register 0: 43.7s/151.8m held); machineTotal=0 is the PM5's own distance-goal display behavior mid-piece-one; healthy-arm `structure-mismatch` self-resolved as documented |

Also banked: James's iOS-device screenshot (landscape) — real-notch
clearance for the redesigned header confirmed on hardware; three polish
flags filed from it (ROADMAP CR2 close-out items 5-7).

## F-1: the 6-MIN reading, UNREPRODUCED after a full bisect

The F6 log header showed `AUG 17 · 6 MIN`. The wire's completed intervals
compute 300s → 5 MIN: work 60+60+120 (0x0037 split times, bytes 6-8/10 —
`parse.ts` maps exactly this field to `IntervalActual.elapsedSeconds`) +
completed rests 0+30+30 (wire-programmed, `04 02 00 1e` frames). Bisect,
each step against the REAL shipped code at `3dc3b06`:

1. `interruptedTotalSeconds` fed the wire-derived record → **300** (5 MIN).
2. The all-rests misread (Σ over ALL intervals = 330 → round(5.5) = 6,
   which would have explained it exactly) → falsified by reading the
   shipped source: per-completed-actual, correct. NOTE: Task 1's own
   fixture could not have caught that variant — its uncompleted interval
   carried `restSeconds: 0`, making both readings agree (the spec-blind
   fixture shape; the close-out adds the discriminating case).
3. jsdom end-to-end repro (real hook + fake transport scripted to this
   session's shape, unmount mid-third-interval) → 3 actuals before AND
   after teardown, 300s, 5 MIN. The teardown writes no fourth actual.
4. `monitorLogTotals`' interrupted branch → `Math.round(300/60)` = 5.

The record that displayed 6 was destroyed by the step-4 reconnect (the
Connect door's documented discard), so no surviving artifact
discriminates the remaining theories (a fourth actual written by
something only the real browser does at reload; or an input difference
the ring cannot show). Disposition: **instrument and re-observe** —
the close-out adds a record dump step to the walk sheet's F6 row
(`localStorage.getItem("ergomatic.monitorRun")` BEFORE pressing Log it)
and the discriminating unit fixture; the re-observation rides the phone
pass or the next erg visit. A second 6-where-5-computed reading with the
record in hand becomes a full triad defect cycle.

## F-2: teardown-instant `final-totals` gap (823 vs 808)

Mid-piece teardown snapshot only. Register 3 held 37.1s/15.7m (rest coast
+ two strokes of the 500m piece); the machine's TWD read 808 at the last
sample before teardown. The 15m gap ≈ register 3's 15.7m — consistent
with TWD's known oscillation/lag on distance-goal pieces rather than a
register error (each register reads as its piece's own honest distance).
Not gated (the ≤1.5m criterion applies to settled terminals); recorded
for the pattern file.
