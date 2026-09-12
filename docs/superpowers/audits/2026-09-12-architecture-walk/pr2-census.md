# Phase MD PR 2 — census

Read-only. Main checkout `/Users/james/projects/github/jamesawesome/Ergomatic`,
`git rev-parse HEAD` = `4aa3d132f957d93ce62b72cf3e95959d1a17e8b7`. Paths relative
to `app/src/`. Claims are PRIMARY (read/ran this session) unless tagged. Nothing
in any checkout was written.

**Path correction up front:** `connectedAxes.ts` is at `monitor/connectedAxes.ts`,
not `workout/connected/`. The row's five literal line numbers point at the
`deriveAxes(` call; the field sits +4 to +7 below.

## 1. The deps interface

### 1a. `MonitorSessionDeps` — `useMonitorSession.ts:1112`

**Correction: TEN fields, not nine.**
`awk 'NR>=1112 && NR<=1201' useMonitorSession.ts | grep -cE '^  [a-zA-Z]+\??:'` → `10`.

| field | type | default (site) | injected by |
|---|---|---|---|
| `requestStoragePersistence?` | `boolean` | `true` — `:5450` `!== false` | `useMonitorSession.test.ts` 1; **`monitor/JustRowObserver.tsx` 1 (production)** |
| `requestDiagnosticStash?` | `boolean` | `true` — `:4641` `=== false` early-return | `monitor/JustRowObserver.tsx` 1 (production) ONLY |
| `createTransport?` | `() => Transport\|null\|Promise` | `:5253` `?? defaultTransport` | `useMonitorSession.test.ts` 41, `ConnectedInterstitial.test.tsx` 7, `ConnectedSurface.test.tsx` 1, `PaneGrid.test.tsx` 1, `JustRowObserver.test.tsx` 1 |
| `createLog?` | `() => MonitorEventLog` | `:5382` `??` | `useMonitorSession.test.ts` 10 |
| `now?` | `() => Date` | `:2560` `?? new Date()` | test files only (see note) |
| `createSessionId?` | `() => string` | `:2590` `?? defaultSessionId()` | **NOBODY** — `grep -rn '^\s*createSessionId:' app/src` = 0 hits |
| `schedule?` | `(cb,ms)=>()=>void` | `:2965`, `:3011` `??` | test files only (see note) |
| `seriesFlushSchedule?` | repeating pair | `:2630` `?? defaultSeriesFlushSchedule` | `useMonitorSession.test.ts` 1 |
| `burstLingerSchedule?` | one-shot pair | `:4785` `??` | `useMonitorSession.test.ts` 18 |
| `driverOptions?` | `Omit<DriverOptions,"deviceName">` | `:5468` spread | `useMonitorSession.test.ts` 70, `ConnectedInterstitial.test.tsx` 7, 6 replay specs ×1, `ConnectedSurface.test.tsx` 1, `PaneGrid.test.tsx` 1, `JustRowObserver.test.tsx` 1, `driver.test.ts` 1 |

Census command:
`for f in …; do grep -rn "^\s*$f:" --include='*.ts' --include='*.tsx' . | grep -v "monitor/useMonitorSession.ts:" | awk -F: '{print $1}' | sort | uniq -c; done`

**Note on `now`/`schedule` (INFERENCE from raw counts):** both names appear on
unrelated deps objects (`holdOpen`, `liveness`, `driver`, `engine`), so raw
counts (39/35/23/18…) over-count. Scoped to hook callers
(`grep -rln "useMonitorSession(\|freshUseMonitorSession("` → `justrow/JustRow.tsx`,
`monitor/JustRowObserver.tsx`, `workout/ConnectedInterstitial.tsx`,
`monitor/transports/index.ts`, the hook itself, and 8 test files): injected by
`useMonitorSession.test.ts` and the replay specs, by no production caller.

**Resolution mechanism (`:1902`-`:1908`):** `depsRef = useRef(deps)` refreshed in a
bare `useEffect`; every consumer reads `depsRef.current.<f> ?? default` at call
time. A new dep costs one interface field + one `??` read. No destructure, no
defaults object.

### 1b. `registerAppLifecycleListener` — `adapters/appLifecycle.ts:99`

```ts
export function registerAppLifecycleListener(
  cb: AppLifecycleCallback,
): AppLifecycleUnsubscribe | Promise<AppLifecycleUnsubscribe> {
  if (isNative()) {
    return import("../native/appLifecycle").then(
      ({ registerNativeAppLifecycleListener }) =>
        registerNativeAppLifecycleListener(cb));
  }
  // ... `cb` is intentionally never called on this arm.
  return () => undefined;
}
```
`AppLifecycleEvent = "background"|"foreground"`; callback `(event)=>void`;
unsubscribe `()=>void` (`:63`-`:65`).

- **Web arm is a genuine no-op that never calls `cb`** (Phase LL Minor 9, the
  file's own header). `registerWebAppLifecycleListener` (`:78`) still implements
  the real Page Visibility mapping, is exported, and **lost its last importer in
  PR1.75b** — `appLifecycle.test.ts` is its only cover.
- The header states the fact that forces the mocks: *"`isNative()` is always
  `false` under Vitest/Playwright"*. The real module can never deliver an event
  in a test.

**Importers — TWO production files, not one:** `useMonitorSession.ts:104` **and
`monitor/nfc/useNfcEntry.ts:26`** (called `:160`). PR 2's seam does not cover
`useNfcEntry`; three further test files mock the module for that consumer
(`nfc/useNfcEntry.test.tsx:24`, `justrow/JustRow.nfc.test.tsx:25`,
`workout/WorkoutDetail.nfc.test.tsx:41` — hoisted `vi.mock`, outside the 32 in §2).

**Both call sites in the hook, as the row says:**

- **`:5315` — the SCAN lease.** `await`ed, inside its own try/catch; a failure
  records `trace?.record("listener-registration-failed", "scan lifecycle")` and
  rethrows. Body: `if (event === "background") controller.abort();`. Its comment:
  *"the session's own lifecycle listener is registered only after GATT connect,
  further down"*.
- **`:5620` — the SESSION listener**, post-GATT. Not awaited; may be a Promise (`:5748`):
  ```ts
  const lifecycleAttempt = { cancelled: false };
  lifecycleAttemptRef.current = lifecycleAttempt;
  const lifecycleResult = registerAppLifecycleListener((event) => { … });
  if (lifecycleResult instanceof Promise) {
    void lifecycleResult.then((unsub) => {
      if (lifecycleAttempt.cancelled) { unsub(); return; }
      lifecycleUnsubRef.current = unsub;
    });
  } else { lifecycleUnsubRef.current = lifecycleResult; }
  ```
  `"background"` sets `framesWhileHiddenRef = 0` and captures
  `preBackgroundFreezeKeyRef`; `"foreground"` snapshots liveness, runs
  `decideResumeLatch(snapshot, SILENCE_THRESHOLD_MS)`, bumps `session.resumes`/
  `session.latches`, records `app-lifecycle`/`resume-frames`, and conditionally
  `transport.markSuspect()`.

**Finding not in the brief:** `:5620` has **no `.catch`** and no
`listener-registration-failed` record — unlike `:5315`. A rejected native
`addListener` is an unhandled rejection with zero ring evidence. RF19's exact
shape. The spec should say whether PR 2 closes it or files it.

## 2. The `vi.doMock` census

`grep -rn "vi.doMock" app/src/monitor | wc -l` → **94**;
`grep -rn "vi.doMock" app/src | wc -l` → **495**.

The ROADMAP's 29/32 are **appLifecycle-targeted only**, and are **exactly right**:
`grep -rn 'vi.doMock(".*appLifecycle"' app/src/monitor | wc -l` → **29** (7 files);
same over `app/src` → **32** (9 files).

`useMonitorSession.test.ts` 22 · `lifecycleReplay.test.ts` 2 · `burstReplay` 1 ·
`handoffStoreReplay` 1 · `justRowReplay` 1 · `partialReplay` 1 ·
`summaryHoldReplay` 1 = **29 / 7 files**. Plus `justrow/JustRow.test.tsx` **2**
and `adapters/appLifecycle.test.ts` **1** = **32 / 9**. Precision the row blurs:
the extra **files** are two, the extra **occurrences** are three. Neither extra
file is deleted by this change.

**The other 65 under `monitor/` are NOT appLifecycle** and PR 2 does not touch
them (`grep -rn 'vi.doMock(' monitor | grep -v appLifecycle`):
`"../adapters/monitorTransport"` 32, `"../api"` 6, `"../adapters/linkFlow"` 3,
`"../api/useWorkouts"` 2, `"../api/usePlan"` 2, `"../api/useBaselines"` 2,
multi-line `"../adapters/` 2, and 1 each of `"../platform"`,
`"../native/webAuth"`, `"../api/useRecentLogs"`, `"../api/usePreferences"`.
**No `./handoffStore` doMock exists under `monitor/`** (the 2 repo-wide hits on
`"../monitor/handoffStore"` are outside it).

**INFERENCE for the spec:** removing the appLifecycle mock does NOT remove
`vi.resetModules()` + dynamic import from the 7 replay specs — each still mocks
`"../adapters/monitorTransport"`. PR 2 retires one of two mocks per spec, not the
machinery.

## 3. The five `AxesInput` build sites

**`AxesInput` (`connectedAxes.ts:103`)** — 5 fields: `phase: ConnectedPhase`
(`:104`), `frozen: boolean` (`:106`), `runOpen: boolean` (`:110`),
`failureLeavesLinkUp: boolean | null` (`:136`), `frameSilence: boolean` (`:151`).

**The five literals (`grep -rn "failureLeavesLinkUp" app/src`) are
field-by-field IDENTICAL**, modulo interleaved comments:
```ts
{ phase: session.phase, frozen: session.frozen, runOpen: session.runOpen,
  failureLeavesLinkUp: null, frameSilence: session.frameSilence }
```
`JustRowObserver.tsx:39` (field `:43`) → `deriveAxes` ·
`JustRow.tsx:145` (`:149`) → `deriveAxes` ·
`JustRow.tsx:152` (`:156`) → **`deriveLinkLoss`** ·
`ConnectedSurface.tsx:603` (`:607`) → `deriveAxes` ·
`ConnectedInterstitial.tsx:919` (`:926`) → `deriveAxes`.

**The row does not say the fifth site is a different function.**
`deriveLinkLoss` (`:309`) returns `LinkLossAxis = "none"|"reported"|"inferred"`,
**not** a member of `ConnectedAxes`. Publishing `session.axes` retires four of
five literals; `JustRow.tsx:152` survives unless the hook also publishes the
link-loss answer or `ConnectedAxes` gains a fifth member. The spec must decide
this, or "publish once" is 4/5.

### Tests passing it non-null — THREE, not five

```
grep -n "failureLeavesLinkUp: \(true\|false\)" monitor/connectedAxes.test.ts
124:    failureLeavesLinkUp: true,
138:    failureLeavesLinkUp: false,
386:        failureLeavesLinkUp: true,
```
No other file in `app/src` passes the field at all. `grep -c` on that file → 30
lines total (27 `: null` + a local type alias `:25`).

- `:120-131` table row *"failed + failureLeavesLinkUp:true — a genuine
  ProgramRejection, link up"* → via `it.each(ROWS)`, `deriveAxes` returns
  `{link:"up", program:"failed", session:"none", activity:"unknown"}`.
- `:134-145` *"…:false — a radio/transport failure, link lost"* → `{link:"lost", …}`.
- `:380-390` `it("failed: frameSilence never overrides failureLeavesLinkUp …")`
  → `deriveLink({phase:"failed", failureLeavesLinkUp:true, frameSilence:true})`
  is `"up"`.

**Correction: three assertions, not five.** The third `failed` row (`:106`,
*"…:null — conservative, reads as lost"*) passes `null` and survives unchanged.
Deleting the field also breaks the 27 `: null` lines as excess properties — a
mechanical sweep, not an assertion change.

### `deriveAxes`'s use, and what dies

The ruling James is re-homing, verbatim (`connectedAxes.ts:127-135`):

> This is a DOCUMENTED GAP, not a defect to close here — building a consumer is
> out of scope for this task. Whoever FIRST passes a real (non-null) value
> inherits the NOT_A_MACHINE_REFUSAL-semantics ruling this axis was built
> against (a transport-side failure reads `"lost"`, a genuine `ProgramRejection`
> the PM5 itself sent reads `"up"` — `deriveLink`'s own case, above), and the
> enum-deletion spec that eventually retires `ConnectedPhase`'s `"failed"`
> member inherits this same gap: it cannot verify the `"up"` branch is reachable
> from real code either, only that the TYPE still allows it.

Sole consumer is `deriveLink` (`:168` destructure, `:199`):
`case "failed": return failureLeavesLinkUp === true ? "up" : "lost";`

**Dead branch, exactly one:** with the field always `null`, `"failed"` collapses
to an unconditional `return "lost"`, so **`link: "up"` at `phase === "failed"`
becomes unreachable**. `deriveProgram`/`deriveSession`/`deriveActivity` never
read the field. `deriveLinkLoss` is unaffected — it already maps `"failed"` to
`"reported"` and only gates on `deriveLink(input) !== "lost"`, which now always
passes at `"failed"`. `LinkAxis["up"]` stays live via the
`pairing|programming|ready|live` and `ended` cases.

**Contract that must keep holding:** `connectedAxes.test.ts:443-462` asserts
`deriveLinkLoss(i) === "none"` iff `deriveLink(i) !== "lost"` across all nine
phases × both `frameSilence` values, on a helper (`:405`) hardcoding
`failureLeavesLinkUp: null`. Semantically unchanged by the deletion.

## 4. `ConnectedPhase`

**Declared `useMonitorSession.ts:145`** (nine members; `"paused"` retired, pinned
by `@ts-expect-error` at `useMonitorSession.test.ts:9130-9135`). Used in-file at
`:954` (`MonitorSession.phase`) and `:1537` (`SessionState.phase`).

**Importers outside the hook** (`grep -rn "ConnectedPhase" app/src`):
- **Production, one:** `connectedAxes.ts:52` `import type` — needed by
  `AxesInput.phase` (`:104`) and `deriveProgram(phase: ConnectedPhase)` (`:215`).
- **Tests, five files:** `useMonitorSession.test.ts:101`,
  `ConnectedSurface.screens.test.tsx:46`/`:296`, `ConnectedSurface.test.tsx:48`/`:241`,
  `connected/ConnectionLogSheet.test.tsx:38`/`:150`, `connected/PaneGrid.test.tsx:45`/`:408`
  (all `phase: "live" as ConnectedPhase` fixtures).

**So "stop exporting `ConnectedPhase`" is not free:** the type still has to reach
`connectedAxes.ts`, five test files' casts break, and `MonitorSession.phase`
still needs a name.

**A pin governs this: `monitor/connectedPhaseReaders.test.ts`.** `ALLOWED_READERS`
(`:68`) is exactly `useMonitorSession.ts`, `connectedAxes.ts`,
`ConnectedSurface.tsx`, `ConnectedInterstitial.tsx`. It flags any other non-test
file matching `/\bConnectedPhase\b/` **or** `/session\.phase\s*===\s*"/` in
comment-stripped source — **and at `:117` asserts every allowlisted file STILL
reads**. A file that stops reading must come off the allowlist in the same PR or
the pin goes red. It bites both ways (RF21).

**`session.phase` reads a published `axes` would replace**
(`grep -rn "session\.phase" --include='*.tsx'`):
- `ConnectedInterstitial.tsx` — **11 real reads**: `:367` `"pairing"`, `:432`
  `"failed"||"disconnected"`, `:490` `"idle"`, `:492` `"picking"`, `:540`
  `"pairing"`, `:569` `"programming"`, `:824` `"failed"`, `:828` `"ready"`,
  `:934` `"disconnected" && axes.session==="none"` (+ `:920` feeding `deriveAxes`).
  This is the allowlist's "migrating debt" and where the raw enum is load-bearing.
- `ConnectedSurface.tsx` — **3**: `:376` `!== "ended" || handoffHeld`, `:381`
  effect dep, `:428` `=== "ended"` (+ `:604` feeding `deriveAxes`).
- `JustRow.tsx` and `JustRowObserver.tsx` — **zero reads**; only the forward at
  `:146`/`:153` and `:40`, plus JustRow's *"AXES, NEVER `session.phase`"* comment
  at `:140`.
- `workout/WorkoutDetail.postReleaseCommit.test.tsx:1144` holds
  `'if (session.phase !== "ended" || session.handoffHeld'` as a **source-text
  marker** — an independent pin that breaks if `ConnectedSurface.tsx:376` is
  reworded, findable by no type check.

**The hook's return (`:6450`-`:6472`) is a bare object literal, not memoized** —
`phase`, `frozen`, `runOpen`, `frameSilence` are all spread from `state` there.
A derived `axes` has an obvious home.

## 5. `replay.ts`'s `lifecycle` events and `onLifecycle`

**Produced:** `transports/recording.ts:77` —
`| { seq: number; t: number; kind: "lifecycle"; event: AppLifecycleEvent }` as a
`RecordedEvent` member; round-tripped by `recording.test.ts:78-99`.

**Consumed:** `transports/replay.ts:122` (`onLifecycle?: (event) => void`) and
`:337-343` — an undelivered lifecycle event is a **reported divergence**
(`lifecycle#N <event> not delivered (no onLifecycle handler)`), not silence;
both arms covered by `replay.test.ts:314-356`.

**How it reaches the hook TODAY** (`lifecycleReplay.test.ts:250-285`) — a mutable
closure plus a module mock, the only route there is:
```ts
let lifecycleCb: ((event: AppLifecycleEvent) => void) | undefined;
const replay = createReplayTransport(recording, { onLifecycle: (e) => lifecycleCb?.(e) });
vi.doMock("../adapters/monitorTransport", () => ({ defaultTransport: … }));
vi.doMock("../adapters/appLifecycle", () => ({
  registerAppLifecycleListener: vi.fn((cb) => { lifecycleCb = cb; return () => undefined; }) }));
vi.resetModules();
const { useMonitorSession: freshUseMonitorSession } = await import("./useMonitorSession");
```
**The ROADMAP's "cannot reach the hook at all" is too strong.** It reaches it,
by replacing the module. Accurate statement: the recording's lifecycle track has
no injectable path, so any spec wanting it also pays `resetModules` + dynamic
import — which is why all 7 replay specs carry an appLifecycle mock whether or
not they use lifecycle events (**6 of 7 mock it with a bare
`vi.fn(() => (): void => undefined)` stub — paying the cost for nothing**).

## 6. Exploration A's riders PR 2 carries

**(a) `ROWING_ACTIVE_FALLBACK_FRAMES` — CONFIRMED exported, imported by nothing.**
`grep -rn "ROWING_ACTIVE_FALLBACK_FRAMES" app/src` → 6 hits all inside
`useMonitorSession.ts` (decl `:1500`, self-use `:3178`, prose `:1334`/`:1374`/
`:1953`/`:3172`) plus **one comment mention** at `useMonitorSession.test.ts:1246`.
It is **not in that test's import list**. Exploration A's claim that each of the
six exports has `useMonitorSession.test.ts` as its "sole non-self consumer" is
**false for this one**: its non-self consumer count is **zero**.

**(b) `framesWhileHiddenRef` vs `resumeEdgeArmedRef`'s doc claim.**
`framesWhileHiddenRef` (`:2094`) writes: `:5425` `=null` (per-connect), `:5625`
`=0` (background), `:3034` `+=1` (hidden frame), `:5696` `=null` (foreground,
after read). Its own comment (`:2088`) is **accurate**.
`resumeEdgeArmedRef`'s doc (`:2095`-`:2110`) claims it *"Mirrors
`framesWhileHiddenRef`'s own 'armed here, consumed there, then cleared' lifetime
… cleared at all three of those sites"*. **The mirror claim is FALSE:**
`resumeEdgeArmedRef` has **five** clear sites (`:3065` consumed, `:4157`, `:5437`
connect, `:5894`, `:5959`) versus `framesWhileHiddenRef`'s **two**.
`framesWhileHiddenRef` gets **no** per-run discard at `program()`/
`beginFreeRow()`/the RC-37 exit, so a hidden window opened under run A survives a
fresh arm and is read by run B's foreground. Whether that matters is the lifetime
table's question; a comment asserting a mirror that does not exist is an RF18
tripwire.

**(c) `framesEverEmittedRef` — CONFIRMED no clear site.**
`grep -n "framesEverEmittedRef"` → exactly 3 hits: `:1964` `useRef(false)`,
`:3748` `= true`, `:5479` read. Its doc (`:1957`) says *"Minted at mount,
**cleared at teardown**, and NOT at `connect()`"*. **There is no teardown
clear** — it is write-once-true for the mount's life. The same comment says
*"RF27 lifetime table lives in the design spec"*; it is wrong in the file that ships.

**(d) `lifecycleUnsubRef`/`lifecycleAttemptRef` emit NOTHING on any path.**
`grep -n "lifecycleUnsubRef\|lifecycleAttemptRef" useMonitorSession.ts` → 22 hits:
decls `:2517`/`:2535`; paired cancel+unsub+null at `:4091-4095`, `:4352-4356`,
`:4506-4510`, `:5078-5083`; bare `=null` at `:5200`; mint `:5619`; assignment
`:5758` (async) and `:5761` (sync). **No `log.record` or `trace.record` at any of
them** (each site's surrounding code read). The file's only
lifecycle-registration diagnostic is the scan lease's
`trace?.record("listener-registration-failed", …)` at `:5317`, belonging to the
other call site. With 1b's missing `.catch`: a rejected native session
registration produces **zero** evidence in ring, trace, or console.

## 7. The flake row

ROADMAP `:2349-2355`: *"…`listSessionLogs()` expected length 1, got 2 … fired
once during PR1.75b's coverage runs, reported 2026-09-02, and passed on three
isolated re-runs plus the very next full coverage run. Not in that PR's diff
(last touched at a prior commit, `10b8aa94`)."*

**The length-1 assertions** (`grep -rn "listSessionLogs" useMonitorSession.test.ts`):
`:7476` (*"Same session id both times: ONE history entry, not two"*), `:7786`
(*"ONE slot. On the unfixed hook this is 2: the same trace twice, under two
ids"*), `:13993` (programDropped-at-READY exit), `:14099` + `:14110` (the
burst-linger double-`stash()` pair). Three further sites assert length **2**
deliberately: `:5667`, `:7620`.

**What can produce a second entry — bounded read, no fix proposed.**
`sessionLogHistory.ts:221` `listSessionLogs()` reads a `localStorage` ring;
`upsertSessionLog` is an identity-bound upsert:
```ts
const index = existing.findIndex((e) => e.sessionId === sessionId);
const next = index === -1 ? [entry, ...existing].slice(0, MAX_ENTRIES)
                          : existing.map((e, i) => (i === index ? entry : e));
```
So a second entry needs **two distinct `sessionId`s reaching the ring** inside
one test's window. Three producers:

1. **Cross-test leakage.** The suite's only reset is
   `beforeEach(() => { localStorage.clear(); resetHandoffStore(); })`
   (`useMonitorSession.test.ts:638-648`). A write produced by a PRIOR test's
   still-live async work — a pending `.then`, an unfired timer, an
   unmounted-but-unsettled teardown — lands after that reset with a foreign id.
   `stash()` runs from `teardown()`, reachable off the microtask queue
   (`:4996`, `:5005`), not only from `act()`.
2. **Two ids in one test.** `session.id` is minted at the GATT line (`:5411`),
   and `mintSessionId` defaults to `crypto.randomUUID()` because **nothing
   injects `createSessionId`** (§1a). Any flow reaching GATT twice legitimately
   produces two entries — the shape `:5667`/`:7620` assert deliberately.
3. **Stash ordering.** `:14099`'s own comment names the sequence (*"unmount(); //
   teardown's DEFERRED path — STEP 2's FIRST stash runs here"* … *"the linger's
   own cap fires … and the SECOND stash"*). Both share `session.id` by
   construction — **unless** the id was replaced between them. `:5200` sits in
   the block whose comment (`:5201-5210`) records the historical version of
   exactly this: *"`stash()` filed a clone of that old trace into a fresh history
   slot, once per cancelled attempt."*

**INFERENCE, tagged:** (1) is the only producer consistent with "passed on three
isolated re-runs and the next full run" — it is order- and scheduler-dependent,
which isolated re-runs cannot reproduce. (2) and (3) would fail
deterministically. No fix proposed.

## 8. Tripwires

`grep -n "unreachable\|only because\|as long as\|today" useMonitorSession.ts | wc -l` → **41**.

Ten most relevant to the lifecycle listener and the axes-bearing state, in file order:

| line | text (trimmed) | relevance |
|---|---|---|
| `:2012` | *"Reachable **only because** no surface offers Connect with a run …"* | guard held up by the current call graph |
| `:2299` | *"precondition holding it off: 'Unreachable **today only because** `onExit()` …'"* | comment quoting its own precondition — RF18's tell |
| `:4366` | *"… **today**, and the driver only OBSERVES resumption."* | inside the resume/lifecycle region |
| `:4585` | *"DEFENSIVE — **reachable only because** nothing unmounts this …"* | teardown block; the lifecycle unsub sits in it |
| `:4594` | *"Nothing does that **today**."* | same block |
| `:5046` | *"… rejection, **unreachable today**) and its `snapshot()` is undefined"* | the liveness snapshot the foreground handler reads |
| `:5133` | *"This comment used to end 'Unreachable **today only because** …'"* | a tripwire that already fired once in this file |
| `:5180`-`:5190` | *"**Reachable only because** no surface offers …"* / *"ROADMAP's R10 reconnect would arm exactly this, and then THIS CLEAR is what loses the metres"* / *"honest here **only because** no row was under way"* / *"Carries no mutation because nothing can reach it (RF21)"* | `cancel()`'s attempt-boundary block — **contains `lifecycleUnsubRef.current = null` at `:5200`** |
| `:5555` | *"as **today**, unchanged, via the existing `onDisconnect` path"* | 60 lines above the session registration |
| `:5877` | *"Instrument-only **today** (§3/§6 are measurement, no consumer, no predicate …"* | the resume instruments Exploration A's twelve refs feed |
| `:5941` | *"NEW-2 — **latent today**, since no UI path re-programs from ready"* | the per-run clear sites of §6b |

**Why this section is not decorative:** `:5200` (`lifecycleUnsubRef.current = null`)
sits inside the block whose own prose says *"ROADMAP's R10 reconnect would arm
exactly this"* and *"Carries no mutation because nothing can reach it (RF21)"*.
PR 2 adds the first injectable path to that listener, so any test the seam makes
possible is — by that comment's own admission — a **new caller of code that
currently has none**. The literal RF18 condition.
