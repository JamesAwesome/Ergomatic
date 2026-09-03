# Connect programs the erg sooner (design)

## What and why

When the rower taps Connect, the erg sits on its old screen for about two
seconds before it takes our program. James found it on the phone the day
Just Row's connect-programs-the-erg shipped: "there's noticable delay
between programming the erg and the just row screen starting."

The delay is not the frame and not the PM5. Our program write is issued
10 ms after connect and is then held in a queue behind ten other calls we
made first. This spec moves the write to the front of that queue. Expect
the erg's screen to change in roughly half a second instead of two, on
every connect: a free row, and every programmed workout too.

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

## What changes

**The driver stops enqueueing its status subscriptions at construction,
and enqueues them once the first CSAFE write has been issued -- or after a
short fallback, whichever comes first.** The CSAFE response subscription
and the sample-rate write stay at the head, because the first is what
hears the ack and the second is what sets the frame cadence.

One producer keeps sending the program: `program()` and `beginFreeRow()`
are untouched. Nothing new writes to the wire, and no argument threads a
program into the driver's constructor.

**Invariants, not mechanism:**

1. The first CSAFE program write is enqueued behind at most two other
   native calls, on every connect, whatever arms it.
2. Every status characteristic this driver subscribes today is subscribed
   on every connect, exactly once, whether or not an arm ever comes.
3. No frame the driver would have delivered before is dropped, because no
   run is open until the arm and the PM5 re-sends status continuously.
4. The fallback fires from the driver's own `schedule` seam, so tests
   drive it rather than waiting.

## What this does NOT claim

It does not make the PM5 faster. The ack still costs its own round trip,
measured in the census as the gap that remains once the queue is empty. The claim
is only that we stop making the erg wait behind our own bookkeeping.

## Gates

The plugin queue is invisible to every transport double we own, so no unit
or e2e gate can measure the saving. The gate is ordering, at the driver:
a transport that records the order it was called in, asserting the program
write is enqueued before the status subscriptions. The saving itself is a
walk number, read off the ring the same way the table above was.
