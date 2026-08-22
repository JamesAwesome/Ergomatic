# The link can be lost, and the app says so (Phase LL, the phase's own subject)

## What and why

On 2026-08-20 James armed a workout on his phone, walked out of range, cycled
Bluetooth off and on, and rowed. The screen held `1 OF 3 · READY` the whole
time; his rowing went nowhere; and the app then could not reconnect —
surviving a force-quit and a PM5 restart — until he deleted and reinstalled
it. He also reports the opposite: being offered Connect while already
connected.

One root: **the app's connection state is a local belief, never an
observation, and it can be wrong in both directions.** This spec makes the
app observe. Its goal is not to keep the link alive; it is that a rower is
never lied to about the link, never loses a row silently, and never has to
delete the app.

The ecosystem review of 2026-08-21 found the problem is wider than the walk
showed: **four distinct mechanisms produce the same silent short row**, and
only one of them is even partially covered today. It also corrected our own
retry-path diagnosis — there is no existing discipline to copy for recovery;
it is specified from scratch here.

**Weight: TRIAD** — task 4 adds a reason code to a stored row (a stored
shape), and the watchdog changes when live numbers freeze (what a rower sees
a number do). Full antagonist pass on this spec before implementation; PM
final-PR gate on the PR.

**Sequence (ruled, research pass 2026-08-20): diagnosability → detection →
recovery.** You cannot fix what you cannot see, and the walk proved it —
both of its findings were evidence-poor because nothing on native could
record anything.

**Standing rulings inherited, not reargued:** buy nothing; correct-resume
over a background mode; RECONNECT IS OUT (preconditions in ROADMAP);
banner-as-shipped for the lost-link UX (James, 2026-08-22) — this phase
makes the existing "LOST THE MONITOR" promise true rather than designing a
new one; the PM5 has no resume concept, so no copy may promise a gap gets
filled.

## §1 Diagnosability — two decorators, deliberately not one

**The gap:** `adapters/monitorTransport.ts:49-56` returns
`createCapacitorBleTransport()` raw. Byte capture is structurally impossible
on the platform that produces every real row, and there is nowhere to hang a
watchdog.

- **A production-safe LIVENESS decorator, on BOTH arms.** Wraps any
  `Transport`; records frame-arrival times, last-N lifecycle events with
  timestamps, and counters — numbers, never payload bytes. Always on. This
  is where §2's watchdog lives.
- **The byte RECORDER stays a separate decorator behind its existing
  build-time constant.** One combined `withDiagnostics` wrapper would ship
  the recorder's whole module graph into production — recurring failure 12,
  settled by building and grepping `dist/` in both directions, not by
  reading the import graph.
- **The ring grows up.** Today it records decisions and almost no numbers,
  has no time axis, and dies with the tab — on native it IS the record.
  Entries gain a monotonic timestamp; the ring gains the liveness numbers;
  and it is retrievable from the FAILURE screen, not only the log screen —
  the 2026-08-20 walk lost F-1's evidence precisely because the ring's only
  door was downstream of the failure.
- **`0x0039` and `0x003A` stop bypassing the ring.** They subscribe directly
  (`driver.ts:3649/3653`) so not even their hex could reach it, and
  `0x003A`'s callback takes no bytes parameter at all. One-line class of
  fix, and the precondition for ever settling the summary premises.

## §2 Detection — four mechanisms, one honest axis

The four, from the review, each with its cover:

1. **Bluetooth power-cycle** (James's exact reported trigger). Apple: on
   power-off all `CBPeripheral` objects "become invalid; you must retrieve
   or discover these peripherals again." The plugin's `.poweredOff` arm
   resolves no per-device key — whether `didDisconnectPeripheral` fires for
   our device is INFERENCE either way (Apple documents neither) and is walk
   item W5. The signal that IS emitted, `onEnabledChanged`, we have never
   subscribed to. **Subscribe it.** Cheapest fix in the phase.
2. **iOS backgrounding.** `Info.plist` declares no `UIBackgroundModes` and
   the monitor stack registers no app-lifecycle listener anywhere — an
   incoming call mid-piece produces the reported failure with no radio fault
   at all. **Register the lifecycle listener**; on resume, treat the stream
   as suspect until the continuity rule (§4) passes it. Whether a backlog
   drains on resume is walk item W6 — design for both outcomes, promise
   neither.
3. **A single characteristic's subscribe rejection** calls `disconnectCb`
   while every other subscription keeps delivering (`capacitorBle.ts:430-448`)
   — a `disconnected` phase with an intact frame stream, which then freezes
   the series recorder for the rest of the session (measured on replay: 197
   of 419 samples lost, `truncated` false, stored heroes unchanged). **A
   partial subscribe failure is its own state, not a disconnect.**
4. **A genuine drop inside the `callerInitiatedDisconnect` window** is
   swallowed as housekeeping (`capacitorBle.ts:227-238`). **Attribute by
   device+attempt, not by a global boolean window.**

**The watchdog.** Status-arrival watchdog at the transport seam, keyed on
`0x0031` ONLY. Threshold **2500 ms**, and the constant's comment carries both
derivation numbers: ~3× our worst recorded web inter-frame gap (810 ms) and
~25× the native ~100 ms cadence. **DISARM during workout states 10/11 and the
finish hand-off window** — without that it fires across every normal finish
and races the boundary the hold protects. Its output is a **`stale` link
axis** that recovers on the next valid frame; it NEVER fakes a disconnect
event. Stale is a fact about our inbox, worded as ours — the shipped banner
copy already gets this right.

**What fires the banner:** disconnect (real), enabled-off, and stale past
threshold. All three land on the same shipped "LOST THE MONITOR" treatment
(banner-as-shipped ruling). Live numbers freeze visibly; End keeps what we
saw.

## §3 Recovery — specified from scratch, because the record was wrong

**Correction inherited from the review:** the walk README's diagnosis said
`connect()`'s catch clears `driverRef`; it does not, and never did. The only
two `driverRef.current = null` sites are `cancel()` and teardown.
`ConnectedInterstitial.tsx:299-309` reads a stale local and its own comment
says so. There is no existing discipline to copy.

The rule set:

- **Failure disposes.** Any failed `connect()` or `program()` tears down the
  transport it was using and nulls the driver ref before the failure screen
  renders. Try Again therefore always starts from nothing — a fresh scan, a
  fresh connect, a fresh program. The 2026-08-20 `LINK-FAILED` loop
  (reprogramming over a dead driver, with `connect()` early-returning because
  the ref was still set) becomes unrepresentable rather than guarded.
- **The already-connected guard (F-6).** Before scanning, ask the plugin
  `getConnectedDevices`. If iOS already holds our peripheral, offer it —
  never a second connect attempt against a machine that may already be held.
  Note: whether `retrieveConnectedPeripherals` finds a PM5 given `0x0030` is
  unadvertised is an open probe; if it returns nothing, the guard degrades to
  today's behaviour and says so in the ring.
- **The `initialize()` memo hoists to module scope** in `capacitorBle.ts` —
  one line, restoring an invariant the file's own comment already claims
  (every connect attempt currently constructs a new `CBCentralManager` while
  the plugin reuses the old `Device` with its callback map intact). The harm
  is unproven and this does not claim to explain the force-quit survival; it
  restores a stated invariant cheaply.
- **What this does NOT do:** auto-reconnect, background scan, RSSI ranking,
  MISSED-row backfill. All remain OUT with their preconditions unchanged.

## §4 The honest close — a stored reason, and a continuity rule

**Today a link death and a rower stopping early are both `terminated: true`,
and the server row carries neither flag.** A tester's "the app lost my row"
and "I bailed at minute two" are indistinguishable in the record.

- **`MonitorRun` and the server row gain a close reason**: at minimum
  `finished | ended-by-rower | link-lost | interrupted`. Additive-optional,
  the `endedBy?` precedent; old rows read as unknown, never backfilled.
  **This is the stored shape that makes the spec TRIAD.**
- **The continuity rule, borrowed not invented** (RowTracer, MIT —
  `pm5Continuity(before, after)`): a resumed stream is REJECTED as a
  continuation if elapsed went back more than 2 s, distance back more than
  5 m, or stroke count dropped. On reset: preserve the interrupted record,
  start clean, never merge silently. This guards §2's resume path and any
  future reconnect equally — a resumed stream folding into a stale register
  map is the exact defect this phase was opened to prevent.

## §5 The finish-line race — in the spec, LAST, and severable

The review measured that we disconnect **21.7–107.3 ms after the terminal
0x0031**, and that the final-split timing premise in `ConnectedSurface.tsx`
("~1 ms after") is false — measured −179.9 to +90.2 ms, sign varying, so in
two of four captures the split arrives FIRST and the 3500 ms hand-off hold
buys nothing.

Hold the radio past the terminal frame until whichever comes first: a 0x0031
reporting workout state 12 (`parse.ts:431` already maps it), a 0x0039
arrival, or a bounded outer clock of 3.5 s. Log which path fired — state 12
at the finish is an UNOBSERVED wire premise and ships as a fallback-guarded
read, not an assumption. The stated tension to resolve in implementation:
`ConnectedSurface.tsx:60-63` deliberately refuses to hold a GATT link across
iOS backgrounding, and that refusal stands.

**Severable:** if this task slips or its review stalls, tasks 1-4 ship
without it. It is the riskiest wire work in the phase and blocks nothing
else.

## §6 Testing, bound by Phase WU's lessons

- **`app/e2e/` is NOT typechecked** — no brief may claim the compiler
  catches anything there. Assertions must be run, not compiled.
- **pnpm eats scoped-run flags in both suites.** Working forms:
  `pnpm exec playwright test --grep`, `pnpm exec vitest run`. **Check the
  run count**; a full-suite count means the filter was eaten.
- **All gates FOREGROUND** — a dispatched subagent's background waits die
  when it idles.
- The fake models what this spec consumes: enabled-state notifications, a
  suppressible frame stream (for the watchdog), a per-characteristic
  subscribe failure, and a resumable stream that violates continuity. A
  fake that cannot produce the failure cannot prove the detector — the
  Rest Time lesson, one phase earlier.
- Replay the committed corpus wherever it can speak: the subscribe-rejection
  freeze already reproduces on replay (197/419 samples), and the watchdog's
  threshold must be validated against every capture's real inter-frame gaps
  (no capture may trip it while healthy).
- **The 0x0031-before-0x0033 skew is measured, not inherited** — the 2 Hz
  numbers do not transfer to native's ~10 Hz. The liveness decorator is the
  instrument; record the distribution in the report.
- Self-mutation on every behavioural test, byte-identical restore; per-file
  coverage; e2e + screenshots foreground.

## §7 Exit criteria

1. Each of §2's four mechanisms, reproduced in a test, moves the surface off
   `READY`/live numbers within its stated bound and shows the shipped
   banner. The watchdog case is proven with a suppressed-stream fake AND
   validated against every committed capture staying green while healthy.
2. A failed `program()` leaves NO driver ref and NO held transport — proven
   by a test that fails against today's code, reproducing the LINK-FAILED
   loop's precondition.
3. Try Again after an induced failure reaches a fresh scan/connect/program —
   the loop is unrepresentable, asserted structurally (no path from failure
   state to `program()` without passing through transport construction).
4. The already-connected guard consults the plugin before scanning, with
   both outcomes tested (device returned; nothing returned degrades to
   today's flow and logs it).
5. The close reason lands on `MonitorRun` and the server row
   (additive-optional), round-trips POST→GET, rejects unknown values, and a
   link-lost close is distinguishable from ended-by-rower in the stored row.
6. The continuity rule rejects a stream violating any of its three bounds,
   preserving the interrupted record and never merging — pinned against a
   synthetic resume built from a real capture's frames.
7. The ring carries timestamps and liveness numbers, is retrievable from the
   failure screen, and receives 0x0039/0x003A. Proven on the failure path,
   not the happy path.
8. The recorder's module graph is absent from the production bundle, proven
   by `pnpm build` + string grep over `dist/` in both directions.
9. W5 and W6 are on the phase's walk card with their questions stated.
10. The next tag's notes say a lost link now says so, and a lost-link ending
    is recorded as such.

## §8 Out of scope, each with its reason

- **Reconnect** — preconditions unchanged (fake can't prove it; detection
  ships first; buy-vs-build answered). §3's disposal rule is designed not to
  preclude it.
- **A fifth "reconnecting" UI state** — DEVIATIONS row 75's ruling stands;
  no copy promises what does not exist.
- **Background-mode logging** — ruled dead (WebKit throttler; correct-resume
  chosen).
- **The 90-second JS-survival probe (§D1e)** — still worth running once, at
  a walk, but nothing in this spec depends on its answer.
- **MISSED rows, RSSI, background scan** — reconnect's dependents, out with
  it.
