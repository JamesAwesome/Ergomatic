# NFC scan diagnostics implementation

James authorized implementation after the research and hardened plan.
The controller applied the committed patch inline, the shape permitted by
CLAUDE.md for an author-paste-tested plan; independent task and whole-branch source reviews are complete below.

## Source and scope

The docs branch was rebased onto main `9c0e0618`. The implementation patch
applied without product-source conflicts. Both sides of the agent-ledger
append conflict were retained; NFC techniques became 80/81, with no numeric
citations to these entries elsewhere in the NFC record.

The first implementation commit `1d783de9` applied eight app source/test
files identical to the authored patch tested
at prototype `ce33e750`. Its initial failing tests, 26 deciding-source
mutations and browser mutation remain historical evidence in verification.md;
those results are not new runs on this implementation head.

## Current validation

Fresh implementation checks:

- Frozen installs at both roots; Node 26.5.0. Deliberately presenting Node 1 to
  the real pre-commit hook was blocked; normal hook then passed staged format,
  typed lint, full typecheck and E2E membership 30/30 for `1d783de9`.
  Receipt `8d3e20f8-8588-47c5-b5f3-7986a2100599`.
- Exact seven-file client command from the plan: 488 tests passed, including
  the 41-case native seam. Receipt `5acc1fbc-573f-4f03-bb4d-ee190401d8a9`;
  tested the staged app bytes committed as `1d783de9`. Existing hook tests
  print React act warnings; no unhandled error or resource event was reported.
- `pnpm e2e connected.spec.ts --grep 'Phase NF: Scan NFC'`: 4 passed
  against a freshly built stack from `1d783de9` product code plus the two
  added client-test assertions (no browser-source change). Stack
  `ergomatic-78603` was removed with its network and pgdata volume.
- The next commit hook refused before launching checks because pressure was
  warning (receipt `115fdef2-96b5-4751-afd2-86a8663a9611`, no phases).
  No automatic retry or bypass; the validation window was returned to the
  coordinating task. The first teardown attempt lacked REPO_ROOT and failed
  before removing anything; the corrected worktree-scoped teardown completed.
- After James explicitly resumed work and pressure returned to normal, the
  real commit hook passed for `81c06314`: staged format/typed lint, full
  typecheck and E2E membership 30/30. Receipt
  `ba448b79-ac08-4158-9a66-65f27f68b2dc`.
- At `81c06314`, the new viewer assertions were checked with exact selection:
  `pnpm test --project client src/monitor/nfcScanDiagnostics.test.tsx -t
  'real failure entries render and copy unchanged'`. Removing the hook’s
  requested marker failed the requested-text assertion; replacing both
  finished markers with started failed the finished-text assertion. Each
  selected run reported one failed test, then restoring exact source bytes
  reported one passed (40 deliberately unselected). Receipts
  `d805a4a7-6557-4a9e-9b18-89c55273c0e6`,
  `3a745649-288d-46ef-a794-3a9c1fa6299a`, and restored
  `c7e9901a-becf-4728-90c4-4f1c3ebf9880`. Git status was clean afterward.
  The first helper invocation stopped before tests because status JSON was
  emitted on stderr; capturing that stream corrected the helper.

Local receipts live under the Git common directory’s
`ergomatic-local-work/receipts/`; they are machine-local evidence, not committed
artifacts. The command results above are the durable record. The normal push
hook owns related plus mandatory verification, and hosted CI owns full
coverage/integration/browser validation. No duplicate full local coverage run
is needed: the unchanged covered product files reuse the author’s HTML rows
in verification.md (trace 100% throughout; hook 97.93% statements, 92.41%
branches, 100% functions, 98.83% lines). The native transport has the existing
coverage exclusion and is exercised by direct/seam tests.

## Independent task review

Both agents reviewed the full staged app diff from docs base `dad6fdb8` and
read repository standards. They performed no heavy checks. No third hardening
pass was requested; these are implementation reviews.

### Standards

Verdict: changes requested, one medium maintenance heuristic. The reviewer
flagged repeated string classification in the transport summary and existing
hook error mapper, recommending a shared classifier/error type to avoid future
drift. No other concrete standards defect was found.

Controller ruling: no code change. These are deliberately different contract
values and authorities: the transport reports its winning decision with a
closed vocabulary, while the hook reuses the existing UI reason after cleanup.
For example, invalid-request maps to target-interrupted at the hook, and a
matched decision can finish as scan-cleanup-failed. No current misclassification
was shown; the cited Repeated Switches baseline is a heuristic, and RF26 does
not require one shared classifier. Moving or changing the existing UI mapper
would broaden this diagnostic change without repairing an observed defect.

### Spec

Verdict: PASS, with a low task-quality gap. The native viewer seam asserted the
abort cause but omitted explicit rendered requested/finished assertions;
the browser already covered those markers. The controller added both native
viewer assertions. No spec-behavior defect or scope creep was found.

### Remaining gate

Final whole-branch source review: PASS on `1d783de9` plus the staged viewer
assertions/docs. No code defects found. The reviewer confirmed attribution,
privacy, settlement/cleanup distinction and behavior preservation, including
the vendor-queue witnesses. No heavy checks were run by any reviewer.

Resource admission interrupted finalization twice: the first refusal above,
then a newly coordinated window admitted a hook at normal pressure but ended
with pressure warning (receipt `54c882a5-c93b-45b5-b8dc-a414bb4bb15f`, exit75,
cleanup verified). Its `tsc -b` child exited0, but this was not a passed hook.
No commit landed. Work was preserved and each window returned. After James’s
fresh “Keep going,” normal pressure permitted the successful hook and probes
recorded above. No guard was bypassed or foreign process cleaned up.

Delivery gates: the normal push hook must pass and the PR’s full hosted CI
must succeed on its exact head. At this evidence commit those publication
checks have not yet run; their authoritative result is the GitHub run whose
`headSha` equals `git rev-parse HEAD`, not an earlier green. No code change
followed the reviewed viewer assertions, only this evidence reconciliation.

Physical causality remains unresolved. The original diagnostics commits above
instrumented future failures without changing connection policy. The approved
follow-up below changes pre-connection recovery; no phone installation,
hardware walk or merge is authorized by this record.


## Approved follow-up: move-away guidance and foreground recovery

James chose this route after reviewing the proposed copy and comparison with
Sonos and Yubico: keep connection automatic, improve the move-away cue, and
recover after an accidental browser detour. This is a bounded change to the
existing connection flow, implemented in the same PR. It is not a claim to
suppress the iOS notification or identify which app the rower opened.

Approved wording replaces `Hold your iPhone near the monitor.` with
`Hold the top of your iPhone near the monitor. Move it away when this sheet closes.`
The NFC connecting hint on workout and Just Row replaces
`Keep the monitor on and close by.` with
`Tag read. Move your phone away from the NFC spot and keep Ergomatic open.`
No layout/structure changes or screenshots (CLAUDE.md wording-only Gate 0).

### Recovery contract and ownership brief

- One explicit targeted `connect()` may recover once. The request, validated
  monitor name, NFC attempt ID and trace stay the same; there is no picker or
  second NFC read. Retry diagnostics add `pass=2` under the captured connect
  ordinal, with resume-waiting and resumed events.
- A real background transition aborts its scan pass. Only the returned
  `TargetScanInterruptedError` identifying that exact pass's AbortSignal can
  authorize recovery. Timeout errors omit the signal; cleanup failure replaces
  the outcome and remains terminal. Diagnostic text is never policy input.
- Both successful cleanup and current foreground readiness are required.
  Return before cleanup works; another departure revokes readiness. Waiting is
  cancellable and has no timer: active scan/cleanup retain existing deadlines.
- Cancel/unmount cancel the containing operation even if the pass was already
  aborted. Late registration is unsubscribed and cannot start a radio scan.
  The existing hook attempt and controller-identity guards still fence stale
  completions and new explicit connections.
- A match that won before backgrounding is retained until foreground before
  starting GATT, without a new scan. Recovery ends at discovery: GATT/program
  failures and workouts already underway never acquire an automatic retry.
- Native registration observes resume before pause and removes the first
  listener if the second registration fails. No active/inactive substitution.

| State | Minted | End / reset / survival |
| --- | --- | --- |
| Operation controller and cancel source | Each explicit targeted connect | Cancel/teardown abort; identity-cleared finally; never survives unmount/relaunch |
| Pass controller and background-aborted flag | First scan, then fresh at sole recovery | Only first abort sets flag; discarded when replaced or operation ends |
| Foreground readiness | Operation entry, updated only by observed lifecycle events | Every background revokes; no state survives operation |
| Retry index | Operation entry | At most second scan; new explicit connect gets fresh budget |
| Foreground waiter | Only while hidden after scan cleanup/result | Foreground or operation cancel wakes; readiness rechecked; discarded finally |
| Lifecycle unsubscribe / closed fence | Registration / operation entry | Partial registration cleaned; late callbacks ignored after cancellation/close; handle removed finally |
| Pass trace wrapper | Sole recovery | Same capped trace, pass attribution only; no policy or persisted shape |
| Scan-entered flag | Operation entry | Records whether an early error still owes a terminal diagnostic; discarded at operation end |

### Research and mechanism review

PRIMARY: [Apple background reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)
says background reads are unavailable during a Core NFC session. We keep the
existing reader shutdown, so banner prevention remains untested. The reader
interface has no phone-removal event. PRIMARY:
[Capacitor pause/resume](https://capacitorjs.com/docs/apis/app#addlistenerresume)
distinguishes actual background transitions from active/inactive events.

The antagonist's source review found a registration gap: installed
`AppPlugin.swift` uses non-retained pause/resume notifications and
`CAPPlugin.m` drops events with no listener; pause-first registration could
observe departure and miss return. Resume-first closes that witnessed-departure
case. This is source reachability, not a measured occurrence on the phone.
The review accepted independent operation/pass cancellation and actual winning
abort attribution. Implementation carries the exact signal directly rather
than using newer `AbortSignal.reason`; no new OS capability is required.

Pre-registration transitions, process eviction/relaunch and actual banner/copy
timing are outside this guarantee. A new explicit retry starts a new budget.

### Follow-up verification

The first five native pipeline recovery assertions failed against the original
implementation (no second scan / phase failed instead of picking): receipt
`76cc4b68-efe7-42d5-b02f-e202a9eb86f0`. Both registrar regressions failed first
(missed foreground / leaked first listener):
`802c41d5-3cd8-42c0-87b2-fee4d90bf0bb`. Restored behavior passed 651 targeted
client tests across seven files at
`c39fbb73-f906-4202-9da6-95c3e56f488f`; existing act warnings were printed by
older hook/Just Row cases. The final 58 native seam/registrar tests passed at
`080ee926` after all mutations were restored, receipt
`0e84c4f7-5f69-4a4e-88bc-6a57c68578b8`.

Fourteen deciding-source mutations each failed the intended tests against
`080ee926`; results are in `foreground-recovery-mutation-results.txt`. They
cover retry eligibility/budget, cleanup ordering, foreground revocation,
cancellation/wakeup, matched-result waiting, emitted recovery diagnostics,
early terminal diagnostics, native instructions and both listener-registration
hazards. Sources were restored byte-for-byte; git status was clean. The
missing-wakeup mutation terminates by test timeout; all other failures expose
assertions about the supported native path. Normal pre-commit hooks passed
for both follow-up commits, including full typecheck and E2E membership 30/30.

Correctness/spec review: PASS at `903a3c19`, no product defects. Standards
review found two missing assertions: positive recovery-event emission and
native instructions through the actual reader. Both were added in `080ee926`
and their producer mutations failed. No product code changed after review.
The PM conditionally passed the bounded behavior and same-PR scope, subject
to source, mutation, browser and exact-head CI gates. Its physical notification
timing limitation remains an observation for TestFlight, not a merge premise.

At `080ee926`, `pnpm e2e connected.spec.ts justrow.spec.ts -g 'Scan NFC'`
passed all five selected Chromium tests against freshly rebuilt product bytes.
The scoped Compose stack, network and pgdata volume were removed afterward.

Hosted CI must certify the published head; older diagnostics-only green runs
do not certify this behavior change.

The normal push hook for `839b9d28` passed 2,702 tests in four exact batches,
receipt `2552a034-923b-4e6f-9ce8-7ffc6d809fa6`, with no signal and verified
cleanup. A final record-only follow-up marks the original spec/plan constraints
as historical; app and test bytes remain unchanged. Hosted run results belong
to their exact GitHub head and are reconciled in the PR before delivery.
