# Phase 6I — Today onboarding

**Date:** 2026-08-08
**Design authority:** `docs/design/handoffs/2026-08-07-news-tab/` — screens
2b (Today, no baselines), 2e (You › Learning the app), and §3/§6/§7 of its
README. The 6H spec (`2026-08-07-phase-6h-news-tab-design.md`) defined this
phase's boundary; 7B has since merged, which unblocked it (James's hold)
and makes the monitor article writable.
**Decided with James (2026-08-08):** step targets are a mix (two existing
articles + two new); the baseline card starts a real effort-ref workout
with manual baseline entry after; dismissal lives server-side on
preferences. The three foldable 6H close-out minors ride along.

## What this phase is

The teaching flow lands on Today: a dismissible four-step START HERE block,
a no-baseline SETS YOUR BASELINE suggestion card, the "Learning the app"
row + detail screen on You, and the Start-here pinned row in News that
appears on dismissal. Plus two new articles the steps need.

## The four steps (design §6, screen 2b)

Each step is an article row (unread square, minutes, read-grey — News's own
row grammar at smaller scale). Targets:

| Step | Copy (from the mock) | Opens |
|---|---|---|
| 1 | Row 6k once. That is your baseline. | **NEW** `your-first-row` |
| 2 | Every pace is that baseline plus an offset. | existing `baselines` |
| 3 | Pick a workout by how much it should hurt. | existing `picking-a-workout` |
| 4 | Connect the monitor and it drives the piece. | **NEW** `connect-the-monitor` |

Progress (`N OF 4 READ`) = how many of those four slugs are in the user's
read set — the existing `article_reads` mechanism, no new state. Reading
`baselines` from anywhere (News, a cross-link) legitimately advances the
step; that's a feature of linking rather than restating (the PM-review
principle).

### The two new articles

Both are ordinary `NewsArticle` entries (LATEST feed, unpinned — the pin
cap is now spoken for: two explainers + Start-here). Prose is drafted at
plan time under the standing content discipline, James reviews in the PR:

- **`your-first-row`** — "Your first row" (~2 min): what the baseline 6k
  is, how to start it from the Today card, that it's rowed by feel (warm
  up, hold even), and exactly where the number goes afterwards (You →
  baselines, average split). This is the how-to the beginner persona said
  was missing.
- **`connect-the-monitor`** — "Connect the monitor, and it drives the
  piece" (~3 min): what connecting a PM5 does (the app programs the whole
  workout into the monitor; live pace and stroke rate against targets;
  auto-advance), what it needs (a PM5, Bluetooth), and that manual mode
  always remains. **No "tinted numbers" claim** — the mock's tinting line
  was fabricated WHAT'S-NEW copy and nothing shipped tints (verified by
  grep); the deferred tinted-numbers article stays deferred until such a
  feature exists. **The implementer fact-checks every sentence against
  7B's shipped UI** (`src/monitor/ConnectAction.tsx`, the timer's
  connected surface) and flags drift in the report rather than editing
  the prose silently. The Connect guard loosening (Mechanics, below)
  must land in the same phase, or this article's step-4 promise is a lie
  for the very rower it targets.

## START HERE on Today (screen 2b)

- Sits at the top of Today, above the suggestion card; renders only while
  `preferences.startHereDismissed` is false. Header row: `START HERE ·
  N OF 4 READ` (mono label) + `DISMISS` (44px target, accent text link).
- Four step rows per the table above; read styling per News (square +
  grey + weight 400). Rows are `Link`s carrying `state={{ from: "/today" }}`.
- DISMISS is immediate (no staged confirm — it's recoverable from You and
  the News pin, and the mock shows a plain link). Sets the preference via
  the existing PUT `/api/prefs` (additive field), optimistic.
- No layout reservation once dismissed: the block simply unmounts.

## The no-baseline card (screen 2b)

- Replaces the normal suggestion card while **either** baseline is null
  (corrected by the antagonistic pass: the app-wide convention is that a
  partial pair is null everywhere — `domain/types.ts:31`, six client
  files — so "one set returns real suggestions" would strand the rower at
  dash-durations and a still-blocking Confirm). With both null the card
  defaults to the 6k with `2K INSTEAD`; with exactly one null it offers
  only the missing distance (`SETS YOUR 2K BASELINE`, no toggle). Both
  set → real suggestions return. Handoff open question #3 is thereby
  answered: yes, a rower who set one sees the other.
- Card: `SUGGESTED · SETS YOUR BASELINE` label, the designated workout's
  title + estimated duration, a dashed chip `6K BASELINE · NOT SET · ROW
  IT HOW IT FEELS`, `START` (the app's one level-1 button — this card is
  on Today, where START lives), and `2K INSTEAD` as a secondary that swaps
  the card to the 2k variant (and back: `6K INSTEAD`).
- **Mechanics (corrected by the 2026-08-08 antagonistic pass — the
  original "effort refs resolve without baselines, flow runs unmodified"
  claim was FALSE against `pace.ts:73`/`expand.ts:150`/`engine.ts:49`):**
  two designated global seed workouts (titles fixed constants, e.g.
  "First 6k" / "First 2k"): single distance work step (6000m / 2000m) at
  an effort ref (`{effort:"min"}` / `{effort:"max"}`). Running them
  without baselines is a REAL domain change this phase owns:
  - `phases()`/`buildRun` (and `estimateMinutes` where it feeds them)
    accept `Baselines | null`; with null, an effort phase carries NO
    `targetSplit` (the field is already optional and the timer already
    renders effort words, never the number) and NO duration estimate.
  - One domain predicate — `needsBaselines(steps)`: true unless every
    work step is an effort ref — consumed by EVERY coupled guard site:
    Confirm's footer guard, **Countdown's own null-baselines redirect and
    its `buildRun` call** (missing either produces a redirect loop / a
    timer with no run record), WorkoutDetail's Connect guard (so step 4's
    article isn't a lie — `compileProgram` already handles effort phases),
    and the manual-log door's no-target gate.
  - Timer display with no estimates: TOTAL LEFT and the phase progress
    bar are hidden for a session where no phase has an estimate (never a
    frozen `0:00`/0% bar); the suspect-actual check stays disabled
    (already meters-gated).
  - The distance step's stopwatch actual **survives into the saved log**:
    the 5G drop rule is amended for measured actuals — an effort distance
    phase logs `actualSplit`/`actualSource:'stopwatch'` when the engine
    measured one (assumed actuals stay dropped). `validateLogStepEntry`
    already accepts paired actuals without a `targetSplit` (the 6C
    amendment). `your-first-row` points at the log as where the number
    lives.
- The card's duration is fixed nominal copy (`ABOUT 25 MIN` / `ABOUT 8
  MIN`, constants beside the titles) — `estimateMinutes` cannot run
  without baselines and the house rule is never a bare dash.
- The card's START carries WorkoutDetail's full start-guard flow
  (unlogged-run staged confirm, live-MonitorRun confirm, draft build +
  cross-clears) — extracted into a shared helper, not duplicated and not
  skipped; a bare navigate-and-start would reintroduce the F5 data-loss
  class.
- After logging, baseline entry is **manual** (You → baseline editor), and
  `your-first-row` says so explicitly. Auto-capture from the log is a
  recorded follow-on, not this phase.
- **Plan mode:** the card shows, and the plan-line apparatus (session
  line, type-swap chips, FILTER/SHUFFLE header) is hidden while it does —
  there is no suggestion to filter or swap. The designated workouts' Log
  screen defaults the plan toggle to **outside the plan** (still visible,
  still changeable): a baseline test must not silently consume plan
  session 1.
- **The designated workouts are invisible outside onboarding:** excluded
  from the suggestion pools (client `suggest`/`suggestFreestyle` inputs
  AND the server's `/api/today`) and from the Library list, by title
  constants in one shared place; their detail routes stay reachable (the
  card links there). A veteran must never be SUGGESTED "First 2k".

## Learning the app on You (screen 2e, design §7)

- A `SETTINGS`-sectioned row on You: `Learning the app` + `START HERE ·
  N OF 4` meta. (This introduces You's settings-section header; the
  mock's other settings rows are filler and are NOT built.)
- Opens `/you/learning`: progress line, the four steps listed (read state
  shown, rows link to the same targets), and two controls:
  - **PUT IT BACK ON TODAY** — clears the dismissed flag (disabled/absent
    when not dismissed), keeps read state.
  - **MARK ALL FOUR UNREAD** — staged confirm (tap-again idiom), deletes
    the four step slugs from `article_reads` AND clears the dismissed
    flag (the mock's caption: the second control "also clears... so it
    starts from step one" — a reset that leaves the block hidden resets
    nothing visible). Cross-surface consequence, accepted and pinned in a
    test: un-reading `baselines`/`picking-a-workout` un-greys them in
    News and raises its unread count — the mock's "clears what you have
    read" means exactly that.
  - Status line per the mock when dismissed: `DISMISSED ON TODAY · STILL
    PINNED IN NEWS`.
- The News **Start-here pinned row** (design §3): appears only while
  dismissed — `Start here, in four steps` + `N OF 4 READ · DISMISSED ON
  TODAY` — and opens `/you/learning`. Lives in News.tsx as a special
  pinned row, not a registry article (it has no body; its read state is
  the aggregate).

## Server (all additive)

- `preferences.start_here_dismissed boolean NOT NULL DEFAULT false` —
  migration + `PUT /api/prefs` accepts it (same validation style as its
  siblings).
- `DELETE /api/article-reads/:slug` → 204, idempotent, same slug-shape
  validation as PUT — MARK ALL FOUR UNREAD issues four deletes. The full
  store stack comes with it per the contract-test rule: `unmarkRead` on
  the real store AND the fake, contract-suite cases (incl. per-user
  isolation), and an isolation-test row — enumerated in the plan, not
  inherited silently.
- New-article side effect, accepted: publishing the two step articles
  bumps every existing user's News unread count by 2 (ordinary
  publishing semantics) and enters them into `nextUnreadSlug` walks.
- Two new global library workouts via a **designated onboarding seed
  list** concatenated into the converge input (antagonistic-pass F4: they
  cannot live in `LIBRARY_WORKOUTS` — `library.test.ts` hard-pins exactly
  300, the per-type/band quota grid, spm-present-and-even, and
  difficulty ordering, all of which a single-step no-spm effort workout
  violates). The onboarding list gets its own tiny gate (2 rows, effort
  refs, distance steps, fixed titles) and is exempt from the 300-grid.
  Rollback note: a rollback deploy converges them away; their log rows
  survive as snapshots via `ON DELETE SET NULL`.

## Folded 6H close-out minors

1. `useArticleReads.ts`: hoist the `has(slug)` guard + PUT out of the
   `setState` updater (StrictMode double-fire purity).
2. `StoresUnderTest.articleReads` optionality + dead runtime guards →
   required member, guards removed, stale comment fixed.
3. News's LATEST section gains a `.news-latest` class; the e2e negation
   locator (`section:not(.news-pinned):not(.news-whatsnew)`) switches to it.

NOT folded: the linked-story ↗ arrow colour (waits for the first linked
story, per the standing queue).

## Out of scope

6J's Trend charts; auto-capture of baselines from a logged first row
(recorded follow-on); any other You settings rows; the stroke-rate
article; monitor/7C surfaces beyond the article's prose.

## Implementer landmines (from the antagonistic pass)

- `todayGuard.pin.test.ts` pins Today.tsx's stale-draft-discard effect
  byte-for-byte via `?raw` — touching that block, even reformatting,
  fails the pin; edit around it or amend the pin deliberately.
- `/you/learning` registers inside the same `user && onSignedOut`
  conditional as `/you` (or the prod-shaped config wildcards it to
  /today); its BackLink needs `fallback="/you"`.
- The folded minor #2 (making `StoresUnderTest.articleReads` required)
  and the new `unmarkRead` contract cases land in the same file — one
  task, not two racing edits.

## Collision posture

7C (PM5 logging) is in flight. 6I touches Today.tsx (7B's changes are
merged and stable underneath), You.tsx, News.tsx, preferences, and the
session-start guard — 7C's expected surface is the log-writing path and
MonitorRun; the one watch-item is the Log screen if 7C reshapes it while
we're in flight (we don't touch it). Sequenced risk accepted; rebase
before PR like 6H did.

## Error handling

- Reads fetch failure: START HERE renders with no read/progress claims
  (same suppression rule as News); progress falls back to `START HERE`
  without the count.
- Prefs PUT failure on DISMISS: optimistic hide stands for the session;
  the block may return next load (same nicety class as read state).
- Delete failures in MARK ALL FOUR UNREAD: surface the existing inline
  retry idiom on the detail screen; partial deletion is safe
  (idempotent re-run).

## Testing

Per docs/TESTING.md; specific obligations: realistic fixtures (a real
plan, real read states — not empty); the no-baseline card proven END TO
END against the real stack (fresh user → card → START → confirm →
countdown SKIP → timer (effort word, stopwatch) → complete → log → You
entry still manual); the effort-only START-guard loosening tested at the
guard's own unit level AND e2e; step-read progress advancing via a
cross-surface read (read `baselines` from News, see `2 OF 4` on Today);
dismissal round-trip incl. the News pin appearing and `/you/learning`'s
two controls; per-file coverage on every new file; design sweeps (axe,
44px, contrast — the dashed chip and step rows measured) on Today's two
new states, `/you/learning`, and News-with-Start-here-pin; screenshots:
`today-onboarding.png` (block + baseline card, fresh user),
`you-learning.png`, News recaptured with the third pin.

## Docs obligations at close

DEVIATIONS: the settings-rows-not-built row, the pin-cap note (pain-scale
stays unpinned), any divergence found. README pointer already covers the
handoff. ROADMAP: 6I section checked off; the auto-capture follow-on
recorded under triggered follow-ons. TestFlight recommendation after
merge.
