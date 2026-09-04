# Phase SF — Shuffle and filters

**What and why.** James's report from using the app (2026-09-04): SHUFFLE
"isn't actually shuffling" and always shows the same workout at the top;
Today's filters forget themselves; the four duration buckets cannot say
"25–35 minutes"; nobody understands GLOBAL versus CUSTOM; and the Library has
no way to find a workout by name. All five are true, and the first one is
true BY DESIGN: SHUFFLE steps to the *next* entry in least-recently-done
order and wraps, never-done entries tie, and ties keep the server's seed
order, so a mostly-unrowed 300-workout library cycles in seed order with a
deterministic first pick. This phase makes the suggestion genuinely random
(with a stable card across reloads within a day), rolls a fresh type each
day in freestyle, remembers Today's filters per type so a rower can set them
once, replaces the buckets with a minutes range on both screens, renames the
source labels, and adds a name search to the Library.

**Gate class, spoken.** Not fast path — five product files minimum, two
stored shapes, `domain/suggest.ts` and `domain/duration.ts` change, and PR2
changes which workouts qualify for a filter (a number's meaning). PR1 and PR2
are TRIAD: full antagonist pass on this spec (the phase's anchor pass), PM
final gate on each PR. PR3 is UI and copy: James reviews, no PM gate, no
antagonist delta ("inherits phase ground; no new invariant class" — the name
search is a client-side substring over an array already in memory). Every PR
here changes what a rower sees, so each carries a Gate 0 capture set before
its implementation starts.

**Decisions James made in the brainstorm (2026-09-04), verbatim where it
matters:**

- "I like your recommendation" — first pick random within the
  least-recently-done tie, stable across reloads that day; SHUFFLE random
  without repeats until the pool is exhausted.
- "in freestyle mode I'd like it to also randomize the type each time today
  is loaded" — resolved to ONCE PER DAY ("Go with that rec"): the roll is
  stable across reloads, a tap overrides it for the day, tapping the lit chip
  clears to ANY TYPE, tomorrow rolls again.
- "in the future we may want the library to lazy load so let's be careful
  with the assumption there" — §2.4 is the named constraint.
- "Library doesn't remember" — per-type filter memory is Today only.
  Library's existing sessionStorage record is a BACK round-trip aid
  (`libraryFilters.ts`'s own comment), not memory, and stays as it is.
- "I'm concerned about making sure the shuffle remains performant and limits
  network calls when possible" — §2.5 states the network contract: zero
  requests per tap, unchanged fetch count per mount.
- "I was thinking we change 'global' to 'library' and i could use a
  recommendation on custom" — LIBRARY / MINE (§5).

## 1. Research pass

Tags: PRIMARY = vendor doc or standard, quoted; SECONDARY = implementation
source; INFERENCE = ours.

**1.1 Random source.** MDN, `Crypto.getRandomValues()` (PRIMARY, fetched
2026-09-04): "The `Crypto.getRandomValues()` method lets you get
cryptographically strong random values." Availability: "Baseline: Widely
available — well established and works across many devices and browser
versions since July 2015." Context: "`getRandomValues()` is the only member
of the `Crypto` interface which can be used from an insecure context" — so
the web harness on plain `http://localhost` and the WKWebView both have it.
Limit: "A `QuotaExceededError` is thrown if the `byteLength` of `typedArray`
exceeds 65,536 bytes" — we draw one `Uint32` per pick. MDN carries no
modulo-bias note; INFERENCE: with a 32-bit draw and a pool of at most a few
hundred, the bias of `x % n` is below 1e-7 and irrelevant to a workout
picker, and the domain helper uses rejection sampling anyway so the claim
never has to be defended. **Does the underlying system have the concept?**
Yes — the browser owns a CSPRNG and exposes it; we invent no PRNG and no
seed. The "stable across reloads" property comes from PERSISTING the draw,
not from re-deriving it.

**1.2 Why not a seeded PRNG.** The first design draft derived the daily pick
and daily type from a date-keyed seed so reloads agree. Rejected: it is a
mechanism this repo would invent (mulberry32 over a string hash), it needs
its own tests, and it silently couples the pick to every input of the seed
(a plan advance mid-day changes the seed and the card). Writing the draw to
the record the app already keeps per day (`todayPick`, `todayOverrides`)
gives the same property with zero new machinery, and RF27's lifetime table
(§2.3) is then the whole design.

**1.3 The range control.** WAI-ARIA APG, Multi-Thumb Slider pattern
(PRIMARY, fetched 2026-09-04): "A multi-thumb slider implements the Slider
Pattern but includes two or more thumbs, often on a single rail." "In many
two-thumb sliders, the thumbs are not allowed to pass one another, such as
when the slider sets the minimum and maximum values for a range." "Each thumb
is in the page tab sequence and has the keyboard interactions described in
the Slider Pattern." Required per thumb: role `slider`, `aria-valuenow`,
`aria-valuemin`, `aria-valuemax`, `aria-label` or `aria-labelledby`;
`aria-valuetext` "if the value of `aria-valuenow` is not user-friendly". The
base Slider Pattern (PRIMARY, same fetch) lists: Right/Up Arrow "Increase the
value of the slider by one step", Left/Down "Decrease … by one step", Home
"Set the slider to the first allowed value in its range", End "… last
allowed value", Page Up/Down optional larger steps.
MDN `<input type="range">` (PRIMARY): describes "a numeric value" (singular)
"which must be no less than a given value, and no more than another given
value"; `step` "specifies the granularity that the value must adhere to".
INFERENCE from that: the native element carries ONE value, so a two-thumb
range is either two overlaid native inputs or a custom control. **Decision:
two native `<input type="range">` elements**, one per thumb, on one rail —
they are keyboard-complete, screen-reader-labelled and touch-native for
free, and the "may not pass" rule is one clamp in the change handler. The
custom-ARIA route was rejected as RF8's exact shape (hand-rolling a pattern
the platform ships).

**1.4 Storage.** Already researched at the right layer:
`docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md` and
the storage-denial spec (2026-09-03). Every loader in this spec follows the
`loadRun` shape those settled: try/catch around the getter, return null on
denial, never clear on mismatch.

**1.5 Existing repo ground (RF18 — read before re-deriving).**
`ROADMAP.md` and `docs/superpowers/research/` carry nothing on shuffle
randomness, per-type filter memory, duration ranges, or a name search
(grepped 2026-09-04: `shuffle`, `duration slider`, `filter by name`,
`global.*custom` — zero live hits). The type chip row in freestyle shipped
the same day as #296 and is the surface §2 builds on.

## 2. PR1 — random shuffle, daily freestyle type, per-type filter memory

### 2.1 Invariants (what is owed, not how)

- **I-1 Stable day.** Within one local calendar day, with no tap, every
  Today mount shows the same card and (in freestyle) the same lit chip.
- **I-2 First pick is random within the tie.** The day's first card is drawn
  uniformly from the least-recently-done tie class of the day's pool; a
  library where everything is never-done draws uniformly from the whole
  pool.
- **I-3 SHUFFLE never repeats until it must.** Consecutive SHUFFLE taps in a
  day never show a card already shown that day while an unshown pool member
  exists; when none exists the shown set resets and the next tap draws from
  the full pool again (minus the card on screen).
- **I-4 The pool is the pool.** Filters, type, checkpoint pins and the
  onboarding exclusion decide membership exactly as today; randomness only
  decides ORDER within it.
- **I-5 Daily type.** In freestyle, the day's first mount lights one chip,
  drawn uniformly among types whose pool (under that type's remembered
  filters) is non-empty; ANY TYPE is never rolled. A tap overrides for the
  day. Tapping the lit chip clears to ANY TYPE for the day. A plan being
  active suppresses the roll entirely.
- **I-6 Per-type memory.** Today's five filter groups are remembered per
  key in {O2, AT, TR, AN, ANY}, undated, across reloads and days. Switching
  the lit chip switches the whole set. Applying the sheet writes the current
  key only. CLEAR ALL resets the current key to its preference-derived
  defaults. A key never written reads as those defaults.
- **I-7 Plan mode unchanged.** With a plan, the chip row, swap arrow,
  checkpoint pin, `CHECKPOINT OVERRIDDEN` marker and un-swap rule behave
  exactly as on main today; only the ORDER of the pool and the memory of the
  filters change.
- **I-8 Zero network.** No SHUFFLE tap, chip tap, sheet apply, or daily roll
  issues a request. Today's per-mount fetch count is unchanged.

### 2.2 Domain (pure, `domain/suggest.ts`)

`suggest()` / `suggestFreestyle()` keep their signatures and their
membership logic and gain one input: `rng: () => number` (uniform in
`[0, 1)`), injected so tests are deterministic. `poolIds` keeps its meaning
(the escape pool, sorted least-recently-done first) — it is what the
sheet's count reads. Two new pure helpers, each a few lines, each tested with
an injected rng:

- `firstPick(sortedPool, rng)` — the ids sharing `sortedPool[0]`'s
  `lastDoneDaysAgo` (null ties with null), one drawn by `rng`.
- `nextShuffle(poolIds, shownIds, currentId, rng)` — candidates = pool minus
  shown minus current; if empty, candidates = pool minus current; draw one.
  Returns `{ id, shownIds }` with the new id appended (or the list restarted
  at `[id]` when it had reset). Pure over the arrays it is handed — see §2.4.

The client's `rng` is `crypto.getRandomValues` on a `Uint32Array(1)` divided
by 2^32; the domain never touches `crypto` (no framework or platform import
in `domain/`, per the existing lint).

### 2.3 Stored shapes and the lifetime table (RF27)

**`ergomatic.todayPick`** (existing, per day) gains `shownIds: string[]`.
Validation: an array of strings, else the record fails whole (the existing
all-or-nothing rule in `todayPick.ts`). The record is already invalidated on
a `date`/`planKey`/`doneN` mismatch; nothing new there.

**`ergomatic.todayOverrides`** (existing, per day) LOSES the five filter
groups and keeps `{date, planKey, doneN, swapType}`. Bumping the shape means
an old record fails validation and reads as null — the same fate a
yesterday's record already meets every morning, so no migration and no
half-populated object (the file's own v1→v2→v3 history documents exactly
this rule).

**`ergomatic.todayFilters`** (NEW, undated):
`{ v: 1, byKey: Partial<Record<"O2"|"AT"|"TR"|"AN"|"ANY", FilterSet>> }` where
`FilterSet = { difficulties, durations, painLevels, lastDone, source }` — the
same five fields `todayOverrides` carries today, with the same validators
moved over. PR2 swaps `durations` for `durationRange` and bumps `v`.

| State | Minted | Cleared / replaced | Survives reload | Survives day change | Survives plan change |
|---|---|---|---|---|---|
| `todayPick.workoutId` | first mount of the day (I-2) or SHUFFLE | SHUFFLE; date/plan mismatch | yes | no | no |
| `todayPick.shownIds` | with `workoutId` | reset by `nextShuffle` on exhaustion; date/plan mismatch | yes | no | no |
| `todayOverrides.swapType` | daily roll (freestyle, I-5) or chip tap | chip tap; date/plan mismatch | yes | no | no |
| `todayFilters.byKey[K]` | first sheet apply or CLEAR ALL under key K | next apply/CLEAR ALL under K | yes | yes | yes |
| in-memory `suggestion` | every render | — | n/a | n/a | n/a |

The daily roll and the first pick are both WRITE-ONCE-PER-DAY: the mount
reads the record, and only a null read triggers a draw followed by a write.
Two Today mounts in the same tick (StrictMode double-invoke, a fast
back-and-forth) must not double-roll: the write happens inside the same
lazy initializer that reads, so the second mount reads the first's write.
This is a named antagonist target.

### 2.4 The lazy-load constraint (James)

The domain helpers take ARRAYS OF IDS and never ask whether they are the
whole library. If `useWorkouts` later pages, the pool is whatever is loaded,
`shownIds` may name ids not in the current pool (they are simply not
candidates), and a stored `workoutId` not in the pool already falls through
to a fresh first pick (existing `sorted.find` → undefined path). No helper
may hold a reference to the library between calls, cache a sorted copy
across renders, or key anything on `library.length`. This is the invariant
a lazy-load phase inherits; the antagonist attacks it as "which line would
break first if the pool were a page".

### 2.5 Performance and network

Per tap: one `Uint32` draw, one `Set` of at most pool-size ids, one
`localStorage.setItem` of a record bounded by the pool size (300 ids ≈
7 KB, well inside any quota). No request. Per mount: `GET /api/workouts`
once, as now; the daily roll's per-type pool check runs `suggest()` at most
four times over the in-memory array (each a single filter pass) and only on
the day's first freestyle mount.

### 2.6 UI

No new surfaces. The freestyle chip row (#296) shows the rolled chip lit on
the day's first mount instead of nothing lit; the word row follows. SHUFFLE
and FILTER are unchanged in position and size. The sheet's live count and
tokens read the current key's filters.

### 2.7 Oracles and the seam test (RF24)

- Domain: `firstPick` with `rng` sweeping 0..1 covers every tie member and
  never a non-member; `nextShuffle` over a 5-pool with a fixed rng
  sequence visits all five before any repeat, then resets. Mutations: drop
  the `shownIds` subtraction (repeats appear); drop the tie filter (a recent
  workout is picked); drop the reset (returns undefined on exhaustion).
- Client seam: one test mounts Today with an EMPTY store, lets the first
  mount write, unmounts, remounts, and asserts the same card and chip (I-1)
  — starting upstream of the producer. Mutation: make the initializer skip
  the write (second mount differs, given a stubbed rng that advances).
- e2e: on the real 300-workout library, tap SHUFFLE 12 times and assert 12
  distinct titles; reload and assert the 12th is still on screen. Freestyle:
  reload twice and assert the lit chip is unchanged; tap the lit chip and
  assert ANY TYPE; set a filter under AT, switch to TR, assert the AT token
  is gone, switch back, assert it returned.
- Plan mode: every existing Today test stays green unmodified except where
  it asserts the OLD deterministic first pick; those inject a fixed rng.

## 3. PR2 — the duration range

### 3.1 Invariants

- **I-9 Range, not buckets.** Both sheets carry one TIME control expressing
  `[min, max]` minutes in 5-minute steps, min from 0, max to 120 where 120
  means "no upper bound" and 0 means "no lower bound". `[0, 120]` is the
  no-filter state.
- **I-10 Membership.** A workout qualifies when `min ≤ estMinutes ≤ max`
  (max unbounded at 120), using the same `estimateMinutes` both screens
  already use; with baselines unset the TIME group is skipped exactly as
  `durationsUnknown` skips it today.
- **I-11 Thumbs cannot cross.** `min ≤ max` always; dragging one into the
  other pushes neither — the moving thumb stops at the other's value.
- **I-12 Defaults.** Today's no-filter default for every key is
  `[0, cap]` where `cap` is the account's `timeCapMinutes` rounded UP to
  the next 5 (a 60 cap reads `[0, 60]`); Library's is `[0, 120]`.
- **I-13 Tokens.** The active-filter token reads `25–35′`, `≤45′`, `60′+`,
  and nothing when `[0, 120]`; deviation detection compares against the
  key's default.

### 3.2 Domain

`domain/duration.ts`: `DurationBucket`, `DURATION_BUCKETS`,
`DURATION_LOWER_BOUND`, `bucketFor`, `bucketsForCap` are RETIRED — no
consumer survives this PR. The ROADMAP row names all twelve consumer files
(James's 2026-09-04 rule: a change that makes code unreachable adds its
removal row in the SAME PR), and PR2 removes every one, including the two
shared helpers `components/durationChips.ts` and
`components/durationTokenLabel.ts` and the `design.spec.ts` sweep that
reads the bucket chips. Replacements: `DurationRange =
{ min: number; max: number }`, `DURATION_RANGE_MAX = 120`,
`DURATION_STEP = 5`, `isUnbounded(range)`, `inRange(minutes, range)`,
`rangeForCap(cap)`. `SuggestPrefs.durations` becomes `durationRange`.
`server/` has no consumer (grepped 2026-09-04: `routes/data.ts` matches
only on the word `durations` in an export label; `domain/recency.ts` only
in a comment).

### 3.3 Stored shapes

`todayFilters` → `v: 2`, `durationRange` replaces `durations`; a v1 record
fails whole and reads as defaults (a rower loses at most one day's
remembered TIME setting per key, stated in the notes). Library's
sessionStorage record (`libraryFilters.ts`) bumps its parser the same way;
it lives one BACK round trip, so nothing is lost. Server: no change.

### 3.4 UI

One rail, two thumbs, the current values printed above each thumb in the
house mono numerals (`25′` … `35′`; `120′+` at the top; `0′` at the
bottom reads `ANY`). 44 px thumbs (WCAG 2.5.5 target size, the repo's hard
requirement), rail height 4 px, thumb colour `--ink`, rail `--rule-3`,
selected span `--accent`. Each thumb is a native `<input type="range"
min=0 max=120 step=5>` with `aria-label="Shortest"` / `"Longest"` and
`aria-valuetext` "25 minutes" / "no limit". Keyboard: arrows step 5, Home/End
to the bounds, Page Up/Down step 15 (the optional larger step). Both sheets
render the identical component (`components/DurationRange.tsx`).

### 3.5 Gate 0

Both sheets, both orientations, at real proportions, before and after on
the same seeded pool, with the token row in three states (`25–35′`,
`60′+`, none). Contrast for every new pairing computed and stated
(`--ink` thumb on `--page`, `--accent` span on `--rule-3`, mono value text
on `--page`). A number changes here — the sheet's live "N options" count —
so the gate shows the count before and after for one identical pool.

### 3.6 Oracles

Domain: `inRange` boundary table (24/25/35/36 against `[25,35]`, 120+ tail
against `[60,120]`); mutation flips each comparison. Seam: apply `[25,35]`
on Today and assert the card's own printed minutes fall inside it, on the
real library (RF11 — the card's number is the oracle, not the filter's
opinion of itself). Keyboard: the roving tests from `PaceRefInput` adapted
(RF8): arrow steps, Home/End, the no-cross clamp under both thumbs. e2e
design sweep: both thumbs ≥ 44 px hit boxes in portrait and landscape.

## 4. PR3 — Library name search and the source rename

### 4.1 Invariants

- **I-14 Search.** A text field above the FILTER ⌄ row filters the list to
  titles containing the trimmed query, case-insensitive, live on input,
  composing with every other filter (AND). Empty query = no filter. The
  count row reads `N OF M SHOWN` while a query is active, CLEAR ALL clears
  it with the rest.
- **I-15 Lifetime.** The query rides the existing sessionStorage BACK
  record (`libraryFilters.ts`) and is cleared where that record is cleared
  (the tab bar's LIBRARY link) — returning from a detail lands on the same
  list, opening the tab starts clean. Never remembered beyond that.
- **I-16 Field.** 44 px tall, mono placeholder `SEARCH BY NAME`, a clear
  control inside the field when non-empty (44 px), `type="search"`,
  `autocapitalize="none"`, `enterkeyhint="search"`, no autofocus (the list
  is the point of the screen, not the field).
- **I-17 Rename.** `GLOBAL` → `LIBRARY`, `CUSTOM` → `MINE` at all four copy
  sites (`library/FilterSheet.tsx`, `library/filterTokens.ts`,
  `today/TodayFilterSheet.tsx`, `today/todayFilterTokens.ts`). Stored values
  stay `"global"` / `"custom"`; no shape changes.

### 4.2 Gate 0

Library at rest, with a query typed (`fog`), and with a query plus a type
chip, portrait and landscape; the SOURCE group on both sheets with the new
labels. Contrast for the placeholder on `--page` computed and stated.

### 4.3 Oracles

Client: `applyFilters` with `query: "FOG"` on the seed matches `River Fog`
and not `Graupel`; with `query: " fog "` the same (trim); composed with
`types: ["O2"]`. Mutation: drop `toLowerCase` (uppercase query matches
nothing), drop trim. e2e: type into the field, open a matching row, BACK,
assert the query and the list are as left; tap the LIBRARY tab, assert
clean.

## 5. The rename, and why MINE

James asked for LIBRARY in place of GLOBAL and a recommendation for CUSTOM.
The pair has to read as two sources of one list: where a workout CAME FROM.
`LIBRARY` / `MINE` does that in one word each and in the mono caps the
tokens use; `YOURS` addresses the rower in the second person, which no other
token does; `BUILT-IN` is two words and a hyphen at chip width. James is
free to keep CUSTOM ("i'm okay keeping it too"); the spec ships MINE unless
he says otherwise at PR3's Gate 0.

## 6. Decomposition and order

1. **PR1** — §2. TRIAD. Antagonist anchor pass on this spec (whole spec,
   with §2 as the riskiest), PM open gate on the slate, PM final gate on
   the PR. Gate 0: the freestyle Today with a rolled chip, portrait and
   landscape (small — it is #296's screen with a lit chip).
2. **PR2** — §3. TRIAD. Antagonist DELTA on the range (new stored shape,
   new domain predicate, a number changes); PM final gate. Gate 0 per §3.5.
3. **PR3** — §4. Light cycle: antagonist SKIP spoken (the gate-class paragraph above), no PM gate,
   James reviews. Gate 0 per §4.2.

Then a phase close: antagonist exit pass on the exit evidence, PM close,
one release (`vX.Y.0`, notes covering all three), agent-config check.

## 7. Exit criteria

1. Twelve SHUFFLE taps on the seed library show twelve distinct titles;
   a reload keeps the twelfth (e2e, PR1).
2. A freestyle account reloaded three times in one day shows one lit chip;
   the next local day rolls (client test with a stubbed clock, PR1).
3. A filter applied under AT is absent under TR and present again under
   AT after a reload (e2e, PR1).
4. `[25, 35]` on Today yields a card whose printed minutes are within
   25–35 on the seed at the screenshot baseline (e2e, PR2).
5. Both thumbs are keyboard-operable per §1.3's list and cannot cross
   (client tests, PR2).
6. `fog` finds River Fog and survives a BACK round trip; the LIBRARY tab
   clears it (e2e, PR3).
7. No SHUFFLE, chip, apply or roll issues a request: an e2e route counter
   on `/api/**` reads zero across the interactions in criterion 1 and 3
   (PR1).
8. `git grep DurationBucket` is empty after PR2 (the removal row closed).

## 8. Out of scope, said aloud

Library per-type memory ("Library doesn't remember"). Lazy-loading the
library (constraint honoured, feature not built). Server-side suggestion.
Sorting the Library list. Any change to plan-mode swap semantics.
