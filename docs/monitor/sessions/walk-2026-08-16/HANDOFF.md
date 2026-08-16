# Handoff: walk 2026-08-16 recordings → the recorder (Stage B) session

> **ASSIGNMENT DISCHARGED (2026-08-16, PR #104 + the rest-keying spec).**
> The register misattribution is diagnosed and fixed, and both recordings
> are now permanent CI tests (`app/src/monitor/registerReplay.test.ts`).
> **The leads below are part of the historical record and the primary one
> is FALSIFIED**: the defect was not work-frame attribution downstream of
> the wu boundary — it was REST-frame attribution at every work→rest
> boundary whose burst missed the transitional ws=8 tick (0x0031 arrives
> before 0x0033 in 983/983 measured bursts; the first resting tick can
> carry the old count, keying the finished interval one register low, and
> max-merge kept the poison). "Rest-coast attribution appears CORRECT
> throughout" was the exact inverse of the mechanism. The wu was causally
> irrelevant. See `docs/superpowers/specs/2026-08-16-rest-keying-fix-design.md`.
> Still open from this file: the untranscribed photos (§ transcriptions),
> the MaxListenersExceeded observation (filed: Node-side, likely Vite's
> proxy — not the tap), and the header-without-program discrepancy (filed
> in session memory as recording-header-program-gap).

Two full wire recordings (pm5-recording/v1, gunzipped JSONL, committed
beside this file), captured per RUNSHEET.md over Chrome/Web Bluetooth with
the recording tab foregrounded. Photos live in James's ~/Desktop/walk-1 and
walk-2 (too large to commit; transcriptions below, labeled by evidence
stream). Diagnostics rings for both sessions are in the PR #102 thread.

## What Stage B gets

1. **`session-1-keystone-2x250r0.jsonl` — exit criterion 1's committed
   fixture.** 2×250 m r0, no warm-up. Ring `final-totals`:
   accumulator=499.8m/137.9s, machineTotal=500m, registers
   0:(65.3s,249.8m) 1:(72.5s,250m). Replay through the real driver must
   reproduce accumulator-vs-TWD to this tolerance, zero divergences.
2. **The download dry run PASSED** (gzip arm proven: a chooser-cancel
   session parsed with header + 1 event through the real `parseRecording`).
3. **Tap-neutrality (exit criterion 2), measured:** session 1: 287× 0x0031
   at 1.97/s, modal 0.50 s, max 0.72 s. Session 2: 983× at 1.97/s, modal
   0.50 s, max 0.81 s. Committed baseline ~2.2/s modal 0.50 s — modal
   identical, rate slightly low, no outliers. Screen-vs-app agreement with
   the tap running: PM5 349 vs phone 348 (same frame, session 2 rest 1).
4. **Zero 0x0039 in BOTH recordings** across two natural finishes — the
   machine sent no end-of-workout summary before disconnect either time.
   `split-won` handled both. That is now a four-occurrence PATTERN, not a
   race; summary-dependent paths should treat 0x0039 as a bonus, never an
   expectation.

## THE ASSIGNMENT: diagnose the register misattribution (session 2)

**Symptom:** `final-totals` accumulator=1819.7m vs machineTotal=1599m
(+221). Registers: 0:(29.3s,98.7m) wu OK · 1:(120.2s,461.4m) = the 2:00
piece's data · 2:(129.2s,501.6m) = the 500m piece's data ·
3:(133.1s,512.8m) = the 500m piece AGAIN (its rest coast) ·
4:(60s,245.2m) OK. Middle intervals' WORK attributed one key low;
interval 1's honest data (60.02s/229.5m, ring seq 33) absorbed; the 500 m
piece counted twice.

**Onset bracketed by photos:** honest at rest 1 (PM5 `349 m total` vs
phone `TOTAL M 348`, same frame); wrong by rest 3 (phone `TOTAL M 1575`
vs wire TWD ~1343-1351 in that window).

**Program shape (never tested anywhere):** warm-up 100 m with r0 leading a
5-interval mixed program: wu(100m, r0) + 1:00 r30 + 2:00 r30 + 500m r30 +
1:00. Compiled 5 intervals (ring seq 21).

**The recording holds every byte.** 0x0033 count transitions (arrival
order): 3→0 @15.6s (arm), 0→1 @52.3, 1→2 @112.2, 2→3 @262.7, 3→4 @421.8,
4→5 @514.3. 0x0031 elapsed-resets: wu→1:00 @52.6 (29.25→0), 1:00→2:00
@143.2 (69.63→0.31), 2:00→500m @293.0 (127.47→0), 500m→1:00 @452.2
(133.08→0). Plus TWO mid-rest elapsed re-bases (never before captured):
@137.1 (69.96→63.99, distance 249.6 standing, state 3) and @285.4
(123.42→120.27, distance 469.6 standing, state 3) — max-merge is immune;
the deleted fold would have double-banked at both.

**Leads, in order:**

- The count flipped 0→1 AT the wu→work w→w boundary (@52.3-52.6),
  **contradicting §19.8's no-rest finding** (0x0033 read IDENTITY through
  a w→w boundary there). If 0x0033's w→w behaviour differs when the
  leading interval is a DISTANCE warm-up — or was never identity at all —
  then `toProgramIndex`'s identity-for-rowing assumption mis-keys every
  later work interval by one, which is exactly the observed one-key-low
  pattern. Note the count then STAYS one ahead through each work interval
  (e.g. count 2 during the 2:00 piece whose program index is 2 — which
  should key correctly; reconcile this against the observed key 1 before
  trusting any single-lead story).
- Replay the interleaved 0x0031/0x0033 stream through the REAL
  `toProgramIndex` + the REAL write rule (no hand-mimics — the tautology
  trap is in the antagonist ledger) and print the per-key attribution
  timeline; diff it against the ring's final registers.
- Confirm the defect reproduces with MAIN's code: the write path and
  `intervalIndex.ts` are byte-identical between main and PR #102 (verified
  by diff), so it should — establishing pre-existing, not a #102
  regression.
- The rest-coast attribution (resting → count−1) appears CORRECT throughout
  (key 3's 512.8 = the 500m piece's coast via resting count 4). The defect
  is specifically WORK-frame attribution downstream of the wu boundary.

**Also observed, minor:** Chrome console showed MaxListenersExceeded
("11 close listeners added") during the session — check whether the
recording tap adds per-session listeners without removing them.

## Photo transcriptions (SCREEN evidence; wire values come from recordings)

- walk-1/between-intervals: PM5 interval view at the r0 boundary —
  interval 2, 250 m to go, 0:00 elapsed.
- walk-1/end-of-row: PM5 finish — interval 2 in 1:12.5, ave 2:25.1/500m —
  matches wire 72.54 s exactly.
- walk-2/first-rest pair: PM5 rest screen `349 m total` beside phone
  `TOTAL M 348` (same frame) — totals honest at rest 1.
- walk-2/third-rest-laptop: phone `3 OF 4 · REST`, `TOTAL M 1575`,
  `METERS LEFT 0`, TOTAL LEFT visible — overcount live by rest 3.
- walk-2/second-rest pair + third-rest-pm + finish pair: not yet
  transcribed — view them (onset refinement + interval-4 state + the
  machine-side totals at rests 2/3).
