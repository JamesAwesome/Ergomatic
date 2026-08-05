# Phase 7A — the monitor domain: IR, driver seam, PM5 protocol, transports

**Date:** 2026-08-05
**Status:** Pending James's review. UI-free by construction — every
screen waits for the design handoff's return (7B). Parameters fixed by
the 2026-08-05 brainstorm (see the phase memory + pm5-handoff packet).

## What 7A builds

The entire connected-mode machinery below the screens: the workout →
program compiler, the monitor seam, the PM5 driver's byte-level
protocol, three transports (fake / WebBluetooth / Capacitor BLE), the
observability log, and the connected-run record's shape. 7B mounts
screens on it; 7C wires logging. Nothing in 7A imports React.

## The layering (James's seam ruling)

```
domain/monitor/program.ts     WorkoutProgram IR + compiler   (pure)
domain/monitor/types.ts       MonitorFrame, Capabilities,
                              MonitorEvent, driver interfaces (pure types)
domain/monitor/csafe.ts       CSAFE framing: build/parse,
                              checksum, byte stuffing          (pure)
domain/monitor/pm5/*.ts       PM5 specifics: service/char
                              UUIDs, command builders,
                              characteristic parsers →
                              normalized frames                (pure)
src/monitor/driver.ts         MonitorDriver runtime: wires a
                              transport + the pm5 codec into
                              the interface; owns the session
                              state machine
src/monitor/transport.ts      Transport interface
src/monitor/transports/
  fake.ts                     the scripted simulator (CI)
  webBluetooth.ts             Chrome desktop (James's laptop
                              against the real PM5)
  capacitorBle.ts             iOS native
src/monitor/eventLog.ts       the observability ring buffer
src/monitor/monitorRun.ts     the connected-run record (v1)
```

Rules: `domain/monitor/**` never imports from `src/`; `pm5/` is the ONLY
place Concept2 bytes exist; everything above the driver consumes
normalized types only; the fake implements **Transport** (and the driver
runs unmodified over it) — CI exercises the exact seam a second monitor
would enter through.

## 1. The IR and compiler

```ts
export interface ProgramInterval {
  kind: "time" | "distance";
  value: number;                 // seconds | meters
  targetSplit: number | null;    // frozen at confirm (nudges folded); null = effort/no target (5G)
  spm: number | null;
  restSeconds: number;           // 0 = none
}
export interface WorkoutProgram { intervals: ProgramInterval[]; }
export function compileProgram(draft: SessionDraft): WorkoutProgram | CompileError;
```

- Consumes the SAME expansion the phone timer uses (`expand.ts`'s
  phases via the draft, nudges applied) — one source of truth for what
  a workout means; the compiler folds each work/wu phase into an
  interval and attaches the FOLLOWING rest phase as its `restSeconds`
  (the PM model: rest belongs to the interval before it).
- Warm-up compiles as interval 1 (no target). Effort steps: `targetSplit
  : null`. Test pieces: a single fixed interval.
- `CompileError` (typed, human-readable) for shapes the PM5 cannot hold:
  more intervals than the PM's variable-interval limit, a rest exceeding
  the PM's max, zero work intervals. Limits live as named constants
  marked with their interface-definition citation (see §UNVERIFIED).

## 2. The seam types

```ts
export interface MonitorCapabilities {
  canProgram: boolean; hasHeartRate: boolean; hasStrokeRate: boolean;
  reportsIntervals: boolean; deviceName: string;
}
export interface MonitorFrame {      // normalized; every field optional-by-capability
  elapsedSeconds: number; distanceMeters: number;
  currentSplit: number | null;       // pace /500m, seconds
  spm: number | null; heartRateBpm: number | null;
  intervalIndex: number | null;      // 0-based into the programmed sequence
  intervalRemaining: { kind: "time" | "distance"; value: number } | null;
  state: "idle" | "countdown" | "rowing" | "resting" | "paused" | "finished";
}
export interface IntervalActual {    // emitted at each interval boundary
  index: number; elapsedSeconds: number; distanceMeters: number;
  avgSplit: number | null; avgSpm: number | null; avgHeartRateBpm: number | null;
}
export type MonitorEvent =
  | { kind: "frame"; frame: MonitorFrame }
  | { kind: "intervalComplete"; actual: IntervalActual }
  | { kind: "workoutComplete" } | { kind: "disconnected"; reason: string }
  | { kind: "reconnected" };
export interface MonitorDriver {
  readonly capabilities: MonitorCapabilities;
  program(p: WorkoutProgram): Promise<void>;   // rejects with a typed ProgramRejection
  start(): Promise<void>;                       // arm/begin per the monitor's model
  events: (cb: (e: MonitorEvent) => void) => () => void;
  disconnect(): Promise<void>;
}
```

## 3. The PM5 codec (all pure, all byte-vector-tested)

- `csafe.ts`: frame build/parse — start/stop flags, byte stuffing,
  checksum; parse is total (returns a typed error, never throws — a
  garbled frame becomes an eventLog entry, not a crash).
- `pm5/uuids.ts`: the C2 BLE service/characteristic UUID table.
- `pm5/commands.ts`: the programming sequence for a `WorkoutProgram`
  (variable-interval workout setup via the PM's CSAFE-PM commands) and
  session control.
- `pm5/parse.ts`: the status/additional-status/stroke/split
  characteristics → `MonitorFrame`/`IntervalActual`.

**§UNVERIFIED — the byte-level truth.** Every command id, offset, unit
scale, and limit in this section must be verified against Concept2's
published **"PM Bluetooth Smart Communication Interface Definition"**
before implementation freezes: the plan's Task 1 ACQUIRES that document
(concept2.co.uk developer resources; James likely has it), and every
constant in `pm5/` carries a comment citing its table. Training-data
recall of this spec is NOT trusted (the standing verify-versions rule
generalizes: verify byte layouts from the primary document, not
memory). The byte-vector test suite encodes examples FROM the document
so a transcription error fails loudly.

## 4. Transports

```ts
export interface Transport {
  scan(): Promise<DiscoveredMonitor[]>;         // {id, name}
  connect(id: string): Promise<void>;
  write(charId: string, bytes: Uint8Array): Promise<void>;
  subscribe(charId: string, cb: (bytes: Uint8Array) => void): () => void;
  disconnect(): Promise<void>;
  onDisconnect(cb: (reason: string) => void): () => void;
}
```

- **fake.ts** — the scripted PM5 simulator: accepts a programming
  sequence (verifying the exact bytes against the codec — the fake IS a
  protocol assertion), then plays a configurable session timeline
  (frames per interval, pauses, a disconnect-mid-interval injection
  hook). Deterministic: driven by explicit ticks, no wall clock —
  6B's engine-testing lesson.
- **webBluetooth.ts** — Chrome desktop (`navigator.bluetooth`), for
  James testing against the real PM5 from the laptop. Dev-only:
  capability-detected, never shipped as the iOS path.
- **capacitorBle.ts** — `@capacitor-community/bluetooth-le` (version
  verified against the registry at plan time, per the standing rule).
  7A builds and unit-tests the adapter shape; live radio validation is
  7B/device territory.

## 5. Observability (James: first-class, bug-prone area)

```ts
export interface MonitorLogEntry { at: string; kind: string; detail: string; }
```

- A ring buffer (last 500 entries) fed by: every transport lifecycle
  call, every state transition in the driver, every programming
  command/ack pair (hex-dumped), every parse error, every disconnect
  reason. Zero entries dropped silently — overflow evicts oldest.
- `exportLog(): string` — JSON, one call, for the 7B diagnostics view
  and for James pasting a trace into a bug report.
- The eventLog is injectable into driver + transports (constructor
  arg), so tests assert ON the log ("programming emitted exactly these
  command/ack pairs") — observability doubles as test surface.

## 6. The connected-run record (shape only; 7B consumes)

`ergomatic.monitorRun` v1: `{v: 1, workoutId, title, program:
WorkoutProgram, actuals: IntervalActual[], deviceName, startedAt,
completedAt | null}` — localStorage, same lifecycle idioms as
`session/run.ts` (strict validation, best-effort IO). The phone-timer
`sessionRun` record is untouched; the two never coexist for one session
(Connect and Start are different doors).

## Testing (the phase's spine)

- Byte-vector suites for csafe + pm5 codec (examples cited to the
  interface definition's own tables).
- Compiler tables: real starters (Microburst's efforts, a distance TR
  test, rest folding, warm-up-as-interval, every CompileError branch).
- The driver over the fake transport: the full session lifecycle —
  program (bytes asserted) → start → frames → interval boundaries →
  workoutComplete; pause/resume; disconnect mid-interval →
  reconnected; a garbled frame → logged, stream continues.
- The eventLog: ring semantics, export, the programming-trace
  assertion pattern.
- monitorRun validation table.
- 100% per-file on domain/monitor/**; integration-style driver tests
  in the client project; NO e2e (no UI exists yet).

## Out of scope

Every screen (7B, waits for design); Connect's placement; log-screen
prefill (7C); server (none needed — /api/logs already accepts pm5);
FTMS or any second monitor; the landscape-scroll bugfix (7B, with the
surface).

## Exit criteria

- `compileProgram` handles all 300 seeded workouts without error or
  with a typed CompileError a screen could show (count and list the
  errors in the report — if any real starter can't compile, that's a
  finding for James, not a silent skip).
- The driver runs a complete simulated session over the fake transport
  in CI, programming bytes asserted exactly.
- The event log reconstructs a full session trace from export alone.
- Full gates; zero UI files touched.
