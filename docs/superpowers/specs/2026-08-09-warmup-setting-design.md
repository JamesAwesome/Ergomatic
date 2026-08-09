# The warmup setting (Phase 9's warmup bullet, pulled forward) — design

**Date:** 2026-08-09, adversarially revised same day (20 findings, 5
blocking — `2026-08-09-warmup-adversarial-review.md`; every B/M finding
is resolved in the section that owned it, and the review's Mandate-2
scorecard drove five briefing amendments the same hour).
**Authority:** ROADMAP Phase 9's warmup bullet
(James's ruling, recorded 2026-08-08); `domain/types.ts` `Step`;
`domain/expand.ts` (`case "wu"` → `EnginePhase{type:"warmup"}`,
`expand.ts:128-134`); the preferences table (`server/db/schema.ts:144`,
whose `warmupMinutes`/`warmupOverride` columns predate this ruling and
model the superseded design); the 300-workout seeded library
(`server/seed/library/{o2,at,tr,an,onboarding}.ts`); the in-repo
warmup-phase consumers (`domain/monitor/program.ts`'s warmup interval
arm; 7C's `buildLogSeed` warmup-kind tests); operator-observed but
UNCOMMITTED: walk 1's recording showed the programmed warmup rendered
as the session's first interval (adversarial M1 caught the §18 citation
as fabricated — the recording was never committed, so this claim is
marked for what it is and nothing below leans on it). **Product rulings (James, 2026-08-09):** `wu` is
FULLY REMOVED as a step type; the setting defaults OFF for everyone.

## 1. Goal and shape

One warmup concept in the whole app: a per-user SETTING (duration as
time or meters, plus an optional trailing rest) that the session flow
prepends. Workouts stop carrying warmups: the seeded library loses its
`wu` steps, custom workouts get a one-time strip, the builder loses the
row type, and the bulk import strips `wu` lines with a notice.

THE ARCHITECTURAL KEY (this is what makes the change small): `Step`
(authoring) and `EnginePhase` (session runtime) are already separate
types. `Step`'s `wu` dies; `EnginePhase`'s `"warmup"` SURVIVES with
exactly one producer, the preference, prepended where phases are BORN:
`buildRun` (`engine.ts:56-84`, the pure step-to-phase expansion —
adversarial B1: `buildDraft` returns `steps`, no phases, so the earlier
draft-seam claim was mechanically impossible). Every
downstream consumer of a warmup phase keeps working unmodified and
PROVENLY: the timer runs it, `compileProgram` programs it to the PM5 as
a no-target interval (§18 walk 1 rendered exactly this on hardware),
7C's `buildLogSeed` marks it `kind: "warmup"`, and both log builders
skip it.

NON-GOALS: no per-workout warmup override; no warmup pace target (a
warmup phase has no `PaceRef`, exactly as today's `expand.ts:132`
labels it "Easy"); no regen in this phase (the rebalance REPORT ships,
the regen decision is a follow-on ruling from its numbers); none of
Phase 9's other preferences move.

## 2. The setting

One nullable jsonb column replaces two dead ones:

```ts
// preferences.warmup (jsonb, nullable, default null = OFF):
{ kind: "time", minutes: number }        // 1..30, whole minutes
| { kind: "distance", meters: number }   // 100..10000, whole meters
// either shape may carry:
restSeconds?: number                     // 0 omitted; 5..595 whole seconds (the PM5 rest ceiling, interface-notes §8 — the connected path programs this rest verbatim)
| null
```

Migration: ADD `warmup` jsonb nullable; DROP `warmupMinutes` and
`warmupOverride` (the override was never consumed anywhere; the minutes
column's ONE consumer is the Builder hint, rewritten in §5). Existing
rows get `warmup = null` — off by default applies to everyone, per the
ruling. Server validation on PUT /api/prefs: TODAY the route silently ignores
unknown fields (pinned at `data.test.ts:1472-1481` — adversarial B5;
the spec's earlier "400s" described a route that does not exist). The
plan CHANGES the route: `warmup` joins the accepted-field list with
shape validation (bad shape 400s; unknown fields elsewhere keep their
ignore behavior), and the patch idiom gains an explicit-null arm — the
existing `!== undefined` merge cannot express "set warmup to null", so
clearing the setting needs its own presence check. Bounds are scalar
deferrals to `domain/validate.ts`'s own constants (time reuses the
work-step minutes bound, distance the meters bound; owner file named,
exact values pinned by the plan).

`usePreferences` gains the field (additive, the file's own pattern) and
its `save` patch carries it.

## 3. The You screen row

A `WARM-UP` row in You's settings block, beside 6I's "Learning the app"
row, in the screen's existing row idiom:

- OFF state: the row reads `WARM-UP · OFF`; tapping opens the editor.
- The editor: a time/meters segmented pair (the builder's
  `WorkDuration` input idiom — value field keeps `font-size: 16px`),
  an optional `REST AFTER` field (blank = none), and `Remove warm-up`
  to return to null. Copy carries no em-dash.
- ON state: the row reads the house duration format
  (`WARM-UP · 10:00` / `WARM-UP · 2000 m`, `+ :30 REST` when set).

Persistence through `usePreferences.save` (optimistic, the hook's
existing contract).

## 4. The session flow

The prepend lives in `buildRun` (`engine.ts:56-84`), the one function
that turns steps into `EnginePhase[]` for BOTH doors — `buildDraft`
(`draft.ts:46-64`) returns `steps` only and stays untouched
(adversarial B1). `buildRun` gains an optional `warmup` argument;
when present it emits, before the expanded steps:

1. `EnginePhase{type: "warmup"}` with `seconds` (time kind) or
   `meters` (distance kind);
2. a rest phase for `restSeconds` when set.

**Pricing a distance warmup (adversarial B3, the one genuinely new
mechanism):** the phone timer prices phases via `phaseSeconds`
(`expand.ts:91-99`), which needs `meters` AND a split; a warmup has no
target by ruling. The EFFORT precedent already solves this shape:
effort phases carry a display-only estimate (`domain/pace.ts`'s
`estimationSplit`) that prices the phase without programming a target.
A distance warmup does the same with an easy estimate (the plan pins
the estimator: `estimationSplit`'s own easy band against the rower's
6k baseline), used ONLY for the phone's countdown/progress/auto-advance
arithmetic. Nothing programs it: `compileProgram` still emits the
warmup interval with no pace target, per its existing warmup arm.
(§15 #3's pace-time-zero is that module's own INFERENCE, observed on no
hardware — adversarial M2; the convention is cited as the code's, not
as proven.)

**ConfirmTargets learns the prefix as NEW code (adversarial B2):** the
screen maps `draft.steps` (`ConfirmTargets.tsx:356`) and its total is
steps-based (`:342`), so a phase-layer warmup would be invisible.
It gains one preference-sourced, non-nudgeable WARM-UP row above the
step rows and includes the warmup (time, or the estimate-priced
distance) plus its rest in the displayed total. The Timer receives the
phases from `buildRun` and needs nothing new; a meters warmup behaves
exactly as a distance work phase does on the phone today. 7C's
`buildLogSeed(phases, baselines)` receives the prepended phase and
marks it `kind: "warmup"`; both log builders skip it, as their existing
tests already pin.

## 5. Estimates and the Builder

- The workout's own displayed duration (library rows, detail, Today)
  is WORK ONLY — unchanged code, since workouts no longer contain
  warmups.
- The Builder's hint line (`Builder.tsx:415`) becomes conditional: it
  renders only when the setting is ON, reading
  `+ <house-format> warm-up from your preferences` (time or meters,
  plus the rest when set), and disappears when OFF.
- ConfirmTargets' warmup row and total handling are §4's own new code
  (the earlier "no new code expected" claim was backwards — B2).

## 6. Removal of `wu`

**The unions, enumerated (the same-name trap — adversarial M7):**
`Step`'s `"wu"` DIES. The phase/segment vocabulary's `"wu"`/`"warmup"`
SURVIVES everywhere it appears — `expand.ts`'s `EnginePhase` type,
`IntervalSegments.tsx`, `surfaceModel.ts`, `Timer.tsx`'s phase arms,
7C's `logSeed.kind` — because the preference still produces warmup
phases. Only the AUTHORING union member and its producers are removed.

- `domain/types.ts`: `wu` leaves the `Step` union; `validateSteps`
  rejects it with `Warm-ups moved to Settings. Set yours on the You
  tab.`
- `domain/expand.ts`: `case "wu"` deleted from the STEP switch;
  `estimateMinutes` follows (the phase-level warmup arithmetic stays).
- `domain/bulk.ts`: the parser handles `wu` lines EXPLICITLY — parse,
  drop, count — never by case-deletion (which would make the line fatal
  and eat its block — adversarial M6). The import screen gains a notice
  line (NEW UI; no notice idiom exists today):
  `N warm-up lines dropped. Warm-ups are a setting now.`
- Builder: the wu row type leaves `builderState.ts` and the accordion
  components (`StepCard.tsx`/`StepEditor.tsx` — the 5E redesign's
  files; `StepRow.tsx` does not exist and there is no chip, adversarial
  M7). Legacy LOCAL builder drafts in localStorage may still carry wu
  rows: the draft loader strips them with the same notice copy.
- The seeds: **302 workouts, 302 `wu` steps** (300 library + 2
  onboarding — adversarial M5; `onboarding.test.ts` updates with its
  fixtures). Nothing else about any workout changes. No version marker
  exists or is needed: `seedGlobalLibrary`'s reconcile is
  content-addressed (`isDeepStrictEqual` over steps — adversarial M4)
  and rewrites changed rows on boot by itself.
- **Custom workouts and ORDERING (adversarial B4):** no read path
  revalidates stored steps, but `expand`/render paths would hit an
  unhandled step kind. The strip therefore runs IN the migration
  (SQL over the workouts' steps jsonb, idempotent, byte-preserving
  everything but `wu` entries), and migrations run at server boot
  BEFORE the api serves a request — so no client can fetch a stored
  `wu` after the new bundle exists. The read paths and their fates:
  workouts GET (post-migration data only), the builder's local draft
  (stripped at load, above), bulk import (explicit parse, above).
- `domain/fixtures.ts` and every test fixture carrying `wu` follows.
- `patterns.json`'s 20 `warmupMinutes` stat entries are ORPHANED, not
  deleted: the balance script (§7) and any future regen read the file,
  and rewriting it is the regen follow-on's business, not this
  phase's. A one-line comment in the balance script names the orphan.

## 7. The rebalance report (decision input, not a decision)

A committed script (`app/scripts/library-balance.ts`, run via
`pnpm exec tsx`) that:

- buckets all 302 seeded workouts by `estimateMinutes` into the
  generation phase's own ranges (the plan reads the exact bucket
  edges and target percentages out of the generation spec /
  patterns.json and pins them),
- prints the distribution BEFORE the wu-drop (computed from git
  history's seed state or a flag replaying with warmups included) and
  AFTER, beside the targets, with per-type breakdowns,
- states drift per bucket in points.

Its output lands in the PR body verbatim. James rules on regen from
those numbers; the regen itself (patterns.json is regen-ready) is a
separate follow-on if ruled needed. ROADMAP's Phase 9 warmup bullet
gets checked with this spec as its home; the regen follow-on line
replaces the recompute clause.

## 8. Testing

- Domain: `validateSteps` rejects `wu` with the exact copy; `expand`
  no longer emits warmup phases from steps (property: no `Step[]`
  input can produce a warmup phase); `estimateMinutes` parity on a
  seed workout before/after its wu-strip differs by exactly the
  warmup's minutes.
- Draft seam: `buildDraft` with the setting ON prepends warmup(+rest)
  for BOTH kinds; OFF prepends nothing; the prepended phase reaches
  `compileProgram` as interval 0 with `targetSplit: null` and reaches
  `buildLogSeed` as `kind: "warmup"` (one integration test each — the
  7C fixtures already model the downstream halves).
- Server: prefs PUT accepts both shapes + rest and explicit null
  (clearing), rejects out-of-bounds shapes; unknown-field ignoring
  stays pinned as-is; the migration leaves existing rows `warmup:
  null`; the custom-workout strip is idempotent and byte-preserves
  non-wu steps. MIGRATION-INDEX CHECK before generating: another
  session's worktree may hold an unmerged migration — the drizzle
  timestamp-collision rule applies (briefing).
- UI: the You row's three states; the Builder hint's conditional; the
  import notice; screenshots for the You row (on/off) and the refreshed
  builder.
- Realistic fixtures rule applies: at least one test per client task
  starts from a real seeded workout.
- e2e: one walk — set a time warmup with rest on You, start a library
  session, see the warmup phase first in Confirm and the Timer; and the
  import walk's wu-strip notice.

## 9. Exit

No workout anywhere (seeded, custom, imported) contains a warmup step;
a rower who wants one sets it once on You and every session — phone or
connected — prepends it; the balance report's numbers are in the PR
body awaiting the regen ruling; and every consumer of warmup phases
(timer, confirm, PM5 programming, both log builders, 7C's seed)
behaves identically to phase 7's hardware-proven behavior.

## Corrections (found in implementation)

Four load-bearing claims above did not survive contact with the code.
Recorded here so the spec doesn't silently win arguments it lost —
three were caught by implementers' task reports at the time; the
fourth (§1, below) was caught later, by the whole-branch review, and
is the more important of the two "existing compileProgram arm" claims
since §1's own argument for the change being small rests on it.

- **§1's "keeps working unmodified" claim is the same falsehood as
  §4's, and it's the load-bearing one.** §1, in the paragraph the spec
  itself labels THE ARCHITECTURAL KEY, claims: "Every downstream
  consumer of a warmup phase keeps working unmodified and PROVENLY: the
  timer runs it, `compileProgram` programs it to the PM5 as a no-target
  interval (§18 walk 1 rendered exactly this on hardware) ..." FALSE in
  the same way as §4's claim below (Task 4 wrote the `program.ts:488`
  guard from scratch — nothing "kept working," because nothing existed
  yet to keep working) — and this is the version that matters more,
  since §1's whole pitch for the change being architecturally small
  depends on "unmodified" being true. It is also a second, independent
  falsehood on its own terms: it leans on "§18 walk 1 rendered exactly
  this on hardware" one paragraph after this spec's own Authority block
  (above) discloses that the walk-1 recording was never committed and
  says explicitly "nothing below leans on it" — §1 leans on it anyway,
  parenthetically. What actually shipped: `compileProgram`'s warmup arm
  is new code (Task 4), unverified on real hardware (no committed
  capture exists either way).

- **§4's "existing warmup arm" was not existing — it was new code.**
  §4 claims: "Nothing programs it: `compileProgram` still emits the
  warmup interval with no pace target, per its existing warmup arm."
  FALSE: no such arm existed anywhere in `domain/monitor/program.ts`
  before this phase. Task 4 added it — the `phase.type === "warmup" →
  targetSplit: null` guard now at `program.ts:488` — which is the
  correct behavior, but it shipped as NEW code this phase wrote, not a
  pre-existing convention the design could lean on as already proven.

- **§2's bounds are new constants, not a reuse of `validate.ts`'s.**
  §2 claims: "Bounds are scalar deferrals to `domain/validate.ts`'s own
  constants (time reuses the work-step minutes bound, distance the
  meters bound...)." FALSE: Task 2 shipped them as their own named
  constants (`server/routes/data.ts`'s `WARMUP_MINUTES_MIN/MAX`,
  `WARMUP_METERS_MIN/MAX`, `WARMUP_REST_SECONDS_MIN/MAX`, hand-mirrored
  client-side in `WarmupRow.tsx`), not by importing or otherwise
  reusing `validate.ts`'s work-step/distance bounds. The VALUES happen
  to agree (1..30 minutes, 100..10000 meters) — the divergence is the
  MECHANISM (duplication with a same-values comment, not reuse), and
  it's documented at the constants' own definition sites, not hidden.

- **§6's "builder LOCAL draft in localStorage" never existed.** (The
  task dispatch that requested this section cited this claim as "§4" —
  re-read against the spec's own text, it is §6, "Removal of `wu`":
  "Legacy LOCAL builder drafts in localStorage may still carry wu
  rows: the draft loader strips them with the same notice copy."
  Correcting the citation here rather than silently using the wrong
  one.) FALSE: `grep -rn "localStorage" src/builder/` returns nothing —
  the builder has no local draft mechanism at all, in localStorage or
  otherwise. The real seam needing the equivalent fix was
  `session/draft.ts`'s `SessionDraft` (the session-confirm screen's own
  local draft, keyed in localStorage) — Task 5 shipped
  `stripLegacyWarmups`/`loadDraftWithNotice` there instead, reusing the
  same shared `droppedWarmupNotice` copy so the two doors a stray `wu`
  step could arrive from never say the fact two different ways.
