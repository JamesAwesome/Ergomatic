# The link authority — what we know about the erg, and what that licenses

**REVISION 2 (2026-08-27), after a BLOCKING antagonist pass.** Revision 1's
axis survived; its mechanism did not. Every change is marked **[R2]** with
what falsified it. The pass's full findings are in
`.claude/agents/antagonist-ledger.md` under "Phase LA anchor pass".

## What and why

Three defects share one cause. We hold beliefs about the monitor that the
monitor has abandoned, and we let those beliefs decide things they are not
qualified to decide.

- A **2.5-second** frame-silence threshold, built to flip a banner, also
  writes `endedBy: "link-lost"` into a saved row and suppresses the
  `terminate()` we send to the erg (RC-29).
- Teardown sends TERMINATE off our own **derived** `phase === "ready"`. While
  that gate lags, an unmount kills the rower's live piece (RC-30).
- Pressing **Menu** at READY makes the PM5 drop the program and return to its
  unprogrammed shape. We never notice and keep showing READY (RC-37).

The fix: **name what we actually know, and license each answer for only what
it can carry.**

## The evidence, and what it killed

An earlier draft proposed *only a transport-confirmed disconnect may write a
stored field or move the erg.* **The walk of 2026-08-27 falsified it before
it was written.** A phone locked 39.4 s mid-row produced `resume
gap=39410ms`, `framesWhileHidden=1`, `phase=live`, and **no `disconnected`
event at all**. That rule would have fired on nothing.

What the walk gave instead: the lifecycle event fires, so "the app was
asleep" is positively identifiable. That is the axis.

## The authority — WHERE it lives **[R2: moved]**

**Revision 1 said `withLiveness` "already accepts a
`LivenessLifecycleEvent`". That was false.** That type is the decorator's
record of its OWN transport lifecycle (`connect | write | disconnect |
link-drop | silence | recovery`) and is a return value of `snapshot()`, not
an input. Four references exist, all inside `liveness.ts`. App lifecycle
reaches the decorator only through `markSuspect()`, which by a Phase LM exit
criterion **refuses to carry a cause** — *"Names WHO, never WHY"*.

**So the verdict is computed in `useMonitorSession`, not in the decorator.**
That is where both inputs already meet: the lifecycle listener is registered
at `:2962`, and `frameSilence`/`silent` arrive from the decorator's snapshot.
This reverses no ruling and adds no plumbing to a layer that was deliberately
kept cause-free.

`withLiveness` is unchanged by this spec.

## The verdict

| verdict | how it is known |
| --- | --- |
| `live` | frames arriving |
| `explained-quiet` | silence past threshold AND a lifecycle resume accounts for the gap |
| `quiet` | silence past threshold, no explanation |
| `down` | the transport's `onDisconnect` fired |

### Lifetime and priority — **[R2: was unspecified, and that made the fix inert]**

`silent` clears on the FIRST arriving frame; `frameSilence` clears
`BANNER_RETRACT_HYSTERESIS_MS` (10 000 ms) later. Revision 1 never said which
the verdict follows. Computed from `silent`, the verdict would read `live`
throughout the ~10 s window in which End still writes `link-lost` today — and
the whole spec would change nothing. A fourth inert gate in three days
(recurring failure #21).

**The verdict is as sticky as `frameSilence`, not as `silent`.** Explicitly:

- `down` is **sticky and dominant**. Once the transport reports a
  disconnect, no later verdict overrides it for this session.
- `explained-quiet` and `quiet` persist exactly as long as `frameSilence`.
- `live` only when `frameSilence` is false.

**The lock-plus-out-of-range hole, named.** A rower can lock the phone AND
leave Bluetooth range: a genuine loss arriving with a lifecycle explanation,
which classifies `explained-quiet`. `down`'s dominance is what corrects it —
**if** iOS delivers the disconnect. Apple documents that you do not learn of
a disconnect until resume, and is silent on ordering relative to the
plugin's `resume` event. **No capture settles it, and this spec does not
pretend otherwise:** the ordering is an owed walk item, and until it is
measured, the exposure is that a real loss in that combination stores
`"rower"` plus evidence rather than `"link-lost"`.

**Not in the taxonomy at all:** jetsam, force-quit, battery death. No code
runs, so no verdict is computed and no row is written. The four tiers are not
exhaustive over reality — only over the cases where we are alive to classify.

## The licensing rule — **[R2: narrowed, twice]**

> A derived verdict may change what a rower **sees**. Only `down` or `quiet`
> may change what is **stored**. **No verdict may send a wire command.**

### Wire commands read `frame.state`, never a verdict **[R2]**

Revision 1 said terminate is attempted under `quiet` and `explained-quiet`
"because the link is probably fine", and argued the worst case was "a
terminate on an already-finished piece". **That inverts.** The argument
assumes the machine did nothing during a blind window the walk measured at
39.4 s. Reachable, every step observed: background mid-session, finish at the
erg, press Menu, start a cool-down, unlock, press End. Revision 1 sends a
terminate into a **live new piece**.

There is no safety net at the machine. `pm5-interface-notes.md:1598-1602`
records a standalone terminate to an idle PM5 acking `slaveState=READY` —
**"An ACCEPT, not a reject"** — retracting an earlier belief that the PM
refuses one. And a terminated partial leaves **no trace** in PM5 memory
(walk-2026-08-27 finding 7), so the destroyed metres are unrecoverable by
anyone.

**Both terminate sites gate on `frame.state`,** with an explicit freshness
rule, because a `frame.state` read 39 s ago is exactly as derived as `phase`:

| `frame.state` | send terminate? |
| --- | --- |
| absent (no frame yet this session) | **yes** — we armed it ourselves moments ago; nothing can be live, and DEVIATIONS row 63's harm (the next rower finds someone else's intervals) is real. The pre-stream window is measured at 3775-4454 ms |
| fresh (`stream_quiet_ms` under threshold) and `armed`/`idle`/`finished` | **yes** |
| fresh and `rowing`/`resting` | **no** — a piece is live |
| **stale** (silence past threshold) | **no** — we do not know what the machine is doing, and the cost of guessing wrong is destroying a live piece |

That last row is the whole correction. It applies to `endSession`'s terminate
(RC-29's wire half) and teardown's (RC-30) identically.

### The continuity door is licensed by its own evidence **[R2: carve-out]**

`applyContinuityCheck` opens `if (!frameSilence) return run;` and its only
writing exit is `completeContinuityReset` → stored `endedBy: "link-lost"`.
Under revision 1's rule, the commonest latched silence is
lifecycle-explained, so the door would be **switched off for exactly the case
it was built for** — "the app slept, the machine moved on", the 16938-vs-4384
class.

**Carve-out, stated as a rule rather than an exception:** *a close backed by
independent wire evidence is licensed by that evidence, not by the link
tier.* The continuity door's three-axis divergence IS independent wire
evidence (`monitorRun.ts:994-999`, RULED F1/I1 as "the close with the
STRONGEST evidence of the two"). It keeps its write under any verdict.

The link tier governs closes that have **no** evidence but the silence.

### What `quiet` does and does not fix **[R2: honesty correction]**

Revision 1 claimed "No case forces a lie" and that `endedBy`'s honesty
doc-comment "is true again". **Both overstated.**

`quiet` is still the 2.5 s threshold with no explanation attached — the
banner-grade signal — and it retains durable-write rights. RC-29's own text
says *"Phase LM fixed the LIFECYCLE producer of that silence; the WATCHDOG
producer is untouched"*. **This spec fixes the lifecycle producer and leaves
the watchdog producer where it was.** For that producer nothing changes: 2.5 s
of missing frames still seals `link-lost`, and the writer honestly knows only
"frames stopped for 2.5 s".

The threshold's adequacy on the platform that produces every real row is
disclaimed in its own constant's comment: *"Native's own inter-frame gap
distribution is UNMEASURED… necessary-and-not-sufficient evidence, not
proof, for the platform it exists to protect."* The 810 ms worst gap is
desktop-only.

**So: this spec NARROWS RC-29 to the lifecycle-explained subset.** RC-29
stays open for the watchdog producer, and closing it needs a measured native
gap distribution — which is what the stored evidence below exists to gather.

## What gets stored — **[R2: the scalar was useless]**

Two additive nullable columns. **`endedBy`'s enum is untouched.**

- **`link_verdict_at_close`** — a new pgEnum (`live` / `explained_quiet` /
  `quiet` / `down`).
- **`max_stream_gap_ms`** — integer. The LONGEST frame gap observed during
  the session. **[R2: was `stream_quiet_ms`, "absent at close".]** On the
  flagship case — lock 39 s mid-piece, unlock, row on, finish, press End —
  frames are flowing at close, so the old field would have stored `0` and the
  39-second sleep would be invisible in the very row that motivated the spec.
  A close-time scalar can also never yield the gap distribution `quiet`'s
  retuning needs.

This follows the repo's established additive pattern exactly: migrations
`0012` and `0013` each did `CREATE TYPE` plus a nullable `ADD COLUMN`, no
default, no backfill. GET selects columns explicitly, so old clients are
unaffected. **Check open PRs before generating the migration index** — the
index race is a named hazard.

`endedBy` goes back to answering one question — *what ended this session* —
and the new columns answer the independent one.

### The relabel moves rows across predicates. Deliberate, not incidental. **[R2]**

Revision 1 claimed "exactly one user-visible consumer". **False, and the
misses change stored NUMBERS.** `"rower"` is on the admitted side of two
`{finished, rower}` allowlists:

- `useMonitorSession.ts:2630` — `burstEligible`. Teardown now **lingers
  `BURST_LINGER_MS` (2000 ms)** for the summary burst instead of hanging up.
- `monitorRun.ts:1096` — `appendSummaryObservations` now **writes**
  `summaryTotals`/`summaryDetail`/`verificationBytes`.

`summaryTotals` becomes `machine_work_seconds`/`machine_work_meters`, which
flips the saved row onto `storedSummary.ts:618`'s **TIER A** — the branch
deriving the headline distance, time and split from the machine's own totals
rather than the fallback. **The same physical session renders different
headline numbers before and after this change.**

**Ruling: this is correct and we keep it.** Those predicates mean "did the
machine finish it, or did a person end it", and a lifecycle-explained close
IS a person ending it. The rower gets the machine's own numbers where they
previously got a fallback. **But it is a change to what a saved row SAYS, it
is why this spec carries TRIAD weight, and it must appear in release notes
rather than being discovered.**

The remaining consumers, all benign and listed so the enumeration is closed:
`storedSummary.ts`'s TIER B2 allowlist (both values decline; no change),
`monitorRun.ts:431`'s shallow validator, `LogRow.tsx:79`'s sibling comment,
and `buildLinkLostLine` (below). No analytics, CSV or export path exists in
`src/` or `server/`.

### The one user-visible line

`storedSummary.ts:893-902` renders **`"LINK LOST · the app lost the monitor
before the end"`** on equality with `"link-lost"`. For a locked phone that
sentence is false — the app went to sleep. It stops printing in that case,
which is the point rather than a regression.

## RC-37 — same disease, different signal

The link tiers cannot see RC-37: Menu at READY produces **no silence**. 156
frames kept arriving.

```
t= 7.17   wt=8  it=0  ws=0  durRaw=24000  durType=0     <- armed
t=29.05   wt=1  it=1  ws=0  durRaw=0      durType=128   <- Menu
```

**Fix: extend `verifyArmed`'s existing comparison past the verify phase.**
Under an open ARMED run, keep comparing the readback against the program we
sent.

**[R2] Three constraints the pass established:**

1. **Use BOTH constants, not one.** Revision 1 reused
   `STRUCTURE_MISMATCH_TICKS`'s N=3 alone. That constant's own comment says
   it is **"NO LONGER SUFFICIENT ON ITS OWN (hardware walk 5)"** — it carries
   the STABILITY half, `STRUCTURE_MISMATCH_WINDOW_MS` carries the DURATION
   half, *"and a rejection needs both."* Reusing both invents nothing.
2. **The `armed` gate MUST stay** (`driver.ts:4767`, `state === "armed"`).
   The structural quadruple legitimately moves mid-session in healthy
   captures — `rests-finished` goes durRaw 6000→500 with durType 0→128 — so
   an always-on comparator would end live rows. Filtered to armed frames
   across four healthy captures: 447 frames, **2 mismatches**, both
   single-tick arming transitions. Corpus-clean **only** with the gate.
3. **Compare against what we SENT, never a literal `8`** (RC-38).
   `expectedArmedStructure(p)` already does this. `8` is our compiler's
   choice, not a PM5 universal, and we have read one row of
   `OBJ_WORKOUTTYPE_T`.

No aggressive threshold is needed: the wrong structure holds **112
consecutive frames over 56.4 s** in the capture.

## OPEN QUESTION — for James

During `explained-quiet` — the rower unlocks after 39 seconds — **what do
they see live, and what does the saved row say later?** `LOST THE MONITOR`
blames the erg for our own suspension. Silence hides a real hole. A third
option names us. One ruling covers both surfaces. Nothing else depends on it.

## Testing — **[R2: two of three gates were unrunnable]**

**A ring is not a recording.** `walk-2026-08-26/phone-ring.json` and
`walk-2026-08-27/lock-phone-ring.json` are event-log rings (`{seq, kind,
detail}`), zero wire bytes. Revision 1 called the first "real wire data"; it
contains none.

**And no committed capture can ever carry a lifecycle event.** All six
`.jsonl.gz` return zero for `"kind":"lifecycle"`, and none can: the byte
recorder is web/dev-only while the web lifecycle arm is a deliberate no-op.
The platform with the signal has no recorder; the platform with the recorder
has no signal.

**The runnable substitute is precedented.** `lifecycleReplay.test.ts` splices
synthetic lifecycle events into a real capture. Use that.

- Splice a 39 s lifecycle gap into a real recording; assert the verdict
  resolves `explained_quiet`, that neither durable path is reached, and that
  no terminate is sent. **`max_stream_gap_ms ≈ 39410` is a spliced constant,
  not a replayed hardware figure** — say so in the test's own comment.
- Replay `menu-at-ready-recording.jsonl.gz` (a real recording, already
  committed) and assert the session ends rather than sitting at READY. Note
  its `header.program` is absent, as it is for every real capture, so the
  test hardcodes the program.
- Pin the terminate table above, row by row, including the **stale** row.
- Pin that `down` is sticky and dominates a standing `explained-quiet`.
- **The 2026-08-26 replay is probably already green.** Those nine latches
  came from the unconditional resume latch that Phase LM deleted. **Prove it
  red before trusting it**, or replace it with a fixture that latches under
  today's rules (recurring failure #21).
- Every new gate proved red by mutation, transcript in the report.

## Exit criteria

1. A false latch on a healthy link cannot write `endedBy` or send a
   terminate. Proved red first.
2. A lifecycle-explained gap resolves `explained_quiet`, stores `"rower"`
   plus `max_stream_gap_ms`, and shows whatever James rules above.
3. **No verdict, at any tier, sends a wire command.** Both terminate sites
   read `frame.state` with the freshness table above.
4. The continuity door still writes under `explained-quiet`.
5. Menu at READY ends the session, with the `armed` gate and both structure
   constants intact.
6. The TIER A number change is in the release notes.
7. **A hardware walk closes this**, and it owes one measurement revision 1
   did not know it needed: **does a disconnect that happens while
   backgrounded arrive before or after the lifecycle resume?** That ordering
   is the lock-plus-out-of-range hole's only resolution.

## Not in scope

- Retuning `SILENCE_THRESHOLD_MS`, and closing RC-29's watchdog half. Both
  need the native gap distribution `max_stream_gap_ms` exists to gather.
- RC-28/RC-31 — falsified or unwitnessed at the 2026-08-27 walk.
- RC-32, RC-33, RC-34, RC-35, RC-36 — real, queued, independently reviewable.
- RC-38's transcription and PHASE PROTO.
