# Desk-only diagnostic capture — 2026-09-04

James approved this diagnostic-only change after the walk pause. It reduces
manual receipt copying and records native facts needed to distinguish a reader
request from actual RF activation. It does not implement the product Scan NFC
button or authorize another hardware session.

Runtime and tests under review: `0e034b48..200d9f1c`. Native build gates pass,
but the browser regression gate is red. No walk is ready.

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

## Browser regression blocker

`E2E_KEEP=0 pnpm e2e` returned 452 passed / 3 failed. The news unread count remained
seven after BACK; two retest scenarios saved a session but showed Today rather
than the post-test baseline offer. An unchanged focused run of `news.spec.ts`
and `retest.spec.ts` with one worker returned 11 passed / 2 failed: news passed,
the same two retest failures reproduced. These paths and their assertions
were not changed. The NFC probe is absent from the normal browser artifact.
The failures' root cause is not established here; the E2E gate is not waived.
No unrelated product fix or assertion weakening was performed.

Both test runs removed their ergomatic-39232 containers/network; the existing
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

A future walk still requires PM PASS on an exact, feasibility-checked runsheet
and James's separate agreement under `CLAUDE.md`. No walk is scheduled.
