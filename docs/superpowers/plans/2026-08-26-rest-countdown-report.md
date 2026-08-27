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
