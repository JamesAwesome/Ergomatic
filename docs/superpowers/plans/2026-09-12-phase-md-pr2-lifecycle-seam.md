# Phase MD PR 2 — A Lifecycle Seam on `useMonitorSession`, and Publish `axes`: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the hook takes the background/foreground registrar as a dependency, and publishes `axes`/`linkLoss` once. Tests then deliver a lifecycle event by passing a function instead of replacing a module; five screens stop deriving; `AxesInput.failureLeavesLinkUp` is deleted and its ruling re-homed.

**Architecture:** two optional-dependency edits to an interface that already has ten, plus one derived field pair on the hook's return. `createTransport` widens to take the hook's own `LivenessDeps` — without that, most tests keep `vi.resetModules()` for the transport mock and the seam buys almost nothing. Nothing a rower sees changes.

**Tech Stack:** React 19 + Vite, TypeScript, Vitest (`client` = jsdom, `unit` = node), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-12-lifecycle-seam-and-axes-design.md` revision 2.3. Census: `docs/superpowers/audits/2026-09-12-architecture-walk/pr2-census.md`. §7 of the spec lists its own ROADMAP deviations; §10 of THIS plan lists the spec's.

**Baseline:** every number here was measured in a throwaway worktree `.claude/worktrees/pr2-plan-scratch`, run from `app/` — revision 1's numbers at `deb50b77` (main, `#408`), revision 2's re-measurements at `3fc49767` (main, `#409`). Every count below was re-run at `3fc49767` and none moved. **The census and the spec were measured at `4aa3d132`, before PR 1 merged** — re-run anything you rely on. A number without a command beside it is a plan defect.

**Not TRIAD.** No PM final-PR gate, no Gate 0. The antagonist delta pass is folded into spec rev 2. `/harden` runs on this plan (two passes max) before Task 1.

**Revision 2 (this document), after `/harden` lens 1.** What changed and why:
- **Task 2 Step 7's mutation was decoration and is replaced (F1, BLOCKING).** It named `ConnectedSurface.test.tsx` and `JustRow.test.tsx`, neither of which drives the real hook — one builds `session()` as a PROP, the other `vi.doMock`s the hook. And every ported screen fixture goes through `withDerivedAxes`, which calls the same `deriveAxes`/`deriveLinkLoss` the hook calls, so it would agree with any bug (RF11). After the old Task 2 NOTHING asserted `result.current.axes`, and `linkLoss` had no probe at all. Step 7 now adds HAND-WRITTEN literal tuples to two existing real-hook blocks, with two measured mutations.
- **Task 2 Step 5's `JustRow.test.tsx` fix now annotates the RETURN, not the parameter (F2).** The hazard was the unannotated base literal returned from the doMock factory — which is exactly how `undecodable` went missing.
- **The lifetime table's ref count and clear-site owners are corrected (F3),** and both the table and the `.catch`'s own comment now say what a mid-session link DROP means for a late rejection.
- **Task 5's title, rule (i) and rule (iv) are corrected (F4, F7),** and the "0 of 26 / 24 of 26" per-block figure is deleted everywhere — 26 is a STATEMENT count and three of the statements live in shared helpers.
- **Task 3's scaffold skip is one NAMED FILE, not a directory prefix (F5),** and the no-dead-entries case now iterates it too, so an unused skip fails red.
- **Task 2's one-commit reason was false and is replaced with the true one (F6),** measured.
- Bookkeeping: Task 3's comment about why `connectedAxes.ts` matches the detector; "six of six" replay specs; a clause that `axes`/`linkLoss` land on `MonitorSession`, not `MonitorSessionDeps`.

**Revision 3 (this document), after `/harden` lens 2 — the LAST fold; the hardening loop stops here.** What changed and why:
- **Task 3's `DERIVE_CALL` was too narrow (F1).** `connectedAxes.ts` exports SIX derivers over `AxesInput`, not two; a screen calling `deriveLink` or `deriveActivity` directly would have walked straight past the scan. The regex now covers all six, and exit criterion 3's raw grep gains the comment filter it now needs.
- **`withDerivedAxes` failed open on a HALF override (F2).** It now throws, with a test and a measured mutation.
- **Two prescribed gate commands could not be run (F3, F7).** `src/test/**` is in vitest's coverage `exclude`, so "read `sessionAxes.ts`'s per-file coverage" was unrunnable; and Task 3's second mutation cast to a type `sessionAxes.ts` does not import.
- **Task 4 dropped isolation without replacing it (F4).** Losing `vi.resetModules()` leaves each replay writing hand-off receipts through the module singleton; a `beforeEach` with two real resets goes in.
- **Task 2 Step 3's `ConnectedSurface.tsx` comment claimed a single parent (F5).** `JustRow.tsx` is a second, with no phase gate. The unreachability sentence goes; the case is unconditional now and needs no argument.
- **`.catch` discarded the rejection's cause, and that was never a decision anyone made (F9).** RULED: record it. The detail becomes `session: <cause>` and the expectation a prefix match; mutation 1 re-measured.
- **Stale citations and counts (F6, F8, bookkeeping):** the spec's ring kind is reconciled at rev 2.2, so this plan's contradiction instructions go; `MonitorSession` has 22 members; `ConnectedInterstitial.tsx` has 10 comment-stripped `session.phase ===` reads, not 11.

**Ruled by James, 2026-09-12 (do not re-open):** `failureLeavesLinkUp` is deleted and the NOT_A_MACHINE_REFUSAL ruling re-homed at the hook's derivation; `linkLoss` published beside `axes`; `ConnectedPhase` stays exported; the flake row closes without a hunt; Exploration A's three riders ride this PR.

---

## Global Constraints

- **No behaviour change a rower can see. No screenshot is committed.** `git status --short docs/screenshots` must be empty at Task 7; `git checkout -- docs/screenshots/` if not.
- **Invariants, not mechanisms (spec §3):** (1) each site calls the registrar current at its OWN call time; (2) a failed session registration is one ring entry for a live attempt and silence for a cancelled one; (3) one derivation — no file outside the hook, `connectedAxes.ts` and the named fixture scaffold `src/test/sessionAxes.ts` calls `deriveAxes`/`deriveLinkLoss`; (4) the field is gone and its ruling is not; (5) no new session-scoped state.
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
| ring kind `lifecycle-registration-failed`, detail `` `session: ${String(err)}` `` | the session-registration failure record — it names the SITE and the CAUSE (spec rev 2.3's invariant 2) | `useMonitorSession.ts` |

**The ring kind is `lifecycle-registration-failed`, the detail is `` `session: ${String(err)}` ``, and it goes on `log`, not `trace`.** The trace is drained and `complete()`d before the session registration and is `undefined` on every non-NFC connect, so a `trace?.record` there would reach nothing. Spec rev 2.2 reconciled this wording in §4 and exit criterion 5; there is no longer a form to choose between.

## The lifetime table (RF27) — nothing is minted, and here is the proof

This PR mints NO new session-scoped state. The table below is the two refs the registrar's callbacks and the new `.catch` touch, so a reviewer can check the `.catch`'s `cancelled` guard against the real clear sites rather than trusting the sentence. Find each by `grep -c 'lifecycleAttemptRef\|lifecycleUnsubRef' src/monitor/useMonitorSession.ts` — **25** at both `deb50b77` and `3fc49767` (revision 1 said 22, carried from the census; re-measured).

| State | Minted | Cleared / reset | Survives hook teardown? | Survives relaunch? | Survives re-arm (new connect, same process)? |
| --- | --- | --- | --- | --- | --- |
| `lifecycleAttempt` (the local token) | in `connect()`, immediately before the session registration; also written to `lifecycleAttemptRef.current` | never cleared as a value — a LATER attempt mints a new one, and `.cancelled` is set to `true` on the previous by each of the four paired sites below | the token object outlives it; the ref may already point at a newer one | NO (module-free, per mount) | NO — a new attempt mints a new token; that is what makes `cancelled` meaningful |
| `lifecycleUnsubRef.current` | the `.then` arm (async registrar) or the synchronous assignment | the FOUR paired `cancelled = true` + unsub + `= null` sites, which live in `handleEvent` (twice — the disconnect and the machine-end arms), `teardown` and `fail`; plus one bare `= null` in **`connect()`**'s attempt-boundary block. **`cancel()` holds none of them** | NO — teardown unsubscribes and nulls it | NO | NO |

**One shape neither arm covers, recorded and NOT changed here:** a registrar promise that never settles at all. At the SCAN lease the call is `await`ed, so `connect()` hangs there; at the session registration neither `.then` nor `.catch` ever runs, so `lifecycleUnsubRef.current` stays `null` and that attempt's listener is never unsubscribed on teardown. Both are pre-existing — the `await` and the un-awaited promise are unchanged by this PR — and the new dependency makes the shape *reachable in a test* for the first time without making it more likely in production. Named so the next reader does not think the `.catch` closed it.

**The consequence the `.catch` inherits, said out loud:** two of the four `cancelled = true` sites are in `handleEvent`, so a **mid-session link DROP marks the attempt cancelled**. A registration rejection that lands after a drop is therefore SILENT, deliberately — the session it would have instrumented is already over. That is the intended reading of invariant 2, not a gap in it, and the `.catch`'s own comment says so.

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

**Targets:** deps fields **11** — the one new field is `registerAppLifecycleListener`; `axes` and `linkLoss` land on `MonitorSession` (the hook's RETURN), not on `MonitorSessionDeps`, and this count never sees them; monitor/ statements **0**; repo-wide **3** (`JustRow.test.tsx` ×2 — a component test that cannot inject a hook dep — and the adapter's own test).

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
            .catch((err: unknown) => {
              // A rejected registration for a LIVE attempt is one ring entry
              // and nothing else: the session is already connected and every
              // other path through it still works — only the
              // background/foreground instruments are missing, which is
              // exactly what RF19 says must be visible rather than silent.
              // Guarded by the same `cancelled` token the `.then` arm reads:
              // an attempt torn down before the native promise settled is not
              // this session's failure to report — and note that TWO of the
              // four `cancelled = true` sites are in `handleEvent`, so a
              // mid-session link DROP silences a late rejection on purpose:
              // the session it would have instrumented is already over.
              // Recorded on the session RING
              // (`log`), not the NFC attempt trace — that trace is drained into
              // this ring and `complete()`d above, and is `undefined` on every
              // non-NFC connect, so a `trace?.record` here would reach nothing.
              // The CAUSE rides the detail (`String(err)`): a registration
              // that rejects on a device is a platform-sourced failure with
              // nothing else observing it (RF19), and an entry that says only
              // WHERE it happened sends the next reader back to the phone.
              if (lifecycleAttempt.cancelled) return;
              log.record(
                "lifecycle-registration-failed",
                `session: ${String(err)}`,
              );
            });
        } else {
          lifecycleUnsubRef.current = lifecycleResult;
        }
```

The SYNCHRONOUS arm is deliberately unchanged: a registrar that THROWS lands in `connect()`'s existing `catch` → `fail(mapRadioFailure(err))`.

- [ ] **Step 5: The five tests.** Append to `useMonitorSession.test.ts`, after the last `describe`. They use the file's existing `DEVICE_NAME`, `TWO_INTERVALS`, `createFakeTransport`, `stubRadio`, `releasingSchedule` and `flush`. The fifth (`withDerivedAxes`'s half-override refusal) lands here because this is where the helper is imported anyway, and it needs Task 2 Step 4's file — write it in Task 1 and let it be RED until then, or move it into Task 2; say which in the report.

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

  it("a rejected SESSION registration on a LIVE attempt is exactly one ring entry naming the cause, and the session carries on", async () => {
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
    // A PREFIX match, not an equality: the detail carries the rejection's
    // own `String(err)` after `session: `, and pinning that text would pin a
    // platform's message rather than our own record.
    const details = ring
      .filter((e) => e.kind === "lifecycle-registration-failed")
      .map((e) => e.detail);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatch(/^session: /);
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

  it("withDerivedAxes refuses a HALF override — axes and linkLoss travel together", () => {
    // The helper's one enforced rule, gated where the helper is already
    // imported. `base` is any complete `SessionWithoutAxes` — reuse this
    // file's own fixture shape rather than inventing another.
    expect(() =>
      withDerivedAxes(base, {
        axes: {
          link: "up",
          program: "armed",
          session: "live",
          activity: "moving",
        },
      }),
    ).toThrow(/override axes and linkLoss together or neither/);
    expect(() => withDerivedAxes(base, { linkLoss: "reported" })).toThrow(
      /override axes and linkLoss together or neither/,
    );
    expect(() => withDerivedAxes(base)).not.toThrow();
  });

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

- [ ] **Step 6: Gates, commit, then the mutations**

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
| 1 | In the `.catch`, replace `if (lifecycleAttempt.cancelled) return;` + the whole `log.record(...)` call with `void err; return;` (keeps the parameter used under `noUnusedParameters`) | `a rejected SESSION registration on a LIVE attempt…` → `AssertionError: expected [] to have a length of 1 but got +0` (1 failed, 3 passed). **The detail this test's green path actually produced, measured: `session: Error: addListener refused`.** |
| 2 | Delete only `if (lifecycleAttempt.cancelled) return;` from the `.catch` | `…for a CANCELLED attempt is silent` → `AssertionError: expected [ { seq: 4, …(3) } ] to strictly equal []` (1 failed, 3 passed) |
| 3 | Revert site (c) to the bare `registerAppLifecycleListener((event) => {` | THREE fail; the two-sites one says `AssertionError: expected [ 'first' ] to strictly equal [ 'first', 'second' ]` |
| 4 | At site (c) replace the `?? registerAppLifecycleListener` fallback with `?? ((): (() => void) => () => undefined)` | `omitted, the hook calls the ADAPTER's own export` → `AssertionError: expected "registerAppLifecycleListener" to be called at least once` (1 failed, 3 passed) |
| 4b | Delete the half-override `throw` from `src/test/sessionAxes.ts` (Task 2 Step 4 writes it; run this once that step has landed) | `withDerivedAxes refuses a HALF override` → `AssertionError: expected [Function] to throw an error` |

---

### Task 2: Publish `axes` and `linkLoss`; delete `failureLeavesLinkUp`

**These are ONE commit, and revision 1's reason for that was FALSE (RF36 — a commit message is a claim about its own diff).** The field deletion IS a green standalone commit: `connectedAxes.ts` + Step 6's test rewrite + one deleted `failureLeavesLinkUp: null,` line at each of the five sites, measured at `3fc49767` — `pnpm typecheck` clean, `Test Files 26 passed / Tests 924 passed` over `connectedAxes.test.ts`, `src/justrow`, `src/workout` and `JustRowObserver.test.tsx`. **The real reason to keep one commit is that splitting edits the five call sites TWICE** — once to delete the line, once to replace the whole call with `session.axes`. The commit message says what the commit does; it does not claim the split was impossible.

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
  - `ConnectedSurface.tsx`'s eleven-line `failureLeavesLinkUp: null` paragraph → **two lines saying only that the axes are the hook's now**. **Do NOT re-assert that `"failed"` cannot reach this component.** The old paragraph credited `ConnectedInterstitial.tsx`'s phase gate as if it were the only parent; `JustRow.tsx` renders `ConnectedSurface` too and has no phase gate (there it is `axes.session === "none"` plus `program === "failed"` that keep a failed session out). Naming one parent and one reason is the false half. And the argument is moot: `deriveLink`'s `failed` case is unconditional after Step 1, so there is no branch left whose unreachability needs defending.
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
// pairing passes BOTH explicitly and says why.
//
// "Every builder goes through this" is a CONVENTION, not something this
// module can enforce — nothing stops a new fixture writing `axes:` by hand.
// What IS enforced is that a caller cannot override HALF the pair: the two
// fields are one answer about one session, and a hand-written `axes` beside a
// derived `linkLoss` is a combination the hook cannot publish.
import { deriveAxes, deriveLinkLoss } from "../monitor/connectedAxes";
import type { MonitorSession } from "../monitor/useMonitorSession";

export type SessionWithoutAxes = Omit<MonitorSession, "axes" | "linkLoss">;

export function withDerivedAxes(
  session: SessionWithoutAxes,
  overrides: Partial<Pick<MonitorSession, "axes" | "linkLoss">> = {},
): MonitorSession {
  if ((overrides.axes === undefined) !== (overrides.linkLoss === undefined)) {
    throw new Error(
      "withDerivedAxes: override axes and linkLoss together or neither — a half-override is a pair the hook cannot publish",
    );
  }
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
1. **Annotate the RETURN of the doMock factory, not just the parameter.** `mockSession(overrides: Record<string, unknown>)` is untyped, so `pnpm typecheck` stays GREEN while every render throws `TypeError: Cannot read properties of undefined (reading 'link')`. But retyping the PARAMETER alone leaves the real hazard: the base object literal the factory returns has no contextual type, which is exactly how the mock came to be **missing `undecodable` entirely**. Annotate the return, so every one of `MonitorSession`'s **22** members is required and the compiler is the gate (RF33). The mock carries 21 today; `undecodable` is the missing one.
2. **The destructure must live INSIDE the factory, not above the `vi.doMock` call.** Several tests hand `mockSession` a MUTABLE object and edit it between rerenders; reading `overrides` once freezes the session at its first phase. Measured cost of getting this wrong: **18 failing tests**, all passing again once it moved.

Both, in one shape — and it goes through `withDerivedAxes` like every other fixture:

```ts
  function mockSession(overrides: Partial<MonitorSession>) {
    vi.resetModules();
    vi.doMock("../adapters/keepAwake", () => ({ keepAwakeOn, keepAwakeOff }));
    // The destructure happens INSIDE the factory, on every render: several
    // tests below hand this function a MUTABLE object and then edit it
    // between rerenders, so reading `overrides` once here would freeze the
    // session at its first phase. The `: MonitorSession` return annotation is
    // what makes the base literal's 22 members REQUIRED — without it the
    // literal has no contextual type, which is how `undecodable` went
    // missing (RF33).
    vi.doMock("../monitor/useMonitorSession", () => ({
      useMonitorSession: (): MonitorSession => {
        const { axes, linkLoss, ...rest } = overrides;
        return withDerivedAxes(
          {
            phase: "idle",
            undecodable: false,
            /* ...the other 20 existing defaults, unchanged... */
            ...rest,
          },
          { axes, linkLoss },
        );
      },
    }));
  }
```

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

- [ ] **Step 7: The two real-hook assertions (F1 — this is where `axes` and `linkLoss` are actually gated)**

**Nothing in Steps 1-6 gates the published values.** Every ported screen fixture runs through `withDerivedAxes`, which calls the SAME `deriveAxes`/`deriveLinkLoss` the hook calls, so it agrees with any bug (RF11); `ConnectedSurface.test.tsx` builds `session()` as a PROP (its only `renderHook` is `useSurfaceSwipe`); and `JustRow.test.tsx` `vi.doMock`s the hook outright. The gate has to be in `useMonitorSession.test.ts`, on the real hook, written as LITERALS by hand.

Two existing blocks already drive the hook to the two states that matter. Add to each, beside its existing assertion:

In the frozen block (the one titled *"four frozen frames publish frozen:true; the next change clears it — phase never leaves live"*), at the transition where it asserts `result.current.frozen).toBe(true)` for the first time:

```ts
    // THE PUBLISHED TUPLE, written out by hand (Phase MD PR 2). Never
    // `deriveAxes(...)` in an expectation — that is the same function the
    // hook calls, so it would agree with any bug (RF11). This is the ONLY
    // place the real hook's `axes`/`linkLoss` are asserted at a freeze.
    expect(result.current.axes).toStrictEqual({
      link: "up",
      program: "armed",
      session: "live",
      activity: "frozen",
    });
    expect(result.current.linkLoss).toBe("none");
```

In the frame-silence block (the one titled *"a suppressed stream trips the REAL watchdog, latching frameSilence while phase stays live — End then stores link-lost, not rower"*), after its `expect(result.current.frameSilence).toBe(true)`:

```ts
    // The published tuple at frame silence, by hand (Phase MD PR 2): the
    // watchdog demotes a live-looking link to `"lost"`, and `linkLoss` says
    // NOBODY TOLD US — the distinction the axes tuple cannot carry, and the
    // one Phase RN's Gate 0 defect turned on.
    expect(result.current.axes).toStrictEqual({
      link: "lost",
      program: "armed",
      session: "live",
      activity: "moving",
    });
    expect(result.current.linkLoss).toBe("inferred");
```

**Both tuples were MEASURED against the real hook, not reasoned** — the axis is called `activity`, not `freeze`. Between them the two literals pin all four axes off two different `link` values, both `linkLoss` answers that a live session can produce, and the two fields (`frozen`, `frameSilence`) that the hook forwards into the derivation.

- [ ] **Step 8: Gates, commit, mutations**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client --project unit
git rev-parse --show-toplevel && git add -A && git commit -m "Publish axes and linkLoss from the hook, and delete failureLeavesLinkUp" && git log -1 --oneline
```

Expected: green. **`Tests 8119 passed | 1 skipped` across `Test Files 290 passed` was measured on the FINAL scratch tree** (Tasks 1, 2, 3, 4, 6 and three of Task 5's blocks); the count at the end of Task 2 alone is lower by Task 3's four cases. Read both summary lines rather than matching a number.

**Two mutations, both against `src/monitor/useMonitorSession.ts`, both RUN and both measured. Run each from the committed tree and revert with `git checkout --` (RF22).**

| # | Mutation | Measured failure |
| --- | --- | --- |
| 5 | In `axesInput`, swap `frozen: state.frozen` for `frozen: false` | the frozen block fails: `AssertionError: expected { link: 'up', program: 'armed', …(2) } to strictly equal { … }`, whose diff is exactly `- "activity": "frozen"` / `+ "activity": "moving"` (1 failed \| 317 passed) |
| 6 | Replace `linkLoss: deriveLinkLoss(axesInput)` with `linkLoss: "reported" as LinkLossAxis` | TWO fail: the silence block `AssertionError: expected 'reported' to be 'inferred'`, the frozen block `expected 'reported' to be 'none'` (2 failed \| 316 passed) |

**If mutation 6 comes back GREEN, the PR does not ship.** `linkLoss` is published on the strength of one argument — that the axes tuple cannot distinguish `pairing`+silence from `disconnected` — and a field with no biting probe is decoration that retires the suspicion (RF21). Fix the gate before Task 3, do not file it.

(RF2: read the per-file coverage row for `connectedAxes.ts` at Task 7 — the 90×4 gate is an aggregate and will not notice an uncovered branch in a file you touched. **There is no coverage row for `sessionAxes.ts` and asking for one is an unrunnable instruction**: `vitest.config.ts`'s coverage `exclude` lists `"src/test/**"`, so the helper is never instrumented. Its gate is the half-override test and its mutation, not a percentage.)

---

### Task 3: The readers pin gets a second scan

**Files:** Modify `app/src/monitor/connectedPhaseReaders.test.ts`.

- [ ] **Step 1: The scan.** After the existing `STRUCTURAL_READ` constant:

```ts
/** THE SECOND SCAN (Phase MD PR 2). `useMonitorSession` publishes
 *  `session.axes`/`session.linkLoss` now, so there is exactly ONE derivation
 *  site; before this PR five screens each rebuilt the input and called
 *  `deriveAxes`/`deriveLinkLoss` themselves. These two files are the only
 *  ones allowed to match: the hook, which CALLS them, and the module, which
 *  matches on its own `export function derive…(` DEFINITIONS — the detector
 *  cannot tell a definition from a call, and does not need to. */
const AXES_DERIVERS = new Set([
  "monitor/useMonitorSession.ts",
  "monitor/connectedAxes.ts",
]);

/** ALL SIX derivers `connectedAxes.ts` exports over `AxesInput` —
 *  `deriveLink`, `deriveProgram`, `deriveSession`, `deriveActivity`,
 *  `deriveAxes`, `deriveLinkLoss` — not just the composed pair. The four
 *  sub-derivations are exported so each `never` guard is independently
 *  reachable from a test (that module's own comment says why), which also
 *  means a screen could call one directly and walk straight past a narrower
 *  pattern. Measured at `3fc49767`: outside the two owners and the five call
 *  sites this PR removes, the widened pattern's only hits are two PROSE
 *  mentions, both stripped by `commentStrippedSource`. */
const DERIVE_CALL = /\bderive(?:Axes|Link(?:Loss)?|Program|Session|Activity)\(/;

/** ONE NAMED FILE, never a directory prefix. `productionSourceFiles()`
 *  returns everything under `src/test/` because those files do not end in
 *  `.test.ts`, and that directory holds REAL harnesses a screen could import
 *  (`statusSubscriptions.ts`, `renderedCopy.ts`, `cssView.ts`) — exempting
 *  the whole prefix would let a second deriver appear there unseen.
 *  `test/sessionAxes.ts` derives on purpose: it is how every hand-built
 *  `MonitorSession` fixture gets axes that agree with its own phase. Scoped
 *  here rather than inside `productionSourceFiles()` so the ConnectedPhase
 *  sweep above keeps the exact reach it had before this PR. */
const AXES_SCAFFOLD = new Set(["test/sessionAxes.ts"]);
```

- [ ] **Step 2: Four cases**, inserted before the existing "does not fire on ordinary prose" test — the sweep, its no-dead-entries mirror, a positive detector case, and a prose case in the shape Task 2 actually writes:

```ts
  it("nothing outside the hook, connectedAxes.ts and the fixture helper derives the axes", () => {
    const offenders: string[] = [];
    for (const rel of productionSourceFiles()) {
      if (AXES_DERIVERS.has(rel) || AXES_SCAFFOLD.has(rel)) continue;
      const stripped = commentStrippedSource(
        readFileSync(join(ROOT, rel), "utf-8"),
      );
      if (DERIVE_CALL.test(stripped)) offenders.push(rel);
    }
    expect(offenders).toStrictEqual([]);
  });

  it("every deriver and the one scaffold entry actually derive — no dead entries", () => {
    // The scaffold entry is iterated TOO: a skip that stops being needed
    // must fail red, or it is exactly the silent dead weight the sweep above
    // exists to prevent.
    for (const rel of [...AXES_DERIVERS, ...AXES_SCAFFOLD]) {
      const stripped = commentStrippedSource(
        readFileSync(join(ROOT, rel), "utf-8"),
      );
      expect([rel, DERIVE_CALL.test(stripped)]).toStrictEqual([rel, true]);
    }
  });

  it("the derive detector fires on a new caller, not just on the owners", () => {
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

**Second mutation — the scaffold skip must be able to go dead.** In `src/test/sessionAxes.ts`, replace the two `?? deriveAxes(input)` / `?? deriveLinkLoss(input)` expressions with hardcoded literals: `{ link: "up", program: "none", session: "none", activity: "unknown" }` and `"none"`. **No `as ConnectedAxes` cast** — that name is not imported there (`sessionAxes.ts` imports only `deriveAxes`, `deriveLinkLoss` and the `MonitorSession` type), and adding one would leave the two function imports unused under `noUnusedLocals`, so the probe would fail to COMPILE rather than fail the test (RF12's corollary). The `MonitorSession` return type types both literals contextually; verified with `pnpm typecheck`. **Measured:** `AssertionError: expected [ 'test/sessionAxes.ts', false ] to strictly equal [ 'test/sessionAxes.ts', true ]`, 1 failed | 7 passed. Revert.

**Also check the FIRST pin still holds**: on comment-stripped source `ConnectedSurface.tsx` matches `session.phase === "` on exactly **1** line and `ConnectedInterstitial.tsx` on **10** (measured at `3fc49767` by running `commentStrippedSource`'s own two regexes over both files — an earlier "eleven" counted a raw-text hit). Task 2 removes neither. Green in the scratch tree.

**And say in the mirror's own comment that one of its three rows cannot go red:** `connectedAxes.ts` matches `DERIVE_CALL` on its own `export function derive…(` definitions, so that row is true by construction as long as the module exists. Two of the three rows — the hook's and the scaffold's — are genuinely falsifiable, and the scaffold row is the one the Step 3 mutation drives.

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

Change `import type { RunIdentity } from "./useMonitorSession";` to `import { useMonitorSession, type RunIdentity } from "./useMonitorSession";`.

- [ ] **Step 1b: replace the isolation that `vi.resetModules()` was providing.** Losing it is not free: each replay drives a full session that writes `store-receipt:commit-accepted`, `handoff-hold` and `handoff-released` through `handoffStore.ts`'s module SINGLETON, and today every test in this file got its own copy of that module. `localStorage.clear()` alone does not reset the store's in-memory `current`/`tombstones` (`resetForTests`'s own doc comment says so, and `useMonitorSession.test.ts`'s global `beforeEach` exists for exactly this reason). The connection-attempt trace's `latest` has no reset here at all. So:

```ts
import { resetForTests as resetHandoffStore } from "./handoffStore";
import { resetConnectionAttemptTraceForTests } from "./nfc/connectionAttemptTrace";
```

and inside the `describe`, beside the trimmed `afterEach`:

```ts
  beforeEach(() => {
    // The isolation `vi.resetModules()` used to give this file (Phase MD
    // PR 2): every replay writes hand-off receipts through `handoffStore`'s
    // module singleton, and the connection-attempt trace's `latest` is
    // process-wide. Both are reset per test now, explicitly.
    resetHandoffStore();
    resetConnectionAttemptTraceForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
```

Both symbol names are real (`handoffStore.ts` exports `resetForTests`; `nfc/connectionAttemptTrace.ts` exports `resetConnectionAttemptTraceForTests`), the alias matches `useMonitorSession.test.ts`'s own import, and `beforeEach` joins the `vitest` import list. The old `afterEach`'s two `doUnmock`s and its `resetModules` go. **Paste-tested: `Test Files 1 passed`, `Tests 3 passed`.**

- [ ] **Step 2: The file's header.** Its bullet "unit tests — they `vi.doMock(...)`, replacing the very seam that was wrong" and its "Harness idiom follows `burstReplay.test.ts` … `vi.doMock` + `vi.resetModules()` + dynamic re-import" sentence both become past tense, naming the dep. These are two of the three PROSE hits Task 0's `grep -vE` excludes.

- [ ] **Step 3: Run, commit, mutate.** Expect `Test Files 1 passed`, `Tests 3 passed`.

**Mutation (measured):** revert the hook's session registration to the bare static `registerAppLifecycleListener(...)` call. Two of three tests fail with `AssertionError: expected [] to have a length of 1 but got +0` — the `app-lifecycle` ring entries the recording carries never arrive. Restore.

---

### Task 5: Port the remaining mocks — 17 `it` blocks, 3 shared setup helpers, 5 replay specs

**26 is a STATEMENT count, and statements are not blocks.** Three of `useMonitorSession.test.ts`'s twenty statements live in shared setup helpers — `setupResumeInstrumentSession` (8 callers), `setupTimingSession` (4), `setupLatchCountSession` (2) — so the file's twenty statements serve **17 `it` blocks plus 3 helpers, reaching 31 `it`s**; each replay spec's single statement sits in its own `runReplay` helper and serves that spec's blocks (16 in total). Counted with:

```bash
grep -n 'function setupResumeInstrumentSession\|function setupTimingSession\|function setupLatchCountSession' src/monitor/useMonitorSession.test.ts
for h in setupResumeInstrumentSession setupTimingSession setupLatchCountSession; do echo "$h: $(grep -c "$h(" src/monitor/useMonitorSession.test.ts)"; done   # decl + callers
```

**No per-block "N of 26 freed" figure appears in this plan or the spec.** It was a number nobody could reproduce; the exit criterion counts STATEMENTS (Task 7), and anyone who wants a per-block figure prints it with the script above.

**Files:** Modify `app/src/monitor/useMonitorSession.test.ts` (20 statements) and `burstReplay.test.ts`, `handoffStoreReplay.test.ts`, `justRowReplay.test.ts`, `partialReplay.test.ts`, `summaryHoldReplay.test.ts` (1 each). **By hand, test block by test block, never by regex** — every block's `vi.fn((cb) => { … })` body is the dep's value and some return a Promise.

**THE RULE:** for each block, (i) move the mock factory's function body into `registerAppLifecycleListener:` on the `renderHook` deps object — **and where the mock sits in a SHARED setup helper, port the helper ONCE: the dep goes on that helper's own `renderHook`, and the helper's callers change not at all;** (ii) if the block also mocks `"../adapters/monitorTransport"`, move THAT factory's body into `createTransport: (liveness: LivenessDeps) => …`; (iii) drop `freshUseMonitorSession` for the statically imported `useMonitorSession`; (iv) **keep `vi.resetModules()` + the dynamic import if a THIRD module is still mocked in that block — OR if the block depends on a FRESH MODULE GRAPH rather than on the mock. Say which, per ported block, in the task report, naming whether any assertion turned on the two-instance split.** **Measured against main:** a third module IS mocked in exactly two of the seven files — `justRowReplay.test.ts` (`../api`, `../api/useWorkouts`, `../api/useBaselines`, `../api/usePlan`, `../api/usePreferences`, `../api/useRecentLogs`) and `summaryHoldReplay.test.ts` (`../api`, `../api/useWorkouts`, `../api/useBaselines`, `../api/usePlan`) — via

```bash
for f in src/monitor/useMonitorSession.test.ts src/monitor/{burst,handoffStore,justRow,lifecycle,partial,summaryHold}Replay.test.ts; do
  echo "== $f"; grep -n 'vi.doMock(' "$f" | grep -vE ':\s*(//|\*)' | grep -vE 'appLifecycle|monitorTransport'
done
```

Those two **keep `vi.resetModules()` + the dynamic import** if the `../api*` mocks share a block with the lifecycle one; the implementer checks and says which. **Criterion 1 is unaffected either way**: it counts appLifecycle statements, and those reach 0 in `src/monitor` regardless.

**The fresh-graph half of rule (iv), and why it is not hypothetical.** Dropping `resetModules` means the block now shares module singletons with its neighbours instead of getting its own copies. For `handoffStore.ts` that is already handled — the file's global `beforeEach` calls `resetHandoffStore()` and its own comment says it exists precisely because blocks without `resetModules` leak. **`nfc/connectionAttemptTrace.ts`'s `latest` is reset by nothing there**: `grep -n 'resetConnectionAttemptTraceForTests' src/monitor/useMonitorSession.test.ts` returns exactly two hits at `3fc49767`, an import and a call, BOTH inside one `it`. So:

- **Add `resetConnectionAttemptTraceForTests()` to the file's global `beforeEach`**, beside `localStorage.clear()` and `resetHandoffStore()`, as a static import. (The symbol exists — `src/monitor/nfc/connectionAttemptTrace.ts` exports it, verified.) Do this BEFORE porting any block, so a port that starts leaking a stale trace fails on its own assertion rather than on a neighbour's.
- For every block whose assertions read `loadMonitorRun`, the hand-off store or a trace, say in the report whether the port changed what it observed.

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

- **A replay spec** — Task 4's `lifecycleReplay.test.ts`. The other five follow it; six of the SIX replay specs that carry an appLifecycle mock hold it in their own `runReplay` helper, and five of those six use a bare `vi.fn(() => (): void => undefined)` stub that was paying `resetModules` for nothing (`lifecycleReplay` is the one that actually uses the callback).

- [ ] **Step 0: the `beforeEach` addition named above, first and in its own commit** — so a port that starts leaking fails on its own assertion, not a neighbour's.
- [ ] **Step 1-25:** one commit per file is fine; `useMonitorSession.test.ts` may be one commit. After each file: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`, read BOTH summary lines.
- [ ] **Step 26: The count.** Re-run Task 0's census. `src/monitor` must read **0**; repo-wide **3**. Name the three in the report.

**Measured partial result** (3 statements + `lifecycleReplay.test.ts` ported in the scratch tree): monitor/ `26 → 22`, repo-wide `29 → 25`, `Tests 322 passed` in the hook file and `3 passed` in the replay spec. The remaining delta is 17 statements in the hook file and 5 replay specs.

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
# STATEMENTS only. No per-`it`-block figure is claimed anywhere — 26 statements
# serve 17 blocks plus 3 shared helpers in the hook file (Task 5). The PR body
# also NAMES the files that keep `vi.resetModules()` and why:
# justRowReplay.test.ts and summaryHoldReplay.test.ts, for their `../api*` mocks.

# 2. the field is gone; the ruling is not
grep -rn 'failureLeavesLinkUp' app/src ROADMAP.md | grep -vE ':\s*(//|\*)'   # → EMPTY
grep -rn 'failureLeavesLinkUp' app/src | grep -E ':\s*(//|\*)'               # → exactly 2 comment lines, both historical, both named in the PR body
grep -c 'NOT_A_MACHINE_REFUSAL RULING, re-homed here' app/src/monitor/useMonitorSession.ts   # → 1  (0 on main — verified)

# 3. one derivation site
grep -rnE '\bderive(Axes|Link(Loss)?|Program|Session|Activity)\(' app/src --include='*.ts' --include='*.tsx' \
  | grep -v '\.test\.' \
  | grep -vE '^app/src/(monitor/(useMonitorSession|connectedAxes)\.ts:|test/)' \
  | grep -vE ':\s*(//|\*)'   # → EMPTY on this branch; FIVE code hits on main
# ALL SIX derivers, and the comment filter is REQUIRED at this width: without
# it the widened pattern also returns two PROSE lines — `JustRow.tsx`'s
# `deriveProgram("ended")` note and `surfaceModel.ts`'s `deriveLink() === "lost"`
# sentence — neither of which is a call. The structural scan needs no such
# filter because it reads `commentStrippedSource`.
```

**All three criteria as the spec wrote them are WRONG and are corrected here (RF10), each measured:** (1) the spec's count is right but its `wc -l` on the repo-wide form hides WHICH files survive — print the distribution; (2) the spec's `grep … → empty` cannot be satisfied, because the re-homed ruling and `deriveLink`'s new comment both NAME the field they replaced (that is what "prefixed with when and why it moved" requires), so the criterion is "no non-comment occurrence, and exactly two comment ones"; and the spec's phrase pin `'a genuine .ProgramRejection. the PM5 itself sent reads'` **returns 0 against the prescribed comment** because the phrase wraps across two lines — the one-line `NOT_A_MACHINE_REFUSAL RULING, re-homed here` replaces it; (3) the spec's path filter misses `app/src/test/sessionAxes.ts`, the new fixture helper, which derives on purpose.

- [ ] **Step 3: The full gate (RF1 — this diff touches `app/src/`)**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test                 # all three projects; integration needs Docker
pnpm test:coverage        # read the per-file rows for connectedAxes.ts and useMonitorSession.ts (RF2).
                          # NOT sessionAxes.ts — `vitest.config.ts`'s coverage
                          # `exclude` carries "src/test/**", so it has no row.
pnpm e2e                  # the full suite locally; READ the result. Then read the e2e job on the PR.
git status --short docs/screenshots   # must be EMPTY
gh run list --branch phase-md-pr2 --limit 1 --json headSha,conclusion   # headSha == git rev-parse HEAD, conclusion == success (RF39)
```

`pnpm e2e` was NOT run by the plan author (a full compose boot per invocation); everything else in this list was, at every task. **`app/src/` changed, so a full e2e run whose result someone READ is not optional** — run it here.

Re-run Task 1's four mutations, Task 3's and Task 4's against the FINAL tree (RF31/RF35) and record the outputs.

- [ ] **Step 4: The PR.** `gh pr create` from `phase-md-pr2`. Line one: **"This PR makes the app going to the background an input tests can pass in, and gives the four axes one home."** Then ≤6 bullets: what a test can now do that it could not; the five screens that stopped deriving; the dead field that went and where its ruling lives; the three comment riders; tester impact = **none**; how to try it = there is nothing to try. Then a collapsed `<details>` **"Record (for agents and audits)"** with: the Task 0 base-vs-head counts; every mutation verbatim; the three corrected exit-criterion commands and their real output; the lifetime table's headline (no new state); the e2e run URL and conclusion; per-file coverage. Then the hand-back: **Proposed to add** and **Now overdue** (`grep -n 'dies 20' ROADMAP.md`, oldest first) in ONE message, and STOP.

---

## 10. Where the plan contradicts what was observed (RF10)

Every item below was measured in the scratch tree; each changed a prescribed block or a criterion.

1. **The census and spec were measured at `4aa3d132`; main is `deb50b77`** (PR 1 landed in between). The appLifecycle counts survive unchanged; re-run anything else.
2. **`useMonitorSession.test.ts` has 20 doMock STATEMENTS, not 22** (the census's 22 includes two prose lines). 20 + six replay specs = the spec's correct 26.
3. **SIX replay specs carry an appLifecycle mock, not seven.** `liveDropSeamReplay` and `structureWatchSessionReplay` carry none, and neither do `captureReplay`, `connectedMetricsReplay`, `oracleCorpusReplay`, `recordReplay.roundtrip`, `registerReplay`, `structureWatchReplay`.
4. *(Withdrawn at revision 3.* Revision 1 recorded that the spec contradicted itself on the ring record. Spec rev 2.2 reconciled §4 and exit criterion 5 with §3, and rev 2.3 added the cause to the detail. Nothing is left to choose.)
5. **Adding two REQUIRED fields to `MonitorSession` breaks NINE hand-built fixtures, which the spec does not mention.** Eight are caught by `pnpm typecheck`. **`justrow/JustRow.test.tsx` is not**, because its mock's overrides are typed `Record<string, unknown>` — the suite compiled green and 18 tests threw at render. It also turned out to be missing `undecodable` entirely, and to depend on reading its overrides object LAZILY (tests mutate it between rerenders). Task 2 Step 5 carries all three.
6. **`src/test/sessionAxes.ts` is a new file the spec does not name.** Without it every fixture can assert a phase and an axes tuple that disagree.
7. **Exit criterion 2 as written cannot be satisfied** — see Task 7 Step 2. Its phrase pin also cannot match a wrapped comment line: the spec's proposed phrase greps to 0 against the exact comment the spec asks for.
8. **Exit criterion 3's path filter misses the new helper**; `app/src/test/` must be excluded, and the structural scan needs the same skip with its reason written down (scoped to the NEW scan only, so the existing `ConnectedPhase` sweep keeps its exact reach).
9. **The derivation and the field deletion CAN be separate commits** — revision 1 said they could not, and that was wrong. Measured at `3fc49767`: the deletion plus its test rewrite plus five one-line site edits typechecks clean and passes 26 files / 924 tests on its own. They stay in one commit because splitting edits the five call sites twice, and the plan now says that (RF36).
10. **A ring assertion cannot use `toStrictEqual` on `{kind, detail}`** — entries carry `seq` and `atMs`. Map to `detail` first (cost: one red test).
11. **`DiscoveredMonitor` has no `rssi`** — the two-sites test's scan result is `{ id, name }`.
12. **The hook imports `connectedAxes.ts`, which type-imports `ConnectedPhase` back.** The cycle is type-only and erased; `pnpm typecheck`, `pnpm lint` and the full client+unit suite are clean. Say so in the PR rather than leaving a reviewer to find it.
13. **Two replay specs mock a THIRD module** (`justRowReplay.test.ts` and `summaryHoldReplay.test.ts`, both `../api*`), so the spec's "all 26 blocks after" exit metric is an overcount — 24, with the two named. Criterion 1 is unaffected.
14. **Nothing in the screen tests can gate the published values** (revision 2, F1). `withDerivedAxes` calls the same functions the hook calls — a mirror, not an oracle (RF11) — `ConnectedSurface.test.tsx` builds `session()` as a prop, and `JustRow.test.tsx` mocks the hook. Revision 1's Task 2 mutation named exactly those two files and could not have bitten; `linkLoss` had no probe at all. The gate is now two hand-written literal tuples in `useMonitorSession.test.ts`, and the axis is called `activity`, not `freeze`.
15. **The lifetime table's ref count was 22, carried from the census; it is 25**, and the four paired clear sites live in `handleEvent` ×2, `teardown` and `fail` — not in `cancel()`, which holds none. Two of them being in `handleEvent` means a mid-session DROP silences a late registration rejection, which is now stated rather than left for a reviewer to derive.
16. **`src/test/` holds real harnesses**, so a directory-prefix skip in the derive scan would hide a second deriver. One named file, iterated by the no-dead-entries case.
17. **`useMonitorSession.test.ts` resets `handoffStore` globally but never the connection-attempt trace** (two hits, both inside one `it`). Dropping `resetModules` shares that singleton across blocks, so the reset moves into the global `beforeEach` before any port.
18. **`connectedAxes.ts` exports SIX derivers, not two** (revision 3, F1) — `deriveLink`, `deriveProgram`, `deriveSession`, `deriveActivity` are exported so each `never` guard is testable, and a screen could call any of them. The scan's pattern and exit criterion 3's grep both widen; at that width the raw grep needs a comment filter it did not need before (two prose hits: `JustRow.tsx`'s `deriveProgram("ended")` note, `surfaceModel.ts`'s `deriveLink() === "lost"` sentence).
19. **`withDerivedAxes` failed open on a half override** (F2) — a fixture could hand-write `axes` and take a derived `linkLoss`, a pair the hook cannot publish. It throws now.
20. **Two prescribed commands could not be run** (F3, F7): `src/test/**` is in vitest's coverage `exclude`, so `sessionAxes.ts` has no per-file coverage row to read; and Task 3's second mutation cast to `ConnectedAxes`, a name `sessionAxes.ts` does not import — the cast would have broken the build instead of the test.
21. **Task 4 dropped `vi.resetModules()` and replaced it with nothing** (F4). Every replay writes hand-off receipts through a module singleton; the file has no reset of its own today because `resetModules` was the reset.
22. **The `ConnectedSurface.tsx` replacement comment named one parent** (F5). `JustRow.tsx` renders it too, with no phase gate — and the `failed` case is unconditional after this PR, so the unreachability argument is moot as well as incomplete.
23. **`.catch` discarded the rejection's cause** (F9). Nobody chose that; a platform-sourced failure with no other observer (RF19) is exactly the one whose cause you want. Ruled: record it, and match the detail by prefix so the test pins our record rather than a platform's message text.
24. **`createTransport` has 57 injection sites, 55 zero-argument**, and all compile unchanged under the widened signature (the spec's figure of 41 predates PR 1).

## Self-review (done by the author before /harden)

- **Spec coverage:** §1 nothing to build; §2 census re-measured against `deb50b77` (Task 0, with corrections in §10); §3 invariants 1-5 → Task 1 Step 5's four tests (1, 2), Task 3's scan (3), Task 2 Step 2's comment plus Task 7's phrase pin (4), the lifetime table (5); §4 every bullet → Tasks 1, 2, 5, 6, with the ring-kind contradiction ruled; §5 every test → Tasks 1, 3, 4, 5; §6 criteria 1-7 → Task 7 Steps 2-4, three of them corrected; §7 deviations carried into Task 7 Step 1; §8 James's rulings honoured, none re-opened.
- **Paste-testing:** every block above was extracted to its real path and run. `pnpm typecheck`, `pnpm lint` and `pnpm format:check` are clean; `--project client --project unit` is `290 files / 8119 passed, 1 skipped`. **Ten mutations were RUN, not predicted** — Task 1's four plus 4b, Task 2's 5 and 6, Task 3's two, and mutation 1 re-measured against the cause-carrying detail — and every measured message is in the tables. Revision 2's and revision 3's re-measurements were taken at `3fc49767`: the two axes mutations, the ref count, the helper counts, the standalone-commit check, the scaffold shape, the widened regex (green in the scan, two prose hits in the raw grep), the coverage `exclude` line, `MonitorSession`'s 22 members, the 10 comment-stripped interstitial reads, both reset symbol names, and the un-cast Task 3 mutation's typecheck.
- **Not paste-tested:** the 17 remaining statements and 5 replay specs of Task 5, and Task 5 Step 0's `beforeEach` addition (three representatives were ported instead, and the rule is written from them), `pnpm e2e`, and `pnpm test:coverage`.
- **No line-number citations into this document, and no self-describing bookkeeping** — every count carries its command.
