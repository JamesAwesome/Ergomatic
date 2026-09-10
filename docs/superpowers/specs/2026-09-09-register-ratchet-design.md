# Spec — Phase RR: the register may only go down

Status: DESIGN APPROVED by James 2026-09-09 (in-chat design gate; he chose
"stamp everything now" over grandfathering, and "skill plus script, advisory"
over a blocking CI check). Hardening owed before implementation starts — his
words: _"Approve. Harden the spec after."_

Register rows this PR files: none. Phase RR's ROADMAP section is a PHASE
section, so its rows are scheduled work governed by `/close-phase RR`, not
register rows — see §4.3. Ledger home: `docs/history/phase-rr.md` at close.

Read this session: `ROADMAP.md` (whole), `.claude/skills/close-phase/SKILL.md`,
`scripts/ci-changes.sh`, `scripts/ci-changes.test.sh`, `.github/workflows/ci.yml`,
`CLAUDE.md`.

Every number in this spec was measured on branch `phase-rr-register-ratchet`
at its base commit `275c14b2`, with the command shown beside it.

---

## 1. What and why

Filing a roadmap row is free. Closing one is not. `CLAUDE.md`'s RF14 says
anything with a life after merge goes in the ROADMAP, and nothing anywhere says
when a row may DIE — so the register only grows. On 2026-09-09 James put it
plainly: _"we need to figure out how we can continue working without filling
this register to death with cruft. It's fucking impossible to close things
out."_ That day closed two real defects, spawned five new rows from one of
them, grew `ROADMAP.md` by 384 lines, and left the open-checkbox count exactly
where it started.

This phase makes the register a **ratchet that can only go down**, the same
shape as the typed-lint suppression ledger the repo already runs ("existing
debt may only decrease"). A row must say at filing time what would KILL it.
A finding that has no schedule goes to a comment at the code site instead of
the register, because a comment reaches the next person to edit that file and
a register row reaches nobody.

**Nothing a rower sees changes. No stored number changes. No product code
changes.** The audience is agents and James.

### 1.1 The four rules, as James adopted them

1. **The ratchet.** A PR that files N register rows strikes N, or asks James
   for an explicit exemption.
2. **No row without a closing condition, written at filing time.** A death
   condition, not a trigger: "struck if X has not happened by D".
3. **A finding defaults to the CODE, not the register.** The register is for
   work with a schedule.
4. **Expire by default.** A row past its date is listed at the next phase
   close and struck unless defended.

### 1.2 Two measurements that changed the design before it was written

**Rule 4 has no mechanical basis as "untouched for 30 days".** `git blame` on
`ROADMAP.md`'s bullet lines returns 171 lines at 7 days or less, 162 at 8-30
days, 4 at 31-60 days, and **none older than 60 days**:

```bash
git blame --line-porcelain -- ROADMAP.md \
  | awk '/^author-time /{t=$2} /^\t/{if($0 ~ /^\t *- /) print t}' \
  | awk -v now=$(date +%s) '{d=int((now-$1)/86400);
      if(d<=7)a++; else if(d<=30)b++; else if(d<=60)c++; else e++}
      END{printf "<=7d:%d  8-30d:%d  31-60d:%d  >60d:%d\n",a,b,c,e}'
```

The file is reflowed and rewritten constantly, so blame dates when a LINE was
last edited, not when a row was filed. An expiry sweep built on blame would
have found 4 rows out of 337 and read as a gate that works (RF21). **Expiry
therefore needs a date the row carries itself**, which collapses rules 2 and 4
into a single field: a closing condition with a mandatory machine-readable
deadline IS the expiry rule.

**No row in the file has a death condition today.** `grep -ci 'struck if'
ROADMAP.md` returns **0**; `grep -ci 'closing condition'` returns 2, both in
prose about the idea rather than in a row. So this is a retrofit of the whole
register, not a rule that only binds new rows. James chose that knowingly.

---

## 2. Invariants

Stated as invariants, not mechanisms, per RF27 — §3 and §5 are the mechanism,
and the mechanism may be replaced without renegotiating these.

- **I1 — The register's row count never rises across a PR** unless James
  granted a recorded exemption in that PR.
- **I2 — Every register row carries a filing date and a death condition**, in
  a form a script can parse without judgement.
- **I3 — A register section contains only OPEN rows.** A row that closes
  leaves the register; its narrative moves to `docs/history/` or the PR that
  closed it, and is never deleted.
- **I4 — A strike is an act with a receipt, never a default** (RF30). Expiry
  produces a list to defend, and the receipt for an undefended row names the
  date that passed and the phase close at which nobody defended it.
- **I5 — A row whose subject is a place in the code is a comment at that
  place, unless it also has a schedule.** The register's membership test is
  "does this have a schedule", not "is this true".
- **I6 — Moving a row between section classes is not a strike.** Register,
  pinned and vision counts are all reported, so a fall in one paid for by a
  rise in another is visible.
- **I7 — Every claim the gate makes is reproducible from a tracked artifact
  by a command.** The gate reports its own deterministic and heuristic halves
  separately (§7).

---

## 3. The row grammar

### 3.1 Section classes

A section declares its class with an HTML comment on the line after its
heading. `grep -c '<!--' ROADMAP.md` returns **0** at `275c14b2`, so the
convention collides with nothing, and `ROADMAP.md` is formatted by no tool
(`CLAUDE.md`: lint-staged's globs are `app/**` only), so nothing reflows it.

| Marker | Meaning | In the ratchet | Expires |
| --- | --- | --- | --- |
| `<!-- register -->` | open work with no wave | yes | yes |
| `<!-- pinned -->` | decided not to fix; needs a receipt, not a date | no | no |
| `<!-- vision -->` | future product scope with no schedule | no | no |
| none | phase and wave sections; scheduled work | no | governed by `/close-phase` |

Sections to be marked, with their measured top-level open-row counts at
`275c14b2` (the census command is in §8.1):

- `<!-- register -->`: Small, queued (31) · Owed captures and walk items (13)
  · Codebase-audit owners (11) · Rides the next PR touching the connected
  surface (24 table rows) · say-which-number design pass (5) · Phase TD (5) ·
  Tooling (4) · Needs a decision from James (3) · Icebox (3) · Active audit
  overlay (0 open) · The unlogged-session door (0 open)
- `<!-- pinned -->`: Accepted, pinned and not being fixed (16)
- `<!-- vision -->`: After the strangers (24)

**Icebox is inside the ratchet on purpose.** If it were exempt, the ratchet is
evaded by moving a row there instead of killing it. **`# After the strangers`
is outside it on purpose:** it is product scope, and making a product idea
cost a debt strike trades the wrong two things.

`# Completed phases` and `## Killed at the 2026-08-28 rebalance` are ledgers of
closed work and carry no marker.

### 3.2 The stamp

One grammar, two carriers. The text is identical in both:

```
filed <YYYY-MM-DD> · dies <YYYY-MM-DD|vX.Y.Z> unless <one clause>
```

`grep -c '· filed' ROADMAP.md` returns **0** at `275c14b2`, and `·` is already
house punctuation (72 lines carry one), so the token is collision-free and in
keeping.

`dies` takes a date or a version tag. A version is expired when the tag
exists: `git tag -l <vX.Y.Z>` returns it. That keeps "before the next release"
expressible without a guessed date.

**Bullet carrier** — the stamp is the row's last line, indented to the bullet's
text column:

```markdown
- [ ] **Nobody has measured that a hand verification sets the list's
      `verified`.** …evidence, receipt, what unblocks it…
      · filed 2026-09-08 · dies 2026-10-08 unless James hand-verifies one
        log-dev row and appends the receipt to the research file · S
```

**Table carrier** — the table gains a final `Dies` column:

```markdown
| Item | What | Evidence | Dies |
| --- | --- | --- | --- |
| **RC-13b** | … | `phase-rc.md` | filed 2026-09-09 · dies 2026-10-09 unless a UI path re-programs from `ready` |
```

The size marker (`**S**`, `**XS**`) stays optional; 101 already exist
(`grep -coE '\*\*(XS|S|M|L|XL)\*\*' ROADMAP.md`) and this spec does not
require or remove them.

### 3.3 What counts as one row

- **Bullet sections:** a row is a bullet at column zero (`^- `). An indented
  bullet (`^ +- `) is part of its parent row and is not counted or stamped.
- **Table sections:** a row is a `|`-leading line that is neither the header
  nor the `---` separator.

Measured consequence, and it is a known limit: splitting one row into a parent
with five sub-bullets reads as one row. Eight indented open bullets exist in
register sections today (Tooling 5, Small-queued 3); §6.4 dispositions each as
either genuinely part of its parent or a row to promote. The limit is recorded
in §7 as a heuristic the skill watches, not something the script can see.

### 3.4 Lifetime table

Per RF27, every field, where it is minted, what may change it, and what
survives.

| Field | Minted | Changed by | Survives |
| --- | --- | --- | --- |
| `filed` | once, at the PR that files the row | never | everything; it is history |
| `dies` | at filing, by the filer | a defence at a phase close, or James; each rewrite states why | rewording, moving, reflow |
| section class | at filing, by which section the row is written into | a documented move, which is not a strike (I6) | — |
| the count | derived, never stored | nothing; it is recomputed from the tree at two refs | compaction, parallel sessions |

**The count is deliberately not stored anywhere.** A stored ceiling is a claim
with an expiry date; the register row that has been wrong three times about a
`PM5` string count is the file's own worked example. The ratchet compares two
refs of the tree instead.

---

## 4. Scope

### 4.1 In

- `scripts/register.sh` and `scripts/register.test.sh` (§5), the test wired
  into CI's existing `scripts` job.
- Section markers and the row grammar in `ROADMAP.md`, plus the contract text
  under "How this file is used".
- `.claude/skills/register-gate/SKILL.md` (§5.3), and the same file mirrored
  to `.agents/skills/` per the repo's existing pairing.
- `CLAUDE.md`: the four rules as RF14's counterpart.
- `.claude/skills/close-phase/SKILL.md` gate 5: the expiry defence.
- The stamp pass over every register row, with its strikes (§6).

### 4.2 Out

- **No blocking CI gate.** James chose advisory. A red check on a roadmap line
  would block real work at the wrong moment, and he stays the only exemption
  authority.
- **No change to phase or wave sections.** Their rows are scheduled work and
  `/close-phase` already governs them.
- **No renumbering, renaming or re-homing of rows** beyond what §6 requires.
  One home per body of work is already the file's contract and this phase does
  not relitigate it.
- **No product code.** No `app/` file is touched.

### 4.3 The self-application, stated so it is not asked twice

Phase RR files rows of its own — its ROADMAP section carries the PR slate.
Those are PHASE rows in an unmarked section, so I1 does not apply to them and
no strike is owed to file them. What the phase owes instead is `/close-phase
RR`, which dispositions every one of them. Meanwhile PR 3's stamp pass strikes
roughly 21 already-closed rows (§6.2) before it exercises a single judgement
call, so the phase pays for itself in the register even though it is not
required to.

---

## 5. The mechanism

### 5.1 `scripts/register.sh`

Bash, alongside `scripts/ci-changes.sh`, which is the repo's precedent for a
tested shell gate. Every subcommand reads `ROADMAP.md` from a git ref
(`git show <ref>:ROADMAP.md`) or from the working tree when given no ref, so
the same code counts both sides of a comparison.

| Subcommand | Prints | Exit |
| --- | --- | --- |
| `count [<ref>]` | `register=<n> pinned=<n> vision=<n>` | 0 |
| `stamps [<ref>]` | every register row whose stamp is missing or malformed, with its line and title | 1 if any, else 0 |
| `closed [<ref>]` | every register row carrying a closed marker (I3) | 1 if any, else 0 |
| `expired [<ref>] [--asof <date>]` | every register row past its `dies` date, or whose `dies` tag exists | 0 always; a list is not a failure (I4) |
| `ratchet <base> <head>` | all three counts at both refs and the deltas | 1 if the register delta is positive, else 0 |

Four details that are load-bearing, each because a nearby repo failure taught
it:

- **`--asof` exists so the expiry check can be tested.** Without it, every
  expiry test is dated relative to the day it runs and either rots or cannot
  be written to go red at all (RF21).
- **Numeric comparisons force `+0`**, and every derived variable is guarded
  with `: "${VAR:?}"`. `/close-phase`'s Phase 0b records the measured failure
  this prevents: an unset variable in an `awk` numeric filter evaluates to 0
  and silently passes every row.
- **`ratchet` is a NET comparison, not a diff parse.** It cannot distinguish a
  strike from a move (I6), which is why it reports pinned and vision deltas
  beside the register delta and why the skill, not the script, judges them.
- **`grep -c` over two files prints one line per file and never a sum.** Every
  count in this script reads exactly one file at exactly one ref.

### 5.2 Proof contract per gate

Per RF26, each gate states the strongest claim it may make. The wording in the
script's own output, the test titles, the skill and any PR body may not exceed
the fifth column.

| Gate | Invariant | Observable | Deciding mutation | May claim |
| --- | --- | --- | --- | --- |
| `ratchet` | I1 | register count at head vs base | a fixture that adds one register row and strikes none | the count did not rise; NOT that no row was smuggled in as pinned or vision |
| `stamps` | I2 | presence and shape of the stamp | delete a stamp line; corrupt `dies` to `2026-13-01` | every register row parses; NOT that any `dies` clause is a good one |
| `closed` | I3 | closed markers inside register sections | add `- **DONE (…)** …` to a register fixture | no closed row sits in the register; NOT that closed rows were archived rather than deleted |
| `expired` | I4 | `dies` date vs `--asof`; `git tag -l` for versions | set a fixture row's `dies` to the day before `--asof` | these rows are past their date; NOT that they should be struck |

The judgements no gate can make — whether a `dies` clause is a death or a
trigger, whether a row belongs in the code instead, whether a fall in the
register was paid for by a rise in vision — belong to the skill, and the skill
reports them as judgement (§7).

### 5.3 `/register-gate`

The skill, run by the controller before requesting review on any PR that
touches `ROADMAP.md`. It runs `register.sh` for arithmetic and adds the four
judgements the script cannot make:

1. **The filing test (I5).** For each added row, name the file the row is
   about. If one exists, the row is refused and becomes a comment at that site
   — unless the row states why a comment will not reach the next editor. Work
   with a schedule stays.
2. **Death, not trigger (I2).** "Struck if X has not happened by D" passes.
   "When X happens, do Y" fails: that is a trigger, and rotting triggers were
   Phase OD's entire subject.
3. **Evasion (I6).** A register fall paid for by a pinned or vision rise is
   named as such.
4. **The expiry list**, reported for information at PR time and consumed for
   real at phase close.

Output is a verdict block for the PR body plus, where the ratchet fails, the
exemption ask for James with the trade named: what would be struck to pay for
this row, and what is lost either way. The skill never grants an exemption.

### 5.4 `/close-phase` gate 5

Gate 5 already re-checks the freeze anchor and lifts `CARRY` rows. It gains
one step before the lift: run `register.sh expired`, present the list, and
take one disposition per row — **defended** (a reason and a new `dies`) or
**struck** (receipt: the date that passed and this phase close). An undefended
row is struck; that is rule 4's default, and the receipt is a measured fact
rather than an invented cost, which is what keeps it inside RF30.

---

## 6. The migration

James chose to stamp everything now rather than grandfather. The pass produces
one of three dispositions per row, and it is where the ratchet actually pays,
because writing a death condition is the moment a row's pointlessness becomes
visible.

### 6.1 Dispositions

- **STRIKE** — with a measured receipt, never an argument (RF30). The row's
  narrative moves to `docs/history/` if it carries any; it is not deleted.
- **STAMP** — `filed` and `dies` derivable from the row's own evidence.
- **DECIDE** — batched to James in one list, for rows whose death is only his
  call. **I will not invent those conditions.** A `dies` I guessed is RF30
  pointed at a row, and the register's own worked example of that failure is
  the option struck on an unmeasured cost that cost a whole implementation.

### 6.2 The arithmetic first, and it is most of the win

I3 evicts every already-closed row from the register before any judgement is
exercised. Measured at `275c14b2` (§8.1): **about 21 rows**, comprising
`## The unlogged-session door` (6 of 6 closed, so the section empties and is
archived), `## Active audit overlay` (2 of 2 closed, same), Small, queued (7),
Codebase-audit owners (3), and three table rows — RC-13 (DONE 2026-09-09),
Session calories (CLOSED by Phase LP), `PULL TO RESUME` (ORDER STRUCK
2026-09-09, order withdrawn by its author).

Each moves to `docs/history/` under the phase that owns it. **This is a move,
not a delete**, and PR 3's review checks that every evicted row's text is
findable at its new home.

### 6.3 Filing dates are not recoverable, and are not invented

Blame cannot date a row (§1.2). So:

- a row whose own text states a filing date keeps it, sourced;
- every other row gets `filed 2026-09-09 (stamped)`, whose meaning — "entered
  the system of record on the day the register got one" — is written into
  `ROADMAP.md`'s contract.

No origin date is inferred. An invented `filed` would read as evidence
(RF16).

### 6.4 `dies` dates are spread deliberately

Defaulting every row to +30 days builds one mass-expiry cliff. Each `dies` is
set from the row's own evidence — a version where the row names a release, a
date where the row names a walk or a decision — and rows with no such evidence
go to the DECIDE batch rather than to a default. The pass reports the
resulting distribution so a cliff is visible before it lands.

The eight indented open bullets in register sections (§3.3) are dispositioned
here too: part of their parent, or promoted to a row of their own.

### 6.5 Order

The DECIDE batch is answered before PR 3 is written. A ruling can strike a row,
and stamping a row James is about to delete is wasted work — the same ordering
`/close-phase` Phase 1 uses for the same reason.

---

## 7. What is deterministic, and what is not

Reported separately by the skill on every run, rather than presenting the whole
thing as sound.

- **Deterministic:** the three counts, the ratchet's net comparison, stamp
  presence and shape, closed markers inside register sections, expiry against
  `--asof` and against `git tag -l`.
- **Heuristic, and the skill says so:** whether a `dies` clause is a death
  condition or a trigger; whether a row belongs in the code instead (I5);
  whether a register fall was paid for by a pinned or vision rise (I6).
- **Known blind spots, stated because a gate that hides its blind spot is
  worse than no gate:** a row split into a parent plus sub-bullets counts as
  one (§3.3); a row rewritten wholesale keeps its `filed` date, and nothing
  detects that; the ratchet cannot tell a strike from a deletion that lost the
  narrative, which is why PR 3's review checks the new homes by hand.

---

## 8. Test plan

TDD: `scripts/register.test.sh` is written first and each case is seen to fail
for the right reason before `register.sh` implements it. The test drives
fixture ROADMAP files under `scripts/fixtures/register/`, not the real
`ROADMAP.md`, so a case cannot be invalidated by an unrelated roadmap edit.
`ci-changes.test.sh` is the shape to follow, and the `scripts` job already runs
that pattern.

### 8.1 The census command the spec's numbers come from

```bash
awk '
/^#{1,2} /{sec=$0}
/^ *- /{
  top    = ($0 ~ /^- /) ? "top" : "sub"
  closed = ($0 ~ /^ *- \[x\]/ ||
            $0 ~ /^ *- \*\*(DONE|SHIPPED|CLOSED|RESOLVED|STRUCK|ANSWERED)/) \
           ? "closed" : "open"
  cnt[sec "|" top "|" closed]++; secs[sec]=1
}
END{ for (s in secs) printf "%-70s top-open:%3d top-closed:%3d sub-open:%3d\n",
       substr(s,1,70), cnt[s"|top|open"], cnt[s"|top|closed"], cnt[s"|sub|open"] }
' ROADMAP.md | sort
```

### 8.2 Cases, each with the mutation that makes it red

| Case | Mutation that must make it fail |
| --- | --- |
| `ratchet` passes when a row is struck for a row filed | remove the strike from the fixture's head side |
| `ratchet` fails when a row is filed and none struck | none needed; this case IS the red one, and it must go green when the strike is added |
| `ratchet` ignores rows added to phase sections | move the added row into a `<!-- register -->` section |
| `ratchet` reports pinned and vision deltas | delete the reporting line from the script |
| `stamps` fails on a missing stamp | add the stamp |
| `stamps` fails on `dies 2026-13-01` | correct the month |
| `stamps` accepts a `dies vX.Y.Z` form | narrow the regex to dates only |
| `stamps` accepts the table carrier | remove table handling from the script |
| `closed` fails on `- **DONE (…)**` in a register section | move that row out of the section |
| `expired` lists a row one day past `--asof` | move `dies` one day later |
| `expired` lists a row whose `dies` tag exists | point `dies` at a tag that does not exist |
| `count` scopes to marked sections only | delete the section-marker scoping and watch phase rows enter the count |
| unset-variable guard | remove one `: "${VAR:?}"` and confirm the suite fails loudly rather than passing every row |

The last case is the one that exists because of `/close-phase`'s measured
failure, not because of a hypothetical: an unset variable in an `awk` numeric
filter is the failure mode that passes everything while looking like a gate.

### 8.3 Gates for the PRs

- PR 2 (mechanism): `bash scripts/register.test.sh`, `pnpm lint`,
  `pnpm typecheck`. **No `app/src/` file is touched, so RF1's e2e obligation
  does not attach** — stated rather than assumed, and if it becomes false the
  full suite runs.
- PR 3 (stamp pass): `register.sh stamps`, `closed` and `count` all clean on
  the real file; every evicted row findable at its new home; the `dies`
  distribution printed in the PR body.

---

## 9. PR shape

Three, because grouping the mechanism with a rewrite of every register row
would force a reviewer to hold both at once — the tie-break `CLAUDE.md`'s
group-the-work rule names.

1. **This spec, plus Phase RR's ROADMAP section** (RF17: the section lands in
   the same commit as the spec). Docs only.
2. **The mechanism.** `scripts/register.sh` + `scripts/register.test.sh` +
   fixtures, the `scripts` job wiring, the section markers, the grammar and
   contract text in `ROADMAP.md`, `CLAUDE.md`'s four rules,
   `/register-gate`, and `/close-phase` gate 5.
3. **The stamp pass**, after the DECIDE batch is answered: every register row
   stamped, ~21 closed rows evicted to `docs/history/`, the strikes with their
   receipts.

Gates: this is not TRIAD work — no number's meaning, no stored shape, no auth —
so no PM per-PR gate and no antagonist per-PR pass is owed. What IS owed and
is not being skipped: `/harden` on this spec before PR 2 starts, at James's
explicit instruction, and a PM phase-open gate on the slate, since this
changes the shape and sequence of all planned work, which is exactly what the
PM gate is for.

---

## 10. Open questions for James

Batched, not blocking; PR 2 can proceed without them.

1. **Exemption record.** When he grants one, does the raised count need a
   named reason in the PR body only, or a line in `ROADMAP.md` so the ceiling's
   history is readable in the file itself? The former is cheaper; the latter
   survives the PR being forgotten (RF14).
2. **`## Needs a decision from James`.** These are HIS pending decisions. An
   expiry that strikes one drops a decision he never made. Proposal: such a row
   is defended by default at a phase close and its `dies` clause always reads
   "unless James rules", so expiry re-asks rather than strikes. Confirm.
3. **The DECIDE batch's size.** If §6 sends him more than roughly a dozen rows,
   is that one list, or does he want the pass to default the remainder to +60
   days and re-ask at the next phase close?
