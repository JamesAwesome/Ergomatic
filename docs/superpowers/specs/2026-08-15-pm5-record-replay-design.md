# PM5 record-and-replay harness — design

**Date:** 2026-08-15 · **Status:** approved by James (design gate passed,
PM verdict GO-WITH-CHANGES incorporated; antagonist spec pass B1-B4/M1-M5
amendments incorporated) · **Phase:** infrastructure riding alongside Phase
CR2, split as Stage A / Stage B at spec 2's hardware walk.

## What this is

A development/validation capability, not a rower-facing feature: record a
real row's raw BLE traffic at the app's transport seam, then replay it as
though live, so that (a) our derived numbers can be validated against the
machine's own wire-carried numbers in CI with no hardware, and (b) rendering
can eventually be validated against real frame sequences. It exists to serve
CLAUDE.md recurring failure #11: when the machine reports a number we also
compute, compare them.

## Why now (the evidence)

- We have already built narrow versions of this recorder **three times in
  instalments**: `structure` raw-on-change (`driver.ts:3053-3066`),
  `twd-sample` on a 25 m bucket (`:3078-3093`), `terminal-raw` from a
  one-frame buffer (`:2082-2087`). Each was a hardware walk paying for the
  general instrument in narrow patches.
- The 2026-08-15 session killer is convictable only at its terminal tick:
  `terminal-raw` now logs the killing frame's 19 raw bytes, but not the
  ~16 s of context before it (`driver.ts:3029-3037`, walk README:112-114).
- The boundary-poison mechanism (PR #99's falsifier) is stuck at SECONDARY
  solely because of "the one unrecorded half": 0x0033's count at the
  poisoning tick.
- Nothing inbound is retained verbatim beyond 0x0037/0x0038 and CSAFE acks
  (`driver.ts:1661-1666` is the ring's retention policy): every notification
  is decoded and merged, then its bytes are gone. Measured from the
  committed record: 2,651 status frames over 1,190 machine-seconds in
  `pm5-session4b-final.log.gz` — none of whose payloads survive. The 0x0034
  sample-rate write goes through no `log.record` at all; no ring entry has
  ever shown it.
- The committed captures (`docs/monitor/sessions/*.log.gz`) are decoded
  driver output and structurally cannot drive the real driver
  (`captureReplay.test.ts:10-45`: no wire bytes; no `program()`; and see
  the correction in M3 below — the third stated reason there is wrong and
  gets fixed by this work).

## Research pass (required by CLAUDE.md; claims tagged)

### Does the underlying system have the concept?

**No.** Chromium's CDP `BluetoothEmulation` domain (15 commands, verified
against the live listing) can fake adapters, advertisements and read/write
responses, but has **no command that injects a characteristic notification
with data** (PRIMARY: CDP BluetoothEmulation docs; re-verified at spec
pass). A PM5 stream is notification-driven, so browser-level fake BLE
cannot replay a row; it also can never cover the Capacitor/CoreBluetooth
path (INFERENCE, architectural). Playwright has no Bluetooth API
(SECONDARY). The WebDriver-BiDi Web Bluetooth proposals cover connection
and service discovery, not notification data (SECONDARY: puppeteer#14455,
W3C thread 2025-03). Conclusion: replay happens at **our own transport
seam** — a seam we own, so we assert nothing on the platform's behalf. The
recording's clock is our own instrument reading (relative monotonic ms),
not a PM5 concept; the PM5's authoritative time rides in the payloads.

### Prior art

- **ErgometerJS** (Concept2-specific; SECONDARY, source read): ships a
  `RecordingDriver`/`ReplayDriver` pair at the driver seam. Recording is one
  totally-ordered JSON array of `{timeStamp (relative ms), eventType,
  service/characteristic UUID, hex data}`. Two lessons adopted: **record
  the full connect/handshake in the same file** (a notification tail
  without the handshake never reaches connected state), and — the one that
  matters most — **the total order is a BARRIER, not a schedule**:
  `ReplayDriver.checkQueue()` only ever examines the head of the queue, so
  a recorded notification that follows a recorded write cannot fire until
  the caller issues that write. Their README states the consequence
  ("otherwise it will sometimes wait for a response which was not
  recorded"). Their write matching compares event type + UUIDs, never
  bytes; byte-for-byte matching below is our own addition, labelled as
  such.
- **OpenRowingMonitor** (SECONDARY, not source-read; not load-bearing):
  keeps a library of raw recordings with expected end results beside them,
  replayed against every new version as regression tests. Adopted:
  recordings-with-expected-results, and the two-mode clock (realtime /
  as-fast-as-possible).
- **react-native-ble-plx-mock-recorder** (SECONDARY): records real device
  traffic at the BLE-library seam into JSON recordings; lesson: recorded
  mocks stay in sync where hand-written mocks rot.
- **Polly.js/VCR cassette pattern** (SECONDARY): one timestamped log;
  replay timing is a mode (instant/fixed/scaled).
- **Nothing found** (a result): PyRow/py3row, ergarcade, Float, Concept2's
  own SDK — no record/replay-for-regression facility. Zwift/GoldenCheetah
  internal replay practices — nothing substantive public. FIT confirmed
  unsuitable as a raw-frame carrier (PRIMARY for what FIT is; INFERENCE for
  the conclusion). btsnoop/PCAP sits at the HCI layer, below both our
  transports (SECONDARY) — wrong layer.
- Every project found keeps **one totally-ordered event log**, never
  per-characteristic streams; ordering is recorded, never reconstructed
  (SECONDARY; independently confirmed in ErgometerJS source). Adopted —
  arrival order is exactly where our last two defects lived (the
  0x0031/0x0033 skew).

### Adopt-vs-build (verified against the registry, 2026-08-15)

No third-party package is adopted; each candidate was checked, not assumed:
ErgometerJS is unpublished on npm and bound to its own driver stack
(pattern source only); `web-bluetooth-mock` is stale (2023) and mocks
`navigator.bluetooth`, a seam below ours that cannot cover Capacitor;
`react-native-ble-plx-mock-recorder` is bound to the RN BLE library's API;
rrweb records the DOM and Polly.js records HTTP. Compression needs no
dependency: `CompressionStream` is native in browser and Node 26 (verified
locally), and the Node test side already uses `node:zlib`. The virtual
clock uses the driver's own injectable `now`/`schedule`. The one component
with engineering weight — the barrier scheduler honouring our driver's
ack-gating — is bespoke to that driver by nature; no package supplies it.

## Scope ruling (PM design gate, 2026-08-15)

PM verdict: **GO-WITH-CHANGES**, all four changes accepted by James:

1. **No phone code this phase.** The recorder is dev/web-gated behind the
   existing dead-code-elimination boundary. On-device recording is a future
   **Tier 2** decision requiring: a hard byte bound, a persist trigger that
   is not the terminal transition, an export path that exists, and the
   on-device delivered rate confirmed. **Note (antagonist M4): the iOS
   cadence is already documented as ~90-180 ms status-tick spacing vs the
   desktop's ~2/s (`pm5-interface-notes.md:4403`) — a platform difference,
   not an estimate conflict — and a dev/web walk cannot measure the phone's
   radio, so that Tier 2 input does NOT come from this phase's walk.**
2. **Export is dev/web-trivial** (blob download); the triple-tap path is
   clipboard-only and there is zero IndexedDB in `src/` — neither is
   extended this phase.
3. **The full-UI e2e rung and the dev replay viewer are cut** from this
   phase. The UI rung's assertions target a surface spec 3 is about to
   rebuild (handoff: `docs/design/handoffs/2026-08-15-connected-v2/`) and
   need a new byte-carrying injection type (`FakeScript` is semantic);
   sequence after spec 3. The viewer is fast-path-sized once a real
   recording exists.
4. **Exit criteria must be falsifiable** — see Exit criteria below.

Sequencing: Stage A runs alongside spec 2's design work and **lands before
spec 2's hardware walk**, so the recorder rides that walk as a passenger and
the walk produces the first raw capture. **The walk must run on Chrome/Web
Bluetooth from the dev server (the re-walk's own medium, walk README:82) —
on the phone the native adapter routes past `resolveDefaultTransport` and
the tap records nothing. Pin this in spec 2's walk protocol, with the
recording tab foregrounded and the display awake (Chrome freezes backgrounded
pages; `t` is a delivery-to-JS timestamp, not a radio timestamp).** Stage B
builds on that capture. James's release ruling: TestFlight ships when Phase
CR2 is over (all three specs), unless something critical forces it earlier.

## Design — Stage A (no hardware required)

### A1. The recording tap

`recordingTransport(inner: Transport): Transport` in
`app/src/monitor/transports/recording.ts`, a `Transport` decorator (shape
template: `autoTicking`, `transports/index.ts:155-182`). **Wiring point
(antagonist M2): it wraps the REAL transport returned at
`transports/index.ts:223`, under a new arm inside the `fakeMonitorEnabled`
gate — NOT the `if (script)` fake arm.** Inside the gate it is dead-code
eliminated from production builds; `app/scripts/dist-grep.sh` gets a new
needle for it, and per its own header the needle is a **string literal**
(the recording format tag below), never an identifier — identifiers survive
minification renamed (B3). Zero product-code change outside the gate.

It records **every** transport event, unfiltered and undecoded:

- `scan()` results (m9 — the session flow calls `scan()` before `connect()`
  and aborts on an empty list; the handshake lesson includes it),
  `connect`/`connected`, per-characteristic `subscribe`/`unsubscribe`,
  `disconnect`, `onDisconnect` firings — the full handshake, in-file.
- Every notification (`dir: "rx"`) and every write (`dir: "tx"`) with
  characteristic UUID and payload hex.
- **Recording happens once per arrival at the characteristic level
  (antagonist M1): the driver subscribes to 0x0031 twice
  (`driver.ts:3024-3025`, `:3310`), so a tap inside the per-subscriber
  callback would record — and replay would then deliver — every 0x0031
  twice, doubling every derived total. The tap hooks the transport's
  single per-characteristic delivery; replay fans out each rx to all
  current subscribers of that characteristic.**

Record shape (JSON-lines, one event per line — chosen for append-only
streaming, not diffability; committed artifacts are gzipped so there is no
diff property to claim):

```
{"v":"pm5-recording/v1","app":"<git describe>","transport":"web","program":{...},"ua":"..."}
{"seq":0,"t":0,"kind":"connect","id":"...","name":"PM5 432331249"}
{"seq":1,"t":12,"kind":"subscribe","char":"...-0031-..."}
{"seq":2,"t":118,"dir":"tx","char":"...-0021-...","hex":"f1 76 04 13 02 01 02 60 f2"}
{"seq":3,"t":140,"dir":"rx","char":"...-0022-...","hex":"f1 81 76 01 13 e5 f2"}
```

The header line carries: the format tag `pm5-recording/v1` (also the
dist-grep needle), app git describe, transport kind, user agent, and **the
armed `WorkoutProgram` (or the library workout id it compiles from) — B4:
`program(p)` takes the program as an argument and `verifyArmed` derives its
expectation from it, so a replay cannot arm without it, and it must NOT be
reconstructed by decoding recorded tx bytes (that would put an invented
decoder inside the oracle).** The recording UI writes the program into the
header at arm time.

`t` is monotonic ms since tap creation (`performance.now()` delta; no wall
clock, consistent with the event log's existing rule; monotone and never
re-based). **No flood guards, no sampling, no decoding.** The ring's
curation policy has already manufactured a false planning conclusion
(pm-ledger 2026-08-15: "the absence was ours"); the tap's contract is that
absence in a recording means absence at the seam. Cost is arithmetic, not
concern: ~6.6 rx/s at desktop cadence, one `performance.now()` and one hex
encode each — a 20-minute desktop session is ~8k events, ~1.2 MB in
memory, ~120 KB gzipped (at the documented iOS cadence it would be ~6 MB —
a Tier 2 number, recorded here for that discussion).

Storage: in-memory array for the session; a dev-gated "Download recording"
control in the diagnostics sheet saves gzipped JSON-lines via a blob URL.
Committed recordings live in `docs/monitor/sessions/` beside a short README
row (provenance, program rowed, PM5-screen photo transcription where taken
— the ORM expected-results posture).

### A2. The replay transport

`replayTransport(recording, clock)` implements `Transport`. **Scheduling is
barrier-gated on tx, not clock-gated (B1 — the binding amendment).** The
driver's writes are strictly ack-gated and `discardStaleAcks` purges the
ack buffer at the start of every sequence (`driver.ts:3876-3892`, `:3857`,
`:1405-1413`), so an ack released on the recorded clock before the driver
writes is discarded and `program()` hangs; released late, it burns
`verifyArmed`'s 30-tick budget. The recorded gap between `subscribe` and
the first programming write is how long James took to press a button;
nothing under replay reproduces it. Therefore:

- The recording is partitioned at each `tx` entry. Replay delivers rx
  events up to the next `tx` barrier (draining microtasks between each
  delivery), then **holds until the driver issues its matching write**.
  `t` orders events and advances the virtual clock; it never releases
  them.
- Write matching: byte-for-byte against the recorded `tx` (our addition;
  ErgometerJS matches type+UUID only). On mismatch, **log a divergence and
  release the barrier anyway** (our improvement over ErgometerJS's stall).
  The barrier wait is bounded so a wholesale divergence surfaces as a
  failed assertion, never a Vitest timeout. CI rungs assert **zero
  divergences** for committed recordings — the sharp version of "a
  recording's write/ack sequence is a snapshot of the driver that made
  it": when `program()` evolves, the rung fails loudly and the recording
  is re-cut or the rung re-based.
- rx fan-out is per current subscribers of the characteristic (M1).
- **Clock modes:** `instant` — virtual time, caller pumps; **the driver is
  NOT wall-clock-free (B2): `FINISH_GRACE_MS` comparisons and the summary
  reconcile run on `now()`/`schedule` (`driver.ts:794`, `:2100`, `:2465`,
  `:2783`), defaulting to `Date.now`/`setTimeout`. The Stage B rung binds
  the driver's injectable `now`/`schedule` (`DriverOptions`) to the replay
  clock, so grace windows expire in virtual time.** `realtime`/`scaled` —
  real timers, for eyeballing later (the viewer itself is deferred).
- Because the recording contains the real programming writes and their
  real acks, and the header carries the program, a replayed session
  exercises `program()` and arms a real program — closing the gap that
  kept the old captures away from the register map.

### A3. Stage A verification (no erg)

The tap and replay transport are proven by a record→replay round trip over
a **synthesized session**: the tap wraps `createFakeTransport` (`fake.ts`)
driven through a real `createPm5Driver`, the emitted recording is replayed
into a fresh driver, and the two drivers' event outputs must be identical.
This proves the tap records faithfully and the replay scheduler drives the
real driver through `program()` to a terminal state — it does **not**
prove wire fidelity to hardware (that is the walk's job, and the exact
trap `captureReplay.test.ts` reason 2 warns about). Known blindness,
stated: **the fake emits 0x0033 → 0x0032 → 0x0031 atomically per tick
(`fake.ts:1064-1066`) — zero inter-characteristic skew, in the OPPOSITE
order to the hardware the walk logged — and a fake-driven recording has a
degenerate `t` column (a whole session inside a few real ms). Stage A
cannot exercise skew or the timeline; skew fidelity is established at the
walk, not in Stage A (M3).** Self-mutation per TESTING.md §3 applies to
the scheduler (e.g. break the barrier rule, watch the round trip fail).

## Design — Stage B (after spec 2's walk)

A Vitest CI rung: load the committed real recording, drive the **real
`createPm5Driver`** through `replayTransport` in instant mode with
`now`/`schedule` bound to the replay clock (B2), assert our derived totals
against the machine's own wire numbers:

- **Oracle independence (binding):** the machine-side numbers (TWD bytes
  11-13 of 0x0031, per-interval finals via reset detection) are decoded by
  a minimal reader private to the test — not by the driver under test, and
  never via `intervalIndex` or any field the implementation keys on
  (the tautology rule, `captureReplay.test.ts:59-77`).
- The rung's assertions are the walk's own photographed numbers (Exit
  criterion 1).

## Exit criteria (each can fail)

1. **The keystone replays.** A recorded 2×250 m r0 row (spec 2's walk,
   re-cut of the 2026-08-15 keystone) replayed through the real driver in
   CI reproduces the accumulator against machine TWD to the re-walk's
   tolerance (499.5 vs 500) — with no hardware, zero divergences.
2. **Recording does not change the session.** Two halves: the walk row's
   app numbers agree with the PM5 screen to the re-walk's tolerance (the
   existing photograph + `final-totals` protocol, unchanged); and the
   recorded 0x0031 inter-arrival distribution matches the committed
   baseline (~2.2/s, modal 0.50 s, from `pm5-session4b-final.log.gz`) — a
   tap that perturbed delivery moves that number, no second photo needed.
3. **The rung can go red.** A deliberate mutation of the register map's
   write rule turns the Stage B rung red; restore, green. Recorded in the
   PR as the self-mutation note.
4. **The instrument captures the boundary (M5 rewording).** For every
   work→rest boundary in the walk, the recording carries the full 0x0031
   state-byte sequence and every 0x0033 sample with its Interval Count, in
   arrival order. (Whether a poisoning boundary occurs is the machine's
   choice — the mechanism is intermittent and did not recur on the
   re-walk; what the boundaries showed is a non-gating research output,
   written into the walk README either way.)
5. **Round trip + bundle absence (Stage A, pre-walk):** the A3 round trip
   is green and deterministic; dist-grep's `pm5-recording/v1` literal probe
   is proven to bite (temporary static-import mutation goes red, revert,
   green) and the production bundle is clean.

## Named questions the first capture answers (non-gating)

- Is the 0x0034 sample-rate write (100 ms requested, `commands.ts:94`)
  honoured on desktop? The committed record shows the default ~500 ms
  cadence, and the write is fire-and-forget with no ring entry — the
  recording sees both the write and the resulting cadence, settling it.

## Honest limits (recorded, not caveats)

- Replay reproduces what happened. It **cannot generate the counterfactual
  side of an inter-characteristic skew**; PR #99's synthesized-fixture rung
  (`sessionTotals.test.ts`) remains the sibling technique for
  both-sides-of-the-skew questions. A synthesized (fake-driven) recording
  additionally has no skew at all and no meaningful timeline (M3).
- A desktop recording drives CI at a cadence the phone never sees
  (~2/s vs ~90-180 ms spacing, documented transport-relative), and the
  driver's tick-count budgets (`verifyTicks`, `settleTicks`, `ackTimeout`)
  are transport-relative too — a green rung says nothing about them on
  iOS (M4).
- It cannot test touch/input or anything above the DOM (the swipe lesson:
  check the harness's input capability).
- A recording is an instrument: its tap sits between `Transport` and the
  driver, so it cannot observe radio-level loss or coalescing, and its own
  correctness is established at the walk (exit criterion 2), not assumed.

## Docs and small fixes riding this PR

- File the harness in ROADMAP (it currently has no home): Stage A/B as CR2
  infrastructure, UI rung filed as a spec 3 follow-on, Tier 2 as a
  trigger-gated follow-on ("a defect fires on-device that the dev/web
  recorder cannot see", with the byte bound / persist trigger / export
  path / on-device rate as its prerequisites).
- Amend CR2's exit line to name R0/F6/F7 (added 2026-08-15 without amending
  the exit; PM ruling).
- Correct CLAUDE.md recurring failure #11's replay sentence: the captures
  contain zero `boundary` events and the boundary-actual-sum oracle is
  unsound; the sound oracle is each interval's own final pre-reset reading
  (architecture review §F2, correction owed since 2026-08-13).
- Correct `captureReplay.test.ts:23-26`: the fake does not zero-fill
  0x0033 (that is `sessionTotals.test.ts:402`'s priming shortcut); the
  fake's actual property is `toMachineIndex`-derived counts with zero
  skew, emitted 0x0033-first (M3).
- Fix stale prose: `driver.ts:377` and `:3526` say `verifyTicks` defaults
  to 20; `DEFAULT_VERIFY_TICKS = 30` (`:628`).
- Land the PM's and antagonist's proposed ledger entries (both engagements,
  2026-08-15).
- Pin the walk medium + tab-foreground protocol into spec 2's walk
  runsheet when that spec is written.
