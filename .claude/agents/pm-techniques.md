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

## Recommendations that turned out wrong

- **2026-08-13 — the CR2 item 0 hypothesis and its oracle.** Both written into
  the ROADMAP with confidence, both measured false within a day (work→rest never
  drops the clock; the prescribed boundary-sum oracle fails a correct fold).
  Lesson: a written hypothesis in a roadmap is load-bearing — an investigator
  will follow it and stop. Mark speculation as speculation, or measure first.

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
