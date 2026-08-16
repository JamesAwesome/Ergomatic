# Connected axes (spec 2, PR 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four honest state axes derived from `ConnectedPhase`, the mirror-0
surface, the no-noun pause state, one terminal path with finals everywhere,
and a correct interval clock — zero persisted shapes, PR 2a of spec 2.

**Architecture:** A pure `connectedAxes.ts` derives {link, program, session,
activity} from the enum plus three newly-published hook facts; consumers
migrate one reviewable step at a time (surface status, interstitial ladder);
the driver's interval clock drops a falsified checkpoint subtraction; every
session ending routes through a terminal path that logs finals and a
fail-open suspicion verdict. `ConnectedPhase` survives (minus `paused`); the
reducer is a later spec.

**Tech Stack:** TypeScript 6, Vitest 4 (client project for monitor/UI tests),
Playwright e2e, the existing fake transport. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-15-connected-axes-design.md` — read
it first; it carries the evidence, two gate verdicts, and James's rulings.
Line-number anchors below may drift a few lines — the NAMES are the anchors;
if a cited name is absent, stop and report (recurring failure #10).

## Global Constraints

- Worktree `.claude/worktrees/cr2-axes` only; `git rev-parse --show-toplevel`
  before every commit. Node 26: `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"`.
  Never `--no-verify`.
- Commands in `app/`; monitor/UI tests are in the **client** vitest project.
- Failing test first; assert consequences, never existence; per-file coverage
  for every touched file; read BOTH vitest summary lines.
- `pnpm e2e` AND `pnpm screenshots` are required — this PR changes pixels
  (banner, mirror surface) DELIBERATELY; re-shot captures are opened and
  looked at with real data (recurring failures #1, #7).
- House copy rules: no em-dashes in user-facing strings; the pause treatment
  has NO noun — the string is exactly `PULL TO RESUME`.
- NO persisted shapes, NO `endedBy` field, NO Today twin — that is PR 2b.
  NO reducer, NO enum deletion — later spec. The `paused` MEMBER is removed;
  the enum itself stays.
- Self-mutation on every guard/predicate added: prove each new test can fail.

---

## File Structure

| File | Responsibility | Tasks |
| --- | --- | --- |
| `app/src/monitor/connectedAxes.ts` (new) + test | the four derivations, exhaustive, pure | 1 |
| `app/src/monitor/useMonitorSession.ts` | publish freeze/run-open/error facts; remove `paused` member+writer; teardown ordering | 1, 5, 7 |
| `app/src/workout/connected/surfaceModel.ts` + test | non-nullable status, `armed`, mirror substitution, rate suppression | 2, 3, 5 |
| `app/src/workout/ConnectedSurface.tsx` / `ConnectedInterstitial.tsx` + tests | status computation at the call site; disconnected fall-through | 2, 4 |
| `app/src/monitor/driver.ts` + tests | interval clock fix; suspicion verdict; END-path finals | 6, 7, 8 |
| `app/src/monitor/transports/fake.ts` + test | armed carry-over; Last Split hardware semantics | 3, 6 |
| `app/src/workout/connected/PaneLive.tsx` + CSS + e2e/screenshots | banner copy/occlusion | 5 |
| `docs/monitor/pm5-interface-notes.md`, `docs/monitor/sessions/walk-2026-08-15/README.md` | record corrections (§17 items 17/24; the 578 signature) | 9 |

---

### Task 1: The axes module and the three published facts

**Files:**
- Create: `app/src/monitor/connectedAxes.ts`, `app/src/monitor/connectedAxes.test.ts`
- Modify: `app/src/monitor/useMonitorSession.ts` (the `MonitorSession` interface ~:267-313 and its `update` sites)

**Interfaces:**
- Produces: `type LinkAxis = "none" | "connecting" | "up" | "lost"`,
  `ProgramAxis = "none" | "sending" | "armed" | "failed"`,
  `SessionAxis = "none" | "live" | "ended"`,
  `ActivityAxis = "moving" | "frozen" | "unknown"`;
  `deriveAxes(input: AxesInput): ConnectedAxes` where
  `AxesInput = { phase: ConnectedPhase; frozen: boolean; runOpen: boolean; failureLeavesLinkUp: boolean | null }`;
  `MonitorSession` gains read-only `frozen: boolean`, `runOpen: boolean`
  (from `freezeRef`/`runRef`), and `error` already carries the reason used
  for `failureLeavesLinkUp` (ProgramRejection ⇒ true).
- Consumes: nothing.

- [ ] **Step 1: failing test — the exhaustive table.** In
  `connectedAxes.test.ts`, a literal table of all TEN `ConnectedPhase`
  members (`idle picking pairing programming ready failed live paused
  disconnected ended`) × the extra inputs, each row asserting all four axes.
  Load-bearing rows (from the spec):
  - `paused` → activity `frozen`; `live`+`frozen:false` → `moving`;
    `idle|picking|pairing|failed` → activity `unknown` (never a claim).
  - `disconnected`+`runOpen:true` → session `live` (the record deliberately
    stays open); `disconnected`+`runOpen:false` → `none`; `ended` → `ended`.
  - `failed`+`failureLeavesLinkUp:true` → link `up`; `:false` → `lost`;
    `:null` → `lost` (conservative).
  - Compile-time exhaustiveness: a `// @ts-expect-error` case feeding an
    invalid member.
- [ ] **Step 2: run red** (`pnpm test --project client connectedAxes`).
- [ ] **Step 3: implement** — four pure functions + `deriveAxes`, each an
  exhaustive `switch` with a `never` guard; doc comment carries the
  precedence note for later collapse: `ended > disconnected > (armed |
  mirror | live)`.
- [ ] **Step 4: publish the facts** — add `frozen`, `runOpen` to the
  published `MonitorSession` (read-only mirrors of `freezeRef`/`runRef`,
  updated at the sites that already write those refs). Zero behaviour
  change: no consumer yet.
- [ ] **Step 5: green + full client project + per-file coverage
  (connectedAxes.ts must be 100×4 — it is pure and new).**
- [ ] **Step 6: commit** `feat: four honest axes, derived not invented`

### Task 2: `armed` becomes a real surface status; `?? "live"` dies

**Files:**
- Modify: `app/src/workout/connected/surfaceModel.ts` (`surfaceStatusFor`,
  `SurfaceStatus`, `buildSurfaceModel` signature), `app/src/workout/ConnectedSurface.tsx`
  (the one production call site ~:291), `app/src/workout/connected/surfaceModel.test.ts`
  (67 call sites gain the argument — mechanical, but each new `status` value
  must be the one that test genuinely means, not blanket `"live"`).

**Interfaces:**
- Consumes: Task 1's axes (the call site computes status from them).
- Produces: `type SurfaceStatus = "live" | "paused" | "stale" | "armed"`;
  `buildSurfaceModel(session: …, status: SurfaceStatus)` — non-nullable.

- [ ] **Step 1: failing test** — `surfaceStatusFor` no longer exists as a
  null-returner: `buildSurfaceModel(session, "armed")` renders the armed
  surface (assert `nowLabel` ≠ "NOW", no judged colours — exact assertions
  in Task 3; here assert the status plumbs through and the TypeScript
  signature rejects a missing argument via `// @ts-expect-error`).
- [ ] **Step 2: red. Step 3: implement** — delete the `?? "live"` (grep
  proves zero remain), thread non-nullable status; the production caller
  computes it from axes: `ended→(existing ended handling)`,
  `link lost→stale`, `program armed ∧ session none→armed`,
  `activity frozen→paused`, else `live` — the precedence comment from
  Task 1 realized in one place.
- [ ] **Step 4: migrate the 67 test calls honestly** (each gets the status
  its scenario means; a test exercising the paused overlay passes
  `"paused"`, not `"live"`). Any test whose meaning is UNCLEAR under the
  new signature is a stop-and-report, not a guess.
- [ ] **Step 5: green; full client; e2e (no visual change expected YET —
  zero screenshot churn this task). Step 6: commit**
  `feat: the surface stops laundering unknown phases into live`

### Task 3: The mirror — 0 wherever the machine's display shows 0

**Files:**
- Modify: `app/src/workout/connected/surfaceModel.ts` (before `pace`/`rate`
  are built ~:444-457 — one substitution, panes B and C agree by
  construction), `app/src/monitor/transports/fake.ts` (armed carry-over),
  tests in `surfaceModel.test.ts` + `fake.test.ts`.

**Interfaces:**
- Consumes: Task 2's `SurfaceStatus` (`armed`), frame fields
  `rowingActive`, `distanceMeters`, `spm`, `currentSplit`.
- Produces: the mirror rule other tasks must not break:
  `mirrored = status === "armed" OR (rowingActive === false AND
  distanceMeters at/near reset)`, and it NEVER survives a frame with
  advancing distance.

- [ ] **Step 1: failing tests, four, each asserting numbers:**
  1. `armed` + fake's carried-over ghost (spm 46, split nonzero — teach the
     fake first: on re-arm it keeps the previous piece's spm/split like the
     wire's 13-96 ghosts, replacing `zeroedStatus`'s zeroing): rate renders
     `0` plain (no judgement class), split renders the target ghost.
  2. Mid-session boundary (the walk's observed frame: `state=rowing,
     rowingActive=false, distance 0.8, spm 25`, status `live`): heroes
     mirror 0/unjudged.
  3. The guard: same frames then distance advances (0.8→5.4): mirror ENDS —
     judged values return (the `?? "live"` was the accidental mitigation;
     this is its honest replacement).
  4. Grid agreement: `buildGridModel` sees the same substituted values.
- [ ] **Step 2: red (fake teaching is part of red — test 1 cannot go red
  against `zeroedStatus`). Step 3: implement** — substitution before
  `pace`/`rate` construction; diagnostics ring untouched (one comment says
  the ghost remains visible there on purpose).
- [ ] **Step 4: self-mutate** — drop the advancing-distance guard: test 3
  red. Restore.
- [ ] **Step 5: green; full client. Step 6: commit**
  `feat: the heroes mirror the machine before the first pull, both cases`

### Task 4: The interstitial's disconnected fall-through closes

**Files:**
- Modify: `app/src/workout/ConnectedInterstitial.tsx` (the ladder ~:486-536),
  its test file.

**Interfaces:**
- Consumes: Task 1's axes (`link`, `session`).
- Produces: the rule `link lost ∧ session none ⇒ interstitial's disconnected
  treatment, never the surface`.

- [ ] **Step 1: failing test** — phase `disconnected` with no run open
  renders the interstitial's disconnected treatment (assert its actual
  copy/element), NOT `<ConnectedSurface>`; today it falls off the ladder
  into the surface with no run and no frame.
- [ ] **Step 2: red. Step 3: implement via axes. Step 4: green + the
  fifteen existing walk-through tests untouched. Step 5: commit**
  `fix: a link drop during pairing stops landing on a surface with no run`

### Task 5: The pause state — no noun, no occlusion, no `paused` member

**Files:**
- Modify: `app/src/workout/connected/PaneLive.tsx` + its CSS
  (`.connected-paused`), `app/src/workout/connected/surfaceModel.ts` (rate
  suppression ~:441-446 gaining what `livePace` has at ~:367-370),
  `app/src/monitor/useMonitorSession.ts` (the freeze patch site writes
  activity, `paused` member removed from `ConnectedPhase`), every test
  asserting `phase: "paused"` (grep), `app/e2e/design.spec.ts` pins
  (~:4265-4270), `ConnectedSurface.test.tsx` (~:898-906),
  `PaneGrid.test.tsx` (~:863).

**Interfaces:**
- Consumes: Task 1's `ActivityAxis` (`frozen`), Task 2's status mapping
  (`activity frozen → "paused"` status — the SurfaceStatus member name stays
  `paused` internally; the USER-FACING noun is what dies).
- Produces: block copy exactly `PULL TO RESUME` (+ the existing END/AGAIN
  button KEPT, untouched); TOTAL LEFT and the bar visible while frozen.

- [ ] **Step 1: failing tests:** (1) frozen state: block text is exactly
  `PULL TO RESUME` — no PAUSED anywhere (source-sweep: grep the rendered
  output AND the src tree for the noun); (2) TOTAL LEFT's element and the
  progress bar are NOT occluded (geometry or DOM-order assertion per
  design.spec's idiom); (3) rate hero suppresses while frozen exactly as
  the split does (dash, not a pinned 68); (4) `ConnectedPhase` no longer
  admits `"paused"` (`// @ts-expect-error`).
- [ ] **Step 2: red. Step 3: implement** — copy + minimal reposition/shrink
  (current visual vocabulary otherwise — spec 3 restyles), rate
  suppression, member removal (the hook's freeze site drives `frozen`
  via Task 1's published fact; status mapping via Task 2's caller).
- [ ] **Step 4: rest suppression is NOT new code** — add the pinning test
  that a `resting` frame stream never produces frozen (the structural
  guarantee: `nextFreezeRun` resets on non-rowing frames), with a comment
  that re-deriving `activity` from anything else forfeits it.
- [ ] **Step 4b: the enum-reader pin (spec exit criterion 8)** — a
  `no-restricted-imports`/lint rule (the repo already writes this shape for
  Capacitor and domain/judge) or a source-sweep test forbidding NEW readers
  of `ConnectedPhase` outside `useMonitorSession.ts` + `connectedAxes.ts`,
  with the existing readers allowlisted as they migrate away.
- [ ] **Step 5: green; full client; `pnpm e2e` AND `pnpm screenshots` —
  captures re-shot with a REAL frozen state seeded, opened, looked at.
  Step 6: commit** `feat: the pause stops claiming anything; it instructs`

### Task 6: The interval clock — delete the falsified checkpoint

**Files:**
- Modify: `app/src/monitor/driver.ts` (`computeRemainingForFrame`
  ~:1711-1724, `computeAccruedForFrame` ~:1737-1749),
  `app/src/monitor/transports/fake.ts` (~:624-637, 768-780 — the Last Split
  fiction), tests in `driver.test.ts` + `sessionTotals.test.ts` idiom
  (hand-built payload harness) + `fake.test.ts`.

**Interfaces:**
- Consumes: nothing new.
- Produces: `progress = frame.elapsedSeconds` (time) /
  `frame.distanceMeters` (distance) — the 0x0031 pair IS per-interval; the
  checkpoint subtraction is gone from BOTH functions.

- [ ] **Step 1: failing tests, exact numbers:**
  1. The walk signature: interval index 2 of a time→distance program, wire
     Last Split pair = interval 0's end (181 m — WHOLE meters), frame
     distance 102.7 on a 500 m interval: remaining reads 578.3 today → must
     read **397.3**.
  2. Same-dimension ≥3: a 3×1:00 program at interval index 2 with the
     lagging checkpoint (60): remaining reads 120−elapsed today → must read
     60−elapsed. Assert BOTH `intervalRemaining` AND `intervalAccrued`.
  3. Intervals 0-1 unchanged (checkpoint 0 on hardware — the fix is a no-op
     there; pin it).
- [ ] **Step 2: the fake learns the measured semantics FIRST** — Last Split
  = 0 through interval index 1, then lag-one-boundary (the cumulative point
  at the PREVIOUS interval's start). Without this the failing tests cannot
  go red against the fake (its current fiction makes the subtraction
  correct). Fake's own test pins the semantics with the lab numbers.
- [ ] **Step 3: red (tests 1-2). Step 4: implement — delete the
  subtraction in both functions; rewrite their doc comments citing the
  inversion result (225+161 frames, checkpoint ≡ 0 at interval 1; lag at
  2+). Step 5: green; the walk-4-era countdown tests stay green untouched
  (they ran at intervals 0-1 where this is a no-op — if any moves, STOP).**
- [ ] **Step 6: self-mutate** — reintroduce the subtraction: tests 1-2 red.
  Restore. **Step 7: commit**
  `fix: the interval clock stops subtracting a checkpoint the wire lags`

### Task 7: One terminal path — finals everywhere, four-step teardown

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` (`teardown` ~:1143-1185),
  `app/src/monitor/driver.ts` (`disconnect()` method — the twin),
  tests in `useMonitorSession.test.ts` + `driver.test.ts`.

**Interfaces:**
- Consumes: spec 1's `final-totals`/`terminal-raw` (already write at
  machine-terminal transitions).
- Produces: teardown order **reconcile → stash → unsubscribe → disconnect**;
  END/cancel paths produce `final-totals` in the STASHED ring.

- [ ] **Step 1: failing tests:** (1) END mid-session: the sessionStorage
  stash (`ergomatic:last-monitor-log`) contains a `final-totals` entry —
  today the ring ends at the terminate write (walk evidence); (2) the twin:
  a reconcile-eligible verdict at caller-initiated `disconnect()` reaches a
  LIVE listener (fails under today's unsubscribe-first order); (3) ordering
  pin: the stash snapshot contains everything the reconcile wrote (a
  reconcile entry AFTER the stash would die with the tab — assert the stash
  itself, not the in-memory ring; §22's trap).
- [ ] **Step 2: red. Step 3: implement** — in the driver, END's terminate
  path records `final-totals` before teardown can stash (reusing the
  machine-terminal block via a shared helper — no duplicated string
  building); teardown reorders to reconcile → stash → unsubscribe →
  disconnect with a comment carrying the four-step rationale and the F7
  rule's uniform application.
- [ ] **Step 4: the normal finish is PINNED unchanged** — session-c/d
  shaped fixtures: same file/log/release timing as today (the grace/emit
  arming order is untouched — assert `finishGraceUntil`/reconcile arm at
  the terminal tick as today).
- [ ] **Step 5: green; self-mutate the ordering (swap stash before
  reconcile: test 3 red). Step 6: commit**
  `fix: every ending writes its finals where the tab cannot eat them`

### Task 8: The suspicion verdict — log-only, fail-open

**Files:**
- Modify: `app/src/monitor/driver.ts` (the terminal transition block, beside
  `final-totals`), tests in `sessionTotals.test.ts` idiom.

**Interfaces:**
- Consumes: recorded-actuals count, programmed count, 0x0039-seen (all in
  hand at the terminal tick).
- Produces: log kind `suspicious-terminal`; predicate: a `finished` is
  unsuspicious iff `0x0039 already seen ∨ actuals ≥ programmed − 1`;
  `terminated` NEVER suspicious; verdict changes NO close behaviour.

- [ ] **Step 1: failing tests:** (1) killer-shaped hand-built fixture
  (mid-program `finished`, no 0x0039, actuals 0 of 2 — synthesized, cited
  to the walk README since the afternoon ring was never committed): exactly
  ONE `suspicious-terminal` entry (carrying the same raw bytes
  `terminal-raw` holds) AND the run still closes exactly as today (assert
  the close's observable consequences unchanged); (2) all four committed
  rings' shapes produce ZERO suspicious entries (a: 2 of 3 = N−1 →
  unsuspicious; b: 1 of 2 = N−1 → unsuspicious; c: 0x0039 already seen →
  unsuspicious; d: 2 of 2 → unsuspicious); (3) `terminated` with 0 actuals: no entry.
- [ ] **Step 2: red (entry kind absent). Step 3: implement. Step 4:
  self-mutate the predicate (drop the −1: session-a/b shapes go
  suspicious — test 2 red). Restore. Step 5: commit**
  `feat: a suspicious finish convicts itself and closes anyway`

### Task 9: Record corrections + gates + PR

**Files:**
- Modify: `docs/monitor/pm5-interface-notes.md` (§17 items 17 and 24),
  `docs/monitor/sessions/walk-2026-08-15/README.md` (the 578 signature:
  LSD=181 whole meters, true remaining 578.3), `ROADMAP.md` (CR2 status:
  spec 2a in review).

- [ ] **Step 1:** §17 item 17's "they report the point at which the CURRENT
  interval began" and its closing sentence are corrected to the measured
  semantics (0 through interval 1; lags one boundary after); item 24 is
  updated half-settled (the walk item that remains: 4 unequal intervals
  separates lag-by-one from previous-split's-own-value).
- [ ] **Step 2:** walk README signature corrected; spec 2's walk list
  confirmed present (mirror confirmation row, mid-rest stop, END finals,
  keystone re-run, 4-unequal-intervals).
- [ ] **Step 3: full gates** — lint, typecheck, `pnpm test` (both lines),
  `pnpm test:coverage` per-file for every touched file, `pnpm e2e`,
  `pnpm screenshots` (changed captures opened and inspected).
- [ ] **Step 4: push, open the PR** — body carries: per-task numbers, the
  falsified-and-settled interval-clock story, screenshots before/after,
  spec deviations if any, and **the phase walk list** (merge is NOT
  walk-gated this time — James ruled the release waits for the phase and
  the walk rides the phase's next erg session; the PR merges on review +
  James's word). PM final-PR gate runs before his word. **Do NOT merge.**
