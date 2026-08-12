# Connected Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connected mode becomes two panes whose landscape geometry cannot drift, with two judged heroes, a single-line grid, one honest notched bar, and the unconnected timer rebuilt to match.

**Architecture:** Geometry first (the width fix, then the tokens/full-bleed/gutter shell), then each pane's interior, then the shared bar and chrome, then the timer surface, then docs and gates. Every task lands on a stable base the previous one proved.

**Tech Stack:** existing — React + CSS custom properties; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-11-connected-revamp-design.md` (its § numbers govern). Adversarial review beside it carries the evidence for every correction. **Visual authority:** `docs/design/handoffs/2026-08-11-connected-revamp/` — `REVISION-2026-08-11.md` governs, `README.md` fills its silences, `Ergomatic connected mode.dc.html` is the pixel truth (open it; its inline styles are the source for any size this plan does not name).

## Global Constraints

- Worktree `.claude/worktrees/connected-revamp`, branch `connected-revamp` (off main `395b7a8`). Node 26 PATH first: `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"`. `pnpm test` only from `app/` (`-t` filters names; NEVER bare vitest with file args). Browser gates on the per-worktree stack, sequential, never concurrent with each other or with unit.
- Baseline MEASURED at plan time: **155 files / 3649 passed + 1 skipped**; e2e 267; screenshots 60.
- **RE-VERIFY EVERY LINE CITE before editing it.** The spec's own cites were wrong once (a scout read pre-merge main). A cite that does not match is a finding, not a typo to route around.
- House law: five button levels, one L1 per screen, accent means exactly four things (this wave adds none), ≥44px targets, no small mono lighter than `--ink-3`, no em-dash in user-facing copy.
- Sizes come from the token scale (Task 2) — no new raw px font-size in the connected or timer surfaces after Task 2 lands.
- The judgement colour is decided in ONE place (`domain/judge.ts`'s `judgeActual`, single call site `surfaceModel.ts`'s `judgedValue`); no pane may judge for itself. The census test that enforces this must keep passing.
- Test COUNTS fall in this wave (sanctioned retirements). Only retirements named in Task 1's inventory are allowed; anything else shrinking is a defect.

---

### Task 1: The retirement inventory, the width fix, and its pins

**Files:**
- Create: `.superpowers/sdd/2026-08-11-connected-revamp/retirement-inventory.md` (the workspace artifact later tasks check against)
- Modify: `app/src/index.css` (`.connected-surface-body`, verify at `:5300-5304` and landscape `:6261-6265`)
- Test: `app/e2e/design.spec.ts` (the width invariant + the grid no-clip pin)

**Interfaces:**
- Produces: the inventory file — every test, capture, fixture and CSS rule this wave is allowed to retire, each with its reason and its owning task. Later tasks cite it; the final review audits against it.

- [ ] **Step 1: Build the inventory from source.** Enumerate, with file:line and owning task: every `PaneTimer`-only test/CSS rule; `statusWord`/`statusWordFor` and their model tests; `connected-pane-timer` ×2 captures + `e2e/fixtures/connected-pane-timer.html`; the pane-A describe in `ConnectedSurface.test.tsx`; `PaneGrid.test.tsx` suites that assert the two-line portrait row shape; the visible-row pin (`screenshots.spec.ts`, verify the line); the tab-order pin and its `slice(0, 5)` arity; the ELAPSED strip and its tests; the segment bar's live-pane usage; the lost/paused step-downs keyed to `.connected-clock-value`. State the CURRENT total for each suite so later tasks can prove their deltas.
- [ ] **Step 2: Write the width invariant (failing).** In `design.spec.ts`, a test that measures the content column's `getBoundingClientRect()` on the LIVE pane, swipes to GRID, measures again, and asserts `width` and `left` are equal to the pixel — in both 844×390 and 390×844. It fails today (that is the bug).

```ts
const box = async () =>
  page.locator(".connected-surface-body").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, left: r.left };
  });
const onLive = await box();
await page.getByRole("button", { name: "Grid pane" }).click();
await expect(page.locator(".connected-pane-grid")).toBeVisible();
const onGrid = await box();
expect(onGrid).toStrictEqual(onLive);
```

- [ ] **Step 3: Run it, watch it fail** on the grid measurement (`pnpm e2e -- -g "content column"`).
- [ ] **Step 4: Fix.** Add `min-width: 0;` to `.connected-surface-body` beside its existing `min-height: 0`, with a comment naming the mechanism (grid item in a `minmax(auto,1fr)` track; one pane mounted at a time, so the automatic minimum measured per-pane and per-content) and the spec §4 cite. Do NOT touch `.connected-pane-grid`'s `overflow: visible` — `.connected-pane` already declares `min-width: 0`, so overflow was never the mechanism, and that rule serves the sticky header.
- [ ] **Step 5: The clip consequence.** Content now clips instead of widening. Add the grid no-clip pin: a landscape grid with three-digit interval numbers and five-digit meters renders every column's text without truncation (`scrollWidth <= clientWidth` on the row, and the meters cell's text fully visible).
- [ ] **Step 6:** `pnpm e2e` green, full `pnpm test` unchanged at baseline. Commit — `fix: the connected column stops measuring itself against whichever pane is showing`.

### Task 2: Size tokens, the full-bleed surface, and the gutter rail

**Files:**
- Modify: `app/src/theme/tokens.css` (the first size scale in the codebase), `app/src/index.css` (`.connected-surface` landscape block, the rail), `app/src/workout/connected/PagerRail.tsx` (`PANES`, labels), `app/src/workout/ConnectedSurface.tsx` (pane switch, `DEFAULT_PANE` stays `live`)
- Delete: `app/src/workout/connected/PaneTimer.tsx` and its portrait `order` rules
- Test: `app/src/workout/ConnectedSurface.test.tsx` (pane census, stored-`"timer"` fallback), `app/e2e/design.spec.ts` (gutter geometry, full-bleed)

**Interfaces:**
- Produces: `PANES = ["live", "grid"] as const`; the token names later tasks consume — `--size-hero`, `--size-hero-tenths`, `--size-subhero`, `--size-target`, `--size-metric`, `--size-total`, `--size-row`, `--size-label` (each redefined inside the landscape media query rather than duplicated under a second name).

- [ ] **Step 1 (failing tests):** `PANES` has length 2 and does not contain `"timer"`; a stored `"timer"` in `localStorage` lands on `live` (the existing `PANES.includes` path — pin it, do not migrate); the landscape surface's left edge is `0` (full-bleed) and the gutter is exactly 44px wide sitting at the edge; portrait keeps its 54px two-tab bar.
- [ ] **Step 2:** add the token scale to `tokens.css` with a comment stating it is the codebase's first size scale, scoped to these two surfaces, named by role not pixels, portrait values in `:root` and landscape values inside the existing landscape query. Values from spec §6/§7 and the revision's tables: hero 104/112, tenths 54/58, subhero 52/56, target 44/46, metric 30/30, total 22/22, row 19/19, label 10/11.
- [ ] **Step 3:** full-bleed the landscape surface — the connected surface escapes `.screen`'s `max-width`/padding in landscape only (verify `.screen` at `index.css:401-407` and the 800px cap in the landscape block before editing). Safe-area insets still apply; never override an inset.
- [ ] **Step 4:** move the rail into the gutter: 44px column at the physical edge, `#efeade`, 1px inner rule, LIVE top / GRID bottom with the housing spacer between; content starts immediately after with no extra inset. Portrait tab bar keeps its labels.
- [ ] **Step 5:** delete `PaneTimer.tsx`, its portrait `order` rules and its dead CSS (from Task 1's inventory only); update the pane switch.
- [ ] **Step 6:** re-run Task 1's width invariant — it now measures the FINAL geometry and must still pass. Full `pnpm test`; `pnpm e2e`. Commit — `feat: two panes, edge to edge, with the rail in the gutter`.

### Task 3: The live pane's two heroes

**Files:**
- Modify: `app/src/workout/connected/PaneLive.tsx`, `app/src/index.css` (hero/metric-row rules), `app/src/workout/connected/surfaceModel.ts` (only if the no-target state needs a field; the target rate ALREADY exists — verify `rateCaption` at `surfaceModel.ts:433` and its render at `PaneLive.tsx:94` before assuming otherwise)
- Test: `app/src/workout/ConnectedSurface.test.tsx` (pane B describe), `app/e2e/design.spec.ts` (no-clip, no-scroll)

- [ ] **Step 1 (failing tests):** both heroes render an actual at `--size-hero` with its target beneath at `--size-target` in ink; the split hero's tenths render at half size and `white-space: nowrap`; a split slower than `9:59.9` renders `—`; during a REST phase (no target) the target slot holds its space, reads `—` in `--ink-3`, and the actual above is NOT tinted; the metric row shows left-in-interval, meters and HR on one baseline at `--size-metric`; the live pane does not scroll in either orientation.
- [ ] **Step 2:** rebuild `PaneLive`'s body: two hero blocks, the 1px ink rule, the metric row, then UP NEXT, then the ruler (Task 4 replaces the ruler's internals; consume it unchanged here). Remove the ELAPSED strip and the `IntervalSegments` usage per spec §3 — both are in Task 1's inventory.
- [ ] **Step 3:** the rate hero is a PROMOTION: keep `judgedValue`'s output for the actual, and render the existing `rateCaption`'s target as the ink numeral. Do not add a second judgement path; the census test must still see one call site.
- [ ] **Step 4:** the no-target state — `rateCaption`'s existing `"NO RATE TARGET"` string is the model's signal; render the dash rather than the words at hero scale, and leave the actual unjudged.
- [ ] **Step 5:** full `pnpm test`, `pnpm e2e`. Commit — `feat: the live pane says two things loudly`.

### Task 4: The notched bar

**Files:**
- Modify: `app/src/session/TimerRuler.tsx` (new input + notch rendering), `app/src/index.css` (notch rules), `app/src/workout/connected/surfaceModel.ts` (the boundary array), `app/src/session/Timer.tsx` (pass the same shape on the unconnected surface)
- Test: `app/src/session/TimerRuler.test.tsx`, `app/src/workout/connected/surfaceModel.test.ts`

**Interfaces:**
- Produces: `IntervalBoundaries = { seconds: number[]; predictedFrom: number | null }` — cumulative seconds at each interval boundary (length `intervals.length - 1`), and the index from which entries are ESTIMATES rather than measured (`null` = all measured). `TimerRuler` gains one optional prop `boundaries?: IntervalBoundaries`; absent = today's quarter ruler.

- [ ] **Step 1 (failing tests), all of spec §5:** a 5-interval timed session draws 4 notches at cumulative-duration positions; a completed interval's notch sits at its REAL elapsed, not its estimate (feed a run whose interval 1 took 20% longer than programmed and assert the notch moved); upcoming notches re-flow after each completion; a session containing a `null`-priced phase (`phaseSeconds` returns null — verify `domain/expand.ts:98-106`) stops notching at that interval and renders no notches beyond it; a single-interval session renders the ¼/½/¾ ruler and zero notches; a session with more than 16 boundaries renders the quarter ruler and zero notches (density rule, named constant `MAX_NOTCH_BOUNDARIES = 16`); the notch count NEVER disagrees with the interval caption (`intervals.length - 1`, NOT `phases.length`).
- [ ] **Step 2:** derive the boundary array in `surfaceModel.ts` — completed intervals from the real per-interval actuals the model already holds, upcoming from `phaseSeconds` summed per interval (work + trailing rest = one interval, matching `program.intervals`), stopping at the first unpriceable phase.
- [ ] **Step 3:** render notches as 1px `--ink` hairlines at `left: pct%` inside the bar; monochrome, no rest tinting.
- [ ] **Step 4:** pass the same shape from `Timer.tsx` so the unconnected surface gets the identical bar (spec §5: both surfaces, one component, no fork).
- [ ] **Step 5:** full `pnpm test`. Commit — `feat: the bar admits where the intervals actually are`.

### Task 4b: The warm-up stops pretending to be a working interval (spec §5b)

**Files:**
- Modify: `app/domain/monitor/program.ts` (`ProgramInterval` carries its phase type; the push site sets it), `app/src/workout/connected/surfaceModel.ts` (the caption's ordinal and denominator; the boundary array's warm-up marking), `app/src/session/intervalBoundaries.ts` (mark the warm-up span), `app/src/session/TimerRuler.tsx` + `app/src/index.css` (the span's tone)
- Test: `app/domain/monitor/program.test.ts`, `app/src/workout/connected/surfaceModel.test.ts`, `app/src/session/intervalBoundaries.test.ts`, `app/src/session/TimerRuler.test.tsx`

**Interfaces:**
- Produces: `ProgramInterval.type: "warmup" | "work" | "test"` (rests are folded into `restSeconds` and never appear as intervals — verify that claim in `compileProgram` before relying on it); `IntervalBoundaries` gains a per-span warm-up marker so the ruler can tone it. Task 5 consumes the caption/numbering rules.

- [ ] **Step 1 (failing tests):** a program compiled from a run WITH a warm-up has `intervals[0].type === "warmup"` and the rest `"work"`; the caption reads `WARM-UP` with no ordinal during the warm-up and `1 OF 4` on the first work piece of a 4-piece workout (NOT `2 OF 5`); the denominator counts working intervals only; the boundary array marks the warm-up's span; the ruler renders that span in the unfilled-track tone; a session with NO warm-up is byte-identical to today (the regression pin — most sessions have none).
- [ ] **Step 2:** add the type to `ProgramInterval` at its definition and its push site. This is a wire-IR shape change: check every consumer (`grep -rn "ProgramInterval"`) and every fixture that builds one.
- [ ] **Step 3:** caption and denominator in `surfaceModel.ts`; the warm-up marker through `intervalBoundaries.ts` to the ruler; the tone rule in CSS using existing tokens (no new colour).
- [ ] **Step 4:** full `pnpm test`, `pnpm e2e`, `pnpm screenshots` (a warm-up fixture re-shoots legitimately; add one if none exists — the state must have a committed visual record). Commit — `feat: the warm-up says what it is and stops taking a number`.

### Task 5: The grid rebuild

**Files:**
- Modify: `app/src/workout/connected/PaneGrid.tsx`, `app/src/index.css` (the grid block + landscape)
- Test: `app/src/workout/connected/PaneGrid.test.tsx` (its two-line-shape suites retire per Task 1's inventory; new single-line pins replace them)

- [ ] **Step 1 (failing tests):** every row is single-line at a FIXED height (**32px landscape** / 40px portrait) including the active row (no third line); **7 rows visible landscape** and 12 portrait (JAMES RULING 2026-08-12, superseding the packet's 8-at-36: the measured landscape scroller is 232px, so 8×36 cannot fit and 7×32 is what the budget holds — DEVIATIONS row owed); **the warm-up row's `#` cell reads `WU` and takes no number, with work numbering starting at 1** (spec §5b, built in Task 4b — CONSUME `intervalNumbering(program.intervals)` from `workout/connected/surfaceModel.ts` and render its `{ ordinals, workCount }`: `ordinals[i] === null` is the `WU` cell, otherwise the `#` is `ordinals[i]`, and `workCount` is the header's own denominator. Do not re-derive either from `ProgramInterval.type` — the caption and the `#` column must not be able to disagree); the header carries the totals (`3 OF 12 · WORK · 0:47 LEFT` and `38:20 TOTAL`) and the interval countdown; completed rows ink over a solid rule, active row `--surface` between two ink rules with a 4×20 marker and no card padding, upcoming rows `--ink-3` over a dashed rule; the active row is scrolled into view; values render at `--size-row`.
- [ ] **Step 2:** rebuild the rows (portrait loses its second line and 30px indent; landscape keeps its column weights from the revision's table). Judged tints stay on actual `/500M` and `SPM` cells only.
- [ ] **Step 3:** move the totals into the header; the distance caption stays pinned beneath.
- [ ] **Step 4:** re-run Task 1's no-clip pin (the row is now denser). Full `pnpm test`, `pnpm e2e`. Commit — `feat: the grid stops using two lines to say one thing`.

### Task 6: End in the header, the paused block, and UP NEXT's missing duration

**Files:**
- Modify: `app/src/workout/ConnectedSurface.tsx` (header row, End, paused block's new slot), `app/src/index.css`, `app/src/session/Timer.tsx` (`phaseAnnouncement` — verify at `:194-218` before editing), `app/src/components/UpNextStrip.tsx`
- Test: `app/src/workout/ConnectedSurface.test.tsx` (End staging, paused block), `app/src/session/Timer.test.tsx` (announcement strings)

- [ ] **Step 1 (failing tests):** End is a 44pt outlined control in the surface header with its staged `TAP AGAIN` confirm intact (4s) — **JAMES, 2026-08-12, looking at the captures: the full-width END bar is a MIS-TAP HAZARD, "that could easily be touched accidentally if somebody tries to change views mid-row". So this task's real acceptance is not just "it moved" but "it can no longer be hit by a swipe that misses": the control's hit box must not span the surface's width, must not sit in the swipe corridor between the panes, and its staged confirm stays the second line of defence. Add a test asserting the END control's width is a small fraction of the surface's (not full-bleed) and that a horizontal swipe crossing its row still changes pane rather than arming it**; the paused block occupies the footer slot End vacated and nothing above it shifts (assert the metric row's `top` is identical paused vs rowing); UP NEXT renders `REST 2:00 · then WORK 2:09.0` in landscape and `REST 2:00 · WORK 2:09.0` in portrait — today's builder collapses rests to a bare `REST`, so this fails.
- [ ] **Step 2:** add the header row and move End into it; verify the shared-slot invariant the existing tests pin (End and the paused block share a slot today — read those tests before moving either).
- [ ] **Step 3:** extend `phaseAnnouncement` to carry a rest's own duration, from the same builder for both surfaces and both orientations (portrait shortens by dropping `then`, not by a second string).
- [ ] **Step 4:** full `pnpm test`, `pnpm e2e`. Commit — `feat: End moves up, and UP NEXT finally says how long the rest is`.

### Task 7: The unconnected timer

**Files:**
- Modify: `app/src/session/Timer.tsx`, `app/src/session/TimerTargets.tsx`, `app/src/index.css` (the `.timer-*` landscape block — scope it, and delete the connected-side reset)
- Test: `app/src/session/Timer.test.tsx`, `app/src/session/TimerTargets.test.tsx`, `app/e2e/design.spec.ts`

- [ ] **Step 1 (failing tests):** `RUNNING` renders in ink, not accent; both targets render in ink at `--size-subhero`; the countdown is `--size-hero` scale (128/118) with ELAPSED beneath at 26px; Pause is the only L1; the landscape gutter holds back-top and END-bottom; a distance piece swaps the hero (meters count down, clock accrues beneath) with the layout holding; the connected panes are unaffected by any `.timer-*` rule (assert a connected pane's computed values do not change when the timer block is scoped — the leak's regression pin).
- [ ] **Step 2:** scope the landscape `.timer-*` rules to their own surface (verify the unscoped rules and the connected-side reset before editing — the reset is deleted in the same edit, not left behind).
- [ ] **Step 3:** apply the ink changes and the layout per revision §5; follow the MOCKUP for Pause's treatment and record the resulting accent inventory for the DEVIATIONS row.
- [ ] **Step 4:** full `pnpm test`, `pnpm e2e`. Commit — `feat: the phone timer joins the same design language`.

### Task 8: Docs, captures, gates ×2

**Files:** `ROADMAP.md` (hand-formatted, never prettier), `docs/design/DEVIATIONS.md` (SEVEN rows, bottom-appended per its charter), all `connected-*` and timer captures, full gates

- [ ] **Step 1:** ROADMAP phase entry — authority, status, exit (James's erg look: both panes landscape on a real PM5, the width holding across a swipe, notches against a real multi-interval piece) and the follow-ons this wave declines (README §7's three open questions).
- [ ] **Step 2:** DEVIATIONS, **SEVEN** rows, each quoting the packet line it departs from. Spec §10 names five: the notched bar (with re-anchoring and density); `RUNNING` in ink (NARROWING row 1, not adding); the live pane dropping the segment bar; the status word dropped where the packet renders one; the landscape full-bleed leaving the app-wide max-width. Two more were ruled in after §10 was written and are owed here too: **(6) the two-tone notch** (James 2026-08-12 — ink ahead of the fill, page behind it, because an ink notch over the connected pane's ink fill measures 1.00:1; §5's "monochrome" reads as "no new hue"); **(7) §5b's warm-up treatment** — the warm-up drops out of the caption's count entirely (`WARM-UP` with no ordinal, and the denominator counts working intervals only), the grid's `#` cell reads `WU`, and the total bar carries THREE tones because the warm-up span fills in its own lighter tone as it is rowed (`--ink-4` connected / `--ink-5` on the phone timer; the packet never addressed warm-ups on these panes at all). Task 5's 7-visible-rows ruling owes its own row on top if that task has not already written one.
- [ ] **Step 3:** capture re-shoot — every `connected-*` capture (18 today) plus the timer captures; `connected-pane-timer` ×2 deleted; `connected-paused` ×2 RE-POINTED to live (it is captured on the deleted pane today). Each committed capture states its reason; unrelated re-encode noise reverted.
- [ ] **Step 4:** audit the whole branch against Task 1's inventory — every retired test accounted for, nothing else shrank. Record the final counts.
- [ ] **Step 5:** gates ×2 sequentially (`pnpm test`, `pnpm e2e`, `pnpm screenshots`, `pnpm build && pnpm dist:grep`, `pnpm lint && pnpm typecheck && pnpm format:check`). Commit — `docs: the revamp closes its books`.

### Task 9: James's erg look (JAMES GATE — the phase exit)

Controller-run, one item at a time ([[hardware-session-pacing]]). Dev build via `pnpm ios:build` + ⌘R.

- [ ] (a) Both panes in landscape on a real PM5: the content column's left edge and width do not move when swiping LIVE ↔ GRID (the reported bug, on hardware).
- [ ] (b) The notched bar against a real multi-interval piece with rest: notch count matches the caption, and a completed interval's notch sits where it actually ended.
- [ ] (b2) **The warm-up, on a real PM5** (spec §5b; nothing in this wave has met the wire on this state, and it is the FIRST state a rower with the preference on reaches). Three things in one look: the live caption reads `WARM-UP` with no ordinal while the warm-up runs and `1 OF N` on the first work piece — never `2 OF N+1`; the bar's leading span visibly FILLS as he rows it and still reads as not-work against the work fill that follows (James's own 2026-08-12 ruling — and the phone timer's version of that tone is the weakest in the wave at 1.97:1 against its track, so it wants a deliberate look too, `docs/screenshots/timer-warmup.png`); and once Task 5 lands, the grid's warm-up row is present but UNNUMBERED, its `#` cell reading `WU` with the work rows starting at 1.
- [ ] (b3) **Pause mid-piece and look:** the paused block now OCCLUDES the bottom 52px rather than displacing content (nothing shifts, per the handoff) — which hides TOTAL LEFT and the notched bar on the live pane while stopped, and the caption plus the last row on the grid. James judges whether that trade is right; a shorter block or a different anchor is the lever if not.
- [ ] (c) Both heroes readable at arm's length mid-piece; the grid's rows legible at 8 visible.
- [ ] (d) Anything James wants changed goes back through a fix round before the PR; then the PR (rich body, before/after captures) and his merge word.

## Execution notes

- Order is strict; Task 4b (the warm-up) sits between the bar and the grid because the grid consumes its numbering rule. Tasks 1-2 establish geometry every later task measures against; 4 before 5 only because the grid's header consumes the same totals the bar's boundaries derive from.
- Models: T1 sonnet (measurement + inventory); T2 sonnet; T3 sonnet; **T4 the most capable available** (the boundary derivation is the wave's only real logic, and its re-anchoring rule is James's own); T5 sonnet; T6 sonnet; T7 sonnet; T8 sonnet.
- Every dispatch carries: the SDLC briefing, the worktree path, the Node-26 line, the no-concurrent-suites rule, the RE-VERIFY-YOUR-CITES rule, and its spec § plus the mockup path.
- The T4 reviewer re-derives the notch positions by hand against a fixture and checks the interval-vs-phase unit BY EYE — a mocked model can be internally consistent and still disagree with the caption.
