# Phase NF Gate -1 Hardware Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove or reject the hardened Phase NF NFC architecture on a signed iPhone and real PM5 before any product-facing Scan NFC behavior is implemented.

**Architecture:** Pin and patch the exact native NFC package first, with a pure Swift state machine that makes session ownership and drain mechanically testable. A disposable, build-flagged diagnostic surface then records native-shaped NDEF data and unfiltered CoreBluetooth observations into a strict redacted receipt; after the hardware walk, the probe is deleted and the branch stops at an explicit GO or NO-GO. A product implementation plan is written only after a GO receipt supplies the payload rule and measured latency observations.

**Tech Stack:** React 19.2.8, TypeScript 6.0.3, Vite 8.2.2, Capacitor 8.5.0, `@capgo/capacitor-nfc@8.2.5`, `@capacitor-community/bluetooth-le@8.3.0`, Swift 5.9, Core NFC, CoreBluetooth, XCTest, Vitest 4.1.11, Node 26.5.0, pnpm 11.17.0, Xcode 26.6 with the installed iOS 26.5 simulator runtime. Tool versions and the named `iPhone 17 Pro, OS=26.5` destination were measured with `node --version`, `pnpm --version`, `xcodebuild -version`, and `xcrun simctl list devices available` on the design worktree at `ee3dea774fcb930467fde5fcc2f28775d9b34d0b`.

**Spec:** `docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md`

## Global Constraints

- This plan is dormant until James explicitly schedules Phase NF either ahead of or behind Wave A.
- No product UI or connection behavior is implemented during Gate -1.
- Use exactly `@capgo/capacitor-nfc@8.2.5`; bind its patch through `pnpm.patchedDependencies` and `app/pnpm-lock.yaml`.
- Start Core NFC with `iosSessionType: "ndef"` and `invalidateAfterFirstRead: false`.
- A missing or empty `ConnectionAttemptId` is rejected; the opaque ID is echoed on every NFC record and session-ending event.
- Every native callback is accepted only when both its concrete session identity and native generation still own the same attempt.
- A delegate callback with `tags.count != 1` fails closed before connect, query, or read.
- `stopScanning({ attemptId })` resolves only after that exact generation is invalidated, cleared by identity, and unable to emit.
- A new native start waits for the previous generation's invalidation; a stale A callback or stop can never settle, clear, or stop B.
- BLE discovery uses unfiltered `BleClient.requestLEScan({ allowDuplicates: true }, callback)` and compares the captured name only with live `ScanResult.localName`; it never uses `device.name`, RSSI, a `PM5` prefix, a cached name, or the NFC MAC address.
- The probe receipt may zero only the six NFC address bytes. It preserves TNF, type, record framing, address type, padding, and advertising-name bytes.
- The committed receipt contains no NFC tag UID, BLE `deviceId`, NFC address, attempt ID, or unrelated scanned device name.
- The signed target contains a nonempty `NFCReaderUsageDescription` with exact value `Scan a PM5 to connect and program your workout.` and an effective `com.apple.developer.nfc.readersession.formats = [TAG]` entitlement.
- iOS deployment remains 15.0. Web NFC, Android NFC, background NFC, workout selection from a tag, and NFC authentication stay out of scope.
- The main checkout's existing user-owned `Info.plist` and Xcode-project edits are never overwritten or reverted.
- The disposable probe and any DEBUG-only native observation overlay are removed before Gate -1 closes.
- Gate -1 uses `vite build` plus `cap sync ios`, not `pnpm ios:build`; the latter runs `ios-version.sh` and would rewrite tracked marketing/build versions for a proof build.
- Before every commit, run `git rev-parse --show-toplevel` and require `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design`.
- Gate -1 stops at one countable outcome: all nine spec criteria pass (`GO`), or at least one fails (`NO-GO`). Product implementation does not begin in either case under this plan.

---

## File Map

Durable on GO:

- Modify `app/package.json` — exact NFC dependency and `pnpm.patchedDependencies` binding.
- Modify `app/pnpm-lock.yaml` — exact resolved package plus patch hash.
- Create `app/patches/@capgo__capacitor-nfc@8.2.5.patch` — TypeScript bridge contract, native generation ownership, exact stop drain, and native tests.
- Modify `app/ios/App/CapApp-SPM/Package.swift` — Capacitor-generated local Swift-package dependency for the NFC plugin.
- Modify `app/ios/App/App/Info.plist` — NFC reader usage description.
- Create `app/ios/App/App/App.entitlements` — signed NFC `TAG` entitlement.
- Modify `app/ios/App/App.xcodeproj/project.pbxproj` — `CODE_SIGN_ENTITLEMENTS` in Debug and Release.
- Create `docs/monitor/nfc/pm5-tag-gate-minus-one.json` — canonical redacted native-shaped record fixture.
- Modify `docs/monitor/nfc/README.md` — replace the partial capture's overclaim and link the complete proof.
- Create `docs/monitor/sessions/phase-nf-gate-minus-one/receipt.json` — full redacted hardware receipt.
- Create `docs/monitor/sessions/phase-nf-gate-minus-one/README.md` — commands, observations, nine-criterion verdict, and exact GO/NO-GO.
- Modify `docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md` — record the Gate -1 verdict and, on GO, the measured facts that the product plan may freeze.
- Modify `ROADMAP.md` — record the proof result without scheduling product implementation.

Disposable and deleted before closeout:

- Create then delete `app/src/monitor/nfc/gateMinusOneReceipt.ts` — strict native/BLE decoder, redactor, receipt schema, and JSON serializer.
- Create then delete `app/src/monitor/nfc/gateMinusOneReceipt.test.ts` — byte validation, exact name containment, redaction, and receipt invariants.
- Create then delete `app/src/monitor/nfc/GateMinusOneProbe.tsx` — operator-driven reader, BLE sampler, connect/disconnect check, and receipt display.
- Create then delete `app/src/monitor/nfc/GateMinusOneProbe.test.tsx` — listener/start ordering, exact `localName`, drain, and export behavior.
- Create then delete `app/src/native/nfcGateMinusOneProbe.ts` — the only JS file that imports Capgo NFC, Capacitor BLE/App, or the DEBUG-only stage hold/release bridge.
- Modify then restore `app/src/You.tsx` — build-flagged lazy mount for the disposable device probe.
- Temporarily overlay then restore the patched package's `ios/Sources/NfcPlugin/NfcPlugin.swift` — DEBUG-only stage hold/release instrumentation used only for the A-to-B device stress walk.

## Receipt Contract

The probe serializes this exact shape. Runtime decoders accept `unknown`; arrays are valid only when every member is an integer from 0 through 255.

```ts
type GateScenario =
  | "normal"
  | "stop-during-connect"
  | "stop-during-query"
  | "stop-during-read"
  | "background"
  | "webview-reload";

type ReaderEndingAction =
  "sheet-cancel" | "no-tag-timeout" | "forced-invalidation";

interface RedactedNfcRecord {
  tnf: number;
  type: number[];
  id: number[];
  payload: number[];
}

interface GateAttemptReceipt {
  scenario: GateScenario;
  atUtc: string;
  capabilityLatencyMs: number | null;
  records: RedactedNfcRecord[];
  decodedName: string | null;
  liveLocalName: string | null;
  trailingPayloadBytes: number[];
  firstMatchingAdvertisementMs: number | null;
  matchingAdvertisementIntervalsMs: number[];
  matchingDeviceCount: number;
  connected: boolean;
  disconnected: boolean;
  staleIdDroppedCount: number;
  staleAttemptSettlementCount: number | null;
}

interface ReaderEndingReceipt {
  action: ReaderEndingAction;
  observedReason: "userCancelled" | "sessionTimeout" | "invalidated" | null;
}

export interface NfcGateReceiptV1 {
  schema: "ergomatic/nfc-gate-minus-one/v1";
  capturedAtUtc: string;
  iphone: { model: string; iosVersion: string };
  pm5: { model: string; firmware: string; advertisedNameShown: string };
  signedEntitlement: [] | ["TAG"];
  usageDescription: "Scan a PM5 to connect and program your workout.";
  package: "@capgo/capacitor-nfc@8.2.5";
  attempts: GateAttemptReceipt[];
  readerEndings: ReaderEndingReceipt[];
  criteria: {
    rawNdefShape: boolean;
    exactType: boolean;
    paddingRuleObserved: boolean;
    exactLocalNameBridge: boolean;
    pickerFreeBleConnect: boolean;
    signedReader: boolean;
    readerEndingSemanticsObserved: boolean;
    nativeIdentityAndDrain: boolean;
    staleACannotAffectB: boolean;
  };
  verdict: "GO" | "NO-GO";
}
```

The serializer computes `verdict`; it does not accept a caller-provided verdict:

```ts
const criteriaKeys = [
  "rawNdefShape", "exactType", "paddingRuleObserved",
  "exactLocalNameBridge", "pickerFreeBleConnect", "signedReader",
  "readerEndingSemanticsObserved", "nativeIdentityAndDrain", "staleACannotAffectB",
] as const;
for (const key of criteriaKeys) {
  if (typeof receipt.criteria[key] !== "boolean") throw new Error("Invalid criterion");
}
const verdict = criteriaKeys.every((key) => receipt.criteria[key] === true)
  ? "GO" : "NO-GO";
```

Unobserved measurements on stopped/failed attempts stay `null`; unverified
signed entitlements stay empty. All metadata, enum, byte, boolean and numeric
fields are validated before explicit-field serialization. Unknown keys cannot
change the verdict. Padding and signed-reader claims require Task 3 observations,
not a payload-length check or the entitlement source file. `staleAttemptSettlementCount`
is null in the disposable probe: no instrumentation measures that count. Never
coerce null to zero or cite it as an observed pass. B completion, rejected stale
IDs, and the native held-continuation ownership-guard observation are separate
evidence; the nine-criterion GO still requires every prescribed physical leg.

### Disposable probe lifetime contract

One attempt owns the radio until its cancellation/drain and all pending native
operations settle. Terminal is claimed synchronously; a late start is stopped,
a late connection disconnected, and a late listener handle removed before re-arm.
Any uncertain release requires an app restart, never a WebView-only reset.
The explicit `webview-reload` handoff is the sole exception to local radio drain:
retire the old document's listeners without stopping native A, transfer only
opaque reload metadata, and let the native coordinator replace/drain A when B
starts in the next document. Failed listener retirement or foreground loss
before transfer cancels reload and drains A.
The implementation/test owners are Task 2's `Active`, `pending`, `listen`,
`drain`, `runScenario`, and the arranged-promise component regressions.

| State | Mint | Clear | Teardown / reload / re-arm |
|---|---|---|---|
| `activeRef`, `Active.attemptId`, `entry`, `metadata` | `runScenario` | completed drain, or successful explicit live-native document transfer after listener retirement | ordinary teardown drains; live reload preserves native A for B's coordinator replacement; entry retained in exported document receipt; fresh attempt on re-arm |
| `pending`, listener remover arrays, `nfcActive`, `bleActive`, `connectedDevice` | same `Active` construction; updated at each native primitive | settled native calls and resource release | teardown waits; no B while nonempty/uncertain; never persisted |
| `terminal`, `drainPromise`, `cleanupFailed` | same `Active` construction | never reset on an old attempt | first terminal wins; failed cleanup sets document restart latch |
| `reading`, `finalizing`, `nfcReady`, `earlyNfcEvent`, `scanReady`, `holdStage`, `priorReleased` | same `Active` construction | discarded after drain; early event consumed after start acknowledgment | stop duplicate continuations and premature success; B gets no hold stage |
| `payload`, matching IDs/counts/times, first ID, scan start, selected ending | same `Active` construction | discarded after drain | receipt keeps only allowed measurements/records; raw IDs remain memory-only |
| `receiptRef`, rendered receipt | first scenario | document end | every failed/repeated entry retained; no persistence; partial export before reload |
| `reloadReady`, `exportedPartial`, `prior` | exact matching held-stage event (after drain for stop-stage legs, native-live for reload) / validated reload metadata | any later drain withdraws readiness; consumed by reload or B start/release | only scenario, reloadPending, opaque prior ID/stage and operator metadata cross reload; no records or receipt |
| mounted/restart refs and UI state | document mount | unmount / process restart | old handlers cannot mutate receipts; uncertain cleanup blocks re-arm |
| console export ID | each export via `crypto.getRandomValues` | end of export | fragment/end envelopes carry independent random framing ID and declared length; no NFC identity or module-level mutable state |

`crypto.getRandomValues` is available in Safari/iOS 5 (MDN's primary
[compatibility dataset](https://github.com/mdn/browser-compat-data/blob/main/api/Crypto.json),
`getRandomValues.__compat.support.safari_ios.version_added = "5"`). The prescribed
`crypto.randomUUID` requires 15.4 ([dataset](https://github.com/mdn/browser-compat-data/blob/main/api/Crypto.json),
`randomUUID.__compat.support.safari.version_added = "15.4"`), above the target's
15.0 floor (`app/ios/App/App.xcodeproj/project.pbxproj`, target build settings).
The probe therefore feature-detects secure UUID generation and retains an
unarmed failed sample when absent; no fallback identity or deployment-target
change. The boundary remains diagnostic: host tests prove arranged
conditional ordering; only Task 3 can establish device producer reachability.

### Task 1: Pin and harden the native NFC session contract

**Files:**

- Modify: `app/package.json`
- Modify: `app/pnpm-lock.yaml`
- Create: `app/patches/@capgo__capacitor-nfc@8.2.5.patch`
- Patch source: `app/node_modules/@capgo/capacitor-nfc/dist/esm/definitions.d.ts`
- Patch source: `app/node_modules/@capgo/capacitor-nfc/ios/Sources/NfcPlugin/NfcPlugin.swift`
- Patch source: `app/node_modules/@capgo/capacitor-nfc/ios/Sources/NfcPlugin/NdefAttemptState.swift`
- Patch test: `app/node_modules/@capgo/capacitor-nfc/ios/Tests/NfcPluginTests/NdefAttemptStateTests.swift`
- Modify: `app/ios/App/CapApp-SPM/Package.swift`

**Interfaces:**

- Consumes: Capgo's `NFCNDEFReaderSessionDelegate`, Capacitor's `CAPPluginCall`, and opaque nonempty `attemptId` strings.
- Produces: `startScanning(options: StartScanningOptions): Promise<void>`, `stopScanning(options: StopScanningOptions): Promise<void>`, and `attemptId` on `NfcEvent` and `NfcSessionEndEvent`.
- Produces: a pure Swift `NdefAttemptState` whose decisions drive the concrete Core NFC session without storing `CAPPluginCall` or emitting events itself.

- [ ] **Step 1: Confirm scheduling, isolation, and overlapping-file ownership**

Run:

```bash
git -C /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design rev-parse --show-toplevel
git -C /Users/james/projects/github/jamesawesome/Ergomatic status --short -- app/ios/App/App/Info.plist app/ios/App/App.xcodeproj/project.pbxproj
git -C /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design status --short
```

Expected: the first command prints the exact worktree path. If either overlapping iOS file is still dirty in the main checkout, package and native-patch work may proceed, but stop before Task 2 Step 9; iOS project/configuration edits wait until James lands or explicitly reconciles his changes.

- [ ] **Step 2: Install both workspaces and verify the existing hook path**

Run:

```bash
pnpm install
pnpm --dir app install
git config --get core.hooksPath
test -x .husky/pre-commit
```

Expected: installs pass, `core.hooksPath` names `.husky/_`, and the hook file is executable.

- [ ] **Step 3: Add the exact package and open a pnpm patch workspace**

Run:

```bash
pnpm --dir app add --save-exact @capgo/capacitor-nfc@8.2.5
test ! -e /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design/app/.pnpm-patch/capgo-capacitor-nfc-8.2.5
pnpm --dir app patch @capgo/capacitor-nfc@8.2.5 --edit-dir /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design/app/.pnpm-patch/capgo-capacitor-nfc-8.2.5
```

Do not hand-create the binding before the patch exists. Task 1 Step 10's `pnpm patch-commit` must produce this exact package-level result in `app/package.json` and the matching patch hash in `app/pnpm-lock.yaml`:

```json
{
  "pnpm": {
    "patchedDependencies": {
      "@capgo/capacitor-nfc@8.2.5": "patches/@capgo__capacitor-nfc@8.2.5.patch"
    }
  }
}
```

- [ ] **Step 4: Write the failing pure-state XCTest cases in the patch workspace**

Create `ios/Tests/NfcPluginTests/NdefAttemptStateTests.swift` with independent literal IDs and session objects:

```swift
import XCTest
@testable import NfcPlugin

final class NdefAttemptStateTests: XCTestCase {
    func testBWaitsForAAndLateACannotClearB() throws {
        let aSession = NSObject()
        let bSession = NSObject()
        var state = NdefAttemptState()

        XCTAssertEqual(try state.requestStart(attemptId: "attempt-a"), .begin("attempt-a"))
        let a = try state.activate(attemptId: "attempt-a", session: aSession)
        XCTAssertTrue(state.accepts(a))

        XCTAssertEqual(try state.requestStart(attemptId: "attempt-b"), .invalidate(a))
        XCTAssertFalse(state.accepts(a))
        XCTAssertEqual(state.finishInvalidation(a), "attempt-b")

        let b = try state.activate(attemptId: "attempt-b", session: bSession)
        XCTAssertTrue(state.accepts(b))
        XCTAssertNil(state.finishInvalidation(a))
        XCTAssertTrue(state.accepts(b))
        XCTAssertEqual(state.requestStop(attemptId: "attempt-a"), .alreadyDrained)
        XCTAssertTrue(state.accepts(b))
    }

    func testStopSettlesOnlyAfterMatchingInvalidation() throws {
        let session = NSObject()
        var state = NdefAttemptState()
        XCTAssertEqual(try state.requestStart(attemptId: "attempt-a"), .begin("attempt-a"))
        let a = try state.activate(attemptId: "attempt-a", session: session)

        XCTAssertEqual(state.requestStop(attemptId: "attempt-a"), .invalidate(a))
        XCTAssertFalse(state.accepts(a))
        XCTAssertNil(state.finishInvalidation(
            NdefAttemptKey(attemptId: "attempt-a", generation: a.generation + 1, sessionIdentifier: a.sessionIdentifier)
        ))
        XCTAssertEqual(state.finishInvalidation(a), nil)
        XCTAssertEqual(state.requestStop(attemptId: "attempt-a"), .alreadyDrained)
    }

    func testStopCancelsBWhileBIsQueuedBehindA() throws {
        let session = NSObject()
        var state = NdefAttemptState()
        XCTAssertEqual(try state.requestStart(attemptId: "attempt-a"), .begin("attempt-a"))
        let a = try state.activate(attemptId: "attempt-a", session: session)
        XCTAssertEqual(try state.requestStart(attemptId: "attempt-b"), .invalidate(a))

        XCTAssertEqual(state.requestStop(attemptId: "attempt-b"), .cancelPending)
        XCTAssertNil(state.finishInvalidation(a))
    }

    func testRejectsMissingAttemptIdAndNonSingletonTagCounts() {
        var state = NdefAttemptState()
        XCTAssertThrowsError(try state.requestStart(attemptId: ""))
        XCTAssertFalse(isExactlyOneDetectedTag(count: 0))
        XCTAssertTrue(isExactlyOneDetectedTag(count: 1))
        XCTAssertFalse(isExactlyOneDetectedTag(count: 2))
    }
}
```

- [ ] **Step 5: Run the package tests and verify the new contract fails to compile**

Run from the patch workspace printed by `pnpm patch`:

```bash
xcodebuild -scheme CapgoCapacitorNfc -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' test
```

Expected: FAIL because `NdefAttemptState`, `NdefAttemptKey`, and `isExactlyOneDetectedTag` do not exist.

- [ ] **Step 6: Implement the pure ownership state machine**

Create `ios/Sources/NfcPlugin/NdefAttemptState.swift` with these exact public-to-the-test-target types:

```swift
import Foundation

struct NdefAttemptKey: Equatable {
    let attemptId: String
    let generation: UInt64
    let sessionIdentifier: ObjectIdentifier
}

enum NdefStartDecision: Equatable {
    case begin(String)
    case invalidate(NdefAttemptKey)
}

enum NdefStopDecision: Equatable {
    case invalidate(NdefAttemptKey)
    case awaitInvalidation(NdefAttemptKey)
    case cancelPending
    case alreadyDrained
}

enum NdefAttemptStateError: Error {
    case emptyAttemptId
    case activationDoesNotMatchPendingStart
}

func isExactlyOneDetectedTag(count: Int) -> Bool { count == 1 }

struct NdefAttemptState {
    private(set) var nextGeneration: UInt64 = 0
    private(set) var active: NdefAttemptKey?
    private(set) var draining: NdefAttemptKey?
    private(set) var beginCandidate: String?
    private(set) var pendingAttemptId: String?

    mutating func requestStart(attemptId: String) throws -> NdefStartDecision {
        guard !attemptId.isEmpty else { throw NdefAttemptStateError.emptyAttemptId }
        if let active {
            pendingAttemptId = attemptId
            draining = active
            self.active = nil
            return .invalidate(active)
        }
        if let draining {
            pendingAttemptId = attemptId
            return .invalidate(draining)
        }
        beginCandidate = attemptId
        return .begin(attemptId)
    }

    mutating func activate(attemptId: String, session: AnyObject) throws -> NdefAttemptKey {
        guard beginCandidate == attemptId else {
            throw NdefAttemptStateError.activationDoesNotMatchPendingStart
        }
        nextGeneration += 1
        let key = NdefAttemptKey(
            attemptId: attemptId,
            generation: nextGeneration,
            sessionIdentifier: ObjectIdentifier(session)
        )
        beginCandidate = nil
        active = key
        return key
    }

    func accepts(_ key: NdefAttemptKey) -> Bool { active == key && draining == nil }

    mutating func requestStop(attemptId: String) -> NdefStopDecision {
        if pendingAttemptId == attemptId {
            pendingAttemptId = nil
            return .cancelPending
        }
        if beginCandidate == attemptId && active == nil && draining == nil {
            beginCandidate = nil
            return .cancelPending
        }
        if let active, active.attemptId == attemptId {
            draining = active
            self.active = nil
            return .invalidate(active)
        }
        if let draining, draining.attemptId == attemptId {
            return .awaitInvalidation(draining)
        }
        return .alreadyDrained
    }

    mutating func finishInvalidation(_ key: NdefAttemptKey) -> String? {
        guard draining == key else { return nil }
        active = nil
        draining = nil
        let next = pendingAttemptId
        pendingAttemptId = nil
        beginCandidate = next
        return next
    }
}
```

The plugin owns pending `CAPPluginCall`s and scan options beside this pure state. Replacing a queued start rejects the older queued call as `CANCELLED`; it does not begin a second session.

- [ ] **Step 7: Make the bridge contract require and return attempt identity**

Patch `dist/esm/definitions.d.ts` to add these exact fields and signatures:

```ts
export interface StartScanningOptions {
  attemptId: string;
  invalidateAfterFirstRead?: boolean;
  alertMessage?: string;
  iosSessionType?: "ndef" | "tag";
  iosPollingOptions?: NfcIosPollingOption[];
  androidReaderModeFlags?: number;
}

export interface StopScanningOptions {
  attemptId: string;
}

export interface NfcEvent {
  attemptId: string;
  type: NfcEventType;
  tag: NfcTag;
}

export interface NfcSessionEndEvent {
  attemptId: string;
  reason: "userCancelled" | "sessionTimeout" | "invalidated";
}

startScanning(options: StartScanningOptions): Promise<void>;
stopScanning(options: StopScanningOptions): Promise<void>;
```

- [ ] **Step 8: Route every native NDEF callback through the ownership key**

In `NfcPlugin.swift`, keep tag-reader behavior unchanged and replace the NDEF arm with these invariants:

```swift
private var ndefState = NdefAttemptState()
private var ndefSession: NFCNDEFReaderSession?
private var ndefKey: NdefAttemptKey?
private var ndefPendingStart: (call: CAPPluginCall, alertMessage: String?)?
private var ndefStopCalls: [String: [CAPPluginCall]] = [:]

private func owns(_ session: NFCNDEFReaderSession, key: NdefAttemptKey) -> Bool {
    ndefState.accepts(key) &&
        key.sessionIdentifier == ObjectIdentifier(session) &&
        key.attemptId == ndefKey?.attemptId &&
        key.generation == ndefKey?.generation
}
```

`startScanning` rejects a missing/empty `attemptId`, calls `requestStart`, and begins only on `.begin`. `.invalidate` stores the newest pending call, rejects any older queued call as `CANCELLED`, invalidates the exact old session, and waits. `stopScanning` rejects a missing/empty ID; `.invalidate` calls native invalidate and stores the stop call, `.awaitInvalidation` only stores the call, `.cancelPending` rejects that queued start as `CANCELLED` and resolves stop without beginning it, and `.alreadyDrained` resolves immediately without touching another session.

The NDEF delegate captures the bound `NdefAttemptKey` before every asynchronous `connect`, `queryNDEFStatus`, and `readNDEF` call, then starts each closure with:

```swift
guard self.owns(session, key: key) else { return }
```

The detect callback starts with:

```swift
guard owns(session, key: key) else { return }
guard isExactlyOneDetectedTag(count: tags.count), let tag = tags.first else {
    session.invalidate(errorMessage: "Present exactly one NFC tag.")
    return
}
```

The alternate `didDetectNDEFs` delegate requires `messages.count == 1` before reading `messages[0]`; zero or multiple messages invalidates the same owned session rather than choosing `.first`.

Every `nfcEvent` and `nfcSessionEnd` payload includes `"attemptId": key.attemptId`. `didInvalidateWithError` clears only when session identity plus generation match `draining`; it resolves only that ID's stored stop calls, then begins the pending start returned by `finishInvalidation`. A late invalidation for A must be a no-op while B is active.

- [ ] **Step 9: Re-run native tests and prove the stale-clear test can bite**

Run:

```bash
xcodebuild -scheme CapgoCapacitorNfc -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' test
```

Expected: PASS.

Mutation: temporarily remove the `guard draining == key` line from `finishInvalidation`, rerun the same command, and require `testBWaitsForAAndLateACannotClearB` to fail because the second late A invalidation clears active B. Restore the guard with `apply_patch`, rerun, and require PASS.

- [ ] **Step 10: Commit the pnpm patch and synchronize Capacitor**

Run:

```bash
pnpm --dir app patch-commit /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design/app/.pnpm-patch/capgo-capacitor-nfc-8.2.5
/usr/bin/trash /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design/app/.pnpm-patch/capgo-capacitor-nfc-8.2.5
pnpm --dir app install
VITE_API_BASE=https://ergomatic.waffle.haus VITE_GOOGLE_IOS_CLIENT_ID=896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304.apps.googleusercontent.com VITE_ENABLE_NFC_GATE_MINUS_ONE=1 pnpm --dir app exec vite build
pnpm --dir app exec cap sync ios
rg -n 'CapgoCapacitorNfc|@capgo/capacitor-nfc' app/ios/App/CapApp-SPM/Package.swift app/pnpm-lock.yaml
```

Expected: the generated Swift package names `CapgoCapacitorNfc`; the lockfile records version 8.2.5 and the patch hash.

- [ ] **Step 11: Run the JS/static gates for the patched declaration surface**

Run:

```bash
pnpm --dir app exec prettier --check package.json
pnpm --dir app typecheck
pnpm --dir app lint
git diff --check
```

Expected: all pass.

- [ ] **Step 12: Commit the native proof infrastructure**

Run:

```bash
git rev-parse --show-toplevel
git add app/package.json app/pnpm-lock.yaml app/patches/@capgo__capacitor-nfc@8.2.5.patch app/ios/App/CapApp-SPM/Package.swift
git commit -m "test: prove NFC session ownership and drain"
```

Expected: the root is the exact Phase NF worktree path and the commit succeeds.

### Task 2: Build the disposable signed-device probe

**Files:**

- Create: `app/src/monitor/nfc/gateMinusOneReceipt.ts`
- Create: `app/src/monitor/nfc/gateMinusOneReceipt.test.ts`
- Create: `app/src/monitor/nfc/GateMinusOneProbe.tsx`
- Create: `app/src/monitor/nfc/GateMinusOneProbe.test.tsx`
- Create: `app/src/native/nfcGateMinusOneProbe.ts`
- Modify: `app/src/You.tsx`
- Modify: `app/ios/App/App/Info.plist`
- Create: `app/ios/App/App/App.entitlements`
- Modify: `app/ios/App/App.xcodeproj/project.pbxproj`

**Interfaces:**

- Consumes: `GateNativePort` from `src/native/nfcGateMinusOneProbe.ts`, `crypto.randomUUID`, and operator-entered iPhone/PM5 metadata. The React component imports no Capacitor package.
- Produces: `decodeNfcEvent(value: unknown)`, `matchAdvertisedName(payload, localName)`, `redactNfcRecord(record)`, and `serializeGateReceipt(receiptWithoutVerdict)`.
- Produces: one build-flagged `<GateMinusOneProbe />` mount on You when `VITE_ENABLE_NFC_GATE_MINUS_ONE === "1"`.

`src/native/nfcGateMinusOneProbe.ts` exports this exact injected boundary; plugin callback values cross it as `unknown`:

```ts
export type GateNfcStage = "connect" | "query" | "read";
export type GateRemoveListener = () => Promise<void>;

export interface GateNativePort {
  isNfcSupported(): Promise<boolean>;
  onNfcEvent(listener: (event: unknown) => void): Promise<GateRemoveListener>;
  onNfcSessionEnd(
    listener: (event: unknown) => void,
  ): Promise<GateRemoveListener>;
  currentAppState(): Promise<"foreground" | "background">;
  onAppState(
    listener: (state: "foreground" | "background") => void,
  ): Promise<GateRemoveListener>;
  startNfc(options: {
    attemptId: string;
    alertMessage: string;
    gateMinusOneHoldStage?: GateNfcStage;
  }): Promise<void>;
  stopNfc(attemptId: string): Promise<void>;
  initializeBle(): Promise<void>;
  isBleEnabled(): Promise<boolean>;
  startUnfilteredBleScan(listener: (result: unknown) => void): Promise<void>;
  stopBleScan(): Promise<void>;
  connectBle(deviceId: string, onDisconnect: () => void): Promise<void>;
  disconnectBle(deviceId: string): Promise<void>;
  onGateProgress(
    listener: (event: unknown) => void,
  ): Promise<GateRemoveListener>;
  releaseGateProgress(attemptId: string, stage: GateNfcStage): Promise<void>;
}

export const gateNativePort: GateNativePort;
```

- [ ] **Step 1: Write failing strict-decoder and redaction tests**

Create `gateMinusOneReceipt.test.ts` with literal, independent expectations:

```ts
import { describe, expect, it } from "vitest";
import {
  decodeNfcEvent,
  matchAdvertisedName,
  redactNfcRecord,
  serializeGateReceipt,
} from "./gateMinusOneReceipt";
import type { NfcGateReceiptV1 } from "./gateMinusOneReceipt";

describe("Gate -1 receipt", () => {
  it("rejects malformed bridge bytes", () => {
    expect(() =>
      decodeNfcEvent({
        attemptId: "a",
        tag: { ndefMessage: [{ tnf: 4, type: [256], id: [], payload: [] }] },
      }),
    ).toThrow();
    expect(() =>
      decodeNfcEvent({
        attemptId: "a",
        tag: { ndefMessage: [{ tnf: 4, type: [1.5], id: [], payload: [] }] },
      }),
    ).toThrow();
  });

  it("matches only byte-exact printable ASCII at payload offset seven", () => {
    const payload = [1, 2, 3, 4, 5, 6, 0, 80, 77, 53, 32, 52, 50, 0, 0];
    expect(matchAdvertisedName(payload, "PM5 42")).toStrictEqual({
      decodedName: "PM5 42",
      trailingPayloadBytes: [0, 0],
    });
    expect(matchAdvertisedName(payload, "PM5 4X")).toBeNull();
    expect(matchAdvertisedName(payload, "pm5 42")).toBeNull();
  });

  it("zeros only six address bytes", () => {
    expect(
      redactNfcRecord({
        tnf: 4,
        type: Array.from(new TextEncoder().encode("concept2.com:bleconnectinfo")),
        id: [8],
        payload: [1, 2, 3, 4, 5, 6, 1, 80, 77, 53],
      }),
    ).toStrictEqual({
      tnf: 4,
      type: Array.from(new TextEncoder().encode("concept2.com:bleconnectinfo")),
      id: [8],
      payload: [0, 0, 0, 0, 0, 0, 1, 80, 77, 53],
    });
  });

  it("derives NO-GO and strips untrusted identity fields", () => {
    const receipt = makeCompleteReceipt({ staleACannotAffectB: false });
    Object.assign(receipt, { attemptId: "attempt-a" });
    Object.assign(receipt.attempts[0]!, { deviceId: "device-id" });
    Object.assign(receipt.attempts[0]!.records[0]!, {
      deviceId: "device-id",
    });
    Object.assign(receipt.pm5, { deviceId: "device-id" });
    Object.assign(receipt.readerEndings[0]!, { attemptId: "attempt-a" });
    Object.assign(receipt.criteria, { deviceId: "device-id" });
    const serialized = serializeGateReceipt(receipt);
    expect(JSON.parse(serialized).verdict).toBe("NO-GO");
    expect(serialized).not.toContain("attempt-a");
    expect(serialized).not.toContain("device-id");
  });
});

function makeCompleteReceipt(
  criteriaOverride: Partial<NfcGateReceiptV1["criteria"]> = {},
): Omit<NfcGateReceiptV1, "verdict"> {
  return {
    schema: "ergomatic/nfc-gate-minus-one/v1",
    capturedAtUtc: "2026-09-03T20:00:00.000Z",
    iphone: { model: "iPhone test model", iosVersion: "26.5" },
    pm5: {
      model: "PM5",
      firmware: "test firmware",
      advertisedNameShown: "P",
    },
    signedEntitlement: ["TAG"],
    usageDescription: "Scan a PM5 to connect and program your workout.",
    package: "@capgo/capacitor-nfc@8.2.5",
    attempts: [
      {
        scenario: "normal",
        atUtc: "2026-09-03T20:00:00.000Z",
        capabilityLatencyMs: 12,
        records: [
          { tnf: 4, type: Array.from(new TextEncoder().encode("concept2.com:bleconnectinfo")), id: [], payload: [1, 2, 3, 4, 5, 6, 1, 80, 0] },
        ],
        decodedName: "P",
        liveLocalName: "P",
        trailingPayloadBytes: [0],
        firstMatchingAdvertisementMs: 34,
        matchingAdvertisementIntervalsMs: [77],
        matchingDeviceCount: 1,
        connected: true,
        disconnected: true,
        staleIdDroppedCount: 1,
        staleAttemptSettlementCount: 0,
      },
    ],
    readerEndings: [
      { action: "sheet-cancel", observedReason: "userCancelled" },
      { action: "no-tag-timeout", observedReason: "sessionTimeout" },
      { action: "forced-invalidation", observedReason: "invalidated" },
    ],
    criteria: {
      rawNdefShape: true,
      exactType: true,
      paddingRuleObserved: true,
      exactLocalNameBridge: true,
      pickerFreeBleConnect: true,
      signedReader: true,
      readerEndingSemanticsObserved: true,
      nativeIdentityAndDrain: true,
      staleACannotAffectB: true,
      ...criteriaOverride,
    },
  };
}
```

Import `NfcGateReceiptV1` as a type. The fixture uses independent literals; it does not import production constants to construct the expected verdict or redaction slice.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm --dir app exec vitest run --project client src/monitor/nfc/gateMinusOneReceipt.test.ts
```

Expected: FAIL because the receipt module does not exist.

- [ ] **Step 3: Implement the strict receipt helpers**

Implement these exact rules in `gateMinusOneReceipt.ts`:

```ts
export const PM5_NFC_TYPE_BYTES = Array.from(
  new TextEncoder().encode("concept2.com:bleconnectinfo"),
);

function bytes(value: unknown, field: string): number[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const values = value as unknown[];
  if (
    values.some(
      (item) =>
        !Number.isInteger(item) ||
        (item as number) < 0 ||
        (item as number) > 255,
    )
  ) {
    throw new Error(`Invalid ${field}`);
  }
  return values.map((item) => item as number);
}

export function matchAdvertisedName(
  payload: readonly number[],
  localName: unknown,
) {
  if (typeof localName !== "string" || localName.length === 0) return null;
  const nameBytes = Array.from(localName, (character) =>
    character.charCodeAt(0),
  );
  if (nameBytes.some((value) => value < 0x20 || value > 0x7e)) return null;
  const body = payload.slice(7);
  if (body.length < nameBytes.length) return null;
  if (
    body
      .slice(0, nameBytes.length)
      .some((value, index) => value !== nameBytes[index])
  )
    return null;
  const trailingPayloadBytes = body.slice(nameBytes.length);
  return {
    decodedName: localName,
    trailingPayloadBytes: [...trailingPayloadBytes],
  };
}

export function redactNfcRecord(record: RedactedNfcRecord): RedactedNfcRecord {
  const isPm5 = record.tnf === 4 &&
    record.type.length === PM5_NFC_TYPE_BYTES.length &&
    record.type.every((byte, index) => byte === PM5_NFC_TYPE_BYTES[index]);
  if (isPm5 && record.payload.length < 7) throw new Error("PM5 NFC payload is too short");
  return {
    tnf: record.tnf,
    type: [...record.type],
    id: [...record.id],
    payload: isPm5 ? [0, 0, 0, 0, 0, 0, ...record.payload.slice(6)] : [...record.payload],
  };
}
```

`decodeNfcEvent` additionally requires a nonempty `attemptId`, `tag.ndefMessage` as an array, TNF `0..7`, and `type`, `id`, and `payload` through `bytes`. It does not trust Capgo's declarations at runtime. `serializeGateReceipt` removes all attempt IDs and device IDs by constructing every root, metadata, attempt, record, ending, and criterion field explicitly—no object spread from an input object—then derives the verdict and emits stable two-space-indented JSON ending in one newline.

- [ ] **Step 4: Run the helper tests and mutate each load-bearing rule**

Run the focused test and require PASS. Then, one mutation at a time, use `apply_patch`, rerun, require the named failure, restore, and rerun:

1. Change `payload.slice(6)` to `payload.slice(5)`; `zeros only six address bytes` must fail.
2. Replace the exact byte-mismatch predicate with `false`; `matches only byte-exact printable ASCII` must fail.
3. Replace the named-criterion `.every((key) => criteria[key] === true)` with `.some((key) => criteria[key] === true)`; the NO-GO test must fail.
4. Replace the redactor's explicit four-field object with `{ ...record, payload: [0, 0, 0, 0, 0, 0, ...record.payload.slice(6)] }`; `strips untrusted identity fields` must fail on the injected record-level `deviceId`.

- [ ] **Step 5: Write the failing component test for native-before-radio ordering**

In `GateMinusOneProbe.test.tsx`, mock only `@capgo/capacitor-nfc`, `@capacitor-community/bluetooth-le`, `@capacitor/app`, and `crypto.randomUUID`. Import the real `src/native/nfcGateMinusOneProbe.ts` through the real component and assert this ordered call log:

```ts
expect(calls).toStrictEqual([
  "nfc-capability",
  "app-listener",
  "nfc-listener:nfcEvent",
  "nfc-listener:nfcSessionEnd",
  "app-state:foreground",
  "nfc-start:attempt-a",
  "nfc-stop:attempt-a",
  "nfc-listeners-removed",
  "app-state:foreground",
  "ble-initialize",
  "ble-enabled",
  "ble-requestLEScan:unfiltered:duplicates",
  "ble-stopLEScan",
  "ble-connect:device-a",
  "ble-disconnect:device-a",
]);
```

Also assert that a scan result with `device.name === decodedName` but missing `localName` does not match, a `localName` different from the operator-recorded PM5 name does not match even when it prefixes the payload, two different `deviceId`s with the exact same accepted `localName` set `matchingDeviceCount` to 2 and block connect, and a `stopLEScan` rejection records failure and never calls connect.

- [ ] **Step 6: Run the component test and verify failure**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm --dir app exec vitest run --project client src/monitor/nfc/GateMinusOneProbe.test.tsx
```

Expected: FAIL because the probe component does not exist.

- [ ] **Step 7: Implement the operator-driven probe**

Implement `src/native/nfcGateMinusOneProbe.ts` as the only Capacitor-owning file. Its ordinary methods are these direct translations; listener removers await the plugin handle's `remove()`:

```ts
import { App } from "@capacitor/app";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { registerPlugin } from "@capacitor/core";
import { CapacitorNfc } from "@capgo/capacitor-nfc";
import type { StartScanningOptions } from "@capgo/capacitor-nfc";

interface GateNfcOverlayBridge {
  addListener(
    eventName: "nfcGateProgress",
    listener: (event: unknown) => void,
  ): Promise<{ remove(): Promise<void> }>;
  releaseNfcGateProgress(options: {
    attemptId: string;
    stage: GateNfcStage;
  }): Promise<void>;
}

const gateNfcOverlay = registerPlugin<GateNfcOverlayBridge>("CapacitorNfc");

export const gateNativePort: GateNativePort = {
  async isNfcSupported() {
    return (await CapacitorNfc.isSupported()).supported;
  },
  async onNfcEvent(listener) {
    const handle = await CapacitorNfc.addListener("nfcEvent", listener);
    return async () => handle.remove();
  },
  async onNfcSessionEnd(listener) {
    const handle = await CapacitorNfc.addListener("nfcSessionEnd", listener);
    return async () => handle.remove();
  },
  async currentAppState() {
    return (await App.getState()).isActive ? "foreground" : "background";
  },
  async onAppState(listener) {
    const pause = await App.addListener("pause", () => listener("background"));
    try {
      const resume = await App.addListener("resume", () =>
        listener("foreground"),
      );
      return async () => {
        await Promise.all([pause.remove(), resume.remove()]);
      };
    } catch (error: unknown) {
      await pause.remove();
      throw error;
    }
  },
  async startNfc(options) {
    const nativeOptions: StartScanningOptions & {
      gateMinusOneHoldStage?: GateNfcStage;
    } = {
      attemptId: options.attemptId,
      alertMessage: options.alertMessage,
      iosSessionType: "ndef",
      invalidateAfterFirstRead: false,
      ...(options.gateMinusOneHoldStage
        ? { gateMinusOneHoldStage: options.gateMinusOneHoldStage }
        : {}),
    };
    await CapacitorNfc.startScanning(nativeOptions);
  },
  async stopNfc(attemptId) {
    await CapacitorNfc.stopScanning({ attemptId });
  },
  async initializeBle() {
    await BleClient.initialize();
  },
  async isBleEnabled() {
    return BleClient.isEnabled();
  },
  async startUnfilteredBleScan(listener) {
    await BleClient.requestLEScan({ allowDuplicates: true }, listener);
  },
  async stopBleScan() {
    await BleClient.stopLEScan();
  },
  async connectBle(deviceId, onDisconnect) {
    await BleClient.connect(deviceId, onDisconnect);
  },
  async disconnectBle(deviceId) {
    await BleClient.disconnect(deviceId);
  },
  async onGateProgress(listener) {
    const handle = await gateNfcOverlay.addListener(
      "nfcGateProgress",
      listener,
    );
    return async () => handle.remove();
  },
  async releaseGateProgress(attemptId, stage) {
    await gateNfcOverlay.releaseNfcGateProgress({ attemptId, stage });
  },
};
```

No other event name or plugin method is accepted.

`GateMinusOneProbe.tsx` must:

1. Require nonempty operator fields for iPhone model, iOS version, PM5 model, PM5 firmware, and the advertised name shown by that PM5's **Connect Device** screen before enabling a scenario.
2. Mint one UUID per scenario and never serialize it.
3. Await the app-state handle and both `gateNativePort` NFC listener handles before native start; a registration rejection removes every handle that did resolve and starts no session.
4. Call `gateNativePort.startNfc({ attemptId, alertMessage: "Hold your iPhone near the PM5.", gateMinusOneHoldStage })`; omit the last field for ordinary scenarios and map `stop-during-connect`, `stop-during-query`, and `stop-during-read` to `connect`, `query`, and `read`. The native adapter adds `iosSessionType: "ndef"` and `invalidateAfterFirstRead: false` exactly.
5. On an exact-ID NDEF event, await the native-start acknowledgment before consuming an early record, decode every record, call and await `gateNativePort.stopNfc(attemptId)`, then remove both NFC listeners. The stop-induced ending is not an operator cancellation: installed `NfcPlugin.swift`'s `didInvalidateWithError` calls `notifySessionEnd` before `resolveNdefStopCalls`. Suppress that same-attempt ending during the record handoff, but still reject/count other attempt IDs.
6. Find the one record whose TNF is `4` and whose type bytes exactly equal the literal external type.
7. Call `gateNativePort.initializeBle()`, require `await gateNativePort.isBleEnabled()` to be true, and call `gateNativePort.startUnfilteredBleScan(callback)`. The adapter translates that call only to `BleClient.requestLEScan({ allowDuplicates: true }, callback)`, with no `services`, `namePrefix`, or display options.
8. For each callback, read `result.localName` only for the name and `result.device.deviceId` for identity (installed BLE `ScanResult.device` contract). A result matches only when `result.localName` exactly equals the operator-recorded name shown by this PM5 and `matchAdvertisedName(payload, result.localName)` returns non-null. Store the first matching `deviceId` only in component memory; the receipt stores only elapsed times and the count of distinct matching IDs.
9. Stop after the same matching device produces a second callback. Await `stopLEScan`; if more than one distinct matching device was observed, do not connect. Otherwise connect to the retained ID, then disconnect it, recording both outcomes.
10. Expose **Cancel sample** for a scan that never reaches a second match; it awaits `stopLEScan` and records a failed criterion rather than inventing a timeout.
11. Render raw bytes only on the device screen. **Copy redacted receipt** strictly serializes, writes the redacted JSON to the clipboard, and emits bounded `NFC_GATE_RECEIPT` fragment/end messages. Each export has its own sequence identity and declared base64 length; incomplete, truncated, mixed, duplicate or post-end fragments cannot complete an export. Every native console message remains below Capacitor's installed 4068-character argument cap.
12. Install/rebuild the DEBUG overlay before any held-stage scenario. Each `stop-during-*` scenario waits for A's exact held stage, stops/drains A, then exposes **Export partial receipt**. In contrast, `webview-reload` holds connect and keeps native A live through export and reload; only the old document's listeners are retired. Use the attached Safari Web Inspector's stable-ID controls below while the system reader sheet covers the WebView. Only after export does **Reload WebView** become available; the controller verifies the complete attached-console export before invoking it. Store only `{ scenario, reloadPending: true, priorAttemptId, priorStage, iphone, pm5 }` under `ergomatic:nfc-gate-minus-one`. The next mount validates that metadata and immediately clears storage. **Start B** starts an unheld reader with fresh identity and installs the overlay progress listener; its acknowledged native start replaces/drains any live A before the probe releases only A's held stage. No mount-time release. All old-record, ending, and progress IDs are rejected; B's complete connect/disconnect is required before its conditional stale-A criterion can become true. The controller combines every captured document, retaining failed attempts, and establishes the whole-matrix criterion externally; the unmeasured settlement count remains null.
13. Abort and drain the current NFC or BLE operation on unmount and on the port's foreground-loss callback; call `gateNativePort.currentAppState()` immediately before NFC start and again before BLE initialization so an already-backgrounded app cannot arm either radio operation.

The probe records capability-call start/finish with `performance.now()`. It records each matching-advertisement timestamp relative to `requestLEScan` invocation, so the receipt carries first-match latency and repeat intervals without choosing a product deadline or collision window.

- [ ] **Step 8: Mount the probe only in an explicit diagnostic build**

Add this lazy import near the existing `Concept2LinkProbe` gate in `app/src/You.tsx`:

```tsx
const nfcGateMinusOneEnabled =
  import.meta.env.VITE_ENABLE_NFC_GATE_MINUS_ONE === "1";
const GateMinusOneProbe = nfcGateMinusOneEnabled
  ? lazy(() => import("./monitor/nfc/GateMinusOneProbe"))
  : null;
```

Mount it immediately above the existing diagnostics link:

```tsx
{
  GateMinusOneProbe && (
    <Suspense fallback={null}>
      <GateMinusOneProbe />
    </Suspense>
  );
}
```

No workout-detail, connection-entry, handoff, transport, driver, or product CSS file changes in this task.

- [ ] **Step 9: Add signed NFC configuration after overlapping edits are reconciled**

Add to `Info.plist`:

```xml
<key>NFCReaderUsageDescription</key>
<string>Scan a PM5 to connect and program your workout.</string>
```

Create `app/ios/App/App/App.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.nfc.readersession.formats</key>
  <array>
    <string>TAG</string>
  </array>
</dict>
</plist>
```

Set `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` in both the Debug and Release target build settings in `project.pbxproj`. Do not alter bundle ID, team, version, URL schemes, Bluetooth copy, or any user-owned setting.

In Apple Developer Certificates, Identifiers & Profiles, enable **Near Field Communication Tag Reading** for App ID `haus.waffle.ergomatic`, regenerate the development provisioning profile, and let Xcode download it. If the signed build cannot carry `TAG`, stop with criterion `signedReader: false`; do not bypass signing or treat the plist file alone as evidence.

- [ ] **Step 10: Verify the probe and configuration locally**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm --dir app exec vitest run --project client src/monitor/nfc/gateMinusOneReceipt.test.ts src/monitor/nfc/GateMinusOneProbe.test.tsx
pnpm --dir app typecheck
pnpm --dir app lint
plutil -lint app/ios/App/App/Info.plist app/ios/App/App/App.entitlements
VITE_API_BASE=https://ergomatic.waffle.haus VITE_GOOGLE_IOS_CLIENT_ID=896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304.apps.googleusercontent.com VITE_ENABLE_NFC_GATE_MINUS_ONE=1 pnpm --dir app exec vite build
pnpm --dir app exec cap sync ios
rg -n 'NFCReaderUsageDescription|CODE_SIGN_ENTITLEMENTS|CapgoCapacitorNfc' app/ios/App/App/Info.plist app/ios/App/App.xcodeproj/project.pbxproj app/ios/App/CapApp-SPM/Package.swift
git diff --check
```

Expected: all commands pass; the three `rg` targets each contain their intended configuration.

- [ ] **Step 11: Commit the disposable proof surface as an explicit temporary commit**

Run:

```bash
git rev-parse --show-toplevel
git add app/src/monitor/nfc app/src/native/nfcGateMinusOneProbe.ts app/src/You.tsx app/ios/App/App/Info.plist app/ios/App/App/App.entitlements app/ios/App/App.xcodeproj/project.pbxproj
git commit -m "test: add disposable Phase NF device probe"
```

Expected: the commit message makes its required later deletion unambiguous.

### Task 3: Run the signed PM5 proof walk and write the receipt

**Files:**

- Temporarily modify: installed patched `NfcPlugin.swift` for DEBUG stage observation only
- Create: `docs/monitor/nfc/pm5-tag-gate-minus-one.json`
- Modify: `docs/monitor/nfc/README.md`
- Create: `docs/monitor/sessions/phase-nf-gate-minus-one/receipt.json`
- Create: `docs/monitor/sessions/phase-nf-gate-minus-one/README.md`

**Interfaces:**

- Consumes: the Task 2 diagnostic build, one NFC-capable iPhone, one PM5 with current firmware, and one independently readable second NDEF tag for the multiple-tag invalidation leg.
- Produces: one redacted `NfcGateReceiptV1`, one canonical `RedactedNfcRecord[]` fixture, and one criterion-by-criterion GO/NO-GO report.

- [ ] **Step 1: Invoke the repository hardware-walk operator contract**

Read and use the `hardware-walk` skill. Stop until James says he is physically ready with the iPhone and PM5; do not substitute simulator output for any on-device criterion.

- [ ] **Step 2: Build a known signed device product and inspect its effective entitlement**

Run:

```bash
derived_path=$(mktemp -d /tmp/ergomatic-phase-nf-derived.XXXXXX)
VITE_API_BASE=https://ergomatic.waffle.haus VITE_GOOGLE_IOS_CLIENT_ID=896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304.apps.googleusercontent.com VITE_ENABLE_NFC_GATE_MINUS_ONE=1 pnpm --dir app exec vite build
pnpm --dir app exec cap sync ios
xcodebuild -project app/ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath "$derived_path" build
plutil -extract NFCReaderUsageDescription raw app/ios/App/App/Info.plist
codesign -d --entitlements :- "$derived_path/Build/Products/Debug-iphoneos/App.app"
printf '%s\n' "$derived_path/Build/Products/Debug-iphoneos/App.app"
```

Expected: build succeeds; usage-description output is exactly `Scan a PM5 to connect and program your workout.`; signed entitlements contain `com.apple.developer.nfc.readersession.formats` with exactly `TAG`. Install that exact `.app` through Xcode/devicectl before walking.

- [ ] **Step 3: Record device metadata from authoritative device screens**

On iPhone, copy model and iOS version from Settings > General > About. On the PM5, follow displayed labels through More Utilities if necessary to **Product ID**; that screen displays both model and firmware. Then copy the advertised name shown on **Connect Device**. Enter all five values into the probe before starting a scenario; the serializer refuses blanks.

- [ ] **Step 4: Run the exact-package normal NDEF-to-BLE-connect leg**

With no DEBUG overlay installed:

1. On PM5, open **Connect Device** so the target advertises.
2. In the probe, choose `normal`, start NFC, and hold the iPhone near the PM5.
3. Require at least one record with TNF `4`, type bytes decoding exactly to `concept2.com:bleconnectinfo`, and raw payload bytes visible.
4. Let unfiltered duplicate BLE scanning stop itself on the same matching device's second exact `localName` callback.
5. Require one matching device ID in memory, successful connect, successful disconnect, and no picker/device sheet.
6. Export the redacted receipt immediately. Before any next attempt or reload replaces the latest raw display, compare this attempt's on-screen raw records with its reconstructed export: only PM5 payload indices 0 through 5 may change to zero; index 6, name, padding, type, ID, TNF, and all non-PM5 records must be unchanged. The controller retains that comparison with the captured export.

Failure of any numbered observation sets its matching criterion false; do not retry it into a pass without retaining the failed attempt in `attempts`.

- [ ] **Step 5: Establish the payload boundary without guessing it**

For every normal attempt, compare the live `localName` ASCII bytes with payload bytes beginning at offset 7 (six address bytes plus one address-type byte). Require exact equality for the complete `localName`, record every remaining byte as `trailingPayloadBytes`, and require the same trailing-byte rule across separate fresh NFC/BLE attempts. The documentation names the observed rule literally (for example, the exact repeated byte value and count); it does not generalize beyond the captured PM5 unless the evidence supports that generalization.

- [ ] **Step 6: Observe all three native reader endings on device**

Run three fresh attempts and retain all outcomes:

Choose the probe's **Sheet cancel**, **No-tag timeout**, or **Forced
invalidation** button while idle. Each launches a fresh normal reader attempt
with that action fixed before native start; do not require access to the
underlying WebView after the system reader sheet opens. The probe never calls
`stopScanning` as a substitute for tapping the system sheet's Cancel button.

1. `sheet-cancel`: tap Cancel on the system NFC sheet; expect `userCancelled`.
2. `no-tag-timeout`: present no tag and let Core NFC end the sheet; expect `sessionTimeout`.
3. `forced-invalidation`: first establish that the second tag is independently readable by this NDEF reader; an arbitrary payment card is not evidence of an NDEF tag. Then present the PM5 and that known-readable second NDEF tag together. Require the native singleton-guard message **Present exactly one NFC tag.** as positive evidence that this path ran, and retain its actual mapped ending reason. If the message is not observed, this leg is unproven even if a generic ending arrives.

Set `readerEndingSemanticsObserved` true only when all three actions ran and their actual reasons were retained. Distinct reasons are not required for that criterion: if two actions collapse to the same reason, record the exact collapse and mark the current user-visible copy as requiring a new design approval before a product plan can execute. Do not label guessed causes.

- [ ] **Step 7: Exercise background on the exact package**

With no DEBUG overlay, run `background`: start A, background the app while its NFC sheet is live, resume, and require A to settle/drain before a fresh attempt starts and completes. Neither attempt may leave an NFC sheet or BLE callback alive after completion. The distinct native-live WebView reload leg runs only after Step 8 installs and rebuilds the overlay.

- [ ] **Step 8: Run deterministic stop-during-connect/query/read device legs with a DEBUG-only overlay**

Apply a local, uncommitted DEBUG-only overlay to installed `NfcPlugin.swift` that exposes `nfcGateProgress` at entry to each NDEF connect, query, and read completion closure and holds that closure until a probe-only `releaseNfcGateProgress` call. The event includes only `attemptId` and stage. It is compiled under `#if DEBUG`; no overlay line enters `app/patches/`.

The overlay's complete state and release mechanism is:

All DEBUG dictionaries and held closures share `ndefState.queue`, the current
`NfcSessionCoordinator` queue (installed `NfcPlugin.swift`'s `ndefState` and
`sessionQueue` alias). Invoke `holdGateCallback` only inside that coordinator
context, and assert `ndefState.assertCurrentContext()` there. Dispatch the
connect/query/read completion wrapper onto that same queue before consulting
the hold dictionary or executing the production ownership guard. The release
bridge and start-option registration below also dispatch to `ndefState.queue`;
do not add an independent diagnostic queue.

```swift
#if DEBUG
private var gateHoldStageByAttempt: [String: String] = [:]
private var gateHeldCallbacks: [String: () -> Void] = [:]

private func holdGateCallback(
    attemptId: String,
    stage: String,
    callback: @escaping () -> Void
) -> Bool {
    ndefState.assertCurrentContext()
    guard gateHoldStageByAttempt[attemptId] == stage else { return false }
    gateHeldCallbacks["\(attemptId):\(stage)"] = callback
    DispatchQueue.main.async {
        self.notifyListeners(
            "nfcGateProgress",
            data: ["attemptId": attemptId, "stage": stage],
            retainUntilConsumed: true
        )
    }
    return true
}

@objc public func releaseNfcGateProgress(_ call: CAPPluginCall) {
    guard let attemptId = call.getString("attemptId"),
          !attemptId.isEmpty,
          let stage = call.getString("stage") else {
        call.reject("No held Gate -1 callback.")
        return
    }
    self.ndefState.queue.async {
        guard let callback = self.gateHeldCallbacks.removeValue(
            forKey: "\(attemptId):\(stage)"
        ) else {
            DispatchQueue.main.async {
                call.reject("No held Gate -1 callback.")
            }
            return
        }
        self.gateHoldStageByAttempt.removeValue(forKey: attemptId)
        callback()
        DispatchQueue.main.async { call.resolve() }
    }
}
#endif
```

Under `#if DEBUG`, `startScanning` reads `gateMinusOneHoldStage` and accepts only `connect`, `query`, or `read`. Add `releaseNfcGateProgress` to `pluginMethods` only in DEBUG. At each named closure, wrap the continuation once:

```swift
#if DEBUG
if let gateStage = call.getString("gateMinusOneHoldStage"),
   ["connect", "query", "read"].contains(gateStage) {
    self.ndefState.queue.async {
        self.gateHoldStageByAttempt[attemptId] = gateStage
    }
}
#endif
```

Change the existing `pluginMethods` initializer to a closure and append the method only in DEBUG:

```swift
public let pluginMethods: [CAPPluginMethod] = {
    var methods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startScanning", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScanning", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "erase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "makeReadOnly", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unshare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPluginVersion", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
    ]
    #if DEBUG
    methods.append(CAPPluginMethod(name: "releaseNfcGateProgress", returnType: CAPPluginReturnPromise))
    #endif
    return methods
}()
```

Verify the resulting released-method prefix against the unmodified 8.2.5 source before building.

```swift
#if DEBUG
if holdGateCallback(attemptId: key.attemptId, stage: "connect", callback: continuation) {
    return
}
#endif
continuation()
```

Use `query` and `read` at the corresponding closures. Every `continuation` starts with `guard self.owns(session, key: key) else { return }` so releasing stale A after B starts exercises the production identity guard.

The DEBUG bridge already lives inside the disposable `src/native/nfcGateMinusOneProbe.ts`; the normal scenario never calls either of its two DEBUG-only methods.

After applying the overlay, repeat Step 2's flagged Vite build, Capacitor sync,
Debug Xcode build, entitlement inspection, and installation of that exact app.
Do not reinstall the npm package yet: that would discard the local overlay.
Fresh-launch with `xcrun devicectl device process launch --device <resolved-device> --console haus.waffle.ergomatic`
and verify actual receipt capture in that attached stream. Attach Safari Web
Inspector to this installed app BEFORE starting A and verify the probe document
is selectable; do not infer attachment merely from a Debug build. Installed
Capacitor enables inspection for DEBUG (`CAPInstanceDescriptor.swift`) and sets
`WKWebView.isInspectable` on iOS 16.4+ (`CapacitorBridge.swift`); follow WebKit's
[attached-app inspection instructions](https://webkit.org/web-inspector/enabling-web-inspector/).
If attachment/capture cannot be established, stop the reload leg as unproven.

For each of `connect`, `query`, and `read`:

1. Start A with that stage selected.
2. On `nfcGateProgress(A, stage)`, call and await `gateNativePort.stopNfc(A)`.
3. Export and controller-verify the complete bounded partial receipt, reload the WebView, start B, then call and await `gateNativePort.releaseGateProgress(A, stage)`.
4. Require no A record/end event to settle or clear B, and require B to read normally.
5. Record each exact-ID mismatch rejected by the new document as `staleIdDroppedCount`. `staleAttemptSettlementCount` remains null because it is not measured. Separately capture release acknowledgment and B's complete read/connect/disconnect, paired with Task 1's deterministic native ownership-guard tests; do not sell these observations as a measured zero counter.

Then run the distinct **webview-reload** leg with the overlay still installed:

1. Verify the attached Inspector can evaluate `document.querySelector('[data-nfc-gate-minus-one]') !== null` as `true` before A starts. Choose **Run webview-reload sample** while idle and present the PM5. A holds its connect continuation and its system reader sheet remains live; this leg does NOT call stop/drain A before reload.
2. While that sheet covers the WebView, invoke the existing export control from the attached Inspector console: `document.getElementById('nfc-gate-export').click()`. If agent tools cannot drive Inspector, James may paste this one short command; the controller collects data from the attached console, never asks James to hand-copy receipts. Export emits the complete framed redacted receipt independently of clipboard permission or user activation.
3. Reconstruct and strictly verify every fragment/end envelope from the attached native console. Compare the latest raw display/export before losing the document. Do not advance after a missing/truncated export, sheet timeout, backgrounding, or any observed ending; retain that failed attempt and rerun only as a new retained attempt. No guessed delivery sleep.
4. With native A's sheet still present, invoke `document.getElementById('nfc-gate-reload').click()`. This retires only the old document's listeners and reloads the WebView without restarting the app process. Any listener cleanup failure cancels transfer, stops A, and requires process restart instead of claiming this leg passed.
5. Re-select the new document in Inspector if needed. Native A's sheet may still cover its **Start B** control, so invoke `document.getElementById('nfc-gate-start-b').click()`. B starts unheld with fresh identity; native replacement drains A before B's start acknowledgment, then the probe releases A's held connect continuation. Confirm B reads/connects/disconnects normally and no A event corrupts it. Collect the final export and combine all document partials without discarding failed attempts/endings. This is process-live/native-live WebView replacement evidence, distinct from the already-stopped A legs.

After the three stopped-stage legs and the live-native reload leg, remove the overlay with `apply_patch`, run `pnpm --dir app install --force`, confirm `git diff -- app/patches/@capgo__capacitor-nfc@8.2.5.patch` is empty, and require this command to return no matches:

```bash
rg -n 'nfcGateProgress|releaseNfcGateProgress|gateMinusOneHoldStage' app/node_modules/@capgo/capacitor-nfc/ios/Sources/NfcPlugin/NfcPlugin.swift
```

Then rebuild and repeat the normal leg once on the exact checked-in patch.

- [ ] **Step 9: Materialize and validate the redacted receipt**

Save the serializer output to `docs/monitor/sessions/phase-nf-gate-minus-one/receipt.json`. Run:

```bash
pnpm --dir app exec prettier --check ../docs/monitor/sessions/phase-nf-gate-minus-one/receipt.json
rg -n 'attempt-a|device-id|5FC7DE6B4AEC07' docs/monitor/sessions/phase-nf-gate-minus-one/receipt.json
```

Expected: Prettier passes and `rg` returns no matches. Retain the per-attempt raw/export comparisons made immediately before each next attempt or reload; the probe shows only the latest raw capture, so this final materialization step cannot recover earlier raw displays. Only the identified PM5 address bytes may differ, and non-PM5 records remain byte-for-byte unchanged.

- [ ] **Step 10: Create the canonical native-shaped fixture and correct the NFC README**

Use `apply_patch` to create `docs/monitor/nfc/pm5-tag-gate-minus-one.json` with exactly three keys: `schema` equal to `ergomatic/pm5-nfc-records/v1`, `source` equal to `docs/monitor/sessions/phase-nf-gate-minus-one/receipt.json`, and `records` copied byte-for-byte from the complete redacted `records` array in the first passing `normal` attempt. Reject an empty records array. Update `docs/monitor/nfc/README.md` so the partial Flipper file proves only the header bytes it actually contains, while the new JSON is the canonical complete iPhone/Core NFC capture and names the observed payload-boundary rule.

- [ ] **Step 11: Write the criterion-by-criterion proof report**

Create `docs/monitor/sessions/phase-nf-gate-minus-one/README.md` with exactly these sections:

```markdown
# Phase NF Gate -1 receipt

## Build identity

## Hardware identity

## Commands and signed entitlement

## Raw NDEF shape and payload boundary

## Exact NFC-to-localName comparison

## Unfiltered BLE connect/disconnect

## Reader-ending observations

## A/B ownership and drain scenarios

## Timing observations

## Nine-criterion verdict

## GO/NO-GO
```

The timing section reports every raw `capabilityLatencyMs`, `firstMatchingAdvertisementMs`, and `matchingAdvertisementIntervalsMs` value. It does not choose product constants. The verdict table has exactly nine rows matching `criteria`; every PASS cites a receipt field or command output, and every FAIL states the observed counterexample.

- [ ] **Step 12: Run the proof-document gates and commit the receipt**

Run:

```bash
pnpm --dir app exec prettier --check ../docs/monitor/nfc/pm5-tag-gate-minus-one.json ../docs/monitor/sessions/phase-nf-gate-minus-one/receipt.json
git diff --check
git rev-parse --show-toplevel
git add docs/monitor/nfc docs/monitor/sessions/phase-nf-gate-minus-one
git commit -m "docs: record Phase NF NFC hardware proof"
```

Expected: formatting and diff checks pass, and the commit occurs only in the Phase NF worktree.

### Task 4: Close Gate -1 and remove every disposable seam

**Files:**

- Delete: `app/src/monitor/nfc/gateMinusOneReceipt.ts`
- Delete: `app/src/monitor/nfc/gateMinusOneReceipt.test.ts`
- Delete: `app/src/monitor/nfc/GateMinusOneProbe.tsx`
- Delete: `app/src/monitor/nfc/GateMinusOneProbe.test.tsx`
- Delete: `app/src/native/nfcGateMinusOneProbe.ts`
- Modify: `app/src/You.tsx`
- Conditionally keep or remove: NFC dependency, patch, generated SPM dependency, usage description, entitlement, and Xcode setting
- Modify: `docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md`
- Modify: `ROADMAP.md`

**Interfaces:**

- Consumes: the computed `GO` or `NO-GO` in the committed receipt.
- Produces: a clean branch with no diagnostic route, flag, DEBUG overlay, raw identity, or provisional product behavior.
- Produces on GO: exact observations ready for a separate product implementation plan.
- Produces on NO-GO: durable evidence plus a reopened design, with all premature native configuration removed.

- [ ] **Step 1: Delete the diagnostic UI and restore You's production shape**

Use `apply_patch` to remove the five disposable files and only the `nfcGateMinusOneEnabled`, `GateMinusOneProbe`, and JSX mount added to `You.tsx`. Preserve the pre-existing Concept2 probe and diagnostics row.

- [ ] **Step 2: Prove the disposable seam is absent**

Run:

```bash
rg -n 'GateMinusOneProbe|VITE_ENABLE_NFC_GATE_MINUS_ONE|NFC_GATE_RECEIPT|nfcGateProgress|releaseNfcGateProgress' app app/patches
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
pnpm --dir app dist:grep
```

Expected: `rg` returns no matches; all four gates pass.

- [ ] **Step 3: Apply the verdict branch exactly once**

Read `verdict` from `receipt.json`.

If `GO`, keep the exact dependency, checked-in patch/native tests, SPM dependency, usage description, entitlement, and Xcode setting. Record the observed payload rule and all raw timing observations in the spec; state that the later product-plan author must select named test-injected policy constants from this evidence, with independent literal boundary tests.

If the architecture is GO but reader-ending actions collapsed, also mark the copy delta as awaiting James's rendered Gate 0 approval; do not execute the product plan until that approval exists.

If `NO-GO`, use `apply_patch` plus `pnpm --dir app remove @capgo/capacitor-nfc`, then remove the two `COPY patches ./patches` Docker dependency-cache inputs as part of removing the patch. Run the exact `vite build` plus `cap sync ios` pair below to remove the dependency, patch binding/file, SPM dependency, usage description, entitlement file/reference, and `CODE_SIGN_ENTITLEMENTS`. Keep the redacted receipt, capture, README correction, and report. Change the spec status to NO-GO and name the failed criterion; do not write a product plan.

```bash
VITE_API_BASE=https://ergomatic.waffle.haus VITE_GOOGLE_IOS_CLIENT_ID=896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304.apps.googleusercontent.com pnpm --dir app exec vite build
pnpm --dir app exec cap sync ios
```

- [ ] **Step 4: Update roadmap and next gate without scheduling the feature**

On GO, update Phase NF to `Gate -1 GO; product implementation unscheduled` and link the receipt, approved hardened spec, Gate 0 artifact, and this proof plan. Set the spec's next gate to: write the product implementation plan from the GO receipt, then obtain James's explicit ahead-of/behind-Wave-A scheduling ruling before execution.

On NO-GO, update Phase NF to `Gate -1 NO-GO; returned to design` and link the failing receipt. The next gate is a revised architecture and new Gate 0 only if the revision changes visible interaction.

- [ ] **Step 5: Run final exact-package tests and repository gates**

For GO, run:

```bash
cd app/node_modules/@capgo/capacitor-nfc
xcodebuild -scheme CapgoCapacitorNfc -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' test
cd /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design
pnpm --dir app format:check
pnpm --dir app lint
pnpm --dir app typecheck
pnpm --dir app test
pnpm --dir app build
pnpm --dir app dist:grep
git diff --check
```

For NO-GO, run the same repository commands beginning at `pnpm --dir app format:check`; the native package is intentionally absent.

Expected: every applicable command passes.

- [ ] **Step 6: Commit the closed gate**

Run:

```bash
git rev-parse --show-toplevel
git status --short
git add -A -- ROADMAP.md docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md docs/monitor/nfc docs/monitor/sessions/phase-nf-gate-minus-one app/package.json app/pnpm-lock.yaml app/patches app/ios/App/CapApp-SPM/Package.swift app/ios/App/App/Info.plist app/ios/App/App.xcodeproj/project.pbxproj app/ios/App/App/App.entitlements app/src/You.tsx app/src/monitor/nfc app/src/native/nfcGateMinusOneProbe.ts
git commit -m "docs: close Phase NF Gate -1"
```

Expected: the root is the exact Phase NF worktree, the staged diff contains no disposable probe/overlay, and the commit succeeds.

- [ ] **Step 7: Stop**

Do not implement `Scan NFC`, the product adapter/parser, targeted transport, shared entry owner, handoff, interstitial, haptics, or workout-detail UI. On GO, write the separate atomic product implementation plan using the measured receipt. On NO-GO, return to design.
