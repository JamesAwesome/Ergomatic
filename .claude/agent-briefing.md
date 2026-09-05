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

## Specs and briefs are evidence-backed (Phase 7's own cost)

- **Every load-bearing claim in a spec, plan, or brief carries its
  evidence**: a `file:line` read THIS session, a committed capture, or a
  doc §-number. "The code does X" without a citation is a guess wearing a
  suit. Phase 7C's adversarial spec review found four BLOCKING findings,
  every one an unverified premise about code the spec never read (inputs
  the builder could not reach; rows the manual path never emits; server
  bands real hardware exceeds; a column with no table). Phase 7B shipped
  a paused predicate derived from an artifact of the wrong machine state.
  Citing forces reading; reading finds these before a reviewer must.
- **Hardware-behavior claims cite a committed capture** (§18 or a log
  file in-repo), never conversation memory. A brief once cited wire hex
  "in §18" that existed only in the chat — the implementer rightly
  refused to fake the decode. If the evidence lives in the conversation,
  COMMIT IT to the record first, then cite it.
- **An unobserved wire premise never ships as a hard gate.** If a
  predicate keys on a byte no capture has shown in the deciding state,
  ship it with a fallback path plus a log entry that records which path
  fired — then the next hardware session settles it (the `rowingActive`
  pattern). Corollary for the fake: model such fields HONESTLY (the
  machine's own default state), never "helpfully" — a fake that defaults
  a byte to what the gate wants makes every test unable to disprove the
  premise.
- **Cite the line that would FALSIFY the claim, not the line that names
  its subject.** The warmup spec's five blocking findings shared one
  shape: it cited `buildDraft`'s definition but not its return statement
  (which disproved the claim), `Phase.meters` but not the pricing
  function that cannot price it, a component but not the `.map` that
  contradicted the design. Before writing "X does Y", find the line
  that would prove X does NOT do Y, and read it.
- **"The plan pins it" may only defer a SCALAR** (a constant, a bound, a
  key name) whose owner file is named. It may never defer a premise the
  design's architecture depends on — that is evidence-dodging wearing a
  deferral's clothes, and it spent three of its five uses that way in
  one spec.
- **A `§`-citation carries its quoted sentence.** Both of the warmup
  spec's §-citations pointed at sections whose text contradicted the
  claim (one refuted by its own heading) — the number was carried from
  conversation and the section never opened. Quote one sentence from
  the cited section beside the claim; if you cannot, you have not read
  it.
- **Deleting a union member: enumerate every union that shares the
  name.** `Step`'s `"wu"` and the phase/segment vocabulary's `"wu"` are
  different unions; a removal spec that does not list each same-named
  member and its fate will delete the wrong one or miss a survivor.
- **A spec that invalidates STORED data states its ordering.** Name
  every read path that touches the old shape, whether each revalidates,
  and what runs first (migration vs deploy vs client cache) — "a
  one-time strip" without ordering is a white-screen with a delay.
- **A fix that didn't fix it is evidence about the MECHANISM.** When a
  symptom survives your fix, stop iterating at that layer: enumerate
  every producer of the visible behavior (grep for setTimeout / dwell /
  auto-advance near the screen; list every writer of the state) and get
  one capture that discriminates between them before the next attempt.
  Three gate rewrites once chased a skip that was a designed timer in a
  different component.

## Research before invention (2026-08-14)

- If your task invents a mechanism, or touches something the OS, browser or
  device owns, or turns on what a wire field MEANS — read the primary source
  before you design. Vendor docs and specs first, implementation source
  second, blog posts last and labelled. Tag claims PRIMARY / SECONDARY /
  INFERENCE and cite URLs. "Nothing authoritative found" is a result: record it.
- Before modelling a state or capability, establish the real system HAS it.
  A PAUSED state shipped here that the PM5 does not have; the wire fact was
  known and written down, and nobody asked the product question.
- The `antagonist` agent (`.claude/agents/antagonist.md`) exists for both jobs
  and keeps a ledger of how this codebase has fooled people before. Reading
  `.claude/agents/antagonist-ledger.md` is worth the two minutes: the same
  shapes recur.

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
  coverage _text_ reporter omits some directories; the HTML report under
  `app/coverage/` is authoritative. Say which source you used.
  `app/domain/**` is pinned at 100%.

## Gates, scoped by change class

| Your diff touches                   | You must run                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| any product code under `app/src/`   | `pnpm lint` · `typecheck` · `format:check` · `test --project unit --project client` · **`pnpm e2e`** (and `pnpm screenshots` if a screen's layout changed — open the images and describe what you see) |
| `app/domain/` or `app/server/` only | lint · typecheck · format:check · `test --project unit` (+ integration if Docker is available)                                                                                                         |
| tests only                          | lint · typecheck · format:check · the covering project(s)                                                                                                                                              |
| comments/docs only                  | lint · typecheck · format:check                                                                                                                                                                        |

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
  real library workout (`app/server/seed/library/index.ts`'s
  `LIBRARY_WORKOUTS`, the generated 300) via `fromWorkout`, not a hand-built
  minimum. Fixtures emptier than production have hidden two shipped defects
  and one bricking bug.
- Values in your brief that the controller computed by head are marked
  `UNVERIFIED — check before use`; verify them. Unmarked values still lose
  to what the code actually says.
- **Before you finish a task, grep for comments describing what you just
  changed** — a stale rationale is a defect here, and comment sweeps have
  cost a fix round in each of the last two phases. This includes doc files:
  `docs/design/DEVIATIONS.md` documents current state, not history.
- **The `docker compose` e2e/screenshots stack is PER-WORKTREE** (Phase CL,
  `scripts/stack-env.sh`, sourced by `e2e.sh`/`screenshots.sh`): every value
  — `COMPOSE_PROJECT_NAME`, the `ERGO_STACK` container-name prefix, the
  host `APP_PORT`/`POSTGRES_PORT`, and `playwright.config.ts`'s baseURL —
  derives deterministically from the worktree's own absolute path, so the
  same checkout always reuses its own stack (including its own `pgdata`
  volume) and two checkouts can never share one. Two sessions running
  browser gates from different worktrees no longer stomp each other's
  fixtures or serve each other's bundle — that used to be a real failure
  mode (duplicate `.workout-row` matches, a served bundle from the wrong
  branch reading as ~70 phantom failures) and is why this section used to
  carry a `down -v`/bundle-identity workaround; the workaround is gone
  because the collision it guarded against no longer exists. Explicit env
  still wins (every assignment is `:-` guarded), so you can still pin a
  port or project name by exporting it first.
  Two things from that era still apply generally, not just to the old
  shared-stack case: (1) **verify bundle identity before trusting any
  browser-gate result** is still good belt-and-braces practice whenever a
  result looks impossible — curl the served page's hashed asset and grep
  it for a string distinctive to your latest source; (2) Docker's LAYER
  CACHE can still serve a stale image after a real source change even
  inside your own per-worktree stack (not a multi-session artifact) — if
  the served bundle doesn't match your latest source, `docker compose -f
compose.yml -f compose.e2e.yml build --no-cache` before `up`.
- **Never override the e2e env contract**: `scripts/e2e.sh` and
  `e2e/helpers.ts` hardcode their shared `TEST_AUTH_SECRET`
  (`e2e-secret`); forcing your own value into the compose env 401s every
  backdoor sign-in and reads like a mass regression.
- **Drizzle migrations apply by TIMESTAMP, not journal order.** Two
  branches minting the same migration index = whichever merges second
  gets silently skipped (api logs "migrations up to date", requests 500
  on the missing column). The branch that merges second REGENERATES its
  migration off new main (delete + `pnpm db:generate`) — never a mere
  journal merge. Check open PRs for a competing index before you
  generate one. **And a migration REWRITTEN IN PLACE on a branch changes
  its hash:** any DB that already applied the OLD version (a
  per-worktree dev volume, a long-lived local stack) will refuse or
  mis-track the new one — CI's fresh containers never hit this, so it
  looks like a local ghost. Pre-merge rewrites are legitimate ONLY while
  the migration has never shipped; after any rewrite, reset stale dev
  volumes (`docker compose -p <stack> down -v`) rather than debugging
  the hash mismatch (#182's fix wave hit exactly this).

## Report contract

Write your full report to the path your dispatch names. It must contain:
what you changed, every gate you ran with its result, per-file coverage for
files you touched, each self-mutation with its fail-then-pass evidence, the
commit SHA(s), and anything that contradicted your brief. Your final message
back is ONLY: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED),
commit SHA(s), a one-line test summary, gate results, and concerns.

## Test invocation (a trap that has bitten three agents)

NEVER run bare `vitest run` / `pnpm vitest run`: Node 26's experimental
webStorage global collides with jsdom's `localStorage` and ~445 client
tests fail with `localStorage.clear()` errors that look like a real
regression. Always `pnpm test` / `pnpm test:coverage` (their scripts set
`NODE_OPTIONS=--no-experimental-webstorage`), or export that flag
yourself if you must invoke vitest directly.

## Session-scoped state (RF27 — binding for plans and implementers)

Any change introducing state tied to a connection, session, attempt, or
document lifetime carries a LIFETIME TABLE in its plan/brief: each ref,
guard, and counter; its mint site; its clear sites; what survives teardown,
relaunch, and re-arm. Specs and plans state INVARIANTS ("one entry per
logical session"), never mechanisms ("push a slot on teardown"). Any new
Web/OS API names its availability floor against
`IPHONEOS_DEPLOYMENT_TARGET` (currently 15.0) with a citation.

## Before any ready-for-re-review signal (controller checklist)

1. `git merge origin/main` on the branch; resolve; gates green on the
   merged tree.
2. A CI run EXISTS for the exact head AND is green (an empty check rollup
   is not green — the #258 premature-comment lesson).
3. The PR body names the current head with exact commit/test counts; a
   grep for every superseded figure and retired phrasing comes back empty.
4. When a reviewer states a rule, adopt its wording VERBATIM and sweep all
   sibling phrasings in the same round.
5. Then, and only then: the PR comment explaining the round + the chat
   sentence, both explicit.

## Plan authoring: what the hardening loop should never have to find

Measured on Wave E PR1.75b (2026-09-02), whose native plan took ELEVEN
antagonist passes (`git log 606d3f72..15fb3c61` on `wave-e-pr175b-native`).
Six of the eleven found drift in bookkeeping the plan itself invented, and
three of the remaining five found things the author could have found by
running a command. The four rules below exist to make
those eight passes unnecessary; the `harden` skill owns what is left.

- **A plan states no number it has not measured.** Every expected count,
  line count, and gate pass value carries the command that produced it and
  the tree it ran against (a commit SHA, or "the baseline worktree at
  `<sha>`"). A reasoned pass value is a heuristic wearing a number: gate (a)
  asserted a `SwiftCompile` log count of `1` — the one value it can never
  legitimately print, since a real Sources-phase member counts 4 on a cold
  build and 0 on a warm one. Nobody had run the build.
- **Cite by provenance, never by line numbers into the document under
  discussion, and carry no self-describing bookkeeping.** Such a citation
  cannot survive its own fold: prepending one paragraph moves every one of
  them. Cite Task/step/symbol. This binds the hardening REPORTS as hard as
  the plan — measured across all twelve revisions of PR1.75b's plan, the plan
  carried none and every instance lived in a report citing the plan by line.
  The same rule kills pass-count bullets and revision tallies, which grew
  from 2 mentions to 21 across those revisions, one per fold. And it kills
  hand-transcribed corpus tables: that plan's 14-row census table never
  changed size, but its cells went stale as later steps changed the corpus
  they described, and two rows were falsified by the plan's own prescribed
  text. If a census is needed, the plan carries the SCRIPT and a base-vs-head
  diff, never the numbers.
- **Paste-test every prescribed block before the plan is finished.** Extract
  each code block to its REAL path in a scratch tree and run the repo's own
  gates — `pnpm typecheck` and `pnpm lint`, not only `format:check`, which
  is the one gate that cannot fail on semantics — then run the prescribed
  tests against the prescribed implementation. Run every shell block and
  every mutation instruction as written (`node -e`, `bash -n`); a mutation
  is code. Check each command's inputs against `.gitignore` and walk the
  prerequisite chain to the first command whose inputs are all TRACKED —
  fixing only the hop that failed left `cap sync` needing a gitignored
  `dist/` one layer up. This is the rule most worth making mechanical: it is
  a command, not an intention.
- **Anything handed to James is checked against HIS shell and HIS machine.**
  RF13 extended: his default shell is fish, and a walk card's FIRST block once
  used `set -a; . .env; set +a`, which fish rejects. **Measured 2026-09-04 on
  the installed fish 4.8.1: `export FOO=bar`, the `VAR=value cmd` prefix and
  `$(...)` all WORK; what fails is `set -a; . file; set +a` and bare
  `unset`.** This bullet used to say `export` was not fish; it is. Paste the
  block into `fish -c '...'` rather than reasoning about the dialect. Read what
  a prescribed command WRITES, not only what it prints (`pnpm ios:build`
  stamps two tracked files), and name who restores it. For every walk
  observation, state the precondition that makes a NO possible — without it
  the observation is decoration.

Two habits that cost passes on the same plan and are cheap to keep: for
every "grep X finds nothing" sentence, paste the grep's ACTUAL output and
name any hit that does not count; and before citing "replace lines N-M",
print line M+1 and confirm it is not part of what you named.
