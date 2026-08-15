# PM ledger

Accumulated rulings, precedents and recurring patterns. Read by the
`product-manager` agent before every engagement; appended to at the end of one.

Keep entries short and dated. Append what a future PM would otherwise re-derive.
Do not append narration.

## Where the rules live — do not copy them here

**The rules are `CLAUDE.md`'s and `docs/RELEASING.md`'s. Read them there.** You
already do: they are items 3 and 4 of your reading list.

This section used to restate the fast path and the no-merge rule, and **the
fast-path copy went stale inside 24 hours** — it was written on 2026-08-14 and
was already missing that same day's tightening (zero files under `domain/`, the
wrong-number test, "if uncertain it is not fast path"). A PM reading the stale
copy would have waved through work the real rule forbids. That is recurring
failure #9 with a different filename, and it is why this section is a pointer
now.

**This ledger holds only what those files do not:** precedents, counted
patterns, product principles with no other home, and recommendations that turned
out wrong. If something you want to add belongs in `CLAUDE.md`, put it in
`CLAUDE.md` and say so in your report.

## Product principles (no other home)

- **2026-08-13 — "let the erg drive."** The PM5 is authoritative. Match the
  machine, including in pre-row states. Do not invent a reading, a verdict or a
  state the monitor does not itself show. Generalises past the PM5: when a real
  system owns a concept, mirror it rather than modelling our own version beside
  it.
- **2026-08-13 — no new phase for work that finishes an existing one.** CR2 was
  scoped as the close-out of CR rather than a fresh phase, and Phase CP was
  folded into it rather than kept as a second home for the same work. Pairs with
  the filing-as-deferral pattern below.

## Precedents

- **Notes before the tag.** v0.8.0 and v0.9.0 both merged the in-app release
  notes PR first, then tagged. The Releases screen names the version testers are
  about to receive, and three e2e pins force a deliberate touch when it changes.
- **A TestFlight build from a branch is a mistake.** `BUILD` is
  `rev-list --count`, so a branch upload burns the number the merge commit would
  have taken, and internal testers auto-update with no canary. Rejected
  2026-08-13.
- **Splitting a wave's PR is usually impossible.** Type changes compile-couple
  the tasks; `CLAUDE.md` failure #10 records this repo being burned by exactly
  that split.

## Patterns that recur (check for these every time)

- **Filing as deferral.** 2026-08-13 audit: 24 unchecked items across 8 phases,
  5 phases not started, 13 triggered follow-ons, and two new phases filed in two
  days with zero checkboxes between them. Filing is fine; filing as the ONLY
  disposal mechanism is the failure. Count before endorsing another.
- **The roadmap outruns reality.** Five status lines were factually wrong on
  main simultaneously (7D, FF, CL, CL2, CR), some for over a week. Verify any
  phase status against `git log` and the PRs before trusting it.
- **The unreviewed tail.** PR #89 passed a whole-branch review, an integrity
  sweep and a re-review, then took five more commits inline — 42 files, +764,
  including `app/domain/`, which the fast path forbids. Two independent
  adversarial reviews named that tail, not the known defects, as the only place
  an unknown could hide. **Always ask what landed after the last review.**
- **Sequencing inversions read as scope creep.** Phase CR's exit said a fix
  round comes BEFORE the PR; the PR opened first, and every subsequent finding
  felt like creep to everyone involved. When someone reports scope creep, check
  the phase's own exit for an inversion before accepting the framing.

## Recommendations that turned out wrong

- **2026-08-13 — the CR2 item 0 hypothesis and its oracle.** Both written into
  the ROADMAP with confidence, both measured false within a day (work→rest never
  drops the clock; the prescribed boundary-sum oracle fails a correct fold).
  Lesson: a written hypothesis in a roadmap is load-bearing — an investigator
  will follow it and stop. Mark speculation as speculation, or measure first.

## Design-gate rulings, 2026-08-15 (Phase CR2 spec 1, "numbers")

- **"The captures don't show X" is a claim about our LOGGING, not the machine.**
  The design gate was handed a fresh finding — `totalWorkDistanceMeters` appears
  in the committed captures only at 16 arm/terminate moments, therefore R7 is
  hardware-gated — and it was wrong. TWD is bytes 11-13 of 0x0031
  (`parse.ts:135`), decoded ~2/second all session and discarded; its bytes reach
  the ring only inside the `structure` log entry, which fires **on change of the
  workout-structure triple only** (`driver.ts:2656-2668`), a flood guard. The
  absence was ours. It had already propagated into the architecture review's R7
  caveat, whose "distance-goal TWD reads the goal" finding is measured entirely
  inside the first ~30 m because every sample is arm-adjacent. **Before an
  absence in our own record reclassifies work as hardware-gated, find the code
  that decides what gets recorded.** Sibling of recurring failure #11: there we
  verified the app against itself; here we inferred the machine's behaviour from
  our own logging policy.

- **Cutting a display does not retire the number behind it.** Asked whether a
  pending redesign that removes `TOTAL M` from the connected LIVE pane demotes
  the session-total fix, the answer was no: the same accumulator also drives
  `totalLeftSeconds` (`surfaceModel.ts:528`) and `elapsedDisplay` (`:562`, which
  is PaneLive's clock AND the log sheet's `SESSION m:ss`), and the redesign KEEPS
  both. It cut the only consumer with a possible machine authority and kept the
  two the machine cannot source (0x0031 carries no Total Work Time). **Trace
  every consumer of the value, not the label, before letting a redesign reorder a
  correctness fix.** Generalised form of the review's own hazard: a surface
  change that hides a wrong number is worse than one that shows it.

- **An item's own text can set a stricter bar than its phase's exit.** CR2's exit
  reads "items 0-4 shipped and walked on a real PM5", but item 0 separately says
  "any fix should be walked the same way, with both screens in one frame".
  Splitting a phase into spec cycles does not dissolve per-item bars into the
  phase gate: spec 1 owes the photograph on its own PR and **merges on the walk,
  not on CI**. When a phase is decomposed, re-read each item for sentences that
  bind independently.

- **"Make it loggable" hid three decisions.** F6-half was presented as the cheap
  half ("a reload can CLOSE the stranded run"). It asserts the session ended on
  evidence that is only a page reload — the PAUSED shape again; it needs a new
  entry point, because `monitorModeRun` gates on `?from=monitor`
  (`LogSession.tsx:281`) and no route reaches it after a reload; and it would
  ship a wrong duration, because `monitorLogTotals` (`:330-337`) is wall-clock
  `completedAt - startedAt` and `IntervalActual` carries no timestamps. James
  ruled it into the state-axes spec, where the session lifecycle already lives.
  **A "half" that is described by what it does not need (no stored shape) has not
  been described.**

## Final-PR gate, 2026-08-15 (Phase CR2 spec 1, PR #99)

- **Judge an unreviewed tail by its BLAST RADIUS, not its size.** PR #99's tail
  was one commit (`e7f3d2b`, nine review findings) with a SCOPED re-review — which
  answers "were the findings fixed", never "did a fix break something else". The
  useful check is not the diff stat: read the tail for behavioural lines and ask
  what they can reach. #99's reached only the diagnostic ring (a log-guard
  quantisation and a per-run reset), so the numbers were untouched by it. Contrast
  #89, whose tail reached `app/domain/`. The question "how big was it" would have
  ranked these wrongly in both directions.

- **A walk must re-observe every symptom in the original report, not just the one
  the fix targets.** CR2 item 0 recorded TWO things James photographed: TOTAL M at
  3.9x, and TOTAL LEFT stuck at 0:00 with the bar prematurely full. The PR's
  five-item walk list carried the first and dropped the second — which the fix
  reaches only transitively (`surfaceModel.ts:528` shares the accumulator pair)
  and which no test on the branch touched. Caught at this gate and added. When a
  defect was found by observation, enumerate the original observations and check
  each has a walk item.

- **Flipping a defect's ERROR DIRECTION is a release event even with zero visual
  change.** Spec 1 replaces an overcount with a deliberate undercount (two shapes
  lose metres silently, bounded and disclosed). Testers on the previous build will
  see lower totals for the same rowing. A release note that says only "bug fixes"
  makes that unfalsifiable by the cohort — name the change so a tester knows what
  to check.

- **Release shape for a correctness-only fix:** PATCH, alone, and not bundled with
  the redesign specs that follow it. Releasing spec 1 by itself is the canary the
  3.9x defect never got; if a later build still disagrees with the erg, a solo
  release is the only thing that says which change owns it.
