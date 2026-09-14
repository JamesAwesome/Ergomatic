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
