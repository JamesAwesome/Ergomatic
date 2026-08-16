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
