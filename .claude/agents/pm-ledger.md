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
