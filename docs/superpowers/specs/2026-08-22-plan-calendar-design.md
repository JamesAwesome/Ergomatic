# The Plan calendar: a record behind you, a list ahead of you

**Date:** 2026-08-22. Brainstormed with James the same day; three rulings
below are his, given live. Implementation is SEQUENCED BEHIND the
baseline-prompt phase (James's ruling at the 8A phase-open gate) — this
spec exists now because the brainstorm was authorized to run in parallel.

## What and why

The Plan screen gains a month calendar above its sequence list, answering
the question a sequence cannot: **"when did I actually row?"** Every
logged session lands on the day it happened, plan-linked sessions
visually distinct, today highlighted. The calendar is purely a record:
days behind today carry marks, days ahead of today are empty. The future
stays where it already lives — the ordered sequence list below, which
needs no dates because the plan has none. No projection mechanism exists
or is invented.

## The three rulings (James, 2026-08-22)

1. **No dates for the future (option C).** The month grid shows real
   dates only for sessions that happened; upcoming plan sessions remain
   the dateless ordered list. This dissolved the projection question —
   the alternatives (one-session-per-day, or a cadence estimate from
   trailing weeks) each invented a schedule the plan does not have.
   "Forward from today" survives as: today is the seam — grid behind it,
   list ahead of it.
2. **Everything you logged (option A).** All session logs mark the grid,
   not just plan-linked ones. A week with four rows shows four marks;
   plan-linked marks carry a distinction. This also gives the future
   events feature (below) its surface for free.
3. **Date-keyed events ship LATER.** The "Trick or Treat Trot" idea (a
   globally authored one-off suggested on a specific calendar date, not
   part of the plan, loggable against it) gets its own phase. This spec's
   only obligation to it: the mark system accommodates a future-dated
   mark class without rework. No event authoring, no producer, no
   precedence decision now — the precedence resolver's triggered
   follow-on fires when that phase opens (first real two-producers-one-
   day collision).

## Research pass (house rule)

- **A11y pattern — PRIMARY, verified against WAI-ARIA APG (w3.org/WAI/
  ARIA/apg/patterns/grid/, fetched 2026-08-22).** APG: a `grid` is "a
  composite widget so it: Always contains multiple focusable elements."
  Our month view is read-only with no focusable cells, so the grid
  pattern explicitly does NOT apply; plain HTML `<table>` semantics are
  the correct structure. Day cells carry accessible labels ("August 14,
  two sessions: O2, AN · plan"). If cells ever become tappable (see Out
  of scope), the pattern question reopens and 44px targets bind.
- **Day boundary — the one wire-semantics item.** `session_logs.
  logged_at` is a server-side UTC timestamp (DB default, not client
  settable). The day a session lands on is computed DEVICE-LOCAL at
  render: an 11:50pm row lands on the day the rower experienced.
  PRIMARY (our own schema for the storage half); the local-rendering
  choice is the universal consumer-calendar convention — INFERENCE, but
  the spec states it as the single day-boundary rule so no test ever
  asserts UTC bucketing. Consequence: a rower crossing timezones may see
  a session shift a day; accepted, matches every calendar app they use.
- **Does the underlying system HAVE the concept?** Yes, cleanly: the
  only dates the system owns are `logged_at` on logs. The plan owns NO
  date, and this design asserts none on its behalf — ruling 1 means the
  UI now matches the data model exactly. Nothing is invented.

## Design

### The screen

Month grid at the top of `/plan`, above the sequence list. Design
reference: `docs/design/README.md` §8 — month title + "N SESSIONS THIS
MONTH" count, 7-column grid with a single-letter day-of-week row, 40px
cells, type-colored marks, legend below. Three deliberate deviations
from that sketch, each owed a DEVIATIONS row at build time: (1) its
"future days `#b8b2a3`" greying predates ruling 1 — future days are
simply EMPTY; (2) its single 14×3px mark per cell predates ruling 2 —
cells hold up to 3 stacked marks plus `+N`; (3) its "today outlined in
its type color" assumes today has a session — today's highlight must
work on an unrowed day too (exact treatment is the build's design pass,
against the handoff's tokens). Month back-navigation as far as the
rower's logs exist; no forward navigation past the current month —
there is nothing to show. Weeks start Monday (a stated choice: training
weeks and ISO 8601 both start Monday — INFERENCE, the sketch does not
specify a start day).

### Marks

One mark per logged session on its day, colored by workout type (the
existing `--type-*` tokens). Plan-linked sessions (log rows with
`plan_key`/`plan_index` set — shipped in PW, PR #121) carry a small tick
of the same visual family as the sequence list's checkmark. Multi-
session days stack up to 3 marks then compress to `+N`. Legend below
the grid per the design handoff. The mark system is specified as a
small closed set of mark classes (type mark, plan tick, and — reserved,
unbuilt — a future-dated suggestion mark) so the events phase adds a
class instead of reworking the grid.

### Data flow

Reuse `GET /api/logs` (cursor pagination via `limit`/`before`, already
serving the history list) — the client pages back to the displayed
month's start and derives day buckets locally. Zero wire change; the
additive-only API rule is satisfied trivially. Named upgrade path if
paging ever hurts (a rower with deep history scrubbing months): an
additive `?from&to` range parameter. Not built now (YAGNI).

Plan-linkage needs no extra fetch: the logs list rows already carry
what the marks need (verify at plan time that the list serialisation
includes `workoutType` and the plan columns; if it does not, extending
it is additive).

### Filters

The design's ALL / TO DO / DONE filters apply to the SEQUENCE LIST
only, not the grid — the grid is a record, and filtering a record's
past away answers no question. DONE keeps the design's "done sorted
below upcoming" behavior in ALL.

### Empty states

A month with no logs renders the plain grid (no fabricated content, no
dashes). A brand-new account sees the current month empty with today
highlighted — honest, and consistent with the app's empty-state rules.

## Out of scope, stated

- Date-keyed event suggestions (ruling 3 — own phase, own spec).
- Tap-through from a day cell to its logs. Nothing opens from the grid
  in this phase; cells are not interactive, which is also what keeps the
  table-semantics ruling clean. Cheap to add later; reopens the APG
  pattern question and 44px targets when it comes.
- Any future projection or cadence estimate (ruling 1 killed it).
- The `?from&to` range parameter (named upgrade path only).

## Testing

Per docs/TESTING.md: realistic fixtures throughout — real seeded
library, real logs spanning a month boundary, a multi-session day, a
mix of plan-linked and freestyle rows, a timezone-edge fixture (a
`logged_at` near midnight UTC asserting device-local bucketing).
Client tests assert consequences (which day cell carries which marks,
the `+N` compression, the plan tick) not existence. e2e structural
assertions for the grid's table semantics and legend; screenshots with
seeded multi-week data, opened and checked. Per-file coverage checked
for every new file.

## Exit criteria (draft — ROADMAP 8B refines at phase open)

A rower with sessions logged across two months sees each on its
device-local day with type colors and plan ticks; a four-session day
compresses to three marks plus `+1`; the filters reorganize the list
without touching the grid; a brand-new account sees an honest empty
month; and no code path anywhere computes a date for a future plan
session.

## Sequencing

Implementation waits behind the baseline-prompt phase (James's 8A
phase-open ruling: the measurement loop closes first). This spec is the
calendar's brainstorm output; the phase that builds it takes the normal
phase-open gates, with this spec as the anchor's target.
