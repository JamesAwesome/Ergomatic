# Walk 2026-08-25 — the two new oracles, the terminate screen, the pocketed phone

Three owed Phase RC walk items in one session, ~4 minutes of rowing. Laptop
walk-lab on `main` at `c219ee0` for pieces 1 and 2 (the RC-9 verdicts merged in
#196 are POST-tag: they do not exist on the phone's v0.23.0/build 749, which is
why those legs could not be walked on the phone). Piece 3 is the phone, because
that item IS about the phone.

## Provenance

| Piece | Workout | Close | Wire recording | Diagnostics ring | Photos |
| --- | --- | --- | --- | --- | --- |
| 1 | Walk Rests (`w 1' r1 / w 500m r1 / w 1'`) | natural finish | `rests-finished-recording.jsonl.gz` (2450 lines) | `rests-finished-ring.json` | — |
| 2 | Walk Smoke (`w 1'`), Menu-killed at ~31 s | terminated | `smoke-terminated-recording.jsonl.gz` (299 lines) | `smoke-terminated-ring.json` | `pm5-terminate-view-detail.jpg` |
| 3 | "Beam Sea" (2000 m), phone locked and pocketed | ended by rower, nothing measured | none (link lost) | none (no console on iOS) | `phone-lost-live.png`, `phone-lost-end-form.png`, `phone-lost-saved-row.png`, `phone-lost-today-row.jpg` |

Recordings are the raw wire (`RECORDING · DOWNLOAD` on the log screen, never a
console `download()`). Rings are `ergomatic:last-rowed-log` verbatim.

No heart-rate belt was asked for or worn for any piece. See finding W-7 — the
wire carried a heart rate anyway, which is itself the finding.

## Photo transcriptions

### SCREEN — `pm5-terminate-view-detail.jpg` (PM5 Memory → List by Date → View Detail, piece 2)

Verbatim, as printed by the monitor:

```
View Detail
131
Aug 25 2026
      time  meter  /500m  s/m   [♥]
    :31.5    110  2:23.1   23   111
    :31.5    110  2:23.1   23   111
```

Two identical rows: the workout summary and its single split. Nothing on this
screen is derived here; every comparison against it lives in the findings below.

### SCREEN — piece 3, phone (four frames, in the order they were seen)

1. `phone-lost-live.png` — the connected screen on unlock. Header
   `□ PM5 432331249 Row · LOST`. Banner: **LOST THE MONITOR / "Row on. The erg
   is still counting and End keeps what we saw."** Progress `0m`. LAST `0:00.0`
   over `2:06.0 2K +6`; LAST `0` over `24 SPM`; UP NEXT `FINISH`; EST LEFT `8:24`.
2. `phone-lost-end-form.png` — after tapping END. INTERVALS shows the single row
   `1 · 2000m · 2:06.0 · 2k +6 · —` under **`TARGETS ONLY · NOTHING MEASURED`**.
   Three exits offered: `Log against plan · SESSION 12 OF 84`,
   `Save without logging`, `DISCARD WITHOUT SAVING`.
3. `phone-lost-saved-row.png` — the saved record: `Beam Sea / AUG 25 ·
   **LOGGED BY HAND**`, again `TARGETS ONLY · NOTHING MEASURED`.
4. `phone-lost-today-row.jpg` — Today → ALL SESSIONS lists `TR Beam Sea AUG 25`
   with no held/under/over and no pain, unlike the rows beneath it.

## Findings

Wire arithmetic below was computed from the recordings, not by eye. Field names
for previously-unnamed offsets are tagged INFERENCE unless a screen or an
independent formula confirms the VALUE.

### W-1 · The rest-distance oracle fired and agreed — first time on a real rest

Piece 1, `rest-distance-verdict`: `machine(0x003A)=274m ours=274m delta=0m —
agree (band 1m)`. This is the oracle RC-9d shipped in #196 and it had never run
against a rest-bearing piece before. PRIMARY.

### W-2 · The avg-pace oracle produced NO line at all on the natural finish

Piece 1's ring contains no `avg-pace-verdict` entry of any kind — not a verdict,
not a suppression. Piece 2's ring contains one (`suppressed — this run's own
final interval (index 0) was never recorded`), so the function and its logging
both work.

Every branch of `recordAvgPaceVerdict` (`driver.ts:3301`) calls `log.record`
before it returns; there is no silent path. Silence therefore means the function
was never reached on the `finished` path. Its two `finished`-path call sites are
the `armSummaryReconcile` deadline (`driver.ts:3641`) and the drain in
`reconcile()` (`driver.ts:3698`); piece 1's `summary-reconciled` at seq 71 proves
`reconcileSummary` itself DID run, and the verdict call is the next statement
inside that same block. The mechanism is NOT yet established — do not write one
down. Both the recording and the ring are committed here, so this is replayable.

**This is a live gap in an oracle that shipped one PR ago, on the exact shape it
exists to check.** Queued as RC-14.

### W-3 · 0x0039's stroke rate reads exactly DOUBLE on a terminate

| | 0x0039 byte 10 | 0x0038 byte 3 | PM5 View Detail `s/m` |
| --- | --- | --- | --- |
| Piece 2 (terminated) | **46** | 23 | **23** |
| Piece 1 (finished) | 24 | 24 / 23 | not photographed |

The screen and the per-split half agree with each other and disagree with the
summary by a factor of exactly 2. The previously committed terminate capture
shows the identical shape (44 against 0x0038's 22). Two terminate captures, both
exactly 2×; the natural finish is clean.

**Operational rule: never display 0x0039's average stroke rate on a terminated
piece.** 0x0038's per-split value is the one the machine's own memory prints.
Cause unknown and NOT inferred here.

### W-4 · The terminate path's first screen oracle — and it passes

Everything on the View Detail screen except the stroke rate is digit-identical to
the wire:

| Quantity | PM5 screen | 0x0039 | our accumulator |
| --- | --- | --- | --- |
| time | `:31.5` | 31.5 s | 30.81 s |
| distance | `110` | 110 m | 108.6 m |
| /500m | `2:23.1` | 143.1 s | — |

The 0x0039 observations the terminate path stores are exactly what the monitor
remembers. Our own accumulator is short by 1.4 m / 0.7 s, because its register
closes at the terminal frame and the machine takes one more sample — expected,
and the reason the observations are stored at all.

### W-5 · 0x0039 is cumulative AND rest-exclusive — §23 items 2 and 4 both settle

Piece 1's 0x0039 reads 254.8 s / 935 m. The three splits' own time and distance
fields sum to exactly 254.8 s / 935 m (ivl1 60.0 s/218 m implied, ivl2 134.8
s/500 m, ivl3 60.0 s/217 m). The program carried 120 s of rest and 0x0039
excludes all of it.

Per the decision rule the ring itself carries: equal to the recorded total ⇒
cumulative and rest-exclusive, **both premises hold**. This is the first capture
that could settle it — every previous 0x0039 came from a zero-rest piece.

### W-6 · The machine's own numbers close the work + rest = TWD identity

935 m (0x0039 work) + 274 m (0x003A rest) = 1209 m = the Total Work Distance the
0x0031 stream reported at the finish. Three independent fields of the machine's
own, in one capture, confirming the fact CLAUDE.md's recurring-failure #11 was
written about but had never witnessed end-to-end. PRIMARY.

### W-7 · Newly identified 0x0038 / 0x003A fields

- **Average watts** — `0x0038[14..15]` and `0x003A[10..11]`. Confirmed against
  Concept2's published power formula `P = 2.80 / pace³` (pace in s/m), computed
  from each frame's OWN pace field, four times: 143 vs 142.9, 132 vs 132.6, 119
  vs 119.4 (0x0038), and 139 vs 138.5 (0x003A). Agreement to <1 W on all four.
  This is an independent formula, not a mirror of anything we compute.
- **`0x0038[4]`** — 111 on piece 2, which is exactly the value the PM5's View
  Detail prints in its rightmost column. 117 and 120 on piece 1's later splits.
  The values track effort and the screen confirms the smoke one. Almost certainly
  heart rate (INFERENCE on the NAME; the VALUE is screen-confirmed), which would
  mean James's belt IS delivering — a thing this repo had never witnessed. Note
  0x0039's heart-rate bytes read 0 in the same burst, so the two disagree.
- **`0x003A[7]`** = split/interval count (3 and 1, both correct). `0x003A[8..9]`
  = calories. Both INFERENCE, both consistent across the two captures.

### W-8 · 0x0037's first two fields are workout-cumulative, not the interval's own

`0x0037[0..2]`/`[3..5]` are the workout's running elapsed/distance and are
**already reset to ~0** when a distance interval's boundary fires (piece 1's
interval 2 reports 0.04 s / 0.2 m for an interval that was really 134.8 s /
500 m). The interval's own numbers live in `[6..8]` (0.1 s) and `[9..11]` (1 m).
The driver already reads the right pair — this is written down so nobody
"fixes" it toward the wrong one.

### W-9 · 0x003A's Interval Rest Time is the LAST interval's — SETTLED, no experiment needed

0x003A read `Interval Rest Time = 0` again, on a piece carrying two real
programmed 60 s rests — the third capture in a row to read 0, and the first that
could not be explained by "we never gave it rest to report".

The same recording answers it. Every 0x0037 in the capture carries the
interval's OWN rest time and rest distance:

| split | own time | own dist | rest time | rest dist |
| --- | --- | --- | --- | --- |
| 1 | 60.0 s | 218 m | **60 s** | 130 m |
| 2 | 134.8 s | 500 m | **60 s** | 144 m |
| 3 | 60.0 s | 217 m | **0 s** | 0 m |

130 + 144 = **274 m**, which is 0x003A's Total Rest Distance to the metre, and
60 + 134.8 + 60 = 254.8 s / 218 + 500 + 217 = 935 m, which is 0x0039's totals
exactly. Every number closes.

So the field is not dead and does not mean "total rest": **0x003A's Interval
Rest Time is the FINAL interval's rest time**, and it reads 0 in all three of
our captures because all three end on a work interval, which by construction has
no trailing rest. Interval 3's own 0x0037 reports the same 0 in the same burst.

Per-interval rest lives in `0x0037[12..13]` (1 s) and `0x0037[14..15]` (1 m), and
reads the programmed 60 s correctly. This also independently corroborates §26's
`splitIntervalTimeSeconds` finding from the other direction.

The planned RC-15 experiment (a program ending in a rest) is no longer needed to
answer the question; it would only confirm it. Downgraded accordingly.

### W-10 · The pocketed phone loses the workout, and then mislabels what it saves

James's tester report reproduced first try: `0m` measured after ~30 s of real
rowing, then a row saved looking hand-typed.

**CORRECTED 2026-08-25 (antagonist anchor pass on the Phase LM spec) — the
paragraph that stood here was wrong about what happened.** It said the link was
dropped and a recording was lost. There was no recording. The app opens a record
only on the first pull it SEES (`createMonitorRun`, one call site at
`useMonitorSession.ts:1681`, inside the `phase === "ready"` gate), so locking
before that pull leaves the phase in `ready`, creates nothing, and gives End
nothing to close. The saved row then comes out of the MANUAL door, which posts
no `deviceName` and no `endedBy` — hence `LOGGED BY HAND`.

**And the cause of the zero is NOT settled by this walk**, contrary to what this
section originally claimed. Two producers have the identical symptom: frames
never arriving (WebKit suspending the WebContent process), or frames arriving
and the ready gate refusing them (it needs `rowingActive` AND increasing
distance, and a rower who stops before unlocking supplies neither).
`pm5-interface-notes.md:4663` records a 15-20 s lock NOT dropping the link, with
the session resuming ticking on unlock — so the platform explanation does not
even predict this uniquely. Phase LM PR 1 instruments it.

The row is not missing from history. It is saved as a **targets-only, hand-logged**
record, which is why a tester concludes the recording vanished. Three defects
stack:

1. `· LOST` in the header is small mono text and easy to miss — James, on being
   shown the frame: *"the LOST isn't easy to notice, i think we need to highlight
   that more."*
2. The banner says **"End keeps what we saw"** when what we saw was nothing. The
   copy is optimistic in exactly the case where it must not be.
3. The saved row reads **LOGGED BY HAND**. The rower did not hand-log it; they
   rowed it and we failed to hear it. The label misdescribes provenance.

Scoped by James to a full design pass covering all three, plus research into
whether a wake lock or a background mode can hold the link while the screen is
locked — iOS owns that and we have never checked it. TRIAD weight, because (3)
changes what a stored row claims about itself.

## Follow-ups raised here

| Id | Item |
| --- | --- |
| RC-14 | W-2: the avg-pace oracle never fires on a natural finish. Replay `rests-finished-recording.jsonl.gz`. |
| RC-15 | W-9: program a workout ENDING in a rest, to settle 0x003A Interval Rest Time. |
| RC-16 | W-3: suppress 0x0039 average stroke rate on terminated pieces. |
| Phase LM | W-10: the lost-monitor design pass (prominence, honest copy, provenance label, wake lock research). |

## Budget

Planned ~4 minutes across 3 pieces; actual 4:15 of work (254.8 s measured +
31.5 s + ~30 s unmeasured). No piece was extended and no re-row was asked for.
Stack torn down (`walk-lab.sh down`, project `ergomatic-51202`).
