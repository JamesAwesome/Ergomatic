# Lane A — Workout Semantics and PM5 Compilation

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Status: COMPLETE — one P2 candidate and four device hypotheses; no encoder defect confirmed.

## Outcome

The seeded workout corpus and the PM5 byte encoder survived independent replay,
but Today can hide valid authored rest while still counting it in TOTAL. Protocol
behavior beyond the first interval remains deliberately unclaimed where neither
Concept2's specification nor a physical recording establishes it.

## Scope and authorities

- Product authority: the approved Today step-detail design says Today prints the
  pieces, a rest attaches to the preceding piece, hiding a carried rest
  misstates the session, and WORK plus displayed rests equals TOTAL on every
  workout (`docs/superpowers/specs/2026-08-10-workout-step-detail-design.md:15-20,54-58,151-162`).
- Primary wire authority: Concept2, _PM CSAFE Communication Definition_, rev.
  0.27, [official PDF](https://www.concept2.nl/files/pdf/us/monitors/PM5_CSAFECommunicationDefinition.pdf),
  pages 9, 49, and 85–86. It defines a 120-byte stuffed frame ceiling,
  command-boundary framing, time and pace in hundredths, distance in metres,
  and rest in seconds with a 9:55 maximum.
- The same primary source does **not** establish a blanket 50-variable-interval
  cap. Table 19's load-bearing note is: “The split duration must not cause the
  total number of splits per workout to exceed the maximum of 50.” The needed
  attribute is an ordinary variable workout's interval count, not a fixed
  workout's generated split count; the cited line is silent on that attribute.
- Production subjects: workout grammar, validation, repeat expansion, target
  resolution, estimates, Today projection, timer input, PM5 compilation,
  encoding, frame grouping, and structural readback.
- Probe media: an independently expanded 302-row corpus, hand calculations,
  two adversarial imported step arrays, literal primary-source byte vectors,
  and committed raw PM5 recordings. Production `phases`, `pieceList`, compiler
  output, and synthetic status frames were not used as their own authorities.

## Workout boundary matrix

| Boundary                               | Disposition         | Evidence and independent expectation                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation and bulk import             | CLEARED             | Every parsed bulk row reaches `validateSteps`; the accepted union includes work, standalone rest, one non-final repeat marker, and test (`app/domain/bulk.ts:254-277`, `app/domain/validate.ts:65-128`).                                                                                                  |
| Repeat marker before/after attribution | CLEARED             | An independent expander treated the prefix once and repeated the suffix by marker count. Its `(type, sourceIndex)` sequence matched `buildRun` for all 302 seeded rows, including ten mid-array markers.                                                                                                  |
| Omitted, zero, and minimum rest        | CLEARED             | Omitted rest emits no phase; persisted zero is invalid; builder zero becomes omission; one second is the accepted minimum. The probe compared authored inputs and resulting timer phases rather than reusing validation predicates.                                                                       |
| Effort and split references            | CLEARED             | Split references require baselines; effort references do not. An effort-distance workout with null baselines produced no numeric target or estimate and compiled as an untargeted interval, preserving the authored effort meaning.                                                                       |
| Distance and time estimates            | CLEARED             | Time totals were summed directly. Distance time was independently calculated as `metres / 500 × target seconds`; only the final total is rounded.                                                                                                                                                         |
| Baseline changes and freeze point      | CLEARED             | Preview resolves against current baselines; Countdown resolves once into saved run phases. A 120-second baseline remained 120 after the live baseline changed to 150; only a newly started run used 150.                                                                                                  |
| Seed and generated corpus              | CLEARED, bounded    | All 302 rows validated, built a run, and compiled: 775 work steps, 165 markers, and 9 standalone rests across all time/distance × split/effort combinations. `generation/` audits the static corpus; there is no separate runtime step generator.                                                         |
| Test steps                             | DEFERRED            | The timer supports this accepted open-ended shape while the PM5 compiler correctly refuses it. No seeded row or independent product scenario establishes a stronger cross-consumer obligation.                                                                                                            |
| Leading standalone rest                | CANDIDATE — AUD-006 | Validation, bulk import, timer, storage, and suggestion selection admit it. Today drops it because no preceding row exists; TOTAL retains it. PM5 Connect separately and correctly refuses a pre-work rest (`app/domain/display/stepDetail.ts:48-72`, `app/domain/monitor/program.ts:354-361`).           |
| Consecutive rests                      | CANDIDATE — AUD-006 | For one minute work plus one- and two-minute rests, Today displays only the first minute but reports four minutes TOTAL. Timer preserves both and the compiler folds both to three minutes on the preceding interval (`app/domain/display/stepDetail.ts:60-70`, `app/domain/monitor/program.ts:391-401`). |

The adversarial inputs were valid under `validateSteps`, selectable as a custom
Today recommendation, and independently totalled from raw authored values:

```text
leading:     r 2; w 1 with r 1  -> displayed 1′ r; TOTAL 4′
consecutive: w 1 with r 1; r 2  -> displayed 1′ r; TOTAL 4′
```

The probe did not call `phases`, `pieceList`, `workAndTotal`, or the compiler to
derive the expected visible-rest sum. Dropping either raw rest is the named
corruption that makes the approved arithmetic invariant fail.

## PM5 compiler and encoder matrix

| Question                        | Independent expectation                                                                                                                  | Disposition                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three-minute time interval      | `180 × 100 = 18,000 = 00 00 46 50`; duration command `03 05 00 00 00 46 50`                                                              | CLEARED against the primary worked example and literal test vector.                                                                                        |
| 500-metre interval              | `500 = 00 00 01 F4`; duration command `03 05 80 00 00 01 F4`                                                                             | CLEARED against the primary worked example and literal test vector.                                                                                        |
| One-minute rest                 | `60 = 00 3C`; rest command `04 02 00 3C`; normal range ends at 595 seconds                                                               | CLEARED against Table 19 and the primary worked example.                                                                                                   |
| Target pace                     | `100.00 s = 10,000 = 00 00 27 10`; `106.50 s = 10,650 = 00 00 29 9A`                                                                     | CLEARED; the half-second case is also present in the 2026-08-23 physical keystone recording.                                                               |
| Type, index, configure          | variable type `01 01 08`; first index `18 01 00`; configure `14 01 01`                                                                   | CLEARED against the primary worked example.                                                                                                                |
| Frame packing                   | stuffed frame at most 120 bytes; individual commands remain in one frame                                                                 | CLEARED for local packing and command alignment. A literal known vector catches endian, unit, identifier, index, and opcode corruption.                    |
| Five intervals over two frames  | independent sizes `29 + 3×26 = 107` then `26 + 4 = 30`; wrappers `76 6B` and `76 1E`                                                     | CLEARED by the 2026-08-17 physical recording: both writes were acknowledged and the PM5 advanced through interval five.                                    |
| Sea Smoke over six frames       | 24 authored intervals are locally emitted in order over six valid frames                                                                 | UNKNOWN on the device; the assertion still calls production compilation and no physical recording advances into the last-frame-only interval. See AUD-010. |
| Fifty-interval cap              | primary evidence limits fixed-workout splits and one fixed-interval undefined-rest construction, not clearly ordinary variable intervals | UNKNOWN; the rejection and user message overstate established authority. See AUD-008.                                                                      |
| Null target encoded as zero     | the code sends pace raw zero; primary examples always send a real target and do not define zero as a sentinel                            | UNKNOWN despite a physical program accepting it. Acceptance does not establish what the PM5 displays or enforces. See AUD-009.                             |
| Reprogramming a shorter workout | encoder sends only named intervals and no documented truncate; readback compares only interval zero                                      | UNKNOWN; a retained stale tail could pass verification. See AUD-007.                                                                                       |

## Oracle independence and cleared probes

- The exact four-interval primary worked vector is independently literalized in
  `app/domain/monitor/pm5/commands.test.ts:327-381`. It fails scale, endian,
  identifier, opcode, index, rest, or pace corruption.
- The runtime readback is narrower: `expectedArmedStructure` reuses encoder
  constants and predicts only workout type plus interval-zero duration/type
  (`app/domain/monitor/pm5/commands.ts:368-432`,
  `app/src/monitor/driver.ts:5156-5180,5367-5380`). It is useful device evidence
  that a fresh arm occurred, but cannot independently validate the whole
  program or encoder scale.
- Synthetic status frames and the browser fake are arrangements, not PM5
  oracles. None were used to promote a wire finding.
- The seeded replay independently expanded repeat attribution before comparing
  it to `buildRun`; matching production to production would not have cleared
  this boundary.
- Two investigator commands intended to scope individual tests each triggered
  the documented pnpm footgun and redundantly ran the full unit project: 46
  files, 1,435 passed, 1 skipped. This added no baseline claim beyond Task 3.

## Candidate

AUD-006 owns both rest shapes because the writer, projection, and user outcome
are identical: accepted elapsed rest is lost only from Today's visible piece
projection. Splitting it would duplicate one root cause.

## Unknowns and next owners

- AUD-007, stale tail after a shorter reprogram: Lane D Task 8; hardware only if
  Task 12 determines it can change priority.
- AUD-008, ungrounded general 50-interval cap: Lane E factual-claim pass and
  Lane D only if primary clarification remains unavailable.
- AUD-009, zero as no-target pace: Lane D raw/display evidence.
- AUD-010, retention and ordering beyond two programming frames: Lane D final-
  frame trace.
- Consecutive-rest folding is elapsed-time preserving and within the documented
  rest field range; whether authoring should normalize it earlier is a product
  choice, not a separate defect.

## Contradictions and limits

- The source message “The PM5 supports at most 50” is stronger than the cited
  primary evidence. It remains an AUD-008 hypothesis, not a protocol fact.
- Comments that call shared encoder prediction an “honest” check describe
  internal agreement, not independent byte correctness. The literal primary
  vector supplies that separate check.
- The approved Today design promised visible-rest arithmetic for every workout,
  while implementation comments deliberately preserve a known exception that
  validation and import still accept. The implementation comment does not
  override the approved product rule.
- No native or new physical PM5 behavior was exercised in Task 5.
