# Connected redesign — Phase CR2, spec 3 of 3

**Status:** approved by James 2026-08-16 (design gate run: PM GO-WITH-CONDITIONS,
all conditions ruled — CAL cut, pane slide cut, swipe removed).
**Branch:** `cr2-redesign`, worktree `.claude/worktrees/cr2-redesign`, base `beaef4f`.
**One PR** (James's ruling). Release after merge: **v0.10.0 (MINOR)** with a
notes PR before the tag — this spec does not build the notes.

## What and why

The connected screen spends its space on a label layer and on values the PM5
shows four inches higher in the same sightline: time left in interval, current
meters, raw HR, session meters. This spec deletes all of that, moves pane
switching from the left gutter (portrait: bottom rail) to a header segmented
control (portrait: 54px bottom bar), and gives the reclaimed space to the two
judged heroes. The phone shows only what the plan knows and the erg cannot:
targets, judgement colours, session structure, what is next, and TOTAL LEFT.
The design is James's commissioned handoff
(`docs/design/handoffs/2026-08-15-connected-v2/`, turn-2 frames 2A-2D,
high-fidelity, values final) — **the README is the value authority for
everything §2's tables do not override.**

## Rulings (all James, 2026-08-16, at the design gate)

1. **Tester rulings govern colors.** Judged actuals stay `--judge-faster`
   `#1d4e89` / `--judge-slower` `#962718`; the grid countdown stays gold
   `--marker` `#7d5510`. The handoff's teal/ochre "judgement colours
   (unchanged rule)" section reuses the palette the 2026-08-13 tester ruling
   replaced — stale, do not implement.
2. **CAL is CUT** (re-ruled after the PM gate falsified the premise the first
   ruling rested on): 0x0033's `totalCalories` is interval-scoped — decoded
   from both committed walk-2026-08-16 recordings, it resets to 0 at every
   interval boundary (keystone ends reading 15 for a ~30-cal session), the
   0x0039 summary carries no calorie field, and the fake emits a constant 0.
   An honest session CAL is a register fold — filed as follow-up "session
   calories, folded", not this spec. ZONE was already deferred (needs a strap
   plus a max-HR source the app doesn't have). **The bottom band is up-next +
   TOTAL LEFT.** The strapless 2D band ("cells absent, siblings close up") is
   therefore the ONLY band; no strap-gated variant exists.
3. **The ~200ms pane slide is CUT.** It would be the first animation in the
   codebase against the written rule (`docs/design/README.md` "No animations…
   keep it calm"). Panes keep the instant swap; the control's active-half fill
   carries the state.
4. **The swipe handler is REMOVED** (`handleTouchStart`/`handleTouchEnd`,
   `paneAfterSwipe`, `SWIPE_THRESHOLD_PX`, the `touch-action: pan-y` note
   stays only if something else needs it). Unverified on device by the
   handoff's own admission; not riding the phase's only canary build. It can
   return later behind a device verification.
5. **One spec, one PR.**

Standing overrules honored (recorded pre-gate): TOTAL LEFT and the GRID
header read the hardware-corroborated register-map accumulator — the README's
"compute from plan + elapsed, not the broken accumulator" line is overruled
(PM spec-2 gate, PROVENANCE item 2). The paused overlay stays dead (2a built
`PULL TO RESUME`; the handoff independently dropped PAUSED).

## §1 Deviation table (README → what ships)

| README says | Ships as | Why |
| --- | --- | --- |
| Judged teal `#2a6275` / ochre `#8a5f18` | `--judge-faster` / `--judge-slower` | Ruling 1 |
| Grid countdown accent `#b5341f` | `--marker` gold | Ruling 1 |
| `ZONE` + `CAL` cells, strap-gated, "calories derived from HR" | Neither exists; band = up-next + TOTAL LEFT | Ruling 2; premise falsified (PROVENANCE item 5) |
| Pane slide ~200ms translateX | Instant swap | Ruling 3 |
| "Keep the existing swipe handler wired" | Swipe deleted | Ruling 4 |
| GRID header `38:20 LEFT` "compute from plan + elapsed" | From the accumulator (`totalLeftDisplay`) | PROVENANCE item 2 overrule |
| Grid rows 36px landscape | **32px** — James's measured 2026-08-12 ruling governs ("8 rows at 36px is 288px, more than any measured build of this frame has ever offered", `index.css` comment + DEVIATIONS.md row; same principle as the color rulings). DEVIATIONS.md's row is reconciled in this PR. | Antagonist finding 3 |
| Landscape safe-area "assumes 0 but must survive ~59px" (sides only) | The header also honours `env(safe-area-inset-top)` in landscape. **No device constant is assumed** (no in-repo source exists for a nonzero landscape top inset, and Chromium reports every `env()` as 0 so no gate can observe one): the grid's visible-row count is pinned at zero inset; under a nonzero inset the grid scrolls — no re-derivation. | Antagonist finding 9 |

Everything else in the README ships as written: geometry, spacing, copy, the
44px floor, the 12px type floor, the ink-4-never-below-12px ban (the e2e
assertion already enforces it).

**Type scale — connected-scoped tokens, NOT the shared `--size-*` family**
(antagonist finding 2: the `--size-*` roles are one global `:root` pair
shared with the phone timer — `--size-label` reaches `.timer-card-label` and
the timer's END, `--size-total` reaches `.timer-total-value` — and
`tokens.test.ts` pins the family's exact membership and bans orientation
suffixes). The new scale ships as a NEW connected-only family, `--c-size-*`,
defined ON `.connected-surface` itself (portrait values on the class,
landscape overrides in the existing landscape media query — never on
`:root`, so the family is invisible to the phone timer and to
`tokens.test.ts`'s `:root` membership pins by construction), with this role
mapping (landscape/portrait):
`--c-size-hero` 112/100 · `--c-size-hero-2` 92/84 · `--c-size-tenths` 58/52 ·
`--c-size-target` 40/36 · `--c-size-band` 30/28 · `--c-size-status` 22/21 ·
`--c-size-row` 19/19 · `--c-size-label` 15/14 · `--c-size-control` 13/13 ·
`--c-size-thead` 12/12. The shared `--size-*` family and the phone timer are
untouched; connected rules stop consuming `--size-*` entirely (grep-pinned).
`tokens.test.ts` is named in §5 as a file this spec extends (the new family
gets its own membership pin). New color token: `--progress-active` `#8a8478`,
decoration-only — never text.

## §2 Per-frame property tables — THESE ARE THE EXIT CRITERIA

Each row is independently checkable in the structural design assertions or a
unit test. "README" = the handoff README's matching section carries the exact
values.

### 2A — LIVE, landscape

| Property | Requirement |
| --- | --- |
| Header row | 44px: segmented control far LEFT · 8px ink square + `PM5 <id>` (mono 13, 0.10em, ink-2) · spacer · status `3 OF 12 · WORK` (mono 22, 0.04em, ink) · END far right. Control and END never adjacent. |
| Progress bar | 6px, full-width, one segment per interval, 3px gaps, **widths duration-proportional** (the old ruler's proportional truth carries over; the README does not say equal, and equal-width would lie about a 10:00 piece beside a 0:30 rest); done ink / active `--progress-active` / upcoming `--rule-2`. >16 intervals: no segments — a single proportional fill bar with the quarter-tick row (the fallback DRAWS the fill; the bar consumes `boundaries` + `totalSeconds` + elapsed for both modes). `MAX_NOTCH_BOUNDARIES = 16` is kept as the threshold (16 gapped segments stay ≥18px even at portrait's 342px). Disclosed residual: active-vs-upcoming segment contrast `#8a8478` on `#ded8c9` = 2.61:1, under WCAG 1.4.11's 3:1 for meaningful graphics — accepted because the same state is redundantly in the status text (`3 OF 12 · WORK`); the bar is reinforcement, not the sole carrier. |
| Heroes | Two columns split by 1px `--rule`, left flex 1.25 / right 0.75, vertically centered. Split: 112px mono 500 lh 0.92 −0.05em, tenths 58px span, judged colour, nowrap; beneath: target 40px ink + source tag 15px ink-3 (e.g. `6K`). Rate: 92px same treatment, judged; beneath target 40px + `SPM` 19px ink-3. |
| Cut from LIVE | NO `NOW`/`TARGET`/`UP NEXT` labels, no `/500m` unit, no `LEFT IN INTERVAL` cell, no `TOTAL M` cell, no `HR` cell, no TimerRuler block. |
| Bottom band | 1px ink rule above, 9px padding-top, bottom-aligned, 30px gaps: up-next `REST 2:00 · then WORK 2:09.0` mono 30px ink, flex 1, nowrap, NO label; then `TOTAL LEFT` labelled cell (label mono 15px 0.10em ink-3 over value mono 30px ink). |
| Split cap | 4 chars + tenths; slower than 9:59.9 shows `—` (existing rule). |
| Insets | Content inside safe-area; ≥16px side insets; landscape top inset honored (20pt devices). |

### 2B — GRID, landscape

| Property | Requirement |
| --- | --- |
| Header | Same header, GRID half active; status reads `3 OF 12 · 38:20 LEFT`, the countdown portion in `--marker` gold (deviation from README's accent, Ruling 1). No progress bar. Composition note (antagonist finding 11): `intervalLabelShort` bakes the phase word in — the model grows an ordinal-only field (`intervalOrdinalLabel`, `3 OF 12`) that the grid header joins with `totalLeftDisplay`; named in §5. |
| Table head | mono 12px 0.12em ink-3, 2px ink rule below. Columns `#` 30px · TIME flex 1 L · METERS flex 1 R · /500M flex 1.1 R · SPM 0.6 R · HR 0.6 R · REST 0.8 R. |
| Rows | **32px landscape** (§1 deviation row — James's measured ruling governs; the merged headline's reclaimed height goes to MORE VISIBLE ROWS, not taller ones), values mono 19px −0.01em, 10px gaps. Completed: ink, 1px `--rule-2` bottom. Active: `--surface` fill pinched by 1px ink rules top+bottom, 4px ink marker bar, number weight 600, countdown `--marker`, split/rate judged. Upcoming: ink-3, programmed targets, 1px dashed `--rule-3` bottom, `—` for unknowables. Visible-row count pinned at zero inset. |
| Footer caption | mono 12px ink-3, README format (e.g. `5 MORE BELOW · ROW 5 IS A 500 M PIECE`); merges the existing distance-caption content. |
| Scroll/focus | Row list is the only scrolling region, keyboard-focusable, auto-scrolls active row into view (existing behavior kept). |
| TOTAL LEFT source | `totalLeftDisplay` = plan total minus the SESSION accumulator's elapsed (`frame.sessionElapsedSeconds`, the register map's monotone sum) — never the interval-resetting `frame.elapsedSeconds` and never wall-clock. (Reworded at the phase-exit pass: the original "never plan+elapsed" phrasing contradicted the implementation, which IS plan−elapsed; the invariant is WHICH elapsed, and it now has a discriminating witness in `surfaceModel.test.ts` — the frame factories default the two fields equal, so only a diverging fixture can tell them apart.) |
| GRID portrait | The handoff has no portrait grid frame. **Today's portrait grid geometry governs** (40px rows, current scroller) restyled with the new tokens, table-head treatment, footer-caption format, and the 54px bottom bar in place of the rail. One table row, one rule: geometry today's, skin new. |
| Interval countdown's home | After the redesign the interval countdown exists ONLY in the grid's active-row cell (LIVE's cell is cut; the grid headline becomes session-left). Named here so nobody reads its absence from LIVE as a regression of 2a's clock fix — the fixed clock feeds the grid cell and TOTAL LEFT. |

### 2C — LIVE, portrait

| Property | Requirement |
| --- | --- |
| Layout | Column, 20px top / 24px sides, 13px gaps. Header: PM5 id + END (44px, no segmented control up top). Status line mono 21. Same 6px progress bar. |
| Heroes stacked | Split 100px (tenths 52) over target 36 + tag 14; rate 84 over target 36 + `SPM` 18 (the README's own 18 governs over the portrait scale's "19 table & SPM" slot — §2 overrides, stated so nobody re-litigates); 2px ink rule above split block, 1px `--rule` above rate block, 16px padding-top each. |
| Up-next | `UP NEXT` label (mono 14 ink-3) over value mono 23px nowrap — 23px is a fit constraint for 342px content width; never wrap, never overflow. **Portrait renders the `then`-less form** (`REST 2:00 · WORK 2:09.0`, 23 chars ≈ 317px at Plex Mono's 0.6em advance; the `then` form is 386px and overflows) — the existing `.timer-upnext-then { display: none }` mechanism dies with UpNextStrip, so the band reproduces the drop itself, and the existing `innerText` pin carries over (never `textContent`). Landscape keeps the full `then` form per 2A. |
| TOTAL LEFT | `TOTAL LEFT` + value mono 28 on a rule, above the bottom bar. (No zone/cal row — Ruling 2.) |
| Bottom bar | 54px full-width segmented bar, two equal halves, active half ink fill / `--surface` text mono 13 600, above the home indicator. |

### 2D — First frame (armed), landscape

| Property | Requirement |
| --- | --- |
| Status | `1 OF 12 · READY` — the READY word ships HERE (closes PROVENANCE item 3). Portrait status line likewise. |
| Mirror | Split shows the target value as ghost in ink-4 `#6f6a5f` (never ink-5); rate shows `0` plain ink; nothing judged; no dash-bars. 2a's mirror model feeds the VALUES; **three things are new, not one** (antagonist finding 1): the ghost color, the READY caption, and the armed up-next branch below. |
| Up-next (NEW model branch) | At armed, up-next reads the FIRST interval forward (`WORK 10:00 · then REST 1:00`) — today's `upNextTextAt` is `phases[index + 1]` by construction and shows the coming REST at armed (the committed `connected-armed-landscape.png` proves it). The model gains an armed branch reading `phases[phaseIndex]` / `[phaseIndex + 1]`. Unit-tested in §5. `TOTAL LEFT` full session (existing 2a behavior). |

### Stale (link lost, values held)

| Property | Requirement |
| --- | --- |
| Values | Heroes grey (existing `staleFor` path), `LAST` caption appears above each hero — the ONLY place a hero label exists post-redesign. The README sizes no LAST treatment; **this spec pins it**: label role (`--c-size-label` 15/14), 0.10em, ink-3, above the value. `nowLabel` collapses to `stale ? "LAST" : ""` (the NOW branch dies with the labels). |
| Banner | Existing `LostBanner` row inserts (landscape one-line variant); device caption `PM5 … · LOST`, hollow mark. |
| Layout | Must survive the banner's height without overflow in both orientations. |

### Disconnected step-down

| Property | Requirement |
| --- | --- |
| Heroes | Step down 112→86 and 92→70 landscape (README's pair; note today's step-down is ONE shared rule for both heroes — it splits into two). The README gives no portrait or tenths pairs; this spec pins the same ratio rounded: portrait 100→76 and 84→64; tenths 58→44 landscape, 52→40 portrait. Layout survives the lost height with the banner inserted. |

## §3 Structure

**Components.** `PagerRail` dies. A new `SegmentedControl` renders as its
own grid item of `.connected-surface` (NOT a DOM child of
`.connected-header` — the rail today is a sibling grid item too, and a
header child cannot become a bottom bar by CSS alone): landscape it is
placed into grid row 1 beside the header content; portrait into the last
row as the 54px bottom bar. `ConnectionLine` (the mark + PM5 id + status
caption) **moves out of the panes into the header row** — 2A/2B draw one
44px header carrying control, device caption, status, and END; today the
line renders inside each pane. Two `<button>` halves, `aria-current="page"`
on the active half (the one shipped use of `"page"` is the rail this
replaces; `"step"` idiom continues elsewhere; no APG tablist invention),
each half ≥44px, real focus order. **The triple-tap diagnostics gesture
ports onto the control's halves** with its per-target reset rule and the
`logOpener` focus-restore ref intact — it is the only route to diagnostics
and the walk depends on it. **Swipe deleted** (Ruling 4).

**Forks, not shared-component edits** (PM gate condition — the phone timer is
a second product surface this spec must not reach): the 6px progress bar is a
NEW `ConnectedProgressBar` consuming `boundaries` + `totalSeconds` + elapsed
(segment mode: duration-proportional widths; fallback mode >16: proportional
fill + quarter ticks — `notchPercents`' percentage math is the wrong shape
for segments, so the new component owns its own math; only the
`MAX_NOTCH_BOUNDARIES = 16` threshold constant carries over as a value). The
up-next line is rendered by the band directly (landscape unlabeled with
`then`; portrait labeled, `then`-less). `TimerRuler` and `UpNextStrip` are
untouched and remain the phone timer's; after the redesign neither is
imported by any `connected/` file — pinned by test (`upNextTextAt`/
`thenNextTextAt` come from `Timer.tsx`, not these components, so the fork
holds). Grep their class names across the connected CSS and remove dead
rules (recurring failure #5). The forked type scale is §1's `--c-size-*`
family.

**Safe-area relocation.** `--edge-inset` is
`max(env(safe-area-inset-left), env(safe-area-inset-right))` — the `max()`
is load-bearing for Android's asymmetric `DisplayCutout` (the index.css
comment block says KEEP IT) and iOS reports the landscape inset on both
sides, which is what makes the layout rotation-invariant. Today the gutter
spends it as width + padding-left and the surface as padding-right. After
the gutter dies, **the surface's padding-left takes `var(--edge-inset)`,
which stays the `max()` — never simplified to a single-sided `env()`.** The
header additionally honours `env(safe-area-inset-top)` in landscape (no
device constant assumed; §1's deviation row).

**Status caption.** Stays on the `ConnectionLine` trailing slot, new format
rules: `READY` at armed (2D), `<clock> LEFT` merged into GRID's header line
(2B). `intervalLabelShort` grows the armed branch; the grid headline merges
what today is two spans.

**Model-field fates** (antagonist finding 4 — the table IS the inventory;
criterion 2 checks it):

| `SurfaceModel` field | Only render site(s) today | Fate |
| --- | --- | --- |
| `meters` (`TOTAL M`) | `PaneLive` | **dies** (`GridRow.meters` — the grid's METERS column — is a different field and SURVIVES) |
| `hr` | `PaneLive` | **dies** (HR stays as the grid COLUMN, off `GridRow`) |
| `intervalClockLabel` | `PaneLive` | **dies** |
| `intervalClockValue` | `PaneLive` cell + `PaneGrid` headline | **dies** (the grid headline becomes ordinal + `totalLeftDisplay`; the active-row countdown cell has its own field) |
| `totalLeftSeconds` | `PaneLive` → TimerRuler | **dies** (the band cell renders `totalLeftDisplay`; the progress bar takes elapsed/`totalSeconds` directly) |
| `totalSeconds`, `boundaries` | TimerRuler props | **survive** — re-consumed by `ConnectedProgressBar` |
| `totalLeftDisplay` | `PaneGrid` headline | **survives** — grid header + the new LIVE band cell |
| `elapsedDisplay` | `ConnectionLogSheet` `SESSION` line | **survives** untouched |
| `nowLabel` | hero labels | **collapses** to `stale ? "LAST" : ""` |
| `intervalLabelShort` | status caption | survives + gains the READY branch; sibling `intervalOrdinalLabel` (NEW) feeds the grid header |
| `upNext` | up-next line | survives + gains the armed branch (§2D) |

Domain untouched: the `judgeActual` kind unions in `app/domain/judge.ts`
keep `"meters"`/`"hr"` members even though the surface fields die — deleting
domain members is not this spec's business (explicit ruling, criterion 2
scopes its grep to `SurfaceModel`).

**Session meters' verification route moves to the log sheet's `SESSION`
context** (`elapsedDisplay` + the recorded actuals): the phase-exit walk
sheet and the v0.10.0 notes must point at the post-session summary and the
log sheet, not the live pane. **This PR creates the phase-exit walk sheet at
`docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md`** (criterion 4's
artifact — it did not exist; the 2026-08-15/16 runsheets are past records
and are NOT edited beyond a one-line historical note that their `TOTAL M`
rows describe the pre-redesign surface).

**The `.connected-paused` footer** (2a's `PULL TO RESUME`) is restyled to the
new band's vocabulary but keeps its semantics exactly: instruction only, no
noun, occludes nothing, keeps its END/AGAIN button, suppressed during
genuine rests.

## §4 Out

ZONE (needs strap + max-HR story — own follow-up). CAL (follow-up "session
calories, folded" — register-fold discipline + walk row). Pane slide. Swipe.
The paused overlay (dead). Reconnect/adoption (R10). The reducer. The phone
timer's look. The v0.10.0 notes PR (separate, after merge, before tag). The
close-out queue (v1 fall-through, Start-door copy) — separate small PR after
this merges, per the PM gate.

## §5 Testing

- **Structural design assertions are the spec's teeth**: every §2 table row
  that names a size, color, presence, or absence gets an assertion in
  `design.spec.ts`'s connected blocks (rewritten, not patched). The ink-4 ban
  assertion stays green by construction; contrast is COMPUTED for every text
  token on any new surface pairing, numbers in the report (recurring
  failure #6). `--progress-active` is decoration-only — asserted never used
  as text color.
- **Fixtures look like production** (recurring failure #3): seeded-library
  programs, a >16-interval program for the quarter-tick fallback, distance
  AND time pieces, strapless HR (null) frames — there is no strapped variant
  to test anymore.
- **Unit tests**: surfaceModel's new/changed fields per §3's fate table —
  the READY branch, the ARMED UP-NEXT branch (asserts the first-interval
  string, not `phases[index+1]`'s), `intervalOrdinalLabel`, the `nowLabel`
  collapse, every dying field actually gone; SegmentedControl keyboard +
  triple-tap port (copy the rail's existing tests' shape);
  ConnectedProgressBar math (proportional widths, the 16 threshold, the
  fallback fill). `tokens.test.ts` extends to pin the `--c-size-*` family's
  membership; the connected-CSS-never-consumes-`--size-*` grep pin lands
  beside it.
- **Named e2e casualty** (antagonist finding 18): `connected.spec.ts`'s
  freeze-hold flow test anchors on the `TOTAL M` cell and
  `.timer-total-value` — both die. It re-anchors on a frozen hero value +
  the band's TOTAL LEFT. Portrait up-next keeps its `innerText` pin with the
  `then`-less string. Tab order re-pinned (END → scroller → control halves).
- **The captures are the record**: every connected screenshot re-shot with
  real data, opened, and looked at (recurring failure #7) — 2A/2B/2C/2D
  equivalents plus stale and disconnected.
- **e2e + screenshots run in the foreground before any task reports done**
  (recurring failure #1); tab order re-pinned (END → scroller → control
  halves replaces the rail targets).
- **Per-file coverage** on every touched file (recurring failure #2).
- **Phase-exit walk additions from this spec**: the handoff's 8-item on-erg
  list; the session-meters comparison re-pointed at the log sheet SESSION
  line; plus the already-owed keystone re-run, a REST-BEARING row (for #104's
  clamp), END finals, and the F6 reload check.

## §6 Exit criteria

1. Every §2 property-table row holds, each backed by a named assertion or
   test (the tables are the checklist — a row without a passing check fails
   the spec).
2. `PagerRail`, the swipe handler, every §3-fate-table "dies" field on
   `SurfaceModel` (scope: `SurfaceModel` only — `GridRow.meters` and the
   domain `judgeActual` kinds survive by ruling), and every dead
   `.connected-*` rule are GONE (grep-clean), and no `connected/` file
   imports `TimerRuler` or `UpNextStrip` (pinned).
3. The triple-tap opens the log sheet from the new control in both
   orientations; focus restores to the pressed half on close.
4. PROVENANCE item 5 (the calories falsification) is committed;
   `docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md` EXISTS in this PR
   and carries the re-pointed session-meters row, the 8-item on-erg list,
   and the already-owed items (keystone re-run, rest-bearing row, END
   finals, F6 reload check); DEVIATIONS.md's affected rows are reconciled
   in place (the antagonist's brief-pass list — the "unlogged-line" item
   this criterion once named was 2b's edit, already landed in PR #105).
5. Scoped gates green: lint, typecheck, full test, e2e, screenshots
   (changed, deliberately), per-file coverage inspected.
6. The phase-exit walk (with this spec's added items) is the release gate —
   v0.10.0 tags only after it passes, notes PR first.
