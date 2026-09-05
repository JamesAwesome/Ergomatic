# Ergomatic NFC handoff — September 5, 2026, 01:12 UTC

James asked to stop, save status and hand this work to Claude. Resume the
existing work; do not restart design or another preparation framework.

## Checkout and first reads

Main repo: `/Users/james/projects/github/jamesawesome/Ergomatic`.
Working checkout:
`/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf-nfc-design`.
Branch: `codex/phase-nf-nfc-design`. Last commit before this handoff record:
`df6694c1` (phone setup PASS and PM recovery readiness). The handoff itself is
saved in a subsequent local commit; verify current HEAD/status. No push, merge,
release or worktree removal is authorized. Main's untracked
`.claude/settings.json` is not this task's work; leave it alone.

Read `CLAUDE.md` completely first, then this file, `NEXT-WALK-RUNSHEET.md`,
`RECOVERY-WALK-V1-ABORT.md`, `ZERO-SCAN-SETUP-V3-RESULT.md`,
`RECOVERY-WALK-V1.md`, `RECOVERY-COMMAND-CARD.md`, `INSPECTOR-LOADING-FIX.md`,
`RECOVERY-HOST-PREPARATION.md`, `REMAINING-PROOF.md`, and relevant PM ledger
entries. Read the existing normal capture controller/receipt reader and their
corresponding tests when changing them; do not repeat unchanged suites.
`NORMAL-TRACE-V5-ABORT.md` records the original reply-spanning timer failure;
`NORMAL-TRACE-V8-RESULT.md` records the later successful normal scan.

## Immediate stop state

- Setup v3 passed actual physical-phone identity, authenticated You controls,
  complete four-line console canary, same-process new document and cleanup in
  1m42.366s. Zero installs/scans. Result is retained, not permanent reachability.
- James then said **Start**, explicitly authorizing recovery v1: four A/B pairs,
  max eight reader starts, eight minutes total, no retries or installation.
- First phone listing succeeded and matched 0.23.0/789 plus latest install URL.
  The controller's second prelaunch listing failed: CoreDeviceError 4000,
  control-channel errors 1/0, Network.NWError 60, timeout in its log.
- The controller never reached app launch. No Inspector invocation, console
  capture, NFC reader start or recovery case. All four cases remain unrun.
  `cleanupVerified:false` means cleanup was not attempted/needed because no
  phone mutation occurred. Host PID 13869/session 43291 is terminal; PID absence
  was checked. Do not signal old PIDs or run phone cleanup for this attempt.
- Machine stop was 01:09:33.864Z, 51.891s after the conservative operator start.
  Exact subsequent release-message delivery time was not retained; it preceded
  01:10:46Z. Do not report machine duration as exact full operator time.
- James said **I'm ready now**. One read-only app-list reconnection failed
  immediately with exit 1/CoreDeviceError 1011. No further phone action ran.
  Current connection/installed identity is unknown, not a proven mismatch.
- James then explicitly requested handoff. No live timer, install permission,
  scan permission or retry is active. Do not interpret readiness for setup as
  scan consent. Existing PM protocol review is retained, but the stopped run
  cannot simply be retried under its consumed Start.

Next technical task: inspect retained CoreDevice connection failures and use
read-only checks to establish current phone reachability. The cause is not
known. Do not claim it is a lock, cable, Wi-Fi or distance problem without
observing evidence. Do not begin a new build or code fix for a transport timeout.
Finish possible preparation before another hardware invitation. Any resumed
walk needs the exact versioned PM readiness review required by CLAUDE.md and
James's agreement. Every installation needs its own explicit permission.

## Existing artifact and host commands

Private preparation root R:
`/var/folders/m8/wdf8_49130z_j4m94t3rj3w80000gn/T/ergomatic-nf-recovery.elsxwlhr`.
Current signed recovery app: `R/derived/Build/Products/Debug-iphoneos/App.app`.
It includes the approved temporary DEBUG native hold/release overlay. Last
explicit installation succeeded in setup v2; never assume it is still installed.
Version/build 0.23.0/789; bundle `haus.waffle.ergomatic`.
App SHA-256 `3d36997f85dd0e5a351790c5d972de8fe3e25ffff6f34d24000c10a558398bc7`;
CDHash `cc3f23e6c301a8fb287b2a630036bd9f0144e9c0`.
Full 231-file manifest `R/artifact-files.json`, SHA-256
`40b250bf969f38c91af08d917465d69874ebb22d728cdfc25126a18b5c336132`.
See `recovery-artifact-identity.json`; its installed:false is a historical
preparation snapshot, not current phone state.

The original ordinary diagnostic app also remains at
`/tmp/ergomatic-phase-nf-ready.WQJqQu/Build/Products/Debug-iphoneos/App.app`.
Do not use the capture controller's `prepare` command for recovery: it installs
that old ordinary artifact. Use only explicitly authorized separate install
commands for the recovery artifact if a future install is required.

Existing runnable private files:
- `R/inspector-recovery.py`, SHA-256
  `175eb6ffd2b03a34bfb3b270f6f13f02f90b829cda65bd313fb9ba659440b227`.
- `R/verify-recovery-receipt.ts`, SHA-256
  `1a88420706ca3353d9b49c3f6ca9ea627c4074a5543b1882146f8624aaeef34f`.
- `R/test-inspector-recovery.py`, SHA-256
  `5f6dfe99238ca1ab02daed24dbb04bcd68526721ca132e1127a1e7ed5da6c46a`.
- `R/inspector-check.py` provides reviewed Inspector selection/detach; venv and
  device-info.json are beside it. Use the command card, not improvised commands.

Copies of current helper/base/verifier/tests/mutation logs are preserved in
ignored worktree `.superpowers/sdd/2026-09-03-phase-nf-gate-minus-one/inspector-v4/`.
Prior complete Simulator rehearsal/fixtures remain in `inspector-v3/` and
`R/final-sim-rehearsal/`. Do not overwrite them. The source helper was the only
latest code delta: wait for missing lazy probe only on valid /you during
expected navigation/reload; wrong routes and active disappearing documents
fail immediately. Existing deadlines are unchanged. Safe last DOM observation
is retained. Focused tests and copied mutations passed; independent code PASS.
The old phone stop's exact cause remains unknown despite that reproduced bug.

Host helper cannot install/launch/terminate. Existing
`app/scripts/nfc-normal-trace-controller.ts` owns capture/cleanup; it is unchanged.
A fresh walk uses the reviewed idle helper once before A in its original
clock, then one helper invocation per scenario. Same verified phone process
and single host capture across all four pairs. Final receipt requires BOTH
newest complete exports to belong to B; delayed A plus first B is insufficient.
Never stop capture on a human 'done' message. Preserve B then reset the idle
WebView between pairs. No LLDB/Debugger attach: it previously froze the app.

## Private evidence locations

Under R:
- `authorized-setup-v2-p467ln0x/`: successful authorized installation, first idle
  stop before canary; its install.json is installation provenance.
- `authorized-setup-v3-hrsovf1a/`: physical idle/capture/reload PASS, zero scans,
  cleanup verified; host PID 10805 retired.
- `authorized-recovery-v1-bu5vy2wb/`: latest prelaunch connection abort;
  operator-session.json, initial installed-apps.json, failed
  capture-installed-apps.json/log, evidence.json, abort-summary.json.
- `recovery-reconnection-xt21wo2n/`: latest read-only failure, code 1011.
- `active-recovery-v1.json` is a pointer to an EXHAUSTED run, not live permission.

Raw console/JSON may contain credentials or unrelated device/account output.
Keep it private; retain only strict redacted receipts and allowlisted facts
in tracked documents. Do not paste raw logs into chat, repo or a handoff prompt.

## Product and remaining hardware evidence

Approved design is fixed: muted-green Scan NFC above Connect, visible on
NFC-capable iOS devices. Valid PM5 tags select the exact Bluetooth advertisement,
connect and program the workout. Unsupported tags say 'Unsupported NFC tag.'
Product implementation remains gated. Do not reopen this design.

Normal v8 passed with exact decoded/live `PM5 432331249 Row`, one BLE match,
picker-free connect/disconnect, three raw records and observed payload boundary.
The dated fixture is `docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json`.
Core NFC 200 also appeared on success; it alone is not a failure diagnosis.
Physical connect/query/read stopped-A→B and native-live WebView reload→B remain
unproved; four recovery cases are still unrun. Physical background/multiple-tag
proof, final evidence assembly and eventual overlay retirement also remain.
Do not promote synthetic Simulator NFC/BLE callbacks into hardware evidence.

DEBUG overlay is currently in ignored node_modules Swift. Do not run pnpm
reinstall/force or overwrite it with an old baseline. Its SHA-256 is
`7f4a54ee783dae5fcef556b7f654327ff6bb3896d3bd3b2d706fcce7e62b6613`;
checked-in patch remains unchanged. Native tests/mutations and Debug/Release
checks already passed; details in RECOVERY-PREPARATION.md and ignored reports.

## Operator contract

James wants speed and short complete instruction blocks. Do all desk prep
first. No pasted commands, receipt copying or typing mid-piece. No short
reply-spanning timers; total clocks include setup and cleanup. No hidden repair
loop at the erg. Stop at failure/cap and release him. Setup readiness and PM
approval do not grant scan or install consent. Never install without explicit
permission for that particular installation. Preserve existing work; no push,
merge or release. The latest instruction is to save and hand off, not continue
hardware execution.
