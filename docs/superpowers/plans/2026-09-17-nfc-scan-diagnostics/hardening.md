# NFC diagnostics hardening

## Author prerequisite

Phase 0 corrected untested prescribed content. The patch's production code,
tests, apply commands and mutation script have been executed by the author.
See [verification](verification.md). Counts are observed results with source
provenance, not promised future totals. Document references use symbols and
task names rather than line numbers into mutable documents.

## Mechanism lens — substantive finding folded

Verdict: NEEDS FIXES, one proven P2 test-fidelity defect, no product-mechanism
defect found. The original late-start test awaited successful cleanup before
releasing a pending start. Independent BleClient mocks permitted that order;
the installed BLE 8.3.0 wrapper does not. Its `bleClient.js` queues both
`requestLEScan` and `stopLEScan`; `queue.js` chains them onto one promise.
The reviewer's read-only experiment with installed `getQueue(true)` saw only
start entry before release, then start resolution followed by stop entry.

Fold: replace that test with the installed shared queue around mock start
and stop bodies. After abort, assert the decision summary while native stop
has not entered and the hook has no final result. Release start and observe
late acknowledgement, cleanup and final interruption. A separate leg holds
start through cleanup expiry and observes cleanup failure before release.
A queue-bypass mutation must break the positive ordering assertion. The
late-kind mutation must break both applicable diagnostic legs. Product scan
policy and timing are unchanged.

Attacked and held: scoped trace closures capture the original trace and
connect ordinal; abort captures its controller; identity-guarded cleanup
cannot clear the retry's controller; the first settlement guard still owns
the decision. Summary counts describe callback observations, not nearby
devices. Post-cleanup hook outcome is authoritative over a matched decision.

Causal limits: `TargetScanInterruptedError` can come from pre-abort, the
abort listener, or a pre-radio deadline. Detached guards after settlement
cannot replace its result. Cancel/teardown retire the attempt, suppressing
the abandoned error screen. Explicit cleanup poison gives a different
reason and blocks manual as well as targeted discovery. A pending shared
initialization/queue can repeat preamble timeouts, but that does not match
the photographed absence of timeout events. The reported successful manual
connection is a discriminator, not proof that the picker reset native state.

The reviewer checked actual vendor lifecycle call sites and the native
source, not declarations alone. No source establishes that the ignored
Chrome banner backgrounds the affected phone. New diagnostic observations
are deterministic; interpreting absent advertisements as physical radio
absence remains heuristic. No device or hardware actions were performed.

## Prescribed-code lens — substantive findings folded

Verdict: NEEDS FIXES, two proven P2 diagnostic classification defects. The
reviewer executed extracted source blocks read-only and compared the
prescription with the author-tested commit.

1. `switch (err?.name)` used an undefined name as success, conflating a
   missing error with an Error whose name was explicitly undefined. Fold:
   the undefined-name arm checks `err === undefined`; an error with missing
   metadata records `other-error`. Native-boundary tests cover undefined,
   empty and arbitrary names; the original discriminator is the mutant.
2. The existing `TARGETED_FAILURE_COPY[name]` lookup admits inherited object
   keys. `constructor`, `__proto__` and `toString` can yield no mapped
   reason, which made the new final marker say `outcome=undefined`. Fold:
   only the new diagnostic falls back to `link-failed` for a missing mapped
   reason. This keeps error-display behavior and scan policy unchanged;
   no new OS API or `Object.hasOwn` requirement is introduced. Removing
   that fallback must break the native-input-to-export assertions.

The new cases first failed on all four offending inputs and then passed
with the corrected diagnostics. These synthetic inputs establish the
classifier's contract; no evidence says installed native iOS code emitted
them during the incident. The broader pre-existing error-display mapper
remains outside this diagnostic prescription.

Other checks held: optional trace does not publish a substitute; first abort
and captured identities retain ownership; counts use independent literals;
stage advancement preserves early callbacks; real hook exports reach the
viewer and clipboard unchanged; vendor-queue and manual recovery tests
cross their intended boundaries.

## Stop and next gate

Both prescribed lenses have run and all substantive findings are folded.
Hardening stops here, with one combined ledger entry. The corrected patch
receives author verification below; normal implementation/PR review owns
any subsequent review. No physical cause, phone install, release or merge
is claimed. See [verification](verification.md) for exact command provenance.
