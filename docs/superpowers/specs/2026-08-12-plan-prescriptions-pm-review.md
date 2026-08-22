# PM holistic review: plan prescriptions (spec rev 2 + the 6-task plan)

Reviewer: product manager lens. Read: the spec (473 lines), the plan (665 lines),
`ROADMAP.md`, and the real code — `app/domain/plans.ts`, `app/domain/suggest.ts`,
`app/src/today/Today.tsx`, `app/src/plan/Plan.tsx`, `app/src/api/usePlan.ts`,
`app/server/routes/data.ts`, `app/server/db/schema.ts`, `app/server/seed/seed.ts`,
`app/server/stores/workouts.ts`, `app/server/stores/logs.ts`,
`app/src/session/draft.ts`, `app/domain/plans.test.ts`, `docs/design/README.md`,
`docs/design/DEVIATIONS.md`, `.husky/pre-commit`.

Nothing here is built. Every claim below is against the branch as it stands.

---

## 1. Verdict

**It needs to shrink, and one task needs to be deleted outright.** The core of
this feature is small, well-reasoned and worth shipping: a plan checkpoint
should pin its own test, and the `"TEST"` plan code is genuinely the wrong
shape. But rev 2 was written after two antagonistic reviews, and it absorbed
their findings by *adding* — a second caller, an extra resolver layer, a
context object with a field no producer reads, a precedence ladder for tiers
that do not exist, and finally a database migration for a screen that has no
design, no phase and no consumer. Three of those exist to serve James's
bullets 2, 3 and 4, which he has now explicitly assigned to later phases.

Ship **four tasks**, not six: (1) plan days carry their prescription and the
`"TEST"` code retires, with the ref lookup; (2) `suggest()` pins a prescribed
entry; (3) the Today screen and the Plan screen wire it; (4) the rename, its
seed migration, and the proof (e2e + screenshots + design-doc reconciliation).

That is roughly 60% of the written plan's product surface and about half its
review cost. It delivers James's bullet 1 completely, leaves bullet 2's seam
genuinely prepared (the authored-data shape is the part worth keeping), and
foreclose nothing that bullets 3 and 4 will need — see §5, where I test that
claim rather than assert it.

Two independent facts drove the shrink, and both contradict the spec: the
second suggestion caller the spec calls non-optional has **zero product
consumers**, and Task 6's data-capture argument names the **wrong two columns**
while understating its client cost by an order of magnitude.

---

## 2. Cut list

### CUT 1 — Task 6 in full: `suggested_title` / `suggestion_taken` on `session_logs`

**What it is.** Two nullable columns, a generated migration, `POST /api/logs`
accepting both, the logs store's insert shape, and `LogSession.tsx` sending
them. Capture only, no UI (plan lines 620-665, spec §11b).

**Which bullet it serves.** Bullet 3 ("users want to know when they over-rode a
suggestion when looking back historically"). Nothing else. It is the only part
of the plan that serves bullet 3 at all, which is the tell: it is a whole
different feature wearing this one's clothes.

**Concrete cost of keeping it now.**

- A migration on `session_logs`, the one table every log write touches, for a
  field with no reader anywhere in the app.
- A permanent one-way door. `CLAUDE.md`: "API changes additive-only between
  tags." Once `POST /api/logs` accepts `suggestedTitle`/`suggestionTaken`,
  neither can be removed before the next tag, and a shipped iOS build may be
  sending them. The repo already carries two rows in
  `docs/design/DEVIATIONS.md` (52-54) about exactly this outcome:
  `preferences.pace_tolerance_seconds` and `preferences.accent_color` are real,
  validated, persisted columns "read by nothing client-side", kept only because
  "removing the columns would need a destructive migration for fields a shipped
  iOS build may already be sending, for no gain."
- **The client half is not one file, and the plan's own Step 5 half-suspects
  it.** `SessionDraft` (`app/src/session/draft.ts:30-41`) is a versioned
  localStorage record (`v: 1`) with no field for a suggestion, and it is what
  carries a session from Today through Confirm, Countdown, Timer, Complete and
  into Log. `buildDraft` has entry points that never see Today's suggestion at
  all (Library, `WorkoutDetail`, `BaselineCard`, `useStartWorkout`), and the
  manual log door bypasses the draft. So delivering a non-null
  `suggested_title` means threading a new field through a versioned offline
  record that the "Offline" locked decision protects, across four entry points,
  for a value most of them cannot know.
- **The result would be a history full of holes**, which is the worst possible
  outcome for an argument whose entire force is "you can never backfill this."
  You would ship the migration and still not have the history.

**Now test §11b's own argument, because it is the one place the spec argues for
urgency.** §11b says: "the screen can be built whenever, but the data cannot be
backfilled." That is **half true, and it points at the wrong columns.**

- For a **plan checkpoint** — the case this whole feature is about —
  `suggestion_taken` is *fully derivable retrospectively*, because the
  prescription is authored, deterministic data: plan key plus session index
  gives you the exact prescribed title, forever. The only thing a log is
  missing is **which plan day it was**. Compare it to `workout_title`, which is
  already stored, and you have an exact answer.
- For the **ordinary** suggestion (shuffling away from a plain suggestion,
  which §11b argues is "arguably the more telling signal") it is genuinely
  non-derivable: `suggest()` depends on the account's preferences and every
  entry's `lastDoneDaysAgo` *at that instant*, and both move.

So the irreducible datum is not `suggested_title`. It is **which plan day the
log belonged to** — and that one is nearly free, because the **server already
knows it at save time and does not need the client at all**:
`createLogsStore.create` (`app/server/stores/logs.ts:93-113`) already runs the
log insert and the `plan_state` upsert inside one transaction. Stamping
`plan_key` and `done_n` on the row is a migration plus about six lines in a
handler, with **no client change, no draft change, no API contract change**.
And Phase 8's own first bullet ("Logged sessions appear on the calendar") needs
exactly that column pair anyway.

**Concrete cost of deferring.** For the checkpoint question: **zero** — it is
derivable from `plan_key`/`done_n`, which Phase 8 wants regardless. For the
free-form "what would the other suggestion have been": you lose those days
permanently. Accept that. You cannot capture it honestly today without the
draft work above, and a column that is null for most rows does not answer the
question either.

**Recommendation.** Delete Task 6. If James wants capture-now, ship the
server-only `plan_key`/`done_n` stamp instead — cheaper, no client work, no API
change, answers the checkpoint question exactly, and Phase 8 needs it. Put it
in Phase 8B (§4), not in phase 1.

---

### CUT 2 — Wiring `GET /api/today` (spec §5; half of plan Task 4)

**What it is.** The spec's headline correction from the engineer review:
"**Ruling: wire both.**" `GET /api/today` resolves the prescription
independently, plus its own server tests.

**Which bullet it serves.** None. It serves an internal consistency goal.

**The spec's justification does not survive contact with the code.**

- `grep -rn "api/today"` across the repo returns **only server test files**
  (`app/server/routes/data.test.ts`, `app/server/routes/isolation.integration.test.ts`)
  and the route's own definition at `data.ts:910`. **No product code calls it.**
  The web client computes its suggestion locally (`Today.tsx`'s
  `computeSuggestion`, line 209).
- §5's reason is "Native-first makes this non-optional: the iOS client may hit
  that route directly." The iOS client **is the same React client**. `app/ios/`
  is a Capacitor shell with three Swift files (`AppDelegate.swift`,
  `Package.swift`, `CapApp-SPM.swift`) and no API client. `ROADMAP.md`'s own
  standing rule on serving topology records that "dropping web or rewriting in
  Swift was evaluated and rejected."
- §5 calls a checkpoint served by that route "this feature's own bug,
  reproduced on a route that already ships wired." **The route already cannot
  reproduce the screen's suggestion and never could**: it has no `todayPickId`,
  no `swapType`, and it deliberately omits `lastDone`/`source`
  (`data.ts:979-983`, with a comment explaining why). Wiring the prescription
  into it would not make the two agree; it would fix one of four divergences on
  an endpoint nobody calls.

**Cost of keeping it now.** A second wiring site, its own server tests, and —
the expensive part — it is the *sole* reason `PrescriptionContext.date` has to
be optional and the sole reason the extra resolver indirection exists at all
(see CUT 3). It also makes Task 4 a two-surface task, which is what pushes the
plan to six.

**Cost of deferring.** On 3 days out of 84, an endpoint with no consumers
returns a different workout than the screen. Note the `PlanCode` →
`WorkoutType` change at `data.ts:6` and `:934` still has to land in phase 1 for
the code to compile; only the prescription wiring is cut.

**If James wants the route consistent anyway**, that is a legitimate call — but
then it should be scoped honestly as "keep a currently-unused endpoint
truthful," not as "native-first makes this non-optional."

---

### CUT 3 — `prescriptionForToday`, `PrescriptionContext`, and the `date?` field

**What it is.** Spec §3.2: a resolver wrapping the plan producer, taking a
context object carrying `plan`, `sessionIndex` and an optional `date`. The spec
calls it "THE one resolution point."

**Which bullet it serves.** Bullet 4 (other suggestion types with a precedence
hierarchy). It is pure preparation.

**Why it collapses once CUT 2 lands.** The spec's entire argument is: "when a
second producer arrives it is added HERE, inside one function that already
exists, rather than at two call sites that would each have to invent
precedence." With one caller, there are no two call sites. Adding a producer
means editing one file. The wrapper's own doc comment admits what is left:
`prescriptionForToday` is "today just a call to" `planPrescription`.

The `date` field is worse: it is a field with no producer, added because "an
app-produced date-specific suggestion is a likely near-term feature." That is
the exact species this repo has already recorded twice as a defect — the two
dead preference columns in `DEVIATIONS.md:54`, and `toleranceRange()`, which
was **deleted** after "a repo-wide search found no reader of `.lo`/`.hi`
anywhere, past or present" (`DEVIATIONS.md:52`).

**Cost of keeping.** Two extra exported symbols, an interface, a fourth test
`describe` block, and a field the plan's own tests can only assert the absence
of. Small in lines; it is the *conceptual* cost that matters — it makes the
feature read as an extensibility framework rather than "checkpoints pin their
test," which is how a small feature ends up with a six-task plan.

**Cost of deferring.** Adding a field to an interface at one call site later:
two lines. Nothing is foreclosed (see §5, which probes this specifically).

**Recommendation.** Phase 1 exports `planPrescription(plan, i)` and
`resolvePrescribed(ref, workouts)`. Today calls both. When a second producer
becomes real (Phase 8C), *that* phase introduces the resolver and the ladder,
with an asserting test, because it will then have two tiers to order.

---

### CUT 4 — the ladder's tiers 2 and 3 as *code-adjacent* commitments

Keep §4's ladder as **recorded prose** (it is a real James ruling and costs
nothing to write down). Cut it from the implementation's vocabulary: the
`prescriptionForToday` doc comment describing a precedence order that has one
tier, the "tier 1 over tier 3" test name, and the framing that a displaced
lower tier is "dropped." Phase 1's real behavior is one sentence: *a live pick
beats the plan's prescription* — which is already true because `todayPickId`
is checked first. Test that; name it that.

The ladder also needs re-litigating before it is built at all. See §5, risk 2.

### Not cut, deliberately, though I looked hard at each

- **`PlanDay { type, prescribe? }`** (spec §3.1). This is the one piece of
  "seam" that is load-bearing and nearly free: it makes the checkpoint
  *authored data* instead of a hardcoded index switch, and it is the field a
  Phase 8C authoring UI writes to. A cheaper variant exists (keep
  `sessions: WorkoutType[]`, add `CHECKPOINT_INDICES` plus a per-plan
  constant), and it would work — but the ripple that makes this change
  expensive is retiring `"TEST"`, not the object wrapper, and doing the wrapper
  now avoids paying the same ripple twice. Keep.
- **`globalOnly` on `PrescribedRef`.** Encodes the 2026-08-09 final-review
  ruling that a rower's own workout sharing a designated title must not be
  hijacked. One boolean, two tests. Keep.
- **`kind: "title"` as a one-member union.** I was going to cut it; §5, risk 3
  changed my mind — it is the one part of the seam with a *proven* future
  consumer. Keep, and stop discussing it.
- **The rename and reclassification.** James's explicit ask #5, and "First 2k"
  on session 35 of an 84-session plan is actively wrong copy. Keep, with the
  seed-migration caveat in §6.7.

---

## 3. Keep list

Phase 1 is not worth shipping without all four of these.

1. **The checkpoints stop suggesting a random TR workout.** This is the whole
   feature and the actual bug: `suggest.ts:187` maps `todayCode === "TEST"` to
   `matchType: "TR"`, while both suggestion builders exclude the two designated
   test workouts (`Today.tsx:940-941`, `data.ts:953-954`). So the three days
   whose only job is re-measuring the baselines that every other workout's
   targets resolve against currently surface a random interval session. Cannot
   wait: it is live, it is wrong, and every AT/O2 target in the app depends on
   those measurements being taken.

2. **`"TEST"` retires; checkpoint days carry a real `WorkoutType` plus their
   prescription.** Cannot wait, because it is what makes item 1 expressible.
   Every consumer currently has to answer "what type is a TEST day?" and they
   answer separately (`suggest.ts:187`, `Today.tsx:770-775`,
   `Plan.tsx:24-37`'s `CODE_COLOR_VAR`/`CodeBadge`, `tokens.css`'s
   `--type-test`). Verified independently: all six checkpoint slots currently
   hold `O2`, so overwriting them with AN (sprint) / AT (head) yields sprint
   34/23/14/13 and head 41/24/11/8, both keeping the pinned O2 > AT > TR > AN
   pyramid. Numbers re-derived from the real presets; §6.6 has the one
   discrepancy.

3. **`suggest()` pins the prescribed entry with filters bypassed, above the
   empty-pool return.** Cannot wait: without the bypass, the honest `hard` /
   `pain 5` classification this same change introduces would let a rower's own
   preferences hide their checkpoint, and without the ordering an account with
   no AN workouts reads "No AN sessions in your library." on the one day that
   matters most. The `sorted.length === 0` return at `suggest.ts:204-211` fires
   off the type-matched pool alone, so the spec's ordering rule is real and its
   named test earns its place.

4. **The rename, its seed migration, and honest classification.** Cannot wait
   on two counts. The classification (`2K Test` AN/hard/5, `6K Test` AT/hard/4)
   is what makes a checkpoint day's *type* coherent, and it is only safe
   *because* of item 3. The migration cannot wait either: `seedGlobalLibrary`
   converges by title and DELETEs a title missing from code
   (`seed.ts:79-89`), and `session_logs.workout_id` nulls via
   `ON DELETE SET NULL` (`schema.ts:97-99`), so a bare rename breaks the
   workout link on any log already recorded against "First 6k"/"First 2k".
   Same task or no rename.

Plus, inside those four: the Plan screen keeps a visible checkpoint marker, the
`--type-test` token and `CodeBadge` die together (recurring failure #5), and
**three** design documents get reconciled, not one (§6.5).

---

## 4. The phasing

House format read from `Phase 6I`, `Phase 8`, `Phase CL2`, `Phase FF`:
`## Phase X — Title`, `**Status:**`, `**Goal:**`, optional
`**Design authority:**`, `- [ ]` epic-level items with a short bold lead-in and
occasional `**S**`/`**M**` sizing, then `**Exit:**`.

**On identifiers.** Phase 8 ("Plan & Progress") is Not started and is exactly
this territory: plan data, the plan screen, and "Test history list on **You**;
test-type sessions prompt a baseline update" — which is *what a checkpoint
produces*. So split Phase 8 the way 5A-5H, 6A-6J and 7A-7D already split, and
keep the number: **8A** is the checkpoints, **8B** is Phase 8's existing
content unchanged, **8C** is James's bullet 2. Bullets 3 and 4 do not earn
phases; they go under "Triggered follow-ons," where the file already keeps
honest "not scheduled, here is the trigger" work. This costs one renumbering
edit and puts prescriptions where a reader would look for them.

Paste-ready, replacing the current `## Phase 8 — Plan & Progress` heading:

```markdown
## Phase 8A — Plan checkpoints

**Status:** Not started. Spec and plan drafted 2026-08-12 on `test-days`
(execution parked); this section is the scoped-down phase-1 slice of that
draft, and the draft's own §5, §11b and `date?` context field are
deliberately NOT in it.
**Goal:** The three plan checkpoints suggest their own test instead of a
random interval session, and the plan's `"TEST"` code retires in favour of
plan days that carry authored data.

- [ ] **The `"TEST"` code retires.** `PlanDay { type, prescribe? }` replaces
      the `PlanCode = WorkoutType | "TEST"` union at every call site
      (`domain/plans.ts`, `server/routes/data.ts`, `src/api/usePlan.ts`,
      `src/session/LogSession.test.tsx`); each checkpoint index becomes a day
      of a real type carrying its own prescription (sprint: AN + the 2K test,
      head: AT + the 6K test). `Plan.tsx` drops `CODE_COLOR_VAR` and its local
      `CodeBadge` for the shared `TypeBadge`, keeps a visible checkpoint mark,
      and `--type-test` goes with its last consumer. Tallies move to sprint
      34/23/14/13 and head 41/24/11/8, both keeping the pinned pyramid and the
      run/bias invariants. **M**
- [ ] **The prescription's lookup, in `domain/`.** A ref (title plus
      `globalOnly`) and one shared resolver that finds the designated GLOBAL
      row and never a rower's own workout that happens to share the title. A
      test asserts every authored ref in `PLANS` resolves against
      `GLOBAL_LIBRARY_SEED`, so authored content that names a missing workout
      fails CI instead of degrading quietly. **S**
- [ ] **`suggest()` pins a prescribed entry.** Its reason is authored with it;
      every preference filter is bypassed (a checkpoint is not a suggestion
      from a pool); a live pick still wins; and the prescribed branch sits
      ABOVE the empty-pool early return, so an account with none of the day's
      own type still gets its checkpoint. **S**
- [ ] **Today wires it, and the type-swap chips get a ruling.** The screen
      resolves the prescription against the UNFILTERED library, and a rower
      who swaps the day's type away from the checkpoint's own gets a decided,
      tested behavior rather than a chip that silently does nothing. SHUFFLE
      stays the escape, and the case where the day's pool is too small for
      SHUFFLE to be enabled is decided, not discovered. **M**
- [ ] **The rename, migrated.** `First 6k`/`First 2k` become `6K Test`/`2K
      Test` (a deliberate break from the library's poetic-name convention:
      these two are instruments, not sessions) and are reclassified honestly
      (2K: AN/hard/pain 5, 6K: AT/hard/pain 4). The seed converge gains a
      one-time legacy-title map applied BEFORE its delete pass, so an existing
      row is renamed in place and keeps its id: without it the converge deletes
      the old title and every log recorded against it loses its workout link.
      **M**
- [ ] **Proof and pixels.** A plan advanced to its first checkpoint shows the
      test, can START it, and SHUFFLE escapes; the checkpoint card is captured
      with real data and looked at; `docs/design/README.md`'s TEST colour-table
      row and its `TEST → treated as TR` line, plus the `DEVIATIONS.md` row
      that cites `--type-test`, are all reconciled with what shipped. **S**

**Exit:** On session 7 of the sprint plan the card reads `2K Test` with a
checkpoint reason, START runs it, and SHUFFLE escapes to an ordinary AN
session; the head plan shows the 6K where sprint shows the 2K; a rower whose
library holds no AN workout still gets their checkpoint; and no `"TEST"`
string survives in plan data, the Plan screen, or the token file.

## Phase 8B — Plan & Progress

**Status:** Not started
**Goal:** See where you are in the 84-session plan and whether you're getting
faster.

- [ ] Plan screen gains a month calendar with type marks, ALL/TO DO/DONE
      filters, and a legend (session rows: done sorted below upcoming; today
      highlighted) — layered onto the sequence list Phase 6A already built at
      `/plan`, not a new screen
- [ ] **Stamp each log with the plan day it belonged to** (`plan_key`,
      `done_n`, nullable, server-side only): the calendar needs it to place a
      row, and `createLogsStore.create` already reads and upserts `plan_state`
      inside the log's own transaction, so it costs a migration and a handful
      of lines with no client or API-contract change. It is also what makes
      "did I take my checkpoint?" answerable retrospectively at any later
      date, since a prescription is authored, deterministic data. **S**
- [x] ~~Plan management: preset selection (2000 m sprint / 5–6 k head race),
      reset-to-session-1~~ — **delivered early in Phase 6A**
- [ ] ~~Progress screen: 2k/6k test trend bars…~~ — **superseded by Phase 6J**
- [ ] Test history list on **You**; test-type sessions prompt a baseline
      update. Sequencing: 8A is what makes a test session reachable from the
      plan at all, so it lands first.

**Exit:** Logged sessions appear on the calendar and in every chart; a logged
2k test can update the 2k baseline through the staged-confirm flow.

## Phase 8C — Rower-authored prescriptions

**Status:** Not started. Unscoped: brainstorm before sizing.
**Goal:** A rower can pre-plan their own routine, reserving a specific
workout in advance, and the app suggests it when that day comes.

- [ ] Brainstorm first. Open questions to settle there: is a reservation keyed
      to a DATE or to a plan session index (Phase 8A's producer is
      index-keyed, and `done_n` advances per logged session with no calendar
      awareness, so these are genuinely different features); does a
      reservation survive a plan switch or reset, both of which zero
      `done_n`; and what a rower sees on a day where their own reservation
      and a plan checkpoint both apply.
- [ ] The precedence hierarchy, re-decided against a real second producer.
      The draft spec records "rower wins all → a theoretical date → plan
      prescription" with a displaced lower tier simply dropped. That was
      decided in a session with no reservations in it, and the losing case is
      a rower who reserves a workout on a checkpoint day and silently loses
      the measurement every other workout's targets resolve against. Revisit
      before building. **M**
- [ ] Refs by id, not title. A reservation of the rower's OWN workout cannot
      be identified by title: titles are user-editable and there is no
      uniqueness constraint in `server/db/schema.ts`, so a rename would
      silently break a reservation. 8A's ref already carries a `kind`
      discriminant for exactly this. **S**
- [ ] The escape verb. A checkpoint is escaped by SHUFFLE, an ephemeral
      per-day pick that returns on reload. A reservation the rower made must
      be CANCELLED instead, which needs a persisted, server-side channel that
      `todayPick`'s localStorage record cannot provide. **M**
- [ ] Multiple options for one day ("A or B"), if the brainstorm wants it.

**Trigger:** James asks, or a second rower asks. **No demand has been
observed** — this exists because James said in the 2026-08-12 session that he
"may one day" want it, and the honest record is that the seam is prepared and
the feature is not scheduled.

**Exit:** A rower reserves a specific workout for a future day, sees it
suggested when that day arrives, and can cancel it without shuffling.
```

And two additions to `## Triggered follow-ons`:

```markdown
- **"Which days did I override, and what was the other suggestion?"** (James,
  2026-08-12, during the plan-prescriptions design). Two different questions
  wearing one sentence. The CHECKPOINT half needs no new capture at all once
  Phase 8B stamps `plan_key`/`done_n` on each log: a prescription is authored,
  deterministic data, so "did they take their checkpoint?" is computable at any
  later date from the log's own `workout_title`. The FREE-FORM half — what the
  ordinary suggestion would have been on a day the rower shuffled away — is
  genuinely not backfillable, because `suggest()` depends on the account's
  preferences and every entry's recency at that instant. It also is NOT one
  column: the suggestion in force lives on Today, and reaching the save
  requires a new field on the versioned `SessionDraft` localStorage record
  plus every `buildDraft` entry point that never sees Today at all (Library,
  WorkoutDetail, BaselineCard, the manual log door). Priced accordingly, and
  deliberately not smuggled into a checkpoint phase as "two nullable columns."
  **Trigger:** James wants the retrospective screen, not the column. Then:
  design the screen first, and let it say which of the two questions it is
  actually asking.
- **A third prescription producer and a real precedence hierarchy** (James,
  2026-08-12, bullet 4). Phase 8A ships one producer (the plan) called from one
  place, so precedence is a comment, not a mechanism. **Trigger:** a second
  producer becomes real (Phase 8C's reservations are the likely first). Then:
  introduce the resolver that orders them, with an asserting test, and settle
  what a displaced tier does — see 8C's own re-decide item.
```

---

## 5. Sequencing risks

Things phase 1 must get right even though they ship later, with the mechanism
named. I probed the two places the brief pointed at and found one real
foreclosure, one non-issue the spec over-worries, and one product decision that
should be re-opened.

**Risk 1 (real, and it is a data risk, not an architecture risk): titles
cannot identify a rower's own workout.** §12 admits there is no uniqueness
constraint in `server/db/schema.ts`, but it frames this as a multi-author
concern. The sharper version: workout titles are **user-editable**. A phase-8C
reservation stored as `{kind: "title", title: "Sea Fret"}` breaks silently the
moment the rower renames Sea Fret, and nothing in the system would notice —
`resolvePrescribed` returns null and the day degrades to an ordinary
suggestion, which is exactly the "quiet degradation" §6 says is wrong for
authored content. This is the one thing in the seam with a proven future
consumer, and it is why the `kind` discriminant should stay in phase 1: adding
`{kind: "id"}` later is then a branch in one function, whereas a bare
`{title, globalOnly}` shape means phase 8C migrates a stored record. Phase 1's
own refs are fine as titles (authored constants, resolved against the seed,
pinned by a test) — the constraint is only that **nothing user-authored is ever
stored as a title ref.** Write that down.

**Risk 2 (a product decision, not a technical one): the ladder's tier 2 > tier
3 was decided on the wrong example, and phase 1 should not bake it into
anything.** §4 records "rower wins all → a theoretical date → plan
prescription," with a displaced lower tier "dropped, no note, no
carry-forward." The example that justified it is SHUFFLE, where dropping is
obviously right. But the mechanism it describes applies to a case nobody tested
it against: a rower reserves a workout for the day that happens to be a
checkpoint, and silently loses the 2K test. That is not a symmetric loss.
Baselines are the app's measurement substrate — `estimateMinutes`, every
resolved target split, every AT/O2 pace ref resolves against 2k/6k pace — so a
skipped checkpoint means the app keeps prescribing targets from a stale
number, and the rower is never told. The `test_history` feature already in the
codebase (`server/db/schema.ts:168`, `PUT /api/baselines`'s `isTestResult`
branch at `data.ts:402-414`) exists precisely because those measurements are
tracked as a series. **Phase 1's correct action is to record the question, not
the answer**, and to keep the ladder out of code (CUT 4) so 8C is free to
decide differently without editing a doc comment that claims otherwise.

**Risk 3 (spec over-worries this one): the `date?` seam forecloses nothing.**
§12 argues the context object earns the field because a date-keyed producer is
then "a pure drop-in." Tested: `PrescriptionContext` is consumed by one call
site in one file. Adding a field to a TypeScript interface and passing it at
one call site is a two-line change with zero migration and zero stored data.
The genuine foreclosure for date-keyed work is elsewhere and the spec already
found it: `done_n` advances per logged session with no calendar awareness
(`logs.ts`'s upsert, `data.ts:934`'s `sequence[min(doneN, …)]`), and a plan
switch or reset zeroes it. That is a **data model** fact, unaffected by whether
an interface has an optional string today. Cut the field.

**Risk 4 (must be decided in phase 1 because it changes shipped behavior): the
type-swap chips.** Not a later-phase risk — a phase-1 hole. `Today.tsx:947`
computes `todayCode = overrides.swapType ?? prescribedCode`, and swapType only
changes which *pool* `suggest()` runs against. With the plan's Task 3 branch
(`if (prescribed && !livePick) return …`), a rower on session 7 who taps the O2
chip still gets `2K Test`. `docs/design/DEVIATIONS.md:43` records the chips as
a James-ruled control that "override[s] the day's prescribed type before
`suggest()` runs" — so phase 1 would silently break a documented, shipped
behavior on 3 days out of 84. Needs a ruling before Task 3 is written: either a
swap away from the checkpoint's own type clears the prescription (my
recommendation: a swap is the rower acting now, which is tier 1 by James's own
ladder), or the chips are disabled on checkpoint days with a reason. Either is
defensible; discovering it mid-build is not.

**Risk 5 (phase 1, cheap to get right, expensive to notice later): the legacy
rename map has no removal trigger and one silent failure mode.** Two things.
(a) `LEGACY_TITLE_RENAMES` is permanent code the moment it lands, with nothing
recording when it can go; give it a triggered follow-on ("once every deployed
environment has booted past the rename"). (b) The failure mode: `contentEqual`
(`seed.ts:19-33`) compares type, difficulty, pain, sortOrder and steps — **not
title**. So an implementation that merely re-keys `byTitle` and leans on the
existing `updateGlobal` path works *this* time only because the content is also
changing (O2→AT, easy→hard, pain 2→4). A future pure rename would match
`contentEqual`, skip the update, and never rename. `updateGlobal` does write
title (`server/stores/workouts.ts:188`), so the fix is either an explicit title
update in the rename branch or adding title to `contentEqual`. The plan's three
seed tests would all pass without noticing, because they only exercise this
rename.

---

## 6. Where the spec is wrong or overconfident

Ordered by consequence.

**6.1 — Plan Task 1 cannot be committed as written; the task split is
impossible.** Task 1 creates `prescription.ts` and a test that constructs
`PlanPreset` as `{ key: "test-preset", title, sessions: [{type:"O2"},
{type:"AN", prescribe: …}] }` (plan lines 88-92), then Step 4 says "verify
green" and Step 6 commits. But until Task 2 lands, `app/domain/plans.ts:5-9`
declares `key: "sprint" | "head"` and `sessions: PlanCode[]`. Vitest transpiles
through esbuild without typechecking, so the test may well *run* green — and
then `.husky/pre-commit` runs `pnpm --dir app typecheck` project-wide and
blocks the commit. The plan's own "Note on import direction" (line 64) spots
the type-only cycle and misses this. Note also that the spec's §3.1 shows
`key: string` while the real code has the narrow union, so the widening is an
unstated part of the change. **This is recurring failure #10's exact third
example, "a task split that was impossible because a type change forces
compilation coupling."** Fix: land the types with the plan data in one task,
and put `Prescription`/`PrescribedRef` in `domain/types.ts` alongside
`WorkoutType` (the plan already names this as its cycle fallback) so nothing in
`prescription.ts` imports `PlanPreset` at all.

**6.2 — §5's justification for the second caller is factually wrong.** "Native-
first makes this non-optional: the iOS client may hit that route directly."
There is no separate iOS client: `app/ios/` is a Capacitor shell (three Swift
files, no API client) over the same React build, and `ROADMAP.md`'s
serving-topology rule records that a Swift rewrite was evaluated and rejected.
`grep -rn "api/today"` finds the route's definition and *only test files* — no
product consumer. Additionally, §5 calls a mis-suggested checkpoint on that
route "this feature's own bug, reproduced on a route that already ships wired,"
but the route already diverges from the screen in three larger ways (no
`todayPickId`, no `swapType`, `lastDone`/`source` deliberately omitted at
`data.ts:979-983`). See CUT 2.

**6.3 — The type-swap chips are absent from a 473-line spec that changes what
`todayCode` means.** Detailed as Risk 4 above. The spec touches
`effectivePrescribed`'s `"TEST" → "TR"` mapping (§10) and never notices that
the same 200 lines contain `overrides.swapType`, a shipped control with its own
`DEVIATIONS.md` row.

**6.4 — SHUFFLE, the spec's stated escape hatch, is unavailable in exactly the
case §3.3 works hardest to support.** `Today.tsx:983` sets
`canShuffle = suggestion.poolIds.length > 1`, and the SHUFFLE button is
`disabled={!canShuffle}`. In §3.3's celebrated empty-pool case, `poolIds` is
`[]`; with a single AN workout in the library it is 1. Either way SHUFFLE is
disabled and §4's "SHUFFLE is the escape" has no exit — the prescription is
inescapable from that screen. The plan's Task 3 test asserts `poolIds: []` in
the domain and no test asserts what the *screen* does with it, so this would
ship untested. (The spec is right about the related `indexOf` comment:
`Today.tsx:1009-1017`'s "indexOf never actually returns -1 here" does become
false on a checkpoint's first SHUFFLE, and the plan handles that correctly.)

**6.5 — The design-doc reconciliation list is incomplete (recurring failure
#9).** §10 names `docs/design/DEVIATIONS.md:56`. It misses two live rows in the
design authority itself: `docs/design/README.md:106`
(`todayCode = plan[doneN]  (TEST → treated as TR)`) and `README.md:139` (the
colour table's `| type TEST | #1b1a17 | 2k/6k test |`). Both describe code this
change deletes. Separately: the Plan-screen **checkpoint marker that replaces
the TEST badge has no design anywhere in `docs/design/`** — retiring
`--type-test` removes a visual distinction from a screen that has a
high-fidelity reference, and "a checkpoint stays marked, derived from
`prescriptionFor(plan, i) !== null`" specifies the predicate, not the pixels.
That needs a stated design and its own DEVIATIONS row, not a deletion.

**6.6 — §6's run-length claim is imprecise.** Independently re-derived from
`SPRINT_WEEKS`/`HEAD_WEEKS`: every other number in §6 and §8 is exactly right
(sprint raw O2 37 / AT 23 / TR 14 / AN 10 → after 34/23/14/13; head raw
44/21/11/8 → after 41/24/11/8; all six checkpoint slots hold `O2`; neighbours
as listed; sprint AN+TR front 9→11, back 15→16, margin 6→5). But "**worst case
is a run of TWO**" is false as written: head's longest same-code run after the
change is **three** (indices 12-14, `O2`), pre-existing and untouched by the
checkpoints. The invariant `plans.test.ts` pins ("never repeats one code more
than 3 in a row") still holds, so this changes no decision — it is worth
correcting because §6's whole purpose is to be the numbers a reviewer trusts
without re-deriving.

**6.7 — §11b's non-backfillable argument is half true and names the wrong
columns.** Full treatment in CUT 1. Summary: the checkpoint case *is*
derivable, the free-form case is not, and the irreducible datum is which plan
day the log belonged to, which the server can stamp with no client involvement.

**6.8 — the seed rename's silent failure mode.** Risk 5(b) above:
`contentEqual` ignores title, so leaning on the existing converge path renames
correctly here only by coincidence.

**6.9 — Two small test-quality problems the plan carries.** (a) Task 3's
`expect(s.poolIds).toStrictEqual([AN_A.id, AN_B.id].sort())` is flagged in the
plan itself as "adjust to byLeastRecentlyDone order" — alphabetical id order is
not that order, and shipping it as written is a spec-blind assertion that would
pass for the wrong reason. (b) Task 1's `prescriptionForToday` tests assert "the
contract (whatever the highest-priority producer says)" while there is exactly
one producer, so they duplicate `planPrescription`'s tests and would survive
any mutation to the wrapper except returning null. Both disappear if CUT 3
lands.

**6.10 — Naming collision, cosmetic but worth 30 seconds.** `Today.tsx` already
uses `prescribedCode` and `effectivePrescribed` for "the plan's *type* for
today." Introducing `prescribed`, `prescription` and `prescriptionForToday` for
"a specific *workout*" into the same function is a readability trap for the next
reader. Suggest `checkpointPin` / `pinnedWorkout` for the new concept, or rename
the incumbents.
