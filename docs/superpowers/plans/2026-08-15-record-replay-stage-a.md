# PM5 Record-Replay Harness, Stage A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every raw byte a live PM5 session moves through the app's
`Transport` seam, and replay a recording through the real `createPm5Driver`
deterministically — dev/web-gated, zero production-bundle footprint.

**Architecture:** A `Transport` decorator (`recordingTransport`) records one
totally-ordered JSON-lines event log at the characteristic level; a replay
`Transport` plays it back **barrier-gated on the driver's writes** (never on
the recorded clock — the driver is ack-gated and purges stale acks), with a
virtual clock the Stage B rung binds into the driver's injectable
`now`/`schedule`. Wiring lives inside the existing dead-code-eliminated
fake-monitor gate in `resolveDefaultTransport`.

**Tech Stack:** TypeScript (browser + Vitest jsdom), zero new dependencies
(spec's adopt-vs-build verdict: native `CompressionStream`, `node:zlib`,
stdlib hex/JSON-lines).

**Spec:** `docs/superpowers/specs/2026-08-15-pm5-record-replay-design.md` —
read it first; the antagonist amendments (B1-B4, M1-M5) are binding.

## Global Constraints

- pnpm only; ESM only. Imports of `domain/` files carry `.js` extensions
  (e.g. `../../../domain/monitor/types.js`); sibling imports in
  `src/monitor/transports/` are extensionless (`./webBluetooth`). Match the
  file you are in.
- TDD: failing test first, every task. Assertion quality per
  `docs/TESTING.md` (assert consequences, not existence).
- No em-dashes in user-facing strings (house style; button copy included).
- Any new interactive control: 44px hit target, WCAG AA.
- NO new `package.json` entries. NO `Date.now()` in the new modules except
  as an injectable default; the tap's default clock is `performance.now()`.
- The recorder must be dead-code-eliminated from production builds: all new
  runtime wiring goes inside the `fakeMonitorEnabled` block in
  `resolveDefaultTransport` (`src/monitor/transports/index.ts:208-222`).
- Commit after every task (the worktree's hooks are verified live). Run
  `git rev-parse --show-toplevel` before each commit; it must print
  `.../.claude/worktrees/record-replay`.
- All commands run in `app/`.

## File Structure

- `app/src/monitor/transports/recording.ts` — format tag, header/event
  types, hex helpers, serialize/parse, `createRecordingTransport` (the tap),
  `buildRecordingFile`. One responsibility: bytes ↔ recording.
- `app/src/monitor/transports/recording.test.ts` — format + tap tests.
- `app/src/monitor/transports/replay.ts` — `createReplayTransport`: barrier
  scheduler, virtual clock, divergence log, per-characteristic fan-out.
- `app/src/monitor/transports/replay.test.ts` — barrier/divergence/clock
  tests.
- `app/src/monitor/recordReplay.roundtrip.test.ts` — A3: fake-driven
  record→replay round trip through two real drivers.
- Modified: `app/src/monitor/transports/index.ts` (wiring arm + window
  seam), `app/scripts/dist-grep.sh` (new literal needle),
  `app/src/workout/ConnectedSurface.tsx` + `connected/ConnectionLogSheet.tsx`
  (dev-only download control), docs per Task 7.

---

### Task 1: Recording format module

**Files:**
- Create: `app/src/monitor/transports/recording.ts`
- Test: `app/src/monitor/transports/recording.test.ts`

**Interfaces:**
- Consumes: `WorkoutProgram` from `../../../domain/monitor/program.js`.
- Produces (later tasks rely on these exact names):

```ts
export const RECORDING_FORMAT_TAG = "pm5-recording/v1"; // ALSO the dist-grep needle (Task 5)
export interface RecordingHeader {
  v: typeof RECORDING_FORMAT_TAG;
  app: string;                    // git describe, supplied by caller
  transport: "web" | "capacitor" | "fake";
  ua?: string;
  program?: WorkoutProgram;       // B4: required before a replay can arm
}
export type RecordedEvent =
  | { seq: number; t: number; kind: "scan"; devices: { id: string; name: string }[] }
  | { seq: number; t: number; kind: "connect"; id: string }
  | { seq: number; t: number; kind: "subscribe"; char: string }
  | { seq: number; t: number; kind: "unsubscribe"; char: string }
  | { seq: number; t: number; kind: "disconnect" }
  | { seq: number; t: number; kind: "link-drop"; reason: string }
  | { seq: number; t: number; dir: "tx"; char: string; hex: string }
  | { seq: number; t: number; dir: "rx"; char: string; hex: string };
export function toHexString(bytes: Uint8Array): string;   // "f1 76 04" (lowercase, space-sep — the repo's existing wire-log style)
export function fromHexString(hex: string): Uint8Array;
export interface ParsedRecording { header: RecordingHeader; events: RecordedEvent[]; }
export function serializeRecording(header: RecordingHeader, events: RecordedEvent[]): string; // JSONL: header line, then one event per line
export function parseRecording(text: string): ParsedRecording; // throws Error("not a pm5 recording") on a bad/missing header line
```

- [ ] **Step 1: Write the failing tests**

```ts
// app/src/monitor/transports/recording.test.ts
import { describe, expect, it } from "vitest";
import {
  RECORDING_FORMAT_TAG,
  fromHexString,
  parseRecording,
  serializeRecording,
  toHexString,
} from "./recording";

describe("hex helpers", () => {
  it("round-trips bytes through the repo's space-separated lowercase style", () => {
    const bytes = new Uint8Array([0xf1, 0x76, 0x04, 0x00, 0xff]);
    const hex = toHexString(bytes);
    expect(hex).toBe("f1 76 04 00 ff");
    expect(Array.from(fromHexString(hex))).toEqual(Array.from(bytes));
  });
});

describe("recording serialization", () => {
  const header = {
    v: RECORDING_FORMAT_TAG,
    app: "v0.9.0-12-gabc1234",
    transport: "web",
  } as const;
  const events = [
    { seq: 0, t: 0, kind: "connect", id: "dev-1" } as const,
    { seq: 1, t: 12, dir: "rx", char: "0031", hex: "00 01" } as const,
  ];

  it("round-trips header and events through JSONL", () => {
    const text = serializeRecording(header, [...events]);
    const parsed = parseRecording(text);
    expect(parsed.header).toEqual(header);
    expect(parsed.events).toEqual(events);
  });

  it("puts the format tag on the first line so the gzipped file is identifiable from its head", () => {
    const text = serializeRecording(header, [...events]);
    expect(text.split("\n")[0]).toContain(RECORDING_FORMAT_TAG);
  });

  it("rejects text whose first line is not a recording header", () => {
    expect(() => parseRecording('{"seq":0}\n')).toThrow(/not a pm5 recording/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test --project client -- transports/recording`. **The client project owns ALL `src/**` tests regardless of DOM use (`vitest.config.ts:26`); the unit project includes only `server/**`, `domain/**`, `scripts/**` — running it here silently executes an unrelated suite (antagonist premise pass, measured).** Note also: the trailing positional filter does NOT narrow the run in this repo's pnpm+vitest invocation — the whole client project runs; read the new file's own FAIL lines in the output. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `recording.ts` exactly to the Produces block. `serializeRecording` = `[JSON.stringify(header), ...events.map(e => JSON.stringify(e))].join("\n") + "\n"`. `parseRecording` splits on `\n`, filters empty lines, validates `header.v === RECORDING_FORMAT_TAG`.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `git add src/monitor/transports/recording.ts src/monitor/transports/recording.test.ts && git commit -m "feat: the recording format, bytes to JSONL and back"`.

---

### Task 2: The recording tap

**Files:**
- Modify: `app/src/monitor/transports/recording.ts`
- Test: `app/src/monitor/transports/recording.test.ts` (extend)

**Interfaces:**
- Consumes: `Transport` from `../../../domain/monitor/types.js` (methods:
  `scan/connect/write/subscribe/disconnect/onDisconnect`).
- Produces:

```ts
export interface RecordingTap {
  transport: Transport;     // hand THIS to the driver/session
  lines(): string[];        // serialized event lines (no header), snapshot
  events(): RecordedEvent[];
  eventCount(): number;
}
export function createRecordingTransport(
  inner: Transport,
  now: () => number = () => performance.now(),
): RecordingTap;
export function buildRecordingFile(
  tap: Pick<RecordingTap, "lines">,
  header: Omit<RecordingHeader, "v">,
): string; // full JSONL file: header line + tap lines
```

**Binding requirements from the spec:**
- **M1 (per-characteristic single recording):** the driver subscribes to
  0x0031 TWICE (`driver.ts:3024-3025`, `:3310`). The tap keeps its own
  per-characteristic subscriber lists, subscribes to `inner` ONCE per
  characteristic (on first subscriber), records each notification ONCE at
  that single point, and fans out to its own list. Last unsubscribe
  unsubscribes inner.
- `t` = `now() - t0` where `t0` is captured at tap creation; monotone,
  never re-based. NO decoding, NO filtering of any event.
- Records: scan results, connect (with id), every subscribe/unsubscribe,
  every write (`dir:"tx"`), every notification (`dir:"rx"`), disconnect,
  onDisconnect firings (`kind:"link-drop"` with reason).

- [ ] **Step 1: Write the failing tests.** Use a hand-built stub transport
  (pattern: `driver.test.ts:492-540`'s `stubTransport`):

```ts
function stubInner() {
  const subs = new Map<string, Set<(b: Uint8Array) => void>>();
  const writes: { char: string; bytes: Uint8Array }[] = [];
  let dropCb: ((reason: string) => void) | null = null;
  return {
    transport: {
      scan: async () => [{ id: "dev-1", name: "PM5 432331249" }],
      connect: async () => {},
      write: async (char: string, bytes: Uint8Array) => { writes.push({ char, bytes }); },
      subscribe: (char: string, cb: (b: Uint8Array) => void) => {
        if (!subs.has(char)) subs.set(char, new Set());
        subs.get(char)!.add(cb);
        return () => subs.get(char)!.delete(cb);
      },
      disconnect: async () => {},
      onDisconnect: (cb: (r: string) => void) => { dropCb = cb; return () => { dropCb = null; }; },
    },
    notify(char: string, bytes: Uint8Array) { subs.get(char)?.forEach((cb) => cb(bytes)); },
    innerSubscriberCount: (char: string) => subs.get(char)?.size ?? 0,
    fireDrop: (r: string) => dropCb?.(r),
    writes,
  };
}
```

  Tests (each invokes and asserts a consequence):
  1. **Double-subscribe records once, delivers twice:** two
     `tap.transport.subscribe("0031", cb)` calls; `inner.notify("0031", bytes)`;
     assert BOTH callbacks received the bytes, `tap.events()` contains exactly
     ONE `rx` for it, and `inner.innerSubscriberCount("0031") === 1`.
  2. **Write recorded with bytes and characteristic:** call
     `tap.transport.write("0021", new Uint8Array([0xf1, 0xf2]))`; assert the
     stub's `writes` got it AND `tap.events()` has `{dir:"tx", char:"0021",
     hex:"f1 f2"}`.
  3. **`t` is monotone from an injected clock:** inject `now` returning 100,
     then 250; assert recorded `t`s are 0 and 150.
  4. **Handshake events recorded:** `scan()` then `connect("dev-1")` then
     `disconnect()`; assert kinds `["scan","connect","disconnect"]` in order
     with `seq` 0,1,2, and the scan event carries the device list.
  5. **Link drop recorded and propagated:** register
     `tap.transport.onDisconnect(cb)`; `inner.fireDrop("gatt gone")`; assert
     cb fired AND `{kind:"link-drop", reason:"gatt gone"}` recorded.
  6. **`buildRecordingFile` output parses:** `parseRecording(
     buildRecordingFile(tap, { app:"x", transport:"web" }))` returns the
     tap's events and `header.v === RECORDING_FORMAT_TAG`.

- [ ] **Step 2: Run to verify all fail** (no `createRecordingTransport`).
- [ ] **Step 3: Implement** to the Produces block.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: the tap records the seam, once per characteristic"`.

---

### Task 3: The replay transport (barrier scheduler + virtual clock)

**Files:**
- Create: `app/src/monitor/transports/replay.ts`
- Test: `app/src/monitor/transports/replay.test.ts`

**Interfaces:**
- Consumes: `ParsedRecording`, `RecordedEvent`, `fromHexString`,
  `toHexString` from `./recording`; `Transport` from
  `../../../domain/monitor/types.js`.
- Produces:

```ts
export interface ReplayClock {
  now(): number;                                    // virtual ms — bind as DriverOptions.now
  schedule(cb: () => void, ms: number): () => void; // virtual timer — bind as DriverOptions.schedule
}
export interface ReplayResult {
  divergences: string[]; // one line per mismatch/timeout, human-readable
}
export interface ReplayHandle {
  transport: Transport;
  clock: ReplayClock;
  run(): Promise<ReplayResult>; // plays the whole recording; resolves at end-of-log
}
export function createReplayTransport(
  recording: ParsedRecording,
  opts: { barrierTimeoutMs?: number } = {}, // REAL ms bound on each tx barrier wait; default 2000
): ReplayHandle;
```

**Binding semantics (spec §A2, amendment B1 — copy into the module header):**
- The recording is partitioned at each `tx` event. `run()` walks events in
  order:
  - **rx:** advance the virtual clock to the event's `t` (firing any
    scheduled callbacks whose due time is reached, in due-time order),
    deliver the bytes to every CURRENT subscriber of that characteristic,
    then drain microtasks (`for (let i = 0; i < 25; i++) await
    Promise.resolve();` — the repo's established drain idiom, cf.
    `sessionTotals.test.ts`'s 50-iteration drain).
  - **tx (the barrier):** HOLD until the driver calls `transport.write`.
    When it does, compare `(char, bytes)` byte-for-byte against the
    recorded event; on mismatch push a divergence
    (`"tx#<seq> expected <char> <hex> got <char> <hex>"`) and release the
    barrier anyway. If no write arrives within `barrierTimeoutMs` REAL ms,
    push `"tx#<seq> barrier timeout"` and release — a wholesale divergence
    surfaces as a failed zero-divergence assertion, never a Vitest timeout.
  - **scan/connect/subscribe/unsubscribe/disconnect/link-drop:** scan()
    resolves the recorded device list; a recorded `link-drop` fires
    registered `onDisconnect` callbacks with the recorded reason. The
    driver's own subscribe/connect calls are accepted whenever they come
    (they register callbacks; they are not barriers).
- `t` orders events and advances the virtual clock; **it never releases an
  event.** The recorded gap before the first write is how long James took
  to press a button; nothing under replay reproduces it.
- rx fan-out is per-characteristic to all current subscribers (M1).
- Writes arriving when no barrier is pending are queued and consumed by the
  next barrier in order.

- [ ] **Step 1: Write the failing tests.** Build a tiny recording inline
  with `serializeRecording`/`parseRecording` (chars are plain strings here;
  the replay engine treats them opaquely):

  1. **B1 regression — an early-`t` ack still waits for the write:**
     recording `[{rx ack, t:10}, ...]` REORDERED so the ack's recorded `t`
     precedes the tx barrier: events = `[{dir:"tx", t:100, char:"W",
     hex:"01"}, {dir:"rx", t:110, char:"A", hex:"02"}]`. Subscribe to "A",
     start `run()`, drain 50 microtasks WITHOUT writing; assert the "A"
     callback has NOT fired. Then `transport.write("W", Uint8Array [0x01])`;
     await run's completion; assert the callback fired and
     `divergences.length === 0`.
  2. **Mismatch logs and releases:** same recording; write `[0x99]`
     instead; assert run resolves, callback fired anyway, and
     `divergences[0]` matches `/tx#0 .*expected/`.
  3. **Barrier timeout is a divergence, not a hang:**
     `createReplayTransport(rec, { barrierTimeoutMs: 50 })`, never write;
     await `run()`; assert one divergence matching `/barrier timeout/`.
  4. **Virtual clock fires scheduled callbacks in due order:** recording of
     two rx events at t=0 and t=5000; `clock.schedule(cb, 3000)` before
     `run()`; after run, assert cb fired exactly once and
     `clock.now() === 5000`.
  5. **Fan-out:** two subscribers to the same char both receive one
     recorded rx; a subscriber added AFTER that rx was delivered receives
     nothing retroactively.
  6. **Queued write consumed by later barrier:** driver writes BEFORE
     `run()` reaches the tx event; assert zero divergences and run
     completes.

- [ ] **Step 2: Run to verify all fail.**
- [ ] **Step 3: Implement** `replay.ts` to the semantics above.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Self-mutation probe (do not commit the mutation):** invert
  the barrier (deliver rx without holding) and confirm test 1 goes RED;
  restore, green. Note the result for the PR's risk paragraph.
- [ ] **Step 6: Commit** — `git commit -m "feat: replay is barrier-gated on the driver's writes, never the clock"`.

---

### Task 4: A3 round trip — record a fake-driven session, replay it into a second real driver

**Files:**
- Create: `app/src/monitor/recordReplay.roundtrip.test.ts`

**Interfaces:**
- Consumes: `createRecordingTransport`, `buildRecordingFile`,
  `parseRecording` (Task 1/2); `createReplayTransport` (Task 3);
  `createFakeTransport` + `FakeScript` from `./transports/fake`;
  `createPm5Driver` from `./driver`; `createEventLog` from `./eventLog`;
  a `WorkoutProgram` fixture — reuse the pattern of
  `ConnectedSurface.test.tsx:1358`'s fake-driven setup or
  `sessionTotals.test.ts:188-201`'s `TWO_INTERVAL_REST_PROGRAM` literal
  (copy a 2-interval time program literal into this file; do NOT import
  from a test file).

**What it proves (and what it cannot — spec §A3):** the tap records
faithfully and the replay scheduler drives the REAL driver through
`program()` to a terminal state with zero divergences. It does NOT prove
hardware fidelity (the fake has zero inter-characteristic skew, emitted
0x0033-first, and a degenerate `t` column — the walk owns fidelity).

- [ ] **Step 1: Write the failing test:**

```ts
// Sketch — the harness details follow the fake-driven component tests:
const script: FakeScript = { program: PROGRAM, deviceName: "PM5 432331249", events: TIMELINE };
const fake = createFakeTransport(script);
const tap = createRecordingTransport(fake, () => virtualNow); // drive virtualNow alongside tick()
const recDriver = createPm5Driver(tap.transport, createEventLog(), { deviceName: "PM5 432331249" });
const recorded: MonitorEvent[] = [];
recDriver.events((e) => recorded.push(e));
// MonitorDriver has NO connect() (controller ruling): connection is
// Transport-level. Follow ConnectedSurface.test.tsx's fake-driven order:
const [dev] = await tap.transport.scan();
await tap.transport.connect(dev.id);
// then program() + pump fake.tick(...) to terminal
// ... session reaches "workoutComplete"/terminal ...
const file = buildRecordingFile(tap, { app: "roundtrip", transport: "fake", program: PROGRAM });

const replay = createReplayTransport(parseRecording(file));
const [rdev] = await replay.transport.scan();
await replay.transport.connect(rdev.id);
const repDriver = createPm5Driver(replay.transport, createEventLog(), {
  deviceName: "PM5 432331249",
  now: () => replay.clock.now(),          // B2: the driver's clock IS the replay clock
  schedule: (cb, ms) => replay.clock.schedule(cb, ms),
});
const replayed: MonitorEvent[] = [];
repDriver.events((e) => replayed.push(e));
await repDriver.connect("fake-id");
const programPending = repDriver.program(PROGRAM); // from the header — B4
const result = await replay.run();
await programPending;

expect(result.divergences).toEqual([]);
expect(replayed).toEqual(recorded);      // the whole point, in one line
```

  Plus a second test: **the replay clock expires the finish grace** — the
  recorded session's terminal events (which depend on
  `FINISH_GRACE_MS`/`now()`, `driver.ts:794`) appear in `replayed`
  identically; this fails if `now`/`schedule` are left on `Date.now`.

- [ ] **Step 2: Run to verify failure** (deep-equal mismatch or hang →
  barrier timeout divergences make it fail fast).
- [ ] **Step 3: Fix whatever the round trip exposes** in `replay.ts`/
  `recording.ts` (this task is the integration shakeout; expect ordering
  drains to need tuning). No product files outside the two new modules.
- [ ] **Step 4: Run the client project** — `pnpm test --project client` —
  all green (this is the project that owns every `src/**` test; there is no
  narrower honest scope, the positional filter does not narrow).
- [ ] **Step 5: Commit** — `git commit -m "test: a recorded session replays into a second driver, event for event"`.

---

### Task 5: Wiring, window seam, and the bundle proof

**Files:**
- Modify: `app/src/monitor/transports/index.ts` (the `fakeMonitorEnabled`
  block ONLY)
- Modify: `app/scripts/dist-grep.sh`
- Test: extend `app/src/monitor/transports/index.test.ts`

**Interfaces:**
- Produces: `window.__pm5Recording__?: { lines(): string[]; eventCount(): number }`
  (declared in `index.ts`'s existing `declare global` block, set only inside
  the gate).

**The wiring point is M2-critical:** the tap wraps the REAL web transport
returned at `index.ts:223` — NOT the `if (script)` fake arm. New shape of
`resolveDefaultTransport`'s tail:

```ts
if (fakeMonitorEnabled) {
  const script = window.__pm5FakeScript__;
  if (script) { /* existing fake arm, UNCHANGED */ }
  const real = navigator.bluetooth ? createWebBluetoothTransport() : null;
  if (real) {
    return import("./recording").then(({ createRecordingTransport }) => {
      const tap = createRecordingTransport(real);
      window.__pm5Recording__ = { lines: tap.lines, eventCount: tap.eventCount };
      return tap.transport;
    });
  }
  return null;
}
return navigator.bluetooth ? createWebBluetoothTransport() : null;
```

(Dynamic `import("./recording")` for symmetry with the fake arm; both fold
away with the gate.)

- [ ] **Step 1: Write the failing test** in `index.test.ts` (DEV is true
  under Vitest, so the gate is open): stub `navigator.bluetooth` truthy and
  stub `createWebBluetoothTransport` via `vi.mock("./webBluetooth", ...)`
  returning a stub transport; call `resolveDefaultTransport()`; await it;
  assert `window.__pm5Recording__` is set and that calling
  `transport.write(...)` then `window.__pm5Recording__.eventCount()`
  reflects the recorded event. Also assert the FAKE arm (script present)
  does NOT set `__pm5Recording__`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement the wiring.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: dist-grep needle + probe-bite proof (B3):** add
  `pm5-recording` to `scripts/dist-grep.sh`'s needle list (STRING LITERAL —
  read that script's header; identifiers survive minification renamed).
  Then prove the probe bites: temporarily add
  `import { RECORDING_FORMAT_TAG } from "./recording"; console.log(RECORDING_FORMAT_TAG);`
  as a STATIC top-level import in `index.ts`, run `pnpm build` then
  `scripts/dist-grep.sh` — expect RED; revert the mutation; build + grep
  again — expect CLEAN. Record both outcomes for the PR body.
- [ ] **Step 6: Commit** — `git commit -m "feat: the tap wires into the gate, and the bundle proof bites"`.

---

### Task 6: The download control

**Files:**
- Modify: `app/src/workout/ConnectedSurface.tsx` (pass `program` through)
- Modify: `app/src/workout/connected/ConnectionLogSheet.tsx`
- Test: `app/src/workout/connected/ConnectionLogSheet.test.tsx` (extend)

**Interfaces:**
- Consumes: `buildRecordingFile` from
  `../../monitor/transports/recording` (import the FUNCTION statically:
  this component ships in the product bundle, but `recording.ts` has no
  monitor-side imports and the header-string composition is inert — the
  TAP stays gated; verify Task 5's dist-grep still passes, which it will
  because the needle is the format tag and the tag now legitimately ships
  with this control… **NO. Stop — that breaks the bundle proof.**
  Import it DYNAMICALLY inside the click handler, gated on the global:
  the control renders only when `window.__pm5Recording__` exists, which
  only the gated arm ever sets, so a production build never renders it and
  the dynamic import keeps `recording.ts` out of the product chunk graph.)
- Produces: a `Download recording` button (copy exactly that: no em-dash,
  sentence case) in the log sheet's action row, 44px hit target, visible
  ONLY when `window.__pm5Recording__` is present.

Handler behavior:

```ts
async function handleDownloadRecording(): Promise<void> {
  const rec = window.__pm5Recording__;
  if (!rec) return;
  const { buildRecordingFile } = await import("../../monitor/transports/recording");
  const text = buildRecordingFile(rec, {
    app: "dev", // VITE_APP_VERSION confirmed absent in this repo; no new build arg
    transport: "web",
    ua: navigator.userAgent,
    program, // the new prop, from ConnectedSurface's own `program` (B4)
  });
  const gz = typeof CompressionStream !== "undefined"
    ? await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob()
    : new Blob([text]); // jsdom / old engines: plain .jsonl
  const a = document.createElement("a");
  a.href = URL.createObjectURL(gz);
  a.download = `pm5-recording-${Date.now()}.jsonl${typeof CompressionStream !== "undefined" ? ".gz" : ""}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
```

  (`Date.now()` in a filename is UI code, not domain — allowed.
  `VITE_APP_VERSION` is CONFIRMED ABSENT from this repo (antagonist premise
  pass, grep over `src/` + `vite.config.ts`): use the literal `"dev"`; do
  NOT invent a new build arg in this task.)

- [ ] **Step 1: Write the failing tests** (client project, jsdom):
  1. Button absent when `window.__pm5Recording__` is undefined.
  2. With the global stubbed (`{ lines: () => ['{"seq":0,...}'], eventCount: () => 1 }`)
     and `program` prop supplied: button present; click it; assert an
     anchor download was triggered (spy on
     `HTMLAnchorElement.prototype.click`) and that the composed text (spy
     on `URL.createObjectURL`, read the Blob) parses via `parseRecording`
     with `header.program` deep-equal to the prop (B4 pinned in a test).
  3. Hit target: the button's computed box is ≥44px (follow the sheet's
     existing hit-target test pattern if present; otherwise assert the
     class it shares with the sheet's existing 44px buttons).
- [ ] **Step 2: Run to verify failure** —
  `pnpm test --project client -- ConnectionLogSheet`.
- [ ] **Step 3: Implement** (prop threading in `ConnectedSurface.tsx:389`'s
  call site + the button and handler).
- [ ] **Step 4: Run to verify pass. Check per-file coverage** for both
  touched components (recurring failure #2):
  `pnpm test:coverage -- --project client` and read the per-file lines.
- [ ] **Step 5: Commit** — `git commit -m "feat: the log sheet can hand over the recording"`.

---

### Task 7: Docs and comment corrections riding this PR

**Files:**
- Modify: `ROADMAP.md`, `CLAUDE.md`,
  `app/src/monitor/captureReplay.test.ts:23-26`,
  `app/src/monitor/driver.ts:377` and `:3526` (doc comments only)

- [ ] **Step 1: ROADMAP** — under Phase CR2, add an infrastructure entry:
  Stage A (this PR), Stage B (CI rung; gated on spec 2's walk capture; its
  exit criteria are the spec's 1-4), UI replay rung (filed as a spec 3
  follow-on), Tier 2 on-device recording (trigger-gated follow-on:
  "a defect fires on-device that the dev/web recorder cannot see";
  prerequisites: byte bound, non-terminal persist trigger, real export
  path, on-device rate confirmation). Amend CR2's exit line to name
  R0/F6/F7 (PM ruling 2026-08-15).
- [ ] **Step 2: CLAUDE.md recurring failure #11** — replace "checking the
  derived total against the intervals' own `boundary` actuals" with
  "checking the derived total against each interval's own final pre-reset
  reading (the captures contain no `boundary` events, and the
  boundary-actual sum is an unsound oracle — architecture review §F2)".
- [ ] **Step 3: `captureReplay.test.ts` header, reason 2** — replace the
  zero-fill claim with the truth (antagonist M3): the zero-filled 0x0033 is
  `sessionTotals.test.ts`'s priming shortcut; `fake.ts:649` computes
  `intervalCount` via `toMachineIndex` (the algebraic inverse of the
  function under test) and emits 0x0033→0x0032→0x0031 atomically — zero
  skew, opposite order to hardware.
- [ ] **Step 4: `driver.ts` stale prose** — `:377` and `:3526` say
  `verifyTicks` defaults to 20; `DEFAULT_VERIFY_TICKS = 30` (`:628`).
  Change both comments to 30.
- [ ] **Step 5:** `pnpm test --project client` (captureReplay.test.ts is a
  `src/**` file, so client project; comment-only change, but run it: a
  comment edit inside a test file has broken loading before — check BOTH
  summary lines, "Test Files" included).
- [ ] **Step 6: Commit** — `git commit -m "docs: the harness gets a roadmap home, and three stale claims get corrected"`.

---

### Task 8: Full gates and the PR

- [ ] **Step 1:** In `app/`: `pnpm lint && pnpm typecheck && pnpm test` —
  read BOTH vitest summary lines ("Test Files" and "Tests").
- [ ] **Step 2:** `pnpm test:coverage` — check PER-FILE numbers for
  `recording.ts`, `replay.ts`, and the two touched components; any branch
  under ~90% on a new file gets a test, not a shrug.
- [ ] **Step 3:** `pnpm e2e` — the diff touches `app/src/`, so this is
  mandatory (recurring failure #1). Note: in the e2e stack the FAKE arm is
  taken (`__pm5FakeScript__` injected), the tap is not built, and the
  download button must not appear — `connected.spec.ts`'s existing
  assertions double as the regression check; watch for new failures only.
  `pnpm screenshots` is NOT required (no layout change on any captured
  screen — the button is dev-only and hidden in capture runs; state this
  in the PR).
- [ ] **Step 4:** Verify worktree: `git rev-parse --show-toplevel` →
  `.../.claude/worktrees/record-replay`. Push branch, open PR titled
  "Record and replay: the seam finally has a tape recorder". Body: feature
  table, the two probe-bite results (Task 3 barrier mutation, Task 5
  dist-grep mutation), per-file coverage numbers, the contrast/e2e notes,
  and the standing reminder that Stage B + the walk protocol additions ride
  spec 2.
- [ ] **Step 5:** Dispatch `product-manager` (final-PR gate) per CLAUDE.md;
  present its verdict with the PR and STOP — no merge without James's
  explicit word.
