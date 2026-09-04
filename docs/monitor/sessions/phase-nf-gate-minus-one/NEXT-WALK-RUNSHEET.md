# NF-NORMAL-TRACE-v5 — hardened one-attempt NFC diagnostic runsheet

**Authorization gate: this exact version may run only after a PM explicitly
returns PASS for `NF-NORMAL-TRACE-v5` and James separately agrees. Neither this
file nor its commit authorizes operation of the phone or PM5.**

WALK PLAN · Observe one fresh PM5 reader activation and automatic evidence capture

Total rowing: 1 piece, 0 min of actual work — hard budget

Piece 1: Normal PM5 NFC handoff — one reader start, one tag presentation, one
targeted BLE connect/disconnect observation; no retry and no rowing

Captures you'll be asked for: 0

Phone needed: YES because the physical Core NFC callback and signed native app
are the facts under test

Recordings: NO — the controller captures the attached native console and emits
the decision; James captures and copies nothing

Heart rate: NO — do not connect or wear heart-rate gear

## One question and hard limits

Does one fresh normal attempt on the photographed iPhone 17 Pro / PM5
432331249 reach `ndef.rf.active` and complete the exact
NFC-name-to-picker-free-BLE path?

- The clock starts before USB/unlock setup and stops at 8:00. At 7:15 the
  controller ends observation and begins the reserved cleanup path regardless
  of apparent success.
- Exactly one normal NFC sample is allowed. There is no retry, recovery,
  background, timeout, held, reload, Flipper, multi-tag, programming or rowing
  case.
- James sends only `READY`, `PM5`, and `VISIBLE`. There are no commands,
  scripts, URLs, metadata, screenshots, receipts or transcriptions for him.
- At most 12 physical actions are allowed: USB (1), unlock (1), wake PM5 (1),
  More Options (1), Connect Device (1), YOU (1), at most three scroll gestures,
  Run normal sample (1), one tag presentation/hold (1), and one reserved
  side-button lock only if verified controller cleanup fails (1).
- A trust prompt, login flow, unidentified popup, extra scroll, missing
  evidence, prerequisite failure or deadline aborts the walk. No live repair or
  scope expansion is allowed.

## Pinned inputs

| Item | Frozen value |
| --- | --- |
| Artifact source commit | `7e10d2897a3d9c00685374695410a59213beb679` |
| Controller code commit | `f0688c44a3c870c1ffdc9cc09c909929411dba85` |
| Artifact | `/tmp/ergomatic-phase-nf-ready.WQJqQu/Build/Products/Debug-iphoneos/App.app` |
| Bundle id | `haus.waffle.ergomatic` |
| App version/build | `0.23.0` / `789` |
| Executable SHA-256 | `bb4e30e5387664b6f8914855ef1aa45280916394d597637871ac80abc2ff8dbf` |
| Probe asset | `GateMinusOneProbe-O_TBUSFS.js` |
| Probe SHA-256 | `b333816b7ccf4960c2c7035298f844104af33bff351ac3fb1a18f4c02ffb07a0` |
| Classifier | `app/scripts/nfc-gate-console-receipt.ts` |
| Classifier SHA-256 | `3f5f80ce914d54c410d86948416729edc79848c99663656af3c87439783f1739` |
| Controller | `app/scripts/nfc-normal-trace-controller.ts` |
| Controller SHA-256 | `d51850bf6053301c1319175fc8a10c6758f98ff63f997a1c14a85c98bb38eab5` |
| Code-sign CDHash | `96d980eec0b53de9446b72589d8e41324224f58a` |
| NFC entitlement | exactly `com.apple.developer.nfc.readersession.formats = [TAG]` |
| Usage text | `Scan a PM5 to connect and program your workout.` |
| Prefill | iPhone 17 Pro / iOS 26.6.1 / PM5 D/E / 459.069 / `PM5 432331249 Row` |

The artifact is the already verified build: focused NFC 108/108, static gates,
normal flag-off build/dist-grep, full browser E2E 455/455 with teardown, strict
code-sign verification, exact entitlement/usage text and unchanged `cap sync
ios`. Controller-only files are outside the signed artifact. Any artifact hash,
signature, entitlement, usage, probe hash, controller hash or allowed source
diff mismatch invalidates this runsheet; rebuilding is not a walk repair.

## Feasibility rulings

| Required mechanism | What is established | Fail-closed boundary |
| --- | --- | --- |
| Install signed app by USB | This phone previously accepted `devicectl` installation; installed help specifies `device install app`. | Abort at 60 s or on any CoreDevice/install failure. |
| Attached console capture | This phone previously delivered the app console through `process launch --console`; installed help says it connects standard streams and waits. | The controller sends stdout and stderr directly to one file. It does not combine `--log-output` with console capture. Missing capture is inconclusive. |
| Bundle-scoped cleanup | Installed help specifies bundle launch with `--terminate-existing`, `--start-stopped`, JSON output, PID termination and process listing. The exact composed path has not yet run on this phone. | Before PM5/NFC work, the controller launches a suspended replacement for the exact bundle, requires exactly one PID from that bundle-specific launch result, kills it, and proves that PID absent. Failure aborts before the attempt. |
| Probe navigation and metadata | Earlier phone work reached this probe; focused tests prove exact all-or-nothing prefill in the signed asset. | Missing signed-in YOU/probe or any extra input aborts. |
| PM5 connection mode and tag | Photos establish More Options, Connect Device and PM5 432331249; two earlier reads and targeted connections succeeded. | One ordinary presentation only; no invented PM5 control or Flipper. |
| Evidence classification | Unit tests cover Capacitor-decorated producer output, multiple complete exports, truncated newest export, absent/malformed/wrong-generation/unordered diagnostics and positive/negative/inconclusive outcomes. | The controller freezes the file only after cleanup, selects the newest-started export, never falls back past a newer incomplete export, and publishes `evidence.json` only by atomic rename. |

The cleanup rehearsal is intentionally the only unproved CLI composition and
happens after James's agreement but before he touches the PM5. It is bounded by
the same eight-minute clock. Its failure spends no NFC attempt and cannot turn
into troubleshooting.

## Controller preflight — before the clock

No device command runs during preflight. From the Phase NF worktree, run this
as one noninteractive zsh program. `set -Eeuo pipefail` and the failure trap make
every check fail closed; the temporary directory is created only after all
checks pass.

```zsh
set -Eeuo pipefail
trap 'preflight_code=$?; (( preflight_code == 0 )) || print -u2 "NFC walk preflight failed ($preflight_code)"' EXIT

artifact=/tmp/ergomatic-phase-nf-ready.WQJqQu/Build/Products/Debug-iphoneos/App.app
probe="$artifact/public/assets/GateMinusOneProbe-O_TBUSFS.js"
expected_root=/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design

test "$(git rev-parse --show-toplevel)" = "$expected_root"
test -z "$(git status --porcelain)"
git diff --exit-code f0688c44a3c870c1ffdc9cc09c909929411dba85 -- app
git diff --exit-code 7e10d2897a3d9c00685374695410a59213beb679 -- \
  app \
  ':(exclude)app/scripts/nfc-gate-console-receipt.ts' \
  ':(exclude)app/scripts/nfc-gate-console-receipt.test.ts' \
  ':(exclude)app/scripts/nfc-normal-trace-controller.ts' \
  ':(exclude)app/scripts/nfc-normal-trace-controller.test.ts'
test "$(shasum -a 256 "$artifact/App" | awk '{print $1}')" = \
  bb4e30e5387664b6f8914855ef1aa45280916394d597637871ac80abc2ff8dbf
test "$(shasum -a 256 "$probe" | awk '{print $1}')" = \
  b333816b7ccf4960c2c7035298f844104af33bff351ac3fb1a18f4c02ffb07a0
codesign --verify --deep --strict "$artifact"
test "$(plutil -extract NFCReaderUsageDescription raw "$artifact/Info.plist")" = \
  'Scan a PM5 to connect and program your workout.'
entitlements=$(codesign -d --entitlements :- "$artifact" 2>/dev/null)
test "$(print -r -- "$entitlements" | plutil -convert json -o - - | \
  jq -c '."com.apple.developer.nfc.readersession.formats"')" = '["TAG"]'
test "$(codesign -d --verbose=4 "$artifact" 2>&1 | \
  awk -F= '/^CDHash=/{print $2}')" = \
  96d980eec0b53de9446b72589d8e41324224f58a
test "$(shasum -a 256 app/scripts/nfc-gate-console-receipt.ts | awk '{print $1}')" = \
  3f5f80ce914d54c410d86948416729edc79848c99663656af3c87439783f1739
test "$(shasum -a 256 app/scripts/nfc-normal-trace-controller.ts | awk '{print $1}')" = \
  d51850bf6053301c1319175fc8a10c6758f98ff63f997a1c14a85c98bb38eab5
capture_dir=$(mktemp -d /tmp/ergomatic-nf-normal-trace.XXXXXX)
print -r -- "CAPTURE_DIR=$capture_dir"
```

Do not run the controller unless the block prints one `CAPTURE_DIR` and exits
zero. Any edit to this runsheet after PM review requires a new PM verdict even
when the signed artifact and controller are unchanged.

## Timed execution — the controller is the procedure

After PM PASS and James's separate agreement, run exactly:

```zsh
pnpm --dir app exec tsx scripts/nfc-normal-trace-controller.ts run "$capture_dir"
```

The checked-in controller is one process and one clock. It owns every variable,
timeout, child process, capture path, cleanup route and atomic decision write;
there are no dedicated-shell snippets to reconstruct live.

Its only operator exchanges, in order, are:

1. “Connect the iPhone by USB and unlock it, then reply `READY`.” Stop and wait.
2. Controller only: install the pinned app; execute the suspended
   bundle-replacement cleanup rehearsal; start a fresh attached console launch.
   Any failure aborts before PM5/NFC work.
3. “Wake the PM5, open More Options > Connect Device, leave it on Ready for App
   Connection, then reply `PM5`.” Stop and wait.
4. “On the iPhone, tap YOU and scroll to NFC GATE -1 PROBE, then reply
   `VISIBLE`.” Stop and wait.
5. “No heart-rate gear or rowing is needed. Tap Run normal sample, then hold the
   phone at the same PM5 NFC spot that worked earlier. Do nothing else; I am
   collecting the result.” Stop. James sends no completion message.
6. Controller only: at 7:15, use `--terminate-existing --start-stopped` on the
   exact bundle, extract exactly one replacement PID from that launch's JSON,
   kill it, prove that PID absent, stop/reap the attached host process, freeze
   the console, classify, and atomically publish `evidence.json` by 8:00.

All pre- and post-launch errors converge on that bundle-scoped cleanup. If it
cannot be verified, the only fallback instruction is “Press the iPhone side
button once to lock it; no reply needed.” Lock is containment, not claimed
process termination; the result is inconclusive and process state is recorded
unknown.

## Mechanical decision

The controller, not a human reading the log, returns one outcome:

- **Positive:** the frozen log contains only native generation 1 and exactly
  one ordered `ndef.begin.initiated`, `ndef.begin.returned`, and
  `ndef.rf.active`; the newest receipt envelope is complete and canonical; it
  contains exactly one normal attempt with the exact three PM5 records,
  16-byte zero padding, decoded and live name `PM5 432331249 Row`, exactly one
  matching device, connection, disconnection and picker-free BLE success.
- **Negative:** the same fresh RF-active diagnostic proof and exactly one
  normal receipt exist, but the mechanically checked PM5-name/record/targeted
  BLE path rejects one or more required values. No retry follows.
- **Inconclusive:** capture, framing, diagnostics, freshness, attempt count,
  controller lifecycle or cleanup proof is absent, malformed, duplicated,
  unordered or incomplete. Missing unframed diagnostics are never negative
  evidence. A truncated newest export cannot fall back to an older one.

This outcome answers only the question at the top. It does not close all nine
Gate -1 criteria or authorize product implementation. Any later hardware
question needs a new bounded runsheet, PM PASS and James's separate agreement.

## Close-out

The controller tells the operator when it has exited; Codex then tells James the
walk is over. Codex records the frozen artifact/controller/case/outcome
provenance and redacted evidence in this directory. There is no browser lab,
Docker stack, screenshot, receipt copy or additional hardware case to close.
