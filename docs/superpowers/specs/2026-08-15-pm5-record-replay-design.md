# PM5 record-and-replay harness — design

**Date:** 2026-08-15 · **Status:** approved by James (design gate passed,
PM verdict GO-WITH-CHANGES incorporated) · **Phase:** infrastructure riding
alongside Phase CR2, split as Stage A / Stage B at spec 2's hardware walk.

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
- An open, session-killing defect from the 2026-08-15 walk is **unknowable**
  from the record: a payload parsed as finished/60/0 killed a session 16 s
  into a rest, and the ring had no bytes to decode after the fact
  (`driver.ts:3029-3037`, walk README:112-114).
- The boundary-poison mechanism (PR #99's falsifier) is stuck at SECONDARY
  solely because of "the one unrecorded half": 0x0033's count at the
  poisoning tick.
- Measured: **>99% of inbound traffic is discarded** — only 0x0037/0x0038
  and CSAFE acks survive verbatim (`driver.ts:1661-1666`).
- The committed captures (`docs/monitor/sessions/*.log.gz`) are decoded
  driver output and structurally cannot drive the real driver
  (`captureReplay.test.ts:10-45`: no wire bytes; the wire-capable fake
  zero-fills 0x0033; a replay never calls `program()`).

## Research pass (required by CLAUDE.md; claims tagged)

### Does the underlying system have the concept?

**No.** Chromium's CDP `BluetoothEmulation` domain can fake adapters,
advertisements and read/write responses, but has **no command that injects a
characteristic notification with data** (PRIMARY: CDP BluetoothEmulation
docs). A PM5 stream is notification-driven, so browser-level fake BLE cannot
replay a row; it also can never cover the Capacitor/CoreBluetooth path
(INFERENCE, architectural). Playwright has no Bluetooth API (SECONDARY). The
WebDriver-BiDi Web Bluetooth proposals cover connection and service
discovery, not notification data (SECONDARY: puppeteer#14455, W3C thread
2025-03). Conclusion: replay happens at **our own transport seam** — a seam
we own, so we assert nothing on the platform's behalf. The recording's clock
is our own instrument reading (relative monotonic ms), not a PM5 concept;
the PM5's authoritative time rides in the payloads themselves.

### Prior art

- **ErgometerJS** (Concept2-specific; SECONDARY): ships a
  `RecordingDriver`/`ReplayDriver` pair at the driver seam. Recording is one
  totally-ordered JSON array of `{timeStamp (relative ms), eventType,
  service/characteristic UUID, hex data}`. Its documented lesson, adopted
  here: **record the full connect/handshake in the same file** — a
  notification tail without the handshake never reaches connected state.
- **OpenRowingMonitor** (SECONDARY): keeps a library of raw recordings with
  expected end results beside them, replayed against every new version as
  regression tests. Two clock modes: realtime (sleep recorded dt) and
  as-fast-as-possible — deterministic because the engine consumes recorded
  time, never wall clock. Adopted: recordings-with-expected-results, and the
  two-mode clock.
- **react-native-ble-plx-mock-recorder** (SECONDARY): records real device
  traffic at the BLE-library seam into JSON recordings; lesson: recorded
  mocks stay in sync where hand-written mocks rot.
- **Polly.js/VCR cassette pattern** (SECONDARY): one timestamped log sorted
  for stable diffs; replay timing is a mode (instant/fixed/scaled).
- **Nothing found** (a result): PyRow/py3row, ergarcade, Float, Concept2's
  own SDK — no record/replay-for-regression facility. Zwift/GoldenCheetah
  internal replay practices — nothing substantive public. FIT confirmed
  unsuitable as a raw-frame carrier (PRIMARY for what FIT is; INFERENCE for
  the conclusion): it profiles derived fitness data, no raw vendor-frame
  message type. btsnoop/PCAP sits at the HCI layer, below both our
  transports (SECONDARY) — wrong layer.
- Every project found keeps **one totally-ordered event log**, never
  per-characteristic streams; multi-characteristic ordering is recorded,
  never reconstructed (SECONDARY). Adopted verbatim — arrival order is
  exactly where our last two defects lived (the 0x0031/0x0033 skew).

## Scope ruling (PM design gate, 2026-08-15)

PM verdict: **GO-WITH-CHANGES**, all four changes accepted by James:

1. **No phone code this phase.** The recorder is dev/web-gated behind the
   existing dead-code-elimination boundary. On-device recording is a future
   **Tier 2** decision requiring: the delivered notification rate measured
   (estimates disagree 5×: requested 100 ms sample rate vs a driver comment
   claiming ~2/s), a hard byte bound, a persist trigger that is not the
   terminal transition, and an export path that exists. None of these exist
   today; all are Stage A/walk outputs.
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
the walk produces the first raw capture. Stage B builds on that capture.
James is holding TestFlight release until further UI fixes land (the
solo-canary ruling for v0.9.1 is knowingly overridden).

## Design — Stage A (no hardware required)

### A1. The recording tap

`recordingTransport(inner: Transport): Transport` in
`app/src/monitor/transports/recording.ts`, a decorator in the exact shape of
`autoTicking` (`transports/index.ts:155-182`). Wired **only** inside the
existing dev gate (`import.meta.env.DEV || VITE_ENABLE_FAKE_MONITOR === "1"`,
`transports/index.ts:205-224`) so it is dead-code-eliminated from production
builds (`app/scripts/dist-grep.sh` proves the boundary; extend its probe to
the recorder's identifier). Zero product-code change outside the gate.

It records **every** transport event, unfiltered and undecoded:

- `connect`/`connected`, per-characteristic `subscribe`/`unsubscribe`,
  `disconnect` (caller-initiated), `onDisconnect` firings (link drops) —
  the full handshake, in-file.
- Every notification (`dir: "rx"`) and every write (`dir: "tx"`) with
  characteristic UUID and payload hex.

Record shape (JSON-lines, one event per line, append-only, stable diffs):

```
{"seq":0,"t":0,"kind":"connect","id":"...","name":"PM5 432331249"}
{"seq":1,"t":12,"kind":"subscribe","char":"...-0031-..."}
{"seq":2,"t":118,"dir":"tx","char":"...-0021-...","hex":"f1 76 04 13 02 01 02 60 f2"}
{"seq":3,"t":140,"dir":"rx","char":"...-0022-...","hex":"f1 81 76 01 13 e5 f2"}
```

`t` is monotonic ms since tap creation (`performance.now()` delta — an
instrument reading we own; no wall clock, consistent with the event log's
existing rule). A header line carries metadata: format version, date (from
the caller, not `Date.now()` inside domain code), app git describe,
transport kind (web/capacitor/fake), user agent.

**No flood guards, no sampling, no decoding.** The ring's curation policy
has already manufactured a false planning conclusion (pm-ledger 2026-08-15:
"the absence was ours"); the tap's contract is that absence in a recording
means absence on the wire.

Storage: in-memory array for the session; on dev/web a "Download recording"
control in the existing diagnostics sheet (dev-gated) saves gzipped
JSON-lines via a blob URL. Committed recordings live in
`docs/monitor/sessions/` beside a short README row (provenance, program
rowed, PM5-screen photo transcription where taken — the ORM
expected-results posture).

### A2. The replay transport

`replayTransport(recording, clock)` implements `Transport`:

- **Notifications** fire to subscribers in recorded order at recorded `t`
  offsets (scaled or instant per clock mode). Order across characteristics
  is the recorded arrival order, never reconstructed.
- **Writes** from the driver are matched against the recording's `tx`
  sequence in order. On byte-for-byte match, any recorded responses simply
  arrive when their `t` comes due. On mismatch, the transport **logs a
  divergence and keeps serving the recorded stream in order** — a replay
  divergence is evidence the driver changed, not an error; but it prints,
  so a drifted replay is never mistaken for a clean one. CI rungs assert
  zero divergences for committed recordings (see Exit criteria), which is
  the sharp version of "shelf life": when `program()` evolves wholesale,
  the rung fails loudly and the recording is re-cut or the rung re-based —
  a recording's write/ack sequence is a snapshot of the driver that made
  it, and the divergence count is where that fact surfaces.
- **Clock modes:** `instant` — virtual time, caller pumps (the fake's
  `tick(ms)` pattern; deterministic, for CI); `realtime`/`scaled` — real
  timers via the `autoTicking` pattern (for eyeballing later; the viewer
  itself is deferred).
- Because the recording contains the real programming writes and their real
  acks, a replayed session exercises `program()` and arms a real program —
  closing the gap that kept the old captures away from the register map.

### A3. Stage A verification (no erg)

The replay transport and tap are proven against **synthesized byte logs**
built with the repo's existing wire builders
(`buildGeneralStatusBytes`/`buildAdditionalStatus2Bytes`/`buildAckFrame`,
the `sessionTotals.test.ts` machinery): tap wraps a scripted fake, the
recording it emits is replayed, and the driver's outputs must be identical
run-to-run (record→replay round trip). Self-mutation per TESTING.md §3.

## Design — Stage B (after spec 2's walk)

A Vitest CI rung: load the committed real recording, drive the **real
`createPm5Driver`** through `replayTransport` in instant mode, assert our
derived totals against the machine's own wire numbers:

- **Oracle independence (binding):** the machine-side numbers (TWD bytes
  11-13 of 0x0031, per-interval finals via reset detection) are decoded by
  a minimal reader private to the test — not by the driver under test, and
  never via `intervalIndex` or any field the implementation keys on
  (the tautology rule, `captureReplay.test.ts:59-77`).
- The rung's assertions are the walk's own photographed numbers (see Exit
  criteria 1).

## Exit criteria (each can fail)

1. **The keystone replays.** A recorded 2×250 m r0 row (spec 2's walk,
   re-cut of the 2026-08-15 keystone) replayed through the real driver in
   CI reproduces the accumulator against machine TWD to the re-walk's
   tolerance (499.5 vs 500) — with no hardware.
2. **Recording does not change the session.** On the walk, the tap-ON row's
   app numbers agree with the PM5 screen to the tolerance the re-walk
   achieved (one extra photograph; the walk's photograph + `final-totals`
   protocol is unchanged and remains the authority).
3. **The rung can go red.** A deliberate mutation of the register map's
   write rule turns the Stage B rung red; restore, green. Recorded in the
   PR as the self-mutation note.
4. **It answers a question the current record cannot:** the recording
   carries 0x0033's count at the work→rest boundary tick — the "one
   unrecorded half" that keeps the boundary-poison mechanism at SECONDARY.
   Stage B includes reading it out and upgrading (or refuting) that
   mechanism's status in the walk README.
5. **Round trip determinism (Stage A, pre-walk):** record→replay of a
   synthesized session yields byte-identical driver event output, and the
   dist-grep probe proves the recorder is absent from the production
   bundle.

## Honest limits (recorded, not caveats)

- Replay reproduces what happened. It **cannot generate the counterfactual
  side of an inter-characteristic skew**; PR #99's synthesized-fixture rung
  (`sessionTotals.test.ts`) remains the sibling technique for
  both-sides-of-the-skew questions.
- It cannot test touch/input or anything above the DOM (the swipe lesson:
  check the harness's input capability).
- A recording is an instrument: its tap sits between `Transport` and the
  driver, so it cannot observe radio-level loss, and its own correctness is
  established at the walk (exit criterion 2), not assumed.
- The delivered PM5 notification rate is unmeasured; Stage A's walk ride
  measures it (a Tier 2 prerequisite, and a storage-estimate correction).

## Docs riding this PR

- File the harness in ROADMAP (it currently has no home): Stage A/B as CR2
  infrastructure, UI rung filed as a spec 3 follow-on, Tier 2 as a
  trigger-gated follow-on ("a defect fires on-device that the dev/web
  recorder cannot see, or Tier 2 prerequisites are all measured").
- Amend CR2's exit line to name R0/F6/F7 (added 2026-08-15 without amending
  the exit; PM ruling).
- Correct CLAUDE.md recurring failure #11's replay sentence: the captures
  contain zero `boundary` events and the boundary-actual-sum oracle is
  unsound; the sound oracle is each interval's own final pre-reset reading
  (architecture review §F2, correction owed since 2026-08-13).
- Land the PM's proposed ledger entry (design-gate rulings, 2026-08-15) in
  `.claude/agents/pm-ledger.md`.
