> **Archived 2026-08-28** from `ROADMAP.md` (lines 1382-1464 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 8A — Plan checkpoints (prescriptions, phase one: the plan suggests)

**Status:** SHIPPED 2026-08-22 — PR A #155 (the seam) and PR B #156 (the
rename, triad, merged LAST per ruling), both same day the phase unparked
(James: "let's do it"). Final-PR PM gate: PASS-WITH-CONDITIONS, all four
conditions landed on #156 before merge. **Still owed at the tag: the notes
PR** — three clauses (the checkpoint suggestion naming session 7 and its
six-saves cost; the rename, so old history reading `First 2k` is not filed
as a bug; the open measurement loop — update your baseline by hand on You
until the next phase closes it) join Phase WU's existing v0.16.0 entry, then
the tag is cut and **the build uploads the same day** (the installed-build
windows close at the UPLOAD, not the tag — the DB renamed at merge).
Unparked from `test-days` (spec drafted 2026-08-12, deleted after PR #154
landed the docs); the verification refresh + phase-open gates ran 2026-08-22
before implementation.
**Gates RUN 2026-08-22, both verdicts folded** (entries in both ledgers, this
PR): PM GO-WITH-CONDITIONS, antagonist delta with one blocking find. The
refresh + gate deltas and James's five rulings (same day):

- **Rulings (James, 2026-08-22):** (1) post-rename, `6K Test`/`2K Test` are
  VISIBLE in the Library (exclusion shrinks to suggestion pools only — a rower
  can voluntarily re-test); (2) the no-baseline onboarding card gets its OWN
  copy (friendlier heading) rather than rendering the instrument name;
  (3) sequencing after 8A: the baseline-update prompt ships NEXT, before the
  calendar; (4) the installed-build window on the rename is ACCEPTED — the
  rename PR merges LAST in the phase, alone, tag cut promptly, notes name it —
  no compatibility tag; (5) on a checkpoint day `Log against plan` LEADS the
  save stack — the 6I demotion rule (`PostWorkoutSummary.tsx`, keyed on
  `isOnboardingTitle`) narrows to its actual case (a baseline test on an
  account that is not at a checkpoint), or the checkpoint soft-locks: the
  non-advancing save writes `plan_key`/`plan_index` NULL and `done_n` never
  passes index 6. A green test pins the wrong behaviour by taking
  `isOnboarding` as a prop (`PostWorkoutSummary.test.tsx:883`) — the fix
  derives it.
- **PR shape:** TWO PRs. PR A = the seam (the union retires, the resolver,
  the `suggest()` pin, Today wiring + override marker, save-stack fix, proof
  and pixels) — compile-coupled, one PR. PR B = the rename + reclassification
  + Library visibility + card copy, ALONE and LAST (triad: stored rows with
  log links). Prescription refs are authored as `ONBOARDING_TITLES` CONSTANTS,
  not literals, so PR A has no dependency on PR B's titles.
- **Wire contract (antagonist B2):** `GET /api/plan`'s `sequence[].code` keeps
  its name and its bare-string shape — checkpoints serialise the day's real
  type. The prescription does NOT cross the wire in 8A (`Plan.tsx` computes
  the checkpoint mark client-side from `PLANS`). Renaming or restructuring
  that field would blank the plan line on installed builds.
- **Known-open on ship (PM):** the measurement loop — nothing records a test
  result (`isTestResult` has zero client senders) and no baseline prompt (now Phase BL)
  exists; 8A's notes say so and the next phase closes it. Checkpoints are 6
  real saves deep (`done_n` moves only via `POST /api/logs`; log deletion
  decrements, so a demo is reversible) — the release notes say that too. This section is the scoped-down phase-one slice of that draft after a
PM holistic review; the draft's §5 (wiring `GET /api/today`), §11b (the
`suggested_title`/`suggestion_taken` capture task) and its `PrescriptionContext.date`
field are deliberately NOT in it, and the review's file is the record of why.
**Goal:** The three plan checkpoints suggest their own test instead of a random
interval session, and the `"TEST"` plan code retires in favour of plan days that
carry authored data.

The prescriptions idea is phased: **8A is plan-suggested only** (a plan makes
suggestions the rower is free to ignore), **8C is rower-authored** (a rower
pre-plans their own routine), and the two questions behind "which days did I
override, and what would the other suggestion have been" sit under Triggered
follow-ons because they are two different features wearing one sentence.

- [x] **The `"TEST"` code retires.** `PlanDay { type, prescribe? }` replaces the `PlanCode = WorkoutType | "TEST"` union at every call site (`domain/plans.ts`, `server/routes/data.ts`, `src/api/usePlan.ts`, `src/session/LogSession.test.tsx`); each checkpoint index becomes a day of a real type carrying its own prescription (sprint: AN plus the 2K test, head: AT plus the 6K test). `Plan.tsx` drops `CODE_COLOR_VAR` and its local `CodeBadge` for the shared `TypeBadge`, keeps a visible checkpoint mark, and `--type-test` goes with its last consumer. Tallies move to sprint 34/23/14/13 and head 41/24/11/8, both keeping the pinned pyramid and the run/bias invariants. **M**
- [x] **The prescription's lookup, in `domain/`.** A ref (title plus `globalOnly`) and one shared resolver that finds the designated GLOBAL row and never a rower's own workout that happens to share the title. A test asserts every authored ref in `PLANS` resolves against `GLOBAL_LIBRARY_SEED`, so authored content naming a missing workout fails CI instead of degrading quietly. The ref keeps its `kind` discriminant: 8C must reference a rower's own workout by id, because titles are user-editable with no uniqueness constraint. **S**
- [x] **`suggest()` pins a prescribed entry.** Its reason is authored with it; every preference filter is bypassed (a checkpoint is not a suggestion from a pool); a live pick still wins; and the prescribed branch sits ABOVE the empty-pool early return, so an account with none of the day's own type still gets its checkpoint. **S**
- [x] **Today wires it, and the type-swap chips override it visibly.** The screen resolves the prescription against the UNFILTERED library. **James's ruling (2026-08-12):** the lit chip is the SUGGESTED workout's own type (AN on a sprint checkpoint, AT on a head one, not the `TEST → TR` stand-in that dies with this phase), and swapping to another chip OVERRIDES the prescription — the rower acting now is tier 1 by the ladder's own logic — with a visible marker that the suggestion has been overridden. The marker says overridden; it does NOT name the displaced workout (that stays ruled out, 2026-08-12). Today's plan line already renders `prescribedCode → swapType` when swapped (`Today.tsx:1050-1053`), so the design pass decides whether that arrow carries the marker or the card needs its own; either way it is a stated design with a DEVIATIONS row, not an inference. Consequence worth naming: because a swap escapes, the chips are the exit on a day where SHUFFLE is disabled (`canShuffle = poolIds.length > 1`, `Today.tsx:983`), which is the empty-or-single-pool case the prescription bypass exists to serve. **M**
- [x] **The rename, migrated.** `First 6k`/`First 2k` become `6K Test`/`2K Test` (a deliberate break from the library's poetic-name convention: these two are instruments, not sessions) and are reclassified honestly (2K: AN/hard/pain 5, 6K: AT/hard/pain 4). The seed converge gains a one-time legacy-title map applied BEFORE its delete pass, so an existing row is renamed in place and keeps its id: without it the converge deletes the old title and every log recorded against it loses its workout link. Note `contentEqual` (`seed.ts:19-33`) ignores title, so the rename needs its own write rather than leaning on the content-diff path. **M**
- [x] **Proof and pixels.** A plan advanced to its first checkpoint shows the test, can START it, and SHUFFLE escapes; the checkpoint card is captured with real data and looked at; `docs/design/README.md:106` (`TEST → treated as TR`) and `:139` (the `type TEST` colour row), plus the `DEVIATIONS.md` row citing `--type-test`, are all reconciled with what shipped. The Plan-screen checkpoint marker that replaces the TEST badge needs a stated design: retiring the token removes a visual distinction from a screen that has a high-fidelity reference. **S**

**Exit:** On session 7 of the sprint plan the card reads `2K Test` with a
checkpoint reason, START runs it, and SHUFFLE escapes to an ordinary AN session;
the head plan shows the 6K where sprint shows the 2K; a rower whose library
holds no AN workout still gets their checkpoint; and no `"TEST"` string survives
in plan data, the Plan screen, or the token file. **Added at the 2026-08-22
gate:** a pre-rename log recorded against `First 2k` still resolves to its
workout after PR B; the override marker and the Plan-screen checkpoint marker
each render (a stated design, not an absence); on a checkpoint day the save
stack leads with `Log against plan` and the saved log carries `plan_key`/
`plan_index`; the no-baseline onboarding card still renders after the rename;
and `docs/design/README.md:99-100` (the wrong `7/31/55` cadence, real indices
6/34/62 = sessions 7/35/63) is reconciled with the rest of the pixels.
