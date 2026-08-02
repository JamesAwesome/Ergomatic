# Phase 6C — Log session: the loop closes

**Date:** 2026-08-02
**Status:** Approved (two-doors decision James's, 2026-08-02; visuals are the
handoff's §7 with one recorded deviation)

## Problem

Sessions complete but nothing records them. 6C ships the Log screen — the
last piece of the core loop (Today → confirm → timer → **log** → Today,
`doneN` advanced).

## What already exists (verified in-session)

- `POST /api/logs` validates everything 6C needs: `workoutTitle`,
  `workoutType`, optional owned `workoutId`, `held` (held|under|over),
  `pain` **1..5**, optional `notes`, `steps: LogStep[]` (`label`,
  `targetSplit?`, `actualSplit?`, `actualSource?`, `spm?`, `meters?`,
  `seconds?`, ≤200). **The store already advances `done_n`** (wired since
  Phase 4; rediscovered in 6A). `GET /api/logs` feeds Today's LAST THREE.
- The run record (6B): `workoutId`, `title`, `phases[]` (frozen
  `targetSplit`, `targetKind`, `spm`, `seconds|meters`, `originalStepIndex`),
  `actuals` keyed by phase position (`elapsedSeconds`, `splitSeconds`,
  `actualSource: "stopwatch"`), `completedAt` at the true boundary.
- **Zero server changes.** Fourth phase in a row.

## Decisions

| Question | Decision |
|---|---|
| Pain scale | **1–5**, matching the server's validation and the app-wide scale — the handoff's `PAIN RATING 1–10 … EXPECTED 5/10` is stale against the shipped API. DEVIATIONS row. Reuse the classification-card numeral picker pattern; `EXPECTED N/5` beneath, from the workout's own pain. |
| Doors | **Two, one screen** (James): from `/session/complete` (pre-filled from the run) and from the detail's dormant "Log it after" (manual — rowed off-app). |
| Per-phase history | **Not needed** — §7 shows each work step's single frozen split; stopwatch actuals cover distance steps. The engine is untouched. |
| Frozen paces | Session door: from the run's frozen `targetSplit`s (locked at confirm time — survives baseline edits mid-session by construction). Manual door: resolved from **current** baselines at save time — that IS the lock moment for an off-app row. The dashed `PACES LOCKED AT 2K … · 6K …` panel renders the baselines used. |
| `actualSource` | Stopwatch actuals pass through as `"stopwatch"`. Completed **time** phases log `actualSplit: targetSplit, actualSource: "assumed"` (the Phase-4 schema's design: assumed = held the target). Discarded suspect splits: no `actualSplit` at all (absence ≠ zero). Manual door: all `"assumed"`. |
| After save | Clear draft AND run records, navigate `/today`. Today's LAST THREE now shows it; the plan sequence advances (server-side `done_n`). The unlogged-session line on Today gains its real "Log it" action (replacing 6B's placeholder copy). |
| Discard path | An explicit staged "Discard without logging" on the Log screen's session door (clears records, no POST) — otherwise an unwanted session can never be dismissed once 6B's protections work as designed. |

## Design

### `src/session/logDraft.ts` (pure)

`buildLogSteps(run: SessionRun): LogStep[]` — walks `run.phases`: work
phases → `{label: <step text>, targetSplit, actualSplit?, actualSource?,
spm?, meters?|seconds?}` with actuals joined by phase position;
warm-up/rest phases fold into the shape §7 shows (read the handoff's list
rendering — work steps only, labels like the detail screen's). Effort
phases: `targetSplit` omitted (their frozen number is an estimate, never a
prescription — the 5G rule), label carries the effort word.
`buildManualLogSteps(workout, baselines): LogStep[]` — resolved at current
baselines, all assumed. Both pure, both pinned against real starters
including Microburst.

### The screen (`/session/log`, plus `/library/:id/log` for the manual door)

Handoff §7: title `Log <workout>`, type badge + date + total minutes,
the dashed PACES LOCKED panel, the per-step list with resolved splits,
`DID YOU HOLD THE TARGETS?` (Held / Under / Over segmented, 46px),
PAIN 1–5 (44px cells, `EXPECTED N/5`), NOTES (88px), `Save session` (54px).
Session door adds the staged Discard. Save failures surface inline (the
records are NOT cleared on a failed POST — retry stays possible).

### Entry points

- `/session/complete` gains `Log this session` (primary, accent) beside
  `Back to Today`.
- Today's unlogged line → `Log it` (same route; the run record is the
  source).
- Detail's "Log it after" button (currently disabled) goes live → manual
  door. Requires baselines (same no-target idiom as Start when unset).

## Testing

- `logDraft` pure tests: the phase→LogStep table for every kind (split,
  effort, distance-with-actual, distance-discarded, wu/rest folding),
  pinned against Microburst + a distance starter; manual builder against
  current baselines (hand-computed splits).
- Client: the form's validation states; save → records cleared → navigate;
  failed save → records intact + error; the staged discard; EXPECTED N/5
  rendering; both doors' prefill differences.
- e2e: the FULL LOOP — Today → confirm → countdown → tiny timer session →
  complete → Log → Held + pain + notes → Save → **Today shows it in LAST
  THREE and the plan's session counter advanced**. Plus the manual door:
  detail → Log it after → save → LAST THREE. Design sweeps + screenshots
  (`log-session.png` with real data, both doors if they differ visibly).
- Self-mutation DoD throughout; realistic fixtures.

## Out of scope

Editing/deleting past logs; the Trend screen (Phase 9 per the handoff's
Progress section); PM5 actuals (`"pm5"` source exists in the enum, Phase 7
fills it); Today enhancements (queued separately).

## Exit criteria

- A timer session logs with frozen paces + stopwatch actuals; the plan
  advances; LAST THREE updates; the records clear.
- An off-app row logs through "Log it after" with assumed actuals.
- A failed save loses nothing; discard requires two presses.
- Full gates; screenshots checked.
