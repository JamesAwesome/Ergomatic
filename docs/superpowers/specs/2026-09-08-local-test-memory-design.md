# Local test memory — stop the OOM, and stop calling it flake

**Date:** 2026-09-08
**Status:** design, awaiting James's approval. Revised after `/harden`
lens 1; that pass falsified two of this spec's load-bearing premises and
the revision is written through rather than appended.
**Scope:** `app/vitest.config.ts`, `app/playwright.config.ts`,
`app/package.json`, `app/scripts/`, `.husky/pre-push`,
`.github/workflows/ci.yml`, `CLAUDE.md`, `.claude/agent-briefing.md`,
`docs/TESTING.md`, `ROADMAP.md`

## What and why

Test runs on this machine are being killed for want of memory, and the
kill is being read as a flaky test — so it gets retried, into a machine
that has just proved it has no room, and the loop costs a session.

The first draft of this spec said the kill was *indistinguishable* from
a test failure. That was wrong, and it was wrong because of how the
measurement was taken: **the operating system does tell us, and we throw
the signal away in two specific places.** The design is now mostly about
not throwing it away, which is smaller and more reliable than the
classifier it replaces.

Three parts: make a killed run say so (A), make a local run cost less
(B), and move the full suite's authority to CI (C). It does not try to
make the Mac bigger.

Measurements were taken 2026-09-08 on James's machine (16 GB, 10 logical
/ 4 performance cores, Node 26.5.0, Vitest 4.1.11, bash 3.2.57).
Claims are PRIMARY unless tagged.

## What we know, and one thing we do not

### The machine is at the edge before anything runs

| Quantity | Value | Command |
| --- | --- | --- |
| Total process RSS | 8.8 GB of 16 GB | `ps -Ao rss=` summed |
| Swap used | 6.6 GB of 7.2 GB | `sysctl vm.swapusage` |
| Free pages | 66 MB (4127 × 16 KB) | `vm_stat` |
| Swapouts vs swapins | 16.2M vs 14.7M | `vm_stat` |
| Live `claude` processes | 3 (~340 MB each) | `ps -Ao rss,comm` |
| Live git worktrees | 6 | `git worktree list` |
| Largest single consumer | Chrome, 2.3 GB | `ps -Ao rss,comm` |
| Docker (VM + backend) | 1.3 GB | `ps -Ao rss,comm` |

### The signal exists, and two things destroy it

A V8 fatal OOM raises `SIGABRT`; an external SIGKILL is `SIGKILL`. Both
reach the caller as an exit code **above 128** — unless something eats
it. Measured with a scratch package (`scripts/` appendix), each shape run
against the same two failures:

| Invocation shape | V8 heap OOM | SIGKILL |
| --- | --- | --- |
| raw `node` | **134** | **137** |
| `pnpm run <script>` | **134** | **137** |
| `pnpm exec <cmd>` | **1** | **1** |

**Destroyer 1 — `pnpm exec`.** It collapses a signal death to exit 1 with
`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`. The first draft of this spec
measured through `pnpm exec` and concluded from it that the system gives
us nothing. It gives us plenty. This matters more than a footnote,
because **CLAUDE.md prescribes that exact shape**: the documented
workaround for pnpm swallowing scoped flags is
`NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`.
The repo's own advice routes agents onto the one path where the signal
dies.

**Destroyer 2 — a fork-worker OOM.** Vitest 4 defaults to `pool: "forks"`
and each fork carries its own heap limit (measured: `heap_size_limit` =
4192 MB). When a *worker* OOMs, the parent survives: exit **1**, a full
`Test Files` summary, and `Errors 1 error`. No status signal at all, and
the output is shaped exactly like a flaky failure. **This, not the parent
crash, is the case the design most needs to catch.**

### Two V8 messages, not one

V8 has at least two fatal OOM strings and the Node 26.5.0 binary carries
both (`strings $(which node)`): `Reached heap limit` and `Ineffective
mark-compacts near heap limit`. A gradual object-growth loop — the shape
a real test run has — printed `Ineffective mark-compacts` on **4 of 4**
runs. The first draft keyed its classifier on `Reached heap limit`, which
that probe never emits.

Both share the substring **`JavaScript heap out of memory`**. That is the
needle, and it is the only message needle this design uses.

### `Killed: 9` is unreachable and is not used

That string is written by the parent shell's job control to its own
stderr, never by the child. `out=$(node -e "process.kill(process.pid,'SIGKILL')" 2>&1)`
gives `rc=137` and an empty capture. A wrapper that captures its child
can never see it. Dropped from the design.

### The thing we do not know, and it is load-bearing

**No capture of James's actual failure exists.** Everything above
describes reproductions. Two facts sit awkwardly together and the spec
will not pretend otherwise:

- A V8 heap OOM is a **per-process** limit of 4192 MB here, while the
  whole node tree at default concurrency peaks at **2.76 GB**. No single
  process is near its own ceiling, so these runs should not spontaneously
  V8-OOM.
- An OS memory kill of a terminal-launched `node` on darwin is
  **unobserved**. macOS uses `memorystatus`, not the Linux OOM killer;
  `runningboardd` logs "Ignoring jetsam update because this process is not
  memory-managed" for unmanaged processes, `kern.memorystatus.kill_on_sustained_pressure_count`
  is 0 on this machine, and every kill in a 6-hour `log show` window was
  an `idle-exit` reap of a managed daemon. That is absence of evidence
  over one window, not proof of absence.

So **Part B's lever (machine pressure) and Part A's classifier (a process
death) may not be aimed at the same event.** Both are independently
worth doing; the causal story joining them is not established, and no
amount of further desk argument will establish it.

**Therefore A0, and it comes first.** Before B and C are tuned, the
wrapper ships with a capture step: on any classified kill it writes
`exit code, signal, the last 40 lines of stderr, vm_stat, sysctl
vm.swapusage, and the output of
`log show --last 5m --predicate 'eventMessage CONTAINS "memorystatus: killing"'`
to `app/.test-kills/<timestamp>.txt` (git-ignored). The next real kill
then answers the question this spec had to leave open, from the machine
rather than from a reproduction.

## The design

### Part A — a killed run says so

**A1. A wrapper that reads the signal, deterministically first.**
`pnpm test` and the pre-push hook route through `app/scripts/test-run.sh`,
which runs Vitest **in a signal-preserving shape** (never `pnpm exec`)
and classifies:

| # | Condition | Verdict | Class |
| --- | --- | --- | --- |
| 1 | exit ≥ 128 | killed by signal `exit-128`; 134 = SIGABRT (V8 fatal), 137 = SIGKILL | **deterministic** |
| 2 | stderr contains `JavaScript heap out of memory` | heap OOM — **checked regardless of exit code or of whether a summary printed** | heuristic, covers the fork case |
| 3 | non-zero exit and no `Test Files` line in stdout | suite did not complete, cause unknown | heuristic |

Rule 2 is deliberately not gated on the others: the fork-worker OOM
exits 1 *and* prints a summary, so any rule that requires a missing
summary or a signal exit misses the case that matters most.

Rules 1 and 2 print the memory banner; rule 3 prints the weaker one. A
crash that is not a memory crash must not be promoted to a memory verdict
(recurring failure 26):

```
!! MEMORY KILL — the suite ran out of memory and did not complete.
!! NOT a flaky test. Do not re-run it. Details: app/.test-kills/<file>
```

```
!! SUITE DID NOT COMPLETE — no test summary was printed.
!! NOT a flaky test, and not necessarily memory. Read the output above.
```

The wrapper preserves the child's exit code; it adds a verdict, never
swallows one. A clean pass prints nothing extra.

**Two mechanical constraints on the wrapper**, both of which have bitten
this repo already:

- **It owns `NODE_OPTIONS`.** `package.json`'s `test` script currently
  hard-sets `NODE_OPTIONS=--no-experimental-webstorage`, and an inline
  assignment in a script **replaces** the caller's — measured: exporting
  a heap cap and running `pnpm --dir app test` left the cap unapplied and
  the suite passed. Dropping the flag costs 1582 false failures
  (CLAUDE.md). The wrapper sets it itself and appends rather than
  replaces anything a caller passes.
- **Bash here is 3.2.57** (`/bin/bash`, the only bash on the machine).
  No `mapfile`, no associative arrays, no `${var,,}`.

Gated by `app/scripts/test-run.test.sh`, one fixture per row:

| Fixture | Expected |
| --- | --- |
| exit 134 (SIGABRT) | memory banner |
| exit 137 (SIGKILL) | memory banner |
| exit 1, `JavaScript heap out of memory` on stderr, **summary present** | memory banner (the fork case) |
| exit 1, `Reached heap limit` variant | memory banner (both V8 strings) |
| exit 1, no `Test Files` line | **incomplete** banner, not the memory one |
| a real test failure | no banner |
| a clean pass | no banner |
| `--changed` with an empty selection | no banner |

Rows 3 and 5 are the ones that can go red in the interesting directions:
row 3 fails if the classifier requires a missing summary, row 5 fails if
it promotes an unexplained crash to a memory verdict.

**A2. A CLAUDE.md recurring-failure entry (RF37)**, carrying three
things an agent needs without the wrapper: that **exit ≥ 128 is a signal
death, not a test result**; that **`pnpm exec` collapses it to 1**, so
the documented scoped-run workaround hides the very signal this rule
depends on; and that a fork OOM exits 1 *with* a summary, so a summary's
presence proves nothing. Never re-run a suite that produced any of the
three.

**A3. A preflight advisory** — warns, does not block (James's call,
2026-09-08). Its memory readout is the deterministic part and the reason
it earns its place:

```
NOTE: another Ergomatic test run is live (pid 1234, worktree av, started 14:02).
      Free pages 66 MB, swap 6.6/7.2 GB. Consider a scoped run.
```

**Lifetime table** (recurring failure 27 — invariants, not mechanisms):

| Aspect | Rule |
| --- | --- |
| Identity | `(pid, process start time, worktree path)`. Pid alone is a heuristic — pid reuse is real on a machine forking 4-10 workers per run. Start time from `ps -o lstart= -p <pid>` makes it deterministic. |
| Scope | One directory of entries under `/tmp`, one file per run — **not** a single shared file. A single file cannot represent two live peers, and its "ignore and rewrite" step is the operation that erases a live one. |
| Mint | One entry written at wrapper start, after the advisory is printed. |
| Clear | Removed by an `EXIT` trap. A SIGKILLed run, a Ctrl-C without the trap firing, and a crashed parent all leave the entry behind. |
| Stale | An entry whose pid is dead, or alive with a different start time, is ignored and deleted by the next reader. Deleting another run's entry is impossible because entries are per-run. |
| Survives | Nothing survives a reboot (`/tmp`). Entries survive a killed run until the next reader sweeps them. |
| Invariant | **The advisory never blocks and never fails a run.** Any error reading, writing or sweeping the directory is swallowed; a broken advisory must never be the reason a test command fails. |

### Part B — a local run costs less

Both caps are **deterministic settings**; what rests on measurement is
the choice of number.

| `--maxWorkers` | Wall | Peak node RSS |
| --- | --- | --- |
| 2 | 64 s | 1.15 GB |
| 4 | 38 s | 1.84 GB |
| 6 | 41 s | 2.63 GB |
| unset (→ 9 workers) | 25 s | 2.76 GB |

**6 is strictly dominated by 4** — slower *and* 0.8 GB heavier. That
domination is PRIMARY. The *explanation* (workers 5 and 6 landing on
efficiency cores) is **INFERENCE**; no per-core scheduling was observed,
and the design rests on the domination, not the explanation.

**Verified before prescribing.** Every block below was pasted and run
(`.claude/agent-briefing.md`, "Plan authoring"). The oracle is
`scripts/count-test-workers.sh`, **scoped to the run's own app path** —
the first version counted machine-wide and returned 9 foreign workers
belonging to another worktree, which is exactly the number the
propagation claim rests on. Re-measured against a verified floor of 0:

| Claim | Result |
| --- | --- |
| Top-level `test.maxWorkers` reaches `projects[]` | unset → **9**, `2` → **2**, `4` → **4**. Exact and monotonic. |
| `maxWorkers: undefined` reads as unset | **9 workers.** |
| Playwright accepts `workers: undefined` | Config loads; 703 tests in 18 files listed. Source-confirmed: `takeFirst` skips `void 0`, falling through to `"50%"`. |
| Playwright's local default is 5 | PRIMARY, `playwright/lib/common/index.js`: `takeFirst(..., "50%")`, `resolveWorkers` = `max(1, floor(10 × 0.5))`. |

**B1.** In `vitest.config.ts`, top-level `test` block:

```ts
maxWorkers: process.env.CI
  ? undefined
  : Math.max(1, Number(process.env.ERGOMATIC_TEST_WORKERS) || 4),
```

**B2.** In `playwright.config.ts`:

```ts
workers: process.env.CI
  ? undefined
  : Math.max(1, Number(process.env.ERGOMATIC_E2E_WORKERS) || 2),
```

**Cost untested** for B2: no wall-clock or RSS measurement of the e2e
suite at either setting, because each run rebuilds and boots a compose
stack. Flagged rather than guessed (recurring failure 30); the
implementing PR measures it and records the number.

**The clamp is not decoration.** Run through absent / empty / valued:
`undefined`, `""`, `"0"`, `"abc"` all land on the default, but `"-2"`
passes straight through unclamped, and Playwright's `resolveWorkers`
*throws* below 1. `Math.max(1, …)` is what prevents a typo'd minus sign
from breaking the runner. The upper end is deliberately unbounded.

**B3. No change to Docker, container limits, or `E2E_KEEP` on memory
grounds.** Measured: two live compose stacks cost **236 MB total**
(~118 MB each), and `--coverage` adds **50 MB** over a plain run (2.81 vs
2.76 GB). Neither is a memory lever. Both premises were falsified during
this spec's own measurement and are recorded so nobody re-derives them.
A separate `E2E_KEEP=0` default may still be right for staleness; it is
out of scope so it can be argued on its own evidence.

### Part C — the gate is tiered

**C1. Pre-push runs the related tests, plus the gates `--changed` cannot
reach.** Three constraints, each from a measured defect:

- **The ref is resolved first, and a missing ref fails loud.** Measured:
  `vitest run --changed origin/nope --project unit --project client`
  exits **0** with "No test files found" and **not one word** on either
  stream — git exits 128, but the runner's git helper does not throw, so
  the change set is empty and zero tests run. If `origin/main` is ever
  absent (remote not named `origin`, ref pruned, a fresh clone, a fork)
  the gate silently runs nothing, forever. The hook runs
  `git rev-parse --verify --quiet origin/main` and falls back to the full
  scoped suite when it fails.
- **`--project unit --project client` is kept.** The current hook is
  Docker-free by design and says so in its own comment; dropping the
  project flags re-admits the `integration` project (testcontainers,
  `testTimeout: 120_000`), so a server change would make the hook require
  Docker.
- **The whole-tree gates always run.** `--changed` selects through vite's
  module graph, so a test whose subject is a *file it reads* rather than a
  *module it imports* is structurally unselectable. Measured selections:
  `vitest.config.ts` → **0 tests**, `pnpm-lock.yaml` → **0**, a Swift
  plugin file → **0**, `src/native/webAuth.ts` → 7, **without**
  `scripts/webauth-contract.test.ts`, which exists to guard exactly that
  file. The census and contract suites under `scripts/` are appended
  unconditionally. Note that B1's own edit to `vitest.config.ts` selects
  nothing, as does every Dependabot lockfile bump.

**C2. `pnpm test:full`** is the explicit full run, unchanged in meaning
from today's `pnpm test`.

**C3. CI is the only place the full suite is mandatory.** `ci.yml` already
runs `pnpm test:coverage` and the full e2e job. What changes is that
nothing local claims to be equivalent — **plus one addition**: the
`scripts` job enumerates its seven test scripts by name and does not
glob, so `test-run.test.sh` is added as a named step or it never runs
anywhere.

**C4. A CLAUDE.md rule on what a local green now means** — evidence about
the files it covered and nothing more, and any "the suite is green" claim
names its tier.

**C5. Full e2e is CI-first**, with named specs run locally against an
already-booted stack. Recurring failure 1's point stands; only the source
of the evidence moves.

**C6. The amendment lands in all three places the instruction lives.**
Recurring failure 34 is precisely the failure of stating an invariant and
applying it to one site: besides CLAUDE.md's RF1, the same instruction
lives in `.claude/agent-briefing.md`'s gate table (*any product code under
`app/src/` → `pnpm e2e`*), which every subagent reads before its brief,
and in `docs/TESTING.md`. All three change together or none do.

## What this does not do

- It does not reduce the baseline. Chrome at 2.3 GB, three agent
  sessions, six worktrees — a working-style question, deliberately out of
  scope. If the measured levers prove insufficient, that is where to look.
- It does not add container memory limits or reap docker volumes.
- It does not make any suite faster. B trades wall-clock for headroom on
  this machine only: both caps are env-overridable and neither applies in
  CI.
- **It does not prove that Part B prevents the event Part A classifies.**
  A0's capture is what will settle that, from a real kill.

## Testing

| Change | How it is proven |
| --- | --- |
| A1 classifier | `scripts/test-run.test.sh`, one fixture per row of A1's table, asserting that row's banner or its absence. |
| A1 signal preservation | The wrapper is run under a heap cap through its real entry point and observed returning ≥ 128, not 1. |
| A1 fork case | A deliberately allocating test in a fork under a low `--max-old-space-size`; assert exit 1, summary present, **memory banner printed**. |
| A0 capture | Assert the file is written, names the exit code and signal, and that a failure to write it never changes the command's exit code. |
| A3 advisory | Fixtures: a live peer, a dead pid, a live pid with a *different start time* (reuse), two simultaneous peers, and an unreadable directory (must stay silent and not fail the run). |
| B1 | Worker counts re-measured with the path-scoped oracle against a verified floor. `ERGOMATIC_TEST_WORKERS=8` takes effect; `CI=1` leaves the default. |
| B2 | Measured during implementation; the number replaces the "untested" tag. Override and CI paths as for B1. |
| C1 ref guard | `origin/main` made unresolvable; assert the hook falls back to the full scoped suite and says so, rather than passing on zero tests. |
| C1 coverage | A branch changing only `vitest.config.ts` is pushed; assert the `scripts/` gates still run. |
| C3 | The new CI step is named in `ci.yml` and observed running. |
| C4/C5/C6 | Prose. Reviewed, not tested — but a grep asserts no un-amended `pnpm e2e` instruction survives in the three files. |

## Risk

**C1 makes local green weaker.** Mitigated by C4 being a rule rather than
a convention, and by the whole-tree gates running unconditionally so the
tier cannot silently drop this repo's strongest checks. If over-claiming
shows up in review, strengthen C4 rather than reverting C1 — the full
local suite was never the thing keeping main green.

**A1's rule 2 is a heuristic on a vendor string.** It is now keyed on the
substring common to both known V8 messages, but a third message would
miss. Rule 1 is deterministic and unaffected, and A0's capture makes a
miss diagnosable after the fact rather than invisible.

## Appendix — the measurement scripts

Both land in `app/scripts/` in the implementing PR; B1 and B2 prescribe
re-running them, and a measurement nobody can repeat is a claim rather
than a number.

`measure-test-memory.sh` — peak RSS of the node tree while a command runs:

```bash
#!/usr/bin/env bash
# Usage: bash scripts/measure-test-memory.sh <logfile> <command...>
set -uo pipefail
LOG="$1"; shift
: > "$LOG"
( while true; do
    ps -Ao rss,comm | grep -E 'node|vitest' | awk '{s+=$1} END{print s/1024}' >> "$LOG"
    sleep 0.5
  done ) & SAMPLER=$!
START=$(date +%s)
"$@" >/dev/null 2>&1; RC=$?
END=$(date +%s)
kill "$SAMPLER" 2>/dev/null
echo "exit=$RC wall=$((END-START))s peak_node_rss=$(sort -rn "$LOG" | head -1)MB"
```

`count-test-workers.sh` — max concurrent Vitest workers **belonging to
one app path**:

```bash
#!/usr/bin/env bash
# Usage: bash scripts/count-test-workers.sh <logfile> <app-abs-path> <command...>
set -uo pipefail
LOG="$1"; APPPATH="$2"; shift 2
: > "$LOG"
( while true; do
    ps -Ao args | grep '[v]itest/dist/worker' | grep -c -- "$APPPATH" >> "$LOG"
    sleep 0.3
  done ) & SAMPLER=$!
"$@" >/dev/null 2>&1; RC=$?
kill "$SAMPLER" 2>/dev/null
echo "exit=$RC max_own_workers=$(sort -rn "$LOG" | head -1)"
```

**Caveats, so neither is over-read.** The RSS sampler greps every `node`
process on the machine, so its floor moves with whatever else is running;
it discriminates between settings within one sitting and must not be
compared across days. The worker counter is path-scoped for exactly this
reason — its unscoped first version reported **9 foreign workers from
another worktree with nothing of its own under test**, the same number
the propagation claim rests on. **Read the floor before every use**, and
treat a non-zero floor as an invalid measurement rather than a baseline.
