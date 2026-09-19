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

- **2026-09-13 — deletion resolves DUPLICATES; unlink resolves WRONG LINKS. They
  are not substitutes and neither raises the other's stakes.** Deleting the
  account that holds a wrong link destroys the history the recovery was for. The
  Wave A engagement arrived with the opposite claim ("duplicates resolvable only
  by deletion makes the auto-link confirmation matter more") and it is a
  conflation. State which failure a recovery path recovers before pricing it.
- **2026-09-13 — until the cohort is external, the recovery path for every
  identity failure is one person with psql.** Six accounts, eleven allowlisted,
  one owner of the box, so merge / unlink / deletion are all "fix it by hand"
  today. The trigger that makes each real is PUBLIC ACTIVATION, not the feature
  that introduces the failure. Say which of the two a row waits on — they are
  usually different dates.
- **2026-09-13 — a unique constraint approved as a product ruling is not
  plumbing a later feature may quietly undo.** A true account merge required
  destroying one `concept2_links` row, because `c2UserId` is `.notNull().unique()`
  by the 2026-09-02 ruling ("one Concept2 account linked to at most ONE Ergomatic
  user per database"). When a proposed feature's cost includes relaxing a
  constraint, grep the schema comment for the ruling that put it there — the
  feature is a re-litigation wearing a migration's clothes.

- **2026-08-13 — "let the erg drive."** The PM5 is authoritative. Match the
  machine, including in pre-row states. Do not invent a reading, a verdict or a
  state the monitor does not itself show. Generalises past the PM5: when a real
  system owns a concept, mirror it rather than modelling our own version beside
  it.
- **2026-08-13 — no new phase for work that finishes an existing one.** CR2 was
  scoped as the close-out of CR rather than a fresh phase, and Phase CP was
  folded into it rather than kept as a second home for the same work. Pairs with
  the filing-as-deferral pattern below.
- **2026-09-18 — a change that moves a control further from the rower prices
  the new distance, in taps and scrolls, against whoever requires it be
  findable.** The account submenu (#474) moved `Delete account` from 0 taps
  and no scrolling to 1 tap, and the row driving the work says in its own text
  that deletion "is the one flow App Review requires be easy to find and
  complete". Neither the spec nor the PR stated the after-figure, though the
  Gate 0 pack had already measured it
  (`docs/design/account-submenu-gate0/renders/layout-audit.json`,
  `04-option-a-you`: `contentBelowFoldPx: 0`). Quieter is a design win;
  further away is a product cost, and they arrive in the same change. State
  both.

- **2026-09-19 — accessibility is judged against how THIS app is used: a
  landscape phone on an erg, read from a metre away, both hands on the
  handle.** James: "I do want accessibility but I'd also like to understand
  what accessibility is practical vs what is overly pedantic." Ruled IN:
  counting which routes and states the standing Playwright gates (axe, 44 px
  targets, computed contrast) do not cover; a no-animation gate; the same
  sweeps under the existing WebKit project; and one VoiceOver pass on his
  phone, once — which is phone-only and zero-rowing, so it IS a hardware walk
  and owes a runsheet and a readiness PASS. Ruled OUT as pedantic here:
  Dynamic Type (inert today — 0 `rem`, 359 px sizes — and a redesign to
  adopt), a simulator a11y instrument (Apple: VoiceOver is not on Simulator),
  VoiceOver mid-piece, standalone focus-order tests, early Nutrition Labels.
  **Count the coverage before buying an instrument.**
- **2026-09-05 (James; recorded 2026-09-19) — five users is not a
  population.** "We have like five users let's just schedule the work." A
  measurement gate built for a five-person household cohort is ceremony and is
  often unsatisfiable by construction (Phase DE's compat-drop trigger needed
  zero log lines over a ≥7-day container lifetime while `deploy.sh` recreates
  the container most days). **State the population before designing a
  measurement gate; at household scale a date plus a tripwire to grep is the
  proportionate answer.**

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

- **One resource budget is not one risk model.** Split atomic admission,
  hook-selection correctness, runner tuning and each tool-owned lifecycle
  adapter into independently safe PRs. A shared slot coordinates participants;
  it does not give browsers, Testcontainers/Ryuk, Docker stacks, simulators
  and foreground Node children one cleanup authority. Approve warning-only
  supersession explicitly; do not bundle an unmeasured worker default.

- **An option priced from a hand-written table census is wrong in BOTH
  directions, and the omission is the expensive half.** Wave A's account-merge
  question (2026-09-13) offered a "one-way transfer of the three clean tables"
  option whose whole appeal was sidestepping collisions. Measured against
  `app/server/db/schema.ts`: `test_history` was missing entirely (it moves
  cleanly, and it is the source of the TEST TREND chart #424 shipped),
  `article_reads` was called clean while its PK is composite `(user_id, slug)`,
  and two further per-user uniques were uncounted. Four move, six collide — not
  three and four. **Before ruling on any data-migration option, derive its
  census with a command over `schema.ts`, never from the dispatch.** RF30's rule
  applied to a table list, and it killed the option the dispatch called the
  sensible middle.
- **The gate that blocks is often the one nobody enumerated.** Wave A #425
  (2026-09-13) asked whether an incomplete code-review lens should block a
  merge. It should not — six later lenses discharged it for code. The binding
  constraint was the **DBA PR gate**, which `dba-ledger.md` disclaimed
  completing IN ITS OWN PASS ENTRY, whose earlier spec pass was a FAIL with "No
  rerun PASS claimed", and which nobody had counted. **At every final gate,
  enumerate the REQUIRED gates from CLAUDE.md's triad paragraph and open each
  named agent's own ledger for a self-disclaimed incomplete verdict** — an
  agent that fails honestly writes it down, and nothing else reads it. The
  blocked lens's residue was a DATABASE TIMING probe, so it was never the code
  reviewer's question in the first place.
- **A hand-back that shows one row of ten reads as a complete list.** #425
  deferred ten items and put ONE in front of James under "Proposed to add",
  while its body said "three lower-severity items are in the handback list" and
  a commit message claimed a row that `grep ROADMAP.md` could not find.
  **Count the rows the PR's own commits and reports say they filed, and diff
  that against the hand-back list** — the shortfall is invisible by
  construction.


- **A scoped correction review can accept the named fixes, but it cannot discharge an incomplete whole-PR review.** Report corrected-function acceptance, merge readiness, and release readiness separately; otherwise strong local evidence silently turns a bounded PASS into approval of code the reviewer never covered. (Wave A Apple AUTH correction, 2026-09-13.)

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

- **A deviation is stated in the presentation and left wrong in the SPEC or
  CENSUS — twice in two days, so check it mechanically.** #408 (2026-09-12)
  disclosed all three deviations in its body and ROADMAP row and left all three
  wrong in the artefacts a later phase quotes as vetted ground (a "becomes
  private" that stayed exported, a 9-vs-8 census count, 11-vs-13 importers).
  #409 (2026-09-12) did it again with a spec IT HAD ITSELF REVISED: §5
  prescribed `PRE_0030_TAGS`, "a 30-element contiguous literal"; the shipped
  test derives the list from the journal, `grep -rn PRE_0030_TAGS app/` returns
  zero, and the spec's own "what revision 2 changed" section listed four changes
  and not that one. **At any gate on a PR that amends its own spec: grep every
  symbol the spec NAMES against the shipped tree, and diff the spec's
  revision-history section against the PR body's deviation list.** The body is
  where a deviation gets disclosed; the spec is where it gets believed.
- **A row whose trigger names a phase has FIRED the day that phase opens.** At
  every phase-OPEN gate, grep `ROADMAP.md` for the phase's own name and check
  each hit outside its section: a row reading "opens WITH the You-stats phase"
  (the Wave E generated-columns row, dateless since 2026-09-07) is not waiting
  any more, it is overdue, and the opening PR is the campsite that owes it a
  date. Phase OD measured this exact shape — an ACTIVE trigger the row itself
  recorded as fired, sitting 20 days.

- **An auto-merge that produces no conflict can still corrupt a numbered
  record.** #412 (2026-09-12): two branches each appended to
  `antagonist-techniques.md`'s numbered list at different line ranges, so git
  merged both cleanly and the tree carried `17,18,19,20` twice; the only
  conflict git raised was in a different file. **At any gate where two live
  branches touch the same numbered list, run `git merge-tree --write-tree HEAD
  origin/main` and read the merged FILE, not the conflict list.** The second
  branch to merge always renumbers.
- **The claim-in-one-artefact pattern reaches CODE COMMENTS, which outlive
  every other carrier.** #408 left a deviation wrong in a census, #409 in a spec
  it had itself revised, #412 in `server/testing/fakes.ts`: a shipped comment
  read "The ROADMAP carries the row" while the row was only proposed at the
  hand-back. **Grep every ROADMAP/spec/ledger reference a PR's new comments
  make, against the file it names, before the gate passes.**

- **The fold-word rule is only enforced where a gate runs, so the drift moves
  to the PRs that have no gate.** Phase MD (2026-09-12): the two TRIAD PRs came
  in at 188 and 150 words above the fold; the two non-TRIAD ones, which the
  phase-grouped triggers exempt from a PM verdict, came in at 169 and **240**
  (#414, bullets at 55/40/33 against a ~25 bar) — the worst since #408's 295.
  At every phase CLOSE, count the fold words of the PRs nobody gated; that is
  where the presentation rule rots, and the close gate is the only thing that
  reads them.
- **A phase can meet every exit criterion and still be closing on top of a
  release backlog older than itself.** MD closed with four tester-invisible PRs
  while `v0.45.0` sat **38 commits and 3 days** back carrying three
  tester-visible fixes. Check `git log <last-tag>..main` at every phase close,
  not just the phase's own tester impact — a phase with nothing to ship is
  exactly when nobody thinks to look.
- **A one-off CI latency is not a row; name the trigger instead.** MD close:
  one deploy job on main started 38 minutes after its gates and ran green,
  while the neighbouring merge's deploy started instantly. Ruled NOISE with a
  trigger (second occurrence, or any non-green deploy, files it that day).
  Filing a row for a single green anomaly is the filing-as-deferral pattern
  wearing a process hat.

- **A repo-wide 100% pin fails on the DIRECTORY the PR created, and a "100% lines" claim reads as green.** #417 (2026-09-12): `domain/stats` shipped 99.02 stmts / 98.75 branch / **100 lines**, CI red on `app/domain/**`'s 100% pin, and the body said "every `domain/stats/*` at 100% lines" — accurate and useless. **At any gate, read the CI job's own conclusion at the head SHA before reading the body's gate list, and require a coverage claim to name all four metrics.**
- **The deviation-in-the-presentation pattern reaches a MEASURED number, and then two numbers circulate.** #417 disclosed a short hero in the body (≈169 px) while §5 still read 181 and the re-review had measured 163; nothing gated the height, and the spec's prose described a legend the approved artboard did not draw. **When a PR re-aligns to an artboard, the artboard wins and the SPEC is what needs the edit — with one number and the command that produced it.**
- **`ci-changes.sh`'s docs allowlist is a live hole wherever a test reads a file under `docs/` by name.** #417 patched it for `docs/design/career-stats/seed.mjs` and shipped the comment "One file under `docs/` is CODE"; `src/test/captures.ts:21` + `captures.test.ts` read named captures from `docs/monitor/sessions/`. **Before accepting an allowlist patch, grep the test tree for runtime reads of the skipped prefixes** — the patch's own comment is where the next false absolute lands.

- **A phase's exit text names the caption, and the better implementation ships a
  different one — so the criterion is unmet by a change that improved it.** PS
  criterion 5 required `TWO ROWS MAKE A CHART` on all three PR-2 charts; TEST
  TREND draws a chart at ONE point on purpose (a single test IS a result, and
  "rows" is the wrong noun for tests), and the deviation reached neither the PR
  body's four-item list nor the ROADMAP. **At every close gate, grep each exit
  criterion's own quoted STRING against the shipped tree** — a criterion written
  as copy is falsifiable in one command, and a deviation that improves the
  product still owes the edit.
- **A hand-back's copy census is wrong in both directions, and the costly error
  is the over-ask.** #424 escalated `Couldn't load your tests.` — a verbatim
  sibling of `Couldn't load your stats.`, which PR 1 shipped on the same page,
  one of eleven sites using the pattern — while omitting `NO 2K OR 6K TEST
  LOGGED`, the only new string a tester with no tests actually sees. **Before
  carrying a string to James, grep its family (`Couldn't load your`) and count
  the sites; then enumerate every new user-visible literal in the diff
  (`git diff ... | grep '^+export const [A-Z_]* ='`) rather than the ones the
  author remembered.** Asking him to re-rule a settled convention spends the
  gate's credibility on the PR where a real question is beside it.
- **Ship the TRIAD half early and the post-ship note costs artboards, not
  rework.** PS rulings 20-21 arrived after build 977 was on James's phone and
  landed as one chevron and one `:active` rule — because Gate 0 had already made
  the hero its own component and the door one control. Rulings 18-19, made on
  rendered output mid-phase, cost spec and e2e-literal edits in the NEXT PR.
  **At phase open, ask which PR-1 decisions make a later "can it look tappable?"
  a CSS question instead of a redesign** — that is what buys the right to tag
  before the phase is finished.

- **A fix-round summary is a claim about its own diff, and nothing checks it
  (RF36, applied to cards instead of commits).** The 2026-09-15 work-clock
  card took FIVE PM gates; two were spent on changes the controller's message
  said were made and the artefact did not carry — an edit script asserted some
  anchors and not others, so a replace silently no-opped and was reported
  done. **Before reporting a card fixed, `git diff` it and tick each claimed
  change against a hunk**, and assert every anchor.
- **A substitution inherits the new artifact's obligations, and the ones that
  bite are the ones the old artifact discharged for free.** Swapping a new
  single-step block for the already-walked Keystone `x2` fixed an assumed
  workout state and silently added an operator action: the Keystone carries no
  rest token (`restSeconds: 0`), so interval 1 rolls into interval 2 and the
  session must be ENDED by hand — a timed two-tap confirm
  (`ConnectedSurface.tsx:704-716`; `ARM_TIMEOUT_MS = 4000`). **At every
  re-gate, diff what the old plan got for free against what the new one must
  do by hand.**
- **Reading a GATE is not reading the BRANCH.** Two mechanisms sharing one
  enabling condition are not thereby reachable together:
  `transports/index.ts:312-330` puts the fake transport and the recording tap
  behind the same `fakeMonitorEnabled` gate, and an injected fake script
  RETURNS from its arm before the tap is ever created. The general form of
  RF13 and RF16's second corollary; the cheapest prophylactic is mechanical —
  open the exact lines and quote them.
- **Count from the rows, never adjust the previous count.** That card's tap
  count went 5 (over a table of 4) → 9 → 11 → 10 → 9. The 10 was the GATE's:
  it subtracted one from a number already found wrong instead of recounting.
  An adjusted count inherits every error in the number it adjusts.
- **A walk card that admits an unknown owes a grep of the capture corpus
  first.** v1 wrote "PM5 inactivity: NOT ESTABLISHED" and justified a 30 s
  hold as "well clear of any plausible value" — a limit with no number
  (RF30). The repo already held two: **36.35 s** of still `INTERVALREST` in a
  **type-8** workout that continued, and **896.77 s** in a **type-1** free row
  with 0x0031 still arriving at **0.99 Hz**.
- **A walk that rescues one option of three is not worth an erg session on
  that alone — find the second question the SAME evidence answers.** If the
  answer is nothing beyond one option of one board, recommend taking the
  option to the gate at its measured risk instead.
- **Do not read a free-row observation as a prior for a programmed one.**
  JustRow is `WORKOUTTYPE_JUSTROW` (1), a programmed piece is
  `WORKOUTTYPE_VARIABLE_INTERVAL` (8), and the monitor plausibly runs
  different clock rules per type — a TIME interval's clock must run through a
  stop or the piece could never terminate.
- **A desk rehearsal CONFIRMS a label; it never DISCOVERS a required action.**
  Anything the plan requires belongs in the card's interaction table before
  the gate, because the card is what the operator follows and a rehearsal
  finding lands after he already has the script.

- **A PR body corrected at head can still be false about the TREE, and the
  ROADMAP is the artefact James rules on.** #452 (2026-09-15) rewrote its body
  to say the naming row "is withdrawn, because the work is done here"; the row
  was still in `ROADMAP.md`, live, and its "what would fix it now" still
  prescribed the WRONG vendor document that the PR's own last commit had just
  convicted. The fix arrived as a paragraph appended eleven lines BELOW the
  prescription — the shape CLAUDE.md forbids by name. **At every hand-back
  gate, grep every row the body claims to have added, withdrawn or fixed
  against the tree at head, and read the row from its FIRST line — a
  correction a reader reaches second is a contradiction a reader reaches
  first.**
- **A bundling decision made after the gate plan is written does not update
  the gate plan, and the bundled half is where the defects are.** #452's Gates
  block still read "PM / antagonist / dba: skipped" twenty-one lines below a
  sentence crediting the antagonist with two finds — both of which landed
  entirely in the half James had asked to bundle in. **At any gate on a PR
  whose scope changed after its gate list was written, re-derive the required
  gates from the scope AT HEAD rather than reading the list.**
- **A finished item with a `dies` stamp in a queued section is an obligation
  the sweep cannot tell from a record.** #452 left two done rows in "Small,
  queued, rides the next PR in its area" carrying live stamps; the `tr`-grep
  sweep is a string match and will hand both back to James as live work.
  Completed work belongs where completed work lives, or its stamp goes — and
  that is his ruling, never the gate's.
- **A PR that ticks someone else's stale row while leaving its own open.** The
  account-submenu PR (#474, 2026-09-18) ticked #453's row at `ROADMAP.md:1057`
  with the words "the work shipped and the row stayed open, which is the
  failure RF14 exists to prevent" — and left BOTH rows it was itself
  delivering at `- [ ]`, one of which read "nothing has built it". **At every
  final-PR gate, read the rows the PR CLOSES, not only the rows it files or
  the rows now overdue.** `CLAUDE.md`'s hand-back rule has two lists and
  neither is this one, so nothing else catches it. The cost is countable: PR
  #422 exists for no other purpose than ticking five rows main had already
  closed.
- **Above-the-fold bullets blow the count when a bullet carries the change AND
  its justification.** Three failures now — #228 at ~270 words, #230 at 266,
  #474 at 290 with bullets at 56/72/50/39 against ~25. Every over-long bullet
  in all three was a one-line outcome with the reasoning welded on. The fix is
  mechanical and the same every time: the outcome stays above the fold, the
  "because" moves into the Record. Say that, rather than asking for "shorter".

- **A wave whose goal is "the instruments another wave needs" asserts its own
  demand, and nobody checks it against the consuming wave's text.** Wave D
  (dissolved 2026-09-19) claimed two Wave C dependencies. Wave C's
  accessibility row asked only for 44×44 targets and 4.5:1 contrast; its
  cold-start row said in its own words "A green simulator run is not this
  item's exit"; and no Wave C row reached a connected screen. Both
  dependencies were written in the INSTRUMENT wave and only echoed in the
  consumer, and Wave B and Wave C read "After D" for three weeks because of
  it. **At every phase/wave OPEN gate, quote the CONSUMING row's own text and
  check that it asks for what the instrument row offers.** And price the
  instrument against the questions it would settle: grep the roadmap for
  them. An instrument with no pending question is a capability, not a
  deliverable — the simulator's one unique capability, real WebKit safe
  areas, had zero open questions.
- **A flake row is a MEASUREMENT, and measurements expire; the newest sweep is
  the record and the older row is a stale copy.** Wave D's three flake rows
  ran to 343 of its 472 lines while a 1,036-log audit (#457, 2026-09-16) sat
  in `docs/superpowers/research/` refuting the runner inference the longest
  row leaned on. **Before reading any flake row, `ls
  docs/superpowers/research/` for a dated hunt, then re-derive the count — and
  say which oracle each half of an "it's dead" claim rests on.** Vitest has no
  `retry`, so red jobs are a COMPLETE census of its flakes; Playwright retries
  once in CI, so its flakes hide in GREEN logs (RF42) and only a per-log sweep
  counts them. **Then check the fix log before filing what the sweep finds:**
  the 2026-09-19 sweep turned up two flakes no row named
  (`sheetScroll.spec.ts`, `mutation.test.mjs`), the report proposed filing
  both, and both had been fixed within hours of their last sighting
  (`252a482f` in #463; #466) — found by the controller with `git log` on the
  two files, which the sweep never ran.
- **A row filed against a defect can be fixed by its own sibling PR within
  days, and nothing re-reads it.** Wave D's wire-gap-witness row blamed #140
  for losing a witness; #141 — the very next PR — restored it
  (`traceModel.test.ts`, a committed capture's real >3 s gap asserted to split
  the trace in two), and the row claimed the gap open for thirty days. Its
  sibling, the REST-fixture row, was met the same way. **At every gate on a
  row that names a PR number, `git log -S` the row's own subject before
  believing it is still open.**
- **A cost attached to a QUEUED item goes stale in weeks, and always in the
  same direction.** The type-hardening row's diagnostic counts (2026-08-29:
  71 + 7 and 242 + 405) were re-measured on 2026-09-19 at 145 + 57 and
  248 + 767 — roughly 2x, because the tree grew underneath them. RF30 says a
  cost is a factual claim; this is its half-life. **Re-measure any cost older
  than a fortnight before ruling on it, and record the tree it was measured
  against.**

- **A wave's row can be discharged by a PHASE in a different section, and the
  wave's own text will still claim it.** Wave C's test-history row read "this
  is the only read path… the app collects test results no rower can ever
  see"; Phase PS PR 2 shipped TEST TREND (`30fd5cc0`, #424, merged 2026-09-13,
  v0.46.0) six days before the refinement that quoted it. The sibling rule
  above greps a row's named PR; here no PR number appears in the row at all.
  **At every refinement, grep each row's SUBJECT against the shipped tree
  before judging it** — one command moved this row from "build the list" to
  "the binding on the list was already breached".
- **A PM binding names an ARTEFACT and governs a CAPABILITY, and a different
  artefact will walk straight past it.** #165's gate (2026-08-22) bound "the
  list does NOT ship without a remove/void answer"; the TEST TREND *chart* is
  a read path, shipped without one, and keeps points whose log row was deleted
  — so a bogus test is now permanent AND drawn. **Word a binding as the
  capability ("a rower can see these rows"), and re-read an old one that way
  before accepting that a new surface escaped it.** Nothing else catches it:
  the binding lived in a wave the shipping phase never read.
- **A stranger-shaped GOAL is the same dead criterion as a stranger-shaped
  exit.** James deferred public sign-up on 2026-09-14 ("that will be a final
  'production' phase, don't worry about authoring it yet") and
  `accessPolicy.ts` defaults `restricted`; Wave A's exit and Wave C's goal and
  exit were both struck or restated on 2026-09-19 because of it. **Check the
  goal sentence, not only the exit** — a goal written before 2026-09-14
  containing "a stranger" describes a distribution that does not exist, and
  the goal is what the rows were scoped against. Sort each row by who it
  serves TODAY; what only a stranger needs is listed for the unauthored
  production phase ("After the strangers"), never authored into it.
- **Two phone-only zero-rowing items in one wave are ONE walk.** Each owes a
  versioned runsheet and a PM readiness PASS; together they owe one session,
  one install and one PASS. **At every wave-open gate, collect the rows
  needing James's device and ask whether one sitting serves them all — then
  order them so the earlier observation is not spoiled by the later setup** (a
  naive cold start must precede turning VoiceOver on).

- **A wave's decoupling rationale can be killed by a decision made the same
  day, and the status line keeps quoting it.** Wave B's line read "No longer
  releases with Wave C: the backup row protects the household's data TODAY" —
  and James struck the backup row hours later (RDS, in a separate AWS repo).
  The decoupling still held, for a different reason (its second PR is gated on
  that repo). **At every refinement, read a status line's stated REASON
  against the rows the section still contains**, not only its verdict: a
  correct verdict resting on a dead reason is quoted as settled by the next
  reader.
- **Before pricing an "it tells nobody" row, ask which part of it something
  that already exists answers for free.** Wave B's reporter row welded three
  failure classes into one M: the server being down (`/api/health` already
  returns `{ok, db, version}` and 503s on a failed `SELECT 1` — an external
  checker, zero code here, and James moved it to his AWS repo), a native crash
  (TestFlight and Xcode Organizer already collect them), and a client render
  throw (`git log -S "ErrorBoundary" -- app/src` is EMPTY). Only the third is
  app-side, and it is the one the row's own RF19 argument is about. **Split an
  instrument row by failure class and check each against the deployed system
  before sizing it.**
- **Work gated on ANOTHER REPO goes in as a row with its own trigger, never as
  a peer that the wave's schedule waits on.** James is building AWS in a
  separate repo; the app-side cutover (pool TLS, a compose profile, a
  rehearsed dump/restore, two doc sentences) is real and ownerless, so it
  belongs in ROADMAP (RF14) — but a wave whose second row cannot start until
  an external question is answered is the Wave D failure again. Judge the
  wave's date on what can start today.
- **A stale line number inside a queued row is evidence the row has not been
  re-read.** Wave B's backup row cited `compose.yml:102` for the bare `pgdata`
  volume; at head that line was the `web` service's `container_name`. The
  claim still held. Treat it as a prompt to re-derive every other figure in
  the row, not as a typo.

## Recommendations that turned out wrong
- **2026-09-13 — the disabled-button contrast fold (#425).** I measured the
  disabled provider button at 2.16:1 (`--ink-5 #a09a8c` on `--accent #b5341f`)
  and the disabled method row at 2.48:1 on `--page`, and was going to FOLD both
  against this repo's "WCAG AA is a hard requirement". **Wrong: WCAG 2.2 SC
  1.4.3's incidental clause exempts "text … that is part of an inactive user
  interface component",** and `index.css` already reasons that way. Before
  folding a contrast finding, check whether the element is INACTIVE — the
  repo's blanket AA phrasing does not carry the exemption and will mislead the
  next reader.


- **2026-08-13 — the CR2 item 0 hypothesis and its oracle.** Both written into
  the ROADMAP with confidence, both measured false within a day (work→rest never
  drops the clock; the prescribed boundary-sum oracle fails a correct fold).
  Lesson: a written hypothesis in a roadmap is load-bearing — an investigator
  will follow it and stop. Mark speculation as speculation, or measure first.

- **A second login provider owes account continuity.** Check that an existing
  rower can reach the same history through either door. Relay email cannot join
  those accounts; explicit linking and its extra proof must be visible in the
  rendered design. (Wave A Apple-first, approved 2026-09-12.)

## Where the dated record lives

The per-engagement record — one section per engagement, in date order, 6413
lines of them — is `pm-ledger.md`. **Do not read it up front.** Grep it for
the detail behind an entry above, or for the history of a phase you are about
to judge; every citation elsewhere in this repo that names an entry points
there.

**To find what to grep for, list the record's sections first:**
`grep -n '^## ' .claude/agents/pm-ledger.md` — one line per engagement, dated
and named by phase. That index is the thing to scan; the sections themselves
are what you open.

**Propose every entry to BOTH files.** The durable line belongs here, under the
section it fits; the engagement record belongs there, as its own dated section.
An entry that lands only in the record is invisible to the next agent — which
is exactly what happened: every section in this file stopped growing on
2026-08-15, while the record beneath it reached 6413 lines.
- **The recovery may already be on the screen, and finding it re-prices the
  feature that automates it.** Wave A PR2 (2026-09-14) was scoped as "the rower
  is returned to sign-in with a fresh chance to make a duplicate" — TRIAD twice,
  a migration, three plan revisions. `SignIn.tsx` had shipped the recovery as
  copy two PRs earlier, with `Add Apple ›` live on the You methods list. The
  feature turns two steps into one; it does not unlock a capability.
  **Before pricing any "the rower is stuck" work, read the screen's own copy and
  open every control that copy points at.**
- **A slice can be unreachable in the mode the HOST actually runs, and the
  schema will not tell you.** `requireAccess(identity.email)` runs before the
  `confirm` stage; `ACCESS_MODE` unset means `restricted`; an Apple relay
  address is never on `ALLOWED_EMAILS`. **At every build-now gate, read the
  DEPLOYED configuration**, and ask which of the feature's cases the live config
  admits. A slice nobody can reach is not a slice.
- **Two rows in one wave with different `dies` dates ARE the execution order.**
  The dates were stamped so a wave's unblocked half could not hide behind its
  blocked half. Run the `tr` sweep and check whether a row in the SAME wave dies
  sooner before endorsing any slice.
- **A phase's written exit is the test for "is this the next slice", and the
  slice often is not in it.** Quote the exit and check whether the proposed work
  appears in it before judging sequence on anything else.
- **A host-session runsheet has two clocks and the safety one is usually
  missing.** Capping the OPERATOR at 35 minutes while the door-open window had
  no number, and including the teardown inside the cap, means an overrun extends
  the exposure. **Give the exposure window its own hard cap, started by the step
  that opens it, and put the closing step OUTSIDE the total.**
- **A feasibility unknown that chat can settle must be settled in chat, never
  carried into the runsheet as a branch.** One unknown (a second Apple ID) was
  asked and answered in a line and killed a case for free; the sibling unknown
  (a second Google account in the native chooser) was assumed "likely on hand"
  and was the PRIMARY case's only prerequisite. **The one you assume is the one
  to check first — it is assumed precisely because it is the one you need.**
- **A permissive-mode admission test needs its restrictive-mode denial leg, or
  it cannot go red.** "The confirmation screen appeared" cannot distinguish "the
  gate admitted" from "the gate was never consulted". Take the SAME identity to
  the denial first, then flip. RF21 at the operator layer, and normally free.
- **A session that creates an account under a permissive mode must delete it
  BEFORE restoring the restrictive one.** The policy is re-checked on every
  protected request, so an account left alive at teardown is the locked-out
  rower exposure — created by the session testing for it. Any step whose
  observable requires "and the empty screen" is a step that creates something.
- **At a RE-GATE, diff the new version's contract coverage against the OLD
  version's, not only against your own findings list.** Runsheet v2
  (2026-09-14) folded all twelve findings and, in restructuring the timer table
  around the new door clock, silently dropped the TOTAL operator wall-clock cap
  that v1 had carried. A fold that fixes a structure is exactly where an
  unrelated clause falls out, and a findings-list re-read cannot see it —
  nothing on the list was about the total.
- **A document that names a version trap can still walk into it in its own
  pass condition.** The same v2 wrote "a copy observable must be quoted from
  the surface actually running it", then pinned a denial string that #444 had
  added seven commits AFTER the tag the phone runs — on the control leg, whose
  entire job is to be falsifiable. **Grep every pinned user-visible string
  against `git show <the tag the surface runs>:<file>`, not against main**, and
  check whether the build carries a second branch that prints a different one.
- **When a version-to-version diff turns up ONE lost contract clause, finish
  the whole clause list before reporting.** 2026-09-14: the v2 fold dropped
  both the total wall-clock cap and the typing/paste count; the re-gate found
  the cap, reported it, and missed the count, which then survived into the
  approved version. A found regression is evidence the fold was lossy, not
  evidence you have finished looking.

- **A PR map cannot price a risk model that a design gate has not yet ruled.**
  The number-provenance slate (2026-09-14) mapped PR 4 as TRIAD while its own
  members read "agrees when one of them changes, OR both are labelled" — copy
  and number-change are different risk classes, and the gate picks which. **At
  phase open, mark any PR whose risk model depends on a Gate 0 ruling as
  PROVISIONAL, and re-rule the map in the gate record before the first
  implementation task.** A map that reads settled is quoted as settled at the
  final gate.
- **"One Gate 0" is a ruling about SCREEN coherence, not about one sitting.**
  James's 2026-08-31 words are "rather than approving a third of a screen at a
  time". Two gates that each approve a WHOLE screen satisfy it; one gate
  spanning two screens satisfies it no better and costs more. Count the frames
  a gate owes (options × before/after × two orientations, each option's cost
  measured per RF30) before accepting it is a single sitting — the
  number-provenance gate came to ~27 frames and 7 priced options, on a pass
  whose own history is a 10-day stall while it accreted members.
- **An exit criterion verified "by reading each board" is verified against the
  DESIGN, not the build.** Boards are Gate 0 artefacts; a criterion that reads
  them duplicates the gate that drew them and gives the close gate nothing to
  quote. Replace it with a census derived from the shipped tree — one row per
  user-visible figure, its arithmetic owner, and the on-screen text that says
  so, or the dated ruling that it needs none. (RF24's wrong-layer tell.)
- **A criterion written against a defect's SHAPE can be retired by its own
  fix.** "A gate fails on a seven-glyph tick" stops having an input once the
  approved fix shortens the ticks. Write the criterion as the invariant (the
  widest tick a chart can produce fits its reserved space), not as the
  counterexample.

- **2026-09-14 — "the capture path is desk-rehearsable with the fake"
  (work-clock walk card).** The gate read `transports/index.ts`'s
  `fakeMonitorEnabled` condition, saw the fake and the recording tap both
  behind it, and told the controller the whole export path could be rehearsed
  at the desk. It cannot: `:312-330`'s `if (script)` arm returns before the
  tap is created, so an injected fake sets no `__pm5Recording__` and the
  download control — which reads that global to decide whether to render —
  does not appear. The claim rode FOUR versions of a card and would have
  manufactured a false abort the night before the walk. **A gate's own verdict
  is a claim with the same evidence bar as the artefact it judges.**

- **A pre-connection retry can be automatic when the interrupted operation
  proves its own cause.** Require the winning error to carry the exact pass
  identity, successful cleanup, observed foreground return, one retry, and
  containing-operation cancellation. Keep GATT, programming, active workouts
  and a second interruption terminal.

- **A spec that changes the UNIT of its census must re-derive every count that
  used the old unit — and the one that survives is always in the row, not the
  spec.** #480 (2026-09-19) re-cut its census from eight DELETE STATEMENTS to
  eleven PRODUCERS after the antagonist found the `ON DELETE cascade`,
  corrected the spec, the PR body and the opening ROADMAP row's argument — and
  left `ROADMAP.md` reading "a rename retires the damage on all seven leaking
  paths", the six-statements-plus-sibling figure from before the recut, plus a
  whole paragraph still describing the statement-era census. **At any gate on
  a PR that recounts something, grep the number words
  (`seven|eight|nine|eleven`) across every artefact the PR touched, not just
  the one where the recount is argued.** RF36 with an integer.
- **"One test per producer" is a census claim, and it is checked by counting
  the tests that ASSERT the observable, never the producers that route through
  the shared helper.** #480's Record claimed a test per census row; six of
  eleven had one, and the miss was row 11 (`sessions.sweepExpired`) — a
  headline producer whose collector clause is a DIFFERENT SQL fragment from
  the tested one, in a file whose store is built with `noRevoke` and so cannot
  observe a revoke by construction. **Grep the recorder/spy constructor per
  test file and count its assertion sites; a producer that only shares a
  helper with a tested one is untested (RF21).**
- **A PM condition on a TRIAD PR is usually about the record, not the code,
  and that is not a reason to soften it.** #480's design survived two kill
  shots and a DBA gate; all three merge conditions were a word count, a
  missing test, and a row left saying "NOT DONE IN THIS WAVE" about the work
  in the diff. **Do not discount a presentation or hand-back failure because
  the engineering is strong — strong engineering is exactly where a false
  record is believed longest.**
