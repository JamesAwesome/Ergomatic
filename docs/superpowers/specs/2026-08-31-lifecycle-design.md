# The app stops losing rows to the phone's own lifecycle

**Wave F's lifecycle spec.** Design date 2026-08-31. Supersedes the
"pocketed-phone" item's plan-of-record in `ROADMAP.md`, and re-scopes three of
its neighbours on evidence gathered while writing this.

## What and why

A rower puts the phone in a pocket, or locks it, or takes a call. The erg keeps
rowing. Today that can cost the whole row, and it has — in production, on
James's own phone, on a build testers have. This spec fixes the one failure in
that family we can prove, builds the instrument that can prove the next one,
and deliberately declines to guess at the two we cannot yet see.

The fix that ships first is small and deterministic: when the erg throws away
the workout mid-row, the app now notices — it already does, at READY — closes
the record, keeps every interval the rower actually rowed, and takes them back
to the workout. Today it notices and does nothing, because the handler that
sees the event returns early on any live session.

Everything else here is measurement before treatment. The reason is recorded in
§0: the evidence that would settle the remaining questions **no longer exists
and cannot be re-gathered with today's tooling**, so this spec's second act is
building an instrument that works where the defect happens, rather than tuning
predicates against a story.

## §0 — What we know, what we lost, and what we cannot currently see

### 0.1 The pocketed-phone row: the chain, and its one unproven link

The outcome is real and reproduced (James's row, walk leg 4, v0.25.0 build 759,
production). The 2026-08-28 anchor pass established the chain — **PRIMARY**,
`docs/monitor/sessions/walk-2026-08-28/`:

1. The record opened **late**, at machine elapsed 43.04 s, via the
   `rowing-active-fallback` arm (`useMonitorSession.ts`, the single emit site
   inside the branch that calls `createMonitorRun`). A late open costs the
   series trace's head, never an interval actual — those are the machine's own
   0x0037/0x0038 pairs, stored verbatim (`domain/monitor/pm5/parse.ts`).
2. The erg then **dropped its own program mid-row** — RC-37's readback
   signature, no Menu press.
3. The hook **ignored it**, because the `programDropped` handler returns unless
   the phase is `programming` or `ready`.
4. No boundary afterwards; zero actuals stored.

**Link 3→4 is a LEADING HYPOTHESIS, not a proven cause, and this spec does not
claim otherwise.** The committed ring is a curated excerpt and cannot prove an
absence (James's PR #225 review). §1 is warranted regardless: the handler's own
comment concedes the live case was "left alone rather than guessed at", and the
premise it was scoped on is now false (§0.2).

### 0.2 The scoping premise that justified ignoring a live drop is falsified

The handler reads:

> a structural mismatch reported once a run is already live or ended is outside
> this task's own scope (the walk's trigger is READY, never a live session) and
> is left alone rather than guessed at

**"The walk's trigger is READY, never a live session" was true when written and
is false now.** The 2026-08-28 walk produced the same wire signature with **no
Menu press at all, after a 67 s background** — the machine dropped the program
by itself, mid-session. Recorded in `src/news/content/releaseNotes.ts`'s own
v0.26.0 authoring comment, which is why item 3 of those notes is written about
the pocket case rather than the menu button. **SECONDARY** (the release-note
comment); the walk README is the primary record.

This is recurring failure 25's shape exactly: a lower layer reports a failure
(`driver.ts` emits `programDropped`) and the caller proceeds as if nothing
happened.

### 0.3 The full ring is unrecoverable. This is settled, not pending.

The ROADMAP carried "recover the full ring before the lifecycle spec is
written — it settles the causal hypothesis". **It cannot be recovered.**

- `useMonitorSession.ts` writes `ergomatic:last-session-log` **unconditionally
  on every connected teardown**. `readMonitorLogStash`'s own doc states the
  consequence verbatim: it "is written on EVERY connected teardown including a
  failed pairing and a connect-then-cancel, and nothing ever clears it."
  **PRIMARY**, this repo's source.
- One key, one slot, no history. Every later teardown overwrites.
- Connected sessions demonstrably followed walk leg 4: the production count of
  connected rows went **16 (2026-08-28) → 18 (2026-08-30)**, and that counts
  only sessions that saved a row. Cancels and failed pairings overwrite too and
  leave none.

**INFERENCE (high confidence):** the key holds the most recent teardown, not
build 759's leg 4. Ruled unrecoverable by James, 2026-08-31; this spec is
written around the ambiguity.

**A second finding, and it is the one with a future.** The committed excerpt is
13 entries, seq 21–39, missing 22, 26, 31, 33, 36 and 38 — **interior** gaps.
The ring is capacity 500 and tail-keeping (`eventLog.ts`: `entries.slice(
entries.length - capacity)`), so it can only ever lose a contiguous **head**;
at seq 39 the cap never fired at all. **The gaps are not a lossy instrument.
They are a lossy commit** — the whole ring was in hand and 13 of ~39 entries
were hand-picked into the committed file. §2 exists so this cannot recur.

### 0.4 The structural blind spot: recordings and lifecycle events are disjoint

**This is the finding that shapes the rest of the spec.**

Replayable recordings (`pm5-recording/v1`, raw wire bytes, driven through the
real driver by `transports/replay.ts`) are the only artifact that can exercise
a predicate over real frames. **Zero of the eight committed recordings carry a
lifecycle event.** Verified by grep over `docs/monitor/sessions/`: the only
lifecycle-bearing artifacts are *rings*, which record what our own code
decided and cannot be replayed into it.

The cause is structural and permanent under today's tooling:

- The recording tap is **dev/web only**. `pm5-recording` is one of five
  `dist-grep.sh` needles, a CI gate proving the string is absent from every
  production bundle. Recordings can therefore only be made on the laptop, in
  Chrome.
- Lifecycle events — lock, background, resume, call — only meaningfully occur
  **on the phone**, where the tap does not exist.

**So we can never record wire bytes across a real iOS lifecycle event.** This
is recurring failure 19 one layer deeper than that entry states it: not merely
"our instruments sit at or below the transport seam", but "the two evidence
streams we own are mutually exclusive by construction."

**Consequence, and it is binding on this spec:** any desk replay of a
lifecycle-triggered defect would have to *synthesise* the staleness it then
detects. That is recurring failure 11 in its purest form — the app agreeing
with the app about a shape nobody has observed. §3 therefore instruments the
**ring**, which does reach production, does reach the phone, and does already
carry lifecycle events.

### 0.5 Two ROADMAP items re-scoped on evidence

**The non-monotonic TWD co-producer (52→0→64) is correct behaviour, not a
defect.** `continuity.ts`'s `check` convicts a reset only when
`totalWorkDistanceMeters` **and** `elapsedSeconds` **and** `distanceMeters` all
read strictly backward in the same reading. TWD backward alone, with the other
two advancing, is the documented **F2a false kill** the three-axis rule exists
to prevent, and it correctly returns `"continuation"`. **PRIMARY**, that
function's own doc comment.

What the same comment does confess is worse and different, and it is what the
item should become: the distance-goal suppression covers **every one of the six
committed captures**, so the F2b count bound has been compared on **zero
pairs** — "clean but VACUOUS", its own words, and the decision to keep the
suppression was recorded rather than lifted. *This predicate has never been
exercised on data it was not suppressed for.* That is a real gap; it is not
this spec's, and it is re-filed to the open-item register.

**RC-29's measured false-positive rate is pre-fix and no longer stands.** The
ROADMAP entry cites "9 banners in 288 s over a link that never dropped
(`walk-2026-08-26/`)". `docs/superpowers/specs/2026-08-27-link-authority-design.md`
revision 4 already retired that number: `decideResumeLatch` shipped in v0.24.0
and killed it, and the build-759 ring from the following day
(`walk-2026-08-27/lock-phone-ring.json`) shows **one** latch for one 39.4 s
lock with `silent=true` — the watchdog behaving correctly. v0.24.0's own
release note tells testers exactly that.

Nobody has measured the rate since. **Ruled by James, 2026-08-31: RC-29 leaves
this spec.** §6 ships a counter instead of a threshold change, and RC-29
returns to the open-item register as *unmeasured on the current build*. This
is recurring failure 16's second corollary — a sourced premise that was true
when written and false when used.

## §0.6 — Explicitly out of scope, said aloud

Per the antagonist's phase discipline, skips are spoken, never silent.

- **Correct resume.** Build-from-zero, its own M, and the pocketed-phone chain
  does not need it: the late open cost the series trace's head, not the
  interval actuals. Stays a separate Wave F item.
- **The `door` column.** Its own TRIAD change. §5 depends on it and is
  sequenced behind it; nothing else here does.
- **AUD-011/AUD-015.** Separate chunk, three loaders, own Gate 0.
- **`rowingActive`.** Falsified but not dangerous; no behaviour change
  proposed; unchanged by this spec.
- **RC-29's threshold.** See §0.5. §6 measures; it does not tune.

## §1 — The live program drop (TRIAD: a new stored close reason)

### What the rower gets

The erg throws the workout away mid-row. The app closes the record, keeps every
interval actually rowed, and returns to the workout with nudged targets intact
— the same destination James ruled for the READY case ("Loose any new banners.
Just take it back here and remember any nudges."), extended to a live session,
with a line saying what survived.

### Behaviour

The handler branches on phase instead of returning early:

| phase | behaviour |
| --- | --- |
| `programming`, `ready` | RC-37's existing exit, **unchanged** |
| `live` | close the record (below), then exit to the workout |
| `ended` | ignore — the P3b pin, unchanged |

### Mechanism — reuse, do not invent

A live drop is `endByMachine`'s terminate case in everything but name: the
machine has left mid-interval, so CSAFE-DEF footnote 12's reasoning (the
Split/Interval Number is unstable when a workout is terminated mid-interval)
applies verbatim.

- `closeRecord(true, "program-dropped")`.
- **No split hold** — as with a terminate, there is no boundary of that kind to
  wait for.
- **`openBurstHold()` runs unconditionally** — the burst may still land, and
  this is the same arm the corpus's worst case (542 ms, `smoke-terminated`)
  lives on.
- **No `terminate()` is sent.** The machine has already left the program; there
  is nothing of ours left to terminate, and sending one anyway is the single
  thing James's RC-37 ruling rules out. The live arm inherits that ruling.

### Durability gates the exit

**The exit does not happen until the record is durable.** `commit` returns a
`DurableVerdict`; on `"failed"` the session holds in the state PR #239 already
built and James already approved — `COULD NOT KEEP THE RECORD ON THIS PHONE.`
with Retry / Log it anyway — exactly as a failed End does.

Exiting on a failed write would navigate away from a record that never
persisted. That is recurring failure 25, and it is the precise harm this whole
item exists to stop.

### Destination

**The workout, not the log.** This is the one place the ruling diverges from
existing machinery: `phase: "ended"` normally hands off to
`/library/:id/log?from=monitor` via `WorkoutDetail.tsx`'s
`handleConnectedEnded`. This path suppresses that hand-off and unmounts the
interstitial the way `programDropped` already does at READY. The row is saved
and reachable from the log; the rower lands where they can send the workout
again.

### Copy — **GATE 0**

The exit says what survived, reusing the vocabulary v0.24.0 already shipped and
testers already know: `2 intervals kept.` / `Nothing kept.`, counted by
`summaryModel.ts`'s `measuredIntervalCount(actuals)` — the same function the
LOST THE MONITOR banner names, never a second notion of "kept".

**GATE 0 CLEARED — James, 2026-08-31**, on the rendered artifact
`docs/superpowers/specs/2026-08-31-lifecycle-exit-gate.html` (before/after in
portrait, the nothing-kept variant, landscape, the existing failed-write state,
and every pairing's contrast computed against the ground it sits on). Approved
as presented, **including the register of the title copy**, which was the one
thing flagged for challenge — it blames the machine plainly rather than
softening, and the softer alternative was rejected as the way a rower fails to
notice the row stopped.

The approved surface, binding on implementation:

- Title `THE ERG DROPPED THE WORKOUT.`, then the kept count.
- `2 intervals kept.` / `Nothing kept.`, counted by `measuredIntervalCount` —
  the same function the LOST THE MONITOR banner names, never a second notion
  of "kept".
- A new quiet strip at the top of the workout screen, above the title,
  identical in both orientations. That screen has no notice area today; only
  `.baseline-error` exists, and its red is wrong for a message whose point is
  that the rower's work survived.
- **No banner on the live screen.** James's RC-37 ruling ("loose any new
  banners") holds; the one line is added only because something was rowed.
- Contrast, computed and on the artifact: title `--ink` on `--surface`
  17.11:1; body `--ink-3` on `--surface` 7.43:1; bold half `--ink-2` 10.81:1;
  meta `--ink-3` on `--page` 6.69:1. `--ink-5` is excluded from text outright
  (2.75:1 on `--surface`). All tap targets 44 px.

### The new close reason

`CloseReason` gains a fifth member:

```ts
export type CloseReason =
  | "finished" | "rower" | "link-lost" | "program-failed" | "program-dropped";
```

**Why a fifth rather than reusing `"program-failed"`** (ruled by James,
2026-08-31, on the analysis below). Behaviourally the two are identical today —
every consumer is an allowlist keyed on `"finished"`:

- `storedSummary.ts`'s tier-B2 gate is TRUE only for `"finished"`, `null` and
  `undefined`. Its own fix-round-3 comment states the intent verbatim: an
  allowlist "not a denylist — the earlier `!== "rower" && ...` shape fails
  OPEN: a FIFTH `CloseReason` added later … would silently pass this check".
  **A fifth value therefore fails closed by design.**
- `postTestOffer` / `LogSession.tsx` gate on `endedBy === "finished"`.
- `appendSummaryObservations` admits only `"finished"`/`"rower"`, so neither
  option can ever carry machine totals.

So this is not a behaviour choice. It is whether the stored row can tell the
two program failures apart afterwards. `"program-failed"` means *our*
`program()` call failed (P3b); a live drop is the *machine* discarding a
program that succeeded. **With the ring unrecoverable (§0.3), `endedBy` is the
only durable field the next occurrence will leave behind**, and a conflated
label makes a future count impossible — the same blindness that took a field
proof to settle for machine summaries.

**No migration.** The record's never-migrate contract holds: `monitorRun.ts`'s
shallow membership check exists so new `CloseReason` values still load, and
`endedBy` is additive-optional on the stored record.

**Rendering is unchanged in this PR.** `"program-dropped"` renders wherever
`"program-failed"` renders today; any wording that distinguishes them belongs
to the `door` column's Gate 0, not here.

### Test obligation — recurring failure 24

The gate **starts upstream of the producer**. Both halves being well tested is
exactly the condition that hides a broken seam.

One test drives a committed recording through the **real** driver, hook and
store, so the record and its actuals are built by the real pipeline — never a
storage-seeded fixture — and then delivers the `programDropped` event into a
live session. It asserts:

1. the record is durable, and `endedBy === "program-dropped"`;
2. the kept count equals the intervals the capture actually completed;
3. the destination is the workout, not the log;
4. **under a forced durable-write failure, no exit occurs** and the
   COULD-NOT-KEEP state renders.

**On the fixture's honesty:** no committed recording emits `programDropped`
naturally, and per §0.4 none ever can — the detector's own gates are RC-37's
and already exist. What is new here is the *handler*, so the event is
synthesised while every frame, actual and storage write beneath it is real.
That is stated rather than glossed, and it still satisfies RF24: the test
begins before the producer writes and asserts after the reader reads.

**Every assertion above gets a mutation that makes it fail, and the report
states what was mutated and what the failure said** (RF21). Assertion 4's
mutation forges the durable verdict at the seam, not below it — a hook-level
mutation alone would not prove the exit is gated.

## §2 — The ring becomes readable and durable (**prerequisite**)

Promoted from a tail item. If the ring is the only instrument that reaches
production (§0.4), then an instrument that can only be read by destroying it is
the bottleneck for every measurement downstream.

**Two defects, one fix.**

*Reachability.* `readMonitorLogStash` gates the `last-session-log` read on
`fromMonitor`, so the only door — `MONITOR LOG · COPY` — appears solely on
arrival from a just-ended connected session. **To reach the button you must
complete a new session, whose teardown has already overwritten the key you came
to read.** The console path is closed too: no `isInspectable` or
`webContentsDebuggingEnabled` anywhere in `app/ios/App` or
`capacitor.config.ts`, so a TestFlight `WKWebView` is not Safari-inspectable on
iOS 16.4+. **PRIMARY**, this repo's source and native project.

*Perishability.* One key, one slot (§0.3).

**The gate is not the bug and is not removed.** It exists for a real reason,
recorded in its own doc: after a rower's first ever Connect, every log screen
fell through to the localStorage key and wore `MONITOR LOG · COPY` "for the
life of the install — on by-hand entries that never touched a monitor."

**The fix:** keep a short **history** — the last three session logs under
indexed keys, oldest evicted — and add one deliberate, ungated door that lists
them and copies any one. The `fromMonitor` gate on the *inline* row stays
exactly as it is.

That fixes reachability and perishability together, and it is what would have
saved the pocketed-phone ring.

## §3 — The resume-edge frame instrument

Measurement, not treatment. Records what the predicates weigh at the moment the
app comes back, so the next natural occurrence proves or refutes the model with
a `COPY` tap and no walk — the same discipline RC-25's `pause-declared` entry
already follows ("records what was MEASURED and asserts no cause").

At the resume edge, one ring entry carrying:

- the arrival gap since the last 0x0031, against the ~2.2/s baseline;
- whether the first post-resume frame repeats the pre-background `freezeKey`
  triple (`distance|split|spm`) verbatim;
- how many consecutive identical frames follow it;
- the raw `rowingState` byte, which `parse.ts`'s strict `rowingState === 1`
  otherwise flattens to `false` with no way to say which non-1 value it was.

Edge only, never per frame — a per-frame entry would bury the ring it is
written into.

## §4 — The freeze predicate (**waits on §3**)

**The hypothesis.** `freezeKey` is `distance|split|spm`, and `isPausedRun`
fires when those three hold identical for `PAUSED_FRAME_HOLD` frames after a
pull. The predicate **cannot distinguish "the rower stopped" from "the stream
stopped delivering fresh frames"**, and the 2.5 s liveness watchdog catches
only *no* frames, never *identical repeated* ones. The production false
positive — `pause-declared` at **66 spm**, which is not a rowing rate — is
consistent with a stale reading rather than a stopped rower.

**Consistent with is not evidence of, and this spec does not fix it yet.**
Recommendation accepted by James, 2026-08-31: the predicate waits on §3's
number. A predicate re-tuned against a shape nobody has measured is how RC-24
shipped two gates that could not go red.

When §3 reports, the fix's shape is a third input separating "the machine's
reading did not change" from "we did not get a new reading" — frame arrival
timing being the candidate the instrument is built to evaluate.

## §5 — The in-flight interval's metres (**behind the `door` column**)

On a single-interval workout — the tester's own 2000 m "Beam Sea" — a mid-row
close gives `kept = 0`, which was the **majority** outcome of walk leg B. §1
inherits that: banking "what was rowed" banks nothing when no boundary was
reached.

The machine's interval pairs exist only at boundaries; mid-interval there is
only our own live frame reading. So a stored partial is **our** number, not the
machine's, and must be stored as unmeasured — it can never be tier A, and
`measuredIntervalCount` correctly will not count it toward "N intervals kept."

That is precisely the `door` column's PARTIAL vocabulary — James's own words,
_"I want it to say I stopped, not silently show a shorter piece that looks like
I planned a 250 when I meant 500 and bailed."_ **This section lands with or
after that migration, never before**, and its summary copy is part of that
item's Gate 0. Discharges Wave F's in-flight-metres item.

## §6 — The RC-29 latch counter

No threshold change (§0.5). Count `decideResumeLatch` latches per session and
record the count to the ring, so the rate nobody has measured since v0.24.0
becomes available from ordinary use. Rides §3's ring work.

## Ordering and PR decomposition

| PR | Contents | Gates |
| --- | --- | --- |
| 1 | §1 live drop arm + `"program-dropped"` | TRIAD; Gate 0 on the exit copy; antagonist delta pass |
| 2 | §2 ring history + ungated door, §3 resume instrument, §6 latch counter | one coherent chunk: all three are ring work |
| 3 | §4 freeze predicate | opens only when §3 has reported |
| 4 | §5 partial metres | behind the `door` column's migration |

PR 1 ships alone: it carries TRIAD weight and bundling it would make its own
gate harder to run. PRs 2's three parts group deliberately — one reviewer, one
risk model, per the standing "group the work" rule.

**The three stale Wave F riders** (the `warmup` `DROP COLUMN`, the legacy
`LogSeed.kind` guards, RC-12's unreconciled comment) ride the **`door`
column's** migration PR, per James's ruling of 2026-08-31. They are not in this
spec's PRs.

## ROADMAP changes this spec forces

Landed in the same commit as this spec, per recurring failure 17.

1. The pocketed-phone item's mechanism narrative → replaced by §0.1, with link
   3→4 labelled a hypothesis.
2. "Recover the full ring" → **struck**, with §0.3's finding recorded; replaced
   by §2.
3. The TWD co-producer → re-scoped per §0.5 and moved to the open-item register
   as "the continuity count bound has never been exercised unsuppressed".
4. RC-29 → out of Wave F, back to the register as unmeasured on the current
   build, with the stale 9-banner citation removed.
5. The in-flight-metres item → pointer to §5 and its `door` column dependency.
6. Correct resume → unchanged, with §0.6's note that this spec deliberately
   excludes it.
