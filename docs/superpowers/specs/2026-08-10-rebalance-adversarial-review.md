# Adversarial review — the library rebalance design spec

**Target:** `docs/superpowers/specs/2026-08-10-library-rebalance-design.md`
(commit f5ce131). **Date:** 2026-08-10. **Standard:** `.claude/agent-briefing.md`
§"Specs and briefs are evidence-backed" — in particular the falsifying-line
rule, the §-citation-carries-its-sentence rule, and the "'the plan pins it'
may only defer a SCALAR" rule. Read-only on code; every number below was
recomputed this session from the file or the script named beside it.

**Verdict: NEEDS REDESIGN of §2 and §3 (the target grid and the retune
ceiling are jointly infeasible, and §2's premise is refuted by its own
authority). §4–§8 are sound after edits.** §6's book table is a faithful
rendering of `patterns.json` and survives the attack intact — the damage is
in the interpretation rules bolted to it, not the numbers.

---

## How the numbers below were produced

Three throwaway scripts, run in this worktree with
`pnpm exec tsx`, deleted afterwards. Each reads `LIBRARY_WORKOUTS`
(`app/server/seed/library/index.ts:11`), `estimateMinutes`
(`app/domain/expand.ts`), and the frozen literal
`app/scripts/library-warmups-before.json`, with the same nominal baselines
`library-balance.ts:56` uses (`{k2Seconds: 112, k6Seconds: 122}`) and the
same band edges (`library-balance.ts:74-83`). The baseline they reproduce is
`pnpm exec tsx scripts/library-balance.ts`'s own MOVED table, which prints
`FAITHFULNESS CHECK: BEFORE reproduces the design grid in 20/20 cells` on
this branch — so the replay is trustworthy by the script's own gate.

MOVED, post-warmup-merge, as printed today:

| | `<20` | 20-30 | 30-45 | 45-60 | 60+ |
|---|---|---|---|---|---|
| O2 | +10 | +2 | −2 | −5 | −5 |
| AT | +11 | +8 | −8 | −10 | −1 |
| TR | +12 | +4 | −13 | −2 | −1 |
| AN | +18 | −5 | −8 | −4 | −1 |

Derived once, used throughout: **144 of 300 workouts crossed a band**
(3 of them crossed two: `Ball Lightning`, `Debris Flow`, `Bomb Cyclone`).

---

## BLOCKING

### B1. §2's grid and §3's +25% ceiling are jointly infeasible, and the infeasibility is a whole-band property

§3: *"a ceiling of +25% total work time"*. §2: *"the OLD target's cell counts
stand as the new targets"* — i.e. the grid at `library-balance.ts:94-99`.
§3's budget: *"the MOVED table implies most of the deficit refills by retune
(the +25% ceiling covers a dropped 5' warm-up on most 20-40' workouts)"*.

A band-crosser regains its old band only if `after × 1.25 ≥` that band's lower
edge. Computed over all 144 crossers:

**40 of 144 crossers cannot regain their old band under the ceiling.** Worst
cases, all recomputed:

| type | title | after | old wu | pre-strip | needs | growth required | ceiling gives |
|---|---|---|---|---|---|---|---|
| AN | Bomb Cyclone | 25' | 20' | 45' | ≥45' | **+80%** | 31.3' |
| O2 | Light Breeze | 12' | 8' | 20' | ≥20' | **+66.7%** | 15' |
| AN | Ball Lightning | 18' | 12' | 30' | ≥30' | **+66.7%** | 22.5' |
| AN | Debris Flow | 18' | 12' | 30' | ≥30' | **+66.7%** | 22.5' |
| O2 | Laminar | 13' | 10' | 23' | ≥20' | **+53.8%** | 16.3' |
| AN | Downdraft | 13' | 7' | 20' | ≥20' | **+53.8%** | 16.3' |
| O2 | Flat Calm | 20' | 10' | 30' | ≥30' | **+50%** | 25' |
| AN | Rope Tornado | 20' | 10' | 30' | ≥30' | **+50%** | 25' |
| AT | Offshore Flow | 14' | 6' | 20' | ≥20' | **+42.9%** | 17.5' |
| TR | Monsoon Surge | 14' | 10' | 24' | ≥20' | **+42.9%** | 17.5' |

Per-workout counts are not the blocking part — a spec with a REPLACE escape
can absorb 40 hard cases. The blocking part is that the shortfall survives
*any* assignment. Hall's condition over the ordered bands (a workout may be
retuned into any band from its current one up to `band(after × 1.25)`,
including multi-band jumps), per type, **against an exact match to §2's
grid**:

| type | binding cut | supply | demand | short |
|---|---|---|---|---|
| O2 | bands ≥ 30-45 | 71 | 74 | **3** |
| AT | bands ≥ 30-45 | 47 | 51 | **4** |
| TR | bands ≥ 30-45 | 38 | 44 | **6** |
| AN | bands ≥ 20-30 | 38 | 46 | **8** |

**Minimum forced replacements: 21.** Concretely for AN: 22 of the 60 AN
workouts cannot reach 20' under the ceiling, and the grid allows only 14 in
`<20`. That is a band that cannot be balanced by retuning at any effort —
exactly the case the brief calls blocking. Applying §2's own ±1-per-cell
tolerance (see m1 — the tolerance is load-bearing here) the floor drops but
does not vanish: **AT 1, TR 3, AN 4 — minimum 8 forced replacements.**

And the ceiling reading above is the *generous* one. §3 says "+25% total
**work** time"; I applied it to total workout time. Under the work-only
reading with rests held, AN barely moves at all: `Giant Hail` is 25' total of
which 7' is work and 18' is rest, so +25% of work is +1.75' → 26.75', short
of 30' by a mile. §3 hedges toward the generous reading (*"rest may scale with
the pieces it separates"*), but the denominator is never stated, and every
number in this finding is a **lower bound** on the shortfall.

Finally, §3's stated evidence does not support its conclusion: the MOVED
table is a *net* per-cell count. It carries no information about any
individual workout's required growth, so "the MOVED table implies most of the
deficit refills by retune" is an inference the cited artifact cannot license.
The parenthetical is separately unrepresentative — 209 of 300 workouts carried
warm-ups **>5'** (distribution: 4'×8, 5'×83, 6'×49, 7'×20, 8'×46, 9'×11,
10'×70, 12'×8, 14'×1, 15'×2, 17'×1, 20'×1), and 30 of the 40 impossible cases
are workouts now under 20', which the "20-40'" qualifier excludes.

**Required:** state the real numbers (≈144 retunes, ≥8–21 forced
replacements), and either raise/retire the ceiling, allow multi-band moves
explicitly, or accept a much larger replacement budget — each of which
resizes §4's review gate and §5a's sample.

### B2. §2's central premise is refuted by the authority it inherits, and the spec never cites the line

§2: *"the design intent was always the post-warm-up work distribution; the
old grid simply measured it warm-up-inclusive"*.

The falsifying line, `docs/superpowers/specs/2026-08-03-workout-generation-design.md:94`,
quoted verbatim:

> Duration = total time including warm-up and rests.

`app/scripts/library-balance.ts:62-71` already names this as decisive, in the
comment above the very constant §2 proposes to reuse:

> The falsifying line for everything this script prints is that spec's LINE
> 94 … THE TARGET GRID IS THEREFORE DEFINED OVER WARM-UP-INCLUSIVE DURATIONS

§2 cites the generation design in the spec's Authority block but never quotes
L94 and never engages it. The grid's cell counts are counts *of
warm-up-inclusive durations*. Carrying the counts across to a warm-up-free
measuring rod is not "the same design intent re-authored" — it is a different
design decision: it requires the library's prescribed work to grow by
approximately the stripped warm-up volume wherever a workout crossed. §1's
stated goal is *"restores the original band SHAPE"*; §2 silently substitutes
*restores the original band COUNTS*, which is a different objective once the
rod changed.

The consequence is never stated: a rower with a 10' warm-up preference, given
a retuned `Flat Calm` at 30' work, rows a 40' session where the original grid
placed it at 30'. §2 also never considers the alternative that achieves §1's
literal goal at near-zero content cost — re-author the band **edges**
warm-up-free (shift them down by a nominal warm-up) and leave the workouts
alone. I accept that James's ruling at PR #71 ("the 30-45 band took a hit" →
rebalance, HYBRID retune/replace) forecloses the do-nothing option; but a spec
that changes 144 workouts on the strength of a premise its own authority
refutes must at minimum quote L94, say why it is being overridden, and state
the volume consequence for James to rule on.

### B3. §2's `targets` block does not exist, and the "duplicated TARGET constant" it dies for does not exist either

§2: *"The grid lands IN `patterns.json` as the new `targets` block (replacing
the warm-up-inclusive one)"* and *"`library-balance.ts` reads targets from the
file (single source; today's duplicated TARGET constant dies)"*.

`app/domain/generation/patterns.json`'s top-level keys are **exactly
`_meta` and `cells`** (recomputed this session). There is no `targets` block
and never was; nothing is being replaced. `grep -n 'targets' patterns.json`
returns nothing.

There is likewise no duplication today. `TARGET` exists once, at
`library-balance.ts:94-99`, and `library-balance.ts:88-93` says so
explicitly:

> This is deliberately NOT the same object as library.test.ts's QUOTA
> constant: that file now pins the MEASURED post-strip reality (a
> content-regression guard), while this is the unchanged design intent the
> strip drifted away from.

The two constants hold different numbers *for a reason*. The irony is that
**this phase creates the duplication §2 claims to remove**: after the
rebalance, `library.test.ts:34-39`'s `QUOTA` and `library-balance.ts`'s
`TARGET` become the same grid — and §2 does not mention `QUOTA` at all
(see M6).

Separately, `patterns.json` is a poor home for an authored quota grid.
`_meta.source` is `"owner's reference photos, extracted 2026-08-03"` and
`_meta.policy` is `"aggregate statistics only — no titles, no prose, no
per-workout rows"`. A design target is neither an aggregate statistic nor
photo-derived, and it has a different regeneration lifecycle: a future
re-extraction of the book would clobber it. (`patterns.test.ts:9-20`'s
allowlist would not catch a top-level `targets` key — it only walks
`patterns.cells` — so nothing would fail; the collision would be silent.)

**Required:** name a real home for the new grid (a new module beside
`library-balance.ts`, imported by both it and `library.test.ts`, is the
single-source fix that actually removes a duplication), and drop the false
justification.

### B4. §2 deletes §6's own cited evidence, and §6 misquotes it

§2: *"the 20 orphaned `warmupMinutes` stat entries are deleted in the same
edit — the file becomes fully warm-up-free."*

§6, interpretation rule 1, binding on every generating agent:

> **The book cells are WARM-UP-INCLUSIVE** (their `warmupMinutes` stats ran
> 5-10'). A warm-up-free workout consults the cell its duration occupied
> BEFORE the strip

Two contradictions in one edit.

**(a) The file does not become warm-up-free.** The `cells` keys
(`O2|30-45`, `AN|<20`, …) are band assignments of *book entries measured
warm-up-inclusive* — §6 says so in its own first rule. Deleting
`warmupMinutes` deletes the evidence for that property, not the property. A
future agent reading the post-edit file will find twenty cells banded by an
undocumented convention and a spec sentence telling them the file is
warm-up-free. That is precisely the stale-rationale defect the briefing's
comment-sweep rule exists for.

**(b) "ran 5-10'" is wrong.** Recomputed from the file, the per-cell
`warmupMinutes` ranges are `[5,10]` for `TR|20-30` and `TR|30-45`, `[10,10]`
for fourteen cells, and **`[10,20]`** for `AN|20-30`, `AN|30-45` and
`AN|45-60`. The true span is 5-20', and the 20' end matters: the AN cells with
20' book warm-ups are the same AN cells whose seeds carry 12-20' warm-ups
(`Bomb Cyclone` 20', `Macroburst` 17', `Ball Lightning`/`Debris Flow` 12')
and which produce the worst rows in B1's table. The one number §6 quotes from
the stat block is the number that makes the ceiling look survivable.

**Required:** keep `warmupMinutes` (or move it to a documented provenance
note in the same file), and correct the range to 5-20'.

---

## MAJOR

### M1. §6's `shapes` column is not §5b's vocabulary, and no classifier for either exists in the repo

§6, column legend: *"shapes = archetype counts (the variety audit's
vocabulary)"*.

The two vocabularies are disjoint in three members each.

| source | vocabulary |
|---|---|
| `patterns.json` `shapes` (recomputed over all 20 cells) | `continuous`, `nxtime`, `nxdistance`, `mixed`, `ladder`, `pyramid`, `unmapped` |
| §5b's histogram | `continuous`, `evenly-split intervals`, `pyramid`, `ladder`, **`rate-change`**, `mixed` |

`rate-change` appears nowhere in `patterns.json`; `nxtime`, `nxdistance` and
`unmapped` appear nowhere in §5b. So §6's table cannot calibrate §5b's
histogram, and §6's parenthetical is false as written. `rate-change` *is*
computable from the step grammar (`o2.ts`'s `Petrichor` — three work steps,
same 3' duration, same `6k+12` ref, spm 20→22→24 — is unambiguous), but it is
not separable from `nxtime` in the digest, so the book can never say whether a
cell's rate-change share is faithful.

Worse for §7's scope claim: **there is no archetype classifier anywhere in the
repo.** `grep -rn "archetype|pyramid|ladder|nxtime|nxdistance|continuous"
--include="*.ts" app/domain/` returns only `plans.ts`'s prose ("a strict
O2 > AT > TR > AN pyramid") and one unrelated `pm5/intervalIndex.ts` comment.
`domain/expand.ts` has no archetype vocabulary at all. §5b's histogram
therefore requires a new classifier written from scratch, which §7's *"No
domain, server, or client code changes expected"* does not budget for.

### M2. §5b's thresholds already fail on today's library outside the deficient bands — the spec's own escape hatch fires before the plan is written

§5b: *"they must pass on today's content outside the deficient bands — a
threshold today's library fails is a wrong threshold, flagged back to the
spec, not silently loosened."* This is that flag-back.

Implementing §5b's definitions as literally as they can be read (classifier
assumptions listed below), over today's 300 grid rows:

- **">60% of a cell" fails in 2 of 20 cells:** `AN|30-45` (evenly-split 8/10 =
  80%) and `TR|30-45` (evenly-split 13/19 = 68%).
- **"zero near-duplicate pairs within a cell" fails in 10 of 20 cells:**
  `AN|<20` (1 pair), `AN|20-30` (3), `AN|30-45` (2), `AN|60+` (1),
  `AT|20-30` (1), `O2|20-30` (1), `O2|30-45` (2), `O2|60+` (4),
  `TR|<20` (1), `TR|45-60` (1).

The most definition-robust failure — it survives any reasonable reading of the
detector — is `O2|60+`, four continuous singles at an identical prescription
differing only in length:

| title | total | steps |
|---|---|---|
| Fair Wind | 70' | one 70' work step, `6k+12`, spm 20 |
| Morning Mist | 67' | one 15000 m work step, `6k+12`, spm 20 |
| Sleet | 65' | one 65' work step, `6k+12`, spm 20 |
| Glass Sea | 60' | one 60' work step, `6k+12`, spm 20 |

Three pairs sit inside 10% of each other. `library.test.ts:194-200` already
gates *structural* identity (`new Set(sigs).size === sigs.length`), so these
passed — near-duplication is exactly the gap §5b is for, and it is real
content debt, not a detector artifact.

Note the interaction with the rebalance: `O2|60+` is a **deficient** cell
(15 → 20, +5). The spec plans to add five workouts to a cell that already
fails its own zero-pairs rule with four pairs. And several failing cells
(`AN|<20`, `AT|20-30`, `O2|20-30`, `TR|<20`) are the *overfull* bands — the
ones §5b's calibration clause explicitly says must pass today.

*Classifier assumptions (mine, because the spec supplies none):* continuous =
one work step, no `reps`; evenly-split = a `reps` block over a single work
step, or n identical work steps; rate-change = equal durations and equal refs
with varying spm; ladder = monotone durations; pyramid = strictly up then
strictly down; mixed = otherwise. Near-duplicate key = (archetype, piece
count = `reps.count × work-step count`, totals within 10%, identical primary
`off`). The result is threshold-indicative, not authoritative — which is
itself finding M3.

### M3. §5b's near-duplicate key is not computable for 36 of the 60 AN workouts

§5b: *"same archetype + same piece count + total within 10% + same offset band
= near-duplicate"*.

**"Same offset band" has no referent for an `EffortRef`.**
`app/domain/types.ts:9-13` is a key-presence union: `{ effort: "max" | "min" }`
carries no `.off`. Recomputed: 75 of 765 work steps in the library are
`EffortRef`s (AN 68, TR 5, O2 2), and **36 of the 60 AN workouts** carry at
least one. In an all-effort cell every workout shares one degenerate "offset
band" and the key collapses to (archetype, piece count, ±10% total) — which
over-fires. It flags all three of these as mutual near-duplicates in
`AN|20-30` purely because each is a "ladder, 8 pieces, 25-27'":

- `Giant Hail` 25' — 4 × [75 s, 30 s] max
- `Flash Flood` 27' — 2 × [30 s, 45 s, 60 s, 90 s] ascending
- `Bomb Cyclone` 25' — 2 × [75 s, 60 s, 45 s, 30 s] descending

No content reviewer would call those three the same workout. **"Piece count"
is also undefined** for a `{k:"reps", count:n}` block — is a `reps 4` over two
work steps 2 pieces or 8? I read it as 8; reading it as 2 changes which pairs
collide. Both terms need definitions in the spec before an implementation task
can calibrate anything.

### M4. §6's dash-fallback chain has nothing to fall back on for three of the four types — and the gap is exactly where the new content goes

§6, interpretation rule 2: *"fall back to the nearest populated band of the
same type, tightened by the type header's calibration (e.g. O2's steady
6k+8..+12, firm to +4, floats +13..+16 — the seed file headers are
calibration James already reviewed and they BEAT wider book ranges where they
conflict)"*.

The O2 example is faithful. `app/server/seed/library/o2.ts:7-12`:

> 6k-base pace only, steady work at 6k+8..+12 with firmer pieces down to
> 6k+4; 6k+13..+16 only as a designated float — relief beside work at least
> 6 s/500m faster, never a prescription of its own (James's offset
> calibration, 2026-08-03)

The other three headers do not carry one.

| file | offset calibration in the header |
|---|---|
| `o2.ts:7-12` | full range set, as quoted |
| `an.ts:8-9` | one-sided floor only: *"nothing faster than 2k-4 as a split ref (beyond that is `{effort:"max"}`)"* — no ceiling, no base convention, no spm range |
| `at.ts:1-9` | **none** — structure/variety and the 0-or-5 totals rule only |
| `tr.ts:1-12` | **none** — rest-ratio prose only (*"often 1:2 or more"*, *"nearer 1:1"*, the 8×1000 m canon) |

And the cells whose `paceOff` is `null` in the file — the ones that need the
fallback — are concentrated in the two types with no calibration: `AN|30-45`
(2k null), `AN|45-60` (both null), `AN|60+` (both null), `TR|45-60` (6k null),
`TR|60+` (6k null), plus `AT|<20`, `O2|<20`, `O2|20-30` (2k null in each).
`AN|45-60`, `AN|60+`, `TR|45-60` and `TR|60+` are precisely the deficient high
bands where the replacements land. The rule reads as complete because its only
worked example is the only type it works for.

### M5. §6's book spm ranges collide with a hard test gate, and §6's review-table escape does not exist for spm

§6: *"a retune or replacement stays inside its cell's ranges, and a value
outside them needs a review-table justification."*

`app/server/seed/library/library.test.ts:37-42` is a hard gate:
`O2 [18,26]`, `AT [22,26]`, `TR [24,28]`, `AN [26,32]`, with
`library.test.ts:105-113` additionally requiring every rate to be even. §6's
book ranges are far wider in every type:

| cell | §6 spm (= the file) | `library.test.ts` gate |
|---|---|---|
| O2 30-45 | 12-34 | 18-26 |
| AT 20-30 | 16-32 | 22-26 |
| TR 30-45 | 16-38 | 24-28 |
| AN 20-30 | 24-36 | 26-32 |

An agent that follows §6 literally reds the suite, and no review-table
justification can un-red it. §6 needs a sentence saying the seed spm gate is
the binding constraint and the book column is context — which is what
interpretation rule 2 already says about *offsets* ("the seed file headers …
BEAT wider book ranges"), just never extended to spm.

### M6. §7's scope is wrong in both directions

§7: *"Seed edits only (the five type files) + `patterns.json` … + the new
variety test + the committed artifacts. No domain, server, or client code
changes expected; any that prove necessary are findings, not scope."*
Unlisted and certainly required:

- **`app/server/seed/library/library.test.ts`.** `:34-39`'s `QUOTA` pins the
  MEASURED post-strip grid — the exact numbers this phase changes — and
  `:77` pins `LIBRARY_WORKOUTS` at 300 distinct titles. The file's own comment
  (`:30-33`) calls `QUOTA` "the MEASURED post-strip reality (a
  content-regression pin)". It must be rewritten, and after the rebalance it
  becomes numerically identical to `TARGET` (see B3).
- **`app/scripts/library-balance.test.ts`** — covers the constant §2 replaces.
- **`app/src/monitor/driver.test.ts`** — names `Sea Fret` 16 times and asserts
  its exact compiled shape (`:99-101` loads it from the seed and throws if
  absent; `:82` "Sea Fret's own two work steps each carry a 60s rest";
  `:938` "the full happy path over a real compiled workout (Sea Fret)";
  `:4782`, `:4856` on interval 0). `Sea Fret` is O2 `<20` at 8' — a band that
  must shed 10 of 12 — so it is a prime retune candidate, and retuning it
  rewrites a large client suite. `app/src/monitor/program.sweep.test.ts:223-272`
  does the same for `Beam Sea` (TR `<20`, which must go 21 → 9).
- **e2e is at risk despite §7's *"e2e untouched in intent"***:
  `app/e2e/screenshots.spec.ts:455` pins `"Sea Fret"` as the leading library
  row and `app/e2e/flows.spec.ts:221` names it as a bare `REPEAT x2` fixture.

The cheap mitigation the plan should adopt: declare a short list of
**fixture-pinned titles that may not be retuned** (`Sea Fret`, `Beam Sea`,
plus whatever a title grep over `e2e/` and `src/` turns up), and route those
workouts' cells through other members.

### M7. §7 defers a safety premise that the file it names answers in one line

§7: *"the plan reads `seedGlobalLibrary` and pins what happens to a row whose
title disappears from the seeds (delete? orphan?), since replacement makes
that path live for the first time. If disappeared-title rows persist as
orphans, the plan adds the cleanup to the reconcile (server change, admitted
as scope)."*

Read this session. `app/server/seed/seed.ts:44-46`, the docstring:

> content changed → UPDATE in place (row id and session-log links survive …);
> title missing → INSERT; **title removed from code → DELETE** (those log
> links null via ON DELETE SET NULL).

And the code, `seed.ts:80-87`: `codeTitles` is the set of titles in the
`library` argument; every global whose title is absent goes into `toDelete`;
`deleteGlobalsByIds(toDelete)` runs inside the same advisory-locked
transaction. `app/server/db/schema.ts:97-99` confirms the FK:
`workoutId: uuid("workout_id").references(() => workouts.id, { onDelete: "set null" })`.

So: **DELETE, not orphan.** There is no orphan branch, no cleanup to add, and
§7's conditional server-change scope is dead text. User-visible consequences,
each traced: the row vanishes from the Library list (globals are listed
directly, no user copies exist); `session_logs` keeps its row with
`workout_id` nulled and its own `workoutTitle`/`workoutType` snapshot
(`schema.ts:100-101`), so history renders unchanged; plans hold **type codes,
not workout ids** (`app/domain/plans.ts:5-9`, `sessions: PlanCode[]`), so
there is no plan reference to break; `todayPick` is covered by M8. Replacement
is safe.

The finding is a process one, and it is the briefing's named failure mode:
*"'The plan pins it' may only defer a SCALAR … It may never defer a premise
the design's architecture depends on."* Whether replacement is safe is exactly
such a premise; §3's whole REPLACE arm rests on it; and the answer was three
lines into the file §7 names.

### M8. §3's todayPick claim is correct, unevidenced, and quotes the rule it declines to follow

§3: *"`todayPick`/plan references resolve by id and the plan re-picks as it
already does for any missing workout (the plan pins the exact fallback
behavior by reading it, falsifying-line rule, before claiming it)."*

The falsifying line, `app/domain/suggest.ts:213-215` (and the identical pair
at `:254-256` in `suggestFreestyle`):

```ts
const pickOverride = todayPickId
  ? sorted.find((e) => e.id === todayPickId)
  : undefined;
const picked = pickOverride ?? sorted[0];
```

A `todayPickId` that no longer resolves yields `undefined` from `.find` and
the pick falls through to the least-recently-done head of the pool. It is
already covered: `app/domain/suggest.test.ts:792`, *"ignores todayPick when
absent from the pool"*. The claim is TRUE. A spec that names the
falsifying-line rule in the same sentence in which it defers the read is a
worse artifact than one that never mentions it — the citation reads as
evidence to a skimming reviewer.

---

## MINOR

### m1. §2's ±1 tolerance rests on a false account of the old check, and it is load-bearing

§2: *"AFTER matches the new grid within ±1 per cell (the BEFORE-era tolerance:
the old check accepted the 2-row onboarding skew)"*.

The old check accepted no skew. `library-balance.ts:152-161`'s
`gridMismatches` flags every cell where `delta !== 0` — exact — and
`library-balance.ts:149-151` explains why the onboarding rows never reach it:

> It is deliberately computed over `LIBRARY_WORKOUTS` (300), not
> `GLOBAL_LIBRARY_SEED` (302): the two onboarding rows postdate the grid and
> are not part of what it was authored against.

The onboarding rows were **excluded**, not tolerated. §2 loosens an exact gate
to ±1 across 20 cells — up to 20 workouts in the wrong band — on a precedent
that does not exist. It matters numerically: the tolerance is what drops B1's
forced-replacement floor from 21 to 8, so it is doing real work in the
feasibility argument while being justified by a misreading.

### m2. §6's table body is FAITHFUL — recomputed in full

All 20 rows recomputed from `patterns.json` this session: `n`, the `shapes`
counts (including every `+N others` roll-up — e.g. `O2 60+`'s "+4" is
`ladder 3 + unmapped 1`; `AT 30-45`'s "+3 others" is
`pyramid 1 + continuous 1 + nxdistance 1`), `workRestRatio`, `paceOff`, `spm`,
`repsCount` and `effortShare` all match the file exactly. No transcription
errors found. Two rendering conventions the plan should pin so a later reader
does not misread them: the offsets column silently drops a base whose range is
`null` (`AN <20` renders `2k -5..-5` and omits the null 6k), and a `-` in the
W:R / offsets / reps columns means the field is `null` in the file, which is
what interpretation rule 2 already says.

### m3. The translation rule is undefined for replacements and silent about band edges

§6, rule 1: *"A warm-up-free workout consults the cell its duration occupied
BEFORE the strip: a retuned 27' workout that was 32' with its warm-up obeys
the 30-45 cell's ranges, not 20-30's."*

A **replacement has no pre-strip duration** — it never had a warm-up. §3 says
replacements target the deficient band; §6 says consult the pre-strip cell.
Composed, they give no answer for the one category of content the phase
generates from scratch. Simplest fix: replacements consult the cell one band
above their target, matching the retune case's effective offset.

And **55 of 300 workouts had a pre-strip duration sitting exactly on a band
edge** (12 at 20', 26 at 30', 11 at 45', 6 at 60' — e.g. O2 `Flat Calm` at
20' + 10' = exactly 30'). So the rule's outcome for a sixth of the library
rides on inclusivity, which §6 never states. `library-balance.ts:74-83` is
lower-inclusive (`m < 30 ? "20-30" : …`, so 30' → 30-45); the spec should say
so.

### m4. sortOrder churn on the first boot after a replacement

`seed.ts:20-33`'s `contentEqual` includes `row.sortOrder === w.sortOrder`, and
`library/index.ts:11-16` assigns `sortOrder` by array position across the
concatenated type blocks. Deleting one workout from `o2.ts` therefore changes
the `sortOrder` of every subsequent row and triggers up to ~290 `updateGlobal`
calls on the next boot. Harmless (one locked transaction, ids preserved), but
the plan should expect it rather than read it as a reconcile bug, and the
integration test's expectations may need widening.

### m5. §5a's "random 10% of retunes" is unsized because the spec never counts the retunes

The spec contains no estimate of how many workouts change. From the numbers in
B1 it is ≈144 band-crossers, so §5a's sample is ≈14 retunes + ≥21 replacements
+ 5 controls ≈ 40 rows for James. That is a reasonable ask and worth stating
as a number so James is agreeing to a known workload. Its power is modest: a
14-of-144 sample catches a 10%-defective retune population with ≈77%
probability and a 5%-defective one with ≈51%. If James wants better than
coin-flip detection of a 5% defect rate the sample needs roughly 30%, not 10%
— a decision for him, but only if the spec puts the number in front of him.

### m6. §4's review table is FEASIBLE and smaller than its own precedent — this attack fails

`2026-08-03-workout-generation-design.md:149`, quoted:

> of the generated 300 — a rendered table grouped by grid cell (name,
> structure, pace refs, spm, pain)

The :149 idiom was already a **300-row** table grouped by grid cell, and James
reviewed it once. §4's table covers only the ~165 changed rows (≈144 retunes +
≥21 replacements), so it is strictly smaller than the precedent it invokes.
§4's citation of the idiom is accurate and the ask is proportionate.

### m7. §3's ceiling denominator is ambiguous

*"a ceiling of +25% total work time"* reads either as 25% of the workout's
total time or 25% of its work time excluding rest. Every number in B1 uses the
first (generous) reading. Under the second, with rests held, AN is
near-immovable — `Giant Hail` is 7' work inside 25' total, so +25% of work is
+1.75'. §3's *"rest may scale with the pieces it separates, same ratios
family"* hints at the first reading but does not settle it. One sentence.

### m8. §1/§8's "onboarding untouched" holds

Verified. `app/server/seed/library/onboarding.ts:17-43` defines the two rows
outside `LIBRARY_WORKOUTS`; `library/index.ts:11-16` keeps `LIBRARY_WORKOUTS`
at the 300 and `:30-37` concatenates onboarding only into
`GLOBAL_LIBRARY_SEED`; the quota gate and the balance script's faithfulness
check both run over `LIBRARY_WORKOUTS`. Their titles are the app's only handle
on them (`onboarding.ts:15-16`; `src/today/Today.tsx:814-817` looks them up by
`ONBOARDING_TITLES` and `isGlobal`), and no rebalance edit touches those
titles. §8's "still counts 302" is consistent with 1-for-1 replacement.

---

## Claim scorecard

Evidence categories per `.claude/agent-briefing.md`. **V** = verified against
the code/file this session and true. **R** = REFUTED — a falsifying line was
found and the claim is false. **U** = unevidenced in the spec but true on
reading (evidence-dodge, not a correctness defect). **?** = underspecified —
not decidable as written.

| # | §  | Claim (spec's words, abridged) | What the code/file says | Cat |
|---|---|---|---|---|
| 1 | 2 | "the OLD target's cell counts stand as the new targets" is the same intent, re-authored | generation-design:94 "Duration = total time including warm-up and rests"; `library-balance.ts:65-71` calls it the falsifying line | **R** |
| 2 | 2 | "the new `targets` block (replacing the warm-up-inclusive one)" | `patterns.json` top-level keys are exactly `_meta`, `cells`; no `targets`, ever | **R** |
| 3 | 2 | "today's duplicated TARGET constant dies" | one `TARGET` at `library-balance.ts:94`; `:88-93` says it is deliberately NOT `library.test.ts`'s `QUOTA` | **R** |
| 4 | 2 | "the file becomes fully warm-up-free" after deleting `warmupMinutes` | the 20 cell BANDS remain warm-up-inclusive band assignments — §6's own rule 1 | **R** |
| 5 | 2 | "±1 per cell (the BEFORE-era tolerance: the old check accepted the 2-row onboarding skew)" | `gridMismatches` is exact (`delta !== 0`); `:149-151` EXCLUDES the onboarding rows | **R** |
| 6 | 2 | the balance script currently holds targets in a constant, not the file | `library-balance.ts:94-99` — constant. Confirmed | **V** |
| 7 | 3 | retune ceiling +25% reaches the band for most crossers | 40 of 144 crossers cannot; Hall deficits O2 3 / AT 4 / TR 6 / AN 8 at exact match | **R** |
| 8 | 3 | "the MOVED table implies most of the deficit refills by retune" | MOVED is a net per-cell count; carries no per-workout growth information | **R** |
| 9 | 3 | "the +25% ceiling covers a dropped 5' warm-up on most 20-40' workouts" | arithmetically true as stated, but 209/300 warm-ups exceed 5' and 30 of the 40 failures are sub-20' | **V** (non-load-bearing) |
| 10 | 3 | "replacements should be the minority" | survives: ≥8–21 forced vs ≈144 retunes | **V** |
| 11 | 3 | "the plan re-picks as it already does for any missing workout" | `suggest.ts:213-215` / `:254-256` `sorted.find(...) ?? sorted[0]`; `suggest.test.ts:792` | **U** |
| 12 | 3 | "logged sessions keep their own title copies, so history is safe" | `schema.ts:98-101` — `onDelete: "set null"` + `workoutTitle`/`workoutType` columns | **U** |
| 13 | 3 | "plan references resolve by id" | plans store TYPE codes (`plans.ts:5-9`, `sessions: PlanCode[]`) — no id reference exists to resolve | **R** (harmlessly) |
| 14 | 3 | "no structure+parameter clone of any book entry (the :113 rule)" | generation-design:113 quoted verbatim; §3's paraphrase is exact | **V** |
| 15 | 4 | the review table follows "the generation spec's :149 idiom" | :149 is a 300-row table grouped by grid cell; §4's ≈165 rows is smaller | **V** |
| 16 | 5b | the six histogram categories are computable from the step grammar | yes (`rate-change` is detectable — `o2.ts` `Petrichor`), but **no classifier exists** in `domain/` | **V** / scope-miss |
| 17 | 5b | §6's `shapes` column is "the variety audit's vocabulary" | disjoint in 3 members each way; `rate-change` absent from `patterns.json` | **R** |
| 18 | 5b | thresholds "must pass on today's content outside the deficient bands" | >60% fails 2/20 cells; zero-pairs fails 10/20, incl. overfull `AN|<20`, `AT|20-30`, `O2|20-30`, `TR|<20` | **R** |
| 19 | 5b | "same offset band" is a computable key | `types.ts:9-13` — `EffortRef` has no `.off`; 36 of 60 AN workouts affected | **?** |
| 20 | 5b | "same piece count" is a computable key | undefined for a `{k:"reps"}` block (2 pieces or 8?) | **?** |
| 21 | 6 | the 20-row book table renders `patterns.json` faithfully | all 20 rows recomputed — n, shapes, W:R, offsets, spm, reps, effort all match | **V** |
| 22 | 6 | "their `warmupMinutes` stats ran 5-10'" | file shows `[5,10]`…`[10,20]`; three AN cells are `[10,20]` | **R** |
| 23 | 6 | dash fallback "tightened by the type header's calibration" | `o2.ts:7-12` yes (quoted example faithful); `an.ts:8-9` floor only; `at.ts`/`tr.ts` none | **R** (for 3 of 4 types) |
| 24 | 6 | "a retune or replacement stays inside its cell's ranges" | `library.test.ts:37-42` spm gate is narrower than every book spm range and is a hard failure | **R** |
| 25 | 6 | "unmapped shapes … generate only expressible archetypes" | matches generation-design:113-118's own error-handling row | **V** |
| 26 | 7 | "No domain, server, or client code changes expected" | `library.test.ts` QUOTA, `library-balance.test.ts`, `src/monitor/driver.test.ts` (Sea Fret ×16), `program.sweep.test.ts` (Beam Sea) all must change | **R** |
| 27 | 7 | disappeared-title behavior is unknown, "makes that path live for the first time" | `seed.ts:44-46` + `:80-87` — DELETE, documented and implemented; no orphan branch | **U** |
| 28 | 7 | "e2e untouched in intent" | `e2e/screenshots.spec.ts:455` pins "Sea Fret" as the leading library row | **R** (at risk) |
| 29 | 1/8 | "Onboarding's 2 workouts untouched throughout" | `onboarding.ts:17-43` + `index.ts:11-37` — separate export, outside every gate | **V** |
| 30 | 8 | "the library still counts 302" | consistent with 1-for-1 replacement through `seedGlobalLibrary` | **V** |

**Totals: 30 claims examined — V 11 · R 15 · U 4 · ? 2.**
Half the load-bearing claims are refuted by the files the spec names. Eleven
of the fifteen refutations were readable in the four artifacts the spec cites
in its own Authority block.

---

## What would make this sound

1. **§2:** quote generation-design:94, say explicitly that carrying the counts
   to a warm-up-free rod is a *new* decision that grows the library's
   prescribed work, and give James the re-band-the-edges alternative to rule
   on. Drop the `targets`-block and duplicate-constant sentences; name a real
   single-source home (a module both `library-balance.ts` and
   `library.test.ts` import). Keep `warmupMinutes`. Restore the exact-match
   gate or justify ±1 on its merits.
2. **§3:** publish the feasibility table (144 crossers, 40 unreachable, Hall
   deficits per type), settle the ceiling's denominator, and set the
   replacement budget from the arithmetic rather than from the MOVED table.
3. **§5b:** define the classifier and both near-duplicate key terms; reconcile
   the vocabulary with `patterns.json` or state plainly that they are two
   different vocabularies; and pre-declare what happens to the 12 cells
   today's library already fails — the calibration clause has already fired.
4. **§6:** correct "5-10'" to 5-20'; extend rule 2's "seed headers beat the
   book" to spm; supply calibration for AT/TR/AN or replace the fallback with
   something the deficient bands can actually use; define the translation rule
   for replacements and state band-edge inclusivity.
5. **§7:** replace the deferred reconcile question with the answer
   (`seed.ts:44-46` — DELETE), and extend scope to `library.test.ts`,
   `library-balance.test.ts` and the monitor test fixtures, with a
   do-not-retune list for fixture-pinned titles.
