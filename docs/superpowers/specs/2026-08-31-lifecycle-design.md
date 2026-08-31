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
the record, keeps every **completed** interval (an in-flight interval is still
discarded until §5 lands behind the `door` column, and on a single-interval
piece that means nothing is kept — stated, not glossed), and hands off to the
log screen like every other connected ending. Today it notices and does
nothing, because the handler that sees the event returns early on any live
session.

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
- One durable slot, no history. Every later teardown overwrites. (Precisely:
  teardown writes TWO stashes — `sessionStorage["ergomatic:last-monitor-log"]`
  as well — but the second is strictly MORE perishable, dying with the web
  context, so it strengthens rather than weakens the claim. Antagonist pass,
  attacked and held.)
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
**Upgraded from inference to PROVEN at the antagonist pass:** `eventLog.ts`'s
`record()` pushes unconditionally with a monotonic `nextSeq` — no filter, no
conditional, no skip — so interior gaps cannot be produced by the ring at all,
and `git show` of the committing revision confirms the file was never fuller.

### 0.4 The structural blind spot: recordings and lifecycle events are disjoint

**This is the finding that shapes the rest of the spec.**

Replayable recordings (`pm5-recording/v1`, raw wire bytes, driven through the
real driver by `transports/replay.ts`) are the only artifact that can exercise
a predicate over real frames. **Zero of the TEN committed recordings carry a
lifecycle event** (count corrected at the antagonist pass — the first draft
said eight without listing the directory; `find docs/monitor/sessions -name
"*.jsonl.gz"` returns ten, each grepped, zero hits). The only
lifecycle-bearing artifacts are *rings*, which record what our own code
decided and cannot be replayed into it.

**CORRECTED at the antagonist pass: this is a documented SCOPING DEFERRAL, not
an impossibility — and the repo had already written the honest version.** The
first draft called it "structural and permanent … by construction … never",
and attributed it to `dist-grep.sh`. Both wrong. `dist-grep.sh` proves the
*consequence* (the tap is absent from production bundles); the *cause* is two
adapter decisions: `adapters/monitorTransport.ts`'s `isNative()` branch takes
native straight to Capacitor BLE without passing the tap, and
`adapters/appLifecycle.ts`'s web arm is a deliberate no-op.
`recording.ts:44-59` states it and ends with the load-bearing line, quoted:

> "Both ends would have to change first — a recorder on the native arm, or a
> web arm that reports transitions again — and neither is this task's to
> decide."

**PRIMARY**, and already deferred under Phase LM. Re-deriving a recorded
deferral as an impossibility is RF18's exact shape, committed while citing it.

What survives, restated honestly: **today, and until someone deliberately
builds one of those two ends, no recording can carry a lifecycle event** —
recordings are laptop-only and lifecycle events are phone-only. RF19 one layer
deeper: the two evidence streams are currently mutually exclusive.

**Consequence — a COST JUDGMENT, not an impossibility, and re-argued as one:**
building either end (a native recorder, or a web lifecycle arm) is real work
with its own risk, and even then a desk replay of a lifecycle defect would
synthesise the staleness it detects until a real phone capture exists —
recurring failure 11's shape. The ring already reaches production, already
reaches the phone, and already carries lifecycle events. §3 therefore
instruments the **ring** as the cheap, honest first move; the recorder gap
itself is registered in the open-item register so the deferral stays visible.

### 0.5 Two ROADMAP items re-scoped on evidence

**The non-monotonic TWD co-producer (52→0→64) is correct behaviour, not a
defect — with the mechanism stated precisely** (the first draft's version was
corrected at the antagonist pass). `continuity.ts`'s `check` has TWO
conviction signatures — the three-axis rule AND F2b's interval-count bound —
and a distance-goal suppression in FRONT of both that short-circuits to
`"continuation"` before either runs. The leg-4 reading fails the three-axis
signature on its face (TWD backward, elapsed and distance both forward — the
documented **F2a false kill** that rule exists to prevent), so the verdict is
right either way; but the committed ring does not record the program's
interval kinds, so **which branch actually produced it — the rule or the
blanket suppression — is unestablished**, and the first draft credited the
rule without knowing that. **PRIMARY**, the function's own body and doc
comment.

What the same comment confesses is what the item becomes: the distance-goal
suppression covered every committed capture when that comment was written, so
the F2b count bound had been compared on **zero pairs** — "clean but VACUOUS",
its own words. **And that corpus fact has an expiry date the first draft
missed, in the exact RF16-corollary shape this spec invokes elsewhere:** the
comment dates to 2026-08-25, and
`walk-2026-08-28/rest-boundary-recording.jsonl.gz` — landed three days later —
is described by its own walk README as "**TIME-ONLY by design** (no distance
interval anywhere)" with a real rest boundary. A committed, non-suppressed
pair source now exists, so the re-filed item may be answerable at the desk
today. Re-filed to the open-item register with that pointer.

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

## §1 — The live program drop (TRIAD: a new stored close reason AND a server migration)

**REVISED after the 2026-08-31 antagonist full pass (verdict REVISE) and
James's same-day destination ruling ("Just go to log").** The pass broke the
first draft three ways: the workout-screen exit left the closed record with
zero doors (both `?from=monitor` producers were suppressed or gated on an open
run), the "reuse the READY exit AND hold #239's failure state" pair was
structurally impossible (that exit is a full `INITIAL_STATE` reset, and the
COULD-NOT-KEEP surface renders only inside `ConnectedSurface`'s ended frame),
and "no migration" was false server-side. The destination ruling resolves the
first two at once; the third is now owned honestly below.

### What the rower gets

The erg throws the workout away mid-row. The app closes the record, keeps every
interval actually rowed, and lands on the log screen with the row in front of
them — the same hand-off every other connected ending already makes — under a
strip saying what happened and what survived.

### Behaviour

The handler branches on phase instead of returning early:

| phase | behaviour |
| --- | --- |
| `programming`, `ready` | RC-37's existing exit, **unchanged** |
| `live` | close as an ended session (below); the normal ended hand-off runs |
| `ended` | ignore — the P3b pin, unchanged |

### Mechanism — reuse the ENDED path, not the READY exit

The live arm is a third `endByMachine`-shaped close, not a variant of the
READY exit. It runs `closeRecord(true, "program-dropped")` and flips
`phase: "ended"` with `endedBy: "machine"` (the SESSION field — distinct from
the record's `CloseReason`; the two vocabularies never mix, and the first
draft failed to say which it meant). From there everything is the machinery
that already exists: the ended frame renders, `WorkoutDetail.tsx`'s
`handleConnectedEnded` navigates to `/library/:id/log?from=monitor` untouched,
and the log door — the record's owner per `Today.tsx`'s own stated premise —
receives it.

**The interim ended frame must not lie (James's review of rev 2, P1-2).**
React renders the ended frame before the passive effect calls `onEnded()`, so
for at least one visible frame the rower sees the ended surface — and
`ConnectedSurface`'s machine-ended copy says `The monitor finished it. Your
numbers are kept.`, which is false here: the erg dropped the workout. The
ended frame for a program-dropped close therefore renders **the approved Gate
0 words** — `THE ERG DROPPED THE WORKOUT.` plus the kept count — branching on
the RUN's `endedBy === "program-dropped"` (the same authority the log strip
uses; never a new session-state value). This is the strip's copy appearing one
screen early, not a new surface, and it is on the Gate 0 artifact. **Owed
test: a rendered-path test that inspects the ended frame BEFORE the route
effect fires** and asserts the drop copy, not the finish copy.

- **No split hold.** Corrected reason, per the antagonist's item 5: the first
  draft claimed "the machine has left mid-interval, so CSAFE-DEF footnote 12
  applies verbatim" — but at detection the machine is NOT mid-interval.
  RC-37's emit site sits inside `toMonitorFrame(raw).state === "armed"`
  (`driver.ts`), and the walk README confirms it on hardware (`frame
  state=armed elapsed=50.81` beside RC-37's shape): the PM5 is already back at
  WaitToBegin holding its unprogrammed default, ≥3 ticks and ≥2 s before we
  hear about it. The stronger, correct reason: **there will never be another
  boundary** — the program that would produce one is gone.
- **No burst hold.** The first draft's "openBurstHold() runs unconditionally"
  was a no-op as written — that function's own predicate is an allowlist of
  two (`run.endedBy !== "finished" && run.endedBy !== "rower"` returns false),
  which the draft mis-paraphrased as "keyed on finished". It was also
  pointless: `appendSummaryObservations` admits only `"finished"`/`"rower"`,
  so a burst could never be recorded onto this run — and no capture shows a
  PM5 emitting a summary burst after an unattended drop (the machine is at
  WaitToBegin with no WORKOUTEND; asserting a burst would be a claim on the
  machine's behalf with no evidence — the PAUSED-state class of error).
  **The close owes no hold conditions**, so `noHoldCloseVerdict(false)` runs
  the durable verify synchronously in the same patch — by design now, where
  the first draft got a synchronous verify only by accident.
- **No `terminate()` is sent.** Unchanged: the machine has already left the
  program; sending one anyway is the single thing James's RC-37 ruling rules
  out. The live arm inherits that ruling.

### Durability gates the hand-off — through the machinery that exists

Because the close goes through the normal ended patch, the durable verdict
lands in `holdError` the same way a failed End's does, and a `"failed"` write
renders #239's `COULD NOT KEEP THE RECORD ON THIS PHONE.` with Retry / Log it
anyway **inside the ended frame, where that surface actually lives**. No new
gating mechanism, no state the reset destroys. The hand-off to the log fires
only on the paths it already fires on.

Exiting on a failed write would navigate away from a record that never
persisted — recurring failure 25, the precise harm this item exists to stop.
The first draft promised this and specified a mechanism that could not deliver
it; this one gets it from the ended frame for free.

### The migration, owned

**"No migration" was false.** Three server-side facts the first draft never
looked at, all found by the antagonist pass and verified in source:

1. `server/db/schema.ts:68` — `endedBy` is a **`pgEnum`**, a real Postgres
   TYPE. The sixth value needs
   `ALTER TYPE "public"."ended_by" ADD VALUE 'program-dropped';` — a
   migration.
2. `server/routes/data.ts:164` — `endedByError` hard-rejects any value outside
   `ENDED_BY_VALUES` with a 400, and `LogSession.tsx` posts
   `monitorRun.endedBy` straight through. **Unwidened, a program-dropped row
   cannot be logged at all** — the validator fails the whole save.
3. `server/stores/logs.ts:40` — `EndedBy` is a **hand-copied literal union**,
   not derived from `CloseReason`. Widening the client union typechecks clean
   and fails only at runtime on a phone. The widening must touch all three
   sites in the same commit, and the PR adds the seam test that makes the
   compiler's blindness irrelevant: drive a program-dropped row through
   `POST /api/logs` and assert 200 (recurring failure 24 — "a seam gap gates
   the PR that creates it"). Where cheap, derive the server union from a
   shared source so the next widening cannot silently miss a site; if not
   cheap, the seam test is the gate.

Client-side, the never-migrate contract holds as originally stated:
`monitorRun.ts`'s shallow membership check loads the new value, and `endedBy`
is additive-optional on the stored record. The four client consumers the first
draft enumerated are correct and unchanged (`storedSummary.ts`'s tier-B2
allowlist fails closed by design; `postTestOffer`/`LogSession` gate on
`"finished"`); the contract round-trip test (`storeContracts.ts`) widens with
the union.

### Copy — **GATE 0**

The exit says what survived, reusing the vocabulary v0.24.0 already shipped and
testers already know: `2 intervals kept.` / `Nothing kept.`, counted by
`summaryModel.ts`'s `measuredIntervalCount(actuals)` — the same function the
LOST THE MONITOR banner names, never a second notion of "kept".

**GATE 0 STATUS: the WORDS are cleared; the current PLACEMENT is PENDING**
(James's review of rev 2, P1-5: an approval of the workout-screen artifact
does not carry to the log-screen delta — the gate is the approval of the
rendered thing, and the rendered thing changed). What stands approved and
what awaits are separated below.

**Approved — James, 2026-08-31**, on the rendered artifact
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
- **PLACEMENT REVISED with the destination ruling ("Just go to log", James
  2026-08-31): the strip sits at the top of the LOG screen** on the
  program-dropped arrival, not the workout screen — the words, register,
  tokens and contrast pairings approved above carry over unchanged. **The
  revised placement, the new body line ("The row below is what the erg
  measured before it stopped."), and the interim ended frame's drop copy are
  the PENDING Gate 0 delta**, rendered on the same artifact's log-screen
  section and awaiting James's explicit approval — no §1 implementation
  starts before it. The workout screen gets no new surface after all.
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
2026-08-31, on the analysis below). Behaviourally the two are identical today
on the CLIENT — every client consumer is an allowlist keyed on `"finished"`:

- `storedSummary.ts`'s tier-B2 gate is TRUE only for `"finished"`, `null` and
  `undefined`. Its own fix-round-3 comment states the intent verbatim: an
  allowlist "not a denylist — the earlier `!== "rower" && ...` shape fails
  OPEN: a FIFTH `CloseReason` added later … would silently pass this check".
  **A fifth value therefore fails closed by design.**
- `postTestOffer` / `LogSession.tsx` gate on `endedBy === "finished"`.
- `appendSummaryObservations` admits only `"finished"`/`"rower"`, so neither
  option can ever carry machine totals.
- `openBurstHold` admits only `"finished"`/`"rower"` — an allowlist of TWO,
  which the first draft mis-read; see the Mechanism section, where §1 now
  deliberately opens no hold.

So this is not a behaviour choice. It is whether the stored row can tell the
two program failures apart afterwards. `"program-failed"` means *our*
`program()` call failed (P3b); a live drop is the *machine* discarding a
program that succeeded. **With the ring unrecoverable (§0.3), `endedBy` is the
only durable field the next occurrence will leave behind**, and a conflated
label makes a future count impossible — the same blindness that took a field
proof to settle for machine summaries.

**The server half is a migration, and the first draft's "no migration" claim
was FALSE** — see "The migration, owned" above for the three sites (`pgEnum`,
the 400 validator, the hand-copied `EndedBy` union) and the seam test that
gates them. Client-side the never-migrate contract holds unchanged.

**Rendering is otherwise unchanged in this PR.** `"program-dropped"` renders
wherever `"program-failed"` renders today in the STORED views (History, the
saved row); any wording that distinguishes them there belongs to the `door`
column's Gate 0, not here. The two surfaces this PR does add — the log
screen's strip and the interim ended frame's drop copy — both read
**`monitorRun.endedBy === "program-dropped"`, the DURABLE record**.
(Rev 2 said the strip "reads the SESSION, not the stored reason" — WRONG, and
James's review P1-1 caught it: `handleConnectedEnded` navigates with no route
state, the connected hook unmounts, and `LogSession` receives only the
hand-off `MonitorRun` — the session value is gone by arrival, and `"machine"`
could not distinguish a drop from a real finish anyway. The record is the only
authority that survives the navigation, and it is also the one that survives a
relaunch, so a rower who reopens the log later still gets the true story.)

### Test obligation — recurring failure 24

The gate **starts upstream of the producer**. Both halves being well tested is
exactly the condition that hides a broken seam.

One test drives a committed recording through the **real** driver, hook and
store, so the record and its actuals are built by the real pipeline — never a
storage-seeded fixture — and then delivers the `programDropped` event into a
live session (`WorkoutDetail.connectedRecovery.test.tsx` is the proven model
for this composition). It asserts:

1. the record is durable, and its `endedBy === "program-dropped"` (the
   RECORD's `CloseReason`; the session's own `endedBy` reads `"machine"`);
2. the kept count equals the intervals the capture actually completed;
3. the ended hand-off navigates to `/library/:id/log?from=monitor` **and the
   log door renders the row** — the assertion is about the READER existing,
   not about a destination. The first draft asserted "the workout, not the
   log", which would have passed green on the exact defect that stranded the
   record (the antagonist's most dangerous finding: an assertion that pins a
   removal without asserting its replacement cannot go red on the loss);
4. **under a forced durable-write failure, no hand-off occurs** and the
   COULD-NOT-KEEP state renders in the ended frame;
5. **the seam test the migration owes** (RF24, "a seam gap gates the PR that
   creates it"): a program-dropped row driven through `POST /api/logs`
   returns 200 and reads back. Without it the server's 400 validator is
   invisible to every client-side gate, and the hand-copied server union
   makes the compiler blind to the widening.

**The producer is the DRIVER, and the gate drives it for real (corrected per
James's review of rev 2, P1-3 — rev 2 claimed "starts upstream of the
producer" while synthesising the event, which proves the handler and storage
path but not the driver→hook seam a live session actually crosses).** The
production event is emitted inside `driver.ts`'s armed-watch and reaches the
hook through the driver's listener; a synthesised event enters below that
seam. So the gate is two tests with honestly-scoped claims:

- **The seam test drives the REAL driver until IT emits.** After the committed
  capture has built the live session, the transport feeds constructed wire
  frames carrying RC-37's documented signature — `state === "armed"` with all
  three `expectedArmedStructure` fields diverged, held past the detector's
  ≥3-tick / ≥2 s window — and the assertion is that `driver.ts`'s own
  armed-watch emits `programDropped` and the live hook receives it through
  its real listener. The BYTES are constructed (no committed recording
  carries this shape mid-live, §0.4); the DETECTOR, the emit, the listener
  seam, and everything downstream are real. This is the honest boundary,
  stated: constructed input, real producer.
- **The handler test synthesises the event** for the failure-branch matrix
  (assertion 4's forced write failure and its mutations), where driving the
  full detector adds nothing to what is being asserted.

**Every assertion above gets a mutation that makes it fail, and the report
states what was mutated and what the failure said** (RF21). Assertion 4's
mutation forges the durable verdict at the seam, not below it — a hook-level
mutation alone would not prove the hand-off is gated. Assertion 5's mutation
narrows the server union back and watches the 400. The seam test's mutation
breaks the listener wiring (the hook's `programDropped` case) and watches the
driver's real emit go unhandled.

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
| 1 | §1 live drop arm + `"program-dropped"` + server migration | TRIAD; Gate 0 (words cleared; log-screen placement delta PENDING); antagonist delta pass |
| 2 | §2 ring history + ungated door, §3 resume instrument, §6 latch counter | one coherent chunk: all three are ring work. **Gate 0 on the ring door** (James's review P2-6: a new always-available screen listing saved rings is user-visible layout and copy, and rev 2 gave it no design gate) |
| 3 | §4 freeze predicate | opens only when §3 has reported |
| 4 | §5 partial metres | behind the `door` column's migration |

PR 1 ships alone: it carries TRIAD weight and bundling it would make its own
gate harder to run. PRs 2's three parts group deliberately — one reviewer, one
risk model, per the standing "group the work" rule.

**This slate is a Wave F SUB-slate, not the wave's exit (James's review
P2-6).** Mapped against the four exit clauses: *a link dropped mid-piece* —
partially discharged by PR 1 (the program-drop trigger family) and fully only
with §5; *phone locked before the first pull* and *backgrounded mid-piece* —
NOT discharged here; they need correct resume (§0.6, deliberately separate)
and what §3's measurements teach; *the row says which door it came in by* —
the `door` column's own item, outside this spec. The wave closes when those
land, not when these four PRs do.

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
