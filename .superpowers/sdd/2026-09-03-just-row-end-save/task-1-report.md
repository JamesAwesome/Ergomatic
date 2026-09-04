# Task 1 report — Just Row END save flow

## Change

`Timer.handleEndTap` now delegates `mode === "justrow"` to the existing
final-phase `handleNext` finish state machine. Programmed workout END still
stages destructive abandonment. The client regression now drives END, checks
the exact finish copy and absence of abandonment, verifies the frozen 12-second
clock and stored `stopwatch-elapsed` actual, and checks `/justrow/log`. The
phone-timed Playwright flow uses END as well. No domain, server, stored shape,
CSS, or layout files changed.

## RED / GREEN

RED was captured after changing the real-behavior test and before production
editing:

```text
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session/Timer.test.tsx -t "END → stages Finish"
1 failed, 92 skipped (93)
Unable to find an element with the text: Finish this session?
Rendered baseline copy: Abandon this session? Nothing will be saved: no log, no actuals.
```

Focused GREEN after the production edit:

```text
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session/Timer.test.tsx -t "END → stages Finish"
1 passed, 92 skipped (93)
```

The complete `Timer.test.tsx` client file also passed: 93/93 tests.

## Gates

- `pnpm lint`: passed.
- `pnpm typecheck`: passed; E2E TypeScript membership 19/19.
- `pnpm format:check`: initially reported only the edited test; Prettier was
  run on that file, then format check passed (“All matched files use Prettier
  code style!”).
- Full client suite before commit: `pnpm test --project client` — 173 files,
  4,814 tests passed.
- `pnpm e2e`: 455 passed (2.4m), including the updated phone-timed Just Row
  flow.
- `git diff --check`: passed.

No coverage run was collected; per-file coverage is therefore not applicable.

## Mutation evidence

After commit `e9989789`, the unique deciding branch in `handleEndTap` was
mutated from `if (isFreeRow)` to `if (false)`. The focused regression failed
with the expected missing `Finish this session?` error and rendered the
abandonment panel. The branch was restored to `if (isFreeRow)`; the same
focused test passed (1 passed, 92 skipped), `git diff --check` passed, and
`git status --short` was empty.

## Commit

`e9989789 Route Just Row END through save flow`

## Self-review

The change is limited to the approved three files and reuses existing finish
recording, pause, completion, and navigation logic. The branch is guarded by
the existing `isFreeRow` mode discriminant, so programmed END behavior is
preserved. The e2e run emitted only the existing unset Cloudflare-token and
large-chunk build warnings; all 455 tests passed. No contradiction or concern
remains.

## Fix Round 1

Swept the owned files for stale wording. Timer comments now describe the
shared Just Row finish trigger (`▶` or `END`), distinguish the programmed
workout END abandonment latch, and describe the shared freeze/actual behavior
without assigning it to ▶ alone. The phone-timed e2e comments now name END as
the exercised trigger and identify Next phase as the supported alternate path.
No production behavior changed.

Covering command and output:

```text
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session/Timer.test.tsx -t "END → stages Finish"
1 passed, 92 skipped (93)
```

The fix-round commit is recorded below; `git status --short` was clean after
the comment-only changes were committed.
