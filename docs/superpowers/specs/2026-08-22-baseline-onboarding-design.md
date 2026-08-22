# Baselines: three doors in, one measurement out

**Date:** 2026-08-22. Brainstormed live with James (visual, on the
"Baseline Onboarding" design canvas — the canvas is the pixel
reference for every screen named here). This spec RESHAPES the
"baseline-prompt phase" that the 8A phase-open gate sequenced before
the calendar: the phase now covers how a baseline ENTERS the app (three
doors) as well as how a measurement UPDATES it (the post-test prompt).

## What and why

Some people are more motivated to start rowing than to learn about
baselines. Today the only onboarding door is "row a First 6k and it
sets your baseline" — which asks a brand-new rower to understand the
baseline concept before their first stroke, and gives an experienced
rower who already knows their splits no front door at all (the editor
is buried in You). This phase gives a no-baseline account three doors,
framed by OUTCOME, not identity (James's ruling — an experienced rower
may also just want a recommendation):

1. **Recommend my baseline** — two quick questions (rowing experience,
   current cardio), then a recommended starting baseline. Works whether
   you are brand new or coming back.
2. **I know my baseline** — enter your 2k and 6k splits directly (the
   You editor's fields, brought forward).
3. **Row to find my baseline** — a relaxed 6k OR a raced 2k, the
   rower's choice (James's ruling); either time sets it.

And it closes the loop 8A shipped open: after a test session, the app
finally RECORDS the measurement — a post-test prompt offers the result
as the new baseline instead of asking the rower to remember a number
and type it on You.

## Rulings (James, 2026-08-22, all live in the brainstorm)

- **Provenance: stored, never shown (option B).** A baseline gains a
  `source` — `manual` (typed), `estimated` (questionnaire), `tested`
  (post-test prompt). No UI badge, no user-facing copy about it: "I
  don't think we need to tell the user the provenance but I do think
  it may be useful to know for future features / logging." Consumers
  today: none beyond the record itself. Behavioral steering (e.g.
  checkpoint copy that knows the baseline is a guess) stays AVAILABLE
  because the data exists, and is deliberately not built now.
- **Doors framed by outcome (canvas Option A).** The identity framing
  (Option B) is on the canvas as the road not taken; its flaw was that
  an experienced rower wanting a recommendation had no honest door.
- **Door 3 is dual-distance.** Relaxed 6k or raced 2k, rower's choice —
  the shipped `BaselineCard` already carries exactly this 6k/2k toggle,
  so the build reuses it (canvas: the RowPath artboard).
- **Two questions, NO age band, and the standing principle behind it:**
  "I want to ask as little about pii as possible." Nothing
  health-adjacent is collected; the estimate model works from rowing
  experience and self-reported cardio only. The age band is the named
  upgrade path ONLY if estimates prove too blunt in practice, and it
  would need James's explicit word.

## Research pass (house rule)

- **Estimate grounding (SECONDARY, gathered 2026-08-22):** recreational
  rowers typically start at 2:15–2:30/500m; a beginner 2K around
  2:00+/500m is normal (Concept2 blog "500m Split. What does it
  mean?", C2 forum consensus threads, ErgManiac beginner guide). The
  PRIMARY source for the real model is Concept2's published logbook
  rankings; the implementation carries a named research task to derive
  the table's values from them, with citations recorded in the domain
  file itself. The numbers on the canvas are placeholders and say so.
- **Does the system have the concept?** Baselines exist
  (`baselines.k2Seconds`/`k6Seconds`, `server/db/schema.ts:63-68`) and
  are nullable reals. Provenance does NOT exist — a number is a number
  regardless of origin — which is exactly the gap ruling 1 fills. The
  post-test wire HALF exists: `POST /api/logs` accepts
  `isTestResult: true` and appends to `test_history`
  (`data.ts:606`), but no client ever sends it — the 8A PM gate
  measured `grep isTestResult app/src` at zero. This phase ships the
  first sender.
- **Estimation mechanisms elsewhere:** fitness apps' onboarding
  questionnaires (self-reported activity level mapping to starting
  zones) are the established pattern; nothing about it is novel enough
  to need deeper vendor research. INFERENCE, stated as such.

## Design

### The stored shape (TRIAD)

`baselines` gains `source` (`text`, nullable, values
`manual | estimated | tested`). Existing rows migrate to `manual` —
every baseline in the wild was typed by hand. Every write site states
its source: the You editor writes `manual`, the questionnaire's "Use
this baseline" writes `estimated`, the post-test prompt writes
`tested`. The API change is additive (a new optional field on the
existing baseline PUT, defaulted server-side to `manual` for old
clients — an installed build keeps writing exactly what it wrote).
This is a stored shape AND touches where the app's most load-bearing
numbers come from: full antagonist pass on this spec, PM final-PR
gate on its PR.

### The doors (canvas: Main artboard)

The three-door card replaces the current single-offer `BaselineCard`
in Today's no-baseline state. Door 2 routes to the baseline editor
(the You editor's fields as an onboarding screen — canvas: Experienced
artboard; writes `manual`). Door 3 routes to the distance choice
(canvas: RowPath artboard) — two cards in the shipped BaselineCard
anatomy, reusing its existing toggle mechanics and start guards.

### The questionnaire (canvas: Question1/Question2/Recommendation)

Two single-select screens (experience: never / a little / regularly /
a lot; cardio: just starting / 1-2× a week / most days / training
hard), then the recommendation screen: both splits shown mono-large,
the dashed honesty chip ("a comfortable starting point; your plan's
first test will measure the real thing"), lead button "Use this
baseline" (writes both baselines, `estimated`), secondary "Adjust the
numbers first" (opens the editor prefilled — a manual edit of an
estimate writes `manual`, the honest answer). The estimate model is a
STATIC LOOKUP TABLE in `domain/` (pure, no framework imports):
experience × cardio → (k2Seconds, k6Seconds), 16 cells, values from
the named research task, each row commented with its source. No
formula, no cleverness — a table a reviewer can read against the
citations. The 2k/6k pair must respect the domain's own invariant
(6k slower than 2k) structurally, asserted by test across all cells.

### The You-screen re-test shortcut (James, 2026-08-22, added at spec review)

Next to the baseline fields on You, a compact re-test affordance: row
the 6k or race the 2k, right where the numbers live. It routes to the
same two designated test workouts door 3 uses (via `ONBOARDING_TITLES`
identity, start guards included) — no new mechanism, just a second
entry point at the moment a rower is looking at their own splits and
wondering if they are still true. Completing it lands in the same
post-test prompt below, which is what makes the shortcut worth having:
row from You, get offered the measurement, accept, and the numbers you
were just looking at update in place with `tested` provenance. Exact
placement and form (two compact outline buttons vs a single row with
the distance choice) is the implementation's design pass against the
You screen's existing vocabulary, with a DEVIATIONS row if the design
reference has an opinion.

### The post-test prompt

After a session whose workout is one of the two designated tests
(identified via `ONBOARDING_TITLES`, the same identity every other
consumer uses), the post-save flow offers the measured result as the
new baseline: "Your 2k came out at 1:58.4 /500m. Update your
baseline?" Accept writes the baseline (`tested`) AND sends
`isTestResult: true` on the log so `test_history` finally has a
producer. Decline changes nothing. The prompt fires for a test session
reached through ANY door: onboarding door 3, a plan checkpoint, the
Library, or the You-screen shortcut. The exact placement in
`PostWorkoutSummary` (a staged line above the save stack vs a
post-save sheet) is the implementation's design pass against the
canvas vocabulary, with a DEVIATIONS row; the binding behaviors are:
never blocks saving, never auto-writes, works from all three doors'
sessions and from a plan checkpoint.

### Accessibility and platform

All new controls reuse existing patterns: the doors and distance cards
are buttons at ≥44px; the questionnaire options are a single-select
group — reuse `PaceRefInput`/`ClassificationCard`'s roving-tabindex
radiogroup pattern AND copy its keyboard tests (recurring failure 8).
Contrast is computed per element in the implementing PR, not eyeballed.

## Out of scope, stated

- Any use of provenance beyond writing it (no badges, no steering copy,
  no analytics surface). It is a recorded fact awaiting a consumer.
- Age, sex, weight, or any attribute question (standing PII ruling).
- Changing what a baseline IS or how targets resolve — this phase only
  changes how the numbers arrive.
- The calendar (own spec, sequenced after this phase).

## Testing

docs/TESTING.md governs. Domain table: exhaustive 16-cell test
asserting the 2k<6k invariant and value provenance comments exist;
realistic client fixtures (real seeded library, real plan state at a
checkpoint for the prompt test); integration tests for the migration
(existing rows become `manual`; old-client PUT without `source` still
writes `manual`); the prompt's failing-test-first case is a completed
test session asserting the offer renders with the session's own
number; e2e flows for each door end to end; screenshots of all new
screens with real data, opened and checked.

## Exit criteria (draft — ROADMAP refines at phase open)

A brand-new account reaches a working app through each of the three
doors: door 1 in under a minute with two taps per question and an
honest chip on the result; door 2 writes exactly what an experienced
rower types; door 3 offers both distances and either sets the
baseline. After rowing a 2K Test the rower is OFFERED the measured
result and accepting updates the baseline with `tested` provenance and
a `test_history` row — the loop 8A shipped open is closed. From You, a
rower one tap from their baseline fields can start either test, and
completing it offers the update in place. Every baseline row in the DB
carries a source, and no screen anywhere shows it.
