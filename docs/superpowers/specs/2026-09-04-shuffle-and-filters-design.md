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
stored shapes, `domain/suggest.ts` and `domain/duration.ts` change, the
server's `/api/today` route (which calls `suggest()` and `bucketsForCap`,
`server/routes/data.ts`) changes in PR1 and PR2, and PR2 changes which
workouts qualify for a filter (a number's meaning). PR1 and PR2
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
- "Library doesn't remember" — his answer to the controller's question
  "should every combination of Library types get its own memory?": per-type
  filter memory is Today only.
  Library's existing sessionStorage record is a BACK round-trip aid
  (`libraryFilters.ts`'s own comment), not memory, and stays as it is.
- "I'm concerned about making sure the shuffle remains performant and limits
  network calls when possible" — §2.5 states the network contract: zero
  requests per tap, unchanged fetch count per mount.
- "I was thinking we change 'global' to 'library' and i could use a
  recommendation on custom" — LIBRARY / MINE (§5).

**Revision 1 (2026-09-04), after the antagonist anchor pass and the PM open
gate.** Eleven antagonist findings and seven PM verdicts folded; the two that
changed the design outright are the range control (§1.3, §3.4 — the
two-native-inputs overlay is not a supported pattern) and the random draw's
home (§2.2 — `suggest()` stays deterministic and returns the tie class; the
client draws once at mount). The ledger entries for both passes carry the
techniques. Where the two agents disagreed on PR order, §6 says which way
and why.

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

**The native element does not do this, and revision 0 said it did.** MDN
`<input type="range">` (PRIMARY): "a numeric value" (singular). Revision 0
proposed two overlaid native inputs on one rail "keyboard-complete … for
free". The anchor pass falsified it: nothing in the HTML range state limits
a range input's hit region to its thumb, so the upper input wins every
pointer event on the rail, and the only way through is `pointer-events` on
`::-webkit-slider-thumb`, which MDN (PRIMARY) labels *"Non-standard: This
feature is not standardized. We do not recommend using non-standard features
in production"*; the CSSWG's own replacement carries an open issue
(PRIMARY, `css-forms-1`, public-css-archive 2025Mar/0416): *"The pseudo
elements for the 'slider' controls do not support multiple thumbs."*
SECONDARY: MUI's Slider renders each thumb as a styled `span` wrapping a
visually-hidden native input that carries the ARIA; the APG pattern itself is
custom `role="slider"` nodes; USWDS ships single-thumb only. **Decision: a
custom two-thumb control, `components/DurationRange.tsx`, per the APG
pattern** — each thumb a 44 px `role="slider"` button with the four ARIA
values, arrow/Home/End/PageUp/PageDown handled by us, pointer drag via
Pointer Events with `setPointerCapture`, and the no-cross rule as a clamp.
RF8 applies in the direction it was written: reuse `PaceRefInput`'s keyboard
test shape, and gate every key in §3.6.

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
  Today mount shows the same card and (in freestyle) the same lit chip —
  CONTINGENT on the pool containing the stored id (§2.4) and on the write
  landing (§2.3, storage denial).
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
  drawn uniformly among types whose pool under that type's remembered
  filters is non-empty WITHOUT falling back (PR1 review F2: a type whose
  remembered filters match nothing would open the morning on "Nothing fit
  your filters", which is not a suggestion, so it is not a candidate; if
  every type falls back there is no roll and the day opens on ANY TYPE).
  A tap overrides for the day. Tapping the lit chip clears to ANY TYPE
  FOR THE REST OF THE DAY — a remount today does not re-roll — and
  tomorrow rolls again. **James's Gate 0 ruling (2026-09-04): "I don't
  like the sticky clear, can it default to on?"** — revision 1's sticky
  clear (a clear that suppressed every later day's roll until a chip was
  tapped) is struck; the roll is always on. A plan being active suppresses
  the roll entirely.
- **I-6 Per-type memory.** Today's five filter groups are remembered per
  key in {O2, AT, TR, AN, ANY}, undated, across reloads and days. The key
  is the EFFECTIVE type in both modes: with a plan, `swapType ??
  prescribedCode` (a checkpoint day keys on the day's own type); in
  freestyle, the lit chip, or ANY when none is lit. Switching the key
  switches the whole set. Applying the sheet writes the current key only.
  CLEAR ALL (Today's existing control on its token row, `today-clear-all`)
  resets the current key to its preference-derived defaults. A key never
  written reads as those defaults.
- **I-7 Plan mode unchanged.** With a plan, the chip row, swap arrow,
  checkpoint pin, `CHECKPOINT OVERRIDDEN` marker and un-swap rule behave
  exactly as on main today; only the ORDER of the pool and the memory of the
  filters change.
- **I-8 Zero network.** No SHUFFLE tap, chip tap, sheet apply, or daily roll
  issues a request. Today's per-mount fetch count is unchanged.

### 2.2 Domain (pure, `domain/suggest.ts`)

**`suggest()` and `suggestFreestyle()` stay deterministic and take no rng.**
Revision 0 injected an rng into them; the anchor pass showed `suggestion` is
recomputed on every render and a second time per render against the sheet
draft (`poolCountFor`), so a draw inside would re-roll on every keystroke.
Instead each returns one more field: `tieIds: string[]`, the ids sharing
`sortedPool[0]`'s `lastDoneDaysAgo` (null ties with null; `byLeastRecentlyDone`
already sorts null first and `Array.prototype.sort` is stable). `poolIds`
and `recommendationId` keep their meanings; with no `todayPickId`,
`recommendationId` is still `sorted[0]` — which is what the server's
`/api/today` (no client caller; integration-tested) keeps returning.

Two pure helpers in `domain/suggest.ts`, tested with an injected rng:

- `drawOne(ids, rng)` — uniform over `ids` by rejection sampling on a
  32-bit draw; the only place randomness enters the domain.
- `nextShuffle(poolIds, shownIds, currentId, rng)` — candidates = pool minus
  shown minus current; if empty, candidates = pool minus current; returns
  `{ id, shownIds }` with the new id appended, or restarted at `[id]` when
  the set had reset. Pure over the arrays it is handed — §2.4.

**The client draws ONCE, at mount.** `TodayView` receives the resolved
library as a prop (the `LOADING…` gate above it holds until all five hooks
resolve — vetted ground), so the pick's lazy initializer can compute the
day's suggestion, read `tieIds`, call `drawOne` with the client rng
(`crypto.getRandomValues` on a `Uint32Array(1)`), write the pick, and return
it. **Every later render passes that id back as a NEW input, `drawnId`, not
as `todayPickId`** (implementation finding, PR1): `todayPickId` means "the
rower shuffled" — it says YOUR PICK and beats a checkpoint pin — while the
day's draw is not the rower's act, so `drawnId` is honoured for the card,
reported with the standard "Least recently done" reason (a tie member IS
least recently done), and never beats the pin. The stored pick carries a
`shuffled` boolean to tell the two apart (`shownIds` restarts at one id
after a reset, so length cannot). The daily type roll lives in the day
record's initializer the same way. Neither draw runs on a checkpoint day
(the pin shows) or without baselines (the doors card shows). React
StrictMode's double invocation is development-only and reads the first
call's write (vetted ground); the render impurity is confined to these two
initializers and named in their comments.

### 2.3 Stored shapes and the lifetime table (RF27)

**`ergomatic.todayPick`** (existing, per day) gains `shownIds: string[]`
and `shuffled: boolean` (false for the day's draw, true once SHUFFLE has
been tapped — §2.2). Validation: an array of strings and a boolean, else
the record fails whole (the existing all-or-nothing rule in
`todayPick.ts`); a same-day pre-PR1 record therefore reads as nothing
stored, and the day redraws once — the stated deploy-day cost. The record is already invalidated on
a `date`/`planKey`/`doneN` mismatch; nothing new there.

**`ergomatic.todayOverrides`** (existing, per day) LOSES the five filter
groups and keeps `{date, planKey, doneN, swapType}`. Revision 0 claimed an
old record "fails validation"; it does not — `parseOverrides` builds its
result from named fields and ignores extras, so a pre-PR1 record from the
SAME day validates and its `swapType` survives, which is the right outcome.
The safety net is the `date`/`planKey`/`doneN` key, not the parser. No
migration, no half-object: every reader of the five removed fields is in
`src/today/` (vetted ground) and PR1 rewrites all of them.

**`ergomatic.todayFilters`** (NEW, undated):
`{ v: 1, byKey: Partial<Record<"O2"|"AT"|"TR"|"AN"|"ANY", FilterSet>> }`.
"Cleared today" versus "not yet rolled today" (the anchor pass's F3) is
told apart on the DATED day record, not here: the freestyle roll always
writes today's record (even when it lights nothing), so a missing record
means "not yet rolled" and a record with `swapType: null` means "cleared
today"; tomorrow's date mismatch rolls again. (Revision 1 kept an undated
`rollSuppressed` flag here for the sticky clear; James struck it.)
`byKey` holds one `FilterSet` per key, where
`FilterSet = { difficulties, durations, painLevels, lastDone, source }` — the
same five fields `todayOverrides` carries today, with the same validators
moved over. PR2 swaps `durations` for `durationRange` and bumps `v`.

| State | Minted | Cleared / replaced | Survives reload | Survives day change | Survives plan change |
|---|---|---|---|---|---|
| `todayPick.workoutId` | first mount of the day (I-2) or SHUFFLE | SHUFFLE; date/plan mismatch | yes | no | no |
| `todayPick.shownIds` | with `workoutId` | reset by `nextShuffle` on exhaustion; date/plan mismatch | yes | no | no |
| `todayPick.shuffled` | false with the draw; true on SHUFFLE | date/plan mismatch | yes | no | no |
| `todayOverrides.swapType` | daily roll (freestyle, I-5 — the record is written even when nothing is rolled) or chip tap | chip tap; date/plan mismatch | yes | no | no |
| `todayFilters.byKey[K]` | first sheet apply or CLEAR ALL under key K | next apply/CLEAR ALL under K | yes | yes | yes |
| in-memory `suggestion` | every render | — | n/a | n/a | n/a |

The daily roll and the first pick are both WRITE-ONCE-PER-DAY: the mount
reads the record, and only a null read triggers a draw followed by a write.
Two Today mounts in the same tick read-then-write in one initializer, so the
second reads the first's write (vetted ground).

**The write can fail, and the failure has an owner (RF25).** `saveTodayPick`
and `saveTodayOverrides` return booleans nobody reads today. Under storage
denial (researched 2026-09-03) a draw that cannot persist would re-roll on
every mount — a card that changes on every tab round trip, strictly worse
than today's stable one. Owner: the initializer keeps a module-scope
fallback (`Map<dayKey, {pick, swapType}>`) written whenever the storage
write returns false, CLEARED whenever a later write of that field lands,
and consulted BEFORE storage (PR1 review F1: an entry present is therefore
always newer than what storage holds — without that order, storage healthy
at mount and denied on a later SHUFFLE would hand the next mount the older
stored pick and regress `shownIds` into repeats). It survives remounts
within the app's life and is lost on relaunch, which is the stated,
accepted cost — the same population and the same acceptance the
storage-denial spec records for `session/run.ts`.

### 2.4 The lazy-load constraint (James)

The domain helpers take ARRAYS OF IDS and never ask whether they are the
whole library. If `useWorkouts` later pages, the pool is whatever is loaded,
`shownIds` may name ids not in the current pool (they are simply not
candidates), and a stored `workoutId` not in the pool already falls through
to a fresh first pick (existing `sorted.find` → undefined path). No helper
may hold a reference to the library between calls, cache a sorted copy
across renders, or key anything on `library.length`. This is the invariant
a lazy-load phase inherits. **Two more it inherits, found by the anchor
pass:** I-1 holds only while the pool contains the stored id — a stored
pick outside the current pool is IGNORED by `suggest()` and the card shows
the pool's least-recently-done head, deterministically, until the next
SHUFFLE draws afresh (revision 1 said "a fresh draw"; the implementation
keeps pre-PR1's fall-through, because drawing during render would be
impure and a filter change is the rower's act, not a new day) — a paging
phase must fetch the stored id's row or accept that fall-through, and `suggest()`'s reason strings ("Your library
is empty.", "No {type} sessions in your library.") and its `fellBack` flag
assert facts about the WHOLE library; a paging phase must re-scope them to
"in what is loaded" before it ships.

### 2.5 Performance and network

Per tap: one `Uint32` draw, one `Set` of at most pool-size ids, one
`localStorage.setItem` of a record bounded by the pool size (300 UUIDs
serialise to 11,810 bytes — measured with `node -e` over
`crypto.randomUUID()` ids, 2026-09-04 — well inside any quota). No request. Per mount: `GET /api/workouts`
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
- e2e: on the real 300-workout library, from a cleared store, two
  independent runs of 12 SHUFFLE taps produce DIFFERENT sequences with no
  repeat inside either run; reload keeps the 12th. (The PM ran revision 0's
  "12 distinct titles" against main and it is GREEN on the unfixed cycle —
  RF21 in exit-criterion form.) Freestyle:
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
- **I-12 Defaults.** Today's default for every key is `[0, rangeForCap(cap)]`
  where `rangeForCap` rounds the account's `timeCapMinutes` DOWN to the
  step and clamps at 120 (`10..300` is the server's validated range; 47 →
  45 so nothing longer than the cap is admitted; ≥120 → 120 = unbounded).
  Library's default is `[0, 120]`.
- **I-13 Tokens, stated per cell** (anchor finding: a sentinel and a
  per-account default cannot both govern one control in prose). The token
  renders whenever the range differs from the KEY'S DEFAULT and never
  otherwise: at default → no token; `[0,120]` when the default is `[0,60]`
  → `ANY LENGTH` (a real deviation, with its own ✕, which restores the
  default); `[25,35]` → `25–35′`; `[0,45]` → `≤45′`; `[60,120]` → `60′+`.
  On Library the default IS `[0,120]`, so `ANY LENGTH` never renders there.

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
`server/routes/data.ts` IS a consumer — revision 0 said otherwise and the
PM gate caught it: `/api/today` imports `bucketsForCap` and calls it as
`durations: bucketsForCap(prefs.timeCapMinutes)`. PR2 moves it to
`durationRange: rangeForCap(prefs.timeCapMinutes)`, keeping the server's
TIME semantics identical to the client's. `domain/recency.ts` names the
bucket only in a comment.

### 3.3 Stored shapes

`todayFilters` → `v: 2`, `durationRange` replaces `durations`. **A v1
record is MAPPED, not discarded** (PM finding: fail-whole is free on a
dated record and costs permanent memory on an undated one): a bucket IS a
range, so the union of stored buckets becomes `[lowest lower bound, highest
upper bound]` with `60+` → 120 and an empty union → the key's default.
Library's sessionStorage record (`libraryFilters.ts`) makes `durationRange`
REQUIRED in its parser (never lenient like `lastDone`); it lives one BACK
round trip, so a rejected record costs nothing. `hasActiveFilters` and
`EMPTY_FILTERS` change from a cardinality test on `durations` to
`isUnbounded(durationRange)`. Server: `rangeForCap` per §3.2.

### 3.4 UI

One rail, two thumbs, the current values printed above each thumb in the
house mono numerals (`25′` … `35′`; `120′+` at the top; `0′` at the
bottom reads `ANY`). 44 px thumbs (WCAG 2.5.5 target size, the repo's hard
requirement), rail height 4 px, thumb colour `--ink`, rail `--rule-3`,
selected span `--accent`. Per §1.3 the control is CUSTOM: each thumb is a
`<button role="slider">` carrying `aria-valuemin=0`, `aria-valuemax=120`,
`aria-valuenow`, `aria-valuetext` ("25 minutes" / "no limit" / "any"),
`aria-label="Shortest"` / `"Longest"`, and `tabIndex=0`. Keyboard per the
APG list: arrows step 5, Home/End to the bounds, Page Up/Down step 15.
Pointer: `pointerdown` on a thumb captures the pointer, `pointermove` maps
x to the nearest step, the no-cross clamp stops the moving thumb at the
other's value; a tap on the rail moves the NEARER thumb. Both sheets render
the identical component (`components/DurationRange.tsx`). Contrast and hit
boxes are gated in §3.5/§3.6.

### 3.5 Gate 0

Both sheets, both orientations, at real proportions, before and after on
the same seeded pool, with the token row in three states (`25–35′`,
`60′+`, none). Contrast for every new pairing computed and stated
(`--ink` thumb on `--page`, `--accent` span on `--rule-3`, mono value text
on `--page`). A number changes here — the sheet's live "N options" count —
so the gate shows the count before and after for one identical pool —
**in both directions**, because the change is not uniformly looser or
stricter: `bucketsForCap(90)` admitted every bucket while `[0,90]` excludes a
95-minute workout (stricter for caps 61–119), and at the boundary
`bucketFor(60)` = `60+` was EXCLUDED by `bucketsForCap(60)` while
`inRange(60, [0,60])` admits it (looser at the exact cap). The capture names
one workout that flips each way.

### 3.6 Oracles

Domain: `inRange` boundary table (24/25/35/36 against `[25,35]`, 120+ tail
against `[60,120]`); mutation flips each comparison. **Rounding rule, stated:** `inRange` reads `estimateMinutes(...).minutes` —
the SAME integer the card prints — never a float, so the card and the
filter can never disagree by rounding. Seam: apply `[25,35]` on Today and
assert the card's own printed minutes fall inside it, on the real library —
labelled honestly as a SEAM check (both sides derive from `estimateMinutes`;
it catches wiring, not the estimate), not an external oracle. Keyboard: the roving tests from `PaceRefInput` adapted
(RF8): arrow steps, Home/End, the no-cross clamp under both thumbs. e2e
design sweep: both thumbs ≥ 44 px hit boxes in portrait and landscape.

## 4. PR3 — Library name search (the rename moved to PR2, §4.4)

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
- **I-17 Rename (ships in PR2, same two sheets, same Gate 0 captures — PM
  finding).** `GLOBAL` → `LIBRARY`, `CUSTOM` → `MINE` at every RENDERED
  site, six not four (PM count): `library/FilterSheet.tsx`,
  `library/filterTokens.ts`, `today/TodayFilterSheet.tsx`,
  `today/todayFilterTokens.ts`, the row badge in `library/WorkoutRow.tsx`
  (`workout-row-custom`), and the Library empty state ("No custom workouts
  yet"), plus the e2e selectors that read `name: "CUSTOM"`. Stored values
  stay `"global"` / `"custom"`; no shape changes. **PR2's Gate 0 shows
  LIBRARY / MINE beside BUILT-IN / MINE**: the PM notes a chip reading
  LIBRARY inside the Library tab can read as "not yours", and James picks.

### 4.2 Gate 0

Library at rest, with a query typed (`fog`), and with a query plus a type
chip, portrait and landscape. Contrast for the placeholder on `--page`
computed and stated.

### 4.4 The rename's home

The rename is PR2 work (I-17): it touches the same two sheets PR2 already
re-renders, carries no risk model of its own, and its Gate 0 rides PR2's.
PR3 is search alone.

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
he says otherwise at PR2's Gate 0, where LIBRARY and BUILT-IN are both
rendered for the first half.

## 6. Decomposition and order

1. **PR1** — §2. TRIAD. Anchor pass DONE (revision 1 folds it); PM open
   gate DONE (OPEN WITH CONDITIONS, folded); PM final gate on the PR.
   Gate 0: the freestyle Today with a rolled chip, portrait and landscape.
   James ruled at it: no sticky clear (I-5), the inline build shape is
   fine (CLAUDE.md), and ONE release at phase close. Touches `server/routes/data.ts`
   only to keep `/api/today` compiling against `suggest()`'s new field.
2. **PR2** — §3 plus the rename (§4.4). TRIAD. Antagonist DELTA on the
   custom control and the v1→v2 mapping; PM final gate. Gate 0 per §3.5
   with both rename pairs rendered.
3. **PR3** — §4, search alone. Light cycle: antagonist SKIP spoken (the
   gate-class paragraph above), no PM gate, James reviews. Gate 0 per §4.2.

**Order, ruled.** The anchor pass recommended PR2 → PR1 so `todayFilters`
is born at v2 and no tester ever writes a v1 record; the PM recommended
PR1 first because SHUFFLE is the item James found first and testers will
notice most, with PR2 MAPPING v1 → v2 (§3.3) so nothing is lost. The spec
takes the PM's order: the mapping is four lines. **Release: ONE tag at
phase close covering #296, PR1, PR2 and PR3 (James, PR1's Gate 0:
"release after all of this phase")** — revision 1's tag-after-PR1 is
struck.

Then a phase close: antagonist exit pass on the exit evidence, PM close,
the release, agent-config check.

## 7. Exit criteria

Each names its oracle and whether it is external, a seam, or structural
(RF11). The PM's rule, adopted: for each, the CURRENT behaviour that fails
it is named, so none is green on main.

1. From a cleared store, two independent runs of twelve SHUFFLE taps on the
   seed library produce different sequences, neither repeating inside
   itself; a reload keeps the twelfth (e2e, PR1). Fails on main: the cycle
   is identical every run.
2. A freestyle account reloaded three times in one day shows one lit chip;
   the next local day rolls; a lit-chip clear stays ANY TYPE across a
   reload AND the next day until a chip is tapped (client tests with a
   stubbed clock, PR1). Fails on main: nothing is lit.
3. A filter applied under AT is absent under TR and present again under
   AT after a reload and after a day change (e2e + client, PR1). Fails on
   main: filters die at midnight.
4. `[25, 35]` on Today yields a card whose printed minutes are within
   25–35 on the seed at the screenshot baseline — a SEAM check, both sides
   `estimateMinutes` (e2e, PR2). Fails on main: no such range exists.
5. Both thumbs are keyboard-operable per §1.3's list, cannot cross, and
   both hit boxes are ≥ 44 px in portrait and landscape (client tests +
   design sweep, PR2).
6. `fog` finds River Fog and survives a BACK round trip; the LIBRARY tab
   clears it (e2e, PR3).
7. Across mount + twelve SHUFFLE taps + two chip taps + one sheet apply,
   the e2e request LIST equals a recorded baseline of exactly the mount's
   own fetches (PR1). Revision 0 counted requests and read zero — but zero
   is already main's value (anchor finding, RF21). The list form catches an
   added remount or refetch; the PR proves it red by adding one fetch.
8. `git grep DurationBucket -- app/` returns nothing after PR2 (path-scoped:
   the unscoped grep matches this spec and the ROADMAP row forever).
9. Every rendered SOURCE label reads the chosen pair, including the row
   badge and the empty state (e2e, PR2). Fails on main: CUSTOM / GLOBAL.

## 8. Out of scope, said aloud

Library per-type memory ("Library doesn't remember"). Lazy-loading the
library (constraint honoured, feature not built). Server-side suggestion.
Sorting the Library list. Any change to plan-mode swap semantics.
