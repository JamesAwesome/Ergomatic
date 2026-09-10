# Fixture Roadmap
<!-- container -->

## How this file is used
<!-- ledger -->

Prose only. This section carries no rows at all.

## Small, queued
<!-- register -->

- [ ] **A live row that names no code site.** Its body mentions RESOLVED in
      passing, and a body word must never close a row.
- **A row whose bolded title wraps across the eighty-column margin
  before it says CLOSED.** Body prose. Not a checkbox row, so the hard OPEN
  override cannot mask the wrapped-title parse.
- [ ] **RESOLVED in principle, still open in fact.** Only the `- [ ]` hard
      OPEN override keeps this row out of the closed candidates.
- [ ] **UNRESOLVED: the free-row tiles.** The word RESOLVED is inside
      UNRESOLVED and must not match.
- [x] **DONE — a closed bullet.** Its narrative.
- **The 401 route table — RESOLVED at review.** A mid-title disposition.
- **RC-14 — NOT DISCHARGED BY IT.** A held order of James's.
- **AMENDED 2026-09-10: this row's own facts were corrected.** An amendment
  is not a disposition, and both real matches were live rows.
- **This row NO LONGER CARRIES A COUNT, on purpose.** It is open and refusing
  to carry one; it has no checkbox, so the OPEN override cannot reach it.
- **ACCEPTED (2026-09-10): a cost taken deliberately.** Still a disposition.
- **UNSHIPPED, and still owed.** Only a word boundary saves this one; the
  negation guard does not cover SHIPPED.
- **A title an editor reflow split with a blank line

  before it was CLOSED.** Body prose.
- **A row with a clean title.** Its body says the sub-question was RULED in
  August, which is a disposition of a sub-part, not of this row.
  - [ ] **An indented sub-bullet.** Part of its parent, never its own row.

Two bullets inside a fence, which are not rows:

```bash
grep -n 'x' ROADMAP.md
- [ ] not a row, because it is fenced
- [x] DONE — also not a row, because it is fenced
```

## Rides the next PR touching the connected surface
<!-- register -->

| Row | Disposition |
| --- | --- |
| **A live table row** | open work |
| **RULED KEEP — the collision window stays** | closed, in a table |
| **C2 account injection** | a live decision, though a sub-question was RULED |

## A door whose criteria are all ticked
<!-- register -->

- [x] **DONE — the first criterion.** Approved and shipped.
- [x] **CLOSED — the second criterion.** Proven on hardware.

## Owed captures and walk items
<!-- debt -->

- [ ] **Nobody has measured X.** No code site exists; the producer is a human.
- [x] **DONE — an absent-evidence row that was finally measured.** Debt is
      exempt from the ratchet, not from housekeeping.

## A debt bucket that was finally emptied
<!-- debt -->

- [x] **DONE — the last absent-evidence row here was measured.** Finished.

## Accepted, pinned, and not being fixed
<!-- pinned -->

- **A pinned row.** Decided not to fix; owes a receipt.

## After the strangers
<!-- vision -->

- **A future product idea.** Outside the ratchet on purpose.

## Phase ZZ — a phase section
<!-- phase -->

- [ ] **Scheduled work.** Exempt from I1.
- [x] **DONE — a phase task.** Closed, and outside `closed`'s scope.

## Completed phases
<!-- ledger -->

- **Phase YY** — closed · [detail](docs/history/phase-yy.md)
