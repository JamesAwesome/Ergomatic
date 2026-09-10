---
name: register-gate
description: Run the ROADMAP register ratchet on a PR — the arithmetic from scripts/register.sh, plus the judgements no script can make. Use when a PR touches ROADMAP.md, and at every phase close. Not for fast-path changes, which file nothing.
---

# register-gate

Filing a roadmap row is free and closing one is not, so the register only
grows: +81 rows in the 12 days to 2026-09-09, monotone, not one down day,
+6.75/day, while `ROADMAP.md` itself SHRANK by 2,625 lines. The line count is
the axis that is improving. The row count is the one that is not.

Your output is a verdict block for the PR body. **You never grant an
exemption** — only James does, and the block says what he would be granting.

## The trigger is SPLIT, and that is deliberate

"Did this PR file a register row" is judged by the party under strike
pressure, and the only mechanical detector for it is `ratchet` itself. So:

- **The arithmetic runs UNCONDITIONALLY on any `ROADMAP.md` diff.** It needs
  no judgement and the `scripts` job's own comment puts it at six seconds.
  This is the half that must not be skippable.
- **The judgement half — everything below the arithmetic — runs when
  `ratchet` reports a filing, and at every phase close.** 122 of 179 merges in
  the fortnight to 2026-09-09 touched `ROADMAP.md` (68%, 8.7/day) and most are
  ticks, corrections and phase rows the ratchet exempts. A judgement dispatch
  on two-thirds of all merges is the reflex gate CLAUDE.md forbids.

## 1. The arithmetic

Merge main first — the gate refuses an unmerged branch on purpose, because two
branches from one base can each strike the SAME row, each read delta 0 against
their own fork point, both go green, and the register rises anyway.

```bash
git fetch -q origin && git merge --no-edit origin/main
bash scripts/register.sh ratchet
```

Read the exit code, never the text alone:

| Exit | Means | Do |
| --- | --- | --- |
| 0 | the register did not rise | record the tallies in the PR body and go to step 2 |
| 1 | the register ROSE | strike, or write the exemption ask |
| 2 | **REFUSAL — the gate did not run** | fix what it names. Never report a refusal as a pass, and never infer a result from one |

**One refusal is expected and self-resolving:** a base that predates Phase RR
PR 2 carries no class markers, so parsing it refuses with a list of 33
unmarked sections. Merge main and re-run. **Read the section names first: if
they are ones YOUR branch added, merging main will not help — the refusal
names which tree it read for exactly this reason.** The gate could not measure its own
introducing PR either, and that is the bootstrap rather than a bug — the
alternative, treating an unmarked section as some default class, is the
fail-open that I9 exists to forbid.

`ratchet` names the rows that LEFT and ENTERED rather than printing a scalar,
because arithmetic cannot tell a receipted strike from a row lost in a merge:
merging with `-X ours` drops rows and reads as credit. **Check that every row
it says LEFT is one you meant to strike.**

Then `bash scripts/register.sh closed` for rows that have finished and not yet
left the register. Its output is CANDIDATES for hand confirmation — the
vocabulary has measured false positives — a row reading "AMENDED", whose own
facts were corrected rather than closed, and one that says it "NO LONGER
CARRIES A COUNT" precisely because it is open. Both tokens were dropped from
the vocabulary on that evidence. Confirm each candidate against its row before
acting, and never quote the count as debt closed.

The reverse also happens and the script cannot see it: a table row's
disposition often sits in the SECOND cell while the predicate reads the first,
so `closed` misses it. Hand-scan register tables as well as running this.

## 2. The judgements

### a. The filing test — does this belong in the CODE?

Name the file the row is about. If one exists, the row becomes a comment at
that site rather than a register row, unless it also has a schedule. The
membership test is "does this have a schedule", not "is this true".

**State the counter-case rather than asserting the rule.** CLAUDE.md's RF18 is
a comment that named its own precondition — _"If cancel ever stops unmounting,
this guard needs a `cancellingRef`"_ — and was stepped over by exactly the
caller it described, at the cost of PR #246. A comment reaches the next editor
of that file. It does not reach someone who never opens it.

### b. Death versus trigger — report, do not fail

A `dies` written as a trigger ("the next phase that touches X") is a **note,
not a failure**, until James rules. His 2026-09-08 rule at the head of
`ROADMAP.md` says a filed row needs "either a TRIGGER … or a PHASE"; the
ratchet's rule 2 as drafted refuses trigger-form rows. Both cannot stand, and
it is his to settle.

### c. Evasion

A register fall paid for by a rise in another class is not a strike (I6).
`ratchet` prints every class at base and head for this reason — read them all,
and name any fall that is really a move.

It cannot see the phase-section channel. A row filed into a `<!-- phase -->`
section costs nothing; that is closed by rule instead: a phase-close LIFT owes
no strike, but every lifted row is stamped at the lift and this gate runs at
the close, so the rise is recorded rather than invisible.

### d. The expiry list

`register.sh expired` arrives with `dies` in PR 4 and currently REFUSES with
exit 2 saying so. Until then there is no expiry list, and this gate says that
plainly rather than reporting an empty one.

## 3. The verdict block

```markdown
**Register gate.** <base> -> <head> register rows (<delta>).
- Left: <titles, or "none">
- Entered: <titles, or "none">
- Closed candidates still in the register: <n> (hand-confirmed: <n>)
- Filing test: <row> -> <comment site, or why a comment will not reach>
- Exemption asked of James: <what would be struck to pay for this row, and
  what is lost either way — or "none">
```

## Not for

Fast-path changes. They have no spec, no task brief, and by their own criteria
cannot alter what the product does — so there is nothing to file and nothing
to judge.
