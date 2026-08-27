# RC-24 — implementation report: the grid says a rest is running

Worktree: `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/rest-countdown`,
branch `rest-countdown`. Implemented per
`docs/superpowers/plans/2026-08-26-rest-countdown-brief.md` against
`docs/superpowers/specs/2026-08-26-rest-countdown-design.md`.

## What changed

- **`app/src/workout/connected/surfaceModel.ts`**
  - `GridRow.countdown` widened from `"time" | "meters" | null` to
    `"time" | "meters" | "rest" | null`; new field
    `GridRow.restCountdown: string | null`, non-null exactly when
    `countdown === "rest"`.
  - `buildGridModel` gains two args, `resting: boolean` and
    `restSeconds: number`, threaded from the call site.
  - Active-row branch: `restingNow = !armed && resting && restSeconds > 0`.
    When true, `countdown` is `"rest"` (overriding the interval's own
    dimension) and `restCountdown` is `fmtDuration(Math.floor(restSeconds) / 60)`
    — floored, per wire fact 4. `armed` still wins over everything.
  - Completed/upcoming branches: `restCountdown: null` added as the
    required sibling of their existing `countdown: null`.
  - Call site (`buildSurfaceModel`, the `buildGridModel({...})` call):
    passes `resting` (the function's own pre-existing local,
    `frame.state === "resting"`) and `restSeconds: frame.restSeconds`.
  - Comments reconciled: the `GridRow.countdown` doc comment, the `armed`
    argument's own comment (gained one sentence noting a running rest also
    claims the mark), and two new doc comments for `resting`/`restSeconds`.

- **`app/src/workout/connected/PaneGrid.tsx`**
  - `countdownClass`'s parameter widened to `"time" | "meters" | "rest"`
    (brief item 2a) — not currently called with `"rest"` since the rest
    branch checks `row.countdown === "rest"` directly, but kept in step
    with the widened `GridRow.countdown` union for a caller that reads
    the signature rather than the body.
  - Row `className` gains `connected-grid-resting` when
    `row.countdown === "rest"`.
  - The `/500M` cell branches: when resting, renders
    `<span class="connected-grid-pace connected-grid-rest-countdown">` with
    a `REST` word span (`connected-grid-rest-word`) and the countdown
    value, un-judged (no `cellClass` call) — the coast-verdict fix. The
    ordinary judged pace cell renders otherwise.
  - Header comment gained a short RC-24 paragraph noting the `/500M`
    cell's second form.

- **`app/src/index.css`** — new rules near `.connected-grid-countdown`
  (`.connected-grid-active.connected-grid-resting` sinks the row;
  `.connected-grid-rest-countdown` gold + `white-space: nowrap`;
  `.connected-grid-rest-word` at `--c-size-thead`), with the contrast
  ratios re-derived in the rule comment (see below). Verified the
  landscape media query at `:8196` does not redeclare
  `.connected-grid-active`'s background anywhere — the compound selector
  `.connected-grid-active.connected-grid-resting` (specificity 0,2,0)
  wins over the single-class base rule (0,1,0) regardless of source
  order or orientation, so no `!important` and no landscape-specific
  override was needed.

- **`app/src/workout/connected/surfaceModel.test.ts`** — new describe
  block, 7 tests (brief's cases 1–7), built on `buildSurfaceModel` (not
  `buildGridModel` directly) so the call-site wiring at `:1310` is
  exercised, not just the function in isolation. Also fixed the file's
  own DEVIATIONS-adjacent comment is untouched; no other file changes
  needed there.

- **`app/src/workout/connected/PaneGrid.test.tsx`** — new describe block,
  3 tests (brief's cases 8–10); the existing ACCENT CENSUS tests
  (case 11) were re-run unmodified and still pass (see Gates). One
  existing direct `buildGridModel(...)` call (the "AN before a vowel"
  distance-caption test) updated to pass `resting: false, restSeconds: 0`
  — required by the widened signature, not itself part of the feature.

- **`app/e2e/design.spec.ts`** — one new structural test (brief's case 12,
  see "The e2e test" below), plus a `RESTING_STORY` fixture and a local
  `WORKOUTSTATE_RESTING = 3` constant.

- **`app/src/index.css`, fix round** — `.connected-grid-rest-countdown`
  gained `min-width: max-content` after the e2e no-clip test caught a
  real clip at a production-reachable rest length; see "The clip this
  test found" below.

- **`app/src/workout/ConnectedSurface.screens.test.tsx`** — one new
  snapshot test, "pane C, the grid mid-rest (RC-24)", generating
  `e2e/fixtures/connected-pane-grid-resting.html` so `pnpm screenshots`
  has a genuine resting state to photograph (none of the pre-existing
  fixtures show one).

- **`app/e2e/screenshots.spec.ts`** — registered
  `"connected-pane-grid-resting"` in `CONNECTED_STATES`, which is all a
  new state of an already-registered screen needs (both orientations,
  the 44px/AA sweeps, capture) — no bespoke per-name block added, since
  none of the existing ones' special-cased assertions apply to this
  state.

- **`docs/screenshots/connected-pane-grid-resting.png` /
  `-landscape.png`** — new, committed captures; see "What the captures
  actually show" below.

- **`docs/design/DEVIATIONS.md`** — the row describing
  `GridRow.countdown: "time" | "meters" | null` reconciled to the widened
  union, with a sentence on the new rest-state form (recurring failure
  #9).

## The e2e test — how it reaches a genuine resting state

The brief's case 12 asks for a no-clip check at the narrowest supported
portrait width. Rather than DOM-injecting text into an otherwise-inert
cell (the pattern the file's own two, older no-clip tests use for
`.connected-grid-num`/`.connected-grid-meters`), I drove the fake
transport into a REAL resting frame:

- `src/monitor/transports/fake.ts`'s `FakeStatusEvent.restSeconds` is a
  real, scriptable field, forced to `0` unless `workoutState` maps to
  `"resting"` (its own doc comment) — so a scripted `workoutState: 3`
  (`WORKOUTSTATE_INTERVALREST`) tick with `restSeconds: 3599` produces an
  honest `frame.state === "resting"`, `frame.restSeconds === 3599` pair,
  the same shape `buildGridModel` reads in production.
- `domain/monitor/pm5/intervalIndex.ts`'s `toProgramIndex` is a pure
  function of `(machineIndex, machineState, programLength)` with no
  session history — confirmed by reading it — so a script can open
  directly on a resting tick with `programIntervalIndex: 0` (the fake
  applies `toMachineIndex(0, "resting") = 1` going out, the driver's
  `toProgramIndex(1, "resting", 5) = 0` coming back) and land the rest on
  the SAME interval a preceding rowing tick already put the active row
  on, with no boundary event and no programmed-rest guard
  (`boundaryBundle`'s "put a resting tick before this boundary" check)
  in play at all, because no boundary event is ever sent.
- `restSeconds: 3599` (59:59) is deliberately far past anything this
  app has ever captured (measured max in the walk capture: 60s) —
  the same "prove the layout survives worse than the wire will ever
  send" philosophy this file's own `EXTREME_SPLIT_STORY` already uses for
  a different cell.

The test: 390×844 (this file's own standing "narrowest supported
portrait" convention, used at 8+ other call sites), clicks Grid pane
before the story's resting tick even fires (a UI action, not a wire
event), pumps on `.connected-grid-rest-countdown` appearing, then reads
`scrollWidth`/`clientWidth` off the cell itself and off
`document.documentElement`, plus the exact rendered string
(`"REST 59:59"`) and the row's `connected-grid-resting` class — measured,
not eyeballed.

## The clip this test found, and the fix (not a shrink-the-type dodge)

The first `pnpm e2e` run went RED on this exact test:
`cellScrollWidth` 95 vs `cellClientWidth` 72 at 390px — a genuine 23px
overflow, not a synthetic failure. Before treating `restSeconds: 3599`
as an unrealistic stress value (which the brief's own "don't silently
shrink the type" line would have let me wave off as out of scope), I
checked whether it is actually reachable in production:
`domain/validate.ts:106-108` bounds an authored work step's
`restMinutes` at `wholeSecond(s.restMinutes, SECOND, 60)` — **0:01 to
60:00 inclusive** — so `REST 59:59` is a rest a rower can genuinely
author through the builder today, not a corner case invented for the
test. That makes the clip a real defect in what I shipped, not a
finding to merely note.

Fix (`app/src/index.css`, `.connected-grid-rest-countdown`): added
`min-width: max-content`, overriding the `min-width: 0` this cell
inherits from `.connected-grid-pace`'s base rule. Flexbox's shrink
phase now takes the deficit out of the row's OTHER cells (which keep
`min-width: 0`) instead of this one, so the fix scales to any digit
count a real rest can produce rather than being tuned to the one
measured worst case — deliberately NOT a font-size reduction, which
would have contradicted the spec's own stated reason for the number's
size ("the number is what is read"). Verified safe against the existing
structural pin: `scopedRuleBodies` (`src/test/cssView.ts`) matches on
exact selector-list membership, not substring, so this fix's selector
(`.connected-grid-rest-countdown`, already scoped to the rest state
only) cannot be picked up by `PaneGrid.test.tsx`'s own
`baseRule(".connected-grid-pace")` pin (`flex: 1.1;`, unconditional) —
confirmed by reading `scopedRuleBodies`'s matching logic, not assumed.
Re-ran the single failing test after the fix: green. Full `pnpm e2e`
re-run after: 413/413 green (see Gates).

## Gates

All run from `app/`, Node 26 (`PATH` prefixed with
`$HOME/.local/share/nvm/v26.5.0/bin`).

- `pnpm lint` — clean.
- `pnpm typecheck` — clean.
- `pnpm format:check` — clean (one file needed `pnpm format` after the
  first test-writing pass; re-verified clean after).
- `pnpm test` — 210 test files, 5647 passed, 1 skipped (run repeatedly
  to confirm green; one early run showed 1 failure — `retest.spec.ts`,
  see below — that did not reproduce across several subsequent
  full-suite runs and touches nothing in this diff).
- `pnpm e2e` — **413/413 passed** (second full run, after the CSS fix
  above; the first full run had exactly one failure, the RC-24 no-clip
  test itself, fixed as described above). One test elsewhere
  (`retest.spec.ts`'s "declining the offer keeps the baselines
  untouched") failed once, in the FIRST run only, on a screen this diff
  never touches (`Set your 2k baseline?`) — a pre-existing flake, not
  investigated further; it passed clean in the second full run.
- `pnpm screenshots` — **77/79 passed.** The 2 failures are pre-existing
  and unrelated to RC-24: `releases` expects a hardcoded `v0.23.0` pin
  against a repo that has since shipped v0.24.0 release notes (already
  on this branch's base commit, `74873c8`, before RC-24 started); `log-
  detail` expects `"4:04 total · plus 242 m coasting in rest"` and gets
  `"2:04 total"`, on the manual-door summary screen, which this diff
  never touches either. Confirmed via `git diff --stat` against my own
  commits that neither `docs/news`/release code nor the summary/log
  screens were touched by RC-24. Left unfixed — repairing them is
  outside this task's scope (a different screen's stale test pin), and
  fixing them here would mix an unrelated finding into this PR's diff
  against this repo's own "would a reviewer have to hold two unrelated
  risk models at once" rule. **Both new `connected-pane-grid-resting`
  captures (portrait + landscape) passed.** The full run also
  regenerated several unrelated PNGs whose only difference was today's
  date (`2026-08-26`) baked into seeded content (Today, News, You,
  post-workout-summary, log-detail-legacy, log-history,
  log-delete-confirm) — reverted with `git checkout --` before
  committing, since RC-24 touches none of those screens and shipping
  them would be an unreviewable, unrelated diff.

## What the captures actually show (opened and read, not assumed)

`docs/screenshots/connected-pane-grid-resting.png` (portrait, 390×844):
row 2 (the active row, Filling Low's first 2000 m rep) shows `REST
0:59` in gold in the `/500M` column, replacing the split; the row's fill
is visibly, subtly warmer than rows 1/3/4/5 (the sunken tint); TIME
reads `—`, METERS still reads `1200` (the fallback dimension — this
capture leaves `intervalAccrued` at its default `null`, unrelated to
RC-24); SPM `21` and HR `164` are untouched. This is the row mid-rest
the brief asked the capture to prove, not a working interval.

`docs/screenshots/connected-pane-grid-resting-landscape.png` (844×390):
same row, same `REST 0:59` gold text and sunken fill, PLUS the REST
column (landscape-only) visible on every row: `3:00` on rows 2-5 (their
own programmed rest), `—` on row 1 (the opener, no programmed rest) —
confirms the spec's own ruling verbatim: "Landscape's REST column keeps
showing that interval's PROGRAMMED rest on every row, including the
active one." Both captures are new — no existing committed capture
showed a resting state before this task, so `connected-pane-grid.png`
(the pre-existing, unmodified capture) was never going to prove this
feature; I added a dedicated fixture (`ConnectedSurface.screens.test
.tsx`'s new "pane C, the grid mid-rest (RC-24)" snapshot test,
registered in `screenshots.spec.ts`'s `CONNECTED_STATES`) rather than
report that the seeded scenario doesn't show the feature, since it was
straightforward to make one that does.

## Per-file coverage (files touched)

Read from `pnpm test:coverage`'s text reporter plus the HTML report
under `app/coverage/` (per the agent briefing: the text reporter omits
some directories, the HTML report is authoritative) — I read both.

| File | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| `surfaceModel.ts` | 98.81% | 95.70% | 100% | 98.67% |
| `PaneGrid.tsx` | 100% | 100% | 100% | 100% |

`surfaceModel.ts`'s uncovered lines are `221-222` — confirmed by reading
them: a pre-existing, unrelated exhaustiveness `default` arm
(`const exhaustive: never = phase.type`) in `nextLineExtent`'s
switch, structurally unreachable, nothing to do with RC-24. I grepped
the HTML coverage report for the RC-24 lines specifically
(`restingNow`, `restCountdown`) and found no uncovered-branch markers
near them — the new code is fully covered by the dedicated tests, not
just riding the aggregate. (`ConnectedSurface.screens.test.tsx` and the
e2e specs are test files, not source — no coverage row of their own;
`ConnectedSurface.tsx` itself is unmodified by RC-24.)

## Self-mutation (definition of done)

Six mutations, each targeting the exact logic a test claims to protect
(not the vicinity), each reverted and confirmed clean via `git diff
--stat` afterward:

1. **`Math.floor` → `Math.round`** in `restCountdown`'s computation.
   Failed: `surfaceModel.test.ts > ... > mid-rest: floors ...` —
   `expected '1:00' to be '0:59'`. Restored, green.
2. **Zero-rest guard dropped** (`restSeconds > 0` → `>= 0`). Failed:
   `... > the zero-rest artifact ...` — `expected 'rest' to be 'meters'`.
   Restored, green.
3. **Armed guard dropped** (`!armed &&` removed from `restingNow`).
   Failed two tests: `... > armed beats resting ...`
   (`expected '0:59' to be null`) and `... > countdown and restCountdown
   always agree ...` (the invariant test, `expected false to be true`) —
   caught because `restCountdown`'s own ternary only checks `restingNow`,
   not `armed`, directly, which is exactly the asymmetry the "two fields
   agree" test exists to catch. Restored, green.
4. **Call-site wiring dropped** (`resting: false` hardcoded at the
   `buildGridModel({...})` call site, simulating "forgot to thread the
   argument through"). Failed 4 tests across both
   `surfaceModel.test.ts` and `PaneGrid.test.tsx` — every RC-24 test that
   exercises the real `buildSurfaceModel` call path. Restored, green.
5. **PaneGrid judged-bypass dropped** (`row.countdown === "rest" ? (...)
   : (...)` replaced with `false ? (...) : (...)`, forcing the ordinary
   judged pace cell even during a rest). Failed both PaneGrid RC-24
   render tests, including the coast-verdict-defect test itself
   (`expected 'connected-grid-pace timer-card-actual…' not to match
   /timer-card-actual-/`) — proves that test actually exercises the
   bypass, not just the cell's presence. Restored, green.
6. **`connected-grid-resting` row class dropped** (`row.countdown ===
   "rest"` replaced with `false` in the class-name template). Failed the
   "renders the word and the countdown, and sinks the row" test.
   Restored, green.

`git diff --stat` after mutation 6 showed no changes — confirmed clean
before committing.

A seventh, at the e2e layer rather than a unit test: reverting the
`min-width: max-content` fix and re-running just the no-clip e2e test
(`pnpm e2e -g "rest countdown does not overflow"`) reproduces the
original red (`95 > 72`) exactly; restoring the fix turns it green
again — the e2e test itself is the mutation-kill proof for this CSS
fix, since no unit-level test can see real flexbox layout (jsdom does
not compute it).

## Contrast, re-derived independently (not copied from the spec)

Computed by hand from `src/theme/tokens.css`'s hex values
(`--marker: #7d5510`, `--surface-sunken: #efeade`, `--ink: #1b1a17`,
`--surface: #fffdf7`) via the WCAG relative-luminance formula:

| Pairing | My computation | Spec's figure |
| --- | --- | --- |
| `--marker` on `--surface-sunken` | 5.503 | 5.50:1 |
| `--marker` on `--surface` | 6.492 | 6.49:1 |
| `--ink` on `--surface-sunken` | 14.498 | 14.50:1 |
| `--surface` vs `--surface-sunken` (fill shift alone) | 1.180 | 1.18:1 |

All four match the spec's own table to the stated precision. All pass
their floors (4.5:1 text / 3:1 graphic for `--marker`/`--surface-sunken`;
4.5:1 for `--ink`/`--surface-sunken`). The fill-shift ratio (1.18:1)
confirms it is a supporting channel only, never the sole signal — matches
the spec's own framing.

## 44px hit targets / WCAG AA

No control added — the CSS rules style existing text and a row
background, add no interactive element, and change no `<button>`,
`<a>`, `[role=button]`, `input` or `select`. `design.spec.ts`'s
existing 44×44 tap-target sweep and `AxeBuilder` a11y sweep run
unmodified against the connected surface and cover this pane already;
no new entry was needed. Confirmed by inspection, not merely assumed
(per the brief's own instruction not to assume this).

## ACCENT CENSUS

Re-run (`PaneGrid.test.tsx`'s `THE ACCENT CENSUS` describe block, all
5 sub-tests) with no changes needed — still pins exactly 3 classes
(`connected-end`, `connected-paused-end`, `connected-paused-end-armed`),
still asserts `connected-grid-countdown` is absent from it. My new CSS
uses `--marker`/`--surface-sunken` exclusively, never `--accent`, so
this census could not have moved and did not.

## Deliberate omissions — confirmed, not fought

- No spoken accessible name on the rest countdown — as specified.
- Landscape behaves identically (one code path; the REST column keeps
  showing the programmed value) — no orientation-conditional branch
  added anywhere in this diff.
- Time/metres cells keep moving during a rest (RC-23) — untouched.

## Where the brief and the code agreed / disagreed

Everything in the brief's "Files and exact changes" section matched
the code as read at task start: line numbers were close (the file had
drifted a handful of lines from prior commits since the brief was
written, e.g. the active branch was at `:1442` not `:1442-1456`
exactly as numbered, off by roughly the same handful of lines
throughout) but every named function, comment, and call site existed
exactly as described. No factual error found in the brief or the spec
this session had to work around — the one place I diverged from a
literal reading was brief test 7 ("exactly one row has a non-null
countdown... in each of the three states [armed / working /
resting]"), which taken literally contradicts test 5's own "armed
beats resting: countdown === null" — I wrote the actual invariant
(zero marks while armed, one while working or resting) and said so
in the test's own comment rather than asserting a false "exactly one"
for the armed case.

## Commit

`0d68e08` — "RC-24: the /500M cell counts down a running rest" (6 files:
`app/src/index.css`, `app/src/workout/connected/PaneGrid.test.tsx`,
`app/src/workout/connected/PaneGrid.tsx`,
`app/src/workout/connected/surfaceModel.test.ts`,
`app/src/workout/connected/surfaceModel.ts`,
`docs/design/DEVIATIONS.md`).

A second commit carries the e2e/screenshots gate work (the structural
no-clip test, the CSS fix it found, the new resting screenshot fixture
and captures) and this report — both ran after the first commit, per
the SDLC's own failing-test-first / self-mutation flow applied at the
e2e layer. See the returned commit SHAs.

---

# Fix round 1

Review verdict: SPEC COMPLIANCE PASS, CODE QUALITY changes requested — five
findings plus one design change from James after seeing the round-1
landscape capture. All six addressed below.

## A. The design change — landscape moves the countdown to the REST column

**What James saw and ruled.** The round-1 landscape capture showed the
active row saying REST twice, with two different numbers: `REST 0:59` in
the `/500M` cell and the programmed `3:00`, unchanged, in the REST column
beside it. Ruling: **in landscape the countdown goes in the REST column;
`/500M` reverts to `livePace` there. Portrait is unchanged.**

**Mechanism — one model, two CSS rules, exactly as instructed.**
`surfaceModel.ts` did not change at all this round (`GridRow.rest`,
`.countdown`, `.restCountdown` already carried everything needed).
`PaneGrid.tsx` renders `restCountdown` into BOTH physical cells
unconditionally whenever `row.countdown === "rest"`:

- The `/500M` cell always carries both its rest-countdown form
  (`.connected-grid-rest-countdown`, the word + number) and its ordinary
  coast-pace form (`.connected-grid-pace-coast`) as siblings. A landscape
  media query flips which one is `display: none`.
- The REST column cell reads a plain ternary — `row.countdown === "rest"
  ? row.restCountdown : row.rest` — the SAME field the `/500M` cell reads,
  with no orientation awareness of its own; the column's PRE-EXISTING
  portrait `display: none` is what actually keeps this invisible in
  portrait, unchanged by this task. Gold (`.connected-grid-rest-live`,
  `--marker`) only on the live value, matching the mark that used to sit
  on `/500M`.

**Decision on the coast-verdict question — took James's recommendation:
unjudged in BOTH forms, both orientations.** `livePace`/`frame.currentSplit`
during a rest is a coasting flywheel's split judged against a work target
it no longer means; that is wrong regardless of which column shows it, so
`cellClass` is never called on the coast span either. Stated as a decision
in `PaneGrid.tsx`'s own header comment and in the spec (see below), not
left implicit.

**Spec updated.** `docs/superpowers/specs/2026-08-26-rest-countdown-design.md`'s
"LANDSCAPE — one behaviour" section is now headed SUPERSEDED, with the
original ruling quoted verbatim inside a blockquote (this repo's own
"kept for the record" convention), followed by what actually happened and
James's correction. Exit criterion 2 updated to state the corrected promise
(same two facts knowable, different cell per orientation, not identical
treatment).

**Recaptured both orientations, opened both.** Portrait
(`connected-pane-grid-resting.png`) is **byte-identical** to round 1 — no
diff at all, confirming "portrait unchanged" is actually true, not just
claimed. Landscape (`connected-pane-grid-resting-landscape.png`) now shows
`1:57.8` (plain, unjudged, no colour) in `/500M` and `0:59` in gold in the
REST column on the active row only; rows 3-5 still show their own
programmed `3:00`, row 1 (no programmed rest) still shows `—`. The
double-REST ambiguity is gone.

**A bug I introduced implementing this, caught before it shipped.**
Splitting the `/500M` cell into a wrapper (`.connected-grid-pace`, the real
flex item) plus two nested children moved `.connected-grid-rest-countdown`
one level deeper than round 1's structure — where it stopped being the flex
item itself. My first pass left `min-width: max-content` on the (now
non-flex-item) child, where it cannot influence flex's shrink algorithm at
all (that algorithm reads the ITEM's own `min-width`, never a descendant's).
Caught by re-deriving what the property needs to sit on before trusting it,
not by a test — moved to `.connected-grid-resting .connected-grid-pace`
(the actual flex item, scoped by the row's own existing `.connected-grid-
resting` class). See "A second self-caught bug" below for how this was
ALSO hiding behind a broken gate.

## B. Wrong-layer citation — fixed, and the real ceiling is narrower than assumed

Confirmed by reading `domain/monitor/program.ts:198-206` and
`domain/monitor/program.test.ts`'s "compileProgram: rest-too-long" describe
block before touching anything: `MAX_REST_SECONDS = 595` (9:55), Table 19
of the CSAFE spec (the PM5's own `CSAFE_PM_SET_RESTDURATION` ceiling), and
it is the INCLUSIVE bound `compileProgram` enforces on every folded rest —
595 (9:55) compiles, 596 (9:56) is rejected as `rest-too-long`
(`program.test.ts`'s own two boundary tests, read directly, not assumed).
This is the layer that actually governs what a connected session can carry,
not `domain/validate.ts`'s `0:01..60:00` builder-authoring bound, which
governs only what a rower may TYPE and says nothing about what
`compileProgram` later accepts.

**Consequence, verified by arithmetic before writing anything down:**
`fmtDuration(floor(595)/60)` is `"9:55"` — ONE-digit minutes, same shape as
`"0:59"` — never the two-digit `"59:59"` the original (wrong-layer) fixture
used. Fixed everywhere this claim appeared:

- `index.css`'s own rule comment — rewritten to cite `program.ts:200-204`
  and `program.test.ts` by name, state the real ceiling, and say explicitly
  that `REST 59:59` was never reachable.
- `e2e/design.spec.ts`'s `RESTING_STORY` — `restSeconds` changed from the
  synthetic `3599` to the real, exact ceiling `595`; the no-clip test's
  expected string changed from `"REST 59:59"` to `"REST 9:55"`.
- This report (above, round-1 section) is NOT rewritten — the history
  stays visible per this repo's own "kept for the record" convention; this
  fix-round section is the correction.

## C. The neighbour misalignment — measured, gated, and a self-caught second bug

**Investigated a clean fix first**, per the finding's own instruction.
Considered (1) widening `/500M`'s base flex weight for every row (rejected:
changes the layout for every non-resting capture in existence, a much
bigger and unreviewed change for a cosmetic problem scoped to one row in
one state); (2) tightening the word/number gap (would help marginally but
not close the full deficit, and the property under test — `min-width:
max-content`'s STEAL, not the content's raw width — would still exist).
No clean fix closes the deficit without shipping a bigger change than the
misalignment is worth. **Left it, bounded and reported, per the finding's
own fallback**, and added the neighbour measurement to the gate as
instructed.

**Measured, with the fix in place, at the TRUE ceiling (not the corrected-
away `59:59`):** the no-clip e2e test now reads `.connected-grid-meters` /
`.connected-grid-spm` / `.connected-grid-hr`'s right-edge delta against an
upcoming row's own cells at 390px, and pins each under a 10px ceiling
(measured deltas at `REST 9:55`: single-digit px on each — comfortably
inside the bound, stated as a regression ceiling, not a target).

**A second self-caught bug, finding this stat.** Implementing the gate
addition, I queried `.connected-grid-rest-countdown` directly for
`scrollWidth`/`clientWidth` — the SAME element round 1's gate measured.
After the design change split that element out of the flex-item position
(A, above), it became a plain inline `<span>`, and `scrollWidth`/
`clientWidth` are **0 by CSSOM definition for inline elements** — the gate
had been asserting `0 <= 0` and would have passed regardless of any real
overflow. Found because a MUTATION TEST that should have failed (min-width
fix removed entirely) instead passed — the surprising green, not a
red, is what triggered the investigation (a temporary `console.log` of the
measured object showed `cellScrollWidth: 0, cellClientWidth: 0`). Fixed by
measuring `.connected-grid-pace` (the actual flex item — blockified by
being a flex child per the CSS Display spec, the same box every OTHER
no-clip test in this file already measures) instead, keeping the inline
child only for reading its TEXT. Re-ran the same mutation after the fix:
correctly failed (84px content in a 72px box). This is the self-mutation
that also stands as evidence for A's own min-width relocation — see
"Self-mutation" below.

## D. Three minor items

1. **PaneGrid.test.tsx comment fixed.** "far enough inside
   `PACE_TOLERANCE_SECONDS` to tint blue" was backwards — `currentSplit: 60`
   against a ~126s target is far OUTSIDE tolerance (dramatically faster),
   which is exactly what tints "faster" three lines below. Corrected in
   place, and the test now also asserts the coast span's exact `fmtSplit`
   text (`fmtSplit` newly imported), not just its class.
2. **DOM test added for exit criterion 4.** "marks no cell but the
   /500M-or-REST pair while resting: TIME and METERS carry no countdown
   class" — asserts `.connected-grid-time`/`.connected-grid-meters` never
   carry `connected-grid-countdown` on the active row while resting.
   Self-mutation: adding the class unconditionally to TIME failed this
   test (and 9 others, collaterally — snapshot mismatches across every
   fixture with an active row) — restored, green.
3. **`countdownClass` narrowed back to `"time" | "meters"`.** It was never
   called with `"rest"` after the design change either (the `/500M` and
   REST cells both read `row.countdown`/`row.restCountdown` directly) — the
   widened signature was dead. Narrowed, with a comment saying why.

## Gates (fix round)

All run from `app/`, foreground, polled to completion (per the coordinator's
instruction not to stop mid-round on a background command).

- `pnpm lint` / `pnpm typecheck` / `pnpm format:check` — clean.
- `pnpm test` — 210 files, 5649 passed, 1 skipped. Run 3× across the round;
  one run showed an unrelated integration-test failure
  (`pool.end()`/`container.stop()`, a Testcontainers teardown, most likely
  Docker resource contention with the e2e/screenshots stack running
  concurrently) that did not reproduce on immediate re-run and touches
  nothing in this diff.
- `pnpm e2e` — **414/414 on the clean run.** One run of the two showed the
  same `retest.spec.ts` pair (`RACE THE 2K...`/`declining the offer...`,
  both keyed on `Set your 2k baseline?` appearing) failing under the full
  suite's worker concurrency; both pass in isolation and in a full run
  moments later. Neither test touches anything in this diff (a baseline
  setup/re-test flow, unrelated to the connected grid) — a pre-existing,
  environment-level flake, not investigated further.
- `pnpm screenshots` — **77/79, both runs.** Same 2 pre-existing failures
  both times: `releases` (hardcoded `v0.23.0` pin against a repo that
  already shipped v0.24.0 notes before this task started) and `log-detail`
  (a stale `summary-total-line` pin on the manual-door summary screen).
  Neither screen is touched by RC-24 (confirmed via `git diff --stat`
  against every commit this task made). Left unfixed, same reasoning as
  round 1's report. One run also showed `post-test-prompt` timing out on
  the same `Set your 2k baseline?` heading as the `retest.spec.ts` flake
  above — passed clean on immediate re-run, same unrelated-flake shape.
  **Both `connected-pane-grid-resting` captures passed in every run.**
  Unrelated PNGs regenerated by the full suite (date-drift content on
  screens this diff never touches — Today, News, You, post-workout-summary,
  log-detail-legacy, log-history, log-delete-confirm, news-reader,
  onboarding-door-adjust) reverted with `git checkout --` before
  committing, same as round 1.

## Per-file coverage (fix round)

| File | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| `PaneGrid.tsx` | 100% | 100% | 100% | 100% |

`surfaceModel.ts` is unchanged this round (untouched by the design
change — it stayed at round 1's 98.81/95.70/100/98.67, same pre-existing
221-222 gap, unrelated to RC-24). Confirmed via the HTML coverage report
under `app/coverage/`, not the text reporter alone.

## Self-mutation (fix round)

Four mutations this round, each targeting the exact new logic, each
reverted and confirmed clean via `git diff --stat` afterward:

1. **REST column's live branch dropped** (`row.countdown === "rest" ?
   row.restCountdown : row.rest` → `row.rest` unconditionally). Failed the
   new "REST column carries the live countdown" unit test (`expected '3:00'
   to be '0:42'`) plus the fixture-snapshot test (expected collateral).
   Restored, green.
2. **`min-width: max-content`'s selector broken** (renamed to a class
   nothing matches, simulating the fix being entirely absent). The no-clip
   e2e test PASSED — which is how the gate's own inline-element bug (C,
   above) was found. After fixing the gate to measure the real flex item,
   re-ran the same mutation: correctly FAILED (`84 > 72`, the true deficit
   at `REST 9:55`). Restored the real selector, re-ran: passed
   (`cellScrollWidth <= cellClientWidth`). This one mutation stands for
   BOTH A's min-width relocation and C's gate-measurement fix — the gate
   could not have proven either without it.
3. **Landscape CSS swap removed** (both display-toggle rules renamed to
   classes nothing matches). Failed the new landscape e2e test exactly at
   the assertion checking the coast form is what's actually shown
   (`expected "—" received "REST 9:55"` — the rest-countdown form's text
   leaking through because nothing was hiding it). Restored, green.
4. **D2's guard dropped** (`connected-grid-countdown` added unconditionally
   to the TIME cell). Failed D2's own dedicated test plus 9 collateral
   snapshot mismatches. Restored, green.

`git diff --stat` after mutation 4 showed only the legitimate fix-round
diff — confirmed clean before committing.

## Where the review and the code agreed / disagreed

Findings A, B, D1-D3 were straightforwardly correct and fixed as directed.
Finding C's own fallback ("if it costs more than the misalignment is worth,
say so and leave it, but gate the neighbours") is exactly what happened,
with numbers. The one place I went beyond the letter of the review: B asked
me to fix "the CSS comment and the report" citing the wrong layer; I also
changed `e2e/design.spec.ts`'s own `restSeconds` value from the synthetic
`3599` to the real ceiling `595`, since testing an admittedly-impossible
value right after being corrected on exactly this point would have looked
like the lesson had not landed, and the neighbour-measurement gate (C)

---

# Fix round 2

Two changes, both from James looking at the fix-round-1 captures.

## A. The coast split dashes during a rest (both orientations)

James: *"So /500m in landscape isn't '-' during rest???"* Right, and a real
gap. Round 1 removed the coast-verdict TINT but left the coast-verdict
NUMBER: landscape's `/500M` cell was still showing `1:57.8` — the split of
a coasting flywheel — on the exact row whose REST column is counting down
beside it. Precisely the number a rower could mistake for their result.

**Fix, cell-local, in `buildGridModel`'s active branch** (`surfaceModel.ts`),
where `restingNow` already existed: `pace` becomes `{ display: DASH, judged:
null }` when `restingNow`, instead of `{ display: livePace.display, judged:
livePace }`. `PaneGrid.tsx` needed NO changes — the coast span already
reads `row.pace.display`, so the model fix alone reaches the DOM.

**`livePace` itself is untouched**, exactly as instructed — grepped
`surfaceModel.ts:641-658` before finishing to confirm nothing there moved;
pane B's split hero carries the identical defect and stays out of scope,
filed separately by the coordinator.

**Tests (failing first):** two new `surfaceModel.test.ts` cases — resting
active row dashes with `judged: null` at a REAL, non-zero `currentSplit:
117.8` (not the already-dashing dead-stop `0` case, which would prove
nothing); the WORK-interval pace is unchanged (still the live split, still
judged), pinning that the suppression cannot leak. `PaneGrid.test.tsx`'s
own coast-form test updated to assert the dash reaches the DOM. Both
`e2e/design.spec.ts` RESTING_STORY tests updated: `currentSplit` changed
from `0` (which already dashed via the OLDER "zero split is not a reading"
rule, and so proved nothing about THIS fix) to `117.8` — the same number
the round-1 capture actually showed — so the landscape e2e test's `coastText
=== "—"` assertion is discriminating, not accidentally true.

**Self-mutation:** two, both on the new `pace: restingNow ? ... : ...`
ternary. (1) Dropped the ternary entirely (`pace: {display: livePace...}`
unconditional) — failed 3 tests: the new model test, the new PaneGrid DOM
test, AND the `ConnectedSurface.screens.test.tsx` fixture snapshot
(collateral — the committed HTML fixture itself encodes the dash). (2) Kept
`display: DASH` but left `judged: args.livePace` (simulating "dashed the
number, forgot the tint") — failed the model test's own `judged`
assertion specifically (`expected {…, display: '1:57.8', …} to be null`),
proving the two halves of the pin are independently checked, not just the
visible half. Both restored, green.

**Recaptured, opened, read.** `connected-pane-grid-resting-landscape.png`:
`/500M` now shows `—` on the active row (was `1:57.8`); the REST column
still shows `0:59` in gold. Portrait's own capture is unaffected by item A
(portrait never showed the coast form at all — the countdown already
replaced it structurally in round 1).

## B. Killing the portrait bump

James: *"is there any way to make the portrait view have less of a bump
out... Maybe like reduce 'rest' to r/"*

**Investigated with real measurements, at 375×812** — this repo's own
"tightest common width" (`e2e/screenshots.spec.ts`'s `today-capped` test:
"narrower than this file's default 390×844"), corrected from round 1's
390px per the coordinator's own instruction to check the true narrowest
width, not merely a common one:

| Label | Content width needed | Every row's existing flex share | Deficit |
| --- | --- | --- | --- |
| `REST 9:55` | 84px | 68px | **16px** |
| `R 9:55` | 68px | 68px | **0px** |

Measured by rendering each label for real (`e2e/design.spec.ts`, a
temporary debug `console.log` of the measured object, removed before
committing) and reading `scrollWidth`/`clientWidth` off the actual flex
item (`.connected-grid-pace`) and an ordinary upcoming row's own copy of
the same cell. Both figures hold for EVERY valid rest value, not only the
9:55 ceiling: `compileProgram`'s `MAX_REST_SECONDS = 595` means the minutes
digit is always exactly one character (0-9), so every rendered string in
this monospace font is the identical width — the ceiling measurement is
the measurement.

**Decision: `R`.** James's own tie-break was "if REST achieves zero bump at
an acceptable cost, keep REST; only drop to R if REST cannot fit." REST
technically avoids clipping (with the round-1 `min-width: max-content`
fix), but only by permanently widening every portrait row's `/500M` column
by 16px — a cost with no existing safety proof (the repo's only METERS
five-digit no-clip stress test runs in landscape's generous 844px, not
portrait's tight 375px) — to save one word that already has grammar
precedent (`domain/bulk.ts`'s `r1` token for a one-minute rest). Judged not
acceptable against a genuinely zero-cost alternative.

**B2 became a no-op, not a base-rule change** — and that is itself the
measured answer, not an assumption: `R`'s content already fits the EXISTING
flex allocation with zero slack needed (68px needed, 68px already given),
so there was nothing to widen. The round-1 `.connected-grid-resting
.connected-grid-pace { min-width: max-content; }` rule is DELETED
outright, not repointed — `R` needs no override, and CLAUDE.md's own rule
("do not leave a rule whose reason no longer exists") applies literally.

**The e2e gate tightened, and proven it can go red.** The no-clip test now
asserts `metersDelta === 0`, `spmDelta === 0`, `hrDelta === 0` (was `< 10`,
a bounded deficit) against an upcoming row at the same columns.
Self-mutation, run TWICE to isolate the right cause: (1) reverted the
label to `REST` alone (no column change) — failed at the CLIP assertion
(`84 > 68`, no steal, since without a `min-width` override the cell just
overflows visually rather than pushing siblings) — informative, but not
the alignment assertion itself. (2) reverted the label to `REST` AND
reinstated the deleted `min-width: max-content` rule (reproducing round
1's exact shape) — failed exactly at `expect(measured.metersDelta).toBe(0)`
(`expected 0, received 9.890625`), the precise assertion the tightening
was meant to protect. Both reverted, green (`git diff --stat` clean before
committing).

**Recaptured, opened, read — the actual question asked.** Both captures
regenerated (the portrait capture changed this round, unlike round 1,
since the label lives in the cell portrait shows). `connected-pane-grid-
resting.png`: row 2's METERS ("1200") right edge sits flush with rows 3-5's
("2000") and row 1's ("1905"); SPM ("21" vs "22") and HR ("164" vs "158"/
"—") columns are similarly flush — no visible step where the resting row
sits, matching the 0px measurement. `-landscape.png`: same alignment,
`/500M` reads `—` (item A), REST column reads `0:59` gold on the active
row and `3:00`/`—` elsewhere.

## Gates (round 2)

- `pnpm lint` / `pnpm typecheck` / `pnpm format:check` — clean.
- `pnpm test` — 210 files, 5651 passed, 1 skipped, clean on every run this
  round (no flake observed).
- `pnpm e2e` — **414/414, clean on both full runs** (before and after the
  self-mutation restorations).
- `pnpm screenshots` — **77/79**, same 2 pre-existing failures as both
  prior rounds (`releases`, `log-detail`), neither touched by this diff.
  Both `connected-pane-grid-resting` captures passed; unrelated date-drift
  PNGs reverted with `git checkout --` before committing, same as before.

## Per-file coverage (round 2)

| File | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| `surfaceModel.ts` | 98.81% | 95.74% | 100% | 98.67% |
| `PaneGrid.tsx` | 100% | 100% | 100% | 100% |

`surfaceModel.ts`'s branch coverage moved up slightly (95.70% → 95.74%,
the new `restingNow` pace ternary); its uncovered lines are still only
`221-222`, the same pre-existing, unrelated exhaustiveness arm from round
1. Grepped the HTML coverage report for `restingNow` specifically — no
uncovered-branch markers near the new ternary.

## Where the brief and the code agreed / disagreed

Both items were correct as described, and the measurement work (B) is what
the review explicitly wanted rather than a restatement of its own guess —
"give me the numbers either way" was taken literally, and the numbers said
`R`, not the "shrink the column" mechanism B2 described as the fix.
Reporting that B2's own prescribed action turned out to be unnecessary,
rather than quietly implementing a no-op rule to look compliant, is the
one place this round's report goes beyond confirming the review was right.
needed to be calibrated against the REAL worst case to mean anything.
