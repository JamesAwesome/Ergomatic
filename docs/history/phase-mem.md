# Phase MEM — a killed test run says so, instead of reading as flake

**Archived 2026-09-10** — closed 2026-09-08 · #375.

A test run killed for want of memory says so and writes the evidence, instead of being retried into a machine that just proved it has no room.

---

## Phase MEM — local test runs stop OOMing, and stop reading as flake

Opened 2026-09-08. Spec:
`docs/superpowers/specs/2026-09-08-local-test-memory-design.md`
(revised after a `/harden` lens 1 pass that falsified two of its
load-bearing premises).

**The problem.** Test runs are killed for want of memory and the kill is
read as flake, so it gets retried into a machine with no room. Baseline
at rest is 8.8 GB of 16 GB with swap at 6.6 of 7.2 GB and 66 MB of free
pages, across 3 live agent sessions and 6 worktrees. The client suite
peaks at **2.76 GB** at Vitest's default 9 workers and **1.84 GB** at 4
(38 s vs 25 s). **Those two figures came from an UNSCOPED sampler** that
summed every Node process on the machine, in one sitting, against an
unmeasured floor — they are a relative comparison, not absolutes. The
sampler is path-scoped now; a re-measurement of `--project client`
against `start_floor=0MB` reads 1459 MB at 4, 2091 MB at 6, 2612 MB at 9.
Four is the LIGHTEST setting and that is why it ships; the old "six is
strictly dominated by four" line does not reproduce on that command
(six was faster and heavier), so it is withdrawn.

**The first framing was wrong and is corrected here, not appended to.**
The spec originally said a memory kill exits 1 and is indistinguishable
from a test failure. Measured: `pnpm run` and a raw binary both preserve
the signal (**134** for a V8 fatal, **137** for SIGKILL); only
`pnpm exec` collapses it to 1. The original measurement was taken through
`pnpm exec`. **CLAUDE.md itself prescribes that shape** as the workaround
for pnpm swallowing scoped flags, so the repo's own advice routes agents
onto the one path where the signal dies. The genuinely ambiguous case is
different: a **fork-worker** OOM leaves the parent alive, exiting 1 with
a full `Test Files` summary.

**Three premises falsified while measuring, recorded so nobody
re-derives them:** idle per-worktree compose stacks cost **236 MB across
two** (not a memory lever); `--coverage` adds **50 MB**; and a V8 OOM
prints `Ineffective mark-compacts near heap limit`, not `Reached heap
limit`, on 4 of 4 runs of the growth shape a real suite has. **The needle
that ships is `Allocation failed`**: a third V8 fatal string exists
(`Allocation failed - process out of memory`) that carries no "heap"
wording at all, so `JavaScript heap out of memory` misses it, and
`Allocation failed` matches 2 of 23 lines in the node binary against 14
for the tempting `out of memory` (which catches recoverable HTTP/2 and
wasm errors).

**Three parts, James-approved 2026-09-08:** (A) a wrapper reading the
exit code first and the message second, plus a preflight advisory that
**warns and does not block** (his call); (B) `maxWorkers` 4 and
Playwright `workers` 2 (proposed), both env-overridable and both
**disabled under CI**, so a bigger machine pays nothing (his call); (C)
pre-push runs `--changed` plus, unconditionally, the whole-tree gates
that `--changed` structurally cannot select — **both** the `scripts/`
suites and the 46 client suites that read the tree, the second of which
the first implementation missed.

**BUILT, UNMERGED — all six tasks are on branch `phase-mem-test-memory`
(Tasks 1-5 the mechanism, Task 6 the documentation half); nothing has
landed on main.**
`app/scripts/test-run.sh` implements the four-way signal split (silent
Ctrl-C at 130; memory banner at 137; then the stderr needle, gated on a
non-zero exit, which is what makes a 134 a memory kill rather than a bare
abort; a distinct "killed by signal" banner at any other exit ≥ 128,
including a needle-less 134; then the missing-summary rule — CLAUDE.md
RF40, spec A1) and is wired into
`ci.yml`'s `scripts` job by name. **Worker counts, measured (Task 4,
verified clean floor):** default → **4**; `ERGOMATIC_TEST_WORKERS=8` →
**8**; `CI=true` → **9** (the cap is genuinely inert under CI). **The
Playwright default shipped as 3, not the proposed 2** — measured wall-clock
(Task 4): 2 workers = 6:12 total (5.5 m test phase), 3 workers = 3:58
(3.6 m), 5 workers (the old default) = 2:39 (2.3 m). 2 workers cost
2.34-2.39x the old default, over the spec's ~2x threshold; 3 costs only
~1.5x, so the implementing PR raised the shipped default from 2 to 3
(`playwright.config.ts`, spec Part B2).

**The open question the desk cannot settle.** No capture of the real
failure exists — everything measured so far is a reproduction. A V8 OOM
is a per-process 4192 MB limit while the whole tree peaks at 2.76 GB
(unscoped; 2612 MB scoped to this checkout), and
an OS memory kill of a terminal `node` on darwin is unobserved
(`memorystatus`, not the Linux OOM killer;
`kill_on_sustained_pressure_count` is 0 here). So Part B's lever and Part
A's classifier may not be aimed at the same event. The spec's A0 ships a
capture step for exactly this; the next real kill answers it.

**A `/harden` lens 2 pass then found 24 more, 5 blocking**, all in the
prescribed blocks: the pre-push hook body runs under `sh -e`, so the ref
guard as written **aborts the hook** instead of falling back; `--changed`
and a path filter INTERSECT, so "append the `scripts/` gates" needed two
invocations rather than one; piping the child through `tee` puts the
child's status out of `$?`'s reach, so the wrapper reads `PIPESTATUS[0]`
(measured 2026-09-08 at the final review: `rc=$?` alone still reports 137
because the script also sets `pipefail`, but the two together — a dropped
`-o pipefail` and `rc=$?` — make a SIGKILL read as exit **0**, and
`PIPESTATUS[0]` is correct either way); the third V8 fatal OOM string
above forced the needle change; and `process.env.CI` being a string means
`CI=false` silently removes both caps.

**One of them is worth remembering on its own:** the clause invoking RF34
committed RF34 — it said the e2e instruction lives in "all three places"
and named three, where a repo-wide grep finds **five** (a second
`CLAUDE.md` site and `README.md` were missed).

**Owed at implementation — both resolved.** Playwright's cost at 2 workers
was measured at Task 4 (table above), which is why the shipped default
moved to 3. `test-run.test.sh` and `test-run-advisory.test.sh` are both in
`ci.yml`'s `scripts` job by name (`.github/workflows/ci.yml:181,185`).
**Still true and still unaddressed:** that job is `ubuntu-latest`, so
**nothing gates the bash-3.2.57 constraint** the wrapper is written under.
