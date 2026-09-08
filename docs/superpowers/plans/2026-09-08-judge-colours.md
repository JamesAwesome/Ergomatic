# Judge Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower chooses, per slot, whether a judged pace or stroke-rate number is red, blue, or uncoloured — on a new SETTINGS screen behind a door in You.

**Architecture:** One localStorage store writes four resolved CSS custom properties onto `document.documentElement`; every consumer is plain CSS and never learns a preference exists. The judged tint classes gain a metric so pace and SPM can differ, and the raw inks split from the resolved slots so the LOST-THE-MONITOR alarm stays red at every setting.

**Tech Stack:** React 19 + Vite, TypeScript, Vitest (jsdom for client, node for unit), Playwright for e2e, plain CSS with custom properties.

**Spec:** `docs/superpowers/specs/2026-09-08-judge-colours-design.md` — the plan argues from it; executors read both. Gate 0 CLOSED 2026-09-08, nine rulings tabled there.

**Baseline:** every number and census in this plan was measured in this worktree
(`.claude/worktrees/jc`) at `1f77211d`, in `app/` unless the command says
otherwise. Re-run any of them; none is transcribed from memory.

---

## Global Constraints

- **Copy is American, prose is British.** Identifiers and user-facing strings use `color` (`colorClass`, `METERS`); comments and specs use `colour`. Both are followed deliberately — do not "fix" either.
- **No em-dashes in user-facing strings** (house rule). Periods, colons, middle dots.
- **44px minimum hit target and WCAG AA are hard requirements.** Contrast is computed and stated as a number, never judged by eye (recurring failure 6).
- **No client test may assert a colour.** Vitest imports every `.css` as `""` here, AND jsdom does not resolve `var()` at all — `getComputedStyle(el).color` returns the literal string `"var(--judge-pace-faster)"`. An assertion written as `toContain("var(--judge-pace-faster)")` **passes against a completely broken cascade**. Client tests assert class names and root properties; only e2e asserts a colour.
- **Every new assertion gets a mutation that makes it fail**, and the task report states what was mutated and what the failure said (recurring failure 21). **Commit the real change before running any probe** and confirm with `git log -1` that it landed (recurring failure 22).
- **Test invocation:** `pnpm test --project client -- <pattern>` silently runs the whole suite. Use `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`. Read BOTH summary lines — "Tests" says all-passed while a file that failed to load collects zero.
- **Anything with a life after merge goes in `ROADMAP.md` at the moment it is found**, never only in a PR body (recurring failure 14).
- **Run `git rev-parse --show-toplevel` before every commit** and confirm it prints the worktree path.
- Every subagent reads `.claude/agent-briefing.md` before its brief.

## How this plan is executed

The controller coordinates; a **fresh subagent implements each task**. Briefs
are spec-driven: each task states the invariant to close, the test contract,
the mutation that must bite, and the exact interfaces — **not transcribable
code**. Where a block IS prescribed below it is because the interface must be
exact for neighbouring tasks to compile against it; those blocks are
paste-tested (see each task's note). Everything else — function bodies, test
bodies beyond the named assertions, CSS beyond the token declarations — is the
subagent's own work.

**Dispatch waves.** Tasks in a wave touch disjoint files and go out together.

| Wave | Tasks | Why grouped |
| --- | --- | --- |
| 1 | T1, T2, T6 | No shared files: a new module, CSS only, and one onboarding component |
| 2 | T3 | Needs T2's tokens and rules to exist |
| 3 | T5, T7 | T5 needs T3 (same file); T7 needs T1 and T6 |
| 4 | T4 | Needs T3 and T5 — both change what the e2e suite asserts |
| 5 | T8 | Needs the whole feature standing |
| 6 | T9 | The sweep closes over everything above |

---

### Task 1: The store

**Files:**
- Create: `app/src/you/judgeColors.ts`
- Test: `app/src/you/judgeColors.test.ts` — the **client** project, under jsdom. Checked, not assumed: `vitest.config.ts`'s unit project is scoped to `server/**`, `domain/**` and `scripts/**`, and the client project's include is `src/**/*.test.{ts,tsx}`. This module touches `localStorage` and `document`, so jsdom is what it needs.

**Interfaces produced** (later tasks compile against these exact names; **paste-tested** — this block was written to its real path and cleared `pnpm exec tsc -b` and `pnpm exec eslint`, both exit 0, at `1f77211d`):

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

`JUDGE_COLOR_DEFAULTS` is `{ paceFaster: "blue", paceSlower: "red", spmFaster: "blue", spmSlower: "red" }` — today's appearance.
`JUDGE_SLOT_PROPERTIES` maps each slot to its property: `paceFaster → "--judge-pace-faster"`, `paceSlower → "--judge-pace-slower"`, `spmFaster → "--judge-spm-faster"`, `spmSlower → "--judge-spm-slower"`.
`applyJudgeColors` sets each property on `document.documentElement` to `var(--judge-red)`, `var(--judge-blue)` or `var(--ink)` for `red` / `blue` / `off`.

**Invariants to close:** I-2 (per-field total read), I-6 (boolean save the caller can branch on), I-9 (a storage failure at boot yields defaults and never throws), I-10 (round trip).

**Two things the implementer must get right, and why:**

1. **Total PER FIELD, not per key.** This is a deliberate departure from `today/todayFilters.ts`, which this store otherwise follows. That file's own comment reads *"Strict per-set check … a present-but-wrong-shaped value fails the SET"* — total per key, strict per field. Here, a rower with three good slots and one corrupt keeps their three. Follow `todayFilters.ts`'s `loadTodayFilters`/`saveTodayFilters` **wrappers** (bare try/catch, boolean save); do not follow its `parseFilterSet` discipline.
2. **BARE `catch`.** Never `catch (e) { if (e.name === "SecurityError") }`. `docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`, verbatim: *"**Write them as bare `catch`, never `catch (e) { if (e.name === "SecurityError") }`** — the `nullptr` paths above make detached-document access a `TypeError` that a name-filtered catch would let escape."* This module runs at module scope in `main.tsx` **before `createRoot`** (Task 4), so an escaping throw is a white screen, not a lost preference.

- [ ] **Step 1: Write the failing tests**

Cover, each asserting the WHOLE returned object so a field bleeding into another fails:

- missing key; `"not json"`; `"null"`; `"[]"`; `"{}"`; a one-field-only object; and each field set to `"green"`, `""`, `0`, `undefined`.
- **I-9:** `localStorage.getItem` stubbed to throw a `TypeError` (the detached-document shape the research names — **not** only `SecurityError`), asserting defaults and no throw.
- **I-6:** `localStorage.setItem` stubbed to throw; `saveJudgeColors` returns `false` and does not throw.
- **I-10 round trip:** `saveJudgeColors(x)` then `expect(loadJudgeColors()).toStrictEqual(x)` over a value **non-default in all four slots** (e.g. `{paceFaster:"red", paceSlower:"off", spmFaster:"off", spmSlower:"blue"}`). Without this, a serialisation mismatch passes every corruption case and silently resets the preference on every reload.
- **`applyJudgeColors`:** asserts the four properties land on `document.documentElement` with the three resolved values. Assert the PROPERTY VALUE (`"var(--judge-red)"`), which is a string this module produced — that is legitimate. Do **not** assert a computed colour; see Global Constraints.

**Test isolation:** `src/test/setup.ts` is one line and clears nothing. Every test in this file resets `document.documentElement.style` and removes the localStorage key in `beforeEach`, or state leaks into every later test in the file.

- [ ] **Step 2: Run them and watch them fail**

`NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/judgeColors.test.ts`
Expected: fails to resolve `./judgeColors`.

- [ ] **Step 3: Implement**

Write the module to the interface above. Keep it pure of React.

- [ ] **Step 4: Green, then commit** (commit before probing — recurring failure 22; confirm with `git log -1`)

- [ ] **Step 5: The mutation that must bite**

Change `loadJudgeColors` so that any malformed field returns `JUDGE_COLOR_DEFAULTS` **wholesale** instead of per field. The one-field-only case must go red. Report the assertion text and the failure message. Revert with `git checkout --` against the now-clean file.

- [ ] **Step 6: Second mutation**

Wrap the saved value in `{v: 1, ...next}` without touching the reader. **I-10 must go red and every corruption case must stay green** — that is the proof the round trip tests something the corruption table cannot.

**Gates:** `pnpm typecheck`, `pnpm lint`, the file's own suite. Read the per-file coverage for `judgeColors.ts` (recurring failure 2) and report the four numbers.

---

### Task 2: Tokens and the four rules

**Files:**
- Modify: `app/src/theme/tokens.css`
- Modify: `app/src/index.css`
- Test: `app/src/theme/tokens.test.ts` and/or a new CSS-source test

**Invariants:** I-4 (`.connected-lost` is red at every setting), and the structural half of I-7.

**Prescribed, because Task 3 compiles its class names against it** (paste-tested: applied at these exact paths, `pnpm build` exited 0, then reverted, at `1f77211d`):

`tokens.css` — the retired pair becomes six declarations:

```css
  --judge-blue: #1d4e89;
  --judge-red: #962718;
  --judge-pace-faster: var(--judge-blue);
  --judge-pace-slower: var(--judge-red);
  --judge-spm-faster: var(--judge-blue);
  --judge-spm-slower: var(--judge-red);
```

`index.css` — the two `.timer-card-actual-faster/-slower` rules become four:

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

**A custom property may hold a `var()` reference and resolve through it** — PRIMARY, CSS Custom Properties Level 1 §2.3, verbatim: *"Custom properties are left almost entirely unevaluated, except that they allow and evaluate the var() function in their value."* It also already ships here: `tokens.css`'s `--ink-1: var(--ink)` and `--type-tr: var(--ink)`.

**In this task, ALSO:**
- `.connected-lost`'s `background: var(--judge-slower)` becomes `var(--judge-red)`. It is an alarm, not a judged number, and must never follow the preference — otherwise all-blue turns the alarm blue.
- Delete `.summary-row-faster` and `.summary-row-slower` **only if Task 3 is landing in the same commit**; otherwise leave them and let Task 3 remove them when it orphans them (recurring failure 5 is satisfied by the task that creates the orphan, not by whichever runs first).

- [ ] **Step 1: Write the failing CSS-source tests**

Use `scopedRuleBodies` (`src/test/cssView.ts`, a brace-depth scanner) that `tokens.test.ts` and `ConnectedSurface.test.tsx` already use — jsdom never loads these as real rules, so these read the files' source text off disk.

Assert: each of the four new rules resolves to its own token, one rule each (`toHaveLength(1)`); the six token declarations exist with those exact values; `.connected-lost`'s background is `--judge-red`; **no `--judge-pace-*` or `--judge-spm-*` token appears in any `background` declaration anywhere in `index.css`** (that is I-4's real content — the preference may never reach a filled ground); and `.timer-card-actual-stale` still resolves to `--ink-3`.

- [ ] **Step 2: Watch them fail. Step 3: Apply the blocks. Step 4: Green. Step 5: Commit.**

- [ ] **Step 6: The mutation that must bite**

Point `.judge-pace-slower` at `var(--judge-red)` unconditionally. The per-rule token assertion must go red. Then separately: give `.connected-lost` a `background: var(--judge-pace-slower)`. The I-4 background sweep must go red. Report both failure messages.

**Gates:** `pnpm build` must exit 0 (this is the only thing that proves the CSS parses), `pnpm format:check`, `pnpm typecheck`, `pnpm lint`.

---

### Task 3: The six call sites take a metric, and the old pair retires

**Files:**
- Modify: `app/src/workout/connected/PaneLive.tsx` (3 call sites), `app/src/workout/connected/PaneGrid.tsx` (2), `app/src/session/PostWorkoutSummary.tsx` (1)
- Modify: `app/src/index.css`, `app/src/theme/tokens.css` (deletions)
- Modify: `app/src/workout/ConnectedSurface.test.tsx` (four string literals)
- Test: the three components' own suites

**Invariants:** I-1, I-3, I-7.

**Interfaces consumed:** Task 2's four class names.

**The census this task must satisfy** — run these and reconcile every hit:

```
$ grep -rn "judgedClass(\|cellClass(\|judgedColorClass(" \
    src/workout/connected/PaneLive.tsx src/workout/connected/PaneGrid.tsx \
    src/session/PostWorkoutSummary.tsx | grep -v "^[^:]*:[0-9]*:function " | wc -l
6
$ grep -rn "timer-card-actual-" src e2e | wc -l          # 85 across 24 files
$ grep -rn "summary-row-faster\|summary-row-slower" src e2e | wc -l   # 29 across 5 files
$ grep -rn "var(--judge-" src/workout/ConnectedSurface.test.tsx | wc -l  # 4
```

**The six sites and their metric:**

| file | site | metric |
| --- | --- | --- |
| `PaneLive.tsx` | `judgedClass(..., model.pace)` — split hero | pace |
| `PaneLive.tsx` | `judgedClass(..., model.avg)` — AVG | pace |
| `PaneLive.tsx` | `judgedClass(..., model.rate)` — rate hero | spm |
| `PaneGrid.tsx` | `cellClass("connected-grid-pace", row.pace)` | pace |
| `PaneGrid.tsx` | `cellClass("connected-grid-spm", row.spm)` | spm |
| `PostWorkoutSummary.tsx` | `judgedColorClass(row.judged?.direction)` | pace (hardcoded — the summary has no SPM tint) |

`judgedClass` and `cellClass` take a `metric: "pace" | "spm"` parameter. Keep the class suffix typed as `Judgement` (not `string`) so a renamed union member fails to compile rather than going silent — that is why `PaneLive.tsx` types it that way today.

**All four `Judgement` members get a written destination**, so the rename cannot ship a mixed-prefix emitter:

| member | emitted class |
| --- | --- |
| `faster` | `judge-{metric}-faster` |
| `slower` | `judge-{metric}-slower` |
| `stale` | `timer-card-actual-stale` — **unchanged** |
| `within` | `timer-card-actual-within` — **unchanged** (it has no CSS rule at all today, deliberately: `grep -c "^\.timer-card-actual-within" src/index.css` returns `0`) |

**Also in this task:** delete `.summary-row-faster`, `.summary-row-slower`, and the `--judge-faster` / `--judge-slower` declarations if Task 2 left them. Nothing may still consume them: `grep -rn "var(--judge-faster)\|var(--judge-slower)" src e2e` must return zero.

- [ ] **Step 1: Write the failing tests**

For each of the six sites, against a **realistic model** (recurring failure 3 — build it from `surfaceModel`'s own shape, not a hand-rolled stub), assert the exact class emitted for `faster`, `slower`, `within` and `stale`. Twenty-four assertions minimum. Assert class names only — never a colour.

- [ ] **Step 2: Fail. Step 3: Implement. Step 4: Green. Step 5: Commit.**

- [ ] **Step 6: The mutation that must bite**

Delete the `metric` argument at `PaneGrid`'s **SPM** site so it emits the pace class. The per-metric assertion for that cell must go red. Report the failure. **This is the mutation that proves the whole feature** — if it does not bite, pace and SPM are not actually separable and the task is not done.

**Gates:** `pnpm typecheck`, `pnpm lint`, the three suites, and **`pnpm e2e`** — this diff touches `app/src/`, and the e2e job gates CI (recurring failure 1). Expect e2e failures from the class rename; those are Task 4's, and this task's report names them rather than fixing them.

---

### Task 5: Delete the summary legend

*(Numbered to match the spec's PR-shape list. Runs in wave 3, after Task 3.)*

**Files:**
- Modify: `app/src/session/PostWorkoutSummary.tsx`, `app/src/index.css`, `app/src/session/PostWorkoutSummary.test.tsx`, `app/e2e/design.spec.ts`
- Reconcile: `app/src/log/TraceChart.tsx`, `app/src/session/summaryModel.ts` (comments)

**Invariant:** I-8 — no copy on any surface names a colour the settings could contradict.

**Gate 0 ruling 7, James, 2026-09-08: DELETE.** Not derived from the slots. Eight of the nine reachable pace configurations make `← FASTER (BLUE) · SLOWER (RED) →` false.

**Four things go, and the fourth is the one that gets forgotten:**

1. The `<p className="summary-legend">` element in `PostWorkoutSummary.tsx`.
2. The `.summary-legend` CSS rule in `index.css`.
3. `design.spec.ts`'s `.summary-legend` `toHaveText` assertion.
4. **`hasJudgedRow`** — `grep -rn "hasJudgedRow" src` returns exactly one definition and one use, both in `PostWorkoutSummary.tsx`, and the use is the legend's own guard. It becomes dead the moment the legend goes (recurring failure 5, and an unused local will fail lint anyway).

**The grep sweep is part of this task, not a follow-up.** Run:

```
$ grep -rn "FASTER (BLUE)\|SLOWER (RED)" --include='*.ts' --include='*.tsx' \
    --include='*.css' --include='*.md' app docs ROADMAP.md
```

At `1f77211d` this returns 18 hits. Reconcile each, and note the classes:

- **Code, must change:** `PostWorkoutSummary.tsx`, `PostWorkoutSummary.test.tsx` (×2 — one asserts presence, one absence), `e2e/design.spec.ts`.
- **Comments that CITE the legend as a live idiom, must change:** `TraceChart.tsx` (its `trace-legend` comment names this legend as the idiom it followed — and, usefully, is the precedent that ruled this deletion: *"carries no colour word on purpose … naming a colour here would just be a second thing to get wrong later"*); `summaryModel.ts` (names "this function's own two-color legend"); `index.css`'s `.summary-row-offset` and F-2 comments, which cite `.summary-legend` as a sibling idiom.
- **Records, must NOT change:** `docs/design/handoffs/`, `docs/superpowers/specs/2026-08-17-*`, `2026-08-18-*`, `docs/superpowers/plans/2026-08-18-*`. These describe what was true when written. `ROADMAP.md` and this phase's own spec already carry the deletion.

Also check `grep -rn "summary-legend" src e2e` (7 hits at baseline) and `TraceChart.test.tsx`'s comment, which names `.summary-legend` too.

- [ ] **Step 1: Write the failing test**

Invert `PostWorkoutSummary.test.tsx`'s existing presence assertion: with a judged row present, `screen.queryByText(/FASTER \(BLUE\)/)` is `null`. Keep the existing absence test — it must still pass.

- [ ] **Step 2: Fail. Step 3: Delete all four things. Step 4: Green. Step 5: Commit.**

- [ ] **Step 6: The mutation that must bite**

Re-add the `<p>` element alone. The new test must go red. Report the failure.

**Gates:** `pnpm typecheck`, `pnpm lint` (an orphaned `hasJudgedRow` fails it — that is the check), `pnpm e2e`, and `pnpm screenshots` (a line is leaving a screen — recurring failure 1).

---

### Task 6: Generalise `OptionGroup`

**Files:**
- Modify: `app/src/onboarding/OptionGroup.tsx`
- Test: `app/src/onboarding/OptionGroup.test.tsx`

**Invariant:** every onboarding render stays byte-identical.

**Interfaces produced** (Task 7 consumes these):

```ts
options: readonly { value: V; label: ReactNode }[];
className?: string;        // defaults to "onb-options"
optionClassName?: string;  // defaults to "onb-option"
```

**Three additive changes, and the spec's revision 1 named only two** — the third is why:

1. `label` becomes `ReactNode`, not `string`. Today it is `string` and the button carries no `data-value`, so **there is no way to paint a per-option swatch in that option's own ink**. Task 7's control needs one.
2. `className` and `optionClassName`, defaulting to the exact strings hardcoded today.
3. Nothing else. The onboarding-only `value === null` tab-stop branch is unreachable in Task 7 (a slot always holds a value) and stays as it is.

- [ ] **Step 1: Write the failing tests**

A `ReactNode` label renders its element; the two class props default to `onb-options`/`onb-option`; a supplied pair replaces them. **Then copy the existing keyboard tests** (one tab stop; arrows move focus and selection together; wrapping at both ends) and run them against a group using non-default class names, proving the keyboard contract is independent of styling.

- [ ] **Step 2: Fail. Step 3: Implement. Step 4: Green. Step 5: Commit.**

- [ ] **Step 6: The mutation that must bite**

Change the `className` default to `"onb-optionsX"`. Every onboarding test asserting the shipped class must go red. Report which, and how many — that count is the proof the defaults are load-bearing.

**Gates:** `pnpm typecheck`, `pnpm lint`, `OptionGroup.test.tsx` **and** every onboarding suite that renders it. Per-file coverage for `OptionGroup.tsx`.

---

### Task 7: The settings screen, the door, and the route

**Files:**
- Create: `app/src/you/SettingsScreen.tsx`, `app/src/you/SettingsScreen.test.tsx`
- Modify: `app/src/You.tsx`, `app/src/shell/AppRoutes.tsx`, `app/src/index.css`

**Interfaces consumed:** Task 1's store, Task 6's `OptionGroup`.

**Invariant:** I-6 — a failed save leaves the screen honest.

**The screen** (Gate 0 ruling 1 and 2, approved as rendered):

- Route `/you/settings`, beside the other `/you/*` routes, reached with the same `state={{ from: "/you" }}` origin idiom the three existing doors use, so `BackLink fallback="/you"` returns to You. Header follows `BaselinesScreen.tsx`: `<BackLink fallback="/you" />` then `<h1 className="screen-title">Settings</h1>`.
- Two groups — `COLORS · PACE` and `COLORS · SPM` — each two rows. Row names `FASTER` / `SLOWER`, each with its parenthetical: a lower split, a higher split, a higher rate, a lower rate.
- Each row's control is `OptionGroup<JudgeColor>` with three options, `RED` / `BLUE` / `OFF`. **Each option renders a swatch in its own ink AND its word** — never colour alone (WCAG 1.4.1). OFF's swatch is a ringed dash, not a filled circle.
- A live preview under each group: one specimen number in that group's current colours.
- Changing a slot calls `applyJudgeColors` immediately, then `saveJudgeColors`. **If the save returns `false`, the screen says so** — and the colours still apply. Apply and save are separate steps; a storage failure must not also make the screen look inert.

**The door** (Gate 0 ruling 3): a fourth `diag-row` in `You.tsx`'s `<nav className="you-doors">`, **between CONCEPT2 and DIAGNOSTICS** — order BASELINES, CONCEPT2, SETTINGS, DIAGNOSTICS. DIAGNOSTICS stays You's last child. Delete the `You.tsx` comment block beginning "No SETTINGS section", which is about to become false.

**The CSS is new work and it is real.** `.onb-option` is a full-width `min-height: 48px` row in a `flex-direction: column` group; four groups of three of those is not this screen. Write an inline three-way control: 44px minimum on both axes, `--surface` ground, `--rule-3` border, `--accent` 2px border for the checked state (compensating padding so nothing shifts). Contrast is already banked and must be restated in the report: `--judge-blue` 8.25:1, `--judge-red` 7.94:1, `--ink` 17.11:1, `--ink-3` 7.43:1 on `--surface`; `--accent` 5.94:1 on `--surface` (a 3:1 non-text floor for the border).

- [ ] **Step 1: Write the failing tests**

The screen renders four radiogroups with three options each and reflects the stored value; tapping an option calls `applyJudgeColors` with the new set; **I-6** — `saveJudgeColors` stubbed to `false`, assert the screen's message AND that `applyJudgeColors` still ran; the door renders in position 3 of 4 and links to `/you/settings` with the origin state; `AppRoutes` mounts the screen. Reset `document.documentElement.style` and the storage key per test.

- [ ] **Step 2: Fail. Step 3: Implement. Step 4: Green. Step 5: Commit.**

- [ ] **Step 6: The mutation that must bite**

Make the save-failure branch a no-op (drop the message, keep the apply). The I-6 test must go red on the message assertion and stay green on the apply assertion — proving the two halves are tested separately, which is the whole point of recurring failure 25.

**Gates:** `pnpm typecheck`, `pnpm lint`, the new suites, `You.test.tsx`, `pnpm e2e`, **`pnpm screenshots`** (a new screen — recurring failure 1). Per-file coverage for `SettingsScreen.tsx`. **Open the captures and look at them** (recurring failure 7): a screenshot of an unset screen proves nothing.

---

### Task 4: The e2e harness, the fixtures, and the boot apply

*(Numbered to match the spec. Runs in wave 4, after Tasks 3 and 5.)*

**Files:**
- Modify: `app/src/main.tsx`, `app/e2e/design.spec.ts`
- Regenerate: `app/e2e/fixtures/connected-*.html` (12 files)

**Invariants:** the structural half of I-1 and I-3 across the existing suite; the producer half of the seam Task 8 gates.

**Three pieces:**

1. **`main.tsx`:** call `applyJudgeColors(loadJudgeColors())` at module scope, **before `createRoot`**, beside the existing `void restoreKeyboardAccessoryBar()`. Not inside a component, not in an effect. `vitest.config.ts` excludes `src/main.tsx` from coverage entirely, so this line has **no client instrument at all** — Task 8's reload leg is its only gate, which is why that leg is not optional.
2. **`design.spec.ts`'s judged-colour harness:** `expectedJudgedRgb(judgement)` and `judgedColor(...)` — the latter reads `classList.find(c => c.startsWith("timer-card-actual-"))`. Both must become metric-aware or the harness stops discriminating. `grep -n "judgedColor\|expectedJudgedRgb" e2e/design.spec.ts` names the call sites.
3. **Two assertions that become decoration** (recurring failure 21): `grep -n "not.toMatch(/timer-card-actual-" e2e/design.spec.ts` returns 2 hits. After the rename a judged cell emits `judge-pace-*`, so that regex can **never match and the assertion can never go red**. Retarget them to the new prefixes or delete them — do not keep them for the coverage.
4. **The 12 fixtures** are `toMatchFileSnapshot` output of `ConnectedSurface.screens.test.tsx`; they regenerate rather than rotting silently. Regenerate, then **read the diff** and confirm every changed class is a judged one.

- [ ] **Step 1: Run the e2e suite and record what is red.** That list is this task's work item, and Task 3's report already predicted it.
- [ ] **Step 2: Fix the harness, retarget the dead assertions, regenerate the fixtures, add the boot call.**
- [ ] **Step 3: `pnpm e2e` green. Step 4: Commit.**

- [ ] **Step 5: The mutation that must bite**

Retarget one metric-aware harness assertion back to the pace class for an SPM cell. It must go red. Report the failure.

**Gates:** `pnpm e2e` fully green, `pnpm typecheck`, `pnpm lint`.

---

### Task 8: The seam test

**Files:**
- Modify: `app/e2e/design.spec.ts` or a new spec under `app/e2e/`

**Invariant:** I-1 and I-3, end to end, starting **upstream of the producer** (recurring failure 24).

**This is the load-bearing gate of the whole PR.** Every other test in this plan asserts a class name or a root property. Only this one proves a colour reaches a pixel — because jsdom cannot resolve `var()` and a client assertion of the form `toContain("var(--x)")` passes against a totally broken cascade.

**Two legs, and they must test different things:**

- **Leg A — live:** open `/you/settings`, set PACE SLOWER to BLUE, then reach a seeded summary with a slower-than-target row **by clicking through the app**. Read `getComputedStyle(...).color` on the pace cell and assert the literal `"rgb(29, 78, 137)"` — an independent literal, never a value derived from the token, so retuning the token cannot retune the test.
- **Leg B — boot:** the same, but reload the page before reading. This is the only gate on Task 4's `main.tsx` line.

**`page.goto` instead of a click kills leg A's independence.** With `goto`, removing the `main.tsx` call reddens both legs and the "two legs test different things" claim is false. Click.

- [ ] **Step 1: Write both legs. Step 2: Watch them fail (they should — nothing has set the property yet in a fresh context). Step 3: Green. Step 4: Commit.**

- [ ] **Step 5: The mutation that proves the legs are independent**

Remove the `applyJudgeColors` call from `main.tsx`. **Leg B must go red and leg A must stay green.** If both go red, leg A is using `goto` somewhere; fix it and re-run.

- [ ] **Step 6: The mutation that proves the cascade**

Point `.judge-pace-slower` at `--judge-red` unconditionally. Both legs must go red.

**The build must be seen to succeed before either result is read** (recurring failure 12's corollary, PR #344): an e2e mutation that leaves an import unused fails `pnpm build` inside `docker compose up --build`, compose keeps the PREVIOUS image, and Playwright runs unmutated code — a green that means nothing. Swap a call for another that keeps every import used, and confirm `pnpm build` exited 0 before reading Playwright.

**Gates:** `pnpm e2e` green; both mutation reports carry the exact failure text.

---

### Task 9: The sweep

**Files:** `docs/design/DEVIATIONS.md`, `app/src/index.css` and `app/src/theme/tokens.css` (comments), `ROADMAP.md`

**This is a real task, not a formality** — recurring failure 9 exists because DEVIATIONS documents *current state* and has twice described deleted code.

- [ ] **Step 1: The comment census.** `grep -rn "judge-faster\|judge-slower" src --include='*.css'` returns **12 prose hits across `index.css` and `tokens.css`** at `1f77211d` (measured by applying Task 2's blocks and re-running it). Every one names a token that no longer exists. Rewrite each onto `--judge-red`/`--judge-blue`, carrying the contrast measurements and the "blue for faster, red for slower" history with them.

- [ ] **Step 2: DEVIATIONS row 138.** It reads, verbatim: *"BLUE for faster than target, RED for slower, from dedicated `--judge-faster` (#1d4e89) / `--judge-slower` (#962718) tokens … and the CSS hooks are `.timer-card-actual-faster/-slower`"*. Every noun in that sentence changes. It also says the SPM half *"needed no code — the class suffix IS the `Judgement` value … the request is satisfied structurally rather than by a convention someone maintains."* That is now false: there IS a per-metric branch, deliberately, because a rower may want them different. Rewrite the row to current state.

- [ ] **Step 3: DEVIATIONS row 139.** It glosses the split hero as carrying no unit because *"judged colour alone says what it is"*. **With both pace slots OFF that is false** — the hero has neither unit nor colour. It is still readable (the target sits beneath it), so this is a reconciliation, not a design reopening. Say so in the row.

- [ ] **Step 4: `ROADMAP.md`.** Tick Phase JC's PR row. File anything found during implementation that has a life after merge — at the moment it was found, not in the PR body (recurring failure 14).

- [ ] **Step 5: Final gates.** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`, `pnpm screenshots`, `pnpm dist:grep`. Per-file coverage for every file the branch touched, reported as numbers.

- [ ] **Step 6: Commit.**

---

## Self-review

**Spec coverage.** Every invariant has a task: I-1/I-3 (T3, T8), I-2 (T1), I-4 (T2), I-5 (T3's summary assertions), I-6 (T1, T7), I-7 (T2, T3), I-8 (T5), I-9 (T1), I-10 (T1). The spec's nine-item PR shape maps one-to-one onto T1-T9. Gate 0's three build-changing rulings are carried: door order (T7), legend deletion (T5), comfort settings excluded (nowhere, deliberately).

**Type consistency.** `JudgeColor` / `JudgeColors` / `JUDGE_COLOR_DEFAULTS` / `JUDGE_SLOT_PROPERTIES` / `loadJudgeColors` / `saveJudgeColors` / `applyJudgeColors` are used with those exact spellings in T1, T4 and T7. The four class names are identical in T2, T3, T4 and T8. `metric: "pace" | "spm"` appears in T3 only.

**Known gap, stated rather than hidden.** No task proves the feature on real iOS. The `var()`-indirection evidence is the CSS spec plus a shipped in-repo instance (`--ink-1: var(--ink)`), not a device observation. If that matters, it is a walk, and a walk needs its own PM readiness pass.
