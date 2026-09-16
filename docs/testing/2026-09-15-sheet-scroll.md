# Sheet scroll regression after v0.50.1

The provenance sheet must hold the log behind it still. James's
`ScreenRecording_09-15-2026 22-14-41_1.mp4` shows the sheet stationary while
the log moves underneath. v0.50.1 (`2458b2e9`) locks the body, but
`FromTheLog` renders a fixed `.overlay-screen` with its own `overflow-y:
auto`. That element, not the document, owns the position in this case.

## Evidence and proof contract

- Production invariant: opening a sheet prevents user scrolling of its
  background scroll ancestors, preserves their offsets, and leaves the
  sheet's own scrolling available. Closing restores background scrolling.
- Supported path: POST a ten-interval machine log through `/api/logs`, open
  `/today/log/:id`, scroll the log, click WHERE THESE NUMBERS COME FROM,
  then scroll over the backdrop. The fixture has >200px scroll room in
  both 390x844 and 844x390; its numbers are fixture data, not a math oracle.
- Independent observable: the log main element's `scrollTop`. The original
  `touch.spec.ts` watches `window.scrollY` on Library, a different owner.
- Deciding-source mutation: remove the ancestor collection from SheetShell
  while retaining the body lock. Both WebKit cases must fail at the held
  background offset. A deleted restoration must fail close/unmount tests.
- Claim ceiling: this reproduces and gates the background-scroll leak in
  desktop Playwright WebKit. It does not claim a new on-phone touch test.
  The supplied recording establishes the phone symptom, not the fixed build.

On the served v0.50.1 bundle, `sheetScroll.spec.ts` fails in both orientations:
expected main.scrollTop 300, received 600 after one backdrop wheel. Chromium
passes the same defective bundle. This is why the new `webkit-sheet` project
runs this file in local e2e and CI, with WebKit installed explicitly.

With the extended ancestor lock, `pnpm e2e sheetScroll.spec.ts touch.spec.ts
provenance.spec.ts --reporter=line` passes all seven cases. The WebKit legs
also prove the log scrolls before opening and after Close; landscape proves
the sheet scrolls while its background stays still. `library.spec.ts`,
`today.spec.ts` and `log.spec.ts` pass 54 tests against the same rebuilt stack.
The stack is `ergomatic-52951`, web :8251, from the `codex-sheet-scroll`
worktree; source changes require rebuilding before retesting served UI.

PRIMARY: [CSS Overflow Level 3](https://www.w3.org/TR/css-overflow-3/#overflow-properties)
defines `hidden` to prohibit direct user scrolling while retaining a scroll
container. [Viewport propagation](https://www.w3.org/TR/css-overflow-3/#overflow-propagation)
applies the body's overflow to the viewport; it does not lock descendant
scroll containers. The existing platform concept is sufficient: no touch
interceptor, fixed-body offset restoration, or new scroll state is needed.

## Scope and lifetime

SheetShell snapshots the existing body's overflow and each auto/scroll
ancestor's inline x/y values and priorities for one open effect. Cleanup
restores them on close or unmount; reopening takes a new snapshot. The
backdrop, sheet and its descendants are excluded from ancestor collection.
No offsets are written, no state survives unmount, and there are no new
platform APIs or dependencies. Multiple simultaneously open sheets remain
outside the existing caller contract; this change does not add such a mode.

No copy, layout, number semantics, persisted shape, server or auth changes.
No design/PM/DBA/antagonist gate applies. This follow-up takes independent
specification and code reviews because the previous fix did not resolve the
reported symptom. No phone installation or operator walk is part of this PR.

## Component checks

`pnpm test --project client src/components/SheetShell.test.tsx`: 21 passed;
the two new cases first failed on the body-only implementation (expected
`hidden`, received `auto`). They exercise close and unmount, nested scroll
ancestors, preservation of a mixed-priority declaration, and exclusion of
sheet content. The scoped coverage run reports SheetShell 97.1% statements,
91.89% branches, 100% functions and lines. Its aggregate coverage command
exits nonzero because only one file's tests ran; that is not a full coverage
pass. Existing guards account for the remaining uncovered branches.

## Verification and self-mutations

On commit `0581c30b`, full unit/client checks passed: 332 files, 8628 tests
passed and one existing skip. Lint, typecheck and format checks passed.
The root pre-commit hook was verified with a temporary explicit-any lint
violation; it blocked the attempt, and the probe file was removed.

After committing the fix, replaced `owners.push(node)` with
`owners.push(document.body)` and rebuilt the compose stack successfully.
Both new component cases failed (ancestor remained `auto`); both WebKit
cases failed (expected 300, received 600). Restored the committed file.
Then changed ancestor cleanup from restoring `value` to `value || "hidden"`:
both close and unmount cases failed because an originally absent axis stayed
locked. Restored again: 21 component tests passed. Rebuilt the restored
stack: all seven sheet/provenance/touch browser tests passed again.

Specification review found the first test captured its reference offset only
AFTER opening, leaving an opening jump unguarded. The test now saves the
pre-open offset and compares it after opening, after the backdrop gesture,
and after Close. Both orientations pass this stronger assertion. The
connected diagnostics sheet's two portrait/landscape design tests also pass.

The reviewer's exact opening-jump mutant (`node.scrollTop = 0` during
ancestor collection) built successfully and failed BOTH strengthened cases
at the post-open assertion: expected 300, received 0. The committed source
was restored after the probe.

Independent specification review: PASS after the pre-open-offset correction
and its exact mutant. Independent code review: no blockers or important
findings; its one minor stale test comment was corrected to distinguish
body scrolling from the log's separate scroll owner. The final restored
WebKit run passed both strengthened cases. No implementation changes arose
from either review.

The first full CI run (`35048629284`, e80bbc7e) passed all 596 existing
browser tests, but Linux WebKit rejected the inherited Chromium-only
`--disable-blink-features=WebBluetooth` launch flag before either new test
could run (including their retries). The WebKit project now explicitly
supplies an empty argument list. macOS WebKit had accepted that flag, so
local green did not establish cross-platform browser startup.

The corrected CI run (`35049486739`, 683b7603) passed 597 browser cases
first try and one on retry. The portrait retry was a test-setup race:
its fixed 350ms pause sampled the first 300px wheel at 167px, then that
wheel completed at 300px after the sheet opened. The setup now positively
awaits the wheel's full 300px delta before capturing the pre-open position.
Sheet scrolling and post-close scrolling likewise await their observed
movement. The backdrop's negative assertion retains its settling pause.
The product lock is unchanged; this corrects when the test calls setup done.
