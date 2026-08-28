> **Archived 2026-08-28** from `ROADMAP.md` (lines 5679-5828 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase CR — Connected revamp: two panes, two heroes, one honest bar

**Status:** Done — merged 2026-08-13 as PR #89, released the same day as
v0.9.0 (build 641). All five exit items discharged: four verified by
James on a real PM5, and the paused-block occlusion deliberately
deferred by his ruling ("we're revisiting pause in a future phase
because it's fake"). Final gates 3862+1 across 157 files, e2e 286,
screenshots 62. **Its follow-on work is Phase CR2 below.**
**Goal:** connected mode becomes two panes whose landscape geometry
cannot drift; the live pane reads as two big judged numerals over
ink targets; the grid becomes single-line rows with its totals in
the header; one notched bar replaces three different ways of saying
where you are; and the unconnected phone timer is rebuilt in the
same language.
**Design authority:**
`docs/superpowers/specs/2026-08-11-connected-revamp-design.md`
(plan: `docs/superpowers/plans/2026-08-11-connected-revamp.md`;
visual authority `docs/design/handoffs/2026-08-11-connected-revamp/`,
where `REVISION-2026-08-11.md` governs and the `.dc.html` mockup is
the pixel truth).

- [x] The landscape width bug, root-caused and pinned: the surface
      body was an `auto`-minimum grid item measuring against whichever
      pane was mounted (692 -> 1262px reproduced). One `min-width: 0`
      fixes it; the pin measures the content column's width AND left
      across a real swipe, so a future cause of drift fails too
- [x] Two panes, not three: `PaneTimer.tsx` and `statusWord` retired
      with everything that existed only to render them; the codebase's
      first size-token scale (`--size-hero` … `--size-label`, portrait
      in `tokens.css`, landscape redefined once); the surface goes
      full-bleed in landscape with the 44px rail inside the sensor
      gutter, absorbing the safe-area inset instead of doubling it
- [x] The live pane: two heroes with their targets beneath in ink, a
      one-baseline metric row (left-in-interval · meters · HR), the
      dash where there is no target, and no cards anywhere
- [x] The notched bar (James's own call, overriding the packet's
      "unchanged" quarter ruler): one hairline per interval boundary,
      completed notches RE-ANCHORED to the machine's own elapsed,
      prediction stopping honestly at an unpriceable phase, the ruler
      back below a 16-boundary density floor, and the notch two-tone
      so it survives the fill edge
- [x] The warm-up is flagged, never counted (his late requirement,
      re-brainstormed rather than patched): `WARM-UP` with no ordinal,
      `WU` in the grid's number cell, a third bar tone that fills as
      the warm-up is rowed, and `ProgramInterval` carrying its phase
      type so no surface re-derives the fact
- [x] The grid: single-line rows, totals in the header, 8 visible in
      landscape at 32px and 15 in portrait at 40px — every count
      derived from a measured scroller, not asserted
- [x] End moves off its full-width bar into a 44pt outlined header
      control (a mis-tap hazard on a swiped surface), the empty footer
      goes back to the rows, and UP NEXT finally says how long the
      rest is
- [x] The phone timer joins the same language: ink `RUNNING`, ink
      targets, the token sizes, the gutter, the distance hero swap,
      Pause following the mockup, and the landscape rule block scoped
      to its own surface so it stops leaking onto the connected panes
- [x] Docs, captures and gates: the DEVIATIONS rows this wave owes,
      the retirement audit, and the last two screens carrying the
      `var(--tap)` overflow (`countdown`, `session-complete`)
- [ ] James's erg look (the phase exit, below)

**Follow-ons this wave declines** — the packet's own three open
questions (`docs/design/handoffs/2026-08-11-connected-revamp/README.md`,
"Open questions for the build session"), each unbuilt because the
answer is a hardware fact nobody has yet:

- **Projected finish split** per interval, if the driver layer can
  expose one — it wants the live pane's metric row.
- **Reconnect backfill**: whether the monitor can replay per-interval
  actuals for intervals completed while we were disconnected. The
  grid's backfill assumes yes; if not, those rows need the
  `— · MISSED` treatment DEVIATIONS already records as not built.
- **Distance intervals with a rate cap**: whether the programmed
  frame carries both, or the monitor drops the rate.

**Parked, found by this wave** (each is real, none is this wave's
scope):

- `scripts/stack-env.sh` derives per-worktree container names from
  `cksum % 100000` but its host ports from `cksum % 400`, so two
  worktrees can hold distinct stacks and still collide on `APP_PORT`/
  `POSTGRES_PORT`. Widen the port range or derive it from the same
  modulus.
- The fake-driven walk's **ordinal regression guard** lost its
  UI-level double-check when `statusWord` went (nothing else on the
  surface reads `frame.state` unconditionally; the wire decode itself
  stays covered in `monitor/driver.test.ts`). The named substitute:
  extend the walk one interval and assert the kind word, where
  `resting` genuinely flips `2 OF 5 · WORK` to `· REST`.
- **Portrait's own dead 26px** on the connected surface — landscape
  reclaimed it in Task 3; portrait's equivalent is a separate
  decision nobody has taken.
- The recurring **`design.spec.ts` layout-settling flake**
  (`stableBoundingBox`, `:1677` and `:1697`, twice in two tasks, on a
  builder screen neither diff touched). Both passed on re-run; it has
  a pattern now and wants a tracked fix rather than another per-task
  footnote.
- **Phase BL's `retest.spec.ts` post-test-prompt flake** (found at
  #167's post-rebase gate, 2026-08-23): under full-suite load the
  "Set your 2k baseline?" heading misses its 5 s `toBeVisible` window
  — the page shows Today with the prompt never rendered. Two runs
  failed differently (`:31`+`:95`, then `:95` alone), 4/4 green in
  isolation; the error-context artifact is the capture, not a re-run
  disposal. Owner: Phase BL (the flow is theirs; #167's diff has no
  file in the path).
- **`log-monitor`/`log-monitor-landscape` captures are scroll-unstable**:
  `scrollTraceChartIntoFrame` lands differently run to run, so these
  two PNGs churn on every screenshots pass (#167 saw both directions
  in one day). Until the scroll is pinned, treat a diff in these two
  as noise unless the chart CONTENT changed.

**Exit:** James's erg look, on his iPhone against a real PM5, one
item at a time —

- (a) both panes in landscape: the content column's left edge and
  width do not move when swiping LIVE <-> GRID (the reported bug, on
  hardware);
- (b) the notched bar against a real multi-interval piece with rest:
  the notch count matches the caption, and a completed interval's
  notch sits where it actually ended;
- (b2) the warm-up on a real PM5 (nothing in this wave has met the
  wire on this state, and it is the FIRST state a rower with the
  preference on reaches): the caption reads `WARM-UP` with no ordinal
  and `1 OF N` on the first work piece, the bar's leading span
  visibly fills as he rows it and still reads as not-work, and the
  grid's warm-up row is present but unnumbered;
- (b3) pause mid-piece: the paused block now OCCLUDES the bottom 52px
  rather than displacing content, which hides TOTAL LEFT and the bar
  on live and the caption plus the last row on the grid. James judges
  whether that trade is right;
- (c) both heroes readable at arm's length mid-piece, and the grid's
  rows legible at 8 visible.

**How it actually went (2026-08-13, two sessions on a real PM5).** (a)
PASSED — "it holds", the reported bug dead; James then found its
neighbour by hand, the gutter reading wider on the notch side, which
turned out to be perceptual rather than geometric (see Phase CR2's item
2). (b) PASSED against a real boundary. (b2) PASSED end to end: `WARM-UP`
during it, the span filling in its own tone as he rowed, then `1 OF 2 ·
WORK`. (c) PASSED. (b3) NOT judged: he confirmed the block covers TOTAL
LEFT and ruled the question into Phase CR2 rather than answering it in
isolation, "because it's fake".

The sequencing was inverted and it is worth recording why the phase felt
like it was creeping: this exit says a fix round comes BEFORE the PR, and
the PR opened first. Every walk finding then arrived against an open PR.
A close-out round of three tasks plus a review ran between the walk and
the merge, which is what the exit had always asked for, just later.
