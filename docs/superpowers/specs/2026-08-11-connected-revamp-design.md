# Connected revamp design — two panes, two heroes, one honest bar

**Status:** James approved the design 2026-08-11 ("Good") after ruling scope (both surfaces, one wave), the width-bug treatment (fold in + pin), size tokens (named steps), test fidelity (load-bearing geometry only), the §3 casualty list, `RUNNING` in ink, and the notched total bar (§5, his own call, overriding the packet).

**Design authority:** `docs/design/handoffs/2026-08-11-connected-revamp/` — `REVISION-2026-08-11.md` governs; `README.md` (the 2026-08-05 packet) stands wherever the revision is silent; `Ergomatic connected mode.dc.html` is the visual reference (frames are exact: 844×390 landscape, 390×844 portrait, no scroll). All three are committed in-repo.

**Code state:** mapped by a file-level scout of this worktree, 2026-08-11 (cites below read then; branch `connected-revamp` off main `395b7a8`, baseline 155 files / 3649 passed + 1 skipped).

## 1. Goal and non-goals

**Goal:** connected mode becomes two panes whose landscape geometry cannot drift; the live pane reads as two big judged numerals against ink targets; the grid becomes single-line rows with its totals in the header; the unconnected phone timer receives the same treatment; and one notched bar replaces three different ways of saying where you are.

**Non-goals:** the interstitial state machine (README §2 — shipped in 7B and unchanged, with the multi-monitor state still descoped by the C2 single-result ruling); the log screen (README §6); reconnect behavior beyond the existing stale/grey treatment; any driver or transport change. The three open questions in README §7 (projected finish split, reconnect backfill, distance+rate frames) stay open and unbuilt.

## 2. James's rulings (PINNED, 2026-08-11)

1. Both surfaces in ONE wave: connected panes and the unconnected phone timer.
2. The landscape width instability is fixed here AND pinned by a test that outlives the cause.
3. Sizes become named steps in `tokens.css`, not literals.
4. Tests assert load-bearing geometry only: no-scroll, no-clip, row heights and counts, the 44pt targets, the width invariant. Not every font-size.
5. Drop the timer pane from connected mode; LIVE and GRID remain.
6. `RUNNING` on the phone timer goes ink (taking DEVIATIONS row 1's own recommendation).
7. **The total-left bar is notched by interval, proportional to duration** — his call, overriding the packet's "total-left bar 5px with quarter ticks. Unchanged."

## 3. The casualty list (approved)

Deleting `PaneTimer.tsx` deletes the only renderer of five things. Each is resolved, not orphaned:

| Resident | Fate |
|---|---|
| Interval countdown (96/112px, `.connected-clock-value`) | REHOMED: the live pane's metric row (30px, revision §3) and the grid header's totals line |
| Full `INTERVAL 2 OF 5 · WORK` (`intervalLabel`) | REHOMED to the grid header (`3 OF 12 · WORK · 0:47 LEFT`, revision §4). Live keeps `intervalLabelShort` (`2 OF 5 · WORK`), already on its connection line at no vertical cost |
| Status word `ROWING` (`statusWord`, `.connected-status-word`) | DROPPED. With the erg counting and two live heroes on screen it is the least informative element on the pane. `PAUSED` survives: the paused block lives in the shell, never in the pane. `SurfaceModel.statusWord` keeps its other consumers (paused/lost/ended copy) — the field is not deleted, only its `ROWING` rendering |
| Within-interval progress bar (`intervalProgressPct`, `.connected-interval-bar`) | DROPPED. The metric row's countdown is the same fact as a number, and revision §3's live layout has no slot |
| The 2×2 card grid (`.connected-cards`/`-primary`/`-secondary`) | DIES with the pane; `-triple` keeps its consumer |

Two further live-pane casualties, same ruling:

- **The ELAPSED strip** (`PaneLive.tsx:127-134`, portrait-only): replaced by revision §3's metric row (left-in-interval · meters · HR).
- **The equal-width segment bar on live** (`IntervalSegments`): see §5. It draws one identical dot per phase, so a 2000m piece and a 40-second rest render the same width; the notched bar says the same thing proportionally and costs one row instead of two. `IntervalSegments` itself survives — the unconnected timer and its own tests keep it until §7 says otherwise.

## 4. The width fix (root-caused, then pinned)

James's report: the landscape content column changed width view to view. The mechanism, found by the scout and re-verified against the CSS:

1. `.connected-surface-body` is the ONE container in the landscape grid chain that never declares `min-width: 0` (it has `min-height: 0` only, `index.css:5315`/`:6277`). Its automatic minimum size is therefore its min-content width. `.connected-pane` declares `min-width: 0` (`:5326`) and `.connected-col` does in landscape (`:6346`) — the body is the gap.
2. `.connected-pane-grid` overrides the panes' `overflow: hidden/clip` (`:5344-5346`) back to `overflow: visible` (`:5664-5670`), which restores a content-based intrinsic minimum that the other panes suppress.

Together: the grid pane contributes a min-content width the other panes do not, so the `1fr` track — and the rail beside it — measures differently per pane, and content-dependently (interval count, meters digits) within the grid itself.

**Fix:** `min-width: 0` on `.connected-surface-body`; the grid's `overflow: visible` exception is removed or scoped so it cannot restore an intrinsic minimum (the implementer determines which the sticky header actually needs — if `visible` is load-bearing there, the row track gets its own `min-width: 0` instead). The gutter rail (§6) lands on top of this, not instead of it.

**Pin (the test that outlives the cause):** in both orientations, for BOTH panes, the content column's `getBoundingClientRect()` `width` AND `left` are identical to the pixel; asserted after a swipe between panes, not just on fresh mounts. A future cause of drift fails this regardless of mechanism.

## 5. The notched total bar (James's call)

`TimerRuler` today renders TOTAL LEFT plus a four-tick ruler at ¼/½/¾ and the session length. The ticks mark fractions of nothing the rower is doing.

**New behavior:** the bar carries **one notch per interval boundary, positioned proportionally to duration** (the same `phases` durations the segment bar counts, priced the way `buildRun` already prices them). The fill continues to show session progress, so its edge lands inside the current interval's span. The bar then states, without a word: how far through, how many intervals, and which one is live.

- **Notches are hairlines in `--ink`**, 1px, full bar height. No colour: accent means four things and the tint colours mean over/under, so the bar stays monochrome. Rest spans are NOT separately tinted in this wave (a second track weight was considered and rejected as noise at 5px).
- **Fallback:** a single-interval session has no interior notches, so the bar keeps the ¼/½/¾ ruler rather than rendering a bare rectangle. Notches when there is structure; quarters when there is not. The threshold is literal: `phases.length > 1`.
- **Both surfaces** get it (revision §5: the unconnected timer follows the live-pane spec), so `TimerRuler` gains the notch input rather than the connected panes forking a copy.
- **The count still reads in words** on live's connection line (`2 OF 5 · WORK`) and in the grid header. Counting notches at 170bpm is not a reliable read; the label costs no row.

## 6. The two panes

**Rail in the sensor gutter (landscape).** A 44px gutter column (`#efeade`, 1px right rule) holds LIVE at top and GRID at bottom with the housing spacer between; the content column starts immediately after it, with no additional inset — which is also why §4's fix must land first, since today's rail is a right-edge grid column inside `max-width: 800px`. Portrait keeps a 54px two-tab bar (LIVE · GRID).

**Pane state.** `PANES` becomes `["live","grid"]`; `DEFAULT_PANE` stays `live`. A stored `"timer"` from a rower's localStorage already falls back through `PANES.includes` (`ConnectedSurface.tsx:73`) — verified graceful, no migration written.

**Live pane** (revision §3): two heroes, actual split and actual rate, each with its target directly beneath in ink (112/104px actuals, 46/44px targets, tenths at half size). Below a 1px ink rule, the metric row on one baseline: left-in-interval · meters · HR at 30px. Then UP NEXT, then TOTAL LEFT with the notched bar. The hero cannot clip: `min-width: 0` on the column, `white-space: nowrap` on the numeral, and any split slower than `9:59.9` renders `—`.

**The second hero is net-new plumbing.** Rate exists today as a 40px card with no target rendered anywhere, and `SurfaceModel` carries no target-rate field. This wave adds `targetRate` + its caption to the model, derived from the programmed phase's spm, judged by the SAME `judgeActual` helper (`domain/judge.ts`, `SPM_TOLERANCE = 2`) that already tints split. One judgement helper, two heroes — no pane deciding for itself, and the existing single-call-site census test extends to cover it.

**Grid pane** (revision §4): single-line fixed-height rows (36px landscape / 40px portrait, mono 19px), 8 visible landscape / 12 portrait; the portrait second line and the active row's third line both go. Columns per the revision's flex table. Completed rows ink over a solid rule; the active row a `--surface` fill between two ink rules with a 4×20 marker (no card padding, no 2px box); upcoming rows `--ink-3` over a dashed rule. Session totals move into the header line (`3 OF 12 · WORK · 0:47 LEFT` and `38:20 TOTAL`). Rows scroll under the pinned header, active row always scrolled into view.

**End session** becomes a 44pt outlined control in the surface header (mono 11px/600, accent text and border) with its staged confirm unchanged; in landscape timer mode it sits in the gutter. The paused block inherits the vacated footer slot, so nothing above it shifts when the erg stops.

## 7. The unconnected timer (revision §5)

Same size steps, same gutter treatment (back `←` top, END bottom, either side of the housing), countdown 128/118px ink with ELAPSED beneath at 26px, both targets stacked in the right column at 56/52px **in ink**, Pause as the only level-1 control (200×44 landscape, full-width 56px portrait), UP NEXT and TOTAL LEFT per §5-§6 above including the notched bar. Distance pieces swap the hero (meters count down, clock accrues beneath) with labels swapping and layout holding.

`RUNNING` goes ink (ruling 6). Accent's remaining jobs on this surface: the Pause fill and the phase progress bar.

## 8. Size steps (ruling 3)

`tokens.css` has no font-size token today (colours, `--radius`, `--tap`); `index.css` carries 254 literal font-sizes. This wave introduces the first size scale, scoped to these two surfaces and named for role, not pixels — hero, hero-tenths, sub-hero, target, metric, total, row, label — with the landscape/portrait pair expressed as the token's value under each orientation's media query rather than two differently-named tokens. Existing unrelated literals are NOT swept; this is the beachhead, not a refactor.

## 9. Testing and acceptance

- **Load-bearing pins only** (ruling 4): the §4 width invariant (both panes, both orientations, after a swipe); no-scroll on live in both orientations; hero no-clip including the `9:59.9` cap rendering `—`; grid row heights and visible-row counts (8/12); the gutter's 44px and End's 44pt target; the notch count equalling `phases.length - 1` with the single-interval fallback to quarter ticks; the judged-tint census extended to the rate hero. The existing tap-target, axe and token-palette sweeps run over both rebuilt surfaces.
- **Retirements, expected and enumerated:** `PaneTimer.tsx` and its portrait `order` rules; the pane-A describe in `ConnectedSurface.test.tsx` (4 its); `connected-pane-timer` ×2 captures and `e2e/fixtures/connected-pane-timer.html`; the lost-banner step-downs keyed to `.connected-clock-value`. `connected-paused` ×2 is currently captured ON pane A (`ConnectedSurface.screens.test.tsx:238-245`) and must RE-POINT to live, not retire.
- **Capture churn is the wave's largest test cost and is expected:** every `connected-*` capture re-shoots (18 today), plus the timer captures. Each committed diff states its reason; unrelated re-encode noise is reverted.
- **Tab order changes twice** (rail loses a target, End moves to the header): the `screenshots.spec.ts:2233-2237` order pin is rewritten once, deliberately, with the new order stated in the diff.
- Gates ×2 on the per-worktree stack. Baseline measured at plan time.

## 10. Docs

- ROADMAP: the phase entry, its exit (a hardware read at the erg: both panes in landscape at a real PM5, the width holding across a swipe, the notched bar against a real multi-interval piece), and the follow-ons this wave does not take (README §7's three open questions).
- DEVIATIONS: three rows — the notched bar overriding the packet's "unchanged" quarter ruler (ruling 7); `RUNNING` in ink, which NARROWS the existing row 1 rather than adding a divergence; and the live pane dropping the segment bar the packet's §3 keeps.
- The design packet stays in `docs/design/handoffs/2026-08-11-connected-revamp/` as the implementation's cited authority.
