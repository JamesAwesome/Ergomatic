# Post-workout summary — Phase PW, spec 1 of 3

**Status:** design approved by James 2026-08-17; REVISED after the
phase-open gates (PM GO-WITH-CONDITIONS, antagonist anchor pass — every
condition and finding folded in below; the anchor's attacked-and-held
claims are the phase's VETTED GROUND, §7).
**Branch:** `pw-summary`, base `ac86b20` (v0.10.0). **Phase PW absorbs
Phase LG's precondition** (the direction ruling) — whether it closes LG
itself is James's open label decision (§2D).
**Value authority:** `docs/design/handoffs/2026-08-12-post-workout/`
(README + mock) as corrected by PROVENANCE.md and §1. This spec's tables
govern on any mismatch.

## What and why

After a row, the app measures six fields per interval and shows one; the
only total anywhere is `N MIN`; the held question uses words with no
written direction; and the screen asks before it tells. This spec replaces
the post-row flow with the handoff's summary: what you did first
(avg-split hero, time, distance, per-interval deviation bars), a light
reflection second (thumbs, held, pain, notes — all optional), the save
choices last. It restores a rower-visible session distance that MATCHES
THE ERG (the CR2 phase-close gate's named hole), by capturing the one
wire field the record was missing.

## Rulings

James (2026-08-17, brainstorm): summary-first decomposition; UNDER =
FASTER than target (under the target NUMBER); replace the flow wholesale;
thumbs stored now; all reflection optional.

Spec rulings from the gates (each traceable to a finding):

- **R-A (sequencing, BLOCKING):** the null-TOLERANT READ ships as its own
  PATCH PR and TAGS (v0.10.1) BEFORE any code that can write a null
  `held`/`pain` merges. `Today.tsx` renders `log.held.toUpperCase()`, the
  app has NO error boundary, the web deploys on merge — an empty
  reflection saved anywhere blank-screens every installed build's home
  screen otherwise (RELEASING.md's additive-only rule).
- **R-B (DISTANCE means the machine's number):** `IntervalActual` gains
  `restDistanceMeters` (additive; 0x0037 already carries
  Interval Rest Distance — the anchor pass decoded it: work 1535 + rest
  64 = the machine's own 1599 exactly). DISTANCE = Σ(work + rest
  distance) over all actuals incl. warm-up — the erg-checkable total.
- **R-C (the heroes answer different questions, stated separately):**
  DISTANCE and TIME are machine-total semantics (warm-up INCLUDED);
  AVG SPLIT is the working average (warm-up EXCLUDED — including it moved
  the hero 9.4s/500m on the committed walk-3 wire's full 3-boundary set —
  CORRECTED, Task 4 review: "20s/500m" was a 2-boundary figure, from
  before the third boundary was decoded; the walk-3 recording has three).
  The interval list renders the warm-up as its own labeled, unjudged row
  so the totals reconcile with the visible rows by eye.
- **R-D (TIME is a number-semantics change, named):** every monitor
  session's TIME = Σ work seconds + programmed rests for completed
  intervals (James's recorded rule, generalized from the interrupted
  branch) — never wall-clock. Testers' connected times will read LOWER
  than today's wall-clock minutes; the notes PR must say so. VETTED: the
  formula double-counts nothing — 0x0037 reports splitTime (60.0) beside
  restTime (30) as separate fields on all committed recordings, retiring
  `logDraft.ts`'s open work-vs-work-plus-rest caveat with a citation.
- **R-E (measured-ness is per-row, not per-door):** the variant axis is
  `ActualSource` per step, not connected-vs-not. A timer-door session
  with stopwatch readings renders them as measured rows with computable
  heroes; `TARGETS ONLY · NOTHING MEASURED` appears only when NO row
  carries a measurement.
- **R-F (SPM_MIN is CUT from this spec):** it is its own small triad PR
  (the ROADMAP already ruled it triad); that PR also tags the
  "wire 0 = no reading for spm" premise INFERENCE (zero avgSpm=0 samples
  exist in any committed capture).

## §1 Deviation table (handoff → ships)

| README/mock says | Ships as | Why |
| --- | --- | --- |
| Blue `#1f4a5c` faster / rust slower | `--judge-faster` / `--judge-slower` | Tester ruling (PROVENANCE 2) |
| HR block, CAL EST., traces, drawer | Absent entirely | Not recorded; spec 3 (PROVENANCE 1, 3) |
| Hero `2:09.1` (mock) | The Σ-weighted value (`2:09.2` on the mock's own data) | The mock averaged the row paces unweighted; the PM5's own per-interval arithmetic is `500 × Σt/Σd` exactly (verified on all nine committed boundaries) — the deviation column re-derives from the weighted average |
| Deviation bar unbounded (mock: `max(|dev|/1.6×50, 1.2)`) | Capped at 50% (`min(50, …)`) | Spec's own addition; a 4s outlier must not paint past the track |
| Discard dialog "not designed" | House two-tap staged discard | PROVENANCE 4 |
| "From the log" state | Spec 2 (history surface + the API's first UPDATE — acknowledged bigger than one line; may split) | Decomposition. Accepted gap: until spec 2, a skipped reflection is unrecoverable — stated, not hidden |
| Reflection writes `hold …/null` | Same values; `held`+`pain` go NULLABLE | Ruling; R-A orders the rollout |
| Back label `← DONE` | `BackLink` gains an optional label prop (house semantics, new word) | The component hardcodes `← BACK` today |
| DISTANCE 6000 (machine total) | Machine-matching via R-B | The actuals-only sum is 4% short on rest-bearing sessions — the walk photograph would read a gap with no explanation |
| Tab bar | Today's per-route behavior kept (hidden on `/session/log`, visible on `/library/:id/log`) — recorded asymmetry, revisit at spec 2 | Inherited; not this spec's fight |

## §2 Property tables — the exit criteria

### 2A Title block

| Property | Requirement |
| --- | --- |
| Back | `← DONE` via the labeled BackLink; non-destructive; fallback `/today` |
| Eyebrow | `WORKOUT COMPLETE` label style |
| Title | Newsreader 500 32px (font already loaded — vetted) |
| Meta | `AUG 10 · 18:57 · PM5 <id>` (connected) / `· TIMER` / `· LOGGED BY HAND`. Date+time from `completedAt` — EXCEPT interrupted runs, which use `startedAt` (the F6 rule: completedAt is the Log-it moment, possibly days later). Local time via the device locale, minutes precision. 2px ink rule below. |

### 2B Heroes (any door with ≥1 measured row)

| Property | Requirement |
| --- | --- |
| Layout | 3-up: AVG SPLIT lead · TIME · DISTANCE; any cell whose inputs are absent is ABSENT (siblings close up) — no `0:00`, no `0 m` (the no-empty-affordances rule applies per cell) |
| AVG SPLIT | `500 × Σt/Σd` over measured WORK rows (warm-up excluded, R-C); absent when Σd = 0 |
| TIME | R-D's formula (work + completed rests, warm-up included), `m:ss` — this cell is ALSO F-1's re-observation surface: `m:ss` exposes what `Math.round` hid, and the walk sheet's F-1 row is rewritten IN THIS PR to name it and its expected value |
| DISTANCE | R-B's machine-matching sum, whole meters |
| Time-only fallback | No measured rows anywhere: single time hero (timer: wall-clock `logTotals`; manual: the estimate or date-only) |

### 2C (folded into 2B's per-cell absence rules — the door variants follow measured-ness, R-E)

### 2D Reflection card (every answer optional; every control ≥46px)

| Property | Requirement |
| --- | --- |
| HOW DID IT FEEL? | `↑ MORE LIKE THIS` (flex) + `↓` (64px); up = ink fill, down = accent fill; tap-active-to-clear |
| DID YOU HOLD THE TARGETS? | Three equal thirds, ink-fill selected, clearable. **Labels: RULED, option B (James 2026-08-17):** `HELD` / `UNDER · FASTER` / `OVER · SLOWER` — the direction lives in the label, closing Phase LG's piece 1 (the words can no longer be read backwards). Stored values unchanged. Direction comment (UNDER = faster) at the options array, both HeldResult copies, and the pgEnum. Historical rows predate the ruling — displayed under it, noted in code, never re-interpreted as intent. Today's LAST THREE keeps rendering the stored word (`UNDER`), which now agrees with the button that wrote it. |
| The hint | Right-aligned: `TARGET m:ss` only when the session has EXACTLY ONE distinct target split (167 of 300 workouts); multi-target (101) and effort-only (32): no hint; by-hand manual door: `BY FEEL`. Timer door follows the same single-target rule (it has real targets — `BY FEEL` would lie there). |
| ACTUAL PAIN | 1-5, accent-fill selected, clearable; `EXPECTED n/5` hint when present; caption `TAP TO RATE` → `EASIER THAN PLANNED`/`AS PLANNED`/`HARDER THAN PLANNED` (1 / 2 / 3-5) |
| NOTES | Dashed textarea on `--page`, placeholder `What happened out there?`, min-height 74, no resize |

### 2E Intervals list

| Property | Requirement |
| --- | --- |
| Header | `INTERVALS` + paces caption per the existing sources: `PACES OFF 6K m:ss` / two-slot `2K … · 6K …` / omitted when null (the F1 rule) |
| Warm-up row | Rendered, labeled `WARM-UP`, measured values shown, UNJUDGED (no deviation bar, excluded from the average) — R-C's reconciliation row |
| Measured row | README §8 geometry: index 14px · time 76px · pace 52px judged · deviation bar (14px track, center tick, 8px bar, width `min(50%, max(1.2%, |dev|/1.6 × 50%))`) · `+n.n`(slower)/`−n.n`(faster) vs the 2B working average |
| Judged colors | `--judge-faster` / `--judge-slower`, bar and pace text; legend `← FASTER (BLUE) · SLOWER (RED) →` |
| Unmeasured row | Prescribed form: index · distance/duration · target pace · offset (`6K +8`) · `—`; mixed lists per row (R-E) |
| All-prescribed list | Captioned `TARGETS ONLY · NOTHING MEASURED` — only when literally nothing was measured |

### 2F Save options (just-finished only)

| Property | Requirement |
| --- | --- |
| Stack | `Log against plan` (54px accent) · `Save without logging` (48px outline) · `DISCARD WITHOUT SAVING` (48px borderless mono, two-tap staged, per-door record semantics incl. the monitor stash rule) |
| Plan position | `Log against plan` carries the position: `Log against plan · SESSION n OF N` (the toggle's information, kept at the decision point) |
| Onboarding | On `isOnboardingTitle` workouts, `Save without logging` LEADS and `Log against plan` demotes to the outline slot — 6I's "a baseline test must not silently consume plan session 1" survives the toggle's death |
| No plan | `Log against plan` hidden (not disabled); `Save without logging` leads |
| Diagnostics rows | `MONITOR LOG · COPY` and `RECORDING · DOWNLOAD` SURVIVE below the stack (dev-gated as today) — the walk's recorder door; PR #106 exists because this button was unreachable elsewhere |

## §3 Structure

**Rollout order (R-A):** PR 0 = null-tolerant reads (`RecentLog` nullable,
LAST THREE omits absent segments per the F1 rule: `AUG 17 · HELD · 2/5` →
`AUG 17 · 2/5` → `AUG 17`), tagged v0.10.1. PR 1 = everything else.

**Routes converge; gates survive.** Summary mounts at the existing routes;
`monitorModeRun`'s four conditions untouched. `SessionComplete` dies — the
finish stage navigates to the summary; `/session/complete` keeps a
redirect (the `/session/confirm` → `ConfirmRedirect` precedent); its
stopwatch actual-rows content survives via R-E's measured rows.
`useLogForm` grows thumbs, loses the required gate, keeps the onboarding
`outsidePlan` seed (now expressed through 2F's button order).

**The wire addition (R-B):** `parseSplitIntervalData` surfaces Interval
Rest Distance (already in the bytes); `IntervalActual.restDistanceMeters`
(additive, number, 0 default at the fake); `recordActual` passes it
through; the fake learns a nonzero ramp (an honest fake — a constant 0
converts the suite into agreement with itself).

**Stored shapes:** `thumbs` pgEnum (`up`,`down`) nullable column;
`held`/`pain` `DROP NOT NULL` (additive; the `pain between 1 and 5`
CHECK passes NULL by Postgres rule — LEAVE IT ALONE); migration index:
next free is `0009` — check open PRs for a competing index first. POST:
all reflection fields optional; invalid members still 400.

**`buildSummaryModel`** (pure): heroes + interval rows from the door's
inputs per R-B/R-C/R-E; unit-testable against the committed recordings.

## §4 Out

Traces, HR anything, the drawer, from-the-log + history + edit (spec 2),
series capture (spec 3), manual distance for time-only (handoff Q2,
open), enum value renames, `MONITOR_SPM_MIN` (own PR, R-F), generation's
thumbs consumption (noted: the signal will be sparse — reflection is
optional now; the generation phase is told at ITS open, not surprised).

## §5 Testing

- §2 rows each get a named witness (design suite; contrast computed on
  new pairings; realistic fixtures incl. partial-actuals, Σd=0,
  warm-up-bearing, multi-target, onboarding-title).
- `buildSummaryModel`: formula edges (warm-up in/out per cell, absent
  cells, deviation signs and clamp, mixed measured/prescribed rows).
- **The external oracles (the anchor pass's own):** DISTANCE vs the
  MACHINE's totalWorkDistance on replayed committed recordings — the
  keystone (a-priori 500) AND `walk-2026-08-16/session-2` (1599, the
  rest-bearing case that catches a work-only regression); TIME vs the
  recordings' summed splitTime+rests. AVG SPLIT has NO machine-side
  oracle (0x0032's Average Pace matches no candidate formula — stated,
  not hidden): its witness is the per-interval identity the anchor
  verified (`avgPace = 500×t/d` exactly) plus unit arithmetic.
- Stored-shape: null round-trips; old-shape POST (held+pain present)
  still accepted — v0.10.0 clients keep working; LAST THREE omission
  rendering; the v0.10.1 read-tolerance PR has its own red-provable test
  (a null-held row renders Today without throwing).
- e2e: three door flows through save (each button), the onboarding
  ordering, the interrupted date rule; screenshots both variants +
  filled reflection; DEVIATIONS row 40 (PACES LOCKED) reconciled;
  ROADMAP gains the Phase PW section and LG's status line is amended
  (the PM's grep-the-phase-name rule).

## §6 Exit criteria

1. Every §2 row has a named passing witness.
2. v0.10.1 (null-tolerant reads) TAGGED before the writer PR merges —
   the criterion is phrased against CLIENTS: a v0.10.0-shaped client
   reading a null-reflection row must not crash (proven by the
   tolerance test predating the writer).
3. `SessionComplete` and the plan toggle GONE (grep-clean, redirect in
   place); the two diagnostics rows SURVIVE (witnessed).
4. DISTANCE equals the MACHINE's total on both replayed recordings
   (500 and 1599) — the external number, not the sum's own inputs.
5. TIME reads measured-not-wall-clock on the monitor doors; the walk
   sheet's F-1 row names the TIME cell + expected `m:ss`; the notes
   obligation ("connected times read lower") is recorded for the
   v0.11.0 notes PR.
6. All-null reflection saves; existing rows render unchanged; the
   migration is additive against live data.
7. UNDER=faster greppable at every §3-named site; the option-B labels
   shipped; ROADMAP's LG section closes with a pointer to PW.

## §7 Vetted ground (the anchor pass's attacked-and-held claims)

`IntervalActual.elapsedSeconds` is work-only (0x0037 splitTime beside
restTime, all recordings — `logDraft.ts`'s caveat retired with citation);
the PM5's per-interval avgPace = `500×t/d` exactly (nine boundaries);
Newsreader 500 loaded; meters already cross the wire in steps jsonb;
`useLogForm`'s gate and `monitorModeRun`'s conditions as described;
`DROP NOT NULL` DB-safe incl. the CHECK; killing `/session/complete`
orphans nothing; the 2026-08-17 recordings carry `header.program`
(replay tasks need no hand transcription).
