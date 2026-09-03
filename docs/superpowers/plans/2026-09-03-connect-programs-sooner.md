# Connect programs the erg sooner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** the erg takes our program in roughly half a second instead of two,
and the free row stops claiming ready before the erg has anything.

**Architecture:** the driver defers its eight status subscriptions until the
first CSAFE sequence is acked (or a fallback fires), so the program write
stops queueing behind them on the plugin's FIFO; and the free row's ready
gate moves from "we sent it" to "the monitor accepted it", matching the
workout path.

**Spec:** `docs/superpowers/specs/2026-09-03-connect-programs-sooner-design.md`
(rev 3, hardened: lens 1 full pass; lens 2 skipped, no prescribed code).
**Gate 0:** `docs/design/handoffs/2026-09-03-free-row-sending/` PASSED.

## Global Constraints

- No em-dashes in user-facing copy.
- Approved copy, verbatim: serif line **Starting your row**; checklist line
  **STARTING THE ROW**. Buttons are the shipped classes: `.button-l1` for
  "Show me the numbers", `.button-l2` for Cancel.
- `program()` and `beginFreeRow()` stay the only producers of a program
  write. Nothing new writes to the wire.
- Every post-fix latency figure in the spec is MODELLED. Do not state one as
  measured; the walk measures them.
- Platform conditionals stay in the adapter layer. This work touches
  `driver.ts`, `useMonitorSession.ts` and `JustRow.tsx` only.
- Tests: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run <file>`
  from `app/`; read BOTH summary lines. `pnpm typecheck && pnpm lint &&
  pnpm format:check` before each commit; `pnpm e2e` before the PR.

---

### Task 1: the driver defers its status subscriptions

**Files:** `app/src/monitor/driver.ts`, `app/src/monitor/driver.test.ts`.

**Shape.** `createPm5Driver` today enqueues, synchronously: the sample-rate
write, the CSAFE response subscribe, then eight status subscribes (0x0032,
0x0033, 0x0038, 0x0031, 0x0037, 0x0039, 0x003A, 0x003F). Collect the eight
into one `subscribeStatus()` closure that is NOT called at construction.
Call it exactly once, from whichever comes first:

- the first completed CSAFE sequence, hooked where `sendSequence` resolves
  its `ackPromise` (the `onFrameWritten` hook already there is the WRONG
  point per the spec: it fires before the ack);
- a fallback on `options.schedule`, with the delay a named constant.

**Invariants (spec's own, restated as the tests below):** exactly once per
connect; never after teardown; the first CSAFE write sits behind at most one
other native call; the ring says which path released.

**Ring entries:** `status-subscribe` with detail naming `arm` or `fallback`.

- [ ] Write the failing tests first (all against a transport double that
      RECORDS the order it was called in):
      1. ordering: the program write is enqueued before any status subscribe;
      2. multi-sequence: over a real two-sequence `program()`, no status
         subscribe sits between the prepare's ack and the chunk writes;
      3. no arm: connect, never arm, advance `schedule` past the fallback,
         exactly eight status subscribes;
      4. idempotence: arm AND fallback both fire, still exactly eight;
      5. teardown in the gap: disconnect before either release, zero status
         subscribes and no throw;
      6. the ring names `arm` on the normal path and `fallback` on (3).
- [ ] Run them; confirm each fails for the stated reason; record the text.
- [ ] Implement; green; commit BEFORE any probe (RF22).
- [ ] Probes, each reverted after: remove the deferral (1 red); release on
      `onFrameWritten` instead of the ack (2 red); drop the once-guard
      (4 red); drop the teardown guard (5 red, and name the throw).

### Task 2: the sample-rate write moves behind the program write

**Files:** `app/src/monitor/driver.ts`, same test file.

Its head position exists to set frame cadence, and cadence cannot matter
before any status subscription exists. Move it into `subscribeStatus()`,
ahead of the eight. Invariant 1 tightens from "at most two" to "at most one".

- [ ] Extend Task 1's ordering test: the program write is enqueued behind
      exactly ONE other native call, the CSAFE response subscribe.
- [ ] Probe: move the sample-rate write back to the head; the count assertion
      goes red.

### Task 3: the free row waits for the monitor

**Files:** `app/src/monitor/driver.ts`, `app/src/monitor/useMonitorSession.ts`,
`app/src/monitor/useMonitorSession.test.ts`.

`beginFreeRow()` in the hook currently calls `driver.beginFreeRow()` and
`update({ phase: "ready" })` in consecutive statements. Remove the second.
The driver emits `armed` for a free row when its program send settles:
acked, rejected, or unanswered at the deadline. All three reach `ready`,
because the spec's approved answer is fall-through. NO readback check: for a
free row the readback is the PM5's idle default, proven on hardware.

- [ ] Failing tests at the HOOK (the layer that can reach it):
      1. begin a free row against a delayed fake: phase is NOT `ready`
         while the send is in flight;
      2. feed the ack: phase is `ready`;
      3. withhold the ack, advance past the deadline: phase is `ready`
         anyway, and the ring carries the unanswered entry;
      4. reject the frame: phase is `ready`, and the ring carries the
         failure with its hex trace.
- [ ] Probe: restore the synchronous flip to `ready`; test 1 goes red.

### Task 4: the sending card

**Files:** `app/src/justrow/JustRow.tsx`, `app/src/justrow/JustRow.test.tsx`,
`app/src/index.css` only if a class is genuinely missing (it should not be:
the checklist classes ship for the workout).

Gate 0's approved card, between "Connecting to monitor" and "Ready when you
pull": status label `<DEVICE> · CONNECTED`, serif **Starting your row**,
the three-line checklist with **STARTING THE ROW** current, Cancel only.
Reuse the workout's checklist component rather than re-implementing it
(RF8's shape: this repo has hand-rolled the same pattern three times).

- [ ] Failing test: with the send in flight, the door renders the new card,
      not "Ready when you pull"; the checklist's third line is current;
      Cancel is present and is `.button-l2`.
- [ ] Failing test: Cancel from the sending card terminates on the erg (the
      terminate write reaches the ring). This is the invariant the 3
      September walk established for the ready card; it must hold here too.
- [ ] Probe: render the ready card in the sending state; the first test red.
- [ ] `pnpm e2e`. No screenshots unless a captured screen's LAYOUT changed;
      a new intermediate card that no capture shows is copy-shaped for
      capture purposes. State the call in the report.

### Task 5: the walk leg

Phone walk from Xcode, no recordings. Measures what no gate can.

- [ ] Free row: Connect, photograph the PM5 and phone in one frame at the
      moment the phone leaves the sending card. Ring gives write to ack.
- [ ] Programmed workout: Connect and arm a two-interval workout. Read the
      SECOND ack, not the first: that is where the erg's screen changes.
- [ ] Cancel from the sending card, mid-send: the erg returns to its menu.
- [ ] Run `docs/monitor/sessions/ack-latency-census.py` over the new rings
      and put the before-and-after in the walk README.
