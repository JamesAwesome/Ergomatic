# close-phase PS — worklist

Frozen at `708bfa8d` (main, 2026-09-19). Span: ROADMAP.md 481..754, terminator
`## Wave A — The front door`. Span text: `close-PS.span.txt`.

Enumeration: **4 bullets in span, all ticked checkboxes, zero open.** Pass 2
returns six out-of-span mentions, all descriptive: Wave C's test-results row
(which OWNS the question PR 2's row left with no owner — whether a test point
whose log was deleted should say so), two "Lifted out of Phase PS" stamps on
the rows carried by #481, two prose references, and Phase 6J's ledger row.

**The archive is `docs/history/phase-ps-career-stats.md`.**
`docs/history/phase-ps.md` already exists — the 6J-era sketch archived on
2026-08-28, headed as kept verbatim — and is not overwritten; it gains a
pointer to the new file.

**Deterministic:** span, pass 1, pass 2, DONE-against-tree, CI gate, anchor diff.
**Heuristic:** pass 3 (recall bounded by a word list I invented) — and on this
freeze it was run only where a row named a defect that could live elsewhere.
**Heuristic with a durable counter:** the pull-in cap. No pull-ins.

Key is the SLUG. Line numbers are "as of 708bfa8d" convenience only.

**Closed together with Phases MT and DE as ONE doc-class PR (James, 2026-09-19):** one
antagonist exit pass and one PM close gate cover all three. No BUILD row, no
DECIDE row and no tag hand-back remain in any of them — every deliverable is
already in a released tag.

## Rows

```
SLUG                  | DISP  | title (first clause)                              | status | receipt
pr0-spec-dba          | DONE  | PR 0 — the spec, ROADMAP section, DBA agent       | closed | #411 3137fb25, v0.46.0
pr1-totals            | DONE  | PR 1 (TRIAD) — career stats on You                | closed | #417 f69871cb, v0.46.0
pr2-charts            | DONE  | PR 2 — the remaining charts, the hero's chevron   | closed | #424 30fd5cc0, v0.47.0
c2-totals-work-or-rest| DONE  | Concept2 season/lifetime totals: work or work+rest| closed | answered informationally 2026-09-19 from James's log-dev season page: tile 91,175 vs 79,025 summed over its 26 listed rows. INFERENCE that the 12,150 m is rest. Changes no number here, by ruling
stats-rows-cursor     | CARRY | GET /api/stats/rows grows a cursor at 5,000 rows  | lifted | #481 -> "Small, queued", dies 2027-09-12 unchanged
history-list-steps    | CARRY | The history LIST has no `steps` tier              | lifted | #481 -> "Small, queued", dies 2026-10-12 unchanged
deleted-test-point    | CARRY | no surface says a test point outlives its log     | lifted | owned by Wave C PR 2 ("A rower can remove a bogus test result"), TRIAD
```

## Exit criteria (spec `docs/superpowers/specs/2026-09-12-career-stats-design.md` §10)

1. Gates and mutations in the PR body — #417's body. MET.
2. The Concept2 grep returns nothing. MET (re-run 2026-09-19 by a validation pass; exit 1).
3. DBA verdict with 1k / 10k / 100k numbers and a pagination ruling — #417's body;
   scripts in `docs/superpowers/research/2026-09-12-stats-rows/`. MET.
4. Gate 0 approved before PR 1's first implementation commit. MET 2026-09-12.
5. Totals at ≥ 1 row; charts at ≥ 2 points; empty states. MET per PR; test green rests on CI. INFERRED for the CI half.
6. **The eyeball oracle. MET WITH STATED LIMITS, 2026-09-19.** LIFETIME 128,660 m here; Concept2's
   lifetime not read, inferred equal to its season (all 26 results fall in it).
   THIS SEASON 128,660 m / 9:27:00 / 28 sessions (26 machine) here against
   91,175 m / 7:33:09.1 / 26 results on `log-dev.concept2.com`. Gap explained:
   ~49,635 m never sent, less 12,150 m by which Concept2's tile exceeds its own
   listed scores. Exact agreements: this week 24,507 m on both sides row for
   row; both avg-per-day figures divide by 142 days (906 / 642).
   **The limits, from both close gates:** (a) the row-for-row agreement is a
   ROUND TRIP, not a measurement — `mapping.ts`'s `postedMeters` and
   `domain/stats/rowContribution.ts` both read `row.machineWorkMeters`; (b)
   Concept2's LIFETIME was never read, and on a sandbox account holding only
   what this app posted it could not have disagreed; (c) 49,635 is
   128,660 − 79,025 by construction — what supports "never sent" is by WEEK
   (the app's week of 17 Aug, 24,838 m, against 935 m on Concept2), not by
   row; (d) the 12,150 m rest reading is INFERRED and UNTESTED — the posted
   `rest_distance` was never summed over those 26 rows; (e) TIME (1:53:51
   apart) and COUNT (26 machine sessions against 26 results, a coincidence —
   the Concept2 list holds development test posts) are unexplained; (f) it ran
   against the SANDBOX, which is where production sends today, and owes ONE
   re-run after Wave E's exit moves production to the live logbook. **The one
   genuinely external agreement is the 142-day divisor.**
7. The reference fixture agrees with the canvas — `56,752` in
   `app/e2e/stats.spec.ts`; the hero is one control named `Stats`. MET.

## Gates, 2026-09-19

PM close gate: **PASS WITH CONDITIONS** — record the residual as unattributed
and name the 26/26 coincidence; say the check ran against the sandbox and owes
a re-run. Both met. It accepted the inferred Concept2 LIFETIME rather than
spend James's turn. Antagonist exit pass: **the phase HOLDS; criterion 6 is
MET WITH STATED LIMITS, not MET.** It held that the sandbox does NOT void the
criterion (`app/server/index.ts` defaults `C2_BASE_URL` to log-dev), re-ran
criterion 2's grep at this head (exit 1), and could not establish whether
Concept2's season tile sums `rest_distance`.
