# CR2 spec 3: Connected redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the connected screen per the turn-2 handoff frames: header segmented control replaces the gutter, heroes grow, PM5-duplicated values leave, band becomes up-next + TOTAL LEFT.

**Architecture:** Six tasks in dependency order: (1) the shell — grid restructure, `SegmentedControl`, `--c-size-*` tokens, rail/swipe deletion; (2) the model — field fates per the spec's table; (3) `ConnectedProgressBar`; (4) PaneLive rebuild; (5) PaneGrid restyle; (6) property-table assertions, captures, walk sheet, gates. Each task leaves the FULL suite green by updating every test its diff breaks — the property-table sweep in Task 6 is additive, not the first time e2e runs.

**Tech Stack:** React 19, CSS custom properties, Vitest, Playwright. No server, no domain, no stored shapes.

**VALUE AUTHORITY:** `docs/superpowers/specs/2026-08-16-connected-redesign-design.md` §2's per-frame property tables carry every pixel/color/copy value, verified against the handoff README by the antagonist with zero transcription errors. Tasks cite table rows instead of re-transcribing numbers; where this plan states a number it is a convenience copy and THE SPEC GOVERNS on any mismatch. The handoff README (`docs/design/handoffs/2026-08-15-connected-v2/README.md`) backs the spec; PROVENANCE items 1-5 record what NOT to implement from it.

## Global Constraints

- Spec §1's deviation table binds: tester colors (`--judge-faster`/`--judge-slower`, `--marker` gold countdown), 32px landscape grid rows, no CAL/ZONE cells, no pane slide, swipe DELETED, TOTAL LEFT from the accumulator.
- The `--c-size-*` family lives ON `.connected-surface`, never `:root`; connected rules stop consuming `--size-*` entirely (grep-pinned); the shared `--size-*` family and the phone timer are byte-untouched.
- `TimerRuler` and `UpNextStrip` are never imported by any `connected/` file after this branch (pinned); their files are untouched.
- `--edge-inset` stays `max(env(safe-area-inset-left), env(safe-area-inset-right))` — never simplified to one side (Android DisplayCutout; the index.css comment block stays).
- No text below 12px; no ink-4 mono ≤11px (existing e2e assertion); every tappable ≥44px; contrast computed with numbers in reports for any new pairing; `--progress-active #8a8478` is decoration-only, never text.
- No em-dashes in user-facing copy. All commands in `app/`. `pnpm test --project client` for src/ tests (never `--project unit`). e2e + screenshots FOREGROUND before any task reports done when its diff touches `app/src/` (every task here does).
- Per-file coverage inspected for touched files. Tests assert consequences (docs/TESTING.md §3); realistic fixtures (seeded-library programs; a >16-interval program for the bar fallback; distance AND time pieces; strapless HR).
- Do not delete the `useMonitorSession`/driver/axes layers' anything — this spec is the surface only.

## File Structure

- Modify: `app/src/workout/ConnectedSurface.tsx` (grid restructure, header, swipe deletion, control wiring)
- Create: `app/src/workout/connected/SegmentedControl.tsx`; Delete: `app/src/workout/connected/PagerRail.tsx`
- Create: `app/src/workout/connected/ConnectedProgressBar.tsx`
- Modify: `app/src/workout/connected/surfaceModel.ts`, `PaneLive.tsx`, `PaneGrid.tsx`, `ConnectionLine.tsx` (if placement demands), `app/src/index.css` (the `.connected-*` sections), `app/src/theme/tokens.css` (only `--progress-active`), `app/src/theme/tokens.test.ts`
- Modify: `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`, `app/e2e/connected.spec.ts`, `app/e2e/fixtures/connected-*.html` (regenerate), `docs/design/DEVIATIONS.md`
- Create: `docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md`
- Tests: colocated `.test.tsx`/`.test.ts` per component; `surfaceModel.test.ts`

---

### Task 1: The shell — grid, SegmentedControl, tokens, deletions

**Files:**
- Create: `app/src/workout/connected/SegmentedControl.tsx`
- Delete: `app/src/workout/connected/PagerRail.tsx` (+ its test file)
- Modify: `app/src/workout/ConnectedSurface.tsx`, `app/src/index.css`, `app/src/theme/tokens.css` (add `--progress-active` only), `app/src/theme/tokens.test.ts`
- Test: `app/src/workout/connected/SegmentedControl.test.tsx`, updates to `ConnectedSurface.test.tsx`

**Interfaces:**
- Consumes: `PANES`/`PaneId` (move the constant into `SegmentedControl.tsx` or `ConnectedSurface.tsx` when `PagerRail.tsx` dies), `useTripleTap` (`ConnectedSurface.tsx:166-194`), `logOpener` ref (`:225`), `handleRailPress` (`:263-267`).
- Produces: `SegmentedControl({ active, onSelect }: { active: PaneId; onSelect: (pane: PaneId, target: HTMLElement) => void })` — later tasks and e2e rely on: two `<button>` halves with visible text `LIVE`/`GRID`, `aria-current="page"` on the active half, class names `connected-control`, `connected-control-half`, `connected-control-half-active`.

- [ ] **Step 1: Failing tests.** `SegmentedControl.test.tsx`: renders two halves with `LIVE`/`GRID`; active half carries `aria-current="page"` and the active class; click calls `onSelect` with the pane id AND the pressed element; keyboard: both halves are real buttons in tab order (no roving tabindex — two independent buttons, matching the rail's shipped semantics). `ConnectedSurface.test.tsx`: triple-tap on the SAME half within 600ms opens the log sheet, a tap on the OTHER half resets the count (copy the existing rail triple-tap tests — they exist; re-anchor selectors), focus restores to the pressed half when the sheet closes.
- [ ] **Step 2: Run `pnpm test --project client` — new file fails (component absent), updated surface tests fail.**
- [ ] **Step 3: Build `SegmentedControl`** per spec §3 ¶Components: standalone grid item, NOT a header child. Two buttons, mono `var(--c-size-control)` weight 600 tracking 0.12em, 1px ink border, `var(--radius)`, active half ink fill + `--surface` text, inactive text ink-3, each half ≥44px tall and wide (16px side padding).
- [ ] **Step 4: Restructure `ConnectedSurface`**: delete `PagerRail` import/render, swipe handlers (`handleTouchStart`/`handleTouchEnd`, `paneAfterSwipe`, `SWIPE_THRESHOLD_PX` — all of it), and render `SegmentedControl` + move `ConnectionLine` into the header row (spec §3: one 44px header = control · device caption · status · END in landscape; portrait header = PM5 id + END, control as bottom bar). `ConnectionLine` gains the status-trailing slot from the panes (Task 2 supplies model fields; this task threads the existing `intervalLabelShort`). Triple-tap keys on the half's `PaneId` exactly as the rail did.
- [ ] **Step 5: CSS.** Define `--c-size-*` on `.connected-surface` (spec §1 role mapping, portrait values; landscape overrides in the existing `@media (orientation: landscape)` block). Add `--progress-active: #8a8478;` to `tokens.css` with a `decoration-only, never text` comment. New grid template: landscape rows `auto auto 1fr auto` single column (gutter column GONE), `padding-left: var(--edge-inset)` on the surface (the `max()` declaration and its Android comment MOVE with it, verbatim), header `padding-top: env(safe-area-inset-top)` in landscape; portrait rows end with the 54px control bar. Delete `.connected-pager*` rules. Control CSS per Step 3.
- [ ] **Step 6: `tokens.test.ts`**: extend with a `--c-size-*` membership pin (the ten names, on `.connected-surface`, portrait + landscape values from spec §1) and a grep pin: no `var(--size-` in any `.connected-*` rule (this will FAIL until Tasks 4-5 finish migrating — scope the pin in this task to the rules this task touches, widen it to all `.connected-*` in Task 5's step; say so in a comment).
- [ ] **Step 7: Update every test this breaks** (PaneGrid tab-order pin, screenshots.spec tab order END → scroller → control halves, design.spec rail blocks → control blocks with 44px assertions). Run full `pnpm test`, `pnpm e2e`, `pnpm screenshots` FOREGROUND — captures will churn; open and look at them.
- [ ] **Step 8: Commit** — `feat: the header takes the wheel`

### Task 2: The model — field fates

**Files:**
- Modify: `app/src/workout/connected/surfaceModel.ts`
- Test: `app/src/workout/connected/surfaceModel.test.ts` (+ compile fallout in pane files is Task 4/5's to consume; keep panes compiling by leaving dying fields' render sites until their pane task — THIS task deletes only fields whose sites it also updates, see Step 3 note)

**Interfaces:**
- Consumes: spec §3's model-field fate table (THE checklist for this task).
- Produces (later tasks rely on): `intervalOrdinalLabel: string | null` (`"3 OF 12"`, null when ordinal unknown); `intervalLabelShort` with the READY branch (`armed → "${ordinal} OF ${count} · READY"`, bare `READY` when ordinal null); `upNext` armed branch (first interval forward: `phases[phaseIndex]` then `[phaseIndex+1]`); `nowLabel: stale ? "LAST" : ""`.

- [ ] **Step 1: Failing tests** in `surfaceModel.test.ts`, realistic compiled programs: READY branch (armed → `1 OF 12 · READY`; non-armed unchanged `3 OF 12 · WORK`); armed `upNext` asserts the FIRST-interval string (e.g. `WORK 10:00 · then REST 1:00`) and the non-armed path still reads `phases[index+1]`'s; `intervalOrdinalLabel` = `3 OF 12` / null; `nowLabel` = `"LAST"` stale, `""` otherwise (the `"NOW"` literal gone from the file).
- [ ] **Step 2: Run — fail.**
- [ ] **Step 3: Implement.** Add `intervalOrdinalLabel`; READY branch in the `intervalLabelShort` computation; armed branch in the `upNext` computation; collapse `nowLabel`. **Deletions (`meters`, `hr`, `intervalClockLabel`, `intervalClockValue`, `totalLeftSeconds`) happen in the pane task that removes their render sites** (Tasks 4/5) so every commit compiles — this task marks each with a `// dies in spec-3 Task 4/5 (spec §3 fate table)` comment instead. `totalSeconds`/`boundaries` stay (progress bar consumes them in Task 3).
- [ ] **Step 4: Full client run green; per-file coverage on the new branches. Commit** — `feat: the model learns READY and the first pull forward`

### Task 3: ConnectedProgressBar

**Files:**
- Create: `app/src/workout/connected/ConnectedProgressBar.tsx`
- Test: `app/src/workout/connected/ConnectedProgressBar.test.tsx`

**Interfaces:**
- Consumes: `boundaries: number[]` (interval boundary seconds), `totalSeconds: number`, `elapsedSeconds: number` — same values TimerRuler receives today from the model.
- Produces: `ConnectedProgressBar({ boundaries, totalSeconds, elapsedSeconds })`; classes `connected-progress`, `connected-progress-seg` with state modifiers `-done`/`-active`/`-upcoming`, fallback `connected-progress-fill` + the quarter-tick row. `MAX_SEGMENTS = 16` exported.

- [ ] **Step 1: Failing tests**: 3 intervals with durations 600/120/60 → three segments with duration-proportional flex-basis (assert the style ratios, not just count); elapsed inside interval 2 → seg 1 `-done`, seg 2 `-active`, seg 3 `-upcoming`; 17+ boundaries → NO segments, ONE proportional fill sized `elapsed/total` + quarter-tick labels (assert the fill width percentage — the fallback DRAWS, spec §2A); 0 elapsed → all upcoming; elapsed ≥ total → all done.
- [ ] **Step 2: Run — fail.** **Step 3: Implement** (pure presentational; segment widths from boundary deltas; 3px gaps in CSS; 6px height; colors ink / `--progress-active` / `--rule-2` per spec §2A — CSS lands here too, including the disclosed 2.61:1 residual comment).
- [ ] **Step 4: Green + coverage. Commit** — `feat: the session bar tells the truth in proportion`

### Task 4: PaneLive rebuilt

**Files:**
- Modify: `app/src/workout/connected/PaneLive.tsx`, `surfaceModel.ts` (the Task-2-marked deletions whose sites die here: `meters`, `hr`, `intervalClockLabel`, `intervalClockValue`, `totalLeftSeconds`), `app/src/index.css`, `app/src/workout/ConnectedSurface.tsx` (paused footer restyle only)
- Test: `PaneLive.test.tsx`, `surfaceModel.test.ts` (deletion pins), `connected.spec.ts` freeze-hold re-anchor

**Interfaces:**
- Consumes: Task 2's fields, Task 3's `ConnectedProgressBar`, spec §2A/§2C/§2D/stale/disconnected tables (value authority).
- Produces: the LIVE pane per the tables. Class names for e2e: `connected-band`, `connected-band-upnext`, `connected-band-cell` (TOTAL LEFT), hero classes keep their names.

- [ ] **Step 1: Failing tests** (rewrite `PaneLive.test.tsx` against the tables): NO `NOW`/`TARGET`/`UP NEXT` label nodes during a live piece; no `/500m`; no `LEFT IN INTERVAL`/`TOTAL M`/`HR` cells; band renders up-next (landscape `then` form / portrait `then`-less — assert `innerText`) + `TOTAL LEFT` cell from `totalLeftDisplay`; stale → `LAST` above each hero and greys; armed → ghost split (ink-4 class), plain `0` rate, READY caption via the header; progress bar present, TimerRuler absent. `surfaceModel.test.ts`: the five dying fields are gone (compile + a keyof pin).
- [ ] **Step 2: Run — fail.** **Step 3: Implement** the pane + delete the five model fields + their tests' stale references. Restyle `.connected-paused` to the band vocabulary (semantics untouched: instruction only, own END/AGAIN, in-flow footer). Hero CSS to `--c-size-*` (112/58 + 40 target + 15 tag landscape; 100/52/36/14 portrait; step-downs per the disconnected table: 86/70 landscape, 76/64 portrait, tenths 44/40). Two-column hero split flex 1.25/0.75 landscape with the 1px `--rule` divider; portrait stacked with the 2px/1px rules.
- [ ] **Step 4: Re-anchor `connected.spec.ts`'s freeze-hold flow** (spec §5 named casualty): frozen hero value + band TOTAL LEFT replace the TOTAL M cell + `.timer-total-value` anchors.
- [ ] **Step 5: Full test + e2e + screenshots FOREGROUND; open captures; per-file coverage. Commit** — `feat: LIVE stops reading the erg its own numbers`

### Task 5: PaneGrid restyled

**Files:**
- Modify: `app/src/workout/connected/PaneGrid.tsx`, `surfaceModel.ts` (grid headline consumes `intervalOrdinalLabel` + `totalLeftDisplay`; caption format), `app/src/index.css`
- Test: `PaneGrid.test.tsx`, `surfaceModel.test.ts`

**Interfaces:**
- Consumes: Task 2's `intervalOrdinalLabel`, spec §2B table + GRID-portrait row.
- Produces: grid per §2B; the widened `tokens.test.ts` grep pin (no `var(--size-` anywhere in `.connected-*`) flips ON here.

- [ ] **Step 1: Failing tests**: header status `3 OF 12 · 38:20 LEFT` with the countdown span in `--marker` class; thead `--c-size-thead` 12px 0.12em, 2px ink rule; rows 32px landscape / 40px portrait (existing values pinned intact); active row `--surface` fill + 1px ink pinch + 4px marker + 600 number; upcoming dashed `--rule-3` with `—`; footer caption per README format (`5 MORE BELOW · ROW 5 IS A 500 M PIECE` — merge with the existing distance caption content; assert on a seeded >5-row program); auto-scroll + `aria-current="step"` + tab order pins survive.
- [ ] **Step 2: Run — fail.** **Step 3: Implement** (markup + CSS; `--c-size-*` migration completes; widen the tokens grep pin to all `.connected-*` and delete the Task-1 scoping comment).
- [ ] **Step 4: Full test + e2e + screenshots FOREGROUND; captures opened; coverage. Commit** — `feat: the grid dresses for the new header`

### Task 6: The property-table sweep, captures, walk sheet, reconciliation

**Files:**
- Modify: `app/e2e/design.spec.ts` (the connected blocks become the §2 property tables — one assertion per table row, grouped per frame), `app/e2e/screenshots.spec.ts`, regenerate `app/e2e/fixtures/connected-*.html`, `docs/design/DEVIATIONS.md`
- Create: `docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md`

- [ ] **Step 1: Design assertions.** For EVERY row of spec §2's six tables, a named assertion (sizes via computed style, colors via token resolution, presence/absence via selectors, 44px via boundingBox, contrast helper re-run on new pairings with numbers logged). The ink-4 ban assertion untouched and green. A `--progress-active`-is-never-text assertion.
- [ ] **Step 2: Screenshots**: re-shoot every connected capture (2A/2B/2C/2D-equivalents + stale + disconnected, both orientations where the design differs), seeded with real library data; OPEN EACH and describe what you see in the report (recurring failure #7).
- [ ] **Step 3: Fixtures**: regenerate the frozen `connected-*.html` fixtures by the existing generation route; diff-review one by eye for sanity.
- [ ] **Step 4: DEVIATIONS.md**: reconcile the grid-row (32px ruling now also deviates from THIS packet's 36) and any row describing the rail/gutter, TOTAL M, or hero labels — they describe current state (recurring failure #9).
- [ ] **Step 5: Walk sheet** `docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md`: the six owed items — keystone 2×250 r0 re-run (a-priori 500); a REST-BEARING row (#104's clamp); END finals; F6 reload-mid-piece check; the handoff's 8-item on-erg list verbatim; the session-meters comparison RE-POINTED at the log sheet's SESSION line via triple-tap (state that TOTAL M no longer exists on the live surface). Add the one-line historical note to the 2026-08-16 runsheet (its TOTAL M rows describe the pre-redesign surface) — that note, nothing else, may touch the old record.
- [ ] **Step 6: Full gates**: lint, typecheck, format:check, `pnpm test` (both summary lines), `pnpm test:coverage` per-file on every touched product file, `pnpm e2e`, `pnpm screenshots` — all FOREGROUND. Commit — `test: every table row has a witness`

---

## Self-review (run at authoring time)

- Spec coverage: §2 tables → Tasks 1 (header/control), 3 (bar), 4 (2A/2C/2D/stale/disconnected), 5 (2B/portrait grid), 6 (assertions for all); §3 structure → Tasks 1-2; §6 criteria: 1→Task 6, 2→Tasks 1/4/5 deletions + pins, 3→Task 1, 4→Task 6 + already-landed PROVENANCE item 5, 5→every task + Task 6, 6→post-merge (walk gates the release, not the PR).
- Placeholders: none — values live in the spec's tables by design (single source; antagonist-verified), structural decisions are inline.
- Type consistency: `SegmentedControl(active, onSelect(pane, target))` in Tasks 1/6; `ConnectedProgressBar(boundaries, totalSeconds, elapsedSeconds)` in Tasks 3/4; `intervalOrdinalLabel` in Tasks 2/5.
