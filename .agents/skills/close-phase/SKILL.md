---
name: close-phase
description: Close a named phase — freeze its owed work, batch the product decisions, drive the rest through subagents, and leave one ledger row. Use when a phase's deliverable is landing or landed and its register rows are still open. Not for opening a phase or for mid-phase work.
---

# close-phase

You are the controller closing a phase. Your output is: a merged PR (or PRs),
a decision batch answered by James, a live-slate register carrying every row
you did NOT do, an archived body, and ONE ledger row.

**You do not read product code or diffs in this skill.** Implementer and
reviewer subagents do. You read verdicts and you maintain the worklist. A
close-out that fills the controller's context gets compacted mid-flight and
re-derives its own slate wrong — which is the failure this whole document is
shaped around.

Invoke as `/close-phase MT`. The argument is the phase code as it appears in
the ROADMAP heading.

## Phase 0 — freeze the slate

### 0a. Refuse, or find exactly one phase

```bash
grep -nE "^## Phase <X>( |$)" ROADMAP.md
```

**Refuse if this returns zero rows** — a phase with no ROADMAP section is not
a phase (RF17); write its section first, in its own commit, then come back.
**Refuse if it returns more than one.** The anchor matters: `^## Phase T`
matches `## Phase TD`, `^## Phase D` matches `## Phase DE`, `^## Phase P`
matches `## Phase PROTO`. `/close-phase D` closing DE is a silent
catastrophe, and the separator is the only thing between you and it.

**Refuse `/close-phase TD` outright.** `## Phase TD` matches the anchor and is
not a phase: it carries `<!-- debt -->`, the class the register counts and
never charges for, and `ROADMAP.md`'s own head says it "is deliberately not
scheduled". Closing it would ask its five absent-evidence rows for a
disposition they cannot have. (Sixteen is the whole `debt` class — TD's five
plus eleven in `## Owed captures and walk items`; `/close-phase` only ever
reads one span.) Check the marker before the span, and only AFTER 0a's
zero-and-multiple refusals above have run — the arithmetic below dies with a
syntax error on a multi-match rather than answering:

```bash
sed -n "$(($(grep -nE "^## Phase <X>( |$)" ROADMAP.md | cut -d: -f1) + 1))p" ROADMAP.md
```

A `<!-- debt -->` marker there means refuse; a `<!-- phase -->` marker means
proceed. Any other marker, or none, means the section is misfiled — say so and
stop rather than guessing.

### 0b. The span

```bash
SPAN=$(awk -v P="^## Phase <X>( |$)" '
  $0 ~ P {s=NR; f=1; next}
  f && /^#{1,2} / {print s, NR; x=1; exit}
  END {if (f && !x) print s, NR}' ROADMAP.md)
START=${SPAN% *}; END=${SPAN#* }
[ -n "$START" ] && [ -n "$END" ] || { echo "REFUSE: no span for <X>"; exit 1; }
echo "span: $START..$END"; sed -n "${END}p" ROADMAP.md
```

**Run 0b through 0e in ONE shell invocation.** `$START` and `$END` do not
persist between tool calls, and an unset one is the worst possible failure
here: `awk -v a="" '$1+0 < a+0'` makes `a+0` evaluate to **0**, so the
in-span filters in passes 2 and 3 pass EVERY hit. Measured on MT: pass 2
returns 136, 326 and 1661 instead of the single out-of-span 1661, destroying
the pass's whole premise. Every block below therefore opens with
`: "${START:?run 0b first, in this same shell}"`, which fails loudly instead.

**It emits bare numbers on purpose.** An earlier draft printed `136 START`
and left the controller to substitute it by hand — and a two-field string
reused in the numeric filters of passes 2 and 3 degrades SILENTLY, because
awk compares a non-numeric operand as a STRING: `90 < "136 START"` is false
where the numeric answer is true. Digit-dependent, no error. Likewise a
reversed range (`sed -n '335,136p'`) prints ONE line and exits 0, which pass
1 then reports as an empty phase — indistinguishable from a phase that has
no rows. **Always echo the span and eyeball the terminator line.**

**The terminator is `^#{1,2} `, not `^## `.** ROADMAP.md carries five H1
headings. Terminating on `^## ` alone gives `## Phase TD` a 370-line span
that swallows `# Icebox`, `# After the strangers` and the whole completed-
phase ledger — and its checkbox count still comes out right, because the
swallowed sections use a different bullet form. **A count that agrees for the
wrong reason is a mirror (RF11); check the span's printed last line, not the
tally.**

### 0c. Pass 1 — every bullet in the span, not every checkbox

```bash
: "${START:?run 0b first, in this same shell}"
awk -v a="$START" -v b="$END" 'NR>=a && NR<=b && /^ *- /{print NR": "$0}' ROADMAP.md
```

**Do not enumerate `- [ ]`.** File-wide the checkbox is the MINORITY form:

```bash
grep -cE "^- \[ \]" ROADMAP.md    # 68   open checkbox rows
grep -cE "^- \[x\]" ROADMAP.md    # 45   ticked checkbox rows
grep -cE "^- \*\*" ROADMAP.md     # 177  plain bold bullets
```

(measured on `main` at `d7319040`, 2026-09-08.)

**`awk`, not `sed -n | grep -n`.** The `sed` slice renumbers from 1 inside the
slice, so MT's first row prints as `20:` when it is file line 155 — while
passes 2 and 3 print absolute numbers. One freeze report carrying two
coordinate systems, with nothing marking which is which.

**Enumerate at ANY indent — `^ *- `, not `^- `.** Censused across all five
live phase spans (MT, JR, DE, PROTO, TD): every one carries zero indented
bullets today, so the two patterns currently agree. `^ *- ` is still the one
to use, for two reasons. Indented, individually-tracked items DO exist in
this file — the register and wave sections carry them, in ROADMAP's own voice
("Delete versus sent, unstated to the rower"; "Rows saved before PR2 carry
`completed_at IS NULL`, permanently") — and those are exactly where passes 2
and 3 land. And continuation text here is indented PROSE, never a bullet, so
the looser pattern costs nothing.

**A caution earned twice while this skill was being written.** Both times a
claim about bullet FORMS was wrong, the cause was a mis-derived span, and
both times the count still looked plausible. Re-derive the span before
trusting any measurement taken inside it.

`## Phase JR` holds **zero open checkbox rows** (13 ticked, all history) and
nine plain `- **…**` bullets, six of which carry live follow-on work, under a
status line reading "the follow-on slate below is the live work." A checkbox-only freeze returns JR an EMPTY slate,
satisfies the stop rule at invocation, lifts nothing at the lift gate, and
then **archives the body and deletes nine live items** — verbatim the failure
ROADMAP.md's "Open items never live in a closed body" bullet exists to
prevent.

**Say the shape aloud before dispositioning:** if the span has zero bullets,
refuse. If it has bullets but zero checkboxes, say so — that phase keeps its
slate in prose bullets and every one of them needs a disposition.

**Ticked rows are enumerated too.** A `- [x]` that never shipped is RF36's
class running the other way: a checkbox is a claim about the tree and nothing
checks it. Every `[x]` in the span owes a commit or file receipt exactly like
a `DONE`.

### 0d. Pass 2 — named hits outside the span

```bash
: "${START:?run 0b first, in this same shell}"
[ -n "$X" ] || { echo "REFUSE: empty phase code"; exit 1; }
grep -nEi "Phase $X([^A-Za-z0-9]|$)" ROADMAP.md | awk -F: -v a="$START" -v b="$END" '$1+0 < a+0 || $1+0 > b+0'
```

**Guard the code before running, and force numeric comparison with `+0`.** An
empty `$X` makes the pattern match nothing and exit 1 — reading exactly like
"nothing found outside the span", on the one pass whose whole job is finding
the phase's real entry point.

**The separator class is `[^A-Za-z0-9]`, not `( |,|\.|$)`.** ROADMAP writes
possessives and colons, and the narrower class drops them silently: it finds
3 of MT's 4 mentions (missing `during Phase MT: full \`pnpm e2e\``), 6 of LP's
8 (`Phase LP's …`), 3 of TD's 4 and 2 of JR's 3. A phase whose entry point is
written `Phase X's` outside the span would be silently unfrozen. The wider
class recovers all of them and still refuses a prefix collision — `Phase D`
returns 0 against `## Phase DE`.

**This is where the phase's real entry point lives.** On MT the file-wide
grep returns 4 hits and exactly ONE falls outside the span — the Wave E row
at 1661, which is the row the whole phase exists to close. Meanwhile only 2
of the 15 in-span open rows contain the string "MT" at all. **A phase's own
rows do not name the phase; the rows that name it live somewhere else.**

### 0e. Pass 3 — per-row duplicate reconciliation, and it is a HEURISTIC

Run this **per frozen row, on that row's own distinctive noun** — not once on
the phase's subject vocabulary. A phase freezes rows about tooling it tripped
over, whose words are disjoint from the phase's subject:

```bash
: "${START:?run 0b first, in this same shell}"
[ -n "$NOUN" ] || { echo "SKIP: no noun for this row"; exit 0; }
grep -nFi "$NOUN" ROADMAP.md | awk -F: -v a="$START" -v b="$END" '$1+0 < a+0 || $1+0 > b+0'
```

`grep -F`, not `-E`: a real distinctive noun contains regex metacharacters
routinely (`completed_at IS NULL`, `44x44 px`, anything parenthesised).

**The empty-noun guard needs its `exit 0`.** A guard that echoes SKIP and
falls through to `grep -F ""` dumps every line of ROADMAP into the
controller — 3223 of them, measured — which is precisely the
context-flooding failure this whole skill is shaped to avoid.

**Measured, and it is why the per-row form is mandatory:** MT freezes a row
about `pnpm screenshots` rewriting captures on every run. The same defect is
live twice more elsewhere in ROADMAP with two other numbers — and a
phase-vocabulary sweep (`skierg|machine type|denylist`) finds neither, because
"screenshots" is not an MT word. Pass 1 misses them (outside span), pass 2
misses them (they never say "MT").

Grep case-INSENSITIVELY. `grep -c "skierg" ROADMAP.md` returns 0; `grep -ci`
returns 8.

The output is a **duplicate-reconciliation list**, not just a candidate list:
for each hit, is this the same defect described elsewhere with a different
number? Each candidate is CLAIMED or REJECTED with a written reason. A
rejection is a decision James does not get to make again, so it carries a
receipt like any other strike (RF30).

**Say this out loud in the freeze report: pass 3's recall is bounded by a
word list you invented.** The freeze is complete over passes 1 and 2 and
best-effort over pass 3. Do not present it as complete.

### 0f. Disposition every enumerated row

| Disposition | Meaning | Terminal? |
| --- | --- | --- |
| `BUILD` | code, test or capture work; needs an implementer | on merge |
| `DECIDE` | a ruling only James can make (a row he has ALREADY ruled, with residual work attached, is BUILD or DOC — not DECIDE) | on his answer |
| `DOC` | record-only: a ROADMAP correction, a stale comment, a docs line | on merge |
| `CARRY` | not done, not struck: lifted with its evidence to a named home, plus what unblocks it | at the lift gate |
| `STRIKE` | not doing it — a MEASURED receipt, never an argument (RF30) | immediately |
| `DONE` | already shipped — verified against the TREE, naming the commit or file | immediately |

**`CARRY` is not a failure state and you will need it.** MT freezes a row
blocked on a `Transport.read` the phase is not building: `STRIKE` demands a
receipt that cannot exist yet, and `BUILD` is out of scope. Without `CARRY`
the stop rule declares the lift gate's input empty while the lift gate's
whole job is lifting it.

### 0g. Anchor the freeze, and land it

Record `git rev-parse HEAD`, and save the span's TEXT:

```bash
sed -n "${START},${END}p" ROADMAP.md > docs/closeouts/close-<X>.span.txt
```

**The text, not a `sha256` of it.** The process mutates the span by design —
every checkbox tick and register filing lands inside it — so a digest is red
on every run and cannot separate our own edits from a parallel session
rewording a row, which is the only thing the anchor exists to catch. A stored
copy lets the lift gate `diff` and report per row. **Without the
anchor the freeze is not a freeze:** parallel sessions are the normal case
here, and one of them can add or reword a span row with nothing noticing.

**Every span now begins heading, then a class marker at `START+1`** (Phase RR
PR 2 wrote one into all 33 sections). It is inert for the freeze — it never
changes — but it is the second line of every anchor file, so a diff that
reports it as an addition is reading a stale anchor, not a parallel session.

Write the worklist to `docs/closeouts/close-<X>.md` **in the phase worktree,
tracked and committed at the end of Phase 0**, amended on every disposition
change. One line per row:

```
SLUG | DISPOSITION | title (first clause, one line) | status | receipt
```

**Collapse the title to its first clause.** Bold titles in ROADMAP routinely
span source lines (10+ do today), and a verbatim copy either embeds a newline
— breaking every later line-based read of this file — or gets silently
paraphrased, which breaks the durable-record claim. The SLUG is the identity;
the title is a human label.

**Key on the row's bolded title or a slug you assign — NEVER on a line
number.** Phases 2, 3 and 4 all edit ROADMAP.md, and every register filing
and checkbox tick shifts every subsequent line key.
`.Codex/agent-briefing.md` — the file this skill tells its own subagents to
read first — forbids exactly this by name. A line number may appear only as
an "as of `<sha>`" convenience column.

**The worklist is not a cache.** An earlier draft of this skill called it one
and said "if you lose it, re-run Phase 0". That was false: pass-3
CLAIM/REJECT receipts, per-row dispositions and `DONE` receipts are
judgements, not derivations, and re-running Phase 0 yields a DIFFERENT
judgement with no divergence signal. It is a durable record, it is committed,
and `git log` shows every disposition change. **The invariant: every
judgement made during a close-out is recoverable from a tracked artifact.**

## Phase 1 — the decision batch

**DECIDE rows go to James FIRST, before any BUILD starts.** A ruling can
delete a BUILD row, and building it first spends a subagent on work a
sentence was about to remove.

**1a — rulings answerable from prose.** One message, every such row in one
list. For each: the row, what is actually being asked, the options, and your
recommendation with its reason. **Every cost attached to an option is a
factual claim and gets a measurement or the word "untested"** (RF30) — the
same gate a design gate's option list carries, because it is the same
decision.

**1b — rows needing Gate 0.** A DECIDE row that changes what a rower READS or
SEES needs the rendered thing, both orientations, contrast ratios as numbers.
**Rendering a Gate 0 artifact is explicitly NOT a BUILD row and may proceed
while the batch is out** — otherwise the one rule forbidding build-during-
batch makes the artifact the gate requires unreachable. MT has such a row
in-span (permission-screen copy saying "your PM5" where it means "your
monitor", RF32).

Then STOP and wait. Do not start BUILD rows while the batch is out.

## Phase 2 — the work

**Grouping.** One PR for all non-triad rows (AGENTS.md, group-the-work). A
row carrying TRIAD weight — what a number MEANS, a stored shape, auth — lands
alone, because bundling makes its own gate harder to run.

**Hardening.** `/harden` runs on a row's brief only where the row invents a
mechanism or carries triad weight. Otherwise say the skip aloud in the PR
body: "inherits the phase's vetted ground; no new invariant class."

**Per row:** an implementer subagent (reads `.Codex/agent-briefing.md`
first, works in the phase worktree, failing test first, self-mutation), then
a reviewer subagent on its diff. You read the verdict. You do not read the
diff.

**A finding's fix gets the reviewer's OWN mutant, not one you designed after
the fix** (RF35). The implementer reports what it mutated and what the
failure said, or the row is not done.

## Phase 3 — discovery, and the pull-in cap

Anything found that is not on the frozen list is filed as a ROADMAP register
row with its evidence, at the moment it is found (RF14), and NOT worked.

**The pull-in exception is mechanical, not a judgement call.** A discovery is
pulled in only if:

- the phase's own diff introduces or exposes it
  (`git fetch origin main && git diff origin/main...HEAD --name-only` contains
  the file — the LOCAL `main` pointer goes stale within the day here, and the
  three-dot form ignores uncommitted work, so commit the discovery first),
  **or**
- it falsifies a frozen row's stated premise.

Everything else is a register row, however tempting. "It would ship a defect"
is not a test — after a merge, every bug found during a phase would ship.

**Every pull-in is countable from the record alone.** It appends a line to
`docs/closeouts/close-<X>.md` AND tags its ROADMAP register row
`(pulled in, close-<X> #N)`, so:

```bash
grep -c "pulled in, close-<X>" ROADMAP.md
```

**Count ONE file, and count the ROADMAP register rows.** Two traps sit here,
and an earlier draft fell into both. `grep -c` over two file arguments prints
one `file:count` line EACH and never a sum, so there is no number to compare
against the cap — and a shell comparison against `file:2` throws
`integer expression expected`, which in an `if` resolves FALSE: "do not stop"
on the one gate that hands control back to James. Then counting BOTH the
register row and the worklist line double-counts every pull-in, tripping a
cap of three on the SECOND one. The register row is the durable, greppable
home; the worklist line is the human record and is not counted.

That single command re-derives the counter after any compaction. **A cap whose counter lives only
in the controller's context is a heuristic wearing a number** — and pull-ins
are filed OUTSIDE the phase span, where no enumeration pass would ever find
them again.

**The third pull-in stops the close-out.** Report to James and wait. Three
means the freeze was wrong, and re-scoping is his call — the whole point of
freezing is that the slate stops moving without him.

## Phase 4 — close

In order, and the order matters: an earlier draft put "shipped in a tag"
first, then checked main's CI, then asked the PM for the release call —
which cuts a tag, then checks whether main was green, then decides whether to
release. That is RF28 rebuilt, whose measured cost was a tag walked against a
server frozen a version back.

1. **Main's own CI is green.** `gh run list --branch main --limit 5`, and say
   which conclusion the MERGE run reached — not the PR's (RF28). This is also
   step 0 of `docs/RELEASING.md`, which is why it precedes the tag.
2. **Antagonist exit pass** on the exit-criteria evidence and any walk
   protocol.
3. **PM close gate** on the exit criteria against what actually happened,
   tester impact, and **the release call**.
4. **Shipped in a tag.** A phase whose deliverable is not in a released tag
   is not closed. Notes are written from `git log <prev-tag>..main --oneline`
   (NO `--merges`; main is squash-merged and `--merges` returns empty —
   RF15), and every merge in the range gets a note or a stated reason it
   needs none. **This is a hand-back to James** — only he tags and runs
   `ios:release` — and the stop rule names it as one.
5. **Re-check the freeze anchor, then lift.** Re-extract the span and
   `diff docs/closeouts/close-<X>.span.txt -` against it. Expect our own
   ticks and filings; report any row that APPEARED, vanished, or was reworded
   by someone else since the freeze. Then lift every `CARRY` row into the
   live slate or the register, WITH its evidence and what unblocks it.
   Archiving without lifting deletes them.
6. **Archive the body** verbatim to `docs/history/phase-<x>.md`.
7. **One ledger row:**
   `- **Phase X** — one-sentence outcome · closed YYYY-MM-DD · #NNN · released in vX.Y.Z · [detail](docs/history/phase-x.md)`
   No section keeps a second status line.
8. **Release recommendation and the agent-config check**, in one breath:
   "agent configs updated: <what>" or "no change needed: <why>".
9. **Teardown.** `git status` on the MAIN checkout first (stray writes there
   are a repeat failure, AGENTS.md RF20, and are only cheap to fix while the
   branch exists), then
   `docker compose -p <the worktree's ergomatic-NNNNN> down -v` —
   `E2E_KEEP=0` is NOT equivalent, it leaves the `pgdata` volume — then
   remove the worktree.

## The stop rule (countable, not felt)

The close-out ends when **every frozen row is BUILD-merged, DECIDED,
DOC-merged, CARRIED at the lift gate, STRUCK with a receipt, or verified
DONE.** It does not end when the register is empty, and it does not end early
because the deliverable merged.

**Three things end it before that, and each hands control to James:** the
third pull-in, an unanswered DECIDE batch, and the tag hand-back at gate 4.
If you are waiting on any of them, you are stopped — not mid-gate.

## What is deterministic here, and what is not

Say this in the freeze report rather than presenting the whole thing as sound.

- **Deterministic:** span extraction, pass 1 and pass 2 enumeration, the
  `DONE`-against-tree rule, the STRIKE receipt rule, the CI gate, the freeze
  anchor diff.
- **Heuristic:** pass 3, whose recall is bounded by a word list you invented.
- **Heuristic with a durable counter:** the pull-in cap. It false-positives
  when one real invalidation is split across two PR bodies.

## Not for

- **Opening a phase.** That is brainstorming plus a ROADMAP section.
- **Mid-phase work.** Mid-phase requests batch to the close-out; that is what
  this skill consumes, not what it runs during.
- **A phase with no ROADMAP section, or an ambiguous phase code.** Refuse.
- **Fast-path work.** No spec, no register rows, nothing to close.
