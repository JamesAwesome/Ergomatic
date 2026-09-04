# Desk-only diagnostic capture — 2026-09-04

James approved this diagnostic-only change after the walk pause. It reduces
manual receipt copying and records native facts needed to distinguish a reader
request from actual RF activation. It does not implement the product Scan NFC
button or authorize another hardware session.

Runtime and tests under review: `0e034b48..7e10d289`. Native and browser gates
pass. The bounded next walk was re-hardened after its prior PM review;
`NF-NORMAL-TRACE-v5` at `5f1c716b` now has PM PASS and remains unscheduled until
James separately agrees.

## What changed

- DEBUG native `NFC_GATE_DIAGNOSTIC` lines record NDEF begin/return, delivered
  RF-active callbacks, native endings and connect/query/read error origins.
  Output is limited to fixed names, plugin-scoped generation, monotonic uptime,
  an allowlisted domain category and numeric code. No tag bytes, hardware
  address, attempt UUID, error description or userInfo are added to the trace.
- The existing v1 redacted receipt is automatically framed before terminal
  cleanup, after it settles, and at entry/final points of controlled reload.
  Export failure cannot prevent cleanup or silently authorize reload. Existing
  manual/controller verification remains separate; no automatic advancement,
  new storage, reader-start delay, retry or UI copy/layout change was added.
- A small production-used session factory/scheduling extraction enables
  no-radio native tests through the real coordinator and callback handlers.
  Default native session creation and bridge/lifecycle behavior remain the
  same. This tests callback handling when delivered, not physical RF behavior.

## Desk verification

- Before the change: focused NFC client tests 99/99; all six retained receipt
  files strictly serialized and frame-roundtripped without modification.
- Frozen JavaScript: lint/format/typecheck PASS, E2E TypeScript membership 19/19.
  Whole unit/client coverage run: 233 files, 6,716 passed / 1 skipped; aggregate
  statements/branches/functions/lines 96.45/95.16/95.21/96.99 percent.
  HTML per-file probe 95.24/91.87/98.8/98.74; receipt helper 100 across all four.
  Seven jsdom scrollTo-not-implemented warnings were emitted.
- Production build and dist-grep PASS. A flagged positive build contains the
  receipt marker in GateMinusOneProbe-CfNNe92B.js; restoring the normal build
  removes it. Normal index-BvPiYzj4.js contains no diagnostic probe marker.
  The build reports its large-chunk advisory.
- Scoped native producer suite 7/7 PASS. Removing the actual RF-active emission
  makes its test fail (three messages instead of four); restoring it passes.
  Tests drive connect/query/read errors and a stale callback via a no-radio
  session/tag double on the actual coordinator queue. No phone was operated.
- Focused client verification after the review fix passed 62/62. Mutations
  proved the tests reject a cached final receipt, incorrect export-failure
  latch initialization or retirement, an absent post-cleanup final export,
  and inverted RESTART status priority.
- Full native XCTest 20/20 PASS, independently read from
  `/tmp/capgo-full-1788543810.xcresult`: iPad (A16) simulator / iOS 26.5. Generic
  Debug and Release package builds PASS; Release NfcPlugin.o excludes the
  diagnostic marker. These are desktop artifacts, not a phone installation.

Commands used for the JavaScript gates: `pnpm lint`, `pnpm format:check`,
`pnpm typecheck`, `pnpm test:coverage --project unit --project client
--maxWorkers=1`, `pnpm build`, `pnpm dist:grep`. Native producer run uses the
package-root CapgoCapacitorNfc XCTest scheme with the NfcDiagnosticTraceTests
selection on the iOS simulator, not a physical destination.

## Browser regression resolution

The first `E2E_KEEP=0 pnpm e2e` run returned 452 passed / 3 failed. The news
unread count remained seven after BACK; two retest scenarios saved a session
but showed Today rather than the post-test baseline offer. An unchanged focused
run of `news.spec.ts` and `retest.spec.ts` with one worker returned 11 passed /
2 failed: news passed, while the same two retest failures reproduced.

The retest failures were a test-ordering race: the save could run before the
asynchronous workout-library response established that the test workout was
global, so the supported nonblocking product path correctly skipped the
optional offer. The E2E fixture now delays that response deliberately and both
affected tests await it before finishing. The forced-delay pair passed 2/2.
This changes no product behavior and does not weaken the offer assertions.

A subsequent full run returned 453 passed / 2 failed on two builder geometry
assertions. Both passed in 40/40 parallel focused repetitions, then passed in
the final full run. The final `E2E_KEEP=0 pnpm e2e` result is 455/455 passed.
The NFC probe is absent from the normal browser artifact; the E2E gate is not
waived.

All E2E runs removed their ergomatic-39232 containers/network; the existing
test volume remains. No phone process was polled or signalled.

## Hardware and evidence limits

The phone still has the paused session's older temporary hold/release build.
The local dependency now uses the new checked-in diagnostic patch without that
overlay; the old overlay's source/diff/review artifacts are preserved. Do not
treat the phone installation as the software verified by this desk work.

Native generation is not a durable join to v1 receipt attempts across plugin
instances or documents. Missing callback output means unobserved, not proof
that RF never activated. Console emission is not a host durability receipt or
a causal explanation for the earlier failure. No saved receipt or gate
criterion was retroactively promoted. Gate -1 remains NO-GO/incomplete.

`NF-NORMAL-TRACE-v3` at `6d10fc80` received PM PASS, but its manual controller
shapes were retired after hardening found fail-open evidence and cleanup seams.
Its replacement, `NF-NORMAL-TRACE-v5`, keeps the eight-minute, zero-rowing,
zero-capture, one-attempt boundary and moves execution and outcome decisions
into tested controller code. v5 at `5f1c716b` has PM PASS and still requires
James's later separate agreement. No recovery, background, held, reload,
timeout, Flipper, multi-tag, programming or product-implementation work is
approved.

## Prepared diagnostic artifact

The optional `VITE_NFC_GATE_MINUS_ONE_PREFILL` diagnostic build value now
populates the five already-known phone/PM5 fields so the operator types no
metadata. Absent, malformed or partial input leaves the fields empty and the
sample disabled; retained reload metadata still takes precedence. The focused
NFC suite passed 108/108, static checks passed, the normal flag-off build passed
`dist:grep` and excluded both hardware values and the variable name, and the
full browser regression passed 455/455 with teardown.

The signed Debug artifact from app-source commit `7e10d289` is
`/tmp/ergomatic-phase-nf-ready.WQJqQu/Build/Products/Debug-iphoneos/App.app`.
Its executable SHA-256 is
`bb4e30e5387664b6f8914855ef1aa45280916394d597637871ac80abc2ff8dbf`;
its probe asset SHA-256 is
`b333816b7ccf4960c2c7035298f844104af33bff351ac3fb1a18f4c02ffb07a0`.
Strict/deep code-sign verification passed, CDHash is
`96d980eec0b53de9446b72589d8e41324224f58a`, the effective NFC entitlement is
exactly TAG, and the usage string is unchanged. `cap sync ios` left the tracked
tree clean. The controller-only strict reassembly command also reconstructed
the retained real normal frames byte-for-byte, so the approved run has no
operator copy step.
