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
git blame --line-porcelain 275c14b2 -- ROADMAP.md \
  | awk '/^author-time /{t=$2} /^\t/{if($0 ~ /^\t *- /) print t}' \
  | awk -v now=$(date -j -f %Y-%m-%d 2026-09-09 +%s) '{d=int((now-$1)/86400);
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
refused. Measured: **47 of 85 open register rows name no file, path or code
artifact**, and 11 of 11 rows in `## Owed captures and walk items` need James
at an erg. A comment needs a site, and _"nobody has measured that a hand
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

### 3.1 Section classes, and there is no default

**Every section carries a marker on the line after its heading.** `grep -c
'<!--'` returns 0 at `275c14b2`, and `ROADMAP.md` is formatted by nothing —
lint-staged's globs are `app/**/*.{ts,tsx}` and `app/**/*.{json,css,md,html}`
(`package.json`), `app/package.json`'s `format` scripts run `prettier` from
`app/`, and no `.prettierignore` exists anywhere in the tree — so nothing
reflows a marker or a stamp.

| Marker | Meaning | In the ratchet | Needs `dies` | Expires |
| --- | --- | --- | --- | --- |
| `<!-- register -->` | open work with no wave | yes | yes | yes |
| `<!-- debt -->` | the absent-evidence class (I8) | counted, never payable | no | no |
| `<!-- pinned -->` | decided not to fix; owes a receipt | no | no | no |
| `<!-- vision -->` | future product scope | no | no | no |
| `<!-- phase -->` | phase and wave sections; scheduled work | no | no | `/close-phase` |
| `<!-- ledger -->` | records of closed work and of contract | no | no | no |

**There is no unmarked class, and that is the fix for a fail-open default.**
Rev 1 made unmarked mean exempt, in a design that cites `scripts/ci-changes.sh`
as its precedent — whose defining property is the opposite: per `CLAUDE.md`,
_"every uncertainty (bad sha, empty diff, unrecognised path, the script itself
failing) resolves to running them."_ Under rev 1, a register section that lost
its marker would silently leave the count, and the ratchet would report a FALL
that pays for a new row. So: `count` prints `unmarked=<n>` with the section
names, and **any unmarked section fails `count` and `ratchet`.** PR 2 marks all
32 sections; a new section without a marker fails the gate on its first run.

Assignments. Row counts are deliberately absent — the artifact is §8.1's
script, not a transcription of its output:

- `<!-- register -->`: Small, queued · Codebase-audit owners · Rides the next
  PR touching the connected surface · the say-which-number design pass ·
  Needs a decision from James · Icebox · The unlogged-session door
- `<!-- debt -->`: Phase TD · Owed captures and walk items
- `<!-- pinned -->`: Accepted, pinned and not being fixed
- `<!-- vision -->`: After the strangers
- `<!-- phase -->`: all 14 `## Phase …` and `## Wave …` sections
  (`grep -cE '^## (Phase|Wave)'` → 14)
- `<!-- ledger -->`: Completed phases · Killed at the 2026-08-28 rebalance ·
  **Active audit overlay** · How this file is used · Locked decisions

**`## Active audit overlay` is a LEDGER, and rev 1 was about to delete a live
table out of it.** Rev 1 read it as "2 of 2 rows closed, so the section empties
and is archived", because §8.1's census counts bullets and both its bullets are
`- [x]`. It also holds a **5-row table** — the Wave A-E overview, including
Wave A, the live slate's next wave — and the section's own first line reads
`**Status:** COMPLETE`. Archiving it would have deleted the wave table.

**Icebox is inside the ratchet on purpose.** An exempt Icebox is evaded by
moving a row there instead of killing it. **`# After the strangers` is outside
it on purpose:** charging a debt strike to file a product idea trades the wrong
two things.

### 3.2 The stamp

```
· filed <YYYY-MM-DD> · dies <YYYY-MM-DD|vX.Y.Z> unless <clause>
```

`grep -c '· filed'` returns 0 at `275c14b2` and `·` is already house
punctuation (`grep -c '·'` returns 72), so the token is collision-free.

**The stamp is a token-delimited REGION, not a line.** Rev 1 said "the stamp is
the row's last line", which is false for 262 of the 314 top-level bullets: the
file is hand-wrapped near 80 columns (mean line length 71.5), and **rev 1's own
canonical example wrapped its own stamp**, leaving a last line carrying neither
`filed` nor `dies`. So:

- a **row** is a bullet line plus every following line up to the next bullet,
  heading or blank-separated block — the parser folds it into one logical line
  before matching;
- the stamp region begins at the first `· filed` in the row and runs to the end
  of the row;
- **the clause contains no `·`**, because ` · ` already appears 71 times
  mid-row in this file and is the only available terminator.

```markdown
- [ ] **Nobody has measured that a hand verification sets the list's
      `verified`.** …evidence, receipt, what unblocks it… **S**
      · filed 2026-09-08 · dies 2026-10-08 unless James hand-verifies one
        log-dev row and appends the receipt to the research file
```

The size marker stays inside the row body, before the stamp — 101 already exist
and this spec neither requires nor removes them.

`dies` takes a date or a version tag; §5.2 states what a version comparison can
and cannot prove.

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
  bullet is part of its parent row. Eight indented open bullets exist in
  register sections today; §6.4 dispositions each as part of its parent or
  promoted.
- **Table sections:** as §3.3.

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
`.agents/skills/`; `/close-phase` Phase 4 step 5's expiry defence; the
eviction; the stamp pass.

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
shell gate. Reads `ROADMAP.md` from a git ref via `git show <ref>:ROADMAP.md`,
or the working tree when given none, so one code path counts both sides.

| Subcommand | Prints | Exit |
| --- | --- | --- |
| `count [<ref>]` | `register= debt= pinned= vision= phase= ledger= unmarked=` plus any unmarked section's name | 1 if any section is unmarked, else 0 |
| `stamps [<ref>]` | register rows whose stamp is missing or malformed, and table rows whose column count is wrong | 1 if any, else 0 |
| `closed [<ref>]` | **candidate** closed rows inside register or debt sections, both carriers | 1 if any, else 0 |
| `expired [<ref>] [--asof <date>]` | register rows past their `dies` | 0 always; a list is not a failure (I4) |
| `ratchet [<base>]` | every class count at base and head, with deltas | 1 if the register delta is positive, else 0 |

Four details, each earned:

- **`ratchet` computes its own base and never accepts a branch name as one.**
  See §5.2. `<base>` is optional only so the tests can inject a fixture repo's
  base; in real use it is computed.
- **`--asof` exists so expiry can be tested.** Without it every expiry test is
  dated relative to the day it runs, and cannot be written to go red at all
  (RF21).
- **Numeric comparisons force `+0` and every derived variable is guarded with
  `: "${VAR:?}"`.** `/close-phase` Phase 0b records the measured failure: an
  unset variable in an `awk` numeric filter evaluates to 0 and passes every row.
- **Every count reads exactly one file at exactly one ref.** `grep -c` over two
  files prints one line per file and never a sum.

### 5.2 Proof contract per gate

Per RF26. No wording in the script's output, a test title, the skill or a PR
body may exceed the fifth column.

| Gate | Invariant | Observable | Deciding mutation | May claim — and no more |
| --- | --- | --- | --- | --- |
| `ratchet` | I1 | register count at computed base vs head | two branches from one base, each striking the SAME row and filing one in a different section | the count did not rise **against the recomputed merge base**; NOT that no row was smuggled in as pinned, vision or phase |
| `stamps` | I2 | stamp region and table column count | delete a stamp; wrap a stamp across lines; corrupt `dies` to `2026-13-01`; drop a table column | every row **the script identified as a register row** carries a well-formed stamp; NOT that any `dies` clause is a good one, and NOT that it saw every row (§7) |
| `closed` | I3 | closed-marker vocabulary, both carriers | add a closed row as a bullet, and again as a table row | no row **matching the vocabulary** sits in a **marked** register or debt section; NOT that no closed row remains |
| `expired` | I4 | `dies` vs `--asof`; version vs highest existing tag | set a row's `dies` one day before `--asof` | these rows are past their date; NOT that they should be struck, and NOT that no row is overdue when tags are unfetched |

**The base ref is the whole ratchet, and rev 1 never named it.** `grep -ci` over
rev 1 returned zero hits for `merge-base`, `origin/main`, `base branch` and
`rebase`. Lens 1 built the exploit in a throwaway repo: two branches from one
base, each striking the **same** row and filing one row in a **different**
section, each reading a net delta of 0 against its own base — `MERGE CLEAN`,
register 40 → **41**, two green ratchets. Adjacent edits conflict; separated
ones do not, and this file has 32 sections. `<base> = origin/main` fails the
other way: a branch cut before main gained rows reads a negative delta and
passes having struck nothing.

**The only sound value is `git merge-base origin/main HEAD`, recomputed after
the `git merge origin/main` the agent briefing already mandates before a ready
comment.** Against post-merge main the exploit reads +1 and goes red.

**Version expiry is weaker than a date and I7 says so.** Tags are refs, not
tree content: they can be deleted (v0.42.0 was deleted and re-cut in this
repo), and the `scripts` job's `actions/checkout@v7` step carries neither
`fetch-depth: 0` nor tags, unlike the `changes` job which sets them explicitly
because "the script diffs against a merge base". So a version `dies` compares
against the **highest existing tag with `sort -V`** — greater-or-equal, never
existence, since a skipped minor would otherwise never expire — and the gate
prints `tags unfetched` rather than a false clean when `git tag -l` is empty.
Whether a minor is ever skipped is **untested**: `v0.1.0`…`v0.45.0` is
contiguous today.

### 5.3 `/register-gate`

**It fires on a PR that FILES a register row, and at every phase close — not on
every `ROADMAP.md` touch** (PM condition 7). Measured: 122 of 179 merges in the
14 days to 2026-09-09 touched `ROADMAP.md` — 68%, 8.7/day — while phase closes
run about 2/day. Most of those 122 are ticks, corrections and phase rows, which
I1 exempts anyway. A skill dispatch on two-thirds of all merges is the reflex
gate `CLAUDE.md` forbids.

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

### 6.2 The arithmetic first — and it closes zero open work

I3 evicts already-closed rows before any judgement is exercised. **PR 3 derives
its own number from §8.1 and reports it; the figures here are evidence the win
exists, not targets.**

Under rev 1's regex the count was 21. **The regex was a mirror of the number it
produced (RF11)** — it is anchored immediately after the bullet's `**`, and this
file writes its dispositions mid-line. Two defects:

- **`ANSWERED` matches zero rows.** `grep -cE '^ *- \*\*ANSWERED'` → 0; the
  file writes `**ASKED AND ANSWERED, 2026-08-31.**`. One of six vocabulary
  entries was dead on arrival.
- **At least 11 further dead rows read as OPEN:** `DISCHARGED` ×3,
  `RULED KEEP` ×2, `ACCEPTED (…)` ×2, `DISPOSED`, `RULED`, two
  `~~struck~~ … DONE` rows, and one `THIS ROW NO LONGER CARRIES A COUNT`.

So dead inventory is **roughly 32, not 21** — a 52% larger win, and worse: each
of those 11 would otherwise have been stamped with a `dies` and entered the
expiry machinery forever.

**The vocabulary is DERIVED then CURATED, and a blanket pattern is RF11 one
layer up.** PR 2 runs this to enumerate the corpus's actual leading tokens:

```bash
git show <ref>:ROADMAP.md | grep -oE '^ *- (\*\*|~~)[A-Z][A-Z ()0-9,.-]{2,30}' \
  | sed -E 's/^ *- (\*\*|~~)//' | sort | uniq -c | sort -rn
```

**Its output is a CANDIDATE list a human curates, never the gate's pattern.**
Measured at `275c14b2`, that command returns real dispositions — `RESOLVED` ×4,
`FILED` ×5, `STRUCK` ×2, `RULED KEEP` ×2, `DONE` ×2, `RULED`, `MOVED OUT`,
`DISPOSED`, `ASKED AND ANSWERED`, `AMENDED AGAIN` — **beside pure noise:**
`TWO`, `THIRD,`, `SECOND LESSON,`, `NOT`, `TIER B2`, `PWA`, `PR1.75`, and the
row identifiers `RC-9(`, `RC-29`, `RC-38`, `AUD-002`, `AUD-006`, `AUD-012`.
Those are emphatic openers and row IDs, not dispositions. Using the raw pattern
as the gate's predicate inflates the closed count with open rows — which is the
same failure as rev 1's under-counting regex, pointed the other way, and it
would have evicted live rows.

So the gate's vocabulary is the curated set — `[x]`, `DONE`, `SHIPPED`,
`CLOSED`, `RESOLVED`, `STRUCK`, `DISCHARGED`, `DISPOSED`, `RULED`,
`RULED KEEP`, `MOVED OUT`, `ACCEPTED`, `AMENDED`, `ASKED AND ANSWERED`, a
`~~struck~~` title, and `NO LONGER CARRIES A COUNT` — matched **anywhere in the
row's first sentence, not anchored after `**`**, and `closed` reports its hits
as CANDIDATES for a human to confirm. `FILED` stays OUT of the vocabulary and
goes to DECIDE: it records a finding filed elsewhere, which reads as closed here
and is judgement (§6.2's seven rows).

**And `closed` is a HEURISTIC, graded as one in §7.** A vocabulary is a closed
list over a corpus many agents write in an open one. Seven `**FILED (…)` rows
in Small, queued are genuinely ambiguous — they record a finding filed
elsewhere, which reads as closed here — and go to DECIDE, not to an arithmetic
count.

**What the eviction is, said plainly, because the PR body must say it:** all
~32 rows are already marked closed, so evicting them closes **zero open work**.
The open population is 85 before and 85 after. It is file hygiene against a
117-row register growing 6.75/day — worth doing, and not debt closure. Reporting
it as the latter would be this repo's own "compare 37 to 90" failure.

Every evicted row's narrative moves to `docs/history/` under the phase that
owns it. **A move, not a delete**, and PR 3's review checks each one is findable
at its new home.

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
50-60**: 85 open rows, of which 3 name a version and 2 carry a `TRIGGER` token,
leaving by section — Owed captures 11 (all need him at an erg), Codebase-audit
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

Re-graded after lens 1. Reported separately on every run.

| Claim | Grade |
| --- | --- |
| the class counts | **deterministic only because I9 forbids an unmarked section**; an unmarked one fails the gate rather than defaulting |
| the ratchet's net comparison | deterministic **given the recomputed merge base**; the base is the whole gate (§5.2) |
| stamp presence and shape | deterministic over the rows the parser identifies |
| **closed markers** | **HEURISTIC** — a closed vocabulary over an open corpus (§6.2), not deterministic as rev 1 graded it |
| expiry against `--asof` | deterministic |
| **expiry against a version** | **HEURISTIC** — tags are mutable refs, absent under the `scripts` job's checkout, and violate I7 (§5.2) |
| whether a `dies` is a death or a trigger | judgement, and OPEN pending §10 q1 |
| whether a row belongs in the code (I5) | judgement, on a premise RF18 contradicts (§5.3) |
| a class fall paid for by another class's rise | judgement |

**Blind spots, stated because a gate that hides one is worse than no gate:**
a row split into a parent plus sub-bullets counts as one (§3.4); a row rewritten
wholesale keeps its `filed`, and nothing detects it; the phase-section channel
is closed by rule, not by the script (§5.5); a row converted to a code comment
and claimed as a strike is caught by nothing, and §5.3 judgement 1 rewards it.

---

## 8. Test plan

TDD: `scripts/register.test.sh` first, each case seen to fail for the right
reason before `register.sh` implements it. Cases needing a real ref use a
**throwaway `git init` repo**, the pattern `scripts/ci-changes.test.sh` already
uses for exactly this. Fixture ROADMAP files live under
`scripts/fixtures/register/` so a case cannot be invalidated by an unrelated
roadmap edit.

### 8.1 The census command

Pinned to `275c14b2`; drop the `git show` to census the tree you are on. It
counts BOTH carriers, which is the defect that produced §3.3, and it uses
§6.2's curated vocabulary rather than a blanket pattern. **Its closed column is
a candidate count, not an authority** — §7 grades it heuristic, and PR 3
confirms each candidate by hand before evicting it.

```bash
git show 275c14b2:ROADMAP.md | awk '
/^#{1,2} /{sec=$0}
/^ *- /{
  top    = ($0 ~ /^- /) ? "top" : "sub"
  # The CURATED vocabulary of §6.2, matched anywhere in the row's opener --
  # not the blanket ALL-CAPS pattern, which catches row IDs and emphatic
  # openers (TWO, TIER B2, RC-38, AUD-012, PWA) and would evict live rows.
  closed = ($0 ~ /^ *- \[x\]/ || $0 ~ /^ *- ~~/ ||
            $0 ~ /(DONE|SHIPPED|CLOSED|RESOLVED|STRUCK|DISCHARGED|DISPOSED|RULED|MOVED OUT|ACCEPTED|AMENDED|ASKED AND ANSWERED|NO LONGER CARRIES A COUNT)/) \
           ? "closed" : "open"
  cnt[sec "|bullet|" top "|" closed]++; secs[sec]=1
}
/^\|/{ cnt[sec "|table"]++; secs[sec]=1 }
END{ for (s in secs) printf "%-62s open:%3d closed:%3d sub:%3d table:%3d\n",
       substr(s,1,62), cnt[s"|bullet|top|open"], cnt[s"|bullet|top|closed"],
       cnt[s"|bullet|sub|open"], cnt[s"|table"] }
' | sort
```

### 8.2 Cases, each with the mutation that makes it red

| Case | Mutation that must make it fail |
| --- | --- |
| `ratchet` passes when a row is struck for a row filed | remove the strike from the head side |
| `ratchet` fails when a row is filed and none struck | this case IS the red one; it must go green when a strike is added |
| **`ratchet` fails on the two-branch same-row-strike collision** | **use each branch's own base instead of the recomputed merge base — the exploit in §5.2 goes green** |
| `ratchet` ignores rows added to `<!-- phase -->` sections | move the added row into a `<!-- register -->` section |
| `ratchet` reports every class delta | delete the reporting line |
| `count` fails on an unmarked section | add the marker |
| `stamps` fails on a missing stamp | add it |
| **`stamps` accepts a stamp WRAPPED across two lines** | **parse line-scoped instead of row-scoped — 262 of 314 rows go red** |
| `stamps` rejects a clause containing `·` | remove the clause-terminator rule |
| `stamps` fails on `dies 2026-13-01` | correct the month |
| `stamps` accepts `dies vX.Y.Z` | narrow the regex to dates only |
| `stamps` accepts the table carrier | remove table handling |
| `stamps` fails on a table row with a wrong column count | correct the row |
| `closed` fails on a closed BULLET in a register section | move it out |
| **`closed` fails on a closed TABLE ROW in a register section** | **bullet-anchor the predicate — the `ambiguous_auth` row goes green** |
| `closed` catches a mid-line marker | re-anchor the vocabulary immediately after `**` |
| `closed` catches a `~~struck~~` row | drop the `~~` alternative |
| `expired` lists a row one day past `--asof` | move `dies` one day later |
| `expired` compares a version with `sort -V`, not existence | switch to `git tag -l` existence and skip a minor |
| `expired` reports `tags unfetched` rather than clean | unset the tag check |
| `count` scopes to marked sections | delete the scoping and watch phase rows enter the count |
| unset-variable guard | remove one `: "${VAR:?}"` and confirm the suite fails loudly rather than passing every row |

The four bolded cases are the ones lens 1's findings created; each is a gate
that would have shipped green over the defect it exists to catch.

### 8.3 Gates

- PR 2: `bash scripts/register.test.sh`, `pnpm lint`, `pnpm typecheck`. **No
  `app/src/` file is touched, so RF1's e2e obligation does not attach** —
  stated, not assumed. Note `scripts/` sits OUTSIDE `ci-changes.sh`'s docs-only
  allowlist, so PR 2 pays the full CI gate while PRs 1, 3 and 4 skip it.
- PR 3: `closed` and `count` clean; every evicted row findable at its new home;
  the before/after register count reported against the growth series in §1.
- PR 4: `stamps` clean; the `dies` distribution printed.

**No CI job ever checks the real `ROADMAP.md`** — the `scripts` job runs fixture
tests. That is the direct consequence of James choosing advisory, and it is the
second reason §5.3 attaches the skill to a phase close rather than to a PR.

---

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
