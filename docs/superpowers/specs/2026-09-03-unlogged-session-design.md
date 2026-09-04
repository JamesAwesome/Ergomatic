# Unsaved workouts: a way back

## What and why

A retained workout must not disappear from Today while Start or Connect still
warns that starting again will discard it. This change exposes the recording,
offers review and save, and makes the warning point to that safe route.

**Status:** opened by James on 2026-09-03 ("Let's open it"). James approved
the normal Today/warning design on 2026-09-03 ("approved"). The additional
recovery cases below are now proposed in the
[rendered comparison](2026-09-03-unlogged-session-gate.html), labelled
"For approval". Implementation remains gated on those cases. This is the
existing September 1 roadmap item, not another phase or Codex task.

## Scope and decision

One coherent PR: **View unsaved workouts and save retained connected work.**
The initial bounded visibility repair has expanded to an architectural
recovery-flow design: loading prerequisites and source selection also prevent
the promised access. Approval of the normal Today/warning treatment does not
approve the additional missing-data treatment below.
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

**Proposed boundary, awaiting approval:** valid programmed PM5 data uses the
existing summary builder and save pipeline independently of library fetch
success. The retained record owns its title, source and measurements. A
matching library record supplies its current workout type and optional
context; without that match, the rower must choose AN/O2/AT/TR before Save.
There is no default choice. Preserve an existing workout id when supplied;
the existing field-specific rejected-id retry may remove the link, not the
measurements. A null-id programmed record with a chosen type stays a
programmed log, never a Just Row or manual entry.

The type choice is necessary, not a cosmetic extra: `MonitorRun` stores no
Erg Book workout type (`app/src/monitor/monitorRun.ts:107`), and its `LogSeed`
stores only labels/kinds and paces (`app/src/session/logDraft.ts:619`).
`server/routes/data.ts:1460` accepts a null workout id, and
`LogSession.tsx:804` already retries a specifically rejected id as null.
But null id AND null type mean free row (`domain/types.ts:38`), so neither
that pair nor a guessed O2 classification is an honest fallback here.

A missing/invalid frozen seed or other unreadable summary input gets a
read-only recording view: retained title, source, date, complete selectable
JSON, **Copy recording**, **Keep unsaved**, and record-specific two-tap
discard. State that the workout cannot be safely rebuilt; offer no fake
summary, automatic reconstruction, manual fallback, or save-as-workout button.
Copy exports that selected record, not the unrelated diagnostic-ring stash,
and does not count as saving or authorize retirement. A failed copy shows
failure and leaves selectable text and the record intact. This follows the
existing explicit-tap clipboard/failure idiom in
`app/src/workout/connected/ConnectionLogSheet.tsx:120`; no new storage or
platform mechanism. This is a named limitation requiring James's approval,
not a claim that every legacy record becomes saveable.

Two more anchor findings are in this same work, not follow-up deferrals:

- Local recovery must render even when unrelated plan, preference, baseline,
  library or history requests are loading or failing. Today already takes its
  local snapshots before those early returns, but currently renders none of
  them in the error/loading branches (`Today.tsx:437`). This is a reachable
  normal failure. The proposed loading/error screens keep the recovery area
  before the unrelated status and Retry control. No suggestion or plan state
  is fabricated while its request is unresolved. The same recovery component
  renders in ready/loading/error states, so Retry cannot reset its selection
  or authorize discard.
  Review availability does not promise that an offline API save succeeds.
- Selecting a displayed Just Row source must open THAT retained recording.
  The current common `/justrow/log` route selects by newer `completedAt`
  (`JustRowLog.tsx:108`), not selected row. This is a defensive coexistence
  case, not a newly observed normal producer. Source-bound navigation needs
  explicit source-bound navigation as proposed below; mint no new logical-
  session identity and never silently substitute the other record.

## Proposed recovery routing and lifetime

The new Today affordances open `/session/review` with the selected source
(`source=timer` or `source=monitor`) and the existing `startedAt` key in its
`startedAt` query parameter. This is a selector,
not a new session identifier or persisted record. On arrival, read only that
source, match its key and expected mode, then retain the existing mount
snapshot. A mismatch renders **Recording unavailable** with Back to Today;
it never falls through to manual logging or the other Just Row source.
`handoffStore.read(sessionKey)` already filters exactly this way
(`app/src/monitor/handoffStore.ts:754`); the timer's existing `startedAt` is
on `SessionRun` (`app/src/session/run.ts:68`). Do not put a revision in the
URL: durable hydration starts at revision zero (`handoffStore.ts:494`).

Keep unqualified existing finish-time routes compatible. Source-bound
Today entries bypass Just Row's legacy newer-completion fallback
(`JustRowLog.tsx:108`) without changing what a direct unqualified visit does.
Open monitor records use the existing explicit interrupted-close action on
Review, not on Today render or View unsaved. Closed records are not restamped.
Live phone timers keep Resume; no recovery screen finishes one by mounting.

| Value | Established | Lifetime and clear rule |
| --- | --- | --- |
| Route source/key selector | Clicked retained row | URL survives reload/back. Validated against that source on every mount; absent/replaced record is unavailable, never substituted. |
| Selected monitor entry | Key-filtered read at summary mount | Existing snapshot and claim/retire policy; no second retained store. Reload re-reads the same key at its current revision. Existing explicit save/discard reasons remain. |
| Selected timer run | Matched source/key read at summary mount | Existing run snapshot. A destructive completion may clear only a still-matching run, never a newer timer record. No new durable identity. |
| User-chosen missing type | Explicit selector change | Form-local, wins over a subsequently resolving library lookup. Reset on unmount; lost on reload like unsaved reflection inputs. Never changes stored measurements. |
| Copy result | Explicit Copy recording press | Form-local success/failure; reset on unmount. No claim, mutation or retirement. |

The review route reuses the existing summary components, builders and save
pipeline; it is not another numeric model. `source=monitor` is explicit PM5
intent on this route, equivalent in purpose to `from=monitor` on the existing
library log door. Invalid/missing source or key cannot select a default.

The library is optional context for recovery, not the record's identity.
Unknown `isGlobal`, expected pain and designated-test status stay unknown;
do not award a test result from title alone. Existing plan-fetch/save rules
and successful-save retirement remain in the shared form. The phone-timer
summary likewise must not block review on a missing draft plus a stalled
library request (`LogSession.tsx:1336`); use its matching draft's type when
present, otherwise the same explicit-choice treatment if no library type is
available. No change to the ordinary manual logging door is proposed.

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
returns, the review route loses explicit monitor intent or selected key,
View loses its navigation,
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
is covered by the proposed explicit-type or read-only treatments, pending
approval. Gate those paths with failed/stalled library requests, absent
workouts, null ids, invalid/missing seeds, a late library response after a
type choice, and source replacement before summary mount. Prove copy exports
the selected snapshot and failure preserves it; no successful copy retires it.
The added recovery screens and lifetime contract require approval before the
implementation plan and task dispatches.

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

After normal-flow approval, the additional recovery-case prototype was
inspected in portrait and landscape. The type selector is 324 × 44 CSS px in
portrait, Save is 350 × 58, Keep unsaved is 350 × 44, and Copy recording is
142.29 × 44. Choosing AT changes the prototype Save from disabled to enabled;
it does not submit anything. The incomplete-record frame is 390 CSS px wide
with scroll width 390. The same computed contrast table covers the added
controls (5.03:1 minimum; disabled text is ink-3 on surface-sunken, 6.30:1).
Docs-only lint, typecheck, app formatting and prototype HTML formatting
checks passed on the working tree based on 2525c143. No application test
or hardware acceptance is claimed for these mockups.
