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
  that clause *not evaluable* (DISTANCE and TIME cannot move; AVG SPLIT is
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
  directions at once. The state to write is explicit: *implementation
  merged in #N; phase OPEN on clauses (a)-(e) + W5-W8 + 9a; owner: the
  next erg visit.* (Two prior phases closed with no ROADMAP section at
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
  8B design *input*, which is the deferral the precedent refuses. **A gate's
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
