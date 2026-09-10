# Phase RR — the register may only go down (ABANDONED 2026-09-10)

**Abandoned by James on 2026-09-10, mid-flight.** PR 1 (the spec and the
ROADMAP section) had merged as #386; PR 2 (the mechanism) was closed unmerged
as #388 after four review rounds; PRs 3 and 4 were never written.

**The verdict, in his words: this is the wrong way to manage a roadmap.** The
phase proposed to make the register a ratchet — a script counting rows per
section, a class marker on all 33 headings, four rules in `CLAUDE.md`, a
`/register-gate` skill, and a `dies` stamp on every row. Nothing about it
reached `main` except this body and the spec.

**What was true and outlived it.** The register was growing +6.75 rows/day,
monotone across twelve samples, while the file itself shrank 2,625 lines. And
26 of its rows had already finished — they were evicted by hand on the same day
this was abandoned, which is the entire win the mechanism was chasing, at none
of the cost.

The design record below is kept for the measurements in it, not as a plan.

---

## Phase RR — the register may only go down

**OPEN 2026-09-09.** Design approved in chat the same day; spec
`docs/superpowers/specs/2026-09-09-register-ratchet-design.md` (**rev 3** — the
mechanism was rebuilt twice, after `/harden` lens 1 plus the PM phase-open gate,
then after lens 2; falsified claims are replaced, not annotated). Filing a row is free and closing
one is not, so the register only grows: RF14 says everything with a life after
merge goes here and nothing anywhere says when a row may DIE. James, 2026-09-09:
_"we need to figure out how we can continue working without filling this
register to death with cruft. It's fucking impossible to close things out."_
This phase makes the register a ratchet — file N rows, strike N.

**The trend is the case.** One sample per day of ROADMAP-touching merges on
`main`, 2026-08-29 to 2026-09-09: **36 → 46 → 64 → 67 → 74 → 76 → 88 → 89 → 96
→ 101 → 108 → 117.** +81 rows in 12 days, monotone, not one down day,
**+6.75/day** — while the file itself SHRANK 2,625 lines. The line count is the
axis that is improving; the row count is the one that is not.

Nothing a rower sees changes. No stored number changes. No `app/` file is
touched. The audience is agents and James.

**Rows in this section are `<!-- phase -->` rows, not register rows** — filing
them owes no strike. They are dispositioned by `/close-phase RR`.

- [ ] **PR 1 — the spec and this section.** Docs only. RF17: same commit.
- [ ] **PR 2 — the mechanism, minus `dies`.** `scripts/register.sh`
      `count`/`closed`/`ratchet` + `scripts/register.test.sh` + fixtures
      (failing test first), wired into CI's `scripts` job; one of SEVEN
      whitelisted class markers on every section that can hold a row; **rules 1 and 3 in `CLAUDE.md`, together, because rule 3 is
      what funds rule 1** — dead strikeable inventory is ~32 rows against
      6.75 filings/day, so a ratchet shipped alone is unpayable inside five
      days; the `/register-gate` skill; `/close-phase TD`'s refusal.
- [ ] **PR 3 — the eviction.** Already-closed rows out of the register and into
      `docs/history/`, and the one malformed table row repaired. **Every
      candidate is confirmed BY HAND** — the vocabulary has measured false
      positives, including RC-14, a HELD order of James's whose row contains the
      words "NOT DISCHARGED BY IT". **Its body must say this closes ZERO open
      work**: file hygiene against a register growing 6.75/day, not debt
      closure. The count comes from the spec's §8.1 at PR 3's own tree.
- [ ] **PR 4 — `dies`.** `stamps` and `expired`, `/close-phase` Phase 4 step 5's
      expiry defence, and the stamp pass over every register row. Lands after
      James answers the spec's §10, because 37+ rows cannot honestly carry a
      death condition until he rules on class defaults.

**What lens 1 and the PM broke in rev 1, kept here because the wrongness is the
useful part:**

- **The stamp was "the row's last line".** False for 262 of 314 top-level
  bullets — the file is hand-wrapped near 80 columns, and rev 1's own worked
  example wrapped its own stamp onto a line carrying neither field.
- **"One register section is a table."** Four are, and `## Needs a decision from
  James` is MIXED; the `closed` gate was bullet-anchored, so a
  `RULED (James, 2026-09-03): KEEP` row inside a register table could never be
  reported.
- **`## Active audit overlay` was to be archived as "2 of 2 closed".** It holds
  the live **Wave A-E overview table**, including Wave A. It is a ledger, and
  the archive is dropped.
- **The ratchet's base ref was never named.** Two branches striking the SAME row
  and filing in different sections each read a delta of 0, merge clean, and
  leave the register +1 — demonstrated in a throwaway repo. The base is a
  recomputed merge base or the gate is decoration.
- **The unmarked default was fail-OPEN**, in a design citing `ci-changes.sh`,
  whose defining property is that every uncertainty resolves to RUNNING.
- **"Filing dates are not recoverable" was false.** Blame measures last edit;
  `git log --reverse -S` measures first appearance — six rows, six dates.
  Stamping ~50 rows with today's date would have erased the age evidence that
  justifies striking them.
- **The closed-row predicate was wrong in BOTH directions, and the second
  version could have evicted a live row.** Rev 1's regex anchored after the
  bullet's `**` while this file writes dispositions mid-line, and `ANSWERED`
  matched zero rows because the file writes `ASKED AND ANSWERED` — so dead
  inventory was undercounted at 21. Widening it over-caught row IDs and
  emphatic openers (`TWO`, `TIER B2`, `RC-38`, `AUD-012`, `PWA`), and matching a
  row's BODY flags **RC-14 on the words "NOT DISCHARGED BY IT"** and Phase TD on
  `RESOLVED` inside **`UNRESOLVED`**. It now matches the row TITLE only, with
  word boundaries, a negation guard and `- [ ]` as a hard OPEN override, reports
  CANDIDATES, and is graded a HEURISTIC.
- **Four more gates read green over their own defect** (lens 2, all measured):
  `ratchet` passed clean when it could not resolve a base, because an optional
  `<base>` is set-but-EMPTY and `: "${VAR:?}"` does not fire on that; an empty
  or deleted `ROADMAP.md` reported clean AND credited three strikes; a
  MISSPELLED marker reported `unmarked=0` with a fall of 3; and the two-branch
  collision case could not go red as worded. `date` is now banned from the
  script — `date -j -f` is BSD-only and fails OPEN on the Linux runner into a
  tidier number than the truth.

**The condition that would have failed the phase (PM, binding):** a
`<!-- debt -->` class for `## Phase TD` and `## Owed captures and walk items` —
counted, never payable by strike, never expired, no `dies` owed. **47 of 85 open
register rows name no code artifact**, and 11 of 11 owed-capture rows need James
at an erg, so rule 3 has nowhere to send them. That is RF11's and RF24's
class — the class that caught a 3.9x distance error and a feature reaching zero
of sixteen production rows, both because somebody wrote down "nobody has checked
this." This file's own head already says Phase TD _"is deliberately not
scheduled"_; rev 1 put it inside the ratchet and asked 16 rows for a date the
file forbids them to have.

**Gates:** not TRIAD (no rower-visible number, no persisted product shape, no
auth). **PRs 3 and 4 DO get a PM final gate** — `CLAUDE.md`'s third PM trigger
is "the shape and sequence of planned work", and rev 1 denied the gate in its
spec while citing that same clause to justify the phase-open one. `/harden` ran
lens 1 on the spec; lens 2 runs on rev 2. No Gate 0, no walk, no tag.

**Seven questions are batched for James in the spec's §10, and five of them are
collisions between two of his own rulings** — most sharply, this file's head
(2026-09-08) blesses a TRIGGER as a legitimate row form while rule 2 as drafted
refuses one, and Phase OD falsified the dates remedy one day before this design
was written.
