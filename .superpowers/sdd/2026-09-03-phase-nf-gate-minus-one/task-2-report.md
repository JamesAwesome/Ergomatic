# Task 2 — disposable Phase NF device probe

## Change

Implemented the build-flagged `GateMinusOneProbe` on You, its injected
Capacitor boundary, strict NFC receipt decoding/redaction/serialization, and
local iOS NFC plist/entitlements/project settings. The probe keeps raw NDEF
bytes on-device, redacts the receipt, and records `signedReader: false` until
the separate signed-device walk proves the provisioned `TAG` entitlement.

## RED / GREEN

- RED — `gateMinusOneReceipt.test.ts`: failed exactly because
  `./gateMinusOneReceipt` did not exist.
- GREEN — focused receipt suite: 4/4 passed.
- RED — `GateMinusOneProbe.test.tsx`: failed exactly because
  `./GateMinusOneProbe` did not exist.
- GREEN — focused component suite: 3/3 passed. It exercises native-before-BLE
  ordering, exact `localName` matching/collision blocking, and rejected scan
  stop with no connect.

## Self-mutation evidence

Receipt helper mutations, each applied with `apply_patch`, failed the named
test and were restored before the next mutation:

1. `payload.slice(6)` → `payload.slice(5)` failed `zeros only six address
   bytes` (the sixth address byte leaked).
2. Exact name byte mismatch predicate → `false` failed `matches only
   byte-exact printable ASCII at payload offset seven` (`PM5 4X` accepted).
3. Verdict `.every(...)` → `.some(...)` failed `derives NO-GO and strips
   untrusted identity fields` (`GO` received instead of `NO-GO`).
4. Explicit redactor object → `{ ...record, payload: ... }` failed the same
   identity test because injected record `deviceId` serialized.

Component mutations, each applied with `apply_patch`, failed and were restored:

1. Operator local-name equality guard → `false` failed the collision test:
   a prefix-only local name produced `Matching device count: 1` rather than 0.
2. Second-match predicate `>= 2` → `> 2` failed ordered native/radio proof:
   no scan stop/connect/disconnect occurred after two callbacks.
3. The `stopLEScan`-rejection early return → `if (false) return` failed the
   rejection proof because `ble-connect:device-a` occurred.

## Gates

- Focused client tests: PASS — 2 files, 7 tests.
- `pnpm --dir app typecheck`: PASS — includes `E2E TypeScript membership: 19/19`.
- `pnpm --dir app lint`: PASS.
- `pnpm --dir app format:check`: PASS.
- `plutil -lint app/ios/App/App/Info.plist app/ios/App/App/App.entitlements`: PASS.
- Diagnostic-flag Vite build: PASS — emitted `GateMinusOneProbe-*.js`.
- `pnpm --dir app exec cap sync ios`: PASS — reports
  `@capgo/capacitor-nfc@8.2.5` and rewrote no tracked configuration outside
  this task.
- Configuration grep: PASS — Info.plist contains
  `NFCReaderUsageDescription`, both target configurations contain
  `CODE_SIGN_ENTITLEMENTS`, and Package.swift contains `CapgoCapacitorNfc`.
- `git diff --check`: PASS.
- Full unit/client suite: PASS — 233 files, 6621 passed, 1 skipped.
- `pnpm e2e`: BLOCKED before Playwright by the baseline Docker build:
  `pnpm install --frozen-lockfile` cannot open
  `/app/patches/@capgo__capacitor-nfc@8.2.5.patch`. Dockerfiles copy the
  manifest/lockfile before install but not the required `patches/` directory.
- `pnpm screenshots`: blocked by the identical Docker build prerequisite, so
  no captures existed to inspect. No Dockerfile/compose changes were made
  because they are outside this task's owned files.

## Files and coverage

- `app/src/monitor/nfc/gateMinusOneReceipt.ts` — covered by the four strict
  decoder/name/redaction/serialization tests above.
- `app/src/monitor/nfc/GateMinusOneProbe.tsx` — covered by three native
  ordering/matching/error tests; no direct Capacitor imports.
- `app/src/native/nfcGateMinusOneProbe.ts` — compile checked; native-only
  adapter boundary is excluded from browser coverage by repository policy.
- `app/src/You.tsx` — compile/build checked; the lazy mount is gated solely by
  `VITE_ENABLE_NFC_GATE_MINUS_ONE === "1"`.
- `app/ios/App/App/Info.plist`, `App.entitlements`, and
  `project.pbxproj` — validated by `plutil`, `cap sync`, and configuration
  grep.

## External signing limitation

Local files configure `TAG`, but the Apple Developer portal capability,
regenerated development profile, downloaded Xcode profile, and a signed
device build have not been verified here. This task does **not** claim that a
signed build carries `TAG`; the receipt remains NO-GO (`signedReader: false`)
until Task 3's hardware walk verifies it.

## Commit

`3d2c91ce` — `test: add disposable Phase NF device probe`

## Fix round 1 (in progress)

- RED: the prior root-`deviceId` component fixtures no longer satisfy the
  installed adapter contract; the focused suite failed before a nested-device
  implementation could connect. GREEN: real `ScanResult` fixtures now use
  `result.device.deviceId`, `result.localName`, and a root-only ID is ignored.
- GREEN: focused receipt/probe suite currently has 8 tests. It covers bounded
  receipt framing through a logger that truncates every message at 4068
  characters and rejects incomplete frame collections; the serializer uses
  only the named nine criteria and whitelist-decodes reader endings.
- GREEN: the sidecar redaction regression preserves a short non-PM5 record
  byte-for-byte and rejects a short identified PM5 record; only the exact PM5
  external-type record gets six address bytes redacted.
- GREEN: `pnpm --dir app typecheck` and `git diff --check` pass at this point.
- Dockerfile now copies `patches/` into both frozen-install dependency cache
  layers. Docker RED/GREEN and E2E/screenshots remain to run serially.
- Plan correction: Task 3 now requires bounded partial-frame collection and
  controller verification before reload; firmware is read on Product ID;
  Task 4 NO-GO removes both Docker patch-copy lines with the patch.
