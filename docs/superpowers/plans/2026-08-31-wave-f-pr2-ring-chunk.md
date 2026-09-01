# Wave F PR 2 — Ring Chunk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The diagnostics ring becomes durable (last three session logs kept,
not one overwritten slot) and readable (one deliberate door, no session
required), and the resume edge gets the instrument §4's freeze-predicate fix
is waiting on, plus the RC-29 latch counter.

**Architecture:** A small storage module owns a three-entry history, held
under ONE atomic localStorage key and keyed on the connected session's own
identity (an `upsertSessionLog` write, not a rotation), that teardown writes
alongside the existing `ergomatic:last-session-log` key (which stays,
untouched, for `readMonitorLogStash`). The hook's existing resume handler
gains one first-frame instrument entry and a stale-run terminator entry;
teardown's stash gains a latch-count line. You's own DIAGNOSTICS row routes
to `/you/diagnostics` — a menu layer James added at Gate 0 — whose "Monitor
logs" card routes to `/you/diagnostics/monitor-logs`, the screen that lists
the saved logs and copies any one.

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
| `src/monitor/sessionLogHistory.ts` (new) | the three-entry history under ONE atomic key, keyed on session identity (`upsertSessionLog`): write, list, read; never-throw |
| `src/monitor/sessionLogHistory.test.ts` (new) | its unit suite |
| `src/monitor/useMonitorSession.ts` | stash()'s `upsertSessionLog` call, keyed on `LogicalSession.id` (minted once per logical session at the post-GATT ring-creation site — round 5); §3 resume instruments; §6 latch counter |
| `src/monitor/useMonitorSession.test.ts` | instrument unit legs |
| `domain/monitor/pm5/parse.ts` + `domain/monitor/types.ts` | additive `rawRowingState` on the frame |
| `src/you/Diagnostics.tsx` (new, added at Gate 0) + `src/you/MonitorLogs.tsx` (new) + `src/You.tsx` + `src/shell/AppRoutes.tsx` | the You DIAGNOSTICS row → `/you/diagnostics` menu → "Monitor logs" card → `/you/diagnostics/monitor-logs` screen |
| `src/index.css` | menu/door/screen styles |
| e2e + screenshots specs | door flow + captures |

---

### Task 1: The three-entry history, atomic and identity-keyed

> **SHIPPED SHAPE, reconciled at review round 2 (PR #258, items 1+2) —
> rewritten here rather than left as a superseded draft, per the "no
> canonical claim survives uncorrected" rule.** The plan below originally
> sketched a three-KEY rotation (`h1`/`h2`/`h3`) and a push/update-in-place
> call pair; final whole-branch review's M-6 replaced the three keys with
> ONE atomic key before merge, and review round 2 then replaced the
> push/update pair with a single identity-keyed `upsertSessionLog` after it
> shipped two defects (a double-teardown burning two history slots on one
> session; a denied write flipping a per-call guard and corrupting the
> WRONG entry on retry). What follows describes the shipped design.

**Files:**
- Create: `src/monitor/sessionLogHistory.ts`,
  `src/monitor/sessionLogHistory.test.ts`
- Modify: `src/monitor/useMonitorSession.ts` (the `stash()` closure, and
  the single post-GATT `LogicalSession` assignment inside `connect()` —
  the site that mints the identity `stash()` reads; round 5)

**Interfaces:**
- Produces (Task 3 consumes):

```ts
export interface SessionLogHistoryEntry {
  /** 1 = newest, derived from array position. */
  slot: 1 | 2 | 3;
  /** The logical connected session this entry belongs to — opaque to this
   *  module, minted by `useMonitorSession.ts` once per logical session at
   *  the post-GATT site that creates its ring. */
  sessionId: string;
  /** ISO timestamp written at write time — the display "when". */
  savedAt: string;
  /** The ring's exported JSON, byte-identical to what teardown stashed. */
  exported: string;
}
/** Searches the history for an entry already carrying `sessionId`:
 *  replaces it in place if found (no rotation, list length unchanged), or
 *  inserts a fresh entry at the head — evicting past `MAX_ENTRIES` (3) —
 *  if not. Every `stash()` call for the SAME logical session, however many
 *  times teardown() runs for it, converges on one entry by construction.
 *  Never throws. */
export function upsertSessionLog(
  sessionId: string,
  exported: string,
  savedAt: Date,
): void;
/** Newest-first list of whatever entries exist. Never throws; a corrupt or
 *  denied entry is skipped, not fatal. */
export function listSessionLogs(): SessionLogHistoryEntry[];
```

- Storage shape (client-only diagnostics; additive; no migration): ONE
  localStorage key, `ergomatic:session-log-history`, holding
  `JSON.stringify({sessionId, savedAt, exported}[])` — newest first, capped
  at 3, written in a single `setItem` call so a denied/throwing write can
  never leave a partial rewrite (M-6). Documented in the module header as
  diagnostics-tier data: losable, never a record.

- [x] **Step 1: failing unit tests** for `upsertSessionLog`/`listSessionLogs`:
  insert order (three distinct sessions → newest first, a fourth evicts the
  oldest); replace-in-place for a repeated session id (list length
  unchanged); list skips a corrupt or pre-identity (missing `sessionId`)
  entry; DENIED GETTER reads as empty list; denied setItem is a silent
  no-op and never corrupts the prior array; byte-identity: what goes in
  comes back exact; the identity-bound regressions (a double-write for one
  session id converges on one entry; a denied write for a new session never
  wins a wrong-entry replace on retry).
- [x] **Step 2: run, red; implement; green.**
- [x] **Step 3: wire into `stash()`** — `upsertSessionLog(session.id,
  exported, nowDate())` where `session` is the hook's one `LogicalSession`
  value (id, ring, and per-session counters created TOGETHER at the single
  post-GATT site — round 5) and read, never re-minted, at every `stash()`
  call — including a
  second `teardown()` invocation for the SAME logical session (the Cancel
  defect) and the burst linger's second stash within one `teardown()` call.
- [x] **Step 4: hook-level tests**: two full connect→teardown cycles leave
  two history entries; the Cancel-interleaving regression (an unmount's
  `teardown()` racing `cancel()`'s own call) leaves exactly ONE entry; the
  burst linger's second stash still converges on one entry, carrying the
  fresher bytes.
- [x] **Step 5: commit**, then **mutations (RF21):** (a) make
  `upsertSessionLog` always insert, never match by `sessionId` → the
  Cancel-interleaving leg (and the burst-linger leg) go red; (b) match by
  `savedAt` instead of `sessionId` → the identity-bound "converges on one
  entry" legs go red. Record failure text; revert.

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
    run ENDS, detail: `frames=<count>
    endedBy=<changed|resumed|reset|teardown>`. FOUR closers, not two
    (corrected round 5, item 3b; the shipped code has carried all four since
    fix round 1 and final-review item 5): a differing frame arrives
    (`changed`), a SECOND resume edge arrives while the tracker is still open
    (`resumed`), a per-run reset fires — `program()`'s fresh arm or the RC-37
    programDropped/ready exit (`reset`), or the session tears down first
    (`teardown`).
  - `latch-count` — recorded by `stash()` once per logical session, detail:
    `latches=<n> resumes=<n>`. "Logical session" is a stricter thing than
    it was: since round 5 it begins at the GATT connect. A pre-GATT attempt
    creates no new logical session or identity; its teardown may re-stash
    the retained prior session under that unchanged id — updating an
    existing entry, or inserting it if the prior write never landed — and
    a hook holding no prior session writes nothing at all.

- [x] **Step 1: failing parse test** — feed a captured 0x0031 payload whose
  rowingState byte is a non-1 value (build it from the parser test file's
  existing payload helpers) and assert `rawRowingState` carries the raw
  byte while `rowingActive` stays false; a `=== 1` payload carries both
  `true` and `1`.
- [x] **Step 2: red, implement (additive field in `toMonitorFrame`), green.**
- [x] **Step 3: failing hook tests** (scripted-transport idiom; the
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
- [x] **Step 4: red, implement.** The first-frame instrument lives in the
  frame handler behind a small ref armed by the foreground branch (the
  handler already owns `framesWhileHiddenRef` with exactly this lifetime —
  mirror its reset discipline); the stale-run tracker is a second ref
  (key + count) cleared at every per-run reset site the file's other
  per-run refs use. The latch counter increments beside the existing
  `update({ frameSilence: true })` latch site; the resume counter beside
  the `app-lifecycle` record. `stash()` records `latch-count` BEFORE
  `exportLog()` so the line rides every stashed copy.
- [x] **Step 5: green; full unit+client run.**
- [x] **Step 6: commit, then mutations:** (a) point the staleness compare at
  `elapsedSeconds` instead of the freezeKey triple → leg (a) red (elapsed
  always moves, `stale` would read false); (b) never record
  `resume-stale-run` on teardown → leg (c) red; (c) increment latches on
  every resume → leg (d)'s non-latching half red. Record failure text.

### Task 3: The door — **BLOCKED until its Gate 0 clears**

**SHIPPED SHAPE** (the approved Gate-0 artifact, rev 3, and the external
review that followed it): You's own DIAGNOSTICS row routes to
`/you/diagnostics` — a menu layer James added at the gate, extensible for
future diagnostic tools — whose "Monitor logs" card routes to
`/you/diagnostics/monitor-logs`, the screen below. There is no direct
`/you/monitor-logs` route; the menu layer sits between them.

The controller presents the rendered artifact (James approves BEFORE this
task is dispatched). The approved copy and placement then bind verbatim.

**Files:**
- Create: `src/you/Diagnostics.tsx` (the menu, added at Gate 0),
  `src/you/MonitorLogs.tsx`, `src/you/MonitorLogs.test.tsx`,
  `src/you/Diagnostics.test.tsx`
- Modify: `src/You.tsx` (one quiet DIAGNOSTICS row), `src/shell/AppRoutes.tsx`
  (routes `/you/diagnostics` and `/you/diagnostics/monitor-logs`),
  `src/index.css`
- Test: also `src/You.test.tsx` (the row), `e2e/` (see Task 4)

**Interfaces:**
- Consumes: Task 1's `listSessionLogs()` and `SessionLogHistoryEntry`.

- [x] **Step 1: failing client tests**: the You row navigates to
  `/you/diagnostics`; that menu's "Monitor logs" card navigates to
  `/you/diagnostics/monitor-logs`; the screen lists entries newest-first
  with their `savedAt` rendered per the Gate-0-approved format; empty state
  renders the approved empty copy; COPY on an entry writes that entry's
  `exported` bytes to the clipboard byte-identically (the
  `ConnectionLogSheet` COPY LOG contract: one serialization, never
  re-stringified) and flips its label per the approved states; a corrupt
  entry simply doesn't render.
- [x] **Step 2: red, implement** (screen reads `listSessionLogs()` once at
  mount — `useState` initializer, the repo's on-open snapshot idiom;
  clipboard via `navigator.clipboard.writeText` with the failed state, the
  `ConnectionLogSheet` pattern).
- [x] **Step 3: green; commit; mutations:** (a) render oldest-first → the
  order leg red; (b) re-stringify the export before copy → the
  byte-identity leg red. Record failure text.
- [x] **Step 4: `pnpm e2e` and `pnpm screenshots`** — the new screen and row
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

- [x] **Step 1:** the e2e leg (this is the RF24 composition: teardown writes,
  the door reads — one test starting before the producer).
- [x] **Step 2:** full gates: `pnpm lint && pnpm typecheck && pnpm test`
  (Docker), `pnpm build && bash scripts/dist-grep.sh`, per-file coverage.
- [x] **Step 3:** ROADMAP: the ring-durability register/wave rows gain their
  SHIPPED pointers (hand-wrapped); note that RC-29's counter now ships and
  its register row's "no threshold moves until ordinary use produces the
  number" clause is now armed.
- [x] **Step 4:** commit; push; PR with the human-first body (~120 words
  above the fold, no risk note above the fold — PM ledger rule), captures,
  and Record block. **Present and STOP — James merges.**
