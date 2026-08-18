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
