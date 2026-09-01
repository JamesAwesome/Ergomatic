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

## Design-gate rulings, 2026-08-15 (PM5 record-and-replay harness)

- **"It's a dev capability" is a claim about INTENT; ask where the code
  RUNS.** The record-and-replay design opened with "tester impact: none (dev
  capability)" and its part 1 put an always-on wrapper in the phone's
  notification path during live sessions. `transports/index.ts:39-54` documents
  a dead-code-elimination contract gated at `:208-209` on
  `import.meta.env.DEV || VITE_ENABLE_FAKE_MONITOR`: inside it, code never
  enters the production bundle; outside it, it ships. **For any capability
  claiming to be dev-only, name which side of that gate it lands on.** The safe
  seams already exist and need no product change at all —
  `MonitorSessionDeps.createTransport`/`createLog`
  (`useMonitorSession.ts:339`,`:343`), with `autoTicking`
  (`transports/index.ts:155-182`) as a written `Transport` decorator template.

- **The definitive hardware walk was a WEB walk.** The 2026-08-15 re-walk that
  gated PR #99's merge ran "Chrome/Web Bluetooth from the worktree dev server"
  (`docs/monitor/sessions/walk-2026-08-15/README.md:82`). A dev/web-gated
  instrument covers the walks that actually settle questions, at zero tester
  exposure. Before accepting "it must ship to the phone", check which surface
  the last conclusive measurement was taken on.

- **A phase whose later parts need a capture its earlier parts produce is TWO
  phases with a hardware walk between them.** The harness presented six parts as
  one scope while conceding its CI rung needed a recording no walk had yet made.
  Split at the walk and make the recorder ride a walk that was already
  scheduled — the live verification then costs one photograph instead of a trip.
  Same shape as the "spec 2 owes it" deferral, one level up.

- **Exit criteria for a VALIDATION capability must include "the gate can go
  red".** "Recorder verified live at the next walk" is passed by a non-empty
  file. The falsifiable set is: (1) a named prior measurement reproduces from
  the recording with no hardware — here the re-walk's 2x250m r0 keystone,
  accumulator 499.5 m vs machine TWD 500 (walk README:99-103); (2) recording ON
  does not change the session's agreement with the machine; (3) a deliberate
  mutation of the code under test turns the rung red. Building a second gate
  that agrees with us is recurring failure #4 at phase scale.

- **An unreleased canary is a live constraint on the NEXT merge, not just on
  its own PR.** PR #99 merged 2026-08-15 (`7c2be9f`) with the newest tag still
  v0.9.0 and no notes PR. This ledger had already ruled spec 1 releases PATCH
  and alone. Anything merged before that tag bundles into it — and the harness
  as designed would have bundled always-on notification-path code into the very
  build meant to isolate a numbers fix. **When a solo release is owed, say so at
  the top of the next design gate, before scope.** (James subsequently ruled,
  same day: hold TestFlight until further UI fixes land — the canary is
  knowingly forfeited; record the override, not just the rule.)

- **We had already built this capability three times in instalments.**
  `structure` raw-on-change (`driver.ts:3053-3066`), `twd-sample` on a 25 m
  bucket (`:3078-3093`), `terminal-raw` from a one-frame buffer (`:2082-2087`).
  Each was a walk paying for a general instrument in narrow patches, and >99% of
  inbound traffic is still discarded (`driver.ts:1661-1666`). **Three special
  cases for the same missing general mechanism is a build signal**, and it is
  the honest cost argument — stronger than any single defect.

## Final-PR gate, 2026-08-15 (record-and-replay Stage A, PR #100)

- **"Zero tester surface" has a mechanical form — demand it, don't accept the
  adjective.** For a dev-gated capability the check is a build and two greps,
  not a code read: `pnpm build`, then confirm the gated module's string literal
  is absent from `dist/client`, then grep the bundle for the seam's global and
  confirm **only READ sites survive and no WRITE site exists anywhere**. #100
  passes that: `__pm5Recording__` appears twice in the production chunk, both
  reads in the component, with nothing shipped that can ever set it — so the
  control is unreachable, not merely hidden. Note the honest residual: the
  control's own JSX and its label string DO ship. "Zero production footprint"
  is true of the recorder, not of the button; say which.

- **A claim about build output is settled only by build output.** #100's
  planned download path — a dynamic `import()` gated on a runtime global —
  read correctly and still emitted the whole module graph as its own chunk;
  Rollup can only drop an `import()` behind a condition it folds at BUILD
  time. Caught by building, not reviewing. Second occurrence of this class
  (`scripts/dist-grep.sh`'s header records the first: an identifier needle
  came back clean against a build that genuinely included the file).

- **Freezing the exit criteria before the plan is what makes them worth
  quoting.** #100's spec's last edit precedes its plan and every
  implementation commit (`git log -- <spec>`), so "criterion met" could not be
  met by moving the criterion. Run that one-command check at every final-PR
  gate; it costs nothing and it is the only defence against a criterion that
  drifted to fit the code.

- **Check the DELIVERY path, not just the mechanism.** #100's round trip,
  replay barrier and tap are covered to the last branch — while the file the
  whole phase exists to produce is written by `downloadRecording`'s gzip arm,
  which no test can reach under jsdom. The mechanism was proven and the
  artefact was not. Whenever a phase's output is a FILE a human will collect,
  ask which gate covers the collection, and if none does, book a dry run
  before the session that depends on it.

- **An instrument's merge is time-critical against the next walk, and this one
  already missed once.** #100 landed hours after the 2026-08-15 re-walk that
  gated #99 — a Chrome/Web-Bluetooth dev-server walk, exactly the medium the
  tap covers — which surfaced a `workoutState 8` shape the lab record had
  never contained. All that survives is the ring's curated JSON exports; the
  raw bytes are gone. **When an instrument and a scheduled walk are in the
  same week, the instrument's PR outranks everything else in the queue.**

- **Once an instrument sits in the walk's own path, it becomes a suspect in
  the walk's numbers.** Dev/web sessions now flow through the recording tap,
  and spec 2's walk measures through it. Criterion 2 (recorded 0x0031
  inter-arrival distribution vs the committed ~2.2/s, modal 0.50 s baseline)
  must be evaluated BEFORE the walk's numbers are trusted, not after — it is
  the cheap discriminator if the app and the erg disagree again.

## Design-gate ruling, 2026-08-15 (Phase CR2 spec 2, "state axes")

- **Before gating on a wire signature, count how often it is the NORMAL path.**
  The corroboration window was designed around "a lone `finished` tick arriving
  mid-rest" as the session-killer's signature. In `pm5-session4b-final.log.gz`
  (10,408 frames) three of four `finished` episodes arrive out of `resting`,
  because a trailing rest on the final interval is counted down before
  `WorkoutEnd` — a shape **161 of the 300 seeded library workouts compile**
  (`pm5-interface-notes.md` §15 #9). The proposed corroborator was equally
  unsupported: four of five `finished` episodes in that record are a SINGLE
  frame, so "a second terminal tick confirms" fails 80% of honest finishes.
  A gate that fires on the majority path is not a gate. **Prefer a synchronous
  predicate over evidence already in hand** (0x0039 already received; programmed
  interval count reconciled) **to a timer**, and fail open with a log entry
  naming which path fired.

- **A timer added near a natural finish must state which existing window it
  nests inside.** `driver.ts` arms `finishGraceUntil` and `armSummaryReconcile`
  BEFORE the `workoutComplete` emit, and its own comment says that ordering is
  what makes "the fill happens before navigation" a fact about the code rather
  than the event loop. Both 2026-08-15 walk sessions depended on that grace
  catching their final boundary. Any design that delays the emit decouples the
  pair unless it says so.

- **Ask the does-it-exist question of the SURFACE, not just the state.** F6's
  design proposed a new prompt, new copy and a new route entry for "log what was
  measured / discard". `Today.tsx`'s `UnloggedRow` already renders exactly that
  transaction for a `SessionRun`, on the house `useStagedDiscard` two-tap idiom,
  with the Discard consequence already approved and its focus bug already fixed
  by review. The 2026-08-14 research rule covers product surfaces, not only
  device concepts.

- **A design handoff goes stale the moment a fix lands under it.**
  `docs/design/handoffs/2026-08-15-connected-v2/README.md` still instructed the
  implementer to compute TOTAL LEFT "from plan + elapsed, not the broken
  accumulator" — written before spec 1 corroborated that accumulator against the
  machine three ways. Reconcile a handoff at the gate that follows the fix, not
  at the plan that follows the handoff. Recurring failure #9 with a different
  filename.

- **When a release is deferred to a whole phase, the canary has to be replaced
  inside the phase.** James ruled (2026-08-15) that CR2 releases only when specs
  2+3 are done. The prior ledger entry's canary argument does not evaporate; it
  transfers to the walk. Any later spec that touches the terminal path must
  re-run the EARLIER spec's oracle row (here: 2×250 m r0, a-priori truth 500),
  or a regression and its own fix ship in one build with nothing to attribute
  them.

## Final-PR gate, 2026-08-16 (Phase CR2 spec 2a, PR #102)

- **A review that catches ONE false doc comment has found a CLASS — grep the
  deleted mechanism's own nouns across `src/`, `domain/` AND the design
  handoffs before accepting the fix.** #102 deleted a 0x0033 checkpoint
  subtraction; its doc sweep corrected `docs/monitor/` and the walk README, and
  the final review separately caught one stale comment in `driver.ts`. Five
  sites survived both: `domain/monitor/types.ts` (the PUBLIC seam contract,
  still calling the new inputs "the wrong inputs"), `surfaceModel.ts:784`,
  `fake.ts:202`, and `PROVENANCE.md` items 3 and 4 — the last two being
  questions THIS PR answered, in the file **spec 3 is written from**, whose
  item 2 had to be corrected at the previous gate for the identical reason.
  Ask "what else names this mechanism", not "which docs did the brief list".

- **Judge a tail by what its behavioural lines can REACH, and say the gate.**
  #102's tail read as 14 files / +280 — larger than #99's tail by every size
  measure, and NARROWER by blast radius: three behavioural lines all gated on
  `status === "armed"`, reachable only at phase `ready` (pre-first-stroke,
  capped ~2.5 s by `ROWING_ACTIVE_FALLBACK_FRAMES = 5`), plus one label
  unification provably equivalent everywhere else. The settling check took one
  grep: the guard is `status === "armed"` verbatim, not OR'd with the sibling
  mid-session mirror.

- **Check the exit list against ITSELF before ruling a criterion partial.**
  #102's criterion 1 demands a table over "all TEN members"; its criterion 8
  removes one of the ten. Nine shipped — a spec-internal collision resolved
  the only coherent way, not a softening. Read the list as a list.

- **A design FRAME is a checklist; enumerate its properties in the exit
  criteria or the last one is lost.** Frame 2D named four properties of the
  armed surface. Three were found unbuilt by the final whole-branch review and
  fixed in its wave; the fourth (the `READY` status word) was disclosed only
  in the PR body until this gate homed it into `PROVENANCE.md`, where spec 3
  will find it. A PR body is not a record: it is unread after merge.

- **When a release is deferred to a whole phase, COUNT the un-released stack
  at every gate and say the number.** At #102's gate, `v0.9.0` is four merges
  behind: spec 1's deliberate error-direction flip, record-replay, a stack
  fix, and a state redesign. The canary is twice-forfeited by James's own
  recorded override. The mitigation transfers to the walk — but only if the
  row verifying the phase's largest correctness fix is a PRIMARY both-screens
  comparison, not a rounding footnote at the bottom of six. Rewritten so at
  this gate.

## Final-PR gate, 2026-08-16 (Phase CR2 rest-keying fix, PR #104)

- **A spec edit AFTER the plan is fine; a criteria edit is not — check the
  block, not the file.** #104's spec's last commit (`a061f58`) postdates its
  plan, which by the #100 rule reads as drift. Diffing the `## Exit criteria`
  block across all three spec commits showed it byte-identical since the
  antagonist pass — the late commit added 20 lines of research. The one-command
  check is `git show <sha>:<spec> | sed -n '/^## Exit criteria/,$p'` per commit.
  Sharpen the earlier ruling: freeze the CRITERIA before implementation, not the
  file before the plan.
- **The v1→v2 criteria diff is where softening hides, and here it hardened.**
  v1 cited a `>` mutant; v2 replaced it with three mutants each chosen to differ
  from the revert AND said why `>` was dropped (byte-identical to the revert on
  these recordings). Read the criteria's own history, not just their final text —
  a criterion that gained a justification is as informative as one that lost a
  clause.
- **An earlier spec's regression oracle can be structurally blind to the later
  fix.** CR2's keystone row (2×250 r0) is the phase's standing both-screens
  oracle — and it contains no resting frames, so it cannot execute the rest
  clamp at all; the spec concedes it "replays clean, fix or no fix." Re-running
  the old oracle row would have shipped the clamp to testers unexercised on
  hardware. **Before accepting "the walk re-runs the earlier oracle", ask
  whether that row's shape can reach the new code.** Corollary to the
  2026-08-15 re-run-the-oracle rule, and it nearly inverted it.
- **A walk HANDOFF is an assignment document; it goes stale the moment the
  assignment is discharged.** walk-2026-08-16's leads named WORK-frame
  attribution as the defect and called rest-coast attribution "CORRECT
  throughout" — the exact inverse of the diagnosis. Falsified leads in a
  committed handoff are read by the next walk as findings. Reconcile the
  handoff in the PR that discharges it, same as a design handoff.
- **"Compares against photographed numbers" was not true, in the sentence
  written to prove we weren't grading our own homework.** #104's oracle is the
  machine's wire-reported TWD (legitimate, machine-authoritative), photo-
  corroborated at exactly one of nine points; the session's final total was
  never photographed (the finish-pair photo is untranscribed). The wire number
  is good evidence — the overclaim was free and would have been believed.
  **At this gate, ask which specific assertion the word "photographed" attaches
  to.**
- **The un-released stack at this gate: FIVE merges behind v0.9.0 (#99, #100,
  #101, #102, #104), and TWO of them independently lower the same number.** The
  canary is thrice-forfeited by recorded override. When two corrections to one
  number ride one tag, the release notes must name the direction ("totals read
  lower and correct") or the cohort cannot falsify either. As of this gate that
  sentence exists only in a PR body — grep confirmed it is absent from ROADMAP,
  RELEASING, releaseNotes.ts and docs/monitor.
- **Zero unreviewed tail is achievable and this is the first CR2 PR to have
  one** (HEAD `25614f4` = the whole-branch review's upper bound). Worth naming
  as the standard: the final review's diff range should END at the PR tip, and
  that is a two-command check.

## Final-PR gate, 2026-08-16 (Phase CR2 spec 2b, PR #105)

- **"Green CI is the floor" includes checking that CI EXISTS at the gate.** #105
  arrived at its gate `mergeable: CONFLICTING` with an EMPTY check rollup — a
  sibling PR (#104) had merged one minute after this branch's closing commit.
  Nothing in the branch was wrong; the gate would still have waved through a
  merge with no CI run against real main. Run `gh pr view --json
mergeable,statusCheckRollup` before reading anything else.

- **The propose-don't-write ledger rule has a predictable collision cost:** two
  concurrent PRs each carrying a proposed ledger entry conflict in the ledger
  file itself (#104 and #105 both appended to `antagonist-ledger.md`; product
  code was disjoint). The conflict is always resolve-keep-both, and it is not a
  signal about the code — but it will recur whenever two specs are in flight,
  and it silently suppresses CI on whichever PR merges second.

- **A "no wall-clock anywhere" criterion is checked at the CONSUMER, with the
  trap in the assertion.** Criterion 5's strongest evidence was not the new
  function but the e2e that seeds a day-old interrupted record and asserts the
  header reads the actuals-derived 11 MIN against a ~1445-minute wall-clock
  trap. A criterion phrased as an absence ("no wall-clock") is only falsifiable
  when a test constructs the input where the forbidden path would visibly
  differ — demand that shape, not a unit test on the replacement.

- **Un-released stack count at this gate: six** (#99 error-direction flip,
  #100 recorder, #101 stack fix, #103 docs, #102 axes, #104 rest-keying);
  2b makes seven. Spec 3 is the last gate before the phase build that carries
  all of it — its walk list is now the phase's entire canary and already owes
  four items (keystone, END finals, F6 reload check, plus its own).

## Design-gate rulings, 2026-08-16 (Phase CR2 spec 3, "redesign")

- **A wire field whose name says "total" is a claim, not a measurement — decode it
  out of a committed recording before shipping it to a rower.** Spec 3 arrived with
  a James ruling that CAL "ships real from the wire" because
  `AdditionalStatus2.totalCalories` (`app/domain/monitor/pm5/parse.ts:199`, 0x0033
  bytes 6-7) was already parsed. Decoding bytes 6-7 out of both walk-2026-08-16
  recordings took ten minutes and falsified it: the value **resets to 0 at every
  interval boundary**, coincident with `intervalCount` incrementing and with
  0x0033's own `elapsedSeconds` returning to 0. `session-1-keystone-2x250r0.jsonl`
  ends reading 15 for a session that burned ~30; `session-2-wu-4unequal.jsonl`
  resets four times and ends at 16 with a peak of 31. `parseEndOfWorkoutSummary`
  (`:347-364`) carries no calorie field, so there is **no machine-authoritative
  session calorie anywhere we decode** — an honest CAL needs the same register fold
  spec 1 built for distance. That parser's own header already states the rule the
  field name violates: this codebase reserves "total"/"session" for a CONFIRMED
  accumulated reading. **Concept2's field names are Concept2's claims; ours are
  earned.** This is item 0's exact shape, in item 0's own phase. James re-ruled on
  the corrected fact: CAL cut from spec 3.

- **A never-surfaced wire value that the fake hard-codes to 0 cannot be caught by
  any gate we own.** `transports/fake.ts:657` emits `totalCalories: 0`
  unconditionally, so every unit test, e2e and committed screenshot of a new CAL
  cell would read `CAL 0` and pass. Before endorsing "surface a value we already
  parse", grep the fake for it — a constant there converts the whole suite into
  agreement with itself (recurring failure #11 at the fixture layer).

- **Ask which SHARED component a "visual" spec is about to change.** Spec 3's 6px
  three-state progress bar and cut `UP NEXT` label live in `session/TimerRuler.tsx`
  and `components/UpNextStrip.tsx`, both consumed by the phone timer
  (`Timer.tsx:803,825`) as well as the connected pane (`PaneLive.tsx:232,234`). The
  handoff, PROVENANCE and the dispatch brief all describe the work as
  connected-only. A redesign scoped to one screen reaches a second product surface
  through any component the two share — enumerate the importers at the gate, and
  make fork-or-change an explicit spec decision. (Spec 3 ruled: fork.)

- **Cutting a display CAN retire a verification route even when it does not retire
  the number** (sharpening the 2026-08-15 ruling). `TOTAL M` leaves LIVE, GRID's
  headline has no session-metres cell, so session metres leaves the connected
  screen entirely — in the same build whose release-note obligation tells testers
  that totals "now read LOWER and correct", and against a phase exit that
  instructs the walker to photograph "session metres" beside the monitor. The
  value survives (the log sheet's SESSION line); the ROUTE a walker and a tester
  use does not. **When a redesign removes a readout, check the walk sheet and the
  release notes for instructions that name it.** (Spec 3 re-points both.)

- **A design that introduces a NEW CAPABILITY CLASS states which house rule it is
  overriding.** Spec 3's ~200ms pane slide would have been the first motion in the
  app — `@keyframes`/`transition`/`animation`/`prefers-reduced-motion` return
  **zero** matches across both CSS files — against `docs/design/README.md`'s "No
  animations… keep it calm" and the briefing's "no animation". An override is
  James's to make; a silent divergence in a spec is how a design system stops
  being one, and the override belongs in the design doc, not the spec. (James
  ruled: cut.)

- **Un-released stack at this gate: SEVEN merges behind v0.9.0** (#99, #100, #101,
  #103, #102, #104, #105); spec 3 makes eight. Version is **MINOR (v0.10.0)**, not
  patch — F6 adds a user-facing transaction and spec 3 rebuilds a primary screen.
  Notes PR before the tag, per the v0.8.0/v0.9.0 precedent. The phase walk is the
  entire canary and now owes six things: keystone re-run, a REST-BEARING row, END
  finals, the F6 reload check, the handoff's 8-item on-erg list, and a re-pointed
  session-metres comparison.

- **Measured blast radius of spec 3, for whoever estimates the next redesign:**
  ~3.3k lines of render/model code, ~1.4k lines of CSS (`index.css:5715-7908`; all
  49 selectors past the landscape query at `:7150` are `.connected-*`), ~10k lines
  of tests, and 10 byte-level frozen HTML fixtures (`app/e2e/fixtures/connected-*.html`)
  that all regenerate. One PR is still right — the segmented control is the shared
  spine of both panes and a split re-shoots every capture twice — but the exit
  criteria have to be a per-frame PROPERTY TABLE (2A/2B/2C/2D + stale +
  disconnected), not "implements 2A-2D". Frame 2D's `READY` word was lost exactly
  that way at spec 2a's gate.

## Phase-close gate, 2026-08-16 (Phase CR2, spec 3 / PR #109)

- **A walk sheet states its binding MEDIUM and its test list separately, and
  nobody checks that the medium can execute the list.** The CR2 exit runsheet
  bound the walk to Chrome + Web Bluetooth (correctly, for wire evidence) and
  reproduced the design handoff's 8-item on-erg list verbatim — five of the
  eight (mount both rotations, mis-hit the switcher, first frame deliberate,
  92px hero and 22px status at full pull) need a phone in a hand. The sheet
  flagged the one item Ruling 2 made moot and was silent on the other five.
  **At a phase close, read the walk's protocol against its own medium, item by
  item.** Sharpens the 2026-08-15 "the definitive hardware walk was a WEB walk"
  ruling: that transfers for NUMBER questions, where the wire is identical on
  both mediums. It does not transfer for a LAYOUT redesign — spec 3's own §1
  concedes "Chromium reports every `env()` as 0 so no gate can observe one",
  which means the e2e assertions, the 67 captures and the web walk are one
  oracle, not three. Device pass on the FAKE monitor from Xcode costs ten
  minutes, no erg time, and no build number.
- **A phase exit clause with no owner in the close-out queue is a dropped
  criterion, however well the code went.** CR2's exit says the carried debt is
  "either cleared or explicitly re-parked with a reason"; the block is eleven
  bullets with zero dispositions and the branch's ROADMAP diff never touched
  it. **Diff the phase's own exit sentence against the close-out queue, clause
  by clause** — the items that get dropped are always the ones no spec owns.
- **`.superpowers/` is git-excluded — anything filed only in an SDD progress
  ledger does not exist.** #109's one PARKED final-review finding
  (stale-while-armed on GRID) was in the PR body and that excluded file, and
  `git grep` found it in zero tracked files. Third occurrence of "a PR body is
  not a record" in three CR2 gates (the READY word at 2a, the lower-totals
  sentence at #104). **At every gate, `git grep` each parked item's own noun
  and confirm it lands in a tracked file before the worktree is torn down.**
- **A phase status paragraph can contradict itself inside thirty lines.**
  ROADMAP's CR2 section said spec 3 was IN FLIGHT at the top and "is not
  started" at line 1833 on the same branch. When a phase runs as multiple spec
  cycles, each cycle amends the top paragraph and nobody re-reads the body.
- **Zero-behavioural-line tails are now twice achieved** (#104, #109). #109's
  tail was comments, a test title and a DEVIATIONS row — the useful check is
  still `git show <tail> | grep '^+' | grep -v '^+\s*//'`, which took one
  command and settled it. Worth holding as the standard for a final PR.
- **Un-released stack at the phase's last gate: ELEVEN merges behind v0.9.0**
  (#99-#108 + #109), canary thrice forfeited by recorded override, v0.10.0
  MINOR. When a redesign REMOVES a readout in the same build whose notes
  correct that readout's number, the notes must carry the replacement route or
  the cohort reads the correction as a regression. (Here: totals read lower and
  correct, `TOTAL M` is gone from LIVE, look at the post-session summary and
  the log sheet's SESSION line.)

## Phase-open gate, 2026-08-17 (Phase CS slate: swipe returns, NEXT says more)

- **"The old code was missing X" is a claim about a DELETED file — `git show` it
  before building the fix on it.** The CS slate's central hypothesis was that the
  pre-spec-3 swipe failed for want of `touch-action`. `git show
3dc3b06^:app/src/index.css:6041` has `touch-action: pan-y` on the pane
  container, with a comment stating the exact rationale the spec proposed to
  introduce. The antagonist ledger said touch-action was UNTESTED; the spec read
  that as absent. The real candidate was in the same commit — the handler was
  `onTouchStart`+`onTouchEnd` only, no `touchmove`, no `touchcancel`, no
  dominant-axis check, committing on an event WKWebView never delivers once it
  claims the gesture. **A retired mechanism's own source is one command away and
  is the line that would falsify the claim.**

- **A better harness of the same class is not an answer to harness blindness.**
  CS's exit criterion 1 (Playwright `hasTouch` + CDP `Input.dispatchTouchEvent`,
  four drag shapes) is a test the repo's own standalone repro ALREADY PASSED
  while James's finger failed — CDP synthetic touch skips the arbitration that is
  the whole failure. Chromium+CDP is not WKWebView. **When a harness has lied,
  ask whether the replacement differs in CLASS or only in fidelity**; if only in
  fidelity, it is a regression pin and must be labelled one, never the gate.

- **Route a device-interaction question to the DEVICE, not to the erg.** CS sent
  a WKWebView gesture question through /hardware-walk — erg time, operator
  contract, a session — for a failure a PM5 cannot influence, with the criterion
  itself hedged "on the phone IF a phone pass is scheduled". The instrument was
  already ruled on at CR2's close: `VITE_ENABLE_FAKE_MONITOR=1 pnpm ios:build &&
pnpm ios:open` (build-time flag at `monitor/transports/index.ts:251`;
  `ios:build` = `vite build && cap sync`) puts the real surface in WKWebView with
  no erg, no TestFlight, no build number. **Probe on device BEFORE building the
  ladder when the mystery is unexplained** — and attach Safari Web Inspector to
  the WKWebView, which is the trace the failed attempt never had. Sharpens
  "the definitive hardware walk was a WEB walk": that transfers for NUMBER
  questions; for INPUT questions the only valid medium is the engine that failed.

- **A new display builder must enumerate the union it renders, not the examples
  the request mentioned.** CS item B specified four forms (distance work, time
  work, rest, FINISH) against `expand.ts:12`'s `"warmup" | "work" | "rest" |
"test"` — omitting WARM-UP, which this very surface flags deliberately per a
  checked-off James requirement (`ROADMAP.md:1697-1700`). Third occurrence of the
  property-table lesson (spec 3's frames, 2a's READY word). **Exit criteria for a
  string builder are a table over the type union × its optional fields.**

- **Re-deriving a value the domain already resolved is a second source of truth.**
  Item B proposed recomputing the split from `targetSplit` + `targetKind ===
"split"` when `EnginePhase.label` already carries exactly that set, and
  `expand.ts:42` documents these builders as reading `label` straight through.
  **Before adding fields to a display string, check whether the existing composer
  already holds the semantics you are about to re-encode.**

- **CSS truncation that already exists is not a design decision.**
  `.connected-band-upnext-value` was already `nowrap/overflow-hidden/ellipsis`
  (`index.css:6580-6587`); the spec presented ellipsis as its truncation choice
  while the real question — does the added field survive at the reference width —
  went unmeasured, with the field order sacrificing `@rate` first, one of the two
  things James asked to see. "Pixel-verified in screenshots" passes on a
  screenshot of a truncated line. **When a spec adds content to a fixed-width
  line, make "the new field survives on the reference frame at the library's
  longest string" the criterion.**

- **A retired phase code is a dead name — check the ROADMAP before reusing one.**
  "Phase CP" already means "the pause that isn't", folded into CR2
  (`ROADMAP.md:1884`, `:2005`). The slate reused it for "connected polish";
  renamed CS at the gate.

- **Un-released stack at this gate: ONE merge** (#114, release tooling, zero
  tester surface). The eleven-merge CR2 backlog is CLEARED — first clean slate
  since v0.9.0, and the reason CS can be an attributable release rather than a
  bundle. **Version PATCH (v0.10.2)**: swipe is additive to an existing control
  and the NEXT line is a richer string on an existing element — neither adds a
  capability class or a screen. If the device probe kills item A, item B ships
  alone and is worth shipping alone. Notes must NAME the swipe: a gesture nobody
  knows exists is not a feature, and this cohort already learned once that swipe
  does not work.

- **Backlog count at this gate: 24 unchecked items** — identical to the
  2026-08-13 audit. CS is executed, not filed, so this is not filing-as-deferral;
  but nothing has come off the pile in four days either.

## Phase-open gate, 2026-08-17 (Phase PW, post-workout summary — spec 1)

- **A nullable-ing migration is a CROSS-VERSION break, and this repo has no
  error boundary to soften it.** `grep -rn "ErrorBoundary|componentDidCatch|
getDerivedStateFromError" src/` returns zero. `Today.tsx:1464` renders
  `{log.held.toUpperCase()}`, so the first null-`held` row white-screens the
  app's home screen on every installed build. The web deploys on merge and iOS
  ships on tags, so the exposure window is "until the next tag", not "until the
  tester updates". `docs/RELEASING.md`'s additive-only rule is exactly this.
  **Ruling: the null-TOLERANT READ ships and TAGS before the writer merges** —
  a separate PATCH release, ~10 lines. Generalises: when a spec relaxes a
  NOT NULL, ask which SHIPPED build reads that column and whether it survives
  the value the new build can write.
- **A "shows in two places" claim is settled by counting consumers.**
  Spec 1 asserted the open F-1 defect stays observable in two places.
  `interruptedTotalSeconds` has exactly ONE consumer, and spec 1 replaces
  that meta line. One grep. Third occurrence of "a redesign removes the
  readout an open finding is observed through". **When a spec claims an
  instrument survives its own redesign, grep the instrument's consumers.**
- **An exit criterion that restates the definition cannot fail.** Spec 1's
  criterion 4 read "the DISTANCE cell equals the actuals' sum… proven against
  the wire" — while §2B DEFINED the cell as that sum. Recurring failure #11
  inside the sentence disclaiming it. The honest oracle already existed
  (the keystone's a-priori 500 + the machine's TWD in the recordings).
  **Read every criterion back against the property table it claims to
  verify; if the table defines the value, the criterion is a tautology.**
- **A UI spec can carry a number change in a table cell.** Spec 1's §2B TIME
  generalized the actuals-derived duration from the interrupted branch to
  every monitor session — testers' times read lower — stated nowhere but a
  table row, beside a §3 "rides along" paragraph folding in a persistence
  change the ROADMAP had already ruled triad. **Grep a design spec for
  number semantics before judging it a UI spec.**
- **A form's DEFAULT can be a safety rule, and a redesign that promotes it
  to a button loses it silently.** `useLogForm` seeds `outsidePlan` from
  `isOnboardingTitle` on 6I's "a baseline test must not silently consume
  plan session 1"; two buttons with an accent primary had no onboarding
  branch. **When a spec retires a control, read the control's DEFAULT and
  its initialiser, not just its two states.**
- **"Absorbs Phase X" is a claim to check against X's own text.** PW
  discharged LG's precondition (the direction ruling, now in source) while
  doing none of LG's three named pieces; the rower-facing collision
  survives unless the labels change — which is nearly free exactly now,
  while the control is rebuilt. Put to James as his §2D decision.
- **Reflection data has no consumer today — counted, not assumed.** held
  and pain are each read at exactly one site (Today's LAST THREE meta);
  nothing in plan/generation/trends touches them. Optional reflection
  degrades nothing live; the cost is thumbs arriving sparse for the phase
  that eventually reads it — told at that phase's open.
- **A phase can open with no roadmap section.** PW's opening commit added a
  spec and a handoff; grep "Phase PW" ROADMAP.md returned zero, LG still
  said "needs a brainstorm", and CR2 still listed merged PRs as "remaining
  before the tag". **At every phase-open gate, grep the ROADMAP for the
  phase's own name.** (Fixed in the same revision that landed this entry.)
- **The phone pass now carries four owed items against a SHIPPED tag**,
  plus F-1's re-observation. An obligation deferred to "the phone pass"
  survived the release it was meant to gate. Count it at the next gate.

## Final-PR gate, 2026-08-17 (Phase PW spec 1, PR #117)

- **Open the committed capture and do the arithmetic on it.** #117's flagship
  `log-monitor.png` shows AVG SPLIT `1:15.0` above its only interval reading
  `1:52.0` — 37s/500m apart. The hero derives `500×Σt/Σd` (correct); the row
  prints the wire's `actual.avgSplit`, which `transports/fake.ts:747` echoes
  from scenario data unrelated to its own distance and time. Six task reviews,
  a whole-branch review and a re-review all passed. Recurring failure #7 says
  "look at the image"; sharpen it to **recompute the headline from the rows in
  the same frame** — a capture of a screen whose whole job is deriving numbers
  is checkable by eye in ten seconds, and nobody did it.
- **When a headline is OURS and the rows are the MACHINE's, that split is a
  product fact James must be told.** PW's summary derives the hero and prints
  the wire per row; the spec's vetted `avgPace = 500×t/d` identity is the only
  thing keeping them equal. Whenever a screen mixes derived and reported
  values, name the seam in the PR body — the fixture that violates the
  identity is exactly what a hardware disagreement will look like.
- **A judged colour language must not reuse the accent.** `--judge-slower` is
  the rust accent, so a faster-than-target hero renders in the same red as
  "SLOWER" and as a selected pain button, on the screen that introduces the
  legend. Check a new semantic colour against every existing use of its token
  before shipping the legend that defines it.
- **An abstention needs an ABSENCE, not an empty widget.** The lone-measured-
  row-unjudged ruling was right (one row = the average = a fabricated zero bar)
  and shipped as an empty track with a centre tick, on BOTH connected captures.
  The spec's own §2B ("inputs absent → cell ABSENT, siblings close up") and its
  §2E warm-up row already had the idiom. **When a ruling says "we cannot judge
  this", check that the render says nothing rather than showing an empty
  version of the thing it refused to compute** — otherwise the ruling reaches
  the rower as a bug report.
- **The #105 empty-check-rollup trap recurred exactly as predicted**, from the
  predicted cause: both agent ledgers conflicted (propose-don't-write across
  concurrent PRs) alongside ten regenerated captures, and the branch reached
  its PM gate with `CONFLICTING`/`DIRTY` and zero CI. Second occurrence in two
  weeks. `gh pr view --json mergeable,statusCheckRollup` stays the first
  command at every gate — and note that PNG/ledger conflicts can mask a
  SEMANTIC overlap (#116 touched two files this branch also touched) that no
  textual merge will ever surface.
- **Good practice worth copying from this PR:** the "times read lower"
  obligation landed in ROADMAP.md and the walk RUNSHEET, not just the PR body —
  the first CR2-lesson application that stuck. And the DISTANCE oracle is three
  external machine totals (500/1599/808) with the work-only regression named in
  a test title. That is the standard for a triad number change.

## Phase-close gate, 2026-08-18 (Phase CS: swipe returns, NEXT says more)

- **A phase can run two PRs, a probe, a hardware walk and a release and still
  not exist in the ROADMAP.** `grep "Phase CS" ROADMAP.md` on main returns
  ZERO at the phase's close gate. Second occurrence in two phases — the PW
  open gate caught the identical thing and its ledger entry says to grep for
  the phase's name at every OPEN. **Extend it to CLOSE**: the open-gate grep
  only catches phases whose open ran a gate, and CS's did. The cost is not
  bookkeeping: the phase's documented limit, its "the fake cannot drive a
  native build" fact, and both its follow-ups had no section to be re-read
  from.

- **Split a paired feature request before judging it; the pair is usually the
  disguise.** Testers asked for live TOTAL METERS and AVG SPLIT together.
  They differ on every axis: total metres is OUR accumulator (`types.ts`
  calls `sessionDistanceMeters` "A DISPLAY ESTIMATE, never a record",
  zero-frame intervals lost silently — the Sun-fret instrument), while avg
  split is the MACHINE's, already decoded from the wire at ~2Hz. One is
  derived and has been wrong by 3.9x; the other has the monitor beside it as
  its own oracle. One is retrospective and duplicated by TOTAL LEFT; the
  other is decisional. **Ruling: build the avg split as one small
  connected-polish cycle; live total metres does not get built.**

- **Before designing against a tester request, check whether the answer
  shipped yesterday.** The v2 recommendation's own disposition for TOTAL M
  was "Restore it on the summary screen, where it's actually read" — and
  v0.11.0's notes (merged 2026-08-17) say "Total meters is back... Check them
  side by side after any session." The requests predate the build. **A
  request answered by a release nobody has installed is not evidence of a
  gap.**

- **An unanswered question in a design handoff outranks a later argument
  about the same object.** The v2 recommendation asked: "Does the erg's own
  PM5 screen stay visible behind the phone on your mount? If it does, TOTAL M
  and possibly rate are duplicated hardware." Nobody answered it in three
  phases. One photograph on the next walk settles the whole item, cheaper
  than any design round. **At a gate, grep the governing handoff for its own
  open questions before re-litigating what it decided.**

- **Same-named wire fields at different scales are a shipped-wrong-number
  waiting to happen.** `0x0038`'s `splitIntervalAvgPace` is 0.1 sec/lsb;
  `0x0033`'s is 0.01 — "printed identically in both copies of this
  characteristic's table" (`parse.ts`). Plus a Last Split checkpoint measured
  to read zero through interval indices 0-1 (`pm5-interface-notes.md`). Any
  spec that surfaces one of these split fields gets a full antagonist pass on
  WIRE SEMANTICS even though it is not triad, and must prove the field is
  scoped to OUR interval, not the PM's split, against a committed capture.

- **Phase LG should have closed and did not.** ROADMAP says "ABSORBED INTO
  PHASE PW... This section stays until PW ships the label decision, then
  closes with a pointer." PW spec 1 merged (#117) and v0.11.0's notes carry
  the labels. **A section with a written self-closing condition needs someone
  to check the condition** — nobody owns "close when X happens". LG is now a
  MAGNET for misrouted work (this gate was asked to fold connected-screen
  metres into it); its only survivor is the triad-gated `MONITOR_SPM_MIN`.

- **A gesture with no affordance is a release-notes feature, and that inverts
  batching.** Swipe is invisible until named. Batching it into a larger
  release makes it LESS discoverable (item 8 of 8), not more — the argument
  for cutting an attributable PATCH for one merge. Ruling: no in-app
  affordance (the rail is the discoverable path; the v2 redesign cut six
  objects off this screen and the house bars animation), and **the notes ASK
  the cohort whether they found it unaided** — one sentence turns the release
  into the discoverability experiment.

- **A platform limit belongs in the notes when a tester will hit it AND
  misread it.** Superseded in part by the same day's antagonist exit pass,
  which found the "platform limit" framing unproven — but the TEST stands and
  is the durable part: does a tester hit it, and will they misread it? Where
  the cause is unsettled, say what the rower should DO, never why.

- **"A PR body is not a record", fourth occurrence in five gates.** #116's
  Record block filed the e2e stack-reap race as "a phase-close follow-up";
  grepping ROADMAP.md, CLAUDE.md, .claude/ and app/scripts/ returns ZERO
  tracked files.

- **A defect found ON DEVICE and fixed OFF it is the release's one unverified
  change.** The `user-select`/`-webkit-touch-callout` fix came out of the
  phone walk and shipped verified by a Chromium computed-style pin.
  **Generalise: when a walk finds a defect, the fix's verification medium
  must be the walk's medium, not the suite's.** Also note `user-select: none`
  inherits into the connection log sheet — `COPY LOG` is now the only way to
  get that text out.

- **When a phase's release guidance is written at OPEN and a parallel session
  cuts a tag mid-phase, the guidance is stale by default — re-derive it at
  close, never quote it.** CS's spec said "v0.10.2 PATCH at phase close";
  by close, main was at v0.11.0 with half of CS already released in it.
  Un-released stack at this gate: ONE merge (#119). Recommendation: v0.11.1
  PATCH.

- **Backlog count at this gate: 24 unchecked ROADMAP items** — identical at
  CS open and at the 2026-08-13 audit. Three audits, five days, zero net
  movement. CS was executed rather than filed, so this is still not
  filing-as-deferral; but the pile has been provably static across two
  executed phases, and the next new-phase proposal should be answered with
  this number.

## Final-PR gate, 2026-08-18 (PR #121, PW spec 2 "from the log" — triad)

- **An additive-only migration means the tester's ENTIRE existing corpus
  renders in the degraded branch on install day.** Heroes and plan linkage
  are written only by new saves, so James's whole history opens number-less,
  with untappable checkmarks, and the headline feature is invisible until he
  rows again. The PR framed each absence as a virtue mid-bullet ("rather than
  invented stand-ins") and captured only the best case. **Rule for any
  write-forward-only feature: the notes say it in one plain sentence, and one
  capture shows the OLD-row state, not the seeded ideal.**
- **Browsable + immutable + no DELETE = permanent.** This PR made every log
  reachable and stored three client-supplied numbers that the server bounds-
  checks but cannot truth-check; the measured record is immutable by design
  and `data.ts` has no delete route. A Sun-fret-class wrong number is now
  permanent and visible forever. Filed as a ROADMAP item at this gate; the
  next spec that adds stored numbers should answer "how does a rower correct
  or remove this?" before it ships, not after.
- **Recompute-the-headline paid again, this time GREEN:** `log-detail.png`
  reconciles exactly (1500+1500 m, 780 s, 500×780/3000 = 2:10.0, deviations
  ±10.0). The technique is cheap enough to run on every capture, pass or fail.
- **A phase-close release recommendation that nobody cuts orphans that gate's
  other rulings.** CS's gate said v0.11.1 PATCH and asked that the notes probe
  swipe discoverability; no tag was cut, so the ask now has to ride v0.12.0 or
  die. **At every gate, diff the last tag against main and check whether a
  prior gate's notes-ask is still unshipped.**
- **"A PR body is not a record", FIFTH occurrence in six gates** — #121's
  Record block carried an unexplained `today.png` onboarding read-marker diff
  and the no-delete gap, neither tracked anywhere. This one is now frequent
  enough to belong in CLAUDE.md's recurring-failures list, not here.
- **Good practice worth copying:** criterion 4's e2e takes the log id from the
  real anchor's `href` after a save through the shipped button, then reopens by
  id after Reset — an oracle that cannot pass by agreeing with client state.

## Final-PR gate, 2026-08-18 (PR #123, Phase CM connected metrics — triad)

- **My CS ruling ("live total metres does not get built") is ANSWERED, and the
  thing that answered it was not a test.** The number had already shipped in
  v0.10.0 and was walk-verified on hardware ("keystone totals within 0.2m");
  this PR gave an existing, externally-checked number a second render site.
  **Generalise: when a gate objects to surfacing a derived number, ask whether
  that number is already surfaced and already externally checked somewhere
  else.** "Restoring a render site" and "inventing a number" are different
  risks and I judged the second when the first was true.
- **The residual my objection was actually about survives, narrowed:**
  `types.ts` calls `sessionDistanceMeters` "A DISPLAY ESTIMATE, never a
  record: an interval that produces ZERO frames is lost entirely". No replay
  capture can exercise that loss (they all have frames), and one photograph
  cannot either. Bounded, non-compounding, under-reporting — accepted, but it
  is the one place the live counter can still be wrong.
- **Two independent derivations of the same user-facing quantity now ship on
  two screens of the same app, and nothing compares them.** Live counter =
  the driver's max-merge accumulator; summary DISTANCE = Σ over IntervalActual
  records (`summaryModel.ts`), event-sourced from 0x0037/38, different
  failure mode. Sun fret's exact shape, inside our own app. The PR asserted
  they match as a fact in its first bullet. **Rule for any gate: when a PR
  claims two of our own numbers agree, find both derivations and check whether
  anything in the branch compares them. A replay harness that stubs
  `actuals: []` cannot.**
- **The cheapest fix for a cross-screen number claim is a walk the walk is
  already doing.** Photographing the summary screen right after the session
  puts monitor + live counter + summary DISTANCE on one record for zero extra
  rowing. **At every walk-gated PR, ask which claims can be settled by a screen
  James lands on anyway.**
- **A rule the rower cannot learn from the screen is a release-notes
  obligation, never a screen-copy one.** The AVG verdict appears only at rest;
  the pane teaches it implicitly (the split hero mirrors to 0 in plain ink at
  the same instant the AVG lights, so attention visibly hands over), but the
  RULE is not derivable. CR2 cut six objects off this screen — adding a label
  back to explain a rule undoes that for the wrong reason. Notes, one sentence.
- **"11% of the library" hid the part that mattered.** 33 of 300 workouts never
  show the verdict — but 29 of the 33 are O2 and zero are AN. The limit lands
  hardest on the steady piece a casual rower is most likely to row first.
  **Percentages of a library are not tester impact until they are broken down
  by what people actually row.**
- **A PR body that quotes the screen must quote the SCREEN.** #123's headline
  bullet code-fenced `TGT 2:13.0 · AVG 2:11.8`; the shipped row reads
  `2:06.0  6K +4  AVG  2:08.4`. CR2 deliberately deleted the word TARGET, and
  the spec carried the same shorthand from an old handoff, so the wrong string
  survived a full spec pass, five task reviews and a whole-branch APPROVE —
  every one of which read the spec, not the PNG. **Check the code-fenced
  strings in a PR body against the committed screenshot; nothing else will.**
- **Roadmap absence, THIRD occurrence: `grep "Phase CM" ROADMAP.md` = 0**, after
  CS (close gate) and PW (open gate). Backlog held at **24 unchecked items** —
  identical at the 2026-08-13 audit, CS open, and CS close. I have twice read
  the static count as "the pile is not shrinking". **The correct reading: two
  consecutive phases were designed, built, reviewed and released without ever
  entering the roadmap, so the count CANNOT move.** ROADMAP.md has stopped
  being where the work is tracked, and the count is no longer evidence about
  filing-as-deferral either way. Next gate: report the count AND the number of
  shipped phases missing from the file. (Controller's note, same day: CS and
  CM sections were added to ROADMAP.md at this gate's direction; a fourth
  occurrence graduates this to CLAUDE.md's recurring-failures list.)

## Final-PR gate, 2026-08-18 (PR #124, log-delete — triad: first DELETE + a counter write)

- **A gap named in a spec is not disclosed until it is in the NOTES.** The
  delete-and-re-log-stamps-today gap was in spec §4 and correctly in ROADMAP
  (first gate in six where nothing had to be rescued out of a Record block) —
  and still absent from the release-notes clause a tester actually reads. The
  full disclosure chain for an accepted limit is THREE places: the spec (why),
  ROADMAP (who picks it up), the notes (what he does about it). Two of three
  is the normal failure.
- **Two variants of the same destructive copy must name the same loss.** The
  plan-linked confirm said "This removes the session. If it is your latest
  plan session, the checkmark un-ticks"; the unlinked one said "…and its
  reflection". Same deletion, two mental models of what a session IS, and the
  reflection was on screen above the confirm. Check destructive copy variants
  against EACH OTHER, not just against the spec's table.
- **A hedge is the honest answer when the server decides — but check what the
  screen gives him to resolve it.** "If it is your latest plan session" is
  unavoidable (cross-device staleness makes advance agreement impossible), and
  the from-the-log view shows `SESSION 1 OF 84` with no done-count. Accepted:
  a wrong guess fails in the conservative direction (tick stays). The rule:
  when copy hedges on a condition, say whether the screen shows the condition,
  and whether being wrong is safe.
- **A QUEUED entry that SUPERSEDES shipped documented semantics needs the
  superseded text to point forward.** The tule-fog target-judgment entry
  reverses spec 1's R-C/R-E row semantics and #117's column removal; spec 1
  said nothing. This is Phase LG's "self-closing condition nobody owns" in a
  new costume — the next reader of spec 1 believes the old rule. (Closed at
  this gate: spec 1's Measured-row cell now points forward.)
- **A fix round that makes a condition red-provable is the gate working.** T1
  review found condition 1 (plan key) unfalsifiable — every fixture declined
  via condition 2 first — and the isolating Switch fixture was added and
  live-mutation-verified against real Postgres. Copy this: for an N-condition
  rule, ask which conditions can only be reached PAST the earlier ones.
- **Recompute-the-headline: GREEN again** (`log-delete-confirm.png`: 1500+1500 m,
  13:00, 500×780/3000 = 2:10.0, deviations ±10.0). Third consecutive run,
  ten seconds each.
- **Release stack at this gate:** v0.12.0 is the last tag with ZERO merges
  since. Recommendation on merge: v0.13.0 MINOR (new capability, additive route).

## Phase-open gate, 2026-08-18 (Phase LT slate: the log screen tells the whole truth)

- **A spec that fixes "the target was invisible" can re-commit the same defect in
  the field it adds.** LT spec 1 declined a target-SPM cell because "the target
  rate already lives in the row label's authored text" — `refPaceLabel`
  (`logDraft.ts:199-201`) is `${duration} @ ${refLabel(ref)}`, a pace reference
  with no rate in it, and the only text renders of `spm` are `StepRow.tsx:92` and
  `Today.tsx:751/769`, neither of them the log row. **When a spec adds a MEASURED
  value, grep for where its TARGET renders before accepting "it's already shown".**
  One command, and here it was the same defect the spec exists to close.
- **A bug REPORT and a bug INVESTIGATION are different scope, and folding an
  unreproduced one into a triad spec makes the triad hostage.** §3's early-END
  discard item was "reproduce and record what you find" inside spec 1's exit
  criteria. The repro was largely readable at source: `monitorModeRun`
  (`LogSession.tsx:249-263`) returns null on any of four conditions, and the
  fallthrough door is the one with `discardSlot={null}` (`:1218`). **Read the gate
  before scheduling the walk;** if the fix is one door, it ships ahead of the
  triad, not behind it.
- **A QUEUED item's stated sequencing is a ruling.** James scoped the discard
  round "its own bugfix round AFTER PW spec 2 merges" (ROADMAP). #121 merged, so
  it was unblocked and standalone — folding it into a triad spec silently reversed
  his own scoping. Check a queued entry's own sequencing sentence before absorbing it.
- **Phase LG, third gate running, still had not closed** — its self-closing
  condition fired at #117 and its last survivor (`MONITOR_SPM_MIN`) is now taken by
  LT, while ROADMAP still read "Owner: Phase LG". A section with a self-closing
  condition needs a named owner or it accumulates orphans forever. (Closed in the
  same revision that landed this entry.)
- **Roadmap absence, FOURTH occurrence** (`grep "Phase LT" ROADMAP.md` = 0, after
  PW-open, CS-close, CM). Graduated to CLAUDE.md recurring failure 15 in the same
  revision.
- **Backlog: 30 unchecked, up from 24** at the 2026-08-13 audit, CS open and CS
  close. First movement in five days, and it is upward.
- **Release stack at this gate: TWO merges past v0.12.0** (#123, #124), with #124's
  accepted gap owed a notes sentence by the three-place disclosure rule. Cut
  v0.13.0 MINOR before LT spec 1 opens a PR (James has assigned the tag to the
  other session; the notes obligations are in tracked files for it).

## Final-PR gate, 2026-08-19 (PR #129, LT spec 1 — triad: row re-baseline + actualSpm split)

- **The flagship capture showed every cell the spec named and none of the COLOUR
  the phase exists to add.** `post-workout-summary.png`'s fixture is warm-up +
  prescribed + abstained: TARGET cell ✓, SPM cell ✓, zero judged rows. `log-detail.png`
  carried the blue/red, so the surface with a picture is HISTORY and the surface that
  produced James's bug report has none. Criterion 5 said "a mixed judged/on-target/
  abstained list" and four reviews read the assertions (`toHaveText("/ 22")`) rather
  than the fixture's row inventory. **At any gate: read the capture's FIXTURE for the
  state under test, not its assertions — assertions prove the cells render, only the
  fixture decides whether the feature is in frame.** Second occurrence of the standing
  "no committed picture of its judged state" follow-up.
- **A tag cut hours before the gate can already be missing notes.** `v0.13.0` points at
  main INCLUDING #128 (LT-0's discard) and its message names neither that nor #124's
  accepted re-log gap — the notes leg of the three-place disclosure chain failed on the
  very next tag after the rule was written. **Check the LATEST TAG's own message against
  what it contains at every final gate**, not only when cutting one; an unshipped tag
  message is amendable, a shipped one is not.
- **Recompute-the-headline: GREEN on `log-detail.png`, fourth consecutive run** (7:58,
  4×500 m = 2000, 478/4 = 1:59.5, and all four row judgments recomputed against their
  inline targets: −10.0 / +10.0 / on-target / abstain). The second capture could only be
  reconciled under a working-only AVG definition — **when a hero and its rows disagree,
  first ask which SUBSET the hero is over; a warm-up row is the usual answer.**
- **Absence as the ON TARGET idiom means the rower's best outcome renders as nothing,
  while the new aria-label speaks it.** The a11y fix gave screen readers a judgment
  sighted users don't get. Specced and vetted; recorded so the next log-screen spec
  starts from it rather than rediscovering it.
- **Drift discipline done right, for reuse:** one exported constant, a re-export at the
  second surface, and a test that greps the second surface's SOURCE for any assignment
  (both directions, regex verified red). Copy this shape for any "one value, two
  surfaces" claim — an equality assertion alone passes after a copy is made.
- **Backlog/process:** LT is IN ROADMAP (RF16 graduated, no fifth absence). Release stack:
  v0.13.0 is the tip tag; #129 merges as v0.14.0 MINOR, notes owed to `v0.13.0..main`.

## Final-PR gate, 2026-08-19 (PR #130, LT spec 2 series capture — triad: two stored shapes + an invented mechanism)

- **CORRECTION to this ledger's own 2026-08-19 entry: `v0.13.0` = `e22bc31`
  (#126). #127, #128 and #129 all landed AFTER the tag.** The claim that the
  tag "points at main INCLUDING #128" was false, and ROADMAP inherited it as
  "(#128 — RETROACTIVE, v0.13.0's tag message never announced it)". A tag
  message CAN be wrong (that finding stands); this one was not. **Settle tag
  membership with `git merge-base --is-ancestor <sha> vX.Y.Z^{commit}`, never
  by reading either the tag message or a previous ledger line.**
- **A risk note carried up "deliberately" into a collapsed `<details>` is not
  disclosed.** The route-scoped 1 MB parser registers before `originCheck`/
  `requireUser`, so the pre-auth buffer ceiling went 100 KB → 1 MB. Correctly
  named, correctly accepted, and living in the single least durable place in
  the repo. The three-place rule (spec / ROADMAP / notes) applies to ACCEPTED
  ENGINEERING limits too, not only to rower-facing gaps; where no notes clause
  is owed, two places still are.
- **"Rower-invisible" is a claim about RENDERING, and a gate must test it
  against LATENCY and STORAGE separately.** This spec renders nothing and is
  honestly declared so — yet the save now uploads ~190 KB more and the phone
  record grows ~200 KB. Both are safe by construction. The PR top said
  "nothing to see yet" and stopped. **At any invisible-capability gate, ask
  the three questions separately: does he SEE it, does he WAIT for it, does it
  crowd something out.**
- **A PR headline naming a data stream nobody has witnessed is the same defect
  class as quoting a screen the capture disproves.** Line one claimed heart
  rate is recorded; the spec's own §4 says belt delivery on James's PM5 is
  unwitnessed, so `hr` will be absent for every tester. **Check headline nouns
  against the spec's own unwitnessed list.**
- **Device items appended to a CLOSED phase's runsheet are correctly HOUSED and
  wrongly INDEXED.** S2-iOS, the persist() grant and the fast-rate re-measure
  went onto `walk-phase-cr2-exit/RUNSHEET.md` (right — it is the standing phone
  pass, still owed), with nothing in Phase LT pointing at them. **A phase that
  parks work on another phase's sheet owes its own section a pointer**, or its
  close gate cannot find its own open items.
- **Capture-before-render sequencing carries an irreversibility the value
  question usually misses.** Nothing reads this data until spec 3, so a
  device-specific recorder defect is invisible AND permanent: the frames
  evaporate, the measured record is immutable, PATCH refuses `series`. Ruling
  at this gate: the three device items land BEFORE spec 3 is implemented.
  **General form: when a spec starts CAPTURING something before anything reads
  it, ask what corrects a bad capture later. If the answer is "nothing", the
  device check moves in front of the renderer, not behind it.**
- **§4's assumption table is the model to copy for any storage-touching spec.**
  Seven claims, each with an evidence class and a named check, each check a
  red-provable deliverable in the plan. It caught more than it was aimed at:
  a task-2 review observation added a PARSE-side perf probe (720 KB at mount on
  three surfaces) that the spec's own write-side S4 row never asked for.
- **Release stack at this gate:** v0.13.0 is the tip tag; #128, #129 and (on
  merge) #130 all ride **v0.14.0 MINOR**, range `v0.13.0..main`, four clauses,
  none new from #130. The tag message must not name series capture.

## Phase-open gate, 2026-08-20 (Phase LL: the BLE lost-link brick, TestFlight 688)

- **"Should we pull the build" is usually the wrong axis — ask first whether the
  build OWNS the bug.** v0.14.0 was cut hours before a link-loss brick was found
  on it, and `git diff --stat v0.13.0 v0.14.0 -- app/src/monitor/transports/
app/src/adapters/` is EMPTY: the native BLE arm is unchanged since v0.10.0.
  Rolling back would have shipped the same defect minus five notes clauses. Run
  that one command before any pull/hotfix conversation. Second half of the same
  point: expiring an internal TestFlight build stops NEW installs and does
  nothing for a device that already has it, so with a cohort of one the lever
  does not reach the only affected person.
- **The delete-and-reinstall workaround is DESTRUCTIVE, and that is what sets
  the cohort threshold.** A reinstall wipes `ergomatic.monitorRun`,
  `ergomatic.sessionRun` and `ergomatic.sessionDraft` — an unlogged session and
  an in-progress draft. At N=1 (the developer, who found it) accept-and-fix is
  right; at N=2 "delete the app" costs a tester a row and must not be issued
  until a non-destructive recovery door exists.
- **"Deleting the app fixed it, therefore app-local state" is a guess about a
  BOUNDARY, not a mechanism.** A full `setItem` census proved NO persisted key
  in this app is an input to `scan()`, `connect()`, `program()`, or any driver
  decision: `lastMonitorDevice` stores a device NAME for a caption (and IS read,
  in `WorkoutDetail.tsx:196/302` — the dispatch's "nothing reads it" was wrong
  twice over), and a stranded `monitorRun` only raises a panel whose "Connect
  anyway" proceeds unconditionally (`ConnectAction.tsx:104`). A `localStorage`
  clear would have fixed nothing. **Reinstall clears more than localStorage;
  before designing against a storage hypothesis, enumerate what else that
  boundary resets.** The force-quit-surviving residue remains UNESTABLISHED and
  is most likely iOS-side.
- **A screen that "never changed" can be a PROOF, not a mystery.** `1 OF 3 ·
READY` is structurally impossible once `phase === "disconnected"`
  (`surfaceModel.ts:787`; `ConnectedSurface.tsx:404-410`;
  `connectedAxes.ts:145-146`), so its persistence proves the phase never moved.
  When a surface is state-derived and exhaustive, read the derivation backwards
  before hypothesising about rendering.
- **The app's only field diagnostic sat downstream of the door the bug locks.**
  `MONITOR LOG · COPY` lives on the log screen (`LogSession.tsx:668`), reachable
  only after a session finishes. Sharper than "TestFlight can't self-diagnose":
  ask WHICH surface a diagnostic is reachable from, and whether the failure
  under study can prevent reaching it.
- **A triggered follow-on whose trigger has fired and which stays a follow-on IS
  filing-as-deferral.** "Reconnect and background scan, five pieces" fired twice
  (Capacitor BLE landed in 7D; a tester reported a mid-piece lost link now).
  Promoting it to a phase is the disposal — but only if the follow-on entry is
  DELETED in the same commit. Two homes for one body of work is the CP/CR2
  mistake.
- **Restore a descoped posture before replacing it.** The shipped stance is a
  reviewed "lose and degrade" (DEVIATIONS rows 75/82) whose `LOST THE MONITOR`
  banner already exists — and had never fired on native, because detection is
  entirely event-driven off a plugin callback iOS need not deliver, with no
  frame-silence watchdog anywhere. Ruling: Phase LL scopes detection, recovery
  and diagnosability; RECONNECT IS OUT, and MISSED rows stay out with it
  (DEVIATIONS 82: they exist only to catch what a reconnect BACKFILL fails to
  fill). No `RECONNECTING` copy before the thing it promises exists.
- **The fake cannot currently prove a reconnect works**, and our own record says
  so: the web arm's GATT-cache `InvalidStateError` "would have broken the
  driver's whole reconnect path on real hardware while passing CI, since the
  fake had no handle invalidation" (`pm5-interface-notes.md:2502-2505`). Any
  future reconnect work owes the fake a handle-invalidation model FIRST.
- **A runsheet prediction was measured false, third occurrence of the class.**
  `walk-phase-cr2-exit/RUNSHEET.md:196` predicted that on a pre-stroke link kill
  "stale beats armed in the axes' precedence, so the armed protections drop".
  The stale axis never engaged at all. Record the result into LT's close before
  the walk is signed off, or the next reader inherits a falsified prediction as
  a finding.
- **Backlog: 35 unchecked, up from 30** (LT open) and 24 (2026-08-13); 14
  triggered follow-ons; PROD and LQ both created 2026-08-20 with zero checkboxes
  between them, plus #134's CL2 split. Still moving the wrong way.
- **Sequencing ruling:** LT close → LL → CL2 → LQ → PROD. LL displaces CL2 (two
  items after #134's split, and its gap has a stated workaround — the `xN`
  grammar already parses via import, `bulk.ts:268`). LL is a PROD PRECONDITION:
  PROD's exit ("an empty-phone install that reaches a logged row without a hand
  from us") is unreachable while a link drop bricks the app.

## Final-PR gate, 2026-08-20 (PR #140, Phase LL trace-truth task 1 — triad: what a stored number means)

- **A PR body can misreport the record, not just under-use it. RF14's sixth
  occurrence in seven gates, and a new mutation.** #140's bullet 5 said the
  unrepairable-corpus limit "is written into DEVIATIONS and the spec." The
  spec, yes; DEVIATIONS, no (`git diff --stat -- docs/design/DEVIATIONS.md`
  empty, `grep -iE "under-run|corpus|pre-fix"` exit 1); ROADMAP, no. The
  previous five were findings STRANDED in a Record block. This one ASSERTED a
  durable artifact that did not exist, which is harder to catch because it
  reads as compliance. **At every gate, run the grep — do not accept the PR's
  own claim that a row exists.**
- **"No before/after is observable" is the wrong test for whether a notes
  clause is owed.** Spec §5 declined a rower-facing clause for the fold on
  that ground. Overturned. The question is not whether he can SEE the fix; it
  is whether he now HOLDS records he should not trust — and the spec itself
  says he does. Two things settle it: this repo has shipped the old-corpus
  clause twice (v0.12.0, and `releaseNotes.ts:28` for this very feature four
  days earlier), and #124's three-place rule binds accepted limits to the
  notes. Chain at this gate was ONE of four.
- **"Never confirmed on hardware" is a claim about our SEARCH, not about the
  erg — grep the interface notes before parking a walk item.** #140's tail
  commit told ROADMAP the PM5's work→work elapsed/distance reset had never
  been seen on hardware. `pm5-interface-notes.md:3268-3271` (+ §19.1's
  correction at :3290) records it under `TWO_TIME_NO_REST_PROGRAM`, two 60s
  TIME intervals `restSeconds: 0` on both, state `"rowing"` throughout, elapsed
  resetting to 0 — "the one and only elapsed-reset-while-rowing in the whole
  log," 2026-08-06. Only DISTANCE is still open. A walk item that overstates
  what is unknown buys an erg session to re-observe a settled fact.
- **Digit-identity between an edge-triggered and a level-triggered accumulator
  over the same capture is EVIDENCE ABOUT THE WIRE, not just a regression
  pin.** The old recorder detects boundaries only by a backward elapsed jump;
  the new one keys on the index. If they agree digit-for-digit on a capture
  containing a key change, a reset must have occurred there. Reach for this
  before scheduling hardware.
- **A fixture can permanently disarm the recompute-the-headline check, and say
  so in its own comment.** `log-monitor.png` shows a chart topping out at
  ~1:38 beside a measured row reading `1:15.0`, because `screenshots.spec.ts`
  scripts `avgSplit` "independent of the raw elapsed stream." Any future
  reviewer running the check gets a false RED. Trace spec §7 criterion 7
  ("values reconcile with the session's own TIME hero in the same frame") is
  unsatisfiable on this fixture. **When a capture's two numbers are produced by
  independent paths, the check is dead on that screen — find out before
  writing an exit criterion that depends on it.**
- **The "reads aloud in 30 seconds" rule has never been applied and cannot be
  as written.** Above-the-fold word counts since it landed 2026-08-16: #124
  229, #131 268, #129 269, #140 325, #137 334, #130 353, #117 373, #123 472.
  Budget is ~75 words. Zero failures in seven, three of those gates mine.
  Declined to fail #140 for being the median. **Rules for CLAUDE.md, not here
  — James: either re-set the number (~150 words / 60s, which would bite #117
  and #123) or drop the clock and keep the voice test.**
- **Release call:** NO tag on this merge. `v0.14.0` (tagged 2026-08-20 06:58,
  TF 688) has ZERO product code after it; this PR would be the first. Declined
  the CR2 solo-canary precedent deliberately — that canary worked because a
  tester could check it against the erg, and here nothing is observable, so a
  solo tag is a version number with no falsification value. Next tag
  **v0.15.0 MINOR** on task 3, two clauses (axis+rest marking; old corpus).
  **Trigger to revisit:** tasks 2+3 slipping past ~a week, or a brick fix
  tagging first — B4 puts the trigger threshold at 0.81s against a measured
  worst gap of 0.810s, so wrong traces accrue on ordinary jitter, not on rare
  events.
- **Backlog: 37 unchecked (up from 35 at LL open, 30 at LT open, 24 on
  2026-08-13); 15 triggered follow-ons.** Still moving the wrong way, and LL
  now carries two bodies of work — the brick it was opened for (a PROD
  precondition) and trace truth, inserted as spec 1 AFTER the phase-open gate
  ran on a slate that did not contain it. The triad override caught it here,
  at the most expensive moment. **A spec inserted at the front of an open
  phase deserves a slate re-gate, not just its PR gate.**

## Phase-open gate, 2026-08-21 (Phase WU: the warm-up leaves)

- **When a measurement kills a phase's payoff, grep the phase name across
  ROADMAP and fix EVERY section that argues from it — not just the phase's
  own.** Revision 2 corrected RC-5's payoff to "5%, and 0% on the other
  exhibit" inside Phase WU's section and left Phase RC's sequencing
  section — the one that actually orders the work — still reading "the
  single biggest re-work-avoider … RC-5 reconciles three heroes whose
  disagreement is partly the warm-up", plus "the compiler enumerates the
  work" (spec §10 opens by calling it False) and "WU inserts ahead of LL
  **only because it is small**", eleven lines below a footprint that
  measured it as ~65 files. One file arguing both sides. The correction is
  cheap at the gate and invisible three weeks later.
- **A phase with two exit lists closes against the wrong one.** ROADMAP
  Phase WU exit (b) still carried "every whole-session number that moved
  moved by exactly the warm-up's own contribution" while spec §8 called
  that clause _not evaluable_ (DISTANCE and TIME cannot move; AVG SPLIT is
  a re-weighting). Close gates read ROADMAP. **Ruling: when a spec writes
  numbered exit criteria, ROADMAP's exit becomes a POINTER to them, never
  a second copy.**
- **"Small" as a sequencing reason expires the moment the footprint is
  measured — re-derive the order, do not patch the adjective.** WU's real
  claim to going first is that it is the only SHOVEL-READY item on the
  board: it has a spec and a spent antagonist pass, and Phase LL's brick
  work (the PROD precondition, the thing that makes James delete his app)
  has a research pass and no spec. Ordering a ready thing behind an
  unwritten one costs calendar days in which nothing merges. **Condition
  attached: the deferred phase's spec is written IN PARALLEL** — the
  collision rule bars concurrent IMPLEMENTATIONS, not specs, so going
  first should cost the other phase its implementation window only.
- **A concurrency ban inherited from a grep file map is usually wider than
  the measurement.** The WU/LL ban named three shared files; measured,
  `driver.ts` and `useMonitorSession.ts` carry warm-up COMMENTS only and
  the collision is `surfaceModel.ts` alone — which frees LL's
  diagnosability tier (S) to run alongside. **Before accepting "these
  phases collide", diff the measured footprints, not the file lists.**
- **"Remove X entirely" is a claim about the PRODUCT, not the code, and it
  will be cited as the latter.** WU ships with a DB column, two legacy
  readers on a persisted union, a `wu`-line paste intercept and a
  stored-row validation guard all alive. The right test is "can a user
  produce X?" — say so in the spec, or a later phase cites the removal as
  proof no such code exists.
- **Widening a persisted discriminant to `string` to keep a legacy reader
  alive is the wrong retype.** It admits typos, erases the enumeration,
  and makes the owed cleanup invisible to the compiler. Keep the literal
  union with the member commented legacy-only: a stored shape legitimately
  carries values no current producer emits, which is NOT the same defect
  as an unreachable member on a live type.
- **An owed item whose trigger is unmeasurable never fires.** "Remove the
  legacy guards once no pre-WU persisted record can plausibly exist" — the
  spec's own §12 concedes the population size is unknown. Convert such
  triggers to a countable one (a phase, a tag count) at the gate that
  creates them.
- **Deleting a setting: ask the cohort whether they USE it before the spec
  is approved.** `warmup jsonb` is nullable with no default, so it is OFF
  unless switched on — and nobody asked the one person who has it. Thirty
  seconds of asking, versus a tester discovering it in a note. Related: a
  ruling of "no replacement feature" must not silence the question "so
  what do I do instead?" — here the true answer (build the warm-up in as
  an ordinary first step) was never written down.
- **Backlog: 60 unchecked, up from 37 the previous day** (35 at LL open, 30
  at LT open, 24 on 2026-08-13). Twelve of the new ones are Phase RC's,
  filed off a real fourteen-agent review — defensible filing, but the queue
  in front of the brick has never been longer.
- **Release call:** no tag for WU alone — a removal has nothing a tester
  can try, so a solo tag is a version number with no falsification value
  (the #140 ruling, applied in the other direction). MINOR clause, rides
  the tag carrying LL's brick fix.

## Phase-open gate, 2026-08-22 (Phase 8A slate: plan checkpoints, unparked)

- **A SEED TITLE is a cross-version contract, exactly like a nullable column.**
  Prod deploys on every green push (`ci.yml:158-166`) and `seedGlobalLibrary`
  runs at boot (`server/index.ts:48`), so a title rename hits the prod DB at
  merge while installed iOS builds still carry the old literal compiled in
  (`domain/onboarding.ts`). Three shipped behaviours key off it and all fail
  SILENTLY: the Library exclusion leaks two rows, the suggestion pool can serve
  a hidden workout, and `BaselineCard`'s exact-title lookup returns undefined so
  `if (!workout) return null` deletes a no-baseline account's onboarding card
  with no message. Generalises the 2026-08-17 PW ruling past columns: ask
  which SHIPPED build reads this STRING. Ruling here (James, 2026-08-22): not
  worth a compatibility tag (silent-but-narrow, internal TestFlight
  auto-updates, and a shim tag would drag WU's un-released removal out early) —
  the rename merges LAST in its phase and tags promptly. Cheap when the
  ordering is decided at the gate; a fire otherwise.
- **Author a title ref as the CONSTANT, never the literal.** The 8A plan pinned
  "Titles are EXACTLY `6K Test`", which compile-couples the rename PR to the
  seam PR and forces rename-first — the worst ordering for the break above.
  `{ kind: "title", title: ONBOARDING_TITLES.k2 }` resolves on either value and
  frees the ordering entirely.
- **A phase that produces a measurement must name who records it.** 8A makes the
  plan ask for a 2K test; `grep -rn "isTestResult" app/src` returns ZERO, so the
  server's `test_history` append (`data.ts:601`) has no client producer and the
  only baseline write is the You-screen editor, typed by hand. The checkpoint's
  entire stated purpose — re-measuring the baselines every target resolves
  against — is delivered by the NEXT phase. Ruling (James, 2026-08-22): the
  baseline prompt goes next, BEFORE the calendar. **At a slate gate, trace the
  phase's output to the code that stores it.**
- **A predicate that means "onboarding" gets reused as "don't consume a plan
  session", and a later phase inverts the case.** `isOnboardingTitle` drives
  `PostWorkoutSummary`'s save-stack order (`:572-600`): on a checkpoint day 8A
  would demote `Log against plan`, and the non-advancing save writes
  plan_key/plan_index NULL while `doneN` stays put, re-serving the same
  checkpoint. **When a phase makes an excluded row into prescribed content,
  enumerate every consumer of its exclusion predicate, not just the exclusions.**
- **The calendar's data prerequisite is half-shipped, and the half that is
  missing is a product decision.** PW spec 2 delivered `plan_key`/`plan_index`
  (schema.ts:170-178), so 8B's stamping bullet is DONE and its 2026-08-22
  migration-coordination note describes work that no longer exists. But those
  columns place DONE rows only: `plan_state` is `{planKey, doneN}`, `doneN`
  advances per logged session with no calendar awareness, and
  `docs/design/README.md:97` ("a sequence, not a weekday calendar") contradicts
  `:315`'s month grid with greyed future days. **Ruling: the calendar gets a
  BRAINSTORM whose first question is the date model, in parallel; a design pass
  now would draw a screen whose TO DO half has no data.**
- **`workout_title` is a save-time snapshot, so a rename breaks every
  retrospective keyed to it.** The triggered follow-on said "did they take
  their checkpoint" is "computable at any later date from the log's own
  `workout_title`" — false the moment 8A renames. `plan_index ∈ {6,34,62}` is
  the method now. Correct a follow-on's stated METHOD when a phase invalidates
  it, not just its trigger.
- **A phase whose payoff is gated behind six real saves cannot be demoed.**
  `PUT /api/plan` accepts only `{planKey}` or `{reset}` (`data.ts:1146-1172`),
  so `doneN` moves only via `POST /api/logs`. Reaching checkpoint index 6 costs
  six saves for the e2e AND for James; log deletion decrements `doneN`
  (`stores/logs.ts:475-494`), so it is reversible. Say the cost in the notes or
  the feature reads as unshipped.
- **Backlog: 72 unchecked, up from 60 at WU open** (37 at LL open, 24 on
  2026-08-13); 23 triggered follow-ons, up from 15. #154 added ~15, five of them
  8C's behind an explicit "no demand has been observed."
- **Release call:** 8A rides a MINOR tag, 9 merges behind v0.15.0, carrying WU's
  un-released warm-up removal. Notes owe four clauses: warm-up removal, the
  checkpoint suggestion (naming session 7), the rename (old history says
  `First 2k`), and the open measurement loop (update your baseline on You).

## Phase-close / final-PR gate, 2026-08-22 (Phase 8A PR B, the test rename)

- **A rollback constraint created by a data migration has no home in this repo,
  and `docs/RELEASING.md` is where it belongs.** PR #156's own best sentence —
  rolling the API back past it against a post-rename DB is unrecoverable log-link
  loss — lived only in the PR body, and `grep -i "rollback|roll back|revert"`
  over `docs/RELEASING.md` returns ZERO: the file had no rollback section at all.
  RF14 with the highest stakes yet. **Any PR that changes stored rows in place
  states its downgrade cost in RELEASING.md, not in its own body.** (Fixed on
  #156 at this gate: RELEASING.md now has a Rollback constraints section.)
- **A phase's LAST PR is the roadmap's last chance, and both 8A PRs missed it.**
  #155 touched ROADMAP only to fold the gates; #156 did not touch it at all, so
  main would have carried "UNPARKED … execution still owes a verification
  refresh" with six unchecked boxes over a finished phase. The pattern is
  "roadmap outruns reality" inverted and it is cheaper to catch: **at every
  phase-close gate, diff the phase's checkbox state against its merged PRs
  before reading anything else.**
- **"Notes owe N clauses" is only discharged when the clauses live in a file.**
  Phase WU's clause did (`releaseNotes.ts:14-19`, provisional version stamped
  with its own reconciliation comment — a good pattern, copy it); 8A's three
  survived because the ROADMAP section says "8A's notes say so" in prose a close
  gate reads. Both are acceptable homes. A PR body is not. Check WHICH before
  calling the condition met.
- **A phase whose payoff is six real saves deep needs the cost above the fold,
  not in the notes only.** `advancePlanBy` (today.spec.ts:1141) posts six real
  `POST /api/logs` — verified, no shortcut exists and none was smuggled in. The
  same six are James's. A PR body that omits "how to see it" on a feature gated
  behind six saves guarantees the reviewer concludes it did not ship.
- **The rename's two installed-build windows close only when the BUILD lands,
  not when the tag is cut.** Prod seeds at boot on every green push, so the DB
  renames at MERGE; until the upload, installed v0.15.0 builds leak the two
  tests into a veteran's pool and DELETE a no-baseline account's onboarding card
  silently (`if (!workout) return null`). "Tag promptly" was the accepted
  mitigation; the operative instruction is **upload the same day**. Generalise:
  when a seed change lands at merge, the mitigation is the UPLOAD, not the tag.
- **Exit criteria satisfied by COMPOSITION should be named, not counted as
  proven.** 8A's "START runs it" has no test that clicks Start from the
  checkpoint card — the card is `OPEN ›`, and library.spec proves detail→Start
  separately. Two halves, no join. Accepted; recorded so the next gate does not
  rediscover it as a hole.
- **`phaseKindWord("test") → "TEST"` survives in `Timer.tsx` and is a DIFFERENT
  union from the retired plan code.** Same-name-different-union, the briefing's
  own trap. Do not "finish" the TEST retirement by deleting it.
- **Release call, executed:** v0.16.0, MINOR. Ten merges over v0.15.0..#156;
  eight need no note (zero files under `app/src/`, verified by
  `git show --name-only`, not by title). Notes PR first, then the tag — the
  v0.8.0/v0.9.0 precedent. API additive-only holds: `sequence[].code` keeps its
  name and shape, only its VALUE SET narrows, and `"AN"`/`"AT"` were always
  members of the old client's own union.
- **Backlog: 71 unchecked, 23 triggered follow-ons** (72 at 8A open, 60 at WU
  open, 37 at LL open). Checking 8A's six takes it to 65 — the first net
  DECREASE recorded in this ledger.

## Phase-open gate, 2026-08-22 (Phase BL slate: three doors in, one measurement out)

- **A state a rower can leave but never re-enter has no demo path, and that is
  worse than a demo COST.** `PUT /api/baselines` rejects `null`
  (`data.ts:590-601`), the editor has no clear control, and `BaselineCard`
  renders only while a baseline is missing — so a baselines-set account could
  never see the onboarding doors again by any product path. Generalises 8A's
  "six real saves deep": **at a slate gate, for every screen the phase adds,
  ask which state the app must be in to render it and whether James's account
  can reach that state.** Resolution here was better than the workaround:
  James added "Reset baseline setup" on You as a product feature — when a
  state is unreachable, first ask whether a rower would ever WANT to re-enter
  it; if yes, the demo path is a feature, not a second test account.
- **A design canvas is a citation and obeys RF16.** BL's spec cited the
  "Baseline Onboarding" canvas eleven times as "the pixel reference";
  `git ls-files docs/design` did not contain it and no URL existed in the
  repo. **A canvas cited by a spec lands in `docs/design/` (source files)
  with the live artifact URL in the spec, before any brief cites it.** Fixed
  at this gate.
- **Check whether the feature you are specifying already exists in a smaller
  form, and reconcile the CONSTANTS.** BL specified a 16-cell estimate table
  while `domain/deriveBaseline.ts` (`K2_K6_OFFSET_SECONDS = 7`) already
  estimates the missing split and `BaselineEditor.tsx` seeds
  `SEED_K2=112`/`SEED_K6=122` (a 10s gap; 1:52 is a club rower's 2k shipping
  as every new rower's prefill). Three disagreeing answers to one
  relationship, a fourth proposed, none reconciled. **When a phase adds a
  number-producer, grep for the existing producers of the same number and
  make agreement an exit criterion.**
- **Enumerate write sites from the CODE, not from the spec's list.** BL's
  provenance ruling named three and missed the editor's own derive OFFER — an
  estimate the rower accepts, which the stated rule would record as `manual`.
  Sibling of 8A's "enumerate every consumer of the exclusion predicate".
- **An oracle stratified by an attribute you ruled out collecting cannot
  ground the table.** Rankings are banded by age/weight/sex — the axes the
  minimal-PII ruling excludes — over a self-selecting racing population.
  **Ruling shape: replace "the numbers are right" (unfalsifiable) with
  bounded, testable criteria — inside MIN/MAX_SPLIT, a stated conservative
  bias (too-fast is the harmful direction), per-cell gap agreement with the
  existing constant — and name James at the PR as the checker of a 16-row
  table.**
- **`isTestResult` rides `PUT /api/baselines`, not the log** — recording a
  test and overwriting the baseline are the same call, so "decline changes
  nothing" silently meant the measurement is lost. James's ruling: record
  regardless; the prompt governs only the baseline write; PR B decouples.
  **When a spec cites a wire field, open the route that owns it — the
  coupling is the product decision.**
- **A phase created out of another phase's bullet must DELETE that bullet.**
  8B still carried the post-test prompt with a different mechanism and its
  own exit. Split at this gate: prompt → BL; the test-history LIST stays 8B —
  and BL gives `test_history` its first producer with NO consumer, which the
  release notes must not paper over.
- **The parallel-spec condition was applied once and breached — this time it
  is countable:** LL's spec (parallel session) must exist before BL's PR C
  opens. An unenforceable parallel condition is theatre.
- **Backlog: 70 unchecked, 23 triggered follow-ons, 8 phases not started**
  (71 at 8A close). The +5 is work being started, not filed.
- **Release call:** v0.17.0, MINOR, its own tag — BL ships things James can
  falsify on his own account. Notes owe four clauses (loop closed as
  v0.16.0's notes promised; the You shortcut; doors are new-account-only,
  Reset shows them; provenance stored, never shown). **App Privacy unchanged
  PROVIDED the questionnaire answers stay transient** — ruled: they are
  never stored; self-reported cardio frequency would otherwise be this
  repo's first Health-and-Fitness field, and no privacy declaration exists
  yet anywhere (Phase PROD owes it).

## Final-PR gate, 2026-08-22 (Phase LL link-truth, PR #160 — TRIAD: stored shape + when live numbers freeze)

- **When a PR body and the branch's own source comment disagree about a
  CAUSE, the comment is the record and the body is the defect.** #160's
  bullet 2 told James his phone needed a reinstall because of a stale
  `driverRef` the disposal fix now clears. `capacitorBle.ts:441-445` says
  the opposite in the guard's own words ("a FORCE-QUIT brick is NOT
  covered — iOS releases the link when the OWNING APP dies"), the spec says
  "still unexplained", and the walk record says force-quitting did not
  help — which alone refutes it, since a fresh process cannot carry the
  stale field. The implementer was scrupulous in the code and the PR body
  overclaimed on top of it. **At every gate, read the headline's causal
  claims back against the source comments of the files that implement
  them** — the honest sentence is usually already written, one level down.
- **A checkbox whose own TITLE is the exit criterion must not be checked
  before the exit runs.** ROADMAP's "Recovery — a way back that is not
  deleting the app" went `[x] SHIPPED` while exit clause (b) ("Try Again
  … without deleting the app", real PM5, real phone, Release build) was
  untouched and the shipped guard explicitly disclaims the case. Retitle
  the item to what shipped, or leave it unchecked — a `[x]` is the only
  thing a future session reads, and this is how a fired trigger becomes a
  permanent follow-on. Sibling of the PAUSED lesson, inside the phase that
  exists because of it.
- **A phase whose exit is entirely hardware-gated must rewrite its STATUS
  paragraph in the implementation PR, not the close PR.** #160 flipped four
  in-scope items to `[x]` and left the header reading "NEXT AND UNBLOCKED
  … This phase is the next work". Post-merge that is wrong in both
  directions at once. The state to write is explicit: _implementation
  merged in #N; phase OPEN on clauses (a)-(e) + W5-W8 + 9a; owner: the
  next erg visit._ (Two prior phases closed with no ROADMAP section at
  all; this is the same failure wearing a checkmark.)
- **Coupling the banner to the stored close reason couples a FALSE
  POSITIVE to a FALSE RECORD.** LL's B1 ruling ("whatever fires the banner
  defines the close") is right, and its consequence was written nowhere: a
  spurious watchdog fire plus an End press inside the 10 s hysteresis
  stores `endedBy: "link-lost"` on a healthy row — a wrong value in the
  field that exists to end that exact conflation. The threshold is set
  from web-only data with native unmeasured (the walk's own 9a). **When a
  surface signal is promoted to a stored fact, ask what a false positive
  writes, and put it on the walk card.**
- **An "accepted limit" precedent set inside a phase binds the rest of that
  phase.** LL's own EST LEFT fix put three accepted limits in DEVIATIONS
  four days earlier; the continuity guard's suppression on any
  distance-bearing program (5 of 6 corpus sessions) went to the spec only,
  and `grep "continuity" ROADMAP.md` finds neither the limit nor its named
  follow-up. RF14's seventh gate in eight.
- **The "reads aloud in 30 seconds" rule is now 0-for-9 and two PM gates
  have declined to enforce it** (#140 at 325 words, #160 at 311). A rule
  with no enforcement record is not a rule. **This is James's to re-set or
  retire — it belongs in CLAUDE.md, not here** — and until he does, gates
  should stop spending a paragraph on it. Recommendation on the table:
  150 words / 60 s, and replace the clock with "outcome line plus six
  bullets, no mechanism nouns above the fold."
- **The empty-check-rollup trap, third occurrence, first one with a
  semantic overlap underneath it.** #160 reached its TRIAD gate
  `CONFLICTING`/`DIRTY` with zero checks; the ledger conflict was the
  visible cause and `app/server/routes/data.ts` (+22/-6 from Phase 8A on
  main) was the one that mattered — the same file the stored-shape change
  edits. Migration indices were clean (main 0011, LL 0012). `gh pr view
--json mergeable,statusCheckRollup` stays the first command; the second
  is `git log <base>..origin/main -- <the files the PR touches>`.
- **Release call:** tag **v0.17.0 MINOR** on merge. Not optional
  bookkeeping — exit clauses (a)-(d) specify a Release build and
  `ios:release` derives from the tag, so **the tag is the walk
  instrument**. Range `v0.16.0..main`; #158/#159 are docs (zero files
  under `app/src/`, verified by `--name-only`, not by title). Carries the
  fourth armed clause (a lost link now says so; a lost-link ending is
  recorded as such), written against the corrected facts, not the PR
  body's. **Cohort stays at ONE**: the 2026-08-20 threshold was criterion
  (b)'s existence, (b) is walk-gated, and delete-and-reinstall is still
  the workaround and still destructive. Making a silent loss visible is
  not the same as making it survivable.
- **Backlog: base 60 unchecked -> 56 on the branch (main ~66 post-merge,
  inflated by #154-#159's new sections).** First net-NEGATIVE delta in the
  recorded series (24 -> 30 -> 35 -> 37 -> 60). LL closed four items by
  executing them and filed a walk card rather than a phase. Worth naming
  after five gates of the opposite.

## Final-PR gate, 2026-08-22 (Phase BL PR B, #165 — TRIAD twice: `tested` provenance + an unpredicted stored shape)

- **A completeness guard is only as strong as its weakest DOOR, and a PR body
  generalises across doors that a source comment carefully separates.** #165's
  "no offer from an abandoned run (didn't cover the distance)" is true of the
  monitor door (`endedBy === "finished"`, the machine's own WORKOUTEND) and
  FALSE of the phone-timer door, where completeness is the rower's own tap and
  `timerAvgSplit` divides by the PRESCRIBED metres. Bail out of a 2K at six
  minutes, tap Finish, and a 1:30 "test result" is offered and permanently
  recorded. `postTestOffer.ts` says this plainly in its own doc comment — the
  honest sentence was already written one level down, for the second gate
  running. **When a guard's answer differs per code path, the PR body states
  the weakest path, not the union.** James's ruling (same day): record both
  doors anyway — losing a genuine phone-timer test is worse than carrying a
  removable bogus one — and the remove/void verb is a GATING condition on 8B's
  list, not a design input.
- **The #121 precedent fired and nobody cited it.** "Browsable + immutable +
  no DELETE = permanent … the next spec that adds stored numbers should answer
  'how does a rower correct or remove this?' BEFORE it ships." #165 IS that
  spec: `test_history` rows are written without consent (the decouple ruling,
  correct), survive log deletion by design (FK SET NULL), have no delete
  route, and anchor the next test's `deltaSeconds`. The review filed it as an
  8B design _input_, which is the deferral the precedent refuses. **A gate's
  job includes grepping this ledger for a precedent the PR's own class already
  triggered.** Discharged via James's R1 ruling above.
- **A phase's STATUS paragraph went stale in an implementation PR again —
  second consecutive gate.** Promote to a mechanical first step: at every
  final-PR gate, `git diff origin/main...HEAD -- ROADMAP.md` and check the
  STATUS PARAGRAPH, not just the checkboxes.
- **A second offer that can OVERWRITE must not use the copy of a first offer
  that fills a gap.** `counterpartOffer` fires both when the other side is
  MISSING and when it is INCONSISTENT; one copy rendered for both, showing
  neither the stored value nor the word replace. Consent that cannot see what
  it gives up is not consent. **Branch the copy wherever one control has a
  create arm and a destroy arm.** (Fixed on #165 at this gate: the replace arm
  now shows CURRENTLY vs THIS ESTIMATE.)
- **The demo cost of a band-gated feature is the band, not the flow.** The
  60..240 s/500m plausibility band means the prompt cannot be seen in under
  FOUR MINUTES of real rowing on the 2K (twelve on the 6K); tapping through
  produces nothing, silently. 8A's six-saves lesson in a new costume. **When
  eligibility is a numeric band, compute the minimum wall-clock to satisfy it
  and put that number above the fold.**
- **The mechanics of an unpredicted stored shape can be adjudicated by the
  triad code review; the SEMANTICS still need James.** 0014's FK/UNIQUE/race
  net were re-proved against real Postgres both directions — an antagonist
  pass was SKIPPED with that reason spoken. What no code review can settle is
  who may erase a client-asserted number. **Split the question at the gate:
  shape → the review; meaning and erasure → the ruling.**
- **A stored baseline minted from a machine number finally has a non-mirror
  oracle.** `monitorAvgSplit` averages WORK intervals only and the 2K Test is
  a single distance interval with no rest — the same quantity the PM5's
  end-of-piece average pace displays, by construction (RF11's corollary
  satisfied). One photograph at the LL exit walk checks it.
- **Release call:** v0.18.0 MINOR on A+B, range `v0.17.0..main` = #164 + #165;
  #164 owes no note, pre-stated at PR A's gate (RF15 discharged in ADVANCE — a
  pattern worth copying). Three clauses: the loop v0.16.0's notes promised is
  closed; the You shortcut (no plan progress needed); "recorded either way,
  nowhere to see it yet, and not yet removable." RELEASING.md needs no new
  rollback floor — 0014 is additive, no backfill, no seed rename; checked so
  the next stored-shape gate does not re-derive it.

## Phase-open gate, 2026-08-22 (Phase RC slate: the held-open finish, evidence-first)

- **A dev instrument that "keeps capturing" can still be unreadable, because
  the EXPORT ran first.** RC's hold-open defers `driver.disconnect()`
  (teardown Step 4) while the ring's only stash — `exportLog()` →
  `sessionStorage["ergomatic:last-rowed-log"]` — is Step 2, and its own doc
  comment says "an entry written to the ring after this line would never reach
  sessionStorage at all." `LogSession.tsx:666` reads exactly that key, so the
  whole 90 s hold window would have been invisible to `MONITOR LOG · COPY`.
  The transport-layer recording tap survives (it sits below the driver;
  `unsubscribeRef` is the HOOK's driver-event listener, not a characteristic
  unsubscribe) — but its own delivery path is the one #100's gate flagged as
  ungated. **For any instrument that extends a session's life past teardown,
  trace the EVIDENCE's export path, not the capture path, and ask which of the
  two teardown does first.** Sibling finding: the "ARMED" chip lived on the
  connected screen, which unmounts on finish ("the ended hand-off frame
  navigates away on its first render") — so the `holding` state, the only one
  the operator must not disturb, had no readout at all.
- **"Shape unchanged" in a section header that changes the shape is worth one
  grep of the readers.** RC-6 made `Sample.p` (and, unstated, `spm`) optional.
  Named footprint: one file. Measured: four — `seriesRecorder.ts`'s required
  fields, `server/routes/data.ts:502-522` which REJECTS the save on an absent
  `p`/`spm`, `stores/logs.ts`'s type, and `traceModel.ts:161,165`, whose
  `if (s.p !== 0)` turns an absent field into `undefined/10` = **NaN** on two
  shipped screens. The 2026-08-17 PW nullable ruling generalises past columns
  to OPTIONAL FIELDS: ask which installed build reads it.
- **When the reader already honours a sentinel, "drop the field" is the more
  expensive fix, not the cleaner one.** `traceModel` already excludes `p: 0`
  and `spm: 0`, so RC-6's `p` half buys nothing observable and its only motive
  (C2's `stroke_data.p` rejects zero pace) is a wave-5 SERIALIZATION concern
  that will filter the payload anyway. The `spm` half is real and
  rower-visible — `s.spm !== 0` means the wire's 64/101 artifacts ARE drawn
  today, compressing the rate chart's real band — and banding them to the
  existing 0 sentinel fixes it in one line with no type, server, reader or
  cross-version cost. **Before making a stored field optional, check whether
  the consumer that wants absence exists yet, and whether a sentinel the
  readers already drop gets you there.**
- **TRIAD classification is not blast radius, and the grouping question should
  be asked on the second.** RC-4 (Last Split 10x) is TRIAD by definition and
  `grep -rn "lastSplitTimeSeconds" src domain server` finds parser + fake
  encoder + tests, **zero consumers** — it belongs in the instrument's PR.
  RC-6, classed "TRIAD-adjacent", reaches a server route, a stored type and a
  shipped chart, AND collides with `server/routes/data.ts` which Phase BL's
  #164 just edited with PRs B/C still coming. **Split by what a reviewer must
  hold at once and by what main is contending, never by the TRIAD label.**
- **An exit clause whose evidence may never arrive needs the negative branch
  its sibling already has.** RC's clause (e) closes the 0x003F branch on the
  record if it never fires; clause (b) (decode the log entry date/time) has no
  such escape, and its data lives in 0x0039, which the phase's own W2 may show
  silent forever. The review's `:386` records a rival hypothesis the spec does
  not repeat — end-of-workout messages "can be DROPPED entirely" — so a 90 s
  silence does not discriminate "we hang up early" from "this firmware drops
  them." **At a phase open, read each exit clause against the walk result that
  would make it unmeetable, and give it (e)'s shape.** (The obvious
  contingency, ErgData's CSAFE 0x6A log pull, is already correctly closed by
  review row (j): the commands are public, the field layouts are not.)
- **A combined two-phase walk needs a written CUT ORDER and a contention
  protocol before it is scheduled.** 17 items, ~4200 m, two unbounded (W8 is
  an inactivity timeout of unknown duration; W9 as written needs a SECOND
  ERG). Ruled order, keep-from-the-top: W1 (2 min, gates the whole
  verification branch) → W2+W3+W4 on one keystone piece → LL (a)/(b)/(c), the
  brick → LL (a) pre-stroke + W5 → 9a → LL (e); cut line; then W6, W9, W8,
  W7-distance. **Clause (b) must never fall below the cut line — it is the
  cohort-of-one gate.** And nothing anywhere in `pm5-interface-notes.md` or
  the ecosystem review says whether two centrals may hold one PM5: legs run
  strictly sequentially, idle app fully closed, and a failed connect is
  presumed contention before it is presumed a defect.
- **Two walk items named W7, and one routed to a medium that cannot answer
  half of it.** LL's W7 (PM5 menu mid-session) and RC's W7 (3x300 r30 held
  open) collide by name; and §6 sent LL's W7 to the LAPTOP, where the
  wire-quiet half is answerable but the "does the 2500 ms watchdog
  false-fire" half is not — native is unmeasured, which is why 9a exists.
  The CR2-close medium rule, third occurrence.
- **The phase's headline prize depends on a PII field the standing ruling
  starts from NO.** The verification-code branch — ROADMAP's "whole point of
  the phase" — requires POSTING a row, which requires `weight_class`
  (REQUIRED, we store nothing). Told at open rather than at wave 5, with two
  zero-code moves: settle whether it can be transient upload-time rather than
  stored (BL's questionnaire precedent), and read C2's docs on whether an
  ErgData duplicate merges, rejects or duplicates — ROADMAP concedes this
  "decides whether this is leverage or a fight over ownership of the row."
- **The phase's only rower-visible defect is correctly sequenced late and
  should be DECIDED early.** RC-5 (three stored heroes contradicting by 24.3
  and 39.9 s/500 m) implements after RC-1 for good reason — RC-1 changes two
  of the three. But the product decision needs no walk and no code, and RC-1's
  storage design should be informed by it. **Separate a deferred
  IMPLEMENTATION from a deferred DECISION at every slate gate; the second is
  usually free and usually upstream of the first.**
- **Release call: NO tag on spec 1.** Dev-only instrument, 0x003F with no
  consumer, RC-4 with no consumer — nothing a tester can falsify (#140's
  rule). The walk needs no new build either: LL's clauses bind to a Release
  build and v0.17.0 build 717 already is it. Un-released stack: ONE merge
  (#164, BL PR A); next tag v0.18.0 MINOR and it is **BL's** — note the BL
  open-gate entry above recommends v0.17.0, which LL spent the same day, the
  CS-close staleness rule recurring inside 48 hours. If RC-6 ships the `spm`
  banding it earns a notes clause: the rate line visibly loses its 64/101
  spikes and the fix is write-forward-only.
- **Backlog: 67 unchecked, 212 checked, 10 triggered follow-ons** (70 at BL
  open, 71 at 8A close, 60 at WU open, 37 at LL open, 24 on 2026-08-13).
  Second consecutive net decrease. RC's twelve items were filed 2026-08-21 and
  spec 1 works them the next day — executed, not filed. **Roadmap presence
  PASS**: the Status header flipped in the same commit as the spec (`425a0f2`),
  the first phase open in this ledger with no RF17 absence to report.

## Final-PR gate, 2026-08-23 (Phase RC spec 1, PR #167 — TRIAD twice: a 10x decode flip + stored series content)

- **The empty-check-rollup trap, fourth occurrence — and the mechanism is
  now established, so stop re-observing it.** `.github/workflows/ci.yml` is
  `on: pull_request`, and a `pull_request` run is built against
  `refs/pull/N/merge`. **GitHub never creates that ref for a CONFLICTING PR,
  so a DIRTY PR gets no CI run at all** — and `statusCheckRollup: []` is
  indistinguishable from "queued". #167 reached its TRIAD gate with zero runs
  ever. `gh pr view --json mergeable,statusCheckRollup` stays the first
  command; when the rollup is empty, `mergeable: CONFLICTING` is the
  explanation, not a coincidence.
- **At a conflicting PR, the AUTO-MERGES are the risk, not the conflict.**
  #167's only textual conflict was `pm-ledger.md` (noise). The three files
  that auto-merged clean — `LogSession.tsx` (+170 on main from #165),
  its test (+338), `index.css` (+61) — are where the branch's gate evidence
  silently stopped applying. Mechanical step: `git diff --stat
$(git merge-base HEAD origin/main)..origin/main` and intersect with the
  PR's own file list; then require e2e AND screenshots on the merged tree,
  never the pre-merge numbers in the body.
- **A tagged release invalidates every walk card that pins a build.**
  #167's card pinned "stock v0.17.0, build 717" in three places while
  v0.18.0 had been tagged the previous day — and v0.18.0 puts a NEW SCREEN
  (BL's post-test prompt) in the finish path the card describes. Generalises
  RF13: **at any gate touching a walk card, `git tag --sort=-creatordate |
head -1` and check every version the card names.** The product argument,
  not just the bookkeeping one: proving a phase's exit on a build no tester
  runs proves it on a build nobody has.
- **A struck-through `[x]` is where a narrowed-off half goes to die.** RC-6
  shipped its `spm` half and deferred `p: 0` "to RC-11's own spec" — inside
  RC-6's own now-checked, struck line. RC-11's item body says nothing about
  `p`. Nobody re-reads a checked parent. **When a gate narrows an item, the
  surviving half is written into the RECEIVING item's body in the same
  commit, and the gate greps the receiver to prove it landed.**
- **A stored-numbers change owes its NO-BACKFILL sentence, and owes it to
  James specifically.** RC-6 bands `spm` at construction, so old sessions
  keep their 64/101 forever. His first move on merge is to open an existing
  log to check the fix, and see the spike still there. **Any change to what
  gets stored states, above the fold, what happens to what is already
  stored** — even when the answer is "nothing, by design".
- **"Needed no evidence" and "needed no erg" are not the same sentence.**
  #167's line one told James its two TRIAD number changes "needed no
  evidence." It meant no hardware. On a PR whose whole case is a corpus of
  committed bytes, the opening sentence said the opposite of the branch.
  Read line one as a stranger would.
- **Overriding a vendor PRIMARY is a bigger claim than fixing a bug, and
  must be presented as one.** RC-4 flips Last Split Time /10 -> /100 against
  **both C2 documents, which print 0.1 s/lsb four times**, on the strength
  of nine capture pairs. The body framed it as an ordinary decode bug; the
  branch's own `uuids.ts` says the document "was wrong about Last Split Time
  two pages earlier". **When a change contradicts a cited primary source,
  the contradiction goes above the fold** — that is the fact a reviewer
  needs to decide, and burying it makes an override read as a typo fix.
  (Containment checked so the next gate need not: `avgPaceSecondsPer500m`
  rests on the same suspect document with the same untested `/10`, and has
  zero product consumers — the doc being wrong twice costs a rower nothing
  today.)
- **The free measurement goes first.** RC built a 2,200-line hold-open
  instrument to observe 0x003F, then scheduled W1 — photograph the firmware
  version screen, two minutes, no rowing — inside the same walk. W1 decides
  whether 0x003F can exist on this monitor at all. The instrument earns
  itself anyway (0x0039 has delivered zero notifications across five natural
  finishes; the whole summary-fallback subsystem is dead code at the erg,
  and only not-hanging-up can test it), so the build order was not wrong —
  but **the ordering was free and would have reshaped a walk whose rowing
  budget is the binding constraint.** At a phase-open gate, ask which
  evidence costs nothing and whether it is scheduled before or after the
  thing it gates.
- **RF13 passed for once, and the check that made it pass is worth copying:**
  the walk card's arm instructions were traced to the branch that serves them
  (`compose.e2e.yml:39` sets `VITE_ENABLE_FAKE_MONITOR=1` as a build ARG ->
  `transports/index.ts:281`'s gate -> `window.__pm5HoldOpen__` exists at
  `http://127.0.0.1:$APP_PORT`). Phase CS's identical-shaped instruction was
  never traced and was impossible. **Follow the flag to the branch that
  consumes it** is a two-command check, and it is the difference.
- **Release call: NO TAG; rides the next MINOR.** The instrument cannot reach
  a TestFlight rower under any flag (`adapters/monitorTransport.ts` takes the
  Capacitor arm before `resolveDefaultTransport`), RC-4 has zero product
  consumers, RC-6 is imperceptible until a NEW connected session, and v0.18.0
  shipped the previous day. The walk needs the LAB (`walk-lab.sh` + the
  compose stack), not a phone build. Owes exactly one note clause when it
  rides — RC-6's, with the no-backfill sentence attached — pre-stated at this
  gate per the #164 precedent.
- **Backlog: 67 unchecked at merge-base -> 65 on the branch** (RC-4 and RC-6
  closed by execution, zero new items filed; main independently at 65).
  Second consecutive net-negative delta after five gates of the opposite.
- **The 30-second rule is now 0-for-10** (#167 at 315 words) and four gates
  have declined to enforce it. Still James's to re-set or retire, still
  belongs in CLAUDE.md. Gates should keep spending one line on it, not a
  paragraph.

## Phase-close gate, 2026-08-23 (Phase LL: the link can be lost — walked, closed with conditions)

- **"PASS IN SUBSTANCE" is where a compound exit clause goes to be laundered.**
  LL's (b) read "Try Again reaches a fresh connect and programs successfully
  **without deleting the app**" — two claims joined by "without". The walk met
  the second (Cancel -> Connect, no reinstall) and failed the first (F1: the
  button is dead after a mid-session BT-off), and the verdict block absorbed
  the failure into the pass. **Ruling: SPLIT a compound clause at its gate and
  give each half its own verdict.** The tell is a verdict containing a
  concessive ("...with finding F1", "in substance"). Same file already carried
  a written warning against fudging a criterion at its own gate (ROADMAP:2245)
  — we wrote it in August and did it in August.
- **Discharging a clause silently discharges every rule that cited it.** The
  cohort-of-one hold was written as "until criterion (b) exists". (b) now
  exists in the half that rule cared about, so the hold was self-discharging
  the moment the walk passed — while a NEW and worse reason to hold (F2 losing
  a healthy row) had just been found. **When a gate's cited criterion is met
  but the gate should stand, re-found it on the new criterion in the same
  edit, with its own discharge test.** Otherwise the next reader is correct
  and the cohort grows into an unfixed bug.
- **An oracle that reads zero five times out of six is not "transiently
  zeroing".** F2 was filed as "iOS resume produces a transient machineTotal=0
  frame outside the web corpus". Every TWD reading committed that day: laptop
  web DISTANCE capture 0 across 248.5 m; ring-3 0 at 94.6 m and 0 at 33.1 m
  (with its own `divergence` entry); ring-2 0 at 83.3 m; ring-2 **81** at
  81.2 m. Five zeros, one non-zero — the 81 is the outlier and the behaviour
  is not iOS-specific. **At a close, recompute a finding's premise from the
  walk's own committed artefacts before it becomes a successor spec's
  starting assumption.** RF11's sibling: we did compare against the machine,
  and then narrated the comparison backwards.
- **Compose the findings before assigning severities.** LL's walk filed F4
  (web cadence worst 1260 ms vs a 2500 ms watchdog, margin 2.0x not 3.09x) as
  informational and F2 as SERIOUS-but-background-only. `applyContinuityCheck`
  gates on `frameSilence`, not on backgrounding: F4 arms F2. **Ask of every
  pair of findings in one walk whether one is the other's trigger** — the
  blast radius, not the severity label, is what sets the cohort gate.
- **A guard that convicts on one field while two fields in the same frame
  contradict it can be defused without new knowledge.** F2's convicting frame
  had elapsed 56.1->59.3 and distance 81.2->83.3 advancing while TWD went
  81->0. A monitor reset resets everything. **Corollary for sequencing: split
  a blocked fix into DEFUSE (cheap, now, no new knowledge) and KEY-IT-RIGHT
  (rides the phase that owns the semantics).** "It rides RC-1" was right for
  the permanent fix and would have left a record-destroying bug live for a
  whole phase.
- **Bind a capture deliverable to a walk LEG, never to "the walk".** The >3 s
  wire-gap witness (bound to LL's exit walk at the 2026-08-20 gate) was
  unobtainable: `adapters/monitorTransport.ts:70` composes the byte recorder
  on the WEB arm only, so the laptop leg has the recorder and no gap while the
  phone leg has the gaps and logs events, not frames. Fourth occurrence of
  "the medium cannot answer the question" (CR2-close; LL's own W7 was the
  third). **At any gate that assigns a capture: name the leg, and name the
  code path that writes the file.**
- **A walk answers questions nobody asked it.** ROADMAP's open DISTANCE
  question (does distance reset at a zero-rest work->work boundary?) was
  settled by the keystone the same walk committed — seq 305->310: elapsed
  69.75->0.50, distance 248.5->1.9, rowingState 1 throughout, TWD 0->250. It
  sat unread in the record while the item stayed `- [ ]` and nominally owed an
  erg session. **At a phase close, re-read every open item BOUND to that walk
  against the walk's artefacts, not against its README.**
- **A release note is a live surface, not an archive.** v0.17.0's "your
  history can finally tell the difference" (releaseNotes.ts:49) shipped a
  capability with no surface (F3: `endedBy` stored, its only consumer a
  boolean in LogSession.tsx:1338, rendered nowhere) and re-ships it every time
  the Releases screen opens under v0.18.1. **Strike the false half now** —
  the honest "not yet" form (v0.16.0 item 3) is the house pattern, and the
  standing rule that notes must let the cohort falsify them cannot be met by a
  clause describing a screen that does not exist.
- **Backlog: 67 unchecked at v0.17.0 -> 63 on main; 66 once F1/F2a/F2b/F3 get
  checkboxes.** Third consecutive net-negative delta.
- **Release call: NO TAG on the close-out** (ROADMAP/ledger prose plus a
  one-string notes correction, fast path). F3's surface + F2a's defusing tag
  together as a MINOR, and their notes must name the DIRECTION of the change
  to when a record closes.
- **The 30-second rule is 0-for-10.** Still James's to re-set or retire, still
  belongs in CLAUDE.md.

## Final-PR gate + phase close, 2026-08-23 (Phase BL PR C, #172 — TRIAD: the table mints every target's anchor + a destructive DELETE)

- **A destructive confirm must name the CAPABILITY lost, not just the data.**
  Reset's confirm said "Workouts lose their targets until you set a baseline
  again"; what happens is `startBlocked` disables Start Timer on every
  split-ref workout and Today's plan line/FILTER/SHUFFLE disappear. Losing a
  number reads as reversible; losing the ability to start reads as broken.
  **For any destructive control, enumerate what the app STOPS DOING, not what
  it deletes.** (Fixed on #172 at this gate.)
- **The `**Status:**` LINE is the thing that goes stale, not "the status
  paragraph."** Third consecutive gate; first with partial credit (#172 fixed
  the body while the header kept dissolved conditionals). **The mechanical
  step tightens: read the `**Status:**` line itself against what the branch
  just did.**
- **An enforced parallel-session condition VERIFIED CLEAN, and the check took
  two commands.** "PR C opens only when LL's spec exists": spec merged
  2026-08-22, PR opened 2026-08-23. First pass in this ledger. **Countable
  conditions get checked; unenforceable ones get breached — the difference is
  whether the condition names an artefact with a timestamp.**
- **An end-to-end exit clause can be discharged without hardware by driving
  the clock.** Door 3's arc fast-forwards 26:00 so the measured split lands
  INSIDE the offer's 60..240 band — a 7-minute fast-forward would have walked
  straight past the prompt the arc exists to prove. **When a clause is gated
  by a numeric band, the test's synthetic time must satisfy the band.**
- **A hand-authored lookup table is checkable by a human ONLY after the gate
  proves the printed table and the code identical.** Done here (all 16 cells,
  both numbers, both tags, plus four derived properties recomputed). **James's
  sign-off is about JUDGEMENT; he should never spend it re-checking
  transcription.**
- **Frame a number ruling by what the numbers DOWNSTREAM become.** The
  question about a 2:30 beginner 2k is not "is 2:30 plausible" but "the
  library prescribes `2k−4` in 58 workouts and `6k+12` in 99 — can a beginner
  hold 2:26 and 2:49?" **Grep the corpus for the offsets actually applied and
  quote the resulting numbers.**
- **A questionnaire whose output range is smaller than its question count
  suggests should be asked whether it needs to exist.** 16 cells → 5 distinct
  pairs → 20 s/500m of range. The case FOR the screens is welcome and
  consent, not accuracy — a fine reason, said out loud at the gate rather
  than assumed.
- **RF14, sixth occurrence in seven gates.** F4 (the baselines article's
  stale closing paragraph) lived only in a PR Record block as "rides the next
  content PR" — on a phase whose exit criterion is teaching truth, on the
  article the phase's own e2e sends a new rower to read. Rescued and fixed at
  this gate.
- **Release call: v0.19.0 MINOR; the phase CLOSES on this merge.** Range
  v0.18.1..main = #167 (owes the spm-banding clause WITH its no-backfill
  sentence, pre-stated) + #170 (none) + #172 (four clauses: the three doors;
  Reset as the only way to see them on a set account, "no undo" said; answers
  never stored; the teaching rewrite — and NOT a word implying test history
  is visible). #171 claims no version; both edit ROADMAP + this ledger —
  sequence and re-gate the second.
- **Backlog: third consecutive net-negative delta** (63 main → 61 branch).
- **The 30-second rule is 0-for-11.** Still James's to re-set or retire in
  CLAUDE.md.

## Final-PR gate, 2026-08-23 (Phase RC, F2a PR #174 — TRIAD: when a rowing record closes)

- **When a branch's own antagonist ledger says "cannot is the wrong word", the
  PR body may not use the word.** #174's spec, its `continuity.ts` header and
  its antagonist entry all carry the residual honestly (ring-phone-2's 81→0 is
  unexplained; "never observed in 3,637 wire pairs" is the claim, not "cannot").
  The tester bullet said "backgrounding can no longer cost you the row."
  **Mechanical check, cheap enough to run every time: grep the branch's own
  spec/ledger diff for its stated caveat, then grep the body for it.** Second
  consecutive gate on the #167 "read line one as a stranger would" shape.
- **"Early in an interval" was carrying 64%.** The #165 numeric-band precedent
  generalises past eligibility to any band of BLINDNESS: F2a's narrowing loses
  detection for ~14% of a 180 s interval at a 30 s gap, ~64% at two minutes, and
  the body used the word "early". **A qualitative adverb standing in for a
  measured percentage is a magnitude overclaim; put the number above the fold —
  with its provenance label (these were modelled, not swept).**
- **A branch name is a WORSE citation than a PR number, and the fix for one
  produced the other.** #174 deliberately replaced a not-yet-existing PR number
  in ROADMAP with "branch rc-f2a" — but teardown deletes branches and #174 is
  permanent. **Once the PR exists, its number replaces the branch name in the
  same PR.** RF16's dangling-citation corollary in a new costume.
- **The status-paragraph check has now fired three gates running (#165, #167,
  #174).** Phase RC's Status still read pre-walk after the walk ran and its
  record merged. The step promoted at #165 works; it is the _fixing_ that keeps
  not happening. Consider it a standing condition on any PR that ticks a box in
  a phase whose status it does not touch.
- **The right way to hand a traded-away property to a successor spec, worth
  copying:** F2a's under-count risk landed in FOUR places — the body above the
  fold, the spec §2b, `continuity.ts`'s header, and **inside RC-1's own ROADMAP
  item body**, which is the only one F2b's author will actually read. This is
  the counter-example to the "it lived only in the PR body" finding (RF14) that
  five of the last six gates had to rescue. Cite it when a PR defers a risk.
- **Release call: NO TAG; rides the next MINOR with F3**, per the LL-close
  pre-statement. `v0.19.0..main` was empty, so waiting bundles nothing. Notes
  owe BOTH directions — fewer false closes AND a merge that can silently
  under-count. **Tripwire recorded so the hold is not filing-as-deferral: if F3
  has not landed within two merges, F2a tags alone as a PATCH.** A
  record-destruction fix reaches a cohort of one only through the tag.
- **Backlog: 65 at merge-base -> 65 on the branch (217 checked); main
  independently 61.** Branch-neutral: F2a ticked, one item filed — and filed
  because James assigned it an owner the same day, which is the distinction the
  filing-as-deferral pattern turns on.
- **The 30-second rule is 0-for-11** (#174 at 278 words). Five gates have now
  declined to enforce it. Recorded observation, not another paragraph: line one
  named the outcome and every bullet answered "so what?" — the rule is measuring
  length where it means decodability. Still James's to re-set or retire, still
  belongs in CLAUDE.md.

## PM final-PR gate, PR #180 (storage spine PR 1), 2026-08-23

- **The empty-rollup first command is a check, not a prediction — and the
  dispatch's own premise gets checked with it.** #180 was dispatched as
  "empty rollup + CONFLICTING, main has moved all day". Both were false:
  CI was running against the real head, and `merge-base` equalled
  `origin/main` exactly (#179's commit). Thirty seconds of `gh pr view` +
  `git merge-base` retired two thirds of a gate question. **A controller's
  description of PR state is an unsourced premise like any other.**
- **"Nothing displays it" is provable in one grep, and it is the honest
  answer to "what does a tester receive".** For any storage-spine-shaped PR,
  `grep -rn <field> app/src app/domain | grep -v test | cut -d: -f1 | sort -u`
  settles it. #180's returned only `monitor/` files — so the correct
  tester-impact bullet was "you see nothing", and the body never said it.
  **A PR that changes nothing visible must SAY it changes nothing visible;
  omitting it reads as an oversell by silence.**
- **The code was more honest than its PR body, in both directions.** The
  n=1 caveat on the ~400 ms figure is carried verbatim at
  `useMonitorSession.ts:635-638` and in the spec, and the body upgraded it
  to "in practice". The residual capture gap is stated in `driver.ts`'s own
  comment AND on ROADMAP, and the body's headline claimed "every natural
  finish". **When a gate finds an overclaim, check whether the code already
  contains the honest version — twice now the fix has been "copy the doc
  comment up", not "go measure something".**
- **A citation to a place is checkable in one command; check it.**
  "Deferred minors in the ledger archive" — no such file, and
  `grep -rl` for the three named findings returned nothing anywhere in the
  repo or in git-excluded `.superpowers/`. That is #14 and #16's corollary
  in one line. **Grep every "recorded in X" phrase in a Record block; the
  fifth-plus rescue at a PM gate happened here.**
- **Ruling: PR 1 merges on CI, not on the walk — because the walk needs it.**
  Spec exit 7's readout is the linger-end second stash, which PR 1 ships, so
  holding the PR for hardware deadlocks. This does NOT generalise the CR2
  precedent away: CR2 spec 1 merged on the walk because it changed a
  DISPLAYED number. **The line is display, not storage.** The residue was
  made a merge condition — a ROADMAP line gating the first display of
  `summaryTotals`/`verificationBytes` on exit 7's photograph, because until
  then those numbers are verified only against our own fake and our own
  capture (#11), and the fields are deliberately unvalidated by
  `isMonitorRun` until a reader exists.
- **Shipping a mechanism can silently stale a walk card.** PR 1's 2 s linger
  half-satisfies ROADMAP W2's "needs a temporary build that defers the
  disconnect" while leaving its 90-second question untouched, and no card
  mentions the second stash the exit depends on. **When a PR ships behaviour
  a walk card was written to work around, reconcile the card in the same
  PR** — #13's operator-instruction bar applies to cards that go stale, not
  just cards written wrong.

## PM final-PR gate, PR #182 (storage spine PR 2 — TRIAD twice), 2026-08-24

- **A late fix can falsify a durable record and stop one file short.** #182's
  BLOCKER-1 turned two columns from `integer` to `double precision` and corrected
  the migration comment, the schema comment, the route comment and the PR body —
  and never touched `ROADMAP.md`, whose SHIPPED paragraph still read "four
  nullable `integer` columns … POST-validated non-negative-integer-or-null". This
  is the inverse of #180's "the code was more honest than its body", and it is
  worse: the ROADMAP paragraph is what the successor spec's implementer reads.
  **At any gate on a PR with a post-review fix wave, diff the fix commit's file
  list against the durable records the earlier commits wrote to** (`git show
<fix> --stat | grep -i roadmap`) — a fix that touches only code and comments is
  the tell.
- **Transcribed capture hex is checkable in one grep, and the check is the whole
  value of the oracle.** #182's work/rest pin hand-transcribes five 0x0037 frames
  into a test. `grep -c -- "<hex>" docs/monitor/sessions/.../session-2.jsonl`
  returned 1 for each. Do this every time a test claims "REAL capture" with inline
  bytes; without it the oracle is a transcription and the external authority is
  gone. #182 also states the decoded literals (398.4/90) alongside a `reduce`
  cross-check rather than only the reduce — that is the fix for RF#3's
  "agrees with itself whatever the value is", and it is the shape to ask for.
- **"Additive and nullable" is not the whole stored-shape question — ask what the
  columns MEAN together.** #182 stores `restMeters` (a machine measurement
  corroborated against TWD: 1535+64=1599) beside `restSeconds` (explicitly "A
  READBACK, NEVER A MEASUREMENT"), summed under one name and bound by one
  all-or-nothing guard that implies a shared provenance they do not have. Nothing
  displays them today, so it costs nothing until the reconciliation reads them.
  **At a stored-shape gate, check whether adjacent fields under one heading share
  a provenance** — the fake-pause failure mode, wearing a column name.
- **"By design" needs its rejected alternative, or it is an assertion.** #182's
  no-backfill sentence is correct and correctly placed, but the stored `series`
  carries `r?: true` on rest samples, so a retroactive split WAS available. The
  right reason — a 1 Hz-bucket derivation would be OUR number stored in a column
  that reads as the machine's, i.e. RF#11 in a new costume — is better than the
  assertion and appears nowhere. **When a gate meets "by design", ask what the
  other option was and whether its rejection is written down.**
- **A silent REMOVAL is the most urgent kind of release note.** `v0.20.0..main`
  holds #179 (visible) and #181, which deletes START HERE from Today and Learning
  the app from You. A surface vanishing with no note reads as a regression, not a
  decision, and that clause owes a where-it-went sentence, not just a
  what-changed one. **Release call: NO TAG on #182 (nothing falsifiable, the
  #140 rule, pre-stated at #180's gate); v0.21.0 MINOR is owed for #179 + #181
  and is time-sensitive because of the removal.** Pre-stated for the future:
  when RC-5 reconciles the three heroes, its notes owe "applies to rows recorded
  after this build" — #182 makes the log history permanently two-population, and
  that belongs in RC-5's ROADMAP body now, not rediscovered later.
- **The status-paragraph check has now fired FOUR gates running** (#165, #167,
  #174, #182): Phase RC's Status still read "NEXT: the RC-1/RC-8 storage-spine
  spec" with #180 merged and RC-1 shipping in the PR under gate. Treat it as a
  standing condition on any PR that ticks a box in a phase whose Status it does
  not touch; stop re-deriving it.
- **The 30-second rule is 0-for-12** (#182 at 293 words); sixth consecutive
  declined enforcement, same reason — line one named the outcome, every bullet
  answered "so what?". Still James's to re-set or retire, still belongs in
  CLAUDE.md.
- **Backlog: 62 unchecked / 223 checked on the branch, 63 / 222 on main.**
  Branch-neutral — RC-1 ticked, nothing filed. Third consecutive gate where the
  phase is executing rather than filing.

## PM final-PR gate, PR #183 (storage spine PR 3, F2b — TRIAD), 2026-08-24

- **A corpus can be unrepresentative in the direction that makes a gap look
  like safety.** #183's record says, correctly and in four places, that the
  production `distanceGoal` predicate "suppresses the ENTIRE corpus" (0
  backward readings over **0** pairs). A reader carries away "suppressed
  everywhere we looked." The library says otherwise:
  `programHasDistanceGoal` is `intervals.some(i => i.kind === "distance")`,
  and **198 of the 300 seeded workouts contain no distance step** — the bound
  ships LIVE on ~66% of the library with zero swept pairs under the predicate
  that governs it. **When a sweep comes back vacuous, measure how big the
  unswept population is before writing the vacuum down** — one command. A
  vacuum reported without its denominator reads as inertness.
- **The KEPT ruling is this ledger's first spec conditional resolved against
  the convenient arm on its own evidence, and the record is durable in three
  places** — a test asserting `nonSuppressedPairs).toBe(0)` with the reason in
  its own name, the file header, and ROADMAP. Cite it as the shape to copy:
  **an assertion that a gate was NEVER EXERCISED is a stronger artifact than
  the clean result it accompanies.**
- **"Nothing displays it" and "a tester sees nothing change" are different
  sentences, and #180's precedent only licenses the first.** #180 stored
  fields nobody read. #183 changes what a tester RECEIVES in the case it
  exists for — two honest rows instead of one short one, or a healthy row
  split in two if it misfires — while displaying nothing new. **Apply the
  precedent by reasoning, not by copy: ask what the tester GETS, not what the
  screen shows.**
- **An unscoped superlative in line one loses to its own bullet 3 lines
  down.** "never worse than F2a anywhere" vs "it adds one new way to close a
  healthy row" — both above the fold, in the same PR. `continuity.ts` scoped
  it correctly ("EXACTLY F2a's verdict" wherever the count is absent) and the
  body dropped the scope. Third gate running where **the code was more honest
  than the body and the fix was to copy the doc comment up.**
- **A forward-pointer citing a PR is a dangling citation the moment that PR
  merges.** ROADMAP told PR 3 to "sequence that awareness into PR 3's own
  spec"; PR 3 did not (the raw count has no reader outside `continuity.ts`),
  and after merge the line names a vehicle that has left. **At any gate, grep
  ROADMAP for the PR under gate and check every forward-looking sentence
  about it** — the successor's name must replace it before it merges.
- **RF14 rescue, and a new one: the only real backward interval count in the
  corpus is a CONNECT-TIME leftover register** (`session-2-wu-4unequal.jsonl`
  AS2 seq 24→29, 3→0). Harmless today only because no re-subscribe path
  exists this phase. **Phase LL's reconnect re-opens that exact shape with a
  run OPEN, and neither A-2 nor the "Before reconnect is IN" list mentioned
  the continuity guard.** Landed in LL's own item body at this gate — the
  #174 "put it where its author will read it" pattern, second use.
- **The status-paragraph check has now fired FIVE gates running** (#165,
  #167, #174, #182, #183): "two-thirds executed … PR 3 is the spec's
  remaining third", on the PR that executes the remaining third, in a branch
  that rewrote 55 ROADMAP lines. **Escalate: it is now a merge condition on
  every PR that completes a spec or ticks a phase box, checked before the
  body is read.**
- **Release call: NO TAG on #183; it rides v0.21.0 MINOR, which was already
  owed and is unchanged by this PR.** Two clauses owed: the new count-bound
  clause with both directions and its honest boundary, and a **correction to
  a note testers have already read** — v0.20.0's "the total can come up short
  until a deeper fix lands" must become "narrowed, not closed." That debt was
  on ROADMAP before the gate rather than rescued at it; first time.
- **Backlog: 62 / 223 on the branch, identical to main.** Fourth consecutive
  branch-neutral gate — the phase is executing, not filing.
- **The 30-second rule is 0-for-13** (#183 at 337 words); seventh consecutive
  declined enforcement, same reason. Still James's to re-set or retire, still
  belongs in `CLAUDE.md`.

## Phase-open gate, 2026-08-24 (Phase JR slate: Just Row, observe the machine's free row)

- **"The driver can do it" is not "the app has a path to it", and a capture
  walk is the place that gap gets discovered at the erg.** JR's PR 0 walks an
  unprogrammed Just Row on the strength of `driver.ts` ("frames flow before any
  `program()`"). True at the driver; false at the app --
  `WorkoutDetail.tsx:232`'s `handleConnectProceed` is the ONLY connect entry,
  and `ConnectedInterstitial.tsx` fires `session.connect()` at `:298` then
  auto-`program()` at `:312` with no operator-holdable window between them. A
  walk that needs a state the shipped UI cannot enter needs an INSTRUMENT
  first, and that instrument is a PR, not a walk item. **At any gate that
  schedules a capture, name the screen and the tap sequence that reaches the
  state being captured** -- RF13's operator-instruction bar applied to a walk's
  PREMISE rather than its printed commands.
- **Two hardware sessions in one queue is one hardware session.** JR's PR 0 and
  RC's exit-7 walk were scheduled independently, days apart, on the same erg.
  (Overtaken by events -- James had already run exit-7 -- but the technique
  stands: check the walk queue before scheduling a new trip, and remember the
  #100 rule that an instrument sharing a week with a scheduled walk outranks
  the queue.)
- **A stored shape can hide in the PR labelled "surface".** JR assigned TRIAD
  to PR 1 (`session_logs`) and put `MonitorRun` "v2, additive `mode`" in PR 2.
  `MonitorRun.program: WorkoutProgram` is REQUIRED and `isMonitorRun` enforces
  `isPlainRecord(program) && Array.isArray(program.intervals)` -- so the
  "additive" field is really fabricate-an-empty-program or
  make-program-optional (a reader sweep). localStorage is TRIAD by the fast
  path's own line. **At a slate gate, grep every persisted record the phase
  touches for REQUIRED fields the new case cannot supply, and re-cut the PR
  boundary on the answer** -- not on the spec's own labels.
- **The server's plan-advance DEFAULT is `true`, and every "this must not
  advance the plan" spec has to say so.** `routes/data.ts:1382` reads
  `advancesPlan: (body.advancesPlan as boolean | undefined) ?? true` -- there is
  no server-side derivation from workout type at all, so "the plan derivation
  provably skips it" mis-locates the mechanism onto a component that does not
  make the decision. Third relative of 6I's "a baseline test must not silently
  consume plan session 1". **Require both halves: the client posts `false`, and
  the server refuses to advance for the new type.**
- **A whole-piece average has no wire source when the piece has no intervals.**
  JR's stored-shape table said `avg_split_seconds` = "last live frame". This
  codebase's `avgSplit` is `splitIntervalAvgPace` (`parse.ts:568`), SPLIT-scoped
  -- and a Just Row auto-splits every 5 minutes, so on a 25-minute row that is
  the last five minutes. The only whole-row average, `avgPaceSecondsPer500m`
  (`parse.ts:362`), lives in the 0x0039 frame. **Before storing any "average"
  for a piece, name the frame, name its scope, and confirm the scope is the
  piece.** Direct application of the CS-close split-field ruling. Resolution:
  derive `500 x time/distance` ourselves, labelled ours.
- **A new door must fit the card it joins, or the card is being rewritten.**
  JR's fourth "quiet door" entered `DoorsCard` -- label `SET UP YOUR BASELINE`,
  body "Every workout's targets come from your 2k and 6k baseline splits" --
  as the one door that produces no baseline. **Ruled CUT at this gate (James
  confirmed):** the phase's own always-visible Today row already delivers
  "nobody is ever blocked from just rowing", so the door bought nothing and
  cost BL's approved framing. **Generalises: when a spec adds a member to an
  existing card/list/group, read that group's OWN heading and body copy back
  against the new member.**
- **A route can be the unbuilt half of a feature.** "Offers the normal log
  screen" was one bullet in JR's PR 2. `monitorModeRun` (`LogSession.tsx:253`)
  takes `workoutId: string`, requires an exact match; its route is
  `/library/:id/log`. A null-workout run has no `:id` -- and `Today.tsx:667`
  already hides "Log it" for exactly that case, calling it a latent in its own
  comment. **Whenever a spec says a new record "reaches the existing screen",
  check the screen's ROUTE PARAMETERS, not just its component.**
- **Best oracle sentence at an open gate so far, worth copying:** JR's exit
  walk states what its oracle MEASURES before claiming agreement. That is
  RF#11's 2026-08-21 sharpening satisfied unprompted, at the slate stage.
  (The anchor pass then sharpened it further: the comparison is a
  TRANSCRIPTION check, not a definition check, because the stored number IS
  the PM's counter -- both statements now live in the spec.)
- **Release call: NO TAG on PR 0 or PR 1 as tester releases** (an instrument
  no tester can reach; stored fields nothing renders -- the #140 rule, third
  pre-statement in a row); but PR 1 still tags READ-SIDE-FIRST at patch level
  (the R-A discipline: the fallback ships in an earlier tag than the writer).
  **PR 2 is MINOR and gets a clean attributable release.** Notes owe three
  clauses: the feature, **that a Just Row never advances your plan**, and that
  these rows carry no targets and no type chip.
- **Exit criteria: the phase had a walk and no per-PR criteria.** Six numbered
  criteria now frozen in the spec; criterion 1's honest form is "`done_n` is
  unchanged across a Just Row save", not "the columns are null" -- the #117
  tautology check.
- **The 30-second rule is 0-for-13.** Still James's to re-set or retire, still
  belongs in `CLAUDE.md`.

## Storage-location ruling, 2026-08-24 (RC-2/RC-3 wave, summary record)

- **A display target names a storage tier; check the read path before
  approving "store it client-side".** The summary-record spec was approved with
  display on the log detail AND storage on the client `MonitorRun` record. The
  log detail is server-backed (`storedSummary.ts:5` — `GET /api/logs/:id`) and
  `LogSession.tsx:1178` calls `clearMonitorRun()` in the save callback, so the
  record dies at the instant the row it would decorate is born. Three
  individually reasonable scoping answers were jointly impossible. **At a
  phase-open gate, trace the proposed display's fetch call before ruling on
  where the data lives.**
- **"Defer the display" and "discard the evidence" are different decisions and
  look identical in a spec.** Not storing the machine's burst until RC-5 means
  every connected session rowed in between is permanently unverifiable — a
  burst never captured cannot be backfilled. Reshaping a stored column later is
  recoverable; not capturing is not. Prefer the recoverable error.
- **The additive-nullable-jsonb precedent is in the schema, twice.** Migration
  0011 (`series`) and 0012 (`ended_by`) both exist because monitor-observed
  data had to outlive the client record for the log detail to read it
  (`app/server/db/schema.ts:213-229`). Cite them rather than re-deriving the
  argument; a ~250-byte blob beside a 1 Hz trace is not a footprint question.
- **Moving storage to the server re-arms a gate the spec waived.** The wave's
  PR 2 was scoped "no PM gate — display of already-gated numbers". Displaying
  server-stored values makes it a stored-shape consumer; the waiver was written
  against the client-only premise and does not survive the correction.
- **Resolution (James, 2026-08-24, after a footprint-quantified Eng/DBA/PM
  argument):** HYBRID — typed `machine_work_seconds`/`machine_work_meters`
  columns plus one `machine_summary` jsonb; footprint (~50-125 KB/year) ruled
  a non-issue by all three arguers.

## PM final-PR gate, PR #190 (summary-record wave PR 1 — TRIAD: stored shape ×2), 2026-08-24

- **A "coincidence" in a test comment was the external scale proof the ROADMAP
  caveat was waiting for.** #190 deleted RC-3's "`avgPaceSecondsPer500m`'s /10
  scale … has never decoded a real byte — DOC-ONLY until a capture lands"
  without citing evidence, while two of its own tests contain it: the keystone
  is 500 m in 138.7 s and its pace field decodes to 138.7 (a 500 m piece's
  pace-per-500 m IS its elapsed time, from a different byte range —
  `burstReplay.test.ts` called the match "a coincidence of this particular
  piece's pace"), and the terminate capture's 24.3 s / 76 m implies 159.9
  against a decoded 159.8. **When a PR deletes a documented caveat, make it
  quote the evidence that discharges it** — and when a derived identity makes
  two independently-decoded fields equal, that is a scale oracle, not a
  coincidence. Sibling of RF#11: this is the rare case where the app CAN be
  checked against arithmetic the wire cannot fake.
- **A discharged display gate covers the population it was photographed
  against, not the next one.** #180's merge condition gated display of
  `summaryTotals`/`verificationBytes` on exit-7's photograph; exit-7 passed and
  the gate is spent — for those two. #190 stores NINE new machine fields with
  no screen oracle at all, one of which (`avgStrokeRate` = 44 where physics
  says 22, `pm5-interface-notes.md` §25) the only terminate capture proves
  wrong. **When a PR extends a verified field set, ask whether the verification
  extends with it, and re-arm the gate for the new members in the durable
  record** (here: RC-3's own body, for Phase PS to find).
- **Verbatim jsonb moves validation to every future reader.**
  `validateMachineSummary` checks object-ness, a size cap and the
  `verificationBytes` band; the nine fields ride through unshaped, per the
  `series`/migration-0011 precedent. Right for a capture PR — but the
  obligation ("type-guard each field at read") must land beside the stored
  shape, not only in the route's comment.
- **"Died at save" is a claim about a PRIOR build; check which fields it
  covers.** #190's first bullet said the nine stats "died with the client
  record the moment you saved". They never reached the record at all — the
  parser had zero consumers. True of #180's two fields, false of the nine, in
  one compound sentence. **At a gate, read every "before this" clause against
  the tag it describes** (`git show v0.21.0:<file>` settles it, and this branch
  used exactly that command to settle a different false premise about build
  738 — twice).
- **The strongest argument nobody made, and its resolution, recorded so the
  next reader does not re-derive it:** the terminate capture (`driver.ts` +375,
  four gates plus a fifth invented after the antagonist pass, n=1 lab capture,
  zero app-STOP-venue captures, margin down from ~5x to ~1.7x) had a real case
  for shipping separately, gated on the walk photograph it already owes. Ruled
  SHIP TOGETHER on this ledger's own storage-location principle — **not
  capturing is unrecoverable, reshaping a column later is not** — and because
  the failure mode is bounded to the status quo (burst missed), with gate 3
  making the dangerous outcome structural rather than guarded.
- **Zero-behavioural-line tail, fourth occurrence** (#104, #109, #183, #190):
  the review's own fix wave changed one error string and otherwise only
  comments and a test. One command settles it; keep it as the standard.
- **Exit-criteria freeze, clean:** `## Exit criteria` byte-identical (md5) from
  the antagonist revision through HEAD, and that commit precedes the plan and
  every implementation commit. The late spec edit touched §1 wording only —
  the #104 "check the block, not the file" rule working as intended.
- **The status-paragraph check has now fired SIX gates running** (#165, #167,
  #174, #182, #183, #190) — a PR that ticks RC-2 and RC-3 and rewrites 79
  ROADMAP lines left Phase RC's Status calling the RC-2/RC-3 wave the "live
  frontier … now unblocked". It was made a merge condition at #183's gate and
  still is not being run. Stop re-deriving it; run it before reading the body.
- **Release call: NO TAG on #190** (nothing a tester can see; the #140 rule,
  fourth pre-statement in a row). `v0.21.0..main` is empty, so PR 2 opens a
  clean attributable MINOR whose notes owe three clauses: the block, **that it
  appears only on rows saved from that build forward** (no backfill, by
  design), and what "MACHINE CONFIRMED" means on a row the rower TERMINATED —
  #190 makes that data exist, and PR 2 will label an abandoned piece with the
  machine's own confirmation and a verification code nothing has ever checked
  for a terminated piece.
- **Backlog: 64 unchecked / 226 checked on branch vs 64 / 224 on main** — two
  ticked, two filed. Both new items are hardware-walk items no desk session can
  discharge, so this is honest deferral, not filing-as-disposal; first
  non-branch-neutral gate in five, worth watching rather than flagging.
- **The 30-second rule is 0-for-14** (#190 at ~210 words); eighth consecutive
  declined enforcement, same reason — outcome line, six so-what bullets, depth
  in the Record block. Still James's to re-set or retire, still belongs in
  `CLAUDE.md`.

## PM final-PR gate, PR #191 (series-truth — TRIAD twice: a number's meaning + a stored shape), 2026-08-25

- **A walk that verifies the ACCUMULATOR has not verified the STORED SERIES, and a
  status paragraph will happily conflate them.** Phase RC's Status says the exit-7
  walk "matched the PM5's memory screen digit for digit … the display gate is
  UNLOCKED" — true of the totals, and the same session silently saved a chart
  missing 56.1s of its faster interval. The defect was found by James looking at a
  graph, not by any gate. **When a walk photographs numbers, ask which artefacts it
  did NOT check** — a two-screen photograph is an oracle for one quantity, not for
  everything the session wrote. Sibling of RF#11's oracle rule, one level out: the
  oracle was sound and its SCOPE was overstated.
- **A criterion edited mid-implementation because the implementer MEASURED it false
  is the good case — check direction, not timestamp.** #191's `## Exit criteria`
  changed once, after three implementation commits (#100's rule reads that as
  drift). The original criterion 3 demanded ZERO backward-bucket counts on the
  clean captures from a predicate that measured 1 and 18 on those same captures —
  it was unsatisfiable as written. The edit narrowed the predicate AND added a
  positive control ("the poisoned counterfactual counts ~57") the first version
  lacked. Sharpens #104: a criterion that gained a positive control hardened; one
  that lost a clause softened.
- **The "deferred" axis question was not deferrable, and only the file layout
  showed it.** §D queued "should the chart use a work-only clock?" as out of scope,
  correctly. But `TraceChart` renders in `PostWorkoutSummary.tsx`/`FromTheLog.tsx`
  and `summaryTotals` is consumed in `LogSession.tsx` — the SAME surfaces the
  pending MACHINE CONFIRMED block targets. On the exit-7 piece that is a badge
  saying the machine confirms 500 m beside a chart axis running to 742.7 m: 48%
  apart, in one frame, on the screen whose selling point is machine agreement.
  **Before accepting "this axis question is deferred", enumerate what the NEXT
  planned PR will render beside it.** RF#7 ("recompute the headline from the rows
  in the same frame") applied one PR early, at sequencing time.
- **A solo canary is unavailable the moment ANY tester-visible merge is already
  unreleased.** #191 is a triad number-meaning fix and the 2026-08-15 precedent
  says those tag alone — but #189 (baseline control, visible) was already sitting
  in `v0.21.0..main`, so a tag would bundle regardless. Ruled: NO SOLO TAG, rides
  PR 2's MINOR. **Second half, and the reusable part: the fix's owed verification
  is a 2×Nm rNN CAPTURE, which needs the dev/web-gated instrument — a Chrome walk,
  no build.** Before cutting a canary tag "so it can be verified", check whether
  the verification medium needs a build at all.
- **Residuals landed in ROADMAP, not the PR body — first gate in a long run with
  nothing to rescue.** Five items filed (flake, C′ continuity-reset rider, the
  2×Nm rNN capture walk item, the axis question, James's derivation audit), two
  ticked. RF#14 finally not firing. Watch the other end though: Phase RC's
  close-out gained three unscoped items in one PR, the derivation audit being a
  sweep nothing has sized.
- **Zero-behavioural-line tail, FIFTH occurrence** (#104, #109, #183, #190, #191):
  one comment word in `driver.ts`, a ROADMAP filing, a spec sentence. Standard
  holds; the two-command check still settles it.
- **The status-paragraph check has now fired SEVEN gates running** (#165, #167,
  #174, #182, #183, #190, #191) — this time on a PR that rewrote 87 ROADMAP lines
  and left the Status paragraph both silent about itself AND overstating the walk
  above it. Merge condition since #183, never once run. It is no longer a lapse;
  it needs a mechanical home (a phase-close grep, or a line in CLAUDE.md) or it
  will fire an eighth time.
- **The 30-second rule is 0-for-15**; ninth consecutive declined enforcement, same
  reason — shape correct, length inherent to a triad PR. The enforceable failure at
  this gate was CONTENT, not length: the accepted-cost behaviour change (a
  reconnect-spanning boundary now shortens the chart clock to match the totals)
  lived only in the Record block. **Judge the top by what it OMITS about behaviour,
  not by word count.** Still James's to re-set or retire, still belongs in
  `CLAUDE.md`.

## PM final-PR gate, PR #192 (summary-record wave PR 2 — display of stored machine totals), 2026-08-25

- **A capture that stages an IMPOSSIBLE pairing is worse than no capture, and
  "we used the walk's REAL values" is how it happens.** #192's flagship
  `log-detail.png` put `MACHINE CONFIRMED · WORK ONLY / 2:04.0 work · 500m`
  under a hero reading `TIME 7:58 · DISTANCE 2000`, with a caption asserting the
  gap is rest — 1500 m and 354 s of rest coast in a 7:58 piece, 75%. The
  screenshot spec grafted exit-7's genuine single-piece decode onto an unrelated
  4×500 m fixture and its own comment celebrated the provenance ("not hand-picked
  round numbers"). `types.ts` plus `walk-2026-08-24/README.md` (the PM5's
  own Totals row, `2:04.0 / 500`, summed across two intervals) settle that 0x0039
  is whole-workout, so the pairing cannot occur. **Real numbers from the wrong
  session are less honest than invented consistent ones.** Third occurrence of
  RF#7's sharpened form (#117's hero, #191's axis prediction, this).
- **Re-gate (47671a4): all five conditions landed, and the fix wave produced a
  BETTER artefact than the condition asked for.** The re-shot frame is the exit-7
  piece itself, so the real 500-vs-742 collision is now in the committed record
  and the labelling ruling is judgeable rather than merely asserted — the fix for
  a dishonest capture was a MORE demanding capture, not an easier one. The §23
  discharges state the discriminating prediction ("a per-interval reading would
  have shown 56.1s/250m, not the 124.0s/500m the wire delivered"), which is the
  form that makes an n=1 citable; copy that shape. **Standing note for the next
  gate: a re-gate still opens the PNG.** The report said the frame was fixed and
  it was — but the two prior gates in this wave were both settled by ten seconds
  of in-frame arithmetic, never by a summary of it.
- **The arithmetic check was run on the relationship that already existed.** The
  PR body said "hero arithmetic recomputed (478s/2000m → 1:59.5 ✓)" — true, and
  the AVG-SPLIT identity predates this PR. The relationship #192 _introduces_
  (block vs hero) went unchecked. **At a gate, recompute the pairing the PR ADDS,
  not the one the screen already had.**
- **A mitigation sentence must point AT the object the ruling names.** James's
  label ruling resolved the block-vs-chart collision by labelling; the first-cut
  caption read "The totals **above** include rest" while `TraceChart` renders
  BELOW the block with a rest-inclusive x-axis. One word excluded the one
  object. Fixed at the re-gate ("Everything else on this screen"). Also note the
  design inversion, accepted: the sentence carrying the semantic load renders at
  10px `--ink-3` — the smallest, faintest text in the block.
- **The status-paragraph check PASSED — first time in eight gates** (#165, #167,
  #174, #182, #183, #190, #191 all failed it). **But Phase CM's Status went
  stale in the same commit**, still describing the 5 m quantisation #192
  reverses (fixed at the re-gate). **Extend the check from "this phase's
  paragraph" to "every paragraph that records a ruling this PR reverses"** —
  grep the reversed ruling's own nouns, not the phase name.
- **A capture-only tail is behaviourally zero-risk and evidentially HIGH-risk.**
  #192's original tail was captures + screenshot spec + a spec amendment — zero
  product-behaviour lines, clean by the running standard — and it carried this
  gate's only blocking finding. Captures are what a gate READS. The two-command
  behavioural-line check stays right; it does not bound evidential risk.
- **Wire facts this PR's label rests on, banked:** exit-7 (2×250 m r60) had
  0x0039 report **500 m / 2:04.0** — the SUM across two intervals, so
  whole-workout cumulative, not per-interval like its 0x0031 namesake — while
  TWD read 742, so 0x0039 **excludes rest**. §23's walk items 2 AND 4, both
  discharged at the re-gate with the discriminating prediction stated. **A
  discharge that lives only in a walk README is a dangling discharge — the
  inverse of RF#16's dangling citation.** n=1, but a DISCRIMINATING n=1.
- **"Moot" answered a copy question with an implementation fact.** #190's gate
  put the terminated-piece obligation on the RELEASE NOTES; #192's body declared
  it moot. Fixed at the re-gate (routed to the notes). **Check which artefact an
  obligation was placed on before accepting that it is discharged.**
- **Release call: `v0.22.0` MINOR, notes PR before the tag.** `v0.21.0..main` is
  SEVEN merges, eight with #192. Notes owed by: #189 (baseline control,
  tester-visible), #191 (series-truth: charts stop dropping intervals,
  PROSPECTIVE ONLY, plus the chart-clock shortening above the fold), #192 (the
  block; new rows only, no backfill; the 1m counter; what CODE is for; that it
  renders on pieces you ended early). No note, with reasons: #185/#187/#188
  (docs only), #186 (22-package bump, no intended behaviour change), #190
  (storage; owns #192's "from this build forward" clause).
- **The 30-second rule is 0-for-16**; tenth consecutive declined enforcement.
  Shape correct, length inherent to a triad PR. The enforceable failures were
  CONTENT (the overclaim and the deflection), both fixed at the re-gate. Still
  James's to re-set or retire, still belongs in `CLAUDE.md`.

### 2026-08-25 — RC-5: "match the PM5" resolved, and what the PM5 actually shows

**Decoded from primary evidence** (three photographed View Detail screens +
0x0039/0x003A decode of `walk-2026-08-24/phone-exit7-ring.json`):

- The PM5's **Totals row is one population — work only**: time, metres and
  `/500m` all agree by 500·t/d on their own row (124/500/2:04.0;
  254.9/899/2:21.7).
- **The only fused number the PM5 shows is Total Time, in the page header.**
  Rest metres live on rest rows and in 0x003A's own `Total Rest Distance`
  field (242 = 147+95). The machine never adds rest into a total.
- **0x0039 offset 18-19 Avg Pace = work-only** (1240 → 124.0 s), digit-equal
  to the screen. The PM5 HAS an average split; we assert nothing on its behalf.
- PM5 display and C2 logbook agree (both work-only) — "match the PM5" and
  "match the logbook" are one instruction here, not two.

**PM ruling:** all three heroes work-only and mutually consistent, wall-clock
elapsed on its own TOTAL line. A caption explaining a contradiction is a
confession, not a fix — any hero shape that keeps two populations in one row
fails Phase RC exit (c) by construction. Rejected the fused-TIME+DISTANCE /
labelled-AVG-SPLIT shape on that ground (it still implies a 40.4 s/500 m gap
on the exact piece we photographed).

**Oracle lesson (#11's 2026-08-21 form, recurring):** exit-7's own table
scored "DISTANCE 742 · TWD · MATCH" against a WIRE field the PM5 never
displays — its screen said 500. A walk that photographs both screens can
still compare the wrong quantity. **Ask which number is ON the screen, not
just which number the machine emits.**

**Fallback fact worth keeping:** work-only heroes need no "rows after build X"
clause — they derive from 0x0037 actuals stored since long before the
`machine_*` columns. Only the TOTAL line depends on rest, and programmed rest
reproduced the PM5's Total Time exactly on both rest-bearing walks.

**Rower persona (same day, independent):** first read of the current screen is
"the app's pace calc is broken" — the division is done in five seconds, every
time, by every rower. Wants work numbers as the piece and rest as overhead;
calls the fused pair "useless for comparing to my Concept2 logbook". Also
asked for: a piece ended early marked PARTIAL with no backfilled programmed
rest, and a link-lost row that says so rather than papering the gap (both
already shipped or queued — LINK LOST is live, PARTIAL is not: queued at
this spec's close).

## PM final-PR gate, PR #194 (RC-5 hero-truth — TRIAD: three numbers' meaning), 2026-08-25

- **A PR body claim was falsified by a passing test in the same PR.** Bullet 4
  said the history list "now resolves the same way as the detail, so one session
  can't read 742 in the list and 500 when you open it"; `HistoryList.test.tsx:459`
  asserts `"AVG 2:18.8 · 742 m"` is visible for a row whose detail renders 500 m.
  The residual was honestly recorded in ROADMAP and honestly pinned — and then
  denied above the fold. **At a gate, take each above-the-fold claim to the test
  file that would contradict it**, the same discipline the briefing already
  demands of specs. Sibling of #192's overclaim, one artefact over.
- **"Old rows don't move" and "rest is named on the line instead of hidden in the
  headline" cannot both be true.** Both shipped in one bullet, inherited verbatim
  from spec §3, contradicted by the PR's own flagship capture (742 → 500 on an old
  row). **When a bullet says a number stopped including something, it says the
  number moved** — check softening language against the impact bullet three lines
  below it.
- **A residual's POPULATION is a claim and gets the same evidence bar as a wire
  fact.** RC-5's "build-738-era rows render no AVG SPLIT (rows saved during
  v0.21.0's TestFlight window)" is unreachable: `git log -S machine_work_seconds`
  puts that column in #190 and `git tag --contains` puts #190 in v0.22.0 ONLY, so
  no build-738 row is tier A at all. The real population is one path — a run
  completed but left unsaved across the 738→747 update. It mattered because a
  release-note clause was owed to it: **an overstated residual becomes a false
  statement to testers.** Two commands settle it.
- **A shipped release note can be falsified by the NEXT release.** v0.22.0's note
  (`releaseNotes.ts:22`, one day old) says "everything else on that screen includes
  rest, so the numbers are meant to differ"; RC-5 makes the heroes work-only and
  makes block and hero MATCH. The branch tracked the v0.11.0 correction and missed
  the one-day-old one. **Grep `releaseNotes.ts` for the reversed ruling's own nouns,
  not just for old versions** — the most recent note is the likeliest to be
  reversed and the least likely to be suspected.
- **The mitigation-sentence rule recurred one release after it was written.**
  #192's caption fix was re-broken by RC-5: "Rest metres excluded, here and in the
  totals above" rendered four lines above "4:04 total · plus 242 m coasting in
  rest", the only object on screen called a total and the one that includes rest.
  **A caption asserting scope must be re-read every time the screen's scope
  changes; it is not fixed once.**
- **Accepted-residual ruling, with the argument, so it is not re-litigated:** the
  list-vs-detail 742/500 gap (monitor rows 2026-08-08..2026-08-24, `endedBy`
  finished/null) is ACCEPTED. The only alternative — making the detail decline
  tier B2 as well — would restore a fused 742 hero beside a work-only 2:04.0 AVG
  SPLIT on the rower's most recent rows: the 40 s in-frame contradiction RC-5
  exists to kill. **A cross-screen disagreement where one side is a summary line
  beats a self-contradicting detail screen.** It must be in the notes, not denied.
- **Seven accepted residuals were written `- **[ ]`, which is not task-list
  syntax** — every residual the PR filed was invisible to the ROADMAP counts this
  project runs on itself. **Filing that no audit can see is filing-as-deferral
  with better manners.** Check the delta, not the prose, when a PR says "all in
  ROADMAP". (After the fix: 73/231 vs main's 66/230.)
- **A stored column changed meaning with no marker, and it is documented in exactly
  one place.** `session_logs.distance_meters`/`time_seconds`/`avg_split_seconds`
  are fused before this merge and work-only after; `schema.ts` says so. Phase PS's
  input list did not, and PS owns "metres per week". **When a column's meaning
  becomes save-time-dependent, the note belongs with the FUTURE READER, not only
  with the schema.**
- **Re-gate, 0b19e20: eight conditions, all text, all landed, and the implementer
  verified the population correction INDEPENDENTLY** (`git log -S` +
  `git tag --contains` + `git show v0.21.0:`) rather than taking the gate's word —
  the same two-command habit #190's gate asked for, now used unprompted. The
  correction went further than the finding: `postTestOffer`'s silent decline was
  folded into the residual as the SAME cause, explicitly "NOT a second
  population." **When a gate finding says two symptoms share a cause, the fix is
  ONE residual, not two rows that will drift apart.**
- **Release call: `v0.23.0` MINOR, notes PR before the tag.** `v0.22.0..main` is
  EMPTY (v0.22.0 tagged at main's tip, #193), so this PR is the whole range.
  Notes owe: rest-bearing rows read smaller AND that this includes old rows; the
  machine's own numbers where the machine spoke, truncation named; corrections to
  BOTH v0.22.0's and v0.11.0's shipped notes; the bounded list-vs-detail gap;
  ended-early/link-lost rows keep their old headline; PARTIAL and the chart's
  rest-spanning axes explicitly not in this release. Before writing the
  build-738 clause, check whether such a row can exist for this cohort at all —
  if not, DROP it rather than describe a shape a tester cannot have.
- **The 30-second rule is 0-for-17**; eleventh consecutive declined enforcement.
  Length was again inherent to a triad PR; the enforceable failures were CONTENT
  both times. Still James's to re-set or retire, still belongs in `CLAUDE.md`.

## PM final-PR gate, PR #196 (RC-9 a/c/d free oracles — TRIAD: a wire field's meaning), 2026-08-25

- **Two comments citing each other for the same missing derivation is a dangling
  citation with an alibi.** `AVG_PACE_VERDICT_BAND_SECONDS` justified 1.0 s as
  "far inside what a single lost interval would move the quotient by
  (`recordAvgPaceVerdict`'s own comment has the worked reasoning)"; that comment
  said "BAND: `AVG_PACE_VERDICT_BAND_SECONDS`'s own comment." The reasoning
  existed in neither, nor in the spec, which asserted it in one clause. Each hop
  LOOKS sourced. **At a gate, follow every "see X for the derivation" one hop —
  a cycle of two is the common length.** RF#16's family; the tell is a
  load-bearing scalar whose owner comment defers.
- **A ratio oracle is blind to the removal of an average member, and this one was
  never told so.** `ours = 500·ΣT/ΣD` over `recordedActuals`. An interval lost at
  exactly the run's average pace moves the quotient by ZERO at any band —
  exit-7's dropped interval was caught only because it was FASTER. Bounded by the
  count checks above it, but nothing stated the limit, so a walk would read
  "agree" as "no interval was lost". **When an oracle compares RATIOS, ask what
  member could be removed without moving it** — the sibling to the 2026-08-21
  "what quantity does it measure" rule: also ask what it is INSENSITIVE to.
- **Diagnostics built for a walk must be NAMED where a walk operator looks.**
  #196 shipped two ring entries whose sole justification is "a line for a
  hardware walk to read"; grepping every `.md` for `avg-pace-verdict` /
  `rest-distance-verdict` returned ONE hit, in the throwaway plan. Not the
  ROADMAP row, not the walk-items card, not the `/hardware-walk` skill, not the
  PR body. **A diagnostic nobody is told to grep for is a diagnostic nobody
  reads — check the runsheet, not the row.**
- **Silence is an outcome, and it was the one outcome carrying no reason.** Every
  `avg-pace-verdict` suppression writes a plain-English cause — except
  `program()` landing inside `FINISH_GRACE_MS`, which cancels the pending
  reconcile and writes NOTHING. The `/hardware-walk` skill's own between-pieces
  rhythm is exactly that window. **When a diagnostic can be absent, the operator
  must be told absence is a finding.**
- **A walk README's evidence table labelled a DERIVATION as a screen reading.**
  `walk-2026-08-24/README.md:52` scored `DISTANCE hero | 742 TWD (500+147+95) |
742 | MATCH` under a column headed **PM5 (SCREEN)**. The PM5 never displayed
  742; the cell is hand-summed, and both sides are the same work+rest-coast
  quantity — the mirror #196 exists to retire, scored green in the phase's own
  PASS record. **Read every cell in a SCREEN column and ask whether a camera
  could have produced it.** Corrected in place, not deleted (the item-25 pattern).
- **The status paragraph carried a reversed noun INSIDE its PASS claim** ("matched
  the PM5's memory screen digit for digit … TWD 742"). #192's rule — grep the
  reversed ruling's own nouns, not the phase name — catches it in one grep. Ninth
  firing in eleven gates; still no mechanical home.
- **`CLAUDE.md` was the branch's own missed grep.** Its plan demanded "zero
  non-historical hits for `recordTwdVerdict`"; `CLAUDE.md:332` described it in the
  PRESENT TENSE inside recurring failure #11 — the entry this PR vindicates.
  **When a PR deletes a symbol, grep `CLAUDE.md` explicitly; it is the file every
  agent reads first and the one no diff review opens.**
- **Filing-as-deferral, third syntax.** Backlog was 73/231 on branch AND main —
  nothing ticked, nothing filed; three residuals were prose sub-bullets under one
  unchecked row, so all three would be ticked when (b) lands. #194 caught
  `- **[ ]`; this is the same disease with correct syntax and no checkbox at all.
  **Check the delta, and check whether a residual has its OWN row.**
- **Re-gate, `be145a0`: six conditions, all landed, two exceeded — and the best
  artefact in the PR was produced by the condition, not the original work.** The
  lost-interval derivation now carries the algebra, the ZERO-shift case, and a
  worked example off the exit-7 capture — **and the implementer caught its own
  SIGN ERROR by computing against the capture instead of reasoning it through.**
  That is RF#11's habit turned on a code comment: a derivation is a claim about
  numbers, and it gets checked against real ones. Second time in three gates that
  a fix wave produced a MORE demanding artefact than the finding asked for
  (#192's re-shot capture was the first). **The gate's own re-derivation is not
  optional either — the identity was expanded independently before passing.**
- **The walk README correction found a third count the gate missed**, and cited
  `summaryModel.ts`'s own comment ("it used to BE the DISTANCE hero … It no
  longer is") rather than asserting the concept was deleted. Copy that: a
  correction to a record cites the code that makes it a correction.
- **A walk instruction added at a gate gets the RF#13 check like any other.** W11
  tells the operator to read the ring off `MONITOR LOG · COPY`; verified a real
  control (`PostWorkoutSummary.tsx:534`, asserted by name in
  `LogSession.test.tsx:928`) before passing. It gives the PHONE route the
  `/hardware-walk` skill's `sessionStorage` one-liner does not — the skill is
  laptop-shaped and now one hop behind its own phase's runsheet.
- **A counting protocol is an instruction, and its arithmetic gets checked.** W11
  said to expect "N `avg-pace-verdict` lines (minus any genuinely suppressed
  ones…)". Suppressions WRITE a line; they do not subtract — the parenthetical
  invited the one miscount that would explain away a real zero-fire. Corrected at
  the re-gate. **Check that a protocol's arithmetic matches what the code emits,
  not what the shape sounds like.**
- **What this PR got RIGHT, worth copying:** the antagonist pass was dispatched
  BEFORE any spec existed, decoded all seven captures byte-level, and ruled (b)
  oracle-blind and (c)'s premise FALSE — the spec is written FROM the attack
  rather than defended against it. Exit criteria md5-identical across the whole
  branch. Every suppression reason is a plain-English sentence a human can act
  on. The fake's `averageSplit: e.currentSplit` fabrication (third sighting) was
  fixed BEFORE the first test of the field was written.
- **Release call: NO TAG on #196** — ring-only, zero tester-reachable surface;
  `v0.23.0` is at main's tip so this would be the whole range. Fifth consecutive
  pre-statement of the #140 rule. The next tester-visible merge opens the range;
  **#196 owes it no note, and the reason gets WRITTEN ("diagnostics ring only")**
  rather than silently omitted.
- **The 30-second rule is 0-for-18**; twelfth consecutive declined enforcement.
  The enforceable failures were CONTENT again: bullet 3 offered "differs from the
  monitor's OTHER average-pace field" as proof of independence from OUR
  accumulator — a non-sequitur; and the body of a walk-only PR never named either
  ring entry. Still James's to re-set or retire.

## PM final-PR gate, PR #198 (Phase LM PR 1 — TRIAD: what a stored row claims about itself), 2026-08-25

- **The under-claim/over-claim asymmetry is the argument that settles a "leave
  the record wrong" call — use it instead of re-deriving.** LM Task 4 chose to
  fix the live screen and leave the stored row reading `LOGGED BY HAND` for a
  connected session that opened no record. Both rejected candidates were
  rejected for reasons that took three revisions to get right; the reason that
  actually holds is simpler. A row that UNDER-claims (says hand-logged when it
  was a failed connected session) is a false negative and stays recoverable — a
  future `door` column is right about new rows. A row that OVER-claims (posts a
  best-effort last-used `deviceName` over a session that measured nothing) is
  indistinguishable from a real measurement and poisons every later audit,
  including the one that would count how often the bug fires. **Prefer the
  false negative.** Sibling to the 2026-08-24 "prefer the recoverable error".
- **Fixing the live path is not fixing the report.** The tester's complaint came
  from HISTORY, not from the screen they had pocketed. PR 1 fixed four live
  surfaces and left the one durable artefact unchanged, which is defensible —
  but at a gate, **ask which surface the ORIGINAL report was written from** and
  check that one first. The PR's own bullet led with "stops posing as
  hand-typed" and put "the stored row is still wrong" in a subordinate clause.
- **A phase section with ZERO checkboxes files everything it owes into another
  phase's backlog.** `## Phase LM` ran 140 lines with no `- [ ]` at all, so its
  two largest owed items (PR 2, and the permanently-wrong stored row) were
  prose, and RC-20 — a defect in Phase LM's OWN new component, found by its own
  fix round — was filed under Phase RC. Fourth syntax of filing-as-deferral in
  three gates. **At a phase-open gate, require the section to have at least one
  checkbox before any spec is approved against it.**
- **A deferral that violates a standing ruling gets a TRIGGER, not just a
  record.** LM knowingly excepts the 2026-08-18 "same fact must not read as two
  different words live versus from the log". Documented in three durable homes,
  which is right — but documented is not time-boxed, and the strongest attack on
  option 2 is that the divergence is permanent. Condition: a checkbox plus a
  named trigger ("the door column lands with the next stored-shape change to the
  logs table").
- **"True but reads oddly" is where a mis-sized finding hides.** The PR carried
  `Nothing kept.` beside a nonzero greyed metre counter as a cosmetic walk
  observation. Verified TRUE — but on a SINGLE-INTERVAL workout it is the
  outcome of every mid-row link loss, i.e. the majority case of the walk leg
  that would observe it, and what it honestly reports is that the in-flight
  interval's metres are discarded. **When a risk is filed as cosmetic, compute
  how often it fires on the most common workout shape before accepting the
  label** — a walk will otherwise record the majority case as "as expected".
- **An exit criterion that costs erg time gets a walk card before it gets a
  merge gate.** Criteria 9 and 10 existed only inside a 654-line design spec;
  `docs/monitor/sessions/` had no LM card and `grep "leg A"` returned zero.
  RC-20's own text already demanded one and the branch had not honoured its own
  row. Card written at this gate: `docs/monitor/walk-cards/phase-lm-pr1.md`.
- **The `.superpowers/` dangling citation reached the ROADMAP this time**, not
  just a PR body: RC-17's row pointed at a task report for the fix itself, and
  `.superpowers/` is git-excluded. **A row can honour RF#14 (landed in ROADMAP,
  not a PR body) and still lose the substance.** Grep every new ROADMAP row for
  `.superpowers/`.
- **Release call: TAG AFTER THE WALKS, `v0.24.0` MINOR** — do not wait for PR 2;
  correct resume is blocked on the same walk, and the warning strip is the only
  preventive element the app has. Range `v0.23.0..main` = #196 (no note, reason
  written: ring only) + #197 (docs) + #198. **The note's clause most likely to be
  dropped: repeat the v0.17.0 correction in full.** A correction appended to an
  old version's entry has an audience of zero. And the notes session must be told
  the cause-free constraint explicitly.
- **The 30-second rule FAILED here on CONTENT, not the count** — the first time
  the two agreed in nineteen PRs. Bullet 6 claimed self-diagnosing diagnostics
  that the branch's OWN new row says do not render on a device's first-ever
  connected session; bullet 5 buried the PR's most consequential fact in a
  subordinate clause. **A PR bullet that contradicts a row the same PR files is
  a mechanical check** — grep the body's claims against the branch's new rows.
- **What this PR got RIGHT, worth copying:** Gate 0's question ("in the waiting
  step, is it actually waiting?") turned a four-copy-defect task into ONE root
  cause — a `SurfaceStatus` union where `stale` evicted `armed` — curing nine
  displays plus four the sweep found. The whole-branch review caught the frame
  between two task boundaries ("Your numbers are kept." where nothing was) that
  four task reviews structurally could not. A committed capture contradicting
  itself was found and fixed in passing.

## Advisory, 2026-08-26 (James asks whether "O2 AT TR AN" should be renamed)

- **A vocabulary complaint from the owner is an N of 1 who also wrote the
  model.** Grepping ROADMAP, `docs/`, both ledgers and the release notes for
  type-code confusion returns ZERO; the only "confusing" report on record is
  bulk paste in the builder form. The cohort is a household behind an
  `ALLOWED_EMAILS` allowlist. **Before designing against a felt opacity, find
  the instrument** -- here it was `article_reads` (`schema.ts:422`), which says
  whether anyone read `workout-types` (News index 0, written to teach exactly
  these four). Unread means nobody was taught; read-and-still-opaque means the
  article failed. Opposite fixes, indistinguishable from inside. (In this case
  the instrument was moot -- closed prod, no audience -- which is itself the
  answer: **an app with no users cannot have a comprehension problem yet, only
  a comprehension RISK.**)
- **Check where the app already discloses before calling it a naming problem.**
  `TYPE_WORDS` (`components/typeWords.ts`) renders under the type chips on
  Today (`Today.tsx:1254`) and the Library filter (`Library.tsx:364`); the
  builder's classification card names them too. The only bare code is
  `TypeBadge` -- no `aria-label`, no `title` -- on Library `WorkoutRow` and
  history `LogRow`. That reframes a rename request as a disclosure fix. **Ask
  which surfaces lack the words before asking for better words.**
- **`WorkoutType` is the bulk-import grammar token** (`bulk.ts:65`), on top of
  being a pgEnum and stored `text` on `session_logs`, the filenames of 302
  seeded workouts, `plans.ts`'s sequences, `patterns.json`, the archetype
  classifier, four CSS tokens and 17 migration snapshots. **Price any rename
  against 8A PR B (#156)**: renaming TWO free-text titles cost 44 files,
  +689/-244, a solo triad PR merged last, a four-condition gate, a same-day
  tag, and permanent residue. (Refined by the premise pass the same day: the
  DATABASE is cheap -- catalog-only DDL -- the LITERALS and the readability of
  eight invariants are the cost.)
- **Ruling: NOT YET, no rename, no phase of its own.** The naming decision has
  an owner -- **Phase PROD**, "the last phase before strangers", which is
  exactly when a non-James rower meets a bare `TR` for the first time.
  (Originally proposed for 8B's calendar legend; James placed it in PROD on
  2026-08-26, leaning the 2x2 named-chip option and wanting a fuller design
  pass first.) **Generalises: a labelling decision belongs to the first phase
  whose AUDIENCE cannot already read the label** -- not to a phase of its own,
  and not necessarily to the first phase that must draw a legend.
- **Why not HR zones 1-5, recorded so it is not re-argued.** They are the more
  universally understood ladder and self-document their ordering. Rejected on
  two grounds: zones are HR-defined and this app has NO heart rate
  (`judge.ts:46`), so adopting them asserts a concept the system does not have
  -- the does-it-exist rule, fake-pause shape; and our four are a subset of
  Concept2's own ladder, i.e. already standard for the sport. The gap is
  public-audience legibility, and the fix for that is teaching, not renaming.
- **When the answer is "show what you already have", say so before designing
  anything new.** The app owned four plain words the whole time and rendered
  them one at a time, for the chip already selected, `aria-hidden` in two of
  three places. A user-persona pass caught it in one sentence -- "you already
  wrote the words and you're hiding them" -- that four analytical passes had
  not said plainly. **Worth repeating: put a naive user in front of the real
  captures early; it reorders the findings.**

## Phase-open gate, 2026-08-27 (the link-authority spec, rev 2 — TRIAD: a number's meaning + a stored shape)

- **Suppressing a wire command can delete the event that produces the data the
  other half of the same spec depends on.** The spec's terminate rule ("stale
  state, do not send") and its relabel ("now writes the machine's own totals")
  were designed independently and interact: if we decline to terminate, the
  machine never ends the workout, so 0x0039 never fires, so `summaryTotals` is
  null and TIER A is unreachable. **At a gate on any spec with a wire half and a
  stored half, trace whether the wire half is the PRODUCER of the stored half's
  input.** The spec's headline claim ("the same physical session renders
  different numbers") survived, but only for a cohort three conditions narrower
  than it stated.
- **The dangerous-window argument applies to WRITES as well as SENDS, and specs
  apply it only to sends.** The same 39 s blind window that made a terminate
  unsafe (the machine may have started a cool-down) makes the machine's summary
  possibly a DIFFERENT workout's. The identity oracle was free and already
  parsed: 0x0039 carries its own `workoutType`, read today only inside a log
  template (`driver.ts:2565`). **When a spec refuses to trust the machine's
  STATE across a window, ask why it trusts the machine's NUMBERS across the same
  window.**
- **A stored column with no reader is an unfalsifiable claim — give it one in
  the same PR.** `max_stream_gap_ms` was specced write-only, on a branch whose
  own thesis is that our instruments were blind (RF#19). Its reader is the saved
  row's honest gap line, which is also the replacement for the `LINK LOST` line
  the spec deletes. One decision solved both.
- **Deleting a false disclosure without replacing it converts an under-claim
  into an over-claim.** Dropping `LINK LOST · …` from a locked-phone row while
  the same change makes that row eligible for `MACHINE CONFIRMED · WORK ONLY`
  leaves a row asserting confirmation over 39 s nobody watched. Extends the
  2026-08-25 (#198) prefer-the-false-negative ruling: **check what the row GAINS
  in the same change before ruling a removal safe.**
- **A disclosure floor is owed whenever a transient signal becomes a durable
  one.** v0.24.0 promised testers the banner stopped firing on a Control Centre
  swipe; stamping a permanent row line for a 3 s background blip re-breaks that
  promise in a more durable place. Named constant, own comment, sanity-checked
  at the walk.
- **Copy rulings (James's tone rule + the banner's title-plus-four-words gate,
  `ConnectedSurface.tsx:691-693`):** live, `THE APP WAS ASLEEP` / `39s missed.`;
  saved row, `ASLEEP · 39s the app did not see`; a declined terminate says
  `STILL RUNNING ON THE ERG · press Menu to stop it` when we know it is live and
  `WE COULD NOT STOP THE ERG · check the monitor` when the state is stale; RC-37
  says `THE ERG CLEARED IT` / `Send it again.` with the re-send affordance
  present. **Naming ourselves does not violate the banner's no-cause rule** —
  that rule forbids inventing a cause for the ERG's behaviour, and here the
  cause is us and it is measured.
- **The app had ZERO post-end copy about the machine's state.** Every "the erg
  is still counting" string in the repo is a retired or rejected draft quoted in
  a comment. A spec that makes "we left the erg running" more common must add
  the first one; trading a silent destructive failure for a silent
  non-destructive one is the same disease.
- **Shape: two PRs, ordered, and the ordering is load-bearing.** Terminate
  gating + RC-37 first (no stored shape); the verdict/relabel/columns second
  (triad, alone). Today `linkGone` suppresses the terminate, so the relabel
  UN-suppresses it — shipped first, it sends a derived-verdict terminate into a
  possibly-live piece, the exact failure the spec exists to prevent. **Generalises:
  when a relabel moves rows across an allowlist, check whether the OLD label was
  also suppressing a side effect.**
- **"Phase LA" does not exist in the ROADMAP.** Both spec commits touched one
  file. RC-29/30/37 are already Phase RC items, so the 2026-08-13 "no new phase
  for work that finishes an existing one" principle applies: keep
  `link-authority` as a spec codename, file the conditions as checkboxes under
  Phase RC. Discharges RF#17 and #198's checkbox condition at zero cost.
- **Release call: one MINOR (`v0.26.0`) after BOTH PRs and the walk; no tag
  between them.** Independently owed: `v0.25.0..main` already carries #206 (the
  LIVE hero counts the rest, RC-27) — tester-visible, merged AFTER v0.25.0's own
  notes PR, currently un-noted. Also owed: an explicit correction to v0.23.0's
  shipped note (`releaseNotes.ts:96`, "keeps the headline it was saved with"),
  written in the NEW version's entry, plus a from-this-build-forward clause —
  old link-lost rows stay rest-fused forever.

## Adversarial pass, 2026-08-28 (accepting Phase RC exit (c)'s known-false cohort)

- **Before accepting an exception, check whether the CUT FIX would even have
  reached it.** The proposal traded exit criterion (c) against the `endedBy`
  relabel a YAGNI pass had just cut, framing the cut as the cost. It was not:
  the relabel changes how FUTURE rows close, and the fused-hero cohort is rows
  ALREADY SAVED in a closed window (2026-08-22, `ended_by` ships in #160 →
  2026-08-25, RC-5 ships in #194). Only a backfill reaches them, and none was
  proposed. **The strongest reason to accept was that the "cost" was
  imaginary — and nobody had said it.** Generalises: an accept-the-defect
  proposal that names a rejected fix must show the fix lands on the same rows.
- **A criterion restated is not the criterion, and the restatement is usually
  the kinder one.** The dispatch described (c) as heroes-versus-interval-rows
  (742 vs 500). The ROADMAP says "the three heroes on one stored row reconcile
  with EACH OTHER." Judged literally the cohort is worse: 742 m / 4:04 /
  2:18.8 implies 2:44.4 by hand — the three heroes disagree by 25.6 s/500 m.
  **At any accept-the-defect gate, quote the criterion and re-run its own
  arithmetic before accepting an exception to somebody's summary of it.**
- **One named exception is a tell that the criterion is unsatisfiable.** (c) is
  ALSO false for every row carrying a recorded null-index actual — DISTANCE/TIME
  count it, AVG SPLIT excludes it by construction, and `storedSummary.ts` says
  so in its own words ("Null-index/warm-up parity DOES NOT HOLD"): 9.9 s/500 m
  on the branch's own post-RC-5 fixture, on FINISHED rows too. Plus tier A's
  designed truncation gap. **Ruling: (c) gets a TOLERANCE and a POPULATION, not
  an exception list** — a criterion no build has ever met cannot go red.
- **"Never observed" carries near-zero weight for a silent number defect, and
  it did not need to.** A rower never reports "my three numbers disagree"; they
  assume they misremembered. But this cohort is defined by a DATE RANGE, not a
  rare event, so it is enumerable by inspection rather than by waiting. **When a
  cohort is date-bounded, replace "never observed" with a 60-second look at the
  data.** DONE THE SAME DAY: James photographed five consecutive rows spanning
  22-27 August; hand arithmetic gives a worst-case delta of 0.1 s/500 m against
  a ~26 s cohort signature, and every row carries the `plus N m coasting in
rest` clause an incomplete close cannot have. Cohort empty, twice over.
- **Check the shipped release notes before calling a contradiction
  undisclosed.** v0.23.0 item 1 uses this exact cohort's numbers (742/4:04) as
  its picture of the SOLVED problem — but item 5 already carves it out in the
  tester's own vocabulary ("ended early, or one whose link dropped, keeps the
  headline it was saved with"). It under-discloses (silent on the numbers still
  contradicting) rather than contradicts. **The in-app disclosure was also real
  and nobody had traced it:** `FromTheLog.tsx:450-451` renders `LINK LOST · …`
  directly ABOVE the heroes — but for `link-lost` only, never
  `interrupted`/`program-failed`/burst-less-`rower`.
- **The contradiction a rower can see without arithmetic is the one that
  matters.** Not 742-vs-500 (needs addition) — AVG SPLIT 2:18.8 sitting above
  interval rows of 2:15.8 and 1:52.2, an average outside the range of its own
  inputs. **When judging a visible-wrongness question, look for the assertion
  that needs no computation.**
- **Verdict: ACCEPTED WITH THE CONDITION MET.** (c) rewritten with a
  1.0 s/500 m tolerance and three named populations; population (i) verified
  empty by inspection. No code, no migration, no user-facing note owed.
- **Flagged and now answered: Phase RC's ~30 unchecked items.** A same-day YAGNI
  triage closed 12 on evidence, found 5 already done, and moved 5 to other
  phases. (a)-(e) IS the gate; the checkbox count was filing-as-deferral, and
  the triage is what made the close honest rather than declared.

## Phase-close gate, 2026-08-28 (Phase RC — closed with conditions)

- **"It deserves its own phase" discharges a criterion that says "or the reason
  it cannot is documented" — but only with a receipt.** RC's (d) (a row posted
  to the C2 sandbox) closed on James's word plus a dated successor phase. What
  made it a discharge rather than filing-as-deferral: the ROADMAP had asked him
  the question IN ADVANCE, in the criterion's own item ("Do the logbook, or
  write the reason?"), and the successor had a date. What makes it a precedent
  worth bounding: workload is a reason it WON'T, not a reason it CANNOT, and if
  that stands unqualified every future exit criterion is dischargeable by
  filing. **Ruling: a criterion discharged into a successor phase carries its
  EXACT SENTENCE into that phase's own exit block on the day it opens.** The
  transcription is the receipt; without it the criterion evaporates on the
  rename.
- **A phase can close having replaced "we verify against ourselves" with "we
  verify against one machine" — say so, because the name will not.** Every
  oracle RC shipped is a different register of the same PM5 (0x0032 avg pace,
  0x003A rest distance, 0x0039 totals). That is a real class upgrade from the
  TWD mirror RC-9c retired, and it is NOT the external authority the phase's own
  name promised. **At any close, ask what CLASS of check the phase actually
  built, not whether its checks passed** — "Phase RC — The row Concept2 would
  recognise, CLOSED" with zero Concept2 contact is roadmap-outruns-reality in
  the most durable place there is.
- **A rewritten criterion's EXEMPTIONS need the same evidence bar as the
  criterion.** (c)'s rewrite survived re-attack: it still fails the defect RC-5
  fixed (24-40 s/500 m) and was checked POSITIVELY on five photographed rows at
  0.1 s/500 m against a 1.0 s bound. Its exemption (ii) did not: it cited
  `storedSummary.ts`'s "Null-index/warm-up parity DOES NOT HOLD" heading, whose
  own paragraph ends "now genuinely bounded ... provably-historical population"
  — the opposite of the exemption's "Ongoing". **Resolved at the gate, and the
  resolution is the lesson:** the exemption is REAL but lives in a DIFFERENT
  TIER than the paragraph quoted (tier B1's work pair counts a null-index
  actual while `tierBAvgSplitSeconds` cannot see it; tier B2's Σ-steps
  under-count is the bounded one). One gap, two consequences, two tiers.
  **When an exemption cites a source, read the source's own scope sentence —
  and check whether the mechanism it describes is even the one you mean.**
- **A close-out PR corrects the doc rows its own work touched and leaves the
  rows above them.** RC-12 fixed 0x0039's Elapsed Time and Distance rows;
  Log Entry Date/Time rows 0-1 and 2-3 of the SAME table still read UNCERTAIN
  five days after walk-2026-08-23 decoded them against the screen and RC-2
  SHIPPED the decoder. Four sites total. **The successor phase opening the next
  day was the exact "future consumer" the stale line tells to go re-derive it.**
  Generalises: at a phase close, grep the notes for the phase's own settled
  questions, not just for the lines the last task edited.
- **RF#14, sixth consecutive gate — and the near-miss is instructive.** RC-14's
  eliminated hypotheses, RC-12's two remaining sites, and RC-30's decline all
  reached ROADMAP rows: the commit message was a presentation OF the record, not
  the record. The one that did not was the biggest: the pre-row lock (locked
  phone before the first pull, whole piece rowed, no record kept — tester report
  REPRODUCED on hardware) survived only as prose in the closing phase's Status
  paragraph. **A defect discovered by a phase's own closing walk is the single
  likeliest thing to leave with it.** Check the walk item the walk discharged,
  and open the fix item in the same edit.
- **Counted: 84 unchecked repo-wide (88 on main), the highest recorded here** —
  67 at RC open, 71 at 8A close, 60 at WU open, 37 at LL open, 24 on 2026-08-13.
  RC's own section still holds 22 unchecked AFTER its YAGNI triage, while its
  Status paragraph named 14 as moving out and named no destination for any of
  them. **"Moves out of the phase" is not a disposal; a section header saying
  CLOSED over live items is the pattern with a nicer label.** Answered at this
  gate by a disposition paragraph naming the OWNER of each of the 22 in six
  groups — not by closing any of them.
- **Release call: NO tag.** `v0.26.0..main` empty; the close-out PR is a test,
  comments, one operator diagnostic string, and ROADMAP. Nothing a tester
  receives. Next tag states the reason this merge needs no clause (RF#15) rather
  than passing over it in silence.

## Roadmap rebalance gate, 2026-08-28 (north star = "strangers can use it")

- **A phase named for a destination is not evidence the destination is
  covered.** Phase PROD was titled "the last phase before strangers" and its 11
  items are a SUBMISSION checklist: icon, sign-in, store metadata, audits, three
  developer instruments. Four things a stranger actually needs were on no
  roadmap in any form — an open sign-up policy (`ALLOWED_EMAILS` is
  deny-by-default; `auth/signin.ts:33` returns `denied` and `SignIn.tsx:6`
  renders the dead end), in-app account deletion, a database backup, and any
  telemetry at all from a device we do not hold. **At any phase-open gate for a
  phase named after an OUTCOME, enumerate the outcome's requirements
  independently, then diff against the item list.** The phase's own items answer
  "what did we remember", never "what does it take".
- **A document naming a recovery mechanism is not the mechanism.**
  `docs/RELEASING.md` says "Recovery is a DB backup, not a redeploy" for a
  documented unrecoverable rollback. `ls scripts/` has no backup script and
  `compose.yml:102` is a bare volume. The sentence had read as true for weeks.
  **When a doc names an operational safety net, run the command or list the file
  before treating the risk as covered** — the same evidence bar recurring
  failure 13 applies to operator instructions.
- **"No demand has been observed" in a phase's own text is a kill, not a
  defer.** Three phases carried that exact sentence (8C, UR, and LQ's rating
  item, which additionally pre-wrote its own failure mode: "a second rating
  control that means almost-but-not-quite the same is worse than none"). A phase
  that argues against itself has already been decided; leaving it "not started"
  is filing-as-deferral with better prose. **Killed 2026-08-28 with James's
  approval: 8C, UR, Phase 10, LQ — 11 items, no named party disappointed.**
- **A shipped PRODUCER with no CONSUMER is unfinished work, and it outranks new
  work.** Phase BL shipped `test_history` (v0.19.0); Phase 8B held the only read
  path, unbuilt, so the app collects test results no rower can ever see — and
  that is a line on the App Privacy questionnaire, not just a gap. Pairs with
  the standing "no new phase for work that finishes an existing one". **Ask at
  every rebalance: which stored shape has a writer and no reader?**
- **The archive step is where RF#14 goes to scale.** 40 of 90 open items lived
  inside CLOSED phase bodies (RC 29, LL 6, CM 3, WU 2, CS 2, 7D/BL/FF/CR 1
  each). RC's own close-gate disposition paragraph said the items must STAY in
  place "because their evidence is here", which directly blocked archiving that
  body. **James ruled: open items move, and their evidence blocks move with
  them.** A citation into `docs/history/` is correct for a settled question and
  wrong for a live one.
- **Counted: 90 unchecked on main (39e9430)** — up from 84 at the RC close gate
  six days earlier, 67 at RC open, 24 on 2026-08-13. The count has never
  reversed. Two "phases" (PS, UR) carried ZERO checkboxes.
- **Sequencing call, a deliberate departure from the stated ranking axis:** the
  lifecycle fix (LM's hardware-reproduced pre-row lock) ships BEFORE the front
  door, because opening the door to strangers while a pocketed phone silently
  discards a rowed piece is worse than opening it a week later. **When a north
  star ranks work, say out loud which item you are ranking against it and why** —
  an unexplained departure reads as the axis not being used.
- **Two invisible waves back to back is a bad slate even when correctly
  ordered.** Backups/telemetry and the developer toolbox each ship a tester
  nothing; on a project that has cut 26 tags, that is two release windows with
  empty notes, and it is how the invisible-but-necessary wave gets skipped. Fold
  them into a visible wave rather than releasing them alone.

## Ad-hoc gate, 2026-08-28 (MACHINE CONFIRMED has never rendered on hardware)

- **A feature can have three green gates and never have worked, when every
  gate enters the pipe downstream of the break.** `FromTheLog.test.tsx:1203`
  mocks the API row with `machineWorkSeconds: 124`; `LogSession.test.tsx:3617`
  seeds a `MonitorRun` already carrying `summaryTotals` before render;
  `screenshots.spec.ts:2421` seeds the API row and says so in its own comment.
  Each CAN go red; none can go red on THIS defect. Not recurring failure 21
  ("a gate that cannot go red") but its sibling: **both halves well tested,
  the seam between them tested by nobody.** The tell was in the suite's own
  words — a test titled "renders NO block when all three machine fields are
  null (**the common case, old rows**)" named production reality and blamed
  legacy data. **At any gate, ask which test STARTS upstream of the producer,
  not which tests are green.**
- **"Verified on hardware" needs the LAYER named, and a walk table's column
  heading is not the layer.** RC exit (a) closed on `walk-2026-08-24`'s exit-7
  table, whose column reads "App stored (WIRE→record)" and whose cell reads
  "`summaryTotals` elapsed 124s (**ring seq 61**)" — a driver ring entry, not
  a record. The walk ran on v0.21.0 build 738; the storage columns (#190) and
  the block (#192) both shipped the NEXT DAY. **A criterion cannot be verified
  on a build where its code does not exist**, and nobody noticed because the
  walk and the ship were 24 hours apart. Recurring failure 19, verbatim.
- **Criterion (e) passed at the wrong end of the pipe.** "If 0x003F turns out
  not to fire… the verification branch is closed on the record rather than
  left hoped-for" was met as written (it fires) and missed the failure
  entirely (it never reaches a row). **When a criterion is written about an
  INPUT arriving, ask what it would say if the input arrived and the output
  never appeared.**
- **A capability the release notes have already promised is not register
  work.** The register is for items that are "real and unscheduled". An
  announced capability that does not exist is a live false claim with a
  disclosure clock, and it goes in a wave. Pairs with the 2026-08-13 "no new
  phase for work that finishes an existing one" (which refused a bugfix phase
  here) and the 2026-08-28 "a shipped producer with no consumer is unfinished
  work".
- **Prefer the free instrument to the built one, and say which is decisive.**
  The dispatch proposed a one-line receipt log shipped standalone so James
  could walk it in one row. The mechanism was already established by reading
  (`LogSession.tsx:1487` snapshots at mount; `useMonitorSession.test.ts:2601`
  states the production ordering verbatim), so the log would have cost a build
  and a day to confirm what a client test proves in an hour and then guards
  forever. **Order: count the data, then write the failing test, then ship the
  log inside the fix.** An instrument that answers a settled question is
  ceremony.
- **A missing UI block can be a NUMBER defect wearing a display defect's
  clothes.** `storedSummary.ts:617-621` gates tier A on the same two columns
  the block does, so "the box never appears" and "every hero is our
  arithmetic, not the erg's" are one bug. The second is what makes it TRIAD.
  **Before sizing a missing-surface report, grep the other readers of the
  field it renders.**
- **Release-note corrections compound, and the register entry rots with
  them.** v0.22.0's clause is now wrong for TWO independent reasons — RC-5
  falsified "meant to differ", this defect falsified "your saved rows can now
  show" — and only the first was filed. The filed row's line number was
  already stale. **A falsified-note register row cites the CLAUSE, never the
  line number, and is re-read before the correction is written.**
- **Release call: no tag, and hold the correction for the fix if it is
  close.** Eight commits above v0.26.0, two tester-visible and both tiny. A
  correction shipped alone reads "we told you something that was never true"
  with no remedy; the same correction behind the fix reads as a repair.
  **Ruling: hold up to ~2 weeks, then ship the correction regardless.**

## Phase-open gate, 2026-08-28 (codebase-integrity audit)

- **A whole-codebase audit is an overlay, not a seventh product wave.** It does
  not displace a known P1, and its output is not a second backlog: every
  promoted fix is rechecked against current `main` and assigned one live
  ROADMAP owner before handoff. Broad discovery may close with explicit
  deferred lanes; validation spend stops for James's approval once the
  candidate count is known.

## Phase-close gate, 2026-08-28 (codebase-integrity audit)

- **A current-main CODE check is not a current-main PRODUCT check.** The audit
  proved its production paths unchanged but missed a newer Wave F TRIAD P1 in
  the live slate. At audit close, revalidate both code presence and product
  order; transfer fixes into their actual wave/open-register homes before
  closing the overlay. A merge conflict is not a sequencing mechanism.

## Phase-open gate, 2026-08-28 (Wave F slate: lifecycle + the audit's three transfers)

- **The phase's flagship P1 had a FALSE stated mechanism, and its own cited
  ring falsified it in five minutes.** `ROADMAP.md`'s pre-row item said the
  lock leaves the app "`phase=ready`, opens no record, and End silently
  discards." `walk-2026-08-28/pocketed-phone-prerow-ring.json` shows seq 25
  `phase=ready` → seq 29 `rowing-active-fallback` → seq 35 `phase=live`, and
  `useMonitorSession.ts:1884-1930` puts that ring write INSIDE
  `if (declared || fallback)` with `createMonitorRun(...)` immediately after
  and no early return. **The record opened, 43.04 s in.** The defect is a
  record that opens ~43 s and ~53 m LATE, alongside two other producers in the
  same 13-entry ring (TWD 52→0→64; `pause-declared` at 66 spm) and a third the
  app must handle (the erg dropped the program itself, RC-37's signature,
  no Menu press). **At a phase open, decode the flagship item's own cited
  artefact before its spec is drafted** — the ROADMAP sentence is what an
  implementer builds from, and RF18 is this exact failure one phase earlier.
- **A write-only diagnostic is the reason a P1 cannot be ranked.**
  `recordLogDoorMiss` has appended to `ergomatic:log-door-misses`
  (`LogSession.tsx:236`) since Phase LM, naming the exact class AUD-016 fires
  in (`no-run`). Grep returns the constant, the writer, and thirteen test hits:
  **zero production readers.** Second such instrument in this seam
  (`ergomatic:last-session-log`, Wave B's own item). **When a gate is asked to
  sequence a fix by frequency, first ask whether the app already counts it and
  whether anyone can read the count.**
- **Rank an audit P1 against a COUNTED defect, not against its audit rank.**
  The machine-summary hand-off is 16 of 16 production rows; AUD-016 needs a
  rejected localStorage write of unmeasured frequency; AUD-011 needs a getter
  throw whose reachability on the NATIVE surface is unestablished (its cited
  authority — the WHATWG standard "permits" it — is silent on WKWebView, RF16's
  second corollary). The audit's own report says its order is audit-relative.
  **Adjudication note (controller, same day): AUD-016 kept its slot behind
  PR 1 anyway — the anchor pass found its producer production-observed
  (`storage-persist denied` on the tester's own phone) and PR 1's gate blind
  without it; the free measurement stands as a sharpener, not a gate.**
- **Two defects on one seam can be correctly SPLIT and still need one contract.**
  PR 1's hold (James: HOLD THE HAND-OFF) does not fix AUD-016 — a held record
  still dies in `saveMonitorRun`'s swallow and `monitorModeRun` falls through to
  the manual door. Split is right (two unrelated failure modes under one triad
  gate). But AUD-016's own safe direction is "hold a recoverable storage-error
  state before navigation" — PR 1's mechanism at PR 1's seam. **Ruling: PR 1's
  spec enumerates the hold's exit conditions (burst heard / burst timed out /
  write failed) and names which PR implements each**, so the successor extends
  rather than redesigns, and PR 1's permanent gate test survives.
- **Four of five chunks sat outside the phase's own written exit.** Wave F's
  exit names three lifecycle scenarios plus the door; chunks 1-3 satisfy none of
  it. Ruled: add a fourth clause covering the durability half at phase open.
  Otherwise the close is a "PASS IN SUBSTANCE" (LL close) or 80% of the PRs are
  unaccounted for.
- **The parallel-spec condition, made countable again.** WU-open's ruling (a
  shovel-ready item may precede an undesigned one PROVIDED the deferred spec is
  written in parallel) is correctly applied here; BL-open's rider binds it —
  the condition names a merged spec file before chunk 2's brief is issued, not
  "in parallel".
- **The zero-code move outranked the slate — with a correction.** RC-37's
  detector is in v0.26.0 (`git merge-base --is-ancestor 54609bc
v0.26.0^{commit}`), and the walk that reproduced the P1 ran on v0.25.0
  build 759. **Before opening a wave against a field defect, check which
  shipped fixes the tester has not yet received.** The walk README's claim
  that #211 "would have caught it" was separately falsified at the anchor
  pass (the hook ignores `programDropped` in `live`), so the delivery check
  survives as hygiene, not as a fix for this defect.
- **The backlog series recorded in this ledger ENDS at the rebalance.** Counted
  2026-08-28 post-rebalance: 37 unchecked checkboxes, 53 open-item register
  entries, 22 deferred entries — 112 live. The 37 is not a decrease from 90;
  the register uses table rows and bullets that no `grep -c '\- \[ \]'` sees.
  **Report the triple. Comparing 37 to 90 reports the largest improvement in
  the project's history for an afternoon of filing.**
- **Release call: no tag at phase open.** `v0.26.0..main` = 12 merges, two
  tester-visible and both small. Chunk 1 merges MINOR (three stored numbers
  change meaning, a visible block turns on); notes owe the no-backfill sentence
  naming the 16 permanently-ours rows, the three falsified corrections in full,
  and the new post-End wait if perceptible. The 2026-08-28 correction clock
  expires ~2026-09-11.

## PM ruling, 2026-08-29 (lint/type ratchet)

- **A James-approved pre-wave enabling slice can pull forward one explicitly
  owned infrastructure item without opening its wave.** The lint/type ratchet
  is Wave D's `e2e/` typecheck/enforcement item, pulled forward by James before
  F → A → D completes; Wave D's status, remaining items, normal phase-open
  gates, and release-with-C rule stay unchanged. The exception is valid only
  when the roadmap names the slice and its exit, rather than claiming the
  whole phase has opened.

## TRIAD final-PR gate, 2026-08-29 (Wave F PR 1 — the machine-summary hold, #228)

- **A Gate 0 that shows a number changing must render what the SAVED ROW shows
  today, not what the live screen shows.** This spec's before/after opened at
  375.1 m → 358 m; 375.1 is the live accumulator (work plus rest coast), a
  figure no stored row has ever rendered, and the honest before was 360 m. The
  antagonist caught it; the design gate would have approved a delta of 17 m
  when the real delta is 2 m on an identical clock — which reads as a row that
  quietly moved rather than as a correction. **At any Gate 0 on a number, name
  the layer the before-number comes from and cite the function that computes
  it.** The stale 375 survived into the PM dispatch and the session memory
  after the spec had corrected it; corpus numbers rot faster than the documents
  quoting them (RF16's second corollary, applied to our own arithmetic).
- **Release-note obligations recorded only in this ledger do not reach the
  person writing the notes.** The 2026-08-28 phase open ruled the notes owe
  three things (the corrections, the no-backfill sentence naming the 16
  permanently-ours rows, the new post-End wait). Only the corrections reached
  the ROADMAP's own notes-owed register row, which is what a note-writer reads.
  **A ledger release condition is landed in the ROADMAP row it constrains, in
  the same gate that rules it** — otherwise it is a PR-body finding wearing a
  ledger's clothes (RF14).
- **Ship a fix's tag rather than riding it with its successor when a correction
  clock is running, and count production as an instrument.** Ruled here against
  holding v0.27.0 for AUD-016: the falsified-note corrections expire ~2026-09-11
  and read as an apology without the fix in front of them; and the hold's
  2000 ms backstop has a web/foreground-only corpus, so real phones emitting
  `burst-timeout` receipts are the only measurement available. **"Wait for the
  sibling PR" is not free when the sibling is the unmeasured one.**
- **A hold whose corpus is one platform owes a walk row, not just a risk note.**
  The native terminate round-trip and background/resume burst timing were the
  PR's own named unknowns and had no entry in ROADMAP's owed-captures register.
  A number-defining constant derived from one transport is a hardware question
  filed at the gate that ships it.
- **Presentation failed on its own stated test, not on taste.** ~270 words
  above the fold, ~100 seconds read aloud against a 30-second bar, bullets of
  2-3 lines against "one line each" — while committing none of the
  WHAT-without-WHY failure the rule was written for. The fix was one bullet
  (the permanent gate's mechanics) moved into the Record block. **When a PR
  misses the budget but not the intent, name the single bullet to move rather
  than sending the body back for a rewrite.**

## Correction, 2026-08-29 (landed by the controller at the AUD-016 spec pass)

- The 2026-08-28 phase-open entry's claim that `ergomatic:log-door-misses` has
  "zero production readers" is FALSE: `withDoorMisses` (`LogSession.tsx:868-874`)
  reads it on every `?from=monitor` arrival, feeding MONITOR LOG · COPY. The
  grep that produced the claim saw that line and misclassified it. What remains
  true: no AGGREGATE reader surfaces the counter to anyone who has not opened
  the log door's diagnostics copy — the Wave B item stands, reworded.

## TRIAD final-PR gate, 2026-08-30 (Wave F chunk 2 — AUD-016 durable hand-off, #230)

- **The presentation rule failed twice running because nothing in it is
  countable.** #228's body was ~270 words above the fold; #230's, written after
  that gate ruled on it, was 266 — six bullets (within "~6 max") but three of
  them three lines each. The author checked the countable half of the rule and
  read past the uncountable half. **Countermeasure landed in `CLAUDE.md` at
  this gate: the budget stated as a number (~120 words / ~25 words per bullet
  above the fold) so it can be checked the way `git diff --stat` checks the
  fast path.** Gate procedure unchanged: name the bullets to move, never send
  the body back.
- **Exit clause 4 has two producers and this PR closes one.** Clause 4's second
  half — "a storage failure never silently downgrades a measured session" — is
  discharged for a REJECTED WRITE and explicitly not for EVICTION (green write,
  record later dropped). At the Wave F close, do not read "AUD-016 shipped" as
  the clause met; read it as the half it names.
- **Correction to the 2026-08-28 adjudication note.** That note kept AUD-016 in
  its slot partly because "the anchor pass found its producer production-observed
  (`storage-persist denied` on the tester's own phone)". The spec's delta pass
  narrowed this: `storage-persist denied` means the origin is EVICTABLE, which
  is the producer this fix cannot catch. No instrument in the codebase can
  observe a rejected write, and none did. The rank still stands on the audit's
  confirmed consequence and on the work being complete — but the stated
  rationale named the wrong producer, and a future gate must not cite it.
- **When a fix and its instrument are separable and the producer is unmeasured,
  ship the instrument first.** The strongest case against #230 was that the
  `release-save`/`handoff-stashed` receipts alone, shipped a wave earlier, would
  have measured both producers for the cost of a few lines instead of 3,734.
  It lost only on timing — by the gate the code existed, was reviewed, and
  carries the receipts anyway. **For the next audit P1 with an unobserved
  producer, sequence the receipt ahead of the fix, not inside it.**
- **"Nothing new on any healthy close" is a claim about SIGHT, not behaviour.**
  Every healthy ended hand-off now re-serializes the full run synchronously
  (~720 KB worst case) and populates the reader's slot. Both are correct and
  both are new work on the path no rower ever complains about. **A tester-impact
  bullet that says "nothing changes" gets asked what changed that the rower
  cannot see** — that is where the regression would sit, and the final review
  found its one Critical exactly there.
- **Release call: AUD-016 RIDES v0.27.0.** The #228 ruling was "do not HOLD the
  tag for the sibling", never "exclude it" — a tag cut after a merge that omits
  it is worse on every axis. Bump unchanged (MINOR, forced by #228). The notes
  now owe a FOURTH item: one sentence for the failed-write state, because a
  tester meeting `COULD NOT KEEP THE RECORD ON THIS PHONE.` has no other
  explanation; and the post-End-wait sentence must cover the hold PLUS this
  PR's verify write.

## Product-contract ruling, 2026-08-30 (the hand-off contract: what you see is what saves)

- **The contract, stated once so it stops being re-derived: renders snapshot;
  destructive actions re-read; recording actions post what was shown.** A
  screen that carries a Save posts exactly the numbers it displayed when the
  rower read them; a record that improves after that screen mounted reaches the
  NEXT arrival, never the mounted one. **It binds SAVE-BEARING FORMS only** —
  the live pane, a logbook list, and Phase JR's `/justrow` surface are unbound
  and always were. Without the scoping clause this rule reads as "nothing ever
  live-updates", which is false today and would be cited against Wave E later.
  This belongs in `CLAUDE.md`, not here; recorded here because it was ruled at a
  PM gate. **It was already settled three times** — #228's spec at `:14-17`,
  `:103-105` and `:236-237` ("the rejected re-read-at-save stays rejected"),
  `ROADMAP.md:257-262`, and James's own P1b restash-only ruling on #230 — and it
  is the house pattern, not a log-form quirk: `Today.tsx:280/:288`,
  `Countdown.tsx:105/:111`, `Timer.tsx:359-360` and both log doors all read once
  at mount; the only live re-reads in `src/` are a diagnostics COPY button and a
  dev-only instrument. **Before re-litigating a contract, count how many times
  it has already been ruled and quote the code comment that states it.**
  RATIFIED by James 2026-08-30 ("Approved") with the three conditions below.
- **"Recoverable at the next arrival" was false, and the falsifier was a
  Save.** `LogSession.tsx:1723-1726` clears the hand-off slot unconditionally on
  save-success, so a richer same-session revision that P1-2's widened late-burst
  restash left in the slot is destroyed by the rower's normal next action, with
  no receipt. The clear is correct (leaving it makes `connectGuardStage()` stage
  a false "unlogged" on the next Connect); the SILENCE is the defect, and it is
  RF25 verbatim inside the PR written to fix RF25 at the neighbouring seam. The
  tell was a stale rationale: the comment at `:1705-1722` still calls that window
  "an unrelated session's own hand-off" and claims "no product scenario can
  currently make it independently observable" — both written before P1-2 made it
  this session's own normal late path, in the same PR. **When a fix widens a
  window, grep the OTHER end of that window for a comment reasoning about how
  narrow it used to be.** Condition 1 (blocking): the drop gets a ring receipt
  (`handoff-dropped reason=richer-at-save`) and the stale comment is fixed.
- **The honest answer to an unmeasured timing assumption is a measurement, not
  an architecture.** The live-update contract's whole case rests on
  `BURST_HANDOFF_HOLD_MS = 2000` being derived from n=10, web, foreground. That
  argues for the already-booked native walk row (`ROADMAP.md:914-921`) and, if
  it comes back short, for changing the CONSTANT — not for a subscription
  coordinator spanning React lifecycles. **Ruling (condition 2): the live-update
  contract does not reopen until a real phone produces a non-zero count of
  `handoff-stashed reason=late-burst` / `handoff-dropped reason=richer-at-save`.**
- **No rower-facing disclosure, by the CS-close test.** A tester will not hit it
  (zero observed) and cannot misread it (the row reads like the 18 already-tier-B
  rows the notes already owe an explanation for). A hint on the mounted screen is
  a mid-edit surprise in everything but name, and it asks a rower to abandon a
  filled form to gain two metres and a badge. Silent-recoverable is acceptable
  ONLY because the drop is made countable; silent-and-uncounted is what produced
  0-of-18.
- **Release: v0.27.0 (MINOR) is due off merged main; pausing the successor made
  the tag more urgent, not less** — 17 merges including #228's fix sit untagged
  against a correction clock expiring ~2026-09-11. James's sequencing ruling
  (2026-08-30): the notes PR starts AFTER the current fixes land. Drop the
  failed-write-copy sentence from the notes-owed row until AUD-016 merges — it
  describes a screen the tag will not contain. Sharpens the 2026-08-29 "ship a
  fix's tag rather than riding it with its successor" entry.

## PM ruling, 2026-08-30 (PR #230's disposition under the substrate reset)

- **When a substrate is replaced mid-PR, measure the survival boundary PER FILE
  before choosing rebase, cherry-pick or fresh branch.** #230's boundary ran
  inside files and inside functions, so no commit-shaped operation could cut on
  it: `monitorRun.ts` alone holds `SaveVerdict` (preserved by the protocol) and
  the slot quartet (deleted), both introduced in one commit and touched by
  eleven more. The cheap discriminator is a coupling grep per changed file.
  It produced the decision in one command: **10 files with ZERO references
  (573 lines + 2 captures) restore verbatim; 7 files / 4,105 lines get
  rewritten, of which only 197 lines actually name the dying API.** That last
  ratio is the general trap — a thin API with a large reasoning shell reads as
  "mostly salvageable" and is in fact mostly *retargetable*, which is a rewrite
  with a checklist, not a cherry-pick.
- **A pause REOPENS every release ruling that assumed the paused PR would
  merge.** The 2026-08-30 gate ruled AUD-016 rides v0.27.0 on the reasoning
  "a tag cut after a merge that omits it is worse on every axis" — true when the
  PR was hours from merge, void once it became a new spec plus an approval plus
  an implementation. Ruled here: **cut v0.27.0 off merged main WITHOUT
  AUD-016** (17 merges untagged, correction clock ~2026-09-11). At any pause,
  re-read the release ruling for the premise "it merges soon" and say aloud
  whether it still holds.
- **A ROADMAP row landed from a ledger condition is not append-only — a pause
  un-lands it.** The failed-write notes sentence reached the notes-owed row on
  James's own P2b review; the pause means that row now instructs the note-writer
  to describe a screen the tag will not contain. **The gate that lands a
  condition owns removing it when its subject stops shipping.**
- **Review-round fixes that live only in an unpushed worktree are the same
  single-point-of-failure as a finding that lives only in a PR body (RF14).**
  At this ruling, three commits — including all three fixes for James's second
  review, each reproducing one of his disposable probes as a permanent test —
  were unpushed, so GitHub still showed his three Criticals unaddressed and the
  only copy sat in a worktree the SDLC tells us to tear down. **Push after every
  review round, before anything else, pausing included.** If this recurs it
  belongs in `CLAUDE.md`'s SDLC bullet, not here.
- **A test matrix written entirely at the new seam recreates RF24.** The
  hand-off store draft's §5 mapped six of James's seven probes; the one it
  missed (P2a, `WorkoutDetail.connectedRecovery.test.tsx`) is the only test that
  starts at the product route and ends at the POST. **When a redesign inherits a
  predecessor's tests, check which of them START ABOVE the new component; those
  are restored as files, never re-derived from the new spec.**
- **Do not split a Gate-0-approved UI slice off a paused PR just because it is
  provably unaffected.** Zero coupling to the dying substrate, 573 lines off the
  successor's path — and it would ship an unreachable branch whose only tests
  mount it directly (RF21's shape) for at least one tag. **The test is
  reachability by a production path, not diff independence.**

## PM gate, 2026-08-30 (hand-off store protocol rev 3 — the cross-key copy)

- **A census counted at the substrate you are DELETING imports its states into
  the design that removes them.** §5's census was counted at `04e8a515`
  (#230's head) and said so in its own heading; the two-key state it produced
  is a fact about the module slot plus one durable key, and §1 deletes the
  slot. Under the design itself: `MONITOR_RUN_KEY` is a single key
  (`monitorRun.ts:28`), `createMonitorRun` has one production call site
  (`useMonitorSession.ts:2288`), and every armed transition retires whatever
  the guard staged (`:2675-2676`) — so at most ONE unretired entry exists on
  any single-WebView path. **Re-run a census against the design's own END
  STATE before any of its states earns UI.** Ruled: the cross-key Replace copy
  is descoped, the copy stays singular, and the multi-key condition ships as a
  receipt — "instrument first when the producer is unmeasured" applied to its
  own successor.
- **Revision-bind a destructive action only where the rower was shown
  NUMBERS.** Save's claim binds a revision because the screen rendered it
  (invariant 6). Connect, Start, Today, the manual door and row-instead show
  only EXISTENCE — "You have an unlogged session" names no figure — so a
  late-burst revision bump between the guard read and armed does not
  invalidate the authorization given, and rejecting on it puts a confirmation
  panel in front of a rower standing at a programmed erg. Ruled: KEY-bind
  those doors, receipt the superseded revision, reject only on a new key.
- **An authorization column is a claim about a rendered control — open the
  control.** §5 attributed `WorkoutDetail.tsx:298` (row-instead) to "its
  confirm"; that site is a single-tap `.button-l2` in the interstitial's
  failure card with no confirmation at all. Its real authorization is the
  Connect guard's, one screen earlier — a THIRD terminus of the staged set.
- **The census's product effect here is a GAIN and the gate should say so.**
  Today reads the durable tier only; reading the store closes the
  escape-hatch gap this ledger filed at #230's gate (a stashed record with no
  door under denial-from-first-write). Owed with it: a memory-only row
  vanishes on reload, indistinguishable from a durable one — a named residual
  and a receipt, not a screen.
- **Release, re-checked not re-derived:** v0.27.0 without AUD-016 still
  stands, and rev 3 strengthens it — the pause is now a design plus an
  approval plus a from-scratch implementation. The notes-owed row must lose
  its failed-write sentence before the notes PR starts.

## PM final-PR gate, 2026-08-31 (PR #238 — the reserved test titles)

- **A "no supported producer remains" claim is settled by enumerating every
  caller of the shared VALIDATOR, not by naming the route you just changed.**
  #238 reserved "2K Test"/"6K Test" at `POST` and `PUT /api/workouts` and then
  said so three times — in the PR body, in a spec published as the citable
  record, and in a test comment — while `POST /api/workouts/bulk`
  (`data.ts`) called the same `validateWorkoutInput` unguarded and sat one
  tap away at the Library's **IMPORT**. One command finds it:
  `grep -n validateWorkoutInput` over the ROUTES returns three
  request-writing call sites (the repo carries two more in
  `app/scripts/library-moves.ts`, a curation script that writes no user
  rows — James's re-review caught the unqualified count); `grep -n
  reservedTitle` returned two. **The tell is a producer claim written in the
  same breath as the fix**, and the cost here was an end-to-end gate retired
  on it plus a false line in the record that supersedes the Gate 0 artifacts.
- **Adding a REJECTION to an existing route is a cross-version break, and this
  generalises the 2026-08-17 PW nullable ruling.** That ruling asked which
  SHIPPED build reads the column; ask also which shipped build SENDS the
  request. The client pre-check ships in the new build only, so the installed
  build renders its generic failure copy — a retry loop for a permanent 400.
  `docs/RELEASING.md`'s additive-only rule covers this: the exposure runs
  from merge (web deploys continuously) to the next tag, not to the tester's
  next update.
- **A decision taken conversationally AFTER a Gate 0 closes brings copy the
  gate never showed.** #238's Gate 0 artifact contains options A/B and C/D
  and no error message anywhere; the reservation and its strings arrived
  after it. The standing copy gate is about the rendered thing, so a
  post-gate decision that adds user-visible words re-opens the gate for those
  words — cheaply, at the PM verdict, but deliberately. (Discharged here:
  James picked the final string from rendered options.)
- **A restriction is not a capability — but a NON-ADDITIVE restriction takes a
  coordinated tag, not a deferred note.** The first ruling here ("ride the
  next tag") was corrected at James's re-review: `docs/RELEASING.md` is
  explicit that a breaking change forces a coordinated tag, and "mention it
  in a later note" leaves shipped clients in a retry loop meanwhile. Final
  disposition: #238 merges with its notes PR immediately behind and the tag
  on that — the capability question decides the VERSION (no new capability =
  no minor celebration in the notes' framing), the compatibility rule decides
  the TIMING. A rower loses a name they had; that is a release note even
  though nothing was gained.
- **Before reserving a name, ask why the app is keyed on a string at all.**
  `domain/onboarding.ts` calls the two titles "the ONLY identity the rest of
  the app uses to recognize them". #233 already replaced that with a
  `(title, isGlobal)` pair at the checkpoint; the reservation fences the call
  sites that still key on the string. **Record it with its retirement trigger
  (a stable seed key) rather than as a product principle**, or the app takes
  the next name it needs the same way.
## TRIAD final-PR gate, 2026-08-30 (the hand-off store, #239 — PASS with conditions)

_All word counts and body quotes below measure the PRE-REWRITE body the
gate judged; the five conditions were executed on the branch the same
day (body rewritten, disclosures and ROADMAP landed), so the live PR
does not match these numbers._

- **The countable presentation rule WORKED, and the residual failure is a
  different one.** #228 was ~270 words above the fold, #230 was 266, #239 is
  **148** — the numeric budget landed at #230's gate cut the overage from ~150
  words to 28. What survives is not length: it is bullets that name a mechanism
  with no rower on the other end. #239's two overspends were "CAS commits,
  key-bound retire sets, staged destroy authorization" (23 words, zero product)
  and a branch-inflicted-then-fixed regression presented as a product gain (17
  words, zero rower-visible difference either way). **Cutting the bullets that
  fail "so what?" fixes the word count as a side effect — count first, then cut
  by so-what, and the number lands on its own.**
- **The body under-sold the product on exactly the two axes the PM gate exists
  to check.** #239 shipped a new rower-facing screen (`COULD NOT KEEP THE
  RECORD ON THIS PHONE.` + two buttons + two committed captures) and closed the
  escape-hatch gap this ledger filed at #230's own gate — and named NEITHER
  anywhere in the body, while claiming "each destroy path warns first" (false at
  `WorkoutDetail.tsx:298`, which the spec's own §5 records as having no confirm,
  and new at none — every warning shipped earlier). **A PR that over-sells
  hygiene and omits the screen is the normal shape when the author has been
  inside the mechanism for six tasks. Check the rendered surfaces against the
  body's bullets before reading either.**
- **A "Try it" that works on `main` is RF13 at the presentation layer.**
  #239's was "finish a connected row, don't log it, kill and reopen; the row is
  on Today" — true, and true on main since `origin/main:Today.tsx:288`. It is
  also the only line James will actually execute. **When none of a PR's fixes is
  hand-reproducible (here: all three need storage denied), say that and point at
  the red-then-green gate. A smoke test dressed as a demo teaches the reviewer
  the change is smaller than it is.**
- **Post-approval spec amendments: five faithful, one a reversal, and only the
  reversal needs his eye.** Rev 4's §5 row 2 said a second unretired key is
  "refused + `store-second-key-refused` receipt"; the branch amended it to a
  receipted fallback **retire** (unbound `currentUnretired()` at the first
  rowing frame). The ruling is right — refusing strands a ROWING session with no
  record, the worse loss — but it moves in the DESTRUCTIVE direction on a cell
  James read. **Triage amendments by direction, not count: an amendment that
  makes the system more permissive about destroying a record is the one that
  gets a clause above the fold; refinements that add exceptions with stated
  discipline do not.**
- **ROADMAP grew ~298 lines of task-by-task implementation narration inside one
  unchecked box**, three months after the rebalance deleted 7,868 lines of
  exactly that. The file's own contract ("a phase that closes leaves";
  "corrections are APPLIED, not appended") makes the strike commit the owner of
  the removal. **Ruled: the commit that strikes an audit item removes its
  narration and FIRST lifts the forward-looking residuals into the open-item
  register.** RF14 pushes findings out of PR bodies into ROADMAP; it is not a
  licence to make ROADMAP the progress log.
- **Four `.superpowers/` citations landed in tracked ROADMAP prose in the same
  round that wrote a measurement out longhand to avoid doing so** — and
  `.superpowers/` is in `.git/info/exclude`, not even a committed ignore file.
  RF16's corollary was known, applied once, broken four times ten lines away.
  **At any gate touching ROADMAP, grep the diff for `.superpowers/` — it is a
  one-command check and this is its second appearance.**
- **A consolidated mutation ledger can attribute a neighbour's failures to an
  ungated row.** #239's §10 row 2 was recorded as gated; the antagonist's named
  mutation passed with 0 failures because the ledger had scored a neighbouring
  probe's 17 failures against it. RF21 hiding in the ledger rather than in a
  test. **When a mutation ledger consolidates rounds, spot-check that each row's
  recorded failure text names a test belonging to THAT row.**
- **Release: v0.30.0 (MINOR) on merge.** Main is at v0.29.0 (`b2581a4a`), not
  v0.28.0 — a branch rebased onto a tag is not evidence of the current tag.
  The failed-write-screen notes sentence returns here: the ROADMAP notes-owed
  row says in terms that it "returns with the hand-off store's PR", and
  `releaseNotes.ts:41-44` points at that row from the code. **The gate that
  removed a notes condition at a pause owns restoring it at the un-pause, and
  the restoring PR is the one that ships the screen** (bound at this gate to
  the v0.30.0 notes PR, the #231 shape).
- **Still unmeasured after 8,124 lines: whether this defect has ever happened.**
  The producer (a rejected `setItem`) has zero observed instances and no
  instrument outside this PR. The "ship the instrument first" argument lost on
  timing twice and is now spent. **Forward obligation, filed rather than
  remembered: the first tester report after this tag gets its ring decoded for
  `commit-accepted{verdict:"failed"}` before anything else.**

## Phase-open gate, 2026-08-31 (Wave E slate: the Concept2 logbook — TRIAD, auth + two stored shapes)

- **A spec can pass every evidence rule and still design for the wrong SURFACE.**
  Wave E's spec is the best-sourced this ledger has seen — verbatim C2 quotes, a
  named does-it-exist section, RF25 seam ownership, RF24's upstream test called
  out by name — and it contains **zero occurrences** of "native", "iOS",
  "Capacitor", "WebView" or "deep link" while specifying a browser-redirect OAuth
  flow for an app whose primary surface serves a LOCAL bundle
  (`capacitor.config.ts` `webDir: "dist/client"`), authenticates with a Keychain
  bearer on `fetch` and never on a navigation (`src/api.ts:9-19`), and carries
  exactly ONE URL scheme, Google's (`Info.plist:21-32`), with no `appUrlOpen`
  handler in `src/`. The callback has nowhere to land and the connect start
  carries no credential. Google sign-in already solved this in-repo with a NATIVE
  plugin flow instead of a redirect — the precedent was two files away.
  **At every phase-open gate, ask which SURFACE each spec'd flow runs on and name
  the file that proves it.** RF13 and RF18's layer trap, now in a third form:
  external docs, our own code, and now our own shells.
- **The wave's exit block carried the widened scope; the wave's ITEM LIST did
  not.** Three checkboxes, all inherited from RC; the Connect card and the send
  affordance existed only in a Status paragraph. Worse, inherited item 2 named
  per-interval `rest_time` as a gate this wave answers while the spec ruled the
  `intervals` array out of scope. **A widened scope edits the checkboxes, not
  only the prose — and re-reads the INHERITED items for ones the new spec has
  just contradicted.** RF17's sibling: presence in the file is not presence in
  the list.
- **"The follow-on will store it" can defer a WRONG NUMBER rather than a missing
  feature, and the tell is that the better value already exists.** The spec
  posts C2's `date` from `loggedAt` while quoting C2's own sentence that the
  field is "the end of the workout, NOT the beginning" — and
  `MonitorRun.completedAt` (`src/monitor/monitorRun.ts:133`) already exists
  client-side, unstored, minutes closer, on a PR that is already writing a
  migration. **Separate a deferred FEATURE from a deferred CORRECTION at every
  slate gate.** (Same shape as the 2026-08-22 "separate a deferred
  IMPLEMENTATION from a deferred DECISION"; the second is usually free and
  usually upstream.)
- **RF18 in its purest form: the residual that kills the follow-on was already
  in the repo, in the file the spec cites the neighbouring claim from.**
  `docs/monitor/pm5-ble-ecosystem-review.md:391` row (i): *"the wire is
  MINUTE-resolution and Concept2 stores seconds, so the wire cannot supply C2's
  dedup key as-is."* The spec cited RC exit (b)'s decode of that same field and
  not this line — so its named remedy (store the machine's log date) cannot work
  if the dedup key turns out to be second-granular. **When a spec proposes a
  follow-on to fix a limit, grep the repo for whether the follow-on has already
  been falsified.**
- **A probe whose answer changes the product gets its responses pre-committed,
  or it is a data point rather than a gate.** PR0 measures C2's dedup
  granularity; the three outcomes have three different product answers (ship as
  is / ship with a duplicate warning in the copy / narrow the wave) and the spec
  named none. Live, not hypothetical: `ROADMAP.md:1337` records James connecting
  via NFC in **ErgData** on the same day the wave opened, so C2 may already hold
  the rows we are about to send.
- **The eligible-population count is now a standing phase-open question for any
  send/render affordance keyed on additive-nullable columns.** Wave E's send
  button is fenced by three of them (`device_name`, `ended_by`, `work_*`) and its
  `stroke_rate` reads `machineSummary` — the exact column the 2026-08-28 ad-hoc
  gate counted at **zero of sixteen production rows**, whose v0.30.0 fix still
  owes field proof. **One query before the surface is designed: how many rows
  would qualify today?**
- **Verdict: GO-WITH-CONDITIONS, split by PR.** PR0 (desk cross-connect)
  unconditional and immediate — cheap, discharges RC exit (d), and answers what
  gates everything after it. PR1/PR2 behind the five conditions above.
  RC exit (d) transcription **VERIFIED VERBATIM** against
  `docs/history/phase-rc.md:65-66` — the 2026-08-28 close-gate ruling worked as
  designed, first time it has been tested.
- **Exit criterion 4 (RC-9(b)'s live ring verdict) does not belong in a
  Concept2 wave** — no shared mechanism, PR or risk model; as written it gates a
  C2 release on an unrelated hardware walk. Its own text already says it rides
  the next driver-area PR, which is a register disposition. **A criterion
  inherited with a wave is not automatically a criterion OF that wave.**
- **Release call: v0.31.0 MINOR, after PR2 — never after PR0 or PR1.** PR0 is a
  dev script and a report; PR1 alone is a producer with no consumer, which the
  2026-08-28 rebalance already ruled is unfinished work rather than a ship. The
  note promises one sentence — link your logbook on You, send a finished
  monitor-connected row, one at a time — plus the limits in plain words (no
  splits, no stroke data, older and hand-logged rows ineligible, a row ErgData
  already sent comes back refused). **The word "sync" is banned from this
  wave's notes**: nothing here syncs, and the follow-on that would is named out
  of scope.
- **Counted: 39 unchecked on main, 5 checked** — down from 90 at the 2026-08-28
  rebalance (67 at RC open, 24 on 2026-08-13). First large decrease ever
  recorded here, and it is the archive doing the work rather than execution.
  Roadmap presence **PASS** (spec + ROADMAP section in one commit, `066a36ef`).

## TRIAD final-PR gate, 2026-08-31 (Wave F PR 1 — the live program drop, #248)

- **A Gate-0 artifact that MOCKS a screen's chrome cannot clear that screen's
  top, and this is RC-24 with a different element.** The artifact's three
  log-screen frames drew `<div class="e-nav">← Log it</div>` where the real
  screen has `WORKOUT COMPLETE` + `← DONE`; `grep -c "WORKOUT COMPLETE"` on
  the artifact returns **0**. So the approved strip was never once seen
  beneath the eyebrow that contradicts it. The implementer was RIGHT not to
  fix it (Gate-0 copy on a shared element — #238's precedent), but the
  disposition under-scoped it: `WORKOUT COMPLETE` already sits above
  **link-lost and interrupted** arrivals too, so the decision James is being
  handed covers three arrival types, not one. **At any gate on a NEW surface
  added to an EXISTING screen, diff the artifact's chrome against the real
  component's render tree — and when a pre-existing element is surfaced by
  new work, count its other consumers before framing it as this PR's
  finding.**
- **The countable presentation rule fails when a fast-path artefact rides a
  full-cycle PR.** 274 words above the fold against ~120 — of which **96
  were a "Risk note (what I'd probe first)"**, an artefact CLAUDE.md
  requires of *fast-path* PRs where James is the reviewer. This PR had five
  task reviews and a whole-branch review; the note restated two bullets
  sitting directly above it. Series: #228 ~270, #230 266, #239 **148**,
  #248 274. **The check at every gate is "is there a risk note above the
  fold on a non-fast-path PR" — a one-line lookup, and it was the whole
  overage.**
- **"Ship the honest failure now, fix the loss later" is right when the loss
  already exists — say which.** `Nothing kept.` on a single-interval drop
  reads as a regression and is not one: `IntervalActual` is written at a
  boundary, so the in-flight metres were already unrecoverable on the
  shipped build; the change is silence-plus-stranded-session → closed
  record plus an explanation plus a usable form. **Ruling: ships, with the
  limit in the release note in the rower's words ("the number is still on
  the monitor").** The general test: does withholding the disclosure give
  the rower back the thing they lost? If not, disclosure is not a downgrade
  and only the note is owed.
- **The cross-version check came back CLEAN for the first time in three
  triad PRs, and that is worth saying out loud.** The shipped v0.30.0
  client's readers of a stored `endedBy` are all equality/allowlist
  (`storedSummary.ts:471-472`, `:901`), so a sixth enum value renders as an
  ordinary unimproved row. Same question that white-screened at the PW
  nullable ruling and forced a coordinated tag at #238. **Run it every
  time; the answer varies.**
- **A committed capture generated before the branch's last commit is a
  stale record even when its pixels are identical.** #248's PNG predates a
  fixture index fix (actuals 1/2 → 0/1) that moves which interval row
  carries the "not measured" dash — below a viewport-only fold, so the
  frame is unchanged. Confirm with a no-diff `pnpm screenshots` run rather
  than reasoning about it. (Run by the controller post-gate:
  `log-monitor-dropped.png` came back no-diff.)
- **Release: MINOR, v0.31.0, alone.** First tester-visible change since
  v0.30.0 (`v0.30.0..main` = 5 merges, 4 docs + 1 dev script). **Number
  collision on file:** the same-day Wave E phase-open gate also reserved
  v0.31.0 for the Concept2 wave after its PR2 — first to merge takes it,
  the other moves to v0.32.0. **When two waves are open, a version
  reservation is a claim, not an allocation; re-check it at the merge, not
  at the phase open.**
- **Still n=1 after 3,339 lines: an erg dropping its program mid-row has
  been observed on exactly one walk.** Same residual #239's gate filed.
  Forward obligation: the first tester report after this tag gets its
  record read for `endedBy: "program-dropped"` before anything else.

## TRIAD final-PR gate, 2026-09-01 (Wave F PR 2 — the ring history and its door, #258)

- **The #248 risk-note lookup came back CLEAN, first time, and it was worth
  the one line.** 134 words above the fold with two captures and a Try-it —
  the series now reads #228 ~270, #230 266, #239 148, #248 274, #249 225,
  **#258 134**. What remains over budget is one 32-word bullet naming a
  mechanism with no rower on the other end ("gap, staleness, the raw rowing
  byte"). **Three gates running, the residual overage IS the so-what bullet
  and nothing else.** The presentation rule is now two mechanical lookups —
  count the fold, grep for a risk note — and both are cheap enough to keep.
- **A Gate-0 artifact can UNDER-draw a screen's chrome as easily as it can
  mock the wrong chrome.** #248's lesson was an artifact drawing "← Log it"
  where the real screen says WORKOUT COMPLETE. #258 is its inverse: the
  artifact drew a compact "← Monitor logs" nav where the shipped screens use
  the house `BackLink` + `screen-title` pair (← BACK plus a large serif
  heading, ~90px taller). The implementer was RIGHT to take the house
  component — but James approved a frame whose top is not what ships, and
  nobody told him. **At any gate on a Gate-0 screen, diff the artifact's
  chrome against the real component's render tree in BOTH directions:
  invented chrome and omitted chrome are the same defect.**
- **An eviction policy is a product decision and this one was never argued
  against the incident that justifies it.** The three-slot history is pushed
  from `stash()`, which spec §0.3 establishes runs on EVERY connected
  teardown "including failed pairings and connect-then-cancel". So three
  fumbled reconnects after an incident evict the incident — and fumbled
  reconnects are exactly what an incident produces. It also makes the PR's
  headline claim ("exactly the fix that would have saved the pocketed-phone
  ring") unverifiable: that incident had ≥2 saved-row sessions after it
  (production count 16→18) plus an uncounted number of cancels, which §0.3
  says leave no trace. **Ruled: ship three, file the count with its trigger,
  and do NOT add a size-or-rowing threshold on the teardown path at the last
  gate** — an invented ungated threshold is the exact smell §3's own
  measure-don't-tune posture refuses. The spec's posture applied to its own
  storage.
- **An unverifiable instrument is safe to ship when nothing shipped READS
  it — say that, not "shipping them together is the point."** #258's RF19
  residual is real (every gate mocks the lifecycle seam; §0.4's registered
  deferral blocks e2e). It is acceptable because §4 explicitly waits on §3
  and §6's ROADMAP row forbids a threshold move until an ordinary-use rate
  lands: a wrong instrument yields a wrong measurement whose only consumer
  is a future PR with its own gate. **The general test for shipping an
  unverifiable instrument: name every consumer of its numbers and confirm
  each one is a human-run gate, not a shipped predicate.** Corollary owed at
  the read: the first field ring is simultaneously the instrument's
  acceptance test and its data — read it as the acceptance test FIRST, or it
  is the mirror problem (RF11) with one artifact playing both parts.
- **I over-counted the obligations this door serves, and the correction is
  the durable part.** I had #258 enabling three stacked "decode the first
  field ring" obligations. It enables ONE class: §3's and §6's own entries.
  #239's obligation reads `handoffStore`'s receipts from **sessionStorage**
  via the connection log sheet; #248's reads the stored row's `endedBy`.
  **"The ring" is three different instruments in this repo — name which one
  an obligation reads before crediting a PR with unblocking it.**
- **RF14, seventh occurrence: the notes obligation was in the Record block
  and nowhere else.** ROADMAP's register carries notes-owed rows and had
  none for this screen. Paired with a stale row the PR falsifies and does
  not touch: the Wave D worked example stated in bold that
  `ergomatic:last-session-log` "has no reader" — false on merge — inside the
  item whose demand this PR HALF discharges (gesture-free yes; a saved row's
  diagnostics no, `session_logs` still has no diagnostics column). **A PR
  that falsifies a ROADMAP sentence owns reconciling it, and
  half-discharging an item is an edit to that item, not a new row
  elsewhere.**
- **For a diagnostics door the release note is the affordance, not the
  announcement.** The row reads `DIAGNOSTICS ›` and tells a rower nothing
  about when to tap it. Same shape as the 2026-08-18 swipe ruling: an
  instrument nobody is told to use is not an instrument, and batching it
  into a later multi-item release makes it item N of 8. **Notes PR
  immediately behind, tag on that (#231/#238 shape), and the sentence says
  WHEN to tap, never what it is.**
- **Release: v0.32.0 MINOR.** `origin/main` is exactly `v0.31.0` (zero
  merges since the tag), so this is the first merge after it and the number
  is unclaimed at the gate. Wave E's PR2 wants v0.32.0 too, having lost
  v0.31.0 to #248 — second consecutive gate where two waves claim one
  number. **The #248 rule held on its first live test: a version
  reservation is a claim, not an allocation; re-check it at the merge.**
- **Zero unreviewed tail, third time achieved** (#104, #109, #258): the
  scoped re-review's own diff ends at `git rev-parse HEAD`. Two commands.
  Worth continuing to name as the standard for a final PR.
