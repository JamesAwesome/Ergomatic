"""Run only in a clean prototype worktree; restore exact bytes after each mutant.
Usage: python3 mutations.py /absolute/prototype/worktree [--browser]
Each row edits one producer, requires assertion failure, and records full output.
"""
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

root = Path(sys.argv[1]).resolve()
assert (root / '.git').is_file(), 'Use a worktree, never the main checkout'
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=root).strip(), 'Commit real work first'
app = root / 'app'
hook = 'src/monitor/useMonitorSession.ts'
ble = 'src/monitor/transports/capacitorBle.ts'
mutants = [
    ('undefined-error', ble, 'outcome = err === undefined ? "matched" : "other-error";', 'outcome = "matched";'),
    ('final-fallback', hook, '.reason ?? "link-failed"', '.reason'),
    ('vendor-queue', 'src/monitor/nfcScanDiagnostics.test.tsx', 'getQueue(true)', 'getQueue(false)'),
    ('shared-initialize', ble, 'initPromise ??= BleClient.initialize()', 'initPromise = BleClient.initialize()'),
    ('manual-recovery', ble, 'return raceScanTimeout(pipeline);', 'throw new ScanCleanupFailedError("mutant refusal");'),
    ('requested', hook, 'scanTrace?.record("ble-scan-requested");', ''),
    ('cause', hook, 'scanTrace?.record("ble-scan-abort-requested", source);', ''),
    ('wrong-cause', hook, 'abort("background");', 'abort("cancel");'),
    ('first-cause', hook, 'if (controller.signal.aborted) return;', ''),
    ('captured-ordinal', hook, 'connect=${attempt}', 'connect=${attemptRef.current}'),
    ('owned-ref', hook, 'if (targetedAbortRef.current?.controller === controller)', 'if (true)'),
    ('lifecycle', hook, 'scanTrace?.record("ble-scan-lifecycle", event);', ''),
    ('cleanup-authority', hook, '${mapTargetedFailure(err, discovery.exactName).reason ?? "link-failed"}', 'matched'),
    ('terminal', hook, '"ble-scan-finished",', '"ble-scan-started",'),
    ('results', ble, 'results += 1;', 'results += 0;'),
    ('valid', ble, 'valid += 1;', 'valid += 0;'),
    ('named', ble, 'named += 1;', 'named += 0;'),
    ('matches', ble, 'matches=${matches.length}', 'matches=0'),
    ('stages', ble, 'stage = "enabled";', 'stage = "initialize";'),
    ('early-stage', ble, 'if (!settled && stage === "scan-start") stage = "advertisements";', 'if (!settled) stage = "advertisements";'),
    ('privacy', ble, 'outcome = "other-error";', 'outcome = err!.name;'),
    ('late-start', ble, 'settled ? "ble-scan-started-late" : "ble-scan-started"', '"ble-scan-started"'),
    ('early-summary', ble, 'summary(err instanceof Error ? err : new Error());', ''),
    ('summary', ble, 'summary("err" in result ? result.err : undefined);', ''),
    ('inactive', 'src/native/appLifecycle.ts', 'App.addListener("pause",', 'App.addListener("appStateChange",'),
    ('copy', 'src/workout/connected/ConnectionLogSheet.tsx', 'navigator.clipboard.writeText(raw)', 'navigator.clipboard.writeText("[]")'),
]
command = ['pnpm', 'test', '--project', 'client', 'src/monitor/nfcScanDiagnostics.test.tsx']
if '--browser' in sys.argv:
    mutants = [m for m in mutants if m[0] == "requested"]
    command = ['pnpm', 'e2e', 'connected.spec.ts', '--grep', 'a PM5 that is not advertising:']
log_dir = Path(tempfile.mkdtemp(prefix='nfc-diagnostics-mutations-'))
print('logs:', log_dir, flush=True)
for name, relative, before, after in mutants:
    path = app / relative
    original = path.read_text()
    assert before in original, (name, 'missing deciding source')
    try:
        path.write_text(original.replace(before, after))
        result = subprocess.run(command, cwd=app, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        (log_dir / (name + '.log')).write_text(result.stdout)
        assert not re.search(r'Allocation failed|SIGKILL|SIGABRT|TEST RUN KILLED', result.stdout), 'Killed run: stop, do not retry'
        assert result.returncode == 1 and re.search(r'\b[1-9]\d* failed\b', result.stdout), (name, 'survived or infrastructure failure', result.stdout[-2000:])
        summary = [line.strip() for line in result.stdout.splitlines() if re.search(r'\b[1-9]\d* failed\b', line)]
        print(name + ': KILLED — ' + ' / '.join(summary[-2:]), flush=True)
    finally:
        path.write_text(original)
result = subprocess.run(command, cwd=app, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(log_dir / 'restored.log').write_text(result.stdout)
print(result.stdout[-1500:], flush=True)
assert result.returncode == 0, 'Restored gate is not green'
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=root).strip(), 'Mutation leaked a write'
