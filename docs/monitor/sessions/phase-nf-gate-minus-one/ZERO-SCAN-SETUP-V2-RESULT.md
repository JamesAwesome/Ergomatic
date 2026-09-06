# NF-RECOVERY-SETUP-v2 result

The one explicitly authorized installation succeeded and independent listings
verified diagnostic 0.23.0/789 at the new installation URL. The idle check
stopped with `DiagnosticDocumentMissing` before the console canary or reload.
Phone preparation did not pass. No NFC attempt occurred.

The total operator clock ran from 2026-09-05T00:41:38.177962Z through verified
cleanup at 00:43:52.697Z: **2 minutes 14.519 seconds**, including installation,
setup, waiting, capture and cleanup. The capture controller's own 99.714-second
clock excludes earlier setup and is not the operator total. The installation
and independent listing took 4.825 seconds.

The retained capture host PID 2269 was verified and signalled once; it exited
with `cleanupVerified:true`. It is retired. Reader-begin, startScanning-method,
receipt and capture-canary marker counts were all zero. The normal classifier's
missing receipt is expected in a zero-scan run and does not establish readiness.
James was released to lock the phone and leave the erg. The installation
permission is consumed; this run has no retry or reusable deadline.

The guard did not retain the last DOM state, so the exact phone cause is
unknown. Desk inspection found a separate reproducible loading defect:
`You.tsx` lazy-loads GateMinusOneProbe under a null Suspense fallback, while
the helper immediately rejected any missing probe after navigation/reload.
The Simulator rehearsal mounted the probe directly and did not exercise that
route. The host-only correction waits within the existing deadline during
expected navigation/reload and retains a minimal allowlisted observation.
Active sample waits still fail immediately if the diagnostic disappears.
This fix is not a phone PASS and needs no app rebuild or installation.

Allowlisted machine summary: [setup-v2-result.json](setup-v2-result.json).
Full logs remain private under the command card's preparation root in
`authorized-setup-v2-p467ln0x/`; never paste raw native output into the repo.
