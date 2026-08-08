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
  workout into the monitor; live pace/rate against targets; the tinted
  numbers — absorbing the deferred "Reading the tinted numbers" article),
  what it needs (a PM5, Bluetooth), and that manual mode always remains.
  **The plan must have its author read 7B's shipped UI first**
  (`src/monitor/ConnectAction.tsx`, `ConnectedInterstitial.tsx`, the
  timer's connected states) so every claim matches what actually shipped —
  never the handoff's speculation.

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

- Replaces the normal suggestion card while **both** baselines are null
  (handoff open question #3 resolved: any one baseline set returns Today
  to real suggestions — the library resolves against whichever exists
  per-workout, and the nudge toward testing the other distance belongs to
  content, not a blocking card).
- Card: `SUGGESTED · SETS YOUR BASELINE` label, the designated workout's
  title + estimated duration, a dashed chip `6K BASELINE · NOT SET · ROW
  IT HOW IT FEELS`, `START` (the app's one level-1 button — this card is
  on Today, where START lives), and `2K INSTEAD` as a secondary that swaps
  the card to the 2k variant (and back: `6K INSTEAD`).
- **Mechanics:** two designated global seed workouts (titles fixed
  constants, e.g. "First 6k" / "First 2k" — final titles at plan time):
  single distance work step (6000m / 2000m) at an **effort ref** —
  `{effort:"min"}` for the 6k ("EASY"), `{effort:"max"}` for the 2k ("ALL
  OUT") — because effort refs resolve **without baselines** (5G), so the
  existing Confirm → Countdown → Timer → Log flow runs them unmodified,
  and the distance step's stopwatch actual gives the average split. The
  6B "baselines required to START" guard must except effort-only
  workouts (a targeted loosening: a workout none of whose steps needs a
  baseline may start without one — domain-adjacent, tested hard).
- After logging, baseline entry is **manual** (You → baseline editor), and
  `your-first-row` says so explicitly. Auto-capture from the log is a
  recorded follow-on, not this phase.
- Freestyle/plan modes both show the card when baselines are absent (a
  plan's prescribed type is moot until paces resolve).

## Learning the app on You (screen 2e, design §7)

- A `SETTINGS`-sectioned row on You: `Learning the app` + `START HERE ·
  N OF 4` meta. (This introduces You's settings-section header; the
  mock's other settings rows are filler and are NOT built.)
- Opens `/you/learning`: progress line, the four steps listed (read state
  shown, rows link to the same targets), and two controls:
  - **PUT IT BACK ON TODAY** — clears the dismissed flag (disabled/absent
    when not dismissed), keeps read state.
  - **MARK ALL FOUR UNREAD** — staged confirm (destructive-ish, matches
    the app's tap-again idiom), deletes the four step slugs from
    `article_reads` so the block starts at step one. Per the mock's own
    caption: the first restores, the second also clears.
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
  validation as PUT — MARK ALL FOUR UNREAD issues four deletes.
  (Read-state deletion is new but harmless: it only ever un-greys rows.)
- Two new global library workouts via the existing seed converge (title
  inserts are additive; the converge handles deploy/rollback cleanly).

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
