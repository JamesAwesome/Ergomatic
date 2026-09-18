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

Run `35050394314` (d74ce8c2) passed 597 cases first try and one on retry.
The landscape first attempt could not find the saved log's heading within
5 seconds, before any scrolling. Its error context contains no page
snapshot; the default tracing retained only the successful retry. That
does not establish why loading failed. The two-test WebKit project now
retains traces of failed attempts, so a recurrence preserves the evidence
needed to diagnose it. No speculative application fix or timeout increase
was made for this isolated loading failure.

## Single-document fixture setup (2026-09-16)

Run `35094020059` (`59a94e98`) recovered the landscape case on retry.
The retained first-attempt trace now identifies a document-load failure:
after two visits to `/`, navigation to the saved log interrupted six
Today startup requests. The log document returned HTTP 200 headers, but
its response never completed; WebKit reported `WebKit encountered an
internal error`, and `page.goto` exhausted the test budget before any
scroll assertion ran. This establishes a browser loading failure, not a
failed scroll lock. It does not establish the precise internal engine bug.

The bounded test-only fix prepares the real session and unchanged ten-step
log through `page.request`, which shares the browser context's cookie jar.
The existing HTTP-only cookie transport adjustment happens before the first
app load. Then the test navigates directly to the saved log once. Shared
helpers, production auth, scroll assertions, timeouts and retries are unchanged.
This removes unnecessary document reloads during application initialization;
it is not a claim that WebKit itself can no longer fail.

The regression guard observes actual main-frame document requests: fixture
setup must produce none, and opening the saved log must produce exactly its
one document request. Both orientations failed first against the old setup
(`[]` expected, `["/", "/"]` received), then passed with API-only preparation
(2/2, 2.2 seconds). Local validation uses only `sheetScroll.spec.ts`, the
`webkit-sheet` project, one worker, zero retries and `--trace=off`; screenshot
capture is off. The isolated stack is `ergomatic-43929`, web port 8429.
Browser debug logs show clean exit and temporary-directory cleanup; subsequent
process census found no WebKit survivors. Browser-phase samples stayed normal.

The subsequent real pre-commit hook aborted at warning memory pressure during
staged lint, before typecheck or commit. Receipt
`c6017c87-7237-43f9-ab8a-800efabb7842` records exit 130 / SIGINT and unresolved
cleanup, so the heavy loop stopped without retry or ownership recovery.
The task's three containers, network and disposable fixture volume were
removed. James subsequently authorized recovery of that exact record and
resumption. Under the existing maintenance/generation barrier, a fresh
normal-pressure census found no owner, child, observed identity or owned
process group. Recovery killed nothing and preserved the original receipt.

The real pre-commit then passed, including E2E type membership 30/30 and
verified cleanup (receipt `3d512452-ce20-4171-922c-9ea51c30a317`). The fix
landed as `252a482f` before mutation probes:

- Insert `await page.goto("/")` immediately before the fixture guard:
  both cases failed, expected `[]`, received `["/"]`.
- Insert `await page.reload()` after the saved-log navigation: both cases
  failed, expected one saved-log document request, received two.
- Append `-invalid` to the fixture sign-in secret: the portrait case failed
  at the sign-in success check with HTTP 401.
- Send fixture creation to `/api/logs/no-such-fixture-route`: the portrait
  case failed at the log-creation success check with HTTP 404.

All probes executed the real request/browser path, compiled, and used zero
retries. Restored source matched the committed spec exactly; both cases then
passed in 1.9 seconds. Browser PID 53268 exited normally and cleaned its
temporary directories; the subsequent census found no WebKit survivors.
The task's containers, network and disposable fixture volume were removed
again. Pressure samples remained normal during the resumed checks. No
screenshots or traces were captured. Exact-head full CI remains outstanding.
