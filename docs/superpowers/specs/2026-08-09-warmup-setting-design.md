# The warmup setting (Phase 9's warmup bullet, pulled forward) — design

**Date:** 2026-08-09. **Authority:** ROADMAP Phase 9's warmup bullet
(James's ruling, recorded 2026-08-08); `domain/types.ts` `Step`;
`domain/expand.ts` (`case "wu"` → `EnginePhase{type:"warmup"}`,
`expand.ts:128-134`); the preferences table (`server/db/schema.ts:144`,
whose `warmupMinutes`/`warmupOverride` columns predate this ruling and
model the superseded design); the 300-workout seeded library
(`server/seed/library/{o2,at,tr,an,onboarding}.ts`); walk 1's §18
record (a warmup interval programmed to a real PM5 and rendered as
`1 OF 2 · WARM-UP`). **Product rulings (James, 2026-08-09):** `wu` is
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
exactly one producer, the preference, prepended at draft-build. Every
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
ruling. Server validation on PUT /api/prefs: the shape above, bounds
inclusive, anything else 400s. Bounds echo the builder's own step
bounds where they exist (`domain/validate.ts` is the authority; the
warmup's time bound reuses the work-step minutes bound, distance
reuses the meters bound — the plan pins exact constants from
`validate.ts`, not from this prose).

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

`buildDraft` — the single seam both doors already share (Start and
Connect both construct the draft/phases there) — prepends, when
`warmup !== null`:

1. `EnginePhase{type: "warmup", seconds}` for time, or the distance
   equivalent (`expand.ts`'s warmup phase shape; distance warmups reuse
   the same phase type with `meters` — the plan verifies `EnginePhase`
   already carries the distance arm the way work phases do, since
   `WorkDuration` is kind-split everywhere).
2. `EnginePhase{type: "rest", seconds: restSeconds}` when rest is set.

Consequences, all via existing behavior: ConfirmTargets lists the
warmup row exactly as it lists one today (no target to nudge); the
Timer runs it; `compileProgram` emits it as interval 0 with no pace
target (the §15 #3 pace-time-zero convention, hardware-exercised in
walk 1); 7C's `buildLogSeed(phases, baselines)` receives the prepended
phase and marks it `kind: "warmup"`, so the monitor log skips it; the
manual log builders skip the phase as they always have. The logged
session's duration still reflects wall-clock reality on the monitor
path (run stamps) and the estimate path counts the warmup only in the
session estimate, never in the workout's own displayed duration (§5).

## 5. Estimates and the Builder

- The workout's own displayed duration (library rows, detail, Today)
  is WORK ONLY — unchanged code, since workouts no longer contain
  warmups.
- The Builder's hint line (`Builder.tsx:415`) becomes conditional: it
  renders only when the setting is ON, reading
  `+ <house-format> warm-up from your preferences` (time or meters,
  plus the rest when set), and disappears when OFF.
- ConfirmTargets' total line includes the prepended phases (it derives
  from the phase list; no new code expected — the plan verifies).

## 6. Removal of `wu`

- `domain/types.ts`: `wu` leaves the `Step` union; `validateSteps`
  rejects it (the error copy names the setting:
  `Warm-ups moved to Settings. Set yours on the You tab.`).
- `domain/expand.ts`: `case "wu"` deleted; `estimateMinutes` follows.
- `domain/bulk.ts` (import): a `wu` line is STRIPPED, not fatal; the
  import result carries a notice line
  (`N warm-up lines dropped. Warm-ups are a setting now.`) in the
  screen's existing notice idiom.
- Builder: the `wu` row type and its chip disappear;
  `builderState.ts`/`StepRow.tsx`/`IntervalSegments.tsx` lose their wu
  arms.
- The 300 seeds: every `{ k: "wu", ... }` line deleted across the five
  library files; nothing else about any workout changes (titles,
  structure, offsets, spm untouched). The library version marker
  (whatever `seedGlobalLibrary`'s reconcile keys on — the plan pins it)
  bumps so the reconcile updates existing databases.
- Custom workouts: a one-time server-side strip of `wu` steps at
  migration time (SQL over the workouts' steps jsonb, or a boot-time
  reconcile pass consistent with how the library reconciler already
  rewrites rows — the plan picks the mechanism the codebase already
  trusts and pins it). A stripped custom workout keeps everything else
  byte-identical.
- `domain/fixtures.ts` and every test fixture carrying `wu` follows.

## 7. The rebalance report (decision input, not a decision)

A committed script (`app/scripts/library-balance.ts`, run via
`pnpm exec tsx`) that:

- buckets all 300 seeded workouts by `estimateMinutes` into the
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
- Server: prefs PUT accepts both shapes + rest, rejects out-of-bounds
  and `wu`-era fields; the migration leaves existing rows `warmup:
  null`; the custom-workout strip is idempotent and byte-preserves
  non-wu steps.
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
