# NF-NORMAL-TRACE-v1 — one-attempt NFC diagnostic runsheet

**Status: DRAFT FOR PM REVIEW. This is not authorization to operate the phone
or PM5. A PM PASS on this exact version and James's separate agreement are both
required before the walk.**

WALK PLAN · Observe one fresh PM5 reader activation and automatic evidence capture

Total rowing: 1 diagnostic attempt, 0 min of actual work — hard budget

Piece 1: Normal PM5 NFC handoff — proves whether a fresh reader reaches native
RF-active and then the existing targeted BLE connect/disconnect path — no rowing;
stop after the first terminal result

Captures you'll be asked for: 0

Phone needed: YES because Core NFC, the signed entitlement and native console
delivery are the evidence under test

Recordings: NO — phone walk; native builds cannot produce web recordings. The
controller-owned devicectl console and automatic receipt frames are the evidence;
James captures nothing

Heart rate: NO — it is irrelevant to this diagnostic

## One question and hard limits

Does one fresh normal attempt on the photographed iPhone 17 Pro / PM5
432331249 reach `ndef.rf.active` and produce a complete automatically framed
receipt for the NFC-name-to-picker-free-BLE handoff?

- Wall-clock budget: 8 minutes total, beginning when James says the phone is
  connected and unlocked. The controller stops at 8:00 even if the attempt has
  not settled.
- Attempt budget: exactly 1 normal sample. There is no retry, recovery case,
  background case, held stage, WebView reload, timeout case, Flipper case,
  multi-tag case, workout programming or rowing.
- Operator typing budget: two one-word state acknowledgements (`READY` and
  `VISIBLE`). There are no console commands, pasted scripts, metadata fields,
  receipt copies or manual transcriptions for James.
- Operator capture budget: zero photos, screenshots or downloads.
- A blocked prerequisite, unexpected screen, missing console evidence or the
  hard stop ends the walk. It does not authorize live repair.

## Pinned build

| Item | Frozen value |
| --- | --- |
| Source commit | `7e10d2897a3d9c00685374695410a59213beb679` |
| Artifact | `/tmp/ergomatic-phase-nf-ready.WQJqQu/Build/Products/Debug-iphoneos/App.app` |
| Bundle id | `haus.waffle.ergomatic` |
| App version/build | `0.23.0` / `789` |
| Executable SHA-256 | `bb4e30e5387664b6f8914855ef1aa45280916394d597637871ac80abc2ff8dbf` |
| Probe asset | `GateMinusOneProbe-O_TBUSFS.js` |
| Probe asset SHA-256 | `b333816b7ccf4960c2c7035298f844104af33bff351ac3fb1a18f4c02ffb07a0` |
| Code-sign CDHash | `96d980eec0b53de9446b72589d8e41324224f58a` |
| NFC entitlement | exactly `com.apple.developer.nfc.readersession.formats = [TAG]` |
| Usage text | `Scan a PM5 to connect and program your workout.` |
| Prefill | iPhone 17 Pro / iOS 26.6.1 / PM5 D/E / 459.069 / `PM5 432331249 Row` |

The artifact was built after the full 455/455 E2E pass. Strict/deep code-sign
verification passed, the entitlement and usage text above were read from the
signed artifact, the prefill strings were found in both the built probe asset
and the copied app asset, and `cap sync ios` left the tracked tree unchanged.
The normal flag-off production bundle passed `dist:grep` and contained neither
prefill value nor the prefill variable name.

If the artifact is absent or any executable/probe/signature/entitlement/usage
check differs, this runsheet is invalid. Rebuilding is not a live-walk repair;
the new artifact must be pinned and resubmitted to PM.

## Feasibility ledger

| Required action | Evidence available before the walk | Walk disposition |
| --- | --- | --- |
| Install a signed app by USB | The same phone accepted prior `devicectl` installs; current artifact is signed for the configured development team. Installed `devicectl` help confirms `device install app --device <id> <path>`. | Supported. Abort after 60 s if CoreDevice cannot see `Kaito` or install fails. |
| Launch and capture native + bridged console | The earlier session captured native console through devicectl session 38554. Capacitor's Console bridge prints JavaScript console messages to the native process; installed help confirms `process launch --console` connects standard streams and waits. | Supported. Start capture before asking James to navigate. Missing console attachment is an abort, not a request for Safari Inspector. |
| Reach the probe without typing a URL | Source mounts the flagged probe on the signed-in You screen. James used that probe in the earlier phone session. | Supported only if the update retains the existing signed-in app container. If You is not reachable, abort; do not add login to this walk. |
| Use populated metadata | Focused tests prove all five exact values prefill and arm `Run normal sample`; malformed or partial prefill fails closed. The signed probe contains the frozen values. | Supported. James types nothing and does not edit the fields. |
| Put PM5 in connection mode | Photographic device evidence shows `More Options` and the `Ready for App Connection` screen for PM5 432331249. Two earlier targeted connections succeeded there. | Supported. James uses the same PM5 controls; no invented app control is involved. |
| Start one normal scan | Source shows the exact `Run normal sample` control. Earlier normal scans read this PM5 twice. The native modal covers the WebView after the tap. | Supported. All WebView navigation happens before the tap; James does not swipe, background, reload or reach through the modal. |
| Capture the result without operator copying | The diagnostic build emits allowlisted `NFC_GATE_DIAGNOSTIC` lines and automatically framed `NFC_GATE_RECEIPT` exports before/after terminal cleanup. Native tests prove callback emission when delivered; 108 focused NFC tests prove framing and probe behavior. | Supported as an evidence transport, not as proof that the phone will deliver RF-active. The controller owns and validates the log. |

This ledger distinguishes tool/source feasibility from the one physical fact
the walk is meant to observe. Simulator and native-unit results cannot prove
that this phone delivers `readerSessionDidBecomeActive`; that is why one
bounded device attempt remains necessary.

## Controller preflight — before the clock

No device command runs until PM PASS and James separately agrees. Immediately
before the walk, the controller:

1. Rechecks the artifact path, both SHA-256 values, strict/deep code signature,
   CDHash, usage text and exact TAG entitlement against the pinned table.
2. Rechecks source HEAD is the pinned commit and the worktree is clean.
3. Creates one temporary capture directory and prepares, but does not yet run,
   these installed-tool commands:

       xcrun devicectl device install app --device Kaito --timeout 60 \
         --json-output "$capture_dir/install.json" \
         --log-output "$capture_dir/install.log" "$artifact"

       xcrun devicectl device process launch --device Kaito \
         --terminate-existing --console --timeout 480 \
         --json-output "$capture_dir/launch.json" \
         --log-output "$capture_dir/console.log" haus.waffle.ergomatic

The interactive controller terminal is retained alongside the explicit log
file. No Safari Inspector, browser console, clipboard or user-pasted command is
part of the evidence path.

## Timed execution — exactly one case

### N1 · fresh normal reader and targeted BLE handoff

Starting state supplied with James's separate agreement: iPhone connected by
USB and unlocked; PM5 awake at Main Menu; Flipper put away. The controller
starts the 8-minute clock.

1. **Controller only, target 0:00–1:30.** Confirm CoreDevice sees `Kaito`,
   install the pinned artifact, and launch it with the console command above.
   Abort on discovery, trust, install, launch or console-attachment failure.
2. **One operator instruction, target by 2:30:** “On the PM5, open More Options
   → Connect Device. Leave it on `Ready for App Connection`, then reply
   `READY`.” Stop and wait.
3. **One operator instruction, target by 3:30:** “On the iPhone, tap YOU and
   scroll to `NFC GATE -1 PROBE`, then reply `VISIBLE`.” Stop and wait. If the
   signed-in You screen or probe is absent, abort; do not troubleshoot live.
4. **One operator instruction, target by 4:00:** “Tap `Run normal sample`, then
   hold the phone at the same PM5 NFC spot that worked earlier. Do nothing else;
   I am collecting the result.” Stop. James sends no completion message.
5. **Controller only, through at most 8:00.** Watch for the native diagnostic
   sequence and one complete receipt export. As soon as a terminal result is
   durably captured, end console attachment and tell James the walk is over.
   If it has not settled, stop at 8:00. Do not ask for a retry or another case.

The instruction before the scan is explicit: heart-rate equipment is not
needed, and no rowing is requested.

## Evidence decision made after the single attempt

The controller extracts only lines beginning `NFC_GATE_DIAGNOSTIC ` and
`NFC_GATE_RECEIPT `, preserves their original order, reassembles the last
complete frame envelope with the checked-in strict reassembler, and writes the
result to this session directory. James is not asked to inspect or copy it.

**Positive observation** requires all of the following from this one run:

- one native generation orders `ndef.begin.initiated`,
  `ndef.begin.returned`, then `ndef.rf.active`;
- a complete receipt frame envelope reassembles and strictly serializes;
- the new attempt contains the three expected PM5 NDEF records, decodes and
  live-matches `PM5 432331249 Row`, records one matching device, and records
  both connection and disconnection;
- the receipt records picker-free BLE connection and no stale settlement from
  another attempt.

**Negative observation** is recorded, without retry, if the complete console
trace shows the fresh generation ending before any `ndef.rf.active`, or if an
RF-active attempt reaches a complete terminal receipt that rejects the exact
name/targeted-BLE path.

**Inconclusive** is recorded, without retry, for missing/incomplete controller
capture, unreachable signed-in probe, device/install/launch failure, an
unidentified popup or interference, or the 8-minute hard stop before a complete
terminal observation.

None of the three outcomes closes all nine Gate -1 criteria or authorizes
product implementation. It answers only the question at the top and determines
the next desk decision. Any further hardware question requires a new bounded
runsheet, a new PM PASS and James's separate agreement.

## Close-out

The controller tells James the walk is over immediately after the first
terminal result or hard stop, terminates the console attachment, validates and
redacts the captured frames, records artifact/case/outcome provenance in this
directory, and commits the evidence on this branch. There is no web lab or
Docker stack to tear down.
