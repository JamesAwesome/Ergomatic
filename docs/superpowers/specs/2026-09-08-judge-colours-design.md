# The rower chooses what red and blue mean, or turns them off

**Phase JC.** Status: spec. Shape approved by James 2026-09-07 (per-slot,
both surfaces, device-local, SETTINGS subpage; FASTER/SLOWER wording; OFF
renders plain ink). TRIAD — it adds a stored shape — so this spec takes a
full antagonist pass and its PR takes a PM final gate. It also changes
user-visible copy and layout, so it takes a **Gate 0**: James approves the
rendered screen and before/after captures before any implementation task
starts.

## What and why

Ergomatic paints a judged number blue when it beats its target and red when
it misses. That pairing was a tester's request in 2026-08-13 and has been
hardcoded ever since — one blue token, one red token, no way to change or
silence them.

Two rowers have two reasons to want it different. Red-on-a-number reads as
an alarm to some people and as useful information to others, and a rower
who wants the split coloured may not want the stroke rate coloured at all.
There is nothing to argue about here: it is a preference, and preferences
belong to the person.

So: four slots — pace faster, pace slower, SPM faster, SPM slower — each
independently **RED**, **BLUE** or **OFF**, on a new SETTINGS screen behind
a door in You. Defaults are exactly today's appearance, so a rower who
never opens the screen sees no change at all.

## What the rower gets

```
SETTINGS  ›  COLORS

PACE
  FASTER   (a lower split)     [ RED ] [ BLUE ] [ OFF ]
  SLOWER   (a higher split)    [ RED ] [ BLUE ] [ OFF ]

SPM
  FASTER   (a higher rate)     [ RED ] [ BLUE ] [ OFF ]
  SLOWER   (a lower rate)      [ RED ] [ BLUE ] [ OFF ]
```

**FASTER/SLOWER, not OVER/UNDER** (James's ruling at the design gate). For
pace and rate, "over" means opposite things — a higher split is slower, a
higher rate is faster — so an OVER/UNDER screen would ask the rower to hold
an inversion in their head and would silently flip one metric's defaults.
FASTER/SLOWER matches `domain/judge.ts`'s own `Judgement` union, which is
the union both metrics already resolve to (`index.css`, the
`timer-card-actual-*` comment block: "a faster split and a higher rate are
both `faster`, which is exactly the direction rule that file exists to
hold"). Each row carries its parenthetical so the screen never relies on
the reader knowing that.

Defaults: `faster: blue`, `slower: red`, both metrics — today's values.

## The stored shape

**Spelling, so nobody "fixes" it in review.** This repo splits: code
identifiers and user-facing copy are American (`colorClass`, `barColor`,
`METERS`), prose in comments and specs is British (`colour`). Both halves of
that split are followed here deliberately.

Device-local, following `today/todayFilters.ts`, which is this repo's
established localStorage-store pattern (undated key, whole-object read,
`catch` to defaults, boolean-returning save).

**The block below is a SIGNATURE SKETCH, not prescribed code** — it is
declaration-only and would not compile as written. The implementation plan
owes the real blocks and their paste-test; nothing here has had one.

```ts
/** src/you/judgeColors.ts — signatures only */
export const JUDGE_COLORS_KEY = "ergomatic.judgeColors";

export type JudgeColor = "red" | "blue" | "off";

export interface JudgeColors {
  paceFaster: JudgeColor;
  paceSlower: JudgeColor;
  spmFaster: JudgeColor;
  spmSlower: JudgeColor;
}

export const JUDGE_COLOR_DEFAULTS: JudgeColors = {
  paceFaster: "blue",
  paceSlower: "red",
  spmFaster: "blue",
  spmSlower: "red",
};

export function loadJudgeColors(): JudgeColors;
export function saveJudgeColors(next: JudgeColors): boolean;
export function applyJudgeColors(colours: JudgeColors): void;
```

**Every read is total.** A missing key, unparseable JSON, a non-object, a
missing field, or a field holding anything outside the three-member union
resolves **per field** to that field's default — not "throw away the whole
object". A rower who has set three slots and whose fourth is corrupt keeps
their three. `loadJudgeColors` never throws and never returns a partial.

**Lifetime.** One value, device-scoped, no account key, no date. It
survives reload, relaunch and sign-out, and it is deliberately NOT cleared
on sign-out: unlike `concept2Seen` it says nothing about an account, only
about the eyes looking at the screen. Nothing else writes it; there is no
migration and no server field.

**`saveJudgeColors` returns a boolean and the caller branches on it**
(recurring failure 25). A failed write means the choice will not survive a
reload, which is a different outcome from a successful one, so the settings
screen says so rather than swallowing it. The applied colours still take
effect for the session — apply and save are separate steps, and a storage
failure must not also make the screen appear inert.

## How the colour reaches the pixels

Four **resolved** custom properties on the root, declared in
`theme/tokens.css` with today's values, overridden at runtime by inline
style on `document.documentElement`:

```css
/* the only two inks a rower may choose, plus the OFF ink */
--judge-red: #962718;
--judge-blue: #1d4e89;

/* what each slot currently resolves to */
--judge-pace-faster: var(--judge-blue);
--judge-pace-slower: var(--judge-red);
--judge-spm-faster: var(--judge-blue);
--judge-spm-slower: var(--judge-red);
```

`applyJudgeColors` writes the four overrides with
`documentElement.style.setProperty`, mapping `red → var(--judge-red)`,
`blue → var(--judge-blue)`, `off → var(--ink)`.

It is called from exactly two places: **`main.tsx` at boot**, before
`createRoot`, so no judged surface can paint a default it is about to
replace; and **the settings screen on every change**, so the choice is live
without a reload. No React context, no prop drilling, no re-render of any
judged surface — the consumers stay pure CSS and do not learn that a
preference exists.

## The structural change: one class pair becomes two

Today a single class carries the tint for **both** metrics —
`timer-card-actual-{judgement}` — and `index.css` documents that as
deliberate: *"ONE PAIR SERVES BOTH JUDGED METRICS... There is no per-metric
colour branch to keep in step, here or in either pane."* Per-slot control
retires that sentence. It is the one place this spec makes the codebase
structurally more complicated, and it is unavoidable: a rower who wants
pace coloured and SPM off cannot be served by a class that cannot tell them
apart.

The class suffix stays the `Judgement` union member (so a renamed member
still fails to compile rather than going silent), and gains a metric:

| new class | token |
| --- | --- |
| `.judge-pace-faster` | `var(--judge-pace-faster)` |
| `.judge-pace-slower` | `var(--judge-pace-slower)` |
| `.judge-spm-faster` | `var(--judge-spm-faster)` |
| `.judge-spm-slower` | `var(--judge-spm-slower)` |

`.timer-card-actual-stale` (grey `--ink-3`) and the deliberately-empty
`-within` case are **untouched**: stale is not a judgement colour, and
on-target is plain ink by design. `judgedClass`/`cellClass` keep emitting
`timer-card-actual-stale` for the stale member.

**Six call sites, each of which already knows its own metric** — no new
data has to be threaded through `surfaceModel`. Counted, not eyeballed (run
in `app/`, worktree `.claude/worktrees/jc` at `08f6e99a`):

```
$ grep -rn "judgedClass(\|cellClass(\|judgedColorClass(" \
    src/workout/connected/PaneLive.tsx \
    src/workout/connected/PaneGrid.tsx \
    src/session/PostWorkoutSummary.tsx \
  | grep -v "^[^:]*:[0-9]*:function " | wc -l
6
```


| file | site | metric |
| --- | --- | --- |
| `connected/PaneLive.tsx` | `judgedClass(..., model.pace)` (split hero) | pace |
| `connected/PaneLive.tsx` | `judgedClass(..., model.avg)` (AVG) | pace |
| `connected/PaneLive.tsx` | `judgedClass(..., model.rate)` (rate hero) | spm |
| `connected/PaneGrid.tsx` | `cellClass("connected-grid-pace", row.pace)` | pace |
| `connected/PaneGrid.tsx` | `cellClass("connected-grid-spm", row.spm)` | spm |
| `session/PostWorkoutSummary.tsx` | `judgedColorClass(row.judged?.direction)` | pace |

`judgedClass` and `cellClass` take a `metric: "pace" | "spm"` parameter;
`judgedColorClass` is pace-only and hardcodes it. The summary's SPM cell is
**not** tinted today and this spec does not tint it — so the two SPM slots
reach the connected pane only. The screen must not imply otherwise; see
"Accepted consequences".

## `--judge-slower` is doing two jobs and must be split

`.connected-lost` — the red LOST THE MONITOR banner — paints its
**background** from `--judge-slower`. That is an alarm, not a judged
number, and it must never follow the preference: a rower who sets every
slot to blue would otherwise get a blue alarm banner.

It repoints to the raw `--judge-red`. This is the whole reason the palette
is split into raw inks (`--judge-red`, `--judge-blue`) and resolved slots
(`--judge-pace-*`, `--judge-spm-*`) rather than just overriding
`--judge-faster`/`--judge-slower` in place, which would have been fewer
lines and quietly wrong.

`--judge-faster` and `--judge-slower` are then **retired**: after this
change they have no consumers, and leaving them would give the next author
two plausible tokens to reach for. Their contrast measurements and the
"blue for faster, red for slower" history move onto `--judge-blue` /
`--judge-red`.

`ConnectedSurface.test.tsx` asserts on the literal strings
`var(--judge-faster)` / `var(--judge-slower)`; those move with the tokens.
Cited by command rather than by line, since line numbers drift:

```
$ grep -rn "var(--judge-" src/workout/ConnectedSurface.test.tsx | wc -l
4
```

(run in `app/`, worktree `.claude/worktrees/jc` at `08f6e99a`). Two are the
tint assertions, two are `.connected-lost`'s `background`. The invariant one of
them pins — *"NOTHING ELSE on the connected surface may take a filled red
ground"* — still holds and is still worth pinning: every judged tint is a
`color`, never a `background`, and the summary's bar (`background:
currentColor`) is not on the connected surface.

## What OFF renders

Plain `--ink` for the value and, in the summary, for the `±` deviation
label.

The summary's deviation bar is `background: currentColor`, so it inherits
the same ink automatically. **The bar still renders.** An OFF row is *not*
an on-target row: an on-target row deliberately renders no bar, no tick and
no `±` at all (`PostWorkoutSummary.tsx`'s own comment), and collapsing OFF
onto that would delete the deviation number the rower asked to keep. OFF
removes a colour signal; it does not remove information. Direction is still
carried by the bar's side of the centre tick and by the `±` sign.

`--ink` on `--surface` is **17.11:1** and on `--page` **15.41:1**
(computed, not eyeballed) — far past WCAG 1.4.11's 3:1 non-text floor for
the bar and 4.5:1 for the label.

## The screen

A fourth quiet mono row in You's door group, opening `/you/settings`.

**Order: SETTINGS, BASELINES, CONCEPT2, DIAGNOSTICS.** The existing three
are ordered by ruling 7 (CONCEPT2 above DIAGNOSTICS, DIAGNOSTICS last) and
by "BASELINES on top because it is the only one a rower reads FOR its
value". SETTINGS is not read for its value either, so it goes above
BASELINES rather than between it and CONCEPT2 — but this is a Gate 0
question, not a spec decision, and the gate presents the alternative.

The route sits with the other `/you/*` routes in `shell/AppRoutes.tsx` and
carries the same `state={{ from: "/you" }}` origin idiom, so its BackLink
returns to You.

**The three-way control reuses `onboarding/OptionGroup.tsx`** — the house
roving-tabindex radiogroup (one tab stop, arrows move focus and selection
together, wrapping at both ends), which its own header comment already
invokes recurring failure 8 about. It is generic over the value union
already, so `OptionGroup<JudgeColor>` needs no new keyboard code. It
hardcodes `onb-options`/`onb-option` class names; this spec adds optional
`className`/`optionClassName` props **defaulting to those exact strings**,
so every onboarding render is byte-identical and the change is additive.
The onboarding-only `value === null` tab-stop branch is unreachable here
(a slot always holds a value) and stays as it is.

Each option renders its own ink as a swatch plus its word, so the choice is
not itself colour-only (WCAG 1.4.1): `● RED`, `● BLUE`, `— OFF`.

**A live preview sits under each group** — one specimen number in that
group's current colours, so the rower sees the choice without going rowing
to find out. Its exact form is a Gate 0 question.

## Accepted consequences

Stated so the gate can accept them rather than discover them.

1. **A rower may set both slots of a metric to the same colour**, which
   James asked for explicitly ("use all red or all blue"). On the summary,
   direction survives in the bar side and the `±` sign. On the connected
   pane, colour is then carrying no direction — but the target is on screen
   beside the actual, which is where direction is actually read from. This
   is a choice the rower made, not a defect.
2. **Red may come to mean something good.** A rower who sets `spmFaster:
   red` gets red for a rate that is beating target, on the same surface
   where the LOST THE MONITOR banner is red. The banner is a filled ground
   and every judged tint is text, so they do not collide visually, but the
   association weakens. Accepted: that is what choosing means.
3. **The two SPM slots do not reach the post-workout summary**, because the
   summary has never tinted its SPM cell. The screen groups by metric, not
   by surface, so nothing on it claims otherwise — but a rower could set
   `spmSlower: red` and see no change on a summary. Gate 0 decides whether
   this needs a word on the screen or nothing at all. Tinting the summary's
   SPM cell is explicitly out of scope (below).
4. **No dark theme interaction.** The repo has no `prefers-color-scheme` or
   `data-theme` block at all (`grep` over `tokens.css` and `index.css`
   returns nothing), so there is one palette to measure.

## Invariants

1. **I-1** A rower who never opens the screen sees exactly today's colours,
   on every judged surface.
2. **I-2** Every field of a stored value resolves independently; corruption
   of one slot never disturbs another.
3. **I-3** The four resolved tokens are the ONLY thing a preference
   changes. No alarm, status, badge or non-judged surface moves.
4. **I-4** `.connected-lost` is red at every setting, including all-blue.
5. **I-5** OFF renders `--ink` and keeps the bar and the `±` label; it never
   turns a judged row into an on-target row.
6. **I-6** A failed save leaves the screen honest: the colours apply, and
   the rower is told the choice will not survive a reload.
7. **I-7** `stale` and `on-target` are untouched by every setting.

## How each invariant is gated

**The layer that matters is e2e, and this is the load-bearing sentence of
this section.** Vitest mocks every `.css` import to an empty string for
this project (`TimerTargets.test.tsx`'s header records the empirical
check), so **no client test can prove a colour actually lands on a pixel.**
A jsdom test can prove the class name and it can prove the root property —
it cannot prove the two meet. Recurring failure 24's question ("which test
STARTS upstream of the producer?") has exactly one answer here, and it is
an e2e test.

- **I-1, I-3, I-7** — client: the class emitted by each of the six sites,
  per metric and per judgement, against a realistic model. Plus a CSS-source
  test (the `scopedRuleBodies` idiom `tokens.test.ts` and
  `ConnectedSurface.test.tsx` already use) asserting each of the four new
  rules resolves to its own token and that `-stale`/`-within` are unchanged.
- **I-2** — unit: a table over missing key, `"not json"`, `null`, `[]`,
  `{}`, one-field-only, and each field set to `"green"`, `""`, `0`,
  `undefined`. Each asserts the WHOLE returned object, so a field bleeding
  into another fails.
- **I-4** — CSS-source: `.connected-lost`'s background is `--judge-red` and
  no `--judge-pace-*`/`--judge-spm-*` token appears in a `background`
  declaration anywhere in `index.css`.
- **I-5** — client on the summary: an OFF pace slot still renders
  `.summary-row-bar` and a non-empty `.summary-row-dev`; an on-target row
  still renders neither.
- **I-6** — client: `saveJudgeColors` stubbed to `false`, assert the
  screen's message AND that `applyJudgeColors` still ran.
- **THE SEAM (I-1 + I-3 end to end)** — **e2e, one test, starting upstream
  of the producer**: open `/you/settings`, set PACE SLOWER to BLUE, navigate
  to a seeded summary with a slower-than-target row, and read
  `getComputedStyle(...).color` on the pace cell — asserting the literal
  `rgb(29, 78, 137)`, never a value derived from the token, so retuning the
  token cannot retune the test (recurring failure 21's first smell). A
  second leg reloads the page first, proving the boot-time apply in
  `main.tsx` and not only the live one.

**Mutations, named in advance** (recurring failure 21 — every new assertion
gets a probe that makes it fail, and the report states what was mutated and
what the failure said):

- Delete the `metric` argument at `PaneGrid`'s SPM site so it emits the pace
  class; the per-metric client test must go red.
- Point `.judge-pace-slower` at `--judge-red` unconditionally; the e2e seam
  test must go red.
- Remove the `applyJudgeColors` call from `main.tsx`; the e2e reload leg
  must go red and the live leg must stay green — proving the two legs test
  different things.
- Make `loadJudgeColors` return `JUDGE_COLOR_DEFAULTS` on any malformed
  field rather than per field; the I-2 one-field-only case must go red.

**The e2e mutations must COMPILE** (recurring failure 12's corollary, PR
#344): swap a call for another that keeps every import used, and confirm
`pnpm build` exits 0 inside `docker compose up --build` before reading any
Playwright result — a build that fails leaves the previous image serving
unmutated code and the probe reads as green.

## Contrast, computed

| ink | on `--surface` #fffdf7 | on `--page` #f4f1e8 |
| --- | --- | --- |
| `--judge-blue` #1d4e89 | 8.25:1 | 7.43:1 |
| `--judge-red` #962718 | 7.94:1 | 7.15:1 |
| `--ink` #1b1a17 (OFF) | 17.11:1 | 15.41:1 |
| `--ink-3` #57544c (stale) | 7.43:1 | 6.69:1 |

Reproduced by this command, not by eye (2026-09-08):

```
node -e 'const l=c=>(c/=255)<=0.03928?c/12.92:((c+0.055)/1.055)**2.4,\
L=h=>{const n=parseInt(h.slice(1),16);return 0.2126*l(n>>16&255)+\
0.7152*l(n>>8&255)+0.0722*l(n&255)},r=(a,b)=>((Math.max(L(a),L(b))+0.05)/\
(Math.min(L(a),L(b))+0.05)).toFixed(2);for(const[n,c]of[["blue","#1d4e89"],\
["red","#962718"],["ink","#1b1a17"],["ink-3","#57544c"]])\
console.log(n,r(c,"#fffdf7"),r(c,"#f4f1e8"))'
```

The first two rows reproduce the numbers already recorded in `tokens.css`
and `index.css`, which is the check that this method matches the repo's. Every
one of the 81 reachable slot combinations is drawn from this table, so no
combination needs its own measurement.

## What this deliberately does not do

- **No third colour, no colour picker.** Red and blue only, per James.
- **No tinting of the summary's SPM cell.** It is untinted today; adding it
  is a design change with its own gate, not a side effect of a settings
  screen.
- **No server field and no cross-device sync.** Device-local, per the
  design gate.
- **It does not absorb the two queued comfort settings.** `ROADMAP.md`
  parks *"pre-workout countdown length 0-60 s"* and *"pace tolerance
  0-3 s"* with the trigger *"the next You-screen PR — they are cheap and
  they ride it"*, and this is that PR. **Recommending they do not ride it:**
  pace tolerance changes what a judged number MEANS, which is the triad's
  first clause, and it would land a second independent risk model in one
  review — the exact case CLAUDE.md's grouping rule names as the split
  condition. Their ROADMAP trigger is retargeted to the second SETTINGS PR
  rather than struck, so the row does not go stale. **This is James's call
  at Gate 0, not the spec's.**
- **No accent-colour setting.** Also parked in ROADMAP, also not this.

## PR shape

One PR. It carries a stored shape, so under the grouping rule it would
normally land alone — and it does: everything in it serves the one
preference, and a reviewer holds one risk model.

Task order, failing test first at each step:

1. `you/judgeColors.ts` — the store, the defaults, the total read, the
   boolean save, `applyJudgeColors`. Unit tests (I-2).
2. Tokens: raw palette, four resolved slots, `.connected-lost` repointed,
   `--judge-faster`/`--judge-slower` retired, four new rules. CSS-source
   tests (I-4, I-7); `ConnectedSurface.test.tsx`'s four literals moved.
3. The six call sites take a metric. Client tests (I-1, I-3).
4. `main.tsx` boot apply.
5. `/you/settings` + the SETTINGS door row + `OptionGroup`'s optional class
   props. Client tests (I-6) and the keyboard tests copied from
   `OptionGroup`'s own suite.
6. The e2e seam test, both legs, with the four named mutations run and
   their failure messages recorded.
7. `pnpm e2e` and `pnpm screenshots` (this changes a screen's layout —
   recurring failure 1), per-file coverage read for every file touched
   (recurring failure 2), and `docs/design/DEVIATIONS.md` reconciled: the
   "No SETTINGS section" note in `You.tsx` and DEVIATIONS' matching row
   both describe a screen that will no longer be absent (recurring
   failure 9).

## Gate 0 — what James approves before task 1

Rendered, at real proportions, in both orientations, with every colour
pairing's ratio stated as a number:

1. The SETTINGS screen itself, with the four groups and the live preview.
2. The You door group with SETTINGS in it, against today's three-row group.
3. A connected pane, landscape and portrait, at the default setting and at
   one non-default (`spmFaster: off`), side by side.
4. A post-workout summary with a slower row, default versus `paceSlower:
   off`, showing that the bar and the `±` survive.
5. The door-row ORDER question (SETTINGS above BASELINES, or below).
6. The consequence-3 question: does the screen need a word about SPM not
   reaching the summary?
7. **The copy itself.** "JUDGEMENT COLOURS" was the working title and is
   developer language — `Judgement` is a `domain/judge.ts` union member, not
   a word a rower uses. The gate presents the section header, the two group
   headers, and the three option words as rendered text, and James picks.
