# NF-RECOVERY-SETUP-v1 result — 2026-09-04

One explicitly authorized installation succeeded. The installed diagnostic was
independently verified, and the attached console reported WebView loaded.
The idle Inspector-control check returned `preflight-stopped / RuntimeError`
before publishing controls-ready. Codex stopped the run, verified bundle
cleanup and released James. No NFC start, tag presentation or scan occurred.

## Scope and time

James replied **Install**, authorizing this one installation. Codex repeated
the approved ordinary-unlock instruction; no further acknowledgement was
requested and no timer spanned a required reply. No additional install or scan
is authorized. The v1 budget is exhausted and must not be reused.

Total measured setup/execution/cleanup: **97,823 ms (1 minute 38 seconds)**,
23:14:24.721754Z–23:16:02.545Z, within the five-minute total cap. The installation
command took 5,110 ms. This time is additional to the approximately 37 minutes
of prior desk preparation, not a replacement for that cost.

## Installation and capture evidence

The signed artifact exactly matched every file in the retained manifest before
installation. `devicectl` install exited 0. The subsequent independent app
listing and the capture controller's fresh listing both matched its bundle,
version/build 0.23.0/789 and new installation URL. Identity is pinned in
`recovery-artifact-identity.json`; its `installed:false` value is the original
preparation snapshot, superseded for this specific run by the install/listing
receipts. It must not be used as a current phone-state assertion later.

The normal console file exists, reports WebView loaded and contains zero
`NFC_GATE_DIAGNOSTIC` lines and zero CapacitorNfc `startScanning` method lines.
The process listing contains exactly one process matching the newly installed
executable, PID 53820. The host controller was PID 77484. After the Inspector
helper exited 1, Codex verified that retained host PID was still live, sent it
SIGINT once and received terminal exit 0 with `cleanupVerified:true`.
Neither PID may be signalled again. No process or walk clock is retained.

The normal-only classifier returned `No receipt export found`, expected for
an idle zero-scan check. That does not make the Inspector check pass; the
separate control-readiness observable never arrived.

## What remains unknown

The helper reported only the exception class, discarding its fixed guard
reason. This prevents distinguishing missing/occupied target, failed DOM
readiness and other RuntimeError guards from the retained output. It is an
observability defect in the helper, not evidence that NFC or app reload failed.
An offline call to the unchanged helper's `expected_pid()` against the saved
install/process files returned 53820, so that file-based identity check is
established. No Inspector service or phone action was repeated to diagnose it.

Actual unattended phone DOM/reload control remains unproven. No erg invitation is
ready. The next desk correction is to retain the helper's fixed guard reason
and safe stage/target-count observations; any new zero-scan attempt requires
its own concrete PM review and James's agreement. Reuse this installation if a
fresh independent identity check still matches; never infer another install
permission from the need to finish preparation.

The later [simulator rehearsal](SIMULATOR-CONTROL-PROOF.md) reproduced and
corrected a target-label defect and proved idle reload of the real diagnostic
component in Simulator. It does not identify this phone run's discarded guard
reason or retrospectively pass this run.

Evidence: `zero-scan-setup-v1-result.json`; private install, independent app
listings, process listings, raw console and verified cleanup outputs under
`/var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-recovery.elsxwlhr/zero-scan-preflight`.
Raw native logs remain private because unrelated bridge output may contain
credentials or device information.
