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

Still owed: pure-client
membership audit, representative unit1/2/4 and browser1/2/3, final candidate
hook/browser proof, worker-default decision, bounded hardening, independent
review and exact-head CI. None is silently waived by these measurements.
