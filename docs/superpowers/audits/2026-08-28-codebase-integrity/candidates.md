# Audit Candidate Register

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

### AUD-006 — Workout previews hide accepted rest that the timer retains

- Category: correctness
- Severity / confidence: P2 / Confirmed
- User impact: Today and Library can show a shorter rest prescription than the
  workout the timer will run, while Today's TOTAL still includes the hidden
  time.
- Expected authority: the approved step-detail design says Today prints the
  pieces, Library states the structure, rest phases attach to the preceding
  piece, hiding a carried rest misstates the session, and “WORK plus displayed
  rests equals TOTAL on every workout”
  (`docs/superpowers/specs/2026-08-10-workout-step-detail-design.md:15-20,54-58,84-89,151-162`).
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  `validateSteps` and bulk import accept standalone rest. `pieceList` and
  `structureLine` drop a leading rest and keep only the first of consecutive
  rests (`app/domain/display/stepDetail.ts:48-72,233-272`), while
  `workAndTotal` sums all phases (`:200-215`). Both `r 2; w 1 with r 1` and
  `w 1 with r 1; r 2` show only `1′ r` on Today and Library but report
  `4′ TOTAL` on Today. A custom workout carrying either shape remains eligible
  for Today's recommendation and Library display.
- Independent disproof: the probe independently summed seconds from raw,
  validation-accepted authored steps and compared that number with both preview
  projections and Today's TOTAL. It did not read `phases`, `pieceList`,
  `structureLine`, `workAndTotal`, or compiler output to derive the expectation.
  Dropping either raw rest from a projection is the named corruption that makes
  it fail.
- Scope: bulk and JSON workout writers, persisted custom workouts, suggestion
  selection, Today's `PieceRegion`, Library's `structureLine`, detail/timer
  consumers, and PM5 Connect's separate handling of leading versus consecutive
  rest.
- Existing coverage gap: all 302 seeded rows compile, but none contains a
  leading rest or adjacent rest phases. Existing `pieceList` tests assert the
  deliberate drop in isolation rather than the approved visible-rest/TOTAL
  invariant across realistic custom Today and Library paths.
- Smallest safe fix: aggregate consecutive rest onto its existing preceding
  piece in both projections without changing timer/compiler elapsed time. For
  leading rest, Gate 0 must first decide whether the shape remains valid; then
  either reject/normalize it coherently at every authoring, import, and stored-
  data boundary or approve a visible representation on both scanning surfaces.
  Do not invent a pre-work row or patch Today alone before that decision.
- Verification required after a fix: failing domain cases first for leading
  and consecutive rest; realistic custom workouts through the real Today and
  Library paths; raw authored rest sum against both projections and Today
  TOTAL; detail, timer, stored compatibility, and compiler contract checks;
  both-orientation rendered approval, contrast calculations, `pnpm e2e`, and
  `pnpm screenshots`.
- Status: candidate; final adjudication is Task 10.

## Record contract

### AUD-### — short user-outcome statement

- Category: correctness | brittleness | over-engineering | circular proof | hallucinated claim
- Severity / confidence: P# / Confirmed | Probable | Hypothesis
- User impact: what a rower, operator, or account holder experiences.
- Expected authority: source, exact quoted rule, and what it measures.
- Actual behavior: baseline SHA, exact code/capture/build evidence, and trigger.
- Independent disproof: probe used; why it does not share the product's implementation, premise, source, or quantity; production fields it does not read; and a corruption that makes it fail.
- Scope: writers, readers, stored shapes, and paths affected.
- Existing coverage gap: why current tests did not or could not catch it.
- Smallest safe fix: a bounded direction, not an untested rewrite.
- Verification required after a fix: test/capture/build/hardware proof.
- Status: candidate | validated | cleared | deferred.
