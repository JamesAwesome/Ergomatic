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
8. **Notches RE-ANCHOR as intervals complete** (post-adversarial): a completed interval's notch snaps to where it actually ended; upcoming notches stay estimated and re-flow. Truth about the past, best guess about the future.
9. **The status word stays dropped** — re-confirmed on corrected information (the packet does keep one; this is a deliberate deviation, not an oversight).
10. **The connected surface goes FULL-BLEED in landscape**, breaking the app's max-width so the gutter reaches the housing and the content column gains the width back.
11. **The notch is TWO-TONE** (2026-08-12): ink ahead of the fill, page-colour behind it. An ink notch over the ink fill measures 1.00:1 — invisible over exactly the completed intervals re-anchoring exists to show. §5's "monochrome" clause is amended to "no new hue"; the value flips so the notch survives the fill edge. The session-length label does NOT return; TOTAL LEFT carries the number.
12. **THE WARM-UP IS FLAGGED, NEVER COUNTED** (2026-08-12, James's late requirement, brainstormed rather than patched) — see §5b.

## 3. The casualty list (approved)

Deleting `PaneTimer.tsx` deletes the only renderer of five things. Each is resolved, not orphaned:

| Resident | Fate |
|---|---|
| Interval countdown (96/112px, `.connected-clock-value`) | REHOMED: the live pane's metric row (30px, revision §3) and the grid header's totals line |
| Full `INTERVAL 2 OF 5 · WORK` (`intervalLabel`) | REHOMED to the grid header (`3 OF 12 · WORK · 0:47 LEFT`, revision §4). Live keeps `intervalLabelShort` (`2 OF 5 · WORK`), already on its connection line at no vertical cost |
| Status word `ROWING` (`statusWord`, `.connected-status-word`) | DROPPED, and the field dies with it. CORRECTED (adversarial): `PaneTimer.tsx:54` is its ONLY renderer — the shell hardcodes its own PAUSED/LOST/ENDED strings, so `SurfaceModel.statusWord` and `statusWordFor` are removed entirely rather than kept for imaginary consumers. This is a DEVIATION from the packet (revision §5 implies connected mode keeps a status word; the mockup renders one), taken deliberately on James's re-confirmation: two judged heroes beside a counting erg make the word the least informative pixel on a pane the revision already made tight. DEVIATIONS row |
| Within-interval progress bar (`intervalProgressPct`, `.connected-interval-bar`) | DROPPED. The metric row's countdown is the same fact as a number, and revision §3's live layout has no slot |
| The 2×2 card grid (`.connected-cards`/`-primary`/`-secondary`) | DIES with the pane; `-triple` keeps its consumer |

Two further live-pane casualties, same ruling:

- **The ELAPSED strip** (`PaneLive.tsx:127-134`, portrait-only): replaced by revision §3's metric row (left-in-interval · meters · HR).
- **The equal-width segment bar on live** (`IntervalSegments`): see §5. It draws one identical dot per phase, so a 2000m piece and a 40-second rest render the same width; the notched bar says the same thing proportionally and costs one row instead of two. `IntervalSegments` itself survives — the unconnected timer and its own tests keep it until §7 says otherwise.

## 4. The width fix (root-caused, then pinned)

James's report: the landscape content column changed width view to view. The mechanism, found by the scout and re-verified against the CSS:

**CORRECTED against live source (adversarial B4 — the original cites carried ~13 lines of drift from a scout run against pre-merge main; every line below re-read on this worktree).**

`.connected-surface-body` is a grid item in a `1fr` (= `minmax(auto, 1fr)`) track with `overflow: visible` and no `min-width` (`index.css:5300-5304`, landscape `:6261-6265`). Its automatic minimum size is therefore content-based. Only ONE pane is mounted at a time (`ConnectedSurface.tsx:322-324`), so the track measures against whichever pane is showing — and within the grid pane, against its own content (interval count, meters digits). That is the whole mechanism.

The grid's `overflow: visible` (`index.css:5654-5656`) is NOT part of it: `.connected-pane` already declares `min-width: 0` (`:5313`), which overrides any automatic minimum `overflow` could restore. That rule exists for the sticky header and stays untouched.

**Fix:** `min-width: 0` on `.connected-surface-body`. Single declaration; the track then resolves to a fixed width independent of pane and content.

**Two consequences this wave owns:** (a) content now CLIPS instead of widening its track, so the grid pane gains a no-clip pin of its own (the widest realistic row — three-digit intervals, five-digit meters — fits without truncation at 390px landscape); (b) §6's full-bleed change re-arithmetics the same track, so the width invariant is written AFTER the gutter lands, measuring the final geometry.

**Pin (the test that outlives the cause):** in both orientations, for BOTH panes, the content column's `getBoundingClientRect()` `width` AND `left` are identical to the pixel; asserted after a swipe between panes, not just on fresh mounts. A future cause of drift fails this regardless of mechanism.

## 5. The notched total bar (James's call, adversarially repaired)

`TimerRuler` today renders TOTAL LEFT plus a four-tick ruler at ¼/½/¾ and the session length. Those ticks mark fractions of nothing the rower is doing.

**The unit is the INTERVAL, not the phase (adversarial B1).** `program.intervals.length` folds each work piece with its trailing rest (`surfaceModel.ts:318`); `phases.length` does not (`:412`). The caption says `2 OF 5`, so the bar must draw 4 interior notches, not 9. One notch per interval BOUNDARY: `intervals.length - 1`.

**Notch positions re-anchor as intervals complete (ruling 8, closing adversarial B2).** A distance interval has no true duration — `phaseSeconds` (`domain/expand.ts:98-106`) returns `(meters / 500) * targetSplit`, an estimate by its own doc comment, and `null` when a phase carries neither seconds nor a priced distance. So:

- **Completed intervals** are positioned by their REAL elapsed time, taken from the same per-interval actuals the record already holds. Their notches are facts.
- **Upcoming intervals** are positioned by estimate (`phaseSeconds` summed across the interval's phases) and re-flow each time a real boundary lands.
- **A `null`-priced phase** (open-ended piece) contributes no estimate: its interval, and everything after it, is drawn UNNOTCHED — the bar honestly stops predicting rather than collapsing spans to zero width.
- The fill continues to run on real elapsed, so the fill edge and the notches are finally measured in the same units for the past, and the drift is confined to the future where it belongs.

**Inputs are net-new (adversarial B3).** Neither `IntervalSegments` (`{total, current, kinds}`, `IntervalSegments.tsx:20-24`) nor `TimerRuler` (`{totalLeftSeconds, totalSeconds}`, `TimerRuler.tsx:29-35`) carries durations, and `SurfaceModel` has no duration array. This wave adds one: an interval-boundary array (cumulative seconds per boundary, plus a flag for where prediction stops), derived once and passed to `TimerRuler`. Both surfaces consume the same shape, so the unconnected timer gets the same bar rather than a fork.

**Rendering:** notches are 1px `--ink` hairlines, full bar height, monochrome (accent means four things; the tint colours mean over/under). Rest spans are NOT separately tinted this wave — a second track weight at 5px reads as noise.

**Fallbacks:**
- A single-interval session (`intervals.length === 1`) has no interior notches and keeps the ¼/½/¾ ruler rather than rendering a bare rectangle.
- **Density:** at 390px landscape, more than ~16 boundaries puts notches under 24px apart and they read as texture, not structure. Above that threshold the bar keeps the quarter ruler and the count stays textual. The threshold is a named constant, and the grid pane remains the honest place to read a 25-interval session.

**The count still reads in words** on live's connection line (`2 OF 5 · WORK`, already rendered at no vertical cost) and in the grid header. Counting notches at 170bpm is not a reliable read.

## 5b. The warm-up is flagged, never counted (ruling 12)

**The defect, found in the brainstorm:** `compileProgram` pushes the warm-up into `program.intervals` like any other interval, but `ProgramInterval` is `{ kind, value, targetSplit, displaySpm, restSeconds }` — it carries NO phase type. The fact that an interval was a warm-up is destroyed at the compile boundary (`domain/monitor/program.ts`'s push site; the input `CompiledPhase.type` knows, the output does not). Every consumer inherits the loss: the caption counts it (a 4-piece workout reads `1 OF 5` during the warm-up), the notched bar folds it into a span indistinguishable from work, and the grid would number it row 1. The reviewer's own Task 4 hand-check demonstrated it accidentally: Filling Low's 8:00 warm-up plus four pieces folded to "5 intervals".

**Fix at the root, not per-surface:** `ProgramInterval` carries its phase type. Every surface then READS the fact instead of re-deriving "was that a warm-up?" from phase indices — the same one-source discipline the judgement helper already has.

**What the rower sees** (following the precedent the deleted ConfirmTargets set: the warm-up rendered OUTSIDE the row numbering):

| Surface | Warm-up treatment |
|---|---|
| Interval caption | Reads `WARM-UP` with NO ordinal while the warm-up runs; work pieces read `1 OF 4`. The denominator counts WORKING intervals only — the number the rower has in their head |
| Grid row | Present (it is real time the rower rows) but UNNUMBERED: the `#` cell reads `WU`, and numbering starts at 1 on the first work piece. It occupies one of the visible-row budget's rows |
| Notched bar | Its span is proportionally real, but the leading chunk renders in the UNFILLED-track tone rather than the working tone, so the structure reads "this part is not the work". No new colour, no legend |
| Live pane | NOTHING NEW: a warm-up already carries no target (`compileProgram` nulls it), so §6's no-target dash state and the judgement standing down are already correct. A warm-up must never be graded |

**Scope:** amends Task 4's boundary module (the span's tone), shapes Task 5 (the `WU` row and the numbering offset), touches `program.ts` + `surfaceModel.ts`, and owes a DEVIATIONS row (the packet never addressed warm-ups on these panes at all). It lands as its own task between the bar and the grid.

## 6. The two panes

**Rail in the sensor gutter (landscape), and the surface goes FULL-BLEED (ruling 10, adversarial B5).** Today `.screen` caps the surface at 480px with 20px padding (`index.css:401-407`) and landscape at 800px (`:6233`), so a 44px gutter would float ~42px inboard of the housing it exists to avoid. In landscape the connected surface therefore breaks out of the app's max-width and runs edge to edge: the gutter (`#efeade`, 1px inner rule, LIVE top / GRID bottom with the housing spacer between) sits at the physical edge, and the content column starts immediately after it with no additional inset — gaining back the ~84px the max-width was spending. This is a HUD on a mounted phone, not a document. Portrait is unchanged in width and keeps a 54px two-tab bar (LIVE · GRID). Safe-area insets still apply; the full-bleed is a max-width and padding change, never an inset override.

**Pane state.** `PANES` becomes `["live","grid"]`; `DEFAULT_PANE` stays `live`. A stored `"timer"` from a rower's localStorage already falls back through `PANES.includes` (`ConnectedSurface.tsx:73`) — verified graceful, no migration written.

**Live pane** (revision §3): two heroes, actual split and actual rate, each with its target directly beneath in ink (112/104px actuals, 46/44px targets, tenths at half size). Below a 1px ink rule, the metric row on one baseline: left-in-interval · meters · HR at 30px. Then UP NEXT, then TOTAL LEFT with the notched bar. The hero cannot clip: `min-width: 0` on the column, `white-space: nowrap` on the numeral, and any split slower than `9:59.9` renders `—`.

**The second hero is a PROMOTION, not new plumbing (corrected, adversarial).** The target rate already exists in the model and already renders — `surfaceModel.ts:337`/`:433` derive it and `PaneLive.tsx:94` shows it as the rate card's caption. The work is promoting that caption to a 46/44px ink numeral beneath a 112/104px judged actual, not deriving a new field. Judgement stays the single `judgeActual` call (`domain/judge.ts`, `SPM_TOLERANCE = 2`, direction already correct for rate), and the existing single-call-site census test extends to the second hero.

**Both heroes need a no-target state (adversarial).** Every rest phase, and any work phase without a programmed rate, has no target to render. The target slot holds its space and reads `—` in `--ink-3`; the actual above it renders unjudged (plain ink), since a value with nothing to compare against must not be tinted. Pinned by test for the rest case, which every interval session hits.

**UP NEXT's string needs work the revision assumes away (adversarial B6).** The revision's `REST 2:00 · then WORK 2:09.0` is unreachable today: `phaseAnnouncement` emits `KIND · label` and collapses rests to a bare `REST` (`Timer.tsx:194-199`, `:214-218`), with `:202-206` documenting why the duration is absent. This wave extends the announcement to carry the rest's own duration, on both surfaces, and the portrait short form (`REST 2:00 · WORK 2:09.0`) follows the same builder rather than a second string.

**Grid pane** (revision §4): single-line fixed-height rows (36px landscape / 40px portrait, mono 19px), 8 visible landscape / 12 portrait; the portrait second line and the active row's third line both go. Columns per the revision's flex table. Completed rows ink over a solid rule; the active row a `--surface` fill between two ink rules with a 4×20 marker (no card padding, no 2px box); upcoming rows `--ink-3` over a dashed rule. Session totals move into the header line (`3 OF 12 · WORK · 0:47 LEFT` and `38:20 TOTAL`). Rows scroll under the pinned header, active row always scrolled into view.

**End session** becomes a 44pt outlined control in the surface header (mono 11px/600, accent text and border) with its staged confirm unchanged; in landscape timer mode it sits in the gutter. The paused block inherits the vacated footer slot, so nothing above it shifts when the erg stops.

## 7. The unconnected timer (revision §5)

Same size steps, same gutter treatment (back `←` top, END bottom, either side of the housing), countdown 128/118px ink with ELAPSED beneath at 26px, both targets stacked in the right column at 56/52px **in ink**, Pause as the only level-1 control (200×44 landscape, full-width 56px portrait), UP NEXT and TOTAL LEFT per §5-§6 above including the notched bar. Distance pieces swap the hero (meters count down, clock accrues beneath) with labels swapping and layout holding.

`RUNNING` goes ink (ruling 6). Accent's remaining jobs on this surface, CORRECTED against source (adversarial): the phase progress bar (`index.css:3785`) and the total-bar fill (`:3722-3727`, which the original draft missed). The mockup does NOT render Pause as an accent fill — the implementer follows the mockup for Pause's treatment and records the resulting accent inventory in the DEVIATIONS row rather than assuming the shipped fill survives.

**The landscape leak is this wave's problem (adversarial).** `index.css:4070`/`:4087`/`:4098`'s `.timer-*` landscape rules are NOT scoped to `.timer-screen`, so they reach the connected panes, where `:6321-6327` resets only three properties. Rebuilding the timer surface moves the leaking layer: the rebuild scopes those rules to their own surface and deletes the reset, rather than leaving two half-coupled layers behind.

## 8. Size steps (ruling 3)

`tokens.css` has no font-size token today (colours, `--radius`, `--tap`); `index.css` carries 254 literal font-sizes. This wave introduces the first size scale, scoped to these two surfaces and named for role, not pixels — hero, hero-tenths, sub-hero, target, metric, total, row, label — with the landscape/portrait pair expressed as the token's value under each orientation's media query rather than two differently-named tokens. Existing unrelated literals are NOT swept; this is the beachhead, not a refactor.

## 9. Testing and acceptance

- **Load-bearing pins only** (ruling 4): the §4 width invariant (both panes, both orientations, after a swipe); no-scroll on live in both orientations; hero no-clip including the `9:59.9` cap rendering `—`; grid row heights and visible-row counts (8/12); the gutter's 44px and End's 44pt target; the notch count equalling `intervals.length - 1` (NOT `phases.length - 1`) with the single-interval fallback to quarter ticks; the judged-tint census extended to the rate hero. The existing tap-target, axe and token-palette sweeps run over both rebuilt surfaces.
- **Retirements, expected and enumerated:** `PaneTimer.tsx` and its portrait `order` rules; the pane-A describe in `ConnectedSurface.test.tsx` (4 its); `connected-pane-timer` ×2 captures and `e2e/fixtures/connected-pane-timer.html`; the lost-banner step-downs keyed to `.connected-clock-value`; `statusWord`/`statusWordFor` and their model tests. `connected-paused` ×2 is currently captured ON pane A (`ConnectedSurface.screens.test.tsx:238-245`) and must RE-POINT to live, not retire. The plan's first task RE-DERIVES the full retirement inventory from source (the adversarial pass found this list short by roughly a dozen, including `PaneGrid.test.tsx`'s row-shape suites and the visible-row pin at `screenshots.spec.ts:2214`) — no test retires without appearing in that inventory with a reason.
- **Every line cite in this spec was corrected against this worktree post-adversarial.** The plan's implementers re-verify before editing anyway: the original drift came from a scout reading pre-merge main, and the same trap is live for anyone citing across a merge.
- **Capture churn is the wave's largest test cost and is expected:** every `connected-*` capture re-shoots (18 today), plus the timer captures. Each committed diff states its reason; unrelated re-encode noise is reverted.
- **Tab order changes twice** (rail loses a target, End moves to the header): the order pin at `screenshots.spec.ts:2192-2198` (the file is 2228 lines; the original cite was past EOF) is rewritten once, deliberately, including its `slice(0, 5)` arity, with the new order stated in the diff.
- Gates ×2 on the per-worktree stack. Baseline measured at plan time.

## 10. Docs

- ROADMAP: the phase entry, its exit (a hardware read at the erg: both panes in landscape at a real PM5, the width holding across a swipe, the notched bar against a real multi-interval piece), and the follow-ons this wave does not take (README §7's three open questions).
- DEVIATIONS: five rows — the notched bar overriding the packet's "unchanged" quarter ruler (ruling 7, with the re-anchoring and density rules); `RUNNING` in ink, which NARROWS the existing row 1 rather than adding a divergence; the live pane dropping the segment bar the packet's §3 keeps; the status word dropped where the packet and mockup render one (ruling 9); and the landscape full-bleed departing the app-wide max-width (ruling 10).
- The design packet stays in `docs/design/handoffs/2026-08-11-connected-revamp/` as the implementation's cited authority.
