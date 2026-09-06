# NF-NORMAL-TRACE-v7 — grouped setup and one normal sample

**Completed: one attempt, INCONCLUSIVE; cleanup verified.**
PM `/root/walk_pm` approved v7 and James explicitly authorized it. The attempt
budget is exhausted; this retained runsheet authorizes no retry. See
`NORMAL-TRACE-V7-RESULT.md`.

**Post-run correction:** Codex terminated capture on “i did it,” before a
complete receipt or the observation deadline. That was an execution error.
This historical procedure also omitted the existing Cancel sample route for
exporting a no-match result. Its desk check passes; its reachability in the
phone's post-reader UI has not been demonstrated by this run. Do not reuse v7
as a ready walk. A future revision needs that action feasibility accounted for
and its own PM readiness verdict before any hardware invitation.

James has now reported being on YOU and confirmed Run normal sample is visible
and enabled. He explicitly requests blocks of instructions instead of one-tap
exchanges. That latest instruction supersedes the earlier pacing rule. The
approved product design, installed artifact and host controller are unchanged.

Installation and command rehearsal are complete. Codex gives two short blocks,
collects the console and requires only one further reply granting the single
scan. Reporting readiness for setup is still not scan consent.

## Purpose and cost

One question: on this iPhone 17 Pro / iOS 26.6.1 and PM5 432331249, does one
fresh normal attempt report `ndef.rf.active`, read the known records, and
connect/disconnect the exact live Bluetooth name without a picker?

The old receipts lack the new native RF-active trace. Desk tests can check
callback handling and classification, but cannot establish its physical
producer. This is one diagnostic sample, not the remaining Gate -1 matrix.

- One NFC attempt, one tag presentation, zero retries. No programming, rowing,
  heart rate, recovery, reload, background gesture, Flipper or multi-tag case.
- No console typing, pasted commands, metadata entry, screenshots, receipt
  copying or exports for James. Codex collects and classifies the console.
- Agent preparation is recorded with actual elapsed time in
  `OPERATOR-WORKFLOW-V6.md`, including installation, debugging, review and the
  debugger interruption. It is not advertised as part of a short scan alone.
- Before giving the setup block, Codex states preparation already spent and
  records the **eight-minute total remaining operator wall-clock cap**,
  starting at delivery of that block.
  This cap includes UI confirmation, chat delivery/waiting, PM5 setup,
  observation, cleanup and wrap-up. No install, rebuild or live repair fits
  inside it. A resumed session never silently resets that clock.
- There is no 45-second reply deadline or other per-message timer, and no
  process waits for a chat acknowledgement. Codex records the setup-block
  timestamp; capture receives that timestamp plus eight minutes as its explicit
  ISO deadline, so setup and chat waiting are counted rather than reset. If
  fewer than two minutes remain on the go reply, do not start capture or NFC.
  There is no automatic restart or retry. Observation ends 45 seconds before
  the total deadline; an already complete result can finish sooner.

## Prepared artifact

| Input | Pinned value |
| --- | --- |
| Source | `7e10d2897a3d9c00685374695410a59213beb679` |
| Artifact | `/tmp/ergomatic-phase-nf-ready.WQJqQu/Build/Products/Debug-iphoneos/App.app` |
| Bundle / version / build | `haus.waffle.ergomatic` / `0.23.0` / `789` |
| Executable SHA-256 | `bb4e30e5387664b6f8914855ef1aa45280916394d597637871ac80abc2ff8dbf` |
| Probe asset | `GateMinusOneProbe-O_TBUSFS.js` |
| Probe SHA-256 | `b333816b7ccf4960c2c7035298f844104af33bff351ac3fb1a18f4c02ffb07a0` |
| CDHash | `96d980eec0b53de9446b72589d8e41324224f58a` |
| NFC entitlement | exactly `[TAG]` |
| Usage text | `Scan a PM5 to connect and program your workout.` |
| Prefill | iPhone 17 Pro / 26.6.1 / PM5 D/E / 459.069 / `PM5 432331249 Row` |
| Classifier SHA-256 | `3f5f80ce914d54c410d86948416729edc79848c99663656af3c87439783f1739` |

Source and artifact checks, installation, installed-app listing, console
transport and bundle cleanup were performed on 2026-09-04; see the preparation
record. Installed identity means the verified source artifact was accepted by
CoreDevice and its installation URL matches the independently listed bundle,
version and build. It is not a readback hash of the phone executable.

The classifier and signed artifact are unchanged. Reuse their recorded gates;
do not rerun browser E2E, native builds or the whole NFC suite for this host
controller fix. Hash/signature mismatch, changed installed URL/identity or
changed product source stops preparation.

## Action feasibility and current unresolved state

| Action / starting state | Evidence | Boundary |
| --- | --- | --- |
| Install app without James typing | Actual `devicectl device install app` succeeded; matching bundle/version/build/installation URL independently listed. | Already done. Do not ask James to install or reconnect USB. |
| Attach console to a fresh process | Actual `--terminate-existing --console` captured WebView loaded and native bridge output. | Launch JSON is written only when the attached process exits; never use its absence during capture as launch failure. Require positive WebView-loaded output and a live host before a scan. |
| Stop the app | Actual suspended bundle replacement, PID termination and unfiltered process listing proved old and replacement PIDs absent. | No process-name guessing or unsupported NSURL predicate. |
| YOU and probe, no modal present | Earlier device sessions reached this probe; `You.tsx` mounts the flagged component, whose normal button is enabled only with complete metadata and idle state. The signed asset contains the known prefill. | James reported YOU and then confirmed Run normal sample visible/enabled after this installation. Fresh capture still relaunches the app; block 2 requires that same visible/enabled state again, or stop. |
| PM5 More Options / Connect Device | Prior photographed PM5 and two recorded normal handoffs, `REPAIRED-NORMAL.md` and `background-final-receipt.json`. | Use the grouped menu path in block 1; do not assume NFC powers up or configures the PM5. |
| Normal button before native modal | Prior ordinary sample completed; control and handler unchanged in signed source. | Only after the current button is visible/enabled and James separately agrees to one scan. |
| Present phone to same PM5 NFC spot with modal live | Two prior physical read/connect/disconnect samples on this phone/PM5. | No app taps or Home gesture through the modal. Stop after one presentation. |

The debugger used for desk screen inspection paused the app and James reported
it unresponsive. It was detached and an ordinary foreground launch succeeded;
no debugger or inspection console remains. This inspection did not establish
current DOM contents. No further debugger inspection is part of the procedure.

## Operator sequence — two short blocks

Prepare the entire sequence before delivering block 1. No product code, build,
install, debugger, extra test or live repair follows. Record the setup-block
send time and the total deadline. Exactly one further short reply is requested.

**Block 1 — setup and explicit scan consent**

1. Wake the PM5 and choose More Options → Connect Device.
2. Leave it on Ready for App Connection; leave Run normal sample untouched.
3. Reply **go** when the PM5 is ready and you authorize the one-scan test.

The invitation states the measured preparation time already spent and the
remaining eight-minute cap, zero rowing/HR, one scan and no retry. This is one
explicit scan decision, required by James's earlier instruction; it is not
another design approval. If he reports readiness without scan authorization,
do not treat it as consent. No short timer is waiting for his reply.

**Codex between blocks — no operator work**

After the go reply, check remaining time, launch the already-tested direct
Node capture against the existing prepared installation and original total
deadline, and record its PID. Require the host to remain live and the new log
to contain WebView loaded. Read only allowlisted output. If attach or identity
verification fails, stop and release James; no repair/rebuild/retry.

**Block 2 — the single sample, delivered only after capture is ready**

1. On the relaunched phone app, open YOU and scroll to NFC GATE -1 PROBE
   (at most three scrolls). If Run normal sample is missing/disabled or a login
   or unexpected popup appears, stop and reply **blocked**.
2. Tap Run normal sample once, then immediately hold the phone at the same
   PM5 NFC spot used successfully earlier. No chat exchange splits the tap and
   tag presentation. Do not tap anything through the native sheet.
3. Wait while Codex collects the result. Do not scan again or row.

Tap then present is the previously demonstrated ordinary NFC sequence. Actual
RF activation remains the evidence target, not an assumed prerequisite or a
reason to hold James at a live native sheet waiting for a chat response.

Codex finishes as soon as a complete conclusive receipt is available, or at the
observation deadline. Signal the exact controller PID to run cleanup, freeze
and classify. Missing activation/receipt, cancelled/expired sheet, capture loss
or failed cleanup is inconclusive; no retry. If cleanup is unverified, the only
fallback is one side-button lock. Report unknown process state, never pretend
locking proves termination. Tell James he is done and record the actual total
operator duration including both setup and chat waiting.

## Controller use (Codex only)

From worktree `app/`, use Node 26 directly:
`node --import tsx scripts/nfc-normal-trace-controller.ts`. The commands below
are its arguments, never instructions for James. Avoid the pnpm wrapper for
retained capture because its PID/signal status can differ from the controller.

`prepare <directory>` installs, verifies the installed identity and rehearses
cleanup; it exits and asks for no operator input. Preparation already performed
in this session must not be repeated just to manufacture a new receipt.

`capture <directory> <deadline-ISO>` checks the prepared installation, attaches
one fresh console, and observes until the explicit deadline's cleanup reserve.
It never prints scan instructions and never reads human acknowledgements.
Codex can signal the exact controller PID with SIGINT to finish and classify
early. Do not send PTY Ctrl-C: it can also signal the console child. Record the
controller PID at launch. Use the real command only
after PM review and the agreed operator-session deadline exists.

Private setup and console evidence belongs to Codex in the existing preparation
directory named in `OPERATOR-WORKFLOW-V6.md`; raw native console may include
secure-storage output and must not be pasted or committed. Publish only the
classifier's redacted diagnostics/frames/receipt and a concise provenance
record under this session directory.

## Decision and stopping

The unchanged `nfc-gate-console-receipt.ts` requires generation 1, ordered
begin/return/RF-active events and exactly one normal receipt. Exact known PM5
records/padding/name plus one matching BLE connect/disconnect is positive;
an RF-active complete attempt rejecting those values is negative. Missing,
malformed, stale, truncated, duplicated or incomplete evidence is inconclusive.
A newer incomplete export never falls back to an older complete one.

Missing capture, process exit, identity mismatch, unknown UI, unexpected prompt,
exhausted time or any extra attempt stops the walk. Preserve what exists and
release James; no rebuild, debugger, live repair or additional case. This result
cannot close all nine Gate -1 criteria or authorize product implementation.
