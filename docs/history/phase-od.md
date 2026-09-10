# Phase OD — an order of James's does not go quiet

**Archived 2026-09-10** — closed 2026-09-09 · #384.

An order given in James's own words gets scheduled with its open question, so it cannot rot in the register unnoticed.

---

## Phase OD — an order of James's does not go quiet

**S · one PR · docs-only · tester sees nothing · opened 2026-09-09.**

**What and why.** Four orders James gave in his own words sat undone in one
register band, the oldest 23 days, and were found only because a debt census
happened to grep his name. Two agents then read the nine-day-old one (RC-13) as
already fixed and nearly struck it. This phase is not "clear the register" —
that is ~57 rows and a day cannot touch them. It is the narrower problem that
**the register can swallow a direct instruction, and nothing in the repo
notices.**

**Two diagnoses were wrong before the right one, and both are recorded because
the wrongness is the useful part.**

1. _Passive triggers kill orders; give them dates._ FALSIFIED by Wave D's
   **Hunt the e2e flakes** row — a live order from 2026-08-20 with an ACTIVE
   trigger the row itself records as having FIRED. The remedy already applied,
   already failing.
2. _Size kills them; every order is fast-path or a phase, and the middle state
   is banned._ FALSIFIED at the PM gate: it reads one variable off a single
   control (n=1) in which cheapness, a scheduled trigger, and having no open
   question all co-vary — the same confound that killed diagnosis 1, repeated
   one variable over. Banning a state without supplying the missing one mints a
   phase per 0.5 row, and this file already carried 54 phase sections before the
   rebalance, 40 of them describing finished work.

**THE RULE: an order's OPEN QUESTION is scheduled before the order is.** An
order rots when it carries an unanswered question that nobody owns; then it
cannot be done and no trigger rescues it. Four for four on the rotted orders —
RC-14's question was "which survivor is it" (answered 2026-09-09 by a probe,
not by reads, and the answer was none of the three: nothing threw, and the
entry was lost in the SNAPSHOT one frame below the driver — see its row),
AUD-006's was what "the compiler's own fold" means for display (a read
plus a spec sentence), RC-13's was whether draining yields a WRONG verdict (a
read plus a judgement — answered 2026-09-09: a settlement cannot see LESS
evidence than the deadline would have, and the row now reads DONE), and `PULL TO RESUME`'s was whether it was still wanted
(James answered it by withdrawing). Every question is ≤0.25 of reading; the
orders were 0.5-1.0 and stalled.

**What this phase did.** Landed seven rulings of 2026-09-09; struck the
`PULL TO RESUME` order in both files that carry it; gave all twelve live orders
their open question and one next action, or said plainly that they have none;
struck SQ-12 and CA-1 against their landed artifacts; retired the false half of
the Concept2 wire-hardening acceptance; replaced two drifted line citations with
symbols and one stale count with its command; ticked three boxes whose PRs had
merged; and added one line to CLAUDE.md's post-merge ritual.

**What it deliberately did NOT build.** A CI gate grepping for orders in the
banned state, cut at the PM gate for three independent reasons: ten of
seventeen attribution hits are RULINGS, which close by being made, so it taxes
the common case to catch the rare one; its defining grep already missed four
live orders, so it would ship at roughly half recall reading as coverage — 5 of the 9 orders
known when it was proposed, and 5 of the 12 the finished sweep found (RF26); and
worst, **a green check retires the human grep, which is the only thing that has
ever found one of these.**

### THE ORDER TOKEN — coverage and gaps, 2026-09-09

**This is not a completeness claim, and it must never be quoted as one.** The
first sweep of this phase used `awk 'NR>=2109 && NR<=3680 && /James, 20/'` and
was confidently incomplete: it missed Wave D's **Stand the iOS simulator up as
a standing instrument** and **Hunt the e2e flakes**, Wave E's **Verification
code: hide it, say "verified"** (all three outside the range) and **Phase
PROTO**'s own order (undated). Re-run the commands rather than trusting this
prose. **Cite rows by NAME here, never by line — this file folds, and a line
number written into it is wrong by the next merge that touches anything above
it. This PR proved that on itself: an earlier draft of this very section cited
thirteen line numbers, and its own diff broke every one.**

- **Swept:** all of `ROADMAP.md`; `docs/` recursively including `docs/history/`;
  `.claude/` including both agent ledgers and `CLAUDE.md`; code comments under
  `app/`.
- **Found:** 12 live orders, 7 live decisions owed to James, ~19 distinct
  rulings-as-record, 14 discharged, and the bulk of `docs/history/**` historical.
- **NOT swept, and a branch-only order is invisible to this pass:**
  `.claude/worktrees/av` and `av-house` hold duplicate `ROADMAP.md` checkouts
  that were not diffed. **Partial:** `antagonist-ledger.md` (grepped only), the
  middle of `pm-ledger.md` (sampled), `DEVIATIONS.md` (grepped), and
  `docs/superpowers/**` spec bodies (grepped plus spot-read). **Not swept at
  all:** git history and PR history.
- **One unresolved orphan, deliberately not chased:**
  `docs/history/phase-ff.md:38`, "the erg confirmation row (James, one step at a
  time)" — `grep -n nudge ROADMAP.md` returns zero, so it has no live home,
  while that phase's status line says its walk passed.
