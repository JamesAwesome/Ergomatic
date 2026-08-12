# Adversarial review — `2026-08-11-connected-revamp-design.md`

**Reviewer:** adversarial spec review, 2026-08-11 · **Worktree:** `connected-revamp` (off main `395b7a8`)
**Method:** every code cite re-opened this session; mockup inline styles read directly; design authority
(`REVISION-2026-08-11.md` governing, `README.md` standing, `Ergomatic connected mode.dc.html` visual truth)
read in full.

**Counts:** BLOCKING 6 · IMPORTANT 11 · MINOR 8 · NOTE 4

---

## BLOCKING

### B1 · §5 — "one notch per interval" and the §9 pin `phases.length - 1` count two different things

§5 says "one notch per **interval** boundary" and that the bar then states "how many **intervals**".
§9 pins "the notch count equalling `phases.length - 1`".

These are different numbers in every workout that has rests. The surface's own interval count is
`program.intervals.length` — `surfaceModel.ts:318` (`const intervals = program.intervals.length;`) feeding
`intervalLabel` at `:407` — and `compileProgram` "emits exactly one `ProgramInterval` per NON-REST phase,
folding every `type: "rest"` phase into the `restSeconds` of the interval before it"
(`surfaceModel.ts:119-122`). `phases.length` is the un-folded list: `segments.total: phases.length`
(`surfaceModel.ts:412`).

A 12-interval piece with rests is ~23-24 phases. The §9 pin therefore draws ~23 notches on a bar whose
adjacent caption reads `3 OF 12 · WORK` — the bar contradicts the label it sits beside, which is the exact
opposite of §5's stated goal. The spec must pick one count and say which, and if it picks phases it must
say what a REST notch means (§5's own "Rest spans are NOT separately tinted" hints at phases, but never
commits).

### B2 · §5 — notches are priced by ESTIMATE, the fill by REAL elapsed; on any distance interval the fill lands in the wrong span

§5: "The fill continues to show session progress, so its edge lands **inside the current interval's span**."

Falsifying evidence:
- The only pricing function is `phaseSeconds` (`domain/expand.ts:98-106`), and for a distance phase it
  returns `(phase.meters / 500) * phase.targetSplit` — the doc comment above it calls this "an **ESTIMATE**
  for a distance phase" (`:86`). `totalSessionSecondsOf` sums exactly that (`Timer.tsx:176-178`).
- The fill's numerator is not an estimate. Connected: `totalLeftSeconds = totalSeconds -
  frame.sessionElapsedSeconds` (`surfaceModel.ts:393-396`) — the machine's real accumulated clock.
  `totalProgressPct` divides real elapsed by the estimated total (`TimerRuler.tsx:9-18`).

So on a distance interval the notch sits where the target pace *predicted* the boundary, and the fill
advances at the rower's *actual* pace. A rower 5 s/500m up on target over a 2000 m piece puts the fill a
full 20 s past the notch — i.e. visibly inside the *next* interval — while the erg is still counting the
current one. The library is full of distance pieces (`distanceCaptionFor`, `surfaceModel.ts:703-720`,
exists solely because "a real library workout has three (Filling Low) or twenty-four (Sea Smoke)").
The spec asserts the invariant it cannot hold and never mentions the case.

Second half of the same hole: `phaseSeconds` returns `null` for a phase with neither seconds nor
meters+targetSplit (`expand.ts:105`), and `totalSessionSecondsOf` coerces it with `?? 0`
(`Timer.tsx:177`). Such a phase gets a **zero-width span** — two coincident notches. Open-ended "test"
phases and the two onboarding workouts (`Timer.tsx:139-141`) reach it. Unstated.

### B3 · §5 — both stated sources for the notch input are false

§5: "the same `phases` durations **the segment bar counts**, priced the way `buildRun` already prices them"
and "`TimerRuler` **gains the notch input**".

- `IntervalSegments` receives no durations at all. Its whole prop shape is
  `{ total: number; current: number; kinds: (...)[] }` (`IntervalSegments.tsx:20-24`), and the render uses
  only `total`/`current` (`:26-44`). The segment bar counts *phases*, not durations. There is nothing to
  reuse.
- `TimerRuler`'s whole prop shape is `{ totalLeftSeconds, totalSeconds }` (`TimerRuler.tsx:29-35`). It has
  no access to `phases`, to `EnginePhase`, or to `phaseSeconds`. All three call sites pass exactly those
  two numbers: `Timer.tsx:664-667`, `PaneLive.tsx:70-73`, `PaneTimer.tsx:79-82`.
- The connected side cannot supply the input either: `SurfaceModel` carries no phase-duration array.
  `segments` is `{total, current, kinds}` (`surfaceModel.ts:244-248`) — no durations. §6 lists exactly one
  model addition (`targetRate`); the notch offsets are a second, unnamed one.

The design's central new element has no named data path on either surface.

### B4 · §4 — every code cite in the width-fix section is wrong, and mechanism claim (2) is falsified

Cite audit (all read this session, `app/src/index.css`):

| Spec says | Actually at | What is at the cited line |
|---|---|---|
| `.connected-surface-body` `min-height: 0` at `:5315`/`:6277` | `:5302` and `:6264` | `:5315` is `flex-direction: column` inside `.connected-pane`; `:6277` is `justify-content: center` inside `.connected-pager` |
| `.connected-pane` `min-width: 0` at `:5326` | `:5313` | `:5326` is a comment line |
| `.connected-col` landscape `min-width: 0` at `:6346` | `:6333` | `:6346` is the `.connected-col-readouts` selector |
| panes' `overflow: hidden/clip` at `:5344-5346` | `:5331-5333` | `:5344-5348` is `.connected-pane .timer-dot-current` |
| grid's `overflow: visible` at `:5664-5670` | `:5651-5657` (`visible` at `:5656`) | `:5664-5670` is inside `.connected-grid-head` |

A uniform ~13-line offset across five cites means the numbers were carried, not read — the briefing's
"cite the line that would FALSIFY the claim, `file:line` read THIS session" is not met for the section the
spec calls "root-caused".

**Mechanism (2) is wrong.** §4 claims `.connected-pane-grid`'s `overflow: visible` "restores a
content-based intrinsic minimum that the other panes suppress." `overflow` governs only the *automatic
minimum size* — the `min-width: auto` case. `.connected-pane-grid` carries the `.connected-pane` class
(`PaneGrid.tsx:79`: `className="connected-pane connected-pane-grid"`), and `.connected-pane` declares an
explicit **`min-width: 0`** (`index.css:5313`). An explicit `min-width` overrides the automatic minimum
size outright, so `overflow: visible` cannot restore anything the other panes suppress. The two panes are
identical in this respect.

Worse, acting on the claim is a regression: `index.css:5654-5656` states why the exception exists — "The
rows own the vertical overflow. `.connected-pane`'s own `overflow: clip` would cut the scroller's own
scrollbar off" — and it is DEVIATIONS row 2, the one sanctioned scroll. §4's "removed or scoped… the
implementer determines which" defers a decision whose answer the CSS already carries, and defers it
towards breaking the pane.

**Verdict on the fix itself:** the primary half is right and sufficient — see the mechanism re-derivation
in the closing section.

### B5 · §6 — the gutter cannot be in the sensor gutter under the current `.screen` box, and the spec does not remove it

§6: "A 44px gutter column… the content column starts **immediately after it**, with no additional inset."
Revision §2: "Landscape already reserves 44pt beside the camera housing. Put the rail **inside** it."
Mockup `Ergomatic connected mode.dc.html:280` puts the gutter at x=0 of an 844px frame with
`border-right` and no outer margin.

But `.connected-surface` is a `.screen` (`ConnectedSurface.tsx:318`, `className="screen connected-surface"`)
and `.screen` is `max-width: 480px; margin: 0 auto; padding: … 20px …` (`index.css:401-407`), with the
landscape query raising the cap to `max-width: 800px` (`index.css:6233`). At an 844px viewport that puts
the surface's left edge at x=22 and its content box at x=42. A 44px "sensor gutter" drawn there starts
42px from the physical edge — it is not in the sensor strip, it is a stripe floating next to it.

Making the gutter real requires the landscape surface to go full-bleed (drop the 800px cap, zero the left
padding, honour `env(safe-area-inset-left)`), which changes the very quantity §4's width invariant pins.
§6 gestures at the cap ("today's rail is a right-edge grid column inside `max-width: 800px`") but never
states the change, and §4's pin is written as if the frame is fixed. These two sections have to be
reconciled before either is implementable.

Related and also unstated: the mockup assumes the housing is on the **left**. On a real phone it is on
whichever side the rotation put it. `env(safe-area-inset-left)`/`-right` is the only thing that knows;
nothing in §6 or §7 mentions it.

### B6 · §6/§7 — the revision's UP NEXT strings are unreachable from the code, and the spec adopts them unchanged

Revision §3 pins the copy: landscape `REST 2:00 · then WORK 2:09.0`, portrait `REST 2:00 · WORK 2:09.0`
(mockup `:349` and `:433` draw exactly those). §6 says "Then UP NEXT"; §7 says "UP NEXT and TOTAL LEFT per
§5-§6 above". Neither budgets any change.

The strings cannot be produced today. `upNextTextAt` returns `phaseAnnouncement(next)`
(`Timer.tsx:214-218`), and `phaseAnnouncement` returns `` `${kind} · ${phase.label}` `` — collapsing to the
bare kind word when the label equals it, which is exactly the rest case (`Timer.tsx:194-199`: "a rest
phase's label is literally `"Rest"`… in which case this renders the word once"). So a rest renders `REST`,
not `REST 2:00`. The duration is absent by a documented decision: "`EnginePhase` carries no `desc`/duration
phrase… the resolved label alone, not a reconstructed two-part prototype phrase built from data this app
doesn't have" (`Timer.tsx:202-206`).

Separately, the portrait/landscape split is done today by a hidden second line, not by two strings:
`UpNextStrip` renders `thenNext` in its own `.timer-upnext-then` span (`UpNextStrip.tsx:31-33`) which is
`display: none` in portrait (`index.css:3857-3858`). The revision wants one line with an inline `· then`
in landscape and a *different* one-line string in portrait. That is a component-shape change plus a
domain-side duration phrase, in a wave that names neither.

---

## IMPORTANT

### I1 · §3 — `statusWord` "keeps its other consumers" is false; the field is orphaned, and `ROWING` is dropped against the governing revision

The only renderer anywhere is `PaneTimer.tsx:54`. The three states §3 says keep it are all hardcoded
literals in the shell: `PausedBlock` prints `PAUSED · PULL TO RESUME` (`ConnectedSurface.tsx:397`),
`LostBanner` prints `LOST THE MONITOR` (`ConnectedSurface.tsx:382`), the ended frame prints
`SESSION ENDED` (`ConnectedSurface.tsx:305`). None reads `model.statusWord`. After PaneTimer dies the field
and `statusWordFor` (`surfaceModel.ts:775-780`) have zero production consumers and only test consumers
(`surfaceModel.test.ts:269,270,519`) — the definition of a field kept alive by its own tests.

The design side is also unflagged: the mockup renders `ROWING` on the **live** pane in both orientations
(`Ergomatic connected mode.dc.html:296` landscape, `:383` portrait), and revision §5 says "Status word
stays `RUNNING` here; **`ROWING` belongs to connected mode**". Dropping it is a divergence from the
governing document, and §10's DEVIATIONS list (three rows) does not include it.

### I2 · §3 — `intervalLabel` is not "rehomed"; the grid header takes the SHORT form, and the mockup puts the FULL form on LIVE

§3: "Full `INTERVAL 2 OF 5 · WORK` (`intervalLabel`) | REHOMED to the grid header
(`3 OF 12 · WORK · 0:47 LEFT`)". That destination string is `intervalLabelShort` plus a time, not
`intervalLabel`: `intervalLabelShort: \`${intervalIndex + 1} OF ${intervals} · ${kindWord}\``
(`surfaceModel.ts:408`) vs `intervalLabel: \`INTERVAL ${...}\`` (`:407`). The mockup confirms the split —
grid header `3 OF 12 · WORK · 0:47 LEFT` (`:508` landscape, `:562` portrait), live line
`INTERVAL 3 OF 12 · WORK` (`:295`, `:382`).

So (a) `intervalLabel` joins `statusWord` as an orphaned field, and (b) the spec's live pane shows the
short form where the governing mockup shows the full one. One of the two must move.

### I3 · §6 — `SurfaceModel` DOES carry the target rate and DOES render it; "no target rendered anywhere" is false

§6: "Rate exists today as a 40px card with **no target rendered anywhere**, and `SurfaceModel` carries no
target-rate field. This wave **adds** `targetRate` + its caption to the model, derived from the programmed
phase's spm, judged by the SAME `judgeActual` helper."

Falsified line by line:
- The phase's spm is already read: `const targetSpm = phase?.spm ?? null;` (`surfaceModel.ts:337`).
- It is already rendered: `rateCaption: targetSpm === null ? "NO RATE TARGET" : \`TARGET ${targetSpm}\``
  (`surfaceModel.ts:433`), placed by `PaneLive.tsx:94` (`caption={model.rateCaption}`) via
  `JudgedCard`'s `.timer-card-caption` span (`JudgedCard.tsx:64`).
- It is already judged by the one helper: `judgedValue({ kind: "spm", actual: frame.spm, target: targetSpm, … })`
  (`surfaceModel.ts:346-352`), and the tint class is already applied (`JudgedCard.tsx:56-58`).
- The census test already covers it: "EVERY judged cell on pane B goes through the helper — none opts out"
  (`ConnectedSurface.test.tsx:501`).

The only genuinely net-new item is *promoting the caption to a 46/44px numeral*. "Net-new plumbing" and
"the census test extends to cover it" both overstate the work and mis-describe the model.

`judgeActual`'s spm semantics do suit a rate hero: `harderThanAsked = kind === "pace" ? diff < 0 : diff > 0`
(`judge.ts:126`) → 27 against a target of 24 reads `"over"` = ochre, matching mockup `:327`. **Verified
correct**, tolerance `SPM_TOLERANCE = 2` (`judge.ts:31`).

### I4 · §6 — the two heroes have no designed state for a phase with no target, which is every rest

`targetSpm` is `null` on any phase without an spm, and `targetSplitSeconds` is `null` unless
`phase.targetKind === "split"` (`surfaceModel.ts:333-337`). Today the captions carry that fact
(`NO RATE TARGET` at `:433`, `NO SPLIT TARGET` at `:440`, `NOT ROWING` at `:813`). The new layout replaces
those captions with a bare `TARGET` label and a numeral (revision §3, mockup `:319-321`, `:329-330`) and
the spec says "Captions never re-word". So during **every rest interval** — and every warm-up, and every
effort-targeted work phase — both heroes render a `TARGET` label over nothing, in the largest type on the
pane. Undesigned and unmentioned.

### I5 · §6 — dropping the captions silently deletes three hard-won honesty strings

Each of these is rendered only through a caption slot the new metric row does not have:

- `paceCaption` — only consumer `PaneTimer.tsx:95`. Carries handoff §4's mandated paused treatment
  (`NOT ROWING`, `surfaceModel.ts:809-816`), pinned by `ConnectedSurface.test.tsx:686` ("NOW reads `—` with
  NOT ROWING, because nobody is pulling").
- `metersCaption` (`"TOTAL"`, `surfaceModel.ts:435`) — `surfaceModel.ts:353-362` is 10 lines explaining
  that this value is `sessionDistanceMeters`, NOT per-interval, and that the `TOTAL` caption is what makes
  it "literally true rather than accidentally so" after walk 4 caught the card falling 109→50. The mockup's
  metric row is a bare `METERS / 142` (`:340-341`) sitting beside `LEFT · INTERVAL` — which reads as
  interval meters, and 142 in the mockup *is* the active row's interval meters (`:523`). §6 says "meters"
  without saying which. Note `MonitorFrame.intervalAccrued` now exists and could supply the honest
  per-interval figure (`surfaceModel.ts:479-493`); the spec must pin one.
- `hrCaption`/`hrAbsent` + the `absentIdiom="dashed"` treatment (`PaneLive.tsx:102-108`) — revision §3
  deliberately kills it ("No dashed card, no explanatory copy"), which is fine, but it retires
  `hrCaption`, `hrAbsent`, `.connected-card-absent`, the `AbsentIdiom` union, and the two-test
  "no HR monitor" describe (`ConnectedSurface.test.tsx:778-798`). §3's casualty table lists none of them.

### I6 · §7 — "Accent's remaining jobs on this surface: the Pause fill and the phase progress bar" is wrong in both directions

- The TOTAL LEFT bar's fill is accent too, from the *same rule*:
  `.timer-phase-bar span, .timer-total-bar span { background: var(--accent) }` (`index.css:3722-3727`).
  The connected panes only escape it by an override (`index.css:5353`). So on the phone timer the notched
  bar of §5 sits on an accent fill — and §5 says "the bar stays **monochrome**". Contradiction between §5
  and §7; neither says the timer's total bar goes ink.
- The Pause "fill" is not a fill in the mockup: `background:#fffdf7; border:1px solid #1b1a17`
  (`Ergomatic connected mode.dc.html:733` landscape, `:825` portrait) — a surface field with an ink border.
  The mockup and revision §5 ("Pause is the only level-1 control") disagree about Pause's level; the spec
  follows the revision and does not name the divergence.

### I7 · Blast radius — the unscoped `.timer-*` landscape leak is not accounted for, and this wave rebuilds the leaking layer

`index.css:6310-6320` documents the trap in its own words: "THE PHONE TIMER'S LANDSCAPE QUERY IS NOT SCOPED
TO ITS OWN SCREEN. `.timer-dots`, `.timer-upnext` and `.timer-total` each get an explicit
`grid-column`/`grid-row` there — and `.timer-dots` gets `align-self: center` — so the three components the
connected panes reuse verbatim arrive carrying the phone timer's grid placement into a layout that is not
a grid." The originating rules are `index.css:4070` (`.timer-total`), `:4087` (`.timer-dots`), `:4098`
(`.timer-upnext`), all unscoped inside the landscape query at `:4011`. The defence is a three-property
reset at `index.css:6321-6327` (`grid-column`, `grid-row`, `align-self` only).

§7 rebuilds the phone timer's landscape layout. Any new property those rules acquire (`order`, `flex`,
`width`, `margin`, `justify-self`) leaks straight into `.connected-pane` past a reset that only knows about
three. The spec mentions neither the leak nor the reset, and §9's pin list has nothing that would catch it.
The symptom last time was invisible for a whole screenshots round ("it survived… looking merely 'thin'",
`index.css:6317-6318`).

### I8 · Blast radius — the lost-banner and paused step-downs are keyed to elements this wave deletes, and §9 names only one of them

§9 retires "the lost-banner step-downs keyed to `.connected-clock-value`". The actual set is wider and
touches **live**, not just the dying pane:

- `index.css:5974-5977` — `.connected-surface:has(.connected-lost) .connected-second-value` (PaneLive's
  interval clock, `PaneLive.tsx:80-88`) steps to 60px. That element is being replaced by the 30px metric
  row.
- `index.css:5970-5972` — `.connected-hero-tenths` steps to 42px. The hero tenths survive but change base
  size (58/54, see M3).
- `index.css:6435-6437` — `.connected-pane-live .connected-second-value { font-size: 56px }`.
- `index.css:6257-6259` — `.connected-surface:has(.connected-lost) .connected-cards-triple .timer-card`
  padding squeeze, with the measurement recorded above it ("pane B's readout column ran 244px into a 238px
  slot"). `-triple` leaves the live pane, so this landscape squeeze leaves with it and the new layout has
  no equivalent guard for the banner-up case at 390px.

More fundamentally: **the paused and lost states on the rebuilt live pane are undesigned.** The mockup's
only paused frame is `data-screen-label="A · erg paused"` (`:866`) — drawn against pane A, which is being
deleted. §9 says `connected-paused` "must RE-POINT to live", which is a capture instruction standing in
for a design decision nobody has made.

### I9 · §6 — the footer/End argument is backwards and contradicts the invariant it cites

§6: "**End session** becomes a 44pt outlined control in the surface header… The paused block inherits the
vacated footer slot, so nothing above it shifts when the erg stops."

The current invariant is the opposite construction: End and the paused block share ONE fixed-height slot
so the swap is structurally exact — `ConnectedSurface.tsx:329-333` ("The paused block and End occupy the
SAME 52px slot… The height lives on this wrapper, not on either child, which is what makes the swap
structurally exact rather than two numbers kept equal by hand"), pinned by two tests
(`ConnectedSurface.test.tsx:633` "NOTHING ABOVE SHIFTS: the swap happens inside one fixed-height slot" and
`:656` "index.css pins that slot, and both occupants, at 52px").

If End leaves for the header, the footer is empty while rowing. A paused block "inheriting" it then adds
height and *does* shift everything above — unless the slot stays reserved and empty, which wastes the ~70px
the mockup's own note says End moving *frees* ("freeing about 70px of vertical",
`Ergomatic connected mode.dc.html:476`), and which no mockup frame shows. Unresolved.

### I10 · §9 — the retirement list materially undercounts the tests that break

"the pane-A describe in `ConnectedSurface.test.tsx` (4 its)" is accurate as far as it goes
(`ConnectedSurface.test.tsx:352-397`, its at `:357`, `:365`, `:380`, `:390`). Not named, all pane-A- or
element-dependent:

- `:467` "tints pane A's NOW card ochre when faster and teal when slower"
- `:512` "EVERY judged cell on pane A goes through the helper — none opts out"
- `:675` "the interval clock greys but holds its last value" — queries `.connected-clock-value` directly
  (`:681-683`)
- `:686` "NOW reads `—` with NOT ROWING" — the `paceCaption` slot (I5)
- `:734` / `:754` — stale sweeps "on every cell of every pane"
- `:311` "carries both label sets in both orientations" — the `TIMER`/`TMR` label pair
  (`PagerRail.tsx:26`) goes with `PANES` (`PagerRail.tsx:14`)
- `:245`, `:258`, `:263` — swipe index arithmetic over a 3-element `PANES`
- `:322` "reaches pane C, the grid" — grid moves from index 2 to 1
- `:779`, `:787` — the no-HR describe (I5)
- `src/workout/connected/PaneGrid.test.tsx` (1256 lines) — every row-geometry expectation, since rows go
  single-line
- `e2e/screenshots.spec.ts:2214` — `expect(visible).toBeGreaterThanOrEqual(5)`, the current landscape
  visible-row pin that §9 replaces with 8 but never names as a retirement

### I11 · §9 — the tab-order pin cite points past the end of the file

§9 cites `screenshots.spec.ts:2233-2237`. The file is **2228 lines**. The pin is at
`e2e/screenshots.spec.ts:2192-2198`:

```
expect(tabOrder.slice(0, 5)).toStrictEqual([
  "Interval grid", "End session", "Timer pane", "Live pane", "Grid pane",
]);
```

Note the pin asserts `slice(0, 5)` — with the rail down to two targets and End moved to the header the
array shrinks to four AND reorders (End first, since the header precedes the body in DOM order). §9 says
"rewritten once, deliberately, with the new order stated in the diff", which is right in spirit; the cite
and the arity change are both wrong/unstated.

The `connected-paused` cite is also off: actual `ConnectedSurface.screens.test.tsx:236-243`, not `:238-245`.

---

## MINOR

### M1 · §3 — the live pane's segment bar is kept by the GOVERNING document, not only by the packet

§10 records the DEVIATIONS row as "the live pane dropping the segment bar **the packet's §3 keeps**". The
*revision* keeps it too — `REVISION-2026-08-11.md:65`: "Interval segment bar 4px, 12 segments; total-left
bar 5px with quarter ticks. **Unchanged.**" — and the mockup draws all twelve segments on live in both
orientations (`Ergomatic connected mode.dc.html:300-313`, `:386-398`) and on the timer (`:692-705`,
`:769-782`). The deviation is against the governing revision; the DEVIATIONS row should say so.

### M2 · §6 — the live pane's layout omits the mockup's own geometry

Not in the spec, present in the mockup's landscape live frame:
- hero columns are **unequal**: `flex:1.18` (split) vs `flex:0.82` (rate), `:315` / `:325`
- a 1px `#d8d3c4` vertical rule between them (`:324`)
- UP NEXT is on the **same row** as the metric cells, right-aligned (`:347-350`; the mockup's own note at
  `:471` says "with UP NEXT right-aligned on the same line"). §6's "Then UP NEXT" reads as a separate row,
  which is the *portrait* treatment (`:431-434`, a sunken band).
- metric-row labels are **10px**, not 11 (`:336`, `:340`, `:344`)

The same 1.18/0.82 + rule structure recurs in the timer frame (`:707`, `:715`, `:716`).

### M3 · §6/§8 — "tenths at half size" contradicts the pinned sizes

§6 says "tenths at half size". Revision §3's table says split tenths **58px** landscape / **54px** portrait,
and the mockup renders exactly those (`:317` `font-size:58px`, `:402` `font-size:54px`). Half of 112/104 is
56/52 — which is the *sub-hero* step (revision §6's token list: "hero 112/104, **sub-hero 56/52**, target
46/44…"), i.e. the TIMER's target size (`:719`, `:794`). Implementing "half size" as `0.5em` produces the
wrong number and collides two distinct steps. Note revision §6's own token list omits the tenths step
entirely; §8 names `hero-tenths` but §6 defines it wrongly.

### M4 · §8 — "254 literal font-sizes" is off

`grep -c 'font-size:' src/index.css` → **252**. The rest of §8 verifies: `tokens.css` has no font-size
token (`--radius: 2px` at `:97`, `--tap: 44px` at `:98`, three `--font-*` families at `:100-102`, nothing
else).

### M5 · §6 — "Rate exists today as a 40px card" is portrait-only

`.connected-cards-triple .timer-card-value { font-size: 40px }` (`index.css:5483-5484`), but the landscape
query overrides to 44px (`index.css:6447-6450`, comment: "Three equal cards at 44px in landscape"). The
handoff's own pair is "40px / 44px" (README §3).

### M6 · §6 — the grid pane's own new copy is unspecified

The mockup's landscape grid carries a footer caption `4 MORE BELOW · ROW 5 IS A 500 M PIECE` (`:547`) and
portrait `ROW 5 IS A 500 M PIECE · METERS COUNT DOWN` (`:623`), and revision §4 requires "state the number
of rows below **in words**". §6 says nothing about either. The distance caption generator already exists
(`distanceCaptionFor`, `surfaceModel.ts:703-720`); the "N MORE BELOW" half does not, and it competes for
the same landscape row as the caption.

### M7 · Mockup internal inconsistency the spec inherits — grid row-number size

Revision §4 pins "row number mono 13px". The mockup's landscape rows use **12px** for inactive
(`:514`, `:518`, `:526`…) and 13px/600 for the active one (`:522`); portrait inverts it — 13px inactive
(`:574`, `:586`…) and 12px active (`:582`). Whichever is chosen, one of the three sources is wrong and the
spec should say which governs.

### M8 · §5 — the fallback threshold is stated but its warm-up case is not answered

"The threshold is literal: `phases.length > 1`." `phases` includes the warm-up SETTING's phases, which
`buildRun` prepends — warm-up phase first, optional trailing rest second, and "ORDER IS PART OF THE
CONTRACT" (`src/session/engine.ts:42-49`). So a genuinely single-interval session with the warm-up setting
on has `phases.length` of 2 or 3 and takes the notched branch, drawing a notch at the warm-up boundary. If
notches are per *interval* (B1) a warm-up is not one; if per *phase* it is. Unanswered either way.

---

## NOTE

### N1 · Notch pitch — the numbers, for the record

The TOTAL LEFT bar is `flex: 1` after the label and value in the new inline treatment (mockup `:356`).
Usable widths: landscape live ≈ 630px (844 − 44 gutter − 30 padding − ~75 label − ~55 value − gaps);
portrait ≈ 205px. A 25-interval piece with rests is ~49 phases → 48 notches:

| | pitch | 1px hairline coverage |
|---|---|---|
| landscape ≈ 630px | 13.1px | 8% |
| portrait ≈ 205px | 4.3px | **23%** |

Not sub-pixel, but at 4.3px pitch on a 5px-tall bar the portrait result is a hatched grey field, not a
countable structure — and rests are shorter than works, so the spans are visibly uneven. At `phases`
granularity the bar cannot say "how many intervals" at 25. If B1 resolves to *interval* granularity
(24 notches) the portrait pitch is 8.5px, which is readable. A max-notch-count or min-pitch rule is
missing either way. Additionally, 1px hairlines at fractional proportional offsets land on fractional
device pixels and will anti-alias to uneven weights — worth a `transform: translateX(-0.5px)` /
device-pixel-snapping note in the plan.

### N2 · `PANES.includes` fallback — VERIFIED, the one accurate cite in the spec

`ConnectedSurface.tsx:73`: `return PANES.includes(stored as PaneId) ? (stored as PaneId) : DEFAULT_PANE;`
inside a `try` with a `catch` returning `DEFAULT_PANE` (`:70-77`). A stored `"timer"` degrades to
`DEFAULT_PANE` cleanly once `PANES` becomes `["live","grid"]`. §6's "verified graceful, no migration
written" holds. Pinned already by `ConnectedSurface.test.tsx:224` ("ignores a garbage stored value").

### N3 · The 18-capture count is right

`CONNECTED_STATES` has 9 entries (`e2e/screenshots.spec.ts:2110-2123`) × 2 orientations
(`:2126`, `:2133`) = 18. Nine matching HTML fixtures in `e2e/fixtures/connected-*.html`. §9's "18 today"
and the `connected-pane-timer` ×2 + fixture retirement are accurate. The 8 interstitial captures
(`connected-interstitial-{failed,pairing,programming,ready}[-landscape]`, `:1576`-`:1814`) are correctly
out of scope per §1's non-goals.

### N4 · Phone-timer TimerRuler is gated; the connected one is not

`Timer.tsx:663` renders `TimerRuler` only `{hasEstimate && …}`, per `hasRemainingEstimate`
(`Timer.tsx:147-155`) — so on the two onboarding workouts the notched bar is absent entirely on the phone
timer. `PaneLive.tsx:70` renders it unconditionally. §5's "Both surfaces get it" is true only where the
gate allows; worth one sentence so the implementer does not "fix" the asymmetry.

---

## Verdict on §4's width mechanism

**The primary fix is the right one. The second half is unnecessary and dangerous.**

Re-derived from the cascade, not from the spec:

1. In landscape `.connected-surface` is `display: grid; grid-template-columns: 1fr 56px`
   (`index.css:6227-6229`) with `max-width: 800px` (`:6233`).
2. `.connected-surface-body` is a **grid item** at `grid-column: 1` (`index.css:6261-6265`) and its
   `overflow` is `visible` (never set). Per CSS Grid §6.6, a grid item with `overflow: visible` spanning a
   track whose min sizing function is `auto` — which `1fr` is, being `minmax(auto, 1fr)` — takes an
   **automatic minimum size** equal to its content-based minimum. It declares `min-height: 0` and nothing
   for width (`index.css:5300-5304`, `:6264`). That is the whole bug.
3. The `1fr` track's base size therefore floors at the body's min-content contribution, which is whatever
   the currently mounted pane's content demands — and only one pane is mounted at a time
   (`ConnectedSurface.tsx:322-324`, three mutually exclusive `&&` renders). Different pane → different
   min-content → different track width, and inside the grid pane, different interval count / meters digits
   → different min-content again. That is exactly James's "changed width view to view", content-dependently.
4. `min-width: 0` on `.connected-surface-body` closes it completely. With a definite `min-width`, the
   item's minimum contribution is the outer size implied by that used minimum — 0 — so the track's `auto`
   minimum is 0 and the track resolves purely from free space: a fixed `800 − 56 − 12 = 732px`,
   independent of content, in both panes. The 56px rail and its `left` follow deterministically. Nothing
   else in the chain can reintroduce content dependence, because `.connected-pane` (`:5313`) and
   `.connected-col` in landscape (`:6333`) already carry `min-width: 0`.

**The grid's `overflow: visible` is not part of the mechanism.** `overflow` governs the automatic minimum
size, i.e. the `min-width: auto` case only. `.connected-pane-grid` also matches `.connected-pane`
(`PaneGrid.tsx:79`), which sets an explicit `min-width: 0` (`index.css:5313`) — that overrides the
automatic minimum outright, so `visible` restores nothing there. Touching it buys no width stability and
costs the sanctioned contained scroll, whose CSS says so in place (`index.css:5654-5656`) and which is
DEVIATIONS row 2. **Recommendation: implement the `min-width: 0` half only; delete the second half of §4's
fix paragraph rather than deferring it to the implementer.**

Two things §4's fix does introduce that the spec should own:
- Once the track stops growing, content that used to widen the column gets **clipped** instead
  (`.connected-pane` is `overflow: clip`, `index.css:5331-5333`) — or, on the grid pane, spills visibly.
  §9 pins hero no-clip but pins nothing for the grid pane's overflow at 732px.
- §6's gutter change (B5) alters the same track's arithmetic. The pin in §4 must be written against the
  post-gutter frame, or it pins a number the next section invalidates.

The pin itself is well-designed: identical `width` AND `left` for both panes, both orientations, asserted
after a swipe, is mechanism-independent and would catch a future regression from any cause. Keep it.

---

## Verdict on the notch design's distance-interval hole

**The hole is real, it is not narrow, and the spec does not acknowledge it.**

"Proportional to duration" is not defined for a distance interval, because a distance interval has no
duration — it has an *estimate*. The one pricing function in the codebase says so in its own doc comment:
`phaseSeconds` returns "an ESTIMATE for a distance phase (`(meters / 500) * targetSplit`)"
(`domain/expand.ts:85-88`, implementation `:98-106`). So a notch on a distance interval marks *where the
target pace predicted the boundary*, while the fill beside it advances on the machine's real clock
(`surfaceModel.ts:393-396`). The two disagree by exactly the rower's performance, which is the one quantity
the whole pane exists to make visible. §5's promise — "its edge lands inside the current interval's span" —
is therefore false whenever a rower beats or misses target on a distance piece, and the failure is *worst
for the rowers doing best*. The library has three-distance-piece and twenty-four-distance-piece workouts
(`surfaceModel.ts:697-701`).

Three sub-cases the spec must answer before this becomes a plan:

1. **Distance interval with a target split** — notch is an estimate; fill is real. State the tolerated
   drift, or drive notch positions from the machine's own per-interval checkpoints
   (`MonitorFrame.intervalRemaining`/`intervalAccrued`, already on the seam,
   `surfaceModel.ts:479-493`) rather than from `phaseSeconds`. Note that on the *unconnected* timer no such
   checkpoints exist, so the two surfaces cannot share one rule without saying which degrades.
2. **Distance interval with NO target split** — `phaseSeconds` returns `null` (`expand.ts:102-105`),
   `totalSessionSecondsOf` coerces to 0 (`Timer.tsx:177`) → a zero-width span and two coincident notches.
   Every effort-targeted distance phase hits this (`targetKind === "effort"` is precisely the case
   `surfaceModel.ts:329-336` refuses to treat as a target).
3. **What a notch means at all on a distance piece** — the rower's mental model there is meters, and the
   grid pane already commits to that in words ("METERS COUNT DOWN", `surfaceModel.ts:708`). A time-
   proportional notch on a meters-counting interval is a third unit on a bar that already mixes two.

Minimum acceptable resolution: §5 states the distance rule explicitly (estimate-based, with the drift
named as accepted, or checkpoint-based with the timer's degradation named), states the `null`-priced
behaviour, and reconciles its notch unit with B1's count. Without those three it is not implementable —
the implementer would have to invent the semantics, which is how the last two waves acquired their
blocking findings.
