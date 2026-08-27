# RC-27 — task brief: the LIVE hero counts the rest

**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/rest-countdown`, branch `rest-hero`, based on `origin/main` at `7872e0b`.
Run everything from there. **Never `cd` to the main checkout.**

**Roadmap entry (the diagnosis):** `ROADMAP.md`, RC-27.
**Approved mockup (James, 2026-08-27):** <https://claude.ai/code/artifact/f164ca2e-e94b-48d1-b406-dc04b6d92090>
**Sibling change, merged yesterday, read it first:** RC-24 in
`docs/superpowers/specs/2026-08-26-rest-countdown-design.md`. This is the same
defect one surface over, and its four wire facts bind here unchanged.

---

## What and why

On the connected surface's LIVE pane during a rest, the split hero shows
`frame.currentSplit` — **the split of a coasting flywheel** — and judges it
against the work interval's target. So the biggest number on the screen can
read `1:57.8` in blue ("faster than target") for a pace nobody rowed, while
three lines below it `AVG 2:08.4` sits in red and is correct, because that is
what the interval the rower just finished actually averaged.

The true number is a third the size of the false one.

**James approved option B: during a rest the split hero becomes the machine's
own rest countdown, in gold, under a `REST` label.** The two things a resting
rower wants — how long left, and how did I just do — become the two largest
numbers on the pane, in that order.

RC-24 fixed the identical defect in the grid's `/500M` cell yesterday. It was
fixed CELL-LOCALLY on purpose, so that this surface would not change inside a
PR James had scoped to the grid. This is that deferred half.

---

## Global constraints (binding)

- **No files under `app/domain/` or `app/server/`.** Client display change. If
  you find yourself needing a domain change, STOP and report it.
- **No stored shape, no persisted type, no migration.**
- **`--accent` is a CONTROL colour and must not appear in a pane.**
  `PaneGrid.test.tsx` carries an "ACCENT CENSUS" that reads every
  `var(--accent)` consumer out of `index.css` and pins the set at exactly
  three. Your new rule uses `--marker`. **Re-run that census and confirm it
  still pins three.**
- **No em-dashes in user-facing strings.**
- **44px hit targets and WCAG AA** are hard requirements. This adds no control;
  say so rather than assuming it.
- TDD: failing test first, every time.

---

## The wire facts — identical to RC-24's, already measured, do not re-derive

Decoded frame-by-frame from `docs/monitor/sessions/walk-2026-08-25/rests-finished-recording.jsonl.gz`.
Full tables are in RC-24's spec. The four consequences:

1. **`state === "resting"` LEADS the countdown by ~1s.** The state flips while
   `restSeconds` still reads a flat `60.00`. A `REST 1:00` that sits still for
   about a second at the top of every rest is CORRECT. Do not suppress it; do
   not write a test forbidding it.
2. **Outside a rest, `restSeconds` is the current interval's PROGRAMMED rest,
   not a sentinel.** It reads `60.00` through all of a work interval that has a
   rest programmed, and `0.00` through one that does not. **`restSeconds` alone
   can NEVER indicate a rest.** Only `state === "resting"` can.
3. **The countdown never reaches `0:00`** — the state flips at `1.91`. No test
   may wait for a zero.
4. **It ticks at `x.91`, so FLOOR.** `Math.round` renders `1:00` where `0:59`
   is correct.

RC-24 already floors this exact field in `buildGridModel`. **Reuse its
formatting expression rather than inventing a second one** — two places
formatting the same wire field is two places that can drift.

---

## THE TRAP — read this before you touch `nowLabel`

`PaneLive.tsx:137` does `const heroLabel = model.nowLabel;` and **renders it
above BOTH heroes** — the split hero (`:212-214`) and the rate hero
(`:272-274`). The comment two lines above says so deliberately: *"BOTH heroes
wear the SAME label (carried forward, I-1): one field, read twice, cannot
disagree with itself the way two re-derivations could."*

**So putting `"REST"` into `nowLabel` would label the STROKE RATE hero `REST`
as well.** That is wrong and it is the obvious naive implementation. Do not do
it.

`nowLabel` today is `stale && !armedMirror ? "LAST SEEN" : ""`
(`surfaceModel.ts:1247`) — it exists to say the link is down, and that claim
genuinely does belong on both heroes.

**Required shape:** leave `nowLabel` alone and give the SPLIT hero its own
label resolution, with `nowLabel` winning when both apply:

- link stale → `LAST SEEN` on both heroes (unchanged, and it must keep winning
  — a lost link beats a running rest, the same precedence `livePace` already
  states at `surfaceModel.ts:646`: *"A LOST LINK BEATS A FROZEN ERG"*)
- otherwise, rest running → `REST` on the split hero only
- otherwise → empty on both, exactly as today

**Pin the negative with a test: while resting, the RATE hero carries no label.**

---

## The changes

### 1. `app/src/workout/connected/surfaceModel.ts`

Add one field to `SurfaceModel`, in the file's existing doc-comment style:

```ts
  /** RC-27: the machine's own rest countdown (`0:59`), floored, for the
   *  LIVE pane's split hero. NON-NULL ONLY while a rest is genuinely
   *  running — see the guard below. `null` is "the hero shows the split",
   *  which is every other moment of a session. */
  restCountdown: string | null;
```

Resolve it where `resting` already exists (`:844`). The guard has **four**
terms and each one is load-bearing:

```ts
  // RC-27. Four terms, none removable:
  //  - `resting` is the ONLY field that can say a rest is running (wire
  //    fact 2 — `restSeconds` reads its programmed value all through work).
  //  - `restSeconds > 0` excludes the zero-rest artifact: a machine can
  //    briefly report `resting` on an interval with no programmed rest,
  //    where this field reads 0.00 and there is nothing to count.
  //  - `!armed` because nothing is counting before the first pull, the
  //    same stance the grid's countdown and pane B's heroes already take.
  //  - `!linkLost` because a countdown frozen at its last value is a false
  //    claim of motion, which is the whole defect class this fixes. While
  //    the link is down the hero keeps its last reading, greyed and
  //    unjudged, exactly as it does today.
```

### 2. `app/src/workout/connected/PaneLive.tsx`

When `model.restCountdown !== null`, the split hero renders:

- the label `REST` (per the trap section — split hero only)
- the countdown as the hero numeral, **with no tenths span** (a countdown has
  no tenths; `paceTenths`'s own `!== ""` guard already renders nothing, so
  confirm the empty case rather than adding a branch)
- **NOT judged.** No `judgedClass` on this value, for the same reason RC-24
  dropped `cellClass` from the grid's rest cell: judging a coast against a
  work target is the defect. It wears `--marker` instead.
- the armed ghost treatment does not apply (the guard already excludes armed)

**Everything below the hero is untouched, pixel for pixel** — the target row,
the AVG cell, the rate hero, the band. The mockup is explicit about this.

**NO MARKER GRAPHIC.** James raised this on the mockup and he is right: the
grid's 4x20 gold bar answers "which of these twelve rows is yours", a question
this pane does not have, because there is only ever one hero. The gold on the
numeral carries the meaning alone. **Do not add a bar, rule, tint, or fill.**

### 3. `app/src/index.css`

One rule for the gold hero value, in the file's commented style. **State the
computed contrast ratio as a number** (recurring failure #6 — a token shipped
here at 3.29:1 once and only an automated scan caught it). Re-derive it from
the token values in `app/src/theme/tokens.css`; do not copy a number from this
brief.

---

## Tests — failing first, every one

**In `surfaceModel.test.ts`:**

1. Resting mid-rest, `restSeconds: 59.91` → `restCountdown === "0:59"`
   (FLOOR — `Math.round` gives `"1:00"`, and this assertion is the only thing
   between the wire and that bug).
2. **Wire fact 2, the most important negative:** `state: "rowing"` with
   `restSeconds: 60` → `restCountdown === null`. And again with
   `restSeconds: 0` → `null`.
3. Rest entry dwell (wire fact 1): `resting` with `restSeconds: 60` →
   `"1:00"`, and the same `60` while `rowing` → `null`. That pair is the
   point: legitimate during a rest, a bug during work.
4. Zero-rest artifact: `resting`, `restSeconds: 0` → `null`.
5. Armed beats resting → `null`.
6. **Link lost beats resting** → `null`, and `nowLabel` is still `LAST SEEN`.

**In `PaneLive.test.tsx`:**

7. Mid-rest the split hero renders the countdown, gold, under a `REST` label.
8. **The rate hero carries NO label while resting** (the trap's negative).
9. **The countdown is NOT judged**: put the model in a rest with a `pace`
   whose judgement would normally tint the hero, and assert no
   `timer-card-actual-` class survives on the hero value. Assert the
   consequence, not that a branch exists (recurring failure #4).
10. **During work the hero is unchanged** — same split, same judged tint, no
    label, no gold.
11. **Link lost while resting** → `LAST SEEN` on both heroes and the hero
    shows the split, not a countdown.
12. Re-run the ACCENT CENSUS; confirm it still pins three.

**Fixtures must look like production** (recurring failure #3): a real
rest-bearing program from the seeded library, mid-rest — not a hand-made model.
RC-24's tests do this; follow them.

---

## Gates — all of them, and report the numbers

From `app/`: `pnpm lint` · `pnpm typecheck` · `pnpm test` ·
**`pnpm e2e`** (mandatory, your diff touches `app/src/`) ·
**`pnpm screenshots`** (mandatory, this changes a screen).

Run them in the FOREGROUND or poll them yourself. **Do not stop mid-task
waiting on a background command** — that happened on RC-24 and cost a round.

- **Per-file coverage** for every file you touch. The 90% gate is repo-wide and
  a new branch can ship uncovered while it passes (recurring failure #2).
- **A capture that actually shows the feature.** There is no LIVE-pane-resting
  screenshot in `docs/screenshots/` today; add one. Then OPEN it and say what
  you saw. A capture of a work interval proves nothing here (recurring failure
  #7). If the seeded scenario never enters a rest, say so plainly rather than
  committing a capture that does not show the change.
- **Prove any new gate can go RED.** RC-24 shipped two gates that could not —
  a `min-width` on a non-flex-item, and a check measuring an inline element
  whose `scrollWidth` is always 0. Mutate and show the failure.

---

## Deliberate omissions — do not "fix" these; challenge them in your report if you disagree

- **The rate hero shows `0` during a rest.** Honest (nobody is pulling), and
  out of scope. James was shown it and left it.
- **`livePace` itself is NOT touched.** The suppression is local to this
  pane's hero. If you find yourself editing `surfaceModel.ts`'s `livePace`
  function, stop.
- **The grid is finished** (RC-24, merged). Do not revisit it.

---

## Report contract

Write your full report to
`docs/superpowers/plans/2026-08-27-rest-hero-report.md` and return only:
status (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED` / `NEEDS_CONTEXT`), commit
SHAs, a one-line test summary, and concerns.

The report carries the gate outputs, per-file coverage, what the capture
actually shows, the contrast ratio you re-derived, and anything in this brief
you found to be wrong. **If the brief contradicts what you observe in the code,
say so rather than working around it silently** (recurring failure #10).

**Before every commit run `git rev-parse --show-toplevel`** and confirm it
prints the worktree path above. Do not dispatch subagents of your own. Do not
open a PR, merge, or remove the worktree.
