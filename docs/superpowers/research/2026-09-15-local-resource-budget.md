# Local resource budget — evidence and boundaries

Investigation tree: `653bd5ea8cc7cee56a09dc0e8c6d8163022b2ec4` (#457).
Read-only investigation on James's 16 GiB Mac; no stress test, workload
termination, Docker-settings change or implementation was performed.

## Observed, not inferred

- PRIMARY, `.husky/pre-commit:2-3`: lint-staged completes before full
  typecheck. This hook is already fail-fast and sequential. Root
  `package.json` gives lint-staged separate TS and non-TS task groups;
  reducing cross-worktree overlap matters more than claiming these two
  hook phases currently overlap.
- PRIMARY, `.husky/pre-push:26-72`: related unit/client tests, unit script
  tests and filesystem-reading client tests run in separate invocations.
  These preserve non-imported-file coverage but can execute the same tests
  again. The fallback also repeats gates after a full scoped run.
- PRIMARY, #457's final push at `5bf60d45`: related run 151.94 s,
  scripts 2.32 s, filesystem-reading clients 36.29 s. Populations overlap;
  do not sum their assertion totals as unique coverage. This does NOT
  establish how much time a union selector would save: its collection and
  transformation overhead must be measured too.
- PRIMARY, `app/scripts/test-run-advisory.sh:1-7`: cross-worktree handling
  explicitly warns and never blocks, James's 2026-09-08 ruling. It registers
  Vitest wrapper invocations, not every ESLint, tsc, build or browser job.
- PRIMARY, `app/scripts/testEnv.ts:14-31`, `vitest.config.ts`,
  `playwright.config.ts`: local defaults are four Vitest and three browser
  workers. Overrides are bounded, CI is intentionally separate. These are
  PER INVOCATION, not a host-wide worker budget.
- PRIMARY, `app/package.json:14-33`: lint, typecheck, build, watch, mutation,
  E2E, screenshot and native build/release entry points exist independently.
  Watch bypasses the piped test wrapper to preserve its interactive TTY.
- PRIMARY, `app/vitest.stryker.config.ts` and `app/stryker.config.json`:
  mutation uses a separate Vitest configuration, not the ordinary worker
  cap, and leaves outer Stryker concurrency unspecified. Both layers need
  their own bounded measurement; the normal test limit does not cover them.
- PRIMARY, `app/scripts/ios-test.sh`: simulator selection is by device
  name; there is no prior-boot-state/UDID ownership or shutdown contract.
  Completion of xcodebuild is not proof that simulator services stopped.
- PRIMARY, `app/scripts/e2e.sh:13-36`: boot calls the stack reaper, then
  unconditional build/up; default keep leaves the stack running. The exit
  cleanup with keep disabled does not delete volumes. Volume deletion is a
  disk/data-lifetime concern, not evidence of RAM reclamation.
- PRIMARY, `app/scripts/test-evidence.mjs:94-151,242-356`: the new observer
  samples observed process trees and pressure; container and VM ownership
  are explicitly unavailable. It forwards signals to its own child group
  and does not implement admission control. Polling cannot prove absence
  of never-observed detached children.
- PRIMARY, `.claude/agent-briefing.md`, gate table and sentence immediately
  below: task scopes coexist with a final-review instruction to run
  everything. `CLAUDE.md` RF1 and `docs/TESTING.md` §12 instead assign full
  browser-suite execution to CI. The revised instruction must reconcile
  both, not add a third version.

Source reads used `nl -ba`, `sed` and `rg` on these files at the stated
tree. They describe that revision, not future membership counts.

## Hunt evidence worth carrying forward

[PR #457](https://github.com/JamesAwesome/Ergomatic/pull/457) contains the
final hook/CI receipt. Its committed
[residual repair record](2026-09-15-flake-hunt/residual-repairs.md)
separates test defects from contention and preserves the scoped red/green
and mutation evidence.

During the hunt, a one-worker push was intentionally interrupted when
host pressure changed from normal to warning; another worktree's Vitest
workers were observed at that time. A later one-worker push completed
with every sample normal. This supports an overlap-control experiment;
it does not prove which process caused pressure or an operating-system
OOM kill. A separately identified abandoned DBA probe was stopped only
after James approved its exact ownership-checked process group.

The final [CI run](https://github.com/JamesAwesome/Ergomatic/actions/runs/35049814763)
passed at head `5bf60d45`, testing synthetic merge `e3f744b6` with base
`2458b2e9`. Native artifacts were downloaded and their report hashes checked.
Vitest passed 9,165 tests with one existing skip, Playwright passed 601 with
one retry-zero result each. Observed-tree RSS maxima were 1,583,100 KiB and
2,238,760 KiB respectively on DIFFERENT Linux runners. They neither sum to
a Mac requirement nor establish a local physical-memory ceiling.

Private raw evidence is preserved outside the old worktree in the ignored
`.superpowers/archives/2026-09-15-flake-hunt-pr457/`. This research record
carries the durable conclusions; raw traces are not safe public attachments.

## Fresh host snapshot

Taken approximately `2026-09-16T03:14Z`, before this spec's dependency
installation. Reproducible read-only commands, executed this session:

```sh
sysctl -n hw.memsize kern.memorystatus_vm_pressure_level vm.swapusage
ps -axo pid,ppid,rss,etime,comm | sort -k3 -nr | head -20
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'
```

The machine reported 17,179,869,184 physical bytes, pressure 1 (normal),
6,314.62 MiB used swap. The virtualization process had RSS 1,628,176 KiB;
the Docker backend 396,640 KiB. One other worktree's three running
containers reported approximately 9.031, 42.14 and 37 MiB. No ownership
claim or cleanup authority follows from appearing in this list.

These are snapshots with different accounting domains. Container memory
is inside the VM, not additional host RAM to add to its RSS. Summed process
RSS can count shared pages more than once. Large existing swap is not the
same quantity as current swap rate or current pressure.

A later read during documentation/source review returned pressure 2, with
no test runner or browser workload launched by this task. Heavy gates were
deferred. This is evidence of changing background pressure, not proof of a
particular process causing it.

## Prior decision: worker tuning was measured, but on an older population

The [2026-09-08 memory design](../specs/2026-09-08-local-test-memory-design.md),
Part B, records path-scoped client results: four workers, 37 s / 1,459 MB;
six, 30 s / 2,091 MB; nine, 28 s / 2,612 MB. It also records whole-browser
wall times at two, three and five workers. Its earlier machine-wide RSS
figures were explicitly contaminated by unrelated processes. These are
historical comparisons, not present-day defaults proved optimal.

The former exclusion of Docker based on small container sums cannot settle
VM idle overhead. Conversely, the fresh VM snapshot does not prove stopping
one stack would reclaim that RSS while another user's containers remain.

## Primary external sources and installed-source checks

- PRIMARY, local macOS `man 2 mkdir` and `man 2 kill`, read this session:
  creating an existing directory returns EEXIST; negative non-special PIDs
  signal process groups. These primitives provide exclusion and group
  addressing, not ownership, descendant containment or PID-generation safety.
  [Node's filesystem API](https://nodejs.org/api/fs.html#fsmkdirpath-options-callback)
  exposes exclusive directory creation when recursive creation is disabled.
- [Apple XNU sysctl implementation](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_memorystatus_notify.c):
  `sysctl_memorystatus_vm_pressure_level` converts the internal level to a
  dispatch flag before returning it. Do not substitute the internal enum
  table in `doc/vm/memorystatus_notify.md` for the sysctl's representation.
  Unknown values remain unknown. This is an implementation interface and
  needs a compatibility check on supported macOS versions.
- [Apple Activity Monitor](https://support.apple.com/guide/activity-monitor/view-memory-usage-actmntr1004/mac):
  pressure combines free memory, swap rate, wired and cached memory. Use
  pressure plus trends, not a free-pages threshold or accumulated swap alone.
- [Docker Resource Saver](https://docs.docker.com/desktop/use-desktop/resource-saver/):
  the Linux VM can stop after no containers have been running for its idle
  interval. This establishes a possible benefit of stopping owned idle
  stacks, not guaranteed savings on this shared machine. No Docker settings
  are changed by this proposal.
- [Node heap limit](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes):
  the option bounds V8's old generation, not the aggregate of browser,
  native, external and multiple-process allocations. Raising it is not a
  host-memory reduction.
- [typescript-eslint performance](https://typescript-eslint.io/troubleshooting/typed-linting/performance/):
  typed linting uses TypeScript's type information, so expensive types and
  broad project membership can cost both time and memory. Project Service
  is already enabled here; enabling it is not a new optimization. Profile
  before reducing project coverage or proposing caches.
- [Playwright parallelism](https://playwright.dev/docs/test-parallel):
  workers are OS processes, each starting its own browser. Limiting workers
  is an available lever; it is not cross-invocation coordination.
- [Vitest v4 maxWorkers](https://v4.vitest.dev/config/maxworkers):
  the setting is a worker-concurrency maximum. Public current docs now
  describe newer releases, so they are not authority for this lockfile's
  exact defaults or new commands. Installed Vitest 4.1.11's
  `dist/chunks/cli-api.CnMVyzaz.js`, `resolveMaxWorkers`, actually defaults
  non-watch runs to available parallelism minus one. Its `getMemoryLimit`
  returns null outside VM pools: a VM memory setting is not a cap on this
  repo's ordinary forks.
- PRIMARY installed Vitest 4.1.11:
  `dist/chunks/cac.uFydS1Z4.js`, `collect`, sends `filesOnly` to
  `getRelevantTestSpecifications` and does not call test collection's
  execution arm. `cli-api.CnMVyzaz.js`, `filterTestsBySource`, finds
  dependencies by transforming modules. File-only discovery is therefore
  available without running test bodies, but NOT free or guaranteed light.
  The merge of filesystem-reading tests still belongs to us. Its memory
  cost is an implementation acceptance measurement, not an assumed saving.
- PRIMARY installed Playwright 1.63.0, `playwright-core/lib/coreBundle.js`,
  `_prepareToLaunch`, `_launchProcess` and `launchProcess`: the runner
  creates its profile beneath `os.tmpdir()` before spawning and carries the
  path in browser arguments. Launch is detached on this Mac; a polling-only
  descendant census can miss it after an intermediate parent exits. Vendor
  cleanup can use a process-group SIGKILL fallback. A private invocation
  TMPDIR supplies a candidate durable namespace, not an already tested
  cleanup guarantee or permission to signal any sampled PID.
- PRIMARY installed Testcontainers 12.1.0, `build/reaper/reaper.js` and
  `build/generic-container/generic-container.js`: a client can discover an
  existing Ryuk session and reuse its ID; fixture labels then use that ID.
  It is not exclusive invocation ownership. Both `server/testing/postgres.ts`
  and the direct stats-integration producer need the application-owned label
  before creation; interrupted creation must be discoverable through it.
- [Node detached children](https://nodejs.org/api/child_process.html#optionsdetached)
  and [signal delivery](https://nodejs.org/api/child_process.html#subprocesskillsignal):
  process-group separation and successful signal submission do not prove
  child exit or eliminate PID-reuse hazards. Later sampled identity is
  evidence for diagnosis, not an identity-bound signaling handle.

No existing repository facility was found that provides atomic admission
across hooks, builds and tests. The warning registry and passive observer
are useful pieces, not a scheduler. Neither the OS nor either runner has
an "Ergomatic worktree heavy job" concept; the proposed wrapper would own
that policy for cooperating entry points only.

## Hardening and verification boundary

The antagonist inspected mechanism and vendor ownership boundaries; the
PM challenged scope, approval and sequencing. Their findings are folded
in the design's hardening record and canonical ledgers. There was no second
mechanism pass and no prescribed-code pass: no proposed implementation
blocks exist. Recovery interleavings and real adapter cleanup remain future
acceptance gates, not completed experiments.

This documentation task installed the worktree dependencies serially,
verified the real Husky hook refuses when Node is unavailable, and passed
`bash scripts/pre-commit.test.sh` with its controlled child boundaries.
It did not rerun the heavy test suite to validate prose. Historic CI and
RSS figures above retain their original trees, scopes and limitations.
