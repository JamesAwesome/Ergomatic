# Phase 7A — Monitor Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything below the connected-mode screens — the program
compiler, the monitor seam, the PM5 protocol with its frame
packer/sequencer, three transports, observability, and the run record —
proven end-to-end in CI over a fake transport.

**Architecture:** Pure domain (IR compiler, CSAFE codec, framer, PM5
command/parse) under `app/domain/monitor/`; the runtime driver, fake +
radio transports, event log, and record under `app/src/monitor/`. The
fake implements Transport and ack-gates the exact programming bytes, so
the seam a second monitor would enter through is exercised every CI
run. No file in this phase imports React.

**Tech Stack:** TypeScript throughout; `@capacitor-community/
bluetooth-le` **8.2.0** (registry-verified 2026-08-05) for the iOS
adapter; `navigator.bluetooth` for the dev adapter; vitest.

**Spec:** `docs/superpowers/specs/2026-08-05-phase-7a-monitor-domain-design.md`
(the adversarially-revised version — its §Errata and limits tables are
requirements). **Every implementer reads `.claude/agent-briefing.md`
first.**

## Global Constraints (beyond the briefing)

- Worktree `.claude/worktrees/pm5-domain`, branch
  `phase-7a-monitor-domain`. `pnpm install` at the worktree root once.
  **COMMIT FIRST, MUTATE AFTER.**
- `domain/monitor/**` never imports from `src/`; `pm5/` is the only home
  of Concept2 bytes; consumers above the driver see normalized types
  only.
- **The primary documents rule:** every command id, offset, unit scale,
  and limit in `pm5/` carries a comment citing its document table (BLE
  Interface Definition rev 1.30 / CSAFE Communication Definition rev
  0.27 — reachable via the concept2.nl mirror; the .co.in mirror fails
  TLS). No byte-level fact from memory. The errata discipline (§3 of
  the spec): 6 conformance vectors + 3 explicit errata cases, never a
  test that fails a correct implementation.
- Documented physical limits, verbatim: CSAFE frame ≤ **120 bytes**
  post-stuffing; BLE writes **20 bytes**; interval block **26 bytes**;
  min interval **:20 / 100 m**; max rest **9:55**; max **50 intervals**.
- No wall clock anywhere in tests (tick-driven fakes — the 6B rule);
  `NODE_OPTIONS=--no-experimental-webstorage` for ad hoc vitest.
- Coverage: `domain/monitor/**` at the 100% floor; the two radio
  adapters join the coverage exclude beside `src/native/**` — the
  honest boundary, stated in config, never padded.
- Zero UI files, zero server files, zero e2e.

---

### Task 1: CSAFE framing + the framer (the wire's physics)

**Files:** Create `app/domain/monitor/csafe.ts`,
`app/domain/monitor/pm5/framer.ts`, tests beside each; Create
`docs/monitor/pm5-interface-notes.md` (the cited-facts file: every
constant/example used, with its document table citation — facts and
citations, not the documents themselves).

**Interfaces produced:**
```ts
// csafe.ts
export function buildFrame(payload: Uint8Array): Uint8Array;      // flags + stuffing + XOR checksum
export function parseFrame(bytes: Uint8Array): { payload: Uint8Array } | { error: CsafeParseError };
// framer.ts
export function packPayload(payload: Uint8Array): Uint8Array[];   // → CSAFE frames ≤120B post-stuffing
export function chunkFrames(frames: Uint8Array[]): Uint8Array[];  // → 20-byte BLE writes
export function reassemble(): { push(chunk: Uint8Array): Uint8Array | null }; // response frames
```

Steps: acquire the two documents (WebFetch the concept2.nl mirror; if
unreachable, STOP and report NEEDS_CONTEXT naming the URL tried —
James has copies); write the notes file's checksum/stuffing/flag
tables first; failing byte-vector tests from the documents' six
verified-good examples; implement; the three errata cases as explicit
tests asserting OUR checksum against the RULE with the discrepancy
cited (the 116-byte variable-interval example prints 0xC6, the rule
computes 0x09); property tests — roundtrip identity, ≤120B under
max-stuffing adversarial payloads, chunk/reassemble identity. Commit:
`feat: the wire's grammar — csafe frames and the packer the budget demands`.

---

### Task 2: The IR and compileProgram

**Files:** Create `app/domain/monitor/program.ts` (+test).

**Interfaces consumed:** `EnginePhase` from `app/src/session/engine.ts`
— WAIT: domain cannot import src. `EnginePhase` is built by
`src/session/draft.ts`/`engine.ts` from domain pieces; check where the
type actually lives. If it lives in src/, define the compiler's input
as the STRUCTURAL subset it needs (`CompiledPhase`: kind, seconds |
meters, targetSplit | null, spm | null, originalIndex) in
`domain/monitor/program.ts`, assignment-compatible with EnginePhase —
document the compatibility contract and add a type-level test in the
client project asserting `EnginePhase` satisfies it. (This is the
plan's resolution of the import-direction constraint; the reviewer
checks it.)

**Interfaces produced:**
```ts
export interface ProgramInterval { kind: "time" | "distance"; value: number;
  targetSplit: number | null; displaySpm: number | null; restSeconds: number; }
export interface WorkoutProgram { intervals: ProgramInterval[]; }
export type CompileError = { code: "leading-rest" | "interval-too-short"
  | "rest-too-long" | "too-many-intervals" | "no-work" | "unrepresentable-value";
  message: string; phaseIndex: number | null; };
export function compileProgram(phases: CompiledPhase[]): WorkoutProgram | CompileError;
```

Rules from the spec verbatim: rest folds to the nearest preceding
interval; consecutive rests sum; leading rest = error; the six error
branches with copy-ready messages; rounding rules per unit stated in
comments, never silent clamping. Tests: pinned tables for real
starters (Microburst, a TR test, rest folding, wu-as-interval);
synthetic fixtures for leading rest, double rest, :19 work, 9:56 rest,
51 intervals; **the 300-workout sweep** — every seeded workout through
`effectiveSteps→phases→compileProgram` (build phases exactly as
`startSession` does, with fixed baselines), asserting compiles-or-
typed-error and REPORTING the counts (a real starter's error is a
James-level finding, say so in the report). 100% per-file. Commit:
`feat: workouts compile — the erg's dialect, our semantics`.

---

### Task 3: The seam types and the PM5 codec

**Files:** Create `app/domain/monitor/types.ts`,
`app/domain/monitor/pm5/uuids.ts`, `app/domain/monitor/pm5/commands.ts`,
`app/domain/monitor/pm5/parse.ts` (+tests); extend
`docs/monitor/pm5-interface-notes.md`.

**Interfaces consumed:** Task 1's framer; Task 2's WorkoutProgram.
**Interfaces produced:** the spec §2 block VERBATIM — MonitorCapabilities
(no hasHeartRate — belt presence is per-frame), MonitorFrame (state
enum: idle | armed | rowing | resting | finished | terminated; NO
paused — the wire has none; intervalRemaining computed downstream,
null here), IntervalActual, MonitorEvent, MonitorDriver (program +
terminate + events + disconnect — NO start(); the PM arms and begins
on stroke one, SET_STARTTYPE is <Not implemented>), Transport,
DiscoveredMonitor.

`commands.ts`: `buildProgrammingSequence(p: WorkoutProgram):
Uint8Array[][]` — ordered frames (each pre-chunked via Task 1), the
document's example flow (reset/setup → per-interval 26-byte blocks →
PREPARETOROWWORKOUT), plus `buildTerminate()` and
`buildSampleRateConfig()` (0x0034 to its fastest documented rate).
`parse.ts`: the 0x0031/0x0032/0x0033/0x0037/0x0038 characteristic
layouts → a `RawPm5Status` intermediate → `toMonitorFrame` /
`toIntervalActual` with the WORKOUTSTATE→state mapping table
(WAITTOBEGIN→armed; WORKOUTEND→finished; TERMINATE→terminated) cited
row-by-row. Every offset cited. Tests: byte-vector per characteristic
(document examples where they exist, hand-built-and-cited otherwise),
the full state-mapping table, unit-scale round trips (the 0.01-pace /
distance scaling traps). 100%. Commit: `feat: the seam and the PM5's
side of it`.

---

### Task 4: The driver, the fake, and the event log

**Files:** Create `app/src/monitor/driver.ts`,
`app/src/monitor/transports/fake.ts`, `app/src/monitor/eventLog.ts`
(+tests, client project).

**Interfaces consumed:** Tasks 1–3 verbatim.
**Interfaces produced:**
```ts
export function createPm5Driver(t: Transport, log: MonitorEventLog): MonitorDriver;
export function createEventLog(capacity?: number): MonitorEventLog;   // 500 default
export interface MonitorEventLog { record(kind: string, detail: string): void;
  entries(): MonitorLogEntry[]; exportLog(): string; }
export function createFakeTransport(script: FakeScript): Transport & FakeControls;
export interface FakeControls { tick(ms: number): void; injectNak(atChunk: number): void;
  injectDisconnect(): void; injectGarbledFrame(): void; completeReconnect(): void; }
```

The driver: ack-gated write sequencing (chunk → await response frame →
next; NAK/timeout → typed `ProgramRejection` with the hex trace in the
log); the state machine (connect → program → armed → the frame stream
→ interval boundaries → finished/terminated; disconnected →
reconnected with position RE-DERIVED from the machine's next status
frame, never assumed); intervalRemaining computed from the program +
quantized progress; every transition logged with cause. The fake:
verifies each programming chunk byte-for-byte against Task 3's
sequence (it asserts, not accepts), acks per the protocol, then plays
a tick-driven timeline (per-interval frames, boundary actuals,
completion); the five injection hooks. Tests: the spec's full driver
suite (program/armed/frames/boundaries/complete; terminate;
NAK→rejection+trace; disconnect mid-interval→re-derived reconnect;
garbled frame→logged, stream lives); eventLog ring/export; the
trace-assertion pattern ("programming emitted exactly these
command/ack pairs") used at least twice so it's a demonstrated idiom.
100% on all three files. Commit: `feat: the driver holds the line —
ack by ack, tick by tick`.

---

### Task 5: The record, coexistence, radio adapters, close-out

**Files:** Create `app/src/monitor/monitorRun.ts`,
`app/src/monitor/transports/webBluetooth.ts`,
`app/src/monitor/transports/capacitorBle.ts` (+tests where covered);
Modify `app/vitest.config.ts` (coverage excludes),
`app/src/today/Today.tsx` (ONLY the stale-draft-discard exception —
the one 7A-owned behaviour change), `ROADMAP.md`.

**Interfaces produced:**
```ts
export const MONITOR_RUN_KEY = "ergomatic.monitorRun";
export interface MonitorRun { v: 1; workoutId: string | null; title: string;
  program: WorkoutProgram; actuals: IntervalActual[]; deviceName: string;
  startedAt: string; completedAt: string | null; terminated: boolean; }
export function loadMonitorRun(): MonitorRun | null;   // strict validation, the house table
export function saveMonitorRun(r: MonitorRun): void; export function clearMonitorRun(): void;
export function anyLiveSession(): "none" | "phone" | "monitor";  // truth table pinned
```

- `anyLiveSession` reads both records; its truth table (none/phone-live
  /phone-unlogged/monitor-live/monitor-complete-unlogged/both-stale
  combinations) pinned exhaustively — 7B's guard rewiring becomes
  mechanical against it.
- Today's 24h stale-draft discard gains the live-monitorRun exception
  (mirroring the completed-sessionRun exception in place — read its 6B
  comment first; extend, don't rewrite; client test pins it).
- Cross-clear rule pinned: creating either record clears the other.
- `webBluetooth.ts` / `capacitorBle.ts`: thin Transport adapters
  (`navigator.bluetooth` / `@capacitor-community/bluetooth-le@8.2.0` —
  add the dependency), shapes compile-tested; both files join the
  coverage exclude beside `src/native/**` with a comment stating the
  honest boundary. NO live-radio claims in any test name.
- ROADMAP: 7A recorded; 7B waits on the design handoff's return.

Full gates (unit+client+integration; e2e runs but nothing new — assert
the count is unchanged from main's baseline and say what it was).
Commit: `feat: the record, the guards' new truth, and the radios at the boundary`.

---

## Notes

- Strictly sequential; Task 2's CompiledPhase resolution is the plan's
  one structural judgment — the Task 2 reviewer verifies the
  compatibility contract has a type-level test, not just a comment.
- The 300-sweep's baselines: use DESIGN_BASELINES (the screenshot
  suite's fixed pair) so the sweep is deterministic.
- Task 5 touches Today.tsx for ONE guard exception — no other UI; the
  reviewer holds that line.
- The laptop-vs-real-PM5 session (resolving the three errata
  checksums) happens AFTER 7A merges, via the WebBluetooth adapter —
  it is a James-device event, not a CI gate; the errata tests document
  both candidate values until then.
