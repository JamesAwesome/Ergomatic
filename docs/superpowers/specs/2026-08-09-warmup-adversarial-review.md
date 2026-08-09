# Adversarial review — the warmup-setting design spec

**Reviewing:** `docs/superpowers/specs/2026-08-09-warmup-setting-design.md`
(commit `ecd93bb`). **Date:** 2026-08-09. **Branch:** `warmup-setting`,
worktree `.claude/worktrees/warmup`, on `main@a5b3ad7`.

**Two mandates.** (1) Attack the spec against the code. (2) Score the spec
against `.claude/agent-briefing.md`'s "Specs and briefs are evidence-backed"
section — written 2026-08-09, one day before this spec, in response to 7C's
adversarial review (23 findings, 4 blocking, every blocker an unread-code
premise). Mandate 2's scorecard is at the end.

Every line number below was read this session. Nothing in this review is
recalled; where I could not verify a claim, I say the claim is unverifiable
rather than guessing at it.

**Headline:** the spec's central architectural claim — §1's "THE
ARCHITECTURAL KEY", operationalised in §4 — is mechanically impossible as
written, and three of its four downstream "all via existing behavior"
consequences are false. Separately, both of its hardware/doc citations point
at records that say something other than what the spec says they say. The
product ruling is sound and the change is still small; the seam is one layer
lower than the spec places it, and the consequences that follow from the
correct seam are not free.

---

## BLOCKING

### B1. §4's keystone is mechanically impossible: `buildDraft` produces no phases

> **The spec says** (§4): "`buildDraft` — the single seam both doors already
> share (Start and Connect both construct the draft/phases there) — prepends,
> when `warmup !== null`: 1. `EnginePhase{type: "warmup", seconds}` for time
> …"

> **The code says** (`app/src/session/draft.ts:46-64`):
>
> ```ts
> export function buildDraft(w: {
>   id: string;
>   title: string;
>   type: WorkoutType;
>   steps: Step[];
> }): SessionDraft {
>   return {
>     v: 1,
>     workoutId: w.id,
>     title: w.title,
>     type: w.type,
>     steps: structuredClone(w.steps),
>     nudges: {},
>     spmOverrides: {},
>     removed: [],
>     createdAt: new Date().toISOString(),
>     startedAt: null,
>   };
> }
> ```

`SessionDraft` (`draft.ts:30-41`) has **no `phases` field**. Its payload is
`steps: Step[]` — the authoring shape. `EnginePhase` is produced somewhere
else entirely: `buildRun` (`app/src/session/engine.ts:56-84`), via
`phases(rawSteps, baselines)`.

So §4's instruction cannot be carried out. You cannot prepend an
`EnginePhase` to a `SessionDraft` — there is nothing to prepend it to. And
you cannot prepend a `Step` instead, because §6 deletes `wu` from the `Step`
union. The spec's keystone names the wrong function.

**Half the claim is true and that is what hid it.** Both doors genuinely do
call `buildDraft`:

- Start: `app/src/session/useStartWorkout.ts:77` — `const draft = buildDraft(workout);`
- Connect: `app/src/workout/WorkoutDetail.tsx:115` — `let draft = buildDraft(workout);` (inside `buildNudgedDraft`)

The parenthetical is where it breaks: "Start and Connect both construct the
draft/**phases** there" is false. Phases are constructed at `buildRun`, which
is _also_ shared by both doors, but from different call sites and at
different times:

- Phone door: `app/src/session/Countdown.tsx:224` — `const run = buildRun(draft, baselines, now);`
- Connect door: `WorkoutDetail.tsx` (the connect handler) — `buildRun(...)`, then `compileProgram(run.phases)` and `buildLogSeed(run.phases, baselines)` at `:327`.

**Why the correction is not a rename.** `buildRun`'s signature is
`(draft: SessionDraft, baselines: Baselines | null, now: Date)`. It has no
access to preferences, and its own doc comment (`engine.ts:26-31`) makes
purity a contract:

> "Pure given `now`: two calls with identical arguments produce deep-equal
> records (byte-stable), since nothing here reads the clock or storage."

Injecting a preference read _inside_ `buildRun` violates that contract
outright. Threading it in as a fourth parameter is the honest option, and it
touches both production call sites plus roughly 20 test call sites that
construct runs through the real assembly. Either way this is a decision the
design owes the plan, not a detail the plan can pick.

**Also unaddressed:** the phone door persists the draft to `localStorage`
between Confirm and Countdown (`draft.ts:12` `DRAFT_KEY`, `saveDraft`). If
the warmup is resolved at `buildRun` time, a rower who changes the setting
between Confirm and the Timer gets the new warmup on a draft they already
confirmed. If it is resolved earlier, it has to live somewhere in
`SessionDraft`, which is a versioned persisted shape (`v: 1`) whose
`loadDraft` discards unrecognised versions. Neither branch is free; the spec
picks neither because it believes the seam is somewhere they do not arise.

---

### B2. §4/§5's ConfirmTargets claims are false — Confirm is STEP-based, not phase-based

> **The spec says** (§4): "ConfirmTargets lists the warmup row exactly as it
> lists one today (no target to nudge)".
>
> **The spec says** (§5): "ConfirmTargets' total line includes the prepended
> phases (it derives from the phase list; no new code expected — the plan
> verifies)."

> **The code says**, `app/src/session/ConfirmTargets.tsx:356`:
>
> ```tsx
> {draft.steps.map((step, i) => (
> ```
>
> and `:342`:
>
> ```tsx
> const minutes = draftMinutes(draft, baselines);
> ```

The row list is built from `draft.steps` — a `Step[]`. The row's kind label
is `kindLabel(step: Step)` (`ConfirmTargets.tsx:108`), whose warmup arm is
`case "wu": return "WARM-UP";` (`:110`) — the exact arm §6 deletes.

The total is `draftMinutes` (`draft.ts:175-185`), which calls
`estimateMinutes(draftSteps(d), baselines)`. `draftSteps` →
`effectiveSteps` → `d.steps`. It is **steps-in**; `phases()` is an internal
implementation detail of the estimate, not the input.

So a warmup prepended at the phase layer appears in **neither** — no row is
listed, and the total excludes it. "No new code expected" is precisely
backwards: both need new code. §5's line is the only one hedged ("the plan
verifies"), and it is the one where the hedge was doing the work of a read.

**Downstream:** §8's e2e walk ("start a library session, see the warmup phase
first in Confirm and the Timer") and §9's exit criterion cannot pass as
designed.

---

### B3. A distance warmup is unpriceable everywhere — the §4 hedge asks the wrong question

> **The spec says** (§2): `{ kind: "distance"; meters: number } // 100..10000`.
> **The spec says** (§1, non-goals): "no warmup pace target (a warmup phase
> has no `PaceRef`, exactly as today's `expand.ts:132` labels it 'Easy')".
> **The spec says** (§4): "the plan verifies `EnginePhase` already carries the
> distance arm the way work phases do".

> **The code says**, `app/domain/expand.ts:91-99`:
>
> ```ts
> export function phaseSeconds(
>   phase: Pick<Phase, "seconds" | "meters" | "targetSplit">,
> ): number | null {
>   if (phase.seconds !== undefined) return phase.seconds;
>   if (phase.meters !== undefined && phase.targetSplit !== undefined) {
>     return (phase.meters / 500) * phase.targetSplit;
>   }
>   return null;
> }
> ```

`Phase.meters` **does** exist (`expand.ts:14`), so the hedge's own question
answers YES and the distance arm looks safe. The blocker is the field the
hedge does not mention: pricing a distance phase needs `meters` **and**
`targetSplit`, and the spec's own non-goal guarantees a warmup has no
target. Every distance warmup therefore returns `null` from `phaseSeconds`.

Consequences, each read this session:

| Surface                 | Code                                                                                                                                  | Behaviour with a distance warmup                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TOTAL LEFT              | `engine.ts` `totalRemainingSeconds` — `const full = phaseSeconds(phase); if (full === null) continue;`                                | Warmup contributes **0**; the timer claims the session is shorter than it is                                                                                                                                                                                                                      |
| Phase progress bar      | `Timer.tsx` `phaseProgressPct` / `hasRemainingEstimate` (gate at `Timer.tsx:639`)                                                     | Renders **frozen at 0%** for the whole warmup whenever a later phase is priceable — the exact failure `hasRemainingEstimate` exists to prevent, defeated because its scan runs forward from the current index                                                                                     |
| Auto-advance            | `engine.ts:141-143` — `while (index < run.phases.length) { const phase = run.phases[index]!; if (phase.seconds === undefined) break;` | The catch-up walk **halts**. Per `engine.ts:126-128`, "those can't auto-advance, the rower presses NEXT"                                                                                                                                                                                          |
| Suspect-actual guard    | `Timer.tsx:263-272` — `const estimate = phaseSeconds(phase); if (estimate === null) return false;`                                    | Permanently disabled for the phase                                                                                                                                                                                                                                                                |
| Run record              | `engine.ts:256-272` — `const splitSeconds = (elapsed / meters) * 500;` keyed on `meters`, never on `phase.type`                       | Tapping NEXT writes a meaningless "split" actual against the **warmup**. `logDraft.ts:307-308` (`if (phase.type !== "work") return;`) discards it at log time, so it is dead state rather than a data bug — but `run.actuals` now carries entries for non-work phases, which nothing else expects |
| Every duration estimate | `estimateMinutes` (`expand.ts:250-257`)                                                                                               | Contributes 0 to library rows, detail, Today, Confirm                                                                                                                                                                                                                                             |

§4's "the Timer runs it" is true for the time arm and false for the distance
arm: the rower must manually end their own warmup, on a count-up stopwatch,
with a frozen empty progress bar and a total that pretends the warmup is
free. That is a product decision the spec has not made.

This is the single clearest case of the hedge failing as a mechanism: it
deferred to the plan, it named a real field, and it asked a question whose
correct answer is "yes, it's fine."

---

### B4. The custom-workout strip's ordering is load-bearing and unspecified — the client bricks before it runs

> **The spec says** (§6): "`validateSteps` rejects it" and, four bullets
> later, "Custom workouts: a one-time server-side strip of `wu` steps at
> migration time … the plan picks the mechanism the codebase already trusts
> and pins it."

The spec states no ordering constraint between the two. The code says the
order is the whole problem, because **nothing revalidates on read**:

- `app/server/routes/data.ts:372-383` (`GET /api/workouts`) and `:398-409`
  (`GET /api/workouts/:id`) return rows raw — `res.json(row)`.
- `validateWorkoutInput` is called at `data.ts:386`, `:425`, `:474` only —
  all **write** paths. `validateSteps` is never called directly server-side.
- Client `app/src/api/useWorkouts.ts:32` is a bare
  `(await res.json()) as LibraryWorkout[]` cast.

So a stored `{k:"wu", minutes:10}` reaches every render surface untouched.
With §6's deletions applied and the strip not yet run:

| Surface                                                                         | Failure                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library list                                                                    | **Safe, silently wrong.** `Library.tsx:339-343` and `filters.ts:96` go through `estimateMinutes`; `phases()`'s switch (`expand.ts:127-200`) has **no `default:`**, so an unknown kind vanishes. The row's duration silently shrinks and the duration filter re-buckets the workout |
| `/library/:id` (WorkoutDetail)                                                  | **Render TypeError, white screen.** `WorkoutDetail.tsx:450-464` maps every non-`reps` step into `StepRow`. With `src/workout/StepRow.tsx:35-49`'s `wu` arm deleted, the step falls through to `step.duration.kind` (`:78`) on an `undefined` — no error boundary in the path       |
| `/library/:id/edit`, no `reps` marker                                           | **Render TypeError, white screen.** `builderState.ts` `fromWorkout` → `stepToRow` (`:557`) → `formatDurationValue` (`:548`) on `undefined`                                                                                                                                         |
| `/library/:id/edit`, with a `reps` marker (the shape every seeded workout uses) | **Soft-brick.** Emptying `BOOKEND_ROW_KINDS` (`builderState.ts:58`) makes `hasMidSpanReps` (`:644-660`) return true → "This workout can't be edited yet. Its repeat structure can't be represented here." Permanent and misleading                                                 |
| `/session/confirm`                                                              | Degraded only: `kindLabel` (`ConfirmTargets.tsx:108`) is an exhaustive switch with no default → renders `ROW 1 · `                                                                                                                                                                 |
| Server                                                                          | Nothing. There is no read-path validation to add a guard to, and no boot-time integrity check                                                                                                                                                                                      |

**And the usual escape hatch is type-locked shut.** `UNREPRESENTABLE_STEP_KINDS`
(`builderState.ts:601`) is `new Set<Step["k"]>(["test"])`. Once `wu` leaves
the `Step` union you **cannot** add `"wu"` to it — the one existing "refuse
to open the editor gracefully" mechanism cannot be pointed at this case.

The spec's deferral of the strip _mechanism_ is legitimate. Its silence on
the _ordering_, on the read paths, and on the type-locked escape hatch is
not — those are design facts, and the briefing's own realistic-fixtures rule
exists because "fixtures emptier than production have hidden … one bricking
bug."

---

### B5. `PUT /api/prefs` does not 400 on unknown fields — the stated validation contract is the code's opposite

> **The spec says** (§2): "Server validation on PUT /api/prefs: the shape
> above, bounds inclusive, anything else 400s."

> **The code says**, `app/server/routes/data.ts:673-675`, then a per-field
> whitelist with no `Object.keys(body)` sweep anywhere in `673-794`, ending at
> `:783-790`:
>
> ```ts
> // An empty patch (body `{}`, or all-unknown keys) must be a no-op read,
> // not a write: …
> if (Object.keys(patch).length === 0) {
>   res.json(await stores.preferences.get(req.user!.id));
>   return;
> }
> ```

Unknown keys are silently dropped. This is pinned as _intended_ behaviour by
`app/server/routes/data.test.ts:1472-1481`:

```ts
it("PUT with only unknown keys is also a no-op read", async () => {
  …send({ notARealField: 123 });
  expect(res.status).toBe(200);
  expect(res.body).toStrictEqual(PREFERENCES_DEFAULTS);
  expect(stores.preferences.put).not.toHaveBeenCalled();
```

So today `PUT {"warmup": {...}}` returns **200 with unchanged prefs**.
Combined with `usePreferences.ts:62`'s fire-and-forget `.catch(() => {})`, a
client-before-server ship makes the setting silently never persist, with no
error visible anywhere. The "anything else 400s" clause is the mitigation
that does not exist.

**Second, unaddressed:** `warmup` is the preferences table's first
**nullable** column (every existing column is `.notNull()` with a default —
`schema.ts:148-159`). The route's `if (body.X !== undefined)` idiom cannot
express "set this to null" unless the warmup arm explicitly admits `null` as
a value distinct from key-absent, because `save({warmup: undefined})`
serialises to `{}` and hits the `:787` no-op guard. §3's `Remove warm-up`
control depends on a wire distinction the current idiom does not make.

---

## MAJOR

### M1. The §18 walk-1 hardware citation does not exist in the record

> **The spec says** (Authority line): "walk 1's §18 record (a warmup interval
> programmed to a real PM5 and rendered as `1 OF 2 · WARM-UP`)".

`docs/monitor/pm5-interface-notes.md` §18's walk 1 is at `:2102-2130`. It
records: the interstitial was clean, item 20 answered (interval clock runs
while a stopped rower sits still), the pace-validation refusal and its
`representableCentiseconds` fix, READY auto-advancing without a tap, and
RATE reading 57-68. It says "the 0x81 accept, the prepare's leading
terminate, and the two-interval arm all behaved." It **never mentions a
warmup.**

The whole notes file contains the substring "warm" exactly twice — `:730`
(inside §15 #3, describing `targetSplit` being null for warmup intervals)
and `:1424` (the §17 runsheet, describing `seaFretProgram()`'s harness
warmup interval). Neither is in §18, and neither is a hardware observation
of a product-app warmup.

The string `1 OF 2 · WARM-UP` appears **nowhere in the repository**. The only
`1 OF 2` hits are e2e assertions of the form `STEP 1 OF 2 · WORK · 500M`
(`e2e/design.spec.ts:2355`, `:3181`, and six regex siblings).

This is verbatim the failure the briefing names: "A brief once cited wire hex
'in §18' that existed only in the chat — the implementer rightly refused to
fake the decode. If the evidence lives in the conversation, COMMIT IT to the
record first, then cite it."

The claim may well be true — walk 1 programmed a library workout, and every
library workout opens with a `wu` step, so a warmup interval almost certainly
was on the wire. That is an inference, not a record. Commit the walk-1
screen recording's relevant frame or the wire log to §18 and cite it, or
downgrade §1's "PROVENLY" and §9's "hardware-proven".

### M2. §15 #3 is an OPEN ambiguity, not a "convention", and was not hardware-exercised

> **The spec says** (§4): "`compileProgram` emits it as interval 0 with no
> pace target (the §15 #3 pace-time-zero convention, hardware-exercised in
> walk 1)".

> **The doc says**, `pm5-interface-notes.md:648` — the section heading
> itself: "## 15. Genuine ambiguities flagged for the laptop session
> (**unresolved by document text alone**)".

And item 3 (`:727-749`), in its own words:

> "**`SET_TARGETPACETIME` for a no-target interval — record BOTH candidate
> behaviors, laptop decides.** … five of the document's OWN worked examples
> OMIT `SET_TARGETPACETIME` (opcode `0x06`) ENTIRELY … This makes OMISSION at
> least as documented as sending zero — arguably more so, since it is
> directly observed in five real examples, while '**zero means no target' is
> this module's own inference, observed in none.** The current implementation
> (zero) is UNCHANGED by this finding — both are plausible, and choosing
> between them needs the laptop session, not another guess from the documents
> alone."

It is absent from the "Answered by laptop session 1 (2026-08-05) — no further
hardware needed" list (`:1056-1085`, seven items, none of them this), and is
still carried as open at `:1196`. Calling it a "convention" that was
"hardware-exercised" inverts both halves of what the record says. Note also
the briefing's rule: "An unobserved wire premise never ships as a hard gate."

**In the spec's favour, the code claim underneath is correct.**
`compileProgram` genuinely does treat a warmup as a programmable interval
with a null target: `program.ts:34` (`type: "warmup" | "work" | "rest" | "test"`),
`:84` ("this is null for BOTH 'no ref at all' (warmup)"), and `:466`
(`if (phase.targetKind === "effort" || phase.targetSplit === undefined) targetSplit = null;`).
A distance warmup also clears the gates: `MIN_DISTANCE_METERS = 100`
(`program.ts:168`) exactly matches the spec's 100 m floor. It is the evidence
claim, not the compiler claim, that is wrong.

### M3. §2's bound-reuse claim does not survive contact with `validate.ts`

> **The spec says** (§2): "Bounds echo the builder's own step bounds where
> they exist (`domain/validate.ts` is the authority; the warmup's time bound
> reuses the work-step minutes bound, distance reuses the meters bound — the
> plan pins exact constants from `validate.ts`, not from this prose)."

> **The code says**: the `wu`/`r` minutes bound is
> `wholeSecond(s.minutes, SECOND, 180)` (`validate.ts:82`, with
> `const SECOND = 1 / 60` at `:30`) — 1 second to 180 minutes. The work-step
> time bound is the same `SECOND..180` (`checkDuration`, `:57`). The meters
> bound is `int(v.meters, 100, 42195)` (`:59`).

The spec proposes **1..30 whole minutes** and **100..10000 meters**. Neither
echoes anything: both are new, both are tighter, and the time bound changes
the _unit granularity_ — the repo's rule is whole **seconds** expressed in
minutes, with a documented floating-point rationale (`validate.ts:15-23`:
"407 of the 10,800 in range do not [survive the round trip] — 31 … 62, 123,
124, 125, 245…"). "Whole minutes" is a new, stricter contract.

The deferral therefore cannot be executed as written: "the plan pins exact
constants from `validate.ts`" points at constants that are not the spec's
numbers. This is a deferral hiding a decision rather than a lookup.

The 100 m floor does match `MIN_DISTANCE_METERS` (`program.ts:168`), and 595
is exactly right (`MAX_REST_SECONDS = 9 * 60 + 55`, `program.ts:172`;
interface-notes `:386` "**9:55** (595 s)"). The rest **floor** of 5 seconds
is unsourced — there is no PM5 minimum rest anywhere in Table 19, and
`MIN_TIME_SECONDS = 20` applies to work/warmup/test intervals, not rests.

### M4. There is no library "version marker" to bump — and the reconcile already does the job

> **The spec says** (§6): "The library version marker (whatever
> `seedGlobalLibrary`'s reconcile keys on — the plan pins it) bumps so the
> reconcile updates existing databases."

> **The code says**, `app/server/seed/seed.ts:64-98`: `seedGlobalLibrary`
> keys **identity** on `title` (`:73`, `:80-85`) and **change** on
> `contentEqual` (`:19-33`), whose last term is
> `isDeepStrictEqual(row.steps, w.steps)` (`:33`). Changed content →
> `updateGlobal` (`:86`) → `app/server/stores/workouts.ts:187-194`, which
> `.set({ …, steps: input.steps, … })` in place.

There is no version column, constant, or marker of any kind. The only
constant is `SEED_LOCK_KEY` (`seed.ts:12`), whose own comment says
"Arbitrary but fixed application-wide key for the seed advisory lock. Any
constant works" — bumping it would only break mutual exclusion between
booting replicas.

The **outcome** the spec wants happens automatically: strip `wu` from a seed
file and the next boot's content comparison fails, `updateGlobal` fires, and
`steps` is rewritten in place with row ids (and therefore
`session_logs.workout_id` FKs) preserved. `seed.ts:39-44` documents exactly
this and names the gap it closed.

So: harmless outcome, false premise, and a plan author following the sentence
literally will spend a round hunting a marker that does not exist. The
deferral is what let the false premise through — the sentence's parenthetical
is doing the work of a read of a 34-line function.

### M5. It is 302 wu steps across 302 workouts, not "the 300 seeds"

> **The spec says** (§6): "The 300 seeds: every `{ k: "wu", ... }` line
> deleted across the five library files".

The literal shape is correct — `{ k: "wu", minutes: 5 }` is the idiom
(verified across all five files) — and naming five files is correct. The
count is not:

- `LIBRARY_WORKOUTS` is exactly **300** (`server/seed/library/index.ts:11-16`,
  pinned at `library.test.ts:56`), from o2 90 / at 75 / tr 75 / an 60.
- `onboarding.ts` is a **deliberately separate** export of 2.
  `index.ts:21-29` explains why it is never concatenated: `library.test.ts`
  hard-pins 300 with a per-type quota grid a single-step onboarding workout
  would violate.
- `GLOBAL_LIBRARY_SEED` (`index.ts:30-37`) seeds **302** rows.
- `k: "wu"` counts: 90 + 75 + 75 + 60 + 2 = **302** — exactly one per workout,
  all 302 of them.

The 2 undercounted rows are the ones that fail loudest:
`onboarding.test.ts:23-25` runs every onboarding row through
`validateWorkoutInput`, so leaving them behind is an immediate red unit test,
not a silent gap. Minor in consequence, but §6 is the demolition checklist —
an implementer working from it will strip four files.

### M6. §6's bulk-import "existing notice idiom" does not exist

> **The spec says** (§6): "a `wu` line is STRIPPED, not fatal; the import
> result carries a notice line … in the screen's existing notice idiom."

> **The code says**, `app/domain/bulk.ts:5-14`:
>
> ```ts
> export interface BulkError {
>   block: number;
>   line: number;
>   message: string;
> }
> export interface BulkResult {
>   workouts: WorkoutInput[];
>   errors: BulkError[];
> }
> ```

No `notices`, no `warnings`, no severity discriminant. The server response
mirrors it exactly (`data.ts:458-486` → `res.json({ created, errors })`).
`BulkImport.tsx:100-113` renders two slots: a `mono-status` count line and a
`field-error` list. Grepping notice/warning/warn across `BulkImport.tsx`,
`Builder.tsx`, `Library.tsx`, `bulk.ts` and `data.ts` returns nothing.

Building the notice requires a new `BulkResult` field, a new response field,
and a new render slot — three layers the spec bills as free.

**Two traps the spec would walk into.** First, `BulkImport.tsx:62-66`:

```tsx
// Only a clean sweep navigates away. A partial result … must keep the
// rower on this panel …
if (body.errors.length === 0) onImported();
```

Smuggling the notice through `errors` suppresses the success navigation on
every otherwise-clean import. Second, `bulk.ts:218-224` already has a
`default:` arm emitting `` `unknown step word: ${word}` ``, and `parseBulk`
at `:260` does `if (sawError) return;` — so merely _deleting_ the `wu` case
(`bulk.ts:190-203`, where `wu` and `r` share one arm) makes a `wu` line a
hard error that drops **the entire workout block**, the exact opposite of
"STRIPPED, not fatal". The strip must be an explicit new arm.

Also: `BulkImport.tsx`'s `GRAMMAR_EXAMPLE` (`:23-27`) literally contains
`wu 10`, and the component's own doc comment (`:37-39`) says "the server owns
all parsing … this component never parses, pre-validates, or lints the pasted
text itself" — so the notice must come over the wire.

### M7. §6's builder footprint is wrong in three ways, one of them a category error

> **The spec says** (§6): "Builder: the `wu` row type and its chip disappear;
> `builderState.ts`/`StepRow.tsx`/`IntervalSegments.tsx` lose their wu arms."

**(a) The path does not exist.** There is no `src/builder/StepRow.tsx`. The
file is `app/src/workout/StepRow.tsx` — a workout-**detail** renderer (it
imports `Link` from react-router-dom and renders the detail preview stack),
not a builder component.

**(b) There is no wu chip.** `+ WARM-UP` was removed in Phase 5D.
`builderState.ts`'s `addRow` (`:113`) has no callers outside the module and
its own tests; the only way a `wu` row enters the builder is `fromWorkout` →
`stepToRow` on a stored workout. `docs/design/DEVIATIONS.md:17` documents
this deliberately, and states the invariant this spec breaks:

> "`addBlankStep`'s '+ ADD STEP' (`builderState.ts`) and `StepEditor.tsx`'s
> `wu`/`r` minutes-only branch stay in the code — bulk import and edit-mode
> `fromWorkout` can still produce/keep a stored `wu`/`r` step, and a pasted or
> previously-saved workout that already has one **must stay editable**"

Per the briefing's own comment-sweep rule ("`docs/design/DEVIATIONS.md`
documents current state, not history"), that row needs rewriting as part of
this change. The spec does not mention it.

**(c) The category error.** `IntervalSegments.tsx:23` and
`surfaceModel.ts:246` are both `kinds: ("work" | "rest" | "wu")[]` — a
**phase**-kind vocabulary, produced by `Timer.tsx:43-46`:

```ts
export function segmentKind(type: EnginePhase["type"]): "work" | "rest" | "wu" {
  switch (type) {
    case "warmup":
      return "wu";
```

These describe `Phase.type === "warmup"`, which **survives this change
intact** — indeed §1 depends on it surviving. They must NOT lose their "wu
arm". `IntervalSegments.tsx` does not even branch on the prop (`kinds` is
declared but never destructured, `:26-29`, deliberately per its `:12-19`
comment). Listing them in the same bullet as `Step["k"] === "wu"` deletions
will send a grep-driven implementer to delete the thing the design is built
on. The same conflation covers Timer.tsx's three `wu` hits, which §6 does not
list but a grep will surface.

### M8. `warmupOverride` "never consumed" is overstated, and the `usePreferences` change is not "additive"

> **The spec says** (§2): "the override was never consumed anywhere"; and
> "`usePreferences` gains the field (additive, the file's own pattern)".

`warmupOverride` has no **behavioural** consumer — nothing reads it to make a
decision, and it is absent from the client type. But it is not untouched:
declared at `preferences.ts:10`, defaulted at `:22`, echoed into every
`GET /api/prefs` response at `:44`, validated on PUT at `data.ts:719-724`,
and covered by dedicated tests at `data.test.ts:1507-1574` — including a
`toStrictEqual` on the response body that will fail the moment the field
leaves. Say "no behavioural consumer".

The `warmupMinutes` single-consumer claim is right for production render
code (`Builder.tsx:415`, exactly as cited). Also referencing it: seven test
fixture files, one e2e assertion (`e2e/design.spec.ts:1645-1651`, on
`.builder-warmup-line`), and CSS at `src/index.css:2173`.

And `usePreferences.ts:5-10` documents three prior widenings, each explicitly
"Purely additive each time — no response shape changed, just what the client
bothers to type." This change also **removes** `warmupMinutes` from
`PreferencesData` (`:14`) — the file's first subtractive change. "Additive,
the file's own pattern" understates the blast radius by every fixture above.

---

## MINOR

- **m1.** `app/domain/generation/patterns.json` carries **20** `warmupMinutes`
  statistics (lines 24, 42, 60, 76, 95, 111, 131, 148, 166, 186, 203, 222,
  239, 255, 273, 292, 311, 329, 349, 368) — per-cell `[min, max]` aggregates
  of the library's own wu steps, allow-listed (permitted, not required) at
  `patterns.test.ts:15`. Dropping `wu` invalidates all 20 and **nothing
  fails**. §7's rebalance report reads this same file. Unmentioned.
- **m2.** `expand.ts:128-134` is cited for `case "wu"`; the block actually
  spans `:128-136` (`break` at `:136`). `expand.ts:132` for the `"Easy"`
  label is exactly right.
- **m3.** `schema.ts:144` is exactly right (the `pgTable("preferences"`
  opener). Two details for the migration: `warmupMinutes` is `real`, not
  integer; and `preferences` has no third `pgTable` argument, so there are no
  check constraints to clean up on the drop.
- **m4.** Next free migration index is **0007** (`app/drizzle/` holds
  `0000`–`0006`, journal idx 0..6). A sibling worktree
  (`ui-notes-post-v060`) is live off the same `main` with no migration yet —
  per the briefing's Drizzle rule, check open PRs before generating.
- **m5.** `app/server/stores/contracts/storeContracts.ts:60` uses
  `steps: [{ k: "wu", minutes: 10 }]` as the canonical store-contract
  fixture, feeding both the fake and the real integration contract tests.
  Covered in spirit by §6's "every test fixture carrying `wu` follows"; worth
  naming because it is a contract fixture, not an ordinary one.
- **m6.** §8's property "no `Step[]` input can produce a warmup phase" is
  trivially true once the case is deleted and guards nothing that a type
  error would not. Cheap, so keep it, but it is not the test that matters —
  the one that matters is that the _prepend_ seam fires exactly once per
  session.
- **m7.** §3 says the You editor's value field "keeps `font-size: 16px`",
  matching the briefing's iOS-Safari rule — correct and worth keeping. §3's
  "Copy carries no em-dash" likewise matches house style.

---

## Mandate 2 — scorecard against "Specs and briefs are evidence-backed"

The rule under judgment: _"Every load-bearing claim in a spec, plan, or brief
carries its evidence: a `file:line` read THIS session, a committed capture, or
a doc §-number. 'The code does X' without a citation is a guess wearing a
suit."_

**Grades.** CITED-AND-TRUE = evidence given, and I verified it. CITED-BUT-WRONG
= evidence given, but the cited artifact says something else. HEDGED-TO-THE-PLAN
= a "the plan pins/verifies" deferral. NAKED = a load-bearing claim about code
with no evidence at all.

| #   | Load-bearing claim                                                                    | §      | Grade                                                                    | Verified against                                                                   |
| --- | ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | `Step` and `EnginePhase` are already separate types                                   | 1      | CITED-AND-TRUE                                                           | types.ts:19-30; expand.ts:11-55; engine.ts:18-20                                   |
| 2   | `case "wu"` → `EnginePhase{type:"warmup"}` at expand.ts:128-134                       | Auth   | CITED-AND-TRUE                                                           | expand.ts:128-136 (block ends :136)                                                |
| 3   | expand.ts:132 labels a warmup "Easy"                                                  | 1      | CITED-AND-TRUE                                                           | expand.ts:132 exactly                                                              |
| 4   | preferences table at schema.ts:144 carries warmupMinutes/warmupOverride               | Auth/2 | CITED-AND-TRUE                                                           | schema.ts:144, :152, :153                                                          |
| 5   | `warmupOverride` "was never consumed anywhere"                                        | 2      | CITED-BUT-WRONG                                                          | preferences.ts:10,22,44; data.ts:719-724; data.test.ts:1507-1574                   |
| 6   | `warmupMinutes`'s one consumer is the Builder hint                                    | 2      | CITED-AND-TRUE                                                           | Builder.tsx:415 (render code); +7 fixtures, 1 e2e, 1 CSS rule                      |
| 7   | The Builder hint is at `Builder.tsx:415`                                              | 5      | CITED-AND-TRUE                                                           | Builder.tsx:404-416, already conditional on `state === "ready"`                    |
| 8   | The seed idiom is `{ k: "wu", … }` across five library files                          | 6      | CITED-AND-TRUE                                                           | `{ k: "wu", minutes: 5 }`, all five files                                          |
| 9   | "The 300 seeds" carry the wu lines                                                    | 6      | CITED-BUT-WRONG                                                          | 302 workouts / 302 wu steps; index.ts:11-16, :21-37                                |
| 10  | 595 s is the PM5 rest ceiling (interface-notes §8)                                    | 2      | CITED-AND-TRUE                                                           | notes:386; program.ts:172                                                          |
| 11  | Walk 1's §18 record shows a warmup programmed and rendered `1 OF 2 · WARM-UP`         | Auth   | CITED-BUT-WRONG (fabricated citation)                                    | §18 walk 1 = notes:2102-2130, no warmup; string absent repo-wide                   |
| 12  | §15 #3 is a "pace-time-zero convention, hardware-exercised in walk 1"                 | 4      | CITED-BUT-WRONG                                                          | notes:648 heading ("unresolved"); :727-749; absent from :1056-1085                 |
| 13  | `compileProgram` emits a warmup as an interval with no pace target                    | 1/4    | CITED-AND-TRUE                                                           | program.ts:34, :84, :466                                                           |
| 14  | 7C's `buildLogSeed` marks the phase `kind: "warmup"`                                  | 1/4    | CITED-AND-TRUE                                                           | logDraft.ts:582-585                                                                |
| 15  | Both log builders skip the warmup                                                     | 1/4    | CITED-AND-TRUE                                                           | logDraft.ts:582-585, :307-308                                                      |
| 16  | `buildDraft` is the single seam **both doors already share**                          | 4      | CITED-AND-TRUE                                                           | useStartWorkout.ts:77; WorkoutDetail.tsx:115                                       |
| 17  | …and both "construct the draft/**phases** there"                                      | 4      | CITED-BUT-WRONG                                                          | draft.ts:30-64 has no phases; buildRun does (engine.ts:56-84)                      |
| 18  | `buildDraft` can prepend an `EnginePhase`                                             | 4      | NAKED                                                                    | Impossible: SessionDraft holds `Step[]` (draft.ts:35)                              |
| 19  | `EnginePhase` already carries the distance arm "the way work phases do"               | 4      | HEDGED-TO-THE-PLAN — **evidence-dodging**                                | `meters` exists (expand.ts:14) but `phaseSeconds` needs `targetSplit` too (:91-99) |
| 20  | ConfirmTargets lists the warmup row exactly as today                                  | 4      | NAKED                                                                    | ConfirmTargets.tsx:356 maps `draft.steps`; :110 is the deleted arm                 |
| 21  | ConfirmTargets' total derives from the phase list; no new code expected               | 5      | HEDGED-TO-THE-PLAN — **evidence-dodging**                                | ConfirmTargets.tsx:342 → draftMinutes → draft.ts:175-185, steps-in                 |
| 22  | "the Timer runs it"                                                                   | 4      | CITED-BUT-WRONG (partial)                                                | True for time; engine.ts:141-143 halts on a distance phase                         |
| 23  | The workout's own displayed duration is WORK ONLY, unchanged code                     | 5      | CITED-AND-TRUE                                                           | Library.tsx:339-343; filters.ts:96 — step-based, so wu-free is enough              |
| 24  | Bounds "echo the builder's own step bounds"; plan pins constants from validate.ts     | 2      | CITED-BUT-WRONG + HEDGED                                                 | validate.ts:30, :57, :59, :82 — the constants are not the spec's numbers           |
| 25  | PUT /api/prefs 400s on anything outside the shape                                     | 2      | CITED-BUT-WRONG                                                          | data.ts:783-790; data.test.ts:1472-1481 pins the opposite                          |
| 26  | `usePreferences` gain is "additive, the file's own pattern"                           | 2      | CITED-BUT-WRONG                                                          | usePreferences.ts:5-10, :14 — also subtractive, a first                            |
| 27  | The import notice lands "in the screen's existing notice idiom"                       | 6      | NAKED                                                                    | bulk.ts:5-14; data.ts:458-486; BulkImport.tsx:100-113 — no such idiom              |
| 28  | The `wu` row type "and its chip" disappear from builderState/StepRow/IntervalSegments | 6      | CITED-BUT-WRONG                                                          | `src/builder/StepRow.tsx` absent; no chip; two of three are phase-kind unions      |
| 29  | A library version marker exists for the reconcile to key on                           | 6      | HEDGED-TO-THE-PLAN — **evidence-dodging**                                | seed.ts:19-33, :64-98 — no marker; content-addressed                               |
| 30  | The custom-workout strip mechanism                                                    | 6      | HEDGED-TO-THE-PLAN — **legitimate**, but omits the ordering premise (B4) | data.ts:372-409 (no read validation)                                               |
| 31  | §7's bucket edges and target percentages                                              | 7      | HEDGED-TO-THE-PLAN — **legitimate**                                      | Genuine constants in patterns.json / generation spec                               |
| 32  | The You editor reuses the builder's `WorkDuration` input idiom, 16px                  | 3      | CITED-AND-TRUE                                                           | Matches the briefing's iOS-Safari rule                                             |
| 33  | The `restSeconds` floor of 5 s                                                        | 2      | NAKED                                                                    | No PM5 minimum rest in Table 19; MIN_TIME_SECONDS=20 is unrelated                  |

### Totals

| Grade                         | Count                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| CITED-AND-TRUE                | **14**                                                              |
| CITED-BUT-WRONG               | **10** (one of them a fabricated citation, #11)                     |
| HEDGED-TO-THE-PLAN            | **5** — 3 evidence-dodging (#19, #21, #29), 2 legitimate (#30, #31) |
| NAKED                         | **4**                                                               |
| **Total load-bearing claims** | **33**                                                              |

Findings: **5 BLOCKING, 8 MAJOR, 7 MINOR** (20 total).

### Comparison with 7C

|                        | 7C spec                                                | This spec                                                                                                    |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Findings               | 23                                                     | 20                                                                                                           |
| Blocking               | 4                                                      | 5                                                                                                            |
| Nature of the blockers | **All four naked premises** — code the spec never read | **One of five naked** (B1's mechanism, B2's row claim). The other four are cited-but-wrong or hedged         |
| Citation density       | Effectively none on the blocking claims                | 24 of 33 load-bearing claims carry evidence; 14 of those verify clean                                        |
| Line-number accuracy   | n/a                                                    | Near-perfect where given: `schema.ts:144`, `Builder.tsx:415`, `expand.ts:132`, `program.ts` bounds all exact |

The failure **rate** barely moved. The failure **mode** moved a long way.

### Verdict: did the instruction change author behavior?

**Yes, measurably — and it relocated the defect rather than removing it.** The
author demonstrably opened files this time: fourteen claims verify clean, and
the line numbers that are given are exact to the line (`schema.ts:144` is the
`pgTable` opener; `Builder.tsx:415` is the hint's template literal;
`expand.ts:132` is the `"Easy"` label), which is not something you get from
memory. 7C's blockers were four holes where evidence should have been; this
spec's blockers are four places where the evidence was fetched and then
over-read by exactly one hop. **The leak has a consistent shape: the spec
cites the line that _names_ its subject and never the line that would
_falsify_ it** — it cites `buildDraft`'s existence and both its call sites,
but not its return statement, which is the one place that says
`SessionDraft` has no phases; it cites `Phase.meters` but not `phaseSeconds`,
which is the one place that says `meters` alone is unpriceable; it cites
`ConfirmTargets` but not its `.map`. Two secondary leaks compound it: the
"the plan pins/verifies" hedge was used five times and landed on the wrong
side of the line in three, functioning as a citation-exemption sticker
applied to precisely the premises the design rests on (never once to a mere
constant that was actually in doubt); and the two doc/hardware `§`-citations
are the weakest evidence in the document — both point at sections whose text
contradicts the claim, and one section's own **heading** ("Genuine ambiguities
… unresolved by document text alone") is the refutation, which means the §
number was carried across from conversation and the section was never opened.

### Recommended amendments to `.claude/agent-briefing.md`

All four target the observed shape, not the general principle.

**A. Cite the line that would falsify you.**

> A citation names the line that would prove you WRONG, not the line that
> names your subject. A claim about what a function returns cites its return
> statement; a claim about what a screen renders cites its `.map`; a claim
> about what a field means cites the code that reads it. Phase 9's warmup
> spec cited `buildDraft`'s definition and both call sites correctly and
> still asserted it produced something its return statement does not contain.

**B. A "the plan pins it" deferral may only defer a scalar.**

> Deferring a NUMBER to the plan (a bound, a bucket edge, a timeout) is
> legitimate. Deferring a SHAPE, a SEAM, or a DATA FLOW is not — those are
> the design, and the plan has no authority to invent them. Three of the
> warmup spec's five blocking findings sat behind exactly this hedge, and the
> hedge was never once spent on an actual constant in doubt. If you catch
> yourself writing "the plan verifies that X already works this way", X is a
> premise: go read it now.

**C. A doc `§`-citation carries its quoted sentence.**

> Same standard as a hardware capture. Paste the sentence into the spec,
> inline. A `§` number is a pointer, not evidence, and a pointer survives
> being carried across from a conversation while its target says the
> opposite. Two of the warmup spec's `§`-citations did exactly that — one
> pointed into a section whose own heading reads "Genuine ambiguities …
> unresolved". If the quote refutes you, you learn it while writing rather
> than at review.

**D. Deleting a union member: enumerate every union that shares the name.**

> `Step["k"] === "wu"` and `Phase.type === "warmup"` (rendered as `"wu"` by
> `segmentKind`) are different vocabularies that grep identically. A spec that
> removes one must list, by file:line, every occurrence of the OTHER that
> must survive — otherwise a grep-driven implementer deletes the thing the
> design depends on.

**E. A spec that invalidates stored data states its ordering.** (Suggested
placement: beside the realistic-fixtures rule, which exists for the same
reason.)

> When a validator change makes previously-stored rows invalid, the spec —
> not the plan — states (1) whether the data migration runs before or after
> the validator ships, and (2) every READ path that touches the old shape,
> with the failure mode of each. Read paths in this repo do not revalidate
> (`server/routes/data.ts:372-409` returns rows raw; `useWorkouts.ts:32` is a
> bare cast), so a stored-but-invalid row reaches the renderer untouched and
> white-screens it.
