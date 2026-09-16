# Three residual repairs — 2026-09-15

James explicitly requested repairs for all three remaining shapes. This
continues the authorized hunt; it changes fake/test machinery, not real
Bluetooth, NFC behavior, user-visible copy, or the test retry/timeout policy.
Historical evidence is in [residual dispositions](residual-dispositions.md).

## PAIRING and its PROGRAMMING sibling

The retained retry showed a 2.54-second accessibility sweep outliving a
1.2-second fake connection delay. Commit `fa30af23` gives the injected fake
an explicit connect/write pause. Each sweep owns its stage, asserts it both
before and after the audit, releases in `finally`, then requires READY.
READY itself needs no artificial delay. The default fake is unchanged;
write processing/ACK side effects remain synchronous.

The seam tests begin with the injected script, resolve the actual transport,
advance ten seconds of fake time, and require only the selected operation
to remain pending. Resuming the other operation must not release it;
resuming its owner must, and later calls must resolve normally.

- Red `0d860bc8-d051-4dc2-8035-bdc57f7b5639`: both operation cases settled
  before release against the original implementation.
- Green `191902c1-fff7-49ee-9b63-5f2013a86c19`: index and fake client files,
  142 tests passed.
- Served browser `e4276dba-bc90-4392-ba0d-060c112b4ab7`: PAIRING,
  PROGRAMMING and READY passed. The same invocation deliberately included
  the NFC late-observer red below; its aggregate result is **failure**.

## NFC: observe before acting, retain the evidence

The old locator began after `click()` returned and could miss the transient
confirmation. A deterministic late-observer probe awaited READY before the
old status assertion: it failed in `e4276dba`. This demonstrates the oracle
failure, not that the exact historical scheduler has been reconstructed.

The repaired browser test arms a sampler **before clicking**. It requires
the exact accepted copy, a visible positive-size element, and two consecutive
animation-frame observations. It retains that observation on the document
for assertion after READY. Handoff first records an explicit failure. The
observer does not delay the product, add dwell, or fake the accepted state.
The client test controls frame callbacks and checks the real routed detail
before and after the first callback, then allows the second and requires
READY through the normal parser/handoff/session path.

This proves a committed visible state across a rendering opportunity, not
physical display/compositor output. React's [flushSync contract](https://react.dev/reference/react-dom/flushSync)
and the browser's [rendering algorithm](https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering)
are the primary boundaries; no minimum millisecond duration is promised.

- Browser green `5319cdc3-0ac4-4f75-ac88-028741cb524d`: one test passed,
  receipt asserted after READY, retries zero.
- Client green `9b2300dd-1dbd-4d51-98bd-25193d3939bf`: all 16 tests passed,
  no act/environment warning. Earlier passing runs with warnings are not
  substituted for this run. The mount's async capability probe is now
  inside `act`, as are explicitly advanced frame boundaries.

## FILTER: remove avoidable scan-result work, preserve coverage

The historical outer partial-run span was 23.439 seconds, including a
21.656-second browser evaluation, following roughly 6.6 seconds of setup.
The scan covered 302 background workout rows and 1,545 contrast candidates;
raw result JSON was 3,354,784 UTF-8 bytes. The old runner's amplification is
still unexplained; there is no justified attribution to memory or a shared
cause with the other two failures.

Installed axe 4.13 / `@axe-core/playwright` source establishes that modern
`runPartial` serializes passing-node details before `resultTypes` pruning.
Native `run` prunes before materializing retained report nodes. A real
three-arm probe (`c59d96c6-1c7d-4ed9-bfd3-d441a021f9ce`) measured:

| Mode | Total ms | Audit ms | Raw serialization ms | Returned JSON bytes |
| --- | ---: | ---: | ---: | ---: |
| Modern, full | 1,941 | 474 | 426 | 2,460,078 |
| Modern, pruned | 1,595 | 456 | 430 | 34,666 |
| Native legacy, pruned | 582 | 466 | Not invoked | 34,666 |

All three had the same 302 rows, 60 rule IDs, 1,545 contrast candidates and
zero violations. This is one fixed-order sample, not a speedup distribution.
Audit timing excludes context setup and result work; the remainder is not
all serialization. The measured repair removes avoidable serialization and
aggregation, without diagnosing every contributor to the historical delay.

The [vendor explicitly warns](https://github.com/dequelabs/axe-core-npm/blob/develop/packages/playwright/README.md#axebuildersetlegacymodelegacymode-boolean--true)
that legacy mode omits cross-origin frames. The helper therefore subscribes
to frame attachments **before** its frame census. Existing child frames use
the original modern mode; any attachment during a single-frame audit makes
that result fail, even if the child detaches. The listener is removed in
`finally`. No silent rerun or ignored warning can turn that into green.
The `frame-tested` warning alone is insufficient: its tags are outside the
existing WCAG selection.

The helper keeps the whole document, both existing WCAG tags, all current
rules including contrast, the full Library and the existing timeout.
`options` precedes `withTags` because axe's options setter replaces previous
configuration. Only passing-node detail is pruned; all violation and
incomplete-node detail is retained. Two unrelated all-rule auth audits keep
their original builder and are not narrowed to the shared WCAG selection.

- Red `b99676fb-bad2-4d0d-9aa6-989ad82f0317`: original modern helper opened
  an extra aggregation page and accepted attach→detach rather than rejecting.
- Green `67bf15bf-fec4-46c2-b354-14c6bfab075b`: seven tests, including both
  original FILTER sweeps, passed. A full-Library corruption witness detects
  exact rule/target pairs for document language, an unnamed background
  workout link, an unnamed sheet button, and low-contrast sheet text.
  The computed #eee/white ratio is 1.16:1; restoring the page passes.
  A real cross-origin child reports its own nested `image-alt` target.
  Attachment/removal rejects; normal and error paths release the listener.

## Verification envelope and remaining gates

All local invocations use one worker and zero retries, with native reports
and separate command/resource receipts. Launches require macOS pressure
level 1; a warning from concurrent work prevented one invocation from
starting (exit 75), not a test failure or a retry. No other task was killed.
The owned compose project is `ergomatic-48389` (web 8489, Postgres 15489),
verified by worktree labels. Its clean `down -v` / restart was rehearsed
before application probes. The pinned cached Postgres image was used after
an owned image-pull wait was cancelled; no test was running at that point.

Reproduce the named checks from `app/` against a fresh fake-enabled compose
build, with the worktree's `E2E_BASE_URL` and one-worker ceilings:

```sh
export ERGOMATIC_TEST_WORKERS=1 ERGOMATIC_E2E_WORKERS=1
node scripts/test-evidence.mjs run vitest -- bash scripts/test-run.sh --project client src/monitor/transports/index.test.ts src/monitor/transports/fake.test.ts src/workout/WorkoutDetail.nfc.test.tsx
node scripts/test-evidence.mjs run playwright -- node_modules/.bin/playwright test e2e/a11y.spec.ts --project=chromium --retries=0
node scripts/test-evidence.mjs run playwright -- node_modules/.bin/playwright test e2e/design.spec.ts e2e/connected.spec.ts --project=chromium -g 'PAIRING state|PROGRAMMING state|valid PM5 tag|zero WCAG 2A/2AA violations with the FILTER sheet open' --retries=0
```

### Deciding mutations after the real fix commits

All ten additional source mutants failed their intended assertions, with
zero retries. The two served NFC mutations compiled successfully and their
unique version strings were verified in the serving container's bundle.
The first served mutant combines two independent changes: NFC's fixture
does not use the paused operation, and the stage sweeps do not use NFC.

| Mutation | Native receipt | Deciding failure |
| --- | --- | --- |
| Apply resume instead of injected pause | `4d15fe96-00b0-4b29-a2aa-44f349d7514b`; served `8befcdea-2121-45f3-b02c-164ec813c664` | Both client operations settle early; served PAIRING absent initially and PROGRAMMING absent after sweep |
| Bypass fake paused promise | `b34ba6ea-7233-4abd-898b-e7ccd407fc31` | Both held-operation assertions see settled true |
| One-frame rather than two-frame barrier | `4d15fe96-00b0-4b29-a2aa-44f349d7514b`; served `8befcdea-2121-45f3-b02c-164ec813c664` | Client status absent immediately after first frame; browser reaches READY but receipt says handoff-before-confirmation |
| Accepted commit sets false | `1f61a3b3-36b7-4b10-af53-252a34e30584` | Browser reaches READY but receipt says handoff-before-confirmation |
| Force legacy for cross-origin child | `f2c23a64-0609-4d76-9238-d6251bd6b68b` | Nested image-alt violation missing |
| Require attachment AND remaining frame | `9e315be2-7a1c-4d6d-afac-8f3015ee13ba` | Attach→detach audit resolves instead of rejecting |
| Remove wrong event listener | `718ac263-476c-40cc-bc48-713bfcafe1fe` | All three success/error cleanup checks retain one listener |
| Include only the dialog | `7f8f4322-89c9-498f-9691-f01884646bdc` | Full-document corruption witness loses required rule/target |
| Disable contrast rule | `edf25ebe-28b7-4882-8e5f-4c3cf339dc81` | Contrast corruption witness loses required rule/target |
| Force modern aggregation for single-frame | `8152a7c0-2ad9-4a5f-b704-1d04364f15ca` | Unexpected extra browser page allocated |

Every source mutation was restored (`git diff --exit-code -- app/src app/e2e`
empty). A fresh successful compose build served version
`flake-restored-e75df133`, image
`sha256:061675871ed554b151e1c878cb0de27093d7e2403e0edfd7a1fd44f641ecdcf3`.
Restored browser receipt `a73bbc7d-b9df-4249-ba06-3b11d914d1a4` passed all
11 selected checks in 8.6 seconds, zero retries; restored client receipt
`72653b90-5303-4bc6-bacd-c8a2c6e268f8` passed all 158 tests in three files
in 2.20 seconds, no act warnings. The genuine commit hook passed lint,
format and complete typecheck/E2E membership 29/29 at `e75df133`.

Independent review of fixed range `29316ef7..e75df133`: **Standards PASS /
Spec PASS**, no actionable findings. A separate NFC review verified the
actual first-frame mutant failure site and warning-free clean output.
Exact-head CI remains pending at this checkpoint. Raw reports/traces
remain private and ignored because they can contain session credentials;
the UUIDs identify local native receipts, not durable external artifact URLs.
No all-flakes-zero claim or merge approval follows from scoped greens.

After final local checks, the controller verified all three container labels
and removed only `ergomatic-48389` with `down -v`. Container and volume
listings for that project are empty; its disposable test data is recreated
by the next stack boot. No other stack was touched. The worktree remains
until James approves and the PR actually merges.
