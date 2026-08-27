# RC-27 — task report: the LIVE hero counts the rest

Worktree: `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/rest-countdown`
Branch: `rest-hero`. Commits: `d615277`, `b6a389c`, `27b5425` (initial task);
`9a0edae` (fix round 1, below).

## What changed

- `app/src/workout/connected/surfaceModel.ts` — new `SurfaceModel.restCountdown:
  string | null` field. Non-null exactly when `resting && frame.restSeconds > 0
  && !armedMirror && !stale`, formatted with RC-24's own expression
  (`fmtDuration(Math.floor(frame.restSeconds) / 60)`) so both surfaces floor the
  same wire field the same way.
- `app/src/workout/connected/PaneLive.tsx` — the split hero gets its own label
  resolution (`nowLabel` wins when stale, then `REST`, then empty); the rate
  hero keeps reading `nowLabel` alone, unchanged (the brief's own trap). When
  `restCountdown !== null` the split hero's numeral is the countdown, wearing
  `connected-hero-value-rest` instead of the judged/ghost class chain, with no
  tenths span.
- `app/src/index.css` — `.connected-hero-value-rest { color: var(--marker); }`.
  No bar/rule/fill (James's ruling on the mockup).
- `app/src/workout/ConnectedSurface.screens.test.tsx` /
  `app/e2e/screenshots.spec.ts` — new fixture + registered capture,
  `connected-pane-live-resting` (portrait + landscape).
- Tests: `surfaceModel.test.ts` (6 new cases), `PaneLive.test.tsx` (7 new
  cases, one split into two per the finding below).

## THE TRAP — handled as specified

`heroLabel` (= `model.nowLabel`) is unchanged and still drives the rate hero.
A new `splitHeroLabel` local governs the split hero alone:
`heroLabel !== "" ? heroLabel : model.restCountdown !== null ? "REST" : ""`.
Pinned negative: `PaneLive.test.tsx` "THE TRAP, pinned as a negative: the rate
hero carries NO label while resting" — passes.

## A finding: the brief's own motivating example does not reproduce in current code

The brief opens: *"the split hero shows `frame.currentSplit`... and judges it
against the work interval's target. So the biggest number on the screen can
read `1:57.8` in blue... for a pace nobody rowed."* ROADMAP.md's RC-27 entry
makes the same claim ("that value feeds the LIVE pane's hero — the biggest
number on the screen, and JUDGED").

I verified this against the code and it is **only half true**. `livePace`
does pass `frame.currentSplit` straight through during a rest (unchanged,
confirmed) — but the **judging target** is a different story.
`buildSurfaceModel`'s `targetSplitSeconds` (which feeds `paceJudgeTarget`,
the value the pace hero is judged against) is derived from `phase`, and
`phase = phases[phaseIndexForInterval(phases, intervalIndex, resting)]`.
`phaseIndexForInterval`'s own resting rule (`surfaceModel.ts:253`) folds onto
the REST phase itself whenever one exists — i.e. whenever `restSeconds > 0`,
which is exactly the condition `restCountdown` fires on. A REST-type `Phase`
never carries `targetKind` (`domain/expand.ts:21`, "work phases only"), so
`targetSplitSeconds` is `null`, `paceJudgeTarget` is `null`, and
`judgedValue` resolves that to `"within"` — plain ink, no colour — for
**every** case my `restCountdown` guard can fire on. I confirmed this
empirically (a scratch harness with `currentSplit: 80` against a real target
of ~2:06, `state: "resting"`, `restSeconds: 30` — `pace.judgement` came back
`"within"`, not a real verdict) before writing the test.

This does **not** change what RC-27 needed to build — the number itself
(unlabelled, capable of being mistaken for a real reading) is still the
defect, colour or not, and the brief's own required shape (replace the
numeral outright, never judge it) already covers both cases regardless of
which one is live today. It changes only the *severity* of the motivating
example. I recorded this in `PaneLive.test.tsx` as an explicit finding
(the "realistic mid-rest hero carries no judgement class at all" test) rather
than silently building a test around a false premise, and added a second test
that forces the combination `buildSurfaceModel` cannot currently produce
(a genuinely judged pace alongside a countdown, via a hand-constructed
override) so the render layer's own "never judge the countdown" rule is
pinned independently of that fact, per this repo's own precedent for
under-read premises (`CLAUDE.md` recurring failure #16's second corollary).

**I did not change `surfaceModel.ts`'s judging logic** — out of scope, and
the brief did not ask for it. Flagging this only because "the brief
contradicts what you observe" per recurring failure #10.

## Gates

All run in the FOREGROUND or polled to completion (never left running while I
stopped my turn).

- `pnpm lint` — clean.
- `pnpm typecheck` — clean.
- `pnpm format:check` — clean.
- `pnpm test` / `pnpm test:coverage` — 210 files, 5665 tests passed, 1 skipped
  (pre-existing skip, unrelated). One transient red run (1 failed) occurred
  mid-session while other e2e/docker activity was running concurrently in the
  background; three subsequent clean runs (5665/5665) with nothing else
  running confirm it was resource-contention noise, not a real regression —
  I did not identify which test flaked (the log line scrolled past before I
  thought to capture it) and note that as a gap rather than asserting a cause
  I cannot back.
- `pnpm e2e` — **414/414 passed** on a freshly rebuilt image + a freshly
  reset DB volume (`docker compose ... down -v` then up). Two runs against
  the pre-existing (9-hour-old) DB volume from earlier in this session had
  shown 2 failures in `e2e/retest.spec.ts` (Phase BL's re-test shortcut,
  "SESSION SAVED"/"Set your 2k baseline?" — a screen this diff never
  touches); both passed cleanly in isolation (3/3, 1.5s) and both disappeared
  entirely once the volume was reset, which is consistent with accumulated
  test-account state from repeated runs against a long-lived per-worktree
  volume, not a code defect. Recorded per recurring failure #10/#14 rather
  than silently reset-and-move-on.
- `pnpm screenshots` — 80/81 passed, both new orientations of
  `connected-pane-live-resting` among them. The one failure,
  `log-detail` (`e2e/screenshots.spec.ts:2254`, expects
  `"4:04 total · plus 242 m coasting in rest"`, gets `"2:04 total"`), is
  **unrelated to this diff**: it exercises `src/session/summaryModel.ts`'s
  rest-coasting total line, zero files this branch touches. I confirmed:
  (1) zero file overlap between my diff and the code path this test
  exercises; (2) it reproduces identically against a **freshly rebuilt image
  and a freshly reset DB volume**, immediately after a clean 414/414
  `pnpm e2e` run against that same fresh volume — so it is not DB-state
  pollution either; (3) bundle identity is confirmed (`curl`'d the served
  JS bundle, `connected-hero-value-rest` — my new class — is present, so
  the image is not stale). This reads as a pre-existing defect on `main`
  (base `7872e0b`) that this task's scope does not cover — I did not
  investigate or fix it further, per the fast-path/scope discipline
  (`summaryModel.ts` is out of RC-27's brief entirely). Flagging it rather
  than silently working around it.

## Per-file coverage (files touched)

From `pnpm test:coverage`'s v8 text reporter (repo-wide 90% gate; per-file
numbers below per recurring failure #2):

| File | Stmts | Branch | Funcs | Lines | Uncovered |
|---|---|---|---|---|---|
| `src/workout/connected/surfaceModel.ts` | 98.82% | 95.85% | 100% | 98.68% | 221-222 (pre-existing exhaustive-`default` arm, unrelated to this change) |
| `src/workout/connected/PaneLive.tsx` | 100% | 100% | 100% | 100% | — (confirmed via `coverage/src/workout/connected/PaneLive.tsx.html`, since the text reporter omits fully-covered files — the source the agent-briefing calls authoritative) |

`app/src/index.css` and the new `ConnectedSurface.screens.test.tsx`
fixture-generation test are not JS coverage targets. Every new branch in
`surfaceModel.ts` (the 4-term `restCountdown` guard) and every new branch in
`PaneLive.tsx` (label precedence, judged-class suppression, tenths
suppression) is covered — confirmed both by the coverage report and by the
mutation sweep below, which is a stronger claim than line coverage alone.

## Self-mutations (9), each broken → tests failed → restored → tests passed

All performed with a `cp` backup + restore + `diff` verifying a byte-identical
restore before moving to the next mutation.

1. **`restSeconds > 0` → `>= 0`** (drops the zero-rest-artifact guard):
   `surfaceModel.test.ts`'s "zero-rest artifact" test failed
   (`restCountdown` became `"0:00"` instead of `null`). Restored clean.
2. **Dropped `!armedMirror`**: "armed beats resting" failed (`"0:59"` instead
   of `null`). Restored clean.
3. **Dropped `!stale`**: "a lost link beats a running rest" failed in BOTH
   `surfaceModel.test.ts` and `PaneLive.test.tsx` (the link-lost countdown
   leaked through). Restored clean.
4. **`Math.floor` → `Math.round`** (restCountdown's own expression): "mid-rest:
   floors" failed, `"1:00"` instead of `"0:59"`. Restored clean.
5. **`splitHeroLabel` collapsed to bare `heroLabel`** (drops the REST claim
   entirely): "mid-rest... REST label" failed (label element not found).
   Restored clean.
6. **THE TRAP itself — split hero's guard copied onto the rate hero's label
   span**: "THE TRAP, pinned as a negative" failed (rate hero grew a
   `<span class="connected-hero-label">`). Restored clean.
7. **`paceValueClass`'s `resting ?` branch removed** (always calls
   `judgedClass`): three tests failed at once — the mid-rest gold-class
   assertion, the "no judgement class" test, and the forced-combination test
   (`timer-card-actual-within`/`-faster` leaked through in each). Restored
   clean.
8. **Tenths guard's `!resting &&` removed**: "mid-rest... REST label" failed,
   text became `"0:59.8"` instead of `"0:59"` — exactly the leaked-tenths
   bug the brief's "confirm the empty case" note warns about. Restored clean.
9. **CSS**: (a) added `border-left: 3px solid var(--marker)` to
   `.connected-hero-value-rest` — the "no bar/rule/fill added" test failed.
   Restored clean. (b) changed the rule's color to `var(--accent)` — BOTH my
   own CSS test AND `PaneGrid.test.tsx`'s pre-existing ACCENT CENSUS caught
   it (census grew a fourth class). Restored clean, confirmed byte-identical
   via `diff`.

Every mutation broke the test it was meant to guard and nothing else studied
in isolation; none survived.

## Contrast

`--marker` (`#7d5510`) on `--page` (`#f4f1e8`) — the background
`.connected-pane`/`.connected-surface` inherit with no override (`body {
background: var(--page) }`, confirmed no intervening rule sets a different
background on this pane). Re-derived independently from the WCAG relative
luminance formula (not copied from RC-24's own figure for a different
background pair — `--surface-sunken`): **5.85:1**, matching `tokens.css`'s
own comment on `--marker` for this exact pairing (cross-check, not the
source of the number). Clears the 4.5:1 text floor comfortably; the hero
numeral is also large enough to qualify as WCAG "large text" (3:1) on its
own, so this clears both applicable floors with margin either way.

## What the new screenshot shows

Opened `docs/screenshots/connected-pane-live-resting.png` (portrait) and
`connected-pane-live-resting-landscape.png` — both real captures, not a work
interval (recurring failure #7). Portrait: header reads `2 OF 5 · REST`; the
split hero shows a large gold `0:59` under a `REST` label; beneath it,
unchanged, `2:06.0 6K +4` and `AVG 2:08.4` in red (AVG is still correctly
judged — the brief's own "two largest numbers, in that order" promise, both
present); the rate hero shows `21` / `Free` / `SPM` in plain ink with no
label at all (the trap, visually confirmed); no gold anywhere else on the
pane (no bar, no fill). Landscape shows the identical facts side-by-side.
Recomputed by eye: this is genuinely the frame `restSeconds: 59.91` decodes
to floored (`0:59`, not `1:00`), and the `AVG 2:08.4` figure matches the
`splitAvgPace: 128.4` the fixture sets — no cross-frame arithmetic
contradiction (recurring failure #7's own check).

There was no LIVE-pane-resting capture in the repo before this task; this is
the first one, registered in `CONNECTED_STATES` for both orientations going
forward.

## ACCENT CENSUS

`PaneGrid.test.tsx`'s "THE ACCENT CENSUS" ran unmodified and still pins
exactly three classes (`connected-end`, `connected-paused-end`,
`connected-paused-end-armed`) — confirmed green in every full-suite run, and
confirmed it actually bites via mutation 9(b) above (repointing my new rule
at `--accent` grew the set to four and failed the census immediately).

## DEVIATIONS.md

Checked for a row describing pane B's split hero behaviour during a rest, to
reconcile per recurring failure #9. Found none — the one row that describes
the analogous grid behaviour (row 79, "the interval countdown is a bare
numeral with no label") is scoped entirely to `GridRow.countdown` /
`.connected-grid-*` classes (RC-24's own mechanism), never pane B's hero.
Nothing existing needed reconciling; no new row added since this change
follows an approved artifact mockup, not a deviation from a written handoff
section.

## 44px targets / WCAG AA

No control added — confirmed by reading the diff: the new element is a
`<span>` with no interaction, same as the split hero it replaces. Said
plainly per the brief's instruction rather than assumed.

## Agent config check

Non-fast-path change (touches `app/src/`, more than one file, TDD/self-
mutation/full gates all ran) — checking whether this taught the next agent
anything: the "verified sourced premise" finding above is exactly recurring
failure #16's second-corollary shape (an under-read citation, not an
unsourced one) and is already fully covered by that existing entry; no new
CLAUDE.md rule needed. No ledger entries proposed — this was not a
TRIAD-weight change (no domain/server files, no stored shape, no auth; a
display-only fix confirmed against `CLAUDE.md`'s own TRIAD definition), so
neither `antagonist` nor `product-manager` ran, per the standing rule that
neither runs on non-TRIAD, non-phase-boundary work.

## Release / worktree

Not mine to call — no PR opened, no merge, no worktree removal, per the
brief's explicit instructions.

---

## Fix round 1 (James's four optionals, all taken)

Review verdict: SPEC COMPLIANCE PASS, CODE QUALITY APPROVED, no must-fixes.
Commit `9a0edae`.

### Item 1 — nothing proved the gold actually paints

**The gap, exactly as named:** `PaneLive.test.tsx` asserted the class was on
the element and, separately, that `index.css`'s SOURCE TEXT contains
`var(--marker)`. Neither resolves a colour — jsdom loads no stylesheet — so a
later rule that out-ranked or followed `.connected-hero-value-rest` would
leave both green while the hero painted black.

**Fix:** added `e2e/design.spec.ts`'s `2A/2C — LIVE, mid-rest (RC-27)`
describe block (two tests, portrait + landscape), loading the real
`connected-pane-live-resting` fixture through the real app shell and reading
`getComputedStyle(...).color` on `.connected-hero-split .connected-hero-value`
— the identical technique RC-24's own grid rest-countdown check already uses
(`restCellColor`, `toBe("rgb(125, 85, 16)")`).

**Proved it can go red:** mutated `.connected-hero-value-rest`'s `color` from
`var(--marker)` to `var(--ink)`, rebuilt the served bundle
(`docker compose ... build`, confirmed by a changed CSS asset hash
`index-DGhkCCcw.css` → `index-DDaDoOZW.css`), and ran the new portrait test in
isolation:

```
Expected: "rgb(125, 85, 16)"
Received: "rgb(27, 26, 23)"
```

Restored, rebuilt (hash returned to `index-DGhkCCcw.css`, confirming
byte-identical restore), reran — both tests green.

### Item 2 — a precedence branch no test could distinguish

**The gap:** `buildSurfaceModel` can never produce `nowLabel !== ""` and
`restCountdown !== null` simultaneously (`restCountdown`'s guard requires
`!stale`; `nowLabel` requires `stale`) — mutually exclusive by construction.
So `PaneLive.tsx`'s `splitHeroLabel` ternary order was asserted by comment
only; flipping it to `restCountdown !== null ? "REST" : heroLabel` would pass
every real-model test in the suite.

**Fix (option a, James's preference):** added
`PaneLive.test.tsx`'s "the precedence itself is falsifiable" test — builds a
real resting model via `buildSurfaceModel`, confirms it genuinely carries a
non-null `restCountdown` and an empty `nowLabel` (sanity), then FORCES
`nowLabel: "LAST SEEN"` onto that same object and renders it directly,
asserting the split hero's label reads `LAST SEEN`, not `REST`. Trimmed the
comment above the ternary to name this test rather than re-argue the
precedence in prose.

**Proved it bites:** flipped the ternary to
`model.restCountdown !== null ? "REST" : heroLabel`, reran
`PaneLive.test.tsx` — exactly one test failed, the new one:

```
Expected: "LAST SEEN"
Received: "REST"
```

The other 46 tests in the file stayed green, confirming the coordinator's own
claim that no existing test could see this. Restored, reran — 47/47 green.

### Item 3 — the capture's frame is one the PM5 cannot emit

**The gap:** `state: "resting"` with `rowingActive: true` (inherited from
`liveFrame`'s mid-work default) and `spm: 21` — the committed picture showed
a rower pulling 21 spm during a rest, contradicting the brief's own "the rate
hero shows 0 during a rest."

**Fix, chose coherence over documenting the incoherence** (cheap enough):
`rowingActive: false`, `spm: 0` — honest. This alone would trigger
`midSessionMirror` (`rowingActive === false && distanceMeters <=
MID_SESSION_RESET_METERS(1)`), substituting `paceActual = 0` and masking the
coasting split this capture exists to disprove is still shown — the exact
trap the fixture's own new comment names. Landed on a small, genuinely
self-consistent frame instead of the round-1 zero/zero pair:
`distanceMeters: 20`, `elapsedSeconds: secondsFor(20)` (5.136 s, this file's
own existing helper — `(meters/500) * FIXTURE_AVG_SPLIT`). This clears the
1 m mirror floor, keeps `assertFramePossible`'s `elapsedSeconds <=
phaseSeconds(REST phase)` bound honest (5.136 s well under Filling Low's 180 s
rest — `state: "resting"` folds the phase lookup onto the REST phase, which
is ALWAYS time-priced at its own duration, so `liveFrame`'s own 205.44 s
WORK-interval clock would have failed this bound for a reason unrelated to
this task, which is what the round-1 zeroing was actually dodging), and keeps
`splitAvgPace`'s own metres-over-clock consistency check honest against
`FIXTURE_AVG_SPLIT`. Full reasoning is in the fixture's own doc comment
(`ConnectedSurface.screens.test.tsx`, "pane B, mid-rest (RC-27)").

Regenerated the fixture (`toMatchFileSnapshot`, snapshot rewritten) and both
PNG captures. **Reopened both images:**

- `connected-pane-live-resting.png` (portrait): identical to round 1 except
  the rate hero now reads `0` / `Free` / `SPM`, plain ink, where it read `21`
  before — the fix's own visible consequence. Split hero unchanged: gold
  `0:59` under `REST`, target `2:06.0 6K +4`, `AVG 2:08.4` in red.
- `connected-pane-live-resting-landscape.png`: same facts, side-by-side
  layout, same `0` on the rate hero.

No other visible element changed. Ran the regenerated captures through the
full `pnpm screenshots` gate (below) — both pass; both are the images now
committed.

### Item 4 — the RC-24 reuse was textual, not structural

**The gap:** `fmtDuration(Math.floor(frame.restSeconds) / 60)` was repeated
verbatim at both call sites (the LIVE hero, the grid's active-row cell) — the
brief's own cited risk ("two places formatting the same wire field is two
places that can drift") was only half-retired: nothing pinned that the two
outputs actually AGREE off the same frame.

**Fix:** extracted `formatRestCountdown(restSeconds: number): string`
(exported, `surfaceModel.ts`, doc comment carries the floor-not-round
reasoning and names the drift risk), and pointed both call sites at it. Added
`surfaceModel.test.ts`'s "the hero and the grid cell agree" test: builds ONE
`buildSurfaceModel` call on a resting frame, reads
`model.restCountdown` and `model.grid.rows[model.grid.activeIndex]
.restCountdown`, asserts both are non-null AND `toBe` each other (not merely
`toEqual` — this is a string identity check, not a shape check). Also added a
direct unit test on `formatRestCountdown` itself (floor vs round at 59.91,
60, 1.91).

**Proved the drift test bites, and that the extraction is REAL (not just
textual):**

- Mutated only the grid call site back to an inline
  `fmtDuration(Math.round(restSeconds) / 60)` (reintroducing exactly the
  textual-duplication shape this item complains about, with a deliberate
  divergence): the pre-existing RC-24 floor test AND the new drift test both
  failed —
  ```
  RC-24 ... "mid-rest: floors..."   expected '1:00' to be '0:59'
  RC-27 ... "the hero and the grid cell agree"   expected '0:59' to be '1:00'
  ```
  Restored, reran — 145/145 green.
- Mutated the SHARED function itself (`formatRestCountdown`'s own
  `Math.floor` → `Math.round`): **both** call sites broke together (proving
  genuine sharing, not two copies that happen to read alike right now) —
  three tests failed (the RC-24 floor test, the RC-27 floor test, the new
  `formatRestCountdown` unit test) — and the drift test itself **stayed
  green**, correctly: the two sides still agreed with each other, just both
  wrong. This is the expected, discriminating result — a drift test can only
  ever catch the two sides DISAGREEING, never a shared bug, which is exactly
  why the standalone `formatRestCountdown` unit test exists alongside it.
  Restored, reran — 145/145 green.

## Fix round 1 — gates

All run in the foreground or polled to completion.

- `pnpm lint` / `pnpm typecheck` / `pnpm format:check` — clean.
- `pnpm test` / `pnpm test:coverage` — 210 files, 5668 tests passed, 1 skipped
  (same pre-existing skip; up from 5665 by the 3 new tests: the precedence
  test, the drift test, the `formatRestCountdown` unit test — the two new
  `design.spec.ts` tests run under `pnpm e2e`, not this suite). Stable across
  two consecutive runs, no flakes this round.
- `pnpm e2e` — **416/416 passed** (up from 414 by the two new computed-colour
  tests), fresh full run against the already-clean per-worktree stack.
- `pnpm screenshots` — 80/81, identical shape to the initial task's own gate:
  the two new `connected-pane-live-resting`/`-landscape` runs both pass with
  the regenerated (item 3) captures; the one failure is the SAME pre-existing
  `log-detail` defect James is filing separately — untouched, not
  re-investigated, per his explicit "do not touch" instruction.
- Reverted unrelated PNG churn from full-suite `pnpm screenshots` runs before
  each commit (`git checkout --` on every screenshot this branch didn't
  actually change) — same discipline as the initial task, so the diff stays
  scoped to what this fix round touched.

## Fix round 1 — per-file coverage (files touched or added to)

| File | Stmts | Branch | Funcs | Lines | Uncovered |
|---|---|---|---|---|---|
| `src/workout/connected/surfaceModel.ts` | 98.83% | 95.85% | 100% | 98.69% | 221-222 (same pre-existing exhaustive-`default` arm, unrelated) |
| `src/workout/connected/PaneLive.tsx` | 100% | 100% | 100% | 100% | — (via `coverage/src/workout/connected/PaneLive.tsx.html`, same authoritative source as the initial report) |

`e2e/design.spec.ts` and `ConnectedSurface.screens.test.tsx` are test files,
not coverage targets; their own bite is proven by the mutations above, which
is the standard this repo actually holds test changes to (§13,
docs/TESTING.md).

## Fix round 1 — what I did not touch

Per James's explicit instruction: the r0 case (an interval with zero
programmed rest gets no rest phase, so a brief `resting` there renders the
coast JUDGED against a work target) and the `log-detail` screenshots failure.
Both are his to file; neither is in this branch's diff.
