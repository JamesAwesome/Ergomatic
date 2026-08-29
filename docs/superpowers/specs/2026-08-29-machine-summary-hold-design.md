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
write not arrival, corpus-derived backstop, receipt instrument, and the
upstream replay gate.

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
  (`walk-2026-08-25/smoke-terminated`, a rower-terminated close). Two web
  captures deliver the burst BEFORE the terminal — the hold must handle
  that ordering explicitly, and it does (§2: the condition is never owed).
  The old "~1 s terminate lag" (n=1 lab ring) is retired by that same
  comment — this spec does not use it.
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
   `final-boundary` — the SPLIT, not the summary. On a user End, no hold
   ever opens. Either way navigation fires with the burst still in flight.
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
WRITE** (not arrival), or expires on its own bounded backstop. The hold
releases — one `handoffHeld: false` update, one `handoff-released` ring
entry — when no owed condition remains.

**The split condition (unchanged in substance).** Owed only on a machine
finish whose run is missing the last interval's actual
(`openHandoffHold`'s existing predicate). Backstop
`FINISH_HANDOFF_HOLD_MS` 3500, keeping its strict `> FINISH_GRACE_MS`
coupling. Resolution: the final boundary's actual recorded —
`releaseHandoff("final-boundary")` at `useMonitorSession.ts:2307` becomes
"resolve the split condition", releasing the hold only if the burst
condition is not also owed.

**The burst condition (new).** Owed at any burst-eligible `ended`
transition — `run.completedAt !== null && endedBy ∈ {finished, rower}`,
the same predicate teardown and `appendSummaryObservations` already share
(one predicate, now three enforcement points, deliberately) — whose run
does not already carry `summaryTotals`. That last clause is how the
burst-first ordering (two captures) pays nothing: the condition is never
owed. Owed for BOTH close kinds:

- machine finish (`endedBy: "machine"` at the session, `"finished"` on the
  run) — opened in `endByMachine`'s existing patch alongside the split
  condition;
- user End / Menu terminate (`"user"` / `"rower"`) — opened in
  `endSession`'s `ended` patch, which today opens nothing. The worst
  measured lag in the corpus (542 ms) is a rower-terminated close, so this
  arm is not a nice-to-have; it is where the worst case lives.

Resolution: the `summary-observations` handler's append RETURNING a run
(`appended !== null` at `useMonitorSession.ts:2388`) — the write ran, the
record the reader will snapshot now carries the totals. An append that
returns `null` (writer gate 4 rejecting — same predicate, so this is
defensive, not expected) resolves the condition too, with its own receipt
(§5): waiting longer cannot help a write that was refused.

Backstop: **`BURST_HANDOFF_HOLD_MS = 2000`**, a new constant. Derivation,
carried in its comment per the corpus rule: ~3.7× the measured worst case
(542 ms over n=10, two transports) — the same multiple `BURST_LINGER_MS`
already argues, but anchored EARLIER: this clock starts at the `ended`
flip, roughly the terminal observation itself, so the whole measured
271–542 ms window sits inside it with no navigate-and-unmount time coming
off the top. Not shared with `BURST_LINGER_MS` (same value today, different
anchor and different consumer; coupling them would let a linger retune
silently retime the rower-visible hold, or vice versa).

**Closes that never hold.** `link-lost` and `program-failed` are not
burst-eligible — the link the burst would arrive on is gone or the run
never completed — and they route through `fail()`, never through the
`ended` hand-off at all. This is the common no-burst case, handled by
never opening rather than by timing out (the binding condition: the burst
not coming is normal, not exceptional). A link that dies INSIDE an open
hold cannot announce itself (`driver.ts` treats post-close disconnect as
housekeeping, `useMonitorSession.ts:2404-2420`) — the backstop is the
exit, exactly as it already is for the split condition.

**Timing arithmetic, stated.** Typical machine finish: split lands ±180 ms,
burst lands 271–542 ms after the terminal → hold releases on the burst's
write, total added wait ≈ 0.3–0.6 s over today. Typical user End: burst
condition only, ≈ 0.3–0.6 s where today waits zero. Worst cases: burst
never comes → 2.0 s (user End) or up to 3.5 s (machine finish also missing
its split — unchanged from today's worst). All spent on the ended frame
(§4).

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

## §4 What the rower sees, and Gate 0

Nothing new. The `ended` frame — the rower's own final numbers, already
rendered the instant the machine finishes — persists ~0.3–0.6 s longer in
the typical case, up to 2.0 s on a burst timeout (3.5 s ceiling unchanged
on the machine-finish worst case). No spinner, no copy change, no layout
change: a wait under a second on a frame the rower is reading anyway does
not earn a UI element, and the existing hold already spends up to 3.5 s on
this exact frame without one.

**Gate 0, before any implementation task (binding).** James approves the
rendered thing:

- the saved row's BEFORE/AFTER side by side — before: our arithmetic
  (375.1 m / 124.9 s on the leg-5 row) and no confirmation block; after:
  the erg's own 358 m / 120.0 s with `MACHINE CONFIRMED · WORK ONLY` and
  the verification code rendered. A number change is a design question:
  the after must read as an improvement, not as a row that quietly moved.
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

- **The suite:** extends the `burstReplay.test.ts` idiom (real
  `transports/replay.ts` barrier engine → real driver → real hook, virtual
  clock) over `walk-2026-08-25/smoke-terminated-recording.jsonl.gz` — a
  raw recording of a rower-terminated close whose burst follows the
  terminal by the corpus's worst-case 542 ms. Terminal-first ordering is
  the defect's ordering AND exercises the new user-End hold arm.
- **The assertions, in sequence:** (1) at the `ended` flip, `handoffHeld`
  is true and stays true past the point today's code releases; (2) the
  burst arrives on the virtual clock and `handoffHeld` flips false only
  AFTER the record in storage carries `summaryTotals` (write before
  release, the invariant); (3) a fresh `LogSession` mount — jsdom, real
  `monitorModeRun` over the storage the replay actually wrote, mocked
  server — produces a save POST carrying `machineWorkSeconds`,
  `machineDistanceMeters`, and the verification bytes. **Red today** at
  (1): the current code navigates before the burst.
- **A timeout leg:** the same harness with the burst events withheld —
  hold releases at `BURST_HANDOFF_HOLD_MS` on the virtual clock, the POST
  carries no machine columns, and the ring carries `burst-timeout`. This
  is the leg that keeps exit 2 honest.
- **Mutations (RF21):** every new assertion gets a named mutation that
  makes it fail, reported with what was mutated and what the failure said.
  At minimum: reorder the release before the write (must fail assertion
  2); skip opening the hold on the user-End arm (must fail assertion 1);
  drop the machine columns from the POST body (must fail assertion 3).
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
  (`storedSummary.ts`) unchanged; no copy or layout changes outside the
  Gate 0 renders.

## Process

Full antagonist pass on this spec (TRIAD: a stored number's meaning) →
revisions → Gate 0 rendered and approved → implementation in a worktree,
failing test first (§6's suite is the failing test) → PM final-PR gate,
with the prod re-count and the note-correction sequencing checked there.
