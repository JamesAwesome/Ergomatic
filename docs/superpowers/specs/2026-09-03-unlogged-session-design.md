# Unsaved workouts: a way back

## What and why

A retained workout must not disappear from Today while Start or Connect still
warns that starting again will discard it. This change exposes the recording,
offers review and save, and makes the warning point to that safe route.

**Status:** opened by James on 2026-09-03 ("Let's open it"). Gate 0 is pending:
the [rendered comparison](2026-09-03-unlogged-session-gate.html) is a proposal,
not approved UI or application implementation. This opens the existing
September 1 roadmap item, not another recovery phase or Codex task.

## Scope and decision

One coherent PR: **View unsaved workouts and save retained connected work.**
The initial bounded visibility repair has expanded to an architectural
recovery-flow design: loading prerequisites and source selection also prevent
the promised access. The current rendered comparison proposes only the normal
Today/warning treatment; it is not approval of the unresolved routing work.
This finishes existing recovery flows. No new queue, server API, persisted
shape, BLE reconnect, background recording, automatic saving, or arithmetic.
Correct Resume remains deferred. This is not fast path: a mistake could lose
a record. A non-TRIAD full cycle is possible only while claim/retire identity,
timing and reasons, successful-save behavior and recorded values stay
unchanged. Re-scope before implementation if that boundary cannot hold.
The phase remains OPEN/DESIGN, not ready for implementation.

The warning's new **View unsaved** action navigates through the same cancel
cleanup as Cancel. It must not authorize a replacement. Today is the common
destination because a phone run and a monitor entry can coexist.

Today shows an **Unsaved workout(s)** area above suggestions, with retained
title, source and start date, **Review & save**, and existing record-specific
two-tap discard. "Not saved" does not claim the machine finished every
interval. A live phone timer remains **Resume session**, not saveable merely
by visiting Today. Just Row keeps its existing evidence and recovery.

**Unresolved boundary, not an accepted deferral:** current-generation valid
programmed records with a surviving library workout can reuse the save screen.
A deleted library workout, null-id non-Just-Row record, or legacy/invalid
frozen seed cannot. Gate 0's normal-flow mockups do not claim to solve these.
Before implementation, decide their honest review/recovery treatment; do not
silently turn them into manual entries, invent measurements, or close the
overall discard-only problem while omitting these shapes.

Two more anchor findings are in this same work, not follow-up deferrals:

- Local recovery must render even when unrelated plan, preference, baseline,
  library or history requests are loading or failing. Today already takes its
  local snapshots before those early returns, but currently renders none of
  them in the error/loading branches (`Today.tsx:437`). This is a reachable
  normal failure; it needs its own rendered loading/error treatment and gate.
  Review availability does not promise that an offline API save succeeds.
- Selecting a displayed Just Row source must open THAT retained recording.
  The current common `/justrow/log` route selects by newer `completedAt`
  (`JustRowLog.tsx:108`), not selected row. This is a defensive coexistence
  case, not a newly observed normal producer. Source-bound navigation needs
  an explicit identity/lifetime decision before implementation; mint no new
  logical-session identity and never silently substitute the other record.

## Evidence at c5015c2e (v0.36.1)

- `app/src/today/Today.tsx:1529` permits only open monitor records or Just Row;
  completed programmed records are hidden. The rationale at `:652` assumes
  finish-time navigation continues to own access after the rower leaves.
- `app/src/monitor/monitorRun.ts:1690` and
  `app/src/session/useStartWorkout.ts:147` still stage `unlogged` for retained
  monitor records. `ConnectAction.tsx:155` and `WorkoutDetail.tsx:500` offer
  Cancel and replacement, never review.
- `app/src/justrow/JustRow.tsx:476` is another warning entry point, in scope;
  changing only library controls would leave the same dead end.
- `app/src/workout/WorkoutDetail.tsx:356` routes finish to
  `/library/:id/log?from=monitor`. "Log it after" at `:542` omits that intent
  flag. `app/src/session/LogSession.tsx:323` correctly refuses to use retained
  PM5 data without it.
- `app/src/session/LogSession.tsx:1789` rejects a missing library workout
  before the monitor branch. `app/src/monitor/monitorRun.ts:496` admits
  legacy missing seeds and null identifiers. Loadable is not saveable.
- `app/src/today/Today.tsx:744` uses the existing interrupted-close action;
  `completeInterruptedRun` leaves an already closed record unchanged. A new
  completed-programmed row must not restamp it or call it interrupted.
- James's exact retained record is not captured. This path is established in
  source and tests, not attributed to a particular hardware incident.

## Research and concept check

**PRIMARY, repository:** "unsaved" means a local retained session, not an
asserted PM5 state. `SessionRun` and `HandoffEntry` already provide the concept;
the log screen already separates PM5 and manual provenance. No OS or protocol
mechanism is invented. Accepted loss of memory-only data on process exit is
not fixed by navigation. Existing research and the live roadmap were searched
first; the September 1 issue is reused rather than researched from scratch.

**PRIMARY, W3C:** [SC 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
requires "at least 44 by 44 CSS pixels" for targets, subject to exceptions;
this is the repository's standing target floor, stronger than AA minimum.
[SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
sets the normal-text 4.5:1 floor. The comparison computes its token pairs.
[SC 2.4.4](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html)
supports destination/action names with context. Row actions identify their
workout and source accessibly when both record types are present.

## Gate 0 contract

- Current fonts, tokens and controls; no app-wide restyle. Frontend design
  guidance favors a restrained recovery area over a separate dashboard.
- Current/proposed Today and warning action areas at 390 × 844 and
  844 × 390 CSS px. Long titles wrap; actions remain at least 44 × 44.
- **View unsaved** opens Today with records intact. On Connect, cancel the
  staged replacement authorization first, as Cancel already does.
- **Review & save** opens the selected retained record's existing summary,
  not a new workout or the plain manual form. Opening it does not POST.
- Keep Cancel and explicit replacement. View has priority; replacement stays
  visibly destructive. This does not move the successful-connect retirement.
- Failed save keeps retry possible. Leaving without saving keeps the entry.
  Successful save removes it once; explicit discard removes it without POST.
- The generic View label is intentional: a boolean guard does not identify
  a unique recording. Pluralize the warning if both unsaved records exist.

## Proof contract and exit

**Invariant:** every supported saveable record protected by an unlogged
warning stays non-destructively reachable from Today until existing explicit
save, discard or replacement consumes it. Unsupported records require an
honest approved disposition, never accidental manual fallback.

**Producer and ordering:** start with no monitor record; drive the existing
connected producer through a completed programmed workout; leave its summary
without saving; visit another workout, trigger Connect or Start, choose View
unsaved, select the retained row, and save. Repeat after durable cold-start
hydration. A seeded Today-only test is supplemental, not full-path proof.

**Independent observable:** retained title and PM5-provenance summary are
visible; the API receives original captured actuals only on Save; history
shows the saved record; Start no longer warns for that record. Entering the
warning and choosing View leave stored bytes unchanged.

**Mutation design:** implementation tests must fail if Today's old exclusion
returns, the review route loses `from=monitor`, View loses its navigation,
View leaves Connect's staged replacement authorized, or summary arrival
retires before a failed save. Each asserts the actual consequence. Commit
real work before the probes. This opening draft adds no behavioral tests or
prescribed executable implementation blocks.
Staged-authorization cleanup is asserted through its real store receipt,
not a hypothetical later deletion: ordinary later Connect presses restage
their authorization. Also hold/fail an unrelated Today fetch while exercising
recovery, and select each of two distinguishable Just Row source records.

**Claim ceiling:** browser gates prove connected-flow navigation and payload
integrity under their supported transport producer, not natural BLE-failure
incidence, durability after a failed local write, or damaged-data reconstruction.
A native walk confirms this door on the phone, not a new reconnect capability.

Required cases: completed/interrupted programmed PM5, timer complete/live,
Just Row timer/PM5, both record types, memory-only same-process data, failed
save/retry, repeated review, record-specific discard, and View canceling
Connect's replacement authorization. The malformed/missing-library boundary
needs its own approved observable before implementation or phase closure.
The loading/error and source-selection findings above likewise remain design
gates, not implicitly approved implementation details.

## Opening record

PM recommends Gate 0 now, then one coherent full-cycle PR. No TRIAD change is
authorized. Its strongest objection to a universal saveability promise is the
existing library/seed gate above.

Baseline run in this worktree at c5015c2e:
`NODE_OPTIONS=--no-experimental-webstorage pnpm --dir app exec vitest run --project client src/today/Today.test.tsx src/monitor/ConnectAction.test.tsx src/session/useStartWorkout.test.tsx`
— 166 passed across 3 files. A deliberate unused-variable probe was rejected
by the real pre-commit lint hook, then removed without creating a probe commit.
No application behavior changed.

The phase-open anchor confirmed the original hole and added the request-gated
Today and Just Row source-selection findings above. Its design-artifact finds
were corrected: discard confirmation uses the clicked title, and plural plus
Just Row warning contexts are exposed. No executable implementation blocks;
hardening lens 2 skipped. No repeat review was commissioned.

Opening-artifact checks on 2026-09-03: the browser-rendered prototype was
inspected at 390 × 844 and 844 × 390, including long titles, plural warnings,
Just Row's warning context, View navigation, and each distinct discard title.
The Today recovery actions measure 272 × 44 and 44 × 44 CSS px in portrait;
the warning actions measure 326 × 48 and 159 × 44. The computed token-pair
table ranges from 5.03:1 (accent on surface-sunken) to 17.11:1 (ink on
surface). No horizontal overflow was observed. These are prototype checks,
not application-flow or native acceptance. The docs-only worktree passed
`pnpm lint`, `pnpm typecheck` and `pnpm format:check` from `app/`.
