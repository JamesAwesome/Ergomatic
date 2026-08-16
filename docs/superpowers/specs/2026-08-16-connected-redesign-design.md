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
| Landscape safe-area "assumes 0 but must survive ~59px" (sides only) | Also survives the iPhone 17 / Air 20pt landscape TOP inset: header row and grid row count re-derived with `env(safe-area-inset-top)` padding in landscape | CR2 carried debt, PM gate condition |

Everything else in the README ships as written: geometry, type scale
(landscape 112/92/58/40/30/22/19/15/13/12; portrait
100/84/52/36/28/21/19/14/13/12), tokens (all already exist except progress
active `#8a8478`, which becomes a new token `--progress-active`,
decoration-only — never text), spacing, copy, the 44px floor, the 12px type
floor, the ink-4-never-below-12px ban (the e2e assertion already enforces it).

## §2 Per-frame property tables — THESE ARE THE EXIT CRITERIA

Each row is independently checkable in the structural design assertions or a
unit test. "README" = the handoff README's matching section carries the exact
values.

### 2A — LIVE, landscape

| Property | Requirement |
| --- | --- |
| Header row | 44px: segmented control far LEFT · 8px ink square + `PM5 <id>` (mono 13, 0.10em, ink-2) · spacer · status `3 OF 12 · WORK` (mono 22, 0.04em, ink) · END far right. Control and END never adjacent. |
| Progress bar | 6px, full-width, one segment per interval, 3px gaps; done ink / active `--progress-active` / upcoming `--rule-2`. >16 intervals: no segments, quarter ticks (existing rule carried over). |
| Heroes | Two columns split by 1px `--rule`, left flex 1.25 / right 0.75, vertically centered. Split: 112px mono 500 lh 0.92 −0.05em, tenths 58px span, judged colour, nowrap; beneath: target 40px ink + source tag 15px ink-3 (e.g. `6K`). Rate: 92px same treatment, judged; beneath target 40px + `SPM` 19px ink-3. |
| Cut from LIVE | NO `NOW`/`TARGET`/`UP NEXT` labels, no `/500m` unit, no `LEFT IN INTERVAL` cell, no `TOTAL M` cell, no `HR` cell, no TimerRuler block. |
| Bottom band | 1px ink rule above, 9px padding-top, bottom-aligned, 30px gaps: up-next `REST 2:00 · then WORK 2:09.0` mono 30px ink, flex 1, nowrap, NO label; then `TOTAL LEFT` labelled cell (label mono 15px 0.10em ink-3 over value mono 30px ink). |
| Split cap | 4 chars + tenths; slower than 9:59.9 shows `—` (existing rule). |
| Insets | Content inside safe-area; ≥16px side insets; landscape top inset honored (20pt devices). |

### 2B — GRID, landscape

| Property | Requirement |
| --- | --- |
| Header | Same header, GRID half active; status reads `3 OF 12 · 38:20 LEFT`, the countdown portion in `--marker` gold (deviation from README's accent, Ruling 1). No progress bar. |
| Table head | mono 12px 0.12em ink-3, 2px ink rule below. Columns `#` 30px · TIME flex 1 L · METERS flex 1 R · /500M flex 1.1 R · SPM 0.6 R · HR 0.6 R · REST 0.8 R. |
| Rows | 36px, values mono 19px −0.01em, 10px gaps. Completed: ink, 1px `--rule-2` bottom. Active: `--surface` fill pinched by 1px ink rules top+bottom, 4px ink marker bar, number weight 600, countdown `--marker`, split/rate judged. Upcoming: ink-3, programmed targets, 1px dashed `--rule-3` bottom, `—` for unknowables. |
| Footer caption | mono 12px ink-3, README format (e.g. `5 MORE BELOW · ROW 5 IS A 500 M PIECE`); merges the existing distance-caption content. |
| Scroll/focus | Row list is the only scrolling region, keyboard-focusable, auto-scrolls active row into view (existing behavior kept). |
| TOTAL LEFT source | The accumulator (`totalLeftDisplay`), never plan+elapsed. |

### 2C — LIVE, portrait

| Property | Requirement |
| --- | --- |
| Layout | Column, 20px top / 24px sides, 13px gaps. Header: PM5 id + END (44px, no segmented control up top). Status line mono 21. Same 6px progress bar. |
| Heroes stacked | Split 100px (tenths 52) over target 36 + tag 14; rate 84 over target 36 + `SPM` 18; 2px ink rule above split block, 1px `--rule` above rate block, 16px padding-top each. |
| Up-next | `UP NEXT` label (mono 14 ink-3) over value mono 23px nowrap — 23px is a fit constraint for 342px content width; never wrap, never overflow. |
| TOTAL LEFT | `TOTAL LEFT` + value mono 28 on a rule, above the bottom bar. (No zone/cal row — Ruling 2.) |
| Bottom bar | 54px full-width segmented bar, two equal halves, active half ink fill / `--surface` text mono 13 600, above the home indicator. |

### 2D — First frame (armed), landscape

| Property | Requirement |
| --- | --- |
| Status | `1 OF 12 · READY` — the READY word ships HERE (closes PROVENANCE item 3). Portrait status line likewise. |
| Mirror | Split shows the target value as ghost in ink-4 `#6f6a5f` (never ink-5); rate shows `0` plain ink; nothing judged; no dash-bars. (2a's mirror model feeds this; only the ghost COLOR and caption are new.) |
| Progress bar | All-upcoming segments. |
| Up-next | Reads the first interval forward (`WORK 10:00 · then REST 1:00`); `TOTAL LEFT` full session. |
| Band | Up-next + TOTAL LEFT close up (no absent-cell gaps) — the only band variant that exists. |

### Stale (link lost, values held)

| Property | Requirement |
| --- | --- |
| Values | Heroes grey (existing `staleFor` path), `LAST` caption appears above each hero — the ONLY place a hero label exists post-redesign. |
| Banner | Existing `LostBanner` row inserts (landscape one-line variant); device caption `PM5 … · LOST`, hollow mark. |
| Layout | Must survive the banner's height without overflow in both orientations. |

### Disconnected step-down

| Property | Requirement |
| --- | --- |
| Heroes | Step down 112→86 and 92→70 landscape (README's pair replaces the current pair). The README gives no portrait pair; this spec pins the same ratio rounded: 100→76 and 84→64. Layout survives the lost height with the banner inserted. |

## §3 Structure

**Components.** `PagerRail` dies. A new `SegmentedControl` renders in the
landscape header and as the portrait bottom bar (same component, two CSS
contexts like the rail today): two `<button>` halves, `aria-current="page"`
on the active half (the shipped idiom — three existing uses; no APG tablist
invention), each half ≥44px, real focus order. **The triple-tap diagnostics
gesture ports onto the control's halves** with its per-target reset rule and
the `logOpener` focus-restore ref intact — it is the only route to
diagnostics and the walk depends on it. **Swipe deleted** (Ruling 4).

**Forks, not shared-component edits** (PM gate condition — the phone timer is
a second product surface this spec must not reach): the 6px progress bar is a
NEW `ConnectedProgressBar` (segments + the >16 quarter-tick fallback,
logic lifted from `TimerRuler.notchPercents`/`MAX_NOTCH_BOUNDARIES`);
the up-next line is rendered by the band directly (landscape unlabeled,
portrait labeled). `TimerRuler` and `UpNextStrip` are untouched and remain
the phone timer's; after the redesign neither is imported by any
`connected/` file — pinned by test. Grep their class names across the
connected CSS and remove dead rules (recurring failure #5).

**Safe-area relocation.** The landscape gutter currently absorbs
`env(safe-area-inset-left)` (`--edge-inset`, index.css comments record why).
Deleting the gutter moves the inset to the surface's own padding — it
relocates, never drops. The landscape TOP inset (20pt on iPhone 17/Air) pads
the header row; the grid's visible-row count is re-derived under it.

**Status caption.** Stays on the `ConnectionLine` trailing slot, new format
rules: `READY` at armed (2D), `<clock> LEFT` merged into GRID's header line
(2B). `intervalLabelShort` grows the armed branch; the grid headline merges
what today is two spans.

**Accumulator consumers after the redesign** (PROVENANCE item 1, corrected
line numbers): `totalLeftSeconds`/`totalLeftDisplay` (LIVE band cell + GRID
header) and the log sheet's `SESSION` line survive on the register-map
accumulator; `meters` (`TOTAL M`) loses its only render site and the model
field is deleted. **Session meters' verification route moves to the log
sheet's `SESSION` context**: the walk sheet and the v0.10.0 notes must point
at the post-session summary and the log sheet, not the live pane — written
into the phase-exit walk sheet by this spec's PR (the walk sheet gains the
line; the notes PR is separate).

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
- **Unit tests**: surfaceModel's new/changed fields (READY branch, grid
  headline merge, `meters` deletion, band model); SegmentedControl keyboard +
  triple-tap port (copy the rail's existing tests' shape); ConnectedProgressBar
  segment math incl. the 16 boundary.
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
2. `PagerRail`, the swipe handler, `TOTAL M`'s model field, and every dead
   `.connected-*` rule are GONE (grep-clean), and no `connected/` file
   imports `TimerRuler` or `UpNextStrip` (pinned).
3. The triple-tap opens the log sheet from the new control in both
   orientations; focus restores to the pressed half on close.
4. PROVENANCE item 5 (the calories falsification) is committed; the walk
   sheet carries the re-pointed session-meters row and the 8-item on-erg
   list.
5. Scoped gates green: lint, typecheck, full test, e2e, screenshots
   (changed, deliberately), per-file coverage inspected.
6. The phase-exit walk (with this spec's added items) is the release gate —
   v0.10.0 tags only after it passes, notes PR first.
