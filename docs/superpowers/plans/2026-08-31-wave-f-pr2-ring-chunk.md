# Wave F PR 2 — Ring Chunk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The diagnostics ring becomes durable (last three session logs kept,
not one overwritten slot) and readable (one deliberate door, no session
required), and the resume edge gets the instrument §4's freeze-predicate fix
is waiting on, plus the RC-29 latch counter.

**Architecture:** A small storage module owns a three-slot rotated history
that teardown writes alongside the existing key (which stays, untouched, for
`readMonitorLogStash`). The hook's existing resume handler gains one
first-frame instrument entry and a stale-run terminator entry; teardown's
stash gains a latch-count line. A new quiet You-screen door lists the saved
logs and copies any one.

**Tech Stack:** React 19 client, localStorage, the existing event-ring
(`eventLog.ts`) and replay idioms. No server changes, no migration.

**Spec:** `docs/superpowers/specs/2026-08-31-lifecycle-design.md` §2, §3, §6
(merged; PR 2 row in its Ordering table). Read those sections before any
task.

## Global Constraints

- Worktree: `/Users/james/projects/github/jamesawesome/Ergomatic-wt-ring`
  (branch `wave-f-pr2-ring`). `git rev-parse --show-toplevel` before EVERY
  commit; absolute paths for shell writes (RF20).
- All commands in `<worktree>/app/`.
- **Diagnostics never break the product** — every read/write in this PR
  wraps storage access; a quota error, privacy mode, or denied getter reads
  as absent/no-op (`readMonitorLogStashSafely`'s posture, and the hand-off
  store's §8 rule that a denied GETTER must not escape).
- **`ergomatic:last-session-log` and `readMonitorLogStash` are NOT touched.**
  The history is additive beside them; the `fromMonitor` gate on the inline
  row stays exactly as it is (spec §2: "The gate is not the bug").
- Copy says "monitor", never "PM5" (RC-18). No em-dashes in user-facing
  strings. 44 px tap targets. Contrast computed, stated as numbers.
- **The door UI (Task 3) is behind its own Gate 0** (spec's PR table; PM
  condition P2-6): James approves the rendered screen before Task 3's
  implementation starts. Tasks 1-2 do not wait on it.
- Ring entries record what was MEASURED and assert no cause (RC-25's rule,
  quoted at the `pause-declared` site).
- TDD; commit before mutation probes (RF22); every new assertion gets a
  biting mutation with recorded failure text (RF21); per-file coverage for
  touched files (RF2). Test footguns: scope vitest with `-t`, never
  `-- <pattern>`; read BOTH summary lines.
- No new eslint suppressions.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/monitor/sessionLogHistory.ts` (new) | the three-slot rotated history: write, list, read; never-throw |
| `src/monitor/sessionLogHistory.test.ts` (new) | its unit suite |
| `src/monitor/useMonitorSession.ts` | stash() rotation call; §3 resume instruments; §6 latch counter |
| `src/monitor/useMonitorSession.test.ts` | instrument unit legs |
| `domain/monitor/pm5/parse.ts` + `domain/monitor/types.ts` | additive `rawRowingState` on the frame |
| `src/you/MonitorLogs.tsx` (new) + `src/You.tsx` + `src/shell/AppRoutes.tsx` | the door row, route, and screen |
| `src/index.css` | door/screen styles |
| e2e + screenshots specs | door flow + captures |

---

### Task 1: The three-slot history and the rotation

**Files:**
- Create: `src/monitor/sessionLogHistory.ts`,
  `src/monitor/sessionLogHistory.test.ts`
- Modify: `src/monitor/useMonitorSession.ts` (the `stash()` closure, ~:3395-
  3412 — find it by the `ergomatic:last-session-log` write)

**Interfaces:**
- Produces (Task 3 consumes):

```ts
export interface SessionLogHistoryEntry {
  /** 1 = newest. */
  slot: 1 | 2 | 3;
  /** ISO timestamp written at rotation — the display "when". */
  savedAt: string;
  /** The ring's exported JSON, byte-identical to what teardown stashed. */
  exported: string;
}
/** Rotates `exported` into slot 1, shifting 1→2→3, oldest evicted.
 *  Never throws. */
export function pushSessionLog(exported: string, savedAt: Date): void;
/** Newest-first list of whatever slots exist. Never throws; a corrupt or
 *  denied slot is skipped, not fatal. */
export function listSessionLogs(): SessionLogHistoryEntry[];
```

- Storage shape (client-only diagnostics; additive; no migration): three
  localStorage keys `ergomatic:session-log-h1|h2|h3`, each the JSON
  `{"savedAt": "<ISO>", "exported": "<ring JSON>"}`. Documented in the
  module header as diagnostics-tier data: losable, never a record.

- [ ] **Step 1: failing unit tests** for `pushSessionLog`/`listSessionLogs`:
  rotation order (three pushes → h1 newest, fourth push evicts the oldest);
  list skips a corrupt slot (plant garbage JSON in h2, expect h1+h3);
  DENIED GETTER (mock `Storage.prototype.getItem` to throw — the idiom
  `monitorRun.test.ts`'s "the storage GETTER itself throws" leg uses) reads
  as empty list; denied setItem is a silent no-op. Byte-identity: what goes
  in comes back exact.
- [ ] **Step 2: run, red.** `pnpm exec vitest run --project unit -t
  "sessionLogHistory"` (confirm which project the sibling monitor modules
  run in first; both summary lines).
- [ ] **Step 3: implement** the module (wrap every storage access in try;
  rotation reads h2→h3 then h1→h2 then writes h1).
- [ ] **Step 4: green.**
- [ ] **Step 5: wire the rotation into `stash()`** — one added call
  `pushSessionLog(exported, nowDate())` immediately after the existing
  `localStorage.setItem("ergomatic:last-session-log", exported)` line,
  inside the same try (its catch comment already says "diagnostics never
  break a teardown"). The hook already has a `nowDate` dep — use it, never
  `new Date()` directly if the file's convention injects time (check the
  hook's existing time idiom and follow it).
- [ ] **Step 6: hook-level test**: the existing teardown-stash unit legs in
  `useMonitorSession.test.ts` (find them by `last-session-log`) gain one
  assertion: after two full connect→teardown cycles, `listSessionLogs()`
  returns two entries, newest first, and slot 1's `exported` equals the
  current `last-session-log` value. Run; green.
- [ ] **Step 7: commit**, then **mutations (RF21):** (a) make
  `pushSessionLog` write h1 without shifting → the rotation-order leg goes
  red; (b) remove the `stash()` wiring call → the hook-level leg goes red
  while the module suite stays green (proving the seam leg is the one that
  sees the wiring). Record failure text; revert via git checkout.

### Task 2: The resume-edge instrument (§3) and the latch counter (§6)

**Files:**
- Modify: `domain/monitor/pm5/parse.ts` (the 0x0031 parser — find the
  `rowingState === 1` site its own comment flags),
  `domain/monitor/types.ts` (`MonitorFrame`),
  `src/monitor/useMonitorSession.ts` (the "foreground" branch of the
  lifecycle handler, ~:3830-3870, and the `stash()` closure)
- Test: `domain/monitor/pm5/parse.test.ts`, `src/monitor/useMonitorSession.test.ts`

**Interfaces:**
- Produces: `MonitorFrame.rawRowingState?: number` — the wire byte before
  the strict `=== 1` flattening; additive-optional so every existing
  constructor/fixture compiles unchanged.
- New ring entry kinds (data only, no consumer in this PR):
  - `resume-first-frame` — recorded ONCE on the first 0x0031 after a
    foreground event, detail:
    `gapMs=<ms since last pre-background frame> stale=<bool: freezeKey
    triple identical to the last pre-background frame> rawRowingState=<n>
    framesWhileHidden=<n>`
  - `resume-stale-run` — recorded when the post-resume identical-freezeKey
    run ENDS (a differing frame arrives) or the session tears down first,
    detail: `frames=<count> endedBy=<changed|teardown>`
  - `latch-count` — recorded by `stash()` once per teardown, detail:
    `latches=<n> resumes=<n>`

- [ ] **Step 1: failing parse test** — feed a captured 0x0031 payload whose
  rowingState byte is a non-1 value (build it from the parser test file's
  existing payload helpers) and assert `rawRowingState` carries the raw
  byte while `rowingActive` stays false; a `=== 1` payload carries both
  `true` and `1`.
- [ ] **Step 2: red, implement (additive field in `toMonitorFrame`), green.**
- [ ] **Step 3: failing hook tests** (scripted-transport idiom; the
  lifecycle-event injection idiom is in the existing resume tests — find
  them by `decideResumeLatch` / `app-lifecycle`):
  - (a) background → 3 frames identical to the last pre-background
    freezeKey triple → foreground → next frame: exactly one
    `resume-first-frame` entry with `stale=true`, the measured `gapMs`,
    and the raw byte; a fourth identical frame then a DIFFERENT frame →
    one `resume-stale-run` with `frames=<n> endedBy=changed`.
  - (b) resume where the first frame differs → `stale=false` and NO
    `resume-stale-run` ever.
  - (c) teardown while the identical run is still open →
    `resume-stale-run … endedBy=teardown` appears in the stashed export.
  - (d) two latching resumes then teardown → the stashed export's
    `latch-count` line reads `latches=2 resumes=2`; a non-latching resume
    increments only `resumes`.
- [ ] **Step 4: red, implement.** The first-frame instrument lives in the
  frame handler behind a small ref armed by the foreground branch (the
  handler already owns `framesWhileHiddenRef` with exactly this lifetime —
  mirror its reset discipline); the stale-run tracker is a second ref
  (key + count) cleared at every per-run reset site the file's other
  per-run refs use. The latch counter increments beside the existing
  `update({ frameSilence: true })` latch site; the resume counter beside
  the `app-lifecycle` record. `stash()` records `latch-count` BEFORE
  `exportLog()` so the line rides every stashed copy.
- [ ] **Step 5: green; full unit+client run.**
- [ ] **Step 6: commit, then mutations:** (a) point the staleness compare at
  `elapsedSeconds` instead of the freezeKey triple → leg (a) red (elapsed
  always moves, `stale` would read false); (b) never record
  `resume-stale-run` on teardown → leg (c) red; (c) increment latches on
  every resume → leg (d)'s non-latching half red. Record failure text.

### Task 3: The door — **BLOCKED until its Gate 0 clears**

> **SUPERSEDED IN PART by the approved Gate-0 artifact (rev 3) and the
> external review:** the shipped shape is You → `DIAGNOSTICS` →
> `/you/diagnostics` (menu) → `/you/diagnostics/monitor-logs` — a menu
> layer James added at the gate; the direct `/you/monitor-logs` route below
> is the pre-gate draft. Storage moved to ONE atomic key
> (`ergomatic:session-log-history`) at the review's item 4; the h1/h2/h3
> scheme below is historical. The artifact and the code are the record.


The controller presents the rendered artifact (James approves BEFORE this
task is dispatched). The approved copy and placement then bind verbatim.

**Files:**
- Create: `src/you/MonitorLogs.tsx`, `src/you/MonitorLogs.test.tsx`
- Modify: `src/You.tsx` (one quiet row under `ResetBaselineSetup`),
  `src/shell/AppRoutes.tsx` (route `/you/monitor-logs`), `src/index.css`
- Test: also `src/You.test.tsx` (the row), `e2e/` (see Task 4)

**Interfaces:**
- Consumes: Task 1's `listSessionLogs()` and `SessionLogHistoryEntry`.

- [ ] **Step 1: failing client tests**: the You row navigates to
  `/you/monitor-logs`; the screen lists entries newest-first with their
  `savedAt` rendered per the Gate-0-approved format; empty state renders
  the approved empty copy; COPY on an entry writes that entry's `exported`
  bytes to the clipboard byte-identically (the `ConnectionLogSheet` COPY
  LOG contract: one serialization, never re-stringified) and flips its
  label per the approved states; a corrupt slot simply doesn't render.
- [ ] **Step 2: red, implement** (screen reads `listSessionLogs()` once at
  mount — `useState` initializer, the repo's on-open snapshot idiom;
  clipboard via `navigator.clipboard.writeText` with the failed state, the
  `ConnectionLogSheet` pattern).
- [ ] **Step 3: green; commit; mutations:** (a) render oldest-first → the
  order leg red; (b) re-stringify the export before copy → the
  byte-identity leg red. Record failure text.
- [ ] **Step 4: `pnpm e2e` and `pnpm screenshots`** — the new screen and row
  are layout changes: add a capture (seed at least two history entries),
  open and look (RF7); revert unrelated flaky capture diffs.

### Task 4: Composition, docs, close-out

**Files:**
- Create: one e2e spec block (in the existing suite file the door's flow
  fits — follow the suite's structure) driving: a connected session
  teardown on web (the fake transport path e2e already uses) → navigate to
  You → the door → the entry from THAT session listed → COPY succeeds.
- Modify: `ROADMAP.md` (tick §2/§3/§6's items per the register/wave rows
  that reference them), `docs/design/DEVIATIONS.md` if any row touches You's
  row list.

- [ ] **Step 1:** the e2e leg (this is the RF24 composition: teardown writes,
  the door reads — one test starting before the producer).
- [ ] **Step 2:** full gates: `pnpm lint && pnpm typecheck && pnpm test`
  (Docker), `pnpm build && bash scripts/dist-grep.sh`, per-file coverage.
- [ ] **Step 3:** ROADMAP: the ring-durability register/wave rows gain their
  SHIPPED pointers (hand-wrapped); note that RC-29's counter now ships and
  its register row's "no threshold moves until ordinary use produces the
  number" clause is now armed.
- [ ] **Step 4:** commit; push; PR with the human-first body (~120 words
  above the fold, no risk note above the fold — PM ledger rule), captures,
  and Record block. **Present and STOP — James merges.**
