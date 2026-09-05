# NFC recovery — Codex command card

Use with `ZERO-SCAN-SETUP-V2.md` and `RECOVERY-WALK-V1.md` only after their
required PM verdicts and separate user permissions. These are Codex-owned
commands, never instructions for James to paste. Do not restart design,
research, builds or unchanged test suites when he returns.

Workdir for Node commands:
`/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design/app`.
Private preparation root (R below):
`/var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-recovery.elsxwlhr`.
The command help was exercised on the Mac; final helper hashes/rehearsal are
recorded in `RECOVERY-HOST-PREPARATION.md` before this card becomes executable.

## Setup after the single explicit install reply

Record the original start immediately. Create a fresh private run directory D
with mode 0700/umask 077 and `operator-session.json` containing the start, its
five-minute absolute deadline as both ISO and Unix seconds, and permission
scope `one installation; idle check; zero scans`. Never reuse v1's directory.

Recheck R/artifact-files.json against every file of the pinned signed app and
its retained manifest SHA, then `codesign --verify --deep --strict` that app.
The exact app is R/derived/Build/Products/Debug-iphoneos/App.app. Install once:

```text
xcrun devicectl device install app --device Kaito --timeout 60 --json-output D/install.json --log-output D/install.log R/derived/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device info apps --device Kaito --timeout 20 --json-output D/installed-apps.json --log-output D/installed-apps.log
```

These argv forms already succeeded in the authorized v1 installation. Bound
each invocation by remaining original time; suppress raw output. Use the
existing `assertInstalledAppMatches` for the install/listing comparison.
Do not use controller `prepare`: its artifact constant names the old build.

Start capture directly, retaining its exact live PID/session:

```sh
printf 'CONTROLLER_PID=%s\n' "$$"
exec node --import tsx scripts/nfc-normal-trace-controller.ts capture D ORIGINAL-DEADLINE-ISO
```

The shell PID becomes Node's via exec. Require that host to remain live and
the new `normal-console.log` to contain `WebView loaded`; expose only the
boolean. `normal-launch.json` is produced on exit, so do not wait for it here.
Save a fresh process listing, then run the prepared idle command:

```text
xcrun devicectl device info processes --device Kaito --timeout 10 --json-output D/processes-before-inspector.json --log-output D/processes-before-inspector.log
R/venv/bin/python R/inspector-recovery.py --run-dir D --mode idle --deadline-utc ORIGINAL-DEADLINE-UNIX-SECONDS
```

On completion or failure signal only the retained still-live Node PID with
SIGINT; await terminal output and require `cleanupVerified:true` in evidence.
The helper never owns installation/launch/termination. No old PID is reusable.
Preserve raw console and JSON privately; report only the helper's allowlisted
result, zero NFC start counts and independently verified cleanup.

## At the erg after setup PASS, PM PASS and explicit go

Create a separate fresh capture directory D and original eight-minute clock.
Copy the authorized setup's install receipt as provenance, not current state;
obtain a new `installed-apps.json`, then use the same capture command, which
independently rechecks identity. A mismatch aborts without reinstalling.
Keep a single attached capture/native process across the four cases.

After capture/DOM readiness and the appropriate physical block, invoke exactly
one scenario, in order, through the same command:

```text
R/venv/bin/python R/inspector-recovery.py --run-dir D --mode recovery --scenario stop-during-connect --deadline-utc ORIGINAL-DEADLINE-UNIX-SECONDS
```

Subsequent scenario values are `stop-during-query`, `stop-during-read`, then
`webview-reload`. Only advance after the preceding case has a complete retained
post-drain B receipt and terminal state, within the approved total cap. Preserve
B then reset the idle document before another A. Each case has at most 90
seconds and requires at least 135 seconds remaining before it can begin; the
helper checks the original reserve at every transition. No retries or extra
normal scan. Use `RECOVERY-WALK-V1.md`'s complete physical blocks verbatim.

The helper validates the complete newest host export before reload and does
not treat “done” as completion. The capture controller's normal-only classifier
will not classify this matrix; retain it but use the recovery observations.
Finish through the same exact-PID SIGINT and verified cleanup, then release
James. Never print raw native logs or copy credentials into the record.
