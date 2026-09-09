# The rower chooses what red and blue mean, or turns them off

**Phase JC.** Status: **GATE 0 CLOSED 2026-09-08 — cleared to implement.**
Revision 3 (folded the anchor antagonist pass, then Gate 0's nine rulings). Shape approved by James 2026-09-07: per-slot, both surfaces,
device-local, SETTINGS subpage; FASTER/SLOWER wording; OFF renders plain
ink. TRIAD — it adds a stored shape — so its PR takes a PM final gate. It
changes user-visible copy and layout, so it takes a **Gate 0**: James
approves the rendered screen and before/after captures before any
implementation task starts.

All measurements in this document were run in
`.claude/worktrees/jc` at `9089c6be` (base: main `a476cbc6`), in `app/`
unless a command says otherwise.

## What and why

Ergomatic paints a judged number blue when it beats its target and red when
it misses. That pairing was a tester's request in August 2026 and has been
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
  FASTER   (a lower split)     ( ) RED   (•) BLUE   ( ) OFF
  SLOWER   (a higher split)    (•) RED   ( ) BLUE   ( ) OFF

SPM
  FASTER   (a higher rate)     ( ) RED   (•) BLUE   ( ) OFF
  SLOWER   (a lower rate)      (•) RED   ( ) BLUE   ( ) OFF
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

The screen's exact copy — the section header, the group headers and the
three option words — is a Gate 0 decision, not this spec's. "JUDGEMENT
COLOURS" was the working title and is developer language: `Judgement` is a
code union member, not a word a rower uses.

## The blast radius, measured

Revision 1 described this change as "one class pair becomes two". That was
false, and the antagonist killed it: there are **two independent judged
class pairs**, and the second one is on the summary screen. The honest
census, with the commands that produce it (all run in `app/`, at
`9089c6be`):

```
$ grep -rn "timer-card-actual-" src e2e | wc -l                        # 85, 24 files
$ grep -rn "summary-row-faster\|summary-row-slower" src e2e | wc -l    # 29,  5 files
$ grep -rn "var(--judge-faster)\|var(--judge-slower)" src e2e | wc -l  #  9,  2 files
$ grep -rln "timer-card-actual-" e2e/fixtures | wc -l                  # 12 fixtures
$ grep -rn "timer-card-actual-\|summary-row-faster" ../domain ../server # 0
```

What that reveals, none of which revision 1 named:

- **`.summary-row-faster` / `.summary-row-slower`** (`index.css`, emitted by
  `PostWorkoutSummary.tsx`'s `judgedColorClass`) is a second rule pair
  consuming the same two tokens. Retiring `--judge-faster`/`--judge-slower`
  means **deleting two CSS rules**, not only adding four (recurring
  failure 5).
- **`e2e/design.spec.ts` carries a judged-colour harness**:
  `expectedJudgedRgb(judgement)` and `judgedColor(...)`, the latter reading
  `classList.find(c => c.startsWith("timer-card-actual-"))`. Both become
  metric-aware or the whole harness stops discriminating.
- **12 committed HTML fixtures** under `e2e/fixtures/` carry
  `timer-card-actual-*`. They are `toMatchFileSnapshot` output of
  `ConnectedSurface.screens.test.tsx`, so they regenerate loudly rather
  than rotting silently — but the regeneration is a step, and it gets one.
- **Nothing in `app/domain/` or `app/server/`.** The change is client-only.

## The legend on the summary screen says the colours out loud

`PostWorkoutSummary.tsx` renders, hardcoded:

```tsx
<p className="summary-legend">← FASTER (BLUE) · SLOWER (RED) →</p>
```

pinned as copy by `e2e/design.spec.ts` (`toHaveText("← FASTER (BLUE) ·
SLOWER (RED) →")`).

It sits on the same surface the two pace slots repaint. A rower who swaps
the pace slots gets a legend that is flatly false; a rower who sets either
pace slot to OFF gets a legend naming a colour that is not on the screen.
**Eight of the nine reachable pace configurations make it wrong.**

This is a copy decision and it belongs to James, at Gate 0, with both costs
measured rather than asserted (recurring failure 30):

- **(a) Delete it.** Cost, counted: one JSX line, one `.summary-legend` CSS
  rule, one e2e assertion. The house has already ruled this way once, on
  the neighbouring surface — `TraceChart.tsx`, verbatim: *"'Band' stays
  true regardless of geometry, and carries no colour word on purpose —
  `#97692a` reads amber in the PR body and bronze on the actual capture;
  naming a colour here would just be a second thing to get wrong later."*
  That comment cites this very legend as its idiom and then declines to
  copy the colour word.
- **(b) Derive it from the four slots.** Cost, **untested**: the legend has
  to name whatever the two pace slots currently are, drop a half when a
  slot is OFF, and not say two things when both slots are the same colour.
  Nine pace configurations, each needing copy. Nobody has written or
  rendered any of them; this bullet is an estimate and is marked as one.
- **(c) Leave it.** Cost: the app tells the rower something false on eight
  of nine settings. Named for completeness, not recommended.

**RULED (a) — DELETE, James 2026-09-08.** Options (b) and (c) are closed and
are kept above only so the reasoning is legible; neither is live work. The
deletion is invariant I-8 and lands in task 6.

## Spelling, so nobody "fixes" it in review

This repo splits: code identifiers and user-facing copy are American
(`colorClass`, `barColor`, `METERS`), prose in comments and specs is
British (`colour`). Both halves are followed here deliberately.

## The stored shape

Device-local, following `today/todayFilters.ts`'s **wrapper** discipline —
specifically `loadTodayFilters` / `saveTodayFilters`: a bare `try`/`catch`
around the read, a boolean-returning save.

**Its parse discipline is deliberately NOT followed, and the difference
matters** (recurring failure 16, second corollary — a citation is only as
load-bearing as the line quoted). `todayFilters.ts`'s own comment reads:
*"Strict per-set check … a present-but-wrong-shaped value fails the SET."*
That file is total per KEY and strict per FIELD. This store is total per
FIELD, which is a departure, and it is a departure on purpose: a rower who
has set three slots and whose fourth is corrupt keeps their three.

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
export function applyJudgeColors(colors: JudgeColors): void;
```

**Every read is total, per field.** A missing key, unparseable JSON, a
non-object, a missing field, or a field holding anything outside the
three-member union resolves **per field** to that field's default.
`loadJudgeColors` never throws and never returns a partial.

**`saveJudgeColors` returns a boolean and the caller branches on it**
(recurring failure 25). A failed write means the choice will not survive a
reload, which is a different outcome from a successful one, so the settings
screen says so rather than swallowing it. The applied colours still take
effect for the session — apply and save are separate steps, and a storage
failure must not also make the screen appear inert.

### Lifetime table (recurring failure 27)

| state | mint site | clear sites | reload | relaunch | sign-out | account switch | 2nd rower, same phone |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `localStorage["ergomatic.judgeColors"]` | first `saveJudgeColors` from `/you/settings` | **none** | survives | survives | survives | survives | **inherited** |
| the four root inline properties | `main.tsx` module scope, pre-`createRoot`; and every settings change | never removed, overwritten in place | re-minted from storage | re-minted | unaffected | unaffected | n/a |
| in-memory `JudgeColors` on the settings screen | screen mount | unmount | n/a | n/a | n/a | n/a | n/a |

Two rows of that table are decisions rather than mechanics, so they are
written as invariants rather than left as absences:

- **There is deliberately no clear path** — not sign-out, not a Reset
  button, not an account switch. A rower who wants today's appearance back
  sets four slots by hand. Defensible for four values on one screen; stated
  so it is a choice and not an oversight.
- **The key is not account-scoped, and this is the row to put in front of
  James.** `concept2Seen` is keyed `ergomatic.concept2Seen.<accountId>` and
  is cleared on the sign-out path. `judgeColors` is keyed on nothing, so a
  second rower on the same phone inherits the first rower's choices
  silently. The argument for that is real — the preference is about the
  eyes looking at the screen, not about an account — but it is
  re-litigated the day the device account switcher lands, which `ROADMAP.md`
  parks with the trigger *"a second rower actually shares your phone at the
  erg"*: the exact scenario. Gate 0 confirms it.

## How the colour reaches the pixels

Four **resolved** custom properties on the root, declared in
`theme/tokens.css` with today's values, overridden at runtime by inline
style on `document.documentElement`:

```css
/* the only two inks a rower may choose */
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

**That a custom property may hold a `var()` reference and resolve through
it is PRIMARY, not assumed.** CSS Custom Properties for Cascading Variables
Level 1 §2.3, verbatim: *"Custom properties are left almost entirely
unevaluated, except that they allow and evaluate the var() function in
their value."* The same section: *"If there is a cycle in the dependency
graph, all the custom properties in the cycle are invalid at computed-value
time"* — this design has no cycle, and that is the failure mode if one is
ever introduced. **The evidence that closes the WKWebView gap is neither
the spec nor a headless probe: `theme/tokens.css` already ships exactly
this indirection** (`--ink-1: var(--ink)`, `--type-tr: var(--ink)`) on
James's phone today.

`applyJudgeColors` is called from exactly two places: **`main.tsx` at
boot**, at module scope before `createRoot`, so no judged surface can paint
a default it is about to replace; and **the settings screen on every
change**, so the choice is live without a reload. No React context, no prop
drilling, no re-render of any judged surface — the consumers stay pure CSS
and never learn that a preference exists. StrictMode's double-invoke is
irrelevant: the call is outside any component, beside the existing
`void restoreKeyboardAccessoryBar()`.

Nothing else in the app writes root inline style
(`grep -rn "documentElement\|setProperty\|removeProperty\|cssText" src`
returns one hit, `HistoryList.tsx`, which *reads* `scrollHeight`), so the
overrides cannot be wiped by a competing writer.

### The boot read is the app's only top-level storage read, and it must not be able to white-screen

`applyJudgeColors` runs before `createRoot`. If `loadJudgeColors` throws
there, **the app never mounts** — a white screen, not a lost preference.
Every other localStorage reader in this repo runs inside a component, where
a throw costs one screen.

The repo has already researched this exact reachability, and this spec
inherits its prescription rather than re-deriving it.
`docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`,
verbatim: *"**On the web arm it stays fully reachable** (desktop Safari
'Block all cookies', Chrome/Firefox site-data blocking, any opaque
embedding)"* — and its binding instruction, verbatim: *"**Write them as
bare `catch`, never `catch (e) { if (e.name === "SecurityError") }`** — the
`nullptr` paths above make detached-document access a `TypeError` that a
name-filtered catch would let escape."*

So: `loadJudgeColors` uses a **bare catch**, and I-9 pins that a storage
failure at boot yields defaults and never blocks `createRoot`. Note that
`vitest.config.ts` excludes `src/main.tsx` from coverage entirely, so the
boot producer has no client instrument at all — the e2e reload leg is its
only gate, which is why that leg is not optional.

## The structural change: two class pairs become four classes

Today two class pairs carry the tint, and one of them cannot tell the
metrics apart. `index.css` documents that as deliberate: *"ONE PAIR SERVES
BOTH JUDGED METRICS… There is no per-metric colour branch to keep in step,
here or in either pane."* Per-slot control retires that sentence. It is the
one place this spec makes the codebase structurally more complicated, and
it is unavoidable: a rower who wants pace coloured and SPM off cannot be
served by a class that cannot tell them apart.

The class suffix stays the `Judgement` union member (so a renamed member
still fails to compile rather than going silent), and gains a metric:

| new class | token | replaces |
| --- | --- | --- |
| `.judge-pace-faster` | `var(--judge-pace-faster)` | `.timer-card-actual-faster`, `.summary-row-faster` |
| `.judge-pace-slower` | `var(--judge-pace-slower)` | `.timer-card-actual-slower`, `.summary-row-slower` |
| `.judge-spm-faster` | `var(--judge-spm-faster)` | `.timer-card-actual-faster` |
| `.judge-spm-slower` | `var(--judge-spm-slower)` | `.timer-card-actual-slower` |

**All four `Judgement` members get a written destination**, so the rename
cannot ship a mixed-prefix emitter nobody documented:

| member | emitted class | why |
| --- | --- | --- |
| `faster` | `judge-{metric}-faster` | the preference applies |
| `slower` | `judge-{metric}-slower` | the preference applies |
| `stale` | `timer-card-actual-stale` — **unchanged** | grey `--ink-3`; not a judgement colour, not preference-bearing |
| `within` | `timer-card-actual-within` — **unchanged** | declares nothing today, and on-target is plain ink by design |

**Six call sites, each of which already knows its own metric** — no new
data threads through `surfaceModel`. Counted, not eyeballed:

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
reach the connected pane only.

## `--judge-slower` is doing two jobs and must be split

`.connected-lost` — the red LOST THE MONITOR banner — paints its
**background** from `--judge-slower`. That is an alarm, not a judged
number, and it must never follow the preference: a rower who sets every
slot to blue would otherwise get a blue alarm banner.

It repoints to the raw `--judge-red`. This is the whole reason the palette
is split into raw inks and resolved slots rather than just overriding
`--judge-faster`/`--judge-slower` in place, which would have been fewer
lines and quietly wrong. **Confirmed by probe, not by reasoning:**
overriding the raw ink turns the banner blue immediately; overriding only
the resolved slots leaves it `rgb(150, 39, 24)` through every setting.

`--judge-faster` and `--judge-slower` are then **retired**: with both class
pairs migrated they have no consumers, and leaving them would give the next
author two plausible tokens to reach for. Their contrast measurements and
the "blue for faster, red for slower" history move onto `--judge-blue` /
`--judge-red`.

`ConnectedSurface.test.tsx` asserts on the literal strings, cited by
command rather than by line since line numbers drift:

```
$ grep -rn "var(--judge-" src/workout/ConnectedSurface.test.tsx | wc -l
4
```

Two are the tint assertions, two are `.connected-lost`'s `background`. The
invariant one of them pins — *"NOTHING ELSE on the connected surface may
take a filled red ground"* — still holds and is still worth pinning: every
judged tint is a `color`, never a `background`, and the summary's bar
(`background: currentColor`) is not on the connected surface.

## What OFF renders

Plain `--ink` for the value and, in the summary, for the `±` deviation
label.

The summary's deviation bar is `background: currentColor`, so it inherits
the same ink automatically. **The bar still renders.** An OFF row is *not*
an on-target row: an on-target row deliberately renders no bar, no tick and
no `±` at all, and collapsing OFF onto that would delete the deviation
number the rower asked to keep. OFF removes a colour signal; it does not
remove information.

## The screen

A fourth quiet mono row in You's door group, opening `/you/settings`. The
route sits with the other `/you/*` routes in `shell/AppRoutes.tsx` and
carries the same `state={{ from: "/you" }}` origin idiom, so its BackLink
returns to You.

**Order: BASELINES, CONCEPT2, SETTINGS, DIAGNOSTICS** (James, Gate 0,
2026-09-08: "put settings under concept 2 but above diagnostics"). The
spec's own suggestion — SETTINGS on top — was declined. The existing three
keep their ruling-7 relationship (CONCEPT2 above DIAGNOSTICS, DIAGNOSTICS
still You's last child), and BASELINES stays on top as the one door a rower
reads FOR its value.

**The group stays FLAT — no container** (James, 2026-09-08, taking the PM
verdict on his own follow-up question: should the doors collapse behind an
"Advanced" or "Settings" menu holding Concept2, colours and Diagnostics?).
Three reasons, all recorded in `pm-ledger.md`:

- **CONCEPT2 is a status surface, not a door.** `Concept2Row` renders
  `RECONNECT NEEDED` / `SEND FAILED` beside its label, from an account-level
  flag that `useConcept2Link.ts` says surfaces in exactly three places — *"the
  You row (`SEND FAILED`), the card's pill, and the screen's mode line; never
  by the send block"* — two of which already live behind `/you/concept2`.
  Nesting the row deletes the only ambient warning that a shipped feature
  broke.
- **Neither word survives the drawer.** "Advanced" is a warning and the
  colours preference is one this spec exists to encourage; "Settings" is
  dishonest about DIAGNOSTICS, where nothing is adjustable. The app also
  already ruled on the word at a Gate 0 — `Diagnostics.tsx`: *"Named
  DIAGNOSTICS (not 'advanced'/'debug') because that is the word the app
  already uses for this class of thing."*
- **The container would be built for work that may not happen**, and its
  membership would then be wrong.

**The day-two shape, recorded so it is not re-derived:** if the parked
countdown-length and pace-tolerance settings land, the flat group reaches six
rows and a container earns itself — but it holds **preferences only**, with
CONCEPT2 and DIAGNOSTICS still flat siblings. That is a different container
from the one asked about, and building this one first means unbuilding it.

**One consequence to note rather than design around:** `Concept2Row` renders
NOTHING unless a successful read has said `available: true` for the account,
so on an account without it SETTINGS sits directly beneath BASELINES. That is
the same collapse the group already does today and needs no special case.

### The three-way control, and its honest cost

Revision 1 said this reuses `onboarding/OptionGroup.tsx` — the house
roving-tabindex radiogroup (one tab stop, arrows move focus and selection
together, wrapping at both ends) — for the price of two optional class
props. **That was an unmeasured cost and it was wrong** (recurring failure
30, pointed at the road being taken rather than the one rejected). Two
things the antagonist established:

1. **`OptionGroup`'s `options` field is `{ value: V; label: string }`, and
   the button carries no `data-value`.** There is no way to paint a
   per-option swatch in that option's own ink. Reuse therefore needs
   `label: ReactNode` (or a data attribute for a CSS `::before`) — a third
   additive change, not the two claimed.
2. **`.onb-options` is `flex-direction: column, gap: 10px` and
   `.onb-option` is a full-width `min-height: 48px` row with a 1px ink
   border and a 2px accent checked state.** Reusing the defaults gives four
   groups of three stacked 48px rows — nothing like this spec's inline
   sketch. **A new CSS block and a re-authored checked-state affordance are
   owed**, and they get their own task and their own Gate 0 contrast rows.

Reuse is still right — the keyboard contract and its tests are the
expensive part and they transfer intact (recurring failure 8) — but it is
reuse plus a stylesheet, not reuse instead of one. `OptionGroup`'s
onboarding-only `value === null` tab-stop branch is unreachable here (a
slot always holds a value) and stays as it is; the two class props default
to `onb-options`/`onb-option` so every onboarding render stays
byte-identical.

Each option renders a swatch in its own ink **plus its word**, so the
choice is never colour-only (WCAG 1.4.1).

**A live preview sits under each group** — one specimen number in that
group's current colours, so the rower sees the choice without going rowing
to find out. Its exact form is a Gate 0 question.

## Accepted consequences

Stated so the gate can accept them rather than discover them.

1. **A rower may set both slots of a metric to the same colour**, which
   James asked for explicitly ("use all red or all blue"). Where direction
   survives, precisely — revision 1 asserted this too broadly and the
   antagonist killed it:
   - **Post-workout summary: survives.** There is a TARGET column, the bar
     sits on its own side of the centre tick, and the `±` carries a sign.
   - **Connected `PaneLive`: survives.** Both heroes render their target
     beside the actual.
   - **Connected `PaneGrid`: does NOT survive.** Its columns are fixed by
     the connected-redesign design spec §2B at
     `# · TIME · METERS · /500M · SPM · HR · REST` — **no TARGET column, in
     either orientation** (verified against the rendered header; the only
     column hidden in portrait is REST). On the grid the tint is the sole
     carrier of direction, so all-red or all-blue erases it on every row
     the rower scrolls back through.

   Still accepted — it is the rower's choice, and the grid is a review
   surface rather than a mid-stroke one — but accepted on what is true.
2. **Red may come to mean something good.** A rower who sets `spmFaster:
   red` gets red for a rate that is beating target, on the same surface
   where the LOST THE MONITOR banner is red. The banner is a filled ground
   and every judged tint is text, so they do not collide visually, but the
   association weakens. Accepted: that is what choosing means.
3. **The two SPM slots do not reach the post-workout summary**, because the
   summary has never tinted its SPM cell. Gate 0 decides whether this needs
   a word on the screen. Tinting it is explicitly out of scope.
4. **No dark theme interaction.**
   `grep -rn "prefers-color-scheme\|data-theme\|color-scheme\|prefers-contrast\|forced-colors" src/index.css src/theme/tokens.css`
   returns nothing — one palette to measure.

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
7. **I-7** `stale` and `within` are untouched by every setting, and keep
   their `timer-card-actual-` prefix.
8. **I-8** No copy on any surface names a colour the settings could
   contradict. **Satisfied by DELETING the summary legend** (Gate 0 ruling 7,
   option (a)): the `<p class="summary-legend">` element, its CSS rule, and
   `design.spec.ts`'s `toHaveText` pin all go. `hasJudgedRow` loses its only
   consumer and goes with them. A repo-wide grep for the withdrawn phrasing —
   `FASTER (BLUE)`, `SLOWER (RED)` — is part of the task, not a follow-up.
9. **I-9** A storage failure at boot yields defaults and never blocks
   `createRoot`.
10. **I-10** What `saveJudgeColors` writes is what `loadJudgeColors` reads,
    for every field.

## How each invariant is gated

**The layer that matters is e2e, and this is the load-bearing paragraph of
the spec.** Two independent reasons, both measured, and the second is the
one that bites:

1. Vitest imports every `.css` as an empty string here — plain, `?raw` and
   `?inline` alike (measured against a scratch config rooted at `app/`;
   `TimerTargets.test.tsx`'s "verified empirically" comment is accurate).
2. **jsdom does not resolve `var()` at all.** With the stylesheet injected
   by hand, `getComputedStyle(el).color` returns the literal string
   `"var(--judge-pace-faster)"`, while a plain-hex rule on the same page
   returns `"rgb(29, 78, 137)"`. So lifting the CSS mock would buy nothing.

**The trap this sets, named so nobody walks into it** (recurring failure
21): a client assertion written as `expect(color).toContain("var(--judge-
pace-faster)")` **passes against a completely broken cascade.** No client
test may assert a colour. Client tests assert class names and root
properties; only e2e asserts a colour.

- **I-1, I-3, I-7** — client: the class emitted by each of the six sites,
  per metric and per judgement, against a realistic model. Plus a
  CSS-source test (the `scopedRuleBodies` idiom `tokens.test.ts` and
  `ConnectedSurface.test.tsx` already use) asserting each of the four new
  rules resolves to its own token, that `-stale`/`-within` are unchanged,
  and that the two `.summary-row-*` and two `.timer-card-actual-*`
  judgement rules are gone.
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
- **I-8** — e2e: whichever Gate 0 option lands, its assertion replaces
  `design.spec.ts`'s current `toHaveText` pin.
- **I-9** — client: `loadJudgeColors` against a `localStorage` getter that
  throws `TypeError` (the detached-document shape the research names, not
  only `SecurityError`), asserting defaults and no throw.
- **I-10** — unit round trip (recurring failure 24's producer rule):
  `saveJudgeColors(x); expect(loadJudgeColors()).toStrictEqual(x)` over a
  value non-default in **all four** slots. Without it, a serialisation
  mismatch passes every I-2 case and silently resets the preference on
  every reload.
- **THE SEAM (I-1 + I-3 end to end)** — **e2e, TWO tests, starting upstream
  of the producer** (this said "one test" through revision 2; two is forced,
  because inside one test leg A's assertion aborts before leg B's runs and the
  "leg B red, leg A green" mutation becomes unobservable): open `/you/settings`, set PACE SLOWER to BLUE, then
  reach a seeded summary with a slower-than-target row **by clicking
  through the app, never by `page.goto`**, and read
  `getComputedStyle(...).color` on the pace cell — asserting the literal
  `rgb(29, 78, 137)`, never a value derived from the token, so retuning the
  token cannot retune the test. A second leg reloads the page first,
  proving the boot-time apply in `main.tsx`. **The click matters:** with
  `goto`, removing the `main.tsx` call reddens both legs and the two legs
  stop testing different things.

**Mutations, named in advance** (recurring failure 21 — every new assertion
gets a probe that makes it fail, and the report states what was mutated and
what the failure said):

- Delete the `metric` argument at `PaneGrid`'s SPM site so it emits the
  pace class; the per-metric client test must go red.
- Point `.judge-pace-slower` at `--judge-red` unconditionally; the e2e seam
  test must go red.
- Remove the `applyJudgeColors` call from `main.tsx`; the e2e reload leg
  must go red and the click leg must stay green.
- Make `loadJudgeColors` return `JUDGE_COLOR_DEFAULTS` wholesale on any
  malformed field; the I-2 one-field-only case must go red.
- Change `saveJudgeColors`'s serialisation to **`{v:1, colors: next}`** without
  touching the reader; I-10 must go red and every I-2 case must stay green,
  proving the round trip tests something I-2 cannot. **The nesting is
  load-bearing and the original wording (`{v:1, …}`) was not:** a SPREAD
  (`{v:1, ...next}`) leaves all four fields at top level, so a total-per-field
  reader ignores the extra key and the probe stays green — measured 57/57 at
  Task 1, 2026-09-08.

**The e2e mutations must COMPILE** (recurring failure 12's corollary, PR
#344): swap a call for another that keeps every import used, and confirm
`pnpm build` exits 0 inside `docker compose up --build` before reading any
Playwright result — a build that fails leaves the previous image serving
unmutated code and the probe reads as green.

## Contrast, computed

Three grounds, not two. Revision 1 measured against `--surface` and
`--page` only, inheriting `tokens.css`'s "both backgrounds". A judged SPM
cell demonstrably renders on a third: `.connected-grid-active.connected-
grid-resting` sinks to `--surface-sunken`, and `surfaceModel.ts` nulls the
pace judgement on a resting row while **keeping the SPM one**.
`index.css`'s own comment on this same class family already records that
third ground — the two comments in the repo disagreed, and revision 1
inherited the wrong one.

| ink | `--surface` #fffdf7 | `--page` #f4f1e8 | `--surface-sunken` #efeade |
| --- | --- | --- | --- |
| `--judge-blue` #1d4e89 | 8.25:1 | 7.43:1 | 6.99:1 |
| `--judge-red` #962718 | 7.94:1 | 7.15:1 | 6.73:1 |
| `--ink` #1b1a17 (OFF) | 17.11:1 | 15.41:1 | 14.50:1 |
| `--ink-3` #57544c (stale) | 7.43:1 | 6.69:1 | 6.30:1 |

Reproduced by this command, not by eye (2026-09-08):

```
node -e 'const l=c=>(c/=255)<=0.03928?c/12.92:((c+0.055)/1.055)**2.4,\
L=h=>{const n=parseInt(h.slice(1),16);return 0.2126*l(n>>16&255)+\
0.7152*l(n>>8&255)+0.0722*l(n&255)},r=(a,b)=>((Math.max(L(a),L(b))+0.05)/\
(Math.min(L(a),L(b))+0.05)).toFixed(2);for(const[n,c]of[["blue","#1d4e89"],\
["red","#962718"],["ink","#1b1a17"],["ink-3","#57544c"]])\
console.log(n,r(c,"#fffdf7"),r(c,"#f4f1e8"),r(c,"#efeade"))'
```

Every figure clears the house 4.5:1 floor. The `--ink-3` row reproduces
`index.css`'s own recorded 7.43 / 6.30, which is the check that this method
matches the repo's. All 81 reachable slot combinations draw from this
table, so no combination needs its own measurement — **the settings
screen's own swatches and checked-state affordance are NOT covered by it**
and get their own rows at Gate 0.

## What this deliberately does not do

- **No third colour, no colour picker.** Red and blue only, per James.
- **No tinting of the summary's SPM cell.**
- **No server field and no cross-device sync.** Device-local, per the
  design gate.
- **It does not absorb the two queued comfort settings.** `ROADMAP.md`
  parks *"pre-workout countdown length 0-60 s"* and *"pace tolerance
  0-3 s"* with the trigger *"the next You-screen PR — they are cheap and
  they ride it"*, and this is that PR. **Recommending they do not ride it:**
  pace tolerance changes what a judged number MEANS, which is the triad's
  first clause, and it would land a second independent risk model in one
  review. **James's call at Gate 0.**
- **No accent-colour setting**, and no per-user persistence of preferences
  generally. `ROADMAP.md`'s deferred slate carries both; the second now
  describes a road not taken and is retargeted in the same commit as this
  revision, so the next author does not read it as live.

## PR shape

One PR. It carries a stored shape, so under the grouping rule it would
normally land alone — and it does: everything in it serves the one
preference, and a reviewer holds one risk model.

Task order, failing test first at each step:

1. `you/judgeColors.ts` — the store, defaults, the per-field total read
   with a **bare catch**, the boolean save, `applyJudgeColors`. Unit tests
   (I-2, I-9, I-10).
2. Tokens and rules: raw palette, four resolved slots, four new classes,
   **deletion of `.timer-card-actual-faster/-slower` and
   `.summary-row-faster/-slower`**, `.connected-lost` repointed,
   `--judge-faster`/`--judge-slower` retired. CSS-source tests (I-4, I-7);
   `ConnectedSurface.test.tsx`'s four literals moved.
3. The six call sites take a metric. Client tests (I-1, I-3).
4. `main.tsx` boot apply.
5. The e2e harness: `design.spec.ts`'s `judgedColor()` and
   `expectedJudgedRgb()` become metric-aware; the two
   `not.toMatch(/timer-card-actual-/)` assertions are retargeted or deleted
   (after the rename their regex can never match, so they become
   decoration — recurring failure 21); the 12 `e2e/fixtures/*.html`
   snapshots regenerate via `ConnectedSurface.screens.test.tsx`.
6. **Delete the summary legend** (I-8): the JSX element, the
   `.summary-legend` CSS rule, the now-unused `hasJudgedRow`, and
   `design.spec.ts`'s `toHaveText` pin. Grep `FASTER (BLUE)` and
   `SLOWER (RED)` repo-wide and reconcile every hit, including
   `TraceChart.tsx`'s comment, which cites this legend as its idiom.
7. `/you/settings` + the SETTINGS door row + `OptionGroup`'s `label:
   ReactNode` and class props + **the new CSS block for the three-way
   control**. Client tests (I-6) and the keyboard tests copied from
   `OptionGroup`'s own suite. Test isolation: `src/test/setup.ts` clears
   nothing today, so any test calling `applyJudgeColors` must reset
   `document.documentElement.style` and the localStorage key, or it leaks
   into every later test in its file.
8. The e2e seam test, both legs, with the five named mutations run and
   their failure messages recorded.
9. `pnpm e2e` and `pnpm screenshots` (recurring failure 1), per-file
   coverage for every file touched (recurring failure 2), and the doc
   sweep: `You.tsx`'s "No SETTINGS section" comment; `DEVIATIONS.md`'s row
   naming `--judge-faster`/`--judge-slower` and
   `.timer-card-actual-faster/-slower` as current state, and its row
   glossing *"judged colour alone says what it is"*, which a documented OFF
   state contradicts; the rationale blocks in `index.css` and
   `tokens.css`'s token comment.

## Gate 0 — RULED 2026-09-08

Presented as a rendered artifact driving the app's own markup and stylesheet
live over the four proposed custom properties. All nine settled; James
approved the remainder in one word after the door order and the container
question were taken separately, so each disposition is written out here
rather than left to be inferred.

| # | Question | Ruling |
| --- | --- | --- |
| 1 | The screen as rendered | **APPROVED** — groups, three-way control, checked state, live preview |
| 2 | The copy | **APPROVED as rendered**: `SETTINGS` row, `COLORS · PACE` / `COLORS · SPM` group headers, `FASTER` / `SLOWER` row names with their parentheticals, `RED` / `BLUE` / `OFF` options. "JUDGEMENT COLOURS" is dead. |
| 3 | Door order | **BASELINES, CONCEPT2, SETTINGS, DIAGNOSTICS**, and the group stays FLAT — see "The screen" |
| 4 | PaneLive, both orientations | **APPROVED** |
| 5 | PaneGrid at all-red | **APPROVED** — accepted consequence 1 stands, on the grid's real column set |
| 6 | The summary, OFF keeps bar and ± | **APPROVED** |
| 7 | The legend | **OPTION (a) — DELETE IT.** See I-8 below. |
| 8 | Un-keyed storage | **CONFIRMED** — device-scoped, inherited by a second rower on the same phone, and no clear path at all |
| 9 | Do the comfort settings ride this PR? | **NO.** Pace tolerance changes what a number means; the ROADMAP trigger retargets to the second SETTINGS PR. |
