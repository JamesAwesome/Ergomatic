"""NF follow-on: one mutation per new assertion, deciding source only, clean
tree at start, restored after each (RF22). Anchors asserted to one hit."""
import subprocess, re, pathlib, os, sys
APP = pathlib.Path('/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-nf2-followon/app')
SP = pathlib.Path('/private/tmp/claude-501/-Users-james-projects-github-jamesawesome-Ergomatic/b4e38d85-5c28-4f59-a1bf-bf6a16b6ded9/scratchpad')
SESS='src/monitor/useMonitorSession.ts'; INT='src/workout/ConnectedInterstitial.tsx'; RNA='src/monitor/nfc/runNfcAttempt.ts'
FAKE='src/monitor/transports/fake.ts'; HOOK='src/monitor/nfc/useNfcEntry.ts'; JR='src/justrow/JustRow.tsx'; BLE='src/monitor/transports/capacitorBle.ts'
T_SESS='src/monitor/useMonitorSession.test.ts'; T_INT='src/workout/ConnectedInterstitial.test.tsx'; T_RNA='src/monitor/nfc/runNfcAttempt.test.ts'
T_WD='src/workout/WorkoutDetail.nfc.test.tsx'; T_JR='src/justrow/JustRow.nfc.test.tsx'; T_FAKE='src/monitor/transports/fake.test.ts'; T_HOOK='src/monitor/nfc/useNfcEntry.test.tsx'; T_BLE='src/monitor/transports/capacitorBle.test.ts'
MUTS=[
 ('M1 not-advertising detail drops the line break', SESS, "return `Couldn't reach ${exactName}.\\nCheck nothing else is connected to it, then try again.`;", "return `Couldn't reach ${exactName}. Check nothing else is connected to it, then try again.`;", [T_SESS, T_INT, T_JR]),
 ('M2 not-advertising detail drops the name', SESS, "return `Couldn't reach ${exactName}.\\nCheck nothing else is connected to it, then try again.`;", "return `Couldn't reach this PM5.\\nCheck nothing else is connected to it, then try again.`;", [T_SESS, T_JR]),
 ('M3 interstitial renders the whole detail as one serif line (no split)', INT, '{failedSerifLine(error).split("\\n")[0]}', '{failedSerifLine(error)}', [T_INT]),
 ('M4 tagFailure maps back to the generic line', RNA, '    if (cause === "tagFailure") {', '    if (cause === "never") {', [T_RNA, T_WD]),
 ('M5 targeted picking variant rendered for the PICKER kind too', INT, 'if (request.kind === "advertised-name") {\n      return (\n        <main className="screen connected-interstitial">\n          <div className="connected-interstitial-body">\n            <p className="connected-status-label">CONNECT</p>\n            <p className="connected-serif-line">\n              Looking for', 'if (request.kind !== "never") {\n      return (\n        <main className="screen connected-interstitial">\n          <div className="connected-interstitial-body">\n            <p className="connected-status-label">CONNECT</p>\n            <p className="connected-serif-line">\n              Looking for', [T_INT]),
 ('M6 targeted picking Cancel does nothing', INT, '            <button\n              type="button"\n              className="button-l2"\n              onClick={handleCancel}\n            >\n              Cancel', '            <button\n              type="button"\n              className="button-l2"\n              onClick={() => undefined}\n            >\n              Cancel', [T_INT]),
 ('M7 fake pending settles without an abort', FAKE, '            signal.addEventListener(\n              "abort",\n              () => {\n                const err = new Error("TargetScanInterruptedError");\n                err.name = "TargetScanInterruptedError";\n                reject(err);\n              },\n              { once: true },\n            );', '            const err = new Error("TargetScanInterruptedError");\n            err.name = "TargetScanInterruptedError";\n            reject(err);', [T_FAKE]),
 ('M8 Just Row proceeds a picker request on an nfc intent', JR, '      if (intent.kind === "nfc") {', '      if (intent.kind === "never") {', [T_JR]),
 ('M9 Just Row Try again mints a picker after a targeted failure', JR, '    const request: MonitorDiscoveryRequest = lastRequestRef.current ?? {', '    const request: MonitorDiscoveryRequest = {', [T_JR]),
 ('M10 Just Row forges busy=false at the seam', JR, '            busy={nfc.busy}', '            busy={false}', [T_JR]),
 ('M11 Just Row failure card collapses the break', JR, '            session.error.detail.split("\\n").map((line) => (', '            [session.error.detail].map((line) => (', [T_JR]),
 ('M12 hook keeps the staged receipt on a non-handoff outcome', HOOK, '      if (!handedOff) discardStagedRetire(attemptId);', '', [T_WD, T_JR, T_HOOK]),
 ('M13 hook swallows a registration failure silently', HOOK, '      if (mountedRef.current) {\n        sinks.onInlineError("NFC scan stopped. Try again.");\n      }', '', [T_HOOK]),
 ('M14 hook never publishes the probe timeout', HOOK, '      trace.record("capability-timed-out");\n      publish();', '      trace.record("capability-timed-out");', [T_HOOK]),
 ('M15 BLE: a resolved stop still poisons the tail', BLE, '            if (cleanupTimer === null) return;\n            unschedule(cleanupTimer);\n            finish(result);', '            if (cleanupTimer === null) return;\n            unschedule(cleanupTimer);\n            poisoned ??= new ScanCleanupFailedError("mutant");\n            finish(result);', [T_BLE]),
]
def run(targets):
    r=subprocess.run(['pnpm','exec','vitest','run','--project','client',*targets],cwd=APP,capture_output=True,text=True,env={**os.environ,'NODE_OPTIONS':'--no-experimental-webstorage'})
    text=r.stdout+r.stderr; failed=sorted(set(re.findall(r'×\s+(.+?)\s+\d+ms',text))); summ=re.findall(r'Tests\s+.*',text)
    return failed,(summ[-1].strip() if summ else 'no summary')
out=[]
for label,f,old,new,targets in MUTS:
    p=APP/f; src=p.read_text(); n=src.count(old)
    if n!=1: out.append(f'{label}: ANCHOR {n} hits — not run'); print(out[-1]); continue
    p.write_text(src.replace(old,new))
    try:
        failed,summ=run(targets)
        tc=subprocess.run(['pnpm','exec','tsc','-b'],cwd=APP,capture_output=True,text=True); tsred='error TS' in (tc.stdout+tc.stderr)
        out.append(f'{label}: {"BIT" if failed else ("TYPECHECK-RED" if tsred else "SURVIVED")}; failed={failed[:3]}; {summ}')
    finally:
        p.write_text(src)
    assert p.read_text()==src; print(out[-1],flush=True)
(SP/'mutations-followon.txt').write_text('\n'.join(out)+'\n')
