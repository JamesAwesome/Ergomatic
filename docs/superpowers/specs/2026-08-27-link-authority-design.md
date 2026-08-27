# The link authority — what we know about the erg, and what that licenses

**REVISION 3 (2026-08-27).** Revision 2 was BLOCKED by a second antagonist
pass and gated by the PM. Changes marked **[R3]**; revision 2's own markers
kept as **[R2]**. Findings are landed in `.claude/agents/antagonist-ledger.md`
("Phase LA anchor pass" and "Phase LA re-pass") and `.claude/agents/pm-ledger.md`.

**This is a Phase RC spec, not a new phase.** Its work is RC-29, RC-30 and
RC-37, all already Phase RC items. "Phase LA" was a codename that never
existed in the ROADMAP — recurring failure #17, and it is retired here.
`link-authority` remains the spec's codename only.

## The outcomes this drives

**One sentence: the app stops asserting things about the erg that it does not
know.** Ranked by what they cost the person rowing.

1. **A rower who pockets their phone stops being told their erg vanished.**
   Nine red LOST THE MONITOR banners in 288 s over a link that never dropped.
2. **A session that was fine stops being permanently recorded as damaged.**
3. **A saved row stops carrying a sentence that is false** — *"the app lost
   the monitor before the end"*, printed where the app lost nothing.
4. **The app stops walking away from a piece still running on the erg.**
5. **The app loses the ability to kill a live piece.** A terminated partial
   leaves no trace in PM5 memory, so those metres are gone for good.
6. **A rower who ends the workout at the erg is not left staring at a screen
   that thinks it is still running.**
7. **We gain the one measurement that unblocks the rest** — the frame-gap
   distribution on the platform every real row comes from is UNMEASURED, by
   the admission of the constant that depends on it.

**What this does NOT do:** it does not make the app work while backgrounded.
iOS suspends the WebView and this spec does not fight that. It makes the app
HONEST about the gap instead of blaming the machine.

## What and why

Three defects share one cause: we hold beliefs about the monitor that the
monitor has abandoned, and let those beliefs decide things they cannot carry.

- A 2.5 s frame-silence threshold, built to flip a banner, writes
  `endedBy: "link-lost"` and suppresses `terminate()` (RC-29).
- Teardown sends TERMINATE off our derived `phase === "ready"` (RC-30).
- Menu at READY makes the PM5 drop the program; we never notice (RC-37).

## The evidence

Revision 1 proposed *only a transport-confirmed disconnect may write or move
the erg*. The walk of 2026-08-27 killed it: a phone locked 39.4 s produced
`resume gap=39410ms`, `framesWhileHidden=1`, `phase=live`, and **no
`disconnected` event**. That rule would have fired on nothing.

What survived: the lifecycle event fires, so "the app was asleep" is
positively identifiable. That is the axis.

## The authority — WHERE it lives **[R2]**

Revision 1 claimed `withLiveness` "already accepts a
`LivenessLifecycleEvent`". **False** — that type is the decorator's record of
its own transport events (`connect | write | disconnect | link-drop | silence
| recovery`), a return value of `snapshot()`. App lifecycle reaches it only
via `markSuspect()`, which by a Phase LM exit criterion refuses to carry a
cause.

**The verdict is computed in `useMonitorSession`**, where the lifecycle
listener (`:2962`) and the decorator's snapshot already meet.

## The verdict

| verdict | how it is known |
| --- | --- |
| `live` | frames arriving |
| `explained-quiet` | silence past threshold AND a lifecycle resume accounts for the gap |
| `quiet` | silence past threshold, no explanation |
| `down` | the transport's `onDisconnect` fired |

### Lifetime, priority, and reset **[R2, extended R3]**

`silent` clears on the FIRST arriving frame; `frameSilence` clears
`BANNER_RETRACT_HYSTERESIS_MS` (10 000 ms) later. **The verdict is as sticky
as `frameSilence`** — computed from `silent` it would read `live` through the
window where End still writes `link-lost`, and the spec would change nothing.

- `down` is **sticky and dominant** for the session. Safe: no reconnect path
  exists to break (`:2394-2398`, auto-reconnect is descoped).
- **[R3] The reset point is `connect()`.** `connect()` clears `phase` and
  `frameSilence` (`:2809`) but NOT `state.frame`. Both the verdict and the
  cached frame reset there, or a re-Connect in the same mount inherits a
  stale `down` (permanent false `link-lost` on every later session) and reads
  the previous session's frame.

**The lock-plus-out-of-range hole:** a genuine loss arriving with a lifecycle
explanation classifies `explained-quiet`. `down`'s dominance corrects it —
**if** iOS delivers the disconnect. Apple documents you do not learn of one
until resume, and is silent on ordering relative to the plugin's `resume`.
**Owed at the walk.** Until measured, the exposure is that such a loss stores
`"rower"` plus evidence.

**Not in the taxonomy:** jetsam, force-quit, battery death. No code runs, so
no verdict and no row. The four tiers are exhaustive only over cases where we
are alive to classify.

## The licensing rule **[R3: corrected, this was the BLOCKER]**

> A derived verdict may change what a rower **sees**. Only `down` or `quiet`
> may change what is **stored**. **No verdict may send an UNATTENDED wire
> command.**

### Revision 2 broke the End button. **[R3]**

Revision 2 said the freshness table applies to `endSession` and teardown
"identically". **`endSession` IS the End button** (`ConnectedSurface.tsx:388`
→ `session.endSession()`; the file's own comment: *"`endSession()` already
closes the record and terminates the machine"*), and every ordinary End press
mid-piece is `fresh + rowing`, which that table answered **no**. The app
would have closed the record, unmounted, and left the piece running — the
exact harm RC-29 names.

**The error: replacing "who decided" with "what state", then applying a state
gate to a button — which is to say, to the person pressing it.**

### The four terminate sites, and which rule governs each **[R3: was two]**

| site | trigger | rule |
| --- | --- | --- |
| `endSession` (`:3158`) | **the rower presses End** | ATTENDED. Terminate unconditionally, exactly as today's link-up branch does. Human intent is not a verdict. |
| `cancel` (`:3201`) | **the rower presses Cancel** | ATTENDED. Unconditional. Note it fires off derived `phase === "ready"` today — RC-30's disease in RC-37's scenario — so its existing phase gate is replaced by the machine-state table below, but the terminate itself is never suppressed once the rower asked. |
| `teardown` (`:2519`) | unmount, nobody asked | UNATTENDED. Machine-state table. |
| `program()`'s catch (`:3117`) | a failed arm | UNATTENDED. Machine-state table. |

### The machine-state table, for UNATTENDED sites only **[R3]**

**It NARROWS the existing `phase` gate; it does not replace it.** Teardown
still requires `phase === "programming" || "ready"` (`:2513-2517`) as a
necessary condition. All **six** `MonitorFrame["state"]` members
(`domain/monitor/types.ts:177`) are enumerated — revision 2 listed five and
silently denied `"terminated"`.

**Freshness clock: `silent` (2.5 s), NOT `frameSilence`.** **[R3]** Revision 2
said "`stream_quiet_ms` under threshold" — a field it had itself renamed, so
the predicate had no source. Using `frameSilence` would suppress unattended
terminates for 10 s after every resume.

| last `frame.state` | send? |
| --- | --- |
| absent | **yes** — the phase gate already restricts this to a session we armed |
| `armed`, `idle`, `finished`, `terminated`, fresh | **yes** |
| `rowing`, `resting`, fresh | **no** — a piece is live |
| any, **stale** (`silent`) | **no** |

**[R3] The "absent" row's justification is corrected.** Revision 2 said "the
pre-stream window is measured at 3775-4454 ms". That window is *between the
last `subscribe` and the first 0x0031* (`liveness.ts:132`) — post-CONNECT,
not post-ARM. It cannot mean "nothing can be live". The row is safe because
the **phase gate** restricts it, not because of that measurement.

**[R3] The stale row LOSES coverage, stated rather than sold as pure gain.**
Sequence: arm → phone locks → rower foregrounds and taps the tab bar at
READY. Today teardown terminates (`DEVIATIONS.md` row 70, added for exactly
this). Under the table it does not, and the next rower finds someone else's
intervals. Accepted: an abandoned arm is recoverable in one press; a
destroyed live piece is not.

### The continuity door **[R2, narrowed R3]**

`applyContinuityCheck` opens `if (!frameSilence) return run;` and writes
`endedBy: "link-lost"` via `completeContinuityReset`. Under revision 1's rule
it would have been switched off for the case it was built for.

**[R3] Stated as a scope, not a principle.** Revision 2 wrote "a close backed
by independent wire evidence is licensed by that evidence" — a principle
invites the next writer to self-certify, and the continuity door's evidence
is NOT independent of the silence (it cannot fire without `frameSilence`).
The honest statement: **the link tier governs exactly ONE writer,
`endSession`'s `linkGone`.** Every other `endedBy` writer —
`completeMonitorRun`, `completeContinuityReset`, `completeInterruptedRun` —
is untouched.

### What `quiet` does not fix

`quiet` keeps durable-write rights on the same 2.5 s threshold. RC-29's own
text: *"the WATCHDOG producer is untouched"*. **This spec narrows RC-29 to
the lifecycle-explained subset; it does not close it.** The threshold's
native adequacy is disclaimed in its own constant's comment. Closing RC-29
needs the measurement below.

## What gets stored **[R3: the field still did not measure the thing]**

Three additive nullable columns. **`endedBy`'s enum is untouched.**

- **`link_verdict_at_close`** — new pgEnum (`live` / `explained_quiet` /
  `quiet` / `down`).
- **`resume_gap_ms`** — **[R3, replaces the sole reliance on a max]** the
  largest lifecycle resume gap this session, i.e. `decideResumeLatch`'s own
  `gapMs`, already computed and already logged as `resume gap=39410ms`.
  **This is the field that records the sleep.**
- **`max_stream_gap_ms`** — the longest frame gap. Kept for the RC-29
  measurement, NOT as the sleep record: `framesWhileHidden=1` means one frame
  inside a 39 s suspension splits it into two smaller gaps, and
  walk-2026-08-26's `framesWhileHidden=61` splits it further. Computed in the
  hook's `handleFrame` (`withLiveness` stays unchanged).

**[R3] Migration precedent corrected.** Revision 2 cited `0012` and `0013`;
`0013` is `DEFAULT 'manual' NOT NULL` twice, the opposite of the claimed
pattern. The real precedents are **`0012`** (CREATE TYPE + nullable ADD
COLUMN) and **`0016`** (three plain nullable ADD COLUMNs). Check open PRs
before choosing the index.

### The relabel — narrower than revision 2 claimed, and guarded **[R3]**

The cohort is: End pressed inside the 10 s window, AND the machine
independently ended the workout during the blind window, AND 0x0039 lands
inside `BURST_LINGER_MS` (2000 ms). If the machine is still mid-piece — the
flagship case — no summary exists and TIER A is unreachable.

**And the wire half is the PRODUCER of the stored half's input** (PM gate):
declining to terminate means the machine never ends the workout, so 0x0039
never fires. These two halves were designed independently and interact.

**Condition A — the summary needs an identity check, and it is free.** The
cohort that changes numbers is exactly the cohort where the machine may have
moved on. Both guards, conjoined, before `appendSummaryObservations` writes:

1. **0x0039's own `workoutType` must equal what we programmed.** Already
   decoded, read today only inside a log template (`driver.ts:2565`). A free
   row carries the unprogrammed shape. Necessary, not sufficient — say so.
2. **The machine's totals must not be BELOW our own recorded actuals.** A
   fresh piece resets near zero. A monotonicity floor, not an oracle.

On failure: write nothing, fall through. Prefer the false negative.

**[R3] The TIER A ruling is restricted.** Revision 2 ruled the number change
correct outright. It is right for "finish, then End" and **wrong-signed for
the mid-interval subset the relabel actually moves**: walk-2026-08-27 shows
0x0039 decoding **500 m** for a piece where the rower had rowed **559.8 m**,
because the terminated partial *"appears nowhere in the PM5's memory"*. TIER
A can render a SMALLER number than the rower rowed, by up to one interval.
**`storedSummary.ts:646-652` asserts the opposite in prose and the capture
wins; reconcile that comment in the same change.** The before/after
arithmetic goes to Gate 0.

**Condition B — a shipped note is falsified.** `releaseNotes.ts:96` (v0.23.0)
tells testers *"a session you ended early, or one whose link dropped, keeps
the headline it was saved with"*. Half of that becomes false. Correct it in
the NEW version's entry, never appended to the old one, with a
from-this-build-forward clause: old rows stay fused forever.

## The saved row's line **[R3: removal alone was an over-claim]**

Revision 2 deleted `"LINK LOST · the app lost the monitor before the end"`
for this cohort and printed nothing. **Wrong**: the same change makes the row
eligible for `MACHINE CONFIRMED · WORK ONLY`, so a row would assert
confirmation over 39 s nobody watched. And `max_stream_gap_ms`/`resume_gap_ms`
would have had **no reader** — a stored column nothing displays is a claim
nothing can disprove, on a branch whose thesis is that our instruments were
blind.

**Replace it.** The gap line is the field's reader, which makes it
self-checking on day one.

**Condition C — floor it.** v0.24.0 promised testers the banner stopped
firing on a Control Centre swipe; a permanent row line for a 3 s blip
re-breaks that promise more durably. Print only above a named constant with
its own comment. **10 000 ms** as the starting value, sanity-checked at the
walk.

**[R3] Which rows still print LINK LOST.** Revision 2 asserted the sentence
"stops printing" while its own carve-out keeps `completeContinuityReset`
writing `link-lost`. Both were true of different subsets and the spec said
so of neither. Correct: **continuity-door closes keep `endedBy: "link-lost"`
and keep printing the line** — for them it is true. Only `endSession`'s
lifecycle-explained closes change.

## RC-37 **[R3: the action half was deleted unmarked]**

```
t= 7.17   wt=8  it=0  ws=0  durRaw=24000  durType=0     <- armed
t=29.05   wt=1  it=1  ws=0  durRaw=0      durType=128   <- Menu
```

**Detection:** keep comparing the readback against the program we sent while
the machine reports `armed`.

1. **BOTH structure constants.** `STRUCTURE_MISMATCH_TICKS`'s own comment:
   *"NO LONGER SUFFICIENT ON ITS OWN… carries only the STABILITY half…
   a rejection needs both."* Use `STRUCTURE_MISMATCH_WINDOW_MS` with it.
2. **The `armed` gate MUST stay** (`driver.ts:4767`). The quadruple
   legitimately moves mid-session; filtered to armed frames across four
   healthy captures, 447 frames, 2 mismatches, both arming transitions.
3. **Compare against what we SENT, never a literal `8`** (RC-38).

**[R3] Action, restored.** On a sustained mismatch the session ends the way a
machine-side terminate ends it: the record closes `endedBy: "rower"` (the
rower did end it, at the erg), no terminate is sent (the machine has already
left), and the surface shows the RC-37 copy below. **No saved row is written
if the session never started** — a pre-row session opens no record.

**[R3] It is a new comparator, not a lifetime extension.** The state
(`mismatchStreak`, `mismatchSince`, `expected`) lives on `pendingVerify`,
assigned once in `verifyArmed` and nulled on resolve. Running past the verify
phase needs persistent state plus a retained `expectedArmedStructure(p)`.
Small, but say it.

## Copy — Condition D, and the app has none today **[R3]**

**The app has ZERO post-end copy about the machine's state.** Today
`endSession` returns without terminating whenever `linkGone` and tells the
rower nothing. A spec that makes "we left the erg running" more common must
add the first such line; trading a silent destructive failure for a silent
non-destructive one is the same disease.

Proposed, in the banner's title-plus-four-words grammar
(`ConnectedSurface.tsx:691-693`), for **Gate 0**:

| case | copy |
| --- | --- |
| resumed after a sleep | **`THE APP WAS ASLEEP`** · `39s missed.` |
| saved row, that cohort | **`ASLEEP · 39s the app did not see`** |
| unattended terminate declined, machine known live | **`STILL RUNNING ON THE ERG`** · `press Menu to stop it` |
| unattended terminate declined, state stale | **`WE COULD NOT STOP THE ERG`** · `check the monitor` |
| RC-37 | **`THE ERG CLEARED IT`** · `Send it again.` with the re-send affordance present |

Naming ourselves does not violate the banner's no-cause rule — that rule
forbids inventing a cause for the ERG's behaviour. Here the cause is us, and
it is measured.

## GATE 0 — James approves the rendered design BEFORE implementation

Binding, per CLAUDE.md's standing design-gate rule. Presented rendered, never
described:

1. The connected screen during `explained-quiet`, against today's `LOST THE
   MONITOR`, both orientations, portrait first.
2. The saved row before and after — the LINK LOST line present then replaced
   by the gap line, **and the TIER A headline numbers alongside, with the
   500-vs-559.8 arithmetic shown**, because it must read as an improvement
   rather than a row that quietly moved.
3. The four new copy lines above.
4. Every colour pairing's contrast ratio computed and stated as a number,
   re-derived from `tokens.css`.

## Constraints **[R3: restored, revision 2 deleted this section unmarked]**

- **Additive-only API**: new nullable fields, no enum member removed.
- **TRIAD weight** — full antagonist pass (done, twice) and a PM gate (done).
- **`SILENCE_THRESHOLD_MS` does not change.**
- **Do not touch `livePace`.** RC-27's surface is deliberately unchanged.
- **No em-dashes in user-facing strings** — binding on all the copy above.
- 44 px targets and WCAG AA.

## Testing

**A ring is not a recording**, and no committed capture can carry a lifecycle
event: the byte recorder is web/dev-only, the web lifecycle arm a deliberate
no-op. Use `lifecycleReplay.test.ts`'s splice precedent, which already
hand-transcribes the program.

- Splice a 39 s lifecycle gap; assert `explained_quiet`, neither durable path
  reached, no unattended terminate sent. Spliced constants labelled as such.
- **Pin that End STILL terminates** on `fresh + rowing`. This is revision 2's
  blocker and needs a test that would have caught it.
- Replay `menu-at-ready-recording.jsonl.gz` (real, committed); assert the
  session ends. `header.program` is absent, so hardcode the program.
- Pin the machine-state table row by row, all six states, including `stale`.
- Pin `down`'s stickiness AND its reset at `connect()`.
- Pin the summary identity guard rejecting a foreign `workoutType`.
- **The 2026-08-26 replay is probably already green** — those latches came
  from a latch Phase LM deleted. Prove it red first or replace the fixture.
- Every new gate proved red by mutation, transcript in the report.

## Shape — two PRs, and the order is load-bearing **[R3]**

- **PR 1 — "who owns the machine's state"** (not TRIAD): the four terminate
  sites, the machine-state table, RC-37's comparator, and the three
  machine-state copy lines. No stored shape, no migration.
- **PR 2 — the link authority** (TRIAD, lands alone): the verdict, the
  relabel, the three columns + migration, the summary identity guard, the row
  line and its floor, the release-note obligations.

**Never the reverse.** Today `linkGone` suppresses `endSession`'s terminate;
the relabel UN-suppresses it. PR 2 first would send a terminate into a
possibly-live piece — the failure this spec exists to prevent.

## Exit criteria

1. A false latch on a healthy link cannot write `endedBy` or send an
   unattended terminate. Proved red first.
2. **End still terminates the machine**, mid-piece, every time.
3. A lifecycle-explained gap resolves `explained_quiet`, stores
   `resume_gap_ms`, and shows the Gate 0 copy.
4. The continuity door still writes, and its rows still print LINK LOST.
5. Menu at READY ends the session, with the `armed` gate and both structure
   constants intact.
6. Every `endedBy` consumer enumerated, with its new behaviour recorded.
7. The TIER A change and the v0.23.0 correction are in the release notes.
8. **A hardware walk closes this**, owing three measurements: the
   disconnect-vs-resume ordering; whether 0x0039 fires on a terminate WE
   send; and whether a summary emitted while suspended survives to resume.

## Not in scope

- Retuning `SILENCE_THRESHOLD_MS`; closing RC-29's watchdog half.
- RC-28/RC-31 — falsified or unwitnessed.
- RC-32, RC-33, RC-34, RC-35, RC-36.
- RC-38's transcription and PHASE PROTO.
