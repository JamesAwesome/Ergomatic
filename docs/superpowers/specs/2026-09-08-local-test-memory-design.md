# Local test memory — stop the OOM, and stop calling it flake

**Date:** 2026-09-08
**Status:** design, awaiting James's approval
**Scope:** `app/vitest.config.ts`, `app/playwright.config.ts`,
`app/package.json`, `app/scripts/`, `.husky/pre-push`, `CLAUDE.md`,
`ROADMAP.md`

## What and why

Test runs on this machine are being killed for want of memory, and the
kill looks exactly like a flaky test — so an agent retries it, into a
machine that has just proved it has no room, and the loop costs a
session. This design does three things in that order: it makes a
memory kill say so out loud, it makes a local run cost less, and it
moves the full suite's authority to CI where the memory is somebody
else's. It does not try to make the Mac bigger.

The whole thing is grounded in measurements taken on 2026-09-08 on
James's machine (16 GB, 10 logical cores / 4 performance cores,
Node 26.5.0, Vitest 4.1.11). Every number below is PRIMARY unless
tagged otherwise.

## The measurements

**Baseline, at rest, before any test command:**

| Quantity | Value |
| --- | --- |
| Total process RSS | 8.8 GB of 16 GB |
| Swap used | 6.6 GB of 7.2 GB |
| Free pages | 66 MB (4127 pages × 16 KB) |
| Swapouts vs swapins | 16.2M vs 14.7M |
| Live `claude` processes | 3 (~340 MB each) |
| Live git worktrees | 6 |
| Largest single consumer | Chrome, 2.3 GB |
| Docker (VM + backend) | 1.3 GB |

Command: `ps -Ao rss,comm`, `vm_stat`, `sysctl vm.swapusage`,
`git worktree list`.

**`pnpm exec vitest run --project client` (215 files), peak RSS of the
node process tree, sampled at 0.5 s:**

| `--maxWorkers` | Wall | Peak node RSS |
| --- | --- | --- |
| 2 | 64 s | 1.15 GB |
| 4 | 38 s | 1.84 GB |
| 6 | 41 s | 2.63 GB |
| default (unset → 10) | 25 s | 2.76 GB |

**6 workers is strictly dominated by 4** — slower *and* 0.8 GB
heavier. That domination is PRIMARY (both rows above were measured).
The *explanation* — that workers 5 and 6 land on efficiency cores
while still paying a full jsdom + React module graph each — is
**INFERENCE** from the 4/10 performance/logical core split; no
per-core scheduling was observed. The design rests on the measured
domination, not on the explanation, so the inference being wrong
changes nothing here.

**Two premises that did not survive measurement**, recorded because
each was about to select a design (recurring failure 30):

1. *"Idle per-worktree compose stacks are the memory driver."* False.
   `docker stats --no-stream` over two live stacks: **236 MB total**,
   ~118 MB per stack. Forcing `E2E_KEEP=0` is worth doing for
   staleness and disk, and it is not a memory lever.
2. *"The coverage run is the heavy one."* False. `--coverage` over
   unit + client peaks at **2.81 GB** against the plain run's 2.76 GB —
   a 50 MB difference. The v8 provider is not a factor.

**What a memory kill actually looks like.** Probed by running the
client suite under `--max-old-space-size=48`:

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
----- Native stack trace -----
 1: ... (15 frames)
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command was killed with SIGABRT
exit=1
```

Three properties, and together they are the whole bug:

- **The exit code is 1** — the same code a genuine test failure
  produces. Nothing downstream can tell them apart by status.
- **No test summary is printed at all.** No `Test Files` line, no
  `Tests` line, no named failing test.
- **The one diagnostic sentence is buried** under a 15-frame native
  stack trace, so a `tail` of the output scrolls it off the top.

An agent reading that sees a non-zero exit with no named failure,
concludes "flaky, re-run it", and re-runs. That is the reported loop,
and it has a mechanism rather than a mood.

An OS-level kill (the machine, not V8, running out) is a different
signature again: SIGKILL, exit 137, `Killed: 9`, and likewise no
summary.

## The design

### Part A — a memory kill says so

**A1. A test wrapper that classifies the exit.** `pnpm test` and the
pre-push hook route through `app/scripts/test-run.sh`, which runs
Vitest, captures the output, and on a non-zero exit classifies it
before returning:

- stderr contains `Reached heap limit` → **V8 heap OOM**
- exit 137, or `Killed: 9`, or SIGKILL on the child → **OS memory kill**
- non-zero exit with **no `Test Files` line** in stdout → **the suite
  did not complete**, cause unclassified

**The first two print a memory verdict; the third must not.** A run
can fail to reach its summary for reasons that are not memory — an
unhandled rejection in a setup file, a killed parent, a config error —
and a banner reading `MEMORY KILL` on those would be exactly the
over-claim recurring failure 26 describes. So there are two banners:

```
!! MEMORY KILL — the suite ran out of memory and did not complete.
!! NOT a flaky test. Do not re-run it. See CLAUDE.md RF37.
```

```
!! SUITE DID NOT COMPLETE — no test summary was printed.
!! NOT a flaky test, and not necessarily memory. Read the output
!! above before re-running anything. See CLAUDE.md RF37.
```

Both carry the load-bearing half ("not flake, do not reflexively
re-run"); only the first names a cause, and only where the cause was
actually observed in the output.

The wrapper preserves the original exit code; it adds a verdict, it
does not swallow one. A clean pass prints nothing extra.

The classifier's own correctness is gated by
`app/scripts/test-run.test.sh` (the pattern `scripts/*.test.sh`
already established, run by CI's `scripts` job), feeding it captured
fixture output for **six** cases: a heap OOM, an exit-137 kill, a
no-summary non-zero exit, a real test failure, a clean pass, and
`--changed` with an empty selection (C1). The last three assert that
**no** banner appears, and the no-summary case asserts it gets the
*second* banner rather than the first — so the gate can go red in both
directions and on the distinction between them (recurring failure 21).

**A2. A CLAUDE.md recurring-failure entry.** New RF37: a non-zero exit
with no `Test Files` line is never flake, and is never re-run. It
extends the existing "read both test summary lines" rule from
"a suite that failed to load reports zero tests" to "a suite that
was killed reports nothing at all". The entry carries the three
signatures above verbatim, so an agent can classify output it sees
without the wrapper (a scoped `vitest` invocation, a subagent's
transcript, CI logs).

**A3. A preflight advisory.** Before a heavy run the wrapper prints,
and does not block (James's call, 2026-09-08):

```
NOTE: another Ergomatic test run is live (pid 1234, worktree av).
      Free pages 66 MB, swap 6.6/7.2 GB. Consider a scoped run.
```

Liveness is a pidfile under `/tmp` shared across worktrees — not a
per-worktree file, because the resource being contended is the
machine. The advisory is stale-safe: a pidfile whose pid is gone is
ignored and rewritten. Blocking was considered and rejected; the
warning's job is to make the *next* line of output interpretable when
the run does get killed.

### Part B — a local run costs less

**B1. `maxWorkers` defaults to 4 in `vitest.config.ts`, and is
overridable.** Written as:

```ts
maxWorkers: process.env.CI
  ? undefined
  : Number(process.env.ERGOMATIC_TEST_WORKERS) || 4,
```

at the top-level `test` block, so it applies to every project.
Measured cost on this machine: +13 s on the client suite. Measured
saving: 0.92 GB of peak.

Three deliberate properties:

- **The default is a literal, not `os.cpus()`.** The number that
  matters is 4 *performance* cores, and `os.cpus()` reports 10 logical
  ones — a derived value would pick 10 here, which is the setting being
  fixed. The measurement table above is cited in a comment beside the
  literal.
- **`ERGOMATIC_TEST_WORKERS` overrides it.** The default is tuned to a
  16 GB / 4-performance-core Mac under three concurrent agent sessions.
  On a larger machine that ceiling is a tax, and the escape hatch is
  one exported variable rather than a config edit that would then need
  reverting before a commit.
- **CI is not capped.** `undefined` restores Vitest's own default on
  the runner, whose memory is not this machine's problem and whose core
  count is not this machine's either.

**B2. Playwright `workers` gets the same shape.** Currently unset, so
Playwright defaults to half the logical cores — 5 concurrent Chromium
instances locally. Becomes `process.env.CI ? undefined :
Number(process.env.ERGOMATIC_E2E_WORKERS) || 2`. **Cost untested:** no
wall-clock or RSS measurement of the e2e suite at either setting was
taken for this spec, because each run rebuilds and boots a compose
stack. Flagged rather than guessed (recurring failure 30); the
implementation measures it and records the number, and if 2 proves
badly slower the default is revised in that PR rather than after it.

**B2a. Both variables are documented where they will be found** — a
CLAUDE.md line under Commands naming them, what the defaults are tuned
for, and that a beefier machine should raise or unset them. An
undocumented escape hatch is one nobody uses.

**B3. No change to Docker, container limits, or `E2E_KEEP`** on memory
grounds — see the falsified premise above. A separate `E2E_KEEP=0`
default may still be worth it for stack staleness, and is out of scope
here so that it can be argued on its own evidence.

### Part C — the gate is tiered

**C1. Pre-push runs related tests only.** The hook becomes
`vitest run --changed origin/main` (via the wrapper), which runs the
tests reachable from the files the branch touched. Fast, light, and
the common case.

Three properties of `--changed` verified on Vitest 4.1.11 before this
was specified (recurring failure 13 — an instruction is a claim about
the system):

- `--changed [since]` exists in this version. `pnpm exec vitest --help`:
  `--changed [since]  Run tests that are affected by the changed files`.
- It genuinely narrows. `--project client --changed HEAD~1` selected
  **6 test files / 85 tests in 1.85 s**, against 215 files / 25 s for
  the full project.
- **An empty selection exits 0**, not 1. `--changed HEAD` on a clean
  tree returns exit 0 and prints no `Test Files` line, with or without
  `--passWithNoTests`. So a docs-only push does not need a special
  case, and the flag is not added.

That last point interacts with A1's third classifier and does not
collide with it: A1's no-summary rule fires only on a **non-zero**
exit, and this path exits 0. `test-run.test.sh` carries it as an
explicit fixture that must print no banner.

**C2. `pnpm test:full` is the explicit full run**, unchanged in
meaning from today's `pnpm test`, for when an agent has reason to
want it.

**C3. CI is the only place the full suite is mandatory.** No change to
`ci.yml` — it already runs `pnpm test:coverage` and the full e2e job.
The change is that nothing local claims to be equivalent.

**C4. A CLAUDE.md rule stating what a local green now means.** This is
load-bearing and easy to get wrong: a scoped local pass is evidence
about the files it covered and nothing more. The rule names the two
places the distinction bites — the existing recurring failure 1
("changing UI without running `pnpm e2e`") becomes "push and read the
e2e job", and any claim of the form "the suite is green" must say
which tier produced it.

**C5. Full e2e is CI-first.** Locally, agents run named specs against
an already-booted stack; the full `pnpm e2e` is not the default way to
answer "did I break the UI". Recurring failure 1's text is amended
accordingly rather than deleted — its point (a UI change needs e2e
evidence *before* you report done) stands; only the place the evidence
comes from moves.

## What this does not do

- It does not reduce the baseline. Chrome at 2.3 GB, three agent
  sessions, and six worktrees are the standing pressure, and they are
  a working-style question rather than a code one. Deliberately out of
  scope; if the measured levers here prove insufficient, that is the
  next place to look and the ROADMAP row says so.
- It does not add container memory limits or reap docker volumes.
- It does not make any suite faster. B1 and B2 trade wall-clock for
  headroom on purpose — on this machine. Both ceilings are env-var
  overridable and neither applies in CI, so a more powerful machine
  pays nothing it does not choose to.

## Testing

| Change | How it is proven |
| --- | --- |
| A1 classifier | `scripts/test-run.test.sh`, six fixtures: heap OOM, exit 137, no-summary, real failure, clean pass, empty `--changed`. The last three assert no banner; no-summary asserts the second banner, not the first. |
| A1 end to end | Run the real client suite under `--max-old-space-size=48` and assert the banner appears and the exit code is preserved. |
| A3 advisory | Two fixtures: a live pidfile (advisory prints) and a stale one whose pid is gone (silent, file rewritten). |
| B1 | The measurement table is re-run at the default and the number recorded in the PR. Two more cases: `ERGOMATIC_TEST_WORKERS=8` is observed taking effect, and `CI=1` is observed leaving Vitest's default in place. |
| B2 | Measured during implementation; the recorded number replaces the "untested" tag here. Override and CI paths asserted as for B1. |
| C1 | A branch touching one file pushes and the hook is observed running that file's tests and not the other 300. A docs-only branch pushes and the hook passes without a banner. |
| C4/C5 | Prose. Reviewed, not tested. |

## Open questions

None blocking. B2's cost is unmeasured and flagged as such; the
implementation measures it before choosing the value.

## Risk

The one that matters: **C1 makes local green weaker, and an agent that
does not internalise C4 will over-claim.** The mitigation is that C4
is a CLAUDE.md rule rather than a convention, and that A2's banner
makes the other new failure mode loud. If over-claiming shows up in
review, the answer is to strengthen C4's wording, not to revert C1 —
the full local suite was never the thing keeping main green.
