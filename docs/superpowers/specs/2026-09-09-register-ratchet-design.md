# Spec — Phase RR: the register may only go down

Status: DESIGN APPROVED by James 2026-09-09 (in-chat gate; he chose "stamp
everything now" over grandfathering, and "skill plus script, advisory" over a
blocking CI check). **Revision 2, 2026-09-09** — folds `/harden` lens 1's
twelve mechanism findings (`antagonist`, phase-open anchor pass) and the
`product-manager` phase-open gate's seven binding conditions. Rev 1's claims are
REPLACED where they were falsified, not annotated beneath a correction.

Register rows this PR files: none. Phase RR's ROADMAP section is a `<!-- phase -->`
section, so its rows are scheduled work governed by `/close-phase RR` — see §4.3.
Ledger home: `docs/history/phase-rr.md` at close.

Read this session: `ROADMAP.md` (whole), `.claude/skills/close-phase/SKILL.md`,
`scripts/ci-changes.sh`, `scripts/ci-changes.test.sh`, `.github/workflows/ci.yml`,
`app/package.json`, `package.json`, `CLAUDE.md`.

Every number below was measured at base `275c14b2` on branch
`phase-rr-register-ratchet`, with the command shown beside it.

---

## 1. What and why

Filing a roadmap row is free. Closing one is not. `CLAUDE.md`'s RF14 says
anything with a life after merge goes in the ROADMAP, and nothing anywhere says
when a row may DIE — so the register only grows. James, 2026-09-09: _"we need to
figure out how we can continue working without filling this register to death
with cruft. It's fucking impossible to close things out."_

**The trend, measured, and it is the real case for this phase.** One sample per
day of ROADMAP-touching merges on `main`, 2026-08-29 to 2026-09-09:

```
36 → 46 → 64 → 67 → 74 → 76 → 88 → 89 → 96 → 101 → 108 → 117
```

**+81 rows in 12 days, monotone, not one down day, +6.75 rows/day**, while
`ROADMAP.md` itself SHRANK by 2,625 lines over the same window
(`+8,360 −10,985`). Rev 1 of this spec led with "the file grew 384 lines in one
day", which is the one axis that is improving; the row count is the axis that
is not, and it is the one to argue.

This phase makes the register a **ratchet that can only go down**. A row must
say at filing time what would KILL it. A finding with no schedule goes to a
comment at the code site instead of the register.

**Nothing a rower sees changes. No stored number changes. No `app/` file is
touched.** The audience is agents and James.

### 1.1 The four rules, as James adopted them

1. **The ratchet.** A PR that files N register rows strikes N, or asks James
   for an explicit exemption.
2. **No row without a closing condition, written at filing time.**
3. **A finding defaults to the CODE, not the register.**
4. **Expire by default.** A row past its date is listed at the next phase close
   and struck unless defended.

**Rule 3 is what makes rule 1 payable, and they ship together (PM condition
1).** Measured: dead strikeable inventory is roughly 32 rows (§6.2) against
6.75 filings/day — **under five days of currency.** After that, rule 1 either
yields on every PR (a gate that always yields, which `CLAUDE.md`'s "spend
proportionally" rule forbids) or blocks real findings. Rule 3 covers the ~45%
of rows that name a code artifact and would alone have prevented three of the
five rows that triggered this phase. Rules 2 and 4 are the expensive half and
land last (§9).

### 1.2 Why expiry rides a date the row carries, not `git blame`

Rev 1 argued this from a blame-recency histogram whose tail bucket was
arithmetic rather than evidence: `git log --diff-filter=A -- ROADMAP.md` shows
the file was added **2026-07-27** (`77f3d657`), 44 days before the measurement,
so "none older than 60 days" could not have come out any other way. That
argument is withdrawn.

**The honest measurement uses an oracle that does not share the churn premise:**
compare blame's date for a row against the date the row STATES about itself,
over the 102 top-level bullets that carry one.

```
n=102   within 1 day: 57   2-7d: 7   8-30d: 37   >30d: 1
```

Blame is accurate to within a day for 56% of dated rows, and its 37 failures
are the completed-phase ledger rows that the 2026-08-28 rebalance rewrote in
bulk. **So blame is mostly right and fails on bulk-rewrite events** — which is
a better argument for a self-carried date than "blame is wrong", and one that
survives the file getting older.

The conclusion that killed blame-based expiry stands on its own: such a sweep
would have flagged 4 rows out of the file's 337 bullet lines and read as a gate
that works (RF21).

```bash
# No `date`: `date -j -f` is BSD-only and on the Linux runner it exits 1,
# leaving `now` empty and printing a CLEANER <=30d:337 >30d:0 at exit 0.
# 1789603200 = 2026-09-09T00:00:00Z, computed once and pinned.
git blame --line-porcelain 275c14b2 -- ROADMAP.md \
  | awk '/^author-time /{t=$2} /^\t/{if($0 ~ /^\t *- /) print t}' \
  | awk -v now=1789603200 '{d=int((now-$1)/86400);
      if(d<=30)a++; else b++} END{printf "<=30d:%d  >30d:%d\n",a,b}'
# <=30d:333  >30d:4
```

**No row in the file carries a MACHINE-READABLE death condition today.**
`grep -ci 'struck if'` returns 0. The narrow claim is the true one: one of the
two `closing condition` hits is a row ticked because _"That was this row's
stated closing condition"_, so the concept exists in prose and nothing can
parse it.

### 1.3 Filing dates ARE recoverable, and rev 1 was wrong to invent a disclaimer

Rev 1 said blame cannot date a row, therefore ~50 rows would be stamped
`filed 2026-09-09 (stamped)`. Blame measures LAST EDIT; the quantity `filed`
needs is FIRST APPEARANCE, and a different command measures it:

```bash
git log --reverse -S'<distinctive phrase from the row>' \
  --format='%ad %h' --date=short -- ROADMAP.md | head -1
# '401 route table is short four routes'  → 2026-09-05 f927ef4d
# 'A terminate-path SCREEN oracle'        → 2026-08-28 4a51217a
```

Six sampled register rows returned six dates. **Age is the evidence that
justifies striking a row**, so stamping everything with today's date would have
erased the very signal James is complaining about. §6.3 uses `-S` per row.

---

## 2. Invariants

Invariants, not mechanisms (RF27). §3 and §5 are the mechanism and may be
replaced without renegotiating these.

- **I1 — The register's row count never rises across a PR**, except by a
  recorded James exemption or a phase-close lift (§5.5). Both are named,
  neither is silent.
- **I2 — Every register row carries a filing date and a death condition** in a
  form a script can parse without judgement. **Debt-class rows are exempt** and
  carry neither (I8).
- **I3 — A register section contains only OPEN rows.** A row that closes leaves
  the register; its narrative moves to `docs/history/` and is never deleted.
- **I4 — A strike is an act with a receipt, never a default** (RF30). Expiry
  produces a list to defend.
- **I5 — A row whose subject is a place in the code is a comment at that place,
  unless it also has a schedule.** The membership test is "does this have a
  schedule", not "is this true".
- **I6 — Moving a row between classes is not a strike.** Every class count is
  reported, so a fall in one paid for by a rise in another is visible.
- **I7 — Every claim the gate makes is reproducible from tree content by a
  command.** Refs and tags are not tree content (§5.2, M12).
- **I8 — The absent-evidence class is never charged for and never expires.**
  A row saying "nobody has measured X" has no code site to become a comment and
  no date it can honestly carry. It is counted and reported, never payable by
  strike, never expired. See §3.1's `debt` class and §2.1.
- **I9 — Every section carries a class marker.** There is no default, because a
  default here fails open (§3.1).

### 2.1 Why I8 exists, and it is the condition that would have failed this phase

The PM gate's binding condition 3, and it would have FAILED the phase if
refused. Measured: **the majority of open register rows name no file, path or
code artifact** — the PM counted 47 of 85 and lens 2 recomputed the denominator
as 80, so the ratio is directional and the count comes from §8.1 rather than
from this spec (§3.4). Unambiguous either way: **11 of 11 rows in
`## Owed captures and walk items` need James at an erg.** A comment needs a site, and _"nobody has measured that a hand
verification on concept2.com sets the list's `verified`"_ has no site — the
producer is a human in a browser.

That is RF11's and RF24's class: the class that caught a 3.9x distance error
and a headline feature reaching zero of sixteen production rows. Both were
caught because somebody had written down "nobody has checked this." A ratchet
that charges a strike to write it down, and an expiry that kills it at the next
phase close, is pointed at the one row class this repo's history says must not
quietly die.

`ROADMAP.md`'s own head already says so of one of these sections: Phase TD
_"is deliberately not scheduled."_ Rev 1 put it inside the ratchet anyway and
asked 16 rows for a date the file forbids them to have.

---

## 3. The row grammar

### 3.1 Section classes, and no default in either direction

**Every section carries one of SEVEN literal markers on the line after its
heading, and the parser whitelists the exact strings.** `grep -c '<!--'` returns
0 at `275c14b2`. `ROADMAP.md` is formatted by nothing: lint-staged's globs are
`app/**/*.{ts,tsx}` and `app/**/*.{json,css,md,html}` (`package.json`), and
`app/package.json`'s `format` runs `prettier` from `app/`. **`app/.prettierignore`
DOES exist** — rev 2 claimed no such file existed anywhere, which was false; it
lists `dist coverage drizzle ios pnpm-lock.yaml playwright-report test-results
reports .stryker-tmp e2e/fixtures` and no markdown, so the conclusion stands on
the globs rather than on that file.

| Marker | Meaning | In the ratchet | Needs `dies` | Expires |
| --- | --- | --- | --- | --- |
| `<!-- register -->` | open work with no wave | yes | yes | yes |
| `<!-- debt -->` | the absent-evidence class (I8) | counted, never payable | no | no |
| `<!-- pinned -->` | decided not to fix; owes a receipt | no | no | no |
| `<!-- vision -->` | future product scope | no | no | no |
| `<!-- phase -->` | phase and wave sections; scheduled work | no | no | `/close-phase` |
| `<!-- ledger -->` | records of closed work and of contract | no | no | no |
| `<!-- container -->` | a heading that holds only other headings | no | no | no |

**An UNRECOGNISED marker counts as unmarked, and that is a distinct fix from
rev 2's.** Rev 2 guarded a section with *no* marker and said nothing about a
misspelled one, which is rev 1's fail-open default one layer down. Measured:
mistyping `<!-- register -->` as `<!-- regsiter -->` in a fixture makes that
section's rows leave the register **and** reports a fall of 3, with
`unmarked=0` and exit 0 — worse than no marker at all, because a fall pays for a
new row. So the seven strings are a whitelist and anything else is unmarked.

**Both refusals are exit 2, not exit 1** (§5.1): an unmarked or unrecognised
section, and a file with zero sections.

Assignments. Row counts are deliberately absent — the artifact is §8.1's script:

- `<!-- register -->`: Small, queued · Codebase-audit owners · Rides the next
  PR touching the connected surface · the say-which-number design pass ·
  Needs a decision from James · Icebox · The unlogged-session door ·
  **Tooling**
- `<!-- debt -->`: Phase TD · Owed captures and walk items
- `<!-- pinned -->`: Accepted, pinned, and not being fixed
- `<!-- vision -->`: After the strangers
- `<!-- phase -->`: the **13** `## Phase …` / `## Wave …` sections other than
  Phase TD — `grep -cE '^## (Phase|Wave)'` returns 14 and Phase TD is `debt`,
  so 14 was a double count
- `<!-- ledger -->`: Completed phases · Killed at the 2026-08-28 rebalance ·
  Active audit overlay · How this file is used · Locked decisions
- `<!-- container -->`: `# Ergomatic Roadmap` · `# The live slate`

**`## Tooling` was in no class in rev 2**, while two other places in that same
revision counted it as register — §3.4's "eight indented open bullets" is only
true with Tooling's five included, and §6.5's DECIDE breakdown lists "Tooling
4". Under I9, PR 2 as specified could not have made its own gate green. The
target is "every section carries a marker", not "PR 2 marks 32 sections".

**`## Active audit overlay` is a LEDGER, and rev 1 was about to delete a live
table out of it.** Rev 1 read it as "2 of 2 rows closed, so the section empties
and is archived" because its census counted bullets and both bullets are `- [x]`.
It also holds a **5-row table** — the Wave A-E overview, including Wave A, the
live slate's next wave — under a first line reading `**Status:** COMPLETE`.

**Icebox is inside the ratchet on purpose.** An exempt Icebox is evaded by
moving a row there instead of killing it. **`# After the strangers` is outside
it on purpose:** charging a debt strike to file a product idea trades the wrong
two things.

### 3.2 The stamp

```
· filed <YYYY-MM-DD> · dies <YYYY-MM-DD|vX.Y.Z> unless <clause>
```

`grep -c '· filed'` returns 0 at `275c14b2`, so the token is collision-free.
`·` is already house punctuation: 72 LINES carry one and there are 181
occurrences of ` · ` (`grep -o ' · ' | wc -l`) — rev 2 reported the line count as
an occurrence count.

**The stamp is a token-delimited REGION, not a line.** Rev 1 said "the row's last
line", which is false for **261** of the 314 top-level bullets: the file is
hand-wrapped near 80 columns (mean line length **73.5**), and rev 1's own
canonical example wrapped its own stamp onto a line carrying neither field.

**One fold rule, stated once, because rev 2 gave three.** A **row** is its
bullet line plus every following line until the next line matching `^ *- `, the
next heading, or end of file — **an internal blank line does NOT end a row, and
an indented sub-bullet DOES**, which resolves rev 2's contradiction between
"blank-separated block" (§3.2) and "an indented bullet is part of its parent"
(§3.4). Measured in register and debt sections: 5 rows carry an internal blank
line and 2 carry sub-bullets, and under rev 2's wording the stamp region
truncated on all 7 — fail-closed for `stamps` and fail-OPEN for `closed`.

- The stamp region begins at the first `· filed` in the folded row and runs to
  the end of it.
- **The clause contains no `·`** — the only available terminator, since ` · `
  appears mid-row 181 times.
- **On a row with sub-bullets, the stamp goes on the parent, above the first
  sub-bullet.** Named because rev 2 left it undefined for 2 real rows.

**Every field is validated, and rev 2 accepted three degenerate stamps.**
Measured against rev 2's grammar: a whitespace-only clause ACCEPTED,
`filed 0000-00-00` ACCEPTED, `dies 2026-13-01` ACCEPTED (shape only), and
`dies 2026-02-31` ACCEPTED. The clause is the only human-meaningful half of the
stamp — what would kill the row — so a stamp whose clause is one space is the
whole feature failing silently. Therefore:

- the clause must contain at least one non-space character;
- `filed` and `dies` dates are validated as REAL CALENDAR DATES by an
  `awk` days-in-month-plus-leap-year check, **never by `date`** (§5.2's
  portability finding), so `2026-02-31` and `2026-13-01` are both rejected;
- `filed` must not postdate `dies`.

The size marker stays inside the row body, before the stamp — 101 already exist
and this spec neither requires nor removes them.

```markdown
- [ ] **Nobody has measured that a hand verification sets the list's
      `verified`.** …evidence, receipt, what unblocks it… **S**
      · filed 2026-09-08 · dies 2026-10-08 unless James hand-verifies one
        log-dev row and appends the receipt to the research file
```

### 3.3 Tables are a first-class carrier, in four sections not one

Rev 1 said "one register section is a table today". Four register-marked
sections carry tables, and one is MIXED — bullets AND a table:

```bash
git show 275c14b2:ROADMAP.md \
  | awk '/^#{1,2} /{sec=$0} /^\|/{c[sec]++} END{for(s in c) print c[s], s}' | sort -rn
# 26 ## Rides the next PR touching the connected surface   (24 rows + header + rule)
# 13 ## Locked decisions
#  7 ## Active audit overlay — Codebase integrity
#  5 ## Needs a decision from James                        (3 rows, plus 3 bullets)
```

`## Needs a decision from James` holds three bullets AND a three-row table, one
of whose rows is `| **App-wide ambiguous_auth promotion** | **RULED (James,
2026-09-03): KEEP …` — **a closed row, in a table, inside a register section.**

So every gate handles both carriers, and §8.2 carries a table case for each
gate, not only for `stamps`.

- **Table row** = a `|`-leading line that is neither the header nor the `---`
  rule. The stamp lives in a trailing `Dies` column.
- **One register table is already malformed**: that section's header and two
  rows carry three columns while the `ambiguous_auth` row carries two. A
  `Dies`-as-last-cell parse would read that row's prose as its `Dies`. PR 4
  repairs the row before stamping it, and `stamps` reports a column-count
  mismatch rather than guessing.
- **The cost is real and stated:** the connected-surface table's rows run to
  2,853 characters, and adding a cell to 24 of them is a large edit for the
  benefit. PR 4 may instead convert that one section to bullets; the decision
  belongs to PR 4's own review, with the column-count defect above as evidence
  for conversion.

### 3.4 What counts as one row

- **Bullet sections:** a row is a bullet at column zero (`^- `). An indented
  bullet is part of its parent row and ends the parent's fold (§3.2). Eight
  indented open bullets exist in register sections today — three in Small,
  queued and five in Tooling, which is why Tooling's class assignment (§3.1)
  is load-bearing for this count. §6.4 dispositions each.
- **Table sections:** as §3.3.

**No open-row total appears in this spec.** Rev 2 stated "85 open rows" in
three places; it has since been computed as 80, 84 and 85 by three parties
using three defensible readings of which sections and which carriers count.
That is churn generator #3 — a transcribed census whose cells go stale or
disagree — so the number is replaced by §8.1's command everywhere it was used,
including in §6.5's DECIDE estimate.

Known limit, recorded in §7 rather than solved: splitting one row into a parent
plus five sub-bullets reads as one row.

### 3.5 Lifetime table

| Field | Minted | Changed by | Survives |
| --- | --- | --- | --- |
| `filed` | at the PR that files the row, recovered by `-S` for existing rows | never | everything; it is history |
| `dies` | at filing, by the filer | a defence at a phase close, or James; each rewrite states why | rewording, moving, reflow |
| class marker | at filing, by the section written into | a documented move, which is not a strike (I6) | — |
| the count | derived, never stored | nothing; recomputed from two trees | compaction |
| **the base ref** | **computed per run, never defaulted** | see §5.2 | **nothing — it does NOT survive a parallel session** |

Rev 1's table claimed the count "survives parallel sessions". It does not, and
§5.2 carries the demonstration.

---

## 4. Scope

### 4.1 In

`scripts/register.sh` + `scripts/register.test.sh` + fixtures; the `scripts`
job wiring; the six section markers and the grammar written into
`ROADMAP.md`'s "How this file is used"; `CLAUDE.md`'s four rules as RF14's
counterpart; `.claude/skills/register-gate/SKILL.md` mirrored to
`.agents/skills/`; and three edits to `/close-phase`'s own skill text — Phase 4
step 5's expiry defence, its stop-rule recount from three hand-backs to four
(§5.4), and a note that a class marker now sits at `start+1` inside every freeze
span (§8.3); the eviction; the stamp pass.

### 4.2 Out

- **No blocking CI gate. James chose advisory** (2026-09-09), and that is the
  whole reason — rev 1 attached a cost ("a red check would block real work at
  the wrong moment") that nobody measured, which is RF30's tell pointed at the
  road not taken. The `scripts` job's own comment says it runs in six seconds.
  His choice stands on his authority, not on an invented number.
- No change to phase or wave rows beyond marking their sections.
- No product code.

### 4.3 Phase RR's own rows

Its ROADMAP section is `<!-- phase -->`, so I1 does not reach its rows and no
strike is owed to file them. What it owes instead is `/close-phase RR`. §5.5
closes the channel this would otherwise open.

---

## 5. The mechanism

### 5.1 `scripts/register.sh`

Bash, alongside `scripts/ci-changes.sh` — the repo's precedent for a tested
shell gate. Reads `ROADMAP.md` from a git ref via `git show <ref>:ROADMAP.md`.

**Three exit codes, and the third is the one rev 2 was missing.** `ci-changes.sh`
prints its reason to stderr and reserves the answer channel; rev 2 collapsed a
real violation, an unreadable base and a guard death into a single `1`, so an
operator handed `exit 1` could not tell "the register rose" from "the script
never ran".

| Exit | Meaning |
| --- | --- |
| 0 | the gate passed |
| 1 | the gate FAILED on the thing it measures |
| 2 | **REFUSAL** — the gate could not run, and no result should be inferred |

| Subcommand | Prints | Exit |
| --- | --- | --- |
| `count [<ref>]` | every class tally plus `unmarked=<n>` with each unmarked section's name | 2 if any section is unmarked or unrecognised, or the file has zero sections; else 0 |
| `stamps [<ref>]` | register rows whose stamp is missing, malformed, whitespace-claused, calendar-invalid, or in a table row with a wrong column count | 1 if any, 2 on refusal, else 0 |
| `closed [<ref>]` | **candidate** closed rows in register and debt sections, both carriers | 1 if any, 2 on refusal, else 0 |
| `expired [<ref>] [--asof <date>]` | register rows past their `dies` | **2 on refusal**, else 0 — a list is not a failure (I4) |
| `ratchet [<base>]` | every class tally at base and head, the deltas, **and the identities of rows that left** | 1 if the register delta is positive, 2 on refusal, else 0 |

**Five refusals, each measured as a silent pass under rev 2:**

1. **The base cannot be resolved.** Rev 2 made `<base>` "optional only so the
   tests can inject a fixture repo's base", and that is what creates the hole:
   `BASE="${1:-$(git merge-base origin/main HEAD)}"` sets `BASE` to the EMPTY
   STRING when `origin/main` does not resolve, `: "${BASE:?}"` **does not fire
   on a set-but-empty variable**, and the reader falls through to the working
   tree — so base equals head. Measured in a throwaway repo with one row filed,
   none struck, `origin/main` deleted: `delta=0, exit 0`. This is the `?code=`
   shape exactly, and it fires in precisely the environments this design uses:
   §8's throwaway fixture repos have no `origin`, and the `scripts` job's
   `actions/checkout@v7` carries no `fetch-depth: 0`.
2. **`origin/main` is not an ancestor of HEAD** — the branch has not merged
   main, so the merge base is stale (§5.2's collision).
3. **The file has zero sections**, which is what an empty or deleted
   `ROADMAP.md` looks like. Measured: `register=0 … unmarked=0`, `count` exit 0,
   and `ratchet` reads `delta=-3` — **a deletion reported as credit for three
   strikes.** I9's guard cannot fire, because a file with no sections has no
   unmarked section.
4. **The head register count is 0 against a nonzero base** — the same floor from
   the other side.
5. **An unrecognised marker** (§3.1).

**`ratchet` reports IDENTITIES, not a scalar.** A base-minus-head set difference
over row titles, because arithmetic cannot tell a receipted strike from a row
lost in a merge conflict — measured: merging `origin/main` with `-X ours` drops
two of main's rows and reads as `delta=-1, exit 0`, i.e. credit. 122 of 179
merges in the last 14 days touched this file. Reporting identities also closes
§7's "a row rewritten wholesale keeps its `filed`" blind spot.

**`--asof` exists so expiry can be tested.** Without it every expiry test is
dated relative to the day it runs and cannot be written to go red (RF21).

**Numeric comparisons force `+0`; every derived variable is guarded with
`: "${VAR:?}"` AND with an explicit non-empty test**, since `:?` alone does not
catch the empty-string case that produced refusal 1. `/close-phase` Phase 0b
records the measured failure `+0` prevents: an unset variable in an `awk`
numeric filter evaluates to 0 and passes every row.

**Every count reads exactly one file at exactly one ref.** `grep -c` over two
files prints one line per file and never a sum.

### 5.2 Proof contract per gate

Per RF26. No wording in the script's output, a test title, the skill or a PR
body may exceed the fifth column — and §6.2's prose exceeded it in rev 2.

| Gate | Invariant | Observable | Deciding mutation | May claim — and no more |
| --- | --- | --- | --- | --- |
| `ratchet` | I1 | register tallies and row identities at base vs head | drop the ancestor check; then run §8.2's collision fixture | the register did not rise **against a merge base it proved it could resolve**; NOT that no row moved class, NOT that a row left deliberately rather than in a merge, NOT that every marker is one of the seven |
| `stamps` | I2 | stamp region, calendar validity, clause non-emptiness, table column count | delete a stamp; wrap one across lines; set `dies 2026-02-31`; blank the clause | every row **the script identified** carries a stamp **matching the shape with real dates and a non-empty clause**; NOT that the clause is a good death condition, NOT that it saw every row |
| `closed` | I3 | the curated vocabulary over row TITLES | add a closed row as a bullet, and again as a table row | rows **whose titles match the vocabulary**, as CANDIDATES; NOT that they are closed, NOT that no closed row remains |
| `expired` | I4 | `dies` vs `--asof`; version vs highest tag by `sort -V` | set a row's `dies` one day before `--asof` | these rows are past their date; NOT that they should be struck, NOT that no row is overdue when tags are unfetched |

**The base ref is the whole ratchet, and rev 1 never named it.** `grep -ci` over
rev 1 returned zero hits for `merge-base`, `origin/main`, `base branch` and
`rebase`, while its lifetime table claimed the count "survives parallel
sessions". Lens 1 built the exploit: two branches from one base, each striking
the SAME row and filing one in a DIFFERENT section, each reading delta 0 against
its own base — `MERGE CLEAN`, register 40 → **41**, two green ratchets.

**The prescription is `git merge-base origin/main HEAD` recomputed after the
`git merge origin/main` the agent briefing already mandates**, and lens 2
attacked it expecting it to charge main's growth to the branch. It does not:
branch files 1, main independently gains 2, unmerged → `delta=+1, exit 1`,
correct both pre- and post-merge. **The prescription holds; it is the missing
refusals (§5.1) that were the hole, not the formula.**

**Version expiry is weaker than a date and I7 says so.** Tags are refs, not tree
content: they can be deleted (v0.42.0 was deleted and re-cut in this repo), and
the `scripts` job's `actions/checkout@v7` carries neither `fetch-depth: 0` nor
tags, unlike the `changes` job which sets them because "the script diffs against
a merge base". So a version `dies` compares against the **highest existing tag
with `sort -V`** — greater-or-equal, never existence, since a skipped minor
would otherwise never expire — and prints `tags unfetched` rather than a false
clean. Whether a minor is ever skipped is **untested**: all 54 tags are semver
and `v0.1.0`…`v0.45.0` is contiguous. `sort -V` itself is fine on BSD and GNU.

**`date` is banned from this script, and rev 2's own §1.2 block proves why.**
`date -j -f` is BSD-only; on the Ubuntu runner it exits 1 with
`invalid option -- 'j'`, leaving `awk -v now=` empty, which prints
**`<=30d:337 >30d:0`** — a CLEANER-looking result than the true `333/4`, at exit
0. A gate that fails open into a tidier number is the worst available failure.
And the two platforms disagree on exactly the class §8.2 tests:
`date -j -f %Y-%m-%d 2026-02-31` rolls to 2026-03-03 and exits 0, while
`date -d 2026-02-31` rejects it — so a death date would silently shift three days
on macOS. All date validation and comparison is therefore pure `awk` with an
explicit days-in-month and leap-year table, and §1.2's block carries a portable
form.

```awk
function valid(d) {
  if (d !~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) return 0
  split(d, a, "-"); y = a[1]+0; m = a[2]+0; dd = a[3]+0
  if (m < 1 || m > 12 || dd < 1) return 0
  split("31 28 31 30 31 30 31 31 30 31 30 31", dm, " ")
  if (m == 2 && ((y%4 == 0 && y%100 != 0) || y%400 == 0)) dm[2] = 29
  return dd <= dm[m]
}
# measured: 2026-02-31 reject · 2026-13-01 reject · 2026-02-29 reject
#           0000-00-00 reject · 2028-02-29 VALID · 2026-10-08 VALID
```

### 5.3 `/register-gate`

**The trigger is SPLIT, because "did this PR file a register row" is judged by
the party under strike pressure and the only mechanical detector for it is
`ratchet` itself.** Rev 2 fired the whole skill on any filing, which is circular:
you must run the gate to learn the gate applies.

- **`register.sh ratchet` runs UNCONDITIONALLY on any `ROADMAP.md` diff.** It is
  arithmetic, it needs no judgement, and the `scripts` job's own comment puts it
  at six seconds. This is the half that must not be skippable.
- **The JUDGEMENT half — the four items below — runs when `ratchet` reports a
  filing, and at every phase close** (PM condition 7). Measured: 122 of 179
  merges in the 14 days to 2026-09-09 touched `ROADMAP.md` (68%, 8.7/day) while
  phase closes run about 2/day, and most of those 122 are ticks, corrections and
  phase rows that I1 exempts. A judgement dispatch on two-thirds of all merges
  is the reflex gate `CLAUDE.md` forbids; a six-second arithmetic check on them
  is not.

It runs `register.sh` for arithmetic and adds the judgements no script can make:

1. **The filing test (I5).** Name the file the row is about. If one exists, the
   row becomes a comment at that site — unless it states why a comment will not
   reach the next editor. **This is a coin flip stated as a fact in rev 1, and
   the counter-case is in `CLAUDE.md`:** RF18's comment named its own
   precondition (_"If cancel ever stops unmounting, this guard needs a
   `cancellingRef`"_) and was stepped over by exactly the caller it described,
   at the cost of PR #246. The judgement is real; its premise is not certain,
   and the skill says so rather than asserting it.
2. **Death versus trigger — OPEN, and it is James's to settle (§10 q1).**
   Rev 1 refused trigger-form rows. `ROADMAP.md`'s own head carries James,
   2026-09-08: _"a filed row needs either a TRIGGER, so it resurfaces when it
   starts to matter, or a PHASE, so it can be scheduled as one piece of work."_
   Until he rules, the skill reports a trigger-form `dies` as a **note, not a
   failure.**
3. **Evasion (I6).** A register fall paid for by a rise in any other class,
   named as such. It cannot see the phase-section channel; §5.5 closes that
   structurally instead.
4. **The expiry list**, for information at PR time and for disposition at a
   phase close.

Output is a verdict block for the PR body, plus the exemption ask where the
ratchet fails: what would be struck to pay for this row, and what is lost
either way. **The skill never grants an exemption.**

### 5.4 `/close-phase` Phase 4 step 5

Named precisely: `/close-phase` has Phases 0-4, and the freeze-anchor-recheck-
then-lift step is **Phase 4 step 5, "the lift gate"** — there is no "gate 5",
though the skill's own stop rule calls step 4 "gate 4". Step 5 gains one action
before the lift: run `register.sh expired`, then disposition each row as
**defended** (a reason and a new `dies`) or **struck** (receipt: the date that
passed, and this phase close).

**Who dispositions it, and the honest problem.** Step 5 sits AFTER step 4, the
tag hand-back the skill's own stop rule names as a point where control returns
to James. So a row only he could defend would die at a step he is not in.
Therefore: **the controller may defend any row and may strike only debt-exempt-
ineligible rows whose death condition it can show was met; every other strike
goes to him** (§10 q3). Rule 4's default is preserved without letting a
controller quietly delete his work.

**`/close-phase`'s own stop rule must be recounted in the same PR.** It
enumerates exactly "**Three things** end it before that, and each hands control
to James"; an expiry disposition whose strikes mostly go to him is a fourth.
A rule that counts has to be recounted, and PR 4 also updates that skill's
deterministic/heuristic list.

Load, stated: `expired` is consumed only as often as phases close, and
`ls docs/closeouts/` shows `/close-phase` has run **once, ever** (`close-MT.md`).
Rule 4's enforcement is therefore rarer than it sounds, on rows that by
definition belong to no phase — which is an argument for the trigger in §5.3,
not against expiry.

### 5.5 The phase-section channel, closed out loud

A row filed into one of the 14 `<!-- phase -->` sections costs no strike, and
`/close-phase` Phase 4 step 5 lifts `CARRY` rows into the register at close —
so a phase section is a free filing channel unless something says otherwise.
Rev 1 left this open and §4.3 relied on it approvingly.

**The rule: a lift at a phase close does not owe strikes, and I1 names it as
an exception.** A `CARRY` row is already-owed work being re-homed, not new
filing, and `/close-phase` already dispositions every one of them under a
controller that must justify each. But **every lifted row is stamped at the
lift** and `register-gate` runs at the close, so the rise is recorded rather
than invisible. If James prefers lifts to owe strikes, that is §10 q4.

One precedence note: `## Phase TD` is `<!-- debt -->` here and matches
`/close-phase`'s own anchor `^## Phase <X>( |$)`. **`/close-phase TD` must
refuse** — TD is a bucket, not a phase — and PR 2 adds that refusal beside the
existing zero-and-multiple-match refusals.

---

## 6. The migration

### 6.1 Dispositions, and who may strike

- **STRIKE** — reserved for I3's arithmetic evictions: a row already marked
  closed. **The pass may not strike an OPEN row on its own receipt.** RF30:
  _"Striking an item is a decision James does not get to make again."_ Rev 1
  let the pass author choose the bucket, which is the same authority wearing a
  different word.
- **STAMP** — `filed` from `-S` (§1.3), `dies` derivable from the row's own
  evidence.
- **DECIDE** — every open row whose death is not derivable, batched to James as
  **class defaults, not individual rulings** (§6.5).

### 6.2 The arithmetic first, and what it does NOT close

I3 evicts already-closed rows before any judgement is exercised. **PR 3 derives
its own numbers from §8.1 and reports them; every figure here is evidence the
win exists, not a target.**

Rev 1's regex counted 21 and **was a mirror of the number it produced (RF11)** —
anchored immediately after the bullet's `**`, while this file writes
dispositions mid-line. `ANSWERED` matched zero rows, because the file writes
`ASKED AND ANSWERED`. Rev 2 widened it and **over-corrected into the opposite
failure**: a blanket `[A-Z]{2,30}` pattern catches `TWO`, `THIRD,`,
`SECOND LESSON,`, `NOT`, `TIER B2`, `PWA`, `PR1.75` and the row identifiers
`RC-9(`, `RC-29`, `RC-38`, `AUD-002`, `AUD-006`, `AUD-012`.

**And the curated vocabulary still has measured FALSE POSITIVES — this is the
finding that could have cost a live row.** Matching it over a whole folded row
flags, inside register and debt sections:

| Row | Token matched | Why it is live |
| --- | --- | --- |
| **RC-14** (register table) | `DISCHARGED` | the row says **"NOT DISCHARGED BY IT"** — a HELD order of James's |
| C2 account injection (register table) | `RULED` | a mid-row ruling on a sub-question; the row is a live decision |
| Phase TD, free-row machine tiles | `RESOLVED` | the word is inside **`UNRESOLVED`** |
| RC-29 "still UNMEASURED" | `SHIPPED` | "§6 SHIPPED in Wave F PR 2 (#258)" describes a dependency |
| AUD-006 | `RULED` | three mid-row `RULED` on sub-parts |
| the `PM5` release-note row | `NO LONGER CARRIES A COUNT` | an OPEN row deliberately refusing a count |

Three distinct failure modes: **no word boundaries** (`UNRESOLVED` → `RESOLVED`),
**negated dispositions** (`NOT DISCHARGED`), and **mid-row dispositions of
sub-questions inside long open rows**. So the predicate is:

- matched over the row's **TITLE only** — a bullet's bolded opener, or a table
  row's first cell — never the whole folded row;
- with **word boundaries**, and a **negation guard** (`NOT`/`UN` immediately
  preceding);
- with **`- [ ]` as a hard OPEN override**, which alone kills the Phase TD and
  release-note false positives;
- reported as **CANDIDATES for hand-confirmation**, never as an authority.

The derivation command produces a candidate token list for a human to curate,
and its output is noise as well as signal:

```bash
git show <ref>:ROADMAP.md | grep -oE '^ *- (\*\*|~~)[A-Z][A-Z ()0-9,.-]{2,30}' \
  | sed -E 's/^ *- (\*\*|~~)//' | sort | uniq -c | sort -rn
```

The curated set: `[x]`, a `~~struck~~` title, `DONE`, `SHIPPED`, `CLOSED`,
`RESOLVED`, `STRUCK`, `DISCHARGED`, `DISPOSED`, `RULED`, `RULED KEEP`,
`MOVED OUT`, `ACCEPTED`, `AMENDED`, `ASKED AND ANSWERED`, and
`NO LONGER CARRIES A COUNT`. **`FILED` stays OUT** and goes to DECIDE: it
records a finding filed elsewhere, which reads as closed here and is judgement.

**What the eviction is, and §5.2 caps what PR 3's body may say about it.** Rev 2
directed that body to state "all ~32 rows are already marked closed" — a claim
`closed`'s own proof contract forbids and the table above falsifies. The
permitted sentence: **these rows' TITLES match the closed vocabulary, each was
confirmed by hand, and evicting them closes no open work.** The open population
is unchanged by this PR — the count comes from §8.1 at PR 3's own tree, not from
this spec. It is file hygiene against a register growing 6.75 rows/day, and
reporting it as debt closure would be this repo's own "compare 37 to 90"
failure.

Every evicted row's narrative moves to `docs/history/` under the phase that
owns it. **A move, not a delete**, and PR 3's review checks each is findable at
its new home.

### 6.3 Filing dates come from `-S`, per row

§1.3's command, per row, on a distinctive phrase. `filed <date> (stamped)` is
used only where the phrase is not distinctive or the row was reworded
wholesale — and unlike rev 1, that form is **in §3.2's grammar and has a §8.2
case**, rather than being a dialect the gate does not define.

### 6.4 `dies` spread, and the eight sub-bullets

Each `dies` is set from the row's own evidence — a version where the row names
a release, a date where it names a walk or a decision. Rows with neither go to
§6.5's class defaults rather than to a uniform +30 days, which would build one
mass-expiry cliff. The pass prints the resulting distribution so a cliff is
visible before it lands. The eight indented open bullets (§3.4) are
dispositioned here.

### 6.5 The DECIDE batch is a class question, not 37 row questions

Rev 1's §10 asked James whether "more than roughly a dozen" rows was acceptable
as one list. **The PM measured the floor at 37 and the realistic figure at
50-60**, from the open rows of which 3 name a version and 2 carry a `TRIGGER`
token, leaving by section — Owed captures 11 (all need him at an erg), Codebase-audit
owners 9 (the section's name is its problem), say-which-number 5 (its trigger
fired 2026-09-04 and it is still unopened), Phase TD 5, Tooling 4, Icebox 3.
Small, queued (25) and the connected table (21) are titled "rides the next PR",
which is a trigger by construction.

**So he is asked for one default per class, not one ruling per row** — §10 q2.
A default he chooses is his condition, not an invented one, so §6.1's refusal to
invent conditions is honoured. The three rows in `## Needs a decision from
James` stay individual.

### 6.6 Order

The class-default ruling is answered before PR 4 is written. A ruling can strike
a row, and stamping a row he is about to delete is wasted work — the ordering
`/close-phase` Phase 1 uses for the same reason.

---

## 7. What is deterministic, and what is not

Re-graded twice: after lens 1, then after lens 2 falsified three of those grades.

| Claim | Grade |
| --- | --- |
| the class tallies | **deterministic only with the seven-marker whitelist AND the zero-section floor.** Rev 2 graded this deterministic "because I9 forbids an unmarked section"; I9 cannot fire on an unrecognised marker or on an empty file, both measured as clean passes |
| the ratchet's comparison | deterministic **given a base it proved it could resolve** (§5.1's five refusals); the formula holds, the refusals were the hole |
| stamp shape, calendar validity, clause non-emptiness | deterministic over the rows the parser identifies |
| **closed markers** | **HEURISTIC**, and it has measured FALSE POSITIVES as well as false negatives (§6.2) |
| expiry against `--asof` | **deterministic only with the pure-`awk` calendar check.** With `date` it is platform-dependent: rev 2 graded it deterministic and its own §1.2 block fails open on Linux (§5.2) |
| expiry against a version | **HEURISTIC** — tags are mutable refs, absent under the `scripts` job's checkout, and violate I7 |
| whether a `dies` is a death or a trigger | judgement, and OPEN pending §10 q1 |
| whether a row belongs in the code (I5) | judgement, on a premise RF18 contradicts (§5.3) |
| a class fall paid for by another class's rise | judgement |

**Blind spots, stated because a gate that hides one is worse than no gate:**
a row split into a parent plus sub-bullets counts as one (§3.4); the
phase-section channel is closed by rule, not by the script (§5.5); a row
converted to a code comment and claimed as a strike is caught by nothing, and
§5.3 judgement 1 rewards it; and **whether `/register-gate` runs at all is
judged by the party under strike pressure** — the only mechanical detector for
"did this PR file a register row" is `ratchet` itself, so the trigger is
circular. §5.3 resolves that by making any `ROADMAP.md` diff run `ratchet`
unconditionally (the `scripts` job's own comment puts it at six seconds) while
the JUDGEMENT half stays on filings and phase closes.

The blind spot rev 2 listed and lens 2 closed — "a row rewritten wholesale keeps
its `filed`, and nothing detects it" — is now covered by `ratchet` reporting row
identities (§5.1).

## 8. Test plan

TDD: `scripts/register.test.sh` first, each case seen to fail for the right
reason before `register.sh` implements it. Cases needing a real ref use a
**throwaway `git init` repo**, the pattern `scripts/ci-changes.test.sh` already
uses for exactly this. Fixture ROADMAP files live under
`scripts/fixtures/register/` so a case cannot be invalidated by an unrelated
roadmap edit.

### 8.1 The census command

Pinned to `275c14b2`; drop the `git show` to census the tree you are on. It
counts BOTH carriers — the defect that produced §3.3 — and applies §6.2's
predicate: the curated vocabulary over the row's TITLE, with word boundaries, a
negation guard, and `- [ ]` as a hard OPEN override. **Its closed column is a
candidate count, not an authority** (§7 grades it heuristic); PR 3 confirms each
candidate by hand.

```bash
git show 275c14b2:ROADMAP.md | awk '
/^#{1,2} /{sec=$0}
/^ *- /{
  top   = ($0 ~ /^- /) ? "top" : "sub"
  # TITLE only: the bolded opener, never the row body -- matching the body
  # flags RC-14 on "NOT DISCHARGED BY IT" and Phase TD on "UNRESOLVED".
  title = $0; sub(/^ *- (\[[ x]\] *)?/, "", title)
  open_box = ($0 ~ /^ *- \[ \]/)                       # hard OPEN override
  closed = 0
  if ($0 ~ /^ *- \[x\]/ || $0 ~ /^ *- ~~/) closed = 1
  else if (!open_box && title ~ /(^|[^A-Z])(DONE|SHIPPED|CLOSED|RESOLVED|STRUCK|DISCHARGED|DISPOSED|RULED|MOVED OUT|ACCEPTED|AMENDED|ASKED AND ANSWERED|NO LONGER CARRIES A COUNT)([^A-Z]|$)/ \
            && title !~ /(NOT|UN)(-| )?(DONE|RESOLVED|DISCHARGED|CLOSED)/) closed = 1
  cnt[sec "|bullet|" top "|" (closed ? "closed" : "open")]++; secs[sec]=1
}
/^\|/{ cnt[sec "|table"]++; secs[sec]=1 }
END{ for (s in secs) printf "%-58s open:%3d closed:%3d sub:%3d table:%3d\n",
       substr(s,1,58), cnt[s"|bullet|top|open"], cnt[s"|bullet|top|closed"],
       cnt[s"|bullet|sub|open"], cnt[s"|table"] }
' | sort
```

### 8.2 Cases, each with the CODE mutation that makes it red

**A fixture flip is not a mutation.** Rev 2's table titled its column "mutation
that must make it fail" while nine of its twenty-two entries flipped the INPUT
("remove the strike", "add the marker", "correct the month"). Paired fixtures
are legitimate discrimination tests and are `ci-changes.test.sh`'s own method,
but a fixture flip proves the gate reads its input; it names no line of
production code as load-bearing. Every case therefore carries a **code**
mutation, and the fixture pair is the setup rather than the proof.

| Case | Code mutation that must make it fail |
| --- | --- |
| filing one row and striking one passes | make the comparison `>=` instead of `>` |
| filing one row and striking none fails | invert the comparison |
| **the two-branch same-row-strike collision fails** | **replace the recomputed merge base with the branch's own fork point** |
| a row added to a `<!-- phase -->` section is ignored | drop `phase` from the exempt class set |
| every class delta is reported | delete the per-class reporting loop |
| `ratchet` names the rows that LEFT | replace the identity diff with a scalar delta |
| **`ratchet` REFUSES when the base is unresolvable** | **restore `BASE="${1:-$(…)}"` with only `: "${BASE:?}"` guarding it** |
| **`ratchet` REFUSES when `origin/main` is not an ancestor** | delete the `--is-ancestor` check |
| **`count` REFUSES a file with zero sections** | delete the floor; an empty file reports clean |
| **`ratchet` REFUSES head=0 against a nonzero base** | delete the floor; a deleted file reads as credit |
| **`count` REFUSES an UNRECOGNISED marker** | widen the whitelist to any `<!-- … -->` |
| `count` refuses a section with no marker | drop the marker requirement |
| **`stamps` accepts a stamp WRAPPED across lines** | parse line-scoped instead of row-scoped |
| a row's fold survives an internal blank line | terminate the fold on a blank line |
| a row's fold ends at a sub-bullet | terminate the fold only on `^- ` |
| `stamps` rejects a whitespace-only clause | drop the non-empty-clause test |
| `stamps` rejects `dies 2026-02-31` and `2026-13-01` | replace the awk calendar check with a shape-only regex |
| `stamps` rejects `filed` after `dies` | delete the ordering test |
| `stamps` rejects a clause containing `·` | drop the terminator rule |
| `stamps` accepts `dies vX.Y.Z` | narrow the pattern to dates |
| `stamps` accepts the table carrier | delete table handling |
| `stamps` flags a table row with a wrong column count | trust the last cell regardless of arity |
| `closed` flags a closed BULLET | drop the bullet branch |
| **`closed` flags a closed TABLE ROW** | **bullet-anchor the predicate** |
| `closed` matches a mid-line disposition in a TITLE | re-anchor immediately after `**` |
| **`closed` does NOT flag `UNRESOLVED`** | **drop the word boundaries** |
| **`closed` does NOT flag "NOT DISCHARGED BY IT"** | **drop the negation guard** |
| **`closed` does NOT flag an open `- [ ]` row** | **drop the checkbox override** |
| **`closed` does NOT match the row BODY** | **match the folded row instead of the title** |
| `expired` lists a row one day past `--asof` | invert the comparison |
| `expired` compares versions with `sort -V`, not existence | switch to `git tag -l` existence |
| `expired` reports `tags unfetched` | delete the tag-availability probe |
| `expired` REFUSES rather than exiting 0 on a bad ref | restore the always-0 exit |
| every refusal exits 2, never 1 | collapse refusals into exit 1 |
| unset-variable guard | remove one `: "${VAR:?}"` and confirm the suite fails loudly |

**The collision case needs two preconditions rev 2 omitted, and without them it
is a green gate over the defect it exists to catch.** Measured: with two
branches alone, correct and mutant both report `delta=1, exit 1` after the
second branch merges main — **the mutation does not bite.** It bites only once
main carries a NONZERO register net between the shared base and the second
merge. So the fixture must (a) have the second branch run `git merge
origin/main`, and (b) include a third landed change that moved main's register
count. With those: correct `base=3 head=4 delta=1 exit 1`; mutant
`base=4 head=4 delta=0 exit 0`.

Cases marked in bold exist because a lens found the gate would otherwise have
shipped green over the defect it names. Two cases share one mutation site —
deleting class scoping fails both — so they yield one bit rather than two;
worth knowing, not a defect.

### 8.3 Gates

- **PR 2:** `bash -n scripts/register.sh` (every other step in the `scripts`
  job pairs a syntax check with its test file), `bash scripts/register.test.sh`,
  `pnpm lint`, `pnpm typecheck`. **Plus `register.sh count` against the REAL
  `ROADMAP.md`, asserting `unmarked=0` AND each of the seven class tallies** —
  `unmarked=0` alone is not enough, since a misspelled marker reports exactly
  that (§3.1). This is the PR-2 seam test: PR 2 writes 32 markers that every
  later gate reads, and without it the only coverage is fixtures.
  **No `app/src/` file is touched, so RF1's e2e obligation does not attach** —
  stated, not assumed. `scripts/` sits OUTSIDE `ci-changes.sh`'s docs-only
  allowlist, so PR 2 pays the full CI gate while PRs 1, 3 and 4 skip it.
- **PR 3:** `closed` and `count` clean; **every eviction candidate confirmed by
  hand against its row** (§6.2's false-positive table is the reason, and RC-14
  is named there as a HELD order the vocabulary flags); every evicted row
  findable at its new home; before/after tallies from §8.1 at PR 3's own tree.
- **PR 4:** `stamps` clean; the `dies` distribution printed.

**One seam this phase creates and does not gate, named rather than hidden:**
PR 2 inserts a marker line immediately after every heading, and
`/close-phase`'s freeze anchor is a verbatim `sed -n "${START},${END}p"`
starting at the heading — so a marker at `start+1` appears as a spurious
addition in any live freeze diff. Zero impact today (`ls docs/closeouts/` shows
`close-MT` only, and it is closed), and PR 2 states it in `/close-phase`'s own
skill text rather than leaving the next freeze to discover it.

**No CI job ever checks the real `ROADMAP.md` after PR 2** — the `scripts` job
runs fixture tests. That is the direct consequence of James choosing advisory,
and it is why §5.3 splits the trigger: `ratchet` runs unconditionally on any
`ROADMAP.md` diff (six seconds, per the `scripts` job's own comment), while the
judgement half runs on filings and phase closes.

## 9. PR shape

Four, re-slated on PM conditions 1 and 2. Rev 1's three put `dies` — the field
37+ rows cannot honestly carry until James rules — in the same PR as the two
rules that are free.

1. **This spec, plus Phase RR's ROADMAP section** (RF17). Docs only.
2. **The mechanism minus `dies`.** `register.sh count`/`closed`/`ratchet`, all
   32 section markers, rules 1 and 3 in `CLAUDE.md`, `/register-gate`,
   `/close-phase TD`'s refusal. **Rule 3 ships with rule 1 because it is what
   funds it** (§1.1).
3. **The eviction.** ~32 already-closed rows out of the register and into
   `docs/history/`; the malformed table row repaired. Its body states that this
   closes **zero open work** (§6.2).
4. **`dies`.** `stamps` and `expired`, `/close-phase` Phase 4 step 5's defence,
   and the stamp pass over every register row — after James answers §10.

**Gates.** Not TRIAD: no rower-visible number, no persisted product shape, no
auth — a wrong parse costs bookkeeping, not a lost record. **But PRs 3 and 4 DO
get a PM final gate**, and rev 1 was self-contradictory to claim otherwise:
`CLAUDE.md`'s PM trigger is _"when a change alters what the app DOES, what a
tester RECEIVES as a capability, **or the shape and sequence of planned work**"_
— and rev 1's own ROADMAP section cited that third clause to justify the
phase-open gate two sections after §9 denied it. PR 2 additionally returns the
final `CLAUDE.md` wording of the four rules, and `/register-gate`'s judgements
1 and 2, to the PM once: reviewing the rules is reviewing the product.

`/harden` ran on this spec (lens 1 complete; lens 2 on this revision). No
Gate 0 — nothing user-visible. No hardware walk. No tag: nothing reaches a
tester, and no `app/` file is touched.

---

## 10. For James — batched, and only what is his

1. **A trigger, or a death condition?** Your 2026-09-08 rule at the head of
   `ROADMAP.md` says a filed row needs _"either a TRIGGER … or a PHASE."_ Rule 2
   as drafted refuses trigger-form rows. These cannot both stand. Note that
   Phase OD **falsified the dates remedy one day before this design**: Wave D's
   "hunt the e2e flakes" row had an ACTIVE trigger that had already FIRED and
   sat 20 days, and OD's replacement rule — schedule an order's OPEN QUESTION
   before the order — went 4-for-4. `## The "say which number this is" design
   pass` is a live demonstration: fired trigger, five days, still unopened, and
   a `dies` date would not have moved it either. So the honest options are: a
   `dies` date IN ADDITION to a trigger; or OD's open-question rule instead of
   `dies` for the rows that have one.
2. **Class defaults instead of 37+ rulings.** One default each for the
   hardware-owed rows, the "rides the next PR" class, and the ownerless audit
   rows, applied by PR 4 (§6.5).
3. **May a controller strike an open row at a phase close?** §5.4 says no
   without you; rule 4's "struck unless defended" says yes. Under I3 a struck
   row's narrative is in `docs/history/` and re-filing it costs a strike, so a
   wrongly-expired row cannot come back without payment.
4. **Does a phase-close lift owe strikes?** §5.5 says no and names the
   exception in I1. Saying yes closes the last free filing channel; saying no
   keeps I1 honest but leaves the register able to rise at a close.
5. **RF29 versus rule 3.** Your 2026-09-04 ruling: _"When a change makes code
   unreachable … the same PR adds a ROADMAP row naming what is dead."_ Rule 3
   sends code-site findings to a comment. Two of your rulings in direct
   tension; which wins.
6. **How is an exemption recorded?** The PR body only, or a line in
   `ROADMAP.md` so the ceiling's history is readable in the file (RF14 argues
   the latter).
7. **Priority.** The PM's ruling: PR 2 does not displace Wave A's first item —
   an **S** research task whose result may shrink an **L** wave to the front
   door alone — and both are this week. Its ledger adds: _"Two days running now,
   a process phase has been slated ahead of that S. The third time, say no."_
   Your call whether RR runs before it.
