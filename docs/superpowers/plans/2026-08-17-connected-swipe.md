# Phase CS Item A — the swipe returns (written from the probe verdict)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swiping left/right on the connected surface moves between LIVE
and GRID on James's phone — including a drag that starts on a grid row.

**Architecture:** A small pure module (`connected/swipe.ts`) owns the two
decisions — "is this pointer eligible?" and "what pane does this delta
produce?" — so both are exhaustively unit-testable without a browser. A
thin hook attaches Pointer Events to the surface element and routes
commits through the existing `choosePane` (same setter, same persistence).
`touch-action: pan-y` returns to the CSS, declared on the surface AND on
the grid's own scroll container, because the intersection rule stops at
the first scroller.

**Tech Stack:** existing stack; zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-connected-polish-design.md`
(Item A). Its Design and Verification-ladder sections bind, as amended by
the probe.

**Probe verdict (binding input):**
`docs/monitor/sessions/probe-2026-08-17-swipe/README.md` — the PE design
works on device; the grid-origin failure is our own guard matching a
structural `[role]`; scroller-intersection and busy-main-thread are
falsified for the horizontal case; a *scrollable* row list is untested.

## Global Constraints

- `src/**` tests run under `pnpm test --project client` (positional
  filters do not narrow; read BOTH summary lines).
- TDD; assertion quality per docs/TESTING.md; realistic fixtures (seeded
  library shapes — recurring failure #3).
- Platform conditionals live only in the adapter layer; this is ordinary
  DOM code and belongs in the component tree, not `src/platform.ts`.
- The segmented control stays: swipe is additive, never the only path
  (spec, Ruling 3's cut stands — no slide animation, no wraparound).
- House copy rules; no em-dashes in user-facing strings.
- Commit per task; `git rev-parse --show-toplevel` must print
  `.../.claude/worktrees/connected-polish` first.
- Commands run in `app/`.
- **The phone leg is the gate.** Green CI is necessary and not sufficient;
  Task 5's disposition rule is binding.

## File Structure

- Create: `app/src/workout/connected/swipe.ts` — `SWIPE_THRESHOLD_PX`,
  `isSwipeBlocked(target)`, `paneAfterSwipe(pane, dx, dy)`,
  `useSurfaceSwipe(ref, opts)`.
- Create: `app/src/workout/connected/swipe.test.ts` — the pure decisions.
- Modify: `app/src/workout/ConnectedSurface.tsx` — ref + hook + commit
  through `choosePane`; nothing else moves.
- Modify: `app/src/index.css` — `touch-action: pan-y` on
  `.connected-surface` and `.connected-grid-rows`.
- Tests: `ConnectedSurface.test.tsx` (wiring), `PaneGrid.test.tsx` (the
  retired "no rule left to pin" comment comes back as a real pin or is
  replaced by the e2e computed-style pin — implementer's call, stated),
  `e2e/connected.spec.ts` (real-touch pin), `e2e/design.spec.ts`
  (computed `touch-action`).

---

### Task 1: The two decisions, pure (RED first)

**Files:**
- Create: `app/src/workout/connected/swipe.ts`
- Test: `app/src/workout/connected/swipe.test.ts`

**Interfaces:**
- Consumes: `PANES` and `PaneId`, already exported from
  `connected/SegmentedControl.tsx:25-27` (`["live", "grid"]`). Import
  them; never restate the pane order — a second copy is a defect.
- Produces: `SWIPE_THRESHOLD_PX: 48`;
  `isSwipeBlocked(target: EventTarget | null): boolean`;
  `paneAfterSwipe(current: PaneId, dx: number, dy: number): PaneId`
  (returns `current` unchanged for every no-op case).

- [ ] **Step 1: Write the failing tests.** `paneAfterSwipe`, one case each,
  asserting the resulting pane (not an internal reason code):
  - `dx = -60`, `dy = 0`, on `live` → `grid` (leftward advances)
  - `dx = +60`, `dy = 0`, on `grid` → `live`
  - `dx = -47`, `dy = 0` → unchanged (one pixel under threshold)
  - `dx = -48`, `dy = 0` → changes (the boundary is inclusive)
  - `dx = -60`, `dy = -80` → unchanged (vertical dominates)
  - `dx = -60`, `dy = +59` → changes (horizontal dominates)
  - leftward from the last pane → unchanged; rightward from the first →
    unchanged (no wraparound — spec)

  `isSwipeBlocked`, built with **real markup**, not bare elements — render
  the actual grid row and hero subtrees (import the components, or build
  the same nesting the components emit) and pass the deepest child as the
  target:
  - a `<span class="connected-grid-pace">` inside a
    `.connected-grid-rows[role="group"]` → **NOT blocked** (this is the
    probe's convicted case; the test must go red against a `[role]`
    wildcard predicate)
  - a `<div role="status">` (the lost-connection banner) → NOT blocked
  - a `<button>` and a child `<span>` inside a `<button>` → blocked
  - `<a href>`, `<input>`, `<select>`, `<textarea>`,
    `[contenteditable]` → blocked; a bare `<a>` with no `href` → NOT
    blocked
  - an element carrying `data-swipe-ignore` and a child of one → blocked
  - `null` target → NOT blocked
- [ ] **Step 2: Run — RED** (`pnpm test --project client`, both summary
  lines).
- [ ] **Step 3: Implement.** `paneAfterSwipe`: bail unless
  `Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)`,
  then step the `PANES` index and clamp. `isSwipeBlocked`: `target
  instanceof Element` and
  `target.closest("button, a[href], input, select, textarea, [contenteditable], [data-swipe-ignore]") !== null`.
  Document, at the predicate, WHY `[role]` is absent and what the probe
  cost us — a future editor re-adding the wildcard is the regression this
  comment exists to stop.
- [ ] **Step 4: Green + typecheck + lint.**
- [ ] **Step 5: Commit** `git commit -m "feat: the surface decides what a swipe is, and what may refuse one"`.

---

### Task 2: The hook, the wiring, the CSS

**Files:**
- Modify: `app/src/workout/connected/swipe.ts` (add `useSurfaceSwipe`)
- Modify: `app/src/workout/ConnectedSurface.tsx`
- Modify: `app/src/index.css`
- Modify: `app/src/components/SheetShell.tsx` (Step 5's `data-swipe-ignore`;
  regenerating `e2e/fixtures/connected-log-sheet.html` is its mechanical
  consequence)
- Test: `app/src/workout/ConnectedSurface.test.tsx`

**Interfaces:**
- Consumes: Task 1's exports; `choosePane` and `logOpen` in
  `ConnectedSurface.tsx` (grep for their current sites — the file is long
  and line numbers drift).
- Produces: `useSurfaceSwipe(ref: RefObject<HTMLElement | null>, opts: {
  pane: PaneId; blocked: boolean; onChange: (next: PaneId) => void }):
  void` — `blocked` carries the log-sheet-open case (spec A7).

- [ ] **Step 1: Write the failing wiring tests** in
  `ConnectedSurface.test.tsx`, driving real `PointerEvent`s at the surface
  element. **Verified before this plan was written:** jsdom HAS a
  `PointerEvent` constructor and does NOT implement `setPointerCapture` —
  stub `setPointerCapture` / `releasePointerCapture` /
  `hasPointerCapture` on `Element.prototype` in a `beforeEach`, and say in
  a comment that those stubs are exactly why this test cannot prove
  capture retargeting (the device probe did; the e2e pin re-checks it).
  **Two further verified jsdom traps** — `new PointerEvent(...)` defaults
  `pointerType` to `""` and `isPrimary` to `false`, so every fixture event
  must set both explicitly or a handler branch keyed on either is dead (or
  inverted) and the test reads as passing while exercising the reject
  path. And the grid case MUST render the real `PaneGrid` — a hand-built
  `<div class="connected-grid-row">` has no `role="group"` ancestor, so it
  passes against the broken predicate too (recurring failure #3):
  - down on the hero, move −80px, up → the GRID pane's content is on
    screen and the rail's Grid button is selected (assert the user-visible
    consequence, not a spy — docs/TESTING.md §3)
  - down on a **grid row cell**, move +80px, up → pane changes (the probe's
    case, end to end)
  - down on a rail `<button>`, move −80px, up → pane does NOT change from
    the drag
  - with the log sheet open, down + move −80 + up → pane does not change
  - `pointercancel` mid-drag → no change, and a later clean drag still
    works (no stuck state)
  - a second concurrent `pointerdown` does not start a second gesture
- [ ] **Step 2: Run — RED.**
- [ ] **Step 3: Implement the hook.** Native listeners attached once via a
  ref effect (`[ref]` deps) with latest-value refs for pane/blocked/
  onChange — the surface re-renders 5-11×/s while connected and
  re-subscribing on every render is both wasteful and a timing hazard; the
  probe's own comment block explains this and is worth carrying over.
  `pointerdown`: ignore when `blocked` or `isSwipeBlocked(target)` or a
  gesture is already tracking; else record origin and
  `setPointerCapture`. `pointermove`: nothing (the delta is read at up —
  keep it that way; no per-move state, no re-render). `pointerup`: compute
  `paneAfterSwipe`, call `onChange` only when it differs.
  `pointercancel`: clear state. Always release capture on end.
- [ ] **Step 4: Wire into `ConnectedSurface`** — ref on the surface
  element, `onChange={choosePane}` (persistence and the rail stay exactly
  as they are), `blocked={logOpen}`. The triple-tap diagnostics gesture is
  untouched: a swipe must never count as a tap (the old handler's own
  note — keep the property and pin it if a cheap assertion exists).
- [ ] **Step 5: The sheet's second guard.** Put `data-swipe-ignore` on
  `SheetShell`'s backdrop root (`src/components/SheetShell.tsx:123` — a
  `<div onClick={onDismiss}>`, the one operable non-`<button>` in the
  surface tree). The `logSheetOpen` boolean already covers the sheet; this
  makes the coverage structural, so the NEXT overlay author does not have
  to remember a boolean, and it gives the opt-out attribute a real first
  consumer rather than shipping it untested (spec-blind-tests lesson).
  Pin the house rule that justifies the whole predicate with a source
  sweep in the existing idiom (`ConnectedSurface.test.tsx`'s caps sweep):
  within `src/workout/connected/**` and `ConnectedSurface.tsx`, `onClick`
  and `onPointerDown` appear only on `<button>` or on an element carrying
  `data-swipe-ignore`.
- [ ] **Step 6: CSS.** `touch-action: pan-y` on `.connected-surface` AND on
  `.connected-grid-rows` (the `overflow-y: auto` scroller — the
  intersection rule means a declaration above it never reaches a finger
  that lands inside it). Grep first: `touch-action` currently appears
  nowhere in `index.css`; it retired with the old handler.
- [ ] **Step 7:** `pnpm test --project client` green (both lines); `pnpm
  lint && pnpm typecheck`.
- [ ] **Step 8: Commit** `git commit -m "feat: the surface feels the swipe again"`.

---

### Task 3: The real-touch pin and the gates

**Files:**
- Modify: `app/e2e/connected.spec.ts` (a new `test.describe` with
  `test.use({ hasTouch: true })`)
- Modify: `app/e2e/design.spec.ts` (computed-style pin)

- [ ] **Step 1: The touch pin**, in the live fake-driven walk (the static
  connected fixtures have no React and cannot host this — antagonist B4).
  **Verified before this plan was written:** the suite runs Chromium only
  (`playwright.config.ts` projects) on `@playwright/test` 1.62.1, whose
  `page.touchscreen` exposes `tap()` and no drag, and `locator.dragTo` is
  mouse-based. So: `test.use({ hasTouch: true })` plus a CDP session
  (`context.newCDPSession(page)`) driving `Input.dispatchTouchEvent`
  start/move/end. Assert `pointerType === "touch"` reached the handler in
  at least one case, so a silently-mouse pin cannot masquerade as a touch
  pin:
  - horizontal drag from the hero → pane changes
  - horizontal drag **starting on a grid row** → pane changes
  - a drag beginning on the rail button → pane changes only by the click,
    not the drag
  - a CPU-throttled variant (`Emulation.setCPUThrottlingRate`, the
    scroll-echo recipe) of the first case
- [ ] **Step 2: The scrollable-grid case needs its OWN program — the
  walk's does not scroll.** Arithmetic, done before this plan was
  written: the walk's fixture is five work intervals
  (`connected.spec.ts:84-90`, asserted `:626`), and the chromium project
  is portrait 390×844 (`playwright.config.ts:22-24`) where
  `.connected-grid-rows` is 600px and holds **15** rows
  (`screenshots.spec.ts:2546`, `:2662-2663`). Five rows into a fifteen-row
  box never overflows, so riding that walk would reproduce the probe's own
  blind spot exactly. Give this case a program with **≥16 intervals**
  (portrait) or run it landscape with **≥9** (`LANDSCAPE_GRID_SCROLLER_PX
  = 266`, 8 fit — `screenshots.spec.ts:2547`, `:2843`), and open the test
  by asserting `scrollHeight > clientHeight` on `.connected-grid-rows` so
  it fails loudly the day the fixture stops overflowing. Then: a vertical
  drag on the rows leaves the pane unchanged AND scrolls the list; a
  horizontal drag starting inside the now-scrollable rows still pages.
  **Label the whole pin in the file for what it is:** Chromium evidence
  only, and specifically the engine on the *other* side of a documented
  Safari/Chromium interop gap (W3C pointerevents#303) — a pin, never a
  gate (spec, PM C2).
- [ ] **Step 3: The `touch-action` pin** in `design.spec.ts`: computed
  style on `.connected-surface` and `.connected-grid-rows` is `pan-y`.
  Computed style in a real browser, never a grep of the stylesheet. This
  pin is load-bearing beyond its size: the probe's falsification of the
  scroller candidate holds only for a build that carries these
  declarations, and the branch currently has none.
- [ ] **Step 4: Mutation-probe every pin** — restore the `[role]` wildcard
  and confirm the grid-row tests (jsdom AND e2e) go RED; delete the
  scroller's `touch-action` and confirm the computed-style pin goes RED;
  shrink the scrollable-grid program and confirm its
  `scrollHeight > clientHeight` opener goes RED. A pin that cannot go red
  proves nothing (mutation-probe-must-bite).
- [ ] **Step 5: Gates.** `pnpm lint && pnpm typecheck && pnpm test` (all
  projects), `pnpm e2e`, `pnpm screenshots` if any captured surface
  changed (it should not — no visual change is intended; if screenshots
  move, say why). Per-file coverage for `swipe.ts` at the bar.
- [ ] **Step 6: Commit** `git commit -m "test: a real finger drags the panes, and the pins bite"`.

---

### Task 4: The phone leg (James + device — NOT an implementation task)

- [ ] **Step 1:** `VITE_ENABLE_FAKE_MONITOR=1 pnpm ios:build && pnpm
  ios:open`; run on James's phone from Xcode, and connect to the **real
  PM5**. Keep the flag ON — not for the fake, which a native build cannot
  reach (below), but because the `pointercancel` readout rides the same
  build-time gate, and without it a cancelled swipe leaves no trace in the
  Xcode console. Dropping the flag on 2026-08-18 silently disarmed that
  instrument for the walk that actually needed it.

  **The fake cannot drive the native app — corrected 2026-08-18, after it
  wasted a walk attempt.** This plan and the spec both said
  `VITE_ENABLE_FAKE_MONITOR=1 pnpm ios:build` gives a fake device on the
  phone with no erg needed. It does not, and no injection fixes it:
  `adapters/monitorTransport.ts` picks the Capacitor BLE arm whenever
  `isNative()`, and ONLY the web arm reaches `resolveDefaultTransport`'s
  fake seam (that file's own header says so: "native picks Capacitor BLE
  directly, and only the web arm reaches this seam at all"). The claim was
  inherited from the spec's Step 0 and carried through this plan unchecked.
  **No rowing is still required** — connect, let it arm, tap "Show me the
  numbers", and the grid renders every row without a stroke.
- [ ] **Step 2: The program must make the grid scroll.** A short program
  reproduces the probe and proves nothing new: load one with **≥9
  intervals** and walk it in **landscape** (the scroller fits 8 —
  `screenshots.spec.ts:2547`). Confirm `.connected-grid-rows` actually
  overflows before the drags begin. **No rowing is required for this leg
  at all** — it runs against the fake monitor, exactly as the probe did,
  so the program only has to exist. The canned hardware-walk set has
  nothing long enough; paste this at `/library/import` (same grammar,
  verified against the skill's own blocks):

  ```
  93 | Swipe Long Grid | AT | medium | 2
  x10
  w 250m 6k @24 r0
  ```

  Ten rows (eleven with the warm-up preference on) against a scroller
  that fits eight. If this piece proves generally useful, promoting it
  into `.claude/skills/hardware-walk/SKILL.md`'s canned set is a
  phase-close question, not this task's.
- [ ] **Step 3:** One instruction at a time, hardware-walk pacing: (a)
  swipe LIVE→GRID from the hero; (b) swipe GRID→LIVE starting **on a grid
  row**; (c) **a deliberately DIAGONAL drag starting inside the scrolling
  rows** — this is the one case the probe could not reach and the one
  WebKit's directional lock is documented to cancel (probe README, "Open");
  (d) scroll the grid vertically and confirm it still scrolls; (e) tap a
  rail button and confirm the segmented control still works.
- [ ] **Step 3a: Record what (c) does either way.** If diagonal drags on a
  scrolling grid sometimes fail to take, that is an ACCEPTABLE, documented
  limit — the list scrolls, the rail still works — not a walk failure. Write
  it into the walk record and the PR body rather than silently shipping it
  or silently failing the leg. A drag that fails to take is a limit; a drag
  that changes the WRONG pane, or a grid that stops scrolling, is a
  failure.
- [ ] **Step 4:** Record medium (WKWebView), build, iOS version in the
  walk record — the original report's missing fields (spec).
- [ ] **Step 5: Disposition (binding, spec A8).** If the phone leg fails,
  the handler DOES NOT SHIP: revert Item A from the branch, commit the
  walk evidence beside the probe trace, and refile. No shipping an
  unverified device interaction.

---

### Task 5: The PR

- [ ] **Step 1:** Push; PR titled "Swipe between the connected panes".
  Human-first body: outcome line; bullets (what the rower can now do, that
  a grid-row drag works and why it did not, that the rail is unchanged,
  what the phone leg verified, release as v0.10.2 at phase close with the
  swipe NAMED in the notes — a gesture nobody knows exists is not a
  feature); Record block (probe verdict cite, the guard's before/after
  predicate, the pins and their mutation probes, coverage, the phone leg's
  medium/build/iOS).
- [ ] **Step 2:** Not triad; no per-PR PM verdict (pure UI, phase-grouped
  gates). Present for James's review and STOP — no merge without his word.
