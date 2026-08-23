# Held-Open Finish (Phase RC spec 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dev-only hold-open instrument (defer the transport disconnect 90 s after a natural finish, capture what the PM5 sends, subscribe 0x003F), plus wave-0 fixes RC-4 (Last Split decode /100) and RC-6-narrowed (band `spm` to the 0 sentinel).

**Architecture:** A transport decorator (`holdOpen.ts`) wraps the recording tap inside `transports/index.ts`'s existing `fakeMonitorEnabled` gate — the same seam that already keeps `fake.ts`/`recording.ts` out of production bundles. The decorator defers the INNER transport's `disconnect()` (never the driver's — `drainSummaryReconcile()` must run on time), tees notifications into its own ring while holding, and re-stashes that ring into the sessionStorage log on release/expiry. The wave-0 fixes are two one-line decode/recorder changes pinned by replays against NAMED committed capture frames, never round trips.

**Tech Stack:** TypeScript, Vitest (projects: unit for `domain/`, client for `src/`), Playwright e2e, existing capture corpus under `docs/monitor/sessions/`.

**Spec:** `docs/superpowers/specs/2026-08-22-held-open-finish-design.md` (post-gate revision — the anchor pass and PM gate corrections are IN it; where this plan and the spec disagree, say so in your report, do not silently pick one).

## Global Constraints

- Worktree `.claude/worktrees/rc-open`, branch `rc-open`. Run `git rev-parse --show-toplevel` before EVERY commit; it must print the worktree path.
- All gates run FOREGROUND and blocking. Never background a test run.
- `pnpm` swallows scoped flags: use `pnpm exec vitest run --project client` / `pnpm exec playwright test --grep`, and CHECK THE RUN COUNT. Single-FILE vitest runs are unsafe in this workspace (they escape jsdom; localStorage undefined; 89 false failures once) — only full-project runs are trustworthy; reproduce any single-file red at project scope before "fixing" it.
- TDD: failing test first, every task.
- Injected clock everywhere in `holdOpen.ts` (`now()`, `schedule()`) — harness fake timers do not reach the transport layer, and `replay.ts`'s barrier uses real `setTimeout` (Phase LL lesson).
- The hold-open gate is `import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1"` — BOTH halves, verbatim (the walk lab is a production build with the flag set; `DEV` alone is unreachable at the erg).
- Hold duration: `HOLD_OPEN_MS = 90_000`. spm band: `SPM_MIN = 10`, `SPM_MAX = 60`, out-of-band writes the EXISTING `0` sentinel — never an absent field (`traceModel.ts` guards on `!== 0`; the server validator requires the field).
- dist-grep needles are STRING LITERALS, never identifiers (minifiers rename identifiers).
- The instrument must not re-open the record, must not write to the store, must not change `endedBy` — it observes.
- Nothing here is fast path (touches `app/domain/`); the PR gets the PM final-PR gate (TRIAD via RC-4/RC-6).

## File map

- Create: `app/src/monitor/transports/holdOpen.ts` + `holdOpen.test.ts` — the decorator, storage-free, clock-injected.
- Modify: `app/domain/monitor/pm5/uuids.ts` (add `LOGGED_WORKOUT_UUID`), `app/src/monitor/transports/webBluetooth.ts` (`SERVICE_OF` entry), `app/src/monitor/transports/index.ts` (wire the decorator, `window.__pm5HoldOpen__`), `app/src/workout/connected/ConnectionLine.tsx` (armed chip), `app/scripts/dist-grep.sh` (needle), `app/domain/monitor/pm5/parse.ts` + `statusFrames.ts` (RC-4), `app/src/monitor/seriesRecorder.ts` (RC-6), `docs/monitor/pm5-interface-notes.md` (§20 items 17/24), `ROADMAP.md` (RC-4/RC-6 ticks, W10 rename + walk priority order in the RC walk-items section).

---

### Task 1: `holdOpen.ts` — the deferral decorator

**Files:**
- Create: `app/src/monitor/transports/holdOpen.ts`
- Test: `app/src/monitor/transports/holdOpen.test.ts`

**Interfaces:**
- Consumes: `Transport` from `domain/monitor/types.js` (methods: `scan`, `connect`, `write`, `subscribe(characteristicId, cb)`, `disconnect`, `onDisconnect`).
- Produces (Tasks 2–3 rely on these exact names):

```ts
export const HOLD_OPEN_MS = 90_000;

export interface HoldOpenDeps {
  now(): number;                                    // ms epoch
  schedule(fn: () => void, ms: number): () => void; // returns cancel
  stash(text: string): void;                        // Task 3 injects sessionStorage append
}

export type HoldOpenState = "disarmed" | "armed" | "holding";

export interface HoldOpenControls {
  arm(): void;                       // one-shot; no-op if already armed/holding
  release(): Promise<void>;          // real disconnect now; idempotent
  status(): { state: HoldOpenState; msRemaining: number | null };
  ring(): string[];                  // entries captured since arm()
}

export function createHoldOpenTransport(
  inner: Transport,
  deps: HoldOpenDeps,
): { transport: Transport; controls: HoldOpenControls };
```

Behavior contract (each line is a test):
- Disarmed: `transport.disconnect()` passes straight through to `inner.disconnect()`.
- Armed: `transport.disconnect()` resolves IMMEDIATELY (callers like `bestEffort(driver.disconnect())` must not hang), state → `"holding"`, and `inner.disconnect()` is scheduled at `HOLD_OPEN_MS`; expiry calls it and stashes.
- `release()` during hold: cancels the timer, calls `inner.disconnect()` once, stashes; a second `release()` (or expiry after release) does NOT call it again.
- While armed or holding, every notification delivered through `transport.subscribe`'s callbacks is teed into the ring as `+<seconds since arm>s <characteristicId> <hex bytes>` (space-separated lowercase hex); disarmed notifications are NOT recorded (bound the memory).
- `inner.onDisconnect` firing during hold (the PM5 hung up first): cancel the timer, state → `"disarmed"`, stash what was captured — that negative is evidence.
- `stash(text)` is called exactly once per hold window (on release, expiry, or inner-disconnect), with a header line `--- hold-open window (instrument) ---` followed by the ring entries.

- [ ] **Step 1: Write the failing tests** — `holdOpen.test.ts`, hand-built stub `Transport` (arrays of calls, manually-fired subscribe callbacks and `onDisconnect`), hand-cranked clock:

```ts
function testClock() {
  let t = 0;
  const timers: { at: number; fn: () => void; dead: boolean }[] = [];
  return {
    now: () => t,
    schedule(fn: () => void, ms: number) {
      const timer = { at: t + ms, fn, dead: false };
      timers.push(timer);
      return () => { timer.dead = true; };
    },
    advance(ms: number) {
      t += ms;
      for (const x of timers) if (!x.dead && x.at <= t) { x.dead = true; x.fn(); }
    },
  };
}
```

Cover the six contract lines above plus: `status()` reports `msRemaining` counting down under `advance()`; `arm()` after a completed hold does nothing (one-shot).

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run --project client` (full project; check the run count includes `holdOpen.test.ts` failing on "module not found").
- [ ] **Step 3: Implement `holdOpen.ts`** to the contract. Pass-through for `scan`/`connect`/`write`; `subscribe` wraps the callback with the tee; keep a `stashed` boolean so stash-once holds across release/expiry/inner-disconnect races.
- [ ] **Step 4: Full client project green**, per-file coverage on `holdOpen.ts` checked (recurring failure 2 — read the per-file line in the coverage table, not the aggregate).
- [ ] **Step 5: Commit** `feat: the hold-open decorator defers the radio, not the reconcile`.

### Task 2: 0x003F — constant, service map, instrumented subscribe

**Files:**
- Modify: `app/domain/monitor/pm5/uuids.ts` (beside `END_OF_WORKOUT_SUMMARY_UUID` at :67-71), `app/src/monitor/transports/webBluetooth.ts` (`SERVICE_OF` map at :104), `app/src/monitor/transports/holdOpen.ts` (arm-time subscribe)
- Test: `app/src/monitor/transports/holdOpen.test.ts`, `app/domain/monitor/pm5/uuids.test.ts` (or wherever uuids' existing pins live — locate by grepping `END_OF_WORKOUT_SUMMARY_UUID`)

**Interfaces:**
- Produces: `LOGGED_WORKOUT_UUID = pm5Uuid(0x003f)` (named for what C2's PDF calls it — the "C2 rowing logged workout characteristic", NOT "verification": the hash equation is untested INFERENCE, spec §1).
- `arm()` gains the subscribe: on arm, call `inner.subscribe(LOGGED_WORKOUT_UUID, cb)` where `cb` tees into the ring like any other characteristic. The call is wrapped:

```ts
Promise.resolve(inner.subscribe(LOGGED_WORKOUT_UUID, tee(LOGGED_WORKOUT_UUID)))
  .catch((e: unknown) => {
    ringPush(`+${sinceArm()}s 0x003f subscribe-failed ${e instanceof Error ? e.name : String(e)}`);
  });
```

so "absent on this firmware" (a recorded `subscribe-failed NotFoundError`) is distinguishable from "present but silent" (no entry at all) — the distinction W4 reads. The subscribe result's unsubscribe handle, if any, is dropped deliberately: the link is about to die by design.

- [ ] **Step 1: Failing tests** — (a) uuids pin: `LOGGED_WORKOUT_UUID` ends in `ce063f00...` per `pm5Uuid`'s existing pattern (copy the assertion style of the 0x0039 pin); (b) holdOpen: `arm()` subscribes 0x003f on the inner transport; a rejecting inner subscribe records a `subscribe-failed` ring entry naming the error, and does NOT reject `arm()` or kill the hold; (c) `SERVICE_OF` maps `LOGGED_WORKOUT_UUID` to the same service constant 0x0039 maps to (import both and compare — 0x003F is in the C2 rowing service 0x0030, anchor pass PRIMARY).
- [ ] **Step 2: Verify failures** at project scope (unit project for uuids, client for the rest).
- [ ] **Step 3: Implement** — one constant, one map entry, the arm-time subscribe.
- [ ] **Step 4: Both projects green** (`pnpm test` runs all).
- [ ] **Step 5: Commit** `feat: 0x003f subscribed at arm, failure recorded not swallowed`.

### Task 3: Wiring — the seam, the global, the chip, the dist probe

**Files:**
- Modify: `app/src/monitor/transports/index.ts` (the tap arm of `resolveDefaultTransport`), `app/src/workout/connected/ConnectionLine.tsx`, `app/scripts/dist-grep.sh:67` (NEEDLES array)
- Test: `app/src/monitor/transports/index.test.ts`, `app/src/workout/connected/ConnectionLine.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `createHoldOpenTransport`, `HoldOpenControls`, `HOLD_OPEN_MS` (Task 1).
- Produces: `window.__pm5HoldOpen__?: HoldOpenControls` — declared in `index.ts`'s existing `declare global` block with a doc comment following `__pm5Recording__`'s pattern (set only inside the `fakeMonitorEnabled` gate; product code never reads it — except the dev chip below, which reads it through `typeof window` guards and renders nothing when absent).

Wiring, inside the existing `import("./recording").then(...)` arm — the decorator composes OUTSIDE the tap (`holdOpen(tap.transport)`) so the tap keeps recording raw bytes during the hold, via a dynamic `import("./holdOpen")` chained in the same `.then` (same fold-away argument as recording itself):

```ts
return Promise.all([import("./recording"), import("./holdOpen")]).then(
  ([{ createRecordingTransport, downloadRecording }, { createHoldOpenTransport }]) => {
    const tap = createRecordingTransport(real);
    window.__pm5Recording__ = { /* unchanged */ };
    const held = createHoldOpenTransport(tap.transport, {
      now: () => Date.now(),
      schedule: (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); },
      stash: (text) => {
        for (const key of ["ergomatic:last-monitor-log", "ergomatic:last-rowed-log"]) {
          const prior = sessionStorage.getItem(key);
          if (prior !== null) sessionStorage.setItem(key, prior + "\n" + text);
        }
      },
    });
    window.__pm5HoldOpen__ = held.controls;
    return held.transport;
  },
);
```

The stash APPENDS to keys teardown already wrote (teardown stashes BEFORE the deferred disconnect — spec §2; appending only when the key exists means a session that never rowed doesn't invent a rowed-log entry).

Chip: in `ConnectionLine.tsx`, a `useEffect` 1 s interval polling `window.__pm5HoldOpen__?.status()`; render `<span className="hold-open-chip">HOLD-OPEN ARMED</span>` only when state is `"armed"`. (The connected screen unmounts at finish — the `"holding"` readout is `status()`/`ring()` on the console, per spec; the chip covers the pre-finish window so an operator knows the arm took.) Style: reuse an existing chip/badge class if one exists in the component's CSS; otherwise minimal inline class in the component's stylesheet with AA contrast (compute the ratio, put the number in the test or a comment — recurring failure 6).

- [ ] **Step 1: Failing tests** — index.test.ts: with the gate open and no fake script, the resolved transport defers `disconnect()` after `window.__pm5HoldOpen__.arm()` (stub `navigator.bluetooth`, follow the file's existing test pattern for the tap arm); the stash appends to a pre-existing sessionStorage key and leaves an absent key absent. ConnectionLine test: chip renders when a stubbed `__pm5HoldOpen__.status()` says `armed`, absent when `disarmed`/undefined.
- [ ] **Step 2: Verify failures** at client-project scope.
- [ ] **Step 3: Implement** wiring + chip.
- [ ] **Step 4: dist probe, red first** — add `"__pm5HoldOpen__"` to the NEEDLES array in `dist-grep.sh` with a one-line comment. Prove it can go red: `pnpm build` with a TEMPORARY unconditional `window.__pm5HoldOpen__` assignment planted outside the gate → grep finds it → remove the plant → `pnpm build` → grep clean. Record both runs' output in your report.
- [ ] **Step 5: Full client green + `pnpm build` + `bash scripts/dist-grep.sh`.**
- [ ] **Step 6: Commit** `feat: hold-open wired at the fake seam, armed chip, dist needle proven red-then-green`.

### Task 4: RC-4 — Last Split is hundredths

**Files:**
- Modify: `app/domain/monitor/pm5/parse.ts:203`, `app/domain/monitor/pm5/statusFrames.ts:222`, `docs/monitor/pm5-interface-notes.md` (§20 items 17 and 24), `ROADMAP.md` (tick RC-4)
- Test: `app/domain/monitor/pm5/parse.test.ts`

**Interfaces:** none new — `lastSplitTimeSeconds` has zero non-test consumers (anchor pass, grep-verified). The fake's encoder (`statusFrames.ts`) and decoder must change TOGETHER or its round-trip tests break.

- [ ] **Step 1: The replay pin, failing** — in `parse.test.ts`, decode the NAMED corpus frame: `docs/monitor/sessions/walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl`, **seq 1195** (0x0033 payload `2f 1d 00 02 69 00 0f 00 64 3a 69 00 0f 00 34 1d 00 00 00 00`). Assert `lastSplitTimeSeconds === 74.76` (u24LE@14 = 7476 hundredths) AND `elapsedSeconds === 74.71` (u24LE@0 = 7471) — the same frame carries both and they DIFFER by 0.05 s; never assert them equal (anchor pass trap). Load the frame bytes from the committed capture file (follow `captureReplay.test.ts`'s existing loader pattern), or inline the 20 bytes above with a comment citing file+seq. Cite file and seq in the test name.
- [ ] **Step 2: Verify it fails** — `pnpm exec vitest run --project unit`; the pin reads 747.6 today.
- [ ] **Step 3: Fix both sides** — parse.ts:203 `/ 10` → `/ 100`; statusFrames.ts:222 `* 10` → `* 100`. Update each line's neighboring comment if it names the old scale.
- [ ] **Step 4: Retarget the two stale assertions** — locate by grepping `lastSplitTimeSeconds` in `parse.test.ts` (the ecosystem review says :198 and :614 — locate by assertion, not line number) and update expected values to the /100 scale.
- [ ] **Step 5: Unit project green.**
- [ ] **Step 6: Docs** — rewrite `pm5-interface-notes.md` §20 items 17 and 24 to the settled 0.01 s/lsb semantic (dimension-conditional, transiently live mid-interval, never a countdown checkpoint at any scale); tick RC-4's checkbox in ROADMAP with a one-line "settled by replay, see parse.test.ts" note.
- [ ] **Step 7: Commit** `fix: last split time decodes hundredths — the machine's 7476 is 1:14.76, not 12:27.6`.

### Task 5: RC-6-narrowed — band `spm` to the 0 sentinel

**Files:**
- Modify: `app/src/monitor/seriesRecorder.ts:230`, `ROADMAP.md` (tick RC-6, with the narrowing note)
- Test: `app/src/monitor/seriesRecorder.test.ts`

**Interfaces:** none new. The stored `Sample` shape is UNCHANGED — out-of-band writes the existing `0` sentinel every reader already honours. Do NOT make any field optional (the original RC-6 was refuted at the gates: `traceModel.ts` guards on `!== 0`; the server validator requires the field).

- [ ] **Step 1: Failing tests** — in `seriesRecorder.test.ts`, following its existing frame-feeding pattern: (a) a frame with `spm: 64` records a sample with `spm: 0` — name it in the test title as the FIRST-STROKE transient (corpus: step-2 recording seq 829/832/835/838, 13 s into interval 1 — NOT a boundary; the estimator on one stroke interval); (b) a frame with `spm: 101` records `spm: 0` — the boundary artifact (pyramid recording seq 3274/3277, straddling the workout-end transition); (c) `spm: 10`, `spm: 60` and a typical `spm: 24` record UNCHANGED (band edges are inclusive); (d) `spm: 9` and `spm: 61` record `0`.
- [ ] **Step 2: Verify (a), (b), (d) fail** at client-project scope; (c) passes already.
- [ ] **Step 3: Implement** — at `seriesRecorder.ts:230`:

```ts
const SPM_MIN = 10;
const SPM_MAX = 60;
// (in the sample construction)
spm: f.spm !== null && f.spm >= SPM_MIN && f.spm <= SPM_MAX ? f.spm : 0,
```

with a comment naming BOTH producers (first-stroke transient, boundary transition) and citing the two corpus recordings — the next reader must not assume one mechanism.
- [ ] **Step 4: Client project green**, per-file coverage on `seriesRecorder.ts` checked.
- [ ] **Step 5: Docs** — tick RC-6 in ROADMAP as NARROWED (the `p: 0` half moved to RC-11's spec, per the phase-open gates).
- [ ] **Step 6: Commit** `fix: the chart no longer draws the estimator's 64 or the boundary's 101 as strokes`.

### Task 6: Gates, walk-card docs, PR assembly

**Files:**
- Modify: `ROADMAP.md` (RC walk-items section: rename RC's distance follow-up to W10, add the priority order W1 → W2/W3/W4 → phone leg → W10 and the one-link-at-a-time rule from spec §6)
- No new tests; this task RUNS the gates the diff obligates.

- [ ] **Step 1: ROADMAP walk-card edit** — mirror spec §6's protocol rules into the RC walk-items section (they must survive the spec going stale; recurring failure 14).
- [ ] **Step 2: Full local gate, foreground** — in `app/`: `pnpm lint`, `pnpm typecheck`, `pnpm test` (grep BOTH summary lines: "Test Files" and "Tests"), `pnpm build` + `bash scripts/dist-grep.sh`.
- [ ] **Step 3: `pnpm e2e`** — the diff touches `app/src/` (recurring failure 1). Expect 401+; check the count is the full suite, not a swallowed filter.
- [ ] **Step 4: `pnpm screenshots`** — ConnectionLine changed; open any changed capture and LOOK at it (recurring failure 7). The chip must NOT appear in any committed screenshot (nothing arms it).
- [ ] **Step 5: Commit** `docs: the walk card carries its cut order` **and report done** — the controller assembles the PR (body per the write-for-James rules, PM final-PR gate follows).

---

## Self-review (done at write time)

- **Spec coverage:** §2 instrument → Tasks 1+3; §3 0x003F → Task 2; §4 RC-4 → Task 4; §5 RC-6 → Task 5; §6 walk protocol docs → Task 6; §8 exit 1 (walk-time), 2 → T4, 3 → T5, 4 → T3, 5 (walk-time). The ring re-stash (§2, PM C1) → Task 1 contract + Task 3 stash wiring.
- **Type consistency:** `HoldOpenControls`/`createHoldOpenTransport`/`HOLD_OPEN_MS`/`LOGGED_WORKOUT_UUID` named identically in Tasks 1, 2, 3.
- **No placeholders** — every code step carries the code.
- **One PR** (spec §9 grouping): Tasks 1–6 land as commits on `rc-open`, single PR at the end.
