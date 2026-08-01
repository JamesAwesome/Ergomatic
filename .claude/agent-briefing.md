# Agent briefing — read this before your task brief

Every subagent working in this repo reads this file first. Your dispatch
message carries only your task brief's path and task-specific notes; the
standing rules live here so they cannot drift between dispatches.

## SDLC (binding)

- All implementation happens in **git worktrees**, never in the main checkout.
  Your dispatch names your worktree. **`cd` into it as your FIRST action and
  never use absolute paths into the main checkout** — agents have left stray
  writes there four separate times.
- **Run `git rev-parse --show-toplevel` before every commit** and confirm it
  prints your worktree path. The check catches what the instruction alone has
  not.
- Never merge, close, or approve PRs. Never remove worktrees. Never use
  `git stash` (the stash stack is shared with other sessions).
- If your brief contradicts what you observe in the code, **say so in your
  report** instead of working around it silently. Plan errors are found this
  way every phase — the brief is not automatically right.

## Environment

- All commands run from `app/`. Node 26 is required:
  `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first, or the git
  hooks block your commit with a version error.
- `pnpm` only. ESM only; relative imports inside `app/domain/` and
  `app/server/` carry `.js` extensions even though the files are `.ts`.
- Hooks are installed at BOTH roots of your worktree (repo root and `app/`).
  If a commit lands without lint-staged output appearing, STOP — the hooks
  did not fire; run `pnpm install` at the worktree root and re-verify before
  trusting any further commit.
- **Coverage:** the 90×4 gate is a repo-wide aggregate and will not notice an
  uncovered branch in a file you touched — read the per-file rows. The
  coverage *text* reporter omits some directories; the HTML report under
  `app/coverage/` is authoritative. Say which source you used.
  `app/domain/**` is pinned at 100%.

## Gates, scoped by change class

| Your diff touches | You must run |
|---|---|
| any product code under `app/src/` | `pnpm lint` · `typecheck` · `format:check` · `test --project unit --project client` · **`pnpm e2e`** (and `pnpm screenshots` if a screen's layout changed — open the images and describe what you see) |
| `app/domain/` or `app/server/` only | lint · typecheck · format:check · `test --project unit` (+ integration if Docker is available) |
| tests only | lint · typecheck · format:check · the covering project(s) |
| comments/docs only | lint · typecheck · format:check |

The final whole-branch review always runs everything regardless — these
scopes exist for task and fix rounds, not the last gate. Leaving e2e red
after an `app/src/` change has gated CI three times; the full-suite row is
not negotiable.

## Definition of done includes self-mutation

For **every behavioural test you add**: break the code path it guards, run
the covering tests, confirm they FAIL, restore, confirm green. Document each
mutation and its result in your report. A test that passes against broken
code is the repo's most-recurred defect class; it stops with you, not with
the reviewer. Guards and predicates deserve mutants that target their exact
logic (a rounding predicate gets a value where round and floor disagree, not
a value where they agree).

## Conventions that have burned agents before

- Aria-labels: builder rows are `Row N …` (`Row 1 duration`,
  `Row 1 rest value`, `Row 1 pace base`); the expanded editor's header
  buttons are `Step N …`. Three agents have lost time to this. Read the
  component before writing selectors.
- CSS custom properties only, never raw hex. Hit targets ≥44×44 px. Text
  contrast ≥4.5:1 — **compute the ratio and put the number in your report**,
  never judge by eye. Inputs keep `font-size: 16px` (iOS Safari zooms below
  it). 2px radii, no shadows, no animation.
- **Realistic fixtures**: at least one test per client task starts from a
  real starter workout (`app/server/seed/starter.ts`) via `fromWorkout`, not
  a hand-built minimum. Fixtures emptier than production have hidden two
  shipped defects and one bricking bug.
- Values in your brief that the controller computed by head are marked
  `UNVERIFIED — check before use`; verify them. Unmarked values still lose
  to what the code actually says.
- **Before you finish a task, grep for comments describing what you just
  changed** — a stale rationale is a defect here, and comment sweeps have
  cost a fix round in each of the last two phases. This includes doc files:
  `docs/design/DEVIATIONS.md` documents current state, not history.

## Report contract

Write your full report to the path your dispatch names. It must contain:
what you changed, every gate you ran with its result, per-file coverage for
files you touched, each self-mutation with its fail-then-pass evidence, the
commit SHA(s), and anything that contradicted your brief. Your final message
back is ONLY: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED),
commit SHA(s), a one-line test summary, gate results, and concerns.
