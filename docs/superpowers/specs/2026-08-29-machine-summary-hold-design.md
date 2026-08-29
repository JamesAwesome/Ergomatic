# Hold the hand-off for the burst — Wave F PR 1 design

**What and why.** The erg's own summary numbers have never reached a saved
row — 0 of 16 connected rows on production, counted 2026-08-28 — even though
the wire half works end to end: 0x0039/0x003A/0x003F arrive, decode, and are
appended to the run record. The break is ordering, and it is fixed, not racy:
navigation to the log screen is what starts the teardown that waits for the
burst, so the log screen has always mounted and snapshotted the record
before the burst's write can land (~270 ms later, and the write succeeds,
unread). Every stored connected row's three heroes are therefore our own
arithmetic — including AVG SPLIT — while v0.23.0's note told testers the
opposite. James decided the shape on 2026-08-28: **HOLD THE HAND-OFF for the
burst as well as the split** — waiting is more correct, and ~0.3 s on the
connected screen is an acceptable price. The rejected alternative
(re-reading storage at save time) is settled; this spec designs the hold,
not the choice: how long, what happens when the burst never comes, and what
the rower sees while it holds.

Design approved by James 2026-08-29 ("Approve") on the full mechanism
presented in chat: two owed conditions on the existing hold, resolution on
write-attempt not arrival, corpus-derived backstop, receipt instrument, and
the upstream replay gate. Revised same day after the full antagonist pass
(TRIAD): the pass killed the spec's two-arm enumeration of the `ended`
transitions (Menu terminate is a THIRD arm, through `endByMachine(true)`,
and it is the arm the gate recording replays) and the Gate 0 before-numbers
(which were the live accumulator, not the stored row), and corrected the
backstop's anchor claim, the burst-first justification, the write-resolution
wording, and the gate's virtual-clock mechanics. All six findings are folded
in below; the pass's ledger entry rides this PR.

## Evidence base (research pass)

No new external mechanism is invented and no OS/browser/device-owned
behaviour is newly relied on: the spec extends an existing, walk-proven hold
(`handoffHeld`, walk day 2 2026-08-11) at an existing seam. The
does-it-exist question is already answered on hardware: the PM5 HAS the
concept this design waits for — a terminal-adjacent end-of-workout summary
burst — observed in ten committed captures across two transports.

- PRIMARY (hardware, production TestFlight): the defect chain —
  `walk-2026-08-28/summary-never-stored-ring.json` and that walk's README
  §"Leg 5". Seq 51–58: the burst arrives, decodes (elapsed=120 s,
  distance=358 m), the driver emits `summary-observations`
  (`driver.ts:4181`, `split-won`); the hand-off had already released at seq
  50 on `final-boundary`, 270 ms earlier. The theory that the native BLE arm
  never subscribed was falsified by this same file — do not re-derive it.
- PRIMARY (production DB, 2026-08-28): 0 of 16 connected rows
  (`device_name is not null`) carry `machine_work_seconds`. "Never once" is
  measured, not inferred. Re-run this count at the PR gate.
- PRIMARY (hardware corpus, n=10, re-measured at the Wave F anchor pass and
  corrected at PR #225's review; the authoritative transcription is
  `BURST_LINGER_MS`'s own comment, `useMonitorSession.ts:728-769`): eight
  unique web recordings plus two production native rings
  (`walk-2026-08-24/phone-exit7-ring.json` +358 ms,
  `walk-2026-08-28/summary-never-stored-ring.json` +452 ms). Positive
  post-terminal lags run **271–542 ms**, worst case 542 ms
  (`walk-2026-08-25/smoke-terminated`, a MENU-terminated close —
  `README.md:15`, "Menu-killed at ~31 s"; the antagonist re-derived the
  542.4 ms from its raw bytes, seq 288 → seq 296). Two web captures
  deliver the burst BEFORE the terminal — the hold must handle that
  ordering explicitly (§2 states the true mechanism: the condition is owed
  and resolves synchronously in the same block). The old "~1 s terminate
  lag" (n=1 lab ring) is retired by that same comment — this spec does not
  use it.
- PRIMARY (hardware, n=1, the corpus's only app-End close — found at the
  antagonist pass by listing the capture directory by date):
  `walk-2026-08-28/end-on-interval-1-recording.jsonl.gz`. Terminate tx at
  t=15155.4 (≈ the `ended` flip), ack +106.6 ms, machine terminal
  +286.3 ms, 0x003F +558.6 ms. This measures the End arm's real budget
  from the anchor the hold actually uses: **558.6 ms**, a 3.58× margin
  under the 2000 ms backstop. Laptop/Chrome web; the terminate round-trip
  on native BLE is unmeasured.
- PRIMARY (code, read this session): the hold gate and its consumer —
  `useMonitorSession.ts:1779-1838` (`releaseHandoff`/`openHandoffHold`,
  `FINISH_HANDOFF_HOLD_MS` 3500 with its strict `> FINISH_GRACE_MS`
  coupling), `ConnectedSurface.tsx:353-358` (navigation deferred while
  `handoffHeld`); the burst handler `useMonitorSession.ts:2361-2403`
  (`appendSummaryObservations`, at-most-once per run, gate 4 re-checked at
  the writer); the burst-eligible predicate `useMonitorSession.ts:2695-2698`
  (`completedAt !== null && endedBy ∈ {finished, rower}`); the user-End
  path `useMonitorSession.ts:3192-3239` (closes `rower`/`link-lost`, flips
  `ended`, then terminates best-effort); the reader
  `LogSession.tsx:1487` (mount-time `useState` snapshot, no setter); the
  tier gate `storedSummary.ts:617-621`.
- UNMEASURED, stated not smoothed over: a NATIVE burst arriving across a
  background/resume. Every burst recording is web/foreground; both native
  ring points are foreground. The hold is not designed against that case;
  the receipt instrument (§5) is what will measure it if it occurs.

## §1 The defect, precisely

1. A burst-eligible close flips `phase` to `ended`. On a machine finish
   with the last split missing, the hold opens and releases on
   `final-boundary` — the SPLIT, not the summary. On a Menu terminate,
   `useMonitorSession.ts:2201` hardcodes `held = false`; on a user End,
   `endSession` opens nothing. On every arm navigation fires with the
   burst still in flight.
2. Navigation unmounts the surface, which starts teardown; teardown's
   linger (`BURST_LINGER_MS`) then catches the burst and
   `appendSummaryObservations` writes it to localStorage — successfully,
   after the reader is gone.
3. `LogSession.tsx:1487` snapshotted the run at mount, before that write.
   The snapshot is DELIBERATE (post-save re-detect guard, 7C spec §4) and
   stays: this design makes the write land before the mount instead of
   making the reader re-read.
4. The save POST therefore never carries the machine columns;
   `storedSummary.ts:617-621` gates tier A on those columns; every row is
   permanently tier B (no backfill: `LogPatch` is four keys, columns
   write-once at create).

## §2 The hold: two owed conditions, one gate

`handoffHeld` stays the single navigation gate, `ConnectedSurface`
untouched at its consumer end. What changes is what the hold OWES. A
condition is owed at the `ended` transition, resolves on **arrival and
write ATTEMPT** (not arrival alone — and not proven durability, which is
AUD-016's seam, §3), or expires on its own bounded backstop. The hold
releases — one `handoffHeld: false` update, one `handoff-released` ring
entry — when no owed condition remains.

One asymmetry makes the design sound even where its constant is
under-measured: the hold cannot produce a WRONG number, only a slower
navigation or an absent tier-A upgrade. Its resolution is deterministic —
a specific event the machine sends, a write we perform; nothing is
inferred from timing. Only the backstop is a heuristic wearing a number,
and its false-negative case (a native burst delayed past 2000 ms by a
background/resume) saves the row tier B with a `burst-timeout` receipt —
correct, measurable, and recoverable by remeasuring the constant.

**The split condition (unchanged in substance).** Owed only on a machine
finish whose run is missing the last interval's actual
(`openHandoffHold`'s existing predicate). Backstop
`FINISH_HANDOFF_HOLD_MS` 3500, keeping its strict `> FINISH_GRACE_MS`
coupling. Resolution: the final boundary's actual recorded —
`releaseHandoff("final-boundary")` at `useMonitorSession.ts:2307` becomes
"resolve the split condition", releasing the hold only if the burst
condition is not also owed.

**The burst condition (new).** Owed at any burst-eligible `ended`
transition — `run.completedAt !== null && run.endedBy ∈ {finished,
rower}`, the same predicate teardown and `appendSummaryObservations`
already share (one predicate, now three enforcement points, deliberately).
There are THREE burst-eligible `ended` transitions, not two — the
antagonist pass killed the two-arm enumeration by following each close's
producing EVENT to its own handler rather than grouping by the record's
`endedBy`:

- **machine finish** — `endByMachine(false)` (session `endedBy:
  "machine"`, run `"finished"`): opened in the existing patch alongside
  the split condition;
- **Menu terminate at the erg** — a WIRE event, `driver.ts:2724`'s
  `terminated` emit → `useMonitorSession.ts:2314` → `endByMachine(true)`
  (session `endedBy: "machine"`, run `"rower"`). Today `:2201` hardcodes
  `held = false` on this branch (no split to wait for); the burst
  condition must open here — behaviourally, `terminated` closes owe the
  burst even though they never owe the split. This is the arm the
  corpus's worst case (542 ms, `smoke-terminated`) lives on, and the arm
  §6's first gate leg replays;
- **user End in the app** — `endSession` (session `endedBy: "user"`, run
  `"rower"` when the link is up): opened in its `ended` patch, which
  today opens nothing. `link-lost` closes through this same function are
  not burst-eligible and open nothing.

**Burst-first ordering, the true mechanism.** The `summaryTotals` guard
is ALWAYS `undefined` at every one of these three sites: both driver arms
fold a buffered burst-first summary AFTER their terminal emit,
deliberately (`driver.ts:2702-2711`, `:2751-2760` — an observations event
arriving while `completedAt` is still `null` would be declined
permanently, `monitorRun.ts:1095`). So on the two burst-first captures
the condition IS owed, and resolves microseconds later in the same
synchronous block — React batches the two updates into one render, so
the hold is invisible and costs nothing. The `!summaryTotals` clause
stays in the owing predicate as documented defence-in-depth, not as the
load-bearing explanation; if the driver's post-emit fold ever became
async, the burst-first case would pay real hold time and the receipts
would show it.

Resolution: the `summary-observations` handler's append RETURNING a run
(`appended !== null` at `useMonitorSession.ts:2388`) — the write was
ATTEMPTED against the record the reader will snapshot. Attempted, not
proven durable: `appendSummaryObservations` returns unconditionally after
calling `saveMonitorRun`, which swallows a rejected write
(`monitorRun.ts:475-492`) — that is §3's exit 3b, AUD-016's seam, and
this spec does not overclaim past it. An append that returns `null`
(writer gate 4 rejecting — same predicate, so defensive, not expected)
resolves the condition too, with its own receipt (§5): waiting longer
cannot help a write that was refused. A burst arriving with NO run
identity (`run === null` at `:2379-2380`) resolves nothing — the
condition cannot be owed without a run — and records `summary-no-run`.

Backstop: **`BURST_HANDOFF_HOLD_MS = 2000`**, a new constant. Derivation,
carried in its comment per the corpus rule: the corpus's positive
post-terminal lags run 271–542 ms (n=10, two transports). On the two
`endByMachine` arms the `ended` flip happens synchronously inside the
driver's terminal emit, so the whole measured window sits inside the
backstop with nothing coming off the top — a ~3.7× margin on the 542 ms
worst case. On the user-End arm the clock starts at the BUTTON — the flip
precedes `await driver.terminate()` (`useMonitorSession.ts:3218-3233`) —
so the terminate round-trip comes off the top: measured once
(`end-on-interval-1`, above), machine terminal +286.3 ms and 0x003F
+558.6 ms from the flip, a 3.58× margin. n=1, web; native round-trip
unmeasured — the §5 receipts are the instrument if it ever exceeds the
budget. Not shared with `BURST_LINGER_MS` (same value today, different
anchor and different consumer; coupling them would let a linger retune
silently retime the rower-visible hold, or vice versa).

**Closes that never hold.** `link-lost` and `program-failed` are not
burst-eligible — the link the burst would arrive on is gone or the run
never completed. This is the common no-burst case, handled by never
opening rather than by timing out (the binding condition: the burst not
coming is normal, not exceptional). A link that dies INSIDE an open hold
cannot release it early, and the reason differs by arm: on the machine
arms the driver's run is already closed and post-close disconnects are
housekeeping it never announces; on the End arm the driver's run is NOT
yet closed (it closes at the terminal general-status frame,
`driver.ts:2578`), so a real drop DOES emit — and is then discarded by
`useMonitorSession.ts:2420`'s `phase === "ended"` early return. Either
way the backstop is the bounded exit, exactly as it already is for the
split condition. End at READY costs nothing: the record opens at the
first rowing frame, so `runRef.current === null`, no condition can be
owed, no hold opens.

**Timing arithmetic, stated.** Typical machine finish: split lands ±180 ms,
burst lands 271–542 ms after the terminal → hold releases on the burst's
write attempt, total added wait ≈ 0.3–0.6 s over today. Typical Menu
terminate or user End: burst condition only, ≈ 0.3–0.6 s where today
waits zero. Worst cases when the burst never comes: 2.0 s on the
terminate/End arms, and on a machine finish 2.0 s where today could be
near-zero (split already in hand) or up to 3.5 s when the split condition
is also owed — that ceiling unchanged from today's worst. All spent on
the ended frame (§4).

**What does not change.** The teardown linger stays exactly as is — it is
now the second line, catching a burst that beats the unmount when the hold
timed out, and its write still lands too late for the current row (that
row saves tier B, as today). `LogSession.tsx:1487` stays. The rejected
re-read-at-save stays rejected.

## §3 Exit conditions and their owners (PM ruling, 2026-08-28)

The phase-open gate requires this spec to enumerate the hold's exits and
name which PR implements each, so AUD-016's successor extends rather than
redesigns:

1. **Burst heard and written** → resolve, release, navigate; the row saves
   tier A and `MACHINE CONFIRMED · WORK ONLY` renders for the first time.
   **This PR.**
2. **Burst timed out** (backstop) → release, navigate; the row saves
   tier B exactly as every row does today; the receipt says
   `burst-timeout`. No error surface — this is a normal close. **This
   PR.**
3. **Write failed.** Two distinct seams, named so PR 2 branches instead of
   redesigning:
   - `appendSummaryObservations` returns `null` (writer-gate rejection):
     resolve with receipt `append-rejected`. **This PR** (receipt only —
     behaviour is release-and-navigate, same as timeout).
   - `saveMonitorRun` swallowing a rejected storage write
     (`monitorRun.ts:475`, returns `void` by design — the audit's AUD-016
     producer, `storage-persist denied` observed on the tester's own
     phone): INVISIBLE to this PR's hold, disclosed here as the known
     blind spot. **AUD-016's PR** gives that write a signal and branches
     at THIS exit — the hold is the "recoverable state before navigation"
     mechanism AUD-016's own safe direction names, which is why it runs
     right behind this one. This PR's gate (§6) is blind to a rejected
     write by construction; that is AUD-016's gate to build, not this
     spec's to duplicate.

Fourth code path, not an exit of its own: a burst arriving with no run
identity (`run === null`, `useMonitorSession.ts:2379-2380`) resolves
nothing — no run, no owed condition, no open hold — and records
`summary-no-run` (§5). Where a hold IS open for some other reason, the
backstop is intentionally its exit.

## §4 What the rower sees, and Gate 0

The `ended` frame persists ~0.3–0.6 s in the typical case, up to 2.0 s on
a burst timeout (3.5 s ceiling unchanged on the machine-finish worst
case) — and it now says what it is waiting for. Two copy changes, both
REDIRECTED IN and approved by James at the gate (2026-08-29, "Perfect" on
the rendered frame; the first draft's "nothing new" did not survive his
review):

- **The headline: `Wrapping up` replaces `That is the session`**, on ALL
  ended states including today's one-render flash. His words: "it reads
  oddly." The replacement joins the surface's own present-progressive
  serif-line family ("Connecting", "Sending the workout", "Ready when you
  pull") and is honest whether or not a hold is open.
- **The body line, while `handoffHeld` is true:
  `Getting the monitor's own numbers.`** It names the wait's reason, says
  "monitor" never "PM5" (RC-18 standing rule), and fixes a dishonesty the
  hold would otherwise create — today's `Your numbers are kept.` would be
  claiming exactly the thing the hold is still waiting on. When the hold
  releases, the existing three-way line (kept / machine-finished / no
  numbers) renders for the non-held instant, so the zero-measured honesty
  branch survives untouched.

No spinner, no layout change. Both lines reuse `.connected-serif-line` /
`.connected-body-line` and their tokens — contrast 9.74:1 (`--ink-2`
#3f3c35 on `--page` #f4f1e8) computed, not inherited. The committed
fixture snapshot (`e2e/fixtures/connected-ended.html`) and the
`connected-ended` captures regenerate with the change.

**Gate 0, before any implementation task (binding).** James approves the
rendered thing:

- the saved row's BEFORE/AFTER side by side, ALL THREE heroes, on the
  leg-5 row. The before is what the STORED row renders today — tier B1,
  our arithmetic over the 0x0037/0x0038 actuals (`computeWorkRestSums`,
  `monitorRun.ts:756-783` → `storedSummary.ts:660-681`): **360 m /
  2:00.0 / ~2:46.7 avg split** (exact split figure comes from the render
  itself). NOT 375.1 m / 124.9 s — that is the live accumulator (work
  plus rest coast), a number no saved row has ever shown; the live-vs-
  stored labelling gap is a separately registered item (`ROADMAP.md:763`)
  and stays out of this PR. The after is the erg's own tier A: **358 m /
  2:00.0 / 2:47.5** (machine avg split decoded from the leg-5 burst, raw
  offsets 18-19 = 167.5 s/500 m; RF7 cross-check 120 × 500 / 358 =
  167.6) with `MACHINE CONFIRMED · WORK ONLY` and the verification code
  rendered. So the honest delta is a 2 m correction on an identical
  clock, and the avg split — the hero v0.23.0's falsified note is
  specifically about — moving ~0.8 s/500 slower to the machine's own
  figure. A number change is a design question: the after must read as
  an improvement, not as a row that quietly moved.
- the `ended` frame as it stands during the hold, both orientations, real
  proportions — the honest render of "what the rower sees" being
  unchanged.
- Contrast ratios computed and stated as numbers for every colour pairing
  in the confirmation block (it has shipped styling but has never been
  approved against a real render, because it has never rendered).

## §5 The receipt instrument (owed with this PR)

The one link in the chain with no instrument gets one — the walk README's
own lesson ("the driver records that it EMITTED; nothing records whether
the record was updated"). Ring entries, same `logRef.record` idiom the
hold already uses:

- in the `summary-observations` handler: `summary-recorded` (append
  accepted, run identity, totals) / `summary-append-rejected` (gate
  refused) / `summary-no-run` (no identity to write against);
- at hold open: the existing `handoff-hold` entry gains the burst
  condition's presence and deadline;
- at release: `handoff-released` reason widens to name what resolved it —
  `final-boundary` / `burst-heard` / `burst-timeout` / `backstop` /
  `teardown`.

These receipts are what makes the native background/resume unknown (§
Evidence) measurable the first time it happens in the field.

## §6 The permanent gate (RF24: start upstream of the producer)

One test must begin before the producer writes and assert after the reader
reads. The binding condition names the shape: a replay suite mounting
`LogSession` — NOT the ROADMAP's storage-seeded client test, which enters
downstream of the break and can never go red on it.

- **The harness:** extends the `burstReplay.test.ts` idiom (real
  `transports/replay.ts` barrier engine → real driver → real hook,
  virtual clock), with one addition the antagonist proved necessary:
  `MonitorSessionDeps.schedule` must ALSO be bound to the replay clock —
  `burstReplay.test.ts` binds only `driverOptions.now/schedule`, so the
  hold's backstop would otherwise run on real `setTimeout` while
  everything else runs on virtual time. Two clocks in one harness is the
  default trap, not the exception.
- **Leg 1, Menu terminate:**
  `walk-2026-08-25/smoke-terminated-recording.jsonl.gz` — raw bytes of a
  Menu-killed piece whose burst follows the terminal by the corpus
  worst-case 542 ms, no tx after programming so no barrier surprises.
  Exercises the `endByMachine(true)` arm — the arm today's `:2201`
  hardcodes to `held = false`.
- **Leg 2, user End:**
  `walk-2026-08-28/end-on-interval-1-recording.jsonl.gz` — the corpus's
  only app-End capture. Seq 75's terminate tx is a replay barrier, so the
  test presses End via `replay.clock.schedule(() => void
  result.current.end(), …)` just before the barrier's timestamp; the
  recorded ack settles `terminate()` (the tx bytes are byte-identical to
  the recorded frame, so no divergence). Its `header.program` needs the
  same hand-transcription discipline `burstReplay.test.ts:100-123`
  documents; the antagonist did not verify the transcription — doing so
  is part of building the leg.
- **The assertions, per leg, in sequence:** (1) at the `ended` flip,
  `handoffHeld` is true and stays true past the point today's code
  navigates; (2) the burst arrives on the virtual clock and `handoffHeld`
  flips false only AFTER the run in storage carries `summaryTotals` —
  write ATTEMPT before release; in jsdom the attempt always lands, so
  this asserts ordering, and it stays green where a production
  `storage-persist denied` makes the attempt fail (that detection is
  AUD-016's gate, §3); (3) a fresh `LogSession` mount — jsdom, real
  `monitorModeRun` over the storage the replay actually wrote, mocked
  server — produces a save POST carrying `machineWorkSeconds`,
  `machineWorkMeters`, and the verification bytes. **Red today** at
  (1) on both legs.
- **Leg 3, timeout.** The replay engine's virtual clock advances only at
  recorded events (`replay.ts:270`), and both recordings end ~545–560 ms
  after their terminal — a 2000 ms backstop can never fire on them
  unmodified. The leg therefore extends the `stripBurst` surgery idiom
  (`burstReplay.test.ts:177-186`) twice on leg 1's recording: strip the
  burst events AND append one synthetic trailing rx event at terminal
  +2500 ms, which is what carries the virtual clock past the backstop.
  Assert: hold releases at `BURST_HANDOFF_HOLD_MS`, the POST carries no
  machine columns, the ring carries `burst-timeout`. This is the leg that
  keeps exit 2 honest.
- **Mutations (RF21):** every new assertion gets a named mutation that
  makes it fail, reported with what was mutated and what the failure
  said. At minimum: reorder the release before the write attempt (must
  fail assertion 2); leave `:2201`'s `held = false` in place (must fail
  leg 1 assertion 1); skip opening the hold in `endSession` (must fail
  leg 2 assertion 1); drop the machine columns from the POST body (must
  fail assertion 3); shrink the synthetic trailing event to terminal
  +1500 ms (leg 3 must fail by never firing its backstop — proves the
  timeout leg's clock actually reaches 2000 ms).
- Existing `useMonitorSession.test.ts` hold tests and
  `ConnectedSurface`'s deferral test extend for the new conditions;
  per-file coverage checked for every touched file (RF2), not the
  aggregate.

## §7 Riders on this PR

- **The three falsified release-note corrections** (ROADMAP register,
  cited by clause: v0.11.0's RC-5-falsified instruction; v0.22.0's "can
  now show", false for two reasons; v0.23.0's "straight from the erg",
  false on every row ever saved) ship in the SUCCESSOR note behind this
  fix, per the PM's sequencing ruling — a correction behind a working
  feature reads as a repair. The correction clock expires ~2026-09-11; if
  this PR slips past it, the corrections ship alone. Notes live in
  `app/src/`, so the notes change rides the full CI gate either way.
- **Re-run the 0-of-16 production count at the PR gate** — it is the
  before-number the release note's "never" clause rests on.
- The `no-run` receipt path doubles as the breadcrumb AUD-016's
  frequency question (`ergomatic:log-door-misses`, zero production
  readers) already wants; no new reader is built here (that is Wave B's
  item).

## §8 Out of scope, stated

- **AUD-016** (durable-write signal and the write-failed branch) — next
  PR, seam named in §3.
- **Native background/resume burst timing** — unmeasured; receipts (§5)
  are the instrument, not a speculative longer hold.
- **Backfill** for the 16 permanently-tier-B rows — impossible by design
  (write-once columns), disclosed in the note correction instead.
- **Any reader change** — the mount snapshot stays; tier gating
  (`storedSummary.ts`) unchanged; no copy or layout changes beyond §4's
  two approved lines on the ended frame.

## Process

Full antagonist pass RAN 2026-08-29 (TRIAD: a stored number's meaning) —
verdict REVISE, two kills and four revisions, all folded in above; its
attacked-and-held claims (no never-releasing/early-releasing/
double-releasing path; the predicate transplant safe on all three arms;
no path navigating at 2000 ms that today waits 3500 and gets a better
record; `logRef` surviving teardown for §5's receipts; End at READY
opening no hold) join the phase's vetted ground via the ledger entry
riding this PR. Next: Gate 0 rendered and approved → implementation in a
worktree, failing test first (§6's legs are the failing tests) → PM
final-PR gate, with the prod re-count and the note-correction sequencing
checked there.
