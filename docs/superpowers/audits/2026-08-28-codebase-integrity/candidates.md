# Audit Candidate Register

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

### AUD-006 — Today hides accepted rest while counting it in the workout total

- Category: correctness
- Severity / confidence: P2 / Confirmed
- User impact: a rower can see a shorter rest prescription than the workout the
  timer will run, while the same card's TOTAL still includes the hidden time.
- Expected authority: the approved Today step-detail design says Today prints
  the pieces, rest attaches to the preceding piece, hiding a carried rest
  misstates the session, and “WORK plus displayed rests equals TOTAL on every
  workout”
  (`docs/superpowers/specs/2026-08-10-workout-step-detail-design.md:15-20,54-58,151-162`).
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  `validateSteps` and bulk import accept standalone rest. `pieceList` drops a
  leading rest and keeps only the first of consecutive rests
  (`app/domain/display/stepDetail.ts:48-72`), while `workAndTotal` sums all
  phases (`:200-215`). Both `r 2; w 1 with r 1` and
  `w 1 with r 1; r 2` display only `1′ r` but report `4′ TOTAL`. A custom
  workout carrying either shape remains eligible for Today's recommendation.
- Independent disproof: the probe independently summed seconds from raw,
  validation-accepted authored steps and compared that number with rendered
  rest text and TOTAL. It did not read `phases`, `pieceList`, `workAndTotal`,
  or compiler output to derive the expectation. Dropping either raw rest from
  the display projection is the named corruption that makes it fail.
- Scope: bulk and JSON workout writers, persisted custom workouts, suggestion
  selection, Today's `PieceRegion`, detail/timer consumers, and PM5 Connect's
  separate handling of leading versus consecutive rest.
- Existing coverage gap: all 302 seeded rows compile, but none contains a
  leading rest or adjacent rest phases. Existing `pieceList` tests assert the
  deliberate drop in isolation rather than the approved visible-rest/TOTAL
  invariant across a realistic custom recommendation.
- Smallest safe fix: make Today's projection total over accepted rest shapes:
  preserve leading rest as an explicit pre-work rest item and sum consecutive
  rest onto its preceding piece. Do not change timer or compiler elapsed time.
  Because the fix adds a visible row shape and changes a displayed number, it
  requires the repository's design gate before implementation.
- Verification required after a fix: failing domain cases first for leading
  and consecutive rest; a realistic custom workout through the real Today
  suggestion path; raw authored rest sum + displayed rest = TOTAL; detail,
  timer, and compiler contract checks; both-orientation rendered approval,
  contrast calculations, `pnpm e2e`, and `pnpm screenshots`.
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
