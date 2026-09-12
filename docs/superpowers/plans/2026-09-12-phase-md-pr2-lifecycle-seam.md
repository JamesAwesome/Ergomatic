# Phase MD PR 2 — A Lifecycle Seam on `useMonitorSession`, and Publish `axes`: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the hook takes the background/foreground registrar as a dependency, and publishes `axes`/`linkLoss` once. Tests then deliver a lifecycle event by passing a function instead of replacing a module; five screens stop deriving; `AxesInput.failureLeavesLinkUp` is deleted and its ruling re-homed.

**Architecture:** two optional-dependency edits to an interface that already has ten, plus one derived field pair on the hook's return. `createTransport` widens to take the hook's own `LivenessDeps` — without that, most tests keep `vi.resetModules()` for the transport mock and the seam buys almost nothing. Nothing a rower sees changes.

**Tech Stack:** React 19 + Vite, TypeScript, Vitest (`client` = jsdom, `unit` = node), Playwright e2e.

**Spec:** `pr2-spec-draft.md` revision 2 (controller's scratchpad until the PR opens). Census: `pr2-census.md`. §7 of the spec lists its own ROADMAP deviations; §10 of THIS plan lists the spec's.

**Baseline:** every number here was measured in the throwaway worktree `.claude/worktrees/pr2-plan-scratch` at `deb50b77` (main, `#408`), run from `app/`. **The census and the spec were measured at `4aa3d132`, before PR 1 merged** — re-run anything you rely on. A number without a command beside it is a plan defect.

**Not TRIAD.** No PM final-PR gate, no Gate 0. The antagonist delta pass is folded into spec rev 2. `/harden` runs on this plan (two passes max) before Task 1.

**Ruled by James, 2026-09-12 (do not re-open):** `failureLeavesLinkUp` is deleted and the NOT_A_MACHINE_REFUSAL ruling re-homed at the hook's derivation; `linkLoss` published beside `axes`; `ConnectedPhase` stays exported; the flake row closes without a hunt; Exploration A's three riders ride this PR.

---

## Global Constraints

- **No behaviour change a rower can see. No screenshot is committed.** `git status --short docs/screenshots` must be empty at Task 7; `git checkout -- docs/screenshots/` if not.
- **Invariants, not mechanisms (spec §3):** (1) each site calls the registrar current at its OWN call time; (2) a failed session registration is one ring entry for a live attempt and silence for a cancelled one; (3) one derivation — no production file outside the hook and `connectedAxes.ts` calls `deriveAxes`/`deriveLinkLoss`; (4) the field is gone and its ruling is not; (5) no new session-scoped state.
- **Every new assertion gets a mutation that makes it fail**, and the task report states what was mutated and what the failure SAID (RF21). **Commit before every probe** and confirm with `git log -1` (RF22). A mutation must COMPILE (RF12 corollary).
- **Test invocation:** `pnpm test --project client -- <pattern>` silently runs the whole suite. For one file: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>` — this collapses signal deaths to exit 1 (RF40); **never re-run a run showing exit ≥128 or `Allocation failed`**. Read BOTH summary lines (`Test Files` and `Tests`).
- **Run `git rev-parse --show-toplevel` before every commit** and confirm it prints your worktree path. Every subagent reads `.claude/agent-briefing.md` first. Never merge, never remove the worktree.
- **Comments are not copy** (RF32), so `PM5` inside them is fine. No em-dashes are added to user-facing strings — none is touched.
- **Anything with a life after merge goes in `ROADMAP.md` at the moment it is found** (RF14), stamped `· dies YYYY-MM-DD · <why a row>`.

## Names this plan fixes (every task uses exactly these)

| Symbol | After this PR | Module |
| --- | --- | --- |
| `MonitorSessionDeps.registerAppLifecycleListener?: typeof registerAppLifecycleListener` | new optional dep; default is the static import | `useMonitorSession.ts` |
| `MonitorSessionDeps.createTransport?: (liveness: LivenessDeps) => Transport \| null \| Promise<Transport \| null>` | WIDENED from `() => …` | `useMonitorSession.ts` |
| `MonitorSession.axes: ConnectedAxes` | new, derived in the hook's return | `useMonitorSession.ts` |
| `MonitorSession.linkLoss: LinkLossAxis` | new, derived beside it | `useMonitorSession.ts` |
| `AxesInput.failureLeavesLinkUp` | DELETED | `connectedAxes.ts` |
| `ConnectedPhase` | still exported, unchanged | `useMonitorSession.ts` |
| `ROWING_ACTIVE_FALLBACK_FRAMES` | `export` dropped (rider a) | `useMonitorSession.ts` |
| `withDerivedAxes(session, overrides?)`, `type SessionWithoutAxes` | new test helper — the ONE place a hand-built `MonitorSession` fixture gets axes | `app/src/test/sessionAxes.ts` (new) |
| ring kind `lifecycle-registration-failed`, detail `"session"` | the session-registration failure record | `useMonitorSession.ts` |

**The ring kind is `lifecycle-registration-failed` / `"session"`, on `log`, not `trace`.** The spec's §4 bullet and its exit criterion 5 still carry revision 1's `listener-registration-failed` / `"session lifecycle"` / `trace?.record`; §3 invariant 2 and §9 supersede them (the trace is drained and `complete()`d before the session registration, and is `undefined` on every non-NFC connect). **Use §3's form.** RF10: this is a stated contradiction inside the spec, not a silent choice.

## The lifetime table (RF27) — nothing is minted, and here is the proof

This PR mints NO new session-scoped state. The table below is the two refs the registrar's callbacks and the new `.catch` touch, so a reviewer can check the `.catch`'s `cancelled` guard against the real clear sites rather than trusting the sentence. Line-free: find each by `grep -n 'lifecycleAttemptRef\|lifecycleUnsubRef' src/monitor/useMonitorSession.ts` (22 hits at baseline).

| State | Minted | Cleared / reset | Survives hook teardown? | Survives relaunch? | Survives re-arm (new connect, same process)? |
| --- | --- | --- | --- | --- | --- |
| `lifecycleAttempt` (the local token) | in `connect()`, immediately before the session registration; also written to `lifecycleAttemptRef.current` | never cleared as a value — a LATER attempt mints a new one and `.cancelled` is set to `true` on the previous by `fail()`/`teardown()`/`cancel()`'s attempt-boundary block | the token object outlives it; the ref may already point at a newer one | NO (module-free, per mount) | NO — a new attempt mints a new token; that is what makes `cancelled` meaningful |
| `lifecycleUnsubRef.current` | the `.then` arm (async registrar) or the synchronous assignment | the four paired cancel+unsub+null sites in `fail()`/`teardown()`/`cancel()`, plus one bare `= null` in `cancel()`'s attempt-boundary block | NO — teardown unsubscribes and nulls it | NO | NO |

**What the new `.catch` may therefore assume:** exactly what the existing `.then` arm assumes, because it reads the SAME captured `lifecycleAttempt` const (never `lifecycleAttemptRef.current`, which may already belong to a newer attempt). No third state is introduced. **Exploration A's riders (Task 6) correct two comments that describe OTHER refs' lifetimes wrongly; they change no code.**

## How this plan is executed

The controller coordinates; a fresh subagent implements each task (Sonnet for Tasks 3, 5, 6; Opus for Tasks 1, 2, 4, 7). Each task ends with a commit on `phase-md-pr2` and a report naming: the commands run and their summary lines, every mutation and what its failure said, and any place the plan contradicted what the implementer observed (RF10). **Tasks 1 and 2 are strictly sequential and both touch `useMonitorSession.ts`. Tasks 3 and 4 need Task 2 and Task 1 respectively; Task 5 needs Task 1.**

**Every prescribed block below was extracted to its real path in the scratch tree and run through `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and the named vitest files.** Where a block did not compile or a gate did not bite, the block was FIXED and §10 records what changed.

---

### Task 0: The counts, as a script

**Files:** none. Run this at baseline and again at Task 7; the PR body prints the base-vs-head diff, not a transcribed table.

- [ ] **Step 1: Save and run the census**

`app/scripts/pr2-counts.sh` is NOT created — this is a one-off. Run from `app/`:

```bash
echo "deps fields:      $(python3 -c "
import re,sys
s=open('src/monitor/useMonitorSession.ts').read()
i=s.index('export interface MonitorSessionDeps {'); j=s.index('\n}\n',i)
print(len(re.findall(r'^  [a-zA-Z]+\??:',s[i:j],re.M)))")"
echo "appLifecycle doMock stmts, monitor/: $(grep -rn 'vi.doMock("../adapters/appLifecycle"' src/monitor | grep -vE ':\s*(//|\*)' | wc -l | tr -d ' ')"
echo "appLifecycle doMock stmts, repo:     $(grep -rn 'vi.doMock(".*appLifecycle"' src | grep -vE ':\s*(//|\*)' | wc -l | tr -d ' ')"
grep -rn 'vi.doMock(".*appLifecycle"' src | grep -vE ':\s*(//|\*)' | awk -F: '{print $1}' | sort | uniq -c
echo "createTransport injection sites:     $(grep -rn '^\s*createTransport:' src --include='*.ts' --include='*.tsx' | wc -l | tr -d ' ')"
echo "  of which zero-arg:                 $(grep -rn '^\s*createTransport: () =>' src | wc -l | tr -d ' ')"
```

**Measured at `deb50b77`:** deps fields **10**; appLifecycle doMock STATEMENTS **26** under `src/monitor/` and **29** repo-wide, distributed `useMonitorSession.test.ts` 20 · six replay specs 1 each · `justrow/JustRow.test.tsx` 2 · `adapters/appLifecycle.test.ts` 1; `createTransport:` injection sites **57**, of which **55** are zero-argument. Three further raw `vi.doMock(".*appLifecycle"` hits are PROSE inside comments (`lifecycleReplay.test.ts`, and two in `useMonitorSession.test.ts`) and are excluded by the `grep -vE` — they stay, reworded to past tense at Task 7.

**Targets:** deps fields **11**; monitor/ statements **0**; repo-wide **3** (`JustRow.test.tsx` ×2 — a component test that cannot inject a hook dep — and the adapter's own test).

---

### Task 1: The lifecycle dependency, the widened transport dep, and the failure record

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts`
- Modify: `app/src/monitor/useMonitorSession.test.ts` (four new tests, one new import)

**Interfaces produced:** `MonitorSessionDeps.registerAppLifecycleListener`, the widened `createTransport`, and the ring record `lifecycle-registration-failed` / `"session"`.

- [ ] **Step 1: Failing tests first** — append the `describe("the lifecycle registrar dependency", …)` block from Step 4 to `useMonitorSession.test.ts` and add, beside the existing `import { createEventLog } from "./eventLog";`:

```ts
import * as appLifecycleModule from "../adapters/appLifecycle";
```

Run the file. Red is a COMPILE error (`registerAppLifecycleListener` is not a `MonitorSessionDeps` field). That is the red.

- [ ] **Step 2: The interface.** In `MonitorSessionDeps`, replace the one-line `createTransport?:` declaration (keep its whole existing doc comment above it) with:

```ts
  createTransport?: (
    liveness: LivenessDeps,
  ) => Transport | null | Promise<Transport | null>;
  /** Registers a background/foreground listener. Defaults to
   *  `adapters/appLifecycle`'s `registerAppLifecycleListener` (the static
   *  import above IS the default). Injected so a test delivers a lifecycle
   *  event by PASSING A FUNCTION rather than replacing the adapter module —
   *  RF19's whole class of defect enters here, and `adapters/appLifecycle.ts`'s
   *  own header records why the real module can never deliver one under
   *  Vitest (`isNative()` is always `false` there). */
  registerAppLifecycleListener?: typeof registerAppLifecycleListener;
```

**Widening is source-compatible**: a narrower function is assignable, and all 55 zero-argument `createTransport: () => …` injections keep compiling (measured — `pnpm typecheck` clean with the widened signature and no call-site edits).

- [ ] **Step 3: The three call sites.**

(a) the transport resolution — replace

```ts
      const transport = await (
        depsRef.current.createTransport ??
        (() => defaultTransport(livenessDepsRef.current))
      )();
```

with

```ts
      const transport = await (
        depsRef.current.createTransport ?? defaultTransport
      )(livenessDepsRef.current);
```

(b) the SCAN lease — replace `scanLifecycle = await registerAppLifecycleListener((event) => {` with

```ts
              scanLifecycle = await (
                depsRef.current.registerAppLifecycleListener ??
                registerAppLifecycleListener
              )((event) => {
```

(c) the SESSION registration — replace `const lifecycleResult = registerAppLifecycleListener((event) => {` with

```ts
        const lifecycleResult = (
          depsRef.current.registerAppLifecycleListener ??
          registerAppLifecycleListener
        )((event) => {
```

- [ ] **Step 4: The `.catch`.** The promise arm becomes (the `.then` body is UNCHANGED — cut and paste it):

```ts
        if (lifecycleResult instanceof Promise) {
          void lifecycleResult
            .then((unsub) => {
              // ... existing body, verbatim ...
            })
            .catch(() => {
              // A rejected registration for a LIVE attempt is one ring entry
              // and nothing else: the session is already connected and every
              // other path through it still works — only the
              // background/foreground instruments are missing, which is
              // exactly what RF19 says must be visible rather than silent.
              // Guarded by the same `cancelled` token the `.then` arm reads:
              // an attempt torn down before the native promise settled is not
              // this session's failure to report. Recorded on the session RING
              // (`log`), not the NFC attempt trace — that trace is drained into
              // this ring and `complete()`d above, and is `undefined` on every
              // non-NFC connect, so a `trace?.record` here would reach nothing.
              if (lifecycleAttempt.cancelled) return;
              log.record("lifecycle-registration-failed", "session");
            });
        } else {
          lifecycleUnsubRef.current = lifecycleResult;
        }
```

The SYNCHRONOUS arm is deliberately unchanged: a registrar that THROWS lands in `connect()`'s existing `catch` → `fail(mapRadioFailure(err))`.

- [ ] **Step 5: The four tests.** Append to `useMonitorSession.test.ts`, after the last `describe`. They use the file's existing `DEVICE_NAME`, `TWO_INTERVALS`, `createFakeTransport`, `stubRadio`, `releasingSchedule` and `flush`.

```ts
// THE LIFECYCLE SEAM (Phase MD PR 2). `MonitorSessionDeps.
// registerAppLifecycleListener` defaults to the adapter export and is read
// from `depsRef` at each of the two call sites' own call time. These four
// tests are the seam's contract; every OTHER lifecycle test in this file now
// rides it instead of `vi.doMock`ing the adapter.
describe("the lifecycle registrar dependency", () => {
  const ATTEMPT_ID = "3c1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
  const targetedRequest = {
    kind: "advertised-name" as const,
    attemptId: ATTEMPT_ID,
    exactName: DEVICE_NAME,
  };

  it("omitted, the hook calls the ADAPTER's own export — the static import IS the default", async () => {
    // No `vi.resetModules()` anywhere in this test ON PURPOSE: a reset gives
    // the hook a DIFFERENT module registry, whose `appLifecycle` namespace is
    // not the object spied on here, and the spy would then never be called
    // however correct the default was.
    const spy = vi
      .spyOn(appLifecycleModule, "registerAppLifecycleListener")
      .mockImplementation(() => () => undefined);
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
    });
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => fake,
        driverOptions: { schedule: releasingSchedule() },
      }),
    );
    await act(async () => {
      await result.current.connect();
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("a rejected SESSION registration on a LIVE attempt is exactly one ring entry, and the session carries on", async () => {
    let rejectRegistration!: (err: unknown) => void;
    const fake = createFakeTransport({
      deviceName: DEVICE_NAME,
      program: TWO_INTERVALS,
    });
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => fake,
        registerAppLifecycleListener: () =>
          new Promise<() => void>((_resolve, reject) => {
            rejectRegistration = reject;
          }),
        driverOptions: { schedule: releasingSchedule() },
      }),
    );
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.phase).toBe("pairing");

    await act(async () => {
      rejectRegistration(new Error("addListener refused"));
      await flush();
    });

    const ring = JSON.parse(result.current.exportLog()) as {
      kind: string;
      detail: string;
    }[];
    expect(
      ring
        .filter((e) => e.kind === "lifecycle-registration-failed")
        .map((e) => e.detail),
    ).toStrictEqual(["session"]);
    // Not a failure of the session: everything but the background/foreground
    // instruments still works.
    expect(result.current.phase).toBe("pairing");
  });

  // The CANCELLED twin is the same test with two edits, written out in full
  // in the file: the title becomes "a rejected SESSION registration for a
  // CANCELLED attempt is silent — no ring entry"; a second
  // `await act(async () => { await result.current.cancel(); });` goes between
  // the connect and the rejection; and the final assertion becomes
  // `expect(ring.filter((e) => e.kind === "lifecycle-registration-failed"))
  // .toStrictEqual([])`. Everything else is identical.

  it("each site calls the registrar current at ITS OWN call time — a rerender between the scan lease and the session registration is harmless", async () => {
    const calls: string[] = [];
    let releaseScan!: () => void;
    const scanTarget = vi.fn(
      () =>
        new Promise<DiscoveredMonitor[]>((resolve) => {
          releaseScan = () => resolve([{ id: "x", name: DEVICE_NAME }]);
        }),
    );
    // Two STABLE consts, hoisted out of the render callback (the test rule
    // invariant 1 names): a closure minted inside `renderHook`'s callback
    // would be a new function on every commit, which says nothing about
    // which one each site read.
    const first = (): (() => void) => {
      calls.push("first");
      return () => undefined;
    };
    const second = (): (() => void) => {
      calls.push("second");
      return () => undefined;
    };
    const { result, rerender } = renderHook(
      (dep: MonitorSessionDeps["registerAppLifecycleListener"]) =>
        useMonitorSession({
          createTransport: () => ({ ...stubRadio({}), scanTarget }),
          registerAppLifecycleListener: dep,
          driverOptions: { schedule: releasingSchedule() },
        }),
      {
        initialProps:
          first as MonitorSessionDeps["registerAppLifecycleListener"],
      },
    );

    await act(async () => {
      void result.current.connect(targetedRequest);
      await flush();
    });
    // The scan lease is registered and the scan is still pending.
    expect(calls).toStrictEqual(["first"]);

    rerender(second as MonitorSessionDeps["registerAppLifecycleListener"]);
    await act(async () => {
      releaseScan();
      await flush();
    });

    // Site two read `depsRef.current` at ITS time, so it got the NEW value.
    // Nothing else diverged: the session still reached pairing.
    expect(calls).toStrictEqual(["first", "second"]);
    expect(result.current.phase).toBe("pairing");
  });
});
```

- [ ] **Step 6: Gates, commit, then the four mutations**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/monitor/useMonitorSession.test.ts
git rev-parse --show-toplevel   # must print your worktree
git add -A && git commit -m "Inject the app-lifecycle registrar, and record a failed session registration"
git log -1 --oneline
```

Expected: `Test Files 1 passed`, `Tests 322 passed` (318 + 4). Then, each against the committed tree, reverting with `git checkout -- src/monitor/useMonitorSession.ts` after each (safe: the file is clean, RF22):

| # | Mutation | Measured failure |
| --- | --- | --- |
| 1 | In the `.catch`, replace `if (lifecycleAttempt.cancelled) return;` + the `log.record(...)` line with a bare `return;` | `a rejected SESSION registration on a LIVE attempt…` → `AssertionError: expected [] to strictly equal [ 'session' ]` (1 failed, 3 passed) |
| 2 | Delete only `if (lifecycleAttempt.cancelled) return;` from the `.catch` | `…for a CANCELLED attempt is silent` → `AssertionError: expected [ { seq: 4, …(3) } ] to strictly equal []` (1 failed, 3 passed) |
| 3 | Revert site (c) to the bare `registerAppLifecycleListener((event) => {` | THREE fail; the two-sites one says `AssertionError: expected [ 'first' ] to strictly equal [ 'first', 'second' ]` |
| 4 | At site (c) replace the `?? registerAppLifecycleListener` fallback with `?? ((): (() => void) => () => undefined)` | `omitted, the hook calls the ADAPTER's own export` → `AssertionError: expected "registerAppLifecycleListener" to be called at least once` (1 failed, 3 passed) |

---

### Task 2: Publish `axes` and `linkLoss`; delete `failureLeavesLinkUp`

**These are ONE commit, not two.** Measured: the derivation does not typecheck until the field is gone (`Property 'failureLeavesLinkUp' is missing in type … but required in type 'AxesInput'`), and deleting the field first leaves 30 lines of `connectedAxes.test.ts` red with nothing publishing yet.

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts`, `app/src/monitor/connectedAxes.ts`, `app/src/monitor/connectedAxes.test.ts`
- Modify (the five sites): `app/src/monitor/JustRowObserver.tsx`, `app/src/justrow/JustRow.tsx`, `app/src/workout/ConnectedSurface.tsx`, `app/src/workout/ConnectedInterstitial.tsx`
- Create: `app/src/test/sessionAxes.ts`
- Modify (fixture builders, NINE files): `JustRow.test.tsx`, `JustRowRefusal.test.tsx`, `ConnectedSurface.test.tsx`, `ConnectedSurface.screens.test.tsx`, `ConnectedInterstitial.test.tsx`, `connected/PaneGrid.test.tsx`, `connected/ConnectionLogSheet.test.tsx`, `WorkoutDetail.test.tsx`, `you/readyCardSeam.test.tsx`

- [ ] **Step 1: `connectedAxes.ts` — delete the field.** Delete `failureLeavesLinkUp: boolean | null;` and its whole doc comment from `AxesInput`; drop the name from `deriveLink`'s destructure; replace the `failed` case body with:

```ts
    case "failed":
      // UNCONDITIONALLY `"lost"`. This case used to read
      // `failureLeavesLinkUp === true ? "up" : "lost"`; that input was `null`
      // at every call site that ever existed, so the `"up"` branch was live
      // code with no live caller, and the field was deleted (James,
      // 2026-09-12). The NOT_A_MACHINE_REFUSAL ruling it carried did NOT die
      // with it — it is re-homed at `useMonitorSession.ts`'s own axes
      // derivation, the only place a real value could ever be produced.
      return "lost";
```

In the file header, the opening clause "the FOUR facts the hook does not publish on its own" becomes "the THREE facts `ConnectedPhase` does not carry", and the whole `failureLeavesLinkUp` clause inside that sentence is deleted. Do NOT touch "WHAT THE CALLER MAKES OF THESE FOUR" (four AXES, a different four) beyond disambiguating it to "THESE FOUR AXES".

In `deriveLinkLoss`'s doc, the last paragraph becomes:

```
 *  Exported as its own reader rather than added to `ConnectedAxes` because
 *  the axes tuple CANNOT answer it: `lost|none|none|unknown` is produced both
 *  by `pairing` + `frameSilence` (`"inferred"`) and by `disconnected`
 *  (`"reported"`), and conflating those two is the Phase RN Gate 0 defect.
 *  (An earlier version of this sentence said "because exactly one screen
 *  needs it"; that reason is superseded — `useMonitorSession` publishes
 *  `linkLoss` beside `axes` for every screen now, Phase MD PR 2.) */
```

- [ ] **Step 2: the hook publishes.** Add to the imports, beside the `registerAppLifecycleListener` import:

```ts
import {
  deriveAxes,
  deriveLinkLoss,
  type ConnectedAxes,
  type LinkLossAxis,
} from "./connectedAxes";
```

(The reverse edge is `import type { ConnectedPhase }`, erased at build — the cycle is type-only and `pnpm build` is clean.)

Add to `MonitorSession`, right after `phase: ConnectedPhase;`:

```ts
  /** The four axes, derived once here (Phase MD PR 2). Screens read THIS,
   *  never `phase` — `connectedAxes.ts`'s header says why, and
   *  `connectedPhaseReaders.test.ts` enforces both halves. */
  axes: ConnectedAxes;
  /** Who said the link was gone, when `axes.link` is `"lost"`. Separate from
   *  `axes` because the axes tuple cannot answer it — see the derivation
   *  site at the bottom of this hook. */
  linkLoss: LinkLossAxis;
```

Immediately before the hook's `return {` (a bare object literal, not memoised):

```ts
  // THE ONE DERIVATION SITE (Phase MD PR 2). Five screens used to rebuild
  // this input object field-for-field and call `deriveAxes` themselves; they
  // read `session.axes` now, and `connectedPhaseReaders.test.ts`'s second
  // scan is what keeps a sixth from appearing.
  //
  // `linkLoss` is published BESIDE `axes` rather than folded into it because
  // it is NOT a function of the axes tuple: `lost|none|none|unknown` is
  // produced both by `pairing` + `frameSilence` (`linkLoss: "inferred"`) and
  // by `disconnected` (`"reported"`). Conflating those two is the Phase RN
  // Gate 0 defect — offering a reconnect that cannot run, because nothing
  // was disposed on the inferred path. `connectedAxes.ts`'s own sentence
  // ("exported as its own reader ... because exactly one screen needs it")
  // is superseded: one derivation site beats one narrow shape.
  //
  // THE NOT_A_MACHINE_REFUSAL RULING, re-homed here from
  // `AxesInput.failureLeavesLinkUp`'s doc comment when that field was
  // deleted (James, 2026-09-12). The field was `null` at every call site
  // that ever existed, so `deriveLink`'s `failed` case returned `"lost"`
  // unconditionally in practice and the `"up"` branch was live code with no
  // live caller; the branch is gone. The ruling it encoded survives, and
  // this is the only place a real value could ever be produced: a
  // transport-side failure reads `"lost"`, and a genuine `ProgramRejection`
  // the PM5 itself sent reads `"up"`. Whoever first needs that distinction
  // classifies `ConnectedError.reason` HERE and widens `deriveLink` again —
  // see `ConnectedInterstitial.tsx`'s NOT_A_MACHINE_REFUSAL markers for what
  // the distinction is for.
  const axesInput = {
    phase: state.phase,
    frozen: state.frozen,
    runOpen: state.runOpen,
    frameSilence: state.frameSilence,
  };
```

and inside the returned literal, after `phase: state.phase,`:

```ts
    axes: deriveAxes(axesInput),
    linkLoss: deriveLinkLoss(axesInput),
```

**The phrase `NOT_A_MACHINE_REFUSAL RULING, re-homed here` must survive on ONE line** — it is Task 7's pin, and a pin whose phrase wraps across two comment lines can never match (measured: the spec's own proposed phrase returned 0 against this exact comment).

- [ ] **Step 3: the five sites.** Each becomes `const axes = session.axes;` (and, in `JustRow.tsx`, `const linkLoss = session.linkLoss;`), and each file drops its now-unused `import … from "…/connectedAxes"`. Sweep the surrounding comments in the same edit — three of them argue about `failureLeavesLinkUp: null` and are now false:
  - `JustRow.tsx`'s "AXES, NEVER `session.phase`" paragraph → `// AXES, NEVER \`session.phase\` — and the hook derives them now (Phase MD` / `// PR 2), so this screen reads them rather than rebuilding the input.` **A LEADING-line comment, deliberately** (Task 3's detector strips whole-line `//` and `/* */` only; a trailing `// …` on a code line survives and would trip the scan).
  - `ConnectedSurface.tsx`'s eleven-line `failureLeavesLinkUp: null` paragraph → four lines: the axes are the hook's now, and `"failed"` still never reaches this component because `ConnectedInterstitial.tsx`'s phase gate renders its own screen.
  - `ConnectedInterstitial.tsx`'s three-line "Always `null` here" comment is deleted outright.

- [ ] **Step 4: the fixture helper** — `app/src/test/sessionAxes.ts`, verbatim:

```ts
// THE ONE PLACE A TEST FIXTURE GETS ITS AXES (Phase MD PR 2).
//
// `MonitorSession.axes`/`linkLoss` are derived by the hook from four fields
// the same object carries, so a hand-built fixture that sets them
// independently can say `phase: "disconnected"` and `axes.link: "up"` in one
// breath — a session no production code can produce. Every `session()`
// builder under `src/` runs its own defaults through this helper instead, so
// the two halves cannot drift; a test that genuinely wants an impossible
// pairing passes it explicitly as an override and says why.
import { deriveAxes, deriveLinkLoss } from "../monitor/connectedAxes";
import type { MonitorSession } from "../monitor/useMonitorSession";

export type SessionWithoutAxes = Omit<MonitorSession, "axes" | "linkLoss">;

export function withDerivedAxes(
  session: SessionWithoutAxes,
  overrides: Partial<Pick<MonitorSession, "axes" | "linkLoss">> = {},
): MonitorSession {
  const input = {
    phase: session.phase,
    frozen: session.frozen,
    runOpen: session.runOpen,
    frameSilence: session.frameSilence,
  };
  return {
    ...session,
    axes: overrides.axes ?? deriveAxes(input),
    linkLoss: overrides.linkLoss ?? deriveLinkLoss(input),
  };
}
```

- [ ] **Step 5: the nine fixture builders.** Five of them (`ConnectedSurface.test.tsx`, `ConnectedInterstitial.test.tsx`, `connected/PaneGrid.test.tsx`, `connected/ConnectionLogSheet.test.tsx`, `JustRowRefusal.test.tsx`) share ONE shape. The rule, with that shape as the worked example:

```ts
function session(overrides: Partial<MonitorSession> = {}): MonitorSession {
  const { axes, linkLoss, ...rest } = overrides;
  const base: SessionWithoutAxes = {
    phase: "live" as ConnectedPhase,
    /* ... every existing default, unchanged ... */
    ...rest,
  };
  return withDerivedAxes(base, { axes, linkLoss });
}
```

The other four are variations: `ConnectedSurface.screens.test.tsx` and `you/readyCardSeam.test.tsx` build a literal with no overrides object (wrap the literal in `withDerivedAxes({ … })`); `WorkoutDetail.test.tsx`'s `baseSession` takes `Partial<Session>` and follows the shape above.

**`justrow/JustRow.test.tsx` is the one the compiler cannot catch, and it needs three separate fixes:**
1. Its `mockSession(overrides: Record<string, unknown>)` types the overrides as `unknown`, so **`pnpm typecheck` stays GREEN while every render throws** `TypeError: Cannot read properties of undefined (reading 'link')`. Retype the parameter `Partial<MonitorSession>` so the compiler becomes the gate (RF33).
2. Retyping surfaces that the mock has **never carried `undecodable`** — add `undecodable: false`.
3. **The destructure must live INSIDE the `useMonitorSession: () => …` factory, not above the `vi.doMock` call.** Several tests hand `mockSession` a MUTABLE object and edit it between rerenders; reading `overrides` once freezes the session at its first phase. Measured cost of getting this wrong: **18 failing tests**, all passing again once it moved. Write the comment saying so.

- [ ] **Step 6: `connectedAxes.test.ts`.** Delete the `failureLeavesLinkUp` field from the local `Row` interface; delete the two table rows whose names begin `failed + failureLeavesLinkUp:true` and `…:false`; rename the surviving one to `"failed — always lost; the link-up branch died with its input"`; delete every remaining `failureLeavesLinkUp: …,` line (27 of them) and the name from the `it.each` destructure and its `deriveAxes({…})` argument; replace the `it("failed: frameSilence never overrides failureLeavesLinkUp…")` test with:

```ts
  it("failed: frameSilence changes nothing — the case returns lost either way", () => {
    expect(
      deriveLink({
        phase: "failed",
        frozen: false,
        runOpen: false,
        frameSilence: true,
      }),
    ).toBe("lost");
  });
```

The `deriveLinkLoss ⇔ deriveLink` contract test stays and still holds (its helper already hardcoded `null`).

- [ ] **Step 7: Gates, commit, mutation**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client --project unit
git rev-parse --show-toplevel && git add -A && git commit -m "Publish axes and linkLoss from the hook, and delete failureLeavesLinkUp" && git log -1 --oneline
```

Expected: green. **`Tests 8119 passed | 1 skipped` across `Test Files 290 passed` was measured on the FINAL scratch tree** (Tasks 1, 2, 3, 4, 6 and three of Task 5's blocks); the count at the end of Task 2 alone is lower by Task 3's four cases. Read both summary lines rather than matching a number.

**Mutation:** in the hook's `axesInput`, swap `frozen: state.frozen` for `frozen: false`. Run `ConnectedSurface.test.tsx` and `JustRow.test.tsx`; both must go red on the frozen/paused surface. Record the message. (RF2: also read the per-file coverage rows for `sessionAxes.ts` and `connectedAxes.ts` at Task 7 — the 90×4 gate is an aggregate and will not notice a new file's uncovered branch.)

---

### Task 3: The readers pin gets a second scan

**Files:** Modify `app/src/monitor/connectedPhaseReaders.test.ts`.

- [ ] **Step 1: The scan.** After the existing `STRUCTURAL_READ` constant:

```ts
/** THE SECOND SCAN (Phase MD PR 2). `useMonitorSession` publishes
 *  `session.axes`/`session.linkLoss` now, so there is exactly ONE derivation
 *  site; before this PR five screens each rebuilt the input and called
 *  `deriveAxes`/`deriveLinkLoss` themselves. These two files are the only
 *  ones allowed to call either: the hook (which derives) and the module
 *  (which defines them and calls `deriveLink` from `deriveLinkLoss`). */
const AXES_DERIVERS = new Set([
  "monitor/useMonitorSession.ts",
  "monitor/connectedAxes.ts",
]);

const DERIVE_CALL = /\bderive(Axes|LinkLoss)\(/;

/** `src/test/` is test SCAFFOLDING that `productionSourceFiles()` returns
 *  anyway, because its files do not end in `.test.ts`. `test/sessionAxes.ts`
 *  derives on purpose — it is how every hand-built `MonitorSession` fixture
 *  gets axes that agree with its own phase. Scoped here rather than inside
 *  `productionSourceFiles()` so the ConnectedPhase sweep above keeps the
 *  exact reach it had before this PR. */
const SCAFFOLD_PREFIX = "test/";
```

- [ ] **Step 2: Four cases**, inserted before the existing "does not fire on ordinary prose" test — the sweep, its no-dead-entries mirror, a positive detector case, and a prose case in the shape Task 2 actually writes:

```ts
  it("nothing outside the hook and connectedAxes.ts derives the axes — screens read session.axes", () => {
    const offenders: string[] = [];
    for (const rel of productionSourceFiles()) {
      if (AXES_DERIVERS.has(rel)) continue;
      if (rel.startsWith(SCAFFOLD_PREFIX)) continue;
      const stripped = commentStrippedSource(
        readFileSync(join(ROOT, rel), "utf-8"),
      );
      if (DERIVE_CALL.test(stripped)) offenders.push(rel);
    }
    expect(offenders).toStrictEqual([]);
  });

  it("every axes-deriver actually derives — that allowlist has no dead entries either", () => {
    for (const rel of AXES_DERIVERS) {
      const stripped = commentStrippedSource(
        readFileSync(join(ROOT, rel), "utf-8"),
      );
      expect([rel, DERIVE_CALL.test(stripped)]).toStrictEqual([rel, true]);
    }
  });

  it("the derive detector fires on a new caller, not just on the two owners", () => {
    const newOffender = `
      function draw(session) {
        const axes = deriveAxes({ phase: session.phase });
        return axes.link;
      }
    `;
    expect(DERIVE_CALL.test(commentStrippedSource(newOffender))).toBe(true);
  });

  it("the derive detector does not fire on prose naming deriveAxes in a leading-line comment", () => {
    // `commentStrippedSource` strips whole-line `//` and `/* */` ONLY — a
    // TRAILING `// ...` on a code line survives. Every replacement pointer
    // comment this PR writes is therefore a LEADING-line comment, and this
    // case is the shape that proves the stripper handles it.
    const prose = `
      // The axes come from the hook now — see deriveAxes(input) there.
      /** deriveLinkLoss(input) lives beside it. */
      export const x = 1;
    `;
    expect(DERIVE_CALL.test(commentStrippedSource(prose))).toBe(false);
  });
```

- [ ] **Step 3: Run, commit, mutate.** Expect `Test Files 1 passed`, `Tests 8 passed` (4 existing + 4). Commit, then re-add a `deriveAxes({ phase: session.phase, frozen: session.frozen, runOpen: session.runOpen, frameSilence: session.frameSilence })` call in `JustRow.tsx` in place of `const axes = session.axes;` and re-run.

**Measured:** `AssertionError: expected [ 'justrow/JustRow.tsx' ] to strictly equal []`, 1 failed | 7 passed. Revert with `git checkout -- src/justrow/JustRow.tsx`.

**Also check the FIRST pin still holds**: `ConnectedSurface.tsx` survives the allowlist's no-dead-entries test on exactly one line (`if (session.phase === "ended")`) and `ConnectedInterstitial.tsx` on eleven. Task 2 removes neither. Green in the scratch tree.

---

### Task 4: The seam test — `lifecycleReplay.test.ts` off both mocks

**Files:** Modify `app/src/monitor/lifecycleReplay.test.ts`. This is the test the ROADMAP says cannot be written today, and it starts upstream of the producer (RF24): a recording's own `lifecycle` track → the hook's production handler → the hook's ring.

- [ ] **Step 1: The harness.** In `runReplay`, replace the whole `vi.doMock` / `vi.resetModules` / dynamic-import / `freshUseMonitorSession` block with:

```ts
  // THE SEAM (Phase MD PR 2). Both halves of this harness are DEPENDENCIES
  // now — the transport and the lifecycle registrar — so a recording's
  // `lifecycle` track reaches the production handler with no module mock, no
  // `vi.resetModules()`, and no dynamic re-import. `createTransport` receives
  // the hook's own `LivenessDeps` (the same value `defaultTransport` gets in
  // production), which is what lets the decorator's clock be rebound to the
  // replay clock through the dep instead of by replacing the adapter.
  const { result } = renderHook(() =>
    useMonitorSession({
      now: () => FIXED_NOW,
      createTransport: (liveness: LivenessDeps) =>
        withLiveness(replay.transport, {
          ...liveness,
          now: () => replay.clock.now(),
          schedule: (fn, ms) => replay.clock.schedule(fn, ms),
        }),
      registerAppLifecycleListener: (cb: (e: AppLifecycleEvent) => void) => {
        lifecycleCb = cb;
        return () => undefined;
      },
      driverOptions: {
        now: () => replay.clock.now(),
        schedule: releasingSchedule((cb, ms) => replay.clock.schedule(cb, ms)),
      },
    }),
  );
```

Change `import type { RunIdentity } from "./useMonitorSession";` to `import { useMonitorSession, type RunIdentity } from "./useMonitorSession";`, and cut the `afterEach` down to `vi.restoreAllMocks(); localStorage.clear();` — both `doUnmock`s and the `resetModules` go.

- [ ] **Step 2: The file's header.** Its bullet "unit tests — they `vi.doMock(...)`, replacing the very seam that was wrong" and its "Harness idiom follows `burstReplay.test.ts` … `vi.doMock` + `vi.resetModules()` + dynamic re-import" sentence both become past tense, naming the dep. These are two of the three PROSE hits Task 0's `grep -vE` excludes.

- [ ] **Step 3: Run, commit, mutate.** Expect `Test Files 1 passed`, `Tests 3 passed`.

**Mutation (measured):** revert the hook's session registration to the bare static `registerAppLifecycleListener(...)` call. Two of three tests fail with `AssertionError: expected [] to have a length of 1 but got +0` — the `app-lifecycle` ring entries the recording carries never arrive. Restore.

---

### Task 5: Port the remaining mocks — 20 hook blocks and 5 replay specs

**Files:** Modify `app/src/monitor/useMonitorSession.test.ts` (20 statements) and `burstReplay.test.ts`, `handoffStoreReplay.test.ts`, `justRowReplay.test.ts`, `partialReplay.test.ts`, `summaryHoldReplay.test.ts` (1 each). **By hand, test block by test block, never by regex** — every block's `vi.fn((cb) => { … })` body is the dep's value and some return a Promise.

**THE RULE:** for each block, (i) move the mock factory's function body into `registerAppLifecycleListener:` on the `renderHook` deps object; (ii) if the block also mocks `"../adapters/monitorTransport"`, move THAT factory's body into `createTransport: (liveness: LivenessDeps) => …`; (iii) drop `freshUseMonitorSession` for the statically imported `useMonitorSession`; (iv) **keep `vi.resetModules()` + the dynamic import ONLY if a THIRD module is still mocked in that block, and say in the task report which module and which block.** **Measured against main:** a third module IS mocked in exactly two of the seven files — `justRowReplay.test.ts` (`../api`, `../api/useWorkouts`, `../api/useBaselines`, `../api/usePlan`, `../api/usePreferences`, `../api/useRecentLogs`) and `summaryHoldReplay.test.ts` (`../api`, `../api/useWorkouts`, `../api/useBaselines`, `../api/usePlan`) — via

```bash
for f in src/monitor/useMonitorSession.test.ts src/monitor/{burst,handoffStore,justRow,lifecycle,partial,summaryHold}Replay.test.ts; do
  echo "== $f"; grep -n 'vi.doMock(' "$f" | grep -vE ':\s*(//|\*)' | grep -vE 'appLifecycle|monitorTransport'
done
```

Those two **keep `vi.resetModules()` + the dynamic import** if the `../api*` mocks share a block with the lifecycle one; the implementer checks and says which. Every other block — all 20 in `useMonitorSession.test.ts` and the other four replay specs — loses the machinery entirely. **Criterion 1 is unaffected either way**: it counts appLifecycle statements, and those reach 0 in `src/monitor` regardless. The spec's "all 26 after" phase-exit metric is therefore an OVERCOUNT and is restated as "24 of 26 blocks reach a lifecycle event or a replay transport with no `resetModules`; two keep it for `../api*` and are named".

Three worked examples, each ported and run in the scratch tree:

- **A hook block with only the lifecycle mock** — `"Task 1 (lost-monitor design spec): resume records frames seen while hidden…"`. The nine mock lines plus `vi.resetModules()` plus the dynamic import collapse to four lines inside the existing deps object:

```ts
    let lifecycleCb: ((event: "background" | "foreground") => void) | undefined;
    /* ...the existing `const fake = createFakeTransport({...})`... */
    const { result } = renderHook(() =>
      useMonitorSession({
        createTransport: () => fake,
        registerAppLifecycleListener: (cb) => {
          lifecycleCb = cb;
          return () => undefined;
        },
        driverOptions: { /* unchanged */ },
      }),
    );
```

- **A hook block that also mocks the transport** — `"PHASE LM, THE FIX AT THE HOOK LEVEL: …"`. Its `mockDefaultTransport` local and the `vi.doMock("../adapters/monitorTransport", …)` disappear into the widened dep; the comment explaining why the REAL decorator is composed moves with it:

```ts
    const { result } = renderHook(() =>
      useMonitorSession({
        // The REAL decorator, composed exactly as `defaultTransport` does —
        // so the snapshot the resume handler reads is the production one.
        // `createTransport` receives the hook's own `LivenessDeps`, which is
        // why replacing `../adapters/monitorTransport` is no longer needed.
        createTransport: (liveness: LivenessDeps) =>
          withLiveness(fake, liveness),
        registerAppLifecycleListener: (cb) => {
          lifecycleCb = cb;
          return () => undefined;
        },
        driverOptions: { schedule: releasingSchedule() },
      }),
    );
```

  This exact head (`mockDefaultTransport` + both doMocks + reset + dynamic import) occurs **three times verbatim** in `useMonitorSession.test.ts` and in a near-identical form at fourteen more `mockDefaultTransport` sites — port each one, do not sed them.

- **A replay spec** — Task 4's `lifecycleReplay.test.ts`. The other five follow it; six of the seven replay-spec mocks are a bare `vi.fn(() => (): void => undefined)` stub that was paying `resetModules` for nothing.

- [ ] **Step 1-25:** one commit per file is fine; `useMonitorSession.test.ts` may be one commit. After each file: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`, read BOTH summary lines.
- [ ] **Step 26: The count.** Re-run Task 0's census. `src/monitor` must read **0**; repo-wide **3**. Name the three in the report.

**Measured partial result** (3 hook blocks + `lifecycleReplay.test.ts` ported in the scratch tree): monitor/ `26 → 22`, repo-wide `29 → 25`, `Tests 322 passed` in the hook file and `3 passed` in the replay spec. The remaining delta is 17 hook blocks + 5 replay specs.

---

### Task 6: Exploration A's three riders, and the comment sweep

**Files:** Modify `app/src/monitor/useMonitorSession.ts` only. No behaviour changes; all three are comment or visibility edits.

- [ ] **(a)** `export const ROWING_ACTIVE_FALLBACK_FRAMES = 5;` → `const …`. Zero importers (`grep -rn 'ROWING_ACTIVE_FALLBACK_FRAMES' src` returns only in-file hits plus one comment mention in `useMonitorSession.test.ts` that is NOT in its import list). `pnpm typecheck` and `pnpm lint` both clean after the change.
- [ ] **(b)** `resumeEdgeArmedRef`'s doc claims to mirror `framesWhileHiddenRef`'s lifetime. It mirrors the ARMING pattern, not the clear sites (five versus two). Replace the claim with the ARMING-only reading, plus the fact that `framesWhileHiddenRef`'s absent per-run clear is DELIBERATE — it reaches exactly one `resume-frames` ring string with one test consumer and no predicate, and the first real consumer of `resume-frames` inherits the question. Say that in the comment so the next reader does not re-open it.
- [ ] **(c)** `framesEverEmittedRef`'s doc says "Minted at mount, cleared at teardown". There is no teardown clear (`grep -n 'framesEverEmittedRef'` → three hits: the `useRef(false)`, one `= true`, one read). Its lifetime is the MOUNT; say so, say the old sentence was wrong, and delete its "RF27 lifetime table lives in the design spec" line — this plan's table is where it lives.
- [ ] **(d) The sweep** (agent-briefing, "grep for comments describing what you just changed"): `grep -rn 'failureLeavesLinkUp\|deriveAxes\|deriveLinkLoss\|registerAppLifecycleListener' src --include='*.ts' --include='*.tsx' | grep -E ':\s*(//|\*)'` and reconcile every hit or state why it stands. Also `docs/design/DEVIATIONS.md` (RF9) — it documents current state.
- [ ] **Step: gates and commit.** `pnpm typecheck && pnpm lint && pnpm format:check`, then `--project client --project unit`.

---

### Task 7: ROADMAP, the exit criteria, the full gate, the PR

**Files:** Modify `ROADMAP.md`.

- [ ] **Step 1: ROADMAP.** (a) Tick `- [ ] **PR 2 …**` to `- [x]` and append `**LANDED as PR #<n>** — one dep, one derivation site; N appLifecycle doMocks retired (see the PR's counts).` (b) In the same row, correct the three figures the spec's §7 already lists as wrong (29/32 → 26/29 STATEMENTS; five `AxesInput` sites → four for `deriveAxes` and one for `deriveLinkLoss`; "stop exporting `ConnectedPhase`" → NOT done, with the one-sentence reason). (c) The `listSessionLogs()` flake row: close it as *"mechanism bounded to cross-test leakage through the suite's single `beforeEach` reset (INFERENCE); unreproduced; re-opens on the next firing"* — **no hunt is run**, because a filtered re-run removes the very producers the mechanism needs and a timer-flushing `afterEach` would mutate a file carrying 28 `useFakeTimers` calls. (d) Exploration B's row already says "Runs after PR 2, never before" — leave it, but give it a `dies` date if it has none (campsite rule). (e) Any row this PR touches that carries no `· dies YYYY-MM-DD · <why>` gets one.

- [ ] **Step 2: The exit criteria, as commands.** Run each from the repo root and paste the ACTUAL output into the PR's Record block.

```bash
# 1. the mocks
grep -rn 'vi.doMock("../adapters/appLifecycle"' app/src/monitor | grep -vE ':\s*(//|\*)' | wc -l   # → 0
grep -rn 'vi.doMock(".*appLifecycle"' app/src | grep -vE ':\s*(//|\*)' | awk -F: '{print $1}' | sort | uniq -c   # → 3, in 2 files, both named in the PR body

# 2. the field is gone; the ruling is not
grep -rn 'failureLeavesLinkUp' app/src ROADMAP.md | grep -vE ':\s*(//|\*)'   # → EMPTY
grep -rn 'failureLeavesLinkUp' app/src | grep -E ':\s*(//|\*)'               # → exactly 2 comment lines, both historical, both named in the PR body
grep -c 'NOT_A_MACHINE_REFUSAL RULING, re-homed here' app/src/monitor/useMonitorSession.ts   # → 1  (0 on main — verified)

# 3. one derivation site
grep -rnE '\bderive(Axes|LinkLoss)\(' app/src --include='*.ts' --include='*.tsx' \
  | grep -v '\.test\.' \
  | grep -vE '^app/src/(monitor/(useMonitorSession|connectedAxes)\.ts:|test/)'   # → EMPTY on this branch; FIVE hits on main (JustRowObserver, JustRow ×2, ConnectedInterstitial, ConnectedSurface)
```

**All three criteria as the spec wrote them are WRONG and are corrected here (RF10), each measured:** (1) the spec's count is right but its `wc -l` on the repo-wide form hides WHICH files survive — print the distribution; (2) the spec's `grep … → empty` cannot be satisfied, because the re-homed ruling and `deriveLink`'s new comment both NAME the field they replaced (that is what "prefixed with when and why it moved" requires), so the criterion is "no non-comment occurrence, and exactly two comment ones"; and the spec's phrase pin `'a genuine .ProgramRejection. the PM5 itself sent reads'` **returns 0 against the prescribed comment** because the phrase wraps across two lines — the one-line `NOT_A_MACHINE_REFUSAL RULING, re-homed here` replaces it; (3) the spec's path filter misses `app/src/test/sessionAxes.ts`, the new fixture helper, which derives on purpose.

- [ ] **Step 3: The full gate (RF1 — this diff touches `app/src/`)**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test                 # all three projects; integration needs Docker
pnpm test:coverage        # read the per-file rows for sessionAxes.ts, connectedAxes.ts, useMonitorSession.ts (RF2)
pnpm e2e                  # the full suite locally; READ the result. Then read the e2e job on the PR.
git status --short docs/screenshots   # must be EMPTY
gh run list --branch phase-md-pr2 --limit 1 --json headSha,conclusion   # headSha == git rev-parse HEAD, conclusion == success (RF39)
```

`pnpm e2e` was NOT run by the plan author (a full compose boot per invocation); everything else in this list was, at every task. **`app/src/` changed, so a full e2e run whose result someone READ is not optional** — run it here.

Re-run Task 1's four mutations, Task 3's and Task 4's against the FINAL tree (RF31/RF35) and record the outputs.

- [ ] **Step 4: The PR.** `gh pr create` from `phase-md-pr2`. Line one: **"This PR makes the app going to the background an input tests can pass in, and gives the four axes one home."** Then ≤6 bullets: what a test can now do that it could not; the five screens that stopped deriving; the dead field that went and where its ruling lives; the three comment riders; tester impact = **none**; how to try it = there is nothing to try. Then a collapsed `<details>` **"Record (for agents and audits)"** with: the Task 0 base-vs-head counts; every mutation verbatim; the three corrected exit-criterion commands and their real output; the lifetime table's headline (no new state); the spec §4-versus-§3 ring-kind contradiction and which was used; the e2e run URL and conclusion; per-file coverage. Then the hand-back: **Proposed to add** and **Now overdue** (`grep -n 'dies 20' ROADMAP.md`, oldest first) in ONE message, and STOP.

---

## 10. Where the plan contradicts what was observed (RF10)

Every item below was measured in the scratch tree; each changed a prescribed block or a criterion.

1. **The census and spec were measured at `4aa3d132`; main is `deb50b77`** (PR 1 landed in between). The appLifecycle counts survive unchanged; re-run anything else.
2. **`useMonitorSession.test.ts` has 20 doMock STATEMENTS, not 22** (the census's 22 includes two prose lines). 20 + six replay specs = the spec's correct 26.
3. **SIX replay specs carry an appLifecycle mock, not seven.** `liveDropSeamReplay` and `structureWatchSessionReplay` carry none, and neither do `captureReplay`, `connectedMetricsReplay`, `oracleCorpusReplay`, `recordReplay.roundtrip`, `registerReplay`, `structureWatchReplay`.
4. **The spec contradicts itself on the ring record.** §4 and exit criterion 5 say `listener-registration-failed` / `"session lifecycle"` via `trace?.record`; §3 invariant 2 and §9 say `lifecycle-registration-failed` / `"session"` via `log.record`. The plan uses §3's.
5. **Adding two REQUIRED fields to `MonitorSession` breaks NINE hand-built fixtures, which the spec does not mention.** Eight are caught by `pnpm typecheck`. **`justrow/JustRow.test.tsx` is not**, because its mock's overrides are typed `Record<string, unknown>` — the suite compiled green and 18 tests threw at render. It also turned out to be missing `undecodable` entirely, and to depend on reading its overrides object LAZILY (tests mutate it between rerenders). Task 2 Step 5 carries all three.
6. **`src/test/sessionAxes.ts` is a new file the spec does not name.** Without it every fixture can assert a phase and an axes tuple that disagree.
7. **Exit criterion 2 as written cannot be satisfied** — see Task 7 Step 2. Its phrase pin also cannot match a wrapped comment line: the spec's proposed phrase greps to 0 against the exact comment the spec asks for.
8. **Exit criterion 3's path filter misses the new helper**; `app/src/test/` must be excluded, and the structural scan needs the same skip with its reason written down (scoped to the NEW scan only, so the existing `ConnectedPhase` sweep keeps its exact reach).
9. **The derivation and the field deletion cannot be separate commits** — the publication does not typecheck until the field is gone.
10. **A ring assertion cannot use `toStrictEqual` on `{kind, detail}`** — entries carry `seq` and `atMs`. Map to `detail` first (cost: one red test).
11. **`DiscoveredMonitor` has no `rssi`** — the two-sites test's scan result is `{ id, name }`.
12. **The hook imports `connectedAxes.ts`, which type-imports `ConnectedPhase` back.** The cycle is type-only and erased; `pnpm typecheck`, `pnpm lint` and the full client+unit suite are clean. Say so in the PR rather than leaving a reviewer to find it.
13. **Two replay specs mock a THIRD module** (`justRowReplay.test.ts` and `summaryHoldReplay.test.ts`, both `../api*`), so the spec's "all 26 blocks after" exit metric is an overcount — 24, with the two named. Criterion 1 is unaffected.
14. **`createTransport` has 57 injection sites, 55 zero-argument**, and all compile unchanged under the widened signature (the spec's figure of 41 predates PR 1).

## Self-review (done by the author before /harden)

- **Spec coverage:** §1 nothing to build; §2 census re-measured against `deb50b77` (Task 0, with corrections in §10); §3 invariants 1-5 → Task 1 Step 5's four tests (1, 2), Task 3's scan (3), Task 2 Step 2's comment plus Task 7's phrase pin (4), the lifetime table (5); §4 every bullet → Tasks 1, 2, 5, 6, with the ring-kind contradiction ruled; §5 every test → Tasks 1, 3, 4, 5; §6 criteria 1-7 → Task 7 Steps 2-4, three of them corrected; §7 deviations carried into Task 7 Step 1; §8 James's rulings honoured, none re-opened.
- **Paste-testing:** every block above was extracted to its real path and run. `pnpm typecheck`, `pnpm lint` and `pnpm format:check` are clean; `--project client --project unit` is `290 files / 8119 passed, 1 skipped`. Six mutations were RUN, not predicted, and their measured messages are in the tables.
- **Not paste-tested:** the 17 remaining hook blocks and 5 replay specs of Task 5 (three representatives were ported instead, and the rule is written from them), `pnpm e2e`, and `pnpm test:coverage`.
- **No line-number citations into this document, and no self-describing bookkeeping** — every count carries its command.
