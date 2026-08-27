# RC-27 — task report: the LIVE hero counts the rest

Worktree: `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/rest-countdown`
Branch: `rest-hero`. Commits: `d615277`, `b6a389c`.

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
