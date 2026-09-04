# NFC recovery preparation — 2026-09-04

Status: signed recovery artifact built on the Mac; NOT INSTALLED. No new scan
is authorized. No erg invitation is ready. The approved product design is
unchanged and implementation remains gated on `REMAINING-PROOF.md`.

## Desk progress

The approved temporary connect/query/read hold overlay was adapted to the
current native diagnostic source, preserving its factory, scheduling seam,
ownership guards and RF-active/error traces. The added dispatch is DEBUG-only;
Release continues directly. No overlay line entered the checked-in pnpm patch.
The focused native tests exercise actual bridge calls and callback handlers;
these are no-radio tests, not proof of physical stage reachability. Final result:
9/9 passed. Six separate-copy mutations (three ownership guards, holding,
release invocation and method registration) failed their behavioral assertions,
then exact restoration passed. Generic Debug and Release package builds passed;
all four diagnostic markers are absent from the Release object.

Native source SHA-256:
`7f4a54ee783dae5fcef556b7f654327ff6bb3896d3bd3b2d706fcce7e62b6613`.
Native test SHA-256:
`7cb5f5aa60865726ace2da9f1c3989927d0247b9c2834e12fee41a4bbc4b6856`.
The existing ignored `.superpowers/sdd/2026-09-03-phase-nf-gate-minus-one/`
directory retains v2 baseline backups, replay-proven source/test diffs, report,
XCTest results and mutation evidence. Restore v2 backups when retiring this
overlay; the old v1 baseline lacks the newer traces. Held closures intentionally
survive A stop/reload until exact release or process termination; cleanup must
terminate the app if a held callback is left unreleased.

The flagged Vite build and Capacitor sync produced the same probe asset bytes
as v8. The new signed Debug app contains the temporary hold/release method and
native diagnostic marker. Strict/deep signing verification passed; effective
NFC entitlement is exactly TAG and the usage string is unchanged. Exact path,
executable AND App.debug.dylib hashes, probe hash, CDHash and full file-manifest
hash are in `recovery-artifact-identity.json`. The private manifest and build
logs are under `/var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-recovery.elsxwlhr`.
This build is distinct from the existing ordinary v8 diagnostic; neither an
old installation receipt nor a matching version number verifies this artifact.

The dated complete NDEF fixture now lives in
`docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json`. Strict v1 receipt serialization
and byte equality against v8 passed. The README's partial-capture overclaim is
corrected. No final combined receipt or hardware criterion was fabricated.

## Actual host-tool observations

PRIMARY: pymobiledevice3 11.3.1, installed only in an isolated private Mac venv,
provides native macOS tunnel and Web Inspector APIs:
https://github.com/doronz88/pymobiledevice3 and its
`pymobiledevice3/services/webinspector.py`, `remote/native_tunnel.py`, and
`services/web_protocol/inspector_session.py`. The installed setup sends
`pause=False`; no Debugger enable is required. Explicit socket teardown is
needed before reattachment. This is Web Inspector, not LLDB.

Two bounded wireless service discoveries succeeded in 3.072 and 3.069 seconds.
They found zero pages for the exact Ergomatic bundle while the app was stopped.
That proves the paired wireless service path, not DOM access, reload control,
modal reachability or capture readiness. No app data or unrelated page URLs
were printed. Library console logging is disabled.

At 22:51:04.988Z the existing capture controller independently listed a
DIFFERENT installation: 0.37.0 (848), versus the pinned 0.23.0 (789), with a
different installation URL. The cause of replacement is unknown. No console
launch occurred. However, the controller's unconditional finally block DID
attempt a replacement launch for cleanup after rejecting identity. The phone
was locked and denied that launch; no process identifier was returned. The
run ended 22:51:17.916Z with cleanup unverified. It made zero NFC attempts and
performed no installation. Do not describe it as zero device commands.

That real-tool finding is fixed in `c31424fa`: rejected preflight performs no
app mutations. Cleanup remains required after an attempted console launch,
including an ambiguous launch failure. The scoped controller suite passed
12/12; mutations forcing cleanup after rejection and disabling cleanup after
launch both failed, then restored green. Commit hooks ran format/lint/typecheck.

## Next preparation dependency

The private zero-scan Inspector preflight now requires the verified bundle,
installation URL, exact process, WebView type, exact origin and enabled probe
controls. It performs one benign document reload, reselects the same process,
requires a new time origin and checks controls again. It never starts NFC.
It explicitly detaches the socket and bounds all work. Seven desk tests cover
selection, protocol responses, quiet evaluation and cleanup. Separate-copy
mutations bypassing exact-origin validation and omitting wire detach failed;
restoration passed 7/7. Actual phone DOM
access/reload remains UNPROVEN until the diagnostic is installed and launched.
No new generic controller, product UI, storage or automatic NFC retry was added.

`ZERO-SCAN-SETUP-RUNSHEET.md` is the next review target. It asks for one explicit
installation authorization followed by one ordinary unlock, and no NFC scan or
erg presence. PM rejected the draft that omitted unlocking despite a recorded
Locked launch failure; the revised grouped block includes it inside the clock. A locked phone,
wrong app, missing controls or failed capture ends preparation; it cannot lead
to surprise physical instructions or a scan. After control readiness is proved,
PM must review the concrete grouped recovery walk separately.

## Code review and time

`/root/controller_review`: PASS on the concrete cleanup guard, adapted native
overlay and quiet/fail-closed Inspector helper. No blocking code issues. This
supports installation and idle preflight preparation, not actual recovery
clearance. The helper SHA-256 is
`7507734fe27128be39446e1fa01921d1d2c30c0f88866be830ebbd7da407eaf6`;
its private protocol test file is
`c62ddb363e7fabd9eba805e296cbd72158dc42df85e61d775c54ac3d3a20d1d0`.

Desk work for this continuation began at 22:34:12Z (active-goal creation).
At 23:07:34Z it had taken 33 minutes 22 seconds; builds, tests, tool validation
and review are real preparation cost, separate from the completed 1m46 v8 scan.
James was released from erg attendance during this work. No installation or
scan occurred in this continuation. A later outcome must add its actual setup
and execution time rather than implying the whole effort took five minutes.

A read-only `devicectl device info lockState` at 23:06:32Z returned
`passcodeRequired:false` and `unlockedSinceBoot:true`. It exposes no current
`isLocked` field; do not promote those fields to proof that app launch will be
allowed. The latest actual launch result remains the earlier Locked refusal.
