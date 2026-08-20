# Phase 5A — Foundation, Library, Detail, Baselines — Design

Approved 2026-07-29. First real screens. Splits ROADMAP Phase 5 into **5A**
(this spec: design-token foundation, tab shell, Library, Workout detail, You
baseline editor) and **5B** (Builder + bulk import). Scope adjustment made
during brainstorming and approved: the You baseline editor moved from 5B into
5A, because the phase's own exit criterion — "a workout displays the correct
range from your real baselines" — is unreachable without a way to enter
baselines. 5A ships a genuinely usable app: browse the 35 global workouts
resolved against your real paces. 5B adds authoring your own.

`docs/design/` is the UI authority except where `docs/design/DEVIATIONS.md`
overrides (pain 1–5 with 5-segment bars, `PAIN ≤3` chip, EASY/MEDIUM/HARD,
plain library count with no `/375`). 44×44 hit targets and WCAG AA are hard
requirements, not aspirations.

## Decisions

| Question | Decision |
|---|---|
| Routing | `react-router-dom` 7.18.2 (verified 2026-07-29; peer `react >=18`, fine on React 19). Real URLs — `/library`, `/library/:id`, `/you` — which the nginx SPA fallback (shipped and e2e-asserted 2026-07-29) makes deep-linkable and testable |
| Fonts | Self-hosted `@fontsource/{newsreader,archivo,ibm-plex-mono}` 5.3.0 (verified). No CDN: works offline, no third-party request from the native shell, and `/assets` already carries immutable caching |
| Pace math in the UI | **The client imports `app/domain/` directly** (Vite alias + tsconfig path) for `estimateMinutes`, `resolveSplit`, `toleranceRange`, `fmtSplit`. Zero reimplementation — that module is pinned at 100% coverage. This is the concrete payoff of the 2026-07-29 native-first/no-Swift decision |
| Data fetching | Hand-rolled hooks over the existing `api()` adapter, following `src/useMe.ts`. No react-query (YAGNI) |
| Filtering | Client-side, in a pure unit-tested `src/library/filters.ts`. Correct at ~35 workouts; recorded trigger to move server-side if the library reaches a few hundred rows (scale lens: the list endpoint is already a single query, no N+1) |
| Tab shell | All five tabs (TODAY · LIBRARY · PLAN · TREND · YOU) from the start, so the shell is built once and design assertions stay stable. TODAY/PLAN/TREND render a one-line placeholder naming the phase that fills them |
| Nudges | Session-local only (`useState`), never persisted — Phase 6 passes them per-request. Detail carries the handoff's "PREVIEW — NUDGE ANY TARGET" sunken note |
| App icon | Ship James's image cropped this phase; clean SVG redraw recorded as a ROADMAP follow-on gated on external TestFlight / App Store |

## File structure

- `src/theme/tokens.css` — the handoff's Design-tokens section as custom
  properties: colors (page `#f4f1e8`, surface `#fffdf7`, surface-sunken
  `#efeade`, ink `#1b1a17`/`#3f3c35`/`#57544c`/`#8a8478`/`#a09a8c`, rule
  `#d8d3c4`/`#ded8c9`/`#c9c3b2`, accent `#b5341f`, accent-hover `#9c2c19`,
  type O2 `#2a6275`, AT `#8a5f18`, AN `#5c4382`, TEST/TR per handoff,
  on-color `#fffdf7`), the 2/3/4/6/7/8/10/12/14/16/18/20/22 spacing scale,
  2px radii, and the three font stacks. `accentColor` and `paceTolerance`
  stay variables, not literals (handoff calls both settings).
- `src/shell/AppRoutes.tsx`, `src/shell/TabBar.tsx` — router + bottom tabs
  (10px mono labels, 16×3px accent mark above the active label).
- `src/components/TypeBadge.tsx`, `src/components/PainBar.tsx` — shared;
  PainBar is **5 segments** (3×11px, filled = type color, empty `#e0dacb`).
- `src/library/Library.tsx`, `FilterChips.tsx`, `WorkoutRow.tsx`,
  `filters.ts` (pure), `useWorkouts.ts`.
- `src/workout/WorkoutDetail.tsx`, `StepRow.tsx`, `NudgeControl.tsx`.
- `src/you/BaselineEditor.tsx` (+ its staged-draft reducer, pure and
  separately testable), composed into the existing `You.tsx` alongside the
  account/sign-out block.
- `src/api/` hooks: `useWorkouts`, `useBaselines` (GET + PUT).

## Screens

**Library.** Header "Library" (Newsreader 31px) + `+ NEW` accent mono link
(routes to the builder in 5B; in 5A it is present but routes to a placeholder
— it is part of the header's layout and hit-target geometry). Plain count of
the visible library, never `/375`. Filter chips, all ≥44px, 6px gap, wrapping:
ALL · AN · O2 · AT · TR · <30′ · 30–45′ · 45–60′ · 60′+ · **PAIN ≤3** ·
RECENT · NOT RECENT. Semantics (from the handoff, encoded in `filters.ts`):
type chips single-select **and toggle off**; duration chips multi-select
**union** (bucketed by `estimateMinutes`); RECENT = `lastDone < 21` days,
NOT RECENT = `>= 21`, mutually exclusive; ALL clears everything. Active =
accent background + cream label; inactive = transparent, `#57544c` label,
`#c9c3b2` border. Rows (surface card, 14px padding): `159. Zephyr` 16px/500 +
duration mono 13px accent; second line type badge + `MEDIUM · 33D AGO` +
5-segment pain bar. Empty-filter result gets an explicit empty state, not a
blank list.

**Workout detail** (`/library/:id`). ← BACK link · type badge + `NO. 159 ·
MEDIUM` · title Newsreader 33px · `50 MIN · PAIN 3/5 · LAST DONE 33 DAYS AGO`
· sunken `PREVIEW — NUDGE ANY TARGET` note · step list where work rows show
the resolved range in accent (`resolveSplit` + `toleranceRange`, EN DASH) with
▲▼ 44px nudge buttons, sub-line `24 spm · 2′ rest · nudged −1s`. Distance
steps render meters; time steps render minutes. `Start` and `Log it after`
buttons are present and disabled with a "Phase 6" title — they are load-bearing
for the 44px/contrast assertions and for the screen's real layout.

**You — baselines.** The staged editor exactly as specified: `k2`/`k6` drafts
in mono 32px accent with 44px −/+ where **− makes the pace faster**, 0.5s
steps; a confirm block reading `2k 1:52.0 → 1:53.5` with **Discard** /
**Apply baselines**. Nothing re-paces until Apply (the draft reducer is pure
and unit-tested). Bounds 60–240 s/500m enforced client-side to match the API.
On Apply, PUT `/api/baselines`; Library/detail re-resolve on next render.
The rest of the You screen (preferences, plan, test history, multi-account)
belongs to later phases and is out of scope here.

**Empty/error states.** No baselines set → detail shows the handoff's italic
"no target" state plus a link to You; the API's `baselines_required` error
shape is rendered as that state, never as a raw error. Failed fetches show a
retry affordance, not a blank screen.

## App icon

Source: `docs/design/icon-source.png` (1408×768, alpha, artwork centered).
Deliverable: crop the centered rounded-square artwork to a square, scale to
**1024×1024**, **flatten alpha onto the artwork's blue background** (Apple
rejects icons with an alpha channel), write to
`app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
(replacing the current placeholder; `Contents.json` already points there and
needs no edit). The same square PNG becomes the web favicon. Verification is
visual: the implementer views the cropped result and confirms the artwork is
centered with no letterboxing before committing.

Recorded as a ROADMAP follow-on (not this phase): a clean SVG redraw fixing
the AI-generation artifacts (the arc reads "ERGOMATIO", the rail "Cxoncept 2",
the monitor label is unreadable), removing the third-party brand wordmark, and

> **CORRECTION (James, 2026-08-20).** The arc is not misspelled. It reads
> ERGOMATIC; the rabbit's ear crosses the final C and hides it at icon size.
> This sentence is where the "ERGOMATIO" claim originated, and it was copied
> into ROADMAP and then into a phase plan without anyone opening the PNG.
> The rest of the sentence holds — the third-party rail mark and the baked-in
> corners/shadow are real, and are the actual App Review blockers. Current
> state lives in Phase PROD, not here.
dropping the baked-in rounded corners and drop shadow that will double up with
iOS's own mask. Gate: before any external TestFlight distribution or App Store
submission.

**Release impact:** this is the first native-visible change since v0.1.0, so
this phase's merge recommendation will be **"release recommended"** — new icon
plus the first real screens.

## Testing & exit criteria

- **Unit (client project):** `filters.ts` — every chip rule including the
  single-select toggle-off, the duration union, RECENT/NOT RECENT exclusivity,
  and ALL clearing; the baseline draft reducer — 0.5s steps, − = faster,
  bounds clamping, Discard restoring, Apply committing.
- **Component:** Library renders rows from a stubbed hook; PainBar renders
  exactly 5 segments with n filled; detail renders resolved ranges from known
  baselines (the assertion is a real computed range, not a snapshot).
- **e2e (`app/e2e/`):** navigate tabs; open a workout from Library; nudge
  changes the displayed range; set a baseline and see the range change.
  Every new screen is **registered in `design.spec.ts`** — ≥44×44 tap-target
  sweep, axe `wcag2a`/`wcag2aa`, token-color pins — which is the definition of
  done for UI from here on.
- **Screenshots:** Library, Workout detail, You captured into
  `docs/screenshots/` by the existing `pnpm screenshots` harness and embedded
  in the PR body (standing rule).
- Coverage gate 90×4 holds; domain stays at 100 (untouched — the client
  consumes it, so any new pace behavior belongs in domain with its own tests).
- **Exit:** a workout whose step reads `6k -2 @ 22 SPM` displays the correct
  range from James's real baselines, entered through the You editor, on the
  deployed app; all suites and e2e green; screenshots in the PR; icon on the
  home screen after a TestFlight build.

## Out of scope

Builder + bulk import (5B). Today/Plan/Trend screens, session flow, timer,
logging (Phase 6+). Preferences, multi-account switching, test history
(later). Copy-on-write editing or hiding of global workouts (recorded Phase 5
follow-ons). PM5. The icon redraw.
