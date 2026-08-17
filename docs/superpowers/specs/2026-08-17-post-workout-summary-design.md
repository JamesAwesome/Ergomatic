# Post-workout summary — Phase PW, spec 1 of 3

**Status:** design approved by James 2026-08-17 ("Sounds right");
phase-open gates (PM slate + antagonist anchor) run against this document.
**Branch:** `pw-summary`, worktree `.claude/worktrees/pw-summary`, base
`ac86b20` (v0.10.0). **Phase PW absorbs Phase LG** — the held-question
ruling ships here.
**Value authority:** `docs/design/handoffs/2026-08-12-post-workout/`
(README + mock), as corrected by its PROVENANCE.md. This spec's §2 tables
carry the checkable values; on any mismatch with prose, the tables govern.

## What and why

After a row, the app measures six fields per interval and shows one. The
only total anywhere is `N MIN`, the held question uses two words with no
written direction, and the screen asks before it tells. This spec replaces
the whole post-row flow with the handoff's summary: what you did first
(avg-split hero, time, distance, per-interval deviation bars), a light
reflection second (thumbs, held, pain, notes — all optional), and the save
choices last. Everything renders from data already recorded; traces and
HR wait for spec 3's series capture. It also restores the session-distance
check route the CR2 redesign removed (the phase-close gate's named hole):
total meters, from the actuals, on the screen every session ends on.

## Rulings (James, 2026-08-17)

1. Summary-first decomposition (spec 2 = from-the-log; spec 3 = traces/HR,
   gated on series-capture research).
2. **UNDER = FASTER than target** — under the target NUMBER. Documented at
   the type, the enum, and on screen via the `TARGET m:ss` hint. The
   stored words stay; no value migration.
3. Replace wholesale: SessionComplete and every log door converge on the
   summary.
4. Thumbs ships in spec 1, stored now, consumed by generation later.
5. All reflection answers OPTIONAL — nothing blocks saving (the handoff's
   own rule; today held+pain are required).

## §1 Deviation table (handoff → ships)

| README says | Ships as | Why |
| --- | --- | --- |
| Blue `#1f4a5c` faster / rust `#b5341f` slower | `--judge-faster` `#1d4e89` / `--judge-slower` `#962718` | Tester ruling governs (PROVENANCE item 2); rust stays the CTA accent only |
| HR block, CAL EST., traces, drawer's watts/drag/rest-distance | Absent entirely (not empty variants) | Not recorded today; spec 3's subject (PROVENANCE items 1, 3) |
| Discard confirm "dialog not designed" | House two-tap staged discard | PROVENANCE item 4 |
| "From the log" state, footer plan-linkage, edit affordance | Spec 2 | Phase decomposition |
| Reflection writes `hold: HELD/UNDER/OVER/null` | Same values, `held` column goes NULLABLE | Ruling 5; additive migration, no value rename |
| Zone ramp tokens | Not introduced | No HR in spec 1 |
| Newsreader 32px title | Newsreader 500 (already loaded), 32px | Matches; no new font |

## §2 Property tables — the exit criteria

### 2A Title block (both variants)

| Property | Requirement |
| --- | --- |
| Back link | `← DONE` (just-finished); house BackLink semantics (non-destructive, fallback `/today`) |
| Eyebrow | `WORKOUT COMPLETE` mono label style |
| Title | Workout title, Newsreader 500 32px |
| Meta line | PM5 variant: `AUG 10 · 18:57 · PM5 <id>` (date · local time · device). By-hand/timer variant: `AUG 10 · 18:57 · LOGGED BY HAND` or `· TIMER` per door. Mono, ink-3 family. 2px ink rule below the block. |

### 2B Hero (PM5-connected)

| Property | Requirement |
| --- | --- |
| Layout | 3-up: AVG SPLIT (lead cell, judged-neutral ink, 30px+ mono per mock) · TIME · DISTANCE |
| AVG SPLIT | `500 × Σ actual.elapsedSeconds / Σ actual.distanceMeters` over measured actuals, `fmtSplit`; cell ABSENT (siblings close up) when Σ meters = 0 |
| TIME | Measured span: Σ actual.elapsedSeconds + programmed rests for completed intervals (the F6/`interruptedTotalSeconds` rule generalized — never wall-clock on the monitor path), `m:ss` |
| DISTANCE | `Σ actual.distanceMeters`, whole meters, `m` unit — **the restored session-distance route**; walk sheets point here from now on |

### 2C Hero (time-only)

| Property | Requirement |
| --- | --- |
| Layout | Single time hero (`45:00`), no distance, no split — no empty measurement affordances (README §9's own rule) |
| Source | Timer door: wall-clock `completedAt − startedAt` (today's `logTotals`). Manual door: the estimate line as today (`estimateMinutes`), or date-only when null |

### 2D Reflection card (both variants; every answer optional)

| Property | Requirement |
| --- | --- |
| Card | Ink-bordered on `--surface`; four controls in README §4's order; every control ≥46px |
| HOW DID IT FEEL? | `↑ MORE LIKE THIS` (flex) + `↓` (64px). Selected up = ink fill; selected down = accent fill. Tapping the active one clears to null. |
| DID YOU HOLD THE TARGETS? | `HELD / UNDER / OVER` equal thirds, selected ink fill; right hint `TARGET m:ss` (connected, the session's target split) or `BY FEEL` (time-only). Direction comment at the options array: UNDER = faster (James 2026-08-17). Tapping active clears. |
| ACTUAL PAIN | 1-5 chips, selected accent fill (the existing pain ramp); right hint `EXPECTED n/5` when the workout carries one; caption `TAP TO RATE` → `EASIER THAN PLANNED` (1) / `AS PLANNED` (2) / `HARDER THAN PLANNED` (3-5). Clearable. |
| NOTES | Dashed textarea on `--page`, placeholder `What happened out there?`, min-height 74px, no resize |

### 2E Intervals list

| Property | Requirement |
| --- | --- |
| Header | `INTERVALS` + right caption `PACES OFF 6K m:ss` (the locked base, from the existing paces-locked sources) |
| Measured row (PM5) | Per README §8: index (14px) · split time (76px) · pace in judged color (52px) · deviation bar (flex, 14px track, 1px center tick, 8px bar, width `min(50%, max(1.2%, |dev|/1.6 × 50%))`) · numeric deviation right (`+n.n` = slower, `−n.n` = faster, signed seconds vs the session average) |
| Judged colors | Faster than session average = `--judge-faster`, slower = `--judge-slower` (bar and pace text) |
| Legend | `← FASTER (BLUE) · SLOWER (RED) →` under the list, label style |
| Prescribed row (time-only) | index · distance · target pace · offset (`6K +8`) · `—` right; section captioned `TARGETS ONLY · NOTHING MEASURED` |
| Unmeasured interval on the PM5 variant | Renders as a prescribed row (the actuals array can be shorter than the program — never invent a measurement) |

### 2F Save options (just-finished only)

| Property | Requirement |
| --- | --- |
| Stack | 8px gap: `Log against plan` (54px, accent fill, white text) · `Save without logging` (48px, surface + 1px `--rule-3` border) · `DISCARD WITHOUT SAVING` (48px, borderless, mono 12 muted, two-tap staged) |
| Log against plan | Saves with `advancesPlan: true` (today's default path). Hidden (not disabled) when no plan exists; `Save without logging` then leads. |
| Save without logging | Saves with `advancesPlan: false` — the existing OUTSIDE THE PLAN semantics promoted from a toggle to a button. The toggle dies. |
| Discard | The existing staged-discard semantics per door (records cleared per the 2b rules; monitor discard keeps the diagnostics stash) |

## §3 Structure

**Routes and doors converge; the gates survive.** The summary mounts at
the existing routes (`/session/log`, `/library/:id/log` incl.
`?from=monitor` with `monitorModeRun`'s four conditions untouched).
`SessionComplete` DIES — the timer's finish stage navigates straight to
the summary (its TOTAL and actual-rows content is subsumed by 2B/2E).
F6's Today row keeps stamping then navigating exactly as today. The
`LogScreen` chrome is replaced by the summary composition; `useLogForm`
grows thumbs and loses the required-fields gate.

**A pure summary model** (`buildSummaryModel`) computes 2B/2E from the
door's own inputs (MonitorRun actuals+program / SessionRun+draft steps /
workout steps) — client-side at render, no new totals columns; the meters
already cross the wire in the steps jsonb today.

**Stored shapes (the triad's subject):**
- NEW `thumbs` pgEnum (`up`,`down`) column on `session_logs`, NULLABLE;
  client type + POST field optional; validation accepts absent/null/member.
- `held` and `pain` columns go NULLABLE (additive `ALTER ... DROP NOT
  NULL` migration; existing rows untouched; no value rename).
- POST/validator: held/pain/notes/thumbs all optional; server rejects
  invalid members as today.
- Reads: `RecentLog` types held/pain as nullable; Today's LAST THREE
  meta line omits absent segments (the F1 no-dash rule): `AUG 17 · HELD ·
  2/5` → `AUG 17 · 2/5` → `AUG 17`.
- The UNDER=faster ruling is written at: the `HeldResult` type (both
  copies), the pgEnum, the options array, and rendered as the `TARGET`
  hint.

**`MONITOR_SPM_MIN` fix rides along:** `avgSpm` 0 is dropped like
`avgSplit` 0 (`> 0` bound; the wire's 0 = no reading); the server's
liar-rejection band stays 0-admitting (its role is different); the
logDraft pin tests flip deliberately.

**F-1 re-observation instrumentation is unchanged** (the walk sheet's
record-dump step); the summary's TIME cell uses the same
completed-intervals rule, so a recurrence shows in two places.

## §4 Out

Traces, HR (zones/avg/max/CAL EST.), the EVERY OTHER NUMBER drawer,
the from-the-log state + history surface + edit path (spec 2), series
capture (spec 3 + research), manual distance entry for time-only
(handoff open question 2, deferred), thumbs-consuming generation
changes, any enum value rename.

## §5 Testing

- Property-table assertions per §2 in the design suite (the spec-3
  discipline: every row a named witness; contrast computed for any new
  pairing; fixtures from the seeded library incl. a PARTIAL-actuals run
  and a Σmeters=0 run).
- `buildSummaryModel` unit tests: the avg-split formula, the
  absent-cell rules, deviation signs (+ = slower), the bar-width clamp
  edges (min 1.2%, cap 50%), unmeasured-interval fallback rows.
- Stored-shape tests: null round-trips for thumbs/held/pain; the
  LAST THREE omission rendering; server validation of absent vs invalid.
- e2e: all three door flows land on the summary and save each of the
  three options; the monitor flow asserts DISTANCE equals the seeded
  actuals' sum (the restored route, by NUMBER); screenshots of both
  variants + the reflection filled.
- Every e2e/screenshot the log-flow rewrite breaks is updated in the
  same task that breaks it; suite green per task.

## §6 Exit criteria

1. Every §2 row has a named passing witness.
2. `SessionComplete` and the plan toggle are GONE (grep-clean); all
   three doors render the summary; `monitorModeRun`'s gate tests intact.
3. A saved row can carry all-null reflection; existing rows render
   unchanged; the migration is additive-only against live tester data.
4. The DISTANCE cell's number equals the actuals' sum on a replayed
   committed recording (the walk-route restoration, proven against the
   wire, not a fixture).
5. Scoped gates green; per-file coverage on every touched file; captures
   opened and described.
6. The UNDER=faster ruling is greppable at every §3-named site.
