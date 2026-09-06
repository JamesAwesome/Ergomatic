# Phase NF Scan NFC Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **House shape (CLAUDE.md, "Inline implementation is an accepted shape"):** the controller may implement each task inline in task-sized commits, failing tests first, and dispatch only the review half; the PR body says which shape was used.

**Goal:** Ship the one atomic Phase NF product PR: an NFC-capable iPhone shows **Scan NFC** on workout detail, one tap on a PM5's tag reads its advertised name, and Ergomatic connects to exactly that PM5 and programs the workout through the existing `armed` path with no Bluetooth picker.

**Architecture:** One platform adapter owns NFC (`src/adapters/nfcReader.ts` → `src/native/nfc.ts`); a pure domain parser turns validated record bytes into a single `Pm5NfcTarget`; the existing `Transport` gains a separate, fail-closed `scanTarget` capability implemented by Capacitor BLE, the fake and replay; `useMonitorSession.connect()` takes a discriminated `MonitorDiscoveryRequest` (picker or advertised-name) and everything downstream of GATT connect is untouched. A shared connection-entry owner (`src/monitor/ConnectionEntry.tsx`) replaces `ConnectAction.tsx` so both hardware buttons share one safety guard, one attempt ID and one pending intent. Every new platform input has an instrument: a scripted NFC reader behind the existing fake-injection gate, a redacted connection-attempt trace with a production sink, and native-injected tests in the checked-in plugin patch.

**Tech Stack:** React 19, TypeScript ~6.0, Vite, Vitest (jsdom), Playwright, Capacitor 8.5, `@capgo/capacitor-nfc@8.2.5` (patched, already on this branch), `@capacitor-community/bluetooth-le@8.3.0`, `@capacitor/haptics@8.0.2` (new; `npm view @capacitor/haptics version` → `8.0.2` on 2026-09-06), `@capacitor/app@8.1.1`, Swift/XCTest for the patch tests, Node 26, pnpm 11.17.0.

**Spec:** `docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md` (Gate -1 complete 2026-09-06; "Reader-ending seam" ruled option A the same day).

## Global Constraints

Copied from the spec; every task's requirements include this section.

- Native iOS only. Web and the simulator render no **Scan NFC** button, no placeholder, no reserved height. Android is out.
- The label is exactly `Scan NFC`; the accepted state is exactly `✓ PM5 found`; the usage description is exactly `Scan a PM5 to connect and program your workout.` (already in `Info.plist` on this branch).
- Copy table (spec "User-visible states and copy") is binding and complete; no new user-facing string outside it. House style: no em-dashes in copy.
- `ConnectionAttemptId` is `crypto.randomUUID()` minted at the shared entry owner; native and JS reject a missing or empty value; comparison is exact string equality only.
- NFC start uses `iosSessionType: "ndef"`, `invalidateAfterFirstRead: false`; Ergomatic explicitly stops every session by attempt ID.
- The parser requires TNF `0x04`, exact ASCII type `concept2.com:bleconnectinfo`, the capture-proven 40-byte payload (six address bytes + one address-type byte + name + zero padding), a name that starts with `PM5 `, is printable ASCII, ≤ 31 bytes, terminated by the first `0x00`, followed only by `0x00` bytes. It never uses `TextDecoder("ascii")`.
- Only `advertisingName` crosses into workout/session state. No tag UID, address, payload or `deviceId` is persisted or logged.
- Targeted BLE discovery compares `ScanResult.localName === exactName` only; never `device.name`, RSSI, a `PM5` prefix, a cached name or the NFC MAC. `requestLEScan` runs with no name filter, no service filter, `allowDuplicates: true`. Every settle path awaits `stopLEScan()` before resolving or rejecting.
- There is no fallback from `scanTarget` to `scan()`; a missing capability or an invalid request fails closed before any radio call.
- Targeted deadline and collision window are named, test-injected constants: `TARGET_SCAN_DEADLINE_MS = 10_000`, `TARGET_COLLISION_WINDOW_MS = 1_000`. Evidence: the first matching `requestLEScan` callback arrived 103 ms after scan start with the next duplicate 1 ms later (`REPAIRED-NORMAL.md`), and 158 ms begin→RF-active on the NFC side (`NORMAL-TRACE-V8-RESULT.md`); the deadline is ~100× the observed match latency and the collision window ~1000× the observed duplicate spacing. Both are Ergomatic policy, per the spec's residual, and boundary tests use independent literals (`9_999`/`10_000`, `999`/`1_000`), never the constants.
- Staged retirement executes only at the wire `armed` event, exactly as today; Phase NF keys the staged receipt by attempt ID and never moves the acceptance point.
- `stopLEScan()` rejection poisons the module-level operation tail: every later manual or targeted scan rejects without a native call until the process restarts.
- The checked-in NFC patch is part of the safety mechanism; its `nfcSessionEnd` carries `cause: "multipleTags" | "tagFailure"` with `reason: "invalidated"` on controller-forced endings (spec "Reader-ending seam").
- `pnpm build` + `pnpm dist:grep` prove the web bundle contains no NFC, haptics or scripted-reader code (string-literal needles, both directions).
- All work in the worktree `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design`, branch `codex/phase-nf-nfc-design`. Before every commit run `git rev-parse --show-toplevel` and require that path. No push, merge or release without James's word. Commit before every mutation probe; revert probes with `git checkout -- <file>` only after `git status` shows the file clean (RF22).
- Test commands (from `app/`): `pnpm test --project unit`, `pnpm test --project client`; a single file: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`; the native patch: `cd app/node_modules/@capgo/capacitor-nfc && xcodebuild -scheme CapgoCapacitorNfc -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' test`. Read both the `Test Files` and `Tests` summary lines.

---

## File Map

Domain (pure, no framework imports):

- Create `app/domain/monitor/nfc.ts` — `NfcRecord`, `Pm5NfcTarget`, `parsePm5NfcTarget()`, `isValidPm5AdvertisingName()`, the PM5 type bytes and limits.
- Create `app/domain/monitor/nfc.test.ts` — parser table over the canonical fixture and every rejection.
- Modify `app/domain/monitor/types.ts` — `ConnectionAttemptId`, `MonitorDiscoveryRequest`, `TargetedMonitorDiscoveryRequest`, `TargetedScanTransport`, `hasTargetedScan()`, `isValidAttemptId()`.

Adapters and native (the only platform conditionals):

- Create `app/src/adapters/nfcReader.ts` — `NfcReader` port, `NfcCapability`, the typed ending errors, `resolveNfcReader()` (native → `src/native/nfc.ts`; web → scripted reader behind the fake gate, else `unsupported`).
- Create `app/src/adapters/nfcReader.test.ts`.
- Create `app/src/native/nfc.ts` — the only file importing `@capgo/capacitor-nfc`; listener-before-start, current-state read, stop by attempt ID, cause mapping.
- Create `app/src/adapters/haptics.ts` + `app/src/native/haptics.ts` — best-effort success haptic.
- Modify `app/src/adapters/appLifecycle.ts` — `currentAppLifecycleState()`.
- Modify `app/src/native/appLifecycle.ts` — native `App.getState()` read.

Monitor layer:

- Create `app/src/monitor/nfc/nfcBridge.ts` — `unknown` → `{ attemptId, records }` validation of plugin events.
- Create `app/src/monitor/nfc/scriptedNfcReader.ts` — test/e2e reader replaying native-shaped events.
- Create `app/src/monitor/nfc/connectionAttemptTrace.ts` — bounded redacted trace with the fixed kind list and `latestConnectionAttemptTrace()`.
- Create `app/src/monitor/nfc/paintBarrier.ts` — two consecutive `requestAnimationFrame` turns, abortable.
- Create `app/src/monitor/nfc/runNfcAttempt.ts` — the detail coordinator: authorize → read → stop → parse → haptic → paint → hand off.
- Create `app/src/monitor/nfc/fixtures.ts` — loads `docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json` for tests.
- Create `app/src/monitor/ConnectionEntry.tsx` (replaces `ConnectAction.tsx`) — both hardware buttons, one guard, one intent, one attempt ID.
- Create `app/src/monitor/mountLease.ts` — identity-bound StrictMode-safe mount lease.
- Modify `app/src/monitor/handoffStore.ts` — staged retire keyed by attempt ID.
- Modify `app/src/monitor/transports/capacitorBle.ts` — `scanTarget`, operation tail, poison, named errors, injectable constants.
- Modify `app/src/monitor/transports/{fake,replay,recording,holdOpen,liveness,index}.ts` — explicit `scanTarget` behaviour.
- Modify `app/src/monitor/useMonitorSession.ts` — `connect(request)`, targeted branch, abort ownership, foreground lease, five new `ConnectedError` reasons, keyed discard.
- Modify `app/src/workout/ConnectedInterstitial.tsx` — `request` prop, new copy, retry policy.
- Modify `app/src/workout/WorkoutDetail.tsx` — NFC path, accepted state, inline NFC errors.
- Modify `app/src/theme/tokens.css`, `app/src/index.css` — `--action-nfc`, `.button-nfc`, accepted state.
- Delete `app/src/monitor/ConnectAction.tsx` (+ test); move its guard tests into `ConnectionEntry.test.tsx`.

Proof infrastructure and gates:

- Modify `app/scripts/dist-grep.sh` — needles `CapacitorNfc`, `scripted NFC reader (dev harness)`, `Haptics`.
- Modify `app/e2e/design.spec.ts`, `app/e2e/connected.spec.ts`, `app/e2e/screenshots.spec.ts` — two-primaries assertion, NFC flow via the scripted seam, captures.
- Modify `app/src/monitor/transports/index.ts` — `window.__nfcScript__` seam beside `__pm5FakeScript__`.
- Modify `docs/design/DEVIATIONS.md`, `ROADMAP.md`, `docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md` (walk record), `docs/monitor/sessions/phase-nf-product-walk/RUNSHEET.md` (new).

Retired probe (Task 1): delete `app/src/monitor/nfc/GateMinusOneProbe.tsx`, `GateMinusOneProbe.test.tsx`, `gateMinusOneReceipt.ts`, `gateMinusOneReceipt.test.ts`, `app/src/native/nfcGateMinusOneProbe.ts`, `app/scripts/nfc-gate-console-receipt.ts` (+test), `app/scripts/nfc-normal-trace-controller.ts` (+test); restore `app/src/You.tsx` and `app/src/vite-env.d.ts`.

---

## Interfaces (the contract every task shares)

```ts
// app/domain/monitor/types.ts (additions)
export type ConnectionAttemptId = string;

export interface TargetedMonitorDiscoveryRequest {
  kind: "advertised-name";
  attemptId: ConnectionAttemptId;
  exactName: string;
}

export type MonitorDiscoveryRequest =
  | { kind: "picker"; attemptId: ConnectionAttemptId }
  | TargetedMonitorDiscoveryRequest;

export interface TargetedScanTransport {
  scanTarget(
    request: TargetedMonitorDiscoveryRequest,
    signal: AbortSignal,
  ): Promise<DiscoveredMonitor[]>;
}

export function isValidAttemptId(value: unknown): value is ConnectionAttemptId;
export function hasTargetedScan(t: Transport): t is Transport & TargetedScanTransport;
```

```ts
// app/domain/monitor/nfc.ts
export interface NfcRecord {
  tnf: number;
  type: readonly number[];
  payload: readonly number[];
}
export interface Pm5NfcTarget {
  advertisingName: string;
}
export type Pm5NfcParseFailure = { code: "unsupported"; reason: string };
export function parsePm5NfcTarget(
  records: readonly NfcRecord[],
): Pm5NfcTarget | Pm5NfcParseFailure;
export function isValidPm5AdvertisingName(value: unknown): value is string;
```

```ts
// app/src/adapters/nfcReader.ts
export type NfcCapability = "supported" | "unsupported";
export interface NfcReadOptions {
  attemptId: ConnectionAttemptId;
  alertMessage: string;
  signal: AbortSignal;
  trace: ConnectionAttemptTrace;
}
export interface NfcReader {
  capability(): Promise<NfcCapability>;
  readOne(options: NfcReadOptions): Promise<readonly NfcRecord[]>;
}
// Endings, by NAME (the classifier keys on `err.name`, never on prose):
//   NfcCancelledError, NfcTimeoutError, NfcInvalidatedError (cause?: "multipleTags" | "tagFailure"),
//   NfcAbortError, NfcStartError, NfcUnsupportedError
export function resolveNfcReader(): NfcReader;
```

```ts
// app/src/monitor/nfc/connectionAttemptTrace.ts
export type ConnectionAttemptTraceKind =
  | "supported" | "unsupported" | "capability-failed" | "capability-timed-out"
  | "listener-registration-failed" | "session-requested" | "start-failed"
  | "tag-event" | "invalid-native-event" | "stale-id-dropped"
  | "parser-accepted" | "parser-rejected" | "haptic-failed" | "reader-settled"
  | "foreground-abort" | "held-device-conflict" | "ble-scan-started"
  | "ble-scan-matched" | "ble-scan-timed-out" | "invalid-scan-result"
  | "abort-requested" | "scan-drain-settled" | "ble-scan-cleanup-failed"
  | "handoff-accepted";
export interface ConnectionAttemptTraceEntry { seq: number; atMs: number; kind: ConnectionAttemptTraceKind; detail?: string }
export interface ConnectionAttemptTrace {
  record(kind: ConnectionAttemptTraceKind, detail?: string): void;
  entries(): readonly ConnectionAttemptTraceEntry[];
  complete(): void; // publishes this trace as the process-local latest snapshot
}
export function createConnectionAttemptTrace(now?: () => number): ConnectionAttemptTrace;
export function latestConnectionAttemptTrace(): readonly ConnectionAttemptTraceEntry[] | null;
```

`ConnectionEntryIntent` (`src/monitor/ConnectionEntry.tsx`):

```ts
export type ConnectionEntryIntent =
  | { kind: "manual"; attemptId: ConnectionAttemptId }
  | { kind: "nfc"; attemptId: ConnectionAttemptId };
```

`WorkoutDetail`'s `connecting` state gains `request: MonitorDiscoveryRequest`; `ConnectedInterstitial` gains a required `request` prop and passes it to `session.connect(request)` on mount and on **Try again**. `useMonitorSession.connect(request?: MonitorDiscoveryRequest)` — omitted means `{ kind: "picker", attemptId: <minted here> }` so `JustRow.tsx`/`JustRowObserver.tsx` (existing zero-argument callers, verified: `grep -n "session.connect()" src/justrow/JustRow.tsx src/monitor/JustRowObserver.tsx`) are unchanged.

New `ConnectedError` reasons: `"target-not-advertising" | "target-already-connected" | "target-ambiguous" | "target-interrupted" | "scan-cleanup-failed"`. All five are non-machine refusals (`NOT_A_MACHINE_REFUSAL[reason] = true`), so the interstitial's serif line is their `detail`, and the generic `End whatever is showing…` line never renders for them.

---

## Task 1: Retire the Gate -1 probe

The disposable probe must be gone before product commits (spec "Proof task — disposable"). The patch, fixture, README and session records stay.

**Files:**
- Delete: `app/src/monitor/nfc/GateMinusOneProbe.tsx`, `app/src/monitor/nfc/GateMinusOneProbe.test.tsx`, `app/src/monitor/nfc/gateMinusOneReceipt.ts`, `app/src/monitor/nfc/gateMinusOneReceipt.test.ts`, `app/src/native/nfcGateMinusOneProbe.ts`, `app/scripts/nfc-gate-console-receipt.ts`, `app/scripts/nfc-gate-console-receipt.test.ts`, `app/scripts/nfc-normal-trace-controller.ts`, `app/scripts/nfc-normal-trace-controller.test.ts`
- Modify: `app/src/You.tsx` (remove the `GateMinusOneProbe` lazy mount and its flag), `app/src/vite-env.d.ts` (remove `VITE_NFC_GATE_MINUS_ONE_PREFILL`)
- Modify: `ROADMAP.md` (one line: probe retired, the patch and fixture are the durable output)

- [ ] **Step 1: Delete the probe files and restore `You.tsx` / `vite-env.d.ts`**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design/app
git rm -q src/monitor/nfc/GateMinusOneProbe.tsx src/monitor/nfc/GateMinusOneProbe.test.tsx \
  src/monitor/nfc/gateMinusOneReceipt.ts src/monitor/nfc/gateMinusOneReceipt.test.ts \
  src/native/nfcGateMinusOneProbe.ts \
  scripts/nfc-gate-console-receipt.ts scripts/nfc-gate-console-receipt.test.ts \
  scripts/nfc-normal-trace-controller.ts scripts/nfc-normal-trace-controller.test.ts
git checkout main -- src/You.tsx src/vite-env.d.ts
git diff --stat main -- src/You.tsx src/vite-env.d.ts   # expected: empty
```

- [ ] **Step 2: Prove nothing references the probe**

```bash
grep -rn "GateMinusOne\|gateMinusOne\|nfcGateMinusOneProbe\|VITE_ENABLE_NFC_GATE_MINUS_ONE\|VITE_NFC_GATE_MINUS_ONE_PREFILL\|releaseNfcGateProgress" src scripts e2e vitest.config.ts package.json
```

Expected: no output. If `vitest.config.ts` or `package.json` names a probe script, remove that line in the same commit.

- [ ] **Step 3: Run the gates**

```bash
pnpm typecheck && pnpm lint && pnpm test --project unit && pnpm test --project client && pnpm build && pnpm dist:grep
```

Expected: all green; `Test Files` line shows no failed-to-load file.

- [ ] **Step 4: Commit**

```bash
git rev-parse --show-toplevel   # must print the worktree path
git add -A src scripts ../ROADMAP.md
git commit -m "chore(nfc): retire the Gate -1 probe; the patch, fixture and records are the durable output"
```

---

## Task 2: Domain parser and discovery types

**Files:**
- Create: `app/domain/monitor/nfc.ts`, `app/domain/monitor/nfc.test.ts`
- Modify: `app/domain/monitor/types.ts` (append after `Transport`)
- Create: `app/src/monitor/nfc/fixtures.ts`

**Interfaces:** produces `parsePm5NfcTarget`, `isValidPm5AdvertisingName`, `NfcRecord`, `Pm5NfcTarget`, `PM5_NFC_TYPE_BYTES`, `PM5_ADVERTISING_NAME_MAX_BYTES = 31`, `PM5_NFC_PAYLOAD_BYTES = 40`, plus the types block above.

- [ ] **Step 1: Write the failing parser tests**

`app/src/monitor/nfc/fixtures.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NfcRecord } from "../../../domain/monitor/nfc.js";

/** The canonical Gate -1 capture (`docs/monitor/nfc/README.md`): three
 *  records read from James's PM5 on 2026-09-04, six address bytes zeroed. */
const FIXTURE_URL = new URL(
  "../../../../docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json",
  import.meta.url,
);

export interface Pm5NfcFixture {
  schema: "ergomatic/pm5-nfc-records/v1";
  source: string;
  records: (NfcRecord & { id: number[] })[];
}

export function loadPm5NfcFixture(): Pm5NfcFixture {
  return JSON.parse(readFileSync(fileURLToPath(FIXTURE_URL), "utf8")) as Pm5NfcFixture;
}

/** The literal the fixture's PM5 record decodes to. Kept as an independent
 *  literal on purpose: a parser test must not derive its expectation from
 *  the parser (RF21). */
export const FIXTURE_PM5_NAME = "PM5 432331249 Row";
```

`app/domain/monitor/nfc.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isValidPm5AdvertisingName,
  parsePm5NfcTarget,
  PM5_NFC_TYPE_BYTES,
  type NfcRecord,
} from "./nfc.js";
import { FIXTURE_PM5_NAME, loadPm5NfcFixture } from "../../src/monitor/nfc/fixtures";

const fixture = loadPm5NfcFixture().records;
const pm5 = fixture[0]!;

function withPayload(payload: number[]): NfcRecord {
  return { tnf: pm5.tnf, type: pm5.type, payload };
}

describe("parsePm5NfcTarget", () => {
  it("decodes the canonical capture to the literal advertised name", () => {
    expect(parsePm5NfcTarget(fixture)).toEqual({ advertisingName: FIXTURE_PM5_NAME });
  });

  it("accepts the PM5 record when it is not first", () => {
    expect(parsePm5NfcTarget([fixture[2]!, fixture[1]!, pm5])).toEqual({
      advertisingName: FIXTURE_PM5_NAME,
    });
  });

  it("rejects an empty message", () => {
    expect(parsePm5NfcTarget([])).toEqual({ code: "unsupported", reason: "no PM5 record" });
  });

  it("rejects a wrong TNF with the right type bytes", () => {
    expect(parsePm5NfcTarget([{ ...pm5, tnf: 1 }])).toMatchObject({ code: "unsupported" });
  });

  it("rejects a type that differs by one byte", () => {
    const type = [...PM5_NFC_TYPE_BYTES];
    type[type.length - 1] = 0x78; // trailing 'o' → 'x' 
    expect(parsePm5NfcTarget([{ ...pm5, type }])).toMatchObject({ code: "unsupported" });
  });

  it("rejects two PM5 records even when identical", () => {
    expect(parsePm5NfcTarget([pm5, pm5])).toEqual({
      code: "unsupported",
      reason: "more than one PM5 record",
    });
  });

  it("rejects a payload shorter than the capture-proven 40 bytes", () => {
    expect(parsePm5NfcTarget([withPayload(pm5.payload.slice(0, 39))])).toMatchObject({
      code: "unsupported",
    });
  });

  it("rejects a payload longer than 40 bytes", () => {
    expect(parsePm5NfcTarget([withPayload([...pm5.payload, 0])])).toMatchObject({
      code: "unsupported",
    });
  });

  it("rejects a name with no zero terminator inside the payload", () => {
    const payload = [...pm5.payload.slice(0, 7), ...Array.from("PM5 " + "A".repeat(29), (c) => c.charCodeAt(0))];
    expect(payload).toHaveLength(40);
    expect(parsePm5NfcTarget([withPayload(payload)])).toMatchObject({ code: "unsupported" });
  });

  it("rejects a non-zero byte after the terminator (bad padding)", () => {
    const payload = [...pm5.payload];
    payload[39] = 0x41;
    expect(parsePm5NfcTarget([withPayload(payload)])).toMatchObject({ code: "unsupported" });
  });

  it("rejects an embedded control character and a non-ASCII byte", () => {
    for (const bad of [0x09, 0x7f, 0xc3]) {
      const payload = [...pm5.payload];
      payload[9] = bad;
      expect(parsePm5NfcTarget([withPayload(payload)])).toMatchObject({ code: "unsupported" });
    }
  });

  it("rejects an empty name and a name without the PM5 prefix", () => {
    const empty = [...pm5.payload.slice(0, 7), ...new Array(33).fill(0)];
    expect(parsePm5NfcTarget([withPayload(empty)])).toMatchObject({ code: "unsupported" });
    const other = [...pm5.payload];
    other[7] = 0x50; other[8] = 0x4d; other[9] = 0x34; // "PM4 "
    expect(parsePm5NfcTarget([withPayload(other)])).toMatchObject({ code: "unsupported" });
  });

  it("ignores the address and address-type bytes after structural validation", () => {
    const payload = [...pm5.payload];
    payload[0] = 0xff; payload[5] = 0xff; payload[6] = 0x00;
    expect(parsePm5NfcTarget([withPayload(payload)])).toEqual({ advertisingName: FIXTURE_PM5_NAME });
  });

  it("returns only the advertising name (no payload, address or type leaks)", () => {
    expect(Object.keys(parsePm5NfcTarget(fixture))).toEqual(["advertisingName"]);
  });
});

describe("isValidPm5AdvertisingName", () => {
  it("accepts the fixture name and rejects the boundary cases", () => {
    expect(isValidPm5AdvertisingName(FIXTURE_PM5_NAME)).toBe(true);
    expect(isValidPm5AdvertisingName("PM5 " + "x".repeat(27))).toBe(true); // 31 bytes
    expect(isValidPm5AdvertisingName("PM5 " + "x".repeat(28))).toBe(false); // 32 bytes
    expect(isValidPm5AdvertisingName("PM5")).toBe(false);
    expect(isValidPm5AdvertisingName("PM5 ")).toBe(false);
    expect(isValidPm5AdvertisingName("pm5 432331249 Row")).toBe(false);
    expect(isValidPm5AdvertisingName("PM5 4323 31249")).toBe(false);
    expect(isValidPm5AdvertisingName("PM5 é")).toBe(false);
    expect(isValidPm5AdvertisingName(undefined)).toBe(false);
    expect(isValidPm5AdvertisingName(42)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/monitor/nfc.test.ts
```

Expected: FAIL, `Cannot find module './nfc.js'`.

- [ ] **Step 3: Implement the parser and types**

`app/domain/monitor/nfc.ts`:

```ts
// Phase NF (spec §2, "A strict parser produces the only cross-radio
// value"). Pure: validated integer arrays in, ONE advertising name out.
// Nothing here knows about Capacitor, Core NFC, React or the PM5 driver.
//
// The payload rule is CAPTURE-PROVEN, not spec-derived: Concept2's interface
// definition describes three fields (six-byte BLE address, one-byte address
// type, a name of up to 31 bytes) and says nothing about the record's
// length. Gate -1 read the same PM5 three times
// (`docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json`,
// `REMAINING-PROOF.md` criterion 3): a 40-byte payload, the complete name at
// offset 7, zero bytes to the end. So: exactly 40 bytes, name from offset 7
// to the first 0x00, only 0x00 after it. Other PM5 firmware may differ; the
// parser fails closed on anything else and the rower keeps manual Connect.

export interface NfcRecord {
  tnf: number;
  type: readonly number[];
  payload: readonly number[];
}

export interface Pm5NfcTarget {
  advertisingName: string;
}

export type Pm5NfcParseFailure = { code: "unsupported"; reason: string };

/** TNF 0x04 = NFC Forum external type. */
export const PM5_NFC_TNF_EXTERNAL = 0x04;
/** ASCII bytes of `concept2.com:bleconnectinfo`. */
export const PM5_NFC_TYPE_BYTES: readonly number[] = Array.from(
  "concept2.com:bleconnectinfo",
  (c) => c.charCodeAt(0),
);
export const PM5_NFC_PAYLOAD_BYTES = 40;
const PM5_NFC_NAME_OFFSET = 7;
/** Concept2's own limit for the advertising name. */
export const PM5_ADVERTISING_NAME_MAX_BYTES = 31;
const PM5_NAME_PREFIX = "PM5 ";

function isPrintableAscii(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

function isPm5Record(record: NfcRecord): boolean {
  return (
    record.tnf === PM5_NFC_TNF_EXTERNAL &&
    record.type.length === PM5_NFC_TYPE_BYTES.length &&
    record.type.every((b, i) => b === PM5_NFC_TYPE_BYTES[i])
  );
}

/** Strict printable-ASCII `PM5 …` name within Concept2's 31-byte limit.
 *  Used by the parser AND by the targeted-scan boundary
 *  (`capacitorBle.ts`'s request validation) so both name one rule. */
export function isValidPm5AdvertisingName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length <= PM5_NAME_PREFIX.length) return false;
  if (value.length > PM5_ADVERTISING_NAME_MAX_BYTES) return false;
  if (!value.startsWith(PM5_NAME_PREFIX)) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (!isPrintableAscii(value.charCodeAt(i))) return false;
  }
  return true;
}

function unsupported(reason: string): Pm5NfcParseFailure {
  return { code: "unsupported", reason };
}

export function parsePm5NfcTarget(
  records: readonly NfcRecord[],
): Pm5NfcTarget | Pm5NfcParseFailure {
  const matches = records.filter(isPm5Record);
  if (matches.length === 0) return unsupported("no PM5 record");
  if (matches.length > 1) return unsupported("more than one PM5 record");
  const payload = matches[0]!.payload;
  if (payload.length !== PM5_NFC_PAYLOAD_BYTES) {
    return unsupported(`payload is ${payload.length} bytes, not ${PM5_NFC_PAYLOAD_BYTES}`);
  }
  // Bytes 0-5 (address) and 6 (address type) are validated only
  // structurally, by the length check above; their values are ignored.
  const body = payload.slice(PM5_NFC_NAME_OFFSET);
  const end = body.indexOf(0x00);
  if (end === -1) return unsupported("name is not zero-terminated");
  if (end === 0) return unsupported("empty name");
  if (end > PM5_ADVERTISING_NAME_MAX_BYTES) return unsupported("name exceeds 31 bytes");
  for (let i = end + 1; i < body.length; i += 1) {
    if (body[i] !== 0x00) return unsupported("non-zero byte after the name terminator");
  }
  const nameBytes = body.slice(0, end);
  if (!nameBytes.every(isPrintableAscii)) return unsupported("name is not printable ASCII");
  // Bytewise decode: no TextDecoder("ascii") (its label aliases
  // Windows-1252, which would accept bytes this rule rejects).
  const advertisingName = String.fromCharCode(...nameBytes);
  if (!isValidPm5AdvertisingName(advertisingName)) {
    return unsupported("name is not a PM5 advertising name");
  }
  return { advertisingName };
}
```

Append to `app/domain/monitor/types.ts`:

```ts
/** Phase NF: opaque correlation for one hardware-entry attempt, minted with
 *  `crypto.randomUUID()` at the shared entry owner. Not authentication;
 *  compared only by exact equality. */
export type ConnectionAttemptId = string;

/** Phase NF: discovery narrowed to ONE live advertising name (the PM5 tag's
 *  decoded name). Never a prefix, never a cached name. */
export interface TargetedMonitorDiscoveryRequest {
  kind: "advertised-name";
  attemptId: ConnectionAttemptId;
  exactName: string;
}

export type MonitorDiscoveryRequest =
  | { kind: "picker"; attemptId: ConnectionAttemptId }
  | TargetedMonitorDiscoveryRequest;

/** Phase NF: a SEPARATE structural capability, deliberately not an option on
 *  `scan()` — an omitted option would mean today's broad picker, turning a
 *  dropped target into a privilege downgrade (spec, "Rejected approaches").
 *  A transport without this method cannot serve an advertised-name request
 *  and the session fails closed before any radio call. */
export interface TargetedScanTransport {
  scanTarget(
    request: TargetedMonitorDiscoveryRequest,
    signal: AbortSignal,
  ): Promise<DiscoveredMonitor[]>;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A minted attempt ID is a UUID v4 string; anything else (empty, absent,
 *  another shape) fails closed at every boundary that checks it. */
export function isValidAttemptId(value: unknown): value is ConnectionAttemptId {
  return typeof value === "string" && UUID_V4.test(value);
}

export function hasTargetedScan(
  t: Transport,
): t is Transport & TargetedScanTransport {
  return typeof (t as Partial<TargetedScanTransport>).scanTarget === "function";
}
```

Add `app/domain/monitor/types.test.ts` cases (append to the existing file if one exists; otherwise create):

```ts
import { describe, expect, it } from "vitest";
import { hasTargetedScan, isValidAttemptId, type Transport } from "./types.js";

describe("isValidAttemptId", () => {
  it("accepts a v4 UUID and rejects everything else", () => {
    expect(isValidAttemptId("2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f")).toBe(true);
    expect(isValidAttemptId("")).toBe(false);
    expect(isValidAttemptId(undefined)).toBe(false);
    expect(isValidAttemptId("2f1c9d2e-8a3b-1c7d-9e1f-0a1b2c3d4e5f")).toBe(false); // v1
    expect(isValidAttemptId("not-a-uuid")).toBe(false);
  });
});

describe("hasTargetedScan", () => {
  const base: Transport = {
    scan: () => Promise.resolve([]),
    connect: () => Promise.resolve(),
    write: () => Promise.resolve(),
    subscribe: () => () => undefined,
    disconnect: () => Promise.resolve(),
    onDisconnect: () => () => undefined,
  };
  it("is false without the method and true with it", () => {
    expect(hasTargetedScan(base)).toBe(false);
    expect(hasTargetedScan({ ...base, scanTarget: () => Promise.resolve([]) })).toBe(true);
    expect(hasTargetedScan({ ...base, scanTarget: 1 } as unknown as Transport)).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify pass**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/monitor/nfc.test.ts domain/monitor/types.test.ts
```

Expected: PASS (17 + 2 tests). Then `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Mutation probe (commit first)**

Commit, then mutate `record.tnf === PM5_NFC_TNF_EXTERNAL` → `record.tnf >= 1`: expected failure "rejects a wrong TNF". Mutate `end > PM5_ADVERTISING_NAME_MAX_BYTES` → `end > 64`: the 32-byte name test cannot fit in a 40-byte payload, so ALSO mutate `value.length > PM5_ADVERTISING_NAME_MAX_BYTES` in `isValidPm5AdvertisingName` → `> 64`: expected failure "accepts the fixture name and rejects the boundary cases" (`"x".repeat(28)` accepted). Restore with `git checkout -- domain/monitor/nfc.ts` after `git status` shows it clean.

- [ ] **Step 6: Commit**

```bash
git add domain/monitor/nfc.ts domain/monitor/nfc.test.ts domain/monitor/types.ts domain/monitor/types.test.ts src/monitor/nfc/fixtures.ts
git commit -m "feat(nfc): strict PM5 NFC parser and targeted-discovery types"
```

---

## Task 3: `scanTarget` in the Capacitor BLE transport

The riskiest task: a new radio operation, an operation tail shared with the manual picker, and a poison state. Written against a mocked `BleClient`, like the file's existing suite; the walk (Task 11) is the only radio proof.

**Files:**
- Modify: `app/src/monitor/transports/capacitorBle.ts`
- Modify: `app/src/monitor/transports/capacitorBle.test.ts`

**Interfaces:**
- Consumes `TargetedMonitorDiscoveryRequest`, `isValidAttemptId`, `isValidPm5AdvertisingName`.
- Produces `createCapacitorBleTransport(options?: { targetDeadlineMs?: number; collisionWindowMs?: number; now?: () => number; setTimeout?: typeof setTimeout; clearTimeout?: typeof clearTimeout })` returning `Transport & TargetedScanTransport & { onCharacteristicDegraded; describeLastScan }`; exported constants `TARGET_SCAN_DEADLINE_MS = 10_000`, `TARGET_COLLISION_WINDOW_MS = 1_000`; errors by name `TargetMonitorNotAdvertisingError`, `TargetAlreadyConnectedError`, `TargetMonitorAmbiguousError`, `TargetScanInterruptedError` (abort), `ScanCleanupFailedError`, `TargetedRequestInvalidError`; `resetOperationTailForTests()`.

- [ ] **Step 1: Write the failing tests**

Add to `capacitorBle.test.ts` (the file already mocks `@capacitor-community/bluetooth-le`; extend the mock object with `requestLEScan`, `stopLEScan`, `getConnectedDevices` if absent — check with `grep -n "requestLEScan\|stopLEScan\|getConnectedDevices" src/monitor/transports/capacitorBle.test.ts` first and reuse existing mock fields):

```ts
describe("scanTarget (Phase NF)", () => {
  const ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
  const NAME = "PM5 432331249 Row";
  const request = { kind: "advertised-name" as const, attemptId: ATTEMPT, exactName: NAME };

  let scanCallback: ((result: unknown) => void) | null = null;
  beforeEach(() => {
    resetOperationTailForTests();
    scanCallback = null;
    vi.mocked(BleClient.initialize).mockResolvedValue(undefined);
    vi.mocked(BleClient.isEnabled).mockResolvedValue(true);
    vi.mocked(BleClient.getConnectedDevices).mockResolvedValue([]);
    vi.mocked(BleClient.requestLEScan).mockImplementation(async (_opts, cb) => {
      scanCallback = cb as (result: unknown) => void;
    });
    vi.mocked(BleClient.stopLEScan).mockResolvedValue(undefined);
  });

  function transportWithClock() {
    const clock = { now: 0 };
    const timers: { at: number; fn: () => void; id: number }[] = [];
    let nextId = 1;
    const t = createCapacitorBleTransport({
      now: () => clock.now,
      setTimeout: ((fn: () => void, ms: number) => {
        const id = nextId++;
        timers.push({ at: clock.now + ms, fn, id });
        return id as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeout: ((id: unknown) => {
        const i = timers.findIndex((x) => x.id === id);
        if (i >= 0) timers.splice(i, 1);
      }) as typeof clearTimeout,
    });
    const advance = async (ms: number) => {
      clock.now += ms;
      for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
        if (timer.at <= clock.now) timer.fn();
        else timers.push(timer);
      }
      await Promise.resolve();
      await Promise.resolve();
    };
    return { t, advance };
  }

  it("rejects a pre-aborted signal without any native call", async () => {
    const { t } = transportWithClock();
    const ac = new AbortController();
    ac.abort();
    await expect(t.scanTarget(request, ac.signal)).rejects.toMatchObject({ name: "TargetScanInterruptedError" });
    expect(BleClient.initialize).not.toHaveBeenCalled();
    expect(BleClient.requestLEScan).not.toHaveBeenCalled();
  });

  it("rejects an invalid request (bad id, bad name, missing fields) before initialize", async () => {
    const { t } = transportWithClock();
    const signal = new AbortController().signal;
    for (const bad of [
      { ...request, attemptId: "" },
      { ...request, attemptId: "nope" },
      { ...request, exactName: "PM5" },
      { ...request, exactName: "pm5 x" },
      { ...request, exactName: "PM5 " + "x".repeat(28) },
      { kind: "advertised-name", attemptId: ATTEMPT } as unknown as typeof request,
      null as unknown as typeof request,
    ]) {
      await expect(t.scanTarget(bad, signal)).rejects.toMatchObject({ name: "TargetedRequestInvalidError" });
    }
    expect(BleClient.initialize).not.toHaveBeenCalled();
  });

  it("checks enabled after initialize and before the held-device query", async () => {
    const { t } = transportWithClock();
    const order: string[] = [];
    vi.mocked(BleClient.initialize).mockImplementation(async () => { order.push("initialize"); });
    vi.mocked(BleClient.isEnabled).mockImplementation(async () => { order.push("isEnabled"); return false; });
    vi.mocked(BleClient.getConnectedDevices).mockImplementation(async () => { order.push("held"); return []; });
    await expect(t.scanTarget(request, new AbortController().signal)).rejects.toMatchObject({ name: "BluetoothOffError" });
    expect(order).toEqual(["initialize", "isEnabled"]);
    expect(BleClient.requestLEScan).not.toHaveBeenCalled();
  });

  it("fails closed with TargetAlreadyConnectedError on a held exact-name device and never selects it", async () => {
    const { t } = transportWithClock();
    vi.mocked(BleClient.getConnectedDevices).mockResolvedValue([
      { deviceId: "held-1", name: "PM5 other" },
      { deviceId: "held-2", name: NAME },
    ]);
    await expect(t.scanTarget(request, new AbortController().signal)).rejects.toMatchObject({ name: "TargetAlreadyConnectedError" });
    expect(BleClient.requestLEScan).not.toHaveBeenCalled();
  });

  it("ignores a held device whose cached name differs and scans", async () => {
    const { t, advance } = transportWithClock();
    vi.mocked(BleClient.getConnectedDevices).mockResolvedValue([{ deviceId: "held-1", name: "PM5 other" }]);
    const p = t.scanTarget(request, new AbortController().signal);
    await advance(0);
    expect(BleClient.requestLEScan).toHaveBeenCalledWith({ allowDuplicates: true }, expect.any(Function));
    scanCallback!({ device: { deviceId: "d1", name: "cached" }, localName: NAME });
    await advance(1_000);
    await expect(p).resolves.toEqual([{ id: "d1", name: NAME }]);
    expect(BleClient.stopLEScan).toHaveBeenCalledTimes(1);
  });

  it("starts requestLEScan with no name or service filter", async () => {
    const { t, advance } = transportWithClock();
    const p = t.scanTarget(request, new AbortController().signal);
    await advance(0);
    const [opts] = vi.mocked(BleClient.requestLEScan).mock.calls[0]!;
    expect(opts).toEqual({ allowDuplicates: true });
    expect(opts).not.toHaveProperty("name");
    expect(opts).not.toHaveProperty("services");
    expect(opts).not.toHaveProperty("namePrefix");
    scanCallback!({ device: { deviceId: "d1" }, localName: NAME });
    await advance(1_000);
    await p;
  });

  it("matches only ScanResult.localName, never device.name", async () => {
    const { t, advance } = transportWithClock();
    const p = t.scanTarget(request, new AbortController().signal);
    await advance(0);
    scanCallback!({ device: { deviceId: "cached-only", name: NAME } });          // no localName: nonmatch
    scanCallback!({ device: { deviceId: "wrong", name: NAME }, localName: "PM5 other" });
    scanCallback!({ device: { deviceId: "d1", name: "stale" }, localName: NAME });
    await advance(1_000);
    await expect(p).resolves.toEqual([{ id: "d1", name: NAME }]);
  });

  it("deduplicates repeat callbacks from the same deviceId and drops malformed results", async () => {
    const { t, advance } = transportWithClock();
    const p = t.scanTarget(request, new AbortController().signal);
    await advance(0);
    scanCallback!(null);
    scanCallback!("string");
    scanCallback!({ device: null, localName: NAME });
    scanCallback!({ device: { deviceId: "" }, localName: NAME });
    scanCallback!({ device: { deviceId: "d1" }, localName: NAME });
    scanCallback!({ device: { deviceId: "d1" }, localName: NAME });
    await advance(1_000);
    await expect(p).resolves.toEqual([{ id: "d1", name: NAME }]);
  });

  it("fails closed with TargetMonitorAmbiguousError when two distinct devices carry the exact name inside the window", async () => {
    const { t, advance } = transportWithClock();
    const p = t.scanTarget(request, new AbortController().signal);
    await advance(0);
    scanCallback!({ device: { deviceId: "d1" }, localName: NAME });
    await advance(999);
    scanCallback!({ device: { deviceId: "d2" }, localName: NAME });
    await advance(1);
    await expect(p).rejects.toMatchObject({ name: "TargetMonitorAmbiguousError" });
    expect(BleClient.stopLEScan).toHaveBeenCalledTimes(1);
  });

  it("settles on the sole match exactly at the collision window boundary", async () => {
    const { t, advance } = transportWithClock();
    const p = t.scanTarget(request, new AbortController().signal);
    await advance(0);
    scanCallback!({ device: { deviceId: "d1" }, localName: NAME });
    await advance(999);
    expect(BleClient.stopLEScan).not.toHaveBeenCalled();
    await advance(1);
    await expect(p).resolves.toEqual([{ id: "d1", name: NAME }]);
  });

  it("times out to TargetMonitorNotAdvertisingError at 10_000 ms and stops the scan first", async () => {
    const { t, advance } = transportWithClock();
    const p = t.scanTarget(request, new AbortController().signal);
    await advance(0);
    await advance(9_999);
    expect(BleClient.stopLEScan).not.toHaveBeenCalled();
    await advance(1);
    await expect(p).rejects.toMatchObject({ name: "TargetMonitorNotAdvertisingError" });
    expect(BleClient.stopLEScan).toHaveBeenCalledTimes(1);
  });

  it("aborts to TargetScanInterruptedError only after stopLEScan resolves", async () => {
    const { t, advance } = transportWithClock();
    let releaseStop!: () => void;
    vi.mocked(BleClient.stopLEScan).mockImplementation(() => new Promise<void>((r) => { releaseStop = r; }));
    const ac = new AbortController();
    const p = t.scanTarget(request, ac.signal);
    await advance(0);
    let settled = false;
    void p.catch(() => { settled = true; });
    ac.abort();
    await advance(0);
    expect(settled).toBe(false);
    releaseStop();
    await advance(0);
    await expect(p).rejects.toMatchObject({ name: "TargetScanInterruptedError" });
  });

  it("an abort after the match still returns interrupted, never the device", async () => {
    const { t, advance } = transportWithClock();
    const ac = new AbortController();
    const p = t.scanTarget(request, ac.signal);
    await advance(0);
    scanCallback!({ device: { deviceId: "d1" }, localName: NAME });
    ac.abort();
    await advance(0);
    await expect(p).rejects.toMatchObject({ name: "TargetScanInterruptedError" });
  });

  it("stopLEScan rejection outranks a match, poisons the tail, and blocks the next scan without a native call", async () => {
    const { t, advance } = transportWithClock();
    vi.mocked(BleClient.stopLEScan).mockRejectedValue(new Error("boom"));
    const p = t.scanTarget(request, new AbortController().signal);
    await advance(0);
    scanCallback!({ device: { deviceId: "d1" }, localName: NAME });
    await advance(1_000);
    await expect(p).rejects.toMatchObject({ name: "ScanCleanupFailedError" });
    vi.mocked(BleClient.requestLEScan).mockClear();
    await expect(t.scanTarget(request, new AbortController().signal)).rejects.toMatchObject({ name: "ScanCleanupFailedError" });
    await expect(t.scan()).rejects.toMatchObject({ name: "ScanCleanupFailedError" });
    expect(BleClient.requestLEScan).not.toHaveBeenCalled();
    expect(BleClient.requestDevice).not.toHaveBeenCalled();
  });

  it("a second targeted scan waits for the first one's drain (stopLEScan completion)", async () => {
    const { t, advance } = transportWithClock();
    let releaseStop!: () => void;
    vi.mocked(BleClient.stopLEScan).mockImplementationOnce(() => new Promise<void>((r) => { releaseStop = r; }));
    const ac = new AbortController();
    const first = t.scanTarget(request, ac.signal);
    await advance(0);
    ac.abort();
    await advance(0);
    const second = t.scanTarget(request, new AbortController().signal);
    await advance(0);
    expect(BleClient.requestLEScan).toHaveBeenCalledTimes(1);
    releaseStop();
    await advance(0);
    await expect(first).rejects.toMatchObject({ name: "TargetScanInterruptedError" });
    await advance(0);
    expect(BleClient.requestLEScan).toHaveBeenCalledTimes(2);
    scanCallback!({ device: { deviceId: "d1" }, localName: NAME });
    await advance(1_000);
    await expect(second).resolves.toEqual([{ id: "d1", name: NAME }]);
  });

  it("a manual picker's outer timeout leaves the tail held until the raw picker promise settles", async () => {
    vi.useFakeTimers();
    try {
      const t = createCapacitorBleTransport();
      let settlePicker!: (v: { deviceId: string; name: string }) => void;
      vi.mocked(BleClient.requestDevice).mockImplementation(() => new Promise((r) => { settlePicker = r; }));
      const manual = t.scan();
      await vi.advanceTimersByTimeAsync(35_000);
      await expect(manual).rejects.toMatchObject({ name: "ScanTimeoutError" });
      const { t: t2 } = transportWithClock();
      const targeted = t2.scanTarget(request, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(0);
      expect(BleClient.requestLEScan).not.toHaveBeenCalled();
      settlePicker({ deviceId: "late", name: "PM5 late" });
      await vi.advanceTimersByTimeAsync(0);
      expect(BleClient.requestLEScan).toHaveBeenCalledTimes(1);
      void targeted.catch(() => undefined);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/monitor/transports/capacitorBle.test.ts
```

Expected: FAIL on `scanTarget is not a function` / missing exports.

- [ ] **Step 3: Implement**

In `capacitorBle.ts`, after the existing error classes add:

```ts
import {
  isValidAttemptId,
  type TargetedMonitorDiscoveryRequest,
  type TargetedScanTransport,
} from "../../../domain/monitor/types.js";
import { isValidPm5AdvertisingName } from "../../../domain/monitor/nfc.js";

/** Phase NF policy constants (spec §5 and this plan's Global Constraints):
 *  Gate -1 measured the first matching `requestLEScan` callback 103 ms after
 *  scan start and the next duplicate 1 ms later (`REPAIRED-NORMAL.md`).
 *  Both values are Ergomatic policy, not platform facts; tests pin them with
 *  independent literals, never these names. */
export const TARGET_SCAN_DEADLINE_MS = 10_000;
export const TARGET_COLLISION_WINDOW_MS = 1_000;

export class TargetMonitorNotAdvertisingError extends Error {
  constructor() { super("The named PM5 was not advertising within the targeted deadline."); this.name = "TargetMonitorNotAdvertisingError"; }
}
export class TargetAlreadyConnectedError extends Error {
  constructor() { super("A device with the exact PM5 name is already connected to this phone."); this.name = "TargetAlreadyConnectedError"; }
}
export class TargetMonitorAmbiguousError extends Error {
  constructor() { super("More than one device advertised the exact PM5 name."); this.name = "TargetMonitorAmbiguousError"; }
}
export class TargetScanInterruptedError extends Error {
  constructor() { super("The targeted scan was aborted."); this.name = "TargetScanInterruptedError"; }
}
export class ScanCleanupFailedError extends Error {
  constructor(raw: string) { super(`stopLEScan() failed: ${raw}`); this.name = "ScanCleanupFailedError"; }
}
export class TargetedRequestInvalidError extends Error {
  constructor(reason: string) { super(`Invalid targeted discovery request: ${reason}`); this.name = "TargetedRequestInvalidError"; }
}

// THE OPERATION TAIL (spec §5): one module-level FIFO shared by targeted
// scans and the manual picker. Each operation captures its predecessor's
// drain, installs its own, and only it can release its own. `poisoned`
// is set by a `stopLEScan()` rejection and is never cleared in-process.
let operationTail: Promise<void> = Promise.resolve();
let poisoned: ScanCleanupFailedError | null = null;

/** Test seam only: a fresh module tail between tests. */
export function resetOperationTailForTests(): void {
  operationTail = Promise.resolve();
  poisoned = null;
}

function captureTail(): { prior: Promise<void>; release: () => void } {
  const prior = operationTail;
  let release!: () => void;
  operationTail = new Promise<void>((resolve) => { release = resolve; });
  return { prior, release };
}

function validateTargetedRequest(request: unknown): TargetedMonitorDiscoveryRequest {
  if (typeof request !== "object" || request === null) throw new TargetedRequestInvalidError("not an object");
  const r = request as Partial<TargetedMonitorDiscoveryRequest>;
  if (r.kind !== "advertised-name") throw new TargetedRequestInvalidError("kind");
  if (!isValidAttemptId(r.attemptId)) throw new TargetedRequestInvalidError("attemptId");
  if (!isValidPm5AdvertisingName(r.exactName)) throw new TargetedRequestInvalidError("exactName");
  return { kind: "advertised-name", attemptId: r.attemptId, exactName: r.exactName };
}

/** Decodes one `requestLEScan` callback from `unknown`. A missing
 *  `localName` is a valid NONMATCH; an invalid `deviceId` is dropped before
 *  it can enter the deduplication set. */
function decodeScanResult(value: unknown): { deviceId: string; localName: string | null } | null {
  if (typeof value !== "object" || value === null) return null;
  const device = (value as { device?: unknown }).device;
  if (typeof device !== "object" || device === null) return null;
  const deviceId = (device as { deviceId?: unknown }).deviceId;
  if (typeof deviceId !== "string" || deviceId.length === 0) return null;
  const localName = (value as { localName?: unknown }).localName;
  return { deviceId, localName: typeof localName === "string" ? localName : null };
}
```

Extend the factory signature and body:

```ts
export interface CapacitorBleTransportOptions {
  targetDeadlineMs?: number;
  collisionWindowMs?: number;
  now?: () => number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

export function createCapacitorBleTransport(
  options: CapacitorBleTransportOptions = {},
): Transport & TargetedScanTransport & { onCharacteristicDegraded(...): () => void; describeLastScan(): string | null } {
  const deadlineMs = options.targetDeadlineMs ?? TARGET_SCAN_DEADLINE_MS;
  const windowMs = options.collisionWindowMs ?? TARGET_COLLISION_WINDOW_MS;
  const schedule = options.setTimeout ?? setTimeout;
  const unschedule = options.clearTimeout ?? clearTimeout;
  // ... existing locals unchanged ...
```

The manual `scan()` changes in exactly two places: it rejects with `poisoned` before any work, and it attaches the tail to the RAW pipeline (not the timeout race):

```ts
    async scan(): Promise<DiscoveredMonitor[]> {
      if (poisoned !== null) throw poisoned;
      const { prior, release } = captureTail();
      await prior;
      if (poisoned !== null) { release(); throw poisoned; }
      const pipeline = (async (): Promise<DiscoveredMonitor[]> => {
        // ... existing body, byte for byte ...
      })();
      // The drain follows the RAW picker promise: `stopLEScan()` cannot
      // dismiss the native sheet, so a UI timeout may reject while the
      // rower still holds the sheet; every later scan waits here until
      // Cancel or a pick settles it (spec §5).
      void pipeline.then(release, release);
      return raceScanTimeout(pipeline);
    },
```

Then the new method:

```ts
    async scanTarget(
      requestValue: TargetedMonitorDiscoveryRequest,
      signal: AbortSignal,
    ): Promise<DiscoveredMonitor[]> {
      if (poisoned !== null) throw poisoned;
      const request = validateTargetedRequest(requestValue);
      if (signal.aborted) throw new TargetScanInterruptedError();
      const { prior, release } = captureTail();
      // Terminal/abort owner installed before any await.
      let settled = false;
      let scanning = false;
      let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
      let windowTimer: ReturnType<typeof setTimeout> | null = null;
      const seen = new Set<string>();
      const matches: { id: string; name: string }[] = [];
      let finish!: (outcome: { ok: DiscoveredMonitor[] } | { err: Error }) => void;
      const outcome = new Promise<{ ok: DiscoveredMonitor[] } | { err: Error }>((resolve) => { finish = resolve; });

      const settle = (result: { ok: DiscoveredMonitor[] } | { err: Error }): void => {
        if (settled) return;
        settled = true;
        if (deadlineTimer !== null) unschedule(deadlineTimer);
        if (windowTimer !== null) unschedule(windowTimer);
        const stop = scanning ? BleClient.stopLEScan() : Promise.resolve();
        stop.then(
          () => finish(result),
          (err: unknown) => {
            // Cleanup failure outranks everything (spec §5): nothing
            // connects, the tail is poisoned for the process lifetime.
            poisoned = new ScanCleanupFailedError(err instanceof Error ? err.message : String(err));
            finish({ err: poisoned });
          },
        );
      };
      const onAbort = (): void => settle({ err: new TargetScanInterruptedError() });
      signal.addEventListener("abort", onAbort, { once: true });

      try {
        await prior;
        if (signal.aborted) throw new TargetScanInterruptedError();
        if (poisoned !== null) throw poisoned;
        await ensureInitialized();
        if (signal.aborted) throw new TargetScanInterruptedError();
        if (!(await BleClient.isEnabled())) throw new BluetoothOffError("Bluetooth is powered off.");
        if (signal.aborted) throw new TargetScanInterruptedError();
        const held = await BleClient.getConnectedDevices([ROWING_SERVICE_UUID, CONTROL_SERVICE_UUID]);
        if (signal.aborted) throw new TargetScanInterruptedError();
        // Cached `name` is used ONLY to refuse, never to select.
        if (held.some((d) => d.name === request.exactName)) throw new TargetAlreadyConnectedError();
        if (signal.aborted) throw new TargetScanInterruptedError();
        lastScanOutcome = "targeted scan by exact advertised name";
        scanning = true;
        await BleClient.requestLEScan({ allowDuplicates: true }, (raw: unknown) => {
          if (settled) return;
          const result = decodeScanResult(raw);
          if (result === null) return;
          if (result.localName !== request.exactName) return;
          if (seen.has(result.deviceId)) return;
          seen.add(result.deviceId);
          matches.push({ id: result.deviceId, name: request.exactName });
          if (matches.length === 1) {
            if (deadlineTimer !== null) unschedule(deadlineTimer);
            deadlineTimer = null;
            windowTimer = schedule(() => settle({ ok: [matches[0]!] }), windowMs);
          } else {
            settle({ err: new TargetMonitorAmbiguousError() });
          }
        });
        deadlineTimer = schedule(() => settle({ err: new TargetMonitorNotAdvertisingError() }), deadlineMs);
      } catch (err: unknown) {
        settle({ err: err instanceof Error ? err : new Error(String(err)) });
      }
      const result = await outcome;
      signal.removeEventListener("abort", onAbort);
      release();
      if ("err" in result) throw result.err;
      return result.ok;
    },
```

Note the `requestLEScan` mock resolves immediately; real `BleClient.requestLEScan` resolves once the native scan is started, so `deadlineTimer` starts after the scan is live. If a callback fires before `await requestLEScan` returns (possible on a real device), the deadline timer is then scheduled after a match already exists: guard it — replace the `deadlineTimer = schedule(...)` line with `if (matches.length === 0 && !settled) deadlineTimer = schedule(...)`.

- [ ] **Step 4: Run to verify pass**

Same command as Step 2. Expected: PASS, plus the whole file's existing tests still green. Then `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Mutations (commit first; each restored before the next)**

| Mutation | Expected failing test |
| --- | --- |
| `result.localName !== request.exactName` → `result.localName !== request.exactName && device.name !== request.exactName` (use `device.name`) | "matches only ScanResult.localName" |
| `!==` → `!startsWith` prefix match | "matches only ScanResult.localName" (the `PM5 other` device fails it) — add a `"PM5 432331249 Rower"` result to that test if it does not |
| `matches.length === 1` branch → settle immediately on the first match | "settles on the sole match exactly at the collision window boundary" (settles at 0) and the ambiguity test |
| remove `seen.has` check | "deduplicates repeat callbacks" (ambiguous on the duplicate) |
| remove the `held.some` refusal | "fails closed with TargetAlreadyConnectedError" |
| move `isEnabled` after `getConnectedDevices` | "checks enabled after initialize and before the held-device query" |
| drop `await prior` | "a second targeted scan waits for the first one's drain" |
| swallow `stopLEScan` rejection (`finish(result)` in both arms) | "stopLEScan rejection outranks a match" |
| attach the manual drain to `raceScanTimeout(pipeline)` instead of `pipeline` | "a manual picker's outer timeout leaves the tail held" |
| delete one `if (signal.aborted) throw` (the one before `requestLEScan`) | add the test: abort while `getConnectedDevices` is pending → `requestLEScan` must not be called |

Record each failure message in the PR record.

- [ ] **Step 6: Commit**

```bash
git add src/monitor/transports/capacitorBle.ts src/monitor/transports/capacitorBle.test.ts
git commit -m "feat(nfc): fail-closed exact-name scanTarget with a shared BLE operation tail"
```

---

## Task 4: Every transport carries an explicit targeted-scan behaviour

**Files:**
- Modify: `app/src/monitor/transports/fake.ts`, `replay.ts`, `recording.ts`, `holdOpen.ts`, `liveness.ts`, `index.ts` (`autoTicking`), `webBluetooth.ts` (comment only: no capability by design)
- Modify: `app/src/adapters/monitorTransport.test.ts` (production composition proof)
- Create: `app/scripts/transport-census.sh` (the census SCRIPT; the plan carries no census numbers)
- Modify tests: `fake.test.ts`, `replay.test.ts`, `recording.test.ts`, `holdOpen.test.ts`, `liveness.test.ts`, `index.test.ts`

**Interfaces:**
- `FakeScript` gains `targetedScan?: "match" | "not-advertising" | "ambiguous" | "already-connected"` (default `"match"` when `deviceName` equals `exactName`, otherwise `"not-advertising"`).
- `createFakeTransport(script)` returns `Transport & TargetedScanTransport & { … }`.
- Decorators: `withLiveness`, `createRecordingTransport`, `createHoldOpenTransport`, `autoTicking` forward `scanTarget` **only if the inner has it** and otherwise omit it (so `hasTargetedScan` stays false on a web transport). Recording records `{ kind: "scan", devices }` for a targeted scan too (the observable is the devices found; the request is not persisted). Replay's `scanTarget` returns the recorded scan's devices filtered by `exactName`, or throws `TargetMonitorNotAdvertisingError`-shaped (`name` only, replay does not import capacitorBle) when none match.

- [ ] **Step 1: Write the census script**

`app/scripts/transport-census.sh`:

```bash
#!/usr/bin/env bash
# Phase NF: every Transport implementation/decorator/factory must have an
# explicit scanTarget stance. Prints one line per site; CI-free, run by
# hand and pasted into the PR record as base-vs-head.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== implementations and decorators (scan() definers)"
grep -rn "async scan()\|scan(): Promise<DiscoveredMonitor\[\]>\|  scan,$" src/monitor/transports src/adapters --include=*.ts | grep -v "\.test\.ts"
echo "== scanTarget stances"
grep -rn "scanTarget" src/monitor/transports src/adapters --include=*.ts | grep -v "\.test\.ts"
echo "== call sites"
grep -rn "\.scan()\|\.scanTarget(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -v "src/monitor/transports/"
```

Run it on the base (`git stash` is forbidden; run against `main` with `git worktree`-free `git show main:...`? No: run once BEFORE editing on this branch and save the output to the scratchpad, then again after; paste both in the PR record).

- [ ] **Step 2: Write the failing tests**

`fake.test.ts` additions:

```ts
describe("scanTarget (Phase NF)", () => {
  const ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
  it("resolves the scripted device when the exact name matches, without opening scan()", async () => {
    const fake = createFakeTransport({ program, deviceName: "PM5 432331249 Row" });
    const found = await fake.scanTarget({ kind: "advertised-name", attemptId: ATTEMPT, exactName: "PM5 432331249 Row" }, new AbortController().signal);
    expect(found).toEqual([{ id: expect.any(String), name: "PM5 432331249 Row" }]);
  });
  it("rejects by name when the exact name differs (prefix is not enough)", async () => {
    const fake = createFakeTransport({ program, deviceName: "PM5 432331249 Row" });
    await expect(fake.scanTarget({ kind: "advertised-name", attemptId: ATTEMPT, exactName: "PM5 432331249" }, new AbortController().signal))
      .rejects.toMatchObject({ name: "TargetMonitorNotAdvertisingError" });
  });
  it("honours the scripted failure kinds", async () => {
    for (const [kind, name] of [
      ["ambiguous", "TargetMonitorAmbiguousError"],
      ["already-connected", "TargetAlreadyConnectedError"],
      ["not-advertising", "TargetMonitorNotAdvertisingError"],
    ] as const) {
      const fake = createFakeTransport({ program, deviceName: "PM5 1", targetedScan: kind });
      await expect(fake.scanTarget({ kind: "advertised-name", attemptId: ATTEMPT, exactName: "PM5 1" }, new AbortController().signal))
        .rejects.toMatchObject({ name });
    }
  });
  it("rejects a pre-aborted signal as interrupted", async () => {
    const fake = createFakeTransport({ program, deviceName: "PM5 1" });
    const ac = new AbortController(); ac.abort();
    await expect(fake.scanTarget({ kind: "advertised-name", attemptId: ATTEMPT, exactName: "PM5 1" }, ac.signal))
      .rejects.toMatchObject({ name: "TargetScanInterruptedError" });
  });
});
```

Decorator tests (one shape, repeated in `liveness.test.ts`, `recording.test.ts`, `holdOpen.test.ts`, `index.test.ts` for `autoTicking`):

```ts
it("forwards scanTarget with the SAME request object and signal when the inner has it, and omits it otherwise", async () => {
  const request = { kind: "advertised-name" as const, attemptId: "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f", exactName: "PM5 1" };
  const signal = new AbortController().signal;
  const scanTarget = vi.fn(async () => [{ id: "d", name: "PM5 1" }]);
  const withCap = wrap({ ...stubTransport(), scanTarget });
  await withCap.scanTarget!(request, signal);
  expect(scanTarget.mock.calls[0]![0]).toBe(request);
  expect(scanTarget.mock.calls[0]![1]).toBe(signal);
  expect(hasTargetedScan(wrap(stubTransport()))).toBe(false);
});
```

`adapters/monitorTransport.test.ts` — the production-composed proof: mock `../monitor/transports/capacitorBle` so `createCapacitorBleTransport` returns a stub with a `scanTarget` spy, force `isNative()` true (the file already mocks `../platform`; verify with `grep -n "vi.mock" src/adapters/monitorTransport.test.ts`), call `defaultTransport(deps)`, await it, call `scanTarget(request, signal)` on the RESULT (which is `withLiveness(...)`), and assert the spy received the identical `request` and `signal` references. On the web arm assert `hasTargetedScan(result)` is `false`.

`replay.test.ts`: a recording with a `scan` event listing `[{id:"a",name:"PM5 1"},{id:"b",name:"PM5 2"}]` → `scanTarget(exactName "PM5 2")` resolves `[{id:"b",name:"PM5 2"}]`; `exactName "PM5 3"` rejects with `name: "TargetMonitorNotAdvertisingError"`.

- [ ] **Step 3: Run to verify failure**, then **Step 4: implement**

`fake.ts` (inside `createFakeTransport`, beside `scan()`):

```ts
    async scanTarget(request, signal) {
      if (signal.aborted) { const e = new Error("aborted"); e.name = "TargetScanInterruptedError"; throw e; }
      const kind = script.targetedScan ?? (request.exactName === deviceName ? "match" : "not-advertising");
      const fail = (name: string): never => { const e = new Error(name); e.name = name; throw e; };
      switch (kind) {
        case "match": return [{ id: FAKE_DEVICE_ID, name: deviceName }];
        case "not-advertising": return fail("TargetMonitorNotAdvertisingError");
        case "ambiguous": return fail("TargetMonitorAmbiguousError");
        case "already-connected": return fail("TargetAlreadyConnectedError");
      }
    },
```

(`FAKE_DEVICE_ID` and `deviceName` are whatever `scan()` already returns in that file; reuse the same values so `connect(id)` accepts them.)

Decorators — the same shape in each (`liveness.ts` shown; `recording.ts` additionally records `{ kind: "scan", devices }` on success; `holdOpen.ts` and `autoTicking` identical):

```ts
    ...(hasTargetedScan(inner)
      ? {
          async scanTarget(request: TargetedMonitorDiscoveryRequest, signal: AbortSignal) {
            return inner.scanTarget(request, signal);
          },
        }
      : {}),
```

`replay.ts`:

```ts
  async function scanTarget(request: TargetedMonitorDiscoveryRequest): Promise<DiscoveredMonitor[]> {
    const all = await scan();
    const exact = all.filter((d) => d.name === request.exactName);
    if (exact.length === 0) { const e = new Error("not advertising in this recording"); e.name = "TargetMonitorNotAdvertisingError"; throw e; }
    return exact;
  }
```

- [ ] **Step 5: Run all transport tests, typecheck, lint; run the census script and save its output**
- [ ] **Step 6: Mutations** — in `liveness.ts` drop the `scanTarget` forwarding: the composition test fails (`hasTargetedScan` false on native). In `fake.ts` change `===` to `startsWith`: the prefix test fails.
- [ ] **Step 7: Commit** `feat(nfc): targeted-scan capability across fake, replay and every transport decorator`

---

## Task 5: The NFC reader port, native arm, scripted reader, trace, haptics, lifecycle read

**Files:**
- Create: `app/src/monitor/nfc/connectionAttemptTrace.ts` (+ test), `app/src/monitor/nfc/nfcBridge.ts` (+ test), `app/src/monitor/nfc/scriptedNfcReader.ts` (+ test), `app/src/adapters/nfcReader.ts` (+ test), `app/src/native/nfc.ts`, `app/src/adapters/haptics.ts` (+ test), `app/src/native/haptics.ts`
- Modify: `app/src/adapters/appLifecycle.ts` (+ test), `app/src/native/appLifecycle.ts`, `app/package.json` (`@capacitor/haptics@8.0.2`), `app/ios/App/CapApp-SPM/Package.swift` (via `npx cap sync ios`, tracked), `app/src/monitor/transports/index.ts` (`window.__nfcScript__` global), `app/scripts/dist-grep.sh`

**Interfaces:** as in the Interfaces section. `scriptedNfcReader.ts`:

```ts
export interface NfcScript {
  capability: NfcCapability;
  /** What the reader delivers for the attempt: records, or an ending. */
  outcome:
    | { kind: "records"; records: readonly NfcRecord[] }
    | { kind: "cancelled" }
    | { kind: "timeout" }
    | { kind: "invalidated"; cause?: "multipleTags" | "tagFailure" }
    | { kind: "start-failed" };
  /** Optional: deliver the outcome only when this resolves (tests use it to
   *  interleave abort/background). */
  gate?: Promise<void>;
}
export function createScriptedNfcReader(script: NfcScript): NfcReader & { starts(): number; stops(): readonly string[] };
```

Trace test: kinds are a closed set (a `Set` of the union's literals compared to an independent literal array), capacity 200 (oldest dropped), `complete()` publishes `latestConnectionAttemptTrace()` and a second completed trace replaces it, entries carry no attempt ID/name (a test records `detail` and asserts the entry's detail is the string given — the redaction rule is enforced by the KINDS being fixed and callers never passing names; add a lint-level guard: `record()` throws if `detail` contains the substring `PM5 ` — the only PM5-shaped string a caller could leak — and the test pins it).

Bridge test (`nfcBridge.test.ts`): `decodeNfcEvent(value, expectedAttemptId)` returns `{ attemptId, records }` for the fixture wrapped as `{ attemptId, type: "ndef", tag: { ndefMessage: [...] } }`; returns `{ error: "stale-id" }` for a different attempt ID; `{ error: "invalid" }` for null, non-object, missing attemptId, empty attemptId, non-array `ndefMessage`, record with `tnf: 1.5`, `type: [256]`, `payload: [-1]`, `payload: "abc"`, `type: null`.

`adapters/nfcReader.ts` behaviour tests: on web (`isNative()` false) with no script → `capability()` is `"unsupported"` and `readOne` rejects `NfcUnsupportedError` without importing anything native; with `window.__nfcScript__` set AND the fake gate open (`import.meta.env.DEV` is true under Vitest) → the scripted reader is used. Native arm is `v8 ignore`d like every `src/native/**` file, but `src/native/nfc.ts` gets ONE desk test that mocks `@capgo/capacitor-nfc` and `@capacitor/app` (same shape as `src/native/appLifecycle.test.ts`) pinning: listeners registered BEFORE `startScanning`; `startScanning` called with `{ attemptId, alertMessage, iosSessionType: "ndef", invalidateAfterFirstRead: false }`; a `nfcSessionEnd` with `cause: "multipleTags"` rejects `NfcInvalidatedError` with `cause === "multipleTags"`; `reason: "userCancelled"` → `NfcCancelledError`; `sessionTimeout` → `NfcTimeoutError`; `invalidated` without cause → `NfcInvalidatedError` with `cause` undefined; an `nfcEvent` whose `attemptId` differs is dropped (`stale-id-dropped` traced) and the read keeps waiting; abort after start → `stopScanning({ attemptId })` awaited, then `NfcAbortError`; abort while `addListener` is still pending → the handle resolves, is removed, and `startScanning` is never called; `App.getState()` returning `isActive: false` immediately before start → `NfcAbortError` with `foreground-abort` traced and no `startScanning`.

- [ ] **Step 1: Add the haptics dependency and sync**

```bash
cd app && pnpm add @capacitor/haptics@8.0.2 && npx cap sync ios
git status --short ios/App/CapApp-SPM/Package.swift   # expected: modified (CapacitorHaptics package added)
```

- [ ] **Step 2: Write the failing tests** (trace, bridge, scripted reader, adapter, native desk test, haptics adapter, lifecycle current-state).

Lifecycle: `currentAppLifecycleState()` — web returns `"foreground"` when `document.visibilityState === "visible"`, else `"background"` (Minor 9 made the LISTENER a no-op on web; the READ stays honest because the NFC reader must not start in a hidden tab under the scripted seam either); native reads `App.getState().isActive` → `"foreground"`/`"background"`. Test both arms (`appLifecycle.test.ts` already mocks `../platform` and `@capacitor/app`; extend).

Haptics: `adapters/haptics.ts` exports `successHaptic(): Promise<void>`; web arm resolves without touching anything; native arm dynamic-imports `../native/haptics` which calls `Haptics.notification({ type: NotificationType.Success })`. Test: web resolves; native arm is `v8 ignore`d with one mock-pinned desk test of the call shape.

- [ ] **Step 3: Implement**

`app/src/native/nfc.ts` (the only importer of `@capgo/capacitor-nfc`):

```ts
/* v8 ignore start -- thin plugin wrapper; the desk test next door pins the
 * call shape, the walk proves the radio. */
import { App } from "@capacitor/app";
import { CapacitorNfc } from "@capgo/capacitor-nfc";
import type { NfcRecord } from "../../domain/monitor/nfc.js";
import {
  NfcAbortError,
  NfcCancelledError,
  NfcInvalidatedError,
  NfcStartError,
  NfcTimeoutError,
  type NfcReadOptions,
  type NfcReader,
} from "../adapters/nfcReader";
import { decodeNfcEvent } from "../monitor/nfc/nfcBridge";

type Remove = () => Promise<void>;

export function createNativeNfcReader(): NfcReader {
  return {
    async capability() {
      return (await CapacitorNfc.isSupported()).supported ? "supported" : "unsupported";
    },
    async readOne({ attemptId, alertMessage, signal, trace }: NfcReadOptions): Promise<readonly NfcRecord[]> {
      if (signal.aborted) throw new NfcAbortError();
      let settled = false;
      const removers: Remove[] = [];
      let started = false;
      let resolveRead!: (records: readonly NfcRecord[]) => void;
      let rejectRead!: (err: Error) => void;
      const read = new Promise<readonly NfcRecord[]>((resolve, reject) => { resolveRead = resolve; rejectRead = reject; });
      const finish = (err: Error | null, records?: readonly NfcRecord[]): void => {
        if (settled) return;
        settled = true;
        if (err) rejectRead(err); else resolveRead(records!);
      };
      const stopAndClean = async (): Promise<void> => {
        if (started) {
          try { await CapacitorNfc.stopScanning({ attemptId }); } catch { /* the ending event is the authority */ }
        }
        await Promise.all(removers.splice(0).map((r) => r().catch(() => undefined)));
      };
      const onAbort = (): void => { trace.record("abort-requested"); finish(new NfcAbortError()); };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        // Listeners BEFORE start: Capacitor retains events while JS listeners
        // are absent, and a retained event for another attempt must be
        // rejected by ID, never accepted by arrival.
        const eventHandle = await CapacitorNfc.addListener("nfcEvent", (value: unknown) => {
          const decoded = decodeNfcEvent(value, attemptId);
          if ("error" in decoded) {
            trace.record(decoded.error === "stale-id" ? "stale-id-dropped" : "invalid-native-event");
            return;
          }
          trace.record("tag-event");
          finish(null, decoded.records);
        });
        removers.push(() => eventHandle.remove());
        if (signal.aborted) throw new NfcAbortError();
        const endHandle = await CapacitorNfc.addListener("nfcSessionEnd", (value: unknown) => {
          const v = value as { attemptId?: unknown; reason?: unknown; cause?: unknown } | null;
          if (!v || v.attemptId !== attemptId) { trace.record("stale-id-dropped"); return; }
          const cause = v.cause === "multipleTags" || v.cause === "tagFailure" ? v.cause : undefined;
          if (v.reason === "userCancelled") finish(new NfcCancelledError());
          else if (v.reason === "sessionTimeout") finish(new NfcTimeoutError());
          else finish(new NfcInvalidatedError(cause));
        });
        removers.push(() => endHandle.remove());
        if (signal.aborted) throw new NfcAbortError();
        if (!(await App.getState()).isActive) { trace.record("foreground-abort"); throw new NfcAbortError(); }
        if (signal.aborted) throw new NfcAbortError();
        trace.record("session-requested");
        started = true;
        try {
          await CapacitorNfc.startScanning({ attemptId, alertMessage, iosSessionType: "ndef", invalidateAfterFirstRead: false });
        } catch (err: unknown) {
          trace.record("start-failed");
          throw new NfcStartError(err instanceof Error ? err.message : String(err));
        }
        return await read;
      } catch (err: unknown) {
        finish(err instanceof Error ? err : new Error(String(err)));
        return await read;
      } finally {
        signal.removeEventListener("abort", onAbort);
        await stopAndClean();
        trace.record("reader-settled");
      }
    },
  };
}
/* v8 ignore stop */
```

`app/src/adapters/nfcReader.ts`:

```ts
import type { ConnectionAttemptId } from "../../domain/monitor/types.js";
import type { NfcRecord } from "../../domain/monitor/nfc.js";
import { isNative } from "../platform";
import type { ConnectionAttemptTrace } from "../monitor/nfc/connectionAttemptTrace";

export type NfcCapability = "supported" | "unsupported";
export interface NfcReadOptions { attemptId: ConnectionAttemptId; alertMessage: string; signal: AbortSignal; trace: ConnectionAttemptTrace }
export interface NfcReader {
  capability(): Promise<NfcCapability>;
  readOne(options: NfcReadOptions): Promise<readonly NfcRecord[]>;
}

export class NfcCancelledError extends Error { constructor() { super("The rower cancelled the NFC sheet."); this.name = "NfcCancelledError"; } }
export class NfcTimeoutError extends Error { constructor() { super("No NFC tag was detected before the system timeout."); this.name = "NfcTimeoutError"; } }
export class NfcInvalidatedError extends Error {
  constructor(public readonly cause?: "multipleTags" | "tagFailure") { super("The NFC reader session was invalidated."); this.name = "NfcInvalidatedError"; }
}
export class NfcAbortError extends Error { constructor() { super("The NFC attempt was aborted."); this.name = "NfcAbortError"; } }
export class NfcStartError extends Error { constructor(raw: string) { super(`NFC start failed: ${raw}`); this.name = "NfcStartError"; } }
export class NfcUnsupportedError extends Error { constructor() { super("NFC is not available on this surface."); this.name = "NfcUnsupportedError"; } }

const unsupportedReader: NfcReader = {
  capability: () => Promise.resolve("unsupported"),
  readOne: () => Promise.reject(new NfcUnsupportedError()),
};

/** THE platform conditional for NFC. Native → the Capacitor reader, reached
 *  by dynamic import so `@capgo/capacitor-nfc` never lands in the web
 *  bundle. Web → the scripted reader when the fake gate is open AND a test
 *  set `window.__nfcScript__`; otherwise `unsupported` (no button). */
export function resolveNfcReader(): NfcReader {
  if (isNative()) {
    const native = import("../native/nfc").then(({ createNativeNfcReader }) => createNativeNfcReader());
    return {
      capability: () => native.then((r) => r.capability()),
      readOne: (o) => native.then((r) => r.readOne(o)),
    };
  }
  const fakeGateOpen = import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1";
  if (fakeGateOpen) {
    const script = window.__nfcScript__;
    if (script) {
      const scripted = import("../monitor/nfc/scriptedNfcReader").then(({ createScriptedNfcReader }) => createScriptedNfcReader(script));
      return {
        capability: () => scripted.then((r) => r.capability()),
        readOne: (o) => scripted.then((r) => r.readOne(o)),
      };
    }
  }
  return unsupportedReader;
}
```

Add `__nfcScript__?: NfcScript` to the `declare global { interface Window { … } }` block in `transports/index.ts` (the one existing place these globals are declared), with the same "set by an e2e test's `addInitScript`, never by product code" note. Add the dist-grep needles: the scripted reader file's header carries the literal `scripted NFC reader (dev harness)`; add `"CapacitorNfc"` (the plugin's `registerPlugin('CapacitorNfc'` literal) and `"Haptics"` (the haptics plugin's `registerPlugin('Haptics'` literal) — before adding, prove each needle can go red: temporarily add a static `import "@capgo/capacitor-nfc"` to `src/main.tsx`, `pnpm build`, run `pnpm dist:grep` and see it FOUND; revert.

- [ ] **Step 4: Run tests, typecheck, lint, build, dist:grep** (expect green; `dist:grep` clean with the three new needles).
- [ ] **Step 5: Mutations** — in `native/nfc.ts` move the `nfcEvent` `addListener` after `startScanning` (the desk test's ordering assertion fails); drop the `App.getState()` read (the foreground test fails); in `nfcBridge.ts` accept `tnf` 1.5 (bridge test fails); in the trace delete the `PM5 ` guard (trace test fails).
- [ ] **Step 6: Commit** `feat(nfc): NFC reader port, native arm, scripted reader, attempt trace, haptics`

---

## Task 6: Staged retire keyed by attempt ID, and the mount lease

**Files:**
- Modify: `app/src/monitor/handoffStore.ts` (+ test)
- Create: `app/src/monitor/mountLease.ts` (+ test)

**Interfaces:**
- `stageRetire(set, attemptId: ConnectionAttemptId)`; `takeStagedRetire()` unchanged (returns the set; the consumer at `armed` does not need the ID); `discardStagedRetire(attemptId: ConnectionAttemptId)` — discards ONLY if the staged attempt ID equals the argument (compare-by-ID; a late A cleanup cannot discard B's authorization); `stagedRetireAttemptId(): ConnectionAttemptId | null` (test accessor).
- `mountLease.ts`: `claimMountLease(attemptId)` → `{ release(): void }` where `release` queues a microtask; `reclaimMountLease(attemptId)` cancels a pending release for the SAME id only; `onMountLeaseLost(attemptId, cb)` runs `cb` when a release commits without a reclaim. Tests: setup → cleanup → setup within one microtask keeps the lease (StrictMode); cleanup without reclaim commits the loss; a reclaim under a different id does not save it; no duration threshold anywhere (the test uses no fake timers).

- [ ] **Step 1: Write failing tests**, **Step 2: run red**, **Step 3: implement**:

```ts
// handoffStore.ts (replace the three functions)
let stagedRetireSet: readonly { sessionKey: string; revision: number }[] = [];
let stagedRetireAttempt: ConnectionAttemptId | null = null;

export function stageRetire(set, attemptId: ConnectionAttemptId): void {
  if (stagedRetireSet.length > 0) emit({ kind: "stage-retire-replaced", discarded: stagedRetireSet });
  stagedRetireSet = set;
  stagedRetireAttempt = attemptId;
}
export function takeStagedRetire() { const set = stagedRetireSet; stagedRetireSet = []; stagedRetireAttempt = null; return set; }
export function discardStagedRetire(attemptId: ConnectionAttemptId): void {
  if (stagedRetireAttempt !== attemptId) return; // late A cannot discard B
  const set = takeStagedRetire();
  if (set.length > 0) emit({ kind: "staged-retire-discarded", discarded: set });
}
export function stagedRetireAttemptId(): ConnectionAttemptId | null { return stagedRetireAttempt; }
```

```ts
// mountLease.ts
import type { ConnectionAttemptId } from "../../domain/monitor/types.js";
const pendingRelease = new Map<ConnectionAttemptId, () => void>();
const lost = new Map<ConnectionAttemptId, () => void>();

export function onMountLeaseLost(attemptId: ConnectionAttemptId, cb: () => void): void { lost.set(attemptId, cb); }
export function reclaimMountLease(attemptId: ConnectionAttemptId): boolean {
  const cancel = pendingRelease.get(attemptId);
  if (!cancel) return false;
  cancel(); pendingRelease.delete(attemptId); return true;
}
export function claimMountLease(attemptId: ConnectionAttemptId): { release(): void } {
  reclaimMountLease(attemptId);
  return {
    release() {
      let cancelled = false;
      pendingRelease.set(attemptId, () => { cancelled = true; });
      queueMicrotask(() => {
        if (cancelled) return;
        pendingRelease.delete(attemptId);
        const cb = lost.get(attemptId); lost.delete(attemptId);
        cb?.();
      });
    },
  };
}
export function resetMountLeasesForTests(): void { pendingRelease.clear(); lost.clear(); }
```

Update the two existing callers of `discardStagedRetire()` in `useMonitorSession.ts` (`cancel()` and the `programDropped` reset) to pass the session's current attempt ID (`attemptIdRef.current`, added in Task 7); `ConnectAction`'s call moves into `ConnectionEntry` (Task 8). Until Task 7 lands, make the parameter required and fix both call sites in THIS task with `attemptIdRef` introduced as a plain `useRef<ConnectionAttemptId | null>(null)` that Task 7 then populates; discarding with `null` is a no-op, which is the pre-NF behaviour for a session that never received a request — record this as a two-task seam in the commit message.

- [ ] **Step 4: green, typecheck, lint; Step 5: mutation** — drop the `stagedRetireAttempt !== attemptId` guard: the "late A cannot discard B" test fails; in `mountLease` remove `if (cancelled) return`: the StrictMode test fails.
- [ ] **Step 6: Commit** `feat(nfc): attempt-keyed staged retire and an identity-bound mount lease`

---

## Task 7: `useMonitorSession.connect(request)` and the interstitial

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` (+ test), `app/src/workout/ConnectedInterstitial.tsx` (+ test)

**Interfaces:**
- `connect(request?: MonitorDiscoveryRequest): Promise<void>`; `MonitorSession.attemptId: ConnectionAttemptId | null` (published for diagnostics/tests).
- `ConnectedError.reason` union gains the five targeted reasons; `mapTargetedFailure(err)` maps by `err.name`: `TargetMonitorNotAdvertisingError` → `target-not-advertising` / `Open Connect Device on this PM5, then try again.`; `TargetAlreadyConnectedError` → `target-already-connected` / `End this PM5's current connection, then try again.`; `TargetMonitorAmbiguousError` → `target-ambiguous` / `More than one PM5 has this name. Use Connect.`; `TargetScanInterruptedError` → `target-interrupted` / `Connection interrupted. Try again.`; `ScanCleanupFailedError` → `scan-cleanup-failed` / `Bluetooth cleanup failed. Restart Ergomatic before trying again.`; `TargetedRequestInvalidError` and a transport without `scanTarget` → `transport-missing` (existing copy `This device has no Bluetooth transport.`) — no picker, no radio call. `BluetoothOffError`/permission keep today's mapping via `mapRadioFailure`.
- `ConnectedInterstitial` props gain `request: MonitorDiscoveryRequest`; mount effect and `handleTryAgain` call `session.connect(request)`; `canRetry` is false for `target-ambiguous` and `scan-cleanup-failed` (copy says so); for `target-already-connected` the button stays **Try again** and repeats the exact target.

- [ ] **Step 1: Write the failing session tests** (in `useMonitorSession.test.ts`, using the file's `renderSession` helper with a fake that has `scanTarget`):

1. `connect({kind:"advertised-name", …})` calls `transport.scanTarget` with the same request object and never `transport.scan`; reaches `pairing` with `deviceName` = the exact name; `program()` then `armed` → `ready` (the routed half is Task 9; here the hook alone).
2. A transport WITHOUT `scanTarget` + targeted request → `failed` with `reason: "transport-missing"`; `scan` not called.
3. Invalid request (`exactName: "PM5"`) → `transport-missing`, no `scanTarget` call.
4. Each of the five errors thrown by `scanTarget` → its reason and detail literal (independent literals in the test).
5. `cancel()` during a pending `scanTarget` aborts the signal (spy on `signal.aborted` inside the fake's `scanTarget`) and the late resolution installs no driver (`result.current.phase` stays `idle`, `transport.connect` never called).
6. Unmount during a pending `scanTarget` aborts it (same observable).
7. A late-settling targeted scan from attempt A cannot clear B's abort controller: start A, cancel, start B, let A's `scanTarget` reject; B's signal is not aborted and B proceeds.
8. Background during a targeted scan (drive the lifecycle callback the hook registers — the test file already injects lifecycle via `vi.doMock("../adapters/appLifecycle")`; extend that mock to expose the registered callback) → abort → `failed` with `target-interrupted`.
9. `connect()` with no argument still calls `transport.scan()` (JustRow's callers) and `attemptId` is a valid UUID.
10. `cancel()` calls `discardStagedRetire` with THIS attempt's ID; a stale attempt's cancel (attempt A after B started) does not discard B's staged set (use `stagedRetireAttemptId()`).

- [ ] **Step 2: red. Step 3: implement.** In `connect()`:

```ts
  const targetedAbortRef = useRef<{ attemptId: ConnectionAttemptId; controller: AbortController } | null>(null);
  const attemptIdRef = useRef<ConnectionAttemptId | null>(null);

  const connect = useCallback(async (request?: MonitorDiscoveryRequest): Promise<void> => {
    if (connectingRef.current || driverRef.current !== null) return;
    const discovery: MonitorDiscoveryRequest = request ?? { kind: "picker", attemptId: mintAttemptId() };
    attemptIdRef.current = discovery.attemptId;
    // ... existing preamble unchanged ...
    try {
      let found: DiscoveredMonitor[];
      if (discovery.kind === "advertised-name") {
        if (!hasTargetedScan(transport)) {
          fail({ reason: "transport-missing", detail: "This device has no Bluetooth transport." });
          bestEffort(transport.disconnect());
          return;
        }
        const controller = new AbortController();
        targetedAbortRef.current = { attemptId: discovery.attemptId, controller };
        try {
          found = await transport.scanTarget(discovery, controller.signal);
        } catch (err: unknown) {
          if (superseded()) { bestEffort(transport.disconnect()); return; }
          fail(mapTargetedFailure(err));
          bestEffort(transport.disconnect());
          return;
        } finally {
          // Object-identity comparison: a late A settle must not clear B's ref.
          if (targetedAbortRef.current?.controller === controller) targetedAbortRef.current = null;
        }
      } else {
        found = await transport.scan();
      }
      // ... existing code from `if (superseded())` onwards, unchanged ...
```

`cancel()` and `teardown()` both do, first thing: `targetedAbortRef.current?.controller.abort()` (they already bump `attemptRef`, which makes the late rejection `superseded()`). The lifecycle `background` handler, when `targetedAbortRef.current !== null`, aborts it (that yields `TargetScanInterruptedError` → `target-interrupted`). `mintAttemptId()` = `crypto.randomUUID()` via the existing `defaultSessionId`-style fallback so jsdom and iOS both mint. Replace the two `discardStagedRetireHandoff()` calls with `discardStagedRetireHandoff(attemptIdRef.current ?? "")` guarded by `if (attemptIdRef.current !== null)`.

`mapTargetedFailure`:

```ts
const TARGETED_COPY: Record<string, { reason: ConnectedError["reason"]; detail: string }> = {
  TargetMonitorNotAdvertisingError: { reason: "target-not-advertising", detail: "Open Connect Device on this PM5, then try again." },
  TargetAlreadyConnectedError: { reason: "target-already-connected", detail: "End this PM5's current connection, then try again." },
  TargetMonitorAmbiguousError: { reason: "target-ambiguous", detail: "More than one PM5 has this name. Use Connect." },
  TargetScanInterruptedError: { reason: "target-interrupted", detail: "Connection interrupted. Try again." },
  ScanCleanupFailedError: { reason: "scan-cleanup-failed", detail: "Bluetooth cleanup failed. Restart Ergomatic before trying again." },
  TargetedRequestInvalidError: { reason: "transport-missing", detail: "This device has no Bluetooth transport." },
};
function mapTargetedFailure(err: unknown): ConnectedError {
  const name = err instanceof Error ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);
  const hit = TARGETED_COPY[name];
  if (hit) return { ...hit, raw };
  return mapRadioFailure(err);
}
```

Interstitial: add `request` to props, `NOT_A_MACHINE_REFUSAL` entries for the five reasons (`true`), `canRetry = (phase failed|disconnected) && !(error.reason in {"target-ambiguous","scan-cleanup-failed"})`, and the two effects call `session.connect(request)`. Tests: render with a targeted request and a fake whose `scanTarget` rejects each error → the serif line shows the literal detail, the `End whatever is showing…` line is absent, **Try again** disabled for ambiguous/cleanup and enabled otherwise; **Try again** on not-advertising calls `scanTarget` again with the SAME request object and never `scan`.

- [ ] **Step 4: green; typecheck; lint. Step 5: mutations** — (a) fall back to `transport.scan()` when `hasTargetedScan` is false: test 2 fails; (b) remove the `controller.abort()` in `cancel()`: test 5 fails; (c) replace the identity comparison in the `finally` with unconditional `= null`: test 7 fails; (d) drop the `background` abort: test 8 fails; (e) move `takeStagedRetireHandoff()` from the `armed` handler to the top of `connect()`: the existing "arm then Cancel: the accepted loss" and staged-retire timing tests fail (this is mutation 8 of the spec's list).
- [ ] **Step 6: Commit** `feat(nfc): targeted discovery through useMonitorSession and the interstitial`

---

## Task 8: The shared connection-entry owner, the Scan NFC path on workout detail, tokens and CSS

**Files:**
- Create: `app/src/monitor/ConnectionEntry.tsx` (+ test, absorbing `ConnectAction.test.tsx`'s guard tests), `app/src/monitor/nfc/runNfcAttempt.ts` (+ test), `app/src/monitor/nfc/paintBarrier.ts` (+ test)
- Delete: `app/src/monitor/ConnectAction.tsx`, `app/src/monitor/ConnectAction.test.tsx`
- Modify: `app/src/workout/WorkoutDetail.tsx` (+ tests), `app/src/theme/tokens.css`, `app/src/index.css`, `docs/design/DEVIATIONS.md`

**Interfaces:**

```tsx
// ConnectionEntry.tsx
export type ConnectionEntryIntent = { kind: "manual" | "nfc"; attemptId: ConnectionAttemptId };
export interface ConnectionEntryProps {
  nfcCapability: NfcCapability | "unknown";   // "unknown" and "unsupported" render NO NFC button
  busy: boolean;                               // an attempt is live: both buttons disabled
  accepted: boolean;                           // render `✓ PM5 found` in the NFC button's place
  onProceed(intent: ConnectionEntryIntent): void;
  onCancelStaged(attemptId: ConnectionAttemptId): void; // parent may clear inline errors
}
```

`runNfcAttempt(deps)`:

```ts
export interface RunNfcAttemptDeps {
  attemptId: ConnectionAttemptId;
  reader: NfcReader;
  trace: ConnectionAttemptTrace;
  signal: AbortSignal;                      // detail unmount / foreground loss
  haptic: () => Promise<void>;
  paint: (signal: AbortSignal) => Promise<void>;  // paintBarrier
  onAccepted(): void;                        // parent sets accepted=true BEFORE paint
}
export type NfcAttemptOutcome =
  | { kind: "target"; target: Pm5NfcTarget }
  | { kind: "inline-error"; copy: "Unsupported NFC tag" | "No NFC tag detected. Try again." | "NFC scan stopped. Try again." }
  | { kind: "quiet" };                       // user cancelled, or aborted
export function runNfcAttempt(deps: RunNfcAttemptDeps): Promise<NfcAttemptOutcome>;
```

Mapping (spec "Reader-ending seam" rule): records → parse → target or `Unsupported NFC tag`; `NfcCancelledError` → quiet; `NfcTimeoutError` → `No NFC tag detected. Try again.`; `NfcInvalidatedError` with `cause === "multipleTags"` → `Unsupported NFC tag`; any other `NfcInvalidatedError`, `NfcStartError` → `NFC scan stopped. Try again.`; `NfcAbortError` → quiet. The haptic is awaited with `.catch(() => trace.record("haptic-failed"))` and never delays: fire it, then `onAccepted()`, then `await paint(signal)`; if `signal.aborted` after paint → quiet (keyed cleanup only).

`paintBarrier(signal)`: resolves after two consecutive `requestAnimationFrame` callbacks; rejects/aborts if the signal aborts first; no `setTimeout`. Test with a stubbed `requestAnimationFrame` queue: one frame does not resolve, two do; abort between frames rejects.

`WorkoutDetail` changes:
- state: `nfcCapability` (`useEffect` → `resolveNfcReader().capability()` with a 2_000 ms deadline; rejection/timeout keep `"unknown"` and trace `capability-failed`/`capability-timed-out`; cached in a module-level variable for the process after first resolution, never persisted), `entryBusy`, `nfcAccepted`, `connectError` (existing slot renders the three inline NFC strings too).
- `handleEntryProceed(intent)`: manual → today's `handleConnectProceed` body plus `request: { kind: "picker", attemptId }` into `connecting`; nfc → `entryBusy = true`, build trace, `runNfcAttempt(...)`, then on `target`: compile exactly as today (baselines guard, `buildNudgedDraft`, `buildRun`, `compileProgram`, `buildLogSeed`) and `setConnecting({ …, request: { kind: "advertised-name", attemptId, exactName: target.advertisingName } })`; on `inline-error`: `setConnectError(copy)`; on `quiet`: nothing. Any terminal path before handoff calls `discardStagedRetire(attemptId)`; the compile/baseline failure paths too. `entryBusy = false` and `nfcAccepted = false` on every path that stays on detail.
- A detail-level `AbortController` per attempt, aborted on unmount and on lifecycle `background` (register via `registerAppLifecycleListener`; the web arm never fires, which is correct: web never has the button).
- `connecting` gains `request`; the interstitial render passes `request={connecting.request}`; `handleInterstitialExit` unchanged.
- The `ConnectBlock` shell wraps `ConnectionEntry` instead of `ConnectAction` and passes the new props.

CSS (`tokens.css`): `--action-nfc: #49624f; --action-nfc-hover: #3f5545;` with the contrast numbers from the spec in the comment (6.57:1 / 5.92:1 / 7.95:1). `index.css`: `.button-nfc` = `.button-connect`'s block with the NFC tokens (add `.button-nfc` to the shared geometry selector list); `.button-nfc[disabled]` keeps the fill at 60% opacity (compute and state the contrast: `#49624f` at 0.6 over `#f4f1e8` ≈ `#8f9b8f` → cream text 2.6:1 is BELOW AA, so instead keep full fill and add `cursor: progress` — disabled state stays at 6.57:1); `.button-nfc-accepted` is the same fill with the `✓ PM5 found` label and `aria-live="polite"`.

- [ ] **Step 1: Write the failing tests**

`ConnectionEntry.test.tsx`: renders `Connect` only when `nfcCapability` is `"unknown"` or `"unsupported"` (no `.button-nfc`, no placeholder element, no reserved height: assert `container.querySelectorAll(".connect-block > *").length` equals the count without NFC); renders `Scan NFC` above `Connect` when `"supported"` (DOM order); a press mints a v4 UUID and calls `stageRetire(set, attemptId)` before `onProceed` (spy via `stagedRetireAttemptId()`); rapid `Scan NFC` then `Connect` presses produce ONE `onProceed`; with an unlogged run seeded the staged panel replaces BOTH buttons, **Cancel** calls `discardStagedRetire` with the same attempt ID and returns both buttons, **Connect anyway** resumes the SAME intent kind and attempt ID; `busy` disables both; `accepted` renders `✓ PM5 found` in the NFC slot with `aria-live`. Port every guard test from `ConnectAction.test.tsx` (`git show HEAD:app/src/monitor/ConnectAction.test.tsx`) unchanged in intent.

`runNfcAttempt.test.ts`: over the scripted reader: fixture records → `{ kind: "target", target: { advertisingName: "PM5 432331249 Row" } }` with `onAccepted` called BEFORE `paint`, haptic called once; haptic rejection → still target, `haptic-failed` traced; `cancelled` → quiet; `timeout` → the timeout copy; `invalidated` cause `multipleTags` → `Unsupported NFC tag`; `invalidated` cause `tagFailure` and no cause → `NFC scan stopped. Try again.`; `start-failed` → `NFC scan stopped. Try again.`; non-PM5 records (fixture records 1 and 2 only) → `Unsupported NFC tag`; abort during `paint` → quiet and the reader was stopped (`stops()` includes the attempt ID); the reader's `stops()` contains the attempt ID exactly once on the success path (explicit stop after the record).

`WorkoutDetail.test.tsx` additions (using `window.__nfcScript__` + `resetNfcCapabilityCacheForTests()`): button absent by default; present with `capability: "supported"`; clicking `Scan NFC` with fixture records shows `✓ PM5 found`, then mounts the interstitial whose `request` is `{ kind: "advertised-name", exactName: "PM5 432331249 Row" }` (inject `createTransport` via the interstitial's `deps`? No: assert through the fake transport injected by `window.__pm5FakeScript__`, the shipped seam, that `scanTarget` was called — expose `window.__pm5FakeControls__.targetedRequests()` on the fake for this); `Unsupported NFC tag` inline for a non-PM5 script; quiet for cancelled; the accepted label crosses the paint barrier before the interstitial mounts (stub `requestAnimationFrame`, assert interstitial absent after one frame, present after two); unmount mid-read aborts (the scripted reader's `stops()` has the id) and `stagedRetireAttemptId()` is `null` afterwards.

- [ ] **Step 2: red. Step 3: implement.** (Component bodies follow the interfaces above; keep `ConnectAction.tsx`'s doc comment history by moving its two corrected paragraphs into `ConnectionEntry.tsx` verbatim, and retitle the WorkoutDetail comment that says Connect is the screen's SINGLE primary: "two equal hardware routes, spec 2026-09-03 Gate 0".)

- [ ] **Step 4: green; typecheck; lint; `pnpm e2e` (the design suite's `.button-l1` count-zero assertion still holds; Task 9 adds the NFC design assertions).**
- [ ] **Step 5: Mutations** — render the NFC button when capability is `"unknown"` (absent test fails); mount the interstitial before the paint barrier (frame test fails); skip `discardStagedRetire` on the unsupported-tag path (`stagedRetireAttemptId()` non-null → test fails); let a second press through while busy (single `onProceed` test fails).
- [ ] **Step 6: DEVIATIONS.md** — reconcile the row that records Connect as the single primary: it now reads "two equal 56 px hardware primaries on native (Scan NFC above Connect); web shows Connect alone" with the spec citation.
- [ ] **Step 7: Commit** `feat(nfc): Scan NFC on workout detail through one connection-entry owner`

---

## Task 9: The routed producer-to-consumer proof, e2e flow, captures and bundle gates

**Files:**
- Create: `app/src/workout/WorkoutDetail.nfcRouted.test.tsx`
- Modify: `app/e2e/connected.spec.ts`, `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`, `docs/screenshots/workout-detail-nfc.png`, `docs/screenshots/workout-detail-nfc-landscape.png`

- [ ] **Step 1: The routed test (RF24: starts upstream of every producer).** Render the real `WorkoutDetail` at `/library/w1` with baselines seeded, `window.__nfcScript__ = { capability: "supported", outcome: { kind: "records", records: fixture } }`, `window.__pm5FakeScript__ = { program: <compiled by the test from the same seeded workout>, deviceName: "PM5 432331249 Row" }`, and a fixed attempt-ID mint injected through `ConnectionEntry`'s `mintAttemptId` prop default (a module-level `setAttemptIdMintForTests(() => "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f")`). Click `Scan NFC`. Assert, in order: `✓ PM5 found` rendered; the fake's `targetedRequests()` equals `[{ kind: "advertised-name", attemptId: "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f", exactName: "PM5 432331249 Row" }]` (independent literals); `scan()` never called; the interstitial reaches `ready` (the `armed` acceptance: the existing "READY" copy is on screen); `stagedRetireAttemptId()` is `null` after `armed` consumed it. The test constructs NO discovery request itself.
- [ ] **Step 2: e2e** (`connected.spec.ts`): the same flow in Chromium against the compose stack via `page.addInitScript` setting both globals; assert no picker copy (`Choose your monitor`) appears, `✓ PM5 found` appears, and the connected surface reaches READY; a second test with a non-PM5 script asserts `Unsupported NFC tag` and no interstitial; a third with `targetedScan: "not-advertising"` asserts the approved copy `Open Connect Device on this PM5, then try again.` and that **Try again** exists and **Cancel** returns to detail with `Connect` still present.
- [ ] **Step 3: design.spec.ts**: with the NFC script, `.button-nfc` is 56 px tall, its computed background is `rgb(73, 98, 79)`, it precedes `.button-connect` in DOM order, both are `width: 100%`; without the script `.button-nfc` has count 0 and the stack height equals today's (assert against the measured no-NFC height captured in the same test, not a literal).
- [ ] **Step 4: screenshots**: `workout-detail-nfc` (portrait) and `workout-detail-nfc-landscape` with the script set; open both PNGs and confirm the button reads `Scan NFC` above `Connect` (RF7).
- [ ] **Step 5: `pnpm build && pnpm dist:grep`** (needles from Task 5) and `pnpm test:coverage` — check the per-file numbers for every new file (RF2), not the aggregate.
- [ ] **Step 6: Commit** `test(nfc): routed Scan NFC → armed proof, e2e flow, design pins and captures`

---

## Task 10: Self-mutation sweep

Run the spec's 28 mutations (spec "Self-mutation"), one at a time on a clean tree, each reverted with `git checkout -- <file>` after `git status` confirms the file is clean. Tasks 2-9 already performed most of them; this task fills the table for ALL 28 in `docs/monitor/sessions/phase-nf-product-walk/MUTATIONS.md` with: number, file and edit, the named failing test, its failure message. Any mutation that survives is a defect: fix the test (or production) in this task, re-run, and record it.

Mutation 14 and 15 are the NATIVE ones and run in the patch workspace (`pnpm patch @capgo/capacitor-nfc@8.2.5 --edit-dir <abs path>`; `xcodebuild … test`; `rm -rf` the workspace afterwards without `patch-commit`) — record their failing Swift test names.

- [ ] Commit `docs(nfc): self-mutation record (28/28 bite)`

---

## Task 11: iOS verification, hardware walk runsheet, records

**Files:**
- Create: `docs/monitor/sessions/phase-nf-product-walk/RUNSHEET.md`
- Modify: `ROADMAP.md`, `docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md` (walk record section, after the walk)

- [ ] **Step 1: Entitlement and usage description in the built app.** `cd app && pnpm exec vite build && npx cap sync ios`, then `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath "$SCRATCH/dd" build`, then `codesign -d --entitlements :- "$SCRATCH/dd/Build/Products/Debug-iphoneos/App.app" | grep -A2 nfc` → must show `com.apple.developer.nfc.readersession.formats` with `TAG`; `plutil -p "$SCRATCH/dd/Build/Products/Debug-iphoneos/App.app/Info.plist" | grep NFCReaderUsageDescription` → the exact string. Do NOT use `pnpm ios:build` (it rewrites tracked version numbers).
- [ ] **Step 2: Write the runsheet** under the hardware-walk contract (`/hardware-walk` skill; CLAUDE.md's walk rules): the ten legs from the spec's "Native hardware walk", one primary evidence target per leg, total operator cap 25 min, rowing budget one pull for leg 3 only, the Flipper in hand (control-tag read first on any no-tag), screen awake, install permission asked separately, build identity check before assuming the install, and the DEBUG trace retrieval via the interstitial diagnostics export. Attach the PM readiness verdict (dispatch `product-manager`) to the exact runsheet version before inviting James.
- [ ] **Step 3: ROADMAP** — NF block: product PR open, walk pending; the dead-code row for `@capacitor/browser` is unrelated and stays.
- [ ] **Step 4: Open the PR** (no merge): body in the house shape ("This PR …", ≤120 words above the fold, `Record (for agents and audits)` below with the census diff, mutation table, captures, gate outputs and the head SHA). State the implementation shape used (inline, review half dispatched).

---

## Self-review (run before handing this plan to `/harden`)

- Spec coverage: rulings 1-10 → Tasks 8 (1-5, 8-9), 3 (6-7), 5/8 (3); architecture §1 → Task 5; §2 → Task 2; §3 → Tasks 6, 8; §4 → Task 8; §5 → Tasks 3, 4, 7; §6 → untouched by design (Task 7 changes only discovery); lifetime ledger rows → Tasks 5-8; failure contract → Tasks 3, 5, 7, 8; instrumentation → Tasks 5, 9; validation contract bullets → Tasks 2-9; self-mutation → Task 10; walk → Task 11; release/provisioning → Task 11 step 1 and the PR.
- Placeholders: none of "TBD/TODO/similar to"; every code step carries code. Two deliberate deferrals are named as such (ConnectionEntry/WorkoutDetail bodies follow the interface block and the existing components they replace; the reviewer checks them against the spec's step list).
- Type consistency: `scanTarget(request, signal)` everywhere; `MonitorDiscoveryRequest` on `connecting.request`, the interstitial prop and `connect()`; `discardStagedRetire(attemptId)` at all three call sites; `ConnectionAttemptTrace` passed into `readOne`.
