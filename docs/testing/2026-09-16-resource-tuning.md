# Local workload measurements — September 16

Two workers used 387–493MiB less sampled child-tree RSS than four on the
same four heavy client files, at a cost of 1.1–1.7 seconds per invocation.
This is a candidate, not a new default or a whole-suite savings claim.
The approved whole resource spec is still incomplete; browser comparison
waits for its detached-process ownership adapter.

## Measurement boundary

Mac16GiB, Darwin25.6, availableParallelism10; Node26.5.0, pnpm11.17.0,
Vitest4.1.11, Vite8.3.0, TypeScript6.0.3, Stryker10.0.0.
Every run used the existing foreground owner and one resource sampler;
all measurements below had normal host pressure and verified cleanup.
Separate wrapper RSS and observed child-tree RSS are not a whole-host
budget and must not be added to Docker/VM/container memory. Sampling can
miss short peaks or double-count shared pages. Host-wide VM counters can
include unrelated background activity; no causal compression/swap saving
is attributed to these tests.

Client comparisons used clean `5daf579e99774a95e39b96c1af907b639177a7ec`,
source fingerprint `bc1087077488245ea461268adcc7af0a4740c29b1a56451140e5697af2a4584e`.
Each invocation used fresh contexts/forks; filesystem/dependency caches
were warm after pre-push. No cache purge, cold-cache claim or frozen host
background. Exact scope, always372 passing tests:
Today174, Library60, Builder52, WorkoutDetail86.

```sh
pnpm test:capture --project client src/today/Today.test.tsx src/library/Library.test.tsx src/builder/Builder.test.tsx src/workout/WorkoutDetail.test.tsx --maxWorkers=2
```

Replace the final worker value with the table value. Native selection and
execution membership matched every time; no first failure or retry.
Receipt IDs resolve beneath `<git-common-dir>/ergomatic-local-work/receipts/`;
`resources.jsonl` is streamed, with one-second samples plus boundaries.

## Client pilot and three alternating pairs

| Trial/order | Workers | Owner seconds | Native seconds | Tree peak MiB | Wrapper peak MiB | Receipt |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Pilot | 1 | 10.897 | 10.02 | 719.73 | 69.23 | 63cdb64c-5198-434f-890e-9c7c03c55565 |
| Pilot | 2 | 6.306 | 5.42 | 1036.16 | 69.45 | d8843ba3-8da3-4235-b137-f8ade91e4c01 |
| Pilot | 4 | 4.621 | 3.74 | 1540.42 | 65.20 | d0d80bab-e869-4c4f-a2fc-5b1c61406c55 |
| Pair1 first | 4 | 5.222 | 4.00 | 1450.17 | 63.67 | 01aa374b-4498-4bd3-8f47-ab5f509f8ab8 |
| Pair1 second | 2 | 6.309 | 5.44 | 1063.56 | 69.16 | 5e9d68d4-4be4-4c2f-9fdd-7f60af951011 |
| Pair2 first | 2 | 6.319 | 5.45 | 1039.05 | 69.22 | 0fedc73e-8ded-412f-be72-a42154207407 |
| Pair2 second | 4 | 4.663 | 3.77 | 1526.78 | 65.28 | ab6c940b-79db-4f40-a304-e1d8733c3fa9 |
| Pair3 first | 4 | 4.666 | 3.77 | 1558.42 | 65.34 | 51d9ebce-3019-4017-8723-dd970b08d47b |
| Pair3 second | 2 | 6.331 | 5.44 | 1065.20 | 69.19 | 277d800f-25bb-4fcc-8b24-219c0492f9fa |

Largest sample gap1023–1030ms for paired runs; pilots1026–1028ms.
Pilot1's post-vm_stat was delayed31.7s: exploratory bracket only. Its host
swap-used changed4625.38→4609.38MiB, not attributable test savings.
Pilots2/4 and all pairs kept swap-used4609.38MiB. Every pair had zero
swapin/swapout counter delta, with immediate pre/post `vm_stat` reads.
Raw brackets are retained in the ignored cheaper-hooks SDD workspace's
`tuning-client-pilots.json` and `tuning-client-pairs.json`.

Host-wide VM deltas for the pair order above (MiB,16KiB pages):

| Pair/order | Compressor occupied | Pages stored in compressor | Compressions | Decompressions |
| --- | ---: | ---: | ---: | ---: |
| 1/4 | +648.44 | +1110.41 | 1458.05 | 130.47 |
| 1/2 | -8.36 | -27.77 | 0 | 25.00 |
| 2/2 | -39.98 | -131.95 | 0 | 121.20 |
| 2/4 | +234.64 | +452.81 | 460.59 | 6.52 |
| 3/4 | -16.03 | -36.25 | 0 | 20.11 |
| 3/2 | -3.81 | -9.72 | 0 | 9.25 |

## Unit pilots

Clean16e340b4, fingerprint
`d5b9358ee0593aa1fbcef0956109327a69a5639e50847d04315f4f048641b283`:
`pnpm test:capture --project unit domain/bulk.test.ts domain/suggest.test.ts domain/generation/archetype.test.ts server/routes/data.test.ts --maxWorkers=N`.
Each run passed562 tests (45/81/49/387 by file), no first failures or retries.
Fresh contexts, warm filesystem caches, background load not frozen.

| Workers | Owner seconds | Native seconds | Sampled tree MiB | Wrapper MiB | Receipt |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 1.584 | 0.888 | 516.11 | 63.50 | 470d8d33-6ad7-482c-91ec-a5375790ee08 |
| 2 | 1.309 | 0.652 | 530.61 | 63.63 | 47805d7a-fee5-4dae-958a-79e3e2556245 |
| 4 | 1.372 | 0.716 | 528.95 | 63.61 | c3d76838-61bc-4dd6-b192-b82850200772 |

Five samples each, maximum gaps1024/1023/1024ms. These subsecond native
runs are under-resolved: neither similar peaks nor a default choice follows
from this table. Normal pressure and verified cleanup throughout. Swap used
4609.38MiB before/after; immediate vm_stat brackets show zero swapin/out deltas.
Host compressor-occupied deltas were−2.53/−1.03/−3.83MiB; stored-page
deltas−3.34/−1.38/−4.78MiB, compressions0, decompressions3.38/1.42/4.81MiB.
These are host observations, not attributable test savings. Raw brackets:
ignored measured-tuning workspace `tuning-unit-pilots.json`.

## Diagnostics, not timing comparisons

These fixed probes used5daf plus documentation edits, fingerprint
`0b98994fe64713aaa7161e1c8deb3863604b7f102d77984046d3f92e00646170`.
Instrumentation changed execution; do not compare their peaks directly
against ordinary pairs or describe these as a clean-tree baseline.

Native client import/heap profile `872ca00f-eddf-42d0-9e76-67da3ee80dd6`:
372pass, one worker,650.11MiB tree,71.88MiB wrapper,10.369s owner,
14samples,1025ms maximum gap. Earlier `013a59a9-cd38-425d-b0b4-b67932034729`
also passed, but import timing needed native `limit:50` instead of default0;
its empty import list was not evidence of no imports.

| File | Environment ms | Collection ms | Setup ms | Tests ms | Reported file heap MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Today | 183.86 | 261.24 | 39.27 | 2895.61 | 184.77 |
| Builder | 183.14 | 59.62 | 34.43 | 2113.22 | 182.49 |
| WorkoutDetail | 187.85 | 79.69 | 34.62 | 1959.07 | 208.81 |
| Library | 187.73 | 61.33 | 34.91 | 1484.73 | 145.16 |

Today's first library import measured42.30ms (self37.32); subsequent
files4.22–4.27ms. Jest-dom setup imports29.05–33.08ms. Today hit the50-entry
import-report cap, so that is not a complete graph. These fixtures import
TypeScript arrays, not repeatedly parsed JSON; all300 library entries remain
realistic witnesses. Per-test resetModules serves changing mock semantics.
Observed in-run heap growth is not after-GC retained-leak evidence. No
fixture cache, reset removal, alternate DOM or blanket teardown was justified.

TypeScript receipt `76878df5-36d1-406d-9151-f1ae428caf6e` ran each real
project serially with `--noEmit --extendedDiagnostics --listFiles`:
8.348s owner,1065.03MiB tree,74.91MiB wrapper,21samples,1025ms largest gap.
All passed. Compiler-reported memory below is not process RSS.

| Project | Files | Types | Compiler memory K | Compiler seconds |
| --- | ---: | ---: | ---: | ---: |
| tsconfig.app.json | 1408 | 198830 | 929894 | 3.98 |
| tsconfig.node.json | 409 | 1793 | 144149 | 0.30 |
| tsconfig.server.json | 915 | 99430 | 454968 | 1.55 |
| tsconfig.server.build.json | 752 | 58032 | 270717 | 0.85 |
| e2e/tsconfig.json | 427 | 50606 | 314486 | 0.92 |

No project split, diagnostic removal or E2E-census change made.

Streaming the actual listFiles output (including JSON and `.d.cts`) gives
643/8/231/99/97 repository source inputs respectively and
765/401/684/653/330 dependency inputs. The server project's membership also
includes root `scripts/wod/fetch-wods.d.mts`; path counting restricted to
`app/` would miss it. All99 production-server source inputs are also in the
server test project: that overlap alone does not make either diagnostic
contract redundant. No project boundary was changed on this evidence.

Full typed-lint profile: `TIMING=1 pnpm lint`, receipt
`f46e949d-84cf-4c3a-b0bc-0b1e24979132`,6a5b8e50 plus the explicit `.ts`
config import/comment correction; fingerprint
`a76b5cf2d964f9a9568d45de55677854138a5db358da6b2d5699f743e7dff710`.
It passed all lint/census phases:34.179s owner,29.419s ESLint,
3188.17MiB tree,65.55MiB wrapper,48samples,1024ms largest gap, normal pressure,
verified cleanup. Top timed rules: no-misused-promises2846.73ms (27.2%),
react-hooks/static-components2409.44ms (23.0%), no-floating-promises2079.11ms
(19.9%). These relative percentages cover timed rule work, not total elapsed
time. There was no immediate vm_stat bracket; compressor deltas unavailable.
No rule removal, suppression addition or project-service/result cache proposed.

Pure-client feasibility used exactly `src/library/filters.test.ts` and
`src/session/reviewSelector.test.ts`, retaining all49 native test IDs/names
and the real300-entry library. Jsdom receipt
`45972fd0-a543-4c90-a911-d4508f2e8227` passed at clean16e340b4; Node receipt
`d9cc0fd9-2212-4c3c-9a10-a0e4f8fa15bd` passed at16e plus the hardening fixes,
fingerprint `8b27f36f29f0bb7b10d6d4ec43827d650b57fdbe0d5408aca2ca7a69c1e24c67`.
Sorted native identities share SHA256
`2e09e7e3e993fbaa9b90ff573f08922a85ec57daf57d083815693979e7e844fa`.
The diagnostic alone changed the resolved client environment; one isolated
fork, existing jest-dom setup and source tests were retained. A worker setup
asserted absent window/document for Node. No production membership changed.

Jsdom native820ms, Node255ms; reported per-file heap67.3/53.6 versus23.0/15.6MiB.
These are NOT paired acceptance or an RSS reduction: differing dirty trees,
background state and diagnostic setup, no immediate VM-counter brackets, and
one-second sampling missed the workers (tree observations below1MiB).
Wrapper peaks71.09/71.02MiB, four samples each, maximum gaps987/424ms.
Normal pressure/verified cleanup; swap-used4609.38 and4585.38MiB respectively
stayed unchanged within each run, not a test-attributed reduction.

The first Node attempt `a8460eb1-dbdd-4c88-a953-6e929e266d12` refused before
bodies: root CLI environment did not override the project's environment.
A symmetric worker-setup attempt under jsdom then failed module resolution
for an outside-root setup file (`79e804a8-c298-44e0-9a69-fc8a23a4ce34` and
`090905b1-9ffe-451f-9861-51eb0c3608af`, zero test bodies). These diagnostic
failures are retained, not silently retried into an acceptance claim. Node
membership is feasible; a production move and its mutation witnesses remain
unproven and unimplemented.

Stryker receipt `f40e0a6f-0d96-4187-a161-da580ee1871c` used one outer
runner, `domain/recency.ts`, and `domain/suggest.test.ts`: nine mutants
killed, none survived/no-coverage/error/timeout.501.28MiB tree,71.30MiB
wrapper,2.218s,5samples,1021ms gap. Installed plugin source and its actual
debug config both established inner maxWorkers1/maxConcurrency1,
threads/isolate true. The existing outer omitted-concurrency calculation
would choose9 on this10-CPU host; no such run was launched. Vendor worker
disposal is not an owner-issued SIGKILL or evidence of OOM.

## Mutation implementation evidence and limits

Failure-first parser receipt `095a05f8-7d44-4ea7-9b4f-02cb852f0167`.
Its native config fixture used the wrong API option (`configFile`); that
native result is NOT credited. Corrected `config` fixture reached the actual
config and failed before the guard was installed:
`cd09435b-41b1-4d86-aaf4-0f00f3b6d68a`. Guard/parser green7tests:
`cac8adcb-e3e5-4168-a0b5-e1c903737698`.

Public/native-owner and private-artifact handoff red:
`2e23ac5f-6069-4958-bf78-fae3df9f66fd`; green3:
`56d0ea16-7439-4808-8683-ed4401dde7f5`. Real fixture tests also cover
busy/pressure refusal, initial assertion failure, source staleness and
SIGINT through the public owner. Combined52tests green:
`056b773f-248a-411b-9d33-b7ef4543f1b1`, cleanup verified. Its run.mjs
fixtures deliberately emit allocation/signal banners; these are synthetic
classification witnesses, not a real host-pressure event.

Fixture lessons: installed Stryker skips a symlinked node_modules directory
when discovering sandbox dependencies, so the native fixture uses a real
directory with linked entries. An exploratory arrow-function fixture reported
four killed mutants and one static ArrowFunction survivor. The ownership
gate uses a named function and asserts native killed statuses; it does not
establish static-mutant soundness or change the vendor's survivor policy.
Do not turn command exit0 into a blanket claim that mutants are killed.

Committed implementation1cbc51d3/6a5b8e50 passed actual pre-commit hooks,
receipts `e1f7febf-296d-493a-b62b-8706cafa0161` and
`aee304b2-d4cb-4141-8d26-877d4e1c6081`: every compiler project and30/30 E2E
membership retained. Three post-commit source mutations each failed the
named native witness, restored afterward:

| Broken authority | Named test pattern | Red receipt / failure |
| --- | --- | --- |
| mutation-run options.concurrency→2 | public mutation owns one | c3d60065-0743-491d-bd2c-efc874f411f3; actual2≠requested1 |
| remove inner maxWorkers comparison | native mutation config refuses excessive | 37f5667d-4a94-4516-8f9b-7514b7d02c0f; real body ran and command exited0 |
| remove original-intent comparison | public mutation refuses a selector | 524ffe55-abf1-4544-877c-079e6a86514d; dropped witness selector reached native work and exited0 |

The named patterns ran via the ignored measured-tuning `guard-native.mjs`
with `--test-name-pattern` before `scripts/local-work/native/mutation.test.mjs`.
Restored parser/native/routing27tests passed receipt
`74e130d1-b5e4-49b7-a8b9-7280549151f5`. This includes actual assertion failure,
staleness, interruption, busy/pressure and public handoff tests.
Public real-repository command (not a private probe):
`pnpm mutate --concurrency 1 --mutate domain/recency.ts --test-file domain/suggest.test.ts`
passed receipt `00bfac21-a70d-48a8-b418-ba18bfd641ef`; native JSON reports9killed
and no other mutant outcomes, verified cleanup. This is still only that
explicit source/witness pair, not the full mutation baseline.

Follow-up scope probe `156ed814-953b-4713-a64a-86c459922848` exposed a real
vendor-boundary widening: requested `witness.test.ts` also executed
`witness.test.ts.extra.test.ts`. Stryker resolves its testFiles glob exactly,
then its Vitest plugin forwards paths to a substring-filter API. Fix: the
dedicated config reads exact includes from the same frozen private options;
onInit independently checks the resolved includes before bodies. Public
parser/native/routing27tests passed
`1f427336-d59f-4bf5-8ba4-ed6f3c4a4eb6`; the native widened-include refusal
passed `57089caa-1668-40b6-9421-02c4383bed9b`. Extglob refusal and inherited
hosted artifact clearing failed first in
`a76a0a63-606f-4b50-a23e-b55de78a0d4a`, then passed in1f427336.

### Mechanism hardening: not ready

At16e340b4 the installed Stryker RetryRejectedDecorator always recreated a
failed worker before retrying. The public fixture in
`c511ea6a-146c-4eac-a333-1a72adbc3dda` writes a synthetic OOM diagnostic and
self-terminates once, without memory stress. Six replacement bodies ran;
five mutants were reported killed and the nested public command passed.
No supported retry-disable option was found in the installed schema or
[official configuration](https://stryker-mutator.io/docs/stryker-js/configuration/).
James's continuation authorized the proposed local-only, version-pinned patch.
The outer-process first-failure gate passes with the installed patch, but
ordinary local mutation is not yet ready for use: the final code lens exposed
two further native gaps, recorded below with their repairs. Postcommit repair
proofs, independent review and exact-head CI remain owed. Earlier successful receipts
prove only their normal-run cases, not this policy.

Receipt `6b9f1ad9-a0a3-49fa-8425-845ad336f0c5` independently reproduced two
more holes: a single project's worker override ran a body despite the root
cap; an ignored selected original changed while public mutation passed.
The former now checks effective per-project bounds (four native config gates
green, `b09a7686-35ba-456f-a8f5-09ca77eeb4dc`). The latter now streams a
conservative app-file superset alongside the Git snapshot, including ignored
imports/configs/witnesses and refusing aliases. Normal public mutation plus
tracked/ignored staleness cases passed
`062645f4-59f9-4997-b557-bfccafd31dc9`. These fixes are now committed in85eac349
and self-mutated below; independent review and CI remain owed.

Combined receipt `3037e419-7e7b-49bd-acd6-ebf0fa5a4ff2`:37pass/1fail; the
sole failure is the known vendor-retry witness. The attempted negative
Node name pattern also matched the file-level parent, so it did NOT exclude
that case. This is a red run, never38pass or a completed mutation adapter.
No actual memory-pressure event occurred; all fixture cleanup was verified.

### Pinned no-retry patch and upgrade contract

The core and vitest-runner patches under `app/patches/` are both registered
at exact10.0.0 in pnpm-workspace.yaml and integrity-pinned by pnpm-lock.yaml.
Registry inspection still reports10.0.0; no dependency upgrade was introduced.
It was generated with [pnpm patch](https://pnpm.io/cli/patch) and
[patch-commit](https://pnpm.io/cli/patch-commit), not by editing installed or
shared node_modules. Guarded install52be2cc4 passed with verified cleanup,
zero package downloads. Final guarded patch install25d1f860 and frozen-lockfile
install94895195-e171-4ac2-8668-c53810844b0e both passed, cleanup verified.
The patch changes the runtime schema too: Stryker validates the API package's
schema, not only the published core schema JSON. Public native fixtures assert
that the option is recognized, not merely tolerated as an unknown option.

Only the local frozen invocation sets `ergomaticFailOnWorkerFailure:true`.
Core exports a version2 marker and a structured worker-failure error; the
Vitest plugin exports an inner-policy version1 marker. The adapter refuses
either missing/mismatched patch before starting Stryker.
An invocation-wide latch prevents recovery and later scheduled executions
after the first rejection. Native proxy close observations retain pid,
exitCode, signal and at most8192characters per stdout/stderr tail. Allocation
diagnostics classify memory; a signal-only native exit is resource-aborted,
not invented OOM. The vendor TERM handler actually exits143 with signalnull;
the receipt retains that tuple, not a fabricated SIGTERM wait result. Native
disposal and ordinary survivor/timeout semantics remain unchanged.

The synthetic OOM and signal-only probes failed before the patch; the latter
ran six replacement bodies (8bc0115a). Initialization initially escaped the
outer retry decorator and lost classification (09d4b573); moving the public
structured failure boundary into the native proxy fixed that path. All three
native gates passed together inff9cf3da-2c01-4c21-8389-ca32bdd8f039, no
replacement body, verified cleanup. These fixtures self-terminate an owned
worker and print synthetic diagnostics; they do not stress host memory.
The outcome-channel new resource-aborted case was separately red inb81a05dc;
its unfiltered combined green is recorded below, not inferred from an earlier
file-level filtered-test credit.

Combined named native/parser/snapshot/outcome/routing/runtime fixtures passed
74/74, zero skipped, in receipt12269819-6921-4259-a792-5e3a2bb1bdff with verified
cleanup. This includes the unfiltered resource-aborted protocol case. The
runtime fixture suite deliberately prints simulated allocation/signal banners;
the enclosing owner recorded a pass, not an actual host resource event.

Mutant-stage failure initially exposed a live progress interval: b8a88825
timed out after30seconds, despite the native failure reaching the adapter.
Giving the reporter a dispose method alone did not fix it (de81f4ca):
typed-inject's injectClass creates an unregistered instance. The registered
broadcaster now owns local-only reporter disposal during root-injector cleanup;
the progress reporter clears its interval. No process.exit workaround or
fabricated report-ready success is used. Guarded71242313-d044-4198-884c-8e82864c82a1
passed all five gates: ordinary native run; missing public patch marker refuses
before real-engine bodies; mutant-stage crash remains memory even when original
source also becomes stale; omitted and false policy both retain actual upstream
hosted recovery. The latter are compatibility fixtures, not permission for
local resource retries. SourceError and first native reason remain separate.

On any Stryker upgrade, regenerate the patch against the new exact published
version and run the public normal/assertion/interruption, dry-run OOM,
signal-only, initialization, mutant-stage/stale-source, and omitted/false
hosted compatibility gates. Also prove a frozen install and a missing-patch
refusal. A patch that applies is not evidence that its upstream call path still
works. Do not silently remove the marker check or replace the patch with a
log parser, private runtime injection, or an automatic resource retry.

### Postcommit guard proofs at85eac349

Real pre-commit ebb4afb0-57f1-4441-b9ca-367441f3d091 passed typed lint on the
changed TypeScript, every compiler project and E2E30/30. Full admitted lint
51b6be30-e663-4254-a3bd-e7672d54c749 passed, cleanup verified. Deliberate source
mutations were applied one at a time after the real commit, then restored:

| Broken authority | Red receipt prefix | Observed failure |
| --- | --- | --- |
| Effective project limits removed |1e0aee67|Invalid real project ran a test body|
| Filesystem additions omitted from freshness hash |d1a13b2b|Changed ignored original publicly passed|
| Local no-retry option false |16998be4|Six replacement bodies after simulated OOM|
| Later stale-source error overwrites first error |f2263d5c|Ordinary failed instead of memory|
| Missing patch check removed |4a0e5edc|Real native engine ran instead of refusing|
| Local policy false, signal/init witnesses |981e4249|Replacement bodies; initialization cause lost|
| Resource-aborted protocol value removed |f4620739|Structured private outcome rejected|
| Actual vendor factory forces policy on for hosted |35b84909|Both omitted/false recovery witnesses fail|
| Actual broadcaster disposal disabled |4d19ecd4|Progress interval keeps failed invocation alive to deadline|

Each native probe used the named positive pattern in
`scripts/local-work/native/mutation.test.mjs` through guard-native.mjs;
the protocol probe used `outcome.test.mjs`. Vendor mutations used the prepared
package and guarded pnpm patch-commit, not installed/shared-file edits. Final
regeneration restored the committed patch/lock hash exactly. Initial restored
four gates passed17e38b97; final unfiltered native20/outcome3/snapshot7 passed
30/30 with no skips in3ef53c96-d8e3-4941-ba7a-fbe01027a758, cleanup verified.
No deliberate mutant remains. ff430f9c is an ancestry-only merge of the landed
foundation with exactly85eac349's tree, not a new behavioral candidate.

### Prescribed-code lens: native thread and resolved-file seams

Both hardening lenses are finished; no third lens or verification dispatch.
The code lens reviewed85eac349/ff430f9c and found two substantive gaps:

- Actual Vitest thread-only exit (not process.kill(process.pid)) left four
  later bodies and public exit0, native4Killed/1RuntimeError, in8bafc6ba.
  Expanding to two witnesses in the same inner invocation left five later
  bodies and5Killed inbce04c94. A result-only failure check is too late: the
  inner queue advances before the fulfilled Stryker error result arrives.
- Mixed normal/native-ignored source and witness requests both passed while
  silently omitting one requested path in6b25b70e. Git-ignored inputs that
  Stryker does copy are a separate population from its unconditional ignores.

The core preparation boundary now compares exact requested paths with the
real ProjectReader mutation/witness populations before sandbox/test execution,
under the local-only `ergomaticExactInputs` option. It does not require any
mutants from a valid source: the type-only source witness passes. Both mixed
ignored cases turned green inbce04c94; normal/ignored/thread gates passed
4/4 in4d508435-1638-40b6-aebb-4dc9141e1311.

The local Vitest plugin uses the public, experimental
[PoolRunnerInitializer/PoolWorker API](https://main.vitest.dev/guide/advanced/pool)
to wrap Vitest's own ThreadsPoolWorker, not replace its isolation or protocol.
Its first native error/exit latches before another worker can be constructed.
It immediately publishes the structured failure over Stryker's owned IPC;
the parent rejects active work and enters native disposal. This also handles
startup death while Vitest still awaits its handshake. It does not rely on
reporter timing, parsing logs, or reaching a final Error result.

This extension is pinned to the inspected Vitest4.1.11 path and refuses local
upgrades until revalidated. Native thread error codes are retained; only
ERR_WORKER_OUT_OF_MEMORY classifies allocation. A thread exit0 is still an
unexpected resource failure. For thread records, pid identifies the hosting
process while exitCode identifies the thread; signalnull is not a claim that
the host process exited. Parent diagnostic tails remain bounded. Expected
stop/terminate is marked before native teardown, not mistaken for a crash.
Omitted/false policy keeps upstream hosted behavior.

The named follow-up gates passed8/8 ind23070da-b703-491a-9258-2449819a8cdf:
type-only source, missing inner patch, thread exits0/1 with queued witness,
native startup error, synthetic allocation-code startup error, and both
hosted compatibility modes. No actual allocation stress occurred. Every
reported fixture run had verified cleanup. Prepared-package installs were
0506cb2b/687aba8d/c7380b06; installed/shared node_modules were never edited.

On upgrades, add these native mixed-selection, queued-witness, startup-error,
zero-exit, type-only-source and both-marker refusal cases to the earlier
maintenance gate list. Normal assertion/survivor/timeout semantics remain
upstream behavior; no new worker default has been selected.

Combined native/parser/snapshot/outcome/routing/runtime fixtures passed82/82,
zero skipped, in95086cc3-5f18-4237-8ad6-d925394e3aa3 with verified cleanup.
The run.mjs diagnostic fixtures print simulated resource banners; this was
not an actual host resource event. Frozen installation of both patches passed
c1f40e51-0599-4fa5-a502-14ae8ff34a6f with verified cleanup and no downloads.

### Postcommit repair proofs at57026156

The real commit hook dc76c705-aa86-45b0-b90b-66218cf0058a passed typed lint,
every compiler project and E2E30/30. Five deciding-source mutations then bit:

| Broken authority | Red receipt prefix | Observed failure |
| --- | --- | --- |
| Exact native membership option false |a10d1aef|Both mixed ignored requests publicly passed|
| Inner patch marker check removed |2dd7c815|Real engine executed instead of refusing|
| Actual native worker failure observer disabled |b0764abb|Both thread-exit0/1 cases ran five later bodies and publicly passed|
| Native allocation error code unrecognized |3503d6cc|Synthetic allocation was resource-aborted instead of memory|
| Parent drops native-thread failure IPC |caaf46ed|No later bodies, but five RuntimeErrors and false public success|

Vendor mutations used only the prepared package plus guarded patch-commit.
Production patch bytes and lock hashes were restored exactly. No real host
resource event occurred; the enclosing deliberately red probes cleaned up.
The IPC mutant demonstrates why stopping the inner queue alone is insufficient:
the outer owner also needs the actual failure, not a fulfilled error summary.

A speculative single-project pool-override probe initially demanded refusal
(af3ddfce/337bc569/24f97a55). That premise was wrong, not another safety defect:
Vitest4.1.11 resolveProjects applies native API `pool` after project options.
A fixture-local factory sentinel remained absent while the real test body ran
(a3d450a7). The speculative comparison guards were removed. The retained
characterization asserts the protected API pool wins, not that unused config
must be rejected; no additional production guard was added for this case.

Final restored native29/outcome3/snapshot7 passed39/39, no skips, in
4d916d47-781f-4a34-b47a-be3d30384463 with verified cleanup. The patch files,
lockfile and production adapter match57026156 exactly; the extra fixture is
the project-override characterization above.

Still owed: browser1/2/3, final candidate
hook/browser proof, worker-default decision, independent review and exact-head
CI. None is silently waived by measurements or these scoped repairs.

Scoped Node coverage ea4d29a2-3d66-4115-895e-c5175874fa52 passed27/27. Per-file
line/branch percentages: mutation100/91.43, outcome100/85,
selection-git99.48/80 and workloads95.31/86.17. The direct mutation-run row is
42.77/22.22: its real execution cases run copied modules in fixture child
processes, not that source-path row. Native29 cases supply those behavioral
seams; no complete per-file coverage of the Vite-transformed reporter or vendor
patch is claimed. Unrelated imported modules in this scoped report are not a
whole-suite coverage measurement.

### Task-review compatibility gate

The task review atdb762588 found no demonstrated production defect, but
requested native survivor and timeout evidence at the changed recovery seam.
Receipt ad1ceec2-207f-471d-8c75-66087b0207d7 passed both public fixtures:
the untested zero boundary produced a real `n >= 0` survivor; a witness that
waits forever only at a mutated zero produced a real `n >= 0` timeout.
The timeout case's native statuses were only Killed/Timeout. Both retained
the existing null break threshold, public exit0, completed mutation record,
no workerFailure, verified cleanup and no remaining owner. The never-resolving
promise allocates no stress memory. Native timeout/disposal took24seconds;
that fixture alone allows60seconds at the outer harness, leaving Stryker's
own timeout unchanged. This does not admit threshold controls: the local
config remains closed. The tightened timeout witness kills the constant-true
and nonpositive mutants before waiting, leaving only `n >= 0`: exactly one
native Timeout and exactly one waiting-body marker passed in007d4b12-fa81-40dc-
b9f6-7aaee520c56e (both cases2/2, timeout9.3seconds, verified cleanup). This
guards against replaying that same mutant and makes the former24second cost
unnecessary. Postcommit fault proofs and review closure are pending.
