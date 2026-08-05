# Phase 7A — the monitor domain: IR, driver seam, PM5 protocol, transports

**Date:** 2026-08-05
**Status:** Revised after the adversarial pass (findings C1–C4, H1–H10,
M1, L1 — grounded in the fetched primary documents: BLE Interface
Definition rev 1.30 + CSAFE Communication Definition rev 0.27, obtained
via the concept2.nl mirror; the .co.in mirror fails TLS). James
pre-authorized proceeding to the plan on this revision. UI-free by
construction; screens wait for the design handoff (7B).

## What 7A builds

Everything below the screens: the workout → program compiler, the
monitor seam, the PM5 codec **plus the frame packer/sequencer the first
draft missed**, three transports, the observability log, the
connected-run record, and the session-coexistence helpers. Nothing
imports React.

## The layering

```
domain/monitor/program.ts     WorkoutProgram IR + compileProgram(EnginePhase[])
domain/monitor/types.ts       MonitorFrame, Capabilities, MonitorEvent,
                              MonitorDriver, Transport (pure types)
domain/monitor/csafe.ts       CSAFE frame build/parse: flags, byte
                              stuffing, XOR checksum (pure, total parse)
domain/monitor/pm5/framer.ts  payload → ≤120-byte CSAFE frames →
                              20-byte BLE chunks; reassembly (pure)
domain/monitor/pm5/uuids.ts   C2 service/characteristic table
domain/monitor/pm5/commands.ts  programming + terminate sequences (multi-frame)
domain/monitor/pm5/parse.ts   characteristics → normalized frames
src/monitor/driver.ts         the runtime: transport + codec → the seam;
                              ack-gated write sequencing; the state machine
src/monitor/transports/{fake,webBluetooth,capacitorBle}.ts
src/monitor/eventLog.ts       observability ring buffer (injectable)
src/monitor/monitorRun.ts     the record + the coexistence helpers
```

Rules unchanged: domain/ never imports src/; pm5/ is the only home of
Concept2 bytes; the fake implements **Transport**; everything above the
driver consumes normalized types only.

## 1. The IR and compiler (revised per C2/C3, H5, H6, H7)

```ts
export interface ProgramInterval {
  kind: "time" | "distance";
  value: number;                 // seconds | meters
  targetSplit: number | null;    // frozen at confirm; null = effort (5G)
  displaySpm: number | null;     // DISPLAY-ONLY: no wire consumer exists
                                 // (no per-interval rate command in rev 0.27);
                                 // the phone's panes carry the rate story —
                                 // rate-alternation workouts (Terral, Steam
                                 // Fog) look identical to the ERG but not to
                                 // the rower's screen. Named displaySpm so
                                 // nobody wires it to a wire that isn't there.
  restSeconds: number;           // 0 = none
}
export interface WorkoutProgram { intervals: ProgramInterval[]; }
export function compileProgram(phases: EnginePhase[]): WorkoutProgram | CompileError;
```

- **Input is `EnginePhase[]`** — the exact array the phone timer runs
  (`effectiveSteps` → `phases(baselines)`, removals dropped, nudges
  folded, SPM overrides applied). The compiler cannot resurrect deleted
  steps or miss a nudge because it never sees the raw draft (C2/C3).
  Callers assemble phases precisely as `startSession` does.
- Rest folding (H7, sound now): a rest phase attaches to the nearest
  PRECEDING work/wu interval; **consecutive rests merge (summed)**;
  **a rest before any work interval is `CompileError("leading rest")`**
  (the PM has no standalone-rest slot). The seeded 300 contain zero
  leading/double rests — synthetic fixtures pin this class because the
  sweep can't.
- CompileError branches (H6, from the documents' real limits): interval
  shorter than **:20 / 100 m**; rest longer than **9:55**; more than
  **50 intervals**; zero work intervals; leading rest; and a
  wire-precision branch (values the PM's units can't represent after
  rounding — rounding rules stated per unit, never silent clamping).
  `validate.ts` permits shapes far outside these (1-second steps,
  60-minute rests) — the compiler is the gate, and its errors are
  copy-ready strings a screen can show.

## 2. The seam types (revised per C4/H1/H2/H3)

```ts
export interface MonitorCapabilities {
  canProgram: boolean; hasStrokeRate: boolean;
  reportsIntervals: boolean; deviceName: string;
  // NOTE: heart rate is NOT here — belt presence is only knowable from
  // the data stream (frames carry hr: number | null per frame). A
  // static hasHeartRate would lie; the grid's `—` renders from the
  // frame, not from capabilities.
}
export interface MonitorFrame {
  elapsedSeconds: number; distanceMeters: number;
  currentSplit: number | null; spm: number | null;
  heartRateBpm: number | null;          // null = no belt data THIS frame
  intervalIndex: number | null;
  intervalRemaining: { kind: "time" | "distance"; value: number } | null;
  // ^ COMPUTED by the driver (program value minus quantized progress) —
  //   rev 1.30 has no "remaining" field on any characteristic (H3).
  //   Display cadence: the sample-rate characteristic (0x0034) is
  //   written to its fastest documented rate at connect; the default
  //   500 ms is too coarse for a countdown.
  state: "idle" | "armed" | "rowing" | "resting" | "finished" | "terminated";
  // ^ maps the PM's WORKOUTSTATE honestly: "armed" = WAITTOBEGIN (the
  //   PM starts on the first stroke — there is NO start command;
  //   SET_STARTTYPE is <Not implemented> in rev 0.27). There is NO
  //   paused state on the wire — mid-workout the clock runs whether or
  //   not the rower pulls (C4/H1). "finished" = WORKOUTEND;
  //   "terminated" = TERMINATE — distinct, because 7C must tell
  //   "logged 12 of 12" from "abandoned at 8" (H2).
}
export interface IntervalActual {
  index: number; elapsedSeconds: number; distanceMeters: number;
  avgSplit: number | null; avgSpm: number | null; avgHeartRateBpm: number | null;
}
export type MonitorEvent =
  | { kind: "frame"; frame: MonitorFrame }
  | { kind: "armed" }                              // programming done, PM waits for stroke one
  | { kind: "intervalComplete"; actual: IntervalActual }
  | { kind: "workoutComplete" }
  | { kind: "terminated" }
  | { kind: "disconnected"; reason: string }
  | { kind: "reconnected" };
export interface MonitorDriver {
  readonly capabilities: MonitorCapabilities;
  program(p: WorkoutProgram): Promise<void>;   // multi-frame, ack-gated (§3); typed ProgramRejection
  terminate(): Promise<void>;                   // the documented terminate command — no start() exists
  events: (cb: (e: MonitorEvent) => void) => () => void;
  disconnect(): Promise<void>;
}
```

## 3. The PM5 codec — and the framer the wire demands (C1)

The physical constraints (documented, rev 1.30 + 0.27): CSAFE frames
cap at **120 bytes** including flags/stuffing/checksum; the control
characteristic accepts **20-byte writes**; a variable-interval block is
**26 bytes/interval** (the document's own 4-interval example is 116
bytes — a 5th would overflow); responses arrive on a paired
characteristic and each frame is **ack-gated**. Sea Smoke (25
intervals) is ≈6 frames ≈ 40 sequential writes. Therefore:

- `pm5/framer.ts` (pure): payload → stuffing-aware frame packing (the
  120-byte budget is POST-stuffing — the packer accounts for expansion)
  → 20-byte chunk sequences; and the inverse reassembly for responses.
  Property-tested: roundtrip identity, never-exceeds-budget under
  adversarial payloads (max-stuffing bytes), interval-block alignment
  (an interval never splits across a command boundary where the doc
  forbids it — cite the table).
- `pm5/commands.ts`: the programming sequence as an ordered list of
  frames (wipe/setup per the doc's example flow → per-interval blocks →
  PREPARETOROWWORKOUT), ending ARMED — start is stroke one.
- The driver owns ack-gated sequencing: write chunk → await ack frame →
  next; a NAK or timeout mid-sequence = typed `ProgramRejection` with
  the eventLog holding the full hex trace.
- `csafe.ts`: flags, stuffing, XOR checksum, total parse.

**§Errata (M1) — the checksum discipline, corrected:** three of the
document's own example frames fail the document's own XOR rule
(including the 116-byte variable-interval example: printed 0xC6,
computed 0x09). The byte-vector suite therefore encodes: the six
verified-good examples as conformance tests, and the three bad ones as
EXPLICIT errata cases asserting OUR checksum against the RULE, each
commented with the discrepancy. Final authority for the disputed three:
the laptop-vs-real-PM5 session (the WebBluetooth transport exists for
exactly this) before the codec freezes. A naive "encode the document's
examples" would have shipped three tests a correct implementation
fails.

## 4. Transports

Interface as drafted (scan/connect/write/subscribe/disconnect/
onDisconnect). Implementations:
- **fake.ts** — the simulator: verifies the programming byte sequence
  chunk-by-chunk (ack-gating included — it is a protocol assertion,
  not a stub), then plays tick-driven session timelines; injection
  hooks for NAK, mid-sequence timeout, disconnect mid-interval,
  garbled frames. No wall clock.
- **webBluetooth.ts** — Chrome desktop; James's laptop against the
  real PM5; resolves the §Errata question; dev-only.
- **capacitorBle.ts** — `@capacitor-community/bluetooth-le` (version
  from the registry at plan time). 7A ships the adapter; radio truth
  is device territory. **iOS backgrounding note (recorded now, wired
  in 7B):** the mount case means the phone may lock mid-session; the
  driver's state machine treats a transport gap as `disconnected` →
  `reconnected` with state re-read from the PM (the PM is
  authoritative and keeps rowing) — no suspension-specific states
  needed in the seam, but the reconnect path re-derives
  `intervalIndex`/progress from the machine rather than assuming
  continuity. The fake's disconnect injection covers exactly this
  shape.

## 5. Observability (unchanged in role; enlarged in duty)

As drafted (injectable ring buffer, 500 entries, exportLog JSON), plus:
every chunk write and every ack/NAK with hex, every state-machine
transition with cause, every computed-vs-wire divergence the driver
notices (e.g., an interval boundary arriving early). Tests assert on
the log; the 7B diagnostics view renders it; James's bug reports paste
it.

## 6. The record and the coexistence rules (H10 — now structural)

`ergomatic.monitorRun` v1 as drafted, PLUS `src/monitor/monitorRun.ts`
exports the enforcement surface 7B wires:
- `anyLiveSession(): "none" | "phone" | "monitor"` — reads BOTH
  `sessionRun` and `monitorRun`, answering "is anything actually LIVE
  right now" for a resume/guard caller. **Amended (final-review M-1):**
  this does NOT mean every existing guard migrates onto it mechanically.
  `anyLiveSession()` collapses a completed-but-unlogged record on either
  side to the same answer as absent — by design, since "live" and
  "finished but not yet logged" are different questions. Two existing
  guards need the UNLOGGED distinction specifically and must therefore
  keep reading `loadRun()`/`loadMonitorRun()` DIRECTLY, never through
  `anyLiveSession()`: WorkoutDetail's unlogged-run staged confirm (the 6B
  F5 fix — it stages a "Replace" warning precisely BECAUSE the prior
  session is unlogged, not because one is live) and Today's cold-start
  stale-draft-discard guard (`Today.tsx`'s own Task 5 comment is the
  reference pattern: it reads `loadMonitorRun()` directly rather than
  `anyLiveSession()` because the function's own truth table treats a
  completed-but-unlogged monitor run as absent, which is wrong for a
  guard asking "is the erg possibly still running" rather than "should a
  resume card show"). `startSession`'s clear and any other guard that
  only ever needs "is something live, and if so which side" (not
  "unlogged specifically") DOES migrate onto `anyLiveSession()`
  mechanically, as originally described. 7A's tests pin the helper's
  truth table either way; 7B's wiring is mechanical ONLY for the guards
  in the second category — see ROADMAP.md's Phase 7B section for the
  explicit warning this amendment adds, so the F5 data-loss class (a
  guard silently downgraded from "unlogged" to "none" by routing it
  through `anyLiveSession()`) cannot be reintroduced by a future
  implementer reading this section alone.
- Today's 24h stale-draft discard gains the same exception for a live
  monitorRun that it has for a completed sessionRun (a draft whose
  monitor session is mid-flight must survive — it carries the labels
  7C's log prefill composes from, the 6C lesson).
- The two records still never coexist for one session: `monitorRun`'s
  create clears `sessionRun` remnants and vice versa — pinned.

## 7. The Log handoff shape (7C's consumption, declared now)

`IntervalActual[]` + the surviving draft's refs are sufficient for the
6C builders' label composition (verified against `logDraft.ts`'s
composition path: labels come from the draft refs via `refPaceLabel`,
actuals from the run — the monitorRun plays the run's role with
`actualSource: "pm5"`). 7C is wiring, not design.

## Testing

- csafe + framer: byte-vector conformance (the six good), the errata
  three, property tests (roundtrip, budget-never-exceeded under
  max-stuffing, block alignment), chunk/reassembly.
- Compiler: the 300-workout sweep (every workout compiles or names its
  typed error — the count and list go in the report, any real
  starter's failure is a James-level finding) + synthetic fixtures for
  the classes the seed lacks (leading rest, double rest, sub-:20 work,
  9:56 rest, 51 intervals).
- Driver over fake: program (bytes + ack-gating asserted) → armed →
  stroke-one → frames → interval boundaries → workoutComplete;
  terminate mid-workout → terminated; NAK mid-programming →
  ProgramRejection + trace; disconnect mid-interval → reconnected with
  re-derived position; garbled frame → logged, stream lives.
- eventLog ring/export/trace-assertion pattern; monitorRun +
  anyLiveSession truth tables.
- **Coverage boundary (L1, honest):** `domain/monitor/**` joins the
  existing 100% floor. `src/monitor/transports/{webBluetooth,
  capacitorBle}.ts` join the coverage EXCLUDE list beside
  `src/native/**` — their radio halves cannot run in CI and pretending
  otherwise invites padding tests. The fake, driver, eventLog,
  monitorRun are fully covered.
- No e2e (no UI exists).

## Out of scope

Every screen (7B); Connect placement; guard rewiring (7B, on 7A's
pinned helpers); log prefill (7C); server; FTMS; the landscape bug
(7B).

## Exit criteria

- All 300 seeded workouts compile or produce a typed, screen-ready
  error (list in the report; real-starter failures escalate to James).
- The driver runs a full simulated session in CI with the programming
  byte sequence asserted chunk-by-chunk, ack-gated, against the
  documents' verified examples.
- The errata table (6 good / 3 bad) is encoded with citations, and the
  disputed checksums are flagged for the laptop session.
- exportLog alone reconstructs a session trace including a programming
  NAK and a reconnect.
- Full gates; zero UI files; the coverage boundary explicit in config.
