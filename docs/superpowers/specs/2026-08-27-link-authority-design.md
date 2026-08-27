# The link authority — what we know about the erg, and what that licenses

## What and why

Three separate defects share one cause. We hold beliefs about the monitor
that the monitor has abandoned, and we let those beliefs decide things they
are not qualified to decide.

- A **2.5-second** frame-silence threshold, built to flip a banner, also
  writes `endedBy: "link-lost"` into a saved row and suppresses the
  `terminate()` we send to the erg. So a false latch stores a lie AND leaves
  a piece running on the machine (RC-29).
- Teardown sends TERMINATE off our own **derived** `phase === "ready"`, not
  off the machine's state. While that gate lags, an unmount kills the rower's
  live piece (RC-30).
- Pressing **Menu** at READY makes the PM5 drop the program and return to its
  unprogrammed shape. We never notice, keep showing READY, and would
  attribute the next pull to a program the machine no longer has (RC-37).

The fix is one idea: **name what we actually know, and license each answer
for only what it can carry.**

## The evidence this is built on, and what it killed

An earlier draft proposed: *only a transport-confirmed disconnect may write a
stored field or move the erg.* **The walk of 2026-08-27 falsified that before
it was written** (`docs/monitor/sessions/walk-2026-08-27/`).

A phone locked for 39.4 seconds mid-row produced:

```
liveness-silence   frame stream silent for 2500ms
app-lifecycle      resume gap=39410ms threshold=2500ms silent=true latched=true
resume-frames      phase=live framesWhileHidden=1 rowingActive=true
liveness-recovery  frame stream resumed
```

**No `disconnected` event, anywhere.** `phase` stayed `live` throughout. One
frame arrived in 39 seconds — the WebView is suspended, not throttled.

So a transport-confirmed disconnect essentially never fires for the failure
that actually happens to a rower. The rejected rule would have meant "we stop
writing `link-lost` at all", while reading as though it made the field more
accurate.

**What the walk gave instead:** `resume gap=39410ms` proves the lifecycle
event fires. "The app was asleep" is positively identifiable and
distinguishable from "the link died". That is the axis.

## The authority

`withLiveness` (`src/monitor/transports/liveness.ts`) already decorates the
transport and is **the one seam that sees all three inputs** — the
transport's own `onDisconnect`, frame arrivals, and lifecycle events (it
already accepts a `LivenessLifecycleEvent`). Today it publishes a single
boolean, `silent`, and `useMonitorSession` ORs that with `phase`.

It publishes a verdict instead:

| verdict | how it is known | what it means |
| --- | --- | --- |
| `live` | frames arriving | — |
| `explained-quiet` | no frames past `SILENCE_THRESHOLD_MS` AND a lifecycle event accounts for the gap | **our** suspension; not a link problem |
| `quiet` | no frames past the threshold, no explanation | genuinely suspicious |
| `down` | the transport's `onDisconnect` fired | definitive, and rare |

`SILENCE_THRESHOLD_MS` (2500) is unchanged and the banner stays as fast as it
is now. **The consumer changes, not the threshold.**

## The licensing rule

> A derived verdict may change what a rower **sees**. Only `down` or `quiet`
> may change what is **stored** or what is **sent to the erg**.
> `explained-quiet` may change neither.

Everything below follows from that sentence.

### What it fixes, case by case

- **`endedBy`.** Written `"link-lost"` under `down` or `quiet`. Under
  `explained-quiet`, End stores `"rower"` — which is TRUE, the rower pressed
  End — and the evidence fields (below) carry the fact that the app had been
  asleep. No case forces a lie.
- **`terminate()` suppression.** Suppressed only under `down`. Under `quiet`
  or `explained-quiet` we still attempt it, because the link is probably fine
  and leaving a piece running is the worse failure. A failed terminate is
  caught and recorded; a piece left running is not recoverable by the app.
- **Teardown's TERMINATE (RC-30).** Keyed on `frame.state`, never on our
  derived `phase`. If the machine has not told us it is at WaitToBegin, we do
  not send a terminate on unmount.

Every one of those moves in the **safe** direction: a wrong verdict now costs
a terminate on an already-finished piece, or a `"rower"` row with evidence
attached — never a sealed false `link-lost` or an abandoned live piece.

## What gets stored

Two additive nullable columns on the logs table, mirroring `MonitorRun` the
way the existing monitor fields do. **`endedBy`'s enum is untouched.**

- **`link_verdict_at_close`** — a NEW pgEnum (`live` / `explained_quiet` /
  `quiet` / `down`), its own type.
- **`stream_quiet_ms`** — integer. How long frames had been absent at close.

`endedBy` goes back to answering ONE question — *what ended this session* —
and the new columns answer the independent one, *what was the link doing*.
Forcing both into a five-value enum is what made every option a lie in some
case.

`endedBy`'s doc comment currently claims *"Every `endedBy` value is one its
one writer HONESTLY KNOWS at close time"*. Today that is false for
`"link-lost"`. After this change it is true again, and the comment stays
rather than being reworded around.

**Old rows are null**, meaning "not recorded". No backfill, no migration of
existing data, additive-only for the API.

### The consequence, stated rather than discovered

We will write `link-lost` **less often**. A genuine loss where iOS never
fires `onDisconnect` AND a lifecycle event explains the gap now stores
`"rower"` plus evidence.

**The consumers, enumerated here rather than left as homework.** There is
exactly one user-visible one:

- `storedSummary.ts:893-902` — `buildLinkLostLine` renders
  **`"LINK LOST · the app lost the monitor before the end"`** on a plain
  equality against `"link-lost"`, and `FromTheLog.tsx:450` prints it. Its
  own comment states the rule this change must respect: *"no other `endedBy`
  values render anything"* — it is "the lost-link surface, not an `endedBy`
  taxonomy display".
- `monitorRun.ts:431` — a shallow validator listing all five members. Not a
  branch on meaning; unaffected.
- `monitorRun.ts:951-999` — `completeWithoutWireEvidence`, the second
  producer. It writes the value; it does not read it.

**So the behaviour change a rower can see is precisely this:** a locked-phone
session that today prints `LINK LOST · the app lost the monitor before the
end` will stop printing it, because the app did not lose the monitor — the
app went to sleep. That sentence is currently a false statement about the
erg, printed on a saved row. **Removing it is part of the point, not a
regression.**

Whether that row should print something ELSE — naming our own suspension —
is the same open question as the live banner, and gets the same answer.

## RC-37 — the same disease, a different signal

The link tiers cannot see RC-37 at all: pressing Menu at READY produces **no
silence**. 156 frames kept arriving. Wire evidence:

```
t= 7.17   wt=8  it=0  ws=0  durRaw=24000  durType=0     <- armed
t=29.05   wt=1  it=1  ws=0  durRaw=0      durType=128   <- Menu
```

`workoutState` never moves — `0` before and after, and `0` maps to `"armed"`,
which is what READY renders from.

**The divergence is in every frame and we discard it.** The `workoutType`
change rides in the same 19-byte status packet we already parse, the driver
LOGS it (`kind: "structure"`), and `verifyArmed`'s structure check runs only
during the verify phase — its own note: *"one entry per verify phase, never
per tick"*.

**The fix is to extend an existing comparison's lifetime, not to write a new
rule.** Under an open ARMED run, keep comparing the readback against the
program we sent; a sustained mismatch (reuse `STRUCTURE_MISMATCH_TICKS`'s
existing N=3, do not invent a second constant) means the machine has left,
and the session ends the way a machine-side terminate ends it.

**BINDING (RC-38): compare against WHAT WE SENT, never a literal `8`.**
`8` is our compiler's choice, not a PM5 universal — real apps send
fixed-interval types for equal intervals. `verifyArmed` already compares
against the sent program; keep it that way. We have read exactly one row of
`OBJ_WORKOUTTYPE_T`, and `1` is a silhouette we named, not a documented
value.

## OPEN QUESTION — for James, not for the spec

During `explained-quiet` — the rower unlocks after 39 seconds — **what do
they see?**

- `LOST THE MONITOR` blames the erg for our own suspension. That is what
  James saw on the walk, and it is wrong.
- Showing nothing hides a real hole in the data.
- A third option names US rather than the machine.

Not decided here. The rest of the spec does not depend on the answer.

## Constraints

- **Additive-only API** (CLAUDE.md): new nullable fields, no enum member
  removed, no existing column's meaning changed.
- **TRIAD weight** — a stored shape AND what `endedBy` means. Full antagonist
  pass on this spec, PM gate on the PR.
- **`SILENCE_THRESHOLD_MS` does not change.** Any proposal to retune it is
  out of scope and would need the evidence `stream_quiet_ms` exists to gather.
- **Do not touch `livePace`.** RC-27's surface is deliberately unchanged.
- No em-dashes in user-facing strings.

## Testing

- **Replay `walk-2026-08-26`** — nine false latches over a link that never
  dropped — and assert **zero** durable `link-lost` writes and **zero**
  suppressed terminates. Real wire data that previously produced the defect.
- **Replay `walk-2026-08-27`'s phone leg** and assert the close resolves
  `explained_quiet` with a `stream_quiet_ms` near 39410.
- **Replay `walk-2026-08-27`'s menu-at-ready capture** and assert the session
  ends rather than sitting at READY. This capture is the RC-37 oracle and it
  is already committed.
- Pin the negative in both directions: `explained-quiet` reaches neither
  durable path; `quiet` and `down` still do.
- **Every new gate proved red by mutation, with the transcript in the
  report** (recurring failure #21). Three inert gates shipped in two days;
  this spec adds none.

## Exit criteria

1. A false latch on a healthy link cannot write `endedBy` or skip a
   terminate. Pinned by replaying the capture that caused it.
2. A locked-phone gap resolves `explained_quiet`, stores `"rower"` with
   evidence, and shows the rower whatever James rules above.
3. Teardown never sends TERMINATE off a derived phase.
4. Menu at READY ends the session instead of leaving a stale READY.
5. Every consumer of `endedBy === "link-lost"` enumerated, with its new
   behaviour recorded.
6. **A hardware walk closes this.** Desk gates can prove we do not send a
   terminate wrongly; only an erg proves the piece still ends when the rower
   presses End.

## Not in scope

- Retuning `SILENCE_THRESHOLD_MS`.
- RC-28/RC-31 — falsified or unwitnessed at the 2026-08-27 walk.
- RC-32 (F2b's vacuous sweep), RC-33 (the grid's missing `!stale`), RC-34,
  RC-35, RC-36 — real, queued, and independently reviewable.
- `OBJ_WORKOUTTYPE_T`'s transcription (RC-38) and PHASE PROTO.
