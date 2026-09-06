# Wave F — closed 2026-09-04

The phase's narrowed exit passed the final antagonist and PM gates after
the [2026-09-04 native walk](../monitor/sessions/walk-2026-09-04-wave-f/README.md)
on reported TestFlight v0.36.1. No product change or new release accompanied
the closeout. The current decision is in ROADMAP's completed-phase ledger;
this file is a record, not a backlog.

## Exit decisions

- Pre-pull lock: the complete 60 s / 200 m interval reached the reopened,
  machine-confirmed saved detail. The trace head before resume was not
  captured; continuous hidden sampling was never the narrowed exit.
- Mid-piece lock: reuse the 2026-09-03 resume-edge capture's same logical
  session and durable receipts; no redundant second walk.
- Native Bluetooth loss: accepted interval 0, then the authoritative
  disconnect event, then End's partial index 1 (20.4 m / 59.74 s) and
  durable receipt. The reopened saved detail keeps 100 m of completed work
  and a separate last reading, explicitly incomplete.
- Failed durable writes: the retained-process hand-off behavior is covered
  by the composed automated gates; no phone storage failure was induced.
- Correct Resume remains in the Icebox. Post-drop collection, same-row
  reattachment and MISSED/trace-break writers are excluded; reload after a
  rejected write and later local eviction remain accepted residuals.
- The legacy-read/tier-precedence residuals, telemetry/longer-lived
  diagnostics, RC-29 and other unscheduled items keep their existing live
  owners. No unchecked item was archived into this body.
- Release verdict: not needed; the behavior tested is already in v0.36.1.

## Verbatim pre-close roadmap body

Copied from main `c5015c2e` without rewriting its historical narration.
Its pending-close wording below is the pre-close snapshot, superseded by
the exit decision above. It is not an instruction to reopen the phase.

## Wave F — Lifecycle: the app stops losing rows

**Status:** IMPLEMENTATION COMPLETE; final closeout review pending.
Correct Resume is in the Icebox, not this wave's implementation or exit.
The pocketed-phone umbrella's three child items are resolved below; no
additional implementation is hidden in its former unchecked box. The
phase-close evidence still needs reconciliation against the narrowed exit
before the phase is archived; this status does not claim that review passed.
**L.** Absorbs the rest of Phase LM, whose PR 1 shipped as #198 / v0.24.0.

**Goal:** preserve received work across pocketing, locking and link loss,
with an honest End/save fallback after a true drop. Continuing collection in
the same row after that drop is deferred.

**Why it was first:** the pocketed-phone row loss was reproduced on production
hardware in August. The shipped fixes below address that evidence; they do not
establish demand for same-row Bluetooth reattachment.

- [x] **The pocketed-phone row: a whole piece rowed and nothing kept.**
      **WORK ITEMS RESOLVED:** live program-drop handling shipped in #248;
      the resume edge closed as unreproduced/instrumented in #280 after
      #267's instrument; #258 replaced the unrecoverable ring with history.
      This resolves the three child items, not the unproven original causal
      chain. **Historical diagnosis from the phase-open anchor, 2026-08-28:**
      the outcome is real (James's row, walk leg 4, v0.25.0 build 759,
      production), but this
      item's original mechanism — "stays `phase=ready`, opens no record, End
      silently discards" — was FALSE by its own cited ring: the record OPENED
      at machine elapsed 43.04 s (`rowing-active-fallback`'s single emit site
      is inside the branch that calls `createMonitorRun`,
      `useMonitorSession.ts:1909`; `phase=live` by seq 35), and a late open
      costs only the series trace's head, never the interval actual — that is
      the machine's own 0x0037/0x0038 pair stored verbatim
      (`parse.ts:653-676`). **The proven chain: the fallback opened the
      record late; the erg then dropped its own program mid-row (seq 37,
      RC-37's readback signature, no Menu press); and the hook ignores
      `programDropped` whenever `phase` is not `programming`/`ready`
      (`useMonitorSession.ts:2319-2320`, its own comment conceding the live
      case was "left alone rather than guessed at"). That the ignored drop
      is what cost the row — no boundary afterwards, zero actuals stored —
      is the LEADING HYPOTHESIS, not proven: the committed ring is a curated
      excerpt that omits what End stored, so it cannot prove an absence
      (James's PR #225 review).** Deliberately not claimed in v0.26.0's
      notes. Its three work items are the next three entries. **M**
      **SPECCED 2026-08-31: `docs/superpowers/specs/2026-08-31-lifecycle-design.md`
      §0.1, which carries this chain and keeps link 3→4 labelled a
      hypothesis. The hypothesis is now PERMANENTLY unprovable — see the
      struck ring item below — so the spec is written around it rather than
      waiting on it.** The cited hook line numbers moved with PR #239; the
      handler is `useMonitorSession.ts`'s `programDropped` case, found by
      name rather than by line.
- [x] **Handle `programDropped` while a run is live** (from the
      pocketed-phone re-diagnosis above). Small and deterministic, warranted
      whatever the full ring says — the detector already fires; only the
      live arm swallows it, and that arm has NO test
      (`useMonitorSession.test.ts` covers only `ended`). The spec says what
      the rower sees and what the record keeps. **S**
      **SPECCED as `2026-08-31-lifecycle-design.md` §1, and it is that
      spec's PR 1, shipping alone.** The scoping premise that justified
      ignoring a live drop — the handler's own "the walk's trigger is READY,
      never a live session" — is FALSIFIED: the 2026-08-28 walk produced the
      same signature with no Menu press, after a 67 s background. Closes as
      a normal ended session with a fifth `CloseReason`,
      `"program-dropped"` (James, 2026-08-31), and hands off to the log.
      **Carries a server migration** — `ended_by` is a Postgres `pgEnum`, a
      hard 400 validator names the five values, and the server's `EndedBy`
      union is a hand-copied mirror; all three widen in one commit, gated by
      a `POST /api/logs` seam test (this row said "no migration" until
      James's rev-2 review; that was the client-side story only). **TRIAD**
      (stored close reason + the enum migration). Gate 0 CLEARED in full
      (2026-08-31, with the spec PR's merge word).
      **SHIPS as the live-drop PR from spec §1, 2026-08-31** — all five
      tasks committed (union widened end to end + migration; the hook's
      live arm publishing `closeReason`; the real-driver seam test; the
      two Gate-0 surfaces; this composition drive-through). **PR #248**,
      PM final gate GO-WITH-CONDITIONS 2026-08-31.
- [x] **~~The pocketed-phone window's two co-producers~~ — §4 CLOSED
      2026-09-03: UNREPRODUCED and INSTRUMENTED (James's ruling at the
      resume-edge walk).** `pause-declared` at 66 spm while rowing was
      owned by `2026-08-31-lifecycle-design.md` §4 and waited on that
      spec's §3 instrument, which shipped in #267. The walk that used it
      (`docs/monitor/sessions/walk-2026-09-03-resume-edge/`) performed the
      exact gesture — locked mid-row for 35.5 s, kept rowing, unlocked —
      and **declared no pause at all in the 22.4 s that followed**. The
      post-resume inter-arrival gaps were `[84,180,90]` ms; the one
      genuine `pause-declared`, seven seconds into a deliberate mid-work
      stop, carried `[90,90,180]` ms. **Timing does not discriminate on
      this device, and there was nothing to discriminate.** Designing a
      predicate on a defect an instrumented capture of its own gesture
      cannot reproduce would be inventing a mechanism, so the instrument
      stays and the item closes — the same posture as F-1 (6-MIN). The
      next occurrence arrives with `gapsMs` and `sinceResumeMs` already on
      it; a design starts from those numbers or not at all. One device,
      one run: this is not a claim that the defect cannot happen.
      **TWD 52→0→64 m non-monotonic is CORRECT BEHAVIOUR and leaves this
      item:** `continuity.ts`'s `check` convicts a reset only when TWD,
      elapsed AND distance all read backward together — TWD alone is the
      documented F2a false kill that rule exists to prevent, and it rightly
      returns `"continuation"`. What that comment does confess is re-filed
      to the open-item register: the distance-goal suppression covers all
      six committed captures, so the F2b count bound has been compared on
      ZERO pairs ("clean but VACUOUS", its own words). **S**
      **§3 SHIPS in Wave F PR 2**, alongside §2 and §6
      (`useMonitorSession.ts`): every resume edge records `resume-first-frame`
      (the arrival gap, whether the first post-resume frame repeats the
      pre-background `freezeKey` triple, the raw `rowingState` byte); a
      repeating run is then tracked as `resume-stale-run` and closed with a
      consecutive-identical count by one of FOUR closers, each named in the
      entry's own `endedBy=`: a differing frame (`changed`), a second resume
      edge arriving while it is still open (`resumed`), a per-run reset
      (`reset`), or teardown (`teardown`). §4's wait is now on the next
      natural occurrence producing a reading through it, not on unbuilt
      plumbing.
- [x] **~~Recover the full ring before the lifecycle spec is written~~ —
      STRUCK 2026-08-31: it is UNRECOVERABLE, and the loss was ours.**
      `ergomatic:last-session-log` is written UNCONDITIONALLY on every
      connected teardown including failed pairings and connect-then-cancel,
      one key with no history, so every later session overwrote it —
      and the production connected-row count went 16 (08-28) → 18 (08-30),
      which counts only the sessions that saved a row. Ruled unrecoverable
      by James, 2026-08-31; the lifecycle spec is written around the
      ambiguity. **The excerpt's six gaps were never a lossy instrument:**
      they are INTERIOR (seq 21-39, missing 22/26/31/33/36/38) while the
      ring is capacity-500 and tail-keeping, so it can only ever lose a
      contiguous head — and at seq 39 the cap never fired. The whole ring
      was in hand and 13 of ~39 entries were hand-picked into the committed
      file. Replaced by the ring-durability work in
      `2026-08-31-lifecycle-design.md` §2, which is now a PREREQUISITE:
      the ring is the only instrument that reaches production, and today it
      can only be read by destroying it.
      **§2 SHIPS in Wave F PR 2** (the ring chunk; PR number filled in at
      merge): a three-slot history beside the single perishable key (the last
      three LOGICAL connected sessions' exports all survive at once, one entry
      per logical session, `src/monitor/sessionLogHistory.ts`) and the ungated
      door that lists and copies them (You → DIAGNOSTICS → Monitor logs,
      `src/you/Diagnostics.tsx`/`MonitorLogs.tsx`, Gate 0 approved 2026-09-01) —
      exactly the fix that would have saved the pocketed-phone ring, now in
      place for the next one. The same PR also ships §3 (the resume-edge frame
      instrument) and §6 (the RC-29 latch counter, see that register row).

- [x] **The `door` item — RE-SCOPED 2026-09-02, spec
      `docs/superpowers/specs/2026-09-02-door-partial-design.md`.** The
      column itself SHIPPED as `session_logs.source` (`pm5 | timer |
      manual`) in #268 / migration 0020 on 2026-09-02, so "which door" is
      delivered; what this item still owes is split into two PRs by risk
      model, and the phase-open anchor pass (2026-09-02, ledger entry) broke
      two of its four founding decisions before the spec was written:
      - **PR A — the stored WORD (TRIAD).** PARTIAL as a stored-state read
        (no new column): connected row, steps present, at least one step
        never measured, and `endedBy` in the five-value allowlist (never
        `!= finished`: legacy rows store `null` and would all read partial;
        the steps-present clause is what excludes a connected Just Row); a
        short step on a `finished` row is measurement loss, not a partial.
        The count in the marker is intervals MEASURED, the lost banner's own
        rule; the shipped `LINK LOST` line keeps its trigger and gains a
        suffix; the other four words render only when PARTIAL holds. A fourth
        `log_source` member `no-reading` (NO device name — the first draft
        required one and reversed a recorded PM ruling), rendering
        `NO MONITOR READING` in the log as on the live screen, with the
        `timeLabel` gate re-derived as an allowlist. RC-18's fallback
        becomes the literal `MONITOR` (nothing uppercases that line),
        fix-forward only — and with it, the deviceName-band guard stops
        storing a nameless erg's session as `manual`: it keeps `pm5` and
        substitutes the caption. Carries the three riders below. **The
        `source` SUNSET is NO LONGER PART OF PR A** — it shipped on its own
        as #273 / v0.35.0 on 2026-09-02 (its own row above is reconciled).
        **Gate 0-A** on the rendered saved row + list chip.
        **SHIPPED as door PR A (2026-09-02), every clause above:** the
        four-clause PARTIAL predicate with its five-word marker table
        (`storedSummary.ts`'s `partialCloseReason`/`buildCloseLine`);
        `STOPPED EARLY · N of M intervals measured` on the session detail,
        above the heroes, and a `.log-partial-chip` on the History row,
        both words from one table so the two surfaces cannot disagree;
        `LINK LOST` keeping its own ungated, steps-independent trigger and
        shortened to `LINK LOST · the app lost the monitor` so the combined
        line fits; the list's boolean derived in SQL from the same four
        clauses (no new column) with an agreement test holding the two
        copies equal; `log_source` gaining `no-reading` (migration 0022, no
        backfill, no device name) so a connected arrival that measured
        nothing reads `NO MONITOR READING` with its wall-clock time rather
        than `LOGGED BY HAND` with none; `timeLabel` re-derived as a
        positive three-member allowlist; RC-18's fallback becoming the
        literal `MONITOR` at all seven sites, with the deviceName-band
        guard now keeping the `pm5` door for a nameless erg instead of
        storing the session as by-hand. All three riders below are ticked.
        Gate 0-A was APPROVED by James on 2026-09-02 before any task ran.
        **PR B (the stored NUMBER) is IMPLEMENTED on branch
        `wave-f-door-b`, 2026-09-03** — the item below carries what it
        shipped as **PR #279**.
      - **PR B — the stored NUMBER (TRIAD).** Lifecycle spec §5: the
        in-flight interval's metres in NEW step keys (`partialMeters`/
        `partialSeconds`), never `actualMeters` — an older server drops
        unknown keys silently, so number-plus-marker in the old keys
        would persist the number without the marker. Five invariants
        (never on `finished`; never an `IntervalActual`; rowing-state only;
        stale under-counts; no summing reader sees it). Owns the "N
        intervals kept" vocabulary and the lost banner. **Gate 0-B**.
      - The four sub-items this row used to list — PARTIAL, RC-18, LM's
        `LOGGED BY HAND`, the `timeLabel` gate — are all in PR A; the
        stored-row analysis in `docs/history/phase-lm.md` is discharged by
        the spec's §1.1 authority statement.

      **S/M each; A lands before B; B's plan gets a FULL antagonist pass
      (novel stored shape + session-scoped ref).**

      **TICKED 2026-09-03 — nothing remains under this item.** The column
      shipped in #268; PR A shipped the stored WORD in #276 (`e6f456ce`);
      PR B ships the stored NUMBER and is the last thing this item scoped.
      The spec's §4 riders are also resolved under PR A. Correct Resume is
      separate, iceboxed work; it does not leave an obligation under this
      delivered item. PR B's number is recorded above and below as #279.

- [x] **The in-flight interval's metres are discarded on a mid-row link loss.**
      **DONE — door PR B (branch `wave-f-door-b`), 2026-09-03.** A close that
      catches the rower mid-interval banks that interval's last reading in two
      NEW step keys and the row shows it beside the dash; no hero, tier, total
      or "N intervals kept" moves (I-B2/I-B5). The five replay legs drive real
      wire bytes from three committed captures. Gate 0-B approved 2026-09-02.
      **PR #279.**
      On a single-interval workout — the tester's own 2000 m "Beam Sea" — any
      mid-row loss gives `kept = 0`, which was the MAJORITY outcome of walk
      leg B, not an oddity. **The held reading survives today's End/save path;
      same-row reconnect is deferred, not shipped by this item.** If that work
      reopens, it must preserve this reading without recovering anything the
      app never received; generic `connect()`/`teardown()` clears cannot be
      reused blindly. A later confirmed actual supersedes the partial;
      otherwise the latest held pair remains the honest lower bound. **S**
      **SPECCED as `2026-08-31-lifecycle-design.md` §5, and SEQUENCED BEHIND
      THE `door` COLUMN above.** The live-drop arm (§1) inherits this
      directly: banking "what was rowed" banks nothing when no boundary was
      reached. A stored partial is the machine's own frame reading with OUR
      attribution to the in-flight interval, never an interval pair the
      machine reported — there is none mid-interval — so it can never be
      tier A, and
      `measuredIntervalCount` correctly will not count it toward
      "N intervals kept." That is the PARTIAL vocabulary's job, which is why
      this lands with or after that migration and its summary copy is part
      of that item's Gate 0, never before.
      **SPECCED 2026-09-02 as door PR B**
      (`2026-09-02-door-partial-design.md` §5): new step keys, five
      invariants, a lifetime table for the in-flight reading, its own Gate
      0-B, and one replay owed before its plan (when `IntervalActual` N
      arrives — work→rest boundary or end of rest).
- [x] **`rowingActive` is falsified but not dangerous — DONE in this PR
      (2026-09-03, `2026-09-03-rowing-active-design.md`).** Owed: (a) one
      test pinning `midSessionMirror`'s byte half (`surfaceModel.test.ts` —
      cited by symbol, not the stale `surfaceModel.ts:915`) — the
      measurement below was itself stale; RE-MEASURED on `c2182ef5`:
      deleting `frame.rowingActive === false &&` gives `Test Files 1 failed
      | 230 passed (231)`, caught only by
      `ConnectedSurface.screens.test.tsx`'s RC-24 snapshot as an HTML diff,
      which is why the explicit model-layer pin was still owed; (b) a
      reconciled comment — ALREADY DONE, at `types.ts`'s `restSeconds`
      block, narrowed at its own site by #280's walk; (c) a diagnostic
      carrying the raw byte, since `parse.ts:608`'s strict
      `rowingState === 1` makes any non-1 read `false` and the next
      occurrence would otherwise still not say which — DONE, `driver.ts`
      now logs a `raw-rowing-state` ring entry on the driver's first frame
      and on every change after (spec §2, invariants I-2/I-3). No
      behaviour change. **S**
      **(d) SETTLED 2026-09-03 at the resume-edge walk
      (`docs/monitor/sessions/walk-2026-09-03-resume-edge/`): the clock
      RUNS through a mid-work stop.** With the rower sitting still, elapsed
      went 80.52 s → 92.11 s (+11.6 s) while distance went 247.1 → 249.6 m
      (coast, then nothing). So `MonitorFrame.state`'s own "no paused state
      on the wire" note holds for the mid-WORK
      case and `types.ts:134`'s "FREEZES whenever `rowingActive` goes
      false" is correct only for its own measured REST — corrected at its
      site by this walk. Door PR B's `partialSeconds` is therefore interval
      elapsed INCLUDING idle time, exactly as `2026-09-02-door-partial-design.md`
      §5.1 concluded; no shipped behaviour changes. **(c) is now DONE too —
      this PR's `driver.ts` ring carries the raw byte on the first frame and
      on every change, so the next occurrence will say which value it
      was.** The original text, for the
      record: `domain/monitor/types.ts:134` claims `MonitorFrame.elapsedSeconds`
      "FREEZES whenever `rowingActive` goes false", measured through a REST;
      `types.ts:189-191` says the wire has no paused state at all; and
      `PAUSED_FRAME_HOLD`'s comment records that the byte's behaviour through
      a mid-piece stop has NEVER been observed. Door PR B's stored pair is
      elapsed time, so the mid-WORK case is the one that matters. The
      observation: on a DISTANCE interval, stop pulling mid-interval for
      ≥10 s, keep the program running, then End. The recording then carries
      both the clock and the byte through the same stop and the loser of
      those two comments is corrected at its own site. Spec
      `2026-09-02-door-partial-design.md` §5.1 carries the full reading.
- [x] **The machine's own totals have NEVER reached a saved row. TRIAD — a
      change to what a stored number MEANS, and it lands alone.** Found by
      James on production TestFlight 2026-08-28; the ring is
      `docs/monitor/sessions/walk-2026-08-28/summary-never-stored-ring.json`
      and that walk's README §"Leg 5" carries the full reading. - **The wire half is finished.** 0x0039, 0x003A and 0x003F all arrive
      and decode, and `driver.ts:4181`'s `split-won` branch emits
      `summary-observations` carrying the verification bytes. **A theory
      that the native BLE arm never subscribed was raised and FALSIFIED by
      that capture** — do not re-derive it. - **The break is the READER.** `LogSession.tsx:1487` snapshots the run
      with `useState(() => monitorModeRun(...))` at mount — no setter, never
      refreshed. The burst's localStorage write lands ~270 ms later and
      succeeds; nothing reads it again. **The ordering is FIXED, not racy** —
      navigation is what starts teardown and its linger — which is why this
      is "never once" rather than "sometimes". - **It is not a missing box, it is a wrong number.**
      `storedSummary.ts:617-621` gates tier A on the same two columns the
      POST omits, so **every stored connected row's three heroes are our own
      arithmetic, including AVG SPLIT** — while v0.23.0's note told testers
      "those three numbers come straight from the erg… We show the
      monitor's, not ours." - **No backfill exists.** `LogPatch` (`server/stores/logs.ts:222-227`)
      is thumbs/held/pain/notes only and the columns are write-once at
      create, so every row saved since v0.22.0 is permanently tier B. - **COUNTED ON PRODUCTION, 2026-08-28: 0 of 16.** Sixteen connected rows
      (`device_name is not null`), and **not one** carries
      `machine_work_seconds`. "Never once" is now a measured fact, not an
      inference from one screenshot — so the note corrections say _never_,
      without hedging, and there is no partial-success case to explain. - **Still owed before the fix is designed:** a client test that mounts
      `LogSession` WITHOUT `summaryTotals`, lands the late write, then
      saves. Red today, needs no erg and no build, and becomes the permanent
      gate. - **THE SHAPE IS DECIDED (James, 2026-08-28): HOLD THE HAND-OFF for the
      burst as well as the split.** The rejected alternative was re-reading
      storage at save time, which keeps the navigation instant but lets a
      row gain its numbers a moment after the screen is already up. His
      reasoning: waiting is _more correct_, and ~0.3 s on the connected
      screen is an acceptable price. **The spec designs the hold, not the
      choice** — how long to wait, what happens when the burst never comes,
      and whether the rower sees anything during it. - **Owed with it:** the three note corrections in the register row
      below, and a receipt entry in the hook's handler, so the one link in
      this chain with no instrument finally gets one. **M/L**
      - **SHIPPED: PR #228, released in v0.27.0 (2026-08-30).** This bullet
        read "not yet merged/released" until 2026-08-31, when the item was
        struck to match it. Spec:
        `docs/superpowers/specs/2026-08-29-machine-summary-hold-design.md`.
        The hold now owes two independent conditions (split, burst) across
        all three burst-eligible `ended` arms (machine finish, Menu
        terminate, user End) and releases only when neither remains owed;
        the burst's own receipt (`summary-recorded` /
        `summary-append-rejected` / `summary-no-run`) is the instrument
        this item asked for. Gated by `summaryHoldReplay.test.ts`'s three
        permanent-gate legs (Menu terminate, user End, timeout — each
        replaying a real committed wire capture through the real driver
        into the real hook, never a storage-seeded fixture) plus
        `useMonitorSession.test.ts`'s receipt-instrument unit tests. The
        production re-count was waived as #228's merge gate, then
        **DISCHARGED 2026-08-30: James ran the query on prod — 0 of 18**
        (two more connected rows since the 2026-08-28 0-of-16 baseline,
        still none machine-confirmed), and the v0.27.0 notes' "never"
        claim rests on that fresh count. **The note corrections this item
        owed shipped in the same tag** (v0.27.0 items 3 and 4).
        **ONE OBLIGATION SURVIVES THE STRIKE and is lifted to the
        open-item register: the FIELD PROOF.** Every gate here is still the
        app agreeing with the app (RF11); the fix is only proven when a row
        saved on James's phone from v0.27.0 or later comes back
        machine-confirmed. Re-run the prod count after the next TestFlight
        build reaches him — the first nonzero is the proof, and a second
        0-of-N is a live defect, not a null result. **DISCHARGED
        2026-08-31: the first machine-confirmed prod row landed** (5x750m
        /1:30r, `CODE 050E-273C 1B69-9691` on both the PM5 and the phone);
        the register entry below carries the evidence.

- [x] **Audit AUD-016 — measured connected work survives storage failure.**
      **SHIPPED: PR #239, merged 2026-08-31 (`89006404`).** A completed PM5
      interval retained in memory could reach Log as `NO MONITOR READING`
      after rejected monitor-run writes. One store
      (`app/src/monitor/handoffStore.ts`) now owns the connected record —
      every create, save and destroy goes through it with a receipt; a failed
      durable write holds in the Gate-0-approved
      `COULD NOT KEEP THE RECORD ON THIS PHONE.` state with Retry / Log it
      anyway; a memory-only record has a door on Today and both connect guards
      see it. It also fixed a proven main defect en route: a failed close write
      let the finish grace re-open the record from stale storage and truncate
      saved actuals 3→1. Design:
      `docs/superpowers/specs/2026-08-30-handoff-protocol-design.md` (rev 4,
      James-approved 2026-08-30). **Per the STRIKE CONTRACT set at #239's PM
      gate, this same commit removed the Task 1-6 progress narration that stood
      here** (the file's own head rule: a struck item does not keep its progress
      log) **and lifted its forward-looking residuals before closure.** Two
      remain open — the three surviving legacy reads and the standing
      tier-precedence probe. The memory-only reload gap moved to Accepted on
      James's 2026-09-03 ruling. The full record lives in PR #239 and moves to
      `docs/history/` when Wave F closes.
- [x] **Audit AUD-011/AUD-015 — storage denial is recoverable before work — DONE in PR #282.**
      Guard getter denial on every persisted loader, and never leave Countdown
      for Timer unless the active run is durable. One local-storage recovery
      PR may own both, with separate regression tests; the visible Retry state
      gets rendered Gate 0 first. **P1, Confirmed. M**
      **RESHAPED by the approved hand-off store protocol (2026-08-30, its
      §8):** the store's accessor wraps the localStorage GETTER
      (`SecurityError` fails every access — WHATWG PRIMARY, in the
      antagonist ledger) and absorbs the `loadMonitorRun` loader on day
      one, so THIS chunk owns three loaders, not four (`loadRun`,
      `loadDraft`, `loadTodayPick`). The earlier #230-gate `removeItem`
      spec condition is SUPERSEDED: `removeItem` carries no throw
      condition per the same PRIMARY, and the store's `retire` wraps its
      durable removal regardless.
      **Corrected at the anchor pass (2026-08-28): the audit's four-loader
      list named the wrong fourth loader.** `loadTodayOverrides` is already
      guarded (`todayOverrides.ts:211`, getter inside its try); the real
      unguarded set is `loadRun`, `loadDraft`, `loadMonitorRun`, and
      `loadTodayPick` (`todayPick.ts:53`) — the audit's mounted-Today probe
      never reached it because `loadRun` (`Today.tsx:280`) throws first. Three
      spec conditions from the anchor: (1) a Today fixture that actually
      reaches the `loadTodayPick` call (needs a plan and a pool); (2) one
      COMPOSED denial-then-Start test — **CORRECTED at the spec's antagonist
      DELTA pass (2026-09-03): this composition never happens.** A denied
      getter fails EVERY storage access on that origin, not the run key
      alone, so `saveDraft` (Countdown's own mount effect, called before
      `saveRun`) throws first and Countdown never mounts at all — there is
      no "Start proceeds, then `saveRun === false`" path for AUD-011's fix
      to create. The blocked-start state this spec actually builds is
      produced by QUOTA at the run key specifically (the draft write
      succeeds, only the run write is over budget), not by getter denial —
      see the spec's §3 legs (a)/(b)/(c). (3) the
      Retry surface needs a non-retry exit — a Retry under a still-denied
      getter is a loop. Open research line for the spec: whether the getter
      can throw in a Capacitor WKWebView on its own origin (the WHATWG
      authority is vetted; the native-layer reachability is not).
      **NARROWED AGAIN by the hand-off store's final fix round
      (2026-08-30, adversarial F-2): `loadMonitorRun`'s SELF-CLEAR is gone
      — the read now returns `null` and leaves malformed bytes for the
      store's §8 deferred clear.** That was a genuine defect on this
      branch, not a residual: `Today.tsx`'s mount effect calls the loader,
      so opening Today destroyed a malformed record the store was
      deliberately preserving.
      **CLOSED FOR THIS LOADER at PR #239's review round 1 (item 1):
      `loadMonitorRun`'s `localStorage.getItem` now sits INSIDE its own
      `try`, so a denied getter reads as absent instead of escaping
      `Today.tsx`'s mount effect.** Gated at both layers — the loader
      (`monitorRun.test.ts`, "the storage GETTER itself throws") and the
      composed screen (`Today.test.tsx`, "survives a DENIED storage getter
      on the monitor key"), the latter key-scoped because a blanket denial
      still dies at `loadRun` first. **So this chunk's unguarded set is now
      exactly three loaders — `loadRun`, `loadDraft`, `loadTodayPick` —
      matching the §8 reshaping above; `loadMonitorRun` is off the list.**
      **SPECCED 2026-09-03 as
      `docs/superpowers/specs/2026-09-03-storage-denial-design.md`, and the
      research line is CLOSED.** The getter CANNOT throw on the phone:
      WebKit's `localStorage` getter has exactly one throw, gated on
      `canAccessResource(LocalStorage) == No`, whose three routes are an
      opaque origin, a `file://`-equivalent origin, and
      `StorageBlockingPolicy::BlockAll` — and our `capacitor://localhost`
      (no `server` block; a `WKURLSchemeHandler` serves it) is none of
      them, with the blocking policy embedder-set and unset by Capacitor
      and by us. Full citations:
      `docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`.
      **James's ruling on that evidence (2026-09-03): the three guards ship
      as WEB-ARM hardening — the dev loop, the e2e harness, the browser
      fallback, where a user CAN block site data — and the Retry SURFACE
      for a denied getter does NOT ship**, so anchor condition (3) is
      retired with it. AUD-015's Countdown durability keeps its visible
      state and is where the one Gate 0 goes, because a failed WRITE is
      reachable everywhere. Anchor conditions (1) and (2) survive. Two
      corrections the spec carries: the audit's second loader lives in
      `session/draft.ts`, not `logDraft.ts`; and the catch must be BARE,
      since the getter's non-throwing failure surfaces as a `TypeError`.
      **Tripwire:** the whole argument rests on `server.iosScheme` being
      unset — setting it to `"file"` makes the origin local and the throw
      immediately reachable.

**Riding this wave because it touches `app/server/` and `app/domain/`:**

**RULED by James, 2026-08-31: all three ride the `door` COLUMN's migration
PR** — which is **door PR A** (`2026-09-02-door-partial-design.md` §4) since
the re-scope — not a branch of their own and not the lifecycle spec's PRs. They carry
none of that migration's risk, so bundling them costs a reviewer nothing and
saves three round trips.

- [x] **`ALTER TABLE "preferences" DROP COLUMN "warmup";`** — one line, safe
      once no deployed image reads it. **DONE (door PR A, migration 0022,
      Task 1):** the column is dropped and the `preferences.warmup` Drizzle
      field is removed from `server/db/schema.ts` in the same commit
      (comment now at `:423-432`). Its trigger fired long ago: Phase WU set
      it at "the first server-touching phase after TWO tags have shipped",
      deliberately countable, and ten tags had shipped by the time this
      rider rode.
- [x] **Remove the legacy warm-up guards on the persisted `LogSeed.steps[].kind`
      union.** **PARTLY DONE (door PR A, Task 6, amended at the whole-branch
      review): the union is NARROWED, the GUARD is KEPT behind a cast for
      the residual population.** `LogSeed.steps[].kind` is now the literal
      `"work"` — per the binding sub-ruling from WU, never widened to
      `string`. `buildMonitorLogSteps`'s skip survives as an explicit
      legacy-population read, `(seedStep.kind as string) === "warmup"`, the
      identical shape `summaryModel.ts`'s `warmupIndex` already uses over
      the same records: an unlogged `MonitorRun` authored before warm-up
      removal (PR #150, v0.16.0) still carries the string at runtime, and
      deleting the guard would move that row's AVG SPLIT between the live
      and stored doors. NO NUMBER MOVES. Owed removal, now for BOTH readers
      together: when that population is provably gone.
- [x] **RC-12's last unreconciled comment.** **DONE (door PR A, Task 6):**
      `domain/monitor/types.ts`'s `onDisconnect` doc block no longer claims
      "the phone's Bluetooth stack resetting" or "iOS backgrounding" as
      causes. Both are struck as UNSOURCED and UNMEASURED, not as disproven
      — what the walks establish is the absence of OUR OWN evidence (the
      capture-corpus grep is empty), never the radio's behaviour
      (`docs/history/phase-rc.md:2054-2056`). Wording softened at door
      PR A's PM gate.

**Exit (narrowed by James, 2026-09-03):** a phone locked before the first pull
and a phone backgrounded mid-piece preserve the logical row under the shipped
lifecycle rules. A true link drop mid-piece preserves received actuals and the
eligible held partial for End/save, identifies the `pm5` door, and reports the
incomplete result without inventing measurements. No same-row reconnect or
`MISSED`/trace-break writer is required. After a true drop the app does not
collect subsequent work into that row; this is the accepted cost of deferral,
not a claim of whole-workout recovery. The door clause is delivered by
`session_logs.source` (`pm5 | timer | manual`, NOT NULL, backfilled), including
the no-reading word shipped by door PR A. The phase-close gate still verifies
these outcomes; deferral is not a passing walk or permission to close the wave.

The storage clause is deliberately narrower: while this process remains alive,
a rejected durable hand-off write never silently downgrades a measured session;
the memory tier and held surface preserve it. Reload after that rejected write,
and eviction after a previously successful WebKit/localStorage write, are
instrumented accepted residuals rather than Wave F blockers. Reopen only after
a real observed occurrence.

---
