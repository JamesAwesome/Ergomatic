# Connect programs the erg sooner, and says so honestly (design)

## What and why

When the rower taps Connect, the erg sits on its old screen for about two
seconds before it takes our program. James found it on the phone the day
Just Row's connect-programs-the-erg shipped: "there's noticable delay
between programming the erg and the just row screen starting."

The delay is not the frame and not the PM5. Our program write is issued
10 ms after connect and is then held in a queue behind ten other calls we
made first. This spec does two things, and they are complements.

**Part 1 moves the write to the front of that queue.** Expect the erg's
screen to change in roughly half a second instead of two, on every connect.

**Part 2 stops the free row claiming ready before the erg has anything.**
James asked whether waiting longer before the ready screen would feel less
like lag, and the answer turned out to be that the free row is the only
path in the app that lies about this. A programmed workout waits until the
monitor is confirmed to be holding our program -- its own code comment says
"ready means ready, not the ack came back". The free row flips to ready in
the same statement that starts the send, so on the 3 September walk the
phone said "Ready when you pull" at 8 ms while the erg took the program at
1978 ms. Part 2 makes the free row behave like a workout. Part 1 is what
keeps that from simply becoming two seconds of waiting.

## The measurement (PRIMARY, our own rings)

The numbers ship as their script, not as a transcription:
`docs/monitor/sessions/ack-latency-census.py`, run from the repo root. It
walks every committed ring, reports the first CSAFE write, its first ack and
the gap between them, and splits native from web by a ring entry only the
Capacitor transport can emit (`already-connected-guard`, recorded behind
`hasDescribeLastScan`). That split was cross-checked against each walk
README's own "laptop leg / phone leg" line and agrees on all sixteen.

At this branch's head it reports **native: 13 rings, gap 1698-2060 ms** and
**web: 4 rings, gap 3294-4077 ms**. The oldest native ring predates free rows
by eleven days, so this is not the Just Row feature's delay: it is every
connect's delay, on both stacks, and Just Row is only the first feature whose
evidence is a screen the rower is watching.

Within a native ring the arrival order is always the same: our write is
logged at +0 to +10 ms, the status characteristics report their first
notifications across the next second, and the ack lands after the last of
them.

## The cause

**On native this is settled (PRIMARY, vendor source under `node_modules`).**
`@capacitor-community/bluetooth-le` runs every call through one FIFO promise
queue. `dist/esm/queue.js`:

```js
const makeQueue = () => {
    let currentTask = Promise.resolve();
    return (fn) => new Promise((resolve, reject) => {
        currentTask = currentTask.then(() => fn()).then(resolve).catch(reject);
    });
};
```

and `dist/esm/bleClient.js`'s constructor: `this.queue = getQueue(true)`.
Enqueue order is execution order, one at a time. Our transport already
records this as its QUEUE INVARIANT (`capacitorBle.ts`, "REVIEW B3.3").

**On web it is NOT settled, and this spec does not claim it.** The four web
rings are worse, not better, so whatever serializes there is at least as
strict; naming it would need a source we have not read. The fix below is a
change to the order WE enqueue in, so it helps whichever queue is
downstream, and the spec's claim stops at native.

`createPm5Driver` enqueues ten native calls synchronously at construction,
in this order: the sample-rate write, the CSAFE response subscription, and
then eight status subscriptions (0x0032, 0x0033, 0x0038, 0x0031, 0x0037,
0x0039, 0x003A, 0x003F). A ninth `subscribe` of 0x0031 costs nothing on the
queue -- the transport folds a second subscriber into the existing set
without calling the plugin again. Count them with
`grep -n "t.subscribe(\|mergeStatus(\|t.write(" app/src/monitor/driver.ts`.

The arm cannot join that batch, because it fires from a React effect after
the link is up: `JustRow.tsx` says so in its own comment ("THE ARM FIRES
ONCE THE LINK IS UP, not at the press"), and the interstitial arms the same
way. So the program write is enqueued a tick later and drains last.

## The controlled experiment (PRIMARY, and stronger than the argument above)

The corpus already contains the experiment, on bytes rather than reasoning.
The CSAFE Terminate frame `f1 76 04 13 02 01 02 60 f2` is byte-identical
wherever it is sent, on the same characteristic, to the same monitor:

| When it is sent | Ack | n |
| --- | --- | --- |
| At connect, behind the driver's ten calls | 1698-2058 ms | 10 |
| Mid-session, on an empty queue | 136-224 ms | 2 |

Same command, same device, eight to fifteen times apart. That disposes of
"the PM5 is slow to answer" and "CSAFE processing costs two seconds"
without any appeal to vendor source.

Two further measurements agree on a per-call cost of roughly 90 to 180 ms:
chunk-to-chunk write spacing on an empty queue (91, 177, 180, 182 ms in
`walk-2026-08-23/ring-phone-1-btoff-at-ready.json`), and `notify-first`
spacing during the drain (176 ms and 361 ms, exactly one and two slots,
matching the subscribe order in `driver.ts`). Ten slots at ~180 ms is
~1800 ms, which is the gap. WHY a slot costs ~180 ms is an INFERENCE we do
not adopt: it is consistent with a ~90 ms connection interval at one or two
intervals per operation, but nothing in our stack reports the negotiated
interval.

## Why the web arm is worse, and why that is a confirmation

On web the ack arrives BEFORE any status notification, so the write was not
behind the subscribes there, and the gap is still worse. The difference is
where each stack pays for GATT discovery. On native the plugin's `connect`
does not resolve until service and characteristic discovery finish -- its
own log line reads "Connected to peripheral. Waiting for service
discovery." So on native that cost is paid inside `transport.connect()`,
before the driver exists and before the ring's first entry. On web it is
not. The native claim survives; the web cause stays unread and unclaimed.

## The fix does not depend on our causal claim

Both candidate explanations -- the plugin's JS queue and Core Bluetooth's
own per-peripheral serialization -- are order-preserving. Moving the
program write from the eleventh slot to the third wins under either. The
vendor-source argument explains the size of the win; it is not load-bearing
for the win existing.

## What changes

**The driver stops enqueueing its status subscriptions at construction, and
enqueues them once the first CSAFE SEQUENCE has been acked -- or after a
fallback, whichever comes first.** The CSAFE response subscription stays at
the head, because it is what hears the ack.

**The release point is after the SEQUENCE, not after the first write, and
that choice is worth about 1.5 seconds on the programmed path.** A free row
sends one frame, so the two triggers are the same for it. A workout sends
two sequences: a prepare, then the programming frame in five chunks, and
the erg's screen changes on the SECOND ack, measured at 2700-2969 ms rather
than the 1800 ms first ack. Releasing on the first write issued would put
the eight subscriptions between the prepare's ack and the chunk writes,
which cannot be enqueued until that ack lands, and the programmed path
would end up roughly 400 ms SLOWER than today. Releasing after the sequence
completes puts it at roughly 1600 ms, about 1.1 seconds better.

**The sample-rate write moves behind the program write too.** It was at the
head to set the frame cadence, and that reason expires with this change:
cadence only matters once status notifications exist, and those are now
deferred past the program. The order becomes response subscription, program
write, sample-rate write, then the eight status subscriptions, and the
first CSAFE write sits behind exactly one other call rather than two.

One producer keeps sending the program: `program()` and `beginFreeRow()`
are untouched. Nothing new writes to the wire, and no program threads
through the driver's constructor.

**The fallback records which path fired.** A ring entry names an
arm-triggered release and a fallback release differently, because a
fallback release silently restores the old behaviour and nothing else in
the ring would distinguish the two.

### The vendor knob, considered and rejected

`BleClient` ships `disableQueue()`. We do not use it. The driver's chunked
CSAFE writes all target one characteristic, and the plugin's native
callback map is keyed by operation and characteristic, so two concurrent
writes to the same characteristic would collide on one callback slot.
Recording the rejection is the point: the switch exists and a reader will
find it.

## Lifetime of the deferral state (RF27)

| | |
| --- | --- |
| **What it is** | Whether this driver has enqueued its status subscriptions yet |
| **Minted** | Once, at `createPm5Driver`, per connect. The driver is constructed at exactly one site, inside the hook's `connect()`, so a second connect gets a fresh driver and fresh state |
| **Released by** | The first CSAFE sequence's ack, or the fallback on the driver's own `schedule` seam |
| **Cleared** | Never re-armed within a driver's life |
| **Survives teardown** | Nothing. A release attempt after the transport has disconnected must not call subscribe |

**Invariants, not mechanisms:**

1. The first CSAFE program write is enqueued behind at most one other
   native call, on every connect, whatever arms it.
2. Every status characteristic is subscribed exactly once per connect,
   whether the arm comes, the fallback fires, or both -- and NOT AT ALL
   after the session has torn down.
3. No frame any SHIPPING screen would have delivered before is lost.
   Scoped deliberately: the dev-only observer connects and never arms, so
   it always takes the fallback and its captures start later by that
   much. That is a recording instrument, and the walk lab is where it
   runs.
4. The fallback fires from the driver's own `schedule` seam, so tests
   drive it rather than waiting.
5. A release that arrives after teardown is a no-op, not a throw.

**Three hazards the table exists to close, all real:**

- **The synchronous throw.** The transport's `subscribe` calls its
  connected-guard synchronously and throws when the device id is null.
  Today that is unreachable, because the subscriptions run microseconds
  after connect resolves. Deferral makes it reachable through a producer
  the 3 September walk actually exercised, a cancel during connect, and
  the driver exposes no dispose to hang the cancellation on.
- **Double release double-subscribes.** The transport folds a second
  subscriber into a set of callbacks, and each status registration passes
  a NEW closure, so the set cannot dedupe. Both handlers would then run on
  every notification, halving every tick-counted wait and duplicating
  frame emissions. Invariant 2 needs something that enforces it.
- **Teardown during the gap** is why invariant 2 carries its final clause.
  Without it, "subscribed on every connect whether or not an arm comes"
  literally demands subscribing after the session is gone.

## What this does NOT claim

It does not make the PM5 faster. The ack still costs its own round trips.
The claim is that we stop making the erg wait behind our own bookkeeping.

Every post-fix figure in this spec is MODELLED from the ~180 ms slot cost
applied to observed queue positions. Only a walk settles them, and the walk
reads the SECOND ack on the programmed path, not the first.

## Gates, and what each proves

**The ordering gate.** A recording transport asserts the driver enqueues
the program write ahead of its status subscriptions. It bites: revert the
deferral and it goes red. The strongest thing it may claim is exactly
that -- the driver's enqueue order. It may NOT claim the erg is programmed
sooner, because the plugin's queue is invisible to every transport double
we own and that consequence rests on vendor source.

**The multi-sequence gate, which the ordering gate cannot replace.** A
recording transport over a real `program()`, asserting the eight
subscriptions do not sit between the prepare's ack and the chunk writes.
Without it the release-point regression above ships under a green
ordering assertion.

**Three more, all cheap on the `schedule` seam:** the no-arm path
subscribes exactly eight times; an arm plus a fallback still subscribes
eight times; a teardown inside the gap issues no subscribe at all.

**The saving itself is a walk number**, read off the ring by the census
script, at the second ack.

## Part 2: the free row waits, like a workout does

### What matches, and the one thing that cannot

A workout's acceptance point is a READBACK: the driver confirms the machine
is holding our program, structure and all, and only then emits `armed`,
which is what moves the hook to `ready`.

A free row cannot use that, and this is settled rather than assumed. Item
2's antagonist pass falsified it and the 3 September walk confirmed it on
hardware: `workoutType === 1` is the PM5's idle default, so two of the
walk's three rings report type 1 BEFORE their own ack. A readback check
there can never fail, which makes it decoration.

**So the free row's acceptance point is the ack**, which is a real signal
the monitor sends, which we already log as `free-row-program-sent`, and
which the item 2 gates already assert on. Stated plainly rather than
papered over: the workout is confirmed by readback, the free row by ack.

Everything else matches. `beginFreeRow()` stops flipping straight to
`ready`; the door shows a sending card while the program is in flight; the
hook reaches `ready` on the driver's `armed`, exactly as a workout does.

### The screen (Gate 0 PASSED, James, 2026-09-03)

`docs/design/handoffs/2026-09-03-free-row-sending/` carries the approved
artifact and its contrast table. The card is the status label, the serif
line **Starting your row**, the workout's own three-line checklist with
**STARTING THE ROW** current, and Cancel. No new colour, type size or
component: every value is lifted from the cards either side of it.

### When the monitor never answers

**The card falls through to ready** (approved with the gate). The send is
already bounded, and on the deadline or a rejection the door shows the
ready card anyway rather than the workout's failure card. A free row needs
nothing from the monitor to be rowable -- the rower can start it on the
PM5 -- so a failure card would block a row that would have worked. The ring
still records which way it went.

### Invariants

1. The free row reaches `ready` only after the monitor has accepted the
   program, or after the send has failed or timed out. Never before both
   are impossible.
2. Cancel from the sending card terminates the free row on the erg, exactly
   as it does from ready today (walked, 3 September).
3. The ready card itself is unchanged. It only arrives later, and by then
   it is true.
4. Nothing on this path reads the workout type back. If a readback check
   for a free row ever appears, it is decoration and must be deleted.

### Gate

At the hook, driving the fake: begin a free row, assert the phase is NOT
`ready` while the send is in flight, feed the ack, assert `ready`. Then the
same with the ack withheld: after the deadline, `ready` anyway. The
mutation that must bite is restoring the synchronous flip to `ready`.
