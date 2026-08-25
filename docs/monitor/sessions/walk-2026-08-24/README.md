# Walk 2026-08-24 — exit 7 (the display gate) + the terminate-burst leg

Two legs, one afternoon, PM5 432331249 (firmware 459.069). Leg 1 answers
the storage-spine spec's exit criterion 7 — do the machine-confirmed
numbers the spine stores match the PM5's own memory screen, on the
production build, with no instrument? Leg 2 answers the one wire question
the combined walk left open — does a Menu-terminate emit the log-commit
burst, or is the abandoned-piece path silent?

**Leg 1 verdict: PASS, digit for digit. Leg 2 verdict: the burst fires on
terminate too — 0x0037/0x0038, 0x0039, 0x003A, 0x003F, the identical
sequence a natural finish gets.**

## Provenance

| File | Leg | What it is |
| --- | --- | --- |
| `phone-exit7-ring.json` | 1 | MONITOR LOG · COPY paste from the phone (v0.21.0, TestFlight build 738, production BLE arm) after a 2×250m r60 piece rowed to completion. The linger's second stash — no console, no instrument, nothing armed. |
| `pm5-view-detail.jpg` | 1 | SCREEN — the PM5 Memory → View Detail row for the same piece. |
| `app-log-heroes.png` | 1 | SCREEN — the app's log detail (heroes + questionnaire) for the same piece. |
| `app-log-intervals-chart.png` | 1 | SCREEN — the same log's interval rows and pace chart. |
| `lab-terminate-ring.json` | 2 | Hold-open instrument ring from the laptop lab (main @ e4afbe5, Chrome, web arm): Walk Smoke (1×60s) armed, ~24s rowed, PM5 **Menu** pressed mid-piece. Idle spans (+0s–+22s, +48s–+71s) are pattern-regular in the console paste and were reconstructed programmatically; the active window (+23s–+47s) is transcribed verbatim. |

Lab stack was per-worktree (`ergomatic-51202`), torn down the same hour.

## Leg 1 — exit 7, the walk photograph

PM5 View Detail (SCREEN), `v250m/1:00r...2`, Aug 24 2026, Total Time
4:04.0:

| Row | time | meter | /500m | s/m |
| --- | --- | --- | --- | --- |
| Totals | 2:04.0 | 500 | 2:04.0 | 26 |
| Interval 1 | 1:07.9 | 250 | 2:15.8 | 25 |
| rest 1 | r1:00 | 147 | | |
| Interval 2 | :56.1 | 250 | 1:52.2 | 28 |
| rest 2 | r1:00 | 95 | | |

App log detail (SCREEN): AVG SPLIT 2:04.0 · TIME 4:04 · DISTANCE 742.
Interval rows: 1:08 @ 2:15.8, 25 spm (+8.8 vs 2:07.0 target); 0:56 @
1:52.2, 28 spm (−14.8).

The checks the exit criterion names, all against the machine's own
screen:

| Quantity | PM5 (SCREEN) | App stored (WIRE→record) | Verdict |
| --- | --- | --- | --- |
| Work-only elapsed | 2:04.0 (= 124.0s) | `summaryTotals` elapsed 124s (ring seq 61) | MATCH |
| Work-only distance | 500 | `summaryTotals` distance 500m | MATCH |
| Final interval | :56.1 / 250 / 1:52.2 | interval 2 actual 0:56 / 250 / 1:52.2 | MATCH |
| Fused TIME hero | Total Time 4:04.0 | 4:04 | MATCH |
| DISTANCE hero | 742 TWD (500 + 147 + 95 rest) | 742 (accumulator 742.7, machineTotal 742) | MATCH |
| Work sum cross-check | 1:07.9 + :56.1 = 2:04.0 | 0x0039 elapsed 124s — cumulative AND rest-exclusive, re-confirmed on a second piece | MATCH |

`0x0039` log date/time decode (WIRE, ring seq 60 raw `88 35 03 0f …`):
date u16 `0x3588` → Aug 24 2026, time u16 `0x0F03` → 15:03 — matches the
app's 15:04 header to the minute; the wire carries no seconds
(RC-2's hard fact, re-observed).

`0x003F` (WIRE, seq 64): `06 47 99 af 54 b0 21 c0` → as two LE u32 words
`AF99-4706 C021-B054`. CORRECTION (antagonist full pass, 2026-08-24):
this README originally tagged the hash==verification-code equation
INFERENCE/unphotographed — it is PRIMARY, photographed at
walk-2026-08-23 (`photo-w4-verification-code.jpeg`: screen
`6EF3-D827 5B55-52E1` vs wire `27 d8 f3 6e | e1 52 55 5b`, exact). No
verification photo was taken THIS walk, but the equation was already
settled; only C2-logbook equivalence remains unestablished.

**The race landed on the LATE side this time** (2-of-5 shape,
terminal-first): terminal `finished` at seq 48, final 0x0037/0x0038 at
+92ms, 0x0039/0x003A/0x003F at +361ms, disconnect only after all of it.
The finish grace caught the final split, the HIGH-1 buffered path held
the summary, `split-won` recorded `summaryTotals` + `verificationBytes`
as observations, and the linger kept the link up through the whole
burst — the first production capture of the spine working end to end.

Operational note (seq 1): `storage-persist` was DENIED on the phone and
tolerated, per design spec §4 S6 — the stash still reached
sessionStorage.

## Leg 2 — Menu-terminate emits the full burst

Programmed 1×60s (Walk Smoke), rowed from +23s, **Menu pressed at ~+46s**
(elapsed 24.26s, 75.6m). The wire then delivered, in order:

1. `+46s` 0x0031 with workoutState byte `0b` (raw offset 8) — the
   terminate transition.
2. `+46s` **0x0037** for interval 1: elapsed `0x097A` = 24.26s, distance
   `0x02F4` = 75.6m — the partial interval's own final split, rest
   field 0.
3. `+46s` `hold-start` — the app's teardown began; the instrument held
   the link open (production's linger covers the same window).
4. `+47s` **0x0039**: date Aug 24 2026, time 15:14, elapsed `0x097E` =
   24.30s, distance `0x02F8` = 76.0m — work-only totals of the
   terminated piece. The byte carrying workoutType read `01` here
   (vs `08` on the completed-workout capture) — noted raw, not yet
   interpreted.
5. `+47s` **0x003A**, then **0x003F**: `76 78 e6 7e 23 e3 e4 01` → LE
   words `7EE6-7876 01E4-E323` (rendering rule PRIMARY per the
   correction above; this particular code is unphotographed).
6. `+48s` onward: the PM5 back at idle (0x0031 workoutState byte `0d`
   then the menu-idle pattern).

**Conclusion:** the terminate path is not silent — a Menu-kill is a log
commit, and it speaks the same burst as a natural finish, hash included.
The PM5 logged the 24s partial to memory the same way. RC-2/RC-3 can
therefore capture and trust `summaryTotals`/`verificationBytes` for
abandoned pieces, not only completed ones — production's terminate
handling needs the same linger/observation capture the finished path
got in #180.

Instrument artifact, so nobody re-derives it: 0x0031 and 0x003F lines
appear TWICE per notification in the lab ring — both are subscribed by
two listeners (the driver and the hold-open instrument's own 0x003F
subscribe; 0x0031 via the tap's double-logging), and Web Bluetooth
delivers one event per listener. Single-subscribed characteristics
(0x0032/0x0033/0x0037/0x0038/0x0039/0x003A) appear once. The duplication
is ours, not the machine's.

## Follow-ups spawned (recorded in ROADMAP, not here)

- The log chart draws the first rest as a bare gap (no band) and
  compresses interval 2 against the trailing band — James: "the graph is
  weird". Desk diagnosis owed.
- The connected screen's total-meters counter counts by 5s since the CM
  quantisation (#123); James wants the realtime 1m count back. Reverses
  a CM ruling; its own small item.
