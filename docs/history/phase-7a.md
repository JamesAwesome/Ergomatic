> **Archived 2026-08-28** from `ROADMAP.md` (lines 954-1042 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 7A — Monitor domain (the domain beneath the screens)

**Status:** Done (2026-08-05; merged 2026-08-06 as PR #52, carrying
7A-fix-2 below with it).
**Goal:** The PM5's protocol, a workout compiler, a runtime driver, and the
localStorage-side session record all exist and are heavily tested — no
screen changes (deliberately deferred to 7B).
**Design authority:** `docs/superpowers/specs/2026-08-05-phase-7a-monitor-domain-design.md`,
plan: `docs/superpowers/plans/2026-08-05-phase-7a-monitor-domain.md`.
**Supersedes:** the single-phase "PM5 over Bluetooth" sketch this section
used to be (`ergarcade/pm5-base`/plain-Rowing-Service/no-CSAFE) — superseded
by CSAFE variable-interval programming, the design this phase actually
implements. `docs/superpowers/research/2026-07-27-pm5-ble-research.md`
still holds: no pairing, subscribe-only, Web Bluetooth is Chromium-only.

- [x] `domain/monitor/pm5/`: the CSAFE frame codec (checksum, chunk,
      reassemble), the programming-command byte layouts (`commands.ts`),
      the five BLE status-characteristic decoders (`parse.ts`), and the
      CSAFE ack/reject response parser (`response.ts`); every byte cited
      against the primary CSAFE/BLE PDFs, with three checksum errata and
      one unresolved candidate documented in
      `docs/monitor/pm5-interface-notes.md` rather than guessed
- [x] `domain/monitor/program.ts`: `compileProgram`, turning a confirmed
      session's phases into the PM5's variable-interval IR
      (`WorkoutProgram`/`ProgramInterval`) or a typed, copy-ready
      `CompileError`; Table 19's parameter limits re-verified against the
      primary PDF
- [x] `domain/monitor/types.ts`: the normalized seam every consumer above
      the codec sees (`MonitorCapabilities`/`MonitorFrame`/`IntervalActual`/
      `MonitorEvent`/`MonitorDriver`), plus the `Transport`/
      `DiscoveredMonitor` radio abstraction three later transports satisfy
- [x] `src/monitor/driver.ts`: the runtime driver, with ack-gated write
      sequencing over a pending-ack queue for coalesced BLE notifications,
      a state machine with terminal-state latching (Appendix E's auto-cycle
      never un-finishes a session), an optional tick-driven ack-timeout
      policy, and `intervalRemaining`/`intervalAccrued` reading 0x0031's own
      per-interval Elapsed Time/Distance pair directly (CR2 spec 2a Task 6
      deleted an earlier 0x0033 Last Split checkpoint subtraction the
      inversion result falsified — interface-notes.md §20 items 17/24);
      `src/monitor/transports/fake.ts` simulates a real PM5 end to end for
      CI (byte-for-byte programming verification, six injection hooks)
- [x] `src/monitor/monitorRun.ts`: the monitor-driven session record
      (`MonitorRun`, localStorage, mirroring `session/run.ts`'s idiom), the
      cross-clear rule (creating a `MonitorRun` clears any `SessionRun`),
      and `anyLiveSession()`'s coexistence truth table (9 cells, pinned);
      Today's stale-draft discard gains a live-monitorRun exception, this
      phase's one permitted UI touch
- [x] `src/monitor/transports/capacitorBle.ts`
      (`@capacitor-community/bluetooth-le`) and `src/monitor/transports/
webBluetooth.ts` (`navigator.bluetooth`): thin `Transport` adapters
      for the two real radios, compile-tested shapes, deliberately excluded
      from the coverage gate alongside `src/native/**` — no BLE radio
      exists in CI to prove either one against
- [x] `docs/monitor/pm5-interface-notes.md` gains §17, the laptop session
      runsheet consolidating every doc ambiguity and reviewed assumption
      into one numbered checklist, and §18, what real firmware was then
      observed to do

**Record:** this domain met real hardware in the same-day `phase-7a-fix`
pass (plan: `docs/superpowers/plans/2026-08-05-phase-7a-fix.md`), and every
observation, correction and withdrawal since lives in
`docs/monitor/pm5-interface-notes.md` §18 (laptop sessions 1-3, hardware
walks 1-4) and §19 (each idiosyncrasy, and whether it was ours or the
machine's). The headline reaches back into this phase's own codec: the
CSAFE status byte is a BITFIELD and `0x81` IS AN ACCEPT (§19.1), so of the
five defects the fix pass named, D1 and D2 are WITHDRAWN as stated (§19.2;
the display-emptying `:00` transition stays an open finding), D3's forward
attribution is real but applies at every boundary rather than only a
resting one (§19.8), D4 stands (§18's own D1-D5 table), and D5's fix stands
on corrected reasoning (§19.9). The monitor never goes quiet after a
workout either; our own terminal latch did (§19.4). Phases 7A-fix-2 and
7A-fix-3 below are the fix lists that record generated.

**Deferred to 7B/7C, both below:** the screen wiring, PM5-sourced log
entries, and the reverse cross-clear all shipped there. The §17 items still
open need an operator at the erg rather than a CI gate; Triggered follow-ons
collects them.

**Exit:** MET — every domain/driver behavior the design spec names has a
passing test (100% on `domain/monitor/**` and on `src/monitor/
monitorRun.ts`); the fake transport proves the full program → run →
terminate arc against the exact bytes a real PM5 would exchange; the
cross-clear guard and `anyLiveSession()`'s own truth table are pinned. **Not
every guard wires onto `anyLiveSession()` mechanically** (final-review
M-1, correcting this section's own prior claim): two guards need the
UNLOGGED distinction the function deliberately collapses and must keep
reading `loadRun()`/`loadMonitorRun()` directly — see Phase 7B's own
bullet below before wiring any guard.
