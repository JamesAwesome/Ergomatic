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

**Gate class, spoken.** Not fast path — `domain/`, `server/`, three
Postgres migrations, a localStorage shape and the API all change. PR 1 and
PR 2 are TRIAD (stored shape): full antagonist pass on this spec (the
phase's anchor pass, attacking PR 1 as the riskiest), a delta pass on PR 2's
API dual-field and localStorage fallbacks, PM at open and close plus a PM
final gate on each of the three PRs. PR 1 changes the layout of every
workout row, so it carries a Gate 0 capture set before its implementation
starts. PR 2 is a rename: every user-visible word changes and no pixel
moves, so its Gate 0 is the word list in §4.3, no captures
(James, 2026-08-23: no screenshots for copy). No hardware walk: difficulty
and pain never reach the PM5 program compiler, the pace math or any stored
monitor number (grepped 2026-09-05: `domain/monitor/program.ts` and
`domain/pace.ts` match only the English words "hard target" / "30 seconds
easy").

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
  type in TypeScript only.** `Effort`/`EffortRef` become
  `PaceWord`/`PaceWordRef`; the stored step key `{effort: "max"}` is left
  alone so no step JSON migrates. The 1-to-5 figure takes the plain name
  `effort` everywhere.
- Phase shape: three PRs in the order remove → rename → drop compat, with
  the compat drop waiting for the next tag. "Yes" to the shape as
  presented.

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
joint-specific pain ... is not a high number on this scale"). The rename
makes the article's own caveat unnecessary as a disclaimer and true as a
title.

**What the repo already settled.** `ls docs/superpowers/research/` and
`grep -n "difficulty\|pain" ROADMAP.md` (2026-09-05): no research file
and no open item covers either figure. `docs/design/DEVIATIONS.md` rows
34, 35 and 37 record that the handoff's 1–10 pain scale and its
INTRO/MODERATE/ADVANCED difficulty words were both adapted rather than
adopted — the handoff never had EASY/MEDIUM/HARD either. Phase 5G
(closed 2026-08-01) introduced the pace-ref `Effort` type this phase
renames, and its spec's "Decisions" section is why the stored key is a
key-presence union that must not move.

## 2. Census — what carries each figure today

Counted 2026-09-05 in the main checkout at `f014c944`, product files only
(tests excluded): **difficulty** in 60 files, **pain** in 84 files, 85
test files mention one or both. The load-bearing ones:

| Layer | Difficulty | Pain |
| --- | --- | --- |
| Stored (Postgres) | `workouts.difficulty` (`pgEnum difficulty`, NOT NULL); `preferences.difficulties` (jsonb, default all three) | `workouts.pain` (int, CHECK 1..5); `session_logs.pain` (int nullable, CHECK 1..5) |
| Stored (localStorage) | `todayFilters` per-type blob carries `difficulties: Difficulty[]` (`src/today/todayFilters.ts:44`) | same blob carries `painLevels: number[]`; Library filters carry `painLevels`; the in-session log draft (`src/session/logDraft.ts`, `draft.ts`) carries `pain` |
| Domain | `Difficulty` type, `WorkoutInput.difficulty`, `validate.ts:143`, `bulk.ts` header field 3, `suggest.ts` `prefs.difficulties` filter | `WorkoutInput.pain`, `validate.ts:145`, `bulk.ts` header field 4, `suggest.ts` `prefs.painLevels` (`judge.ts` matches only the English word "painted"; it does not consume the figure) |
| Server API | GET workouts serve it; POST/PUT workouts validate it; PATCH `/api/preferences` validates `difficulties` (`data.ts:1931-1944`) | workouts and logs serve `pain`; log POST/PATCH validate via `painError` (`data.ts:138`) |
| Client | `DIFFICULTY_CHIPS`, `difficultyTokenLabel.ts`, chip on `WorkoutRow`, `Today` card, `ClassificationCard` radiogroup, DIFFICULTY group in both filter sheets, `BulkImport` help text | `PainBar` (5 users), PAIN group in both sheets, `ClassificationCard` picker, `LogRow` "3/5", `PostWorkoutSummary`, `LogSession`, `TimerRuler`, `WorkoutDetail` |
| Content | "picking a workout" article paragraph on difficulty | `/news/pain-scale` article, "picking a workout" link, release-note history |
| Tooling | seed library (300 rows), `scripts/library-moves.ts` report column, `.claude/skills/wod-import/SKILL.md:55`, e2e seeds | same files |

The pace-ref `Effort` type (`domain/types.ts:46`) is used in 15 product
files (`domain/expand.ts`, `pace.ts`, `monitor/program.ts`,
`generation/archetype.ts`, `display/stepDetail.ts`, `needsBaselines.ts`,
`src/builder/PaceRefInput.tsx`, `builderState.ts`, `today/Today.tsx`,
`workout/StepRow.tsx`, `WorkoutDetail.tsx`, `session/draft.ts`,
`logDraft.ts`, `LogSession.tsx`, plus `types.ts`).

## 3. PR 1 — remove difficulty

### 3.1 The invariant this PR owes

After PR 1 a rower can see, set, filter or import a difficulty
**nowhere**, and an installed pre-PR-1 build against the new server keeps
working for one tag cycle: it renders, filters and saves as before, with at
most a blank chip on workouts created by new builds.

### 3.2 Stored shape

One migration, generated by `pnpm db:generate` and then annotated by hand
in the style of `drizzle/0022`:

```sql
ALTER TABLE "workouts" ALTER COLUMN "difficulty" DROP NOT NULL;
```

That is all PR 1 changes in Postgres. The column, its enum type and
`preferences.difficulties` stay until PR 3, **kept as compat, not as
product**: no new code reads them, the server serves what is stored, and
new rows leave `difficulty` NULL. This was chosen over "drop now and serve a
band derived from effort" because a derived band would show ~70 medium
workouts as easy or hard on stale builds for a cycle, inventing a rule
purely to be wrong for a month; NULL is honest and the old client's
`DIFFICULTY_CHIPS.find()` simply renders no label.

Rollback: the image before PR 1 writes `difficulty` on every insert and
reads a NOT NULL column that is now nullable — every row it wrote still
satisfies it, and rows the new image wrote render blank in the old UI.
Recorded in the PR's rollback row; risk cosmetic.

### 3.3 API (additive-only between tags, kept)

- GET `/api/workouts` and the workout detail keep serving `difficulty` as
  stored (`"easy" | "medium" | "hard" | null`). The client type becomes
  `difficulty?: never`-free: the field is simply not in the client's type
  and is ignored on arrival.
- POST/PUT workouts: `difficulty` is **ignored if present** (old clients
  send it) and never required. `validateWorkoutInput` loses its difficulty
  check. The bulk-import server path accepts the new header (§3.5).
- GET `/api/preferences` keeps serving `difficulties` as stored (an old
  Today calls `prefs.difficulties.includes(...)` and would throw on
  `undefined`); PATCH keeps validating it when present, exactly as today,
  so an old build's preference save is not rejected. New clients never send
  or read it.

### 3.4 Domain and client

- `Difficulty`, `WorkoutInput.difficulty`, `DIFFS` in `bulk.ts` and
  `validate.ts`, `SuggestPrefs.difficulties` and both `difficulties`
  predicates in `suggest.ts` (lines 295, 360) are deleted. `suggest.ts`'s
  reason text (`parts = ["difficulty"]`, line 238) is rebuilt so it never
  names a filter that no longer exists — the "honesty rule" comment at
  line 57 already governs this.
- `DIFFICULTY_CHIPS`, `difficultyTokenLabel.ts` and their CSS go
  (recurring failure 5: grep `.classification-chip-difficulty`,
  `difficulty` across `src/` and `e2e/` after deletion).
- The DIFFICULTY group leaves both filter sheets. `todayFilters.ts`'s
  parser accepts a stored blob that still carries `difficulties` and drops
  the key; the Library filter store does the same. Filter token labels
  lose the DIFFICULTY token.
- `ClassificationCard` loses its difficulty radiogroup; the card is now
  TYPE and EFFORT (still called PAIN in this PR — PR 2 renames). The
  builder draft (`builderDraft.ts`, localStorage) drops the field and
  tolerates old drafts that carry it.
- Today's suggestion (`Today.tsx:291, 900`) passes no `difficulties`; the
  `preferences.difficulties` seed it reads goes with it. **Number check:**
  with all three difficulties selected today, the difficulty predicate is
  a no-op, so the suggestion pool for a rower who never touched the
  setting is identical before and after; a rower who HAD narrowed it sees
  a wider pool. That is the intended product change, not a defect, and
  the PR body says so.
- Seed library: the `difficulty` field is deleted from all 300 entries
  and from `onboarding.ts`; `seed.ts` stops writing it. `library.test.ts`
  and `variety.test.ts` lose their difficulty assertions. The seed is
  data, not a stored-shape change of its own.

### 3.5 Bulk grammar

The header becomes **`title | TYPE | effort`** (three fields). To keep every
block James has already pasted, and the wod-import skill's output until it
is updated in this PR, the parser also accepts the two legacy forms and
discards the difficulty field:

| Fields | Form | Read as |
| --- | --- | --- |
| 3 | `title \| TYPE \| effort` | canonical |
| 4 | `title \| TYPE \| difficulty \| pain` | legacy; field 3 ignored |
| 5 | `n \| title \| TYPE \| difficulty \| pain` | legacy; fields 1 and 4 ignored |

The error message for any other count names the canonical form only. The
`BulkImport.tsx` help text and `SKILL.md:55` are updated in this PR. (This
PR still calls the number `pain` in the parsed object; PR 2 renames the
identifier. The canonical header says `effort` from PR 1 so the grammar
does not change twice.)

### 3.6 Content, tooling, design record

- "Picking a workout" loses its difficulty paragraph (lines 26–29) and
  the false sprint example with it.
- `scripts/library-moves.ts` drops the `difficulty /` half of its report
  column.
- `DEVIATIONS.md` row 37 (difficulty words) is **removed**, not amended: it
  documents current state, and the thing it adapted no longer exists. The
  handoff in `docs/design/README.md` still shows a difficulty chip; a
  DEVIATIONS row replaces 37 saying the chip is gone and why.
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
history (a record, unchanged), the stored step key `{effort: "max"}` which
was never "pain", and the compat API field `pain` that PR 3 removes. An
installed pre-PR-2 build against the new server saves and reads its effort
figure unchanged for one tag cycle.

### 4.2 Stored shape

One migration:

```sql
ALTER TABLE "workouts" RENAME COLUMN "pain" TO "effort";
ALTER TABLE "workouts" RENAME CONSTRAINT "workouts_pain_check" TO "workouts_effort_check";
ALTER TABLE "session_logs" RENAME COLUMN "pain" TO "effort";
ALTER TABLE "session_logs" RENAME CONSTRAINT "session_logs_pain_check" TO "session_logs_effort_check";
```

A rename moves no data and rewrites no row. Rollback: the pre-PR-2 image
selects a column named `pain` that no longer exists and fails on every
workout and log read — **a rename is NOT rollback-safe across the tag**,
unlike PR 1. The PR body's rollback row says so, and the mitigation is the
same one this repo already uses for enum widenings: roll forward, or
re-run the rename in reverse by hand. The antagonist delta pass attacks
this row specifically.

**localStorage** (client-owned stored shapes, each with a one-release
fallback read that is deleted in PR 3):

| Key | Old field | New field |
| --- | --- | --- |
| Today per-type filters | `painLevels` | `effortLevels` |
| Library filters | `painLevels` | `effortLevels` |
| Log draft (`logDraft.ts`, `draft.ts`) | `pain` | `effort` |
| Builder draft | `pain` | `effort` |

Each parser reads `effort*` first, falls back to `pain*`, and writes only
the new key. A draft mid-session at update time is the case that matters
(Phase WU's ruling on persisted unions applies: a rower mid-session loses
nothing).

### 4.3 API dual-field (the compat contract)

- Every response that carried `pain` carries **both** `pain` and `effort`
  with the same value (workouts, workout detail, recent logs, log detail,
  the post-save log echo).
- Every write that accepted `pain` accepts **either** key. If both are
  present and unequal, **400** with `field: "effort"` — the inputs are
  allowed to be redundant, never to disagree (CLAUDE.md, "name the
  authority ... define and test disagreement"). `painError` becomes
  `effortError` with the message "effort must be an integer 1..5 or null";
  the `pain`-keyed path reports the same message under `field: "pain"` so
  an old client's error handling is unchanged.
- The store layer speaks only `effort`; the dual-field is a route-layer
  concern in `data.ts`, one adapter in, one adapter out, so PR 3 deletes
  it in one place.

### 4.4 Domain, client, content

- Types: `WorkoutInput.effort`, `SuggestPrefs.effortLevels`,
  `validate.ts` ("effort must be 1..5"), `bulk.ts` ("invalid effort").
- Pace-ref rename, TS only: `Effort` → `PaceWord`, `EffortRef` →
  `PaceWordRef`, `effortSpoken` → `paceWordSpoken`. The `effort` property
  on `PaceWordRef` keeps its name — it is the stored JSON key. A code
  comment on the type says exactly that, so the next agent does not "fix"
  it.
- Components: `PainBar` → `EffortBar`, the classification card's pain
  picker (inline in `ClassificationCard.tsx`; the `PainPicker.tsx` its
  comment names does not exist) → effort picker, CSS `--pain-*`/`.pain-*` → `--effort-*`/`.effort-*` (grep both
  directions after, recurring failure 5). `LogRow`'s "3/5",
  `storedSummary`'s `HELD · PAIN 3/5 · LIKED`, both filter sheets' PAIN
  group label, `WorkoutDetail`, `PostWorkoutSummary`, `LogSession`,
  `TimerRuler`: the word becomes EFFORT. Word list, complete, for Gate 0:

  | Where | Before | After |
  | --- | --- | --- |
  | Filter sheets, both | `PAIN` | `EFFORT` |
  | Stored summary line | `HELD · PAIN 3/5 · LIKED` | `HELD · EFFORT 3/5 · LIKED` |
  | Classification card word row | pain words (unchanged words) | same words under EFFORT |
  | Bulk header help | `title \| TYPE \| difficulty \| pain` | `title \| TYPE \| effort` (already from PR 1) |
  | Article title/slug | "The pain scale, without a heart rate monitor", `/news/pain-scale` | "The effort scale, without a heart rate monitor", `/news/effort-scale` |
  | Picking-a-workout link | "pain from 1 to 5" | "effort from 1 to 5" |
  | Every `aria-label` carrying "pain" | | "effort" |

  The five level words (Motion, Work you could keep doing, Comfortably
  hard, Hard intervals, All out) do not change.
- Article: `/news/pain-scale` becomes `effort-scale`; the old slug
  resolves to the same article (a redirect entry in `articles.tsx`, since
  release-note history links to the old path). The second paragraph is
  rewritten as a positive definition ("This scale is effort, not injury.
  Sharp, sudden ...") rather than a disclaimer. Copy is presented in the
  PR, no capture.
- Tooling: `library-moves.ts`, `SKILL.md`, e2e seeds and helpers.

## 5. PR 3 — drop compat (after the next tag ships)

Waits until the tag that carries PR 1 and PR 2 has been on TestFlight and
every household device is on it (James confirms; the release ledger
records the tag). Then, one PR:

- Migration: `ALTER TABLE workouts DROP COLUMN difficulty; DROP TYPE
  difficulty; ALTER TABLE preferences DROP COLUMN difficulties;`
- API: `difficulty` and `difficulties` leave the responses and are
  rejected like any unknown field; `pain` leaves every response and the
  `pain`-keyed write path is deleted.
- localStorage: the four fallback reads in §4.2 are deleted.
- Bulk grammar: the 4- and 5-field legacy headers are **kept** — they
  cost nothing and James's pasted blocks live outside the app. Stated
  here so PR 3 does not "tidy" them.

PR 3 is TRIAD (stored shape) and gets a PM final gate; the antagonist
skips ("inherits phase ground; the anchor pass attacked the drop
sequence"), spoken in the PR body.

## 6. Exit criteria

1. `grep -rniE "difficult|\bpain\b" app/domain app/server app/src app/e2e`
   returns only: release-note history, the PR 3 compat paths (until PR 3),
   and the `{effort: "max"}` comment. Run in the phase-close gate and the
   output pasted.
2. Both filter sheets, `WorkoutRow`, `ClassificationCard`, `LogRow` and
   the article render with EFFORT; `pnpm e2e` and `pnpm screenshots`
   green with refreshed captures.
3. A pre-PR-1 web build (checkout of `v0.38.1`, `pnpm build`) served
   against a post-PR-2 server loads Library, Today and the Log and saves a
   log with `pain: 3`, which reads back as `effort: 3`. This is the
   dual-field's only real test and it runs once, by hand, before PR 2's
   ready comment; the PR body records the commands.
4. Seed still passes `variety.test.ts` and the archetype ratchet.
5. `DEVIATIONS.md` rows 34, 35, 37 reconciled; `SKILL.md` updated; the
   phase ROADMAP section becomes one ledger row and this spec's body moves
   to `docs/history/`.
6. Release notes name the change in rower words: "EASY / MEDIUM / HARD is
   gone; the effort figure (formerly pain) is the one scale."

## 7. Risks the anchor pass should attack first

- §3.3's claim that an old Today throws on a missing `difficulties`: read
  `Today.tsx:900` and `suggest.ts:295` on `v0.38.1` and confirm or refute
  before the compat decision is trusted.
- §3.5's three-count header disambiguation: a title containing `|` was
  never legal; confirm `bulk.ts` rejects it today rather than splitting it.
- §4.2's rollback row: is there any deploy path that rolls the image back
  without the operator knowing? (`docs/deploy.md`.)
- §4.3 disagreement rule: does any current client ever send both keys?
  (It cannot — no client knows `effort` yet — but the test must exist.)
- Whether the number changes anywhere: grep every consumer of the figure
  (`suggest.ts`, `validate.ts`, `bulk.ts`, the stores) and confirm each is
  a pass-through or a 1..5 bound; no threshold may hide behind the word.
