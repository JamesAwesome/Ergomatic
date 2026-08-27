# Walk 2026-08-27 — the link-authority premise, and two owed RC legs

Conducted to settle the premise of an UNWRITTEN spec before writing it, plus
two owed items. Budget held: 2 pieces, ~3.5 min of rowing.

## Provenance

| file | piece | device |
| --- | --- | --- |
| `boundaries-terminated-recording.jsonl.gz` | "Walk Boundaries", 3x250m with a 1:00 rest after interval 1 only; terminated from the PM5's Menu 59.8 m into interval 3 | laptop, Chrome, local stack at `497411d` |
| `lock-phone-ring.json` | "Walk Lock", 250m, phone locked ~10 s in for 39.4 s | iPhone, v0.25.0 build 759, PRODUCTION |
| `pm5-memory-terminated.jpg` | the PM5's own View Detail screen after the terminate | photograph |

## The photograph, transcribed (SCREEN evidence)

```
View Detail
v250m/1:00r...2      Aug 27 2026      Total Time: 3:12.5
           time     meter   /500m   s/m
          2:12.5     500    2:12.5   25
   1:07.1            250    2:14.2   25
   r1:00                     61
   1:05.4            250    2:10.8   26
   r:00                       0
```

## Findings

### 1. THE SPEC'S PREMISE IS FALSE. A locked phone never disconnects.

**There is no `disconnected` event anywhere in the phone ring.** `phase`
stayed `live` across a **39,410 ms** lock:

```
liveness-silence   frame stream silent for 2500ms
app-lifecycle      resume gap=39410ms threshold=2500ms silent=true latched=true
resume-frames      phase=live framesWhileHidden=1 rowingActive=true distanceIncreased=false
liveness-recovery  frame stream resumed
```

The unwritten spec proposed: *only a transport-confirmed disconnect may write
a stored field or move the erg.* **That rule would fire on essentially
nothing** — the failure that actually happens to a rower produces silence, not
a disconnect, so we would have stopped writing `link-lost` altogether while
believing we had made it more accurate.

**`framesWhileHidden=1`** — one frame in 39 s. The WebView is suspended, not
throttled. Compare walk-2026-08-26's `framesWhileHidden=61`, which was a
transient interruption: the two look nothing alike, which is itself the
signal worth keying on.

**`resume gap=39410ms` proves the lifecycle event fires.** So "the app was
asleep" is positively identifiable and distinguishable from "the link died".
That, not the transport's `onDisconnect`, is the axis the design needs.

### 2. RC-25 CLOSES, on a natural occurrence.

The `pause-declared` instrument built for exactly this fired during the lock,
**while the rower was rowing**:

```
pause-declared  frames=4 hold=4 pulled=true d=181.9 split=140.94 spm=29
```

The freeze predicate cannot tell a stopped rower from a stopped WebView: a
suspended WebView replays identical `distance|split|spm` keys, which is
precisely what `PAUSED_FRAME_HOLD` counts. Declared a pause at 29 spm.

### 3. The avgStrokeRate decode is VINDICATED. The August anomaly is not ours.

`0x0039` byte 10 reads **25**. The PM5's own screen reads **25 s/m**, with
per-interval rows of 25 and 26.

The owed item was the terminated-piece screen oracle: a prior capture showed
`0x0039` avgStrokeRate **44** against `0x0038`'s **22**, exactly double, with
no screen to arbitrate. **This terminated piece reproduces no doubling at
all.** Our offset is right and the screen agrees, so the August capture's 44
has some other cause and must not be "fixed" by changing this decode.

### 4. `0x0039`'s elapsed is WORK ONLY. Confirmed against the screen.

`0x0039` decodes elapsed **132.5 s**, distance **500 m**. The screen's summary
row reads **2:12.5** (= 132.5 s) work with **`Total Time: 3:12.5`** (= 192.5 s)
including the rest, and 500 m.

So `0x0039` is rest-EXCLUSIVE, and its distance excludes the coast. This is an
independent oracle — the machine's own screen, not our accumulator — settling
a question the wire alone could not.

### 5. `0x003A`'s rest distance is right; its rest TIME is a firmware quirk.

`restDist` decodes **61 m**; the screen's rest row reads **61**. Exact
agreement, from a source that does not share our definition.

`restTime` decodes **0** after a real, completed `r1:00`. This is now the
**third** capture where a genuine r60 reports zero. Treat `0x003A`'s Interval
Rest Time as unusable on this firmware, and never gate on it.

### 6. RC-31 IS FALSIFIED. RC-28's trigger was never observed.

The audit predicted the resting-with-no-rest-phase fallthrough fires "for a
tick at every boundary of every rest-bearing program", reasoning from the
`WORKOUTSTATE` 8/9 -> `rowing`, 6/7 -> `resting` mapping. The wire disagrees.

Both boundaries in one piece, seen as distance resets:

```
t=228.56  311.4 -> 0.5   ws=3->5     boundary 1->2, WITH a programmed rest
t=294.71  249.9 -> 1.6   ws=5->5     boundary 2->3, ZERO rest
```

**A zero-rest boundary produces no state change whatever** — the machine stays
in `IntervalWorkDistance` and simply resets the register. It never reports
`resting`, so the fallthrough has no trigger.

RC-28's own premise — "a machine can briefly report `resting` on an interval
with no programmed rest" — came from a code comment, not a capture, and this
walk did not observe it. **One capture cannot prove impossibility**, but the
claim had no evidence FOR it and now has evidence against. Downgrade both:
the code path is real, the trigger is unwitnessed.

### 7. A terminated partial interval leaves no trace in the machine.

`0x003A` reports `intervalCount=2`; the screen lists two work rows totalling
500 m. Interval 3 — 59.8 m rowed before the Menu terminate — appears **nowhere**
in the PM5's memory.

So for a terminated piece, the machine's authority covers only completed
intervals. Anything we hold about the partial is ours alone and cannot be
reconciled against the erg.

## What this changes

The spec that prompted this walk must be rebuilt around a different axis.
Not *"was the disconnect confirmed?"* — that almost never fires — but
**"is there a lifecycle event that explains this silence?"** Silence WITH an
explanation is our own suspension and must never write `link-lost` or suppress
a terminate. Silence WITHOUT one is the genuinely suspicious case.

Both inputs already exist and are already instrumented. The walk found the
right axis by killing the wrong one.

## Addendum, same evening — RC-37 confirmed (zero rowing)

James, after the walk: *"if you hit 'menu' to end the workout while the app
is on the ready screen, it doesn't cancel out."* Captured as
`menu-at-ready-recording.jsonl.gz`. Observed: **app screen does nothing; PM5
shows its main menu.**

Decoded from 0x0031, printing only the ticks where the structural quadruple
changes:

```
t= 7.17   wt=8  it=0  ws=0  durRaw=24000  durType=0     <- armed, programmed
t=29.05   wt=1  it=1  ws=0  durRaw=0      durType=128   <- Menu pressed
```

**`workoutState` never moves.** It is `0` (WaitToBegin) before and after, and
`0` maps to `"armed"`, which is what READY renders from. No TERMINATE (11),
no terminal state of any kind, and the machine keeps streaming — 156 status
frames across the capture — so there is no frame silence either. Nothing in
our link machinery has anything to fire on.

**The divergence is present in every single frame, and we throw it away.**
`workoutType` 8 -> 1 rides in the same 19-byte status packet we already
parse, and the driver logs the change (`kind: "structure"`). The
`structure-mismatch` check that would catch it runs only during the verify
phase, by its own design note ("one entry per verify phase, never per tick").

`pm5-ble-ecosystem-review.md` records workoutType 8 in **3447 of 3448**
committed frames for a programmed piece. This is the first observed piece to
lose it mid-arm, and `wt=1 durType=128` is the machine's unprogrammed shape —
identical to the pre-program frame in this same walk's phone leg.

Filed as RC-37. The stuck screen is the small half: a pull after this rows a
free row on the machine while the app attributes it to a program the machine
no longer has.
