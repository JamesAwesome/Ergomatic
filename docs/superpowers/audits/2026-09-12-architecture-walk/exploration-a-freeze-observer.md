# Phase MD — Exploration A: the freeze/resume observer

Read-only investigation. Tree: main checkout `/Users/james/projects/github/jamesawesome/Ergomatic`
at `4aa3d132f957d93ce62b72cf3e95959d1a17e8b7` (`git log -1 --format=%H`). Nothing written
in the repo. All `file:line` below are PRIMARY — read this session at that SHA.
Tags: **P** = PRIMARY (I read the line / ran the command), **S** = SECONDARY (a repo doc
says so), **I** = INFERENCE.

---

## 0. The ROADMAP's two numbers, re-measured

| Claim | Command | Result |
|---|---|---|
| "The hook holds 38 `useRef`s" | `grep -cE '^\s*const\s+\w+\s*=\s*useRef' app/src/monitor/useMonitorSession.ts` | **38 — CONFIRMED (P).** (A bare `grep -c useRef` returns 41: the import at `:46` and two prose mentions at `:1904`, `:2353`.) |
| "twelve are one concern" | see §1 | **CORRECTED to 14 (P)**, and the 14 split 7 / 5 / 2 across three different lifetimes and two different owners. |
| "Six symbols are exported ONLY so the test can reach them" | see §3 | **CORRECTED to 14 test-only + 1 with no consumer at all (P).** `ROWING_ACTIVE_FALLBACK_FRAMES` is imported by nothing, including the test. |
| "29 `vi.doMock` across 7 files" (PR 2's row) | `grep -rn 'vi\.doMock' app/src/monitor -A1 \| grep -c appLifecycle` → 29; same pipe `\| sed 's/[-:].*//' \| sort -u` → 7 files | **CONFIRMED (P).** Total `vi.doMock` under `src/monitor` is 94 across 10 files; the appLifecycle subset is 29/7. |

---

## A. The lifetime table

### A.1 The set, and how the boundary was drawn

Membership test used: **does the ref exist to answer "is the stream frozen, silent,
backgrounded, or just resumed?"** Fourteen qualify. They are not one concern — they
are three, and that is the finding:

- **Group I — instrument-only (7).** Every one carries an `I3` / "never a predicate
  input" / "Records what was MEASURED and asserts no cause" annotation at its own
  declaration or write site. None reaches `update(...)`. Deleting all seven changes no
  published value; it deletes ring entries. (P: `:2178-2192`, `:2193-2217`,
  `:2218-2252`, `:3583-3587`, `:3602-3620`.)
- **Group P — predicate refs (5).** These decide `MonitorSession.frozen` and
  `MonitorSession.frameSilence`, the only two members of the published interface this
  whole cluster produces (P: `:1002`, `:1017` in the `MonitorSession` block at
  `:953-1111`; the writes at `:3336`, `:3623`, `:5667`).
- **Group L — lifecycle plumbing (2).** Unsubscribe handles for the app-lifecycle
  listener. These belong to **PR 2's** seam, not to a freeze observer.

### A.2 Group I — instrument-only (7 refs)

Function ranges used to name sites (P, `grep -nE '^  (const|function|async function) [a-zA-Z]+ ?[=(]'`):
`handleFrame` 3027-3647 · `handleEvent` 3738-4423 · `teardown` 4424-5010 · `fail`
5011-5124 · `connect` 5125-5820 · `beginFreeRow` 5821-5926 · `program` 5927-6061 ·
`cancel` 6179-6362. All line numbers are in `app/src/monitor/useMonitorSession.ts`.

| Ref | Minted | Written / cleared | teardown | relaunch | re-arm |
|---|---|---|---|---|---|
| `framesWhileHiddenRef` | `:2094` (mount, `null`) | `=0` at the **background** edge `:5625`; read-and-`null` at the **foreground** edge `:5696`; `null` at `connect()` `:5425` | no | no | **survives** — no per-run clear exists (see A.5) |
| `resumeEdgeArmedRef` | `:2110` (mount, `null`) | armed at foreground edge `:5720`; consumed+nulled in `handleFrame` `:3065`; cleared `handleEvent`(RC-37 exit) `:4157`, `connect` `:5437`, `beginFreeRow` `:5894`, `program` `:5959` | no | no | no (4 reset sites) |
| `preBackgroundFreezeKeyRef` | `:2139` (mount, `null`) | set at background edge `:5632`; cleared `:4162`, `:5441`, `:5898`, `:5964` | no | no | no |
| `resumeStaleRunRef` | `:2167` (mount, `null`) | opened `:3085`, extended `:3091`, closed `:3097`/`:3062`; cleared `:4158`, **`teardown` `:4568`** (logs `endedBy=teardown`), `:5438`, `:5895`, `:5960` | no (logs a close) | no | no |
| `frameArrivalsRef` | `:2189` (mount, `[]`) | append/reset per frame `:3563`,`:3565`; cleared `:4168`, `teardown` `:4583`, `:5444`, `:5901`, `:5967` | no | no | no |
| `lastResumeAtMsRef` | `:2204` (mount, `null`) | set at foreground edge `:5741`; cleared `:4169`, `teardown` `:4584`, `:5445`, `:5902`, `:5968` | no | no | no |
| `postResumeArrivalsRef` | `:2226` (mount, `null`) | seeded `[]` at foreground edge `:5742`; appended/closed `:3117`,`:3119`; cleared `:4170`, **`teardown` `:4581`** (logs `nextGapsMs=truncated`), `:5446`, `:5903`, `:5969` | no (logs a close) | no | no |

"relaunch" is `no` for all fourteen by construction (**I**, grounded in P): every one is a
`useRef` on a client-only hook; nothing in this file writes any of them to storage
(`grep -n 'localStorage' app/src/monitor/useMonitorSession.ts` finds no hit naming these
refs). Re-arm = a fresh `program()` / `beginFreeRow()` on the same mounted hook.

### A.3 Group P — predicate refs (5)

| Ref | Minted | Written / cleared | teardown | relaunch | re-arm |
|---|---|---|---|---|---|
| `freezeRef` | `:1952` (mount, `NO_FREEZE`) | seeded `nextFreezeRun(null, frame)` at ready→live `:3299`; advanced per live frame `:3525`; reset `handleEvent` `:4099`, `cancel` `:6299` | no | no | **partly** — reset at the RC-37 exit and `cancel()` only; `program()`/`beginFreeRow()` do **not** clear it |
| `rowingStreakRef` | `:1956` (mount, `null`) | written in the `ready` branch `:3167`; cleared `:4100`, `beginFreeRow` `:5849`, `program` `:5943`, `cancel` `:6300`, `connect` (1 site) | no | no | no |
| `framesEverEmittedRef` | `:1964` (mount, `false`) | set `true` once at `:3748`; **read at `:5479`** as a driver callback. **NO clear site exists** (`grep` returns exactly 3 lines: `:1964`, `:3748`, `:5479`) | **survives** | no | **survives** |
| `hysteresisCancelRef` | `:2504` (mount, `null`) | owned by the `livenessDepsRef` closures `:2547`, `:2550`; cancelled+nulled `connect` `:5198` and at the resume latch `:5667` | no | no | **survives** — no per-run clear |
| `livenessRef` | `:2334` (mount, `null`) | `null` at top of `connect()` `:5178`; set to the resolved transport `:5276`; read at `fail()` `:5049` and at the foreground edge `:5647` | no | no | **survives** — per-CONNECTION, not per-run |

### A.4 Group L — lifecycle plumbing (2)

| Ref | Minted | Written / cleared | teardown | relaunch | re-arm |
|---|---|---|---|---|---|
| `lifecycleUnsubRef` | `:2517` (mount, `null`) | set `:5758` (async arm) / `:5761` (sync arm); nulled `:4095`, `:4356`, `teardown` `:4510`, `fail` `:5083`, `connect` `:5200` | no | no | survives (per-connection) |
| `lifecycleAttemptRef` | `:2535` (mount, `null`) | one token per attempt `:5619`; `.cancelled = true` at `:4092`, `:4353`, `:4507`, `:5080` | no | no | survives (per-attempt token) |

### A.5 Considered and EXCLUDED, with the reason

| Ref (`file:line`) | Why out |
|---|---|
| `stateRef` `:1898`, `depsRef` `:1902` | render-plumbing mirrors of props/state, every concern reads them |
| `driverRef` `:1911`, `unsubscribeRef` `:1912` | transport/driver ownership |
| `sessionRef` `:1930` | the `LogicalSession` — owns `resumes`/`latches` counters the resume path *increments* (`:5663`, `:5665`), but the ref itself is session identity, and RF27 was created by moving five fields **into** it |
| `runRef` `:1934`, `lastAcceptedRevisionRef` `:1947`, `identityRef` `:1951` | stored-run / CAS concern — **PR 1's** territory |
| `lastRowingFrameRef` `:2017`, `partialMintRefusedRef` `:2037` | partial-interval minting (§5.3), not freeze; they merely share the six per-run reset sites |
| `lastContinuityRef` `:2256` | continuity/TWD attribution (Phase LL F2a); reads `freezeRef` nowhere |
| `connectingRef` `:2264`, `attemptIdRef` `:2269`, `attemptTraceRef` `:2277`, `targetedAbortRef` `:2283`, `attemptRef` `:2310` | connect-attempt identity |
| `seriesRecorderRef` `:2317`, `seriesFlushCancelRef` `:2321` | series recording — **PR 3's** territory |
| `degradedUnsubRef` `:2511` | characteristic-degradation subscription; adjacent to liveness but a different signal (`onCharacteristicDegraded`, `:2506-2510`) and never read by a freeze predicate |
| `livenessDepsRef` `:2537` | not state — a frozen literal minted once, never reassigned (`grep -n livenessDepsRef` → 6 hits, zero assignments after `:2537`). It is the *constructor* of the group-P closures, not a member |
| `splitHoldRef` `:2773`, `burstHoldRef` `:2780`, `lingerFinishRef` `:2821`, `burstLingerCancelRef` `:2836` | hand-off holds / burst linger |

**Boundary anomaly worth a sentence (P).** `framesWhileHiddenRef` is the only group-I ref
with **no per-run clear** — the four sites that clear its five siblings (`:4157-4170`,
`:5894-5903`, `:5959-5969`) do not touch it; it is cleared only at `connect()` `:5425` and
at the two lifecycle edges. `resumeEdgeArmedRef`'s own doc comment (`:2098-2109`) says it
"Mirrors `framesWhileHiddenRef`'s own … lifetime for the CONNECTION" and then lists three
*extra* per-run clears it has and `framesWhileHiddenRef` does not. Consequence is bounded:
the value is read-and-nulled at the foreground edge and can only be stale if a background
edge is followed by a re-arm and then a foreground edge, in which case one `resume-frames`
entry over-reports `framesWhileHidden` for a run that is over. **Instrument-only, so no
number a rower reads moves (I, from A.1's group-I evidence).**

---

## B. The one question: do the twelve refs move, or only the pure helpers?

### B.1 The "move" reading, costed

An observer that owns the 14 must serve every site that touches them. Measured by mapping
each `X.current` line to its enclosing function (script in scratchpad `map.sh`):

- `handleFrame` (per-frame: seed, advance, arm-consume, stale-run, arrival windows)
- `handleEvent` — the RC-37 `programDropped`/ready exit (per-run reset)
- `connect` — per-connection reset **plus** the whole `registerAppLifecycleListener`
  callback body (`:5620-5768`), which is where 6 of the 14 are written
- `teardown` — two refs log a close here, five just clear
- `fail`, `cancel`, `program`, `beginFreeRow`

So `createFreezeObserver` needs, minimally:

```ts
createFreezeObserver({ now, record, update, schedule, markSuspect })   // 5 deps
  .onReadyFrame(frame)      -> { promote: boolean }   // nextRowingStreak / fallback
  .onFirstLiveFrame(frame)                            // nextFreezeRun(null, frame) seed
  .onLiveFrame(frame)       -> { frozen: boolean }    // advance + pause-declared + windows
  .onBackground(lastFrame)
  .onForeground({ snapshot, lastFrame, phase, session }) -> { latch, gapMs }
  .onSilence(ms) / .onRecovery()                      // the hysteresis pair
  .onConnect() / .onRunReset(reason) / .onTeardown()
  .frozen / .frameSilence                             // 2 readable outputs
```

**Count: 5 constructor deps + 10 methods + 2 outputs = 17 members** — against the
ROADMAP's sketch of "a real 3-in/4-out interface" (P: ROADMAP Exploration A bullet).
That sketch is the claim this exploration was funded to test, and it does not survive the
call-site census.

Three specific costs, each measured:

1. **The foreground handler is not extractable as written.** `:5620-5768` reads
   `livenessRef.snapshot()`, calls `decideResumeLatch`, increments `session.resumes` /
   `session.latches` on the `LogicalSession` the observer does **not** own (`:5663`, `:5665`),
   calls `update({ frameSilence: true })` (`:5668`), reads `stateRef.current.phase` and
   `.frame` (`:5697`, `:5701-5705`), reads `rowingStreakRef` (`:5698`), records three ring entries,
   and calls `transport.markSuspect()` (`:5746`). Moving the refs moves the refs; the five
   couplings cross the new boundary as parameters.
2. **No call site disappears.** The 4-6 per-run reset sites become 4-6 `onRunReset()`
   calls. ~50 ref assignments become ~10 method calls plus the same number of call sites.
   The **deletion test** from the walk's own vocabulary (S: `findings.md`, "Vocabulary")
   returns **moves, not concentrates**.
3. **It buys no test that does not already exist.** The 29 `vi.doMock`s are all against
   `../adapters/appLifecycle` (P, §0) and are removed by **PR 2's** dep, not by this. Every
   group-I behaviour is already asserted through `renderHook` + `exportLog()` (P:
   `useMonitorSession.test.ts:13624`, `:13668`, `:13697`, `:14052` read `latch-count`;
   `:7488`, `:7806` likewise; `lifecycleReplay.test.ts:358` reads `liveness-silence` off a
   replay ring). A new seam here would need mocking to be *reached*, which is the phase
   goal running backwards.

### B.2 The "stay" reading

Only the pure helpers are already out — and they are already out. `nextFreezeRun`,
`isPausedRun`, `nextRowingStreak`, `handleFrameSilence`, `handleFrameRecovery`,
`decideResumeLatch`, `recordLivenessSilence`, `recordLivenessRecovery` are module-scope
pure functions today (`:427-614`, `:1425-1560`). The bug class RF19 names — *how they are
called* — lives in the two edge handlers, and PR 2 is the change that makes those handlers
reachable without `vi.doMock`. This exploration cannot improve on that; PR 2 does.

### B.3 VERDICT — **NO PR.**

Row text, ready to paste into `ROADMAP.md` under Exploration A:

> **Exploration A — answered 2026-09-12: NO PR.** The refs were re-counted (38 total,
> confirmed) and the concern re-drawn: it is **14**, not twelve, and they are three
> concerns with three different lifetimes — 7 instrument-only refs that reach no published
> value, 5 predicate refs behind `frozen`/`frameSilence`, and 2 app-lifecycle unsubscribe
> handles that belong to PR 2. A `createFreezeObserver` serving all 14 call sites prices at
> **5 deps + 10 methods + 2 outputs = 17 members**, not the 3-in/4-out the row assumed,
> because its busiest writer — the foreground-edge handler at
> `useMonitorSession.ts:5620-5768` — also reads the liveness snapshot, increments
> `LogicalSession`'s own `resumes`/`latches`, calls `update()`, reads `stateRef`, and calls
> `transport.markSuspect()`; those five couplings become parameters. No call site
> disappears and no `vi.doMock` disappears (all 29 target `adapters/appLifecycle` and are
> **PR 2's** to remove). Deletion test: **moves, not concentrates.** The artifact the row
> was funded for — the RF27 lifetime table over the refs — is delivered and is the output.
> **Two findings ride other PRs (below).** Re-open only if PR 2 lands and the foreground
> handler, with lifecycle injected, still reads as a module wanting an owner.

### B.4 What should ride other PRs instead (not new rows — carry to James)

1. **`ROWING_ACTIVE_FALLBACK_FRAMES` is exported and imported by nothing** (P: §3 census).
   Drop the `export` keyword; it stays a module constant used at `:3178`. RF29-adjacent
   (dead surface, not dead code). One line, belongs in whichever PR next touches this file
   — **PR 2**, which already changes this hook's published interface.
2. **The `framesWhileHiddenRef` per-run-clear gap** (A.5). Either add the three clears its
   own sibling's doc comment implies, or correct `resumeEdgeArmedRef:2098-2109`'s "mirrors
   `framesWhileHiddenRef`'s lifetime" sentence. Instrument-only, so it is a comment-vs-code
   discrepancy, not a defect — also **PR 2**, same file.
3. **`framesEverEmittedRef` has no clear site at all** (P: 3 grep hits) while its doc
   comment at `:1957-1963` says "cleared at teardown". It is cleared by React discarding
   the ref at unmount, not by `teardown()` — the one ref in the 14 whose lifetime is
   MOUNT. Worth one word in that comment. Same PR.

---

## C. Test reachability of the six named exports

Census command (P):
`grep -rn "\b<sym>\b" app --include='*.ts' --include='*.tsx' | grep -v 'useMonitorSession\.ts:' | grep -v 'useMonitorSession\.test\.ts:' | grep -vE ':[0-9]+:\s*(//|\*|/\*)'`

| Export | Test(s) using it | Reachable through `renderHook` today? |
|---|---|---|
| `defaultLivenessSchedule` `:427` | `useMonitorSession.test.ts:10066-10086` (fires after ms; canceller stops it) | **Yes, transitively.** It is hard-wired as `livenessDepsRef.current.schedule` (`:2539`) and passed literally at `:2553`; the hook-composition test at `:10576-10644` advances fake timers across the full `BANNER_RETRACT_HYSTERESIS_MS` window and asserts `result.current.frameSilence` flips, which cannot pass if the timer or its cancel is broken. The direct test is a cheap edge-case pin, not the only route. |
| `recordLivenessSilence` `:448` | `:10089-10098` | **Yes, exactly.** `:10395-10405` asserts `exportLog()` contains `kind === "liveness-silence"` with `detail === "frame stream silent for 2500ms"` — the identical assertion, driven through the hook's own closures. `lifecycleReplay.test.ts:358` asserts the same kind off a replay ring. **Redundant.** |
| `recordLivenessRecovery` `:457` | `:10101-10110` | **Yes, exactly.** `:10406-10411` asserts `detail === "frame stream resumed"` via `exportLog()`. **Redundant.** |
| `handleFrameRecovery` `:514` | `:10145-10171` (does not clear immediately, schedules), `:10172-10182` (cancels a prior timer) | **Yes.** `:10576-10644` proves both behaviours end-to-end: one healthy frame does not clear, a second silence inside the window restarts the clock, only a full 10 s window retracts. Also `:11133-11247` (native-dispatch probe). The direct tests pin the *return value* (the new canceller) which the hook test only observes indirectly. |
| `nextRowingStreak` `:1524` | `:8993-9020+` (streak advances on strictly-increasing distance; identical distance does not) | **Yes for the promotion.** `:1254-1301` drives five frames of strictly increasing distance through the hook and asserts the `rowing-active-fallback` ring entry with `rowingActive=false distance=8.2 state=rowing`; `:1303-1334` is the coast negative; `:1337-1357` the instant path. The direct test's unique value is the identical-distance edge at `:9017-9019`. |
| `ROWING_ACTIVE_FALLBACK_FRAMES` `:1500` | **NONE.** `useMonitorSession.test.ts:1246` is a comment mention; the test's import block (`:83-105`) does not list it; repo-wide non-comment hits outside the source file: **0** | Not applicable — the constant's *effect* is pinned at `:1254-1301` (five frames). The export is dead. |

**Two exports the ROADMAP's six omits, on the same footing:** `handleFrameSilence` `:491`
and `nextFreezeRun` `:1425` / `isPausedRun` `:1458` are equally test-only. Their only
non-test mentions (`justrow/JustRow.tsx:399-401`, `connectedAxes.ts:5,87,106`,
`e2e/connected.spec.ts:180,343`) are **all comments** (P, verified line by line).

**Full test-only census (P).** Of the 17 value exports (`grep -nE '^export '`), only three
have a consumer outside `useMonitorSession.ts` + its test: `useMonitorSession` (production),
`programHasDistanceGoal` (`continuity.test.ts:16`), and `BURST_HANDOFF_HOLD_MS`
(`summaryHoldReplay.test.ts:146`, `WorkoutDetail.postReleaseCommit.test.tsx:204`). **14 are
test-only; a 15th has no consumer at all.** The ROADMAP's "six" understates the surface by
more than half, and that is an argument *for* the phase's framing, not against it — it is
just not an argument for this particular observer.

---

## D. RF19 check — which refs held the blind-instrument defect, and what watches them now

The defect (S: CLAUDE.md RF19; the code's own account at `:5673-5679`): *"the line this
replaced read 'resumed from background — stream treated as suspect', which claimed a cause
nobody had checked and, on the walk that produced this fix, was untrue nine times out of
nine."* Red `LOST THE MONITOR` over a link that never dropped.

**The refs it lived in — all group P, at the foreground edge:**

- `livenessRef` `:2334` — the snapshot read at `:5647`; before the fix nothing read it at
  the resume edge and the latch was unconditional.
- `hysteresisCancelRef` `:2504` — cancelled and nulled at `:5666-5667` immediately before
  `update({ frameSilence: true })` at `:5668`. This is the line that raises the banner.
- `rowingStreakRef` `:1956` — read at `:5698` to report `distanceIncreased` (`:5698`).

**Instruments that now watch them (P):**

| Instrument | Emitted at | Watches |
|---|---|---|
| `app-lifecycle` ring entry | `:5679-5685` — `resume gap=<n>ms threshold=<n>ms silent=<bool> latched=<bool>` | `livenessRef` + `decideResumeLatch` + `hysteresisCancelRef`'s latch. Records the measurement **and** the decision, asserting no cause. |
| `resume-frames` | `:5701-5705` — `phase= framesWhileHidden= rowingActive= distanceIncreased=` | `framesWhileHiddenRef` (`:5695`), `rowingStreakRef` (`:5698`), `stateRef.current.frame` (`:5697`) |
| `resume-first-frame` | `:3070`, `:3114`, `:4578`, `:5737` | `resumeEdgeArmedRef`, `preBackgroundFreezeKeyRef`, `postResumeArrivalsRef` |
| `resume-stale-run` | `:3059`, `:3094`, `:4153`, `:4565`, `:5890`, `:5955` | `resumeStaleRunRef`, incl. `endedBy=teardown` / `=reset` / `=resumed` / `=changed` |
| `pause-declared` | `:3603-3611` — `frames= hold= pulled= d= split= spm= gapsMs=[…] sinceResumeMs=` | `freezeRef`, `frameArrivalsRef`, `lastResumeAtMsRef` |
| `latch-count` | `:4667` | `LogicalSession.latches`/`.resumes` — the per-session totals the foreground edge increments at `:5663`, `:5665`. Asserted in tests at `:7488`, `:7806`, `:13668`, `:13697`, `:14052`. |
| `liveness-silence` / `liveness-recovery` | `:452`, `:458` | `hysteresisCancelRef`'s two closures |
| `rowing-active-fallback` | asserted at test `:1295-1299` | `rowingStreakRef` |
| `partial-mint-refused` | `:2076` | `partialMintRefusedRef` (excluded from the set, listed for completeness) |

**Refs in the table with NO instrument that would show them being wrong — stated
explicitly, as asked:**

1. **`lifecycleUnsubRef` `:2517` and `lifecycleAttemptRef` `:2535`.** Nothing records a
   registration, an unsubscribe, or a cancelled token. The failure their doc comment at
   `:2518-2534` describes in detail — a late native `.then()` overwriting a newer attempt's
   unsub, leaking a listener "permanently into every later session on this hook instance" —
   produces **no ring entry on any path**. A leaked listener would show up only as a
   *second* `app-lifecycle` entry per resume, and no test or export asserts that count is 1.
   This is RF19's own shape (a platform-sourced input with no instrument) still open, and
   it is squarely **PR 2's** territory: the same dep that makes the lifecycle injectable is
   what makes a leaked-listener count assertable. Recommend PR 2's spec own it.
2. **`framesEverEmittedRef` `:1964`.** Read at `:5479` as a driver callback; never logged.
   Its mount-scoped lifetime (A.3) is invisible.
3. **`preBackgroundFreezeKeyRef` `:2139`** is logged only *indirectly*, as the derived
   `stale=` boolean in `resume-first-frame` (`:3067-3068`). A wrong key and a genuinely
   identical frame are indistinguishable in the ring. Its own comment (`:2140-2163`) records
   that this exact confusion was the bug it was created to fix — so the instrument that
   would have caught it is the one still missing.

---

## Contradictions with the brief, stated per the briefing

- The ROADMAP's "twelve refs" and "six test-only exports" are both low. Corrected numbers
  and commands in §0, §A.1, §C.
- The ROADMAP's "a `createFreezeObserver({now, schedule})` is a real 3-in/4-out interface"
  is the load-bearing claim, and the call-site census does not support it (§B.1). Since the
  row itself says the honest answer may be "no PR", this is the row working as designed.
- The brief said "do NOT propose splitting `driver.ts` or reworking `Transport`." Neither
  is proposed. Nothing in §B touches either.
