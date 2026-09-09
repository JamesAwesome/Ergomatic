# Local test memory — stop the OOM, and stop calling it flake

**Date:** 2026-09-08
**Status:** design, awaiting James's approval. Revised after `/harden`
lens 1; that pass falsified two of this spec's load-bearing premises and
the revision is written through rather than appended.
**Scope:** `app/vitest.config.ts`, `app/playwright.config.ts`,
`app/package.json`, `app/scripts/`, `.husky/pre-push`,
`.github/workflows/ci.yml`, `.gitignore`, `CLAUDE.md`,
`.claude/agent-briefing.md`, `docs/TESTING.md`, `README.md`, `ROADMAP.md`

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

### Three V8 messages, and picking the needle is the whole problem

V8 has at least three fatal OOM strings and the Node 26.5.0 binary
carries all of them (`strings $(which node)`):

```
Reached heap limit Allocation failed - JavaScript heap out of memory
Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
Allocation failed - process out of memory
```

A gradual object-growth loop — the shape a real test run has — printed
`Ineffective mark-compacts` on **4 of 4** runs. The first draft keyed on
`Reached heap limit`, which that probe never emits. The second draft
keyed on `JavaScript heap out of memory`, which the **third** message
does not contain — and the third is reachable in exactly the fork case
this design most needs to catch.

**The needle is `Allocation failed`,** and the choice was measured rather
than reasoned. Counting how many of the 23 out-of-memory strings in the
binary each candidate matches:

| Candidate | Matches | Verdict |
| --- | --- | --- |
| `JavaScript heap out of memory` | 1 of 23 | misses the third fatal message |
| **`Allocation failed`** | **2 of 23** | **exactly the fatal pair** |
| `out of memory` | 14 of 23 | over-matches badly |

`out of memory` looks like the obvious generalisation and is the wrong
answer: it also matches `ERR_HTTP2_NO_MEM`'s `'Out of memory'`, `Data
cannot be cloned, out of memory.`, and several wasm messages — all
**recoverable application errors**. A run that caught an HTTP/2 error
would be promoted to `MEMORY KILL`, which is precisely the over-claim
recurring failure 26 describes. Breadth is not the goal; matching the
fatal set and nothing else is.

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
wrapper ships with a capture step: on any classified kill it writes the
exit code, the signal, the last 40 lines of stderr, `vm_stat`, `sysctl
vm.swapusage`, and the output of `/usr/bin/log show --last 5m --predicate
'eventMessage CONTAINS "memorystatus: killing"'` to a timestamped file.
The next real kill then answers the question this spec had to leave open,
from the machine rather than from a reproduction. Measured cost of the
`log` call: **1.53 s**, 182 rows — cheap enough to run on every kill.

**Three mechanics, each a measured defect in the obvious version:**

- **The path is anchored on the script's own location**
  (`cd "$(dirname "$0")/.."`), not written relative to the caller.
  `pnpm run` sets cwd to the package directory, so `pnpm test` and the
  hook's `pnpm --dir app test` both run with cwd `app/` — where a
  relative `app/.test-kills` resolves to `app/app/.test-kills`, while the
  same string is correct from the repo root.
- **`.gitignore` gains the directory, and that is why `.gitignore` is in
  Scope.** It is not currently ignored (`git check-ignore` exits 1;
  `app/.gitignore` is empty and the root file has no matching pattern),
  and the SDLC phase-teardown gate checks `git status` on the main
  checkout — so the first real memory kill would trip it.
- **`log` must be called as `/usr/bin/log`.** It resolves to a shell
  builtin in at least one shell on this machine, where the prescribed
  invocation fails outright with `too many arguments`. Recurring failure
  13's class: an instruction nobody had pasted.

## The design

### Part A — a killed run says so

**A1. A wrapper that reads the signal, deterministically first.**
`pnpm test` and the pre-push hook route through `app/scripts/test-run.sh`,
which runs Vitest **in a signal-preserving shape** (never `pnpm exec`)
and classifies:

| # | Condition | Verdict | Class |
| --- | --- | --- | --- |
| 1 | exit ≥ 128 | killed by signal `exit-128`; 134 = SIGABRT (V8 fatal), 137 = SIGKILL | **deterministic** |
| 2 | stderr contains `Allocation failed` | heap OOM — **checked regardless of exit code or of whether a summary printed** | heuristic, covers the fork case |
| 3 | non-zero exit and no `Test Files` line in stdout | suite did not complete, cause unknown | heuristic |

**Evaluated in order 1 → 2 → 3, first match wins.** The order is part of
the specification, not an implementation detail: exit 137 satisfies rules
1 and 3, and exit 134 satisfies all three, with different banners. Left
unstated, two of the eight fixtures below have two legal answers.

Rule 2 is deliberately not gated on the others: the fork-worker OOM exits
1 *and* prints a summary, so any rule requiring a missing summary or a
signal exit misses the case that matters most.

**Rules 2 and 3 read different streams** — the needle lands on stderr,
the `Test Files` line on stdout (verified against a real vitest fork
OOM). The wrapper captures them separately; a `2>&1` merge makes rule 3
unable to distinguish them.

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

**Four mechanical constraints on the wrapper.** Each is a measured
defect in the obvious implementation, not a style note:

- **The child's exit status comes from `PIPESTATUS[0]` or a `pipefail`
  pipeline — never from a pipe's tail.** The wrapper must both stream
  output to the terminal and capture it for grepping, and the natural
  shape silently destroys rule 1, the deterministic one:
  `( node -e 'process.kill(process.pid,"SIGKILL")' 2>&1 | tee /dev/null ); echo $?`
  prints **0** — a SIGKILL reading as a pass. With `set -o pipefail` it
  prints **137**. Both are available in `/bin/sh` here.
- **It forwards `"$@"`** — the hook passes `--project unit --project
  client`, and `pnpm test:coverage` and `pnpm test:watch` must route
  through it too or they keep the old behaviour silently.

- **It owns `NODE_OPTIONS`.** `package.json`'s `test` script currently
  hard-sets `NODE_OPTIONS=--no-experimental-webstorage`, and an inline
  assignment in a script **replaces** the caller's — measured: exporting
  a heap cap and running `pnpm --dir app test` left the cap unapplied and
  the suite passed. Dropping the flag costs 1582 false failures
  (CLAUDE.md). The wrapper sets the flag **first** and appends the
  caller's `${NODE_OPTIONS:-}` **after** it, because duplicate
  `--max-old-space-size` is **last-wins** (measured: `512` then `2048` →
  2144 MB; reversed → 608 MB). Wrapper-first means a caller can still
  impose a heap cap, which is what the A1 end-to-end test needs. The
  `:-` is required: under `set -u` an unset `NODE_OPTIONS` aborts.
- **Bash here is 3.2.57** (`/bin/bash`, the only bash on the machine).
  No `mapfile`, no associative arrays, no `${var,,}`. **Nothing enforces
  this** — `ci.yml`'s `scripts` job is `ubuntu-latest`, so it cannot
  exercise macOS bash, and the author is the only gate. Said aloud rather
  than left implied.

Gated by `app/scripts/test-run.test.sh`, one fixture per row:

| Fixture | Expected |
| --- | --- |
| exit 134 (SIGABRT) | memory banner |
| exit 137 (SIGKILL) | memory banner |
| exit 1, `JavaScript heap out of memory` on stderr, **summary present** | memory banner (the fork case) |
| exit 1, `Allocation failed - process out of memory` on stderr | memory banner (the third V8 string, which carries no `heap` wording) |
| exit 1, no `Test Files` line | **incomplete** banner, not the memory one |
| a real test failure | no banner |
| a clean pass | no banner |
| `--changed` with an empty selection | no banner |

Rows 3, 4 and 5 are the ones that can go red in the interesting
directions: row 3 fails if the classifier requires a missing summary, row
4 fails if the needle is `JavaScript heap out of memory`, and row 5 fails
if an unexplained crash is promoted to a memory verdict. A ninth fixture
pins the over-match: **a run whose output contains `Out of memory` from a
caught `ERR_HTTP2_NO_MEM` must print no banner.**

An earlier draft of this table had a row reading "`Reached heap limit`
variant → memory banner (both V8 strings)". It could not go red: both
`heap limit` messages carry the needle on the **same line**, so the row
was a duplicate of row 3 proving nothing about coverage. Replaced with
the message that genuinely lacks the old needle.

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
      Free pages 66 MB, swap 6.6/7.2 GB, workers=4. Consider a scoped run.
```

**`workers=` is not decoration.** It is the only place the cap actually
in force becomes visible, and the failure that matters — the cap silently
absent — is otherwise invisible. See B1 on why `CI` can remove it by
accident.

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

**A shared helper, because `process.env.CI` is a string.** Truthiness is
the wrong test: `CI=false` and `CI=0` are both truthy, so either silently
removes both caps on the machine they exist to protect. Measured:
`"false"` → uncapped, `"0"` → uncapped. Both configs use:

```ts
const isCI = (v = process.env.CI) => !!v && v !== "false" && v !== "0";
const workerCap = (v: string | undefined, fallback: number) =>
  Math.max(1, Math.min(16, Math.trunc(Number(v)) || fallback));
```

**B1.** In `vitest.config.ts`, top-level `test` block:

```ts
maxWorkers: isCI() ? undefined : workerCap(process.env.ERGOMATIC_TEST_WORKERS, 4),
```

**B2.** In `playwright.config.ts`:

```ts
workers: isCI() ? undefined : workerCap(process.env.ERGOMATIC_E2E_WORKERS, 3),
```

**Cost measured (Task 4, 2026-09-08), replacing the "untested" tag above.**
`pnpm e2e` rebuilds and boots the compose stack every invocation, so each
figure below includes that fixed cost, not only the 547-test run:

| `--workers` | Test-phase time | Total wall (`time pnpm e2e`) |
| --- | --- | --- |
| 2 | 5.5 m | 6:12 |
| 3 | 3.6 m | 3:58 |
| 5 (old default) | 2.3 m | 2:39 |

2 workers costs 2.34-2.39x the old default of 5, over this spec's ~2x
threshold, so the implementing PR raised the default from the proposed 2
to **3**, which costs only ~1.5x (test phase 3.6/2.3, total wall
237.57s/159.13s). All three runs passed the full 547-test suite.

**Why `workerCap` is shaped the way it is**, run through absent / empty /
valued (an earlier draft described this wrongly, claiming `"-2"` passed
through unclamped when `Math.max(1, …)` already caught it — the real gaps
were elsewhere):

| Input | Result | Why the guard is there |
| --- | --- | --- |
| absent, `""`, `"0"`, `"abc"`, `"true"` | 4 | `\|\| fallback` |
| `"8"`, `"0x8"` | 8 | ordinary |
| `"-2"` | 1 | `Math.max(1, …)`; Playwright's `resolveWorkers` **throws** below 1 |
| `"1.5"` | 1 | `Math.trunc` — a fractional worker count is not a setting |
| `"999"`, `"Infinity"` | 16 | `Math.min(16, …)`. An unbounded upper end admits `Infinity` **on the machine this spec exists to protect**, which is the opposite of the goal. |

The upper bound of 16 is a guard against typos, not a tuned value; a
machine wanting more than 16 workers is outside what this default serves
and should raise it in the same edit that raises the default.

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

- **The hook body runs under `sh -e`.** `.husky/_/h` invokes it as
  `sh -e "$s" "$@"`, so a bare failing command **aborts the hook** rather
  than falling through. Measured: a body running
  `git rev-parse --verify --quiet <absent>` as a statement exits 1 at that
  line — the fallback and the tests never run — and husky prints
  `pre-push script failed (code 1)`, which reads exactly like the test
  failure this design exists to stop mistaking. **Every fallible command
  in the new hook body is wrapped in `if`/`||`, including command
  substitutions.** Guarded, the same body reaches the fallback and exits 0.
- **The ref is resolved first, and a missing ref fails loud.** Measured:
  `vitest run --changed origin/nope --project unit --project client` exits
  **0** with `No test files found, exiting with code 0` on stdout (114
  bytes) and a project glob dump on stderr (233 bytes) — git exits 128,
  but the runner's git helper does not throw, so the change set is empty
  and zero tests run. (An earlier draft said "not one word on either
  stream", which was false and self-contradictory, since it quoted the
  message.) If `origin/main` is ever absent — remote not named `origin`,
  ref pruned, a fresh clone, a fork — the gate silently runs nothing,
  forever.
  The guard uses the **fully-qualified** ref,
  `git rev-parse --verify --quiet refs/remotes/origin/main`: `--quiet`
  suppresses the ambiguity warning as well as the error, so the short form
  cannot detect a local branch literally named `origin/main` (git permits
  one), which would silently win.
- **`--project unit --project client` is kept.** The current hook is
  Docker-free by design and says so in its own comment; dropping the
  project flags re-admits the `integration` project (testcontainers,
  `testTimeout: 120_000`), so a server change would make the hook require
  Docker.
- **The whole-tree gates always run — as a SECOND invocation.**
  `--changed` selects through vite's module graph, so a test whose subject
  is a *file it reads* rather than a *module it imports* is structurally
  unselectable. Measured selections: `vitest.config.ts` → **0 tests**,
  `pnpm-lock.yaml` → **0**, a Swift plugin file → **0**,
  `src/native/webAuth.ts` → 7, **without**
  `scripts/webauth-contract.test.ts`, which reads that file with
  `readFileSync` and exists to guard it. B1's own edit to
  `vitest.config.ts` selects nothing, as does every Dependabot lockfile
  bump.
  **`--changed` and a path filter INTERSECT, so "append the `scripts/`
  gates" is not expressible in one command.** Measured:
  `--changed origin/main … scripts/` → `No test files found`, while
  `--project unit scripts/` alone → **7 files, 153 tests**. The hook
  therefore runs two invocations — the changed set, then the `scripts/`
  gates unconditionally — and **the wrapper classifies both and returns
  the first non-zero status**, so a kill in either is reported rather than
  masked by the other's success. Without this the Risk section's whole
  mitigation is inoperative.
- **An empty selection exits 0 because `passWithNoTests` defaults true**
  (measured; nothing in the repo sets it). Under C1 an empty selection is
  the everyday path, so that default is now load-bearing: flipping it
  turns every no-op push into a false `SUITE DID NOT COMPLETE`.

**C2. `pnpm test:full`** is the explicit full run, unchanged in meaning
from today's `pnpm test`.

**C3. CI is the only place the full suite is mandatory.** `ci.yml` already
runs `pnpm test:coverage` and the full e2e job. What changes is that
nothing local claims to be equivalent — **plus one addition**: the
`scripts` job enumerates its **six** test scripts by name and does not
glob (`compose-env.test.sh` appears twice, once to lint and once to run,
which is where an earlier count of seven came from), so
`test-run.test.sh` is added as a named step or it never runs anywhere.
That job is `ubuntu-latest` with no `pnpm install` and no node setup, so
it proves the classifier's **logic** only: every macOS-only call in the
wrapper (`vm_stat`, `sysctl vm.swapusage`, `/usr/bin/log`) stays out of
the tested path or behind a probe.

**C4. A CLAUDE.md rule on what a local green now means** — evidence about
the files it covered and nothing more, and any "the suite is green" claim
names its tier.

**C5. Full e2e is CI-first**, with named specs run locally against an
already-booted stack. Recurring failure 1's point stands; only the source
of the evidence moves.

**C6. The amendment lands in all FIVE places the instruction lives.**
This clause invoked recurring failure 34 and then committed it: it said
"all three places" and named three, and a repo-wide grep finds five.

| Site | What it is |
| --- | --- |
| `CLAUDE.md` RF1 | the recurring-failure entry |
| `CLAUDE.md` Commands bullet | a **second** CLAUDE.md site the "three" missed |
| `.claude/agent-briefing.md` gate table | *any product code under `app/src/` → `pnpm e2e`* — every subagent reads this before its brief |
| `docs/TESTING.md` | a checklist mention |
| `README.md` | **not previously in Scope at all** |

All five change together or none do, and the Testing row's grep is
**repo-wide**, not scoped to a named list — a grep over the list you
already thought of cannot find the site you forgot.

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
| A1 needle breadth | A fixture whose output carries `Out of memory` from a caught `ERR_HTTP2_NO_MEM` asserts **no** banner — the over-match guard. |
| A1 pipeline status | The wrapper is run against a self-SIGKILLing child and asserted to return 137, not 0 — the `tee` defect. |
| A0 path | The wrapper is invoked via `pnpm test` (cwd `app/`) and from the repo root; both must write to the same directory. |
| A0 ignore | `git check-ignore` on the capture directory exits 0, and `git status --porcelain` is empty after a captured kill. |
| C1 hook errexit | The hook body is run under `sh -e` with `origin/main` unresolvable; assert it reaches the fallback and exits 0, rather than aborting at the guard. |
| C1 two invocations | A branch changing only `vitest.config.ts` is pushed; assert the `scripts/` gates ran, and that a failure in either invocation surfaces. |
| C3 | The new CI step is named in `ci.yml` and observed running. |
| C4/C5/C6 | Prose. Reviewed, not tested — but a **repo-wide** grep asserts no un-amended `pnpm e2e` instruction survives anywhere, rather than checking a list of sites already thought of. |

## Risk

**C1 makes local green weaker.** Mitigated by C4 being a rule rather than
a convention, and by the whole-tree gates running unconditionally so the
tier cannot silently drop this repo's strongest checks. If over-claiming
shows up in review, strengthen C4 rather than reverting C1 — the full
local suite was never the thing keeping main green.

**A1's rule 2 is a heuristic on a vendor string, and it has already been
wrong twice.** Draft 1 keyed on `Reached heap limit` (never emitted by
the growth shape); draft 2 keyed on `JavaScript heap out of memory`,
whose hypothetical "third message would miss" turned out to be a real
message shipped in the same binary. It is now `Allocation failed`,
covering exactly the fatal pair and none of the 12 recoverable
out-of-memory strings. A **fourth** message would still miss, so the
mitigations are structural rather than lexical: rule 1 is deterministic
and catches any parent crash regardless of wording, and A0's capture
records the unmatched stderr so a miss is diagnosable from the next real
kill instead of invisible. **The lesson is in the record because it
recurred:** a needle chosen by reading one reproduction's output is a
sample, not a set — the way to pick one is to enumerate the candidates
in the binary and count what each matches.

## Appendix — the measurement scripts

Both land in `app/scripts/` in the implementing PR; B1 and B2 prescribe
re-running them, and a measurement nobody can repeat is a claim rather
than a number. **Both have been pasted and run against the failure cases
below**, not only the happy path — the first drafts printed
`peak_node_rss=MB` for a command that finished inside one sample
interval, and returned 0 for every one of: no arguments, a logfile with
no command, an unwritable log directory, and a command that itself
exited 7.

`measure-test-memory.sh` — peak RSS of the node tree while a command runs:

```bash
#!/usr/bin/env bash
# Usage: bash scripts/measure-test-memory.sh <logfile> <command...>
set -uo pipefail
if [ $# -lt 2 ]; then echo "usage: $0 <logfile> <command...>" >&2; exit 2; fi
LOG="$1"; shift
mkdir -p "$(dirname "$LOG")" 2>/dev/null || { echo "cannot create dir for $LOG" >&2; exit 2; }
: > "$LOG" 2>/dev/null || { echo "cannot write $LOG" >&2; exit 2; }
( while true; do
    ps -Ao rss,comm | grep -E 'node|vitest' | awk '{s+=$1} END{print s/1024}' >> "$LOG"
    sleep 0.5
  done ) & SAMPLER=$!
START=$(date +%s); "$@" >/dev/null 2>&1; RC=$?; END=$(date +%s)
{ kill "$SAMPLER"; wait "$SAMPLER"; } 2>/dev/null   # 'wait' suppresses the job-control notice
N=$(grep -c . "$LOG" || true)
if [ "${N:-0}" -eq 0 ]; then
  echo "MEASUREMENT INVALID: no samples (command finished inside one interval)" >&2; exit 3
fi
echo "exit=$RC wall=$((END-START))s samples=$N floor=$(sort -n "$LOG"|head -1)MB peak=$(sort -rn "$LOG"|head -1)MB log=$LOG"
exit "$RC"
```

`count-test-workers.sh` — max concurrent Vitest workers **belonging to
one app path**:

```bash
#!/usr/bin/env bash
# Usage: bash scripts/count-test-workers.sh <logfile> <app-abs-path> <command...>
set -uo pipefail
if [ $# -lt 3 ]; then echo "usage: $0 <logfile> <app-abs-path> <command...>" >&2; exit 2; fi
LOG="$1"; APPPATH="$2"; shift 2
mkdir -p "$(dirname "$LOG")" 2>/dev/null || { echo "cannot create dir for $LOG" >&2; exit 2; }
: > "$LOG" 2>/dev/null || { echo "cannot write $LOG" >&2; exit 2; }
FLOOR=$(ps -Ao args | grep '[v]itest/dist/worker' | grep -cF -- "$APPPATH" || true)
( while true; do
    ps -Ao args | grep '[v]itest/dist/worker' | grep -cF -- "$APPPATH" >> "$LOG" || true
    sleep 0.3
  done ) & SAMPLER=$!
"$@" >/dev/null 2>&1; RC=$?
{ kill "$SAMPLER"; wait "$SAMPLER"; } 2>/dev/null
N=$(grep -c . "$LOG" || true)
if [ "${N:-0}" -eq 0 ]; then echo "MEASUREMENT INVALID: no samples" >&2; exit 3; fi
echo "exit=$RC samples=$N start_floor=$FLOOR peak=$(sort -rn "$LOG"|head -1) log=$LOG"
if [ "$FLOOR" -ne 0 ]; then
  echo "MEASUREMENT INVALID: $FLOOR foreign worker(s) already running for this path" >&2; exit 3
fi
exit "$RC"
```

**Five properties, each earned by a defect in the first draft:**

- **An arg-count guard.** Both scripts previously ran `"$@"` with no
  command, took `RC=$?` from the preceding statement, and reported a
  successful measurement of nothing.
- **An empty log is an ERROR, not a blank field.** Any command finishing
  inside one sample interval produced `peak_node_rss=MB` — a
  complete-looking line with no number in it.
- **The child's exit code is propagated** (`exit "$RC"`). Both previously
  exited 0 regardless, so neither could be used in a gate.
- **`grep -cF`, not `grep -c`.** The path is data, not a pattern, and
  worktree paths here contain `.claude` — measured: the BRE form matches
  `/a/xclaude/worktrees/mem/app` against `/a/.claude/worktrees/mem/app`,
  the fixed-string form does not.
- **The floor is read and enforced, not left to the operator.** The
  caveat used to say "read the floor before every use" while the script
  printed only the maximum, which is an operator instruction nobody could
  follow (recurring failure 13). `count-test-workers.sh` now samples the
  floor itself and **fails the measurement** when foreign workers are
  present for that path.

**One caveat stands and cannot be engineered away.** The RSS sampler is
**machine-wide** — it greps every `node` process — so its floor moves
with whatever else is running. Measured baseline with nothing of ours
under test: **~850 MB across 56 processes, 54 of them another app's
bundled node.** It therefore prints `floor=` alongside `peak=` so the
reading can be judged, it discriminates between settings only within one
sitting, and it must never be compared across days. The worker counter
is the oracle to trust for anything structural; RSS is the one that
chose `4`, and its numbers carry that caveat.
