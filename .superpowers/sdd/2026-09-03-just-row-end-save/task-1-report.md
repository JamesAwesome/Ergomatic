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

The worker did not collect coverage in the initial pass. The controller's
current-head coverage evidence below supersedes that initial omission.

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

The fix-round code/comment commit is `41932030`; `git status --short` was
clean after the comment-only changes were committed.

## Fix Round 2 — whole-branch review

Added an idempotent guard at the start of `handleEndTap`: once either
confirmation is staged, repeated END is ignored. This preserves the finish
latch for running Just Row, keeps an already-paused Just Row paused, and
prevents programmed Next→END from stacking abandonment over finish. Updated
the inaccurate distance/finish comments and made the e2e compare the exact log
door time with the history row's persisted display value.

RED before the production guard (new regressions only):

```text
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session/Timer.test.tsx -t "twice|programmed final-phase Next"
2 failed, 1 passed, 92 skipped (95)
- programmed Next then END found the unexpected Abandon confirmation
- running Just Row END twice then Keep going could not find RUNNING
```

GREEN after the guard and wording/e2e assertions:

```text
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session/Timer.test.tsx -t "twice|programmed final-phase Next"
3 passed, 92 skipped (95)

NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session/Timer.test.tsx
95 passed (95)
```

Prettier, `format:check`, and `git diff --check` passed. Commit
`0bcec432 Make timer finish confirmations idempotent` was created after
`git rev-parse --show-toplevel` confirmed the named worktree; commit hooks
passed lint, typecheck, and E2E TypeScript membership 19/19. The worktree was
clean after commit. Full client and e2e gates are delegated to the controller
for this fix round.

## Controller verification — current implementation head `b92bf633`

After the fix-round commits, the controller ran the required gates against the
current implementation head without further product-code changes:

```text
pnpm lint
passed

pnpm typecheck
passed; E2E TypeScript membership 19/19

pnpm format:check
passed; all matched files use Prettier code style

pnpm test --project unit --project client
231 files passed; 6,616 passed, 1 skipped

pnpm test
255 files passed; 6,982 passed, 1 skipped

pnpm test:coverage --project unit --project client
231 files passed; 6,616 passed, 1 skipped
aggregate: 96.44% statements, 95.23% branches, 95.04% functions,
96.88% lines
Timer.tsx: 97.26% statements, 93.04% branches, 100% functions,
100% lines

pnpm build
passed (existing large-chunk warning only)

pnpm dist:grep
passed; none of the 8 dev-only markers found

pnpm e2e
455 passed (4.1m), including the exact log-door-to-history time comparison
```

An earlier attempt ran coverage, all-project tests, and e2e concurrently; the
two Vitest processes timed out in unrelated `Releases` and `library-moves`
tests under resource contention. The isolated `pnpm test` and coverage reruns
above passed completely. The e2e process from that attempt also passed all 455
tests.
