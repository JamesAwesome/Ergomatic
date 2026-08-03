# Today enhancements — visible filters, type-swap, outside-plan logging

**Date:** 2026-08-02
**Status:** Approved (James, 2026-08-02: filter scope = difficulty + time +
pain; overrides ephemeral per-day; swap = type chips on the plan line,
ephemeral, "the log tells the story"; outside-plan logging added mid-brainstorm)

## Problem

Three gaps in the plan flow:

1. Today honours the preference-level suggestion filters invisibly — and
   **no screen edits those preferences at all** (the server PATCH exists,
   verified `data.ts:543`; no client calls it). The rower can't see or
   adjust what's narrowing their suggestion.
2. A plan day prescribes one type; there's no way to row a different
   type today without abandoning the plan. `suggest()` takes `todayCode` —
   a swap is simply a different code's pool (SHUFFLE cycles within one).
3. Every logged session advances `done_n` unconditionally (Phase 4 store
   behaviour, verified). A bonus row shouldn't have to consume a plan slot.

## Verified facts

- Prefs: `difficulties` (default all three), `timeCapMinutes` (default 60,
  server-validated 10..300), via `GET /api/prefs`; no client editor.
- `suggest(input)` filters the `todayCode`-matched pool by difficulties +
  `estMinutes <= timeCapMinutes`; `fellBack` when the type pool is
  non-empty but filters match nothing. `suggestFreestyle` = same, whole
  library. `durationsUnknown` suppresses cap claims in reason text.
- `todayPick` (localStorage) keys on `{date, planKey, doneN}` — any
  mismatch silently discards. A pick absent from the pool falls back to
  `sorted[0]` inside suggest (verified `suggest.ts:117-120`).
- `PlanCode = WorkoutType | "TEST"`; `suggest` maps TEST → the TR pool.
- The plan line renders `SESSION {doneN+1} OF 84 · {code}`.
- `POST /api/logs` advances `done_n` in the store; the Log screen (6C) has
  two doors sharing `useLogForm`/`LogScreen`.

## Decisions

| Question | Decision |
|---|---|
| Filter scope on Today | Difficulty + time cap + **pain** (a `PAIN ≤3` toggle — `pain` is already on every `LibraryEntry`; small `suggest()` extension). Not the Library's full chip set. |
| Persistence | **Ephemeral per-day override.** Chips start from the server prefs each day; changes affect today only. The server pref stays the daily starting point (currently always the defaults — a durable You-screen editor is out of scope). |
| Swap UX | **Type chips on the plan line** (AN/O2/AT/TR, the prescribed one active). Tap another → today's pool swaps; line reads `SESSION 5 OF 84 · O2 → AT`. Tap the prescribed chip → un-swap. TEST days: TR renders active (TEST pools TR); swapped display `TEST → AN`. |
| Swap record | **Ephemeral; the log tells the story.** The plan sequence stays canonical; the logged session's own type in LAST THREE/history is the record. Zero swap-related server changes. |
| Swapped session advances the plan? | Yes, by construction (any log advances `done_n`) — and composably, a swap the rower doesn't want counted can be marked outside-plan at log time. |
| Outside-plan logging | `POST /api/logs` gains optional **`advancesPlan?: boolean`, default `true`** — additive; every existing payload keeps its meaning. Store skips the `done_n` increment when `false`. |
| Log-screen toggle | Both doors, shown **only when a plan is active**. Default counts-toward-plan on both doors (changing the manual door's default silently would surprise). Freestyle: hidden, field omitted. |
| Freestyle | Filter chips yes; type chips no (swap is plan-only — freestyle's pool is already the whole library). |

## Design

### 1. `domain/suggest.ts` (extension)

`SuggestPrefs` gains `painMax3?: boolean` and `timeCapMinutes` widens to
`number | null` (`null` = no cap; the cap filter clause is skipped, not
compared against a sentinel). Both `suggest` and `suggestFreestyle` add
`(!prefs.painMax3 || e.pain <= 3)` to the filter predicate.
`buildReason`'s fallback wording names only the dimensions actually
checked: parts = `difficulty` always, `time` only when a cap exists and
durations are known, `pain` when `painMax3` — joined with `/` (e.g.
"Nothing fit your difficulty/time/pain filters — …"). The non-fallback
reason cites the cap only when one exists: capless reads
"Least recently done (…)." — the same sentence the `durationsUnknown`
branch already produces, for the same honesty reason. Existing callers
pass a number today, so the widening breaks nobody.

### 2. `src/today/todayOverrides.ts` (new, mirrors `todayPick.ts`)

localStorage key `ergomatic.todayOverrides`, one record:

```ts
interface TodayOverrides {
  date: string;            // "YYYY-MM-DD" local, same as todayPick
  planKey: string | null;
  doneN: number | null;
  swapType: WorkoutType | null;   // null = no swap
  difficulties: Difficulty[];     // the chips' current state
  capMinutes: number | null;      // null = NO CAP
  painMax3: boolean;
}
```

`load(today, planKey, doneN)` returns the record only when all three keys
match exactly; garbage/shape-mismatch/stale → `null` (the todayPick
idiom, same strict validation style as `libraryFilters.ts`). `save`/
`clear` best-effort. **One invalidation rule for all of today's mood:** a
new day, a switched/reset plan, or a doneN advance resets swap + filters
together — same semantics the pick already has. (See the Amendment below:
this used to also say "a logged session," which is imprecise — the
trigger is specifically the doneN advance, not the act of logging.)

### 3. Today UI (`Today.tsx`)

- **State:** `TodayView` holds `overrides` state, lazy-initialized:
  stored record if valid, else built from the server prefs
  (`difficulties` as-is; `capMinutes` = the smallest of 30/45/60/90 ≥ the
  pref, or `null` (NO CAP) when the pref exceeds 90 — with the default
  pref of 60 this is exact; the approximation is acknowledged in a
  comment). Every change saves the record.
- **Type chips** (plan active only): rendered in/beside the plan line,
  44px targets, `aria-pressed`, same `.chip` idiom as the Library.
  Active chip = `swapType ?? prescribed` (TEST → TR). Tapping the
  prescribed chip sets `swapType: null`. The line's code segment shows
  `{code}` unswapped or `{code} → {swapType}` swapped.
- **Filter chips row** (both modes), under the suggestion header:
  `EASY MED HARD` multi-select; cap single-select `≤30′ ≤45′ ≤60′ ≤90′
  NO CAP`; `PAIN ≤3` toggle. Deselecting every difficulty is allowed and
  simply produces the fellBack pool (suggest already handles the empty
  filter result), matching the Library's "no match" honesty.
- **Effective inputs:** `todayCode` passed to `suggest` becomes
  `overrides.swapType ?? sequence[doneN].code`; prefs passed = chip
  state (`timeCapMinutes: capMinutes` — `null` flows straight through as
  "no cap"; `durationsUnknown` unchanged). The pick interplay needs no
  new code: a pick outside the new pool falls back inside `suggest`.
- SHUFFLE, the resume/unlogged cards, LAST THREE: untouched.

### 4. Outside-plan logging

- **Server** (`data.ts` + the log store): `advancesPlan` optional boolean
  on the POST body; `false` → the store's `done_n` increment is skipped;
  absent/`true` → today's behaviour. Validation rejects non-boolean.
  Additive-only holds: no existing payload changes meaning.
- **Log screen:** `useLogForm`'s body assembly gains the field; a toggle
  row above Save (both doors), rendered only when the plan hook reports
  an active plan: default `COUNTS TOWARD PLAN · SESSION 5 OF 84`; tapped:
  `OUTSIDE THE PLAN — won't advance`. 44px target, `aria-pressed`,
  staged-nothing (a single toggle, not destructive). Freestyle: no row,
  field omitted from the POST (not `true` — omitted, proving the default
  path stays exercised).

## Error handling

- Storage failures: best-effort save/load (the todayPick/libraryFilters
  conventions) — a lost override is a shrug, never an error surface.
- A swap to a type with an empty library pool renders the existing
  "No {type} sessions in your library." empty card; the chips stay
  interactive so the rower can swap back (test this).
- `advancesPlan: false` with no active plan: server accepts and no-ops
  (done_n increment is already conditional on a plan row existing —
  verify; if it isn't, make the skip unconditional-safe).

## Testing

- **Domain tables:** painMax3 filtering (in/out at pain 3/4, interaction
  with fellBack), reason wording for every dimension combination
  (durationsUnknown × painMax3), freestyle parity.
- **todayOverrides:** validation table (each field's wrong shape, stale
  date/planKey/doneN, garbage JSON), round trip, the fresh-object rule.
- **Client (Today):** chips initialize from prefs (cap snapping: 60→≤60′,
  45→≤45′, 100→NO CAP); a chip change re-runs suggest live (card
  narrows); overrides persist and re-apply on remount; doneN change
  invalidates; swap changes the pool + the plan line shows `O2 → AT`;
  un-swap restores; TEST renders TR active; empty-pool swap keeps chips
  usable; freestyle hides type chips but shows filter chips.
- **Client (Log):** toggle renders only with a plan; wire shape — toggled
  off posts `advancesPlan: false`, default posts NO advancesPlan key at
  all (both doors); toggle state survives a failed save.
- **Server integration:** `advancesPlan: false` → done_n unchanged;
  `true`/absent → advances; non-boolean → 400.
- **e2e:** filter chip narrows the suggestion card live; swap → detail →
  session → log → counter advanced (the swapped type appears in LAST
  THREE); manual log marked outside-plan → counter unchanged; new-day/
  logged-session reset of the chips (via the doneN change after the
  logged loop). Design sweeps + screenshots (`today.png` re-capture with
  chips; both toggle states of the log row described).
- Self-mutation DoD throughout; realistic fixtures.

## Out of scope

A durable preferences editor on the You screen; recording substitutions
server-side; type chips in freestyle; PM5 (Phase 7); editing past logs.

## Exit criteria

- The suggestion's filters are visible, adjustable, and honest (the
  reason text never claims a dimension that wasn't checked).
- A plan day can be rowed as a different type in two taps, visibly, and
  un-swapped in one; tomorrow starts clean.
- A session can be logged without consuming a plan slot, from either
  door; the default behaviour is byte-identical to today's.
- Full gates; screenshots checked.

## Amendment (2026-08-03, final fix wave): the invalidation trigger is the
doneN advance, not "a logged session"

§2's original sentence said the swap+filters reset on "a new day, a
switched/reset plan, or **a logged session (doneN advance)**" — two readings
of the same clause, and they disagree the moment a log doesn't advance the
plan. The whole-branch review walked the composed case directly: swap the
type, run a session against the swapped pool, mark it OUTSIDE THE PLAN at
log time, Save. `advancesPlan: false` skips the `done_n` upsert entirely
(`server/stores/logs.ts`'s own `create`), so `doneN` is unchanged; Today
remounts with the identical `{date, planKey, doneN}` key, `loadTodayOverrides`
matches, and the swap survives.

That's the correct behaviour, not a bug — and it's the ONLY reading the
Decisions table's own composability clause allows. That table says a
swapped session advancing the plan is "composable" specifically because "a
swap the rower doesn't want counted can be marked outside-plan at log time."
If marking a session outside-plan also reset the swap, the two features
would cancel each other: the rower would lose the very swap they were
mid-way through using, in the same action meant to let them keep it (an
outside-plan log by definition didn't consume today's plan slot, so the
rower still owes today's session — there's no reason today's mood about it
should reset). "A logged session" as the trigger, read literally, would have
mandated the wrong behaviour; "a doneN advance" is what the code correctly
does, and is now the sentence's only reading. No new DEVIATIONS.md row is
needed — the existing Today row there already documents the `{date, planKey,
doneN}` invalidation contract; this amendment just makes §2 agree with it.
