# Inspector loading correction — September 5, 2026

Setup v2 installed successfully but stopped before its idle canary with
`DiagnosticDocumentMissing`. The exact phone cause was not observed. The
separate desk reproduction found that the helper rejects an expected lazy
mount: `app/src/You.tsx` imports GateMinusOneProbe lazily and renders it under
`Suspense fallback={null}`. The prior Simulator fixture mounted that component
directly. Its passing component rehearsal did not exercise the authenticated
You route or asynchronous import.

The correction is confined to the private host helper and its focused tests.
During expected navigation/reload, a well-formed observation of `/you` may
wait for the probe within the existing deadline, including when document
readiness is already complete. Unrelated routes and malformed observations
fail immediately. Active held/terminal waits still fail immediately if the
probe disappears. No new deadline, retry, phone operation or framework exists.

The next stop retains only pathIsYou, probePresent, a readyState enum and an
expectedTransition enum. It never exports raw DOM, records, URLs or account
text. The observation begins empty for each helper invocation. It records the
last observation, not a diagnosis of the earlier phone stop.

Five focused wait-loop tests passed in 0.249 seconds, plus Python compile
checks: loading-to-ready through the actual loop, active missing-document
rejection, bounded never-mounted /you, wrong route, and malformed response.
The loading and wrong-route regressions first failed against prior source.
Copied-code mutations reinstating immediate loading rejection and deleting
the route guard failed; the fixed source remained unchanged and passed.
`/root/controller_review`: PASS on the final hashes below. The wrong-route
blocker is closed; only valid /you mounting waits continue within existing
deadlines, and active waits retain immediate rejection.

| Private file | Current SHA-256 |
| --- | --- |
| inspector-recovery.py | `b7e37faa3d16a778a03dece964a4c8c278f289fb2e3335a2a9fb989afcbb799f` |
| test-inspector-recovery.py | `7d820db19c53460452e56226e35552c20827193ab88f52d7c59049298f147d24` |
| verify-recovery-receipt.ts (unchanged) | `1a88420706ca3353d9b49c3f6ca9ea627c4074a5543b1882146f8624aaeef34f` |

Originals are preserved as
`*.before-loading` beside the command card's private helper. Product code,
native overlay, signed app, capture controller and receipt verifier are unchanged.
This delta does not require a build/install or repeat of the unchanged native,
full-app or four-pair Simulator suites. Phone idle/capture remains unproved.

The corrected source, base Inspector helper, tests, unchanged verifier and
mutation logs are preserved in the ignored worktree
`.superpowers/sdd/2026-09-03-phase-nf-gate-minus-one/inspector-v4/`.
The historical v3 Simulator artifacts remain untouched.

The phone was released after cleanup at 00:43:52Z. This additional desk
investigation, focused correction, reviews and record preparation finished
about 00:58Z: roughly **14 minutes**, additional to setup v2's 2m14.519s and
all previously recorded preparation. No further phone launch or scan occurred;
a read-only listing confirmed 0.23.0/789 still matched the latest install URL.
