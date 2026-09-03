# Storage denial is recoverable before work (AUD-011 / AUD-015) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower's session is never silently lost to a storage failure, and a
denied `localStorage` getter never crashes a screen. **AUD-015:** today,
`Countdown` builds the run, calls `saveRun(run)`, throws the boolean away,
and navigates to Timer — which bounces straight back to Today when the write
never landed, with nothing said. After this PR, Countdown confirms the write
landed (I-4: `saveRun(run) === true` AND a consumer-loader read-back) before
it will leave for Timer, and a failed write renders the Gate-0-approved
`Couldn't keep your session on this phone.` state with Retry and Cancel — the
same shape Countdown already uses for its own baselines/preferences load
failures. **AUD-011:** three loaders (`loadRun`, `loadDraft`,
`loadTodayPick`) call `localStorage.getItem` outside any `try`; a denied
getter now reads as absent everywhere, never as an escaping exception. The
research this spec is written from (§4) settled that the getter **cannot**
throw natively on the phone today — our origin is `capacitor://localhost`,
never `file://` — so the three guards ship as **web-arm hardening** (the dev
loop, the browser fallback), and the ONE visible surface this PR adds is the
Countdown blocked-start state, because a failed **write** (quota) is
reachable on every platform.

**Architecture:** One pure function, `attemptBuild` (`session/Countdown.tsx`)
— `buildRun` + `saveRun` + the I-4 read-back, called from the build effect at
mount and from a new `handleRetry` — plus one new boolean render state,
`saveBlocked`, and one new render branch. No stored shape changes: `saveRun`
and `loadRun` keep their existing signatures, and the three guarded loaders
change no successful return value (I-3). No new persisted field, no `v`
bump, no migration. **No RF27 lifetime table is owed**: `saveBlocked` is
ordinary React render state, cleared by the existing `beforeEach`/component
unmount, not tied to a connection, session, attempt or document lifetime —
there is no new ref, no new mint/clear site pair to table.

**Tech Stack:** React 19 client; Vitest (unit / client projects); Playwright
(e2e + screenshots). Touches only `app/src/**` and `app/e2e/**` — no
`app/server/`, no `app/domain/`, no migration.

**Spec:** `docs/superpowers/specs/2026-09-03-storage-denial-design.md` —
§1 (the three guards, I-1/I-2/I-3), §2 (the blocked start, I-4/I-5/I-6, Gate
0's four approved decisions), §3 (the composed legs, the key-scoped rule),
§4 (the research), §5 (the decomposition, the spoken skips). Read §1–§3
before any task; every behavioural rule below is argued there. Gate 0:
`docs/superpowers/specs/2026-09-03-blocked-start-gate.html`, **APPROVED by
James 2026-09-03** — the copy, the button pair, and the restart-not-resume
behaviour below are approved, not proposed.

**Antagonist:** the DELTA pass lives in `.claude/agents/antagonist-ledger.md`,
`### 2026-09-03 — Storage-denial spec (AUD-011 / AUD-015), DELTA pass`. Two
findings are load-bearing for this plan's shape and are folded at the tasks
named:

1. **"Denied getter → `loadRun()` null → Start proceeds → `saveRun ===
   false`" does NOT compose.** The denial the spec's research cites fails
   EVERY access, so `useStartWorkout.confirmReplace`'s own `saveDraft` call
   returns `false` FIRST and shows its existing inline error —
   `Countdown` never mounts under that fault. Folded at **Task 3**: the two
   composed legs are QUOTA at the run key (a real, live-reachable fault
   that reaches Countdown) and whole-storage denial (which stops one screen
   earlier, at `useStartWorkout`), never the getter-denial composition the
   spec's own anchor pass originally proposed.
2. **"Countdown does not leave for Timer unless the run is DURABLE" is
   narrowed.** `saveRun`'s boolean means only that `setItem` did not
   throw — no read-back. Folded at **Task 2**: `attemptBuild` calls the
   consumer's own `loadRun()` once, after `saveRun`, and I-4 is stated as
   the conjunction of both, with independent legs for each half (found by
   this plan's own paste test — see Findings, item 1).

Also carried, not re-derived: the census that these three loaders are the
whole remaining unguarded set was **attacked and HELD** (ledger, same
entry) — every other `localStorage`/`sessionStorage` getter under `app/src`
is inside a `try`, including the one that looks like a counterexample
(`LogSession.readMonitorLogStash`, bare, but reached only through
`readMonitorLogStashSafely`).

---

## Global Constraints

- **Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-aud`
  (branch `wave-f-aud`, base head `92eabcfc`). Run
  `git rev-parse --show-toplevel` before EVERY commit and confirm it prints
  that path. **Every shell write uses an absolute worktree path or a `cd` in
  the SAME command** (RF20).
- All commands run in `<worktree>/app/` unless stated. Node 26:
  `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"`.
- **The three loaders wrap the GETTER, not just the `JSON.parse`.**
  `loadRun` (`app/src/session/run.ts`), `loadDraft`
  (`app/src/session/draft.ts`), `loadTodayPick` (`app/src/today/todayPick.ts`).
  `loadMonitorRun` is OFF this list (closed at PR #239);
  `loadTodayOverrides`/`logDoorDiagnostics` already guard their getters.
- **I-1** a denied getter reads as ABSENT (`null`), never as an exception.
- **I-2** the catch is BARE, never `catch (e) { if (e.name ===
  "SecurityError") }`. The getter's non-throwing failure paths (no
  document, a closed page, storage disabled) surface as a `TypeError` on
  property access, not a `SecurityError` — a typed catch lets those escape.
- **I-3** the guard changes NO successful path — present, absent and
  malformed all behave exactly as today. **No guard self-clears**: the new
  getter-throw branch returns `null` directly, without calling
  `clearRun()`/`clearDraft()` — there is nothing readable to judge (unlike
  the existing malformed-JSON catch, which keeps clearing exactly as it does
  today, unchanged by this PR).
- **The tripwire goes where the change would be made**, not only at the
  loaders: one comment block in `app/capacitor.config.ts` (which has no
  `server` key today — verified this session, `grep -n "server"
  capacitor.config.ts` → no hits) stating that every argument for "the
  getter cannot throw" rests on that absence, plus a one-line pointer at
  each of the three loaders.
- **I-4** Countdown does not leave for Timer unless `saveRun(run) ===
  true` AND `loadRun() !== null` (the consumer's own loader, called once,
  right after the write). Both conditions get an INDEPENDENT test leg — see
  Task 2 — because the antagonist's own finding (above) is that the
  combined condition needs isolating, not just conjoining.
- **I-5 Retry and Cancel — NEVER "Row anyway".** A memory-only run cannot be
  rowed: `Timer.tsx:376` and `LogSession.tsx:1232` both re-read the run with
  `useState(() => loadRun())` at mount and bounce to Today when it is null.
  **The spec's own §5 task-2 line ("Retry and Row anyway wired") is STALE
  prose left over from before I-5 was ruled** — the spec's OWN §2 body text
  is unambiguous ("offers Retry and Cancel — never 'Row anyway'"), Gate 0's
  decision (b) is unambiguous, and this plan follows the ruling, not the
  leftover task-list phrase. Flagged here rather than silently worked
  around (agent-briefing: "if your brief contradicts what you observe, say
  so").
- **I-6** a successful Retry REBUILDS the run at the moment the write lands
  (`attemptBuild(draft, baselines, new Date())`) — never re-writes the run
  object a failed attempt held. `buildRun` stamps `startedAtMs`/
  `phaseStartedAt` from the instant it is handed; re-writing the original
  would charge every second spent on the blocked screen to phase 1
  (antagonist finding, "state stamped BEFORE a new blocking state keeps
  ticking behind it").
- **Gate 0 approved copy, verbatim, never reworded:**
  `Couldn't keep your session on this phone.` (`.mono-status`), `Retry`
  (`.button-outline`), `CANCEL` (the existing `.countdown-cancel`). No
  second sentence — the button already says what to do, matching
  Countdown's own two existing failure branches.
- **Every storage-denial injection is KEY-SCOPED.** A blanket
  `Storage.prototype.setItem`/`getItem` denial makes the blocked state
  unreachable (draft write fails first) or crashes before Today ever
  mounts a probe — so a blanket probe would go green against a screen that
  never rendered, proving nothing. Copy
  `handoffStoreReplay.test.ts`'s `installClosedWriteDenial` key-scoped
  idiom (deny one key, pass every other key to the real implementation via
  a captured `realSetItem`/`realGetItem`).
- **The two §3 legs are:** (a) quota at `RUN_KEY` only — the draft write
  succeeds, the run write throws — driving the real Start→Countdown path to
  the blocked state; (b) whole-storage denial, which stops at
  `useStartWorkout`'s `startError`, Countdown never mounted. **Leg (b) is
  ALREADY SHIPPED** — see Task 3.
- **The capture follows the `connected-ended-error` precedent**
  (`ConnectedSurface.screens.test.tsx` → `toMatchFileSnapshot` →
  `e2e/fixtures/*.html` → `screenshots.spec.ts` swaps it into a real page) —
  never a live quota failure driven through the real e2e stack.
- **Every new assertion gets a NAMED mutation with the failure text it
  produced** (RF21), run and recorded in this plan's own Paste-test evidence
  section (not merely prescribed) — the plan author ran every one of them
  this session. **Commit the real change BEFORE running any mutation
  probe** (RF22) so every revert is a no-op — irrelevant to the
  IMPLEMENTER (who commits per task), but binding on THIS document's own
  paste-test, which used pre-edit file copies and never `git checkout` (see
  the evidence section for the exact copies and the `git status --porcelain`
  proof).
- Typed-lint ratchet: no new suppressions (verified — `pnpm lint` clean,
  no census diff). TDD: failing test first. Per-file coverage for every
  file touched (RF2), read from the coverage TEXT reporter's own per-file
  rows this session (a file below 100% in any column gets its own row; a
  file absent from the table is 100% across all four columns — verified
  behaviour, see the evidence section).
- **Test invocation footguns:** never bare `vitest run`. `pnpm test
  --project client -- <pattern>` silently runs the FULL suite. The scoping
  form that works:
  `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`.
  Read BOTH summary lines ("Test Files" and "Tests").
- House style: no em-dashes in user-facing copy; CSS custom properties only
  (none needed here — every class this PR uses already exists); hit targets
  ≥44×44 (both controls pre-existing, unchanged); contrast computed by
  Gate 0 already (§2 of the spec: message/Cancel 6.69:1, Retry 15.41:1,
  both PASS against 4.5:1) — not recomputed here since no new token is
  introduced.

---

## Reachability and citations, verified at `92eabcfc`

Every subject below was read at THIS head this session — never transcribed
from the spec or the ROADMAP. Cited by SYMBOL, plus a line number ONLY where
it was freshly re-verified this session (this repo's lines move under every
merge — the precedent plan's own rule).

| Subject | Verified location | Note |
| --- | --- | --- |
| `loadRun` | `app/src/session/run.ts`, `export function loadRun` (line 198) | `getItem` sits outside its own `try` today |
| `loadDraft` | `app/src/session/draft.ts`, `export function loadDraft` (line 138) | same shape |
| `loadTodayPick` | `app/src/today/todayPick.ts`, `export function loadTodayPick` (line 48) | `getItem` outside the try; the existing `JSON.parse` try is a SEPARATE, later block |
| `saveRun` | `app/src/session/run.ts`, `export function saveRun` (line 184) | already wraps `setItem` in a try, returns boolean — unchanged by this PR |
| `saveDraft` | `app/src/session/draft.ts`, `export function saveDraft` (line 116) | unchanged |
| `capacitor.config.ts` | `app/capacitor.config.ts` | `grep -n "server" capacitor.config.ts` → no hits (this session) — no `server` block exists |
| Timer's mount read | `app/src/session/Timer.tsx:376`, `const [run, setRun] = useState<SessionRun \| null>(() => loadRun());` | re-verified this session, matches Gate 0's own citation |
| LogSession's mount read | `app/src/session/LogSession.tsx:1232`, `const [run] = useState<SessionRun \| null>(() => loadRun());` | same |
| `useStartWorkout.confirmReplace` | `app/src/session/useStartWorkout.ts:111` | `saveDraft(draft)` fails → `setStartError("Couldn't start this session. Try again.")`, never navigates |
| `useStartWorkout`'s existing quota leg | `app/src/session/useStartWorkout.test.tsx:378`, `"surfaces an inline error and does not navigate when saveDraft fails (quota)"` | blanket `Storage.prototype.setItem` denial, asserts `startError` set AND `"COUNTDOWN SCREEN"` absent — Task 3 leg (b), ALREADY SHIPPED |
| Key-scoped spy precedent | `app/src/monitor/handoffStoreReplay.test.ts:214`, `function installClosedWriteDenial` | captures the real `Storage.prototype.setItem` before installing a key-scoped spy; copied in shape, not imported (different module, different key) |
| Today's own key-scoped precedent | `app/src/today/Today.test.tsx:2194`, `"survives a DENIED storage getter on the monitor key…"` | the EXACT idiom Task 3 leg 1 copies, scoped to `TODAY_PICK_KEY` instead of `MONITOR_RUN_KEY` |
| `loadTodayPick`'s own call site | `app/src/today/Today.tsx:1244`, inside `useState(() => loadTodayPick(today, plan.planKey, plan.doneN))` | confirmed reachable at this head — `Today.tsx:295`'s own `loadRun()` mount read no longer throws once Task 1 lands, so this line is reached |
| `mockReady()`'s default plan | `app/src/today/Today.test.tsx:254`, default `plan ?? PLAN_AT` (`planKey: "sprint", doneN: 11`) | a real plan/pool, needed so `loadTodayPick` is actually called |
| The default pool's first pick | `app/src/today/Today.test.tsx`, the SHUFFLE describe's own first assertion, `"Stationary Front"` | re-used as the "denial reads as absent, falls to the default pick" oracle |
| `ConnectedSurface.screens.test.tsx` precedent | `app/src/workout/ConnectedSurface.screens.test.tsx`, `function capture` | `render(...)`, read `document.querySelector(...)!.outerHTML`, `unmount()`, `toMatchFileSnapshot` — the exact shape Task 4's `Countdown.screens.test.tsx` copies |
| `connected-ended-error`'s screenshot leg | `app/e2e/screenshots.spec.ts`, `showConnectedFixture` + the `CONNECTED_STATES` array/loop | the precedent for `showCountdownFixture` — Task 4 deliberately drops the `TAB_BAR_MARKUP` injection (see Task 4's own note on why) |
| Quota's real shape in this app | `app/e2e/seriesStorage.spec.ts:31`, `"a ~720 KB worst-case MonitorRun round-trips…"` | cited, not re-derived, as evidence quota is a real, live producer in this app |
| `.countdown-screen`'s landscape rule | `app/src/index.css:4014-4019` (the `@media (orientation: landscape)` block right after the base rule) | `min-height` only — no reflow, confirmed by reading the rule this session |
| `hidesTabBar` | `app/src/shell/AppRoutes.tsx:70`, includes `/session/countdown` | confirms the countdown route hides the tab bar — why `showCountdownFixture` needs no `TAB_BAR_MARKUP` |
| ROADMAP's own AUD-011/015 entry | `ROADMAP.md`, `## Codebase-audit owners` → `Audit AUD-011/AUD-015 — storage denial is recoverable before work.` | ticked in Task 4; one of its own sentences is STALE and corrected there (Findings, item 2) |
| Latest cut tag | `git tag --sort=-creatordate` → `v0.35.0` | the release note lands as a NEW item on the already-provisional, untagged `v0.36.0` entry (`app/src/news/content/releaseNotes.ts`), per that entry's own "re-run the range and account for them here" comment |

---

## The additive/behaviour matrix, per task where it bites

| Task | What an existing rower who never hits a denial sees | Proof |
| --- | --- | --- |
| 1 (guards) | Nothing. Present, absent and malformed-JSON all behave byte-identically to today — every EXISTING round-trip/garbage-JSON/unknown-version test in `run.test.ts`/`draft.test.ts`/`todayPick.test.ts` stayed green, unmodified, throughout this session's paste test. Only the NEW getter-throw legs exercise new code. | Measured: `run.test.ts`/`draft.test.ts`/`todayPick.test.ts` together, 90 passed (3 files), before AND after adding the new legs (net +3 tests, 0 regressions) |
| 2 (blocked start) | Nothing changes on a successful build. `attemptBuild` wraps the exact same `buildRun`+`saveRun` pair the effect always called; the ONLY new work per successful build is one extra `loadRun()` call. Proven by the FULL existing `Countdown.test.tsx` suite (28 tests: mount success, effort-only build, F1 mount guard against rebuilding progress, StrictMode double-invoke) staying green with one necessary mock update (Findings, item 1) — not a behaviour change. | Measured: `Countdown.test.tsx`, 35 passed (28 existing + 7 new), 0 regressions after the one StrictMode mock fix |
| 3 (composed legs) | Nothing — both new legs fire ONLY under an injected, key-scoped denial. The ordinary Start→Countdown path is already covered by the pre-existing `useStartWorkout.test.tsx` and `Countdown.test.tsx` suites, unmodified in behaviour. | Same measured runs as Tasks 1/2, plus the composed leg itself (1 new test, `Countdown.test.tsx`'s "quota at the run key, real storage" describe) |
| 4 (capture, gates) | Nothing — the new fixture/screens-test file is dev/test-only. `pnpm dist:grep` proves it (and the mocked `./run` seam) never reach the production bundle. | Measured: `dist-grep: OK — none of the 8 dev-only markers found in dist/client.` |

---

## Task 1: The three guards, their unit legs, and the tripwire

**Files:**

- Modify: `app/src/session/run.ts` (`loadRun`)
- Modify: `app/src/session/draft.ts` (`loadDraft`)
- Modify: `app/src/today/todayPick.ts` (`loadTodayPick`)
- Modify: `app/capacitor.config.ts` (tripwire comment only — no config value changes)
- Test: `app/src/session/run.test.ts`, `app/src/session/draft.test.ts`,
  `app/src/today/todayPick.test.ts`

**Interfaces produced:** none — no new exports, no new fields. Pure
hardening of an existing return contract (`T | null`, unchanged).

- [ ] **Step 1: the failing legs, one per loader.** Each mirrors
      `monitorRun.test.ts`'s own already-shipped "returns null when the
      storage GETTER itself throws" leg (the precedent for this exact
      shape). In `run.test.ts`, immediately after the existing `"returns
      null when nothing is stored"` test:

      ```ts
      // Storage-denial spec (2026-09-03) §1, I-1/I-2 — same idiom
      // `monitorRun.test.ts`'s "returns null when the storage GETTER itself
      // throws" already established for `loadMonitorRun`; this is the same
      // gate for the loader AUD-011's remaining set names first. Bare catch
      // deliberately: the getter's own non-throwing failure paths (no
      // document, storage disabled) surface as a TypeError, not a
      // SecurityError, which a typed catch would let escape.
      it("returns null when the storage GETTER itself throws — denial reads as absent, and nothing is cleared (storage-denial spec §1 I-1/I-2/I-3)", () => {
        const run = freshRun();
        saveRun(run);
        const real = Storage.prototype.getItem;
        const spy = vi
          .spyOn(Storage.prototype, "getItem")
          .mockImplementation(function (
            this: Storage,
            key: string,
          ): string | null {
            if (key === RUN_KEY) {
              throw new DOMException("storage is denied", "SecurityError");
            }
            return real.call(this, key);
          });
        try {
          expect(loadRun()).toBeNull();
        } finally {
          spy.mockRestore();
        }
        // ...and the record is still there once the denial lifts (I-3): an
        // absent READ must never have been a destructive one.
        expect(loadRun()).toStrictEqual(run);
      });
      ```

      `draft.test.ts` (after `"returns null when nothing is stored"`, inside
      the `"saveDraft / loadDraft / clearDraft"` describe):

      ```ts
      // Storage-denial spec (2026-09-03) §1, I-1/I-2 — same idiom
      // `session/run.ts`'s own "returns null when the storage GETTER itself
      // throws" leg. Bare catch: the getter's own non-throwing failure
      // paths surface as a TypeError, not a SecurityError.
      it("returns null when the storage GETTER itself throws — denial reads as absent, and nothing is cleared (storage-denial spec §1 I-1/I-2/I-3)", () => {
        const d = buildDraft(draftInputFor("Hoarfrost", "id-hoarfrost-denied"));
        saveDraft(d);
        const real = Storage.prototype.getItem;
        const spy = vi
          .spyOn(Storage.prototype, "getItem")
          .mockImplementation(function (
            this: Storage,
            key: string,
          ): string | null {
            if (key === DRAFT_KEY) {
              throw new DOMException("storage is denied", "SecurityError");
            }
            return real.call(this, key);
          });
        try {
          expect(loadDraft()).toBeNull();
        } finally {
          spy.mockRestore();
        }
        expect(loadDraft()).toStrictEqual(d);
      });
      ```

      `todayPick.test.ts` (after `"returns null when nothing is stored"`):

      ```ts
      // Storage-denial spec (2026-09-03) §1, I-1/I-2 — same idiom
      // `session/run.ts`'s own leg. This loader never clears on a mismatch
      // either way, so there is no "nothing cleared" half to assert here
      // (unlike run.ts/draft.ts).
      it("returns null when the storage GETTER itself throws (storage-denial spec §1 I-1/I-2)", () => {
        saveTodayPick(base);
        const real = Storage.prototype.getItem;
        const spy = vi
          .spyOn(Storage.prototype, "getItem")
          .mockImplementation(function (
            this: Storage,
            key: string,
          ): string | null {
            if (key === TODAY_PICK_KEY) {
              throw new DOMException("storage is denied", "SecurityError");
            }
            return real.call(this, key);
          });
        try {
          expect(loadTodayPick("2026-08-01", "sprint", 11)).toBeNull();
        } finally {
          spy.mockRestore();
        }
        expect(loadTodayPick("2026-08-01", "sprint", 11)).toBe("w-42");
      });
      ```

- [ ] **Step 2: run; verify red.** Each new leg fails with an UNCAUGHT
      `SecurityError`, not an assertion failure — **measured this session**:
      `run.test.ts` → `SecurityError: storage is denied` at
      `src/session/run.ts:199:28` (inside `loadRun`, the un-guarded
      `localStorage.getItem` call), `Tests 1 failed | 33 passed (34)`;
      `draft.test.ts` → same shape at `draft.ts:139:28`, `Tests 1 failed |
      40 passed (41)`; `todayPick.test.ts` → same shape at
      `todayPick.ts:53:28`, `Tests 1 failed | 14 passed (15)`. Quote what you
      actually get.

- [ ] **Step 3: the three guards.** In `app/src/session/run.ts`, replace the
      unguarded `getItem` line inside `loadRun`:

      ```ts
      export function loadRun(): SessionRun | null {
        let raw: string | null;
        try {
          raw = localStorage.getItem(RUN_KEY);
        } catch {
          // Storage-denial spec (2026-09-03) §1 I-1/I-2/I-3: the GETTER itself
          // can throw (WHATWG: a SecurityError on the attribute access fails
          // EVERY access to this origin's storage, not just this call) — read as
          // absent, same as an empty key, and never cleared: there is nothing
          // readable to judge here, unlike the malformed-JSON catch below, which
          // keeps clearing exactly as it does today. Bare catch, not a
          // SecurityError-typed one — the getter's own non-throwing failure
          // paths (no document, a closed page, storage disabled) surface as a
          // TypeError, which a typed catch would let escape (research doc §1).
          return null;
        }
        if (raw === null) return null;
        try {
          // ...unchanged from here
      ```

      `app/src/session/draft.ts`, `loadDraft`:

      ```ts
      export function loadDraft(): SessionDraft | null {
        let raw: string | null;
        try {
          raw = localStorage.getItem(DRAFT_KEY);
        } catch {
          // Storage-denial spec (2026-09-03) §1 I-1/I-2/I-3 — see
          // `session/run.ts`'s `loadRun` for the full rationale; identical
          // shape, this key. Bare catch: the getter's non-throwing failure
          // paths surface as a TypeError, not a SecurityError.
          return null;
        }
        if (raw === null) return null;
        try {
          // ...unchanged from here
      ```

      `app/src/today/todayPick.ts`, `loadTodayPick` (note this loader's
      `JSON.parse` already lives in its OWN, separate `try` — only the
      `getItem` line changes):

      ```ts
        let raw: string | null;
        try {
          raw = localStorage.getItem(TODAY_PICK_KEY);
        } catch {
          // Storage-denial spec (2026-09-03) §1 I-1/I-2 — see `session/run.ts`'s
          // `loadRun` for the full rationale; identical shape, this key. This
          // loader never clears on a mismatch either way, so I-3 needs no
          // separate call-out here.
          return null;
        }
        if (raw === null) return null;
        let parsed: unknown;
        // ...unchanged from here
      ```

- [ ] **Step 4: run; verify green.** All three new legs pass, and the
      FULL pre-existing suite in each file is unchanged — **measured**:
      `run.test.ts`/`draft.test.ts`/`todayPick.test.ts` together, `Test
      Files 3 passed (3)`, `Tests 90 passed (90)`.

- [ ] **Step 5: the tripwire.** `app/capacitor.config.ts`:

      ```ts
      import type { CapacitorConfig } from "@capacitor/cli";

      // TRIPWIRE (storage-denial spec, 2026-09-03, §1; research doc
      // `docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`):
      // every argument that `localStorage`'s GETTER cannot throw on the phone
      // rests on this file declaring NO `server` block. Setting `server.iosScheme`
      // to `"file"` (or any move to `loadHTMLString`) makes the WebView's origin
      // LOCAL — one of WebKit's three routes to a getter `SecurityError`
      // (`ScriptExecutionContext::canAccessResource`) — which would make the
      // throw the three storage guards in `session/run.ts`, `session/draft.ts`
      // and `today/todayPick.ts` exist to catch IMMEDIATELY reachable from
      // ordinary use, not just web-arm hardening.
      const config: CapacitorConfig = {
      ```

      (unchanged below — the object literal itself is untouched).

**Mutation (run this session, not merely prescribed) — remove one loader's
guard, confirm exactly its own leg reddens, restore:**

For each of the three loaders, deleting the `try { raw = … } catch { return
null; }` wrapper (reverting to a bare `const raw = localStorage.getItem(…)`)
and re-running that file's suite reddened **exactly one test, the new
getter-throw leg, as an uncaught exception** — no other test in the file was
touched:

- `run.ts`: `Tests 1 failed | 33 passed (34)` — `SecurityError: storage is
  denied` at `loadRun src/session/run.ts:199:28`.
- `draft.ts`: `Tests 1 failed | 40 passed (41)` — same shape at
  `loadDraft src/session/draft.ts:139:28`.
- `todayPick.ts`: `Tests 1 failed | 14 passed (15)` — same shape at
  `loadTodayPick src/today/todayPick.ts:53:28`.

Each was restored from its pre-edit copy (see Paste-test evidence) before
the next mutation ran.

---

## Task 2: Countdown's blocked start

**Files:**

- Modify: `app/src/session/Countdown.tsx`
- Modify: `app/src/session/Countdown.test.tsx`

**Interfaces produced:** one new exported pure function,
`attemptBuild(draft: SessionDraft, baselines: Baselines | null, now: Date):
SessionRun | null` (module scope, `session/Countdown.tsx`, beside
`hasRunProgress`); one new internal render boolean, `saveBlocked`; one new
internal function, `handleRetry`. No prop, no route, no new component.

- [ ] **Step 1: the failing legs.** Three isolate I-4's two conditions
      independently against the REAL `run.ts` (not a mocked seam — cheaper
      and more precise than driving each half through a full render), and
      three drive the actual SCREEN once `attemptBuild` returns `null`.
      Place the `attemptBuild` describe block, and the screen-level describe
      block, right after the existing `"Countdown — F1 mount guard against
      rebuilding a progressed run"` describe closes (`Countdown.test.tsx`).
      Add to the file's imports first:

      ```ts
      import { attemptBuild, hasRunProgress } from "./Countdown";
      import { loadRun, RUN_KEY, saveRun, type SessionRun } from "./run";
      ```

      ```ts
      // Storage-denial spec (2026-09-03) §2, I-4 — `attemptBuild` tested
      // directly with the REAL `run.ts` (never a mocked seam), controlling
      // only `Storage.prototype.setItem` — the same key-scoped idiom
      // `handoffStoreReplay.test.ts` established. Cheaper and more precise
      // than driving it through a full Countdown render for the two
      // conditions I-4 combines with `||`: each leg below isolates ONE half
      // by making the OTHER half true on its own, so a mutation that drops
      // either half is caught by exactly one leg, never both at once.
      describe("attemptBuild (storage-denial spec §2, I-4)", () => {
        it("returns the built run when the write succeeds and reads back", () => {
          const draft = hoarfrostDraft();
          const run = attemptBuild(draft, BASELINES, new Date());
          expect(run).not.toBeNull();
          expect(loadRun()).toStrictEqual(run);
        });

        it("returns null when the write throws, even though the run key still holds an OLD, unrelated value (I-4's boolean half, isolated from the read-back half)", () => {
          const draft = hoarfrostDraft();
          // A stale run already sitting in storage BEFORE the denied write
          // below — proves this leg exercises the BOOLEAN half specifically:
          // `loadRun()` after the failed write still finds something (this
          // old record), so only `saveRun`'s own returned boolean can be
          // what blocks the build.
          const stale = buildRun(
            draft,
            BASELINES,
            new Date("2026-01-01T00:00:00.000Z"),
          );
          saveRun(stale);
          const realSetItem = Storage.prototype.setItem;
          const spy = vi
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(function (
              this: Storage,
              key: string,
              value: string,
            ) {
              if (key === RUN_KEY) {
                throw new DOMException("quota exceeded", "QuotaExceededError");
              }
              return realSetItem.call(this, key, value);
            });
          try {
            expect(attemptBuild(draft, BASELINES, new Date())).toBeNull();
          } finally {
            spy.mockRestore();
          }
          expect(loadRun()).toStrictEqual(stale);
        });

        it("returns null when the write appears to succeed but nothing is actually readable back (I-4's read-back half, isolated from the boolean half)", () => {
          const draft = hoarfrostDraft();
          const realSetItem = Storage.prototype.setItem;
          // "Succeeds" (never throws, so `saveRun` returns `true`) without
          // actually writing the run key — the shape I-4's own comment says
          // no supported producer has shown, modelled here anyway so the
          // read-back half has a leg that cannot pass by the boolean half
          // alone.
          const spy = vi
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(function (
              this: Storage,
              key: string,
              value: string,
            ) {
              if (key === RUN_KEY) return;
              return realSetItem.call(this, key, value);
            });
          try {
            expect(attemptBuild(draft, BASELINES, new Date())).toBeNull();
          } finally {
            spy.mockRestore();
          }
        });
      });

      // Storage-denial spec (2026-09-03) §2 — Gate 0 APPROVED by James
      // 2026-09-03 (`docs/superpowers/specs/2026-09-03-blocked-start-gate.html`).
      // Module-mocked `./run` (not real storage — `attemptBuild`'s own
      // describe block above already covers the real-storage half of I-4);
      // this describe is about what the SCREEN does once `attemptBuild` has
      // returned `null`.
      describe("Countdown — the blocked start (AUD-015, storage-denial spec §2)", () => {
        it("shows the blocked-start message and Retry/Cancel, and never renders GET ON THE HANDLE, when the run write fails", async () => {
          mockAdapters();
          vi.doMock("./run", () => ({
            saveRun: () => false,
            loadRun: () => null,
            clearRun: vi.fn(),
          }));
          saveDraft(hoarfrostDraft());
          await renderCountdown();

          expect(
            await screen.findByText("Couldn't keep your session on this phone."),
          ).toBeInTheDocument();
          expect(
            screen.getByRole("button", { name: "Retry" }),
          ).toBeInTheDocument();
          expect(
            screen.getByRole("button", { name: "CANCEL" }),
          ).toBeInTheDocument();
          expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();
        });

        it("Retry rebuilds a FRESH run rather than re-saving the run the failed mount attempt held, and the count reopens at the full configured length", async () => {
          mockAdapters();
          const saved: SessionRun[] = [];
          let attempt = 0;
          vi.doMock("./run", () => ({
            // Mount's own attempt fails; Retry's own attempt succeeds — models
            // the recoverable case Gate 0's copy exists for.
            saveRun: (r: SessionRun) => {
              attempt += 1;
              saved.push(r);
              return attempt > 1;
            },
            loadRun: () => (attempt > 1 ? saved[saved.length - 1] : null),
            clearRun: vi.fn(),
          }));
          saveDraft(hoarfrostDraft());
          await renderCountdown();
          await screen.findByText("Couldn't keep your session on this phone.");

          await userEvent.click(screen.getByRole("button", { name: "Retry" }));

          expect(await screen.findByText("GET ON THE HANDLE")).toBeInTheDocument();
          // Gate 0 decision (c): the count reopens at the full configured
          // length (10, this file's READY_PREFS), not wherever a stalled
          // count would have been.
          expect(screen.getByText("10")).toBeInTheDocument();
          expect(saved).toHaveLength(2);
          // The mutation this leg exists to catch (Retry re-saving the SAME
          // run object the failed mount attempt built) would make these equal.
          expect(saved[1]!.startedAt).not.toBe(saved[0]!.startedAt);
        });

        it("Retry stays on the blocked-start state, offering Retry again, when the phone is still refusing the write", async () => {
          mockAdapters();
          vi.doMock("./run", () => ({
            saveRun: () => false,
            loadRun: () => null,
            clearRun: vi.fn(),
          }));
          saveDraft(hoarfrostDraft());
          await renderCountdown();
          await screen.findByText("Couldn't keep your session on this phone.");

          await userEvent.click(screen.getByRole("button", { name: "Retry" }));

          expect(
            await screen.findByText("Couldn't keep your session on this phone."),
          ).toBeInTheDocument();
          expect(screen.queryByText("GET ON THE HANDLE")).not.toBeInTheDocument();
        });

        it("CANCEL from the blocked state clears the draft and the run, and navigates to the workout's own page", async () => {
          mockAdapters();
          const clearRunSpy = vi.fn();
          vi.doMock("./run", () => ({
            saveRun: () => false,
            loadRun: () => null,
            clearRun: clearRunSpy,
          }));
          saveDraft(hoarfrostDraft());
          await renderCountdown();
          await screen.findByText("Couldn't keep your session on this phone.");

          await userEvent.click(screen.getByRole("button", { name: "CANCEL" }));

          expect(await screen.findByText("DETAIL SCREEN")).toBeInTheDocument();
          expect(clearRunSpy).toHaveBeenCalledTimes(1);
          expect(loadDraft()).toBeNull();
        });
      });
      ```

      **Also fix the pre-existing StrictMode test** (Findings, item 1) —
      its `./run` mock returns `loadRun: () => null` unconditionally, which
      I-4's new read-back call (a SECOND `loadRun()` inside the build
      effect) reads as "blocked" even on the success path this test asserts:

      ```ts
      // `loadRun` still has to return something (F1's own mount guard reads
      // it too, now) — `null`, the ordinary "nothing sitting in storage yet"
      // case this test's own fixture actually is at MOUNT. Storage-denial
      // spec §2's I-4 read-back adds a SECOND `loadRun()` call, right after
      // `saveRun`, inside the build effect itself — this fixture must not
      // keep returning `null` there too, or every build in this file would
      // read as blocked. Returning the just-`saveRun`'d run on every call
      // after the first (mount's own) gives both callers what they need from
      // one mock, without this test caring what shape the run itself is.
      mockAdapters();
      const saveRunSpy = vi.fn((_r: SessionRun) => true);
      vi.doMock("./run", () => ({
        saveRun: saveRunSpy,
        loadRun: () =>
          saveRunSpy.mock.calls.length > 0 ? saveRunSpy.mock.calls[0]![0] : null,
      }));
      ```

- [ ] **Step 2: run; verify red.** All 7 new legs fail against the
      unmodified `Countdown.tsx` — the `attemptBuild` legs fail because
      `attemptBuild` does not exist yet (a TypeScript compile error, not a
      runtime failure — the implementer sees this at `pnpm typecheck` before
      the test even runs); the screen-level legs fail because `saveBlocked`
      never renders (`findByText("Couldn't keep your session on this
      phone.")` times out). The StrictMode test, unmodified, still passes at
      this point (its own bug hasn't been introduced yet).

- [ ] **Step 3: the implementation.** In `app/src/session/Countdown.tsx`,
      insert `attemptBuild` right after `hasRunProgress`'s closing brace and
      before the `Built` interface:

      ```ts
      /** I-4 (storage-denial spec §2, 2026-09-03): the one place Countdown
       *  decides a run is durable enough to hand off to Timer. `saveRun`'s own
       *  boolean means only that `setItem` did not throw — there is no
       *  read-back inside it (`run.ts`). This confirms with the CONSUMER's own
       *  loader, once, so Timer/LogSession's shared `useState(() => loadRun())`
       *  mount-read can never disagree with what Countdown just decided. Returns
       *  the built run only when BOTH `saveRun(run) === true` AND
       *  `loadRun() !== null` hold; `null` otherwise, which the build effect and
       *  Retry both read as "blocked". A pure function of its three arguments —
       *  never reads `Date.now()` itself — so a caller controls exactly which
       *  instant gets stamped (the build effect's own `now`, or a fresh one at
       *  Retry). Exported for direct testing, same pattern as
       *  `remainingSeconds`/`hasRunProgress` above. */
      // eslint-disable-next-line react-refresh/only-export-components
      export function attemptBuild(
        draft: SessionDraft,
        baselines: Baselines | null,
        now: Date,
      ): SessionRun | null {
        const run = buildRun(draft, baselines, now);
        if (!saveRun(run) || loadRun() === null) return null;
        return run;
      }
      ```

      After `const [built, setBuilt] = useState<Built | null>(null);`:

      ```ts
        // AUD-015 / storage-denial spec §2: `attemptBuild` returned `null` — the
        // run write failed I-4's check. A SEPARATE boolean rather than folding a
        // third arm into `Built | null | "blocked"`: `built` stays exactly what
        // it always was ("the last thing that built successfully"), which is
        // what Retry's own comment below needs to stay true after a Retry that
        // fails a second time.
        const [saveBlocked, setSaveBlocked] = useState(false);
      ```

      Replace the build effect's own `const run = buildRun(draft, baselines,
      now); saveRun(run); void Promise.resolve().then(() => { setBuilt({ …
      }); });` block with:

      ```ts
        const run = attemptBuild(draft, baselines, now);
        void Promise.resolve().then(() => {
          if (run === null) {
            // I-4: the write failed, or failed to read back. The render below
            // takes over from here — Retry re-runs this same
            // buildRun+saveRun+read-back sequence at `handleRetry`, never this
            // effect again (`builtRef.current` is already true).
            setSaveBlocked(true);
            return;
          }
          setBuilt({
            run,
            clock: { total: countdownSeconds, startedAtMs },
            nowMs: startedAtMs,
          });
        });
      ```

      (Its neighbouring comment beginning `// buildRun + saveRun ARE this
      effect's real work` gets its first clause updated to `` `attemptBuild`
      (buildRun + saveRun + I-4's read-back) IS this effect's real work ``
      — a documentation-only edit, no gate.)

      Between the `blocksWithoutBaselines` render branch's closing `}` and
      the `if (built === null)` branch:

      ```tsx
        // Gate 0 (storage-denial spec §2, APPROVED by James 2026-09-03): the
        // run write failed I-4's check (`attemptBuild` returned `null`). Both
        // hooks are READY by this point (every loading/error branch above
        // already returned), which is what lets `handleRetry` below read
        // `preferencesState.preferences` without its own loading/error branch —
        // see its own re-check for why that narrowing still needs restating
        // inside the closure.
        if (saveBlocked) {
          return (
            <main className="screen countdown-screen">
              <p className="mono-status">Couldn't keep your session on this phone.</p>
              <div className="countdown-actions">
                <button
                  type="button"
                  className="button-outline"
                  onClick={handleRetry}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="countdown-cancel"
                  onClick={handleCancel}
                >
                  CANCEL
                </button>
              </div>
            </main>
          );
        }
      ```

      Right after `handleCancel`'s closing `}` (function declarations are
      hoisted, so its textual position doesn't gate the branch above, which
      already calls it — same reasoning `handleCancel` itself documents for
      its own placement relative to its callers):

      ```ts
        // Gate 0 decision (c): a successful Retry REBUILDS the run at the moment
        // the write lands (`attemptBuild(draft, baselines, new Date())`), never
        // re-writes the run the failed mount attempt held — `buildRun` stamps
        // `startedAtMs`/`phaseStartedAt` from the instant it is handed (the
        // build effect's own comment above), so re-writing the original object
        // would silently charge every second spent on this blocked screen to
        // phase 1. Same TS-narrowing note as `handleCancel` above: the guard
        // clauses higher up in this render don't propagate into a closure
        // defined this much later in the same function body, so this re-checks
        // `draft`/`preferencesState` itself rather than trusting the outer
        // narrowing. UNGATED BY DESIGN, same as `handleCancel`'s identical
        // `draft === null` guard above (RF21 — a test that cannot fail is
        // decoration): Retry only RENDERS inside the `saveBlocked` branch, which
        // is reachable only once every loading/error/unset-baselines branch
        // above has already returned, so both conditions are unreachable through
        // any supported path by the time a rower can press this button.
        function handleRetry() {
          if (draft === null) return;
          if (preferencesState.state !== "ready") return;
          const baselines = resolvedBaselines;
          const countdownSeconds = preferencesState.preferences.countdownSeconds;
          const now = new Date();
          const startedAtMs = now.getTime();
          const run = attemptBuild(draft, baselines, now);
          if (run === null) {
            setSaveBlocked(true);
            return;
          }
          setSaveBlocked(false);
          setBuilt({
            run,
            clock: { total: countdownSeconds, startedAtMs },
            nowMs: startedAtMs,
          });
        }
      ```

      **Prettier will re-wrap the `<p className="mono-status">…</p>` line's
      neighbouring Retry `<button>` onto multiple lines** (measured this
      session: `npx prettier --write src/session/Countdown.tsx` wrapped the
      Retry button's three attributes; the `<p>` line itself is exactly 80
      columns and stays on one line). Run `pnpm format:check` and take
      Prettier's own reflow rather than hand-wrapping.

- [ ] **Step 4: run; verify green.** `Countdown.test.tsx`: `Test Files 1
      passed (1)`, `Tests 35 passed (35)` — **measured this session**, 28
      pre-existing + 7 new, zero regressions.

**Mutations (run this session, restored after each):**

| Mutation | What it does | Result — measured |
| --- | --- | --- |
| Drop the boolean half: `if (!saveRun(run) \|\| loadRun() === null) return null;` → `saveRun(run); if (loadRun() === null) return null;` | `attemptBuild` ignores `saveRun`'s own return value | `Tests 1 failed \| 34 passed (35)` — exactly the "I-4's boolean half, isolated" leg, `AssertionError: expected {…} not to be null` |
| Drop the read-back half: `if (!saveRun(run)) return null; loadRun();` (call it, discard the result) | `attemptBuild` never checks the consumer's own loader | `Tests 1 failed \| 34 passed (35)` — exactly the "I-4's read-back half, isolated" leg, same shape |
| Disable the whole render branch: `if (saveBlocked) {` → `if (false && saveBlocked) {` | The screen never shows the blocked state at all | `Tests 4 failed \| 31 passed (35)` — exactly the 4 blocked-state legs (3 module-mocked + the Task 3 real-storage leg below), nothing else |
| Retry reuses the mount-built run instead of a fresh `attemptBuild` call (a `mountRunRef` capturing the pre-save `buildRun` result at mount, `handleRetry` reduced to `saveRun(mountRunRef.current)` + read-back, no fresh `buildRun`) | Models the exact antagonist-named regression: the dwell before Retry is pressed is silently charged to phase 1 | `Tests 1 failed \| 34 passed (35)` — exactly the "Retry rebuilds a FRESH run" leg, `AssertionError: expected '<ts>' not to be '<ts>'` (both timestamps identical) |

Each mutation was applied to a scratch copy of `Countdown.tsx`, the file
suite re-run, the result quoted above, then restored from the pre-mutation
copy (`cp`, never `git checkout`) before the next mutation.

---

## Task 3: The two composed §3 legs

**Files:**

- Modify: `app/src/today/Today.test.tsx` (leg 1)
- Modify: `app/src/session/Countdown.test.tsx` (leg 2, same file as Task 2's
  new describe blocks — add this describe after them)
- Modify: `app/src/session/useStartWorkout.test.tsx` (leg 3 — ALREADY
  SHIPPED; one traceability comment only, no new test)

**Interfaces produced:** none.

- [ ] **Step 1: leg 1 — the Today fixture that reaches `loadTodayPick`.**
      In `Today.test.tsx`, right after the existing `"survives a DENIED
      storage getter on the monitor key…"` test, inside the same describe
      block:

      ```ts
      // Storage-denial spec (2026-09-03) §1/§3 leg 1 — the anchor's own
      // condition (1): a Today fixture that actually reaches `loadTodayPick`.
      // The audit's original mounted-Today probe never got there because
      // `loadRun()` (Today.tsx's mount) threw first; this PR's Task 1 closes
      // that loader, so THIS is the first test that can exercise
      // `loadTodayPick`'s own guard through a real Today mount. `mockReady()`'s
      // default PLAN_AT (planKey "sprint", doneN 11) is a real plan/pool, not
      // freestyle — needed so this call is reached at all. SCOPED TO THIS KEY
      // ON PURPOSE, same reasoning as the MONITOR_RUN_KEY test above: a
      // blanket denial still dies at `loadRun()` first and would prove nothing
      // about this loader.
      it("survives a DENIED storage getter on the today-pick key: Today mounts, and the daily pick reads as absent (storage-denial spec §1/§3)", async () => {
        mockReady();
        const real = Storage.prototype.getItem;
        const spy = vi
          .spyOn(Storage.prototype, "getItem")
          .mockImplementation(function (
            this: Storage,
            key: string,
          ): string | null {
            if (key === TODAY_PICK_KEY) {
              throw new DOMException("storage is denied", "SecurityError");
            }
            return real.call(this, key);
          });
        try {
          await renderToday();
          // Mounts cleanly — the throw is absorbed, not surfaced — and falls
          // back to the pool's own least-recently-done pick (the same default
          // the SHUFFLE describe block's first assertion pins for this exact
          // `mockReady()` fixture), proving the denial read as ABSENT rather
          // than merely "did not crash".
          expect(
            await screen.findByRole("heading", { name: "Stationary Front" }),
          ).toBeInTheDocument();
        } finally {
          spy.mockRestore();
        }
      });
      ```

      `TODAY_PICK_KEY` is already imported at the top of this file
      (`import { TODAY_PICK_KEY, todayDateString } from "./todayPick";`) —
      no new import needed.

- [ ] **Step 2: run; verify red, then green.** Before Task 1's guard lands,
      this test crashes the render (an uncaught `SecurityError` inside
      `Today.tsx`'s `useState` initializer). After Task 1: `Today.test.tsx`,
      `Tests` — the new leg passes alongside all 132 pre-existing (`Test
      Files 1 passed (1)`, `Tests 133 passed (133)` — **measured**).

- [ ] **Step 3: leg 2 — quota at the run key, real storage.** In
      `Countdown.test.tsx`, right after Task 2's `"Countdown — the blocked
      start"` describe block closes:

      ```ts
      // Storage-denial spec (2026-09-03) §3 leg 1 (antagonist ledger,
      // 2026-09-03 DELTA pass) — quota at the RUN key, through the REAL
      // `run.ts`/`draft.ts` (not the mocked seam the describe block above
      // uses). `saveDraft` succeeds for real (`DRAFT_KEY` untouched), so this
      // is the actual "draft committed, countdown reached, THEN the write
      // fails" ordering the anchor asked for — RF24's shape, starting
      // upstream of the failing write. KEY-SCOPED ON PURPOSE: a blanket
      // `setItem` denial would deny `DRAFT_KEY` too and never reach Countdown
      // at all — that is the OTHER leg
      // (`useStartWorkout.test.tsx`'s "surfaces an inline error and does not
      // navigate when saveDraft fails (quota)"), already shipped, and this
      // leg would be a mirror of it if it used a blanket denial too.
      describe("Countdown — quota at the run key, real storage (storage-denial spec §3)", () => {
        it("shows the blocked-start state when the real setItem throws for the run key only", async () => {
          mockAdapters();
          saveDraft(hoarfrostDraft());
          const realSetItem = Storage.prototype.setItem;
          const spy = vi
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(function (
              this: Storage,
              key: string,
              value: string,
            ) {
              if (key === RUN_KEY) {
                throw new DOMException("quota exceeded", "QuotaExceededError");
              }
              return realSetItem.call(this, key, value);
            });
          try {
            await renderCountdown();
            expect(
              await screen.findByText(
                "Couldn't keep your session on this phone.",
              ),
            ).toBeInTheDocument();
            expect(loadRun()).toBeNull();
          } finally {
            spy.mockRestore();
          }
        });
      });
      ```

- [ ] **Step 4: run; verify green.** This leg passes against Task 1+2's
      implementation with no further product changes — it exercises the
      REAL `run.ts` and `draft.ts` (unmocked), proving the composition
      works end to end, not merely under a mocked module. **Measured**:
      folded into the same `Countdown.test.tsx` run as Task 2 — `Tests 35
      passed (35)` includes this leg.

- [ ] **Step 5: leg 3 — whole-storage denial. NO NEW TEST.** This leg is
      ALREADY SHIPPED: `useStartWorkout.test.tsx`'s `"surfaces an inline
      error and does not navigate when saveDraft fails (quota)"`
      (line 378) already blankets `Storage.prototype.setItem`, asserts
      `startError` is set to `"Couldn't start this session. Try again."`,
      and asserts `"COUNTDOWN SCREEN"` never appears — exactly "whole-storage
      denial stops one screen earlier". Add ONE traceability comment, no
      test change:

      ```ts
        // Storage-denial spec (2026-09-03) §3 leg 2: this blanket `setItem`
        // denial is ALREADY the "whole-storage denial stops one screen earlier"
        // leg the spec's own §3 asks for — `startError` set, Countdown never
        // reached — nothing new is owed here.
        it("surfaces an inline error and does not navigate when saveDraft fails (quota)", async () => {
      ```

**Mutation:** already covered — Task 1's per-loader mutations and Task 2's
render-branch-disable mutation both bite this leg's own assertions too (the
render-branch mutation's `Tests 4 failed | 31 passed (35)` result INCLUDES
this leg, confirmed above). No separate mutation owed for leg 3: it asserts
against `useStartWorkout.ts`'s pre-existing, unmodified `confirmReplace`
logic, which this PR does not touch.

---

## Task 4: The capture, e2e, screenshots, dist:grep, full suite, coverage, ROADMAP, release note, PR body

**Files:**

- Add: `app/src/session/Countdown.screens.test.tsx`
- Add (generated): `app/e2e/fixtures/countdown-blocked-start.html`
- Modify: `app/e2e/screenshots.spec.ts`
- Modify: `ROADMAP.md`
- Modify: `app/src/news/content/releaseNotes.ts`

- [ ] **Step 1: the fixture-generating screens test.** Follows
      `ConnectedSurface.screens.test.tsx`'s exact shape (render the real
      component, read `outerHTML`, `toMatchFileSnapshot`), reduced to one
      state and no shared fixture-building helpers (this component takes no
      props — everything is hooks/module state, mocked). Full file:

      ```tsx
      // The Countdown blocked-start screen's fixture — same rationale as
      // `ConnectedSurface.screens.test.tsx`'s file header. This state needs a
      // REAL denied localStorage write, which the e2e stack cannot produce (it
      // serves a production bundle, and storage-denial spec §3/§5 rules out
      // driving a live quota failure through the stack for the capture — the
      // `connected-ended-error` precedent this file follows instead). So: this
      // file renders the REAL `Countdown` component tree, with the run write
      // denied via a mocked `./run`, and writes the resulting markup to
      // `e2e/fixtures/`. `e2e/screenshots.spec.ts` loads the real app (real
      // `index.css`, real self-hosted fonts) and swaps this markup into the page.
      //
      // The fixture CANNOT go stale: `toMatchFileSnapshot` writes it when absent
      // and FAILS when the component's output no longer matches, so a copy or
      // layout change that isn't re-photographed breaks this test first.

      import { render, screen } from "@testing-library/react";
      import { MemoryRouter, Route, Routes } from "react-router-dom";
      import { describe, expect, it, vi } from "vitest";
      import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
      import type { WorkoutType } from "../../domain/types.js";
      import { buildDraft, saveDraft } from "./draft";

      const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
      const READY_PREFS = {
        difficulties: [] as never[],
        timeCapMinutes: 60,
        countdownSeconds: 10,
      };

      // Tropical Wave: Gate 0's own fixture (`2026-09-03-blocked-start-gate.html`
      // — "5 x 500m at 2k+2", target split 1:52.0), so the approved artboard and
      // this capture show the identical numbers.
      function tropicalWaveDraft() {
        const w = LIBRARY_WORKOUTS.find((s) => s.title === "Tropical Wave");
        if (!w) throw new Error("missing library fixture: Tropical Wave");
        return buildDraft({
          id: "id-tropical-wave",
          title: w.title,
          type: w.type as WorkoutType,
          steps: w.steps,
        });
      }

      function mockAdapters() {
        vi.doMock("../api/useBaselines", () => ({
          useBaselines: () => ({ state: "ready", baselines: BASELINES }),
        }));
        vi.doMock("../api/usePreferences", () => ({
          usePreferences: () => ({ state: "ready", preferences: READY_PREFS }),
        }));
        vi.doMock("../adapters/keepAwake", () => ({
          keepAwakeOn: vi.fn(async () => {}),
          keepAwakeOff: vi.fn(async () => {}),
        }));
        // The run write denied — the state this whole file exists to capture.
        vi.doMock("./run", () => ({
          saveRun: () => false,
          loadRun: () => null,
          clearRun: vi.fn(),
        }));
      }

      describe("Countdown screen fixtures", () => {
        it("the blocked start (AUD-011/015 storage-denial spec §2, Gate 0 APPROVED 2026-09-03)", async () => {
          localStorage.clear();
          mockAdapters();
          saveDraft(tropicalWaveDraft());
          const { default: Countdown } = await import("./Countdown");
          const view = render(
            <MemoryRouter initialEntries={["/session/countdown"]}>
              <Routes>
                <Route path="/session/countdown" element={<Countdown />} />
              </Routes>
            </MemoryRouter>,
          );
          await screen.findByText("Couldn't keep your session on this phone.");
          const html = document.querySelector("main.countdown-screen")!.outerHTML;
          view.unmount();
          await expect(html).toMatchFileSnapshot(
            "../../e2e/fixtures/countdown-blocked-start.html",
          );
        });
      });
      ```

- [ ] **Step 2: run; the fixture is written.** `pnpm test --project client
      src/session/Countdown.screens.test.tsx` (scoped invocation — see
      Global Constraints for the exact form). **Measured this session:**
      `Snapshots 1 written`, `Tests 1 passed (1)`; the generated file's full
      content:

      ```html
      <main class="screen countdown-screen"><p class="mono-status">Couldn't keep your session on this phone.</p><div class="countdown-actions"><button type="button" class="button-outline">Retry</button><button type="button" class="countdown-cancel">CANCEL</button></div></main>
      ```

      Byte-identical to the Gate 0 artboard's own markup for this state.
      Commit this generated file — it is not derived at build time.

- [ ] **Step 3: the screenshots.** In `app/e2e/screenshots.spec.ts`, right
      after the `for (const name of CONNECTED_STATES) { … }` loop's closing
      `}`:

      ```ts
      // --- AUD-011/015: the blocked-start state, both orientations -------------
      //
      // Same rationale as the connected-fixture section above: this state needs a
      // REAL denied localStorage write, which the e2e stack cannot produce (a
      // production bundle, no injection seam) and which storage-denial spec §3/§5
      // rules out simulating live against a real browser's Storage implementation
      // for a mere capture. So the markup comes from
      // `src/session/Countdown.screens.test.tsx`, which renders the REAL
      // Countdown component tree with the run write denied and writes the
      // resulting markup to `e2e/fixtures/`, kept honest by `toMatchFileSnapshot`
      // the same way `connected-ended-error` already is.
      //
      // No `TAB_BAR_MARKUP` injection here, unlike `showConnectedFixture`:
      // `.countdown-screen`'s own `min-height` formula already subtracts
      // `var(--tap)` unconditionally (index.css, both the portrait and landscape
      // rules), not gated on a `:has()` selector the way the connected surface's
      // is — so the wrapper is structurally accurate with no bar node present,
      // matching what this route actually renders (`hidesTabBar`, AppRoutes.tsx).
      async function showCountdownFixture(page: Page, name: string): Promise<void> {
        const html = readFileSync(path.join(CONNECTED_FIXTURES, `${name}.html`), {
          encoding: "utf-8",
        });
        await page.goto("/", { waitUntil: "load" });
        await page.waitForFunction(
          () =>
            getComputedStyle(document.documentElement)
              .getPropertyValue("--page")
              .trim() !== "",
        );
        await page.evaluate((markup) => {
          document.body.innerHTML = `<div class="app-shell">${markup}</div>`;
        }, html);
        await expect(page.locator(".countdown-screen")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
      }

      test("countdown-blocked-start", async ({ page }) => {
        await showCountdownFixture(page, "countdown-blocked-start");
        await expect(
          page.getByText("Couldn't keep your session on this phone."),
        ).toBeVisible();
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, "countdown-blocked-start.png"),
        });
      });

      test("countdown-blocked-start-landscape", async ({ page }) => {
        await page.setViewportSize({ width: 844, height: 390 });
        await showCountdownFixture(page, "countdown-blocked-start");
        await expect(
          page.getByText("Couldn't keep your session on this phone."),
        ).toBeVisible();
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, "countdown-blocked-start-landscape.png"),
        });
      });
      ```

      Reuses the EXISTING `CONNECTED_FIXTURES` constant (same directory,
      `e2e/fixtures`) rather than declaring a duplicate — both `readFileSync`
      and `path` are already imported at the top of this file.

- [ ] **Step 4: boot the stack and run just these two.** Per
      `scripts/screenshots.sh`'s own recipe (`stack-env.sh` then `docker
      compose -f compose.yml -f compose.e2e.yml up -d --build --wait`), then
      `pnpm exec playwright test --project=screenshots -g
      "countdown-blocked-start"`. **Measured this session:** `2 passed
      (964ms)`. Both PNGs were opened and read (RF7): portrait and
      landscape both show the mono message, a bordered Retry and the
      existing CANCEL, vertically centred, no clipping, no overlap —
      structurally identical to the Gate 0 artboard's own frames 2 and 5.

- [ ] **Step 5: `pnpm e2e` (RF1 — this diff touches `app/src/`).**
      **Measured this session** (chromium project, full suite, same stack):
      `455 passed (2.1m)`. No new failures anywhere else in the suite.

- [ ] **Step 6: `pnpm build && pnpm dist:grep`.** **Measured:** build
      succeeds (`✓ built in 392ms`; the pre-existing "chunks larger than
      500 kB" warning is unrelated, present before this PR too); `dist:grep`
      → `dist-grep: OK — none of the 8 dev-only markers found in
      dist/client.` This PR adds no dev-only seam — the mocked `./run` seam
      lives only in test files, never imported by production code — so this
      is a regression check, not a new claim.

- [ ] **Step 7: full `pnpm test:coverage`** (all projects unit+client,
      Docker up for integration if run separately) plus `pnpm lint && pnpm
      typecheck && pnpm format:check`. **Measured this session:** `Test
      Files 255 passed (255)`, `Tests 6951 passed | 1 skipped (6952)`.
      Coverage summary: Statements 98.82%, Branches 97.08%, Functions
      98.93%, Lines 99.25% — all above the 90×4 floor, no `ERROR: Coverage
      for …` lines. `pnpm lint`/`pnpm typecheck`/`pnpm format:check` all
      clean, zero new suppressions.

- [ ] **Step 8: per-file coverage (RF2).** Read from the TEXT reporter's
      own per-file rows this session (a file with no row is 100% across all
      four columns — verified: neither `draft.ts` nor `todayPick.ts`
      appears anywhere in the report, and `src/session`'s aggregate row
      (99/97.1/99.25/99.65) and `src/today`'s (99.66/98.68/100/100) are
      consistent with both being fully covered):

      | File | Statements | Branches | Functions | Lines | Uncovered |
      | --- | --- | --- | --- | --- | --- |
      | `session/Countdown.tsx` | 96.87% | 92.64% | 100% | 100% | Two branches, both TRACED to source this session (see Findings, items 4/5): `handleCancel`'s pre-existing `draft === null` guard (untouched by this diff — confirmed via `git diff --stat src/session/run.ts`-equivalent for `Countdown.tsx`, the guard sits far outside this PR's own hunks) and `handleRetry`'s two identical, deliberately UNGATED-BY-DESIGN guards (commented in Task 2 Step 3) |
      | `session/run.ts` | 93.33% | 94.59% | 100% | 100% | `isPhaseActual`'s `"stopwatch-elapsed"` branch (module-scope, far from this PR's own diff hunk at `loadRun`) — pre-existing, unrelated, out of scope |
      | `session/draft.ts` | 100% | 100% | 100% | 100% | none |
      | `today/todayPick.ts` | 100% | 100% | 100% | 100% | none |
      | `session/Countdown.screens.test.tsx` | (test file, not source — not gated) | | | | |

- [ ] **Step 9: ROADMAP.** Tick `## Codebase-audit owners` →
      `Audit AUD-011/AUD-015 — storage denial is recoverable before work.`
      with the PR number, and **correct the register's own stale sentence**
      (Findings, item 2): its parenthetical "(2) one COMPOSED denial-then-Start
      test — after AUD-011's fix, denial makes `loadRun()` return null, so
      Start proceeds and then hits `saveRun === false`, a path neither
      finding's own tests cover" is the exact claim the antagonist's DELTA
      pass falsified — replace it with the corrected shape (quota at the run
      key; whole-storage denial stops one screen earlier, already shipped),
      wrapped by hand (root markdown is not Prettier-formatted; never run
      `prettier --write` on it).

- [ ] **Step 10: the release note.** `app/src/news/content/releaseNotes.ts`'s
      `v0.36.0` entry is PROVISIONAL/untagged (its own header comment: "IF
      MORE MERGES LAND BEFORE THE TAG, re-run the range and account for them
      here — this list was accounted at door PR B's head, not at a cut tag";
      `git tag --sort=-creatordate` → `v0.35.0` is still the latest cut tag
      at this head). **Before adding the item, re-run `git log
      v0.35.0..origin/main --oneline`** (no `--merges` — RF15) at the actual
      PR-open head, not this plan's `92eabcfc`, and account for every merge
      in range; append ONE new item to the EXISTING `v0.36.0` `items` array
      (do not create a new version entry unless a tag has been cut in the
      meantime). Tester-visible wording, plain: something in the shape of
      "If your phone can't hold onto the session record when you press
      Start, you now read a sentence — Couldn't keep your session on this
      phone — with a Retry, instead of watching the countdown finish and
      landing back where you started with no explanation." — draft only;
      the implementer owns the exact final wording against the actual merge
      range.

- [ ] **Step 11: commit, push, open the PR** with the body below. **Present
      and STOP — James merges.**

---

## Gates, and the mutation each must fail under

| Gate | Lives in | Mutation that must make it red | Measured this session |
| --- | --- | --- | --- |
| `loadRun` reads a denied getter as absent | `run.test.ts` | Remove the `try`/`catch` around `getItem` | `Tests 1 failed \| 33 passed (34)`, uncaught `SecurityError` |
| `loadDraft` reads a denied getter as absent | `draft.test.ts` | Same | `Tests 1 failed \| 40 passed (41)` |
| `loadTodayPick` reads a denied getter as absent | `todayPick.test.ts` | Same | `Tests 1 failed \| 14 passed (15)` |
| Today survives a denied `TODAY_PICK_KEY` getter (composed) | `Today.test.tsx` | Same mutation on `todayPick.ts` | `Tests 1 failed \| 132 passed (133)`, crash traced to `Today.tsx:1244` |
| I-4's boolean half | `Countdown.test.tsx` (`attemptBuild` describe) | `if (!saveRun(run) \|\| loadRun() === null)` → drop the `!saveRun(run) \|\|` clause | `Tests 1 failed \| 34 passed (35)` |
| I-4's read-back half | same | Drop the `loadRun() === null` clause | `Tests 1 failed \| 34 passed (35)` |
| The blocked state renders (all 4 legs) | `Countdown.test.tsx` (blocked-start + quota-real-storage describes) | `if (saveBlocked)` → `if (false && saveBlocked)` | `Tests 4 failed \| 31 passed (35)` |
| Retry rebuilds fresh, never resumes | `Countdown.test.tsx` | Reuse the mount-built run object in `handleRetry` instead of a fresh `attemptBuild` call | `Tests 1 failed \| 34 passed (35)`, timestamps equal |
| The fixture cannot go stale | `Countdown.screens.test.tsx` | Drop the copy's trailing period in `Countdown.tsx` | `Tests 1 failed (1)`, `toMatchFileSnapshot` mismatch |
| Quota at the run key reaches the blocked state (real storage) | `Countdown.test.tsx` | Any of the I-4 mutations above (this leg composes both halves through real `run.ts`) | Covered by the same rows |
| Whole-storage denial stops at `useStartWorkout` | `useStartWorkout.test.tsx` (ALREADY SHIPPED) | Not re-mutated this session — pre-existing, unmodified code and test; the render-branch mutation above already confirms `Countdown` renders nothing extra when this leg's own precondition (never reaching Countdown) holds | — |
| No dev-only seam in `dist/` | `pnpm dist:grep` | N/A — a regression check on unmodified tooling; the new mocked `./run` seam lives only in test files, never imported by production code | `dist-grep: OK` |

---

## PR body skeleton

Above the fold: **~120 words, ~25 words per bullet. Count, don't feel.**

```markdown
This PR stops a full phone from silently losing your session.

- Press Start and the countdown now waits for your session to actually
  save. If your phone won't keep it, you read
  "Couldn't keep your session on this phone." with Retry, instead of the
  countdown finishing and dropping you back where you started.
- Retry starts the count over from full — it never resumes a stale one.
  Cancel still clears the draft cleanly.
- Three storage reads that used to crash the app if a browser blocked
  site data now just read as "nothing saved" — dev-loop and browser-fallback
  hardening; the phone can't reach this path today (research inside).
- Try it: block site data for the dev server in your browser, start a
  workout, and watch the countdown.

<details><summary>Record (for agents and audits)</summary>

- Spec: `docs/superpowers/specs/2026-09-03-storage-denial-design.md`
  §1–§5. Gate 0: `docs/superpowers/specs/2026-09-03-blocked-start-gate.html`,
  APPROVED by James 2026-09-03. Research:
  `docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`
  — the getter cannot throw natively on iOS today (no `server` block in
  `capacitor.config.ts`); a tripwire comment marks the one config change
  that would reopen it. Antagonist DELTA pass:
  `.claude/agents/antagonist-ledger.md`, 2026-09-03 entry — two findings
  folded (I-4 narrowed to two independent legs; the composed §3 legs
  corrected from getter-denial to quota-at-the-run-key).
- No stored shape changes anywhere in this PR: no new field, no `v` bump,
  no migration. `attemptBuild` is a new pure function; `saveBlocked` is
  ordinary render state — no RF27 lifetime table is owed.
- Head SHA, commit count, test counts, e2e/screenshots duration —
  reproduced at merge time, not cited from this plan.
- Every mutation from the gates table above with its exact measured
  failure text, run and reverted (never `git checkout`) during this plan's
  own paste test before a line of the prescribed code was handed off.
- Per-file coverage for every touched file (table above); two pre-existing,
  out-of-scope gaps named and left (`run.ts`'s `isPhaseActual` branch,
  `Countdown.tsx`'s `handleCancel` guard); two new UNGATED-BY-DESIGN
  branches in `handleRetry`, each with the comment stating why no test can
  reach them.
- The §3 leg the antagonist retired (whole-storage denial) was ALREADY
  SHIPPED at `useStartWorkout.test.tsx` before this PR — cited, not
  duplicated.
- `pnpm dist:grep` clean; the new mocked seam never reaches the bundle.
- Risk note (what I'd have asked a reviewer to probe): the two I-4 halves
  are independently gated, but only ONE real-storage composed leg drives
  both through the actual `run.ts`/`draft.ts` at once (Task 3's quota leg)
  — a future change to either loader's contract should re-run that leg,
  not just the isolated `attemptBuild` unit legs.

</details>
```

---

## Self-review

**Spec coverage — every §1/§2/§3/§5 requirement maps to a task.**

| Spec | Requirement | Task |
| --- | --- | --- |
| §1 | Three guards, getter wrapped not just parse | 1 |
| §1 I-1 | Denial reads as absent | 1 |
| §1 I-2 | Bare catch, never `SecurityError`-typed | 1 |
| §1 I-3 | No successful path changes; no self-clear on denial | 1 |
| §1 | Tripwire at `capacitor.config.ts` + one line per loader | 1 |
| §1 | Scope: web-arm hardening, dev loop and browser fallback | Global Constraints, PR body |
| §2 I-4 | `saveRun === true` AND `loadRun() !== null`, both independently gated | 2 |
| §2 I-5 | Retry + Cancel, never "Row anyway" | 2 (Global Constraints flags the spec's own stale §5 phrase) |
| §2 I-6 | Retry rebuilds, never re-writes | 2, gated by its own mutation |
| §2 Gate 0 | Copy/controls/restart-from-full, all four decisions | 2, verbatim in the render branch |
| §3 leg (a) | Today fixture reaches `loadTodayPick` | 3 |
| §3 leg (b) | Quota at the run key drives the real Start door | 3 |
| §3 leg (c) | Whole-storage denial stops one screen earlier | 3 (already shipped, cited) |
| §3 | Every injection key-scoped | 1, 2, 3 — every mutation table row is a key-scoped spy |
| §5 task 1 | Guards + legs + mutation per leg | 1 |
| §5 task 2 | Boolean honoured, state rendered, Retry rebuild — **"Row anyway" struck per I-5, see Global Constraints** | 2 |
| §5 task 3 | The two composed tests | 3 |
| §5 task 4 | Capture (fixture precedent), e2e, ROADMAP, release note | 4 |
| §5 | Gates skipped, spoken: no PM open gate, antagonist DELTA (not full) | header, folded from the ledger entry |

**Placeholder scan:** no `TBD`, no "add validation", no "similar to task N".
Gate 0 is APPROVED, so the copy is fixed, not a draft. One deliberate
fill-in remains, marked as such: the release note's exact final wording
(Task 4 Step 10) — the draft is given, the implementer owns the range check
and final phrasing against the actual PR-open head.

**Type consistency:** `attemptBuild`'s signature
(`draft: SessionDraft, baselines: Baselines | null, now: Date): SessionRun |
null`) is the SAME triple the build effect and `handleRetry` both already
compute locally (`draft`, `resolvedBaselines`, a fresh `Date`) — no new type
is introduced, no existing type is widened. `saveBlocked` is a plain
`boolean`, never a third arm of `Built`.

---

## Findings this plan carries that the spec does not name

1. **The pre-existing StrictMode test's `./run` mock needed a fix, found
   only by running it.** `vi.doMock("./run", () => ({ saveRun: saveRunSpy,
   loadRun: () => null }))` modelled `loadRun` as always-null for the F1
   mount guard's benefit; I-4's new SECOND `loadRun()` call (the read-back,
   right after `saveRun` inside the build effect) reads that same
   always-null mock and reports "blocked" even on the test's own intended
   success path. **Measured, not predicted:** running the paste test
   against the shipped `attemptBuild` with the original mock produced `Test
   Files 1 failed | 229 passed (230)`, `Tests 1 failed | 6571 passed | 1
   skipped (6573)` — exactly this one test, nothing else. Fixed by having
   the mock return the just-`saveRun`'d run on every call after the first
   (Task 2 Step 1's own comment explains the shape). This is the concrete
   instance of the antagonist's abstract finding 3 ("Countdown does not
   leave for Timer unless the run is DURABLE" narrowed) — the narrowing
   changes an EXISTING test's own fixture, not just new code.
2. **`ROADMAP.md`'s own AUD-011/015 entry contains the exact claim the
   antagonist's DELTA pass falsified**, verbatim: "(2) one COMPOSED
   denial-then-Start test — after AUD-011's fix, denial makes `loadRun()`
   return null, so Start proceeds and then hits `saveRun === false`, a path
   neither finding's own tests cover." Task 4 Step 9 corrects this sentence
   in the same commit that ticks the item — leaving it standing while
   ticking the checkbox would be exactly RF16's "partial reconciliation
   reads as a done one" failure shape.
3. **Task 3's §3 leg (c) needed no new code** — `useStartWorkout.test.tsx`
   already blankets `setItem` and asserts both halves of "whole-storage
   denial stops one screen earlier" (inline error set, Countdown never
   reached). Building a second copy would be RF11's mirror; a one-line
   traceability comment is the whole diff.
4. **`handleCancel`'s own `if (draft === null) return;` guard is
   pre-existing, uncovered debt, not introduced by this PR.** Confirmed by
   reading the coverage HTML's `cstat-no`/`missing-if-branch` markers this
   session and cross-checking against this PR's own diff hunks (the guard
   sits inside `handleCancel`, which this PR never edits) — named here so
   a reviewer doesn't mistake it for new debt.
5. **`handleRetry`'s two defensive re-checks are new, and deliberately
   UNGATED BY DESIGN** — the identical convention `handleCancel`'s own
   guard already established in this file, for the identical reason (a
   render-order guarantee, not a runtime possibility). Coverage measured
   before this note was added: `Countdown.tsx` at 96.87%/92.64%/100%/100%
   with exactly these two branches (plus item 4's pre-existing one)
   uncovered. A comment was added at the guard itself rather than writing a
   test that could never fail (RF21).
6. **`run.ts`'s `isPhaseActual` branch gap is unrelated and pre-existing** —
   confirmed via `git diff --stat`-equivalent inspection: this PR's only
   hunk in `run.ts` is at `loadRun`, far from `isPhaseActual`'s module-scope
   validator. Out of scope, named so a reviewer doesn't attribute it to this
   diff.
7. **Prettier reflows two of this plan's own prescribed blocks** — the
   Retry `<button>`'s three attributes in `Countdown.tsx` (measured:
   `npx prettier --write` wrapped it onto separate lines; the plan's own
   Task 2 Step 3 code block already carries the wrapped form) and one
   `mockImplementation` signature line in `todayPick.test.ts` (Prettier
   collapsed a hand-wrapped multi-line signature back to one line — also
   already reflected in Task 1 Step 1's code block). Both are stated so the
   implementer pastes the ALREADY-wrapped forms and doesn't need a second
   Prettier pass to discover them independently.

---

## Paste-test evidence — what was RUN, and against what

Everything below was executed in
`/Users/james/projects/github/jamesawesome/Ergomatic-wt-aud/app` at head
`92eabcfc`, with `PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` (Node
v26.5.0). **Every prescribed block above — every loader guard, the
capacitor tripwire, `attemptBuild`, the build effect's rewiring, the
`saveBlocked` render branch, `handleRetry`, every new test in every file
listed, and the fixture/screenshots additions — was extracted to its REAL
path in this worktree, applied with the Edit/Write tools (never a shell
heredoc into the main checkout), and run through the repo's own gates**,
in the order the tasks above present them.

- `pnpm typecheck` — **PASS** throughout (`tsc -b`, `tsc -p
  tsconfig.server.json`, `tsc -p e2e/tsconfig.json`, `E2E TypeScript
  membership: 19/19`), including after the `attemptBuild`
  `saveRunSpy.mock.calls[0]![0]` typing fix (the untyped `vi.fn(() =>
  true)` inferred a zero-argument tuple; `vi.fn((_r: SessionRun) => true)`
  fixed it — the one real TypeScript defect this pass found, caught before
  any test ran).
- `pnpm lint` — **PASS** throughout, clean, zero new suppressions
  (`eslint . && node scripts/eslint-suppression-census.mjs`), including the
  two `// eslint-disable-next-line react-refresh/only-export-components`
  comments (one pre-existing on `hasRunProgress`, one added on
  `attemptBuild`, both required — `pnpm lint` was run with and without the
  new one to confirm it is load-bearing, not decorative, though the run
  with it in place is the only one recorded as the final state).
- `pnpm format:check` — **FAILED once** after Task 2's own first pass
  (`Countdown.tsx`, the Retry button's attributes) and **once more** after
  Task 1's `todayPick.test.ts` leg (a hand-wrapped `mockImplementation`
  signature Prettier preferred on one line) — both taken verbatim via
  `npx prettier --write`, both already reflected in this plan's own
  prescribed code blocks (Findings, item 7). PASS after each.
- `pnpm test --project unit --project client` — **before** the StrictMode
  mock fix (Findings, item 1): `Test Files 1 failed | 229 passed (230)`,
  `Tests 1 failed | 6571 passed | 1 skipped (6573)`. **After the fix**, the
  full paste-test tree: `pnpm test:coverage`'s own run (below) is the
  authoritative all-green number.
- Scoped runs, each **measured and quoted above at its own task step**:
  `run.test.ts`/`draft.test.ts`/`todayPick.test.ts` together — `Test Files
  3 passed (3)`, `Tests 90 passed (90)`. `Countdown.test.tsx` alone —
  `Test Files 1 passed (1)`, `Tests 35 passed (35)`. `Today.test.tsx`
  alone — `Test Files 1 passed (1)`, `Tests 133 passed (133)`.
  `Countdown.screens.test.tsx` — `Snapshots 1 written`, `Tests 1 passed
  (1)`, then `Tests 1 passed (1)` again on a second, idempotent run (no
  drift).
- **Every mutation in the Gates table above was RUN, not merely
  prescribed** — nine mutations total (three loader guards, the composed
  Today leg, I-4's boolean half, I-4's read-back half, the whole
  render-branch disable, the Retry-reuses-stale-run rewrite, and the
  fixture copy drift), each producing the exact failure text quoted in its
  own table row, each restored from a pre-edit copy before the next
  mutation ran. **`git checkout` was never used** — every revert was a
  `cp` from a copy taken under `/tmp/aud-pastetest-backup/` before any edit
  began; `git status --porcelain` in the worktree's ROOT (not just `app/`)
  read EMPTY both before this session's first edit and after its last
  revert (confirmed this session, both times).
- `pnpm test:coverage` — **`Test Files 255 passed (255)`, `Tests 6951
  passed | 1 skipped (6952)`.** Coverage: Statements 98.82% (10378/10501),
  Branches 97.08% (7614/7843), Functions 98.93% (2139/2162), Lines 99.25%
  (9489/9560) — zero `ERROR: Coverage for …` lines, both the 90×4 aggregate
  and the `domain/**` 100% pin held (this PR touches no `domain/` file).
  Run TWICE (once before adding the "Retry stays blocked" leg that Step 8's
  own coverage read demanded, once after) — the second run is the one
  quoted in Task 4 and the per-file table.
- `pnpm build` — **PASS** (`✓ built in 392ms`; the "chunks larger than
  500 kB" warning is pre-existing, unrelated to this diff). `pnpm dist:grep`
  — **`dist-grep: OK — none of the 8 dev-only markers found in
  dist/client.`**
- `pnpm exec playwright test --project=chromium` (the full `pnpm e2e`
  suite, against the real per-worktree compose stack, booted per
  `scripts/e2e.sh`'s own recipe) — **`455 passed (2.1m)`**, zero failures
  anywhere in the suite with all of this plan's changes in place.
- `pnpm exec playwright test --project=screenshots -g
  "countdown-blocked-start"` — **`2 passed (964ms)`**. Both PNGs
  (`docs/screenshots/countdown-blocked-start.png` and
  `-landscape.png`) were opened and read this session: portrait and
  landscape both render the mono message, a bordered Retry button and the
  existing bordered CANCEL, centred in the frame, no clipping, no overlap
  — matching Gate 0's own frames 2 and 5 structurally.
- **Docker stack**: booted via `docker compose -f compose.yml -f
  compose.e2e.yml up -d --build --wait` (per-worktree identity via
  `scripts/stack-env.sh`, `stack: ergomatic-8027`), torn down via `docker
  compose -f compose.yml -f compose.e2e.yml down -v` after every gate above
  had run — **the explicit `-v` form**, per the agent-briefing's own note
  that a bare `down` leaves the per-worktree `pgdata` volume behind.
- **Final state**: every one of the twelve touched/added files was restored
  from its pre-edit copy (the eight modified source/test files from copies
  taken under `/tmp/aud-pastetest-backup/` at the very start of this
  session, before any edit; the two generated artifacts — the fixture HTML
  and the two screenshots — and the one new test file were `rm`'d, since
  they never existed before this session). `git status --porcelain` at the
  worktree root reads EMPTY (confirmed this session, final check).
