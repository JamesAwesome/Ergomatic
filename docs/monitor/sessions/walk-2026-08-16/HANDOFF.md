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
> **All follow-ups from this file are now CLOSED (2026-08-16 close-out):**
> every photo is transcribed (§ transcriptions — rest 2's pair moves the
> overcount onset a full rest earlier and lands +202 ≈ the first poison
> exactly); the MaxListenersExceeded warning came from a browser
> extension's contentscript, not our code; and the headers-without-program
> mystery was the console (§ below) — no product bug.

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
**RESOLVED (2026-08-16 close-out):** not the tap and not our code at
all — the photos show the warning's source column reads
`contentscript.js`, a BROWSER EXTENSION's content script. The tap holds
one inner subscription per characteristic (verified in review) and
nothing in the page registers `close` listeners.

## Photo transcriptions (SCREEN evidence; wire values come from recordings)

- walk-1/between-intervals: PM5 interval view at the r0 boundary —
  interval 2, 250 m to go, 0:00 elapsed.
- walk-1/end-of-row: PM5 finish — interval 2 in 1:12.5, ave 2:25.1/500m —
  matches wire 72.54 s exactly.
- walk-2/first-rest pair: PM5 rest screen `349 m total` beside phone
  `TOTAL M 348` (same frame) — totals honest at rest 1.
- walk-2/third-rest-laptop: phone `3 OF 4 · REST`, `TOTAL M 1575`,
  `METERS LEFT 0`, TOTAL LEFT visible — overcount live by rest 3.
- walk-2/second-rest pair (transcribed 2026-08-16 close-out): PM5 rest
  screen at rest 2 — `:26 r`, `Interval 3`, 461 m, ave 2:10.2/500m, rate
  26, **`828 m total`**; phone in the pair reads `2 OF 4 · REST`, NOW
  2:14.5 Rest, 26 SPM, **`TOTAL M 1030`**, HR 149, TOTAL LEFT 3:36.
  **Phone − PM5 = +202 m at rest 2 — the first poison's own +201.3 to
  within rounding.** Onset refined: the overcount was live one full rest
  earlier than the original "wrong by rest 3" read.
- walk-2/third-rest-pm (transcribed): PM5 rest screen at rest 3 — `:24 r`,
  `Interval 4`, 2:08.7 interval, ave 2:08.7/500m, rate 25, **`1354 m
  total`** — the machine-side number the wire window (TWD 1343-1351)
  predicted, now on-screen. Against the phone's already-transcribed 1575:
  +221, the full two-poison sum.
- walk-2/finish pair (transcribed): PM5 finish view shows the FINAL
  INTERVAL only — interval 5, 245 m, ave 2:02.3/500m, `projected finish
  245` — **no session total anywhere on the end screen** (re-confirming
  the protocol fact; the rest screen is the only live-total surface).
  The phone's log screen reads "ALL 4 INTERVALS MEASURED" with actuals
  2:11.0 / 2:10.1 / 2:08.7 / 2:02.4 — the per-interval ACTUALS path
  (0x0037/38) was honest throughout; only TOTAL M carried the poison.
  PM5 interval-5 245 m = register key 4's (60.0 s, 245.2 m) exactly.

## Why the committed recordings' headers carry no program (close-out)

The walk's downloads were invoked FROM THE DEVTOOLS CONSOLE —
`window.__pm5Recording__.download()` with no argument, visible twice in
the first-rest and finish photos (`Promise {pending}` results in frame).
`download(program)` takes the program as its argument; a console call
bypasses TypeScript, `program` arrived `undefined`, and
`JSON.stringify` dropped the key. **And the console was the only option
James had — the real gap was REACHABILITY, not operator deviation:** the
in-session sheet's Download button dies with the session, the finish
auto-navigates to the log screen, and that screen had no download
affordance at all. The runsheet's "download before navigating" was
impossible to follow at a natural finish. **FIXED in this PR: the
post-session log screen now carries a whisper-quiet `RECORDING ·
DOWNLOAD` row** (the monitor-log copy row's sibling, presence-gated on
the dev-only seam, absent in production builds), and `download()`'s
program is optional — a post-session download's header omits it, the
shape these captures already have. **Protocol for future walks: finish
the row, land on the log screen, tap RECORDING · DOWNLOAD.** Replay
tests are robust either way (they hand-transcribe program literals and
byte-verify them against the recorded programming frames). CI coverage note: `transports/index.test.ts`
already pins `header.program` through the REAL gated arm (a wiring
regression fails CI), and the sheet test pins the click forwarding its
prop; only the combined real-arm-plus-real-click composite rests on the
static chain, and the sheet cannot even mount after a session ends.
