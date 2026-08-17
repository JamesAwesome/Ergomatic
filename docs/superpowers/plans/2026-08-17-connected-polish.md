# Phase CS Implementation Plan (Item B first; Item A gated on its probe)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the enriched NEXT line (Item B) on its own gates; run Item
A's device probe; build the swipe only around the probe's verdict.

**Architecture:** Item B replaces `surfaceModel`'s `upNext`/`thenNext`
pair with a single connected-only builder (`connectedNextText`) composed
from `EnginePhase.label` + extent + `@spm`, exhaustive over the phase
union; `PaneLive` drops the then-branch; the then-CSS dies. Item A is a
probe task (James + phone + Web Inspector) that terminates this plan
with a committed trace; the swipe implementation is a FOLLOW-ON plan
written from that trace (spec's contingency rule).

**Tech Stack:** existing stack; zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-connected-polish-design.md`
— binding; its composition table, vetted-ground list, and disposition
rules are exact requirements.

## Global Constraints

- `src/**` tests run under `pnpm test --project client` (positional
  filters do not narrow; read BOTH summary lines).
- TDD; assertion quality per docs/TESTING.md; realistic fixtures
  (seeded-library shapes — recurring failure #3).
- The builder must read `EnginePhase.label` for the target text — never
  re-derive from `targetSplit` (PM C5; vetted ground).
- House copy rules: no em-dashes in user-facing strings; the separator
  is the middle dot `·` (already on this line).
- The vetted ground (spec + antagonist anchor) may be leaned on without
  re-verification; anything OUTSIDE it that a task must assume gets
  checked in-task.
- Commit per task; `git rev-parse --show-toplevel` must print
  `.../.claude/worktrees/connected-polish` first.
- Commands in `app/`. No per-task `pnpm e2e` (Task 3 runs the gates).

## File Structure

- Modify: `app/src/workout/connected/surfaceModel.ts` — new
  `connectedNextText(phases, index)` (private helper beside the model
  builder), `upNext` rebuilt on it, `thenNext` field REMOVED from
  `SurfaceModel` (its armed-shift comment block goes with it).
- Modify: `app/src/workout/connected/PaneLive.tsx:196-206` — then-branch
  deleted.
- Modify: `app/src/index.css` — `.connected-band-upnext-then` base +
  landscape rules deleted (recurring failure #5: grep both class names
  across src/ and e2e/ after).
- Tests: `surfaceModel.test.ts` (the property table),
  `PaneLive.test.tsx:245-308` (rewritten), 6 frozen
  `e2e/fixtures/connected-*.html` re-snapshotted, exact-string e2e at
  `design.spec.ts:5121/:6177/:6322-6327`,
  `screenshots.spec.ts:2573-2578/:2701-2706` updated.

---

### Task 1: The builder, exhaustively (RED first)

**Files:**
- Modify: `app/src/workout/connected/surfaceModel.ts`
- Test: `app/src/workout/connected/surfaceModel.test.ts`

**Interfaces:**
- Consumes: `EnginePhase` (fields per `domain/expand.ts:11-42` +
  `engine.ts`: `type`, `seconds?`, `meters?`, `label`, `spm?`,
  `targetKind?`); `upNextTextAt`'s FINISH contract (next === undefined
  → "FINISH"); the armed shift (`phaseIndex - 1`) at
  `surfaceModel.ts:772-777`.
- Produces: `connectedNextText(phases: EnginePhase[], index: number):
  string` — the value for `SurfaceModel.upNext`; `SurfaceModel.thenNext`
  DELETED from the interface.

- [ ] **Step 1: Write the failing property-table test** in
  `surfaceModel.test.ts`: one `it` per spec-table row, built from
  realistic phases (copy shapes from seeded-library expansions or the
  file's existing fixtures — NOT hand-minimal `{type:"work"}` stubs):

```
work+meters+split target+spm  -> "WORK 1500m · 2:13.0 @24"
work+seconds+split target+spm -> "WORK 6:00 · 2:13.0 @24"
work+meters+effort target     -> "WORK 1500m · ALL OUT"
warmup+meters                 -> "WARM-UP 2000m · Easy"
warmup+seconds                -> "WARM-UP 10:00 · Easy"
test                          -> "TEST · All out"
rest                          -> "REST 1:00"
index past end                -> "FINISH"
work+split target, spm unset  -> no "@" anywhere in the string
armed shift                   -> at armedMirror the value names phases[phaseIndex]
```

  Use the exact house duration format (`fmtDuration`) and `fmtSplit`
  via the LABEL (assert the label text appears verbatim — do not call
  fmtSplit in the test's expected values where label already is the
  formatted string; hardcode expected strings, the anti-tautology
  idiom).
  ALSO in this test file: assert `SurfaceModel` has no `thenNext` key
  (`"thenNext" in model === false`) so the retirement is pinned.
- [ ] **Step 2: Run — new tests RED** (`pnpm test --project client`,
  both summary lines; existing thenNext tests at `:658-702` will also
  be red once the field dies — rewrite them in this task as part of the
  table).
- [ ] **Step 3: Implement** `connectedNextText` as a `switch` over
  `phase.type` (exhaustive, with a `never` guard — the axes lesson):
  work → `${kind} ${extent} · ${label}${spm ? ` @${spm}` : ""}`;
  warmup → same shape (label "Easy" kept); test → `TEST · ${label}`;
  rest → `REST ${fmtDuration}`; undefined → `FINISH`. Extent:
  `meters` → `${meters}m`, else `fmtDuration(seconds/60)`. Wire
  `upNext` through it (armed shift preserved); delete `thenNext` +
  its comment block + `thenNextTextAt` import if now unused here.
- [ ] **Step 4: Run to green; typecheck** (the `thenNext` deletion
  must break PaneLive's compile — expected; fix in Task 2, or if the
  compiler forces it, fold the minimal PaneLive edit here and say so).
- [ ] **Step 5: Commit** `git commit -m "feat: the NEXT line learns distance, split and rate, and forgets then"`.

---

### Task 2: PaneLive + CSS + the fixture/e2e wave

**Files:**
- Modify: `app/src/workout/connected/PaneLive.tsx:196-206` (then-branch
  out), `app/src/index.css` (`.connected-band-upnext-then` base
  `:6594-6596` + landscape `:8135-8140` — verify lines by grep, they
  drift)
- Tests: `PaneLive.test.tsx:245-308` rewritten to the new single-value
  contract; re-run the client-project file snapshots so the 6 frozen
  `connected-*.html` fixtures regenerate; update exact-string e2e
  (`design.spec.ts:5121`, `:6177`, `:6322-6327`;
  `screenshots.spec.ts:2573-2578`, `:2701-2706`) to the new strings.

- [ ] **Step 1:** PaneLive edit + CSS deletion; grep
  `connected-band-upnext-then` across `src/` AND `e2e/` — zero hits
  after (recurring failure #5).
- [ ] **Step 2:** Rewrite `PaneLive.test.tsx`'s NEXT tests (value +
  node order, no then-node); regenerate the six fixture snapshots
  (`toMatchFileSnapshot` re-run); update the exact-string e2e
  expectations to the composition table's strings for those scenes'
  programs (derive each scene's expected string from ITS program, not
  by copying one row).
- [ ] **Step 3:** `pnpm test --project client` green, both lines;
  `pnpm lint && pnpm typecheck`.
- [ ] **Step 4: Commit** `git commit -m "feat: the pane and its pins speak the new line"`.

---

### Task 3: Gates + screenshots + the rate-survives criterion

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test` (all
  projects; integration needs Docker — fall back unit+client with a
  note if absent).
- [ ] **Step 2:** `pnpm e2e` (src touched) and `pnpm screenshots`
  (footer layout changed on captured surfaces). OPEN the refreshed
  screenshots and look (recurring failure #7): the connected frames
  must show the enriched line with data, not dashes.
- [ ] **Step 3: The rate-survives criterion (spec EC3):** on the
  reference landscape frame, the seeded library's longest NEXT string
  (per the anchor's corpus measurement, worst = 30 chars) shows its
  `@rate` un-truncated. Assert via the existing
  `scrollWidth <= clientWidth` pins PLUS one added assertion that the
  rendered text ENDS with the `@NN` token for a longest-string scene.
- [ ] **Step 4:** Per-file coverage for surfaceModel.ts + PaneLive.tsx
  at the bar; check both summary lines.
- [ ] **Step 5: Commit** `git commit -m "test: the gates see the whole line, rate included"`.

---

### Task 4: Item A's probe (James + phone; NOT an implementation task)

**Files:**
- Create: `docs/monitor/sessions/probe-2026-08-XX-swipe/README.md` (the
  trace + verdict)
- A THROWAWAY branch commit carrying the minimal PE handler (never
  merged; the probe needs something to swipe against)

- [ ] **Step 1:** On a scratch branch off this one: minimal PE handler
  on `.connected-surface` (down/move/up/cancel, console.log EVERY event
  with type+coords+timestamp; commit threshold logic; `touch-action:
  pan-y` also on `.connected-pane` + the grid scroller per the spec).
- [ ] **Step 2:** `VITE_ENABLE_FAKE_MONITOR=1 pnpm ios:build && pnpm
  ios:open`; run on James's phone; Safari → Develop → phone → the
  WKWebView; James swipes the five scenarios (clean horizontal,
  diagonal, slow, during active fake ticking, GRID-origin). ~10 min of
  his time; one scenario per instruction, hardware-walk pacing rules.
- [ ] **Step 3:** Commit the trace + a verdict naming which candidate
  the events convict (touchend-only history, scroller intersection,
  busy-main-thread, or none-reproduced). THE PLAN ENDS HERE for Item
  A: the swipe implementation plan is written FROM this verdict (spec
  contingency), as its own plan + SDD cycle on this branch.
- [ ] **Step 4:** If the probe cannot be scheduled promptly, Item B
  proceeds to PR alone (Task 5) — B does not wait on A.

---

### Task 5: Item B's PR (with or without A)

- [ ] **Step 1:** Push; PR titled "The NEXT line says what you're about
  to row". Human-first body: outcome line; bullets (what the footer
  now shows with before/after strings, portrait's second phase retired
  by James's ruling, then-clause gone, testers see it at next release);
  Record block (spec cite, the composition table, corpus width
  measurement, fixture wave list, mutation/self-review evidence,
  coverage rows).
- [ ] **Step 2:** Not triad; per the phase-grouped gates NO per-PR PM
  verdict is owed (pure-UI). Present the PR for James's review and
  STOP — no merge without his word. Release note obligation: v0.10.2
  once the phase's items settle (PM's call at phase close).
