# Judge Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower chooses, per slot, whether a judged pace or stroke-rate number is red, blue, or uncoloured — on a new SETTINGS screen behind a door in You.

**Architecture:** One localStorage store writes four resolved CSS custom properties onto `document.documentElement`; every consumer is plain CSS and never learns a preference exists. The judged tint classes gain a metric so pace and SPM can differ, and the raw inks split from the resolved slots so the LOST-THE-MONITOR alarm stays red at every setting.

**Tech Stack:** React 19 + Vite, TypeScript, Vitest (jsdom client project), Playwright e2e, plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-09-08-judge-colours-design.md`. Gate 0 CLOSED 2026-09-08, nine rulings tabled there. Executors read both.

**Revision 2** — folded the delta antagonist pass (2 blocking, 4 major). Revision 1's wave table claimed disjoint files for a wave whose two tasks both modified `index.css`, prescribed a mutation that could not bite, and split the token rename across a wave boundary in a way that would have left judged colour **dark app-wide** with every gate green. All three are fixed below.

**Baseline:** every number here was measured in this worktree (`.claude/worktrees/jc`) at `80ac490b`, run from `app/` unless stated. Re-run any of them.

---

## Global Constraints

- **Copy is American, prose is British.** `color` in identifiers and user-facing strings; `colour` in comments and specs. Do not "fix" either.
- **No em-dashes in user-facing strings.** 44px hit targets and WCAG AA are hard requirements; contrast is computed and stated as a number (recurring failure 6).
- **No client test may assert a colour.** Vitest imports every `.css` as `""` here, AND jsdom does not resolve `var()` — `getComputedStyle(el).color` returns the literal `"var(--judge-pace-faster)"`. An assertion written as `toContain("var(--judge-pace-faster)")` **passes against a completely broken cascade.** Client tests assert class names and root properties; only e2e asserts a colour.
- **Every new assertion gets a mutation that makes it fail**, and the report states what was mutated and what the failure said (recurring failure 21). **Commit before every probe** and confirm with `git log -1` that it landed (recurring failure 22). **A mutation must COMPILE** — swap one legal value for another, never delete a required argument; a type error is not a biting probe.
- **Test invocation:** `pnpm test --project client -- <pattern>` silently runs the whole suite. Use `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`. Read BOTH summary lines.
- **Anything with a life after merge goes in `ROADMAP.md` when found** (recurring failure 14). **Run `git rev-parse --show-toplevel` before every commit.** Every subagent reads `.claude/agent-briefing.md` first.

## How this plan is executed

The controller coordinates; a **fresh subagent implements each task**, briefed
spec-driven: the invariant to close, the test contract, the mutation that must
bite, the exact interfaces. Prescribed code appears only where a neighbouring
task must compile against it, and those blocks are paste-tested (each says so).
Bodies, test bodies beyond the named assertions, and all new CSS are the
subagent's work.

### The browser gate is a singleton — this is what sets the wave shape

`scripts/stack-env.sh` derives `COMPOSE_PROJECT_NAME`, `ERGO_STACK`, `APP_PORT`
and `POSTGRES_PORT` **deterministically from the worktree's absolute path**, and
`scripts/e2e.sh` runs `docker compose … up -d --build --wait` with a `down` in
its trap and no lock. Two subagents in **one** worktree therefore share one
stack and will rebuild and tear down each other's image mid-run.

**Rule: at most one task holding a `pnpm e2e` or `pnpm screenshots` gate runs at
a time.**

**And a second singleton the delta pass did not reach: `.git/index`.** Every
subagent in this worktree commits through one index; two concurrent `git add`
/ `git commit` pairs collide on `.git/index.lock`. Tasks may touch disjoint
files and still not run together, because committing is not a per-file
operation. **So every task in this plan is dispatched one at a time.** The
alternative — a sub-worktree per task, branched off `phase-jc-judge-colours`
and merged back — costs two `pnpm install`s each and a merge per task, for
three small tasks with no browser gate. Not worth it here; worth revisiting
for a phase whose parallel tasks are large.

| Order | Task | Browser gate | Depends on |
| --- | --- | --- | --- |
| 1 | T1 store | no | — |
| 2 | T2 tokens, additive | no | — |
| 3 | T5 `OptionGroup` | no | — |
| 4 | T3 the rename | yes | T2 |
| 5 | T4 legend | yes | T3 (same file) |
| 6 | T6 screen + door + boot | yes | T1, T5 |
| 7 | T7 seam test | yes | T3, T6 |
| 8 | T8 sweep | yes | all |

T1, T2 and T5 are genuinely independent of each other and could run in
parallel on files alone; they are ordered only by the index constraint above,
so their order among themselves is free.

---

### Task 1: The store

**Files:** Create `app/src/you/judgeColors.ts`; Test `app/src/you/judgeColors.test.ts`.

**Project placement, checked not assumed:** `vitest.config.ts`'s unit project is scoped to `server/**`, `domain/**`, `scripts/**`; the client project's include is `src/**/*.test.{ts,tsx}` under jsdom. This module touches `localStorage` and `document`, so client is what it needs.

**Interfaces produced** — **paste-tested**: written to its real path, `pnpm exec tsc -b` and `pnpm exec eslint` both exit 0 at `1f77211d`.

```ts
export const JUDGE_COLORS_KEY = "ergomatic.judgeColors";
export type JudgeColor = "red" | "blue" | "off";
export interface JudgeColors {
  paceFaster: JudgeColor;
  paceSlower: JudgeColor;
  spmFaster: JudgeColor;
  spmSlower: JudgeColor;
}
export const JUDGE_COLOR_DEFAULTS: JudgeColors;
export const JUDGE_SLOT_PROPERTIES: Readonly<Record<keyof JudgeColors, string>>;
export function loadJudgeColors(): JudgeColors;
export function saveJudgeColors(next: JudgeColors): boolean;
export function applyJudgeColors(colors: JudgeColors): void;
```

Defaults `{paceFaster:"blue", paceSlower:"red", spmFaster:"blue", spmSlower:"red"}`. `JUDGE_SLOT_PROPERTIES` maps each slot to `--judge-pace-faster` / `--judge-pace-slower` / `--judge-spm-faster` / `--judge-spm-slower`. `applyJudgeColors` sets each on `document.documentElement` to `var(--judge-red)`, `var(--judge-blue)` or `var(--ink)`.

**Invariants:** I-2, I-6, I-9, I-10.

**Two things to get right:**

1. **Total PER FIELD.** A deliberate departure from `today/todayFilters.ts`, whose own comment reads *"Strict per-set check … a present-but-wrong-shaped value fails the SET"* — total per key, strict per field. Here a rower with three good slots and one corrupt keeps their three. Follow that file's `loadTodayFilters`/`saveTodayFilters` **wrappers**, not its `parseFilterSet`.
2. **BARE `catch`.** `docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`, verbatim: *"**Write them as bare `catch`, never `catch (e) { if (e.name === "SecurityError") }`** — the `nullptr` paths above make detached-document access a `TypeError` that a name-filtered catch would let escape."* This runs at module scope before `createRoot` (Task 6), so an escape is a white screen.

- [ ] **Step 1: Failing tests.** Corruption table (missing key, `"not json"`, `"null"`, `"[]"`, `"{}"`, one-field-only, each field `"green"` / `""` / `0` / `undefined`), each asserting the WHOLE object. **I-9**: getter stubbed to throw `TypeError` (the detached-document shape — not only `SecurityError`). **I-6**: `setItem` throws, `saveJudgeColors` returns `false`. **I-10 round trip**: `saveJudgeColors(x)` then `expect(loadJudgeColors()).toStrictEqual(x)` over a value non-default in **all four** slots. `applyJudgeColors` writes the four properties — assert the property VALUE (`"var(--judge-red)"`), a string this module produced; never a computed colour.
  **Isolation:** `src/test/setup.ts` is one line and clears nothing. Reset `document.documentElement.style` and remove the key in `beforeEach`.
- [ ] **Step 2: Watch them fail. Step 3: Implement. Step 4: Green. Step 5: Commit.**
- [ ] **Step 6: Mutation A.** Make any malformed field return `JUDGE_COLOR_DEFAULTS` wholesale. The one-field-only case must go red.
- [x] **Step 7: Mutation B.** Wrap the saved value as **`{v:1, colors: next}`** without touching the reader. **I-10 goes red, every corruption case stays green** — the proof the round trip tests what the table cannot.
  **Corrected during execution:** this step originally said `{v:1, ...next}`, which **cannot bite against any correct implementation of this contract** — the spread leaves all four fields at top level and a total-per-field reader ignores the extra key. Measured: the spread form left 57/57 green; `{v:1, colors: next}` fails exactly the three I-10 assertions with every corruption case still passing. The mutation I prescribed was itself an RF21 instance, inside a plan that cites RF21.

**Gates:** `pnpm typecheck`, `pnpm lint`, the file's suite, per-file coverage for `judgeColors.ts` reported as four numbers. No browser gate.

---

### Task 2: Tokens and the four rules — ADDITIVE ONLY

**Files:** Modify `app/src/theme/tokens.css`, `app/src/index.css`, **`app/src/workout/ConnectedSurface.test.tsx`**; add `app/src/theme/judgeTokens.test.ts`.

**`ConnectedSurface.test.tsx` belongs to THIS task, not Task 3** (corrected during execution). The `.connected-lost` repoint below breaks three of its assertions: the two `background: var(--judge-slower)` reads, and `"the two verdict tokens are declared, distinct, and actually blue and red"`, which regexes `--judge-faster:\s*(#[0-9a-f]{6})` out of `tokens.css` and finds a `var()` alias once the aliases exist. Repoint the hex probe at `--judge-blue`/`--judge-red`, where the literals now live; that preserves its intent exactly.

**Invariant:** I-4, and the structural half of I-7.

**Nothing RENDERED changes.** (Revision 2 said "adds and changes nothing that is already consumed", which is false and dangerous — `.connected-lost`'s background is consumed and is changed. The true claim is weaker and sufficient: `--judge-slower` and `--judge-red` are both `#962718`, so no pixel moves. The stronger phrasing is what leads an implementer to skip the existing suites, which is exactly the trap that made `ConnectedSurface.test.tsx` this task's file.) Revision 1 had it delete `--judge-faster`/`--judge-slower` and the two `.timer-card-actual-faster/-slower` rules while Task 3 still emitted the old class names — which leaves judged colour **dark on both the connected panes and the summary** for a whole wave, with every gate green. Confirmed by experiment, not inference: those exact deletions were applied at their real paths and **`pnpm build` exited 0**, because an unresolvable `var()` is invalid at computed-value time, not a parse error, and the surviving e2e assertions check class *presence*.

**Prescribed** (paste-tested: applied at these paths, `pnpm build` exit 0, reverted, at `1f77211d`).

`tokens.css` — the old pair becomes **aliases**, retired in Task 3:

```css
  --judge-blue: #1d4e89;
  --judge-red: #962718;
  --judge-pace-faster: var(--judge-blue);
  --judge-pace-slower: var(--judge-red);
  --judge-spm-faster: var(--judge-blue);
  --judge-spm-slower: var(--judge-red);
  /* Retired by Task 3, once nothing emits the classes that consume them. */
  --judge-faster: var(--judge-blue);
  --judge-slower: var(--judge-red);
```

`index.css` — four rules **added beside** the existing two, which Task 3 removes:

```css
.judge-pace-faster {
  color: var(--judge-pace-faster);
}

.judge-pace-slower {
  color: var(--judge-pace-slower);
}

.judge-spm-faster {
  color: var(--judge-spm-faster);
}

.judge-spm-slower {
  color: var(--judge-spm-slower);
}
```

`.connected-lost`'s `background: var(--judge-slower)` becomes `var(--judge-red)` **in this task** — it is an alarm, not a judged number, and must never follow the preference.

**That a custom property may hold a `var()` reference and resolve through it** is PRIMARY — CSS Custom Properties Level 1 §2.3, verbatim: *"Custom properties are left almost entirely unevaluated, except that they allow and evaluate the var() function in their value."* It already ships here: `tokens.css`'s `--ink-1: var(--ink)`.

- [ ] **Step 1: Failing CSS-source tests.**
  Use `scopedRuleBodies` (`src/test/cssView.ts:203`) for the per-rule assertions — each of the four new rules resolves to its own token, `toHaveLength(1)` each; `.connected-lost`'s background is `--judge-red`; `.timer-card-actual-stale` still resolves to `--ink-3`.
  **I-4's real content needs a different function:** *no `--judge-pace-*`/`--judge-spm-*` token appears in any `background` declaration anywhere in `index.css`*. `scopedRuleBodies` filters by one selector, so use `cssRules(source)` (`cssView.ts:100`) and scan every body — and note its doc requires `commentStrippedSource(text)` first, *"this throws rather than guessing if the braces do not balance"*. **Comment-strip or the sweep hits prose**: `index.css:7827` is a comment naming `--judge-slower` fifteen lines above the real declaration at `:7842`.
- [ ] **Step 2: Fail. Step 3: Apply. Step 4: Green. Step 5: Commit.**
- [ ] **Step 6: Mutation A.** Point `.judge-pace-slower` at `var(--judge-red)` unconditionally — the per-rule token assertion goes red.
- [ ] **Step 7: Mutation B.** Give `.connected-lost` a `background: var(--judge-pace-slower)` — the I-4 sweep goes red. Report both failure texts.

**Gates:** `pnpm build` exit 0, `pnpm format:check`, `pnpm typecheck`, `pnpm lint`. **No browser gate, and none is needed:** nothing rendered changes, which is the point of making this task additive.

---

### Task 3: The rename

**Files:** Modify `app/src/workout/connected/PaneLive.tsx` (3 sites), `PaneGrid.tsx` (2), `app/src/session/PostWorkoutSummary.tsx` (1), `app/src/index.css`, `app/src/theme/tokens.css`, `app/src/workout/ConnectedSurface.test.tsx`, `app/src/workout/connected/PaneLive.test.tsx`, `app/src/workout/connected/PaneGrid.test.tsx`, `app/src/session/PostWorkoutSummary.test.tsx`, `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`, **`app/src/theme/judgeTokens.test.ts`** (Task 2 created it carrying a test titled *"keeps `--judge-faster`/`--judge-slower` alive as aliases for Task 3 to retire"* — unambiguously this task's, and the revision-2 file list omitted it); regenerate `app/e2e/fixtures/connected-*.html` (**6 of the 12 change** — only those carrying `faster`/`slower`).

**Invariants:** I-1, I-3, I-7. **Consumes** Task 2's four class names.

This is one atomic rename and it is deliberately not split: no smaller unit leaves the branch green.

**Census — run each and reconcile every hit** (all reproduce at `80ac490b`):

```
$ grep -rn "judgedClass(\|cellClass(\|judgedColorClass(" \
    src/workout/connected/PaneLive.tsx src/workout/connected/PaneGrid.tsx \
    src/session/PostWorkoutSummary.tsx | grep -v "^[^:]*:[0-9]*:function " | wc -l
6
$ grep -rc "summary-row-faster\|summary-row-slower" $(grep -rl "summary-row-faster\|summary-row-slower" src e2e)
src/session/PostWorkoutSummary.tsx:2      src/session/PostWorkoutSummary.test.tsx:17
src/index.css:2                            e2e/design.spec.ts:1
e2e/screenshots.spec.ts:7
$ grep -rn "timer-card-actual-" src e2e | wc -l      # 85 across 24 files
$ grep -rn "var(--judge-" src/workout/ConnectedSurface.test.tsx | wc -l   # 4
$ grep -rl "timer-card-actual-" e2e/fixtures | wc -l  # 12 (the glob connected-*.html matches 14; 12 carry the class)
```

**The six sites and their metric:**

| file | site | metric |
| --- | --- | --- |
| `PaneLive.tsx` | `judgedClass(..., model.pace)` split hero | pace |
| `PaneLive.tsx` | `judgedClass(..., model.avg)` AVG | pace |
| `PaneLive.tsx` | `judgedClass(..., model.rate)` rate hero | spm |
| `PaneGrid.tsx` | `cellClass("connected-grid-pace", row.pace)` | pace |
| `PaneGrid.tsx` | `cellClass("connected-grid-spm", row.spm)` | spm |
| `PostWorkoutSummary.tsx` | `judgedColorClass(row.judged?.direction)` | pace, hardcoded |

`judgedClass` and `cellClass` take **`metric: "pace" | "spm"` as a REQUIRED parameter — no default.** A default of `"pace"` would make a forgotten metric silently correct for one arm, which is the failure the existing `Judgement`-typed suffix exists to prevent.

**All four `Judgement` members get a destination**, so the rename cannot ship a mixed-prefix emitter nobody documented:

| member | emitted class |
| --- | --- |
| `faster` | `judge-{metric}-faster` |
| `slower` | `judge-{metric}-slower` |
| `stale` | `timer-card-actual-stale` — **unchanged** |
| `within` | `timer-card-actual-within` — **unchanged** (no CSS rule at all today, deliberately: `grep -c "^\.timer-card-actual-within" src/index.css` → `0`) |

**Owed to this task by Task 2, which could not run the e2e gate:** `e2e/design.spec.ts` defines `JUDGE_SLOWER_RGB = "rgb(150, 39, 24)"` (`:7371`, used at `:7382` and `:9530`) for the LOST banner's fill, with comments naming `--judge-slower` as that ground at **eleven** sites, not the seven revision 2 listed: `:3179`, `:3191`, `:3192`, `:3197`, `:3198`, `:5083`, `:5805`, `:5816`, `:5821`, `:9521`, `:9591` (the extra four found during execution). The assertions still pass — the rgb has not moved — but the constant and every one of those comments point at a token this task DELETES. Rename and reconcile; the banner's ground is `--judge-red`.

**Retire in this task, now that nothing emits them:** `.timer-card-actual-faster`, `.timer-card-actual-slower`, `.summary-row-faster`, `.summary-row-slower`, and the `--judge-faster` / `--judge-slower` aliases Task 2 left. `grep -rn "var(--judge-faster)\|var(--judge-slower)" src e2e` must return zero.

**Eighteen negative assertions go vacuous, and they are this task's work.** `grep -rn 'not\.toContain("timer-card-actual\|not\.toContain("summary-row-faster\|not\.toContain("summary-row-slower\|not\.toMatch(/timer-card-actual' src e2e` returns 18 at `80ac490b`. Classify each:

- **Vacuous after the rename → retarget to the new class names**: the `summary-row-*` negatives in `PostWorkoutSummary.test.tsx`, and the `timer-card-actual-faster/-slower` negatives in `ConnectedSurface.test.tsx` and `PaneLive.test.tsx`.
- **Still bite → leave alone**: any negative whose subject is `within` or `stale`, which keep the old prefix.
- **`e2e/design.spec.ts`'s two `not.toMatch(/timer-card-actual-/)`** (at `:8305`, `:9337`) are **NOT dead — do not delete them.** Both are "no judgement class rides along" guards on a *resting* cell, and a stray `timer-card-actual-within`/`-stale` still matches. **Widen** to `/timer-card-actual-|judge-(pace|spm)-/`.
- **`e2e/screenshots.spec.ts` carries 7 references** (5 positive `toHaveClass`, plus a **multi-line** `not.toHaveClass(/summary-row-faster|summary-row-slower/)` a single-line grep misses). All go red or vacuous at the rename; fixing them is this task's, not a later one's.

**The 12 fixtures** are `toMatchFileSnapshot` output of `ConnectedSurface.screens.test.tsx` — regenerate, then **read the diff** and confirm every changed class is a judged one.

- [ ] **Step 1: Failing tests.** For each of the six sites, against a realistic model built from `surfaceModel`'s own shape (recurring failure 3), assert the exact class for every state the site can reach. **Four states at the five connected sites; THREE at the summary** — `judgedColorClass(direction: "faster" | "slower" | undefined)` cannot take `within` or `stale`; its parameter type forbids them. Class names only, never a colour.
- [ ] **Step 2: Fail. Step 3: Implement, including all 18 negatives and the two e2e specs. Step 4: Green. Step 5: Regenerate fixtures, read the diff. Step 6: Commit.**
- [ ] **Step 7: The mutation that proves the whole feature.** At `PaneGrid`'s **SPM** site, change `cellClass("connected-grid-spm", row.spm, "spm")` to `… , "pace")`. **Swap a legal value, never delete the argument** — deleting a required parameter is a type error, and a type error is not a biting probe. The per-metric assertion for that cell must go red on a *real* pace class. If it does not bite, pace and SPM are not separable and the task is not done.

**Gates:** `pnpm typecheck`, `pnpm lint`, all touched suites, **`pnpm e2e` GREEN**, `pnpm screenshots` green. This task owns e2e's return to green; no later task inherits a red suite.

---

### Task 4: Delete the summary legend

*(The spec's PR-shape list calls this work item 6; this plan calls it Task 4. Cite by name, not by number. Line numbers in this document have moved as tasks landed — cite by provenance, per the briefing.)*

**Files:** Modify `app/src/session/PostWorkoutSummary.tsx`, `app/src/index.css`, `app/src/session/PostWorkoutSummary.test.tsx`, `app/e2e/design.spec.ts`; reconcile comments in `app/src/log/TraceChart.tsx`, `app/src/session/summaryModel.ts`.

**Invariant:** I-8. **Gate 0 ruling 7, James, 2026-09-08: DELETE** — eight of the nine reachable pace configurations make `← FASTER (BLUE) · SLOWER (RED) →` false.

**Four things go, and the fourth is the one that gets forgotten:**

1. The `<p className="summary-legend">` element.
2. The `.summary-legend` CSS rule (`index.css:10038`).
3. `design.spec.ts`'s `.summary-legend` `toHaveText` assertion — **REPLACED, not deleted** (corrected during execution; the spec was right and this plan was wrong). The spec's gating section says *"whichever Gate 0 option lands, ITS ASSERTION REPLACES `design.spec.ts`'s current `toHaveText` pin"*, and calls e2e the load-bearing layer for I-8. Deleting outright leaves I-8 with no e2e gate at all. The same locator now asserts `toHaveCount(0)` on the same page, and it bites.
4. **`hasJudgedRow`.** `grep -rn "hasJudgedRow" src` returns **three** lines: the definition and its use in `PostWorkoutSummary.tsx`, and a `TraceChart.tsx` comment naming it as a live guard. The use IS the legend's guard, so the local dies with it and lint will say so.

**Two sweep hits revision 2 omitted, both found during execution:** `src/log/TraceChart.test.tsx` carries the same precedent comment test-side, and `docs/design/DEVIATIONS.md:75` names `.summary-legend` as a live sibling in a quiet-mono-label contrast decision — deleting the class makes that row stale (recurring failure 9).

**The grep sweep is part of this task.** Scope it to code and design docs — **not** `docs/superpowers/`, which holds records including this plan, and a census that greps the document stating it is wrong the moment it is written:

```
$ grep -rn "FASTER (BLUE)\|SLOWER (RED)" app/src app/e2e docs/design ROADMAP.md
```

Reconcile by class: **code, must change** — `PostWorkoutSummary.tsx`, `PostWorkoutSummary.test.tsx` (×2: one asserts presence, one absence), `design.spec.ts`. **Comments citing the legend as a live idiom, must change** — `TraceChart.tsx` (which is also the precedent that ruled this deletion: *"carries no colour word on purpose … naming a colour here would just be a second thing to get wrong later"*), `summaryModel.ts`, and `index.css`'s two `.summary-legend` sibling-idiom comments. **Records, must NOT change** — `docs/design/handoffs/`.

- [ ] **Step 1: Failing test.** Invert the existing presence assertion: with a judged row, the legend is absent. **Do NOT keep the second assertion** — revision 2 said "the existing absence test must still pass", which leaves an RF21 residue: before the change the two differed (presence vs absence); after it both assert absence, and the unjudged one sits under a strictly weaker precondition, so nothing can redden it that does not redden the judged one first. Keep the inverted assertion on the judged model — the only state that ever rendered the legend — and delete the now-decorative clause rather than keeping it for the count.
- [ ] **Step 2: Fail. Step 3: Delete all four. Step 4: Green. Step 5: Commit.**
- [ ] **Step 6: Mutation.** Re-add the `<p>` alone. The new test goes red.

**Gates:** `pnpm typecheck`, `pnpm lint` (an orphaned `hasJudgedRow` fails it — that is the check), `pnpm e2e`, `pnpm screenshots` (a line leaves a screen).

---

### Task 5: Generalise `OptionGroup`

**Files:** Modify `app/src/onboarding/OptionGroup.tsx`; test `app/src/onboarding/OptionGroup.test.tsx`.

**Invariant:** every onboarding render stays byte-identical.

**Interfaces produced** (Task 6 consumes):

```ts
options: readonly { value: V; label: ReactNode }[];
className?: string;        // defaults to "onb-options"
optionClassName?: string;  // defaults to "onb-option"
```

**Three additive changes; revision 1 named two.** `label` becomes `ReactNode` because today it is `string` and the button carries no `data-value`, so **there is no way to paint a per-option swatch in that option's own ink** — which Task 6 needs. Plus the two class props. Nothing else; the onboarding-only `value === null` tab-stop branch is unreachable in Task 6 and stays.

**The invariant has NO GATE TODAY, and Step 1 builds it.** `grep -rn "onb-option" src e2e` returns five lines — two emitters in `OptionGroup.tsx`, three rules in `index.css`, and **zero tests**. Every onboarding suite reaches the control through `role="radiogroup"` / `role="radio"`. Revision 1 told the implementer to mutate the default and watch existing tests go red; the count is zero and the probe would have left the suite green.

- [ ] **Step 1: Write the gate that does not exist.** Assert the rendered group carries `onb-options` and each option `onb-option` **by default**. Then: a `ReactNode` label renders its element; supplied class props replace the defaults. Then copy the existing keyboard tests (one tab stop; arrows move focus and selection together; wrapping both ends) and run them against a group with non-default class names, proving the keyboard contract is independent of styling.
- [ ] **Step 2: Fail. Step 3: Implement. Step 4: Green. Step 5: Commit.**
- [ ] **Step 6: Mutation.** Change the `className` default to `"onb-optionsX"`. **The Step 1 assertion must go red** — it is the only thing in the repo that can.

**The `ReactNode` widening has NO runtime probe, and `pnpm typecheck` is its only gate** (measured during execution). Run the new label test against the UNCHANGED component and it passes: JS does not check types, and React renders an element child from a `string`-typed prop happily. Typecheck was red before the change — `TS2322: Type 'ReactNode' is not assignable to type 'string'` at two JSX sites — and that is the gate. The test gates the *rendering of an element label*, which is what Task 6 needs; do not mistake it for a probe of the type change.

**Gates:** `pnpm typecheck`, `pnpm lint`, `OptionGroup.test.tsx` plus **`Recommend.test.tsx`** — measured, not assumed: `grep -rln "OptionGroup" src e2e` returns three files, and `Recommend.tsx` is the control's ONLY consumer. `KnowBaseline` and `RowToFind` never mount it. That makes the byte-identical claim rest on one consumer suite, which strengthens the case for building the gate in Step 1 rather than weakening it. Per-file coverage. No browser gate.

---

### Task 6: The settings screen, the door, the route, and the boot apply

**Files:** Create `app/src/you/SettingsScreen.tsx` + test; modify `app/src/You.tsx`, `app/src/You.test.tsx`, `app/src/shell/AppRoutes.tsx`, `app/src/index.css`, `app/src/main.tsx`, **`app/e2e/design.spec.ts`**, **`app/e2e/screenshots.spec.ts`**, **`app/src/theme/judgeTokens.test.ts`**.

**The e2e files are NOT optional, and one goes red on contact** (found during execution, by the first `pnpm e2e` rather than by review). `design.spec.ts`'s R7 doors chain measures BASELINES → CONCEPT2 → DIAGNOSTICS adjacency; putting SETTINGS between the last two fails it immediately. **Grow the chain to four rather than loosening it** — it is what pins Gate 0 ruling 3 in a real browser. A new screen also owes a design-sweep entry (`docs/TESTING.md`: a new screen with no entry there is a screen the a11y, tap-target and token rules are not actually checking) and a capture.

**And the new preview specimen is a judged cell**, so add its class to `judgeTokens.test.ts`'s `JUDGED_CELL_CLASSES` sweep and declare no `color` on it — it wears the real verdict classes on an element whose own rule sits thousands of lines lower in `index.css`, which is exactly the shape that made every judged summary row plain ink in Task 3.

**Consumes:** Task 1's store, Task 5's `OptionGroup`. **Invariant:** I-6.

**The boot apply lands here** because this is the task that makes the preference exist at all: `applyJudgeColors(loadJudgeColors())` at **module scope in `main.tsx`, before `createRoot`**, beside the existing `void restoreKeyboardAccessoryBar()`. Not in a component, not in an effect. `vitest.config.ts` excludes `src/main.tsx` from coverage entirely, so this line has **no client instrument** — Task 7's leg B is its only gate.

**The screen** (Gate 0 rulings 1 and 2, approved as rendered): route `/you/settings` beside the other `/you/*` routes, reached with `state={{ from: "/you" }}`; header follows `BaselinesScreen.tsx` (`<BackLink fallback="/you" />`, then `<h1 className="screen-title">Settings</h1>`). Two groups, `COLORS · PACE` and `COLORS · SPM`, two rows each; row names `FASTER` / `SLOWER` with their parentheticals (a lower split, a higher split, a higher rate, a lower rate). Each row is `OptionGroup<JudgeColor>` over `RED` / `BLUE` / `OFF`, **each option a swatch in its own ink AND its word** — never colour alone (WCAG 1.4.1); OFF's swatch is a ringed dash. **Keep the swatch `aria-hidden="true"`** or it leaks into the accessible name and `getByRole("radio", { name: "BLUE" })` stops matching — Task 5 pins that. A live preview under each group. Changing a slot calls `applyJudgeColors` immediately, then `saveJudgeColors`; **a `false` return puts a message on screen and the colours still apply.**

**The door** (Gate 0 ruling 3): a fourth `diag-row`, **between CONCEPT2 and DIAGNOSTICS** — BASELINES, CONCEPT2, SETTINGS, DIAGNOSTICS, with DIAGNOSTICS still You's last child. Delete `You.tsx`'s "No SETTINGS section" comment block, which is about to become false.

**The CSS is real new work.** `.onb-option` is a full-width `min-height: 48px` row in a column group; four groups of three is not this screen. Write an inline three-way control: 44px minimum on both axes, `--surface` ground, `--rule-3` border, `--accent` 2px checked border with compensating padding. **Contrast to restate in the report, including the one that is tight:** `--judge-blue` 8.25:1, `--judge-red` 7.94:1, `--ink` 17.11:1, `--ink-3` 7.43:1 on `--surface`; `--accent` 5.94:1 (checked border, 3:1 non-text floor); **`--rule-3` #c9c3b2 is 1.73:1 on `--surface`, below that floor** — acceptable only because an option is identified by its word plus swatch and the checked state carries `--accent`. Say that in the report rather than omitting the number.

- [ ] **Step 1: Failing tests.** Four radiogroups of three options reflecting the stored value; tapping calls `applyJudgeColors` with the new set; **I-6** — `saveJudgeColors` stubbed `false`, assert the message AND that `applyJudgeColors` still ran; the door renders third of four and links to `/you/settings` with the origin state; `AppRoutes` mounts the screen. Reset root style and the storage key per test.
- [ ] **Step 2: Fail. Step 3: Implement. Step 4: Green. Step 5: Commit.**
- [ ] **Step 6: Mutation.** Make the save-failure branch a no-op (drop the message, keep the apply). **I-6 goes red on the message assertion and stays green on the apply assertion.**

  **I-6 must therefore be TWO `it`s, not one** (corrected during execution — revision 2's Step 1 and Step 6 contradicted each other). In a single test the failing message assertion aborts before the apply assertion ever runs, so "stays green" is unobservable and the mutation proves only half of what it claims. Two tests; the mutation reddens exactly one.

**Gates:** `pnpm typecheck`, `pnpm lint`, new suites, `You.test.tsx`, `pnpm e2e`, `pnpm screenshots`, per-file coverage. **Open the captures and look at them** (recurring failure 7).

---

### Task 7: The seam test

**Files:** Modify `app/e2e/design.spec.ts` or add a spec under `app/e2e/`.

**Invariant:** I-1 and I-3 end to end, starting **upstream of the producer** (recurring failure 24).

**Its claim, stated at the strength it earns** (recurring failure 26): `design.spec.ts` already proves *a* judged colour reaches a pixel — `expectedJudgedRgb`/`judgedColor` at 7 call sites, `JUDGE_FASTER_RGB = "rgb(29, 78, 137)"` as an independent literal, plus two computed-colour blocks on the from-the-log door. **This test's own claim is narrower and is the one nothing else covers: that the ROWER'S PREFERENCE reaches a pixel, and that the boot apply works.**

**Two legs, and they are TWO `test`s, not one** — forced, not stylistic, and for the same reason Task 6's I-6 had to split: inside one test leg A's assertion aborts before leg B's ever runs, so mutation 1's required "leg B red, leg A green" would be unobservable. The spec's "one test" wording is loose; this is the correct shape.

**Two legs, and they must test different things:**

- **Leg A, live:** open `/you/settings`, set PACE SLOWER to BLUE, then reach a seeded judged summary **by clicking**. Read `getComputedStyle(...).color` on the pace cell and assert the literal `"rgb(29, 78, 137)"` — independent of the token, so retuning the token cannot retune the test.
- **Leg B, boot:** the same, reloading before the read. The only gate on Task 6's `main.tsx` line.

**The path, named rather than left to be discovered:** `/you/settings` is not in `AppRoutes.tsx`'s `HIDDEN_TABBAR_PREFIXES`, so the tab bar is on the settings screen. Shortest click path is **settings → TabBar TODAY → a LAST THREE row → `/today/log/:id`**; every hop is a client-side `Link`/`NavLink` (`TabBar.tsx:50`, `Today.tsx:1606`/`:1620`). **Only three logs render in LAST THREE**, so either the seeded log must be among them or the test routes via the ALL SESSIONS link to `/today/log` — say which. `design.spec.ts:230`'s existing `postJudgmentMixLog(page)` already seeds a log with faster/slower/on-target rows, and `/today/log/:id` renders `SummaryIntervalsBlock` imported from `PostWorkoutSummary`, so the judged classes are on that surface.

**`page.goto` instead of a click kills leg A's independence** — with `goto`, removing the `main.tsx` call reddens both legs and the "two legs test different things" claim is false. The settings screen's own `applyJudgeColors` writes inline properties on `documentElement` that survive a client-side nav and die on a reload; that asymmetry IS the test.

- [ ] **Step 1: Write both legs. Step 2: Green on arrival — there is no honest red-first run here, and the plan was wrong to prescribe one** (corrected during execution). Tasks 1-6 already landed the feature, so a correctly written seam test passes the moment it exists; the only way to produce a red is to write the test wrong. **The failing evidence for this task is the mutations, not a red-first run.** Step 3: Commit.

- [ ] **Step 3b: Gate the click itself.** Revision 2 defended "click, never `goto`" in prose and gated nothing, and the gap is real, not theoretical: with a `goto`, **every colour assertion still passes** — the boot apply repaints from localStorage, so the cell is blue either way — and the two-legs claim is silently false. Set a same-document sentinel on the settings screen and assert it PRESENT at the end of leg A and ABSENT at the end of leg B. That assertion is the only thing standing between this gate and decoration.
- [ ] **Step 5: Mutation A.** Remove `applyJudgeColors` from `main.tsx`. **Leg B red, leg A green.** If both go red, leg A is using `goto` somewhere.
- [ ] **Step 6: Mutation B.** Point `.judge-pace-slower` at `--judge-red` unconditionally. Both legs red.

**The build must be seen to exit 0 before either result is read** (recurring failure 12's corollary, PR #344): a mutation leaving an import unused fails `pnpm build` inside `docker compose up --build`, compose keeps the PREVIOUS image, and Playwright runs unmutated code — a green that means nothing.

**Gates:** `pnpm e2e` green; both mutation reports carry the exact failure text.

---

### Task 8: The sweep

**Files:** `docs/design/DEVIATIONS.md`, `app/src/index.css`, `app/src/theme/tokens.css`, `app/src/session/TimerTargets.tsx`, `app/src/workout/connected/surfaceModel.ts`, `ROADMAP.md`.

- [ ] **Step 1: The comment census, both families.** Revision 1 greppped only the token names under `--include='*.css'` and missed eight prose sites naming the *classes*. Run **both**:

```
$ grep -rn "judge-faster\|judge-slower" src --include='*.css'          # 12 prose hits
$ grep -rn "timer-card-actual-faster\|timer-card-actual-slower\|timer-card-actual-{" src
```

The second reaches `src/session/TimerTargets.tsx` and `src/workout/connected/surfaceModel.ts`, which are in no other task's file list. `TimerTargets.tsx:120` is a stale-rationale tripwire of exactly the kind the briefing's comment rule exists for.

- [ ] **Step 2: Recompute the contrast numbers rather than carrying them.** `index.css` records `--ink-3` at **7.44:1** on `--surface` at three sites (`:4832`, `:4852`, `:6344`) and at **7.43:1** at `:644` — the file contradicts itself and 7.43 is correct. Recompute all of them once (`node -e` with the WCAG relative-luminance formula) and write the right number; carrying the existing text forward would propagate the error.

- [ ] **Step 2b: Does the settings screen owe a DEVIATIONS row?** Task 6 raised it and could not answer it: row 79 already records the decorative `--rule-3` border idiom at 1.56:1, and the screen has no handoff to deviate FROM — only the Gate 0 artifact, which it matches. Decide and say which.

- [ ] **Step 3: DEVIATIONS row 103** (added during Task 3, which found it and could not own it). It says the LOST banner's ground is `--judge-slower`. That token no longer exists: Task 2 repointed the banner to the raw `--judge-red`, and Task 3 deleted the alias. Reconcile.

- [ ] **Step 4: DEVIATIONS row 138.** Verbatim today: *"BLUE for faster than target, RED for slower, from dedicated `--judge-faster` (#1d4e89) / `--judge-slower` (#962718) tokens … and the CSS hooks are `.timer-card-actual-faster/-slower`"*. Every noun changes. It also claims the SPM half *"needed no code — the class suffix IS the `Judgement` value … satisfied structurally rather than by a convention someone maintains."* That is now false: there IS a per-metric branch, deliberately, because a rower may want them different.

- [ ] **Step 5: DEVIATIONS row 139.** It glosses the split hero as carrying no unit because *"judged colour alone says what it is"*. **With both pace slots OFF that is false** — neither unit nor colour. Still readable (the target sits beneath it), so this is a reconciliation, not a design reopening. Say so.

- [ ] **Step 6: `ROADMAP.md`.** Tick Phase JC's PR row; file anything found during implementation that has a life after merge (recurring failure 14).

- [ ] **Step 7: Final gates.** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`, `pnpm screenshots`, `pnpm dist:grep`. Per-file coverage for every file the branch touched, as numbers. Commit.

---

## Self-review

**Spec coverage.** I-1/I-3 (T3, T7), I-2 (T1), I-4 (T2), I-5 (T3's summary assertions), I-6 (T1, T6), I-7 (T2, T3), I-8 (T4), I-9 (T1), I-10 (T1). Gate 0's three build-changing rulings: door order (T6), legend deletion (T4), comfort settings excluded (nowhere, deliberately).

**Type consistency.** `JudgeColor` / `JudgeColors` / `JUDGE_COLOR_DEFAULTS` / `JUDGE_SLOT_PROPERTIES` / `loadJudgeColors` / `saveJudgeColors` / `applyJudgeColors` appear with those spellings in T1 and T6. The four class names are identical in T2, T3, T7. `metric: "pace" | "spm"` is T3 only, required, no default.

**Every commit boundary leaves the branch green.** T2 is additive with aliases; T3 is the atomic rename and owns e2e's return to green; no later task inherits a red suite. That is the revision-1 defect this structure exists to prevent.

**Known gap, stated rather than hidden.** No task proves the feature on real iOS. The `var()`-indirection evidence is the CSS spec plus a shipped in-repo instance (`--ink-1: var(--ink)`), not a device observation. If that matters it is a walk, and a walk needs its own PM readiness pass.
