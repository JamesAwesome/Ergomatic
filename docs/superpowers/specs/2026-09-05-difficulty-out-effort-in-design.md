# Phase DE — Difficulty out, effort in

**What and why.** Every workout carries two figures that say how hard it is:
a three-word `difficulty` (easy / medium / hard) and a 1-to-5 `pain` number.
James's request (2026-09-05): _"I want to remove easy/medium/hard"_ and
_"I want to rename pain -> effort"_. The two figures were always meant to be
separate axes (the "picking a workout" article says so), but the library
does not use them that way: across all 300 seeded workouts, easy is only
ever 1–2, hard is only ever 4–5, and medium is 2–4 (counted 2026-09-05,
`server/seed/library/*.ts`; the article's own example, "a short set of
sprints can be easy and a 4", describes a workout that does not exist).
Difficulty is a coarser copy of pain. This phase deletes the copy and
renames the figure that survives: a rower sees one word, EFFORT, with one
scale, on every row, filter, picker, log and article. Nothing about what
the number means changes.

**Why now, ahead of Wave A.** A stranger reading `PAIN 4/5` on their first
log is itself a "stranger can use this" failure, and a rename only gets
more expensive as surfaces accumulate. Phase DE is M-sized and touches no
auth; it runs before the front door rather than after it for that reason
(PM open gate, 2026-09-05).

**Gate class, spoken.** Not fast path — `domain/`, `server/`, two Postgres
migrations, three localStorage shapes and the API all change. PR 1 and
PR 2 are TRIAD (stored shape): the antagonist anchor pass ran on this spec
2026-09-05 (rev 1 → rev 2; its held claims are §8's vetted ground), a delta
pass is owed on PR 2's plan (API dual-field, rollback row, migration
provenance), PM at open (PASS WITH CONDITIONS, 2026-09-05, folded in) and
close plus a PM final gate on each of the three PRs. PR 1 changes the
layout of every workout row, so it carries a Gate 0 capture set before its
implementation starts. PR 2 is a rename: every user-visible word changes
and no pixel moves, so its Gate 0 is the word list in §4.4, no captures
(James, 2026-08-23: no screenshots for copy). No hardware walk: difficulty
and pain never reach the PM5 program compiler, the pace math or any stored
monitor number (grepped 2026-09-05: `domain/monitor/program.ts` and
`domain/pace.ts` match only the English words "hard target" / "30 seconds
easy"; `domain/generation/` has no hit at all).

**Decisions James made in the brainstorm (2026-09-05):**

- Rename depth: **copy + code, API dual-field.** Every user-visible word, TS
  identifier, component and article says effort; the columns are renamed by
  migration; the API serves both `pain` and `effort` for one tag cycle so
  installed builds keep working, then `pain` is dropped.
- Replacement for difficulty: **nothing; effort already covers it.** The
  chip, both filter groups, the `difficulties` preference and the
  bulk-header column go. Today's suggestion filters on type, time and
  effort only.
- Name clash with the pace-ref `Effort = "max" | "min"`: **rename the pace
  type in TypeScript only.** The stored step key `{effort: "max"}` is left
  alone so no step JSON migrates. The 1-to-5 figure takes the plain name
  `effort` everywhere. (§4.4 extends this to the pace-word's whole
  identifier family, same principle: TS only, stored key untouched.)
- Phase shape: three PRs in the order remove → rename → drop compat, with
  the compat drop waiting for the next tag. "Yes" to the shape as
  presented.

**Confirmed by James (2026-09-05, "Good", on the rev 2 presentation):**
(a) the server writes a derived difficulty band on inserts for one tag
cycle — compat plumbing no new build ever shows, not the "derive a band"
product option he declined; (b) PR 2 renames the pace-word identifier
family (~20 names), not three, so `grep effort` means one thing afterwards.

---

## 1. Research pass and does-it-exist

**Does the underlying system have the concept?** The only external systems
this app talks to are the PM5 and Concept2's logbook API. Neither carries a
difficulty or an effort figure in anything we send or receive:
`server/concept2/mapping.ts` builds the logbook payload from distance,
time, splits and stroke data only (grepped 2026-09-05: no `pain`, no
`difficulty`, no `rpe`). The concept is entirely ours, and this phase does
not change what we assert on anyone's behalf — it deletes one of our two
assertions and renames the other.

**Who solved this already.** The published convention for "how hard did
that feel" is Borg's Rating of Perceived Exertion (the 6–20 scale and the
0–10 CR10 variant), and the word the sports-science literature uses is
_exertion_ or _effort_, never _pain_ — pain scales (the 0–10 NRS) are a
separate clinical instrument for injury and discomfort. **SECONDARY, from
memory, not fetched for this spec:** the claim is not load-bearing. The
rename is James's product decision, and the existing article already
draws exactly this boundary in its second paragraph ("Sharp, sudden, or
joint-specific pain ... is not a high number on this scale").

**What the repo already settled.** `ls docs/superpowers/research/` and
`grep -n "difficulty\|pain" ROADMAP.md` (2026-09-05): no research file
and no open item covers either figure. `docs/design/DEVIATIONS.md` rows
"Pain 1–10", "`PAIN ≤5` library filter chip" and "Difficulty
`Introductory / Moderate / Advanced`" (the table is unnumbered; cite by
first-column text) record that the handoff's 1–10 pain scale and its
INTRO/MODERATE/ADVANCED difficulty words were both adapted rather than
adopted — the handoff never had EASY/MEDIUM/HARD either. Phase 5G
(closed 2026-08-01) introduced the pace-ref `Effort` type this phase
renames, and its spec's "Decisions" section is why the stored key is a
key-presence union that must not move. **Rollback across a migration is
already written down three times** in `docs/RELEASING.md` § Rollback
constraints: `scripts/deploy.sh:23-29`'s ERR-trap `rollback()` fires
AFTER the new container has migrated, restoring an image whose schema
names what the DB no longer has, "while the deploy log reports the
rollback succeeded". §4.2 leans on that table instead of re-deriving it.

## 2. Census — what carries each figure today

Counted 2026-09-05 in the main checkout at `f014c944`, product files only
(tests excluded): **difficulty** in 60 files, **pain** in 84 files, 85
test files mention one or both. Every stored-shape row below was grepped
individually in the anchor pass; the log draft row rev 1 listed was
FALSE (`grep -n pain app/src/session/{draft,logDraft}.ts` exits 1;
`LogSession.tsx:545` says "`held`/`pain`/`notes` are NOT here") and is
gone.

| Layer | Difficulty | Pain |
| --- | --- | --- |
| Stored (Postgres) | `workouts.difficulty` (`pgEnum difficulty`, NOT NULL); `preferences.difficulties` (jsonb, default all three) | `workouts.pain` (int, CHECK 1..5); `session_logs.pain` (int nullable, CHECK 1..5); **`article_reads.slug`** holds `pain-scale` rows (`schema.ts:510-513`, `storeContracts.ts:2307`) |
| Stored (localStorage) | Today per-type filter blob `difficulties` (`todayFilters.ts:44`); builder draft `difficulty` (`builderDraft.ts:32,60`) | Today blob `painLevels`; Library filters `painLevels`; builder draft `pain` (`builderDraft.ts:33`) |
| Domain | `Difficulty` type, `WorkoutInput.difficulty`, `validate.ts:143`, `bulk.ts` header field 3, `suggest.ts:295,360` `prefs.difficulties` filter, `library/filters.ts:198` | `WorkoutInput.pain`, `validate.ts:145`, `bulk.ts` header field 4, `suggest.ts` `prefs.painLevels` |
| Server API | workouts responses spread the row; `validateWorkoutInput` on POST, PUT and `/bulk`; `GET`/`PUT /api/prefs` (`data.ts:1923,1927`) serve and validate `difficulties` | nine response sites spread the row (`data.ts:1091,1136,1153,1182,1341` and the log routes); log POST/PATCH validate via `painError` (`data.ts:138`) |
| Client renderers that READ difficulty directly | `WorkoutRow.tsx:52`, `Today.tsx:1487`, `WorkoutDetail.tsx:436` — all `workout.difficulty.toUpperCase()` | `PainBar` (5 users), `LogRow` "3/5", `PostWorkoutSummary`, `LogSession` (`useState` only), `TimerRuler` |
| Client controls | `DIFFICULTY_CHIPS`, `difficultyTokenLabel.ts`, `ClassificationCard` radiogroup, DIFFICULTY group in both filter sheets, `BulkImport.tsx:28` comment and `:47` help string | PAIN group in both sheets, `ClassificationCard` inline picker |
| Content | "picking a workout" paragraph | `/news/pain-scale` article, "picking a workout" link, release-note history |
| Tooling | seed library (300 rows), `library.test.ts:74,278,300`, `scripts/library-moves.ts` report column, `.claude/skills/wod-import/SKILL.md:55`, `.claude/skills/hardware-walk/SKILL.md:130` (pasteable 5-field headers), e2e seeds | same files |

The pace-word concept spells itself in ~20 identifiers, not three: `Effort`,
`EffortRef`, `effortSpoken`, `isEffortRef` (37 hits), `effortWord` (33),
`effortFromWord` (18), `isEffort` (15), `effortText` (13), `effortShare`,
`effortKey`, `effortWork`, `effortPhaseOf`, `effortBucket`, across
`domain/expand.ts`, `pace.ts`, `monitor/program.ts`,
`generation/archetype.ts`, `display/stepDetail.ts`, `needsBaselines.ts`,
`src/builder/PaceRefInput.tsx`, `builderState.ts`, `today/Today.tsx`,
`workout/StepRow.tsx`, `WorkoutDetail.tsx`, `session/draft.ts`,
`logDraft.ts`, `LogSession.tsx`.

## 3. PR 1 — remove difficulty

### 3.1 The invariant this PR owes

After PR 1 a rower can see, set, filter or import a difficulty
**nowhere**, and an installed pre-PR-1 build against the new server keeps
working for one tag cycle: it renders, filters and saves as before, and
every workout it reads still carries a non-null `difficulty`.

### 3.2 Stored shape — no migration; a derived compat write

**NULL is not an option.** Rev 1 proposed dropping NOT NULL and letting
old builds render a blank chip. The anchor pass showed the three renderers
never use the lookup helper: `WorkoutRow.tsx:52`, `Today.tsx:1487` and
`WorkoutDetail.tsx:436` all call `workout.difficulty.toUpperCase()`, so a
NULL row throws inside React render and takes out the Library list, the
Today card and the detail screen on every pre-PR-1 build; `suggest.ts:295`
and `filters.ts:198` would additionally drop such rows from the pool.

So PR 1 changes nothing in Postgres. The column, its enum and
`preferences.difficulties` stay exactly as they are until PR 3. For one tag
cycle the **server store derives `difficulty` from effort on every workout
insert and update** (1–2 → easy, 3 → medium, 4–5 → hard) in
`server/stores/workouts.ts`, so the NOT NULL column is always satisfied
and an old build always has a word to print. This is compat plumbing: no
new build reads, shows or accepts the value; PR 3 deletes the derivation
with the column. It is not the "derive a band" product option James
declined — that option would have kept a chip and a filter. The band
disagrees with the stored word on ~70 seeded medium workouts, but seeded
rows are never rewritten (`seed.ts:47`'s `contentEqual` leaves matching
global rows alone), so the only rows that carry a derived word are ones
created or edited through new builds during the cycle, and only old
builds can see it.

Rollback: nothing to roll back; the old image's insert path writes its own
difficulty and reads a NOT NULL column that is still NOT NULL. Cosmetic
(vetted, §8).

### 3.3 API (additive-only between tags, kept)

- Workout responses keep carrying `difficulty` (now sometimes derived).
  The client type drops the field; it is ignored on arrival.
- POST/PUT workouts and `/bulk`: `difficulty` is **ignored if present** (old
  clients send it) and never required; `validateWorkoutInput` loses its
  difficulty check and the store writes the derived value.
- `GET /api/prefs` keeps serving `difficulties` as stored. **Why (vetted,
  corrected mechanism):** `usePreferences.ts:42` casts the JSON with no
  validation and the value reaches `suggest()` via `Today.tsx:900`'s
  `seedSet` → `filterSetFor` (`:1014`) → `prefs.difficulties.includes(...)`
  at `suggest.ts:295` — a bare access that throws on `undefined`, for any
  filter key with no stored entry. `PUT /api/prefs` keeps validating
  `difficulties` when present so an old build's save is not rejected. New
  clients never send or read it.

### 3.4 Domain and client

- `Difficulty`, `WorkoutInput.difficulty`, `DIFFS` in `bulk.ts` and
  `validate.ts`, `SuggestPrefs.difficulties` and both `difficulties`
  predicates in `suggest.ts` (lines 295, 360) and `filters.ts:198` are
  deleted from the domain and client; the server keeps a private
  `Difficulty` type for the compat write only, with a comment naming PR 3
  as its removal (RF29: the ROADMAP row exists, §5). `suggest.ts`'s reason
  text (`parts = ["difficulty"]`, line 238) is rebuilt so it never names a
  filter that no longer exists.
- `DIFFICULTY_CHIPS`, `difficultyTokenLabel.ts` and their CSS go
  (recurring failure 5: grep `.classification-chip-difficulty`,
  `difficulty` across `src/` and `e2e/` after deletion).
- The DIFFICULTY group leaves both filter sheets. `todayFilters.ts`'s
  parser accepts a stored blob that still carries `difficulties` and drops
  the key (today, line 119 REJECTS a blob missing it — that branch
  inverts); the Library filter store does the same. Filter token labels
  lose the DIFFICULTY token.
- `ClassificationCard` loses its difficulty radiogroup; the card is TYPE
  and the 1–5 picker (still labelled PAIN in this PR — PR 2 renames).
  `builderDraft.ts` drops the field and its parser tolerates old drafts
  that carry it (`:60` currently requires it).
- Today's suggestion (`Today.tsx:291, 900`) passes no `difficulties`.
  **Number check (vetted):** with the default all-three set the predicate
  is a no-op, so the pool and the morning roll (`Today.tsx:980`
  `candidates`) are byte-identical before and after; a rower who HAD
  narrowed it sees a wider pool and their narrowed preference is
  discarded, not translated. That is the intended product change, the
  release note (§6.6) says so, and the PR body says so.
- Seed library: the `difficulty` field is deleted from all 300 entries
  and from `onboarding.ts`; `seed.ts` writes the derived word via the
  store like any other insert. **`library.test.ts`:** the pairing table
  `PAIN_BY_DIFF` (`:74,278`) dies with the axis; `PAIN_BY_TYPE` stays;
  the ordering invariant at `:300` ("orders each type block easy→hard,
  difficulty never decreases") is **re-expressed over pain/effort** —
  within a type block the figure never decreases — not deleted. It is the
  only pin on what a rower sees scrolling a type block (PM open gate,
  condition 2).

### 3.5 Bulk grammar

The header becomes **`title | TYPE | effort`** (three fields). To keep every
block James has already pasted, and the two skills' output until they are
updated in this PR, the parser also accepts the two legacy forms and
discards the difficulty field:

| Fields | Form | Read as |
| --- | --- | --- |
| 3 | `title \| TYPE \| effort` | canonical |
| 4 | `title \| TYPE \| difficulty \| pain` | legacy; field 3 ignored |
| 5 | `n \| title \| TYPE \| difficulty \| pain` | legacy; fields 1 and 4 ignored |

Disambiguation by count is sound because no 3-field form exists today. A
`|` inside a title is NOT rejected today — `parseHeader` accepts 4 or 5
fields and `slice(1)`s the 5-field form, so `A|B | AN | medium | 3` parses
silently as title `B` (anchor pass). That is a pre-existing defect the
new count table does not worsen; PR 1's plan adds one test pinning it
either way and the PR body states which. The error message for any other
count names the canonical form only. `BulkImport.tsx:28` (comment) and
`:47` (help string), `.claude/skills/wod-import/SKILL.md:55` and
`.claude/skills/hardware-walk/SKILL.md:130` are updated in this PR; the
hardware-walk headers are pasted once through the new parser before the
PR is ready (RF13).

The canonical header says `effort` from PR 1 while the parsed identifier
is still `pain` — accepted so the grammar changes once. This is why **PR 1
and PR 2 ride the same tag, and no release is cut between them** (§5).

### 3.6 Content, tooling, design record

- "Picking a workout" loses its difficulty paragraph (lines 26–29) and
  the false sprint example with it.
- `scripts/library-moves.ts` drops the `difficulty /` half of its report
  column.
- `DEVIATIONS.md`: the "Difficulty `Introductory / Moderate / Advanced`"
  row is **replaced**, not amended — it documents current state, and it
  now says the handoff's difficulty chip is gone and why.
- `docs/screenshots/*.png` are re-captured (row layout changed).

### 3.7 Gate 0 for PR 1

Rendered before/after, portrait and landscape, real seed data, presented
and then STOP: `WorkoutRow` in the Library list, Today's suggestion card,
the Library filter sheet, the Today filter sheet, the Builder's
`ClassificationCard`. Every colour pairing in the after state is one that
already ships, so the contrast table is a statement that no new pairing
was introduced, checked by the existing design e2e sweep.

## 4. PR 2 — rename pain to effort

### 4.1 The invariant this PR owes

After PR 2 the word "pain" appears **nowhere a rower can read it, and
nowhere an agent can grep it in product code**, except: release-note
history (a record, unchanged) and the compat API paths PR 3 removes. And
`grep -rn effort` in product code means ONE thing: the 1–5 figure, plus
the stored step key `effort:` on `PaceWordRef` with its comment. An
installed pre-PR-2 build against the new server saves and reads its
figure unchanged for one tag cycle.

### 4.2 Stored shape

**Hand-written migration** — not generated. `grep -rl RENAME app/drizzle/`
returns nothing: this repo has never produced a column rename, and
drizzle-kit resolves renames through an interactive prompt whose non-TTY
fallback is DROP + ADD (data loss on both tables). If `db:generate` is
run at all, the reviewer greps the emitted file for `DROP COLUMN` before
it is committed; PR 2's plan runs that experiment once and records what
the tool emitted.

```sql
ALTER TABLE "workouts" RENAME COLUMN "pain" TO "effort";
ALTER TABLE "workouts" RENAME CONSTRAINT "workouts_pain_check" TO "workouts_effort_check";
ALTER TABLE "session_logs" RENAME COLUMN "pain" TO "effort";
ALTER TABLE "session_logs" RENAME CONSTRAINT "session_logs_pain_check" TO "session_logs_effort_check";
UPDATE "article_reads" SET "slug" = 'effort-scale' WHERE "slug" = 'pain-scale';
```

The `article_reads` line is the third stored shape: without it every
rower's read of the pain-scale article reverts to unread and the News
tab's next-unread walk changes.

**Rollback: NOT rollback-safe, and an unattended path crosses it.**
`scripts/deploy.sh:23-29`'s health-gated `rollback()` fires after the new
container has migrated and restores an image that selects `pain` — every
workout and log read 500s with no operator involved, while the deploy log
says the rollback succeeded. **PR 2 adds its tag as a new floor row in
`docs/RELEASING.md` § Rollback constraints, in the same PR, naming
`deploy.sh` as the crosser and FORWARD-FIX ONLY as the recovery.** PR 3's
drops get a row too.

**localStorage** (client-owned stored shapes, each with a one-release
fallback read that PR 3 deletes; the log draft is NOT in this table
because it holds no pain — `LogSession.tsx:712` is `useState`):

| Key | Old field | New field |
| --- | --- | --- |
| Today per-type filters | `painLevels` | `effortLevels` |
| Library filters | `painLevels` | `effortLevels` |
| Builder draft (`builderDraft.ts:33`) | `pain` | `effort` |

Each parser reads `effort*` first, falls back to `pain*`, and writes only
the new key.

### 4.3 API dual-field (the compat contract)

Responses are bare row spreads — `res.json(rows.map(w => ({...w, ...})))`
at `data.ts:1091`, `res.json(row)` at `:1153`, `:1182`, `:1341`,
`res.status(201).json(row)` at `:1136`, plus the log routes — so the
column rename alone would silently remove `pain` from nine sites. The
contract:

- One **outbound adapter** applied at every one of those nine sites (the
  plan enumerates them by line against PR 2's base): `effort` is the
  column; `pain` is copied from it. Both keys, same value.
- One **inbound adapter** applied before `validateWorkoutInput` (called
  from POST, PUT and `/bulk` with `req.body` directly) and before the log
  POST/PATCH validators: `effort` wins if present; else `pain` is copied
  to `effort`; if both are present and unequal, **400** with
  `field: "effort"` — redundant inputs are allowed, disagreeing ones are
  not. `painError` becomes `effortError` ("effort must be an integer 1..5
  or null"); the `pain`-keyed path reports the same message under
  `field: "pain"` so an old client's error handling is unchanged.
- **The inbound adapter counts.** Every `pain`-keyed write emits one
  structured server log line (`compat.pain_write`). That line is PR 3's
  trigger (§5) and PR 3 deletes it.
- The store layer speaks only `effort`.
- Vetted: no current client ever sends both keys (`FromTheLog.tsx:217`'s
  `buildPatch` sends only changed keys; nothing spreads a fetched row into
  a PATCH body). The disagreement test exists anyway.

### 4.4 Domain, client, content

- Types: `WorkoutInput.effort`, `SuggestPrefs.effortLevels`,
  `validate.ts` ("effort must be 1..5"), `bulk.ts` ("invalid effort").
- **Pace-word rename, TS only, the whole family:** `Effort` → `PaceWord`,
  `EffortRef` → `PaceWordRef`, `effortSpoken` → `paceWordSpoken`,
  `isEffortRef` → `isPaceWordRef`, `effortWord` → `paceWord`,
  `effortFromWord` → `paceWordFromWord`, `isEffort` → `isPaceWord`,
  `effortText` → `paceWordText`, and `effortShare`/`effortKey`/
  `effortWork`/`effortPhaseOf`/`effortBucket` → `paceWord*`. The `effort`
  property on `PaceWordRef` keeps its name — it is the stored JSON key —
  and a comment on the type says exactly that so the next agent does not
  "fix" it. This is wider than the three names James approved; the
  principle is the one he chose (TS only, stored key untouched) and the
  alternative leaves `grep effort` returning two concepts, which is the
  confusion the rename exists to remove. Confirmed or narrowed in the PR
  body (see the header).
- Components: `PainBar` → `EffortBar`, the classification card's inline
  pain picker → effort picker, CSS `--pain-*`/`.pain-*` →
  `--effort-*`/`.effort-*` (grep both directions after, RF5). Word list,
  complete, for Gate 0:

  | Where | Before | After |
  | --- | --- | --- |
  | Filter sheets, both | `PAIN` | `EFFORT` |
  | Today card (`Today.tsx:1487`) | `… · PAIN 3` | `… · EFFORT 3` |
  | Stored summary line | `HELD · PAIN 3/5 · LIKED` | `HELD · EFFORT 3/5 · LIKED` |
  | `LogRow`, `WorkoutDetail`, `PostWorkoutSummary`, `LogSession`, `TimerRuler` | PAIN n/5 | EFFORT n/5 |
  | Classification card word row | pain words | same five words under EFFORT |
  | Article title/slug | "The pain scale, without a heart rate monitor", `/news/pain-scale` | "The effort scale, without a heart rate monitor", `/news/effort-scale` |
  | Picking-a-workout link | "pain from 1 to 5" | "effort from 1 to 5" |
  | Every `aria-label` carrying "pain" | | "effort" |

  The five level words (Motion, Work you could keep doing, Comfortably
  hard, Hard intervals, All out) do not change.
- **Captures:** no Gate 0 captures (copy only), but both filter sheets'
  COMMITTED captures render the literal word PAIN, so PR 2 runs
  `pnpm screenshots` and commits the refreshed set rather than leaving the
  record stale until close (PM open gate, condition 7).
- Article: slug `effort-scale`; the old slug resolves to the same article
  (an alias entry in `articles.tsx`, since release-note history links to
  the old path) and the migration above moves the read rows. The second
  paragraph is rewritten as a positive definition ("This scale is effort,
  not injury. Sharp, sudden ...") rather than a disclaimer.
- Tooling: `library-moves.ts`, both `SKILL.md`s, e2e seeds and helpers.

### 4.5 Sequencing against AUD-016

`Ergomatic-wt-aud016` (branch `wave-f-aud016-spec`, no PR open) has
rewritten `LogSession.tsx` (+229), `ConnectedSurface.tsx` (+68) and
`WorkoutDetail.tsx` — files PR 2 renames through. **PR 2 does not open
until AUD-016's PR has merged, or James rules it abandoned;** PR 2 then
rebases and re-runs its grep. PR 1 can proceed now (its overlap with
AUD-016 is nil: `git diff --stat origin/main...wave-f-aud016-spec` touches
no filter, seed, builder or suggestion file). Wave E PR C (#307) touches
only `concept2/*`. Neither in-flight branch mints a migration; main is at
`0023`. Each DE PR body states its drizzle index checked against main at
ready-time, per the agent briefing's second-merger-regenerates rule.

## 5. PR 3 — drop compat (measured, not confirmed)

**Trigger:** the tag carrying PR 1 and PR 2 has been deployed, and the
server log shows **zero `compat.pain_write` lines for seven consecutive
days after that deploy** (`docker logs` over the window on the prod host,
command and output pasted in PR 3's body). "Every device is updated" is
not a thing anyone can know — TestFlight says nothing about a phone
nobody opened — so the compat layer measures its own use instead. The
tag cycle itself is not ceremony: without the dual field a stale build's
log save 400s, which is the durability class Wave F just fixed.

Then, one PR:

- Migration (hand-annotated; a floor row in RELEASING.md like PR 2's):
  `ALTER TABLE workouts DROP COLUMN difficulty; DROP TYPE difficulty;
  ALTER TABLE preferences DROP COLUMN difficulties;`
- Server: the derived-difficulty compat write and its private type go;
  `difficulty` and `difficulties` leave responses and are ignored like any
  unknown field; the inbound/outbound adapters and the `compat.pain_write`
  line are deleted; `pain` leaves every response.
- localStorage: the three fallback reads in §4.2 are deleted.
- Bulk grammar: the 4- and 5-field legacy headers are **kept** — they
  cost nothing and James's pasted blocks live outside the app. Stated
  here so PR 3 does not "tidy" them.

PR 3 is TRIAD (stored shape) and gets a PM final gate; the antagonist
skips ("inherits phase ground; the anchor pass attacked the drop
sequence"), spoken in the PR body.

**Tag discipline:** PR 1 and PR 2 ride ONE tag; no release is cut between
them (a tag after PR 1 alone ships an import help saying `effort` beside
PAIN everywhere else, and mints a second stale-build generation for the
compat layer to serve). PR 3 rides whatever tag follows its trigger.

## 6. Exit criteria

1. `grep -rniE "difficult|\bpain\b" app/domain app/server app/src app/e2e`
   returns only: release-note history and the PR 3 compat paths (until
   PR 3). And `grep -rn "effort" app/domain app/src` returns only the 1–5
   figure plus `PaceWordRef`'s stored key and its comment. Both run in
   the phase-close gate and pasted.
2. Both filter sheets, `WorkoutRow`, `ClassificationCard`, `LogRow` and
   the article render with EFFORT; `pnpm e2e` and `pnpm screenshots`
   green with refreshed captures.
3. A pre-PR-1 web build (checkout of `v0.38.1`, `pnpm build`) served
   against a post-PR-2 server loads Library, Today and the Log and saves a
   log with `pain: 3`, which reads back as `effort: 3`; a workout it
   creates carries a derived `difficulty`. Runs once, by hand, before
   PR 2's ready comment; the PR body records the commands.
4. `library.test.ts`'s within-type ordering invariant passes over effort;
   `variety.test.ts` and the archetype ratchet pass unchanged.
5. `DEVIATIONS.md` "Pain 1–10", "`PAIN ≤5`" and "Difficulty" rows
   reconciled; both `SKILL.md`s updated; the phase ROADMAP section becomes
   one ledger row and this spec's body moves to `docs/history/`.
6. Release note, in rower words (PM open gate, condition 5): _"One number
   for how hard a workout is. EASY / MEDIUM / HARD is gone and PAIN is now
   EFFORT — same 1 to 5, same meaning. If you'd narrowed Today by
   difficulty, that filter is gone and Today may suggest more workouts
   than before; narrow by effort instead."_

## 7. Risks the delta pass on PR 2's plan attacks

- The migration provenance experiment (§4.2): what `db:generate` actually
  emits for a renamed column on drizzle-kit 0.31.10, run once and pasted.
- The nine outbound and three inbound adapter sites, enumerated by line
  against PR 2's base, with a test that goes red when one is missed.
- The RELEASING.md floor row wording against `deploy.sh`'s actual trap.
- The pace-word identifier census: the ~20 names above were counted in
  the anchor pass; the plan re-counts against PR 2's base.

## 8. Vetted ground (anchor pass, 2026-09-05, attacked and held)

- An old client throws on a missing `preferences.difficulties` — by the
  `seedSet` → `filterSetFor` → `suggest.ts:295` route, not directly.
- No client sends both `pain` and `effort`.
- No NUMBER changes: `difficulty` appears nowhere in `domain/generation/`,
  `pace.ts` or `monitor/program.ts`; every remaining consumer is a
  pass-through or a 1..5 bound; the default-set pool and morning roll are
  byte-identical.
- Seeded rows are never rewritten by the seeder (`seed.ts:47`
  `contentEqual`), so the derived compat word reaches only rows new
  builds create or edit.
- Header disambiguation by field count is sound (no 3-field form exists).
