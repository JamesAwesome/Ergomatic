# Walk 2026-08-28 — RC-37's gate, and the case that upgrades it

The walk that gates PR #211's merge. Budget held: ~2 min of rowing.
Legs 1-3 ran on the LAPTOP against the branch build (`f705ce2`, which
carries RC-37's detector). Leg 4 ran on the PHONE against the SHIPPED
v0.25.0, which does not.

## Provenance

| file | leg | device |
| --- | --- | --- |
| `end-on-interval-1-recording.jsonl.gz` | first attempt at leg 2; ended on interval 1, so no rest boundary was crossed | laptop, branch build |
| `rest-boundary-recording.jsonl.gz` | **leg 2, the gate** — 3x1' time-only with 1:00 rests, ended in interval 2 | laptop, branch build |
| `pocketed-phone-prerow-ring.json` | leg 4 — locked BEFORE the first pull | iPhone, v0.25.0 build 759, PRODUCTION |

## LEG 1 — Menu at READY. PASSED.

Nudged a target, armed to READY, pressed Menu on the PM5. **The app exited
to `WorkoutDetail` and the nudge was still on screen.** Both halves of
James's ruling ("take it back here and remember any nudges") confirmed on
hardware, not inferred from jsdom.

## LEG 2 — the detector stays silent through a real session. PASSED, with margin.

This is the leg #211 hangs on: its negative corpus has **zero armed frames
past a rest boundary**, so the corpus proves nothing about rest boundaries
and only an erg could.

Decoded from 0x0031, printing only ticks where the structural quadruple
moves:

```
t=  9.89   wt=8  it=0  ws=0   durRaw=6000  durType=0   <- armed
t= 17.01   wt=8  it=0  ws=4   <- rowing
t= 76.49   wt=8  it=2  ws=3   <- THE REST BOUNDARY
t=136.70   wt=8  it=0  ws=4   <- interval 2
t=147.86   wt=8  it=0  ws=11  <- End pressed in the app
```

273 status frames; state histogram `{0:14, 3:119, 4:139, 11:1}`.

**`workoutType` holds at 8 throughout.** The rest boundary moves
`intervalType` 0 -> 2 -> 0 — exactly the structural motion that would make a
naive comparator misfire — and the detector never twitched.

**Zero `structure-left` and zero `structure-mismatch-recovered` entries in
the ring.** Not merely "did not fire": never started a mismatch streak. The
near-miss instrument, built for precisely this reading, reports nothing, so
the thresholds are comfortable rather than lucky.

**The piece was TIME-ONLY by design** (no distance interval anywhere), which
was RC-32's stated free rider.

## LEG 3 — End terminates the machine. PASSED.

`ws=11` at t=147.86, and James confirmed the erg stopped. The one-line fix
(`|| linkGone` deleted at `endSession`) verified on the wire.

**Bonus, unplanned:** at terminate the structure DOES drop to `wt=1` — the
same shape RC-37 fires on — but `ws=11` means not `armed`, so the detector
correctly ignored it. **The `armed` gate proven on hardware**, not only by
mutation.

**Also settles a wire question the interface notes carried open.** `0x0039`
decoded `elapsed=60s distance=198m` against a recorded interval total of
60s/197m, over a program with 120s of programmed rest. Equal to the recorded
total, NOT the total plus rest, so `0x0039` is **cumulative AND
rest-exclusive** — both premises hold (§23 items 2 and 4). And the ~11s
partial rowed into interval 2 appears nowhere in it, independently
reproducing walk-2026-08-27's finding 7.

## LEG 4 — the pre-row lock. THE TESTER'S REPORT, REPRODUCED — and it upgrades RC-37.

Locked the phone BEFORE the first pull (the 2026-08-27 leg locked ~10 s IN,
with the run already open — a different case).

**The report's mechanism, confirmed:**

```
app-lifecycle   resume gap=27886ms  silent=true latched=true
resume-frames   phase=ready  framesWhileHidden=1  rowingActive=false
twd-sample      machineTotal=52m at elapsed=24.71s distance=52.6m workoutState=4
```

The machine had him **24.7 s and 52.6 m into interval 1**; the app was still
`phase=ready` and had opened no record. He rowed and the app kept nothing —
the tester's report exactly.

### THE FINDING THAT MATTERS: RC-37's signature occurred NATURALLY.

After a second, longer lock:

```
app-lifecycle   resume gap=67296ms  silent=true latched=true
structure       workoutType=1 durationRaw=0 durationType=128   <-- RC-37's shape
frame           state=armed elapsed=50.81 distance=64.2
```

**`workoutType` 8 -> 1 and back to WaitToBegin, with NO Menu press.** The
machine dropped the program on its own after a long background.

**RC-37 was scoped from James's own words — *"rare, and not that annoying to
have to exit"* — which was true of the trigger he knew about.** The detector
keys on the readback DISAGREEING with what we sent, not on Menu, so it also
catches this. His phone runs v0.25.0 with no detector, so the app carried on
showing a live surface for a program the erg had discarded. **The #211 build
would have caught it and returned him to the workout screen.**

Recorded so nobody re-scopes RC-37 downward from its original trigger.

### Three more, all reproductions

- **`pause-declared … d=64.2 split=297.56 spm=66`** — the freeze predicate
  calling a pause while he was rowing, as on 2026-08-27. It also explains
  the screen: the 4:57.6 split and 66 spm James asked about are WIRE
  readings from the confused post-unlock window, not our arithmetic.
- **TWD went non-monotonic** — 52 m -> **0 m** -> 64 m across three samples.
- **`rowing-active-fallback` fired**, so `rowingActive` was stuck false
  throughout.

## Verdict on #211's gate

**All three gating legs passed.** Leg 2 passed with zero near-misses, which
is the strongest available reading. Leg 4 was not a gate and found the most
valuable thing in the walk.

---

# Leg 5, added the same evening: MACHINE CONFIRMED has never worked

`summary-never-stored-ring.json` — iPhone, **PRODUCTION TestFlight**, a
2-interval "Multi-test" row at 17:38. Not part of #211's gate. It is here
because James went looking for the verification code on a saved row, found no
`MACHINE CONFIRMED · WORK ONLY` block at all, and said he had never seen one
on a real row — only in our tests.

## What the ring proves, and what it kills

**The wire half is finished. Every earlier theory about it is dead.**

| seq | entry | reading |
| --- | --- | --- |
| 51 | `summary-half` 0x0039 received | the summary ARRIVES |
| 53 | `summary-totals` decoded: elapsed=120s distance=358m | it DECODES |
| 55 | `summary-half` 0x003A received | so does the additional summary |
| 57 | `verification-received` 0x003F, 19 real bytes | **the verification hash arrives** |
| 58 | `summary-reconciled: split-won … a 0x0039 was held; its totals are recorded as observations` | the driver EMITS `summary-observations` (`driver.ts:4181`) |

So this is NOT a subscription failure, NOT a firmware gap, and NOT the
capture-rate gap the register had filed. A hypothesis that the native BLE arm
never subscribed to 0x0039/0x003F was raised on 2026-08-28 and **falsified by
this file** — the bytes are right there.

## Where it actually breaks

Above the driver, in the reader:

- `LogSession.tsx:1487` snapshots the run with `useState(() => monitorModeRun(...))`
  at MOUNT, with no setter and no refresh.
- The burst lands at `atMs …108175`-`…108177`, **270 ms after** the hand-off
  released for navigation at `…107905` (seq 50, on its `final-boundary`
  condition — the final SPLIT, not the summary).
- The late write to `localStorage` succeeds. The reader had already read.

**The ordering is fixed, not racy**, which is why it is "never once" rather
than "sometimes": navigation is what STARTS teardown and its linger, so the
log screen has always mounted and snapshotted before the burst can arrive.

## Why it matters more than one missing box

`storedSummary.ts:617-621` gates tier A on the same two columns the save
omits, so **every stored connected row falls back to our own arithmetic,
including its AVG SPLIT** — while v0.23.0's own release note told testers
"those three numbers come straight from the erg… We show the monitor's, not
ours."

## The instrument lesson this leg is really about

The driver records that it EMITTED. **Nothing records whether the record was
updated.** That link is the only one in the chain with no instrument, which is
why five walks and a phase close ran straight past it. `grep -rl
"MACHINE CONFIRMED" docs/monitor/` returned nothing before this file existed.

And the ring itself is unreachable once a row is saved: the triple-tap opens it
only during the connected session, `MonitorLogRow` renders only on the SAVE
screen, and `session_logs` has no diagnostics column. James captured this only
because he looked before saving.
