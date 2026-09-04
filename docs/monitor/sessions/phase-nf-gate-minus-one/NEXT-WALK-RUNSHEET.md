# NF-NORMAL-TRACE-v6 — one normal sample after completed setup

**PM PASS: zero-scan screen description only. Normal sample NOT READY.**
Reviewer `/root/walk_pm`, 2026-09-04. No scan is authorized. James has authorized preparation
and installation. Agreeing to setup, reporting a screen, or saying the app is
responsive does not authorize NFC. The product design remains approved and
product implementation remains gated on incomplete hardware evidence.

This replaces v5's timed chat acknowledgements. Installation and command
rehearsal finish before a scan invitation. Codex gives one physical instruction
at a time in chat; no controller waits for READY, VISIBLE or PM5 input.

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
- Before inviting the normal sample, Codex states the preparation time already
  spent and the remaining **eight-minute total operator wall-clock cap**.
  This cap includes UI confirmation, chat delivery/waiting, PM5 setup,
  observation, cleanup and wrap-up. No install, rebuild or live repair fits
  inside it. A resumed session never silently resets that clock.
- There is no 45-second reply deadline or other per-message timer. An inactive
  chat has no pending stdin handshake. The agreed total deadline is an ISO
  timestamp supplied explicitly to `capture`; observation ends 45 seconds
  before it. If chat consumes the budget, stop before scanning.

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
| YOU and probe, no modal present | Earlier device sessions reached this probe; `You.tsx` mounts the flagged component, whose normal button is enabled only with complete metadata and idle state. The signed asset contains the known prefill. | Current rendered screen and enabled normal button have NOT been observed after this installation. Do not present them as verified. First obtain a simple screen observation; no NFC during that check. |
| PM5 More Options / Connect Device | Prior photographed PM5 and two recorded normal handoffs, `REPAIRED-NORMAL.md` and `background-final-receipt.json`. | One menu action per instruction; do not assume NFC powers up or configures the PM5. |
| Normal button before native modal | Prior ordinary sample completed; control and handler unchanged in signed source. | Only after the current button is visible/enabled and James separately agrees to one scan. |
| Present phone to same PM5 NFC spot with modal live | Two prior physical read/connect/disconnect samples on this phone/PM5. | No app taps or Home gesture through the modal. Stop after one presentation. |

The debugger used for desk screen inspection paused the app and James reported
it unresponsive. It was detached and an ordinary foreground launch succeeded;
no debugger or inspection console remains. This inspection did not establish
current DOM contents. No further debugger inspection is part of the procedure.

## Operator sequence — each numbered line is a separate exchange

The current next step is a **zero-scan screen check**, not consent to the sample:
“Tell me what screen Ergomatic shows.” This asks for an observation and invents
no control. PM must judge this exact setup check alongside the proposed sample.
If the app still does not respond, stop; do not troubleshoot while James waits.
This one observation has no pending process or reply deadline. Its reply does
not start the sample clock; its elapsed cost remains part of preparation.

Once the current screen is known, use only the corresponding demonstrated
control. The maximum remaining actions are YOU (one tap), at most three
individual upward scrolls, wake PM5, More Options, Connect Device, Run normal
sample, and one tag presentation. At most three short screen/menu replies are
needed; no required magic words. If three scrolls do not expose the normal
button with metadata already filled, stop. A login, trust dialog, unexpected
popup, disabled sample or missing field stops the session.

Before Run normal sample, state the remaining budget and obtain James's
separate agreement to **one scan**. No additional confirmation is required once
that agreement exists. With current UI ready and no modal, deliver:

1. “Tap Run normal sample.” Do not queue another tap or command.
2. After the native activation trace is observed, “Hold the phone at the same
   PM5 NFC spot that worked earlier.” James sends no receipt or completion
   message. If activation is not observed, do not invent a scanning state.

Codex owns fresh console capture and exact installed identity verification
before these scan instructions. A fresh capture launch resets navigation: any
pre-launch screen observation is insufficient, and the probe must be visibly
ready again in that captured process before Run normal sample. The total
clock includes that navigation. After the tap, Codex reads only allowlisted
native diagnostic lines and delivers the tag instruction on observed activation;
there is no intermediate chat acknowledgement. If the native reader expires
before presentation, preserve the inconclusive result and stop without retry.
On completion, cancellation or the deadline,
Codex runs the tested cleanup, freezes evidence and tells James he is done.
If verified cleanup fails, the sole containment instruction is “Press the
side button once to lock the phone.” This records unknown process state,
never successful termination. No retry follows any failure.

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
