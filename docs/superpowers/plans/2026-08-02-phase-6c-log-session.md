# Phase 6C — Log session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sessions get logged — frozen paces, Held/Under/Over, pain, notes —
and the plan advances. The core loop closes.

**Architecture:** One pure module (`logDraft.ts`) builds `LogStep[]` from
either door (run record / workout+baselines); one Log screen serves both;
save posts to the existing API (which already advances `done_n`), then
clears the session records. **Zero server changes.**

**Spec:** `docs/superpowers/specs/2026-08-02-phase-6c-log-session-design.md`.
**Every implementer reads `.claude/agent-briefing.md` first.** Design
authority: `docs/design/README.md` §7 (with the recorded /5 pain deviation).

## Global Constraints (beyond the briefing)

- Worktree `.claude/worktrees/phase-6c`, branch `phase-6c-log-session`.
- **Commit before any self-mutation** (standing rule after two incidents).
- Pain 1–5 (`EXPECTED N/5` from the workout's own pain); the handoff's /10
  is a recorded deviation, not a target.
- Effort steps: NO `targetSplit` in their LogStep (5G: the frozen number is
  an estimate). Label carries the effort word.
- Discarded suspect splits: no `actualSplit` key (absence ≠ zero).
- Completed time phases: `actualSplit: targetSplit, actualSource: "assumed"`
  — split-ref phases only; effort time phases get NO actual (nothing was
  prescribed).
- Records clear ONLY after a successful POST (a failed save must lose
  nothing); the staged Discard clears without posting.
- API facts (verified): `POST /api/logs` body `{workoutTitle, workoutType,
  workoutId?|null, held: "held"|"under"|"over", pain: int 1..5, notes?|null,
  steps: LogStep[] (1..200)}`; `LogStep = {label: 1..80 chars, targetSplit?,
  actualSplit?, actualSource?, spm?, meters?, seconds?}` (bounds in
  `data.ts`'s `validateLogStepEntry`). Ownership-checked `workoutId`; a
  deleted workout logs with `workoutId: null` (the run's id may be stale —
  handle a 400 on workoutId by retrying with null, comment why).

---

### Task 1: `logDraft.ts` — the two builders

**Files:** Create `app/src/session/logDraft.ts` (+test).

**Interfaces produced:**
- `buildLogSteps(run: SessionRun): LogStep[]` — work phases only (§7 lists
  work steps; wu/rest do not appear — verify against the handoff text and
  say so in a comment). Per work phase: `label` = the step text idiom the
  detail screen uses (`20:00 @ 6k +10` / `2000 m @ 2k` / `0:30 @ MAX` —
  reuse `refLabel`/`fmtDuration`, don't re-derive), `targetSplit` for
  split-ref phases only, `seconds|meters` from the phase, `spm` when set,
  actuals joined by phase position: stopwatch entries pass through
  (`actualSplit: splitSeconds, actualSource: "stopwatch"`), completed
  split-ref TIME phases get `actualSplit: targetSplit, actualSource:
  "assumed"`, discarded/effort phases get neither key.
- `buildManualLogSteps(workout: {steps: Step[]}, baselines: Baselines): LogStep[]`
  — same shape from the workout's authored steps, `resolveSplit`/effort
  rules identical, ALL actuals `"assumed"` (split refs) / absent (efforts).
- `logTotals(run)` → `{dateLabel, totalMinutes}` for the header (`JUL 27 ·
  50 MIN` — the house date format Today's LAST THREE established).

Pinned tables against real starters (Microburst's effort step, a distance
starter, one with rest+marker). Hand-computed splits in comments. Both
files 100% per-file. Self-mutation post-commit. No e2e (pure). Commit:
`feat: log steps build from either door`.

---

### Task 2: The Log screen + the session door

**Files:** Create `app/src/session/LogSession.tsx` (+test); Modify
`AppRoutes.tsx` (`/session/log`), `SessionComplete.tsx:~120` (add
`Log this session`, primary accent, beside Back to Today),
`app/src/today/Today.tsx:~355` (the unlogged line gains `Log it` →
`/session/log`), `app/src/index.css`.

Screen per §7: title, badge + `dateLabel · N MIN`, dashed
`PACES LOCKED AT 2K m:ss.t · 6K m:ss.t` panel (the run door shows the
baselines the run was BUILT with — they're derivable from... **STOP,
verify**: the run does NOT store baselines; the frozen targetSplits are
per-step. The panel's 2K/6K line therefore shows CURRENT baselines with a
comment acknowledging they may differ from confirm-time ones — OR store
nothing and render the panel from the steps' own frozen splits. Read §7
again and decide honestly; flag the choice in your report — `UNVERIFIED`
which reads better), the per-step list (label + frozen split, actuals
where present), Held/Under/Over segmented (46px), pain 1–5 cells with
`EXPECTED N/5`, NOTES textarea (88px, selectable — the callout rule
exempts textareas), `Save session` (54px), staged `Discard without
logging`. Save: POST; on 201 clear draft+run then `/today`; on failure
records intact + inline error; on a `workoutId` 400 retry once with null.
No run record → redirect `/today`.

Client tests: prefill from a real run fixture; save-success clears +
navigates; save-failure preserves; the 400-retry; discard staging; the
pain picker's expected line. Full gate incl. e2e (the session-door flow
extends the existing session e2e: … → complete → Log → save → Today).
Commit: `feat: the Log screen — the session door`.

---

### Task 3: The manual door

**Files:** Modify `WorkoutDetail.tsx:~308` (enable `Log it after` — gated
on baselines with the no-target idiom, navigates `/library/:id/log`),
`AppRoutes.tsx` (`/library/:id/log`), `LogSession.tsx`
(door detection: route param vs run record; manual door builds via
`buildManualLogSteps`, header date = today, discard button absent — there
is nothing to discard), tests.

The manual door must NOT touch the draft/run records (an in-progress
session elsewhere survives logging an off-app row — test it: live run in
storage + manual log → run intact after save).

Full gate. Commit: `feat: Log it after — the manual door`.

---

### Task 4: The full-loop e2e + close-out

**Files:** `app/e2e/` (the loop spec), `design.spec.ts` (sweeps: the Log
screen both doors if visibly distinct, staged discard open),
`screenshots.spec.ts` (`log-session.png`, real data), `ROADMAP.md` (6C
section; **the core loop is complete** — say so; next: Today enhancements
+ Phase 7 PM5), `docs/design/DEVIATIONS.md` (the /5 row + an end-to-end
pass).

The loop e2e: Today → suggestion → confirm → countdown SKIP → tiny timer
session (reuse 6B's bulk-import fixture idiom) → complete → `Log this
session` → Held + pain 3 + a note → Save → **Today: LAST THREE shows it
with today's date and the plan header's session counter advanced by one.**
The manual door e2e: detail → Log it after → save → LAST THREE. Sweeps,
screenshots (open + describe), full gate. Commit:
`test: the loop closes — structural coverage and the record`.

---

## Notes

- Tasks 2/3 both touch `LogSession.tsx` and `AppRoutes.tsx` — strictly
  sequential.
- The PACES LOCKED panel question in Task 2 is the plan's one open
  judgement — decide from §7's actual text, don't invent a third option.
- `logTotals`' date format follows Today's LAST THREE (`AUG 2`), not the
  handoff's `JUL 27` example format debate — they're the same format.
