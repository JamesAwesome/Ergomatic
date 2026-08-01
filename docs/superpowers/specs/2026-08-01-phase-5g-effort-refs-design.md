# Phase 5G — MAX/MIN effort pace references

**Date:** 2026-08-01
**Status:** Approved (brainstormed 2026-08-01; distance-estimation, seed-audit,
display-word and SPM-independence decisions all James's)

## Problem

Real workouts say "30 seconds max" or "20 minutes easy". The app cannot store
either: every work step carries `PaceRef = {base: '2k'|'6k', off}`, so authors
fake effort steps with stand-in offsets (`2k−2` pretending to be max effort,
`6k+16` pretending to be easy). The stand-in teaches a wrong habit and produces
a target range the rower is not actually meant to hold.

## Decisions

| Question | Decision |
|---|---|
| Stored shape | **Additive union**: `PaceRef = SplitRef \| EffortRef`. Existing `{base, off}` JSON is already a valid `SplitRef` — no migration, no tolerant-reader hacks. |
| Chip labels | `MAX` and `MIN` (same length, both understood — James's wording). |
| Display words where a range renders | **`ALL OUT` / `EASY`** — matches the timer's existing vocabulary ("All out"/"Easy"), one pair of effort words everywhere. Chips stay MAX/MIN. |
| Distance step at MAX/MIN | **Estimate from a baseline anyway**: MAX prices from the 2k baseline, MIN from `6k + 20`. Labelled an estimate, used only for totals/duration/filters, never rendered as a target. |
| Offsets on efforts | Forbidden. `max+2` is a parse/validation error, not "2 s faster than max". |
| SPM | **Fully independent and optional**, exactly as for split refs. `"0:30 max @ 32"` (rate-capped sprint) and `"20:00 easy @ 18"` (low-rate steady state) are standard prescriptions — effort and cadence are different axes. **No validation rule may couple them.** |
| Seeded library | **Re-authored where the book says so.** Audit all 35 starters against their Erg Book sources; steps the book prescribes as max/easy get the real ref. The audit ships as a table in the PR (workout · step · old stand-in · new ref · book justification) for James's review. Seeding is per-user at account creation, so existing accounts keep their current library. |
| Timer behaviour | Out of scope (Phase 6). The `targetKind` field ships now; the timer consumes it later. |
| Custom badge/filter | Out of scope (Phase 5H). |

## Domain design (`app/domain/`)

### types.ts — the union

```ts
export type PaceBase = "2k" | "6k";
export type Effort = "max" | "min";
export interface SplitRef {
  base: PaceBase;
  off: number; // seconds per 500m, negative = faster
}
export interface EffortRef {
  effort: Effort;
}
export type PaceRef = SplitRef | EffortRef;
```

Discriminate with `"effort" in ref` (or a tiny exported guard `isEffortRef`).
Rejected alternatives, for the record: widening `base` to four values leaves
`off` meaningless half the time and every consumer guarding by hand; an
explicit `kind` discriminant is cleaner TS but would need `kind: "split"`
backfilled into every stored workout — a migration for aesthetics. The
key-presence union is the only shape where **all existing stored JSON is
already valid**.

### pace.ts

- `parsePaceRef` accepts `max` and `min` (case-insensitive). An offset after an
  effort token is an error — return `null`, and bulk reports it per-line.
- `resolveSplit(baselines, ref, nudge?)` keeps its signature but is only legal
  for split refs; callers check `isEffortRef` first. (It cannot return a number
  that means anything for an effort.)
- New `refLabel(ref): string` — `"2k +5"` style for splits (existing
  formatting), `"MAX"`/`"MIN"` for efforts (the chip word; the *range-position*
  word is the display layer's job).
- New `effortWord(effort): "ALL OUT" | "EASY"` — the one place the display pair
  lives, so the builder, detail screen and (later) timer cannot drift.
- New `estimationSplit(baselines, ref): number` — the single estimation rule:
  split refs resolve normally; `max` → `baselines.k2Seconds`; `min` →
  `baselines.k6Seconds + 20`. Every consumer that needs a number for an effort
  (duration estimation, totals) goes through this and nothing else.

### expand.ts

Work phases gain `targetKind: "split" | "effort"` (additive). For effort
steps: `targetSplit` is set from `estimationSplit` — so `estimateMinutes`
keeps pricing distance-at-MAX with zero new code — but `targetKind: "effort"`
tells the Phase 6 timer the number is an estimate for scheduling, not a target
to display. Split steps carry `targetKind: "split"` and behave exactly as
today.

### validate.ts

`checkRef` accepts either arm: a split ref with `|off| ≤ 60` (unchanged), or an
effort ref whose `effort` is `"max"`/`"min"` and which carries **no other
keys**. Effort refs combine with any duration kind and with `spm`/`restMinutes`
exactly as split refs do.

### bulk.ts

`0:30 max`, `20:00 min`, `500m max` all parse. `max+2` produces the per-line
error `effort refs take no offset`. The grammar table test extends to the new
tokens.

## Client design

### Builder

- `PaceRefInput`'s radiogroup becomes `2K | 6K | MAX | MIN` (one roving-
  tabindex group, same pattern and keyboard tests). Selecting MAX/MIN **hides
  the offset stepper** — nothing to offset from — and the row reflows to the
  chips alone. Selecting 2K/6K brings the stepper back with the row's last
  offset (offset is preserved across a chip round trip within an editing
  session; it is simply not emitted while an effort is selected).
- TARGET strip: `ALL OUT`/`EASY` in ink (not accent — it is resolved output,
  same rule as the range today).
- `BuilderRow` carries the effort state; `fromWorkout`/`toSteps` round-trip the
  union byte-identically. Collapsed card: `0:30 @ MAX`, sub-line unchanged
  (`32 spm · rest 1:00`).
- SPM and REST controls render for every work step regardless of chip — **no
  new conditional**.

### Detail screen

`StepRow`: left label `0:30 @ MAX`; where the range renders, `ALL OUT`/`EASY`
in ink. The ▲▼ nudge buttons do not render for effort steps (nothing to
nudge). Accessible name: "30 seconds at max effort" (spoken form via
`fmtDurationSpoken` + effort wording; do not let the label degrade to "at max"
digits-style).

### Library

No visible change: durations keep working because `estimateMinutes` prices
effort steps through `estimationSplit`. The duration filter buckets keep
receiving the same estimate.

## Seed audit

A dedicated task audits `app/server/seed/starter.ts` against the Erg Book
sources and produces the PR table. Constraints: only steps the book genuinely
prescribes as max/all-out/easy change; steady-pace prescriptions keep their
numeric refs even when slow (Doldrums' `6k+16` is a steady prescription, not
"easy"). Existing accounts are untouched by construction (seed-at-creation).

## Testing

- **Domain (pinned 100%)**: union round trip through validate for both arms;
  `max+2` rejected in parse and validate; the estimation-rule table (`max` →
  2k, `min` → 6k+20, splits unchanged); `targetKind` on every phase kind;
  **compatibility sweep** — every currently-stored shape (all 35 starters)
  still validates and resolves byte-identically.
- **Builder/client**: chip round trip MAX → 2K restores the offset; TARGET
  strip words; collapsed summary; a real starter workout re-authored with MAX
  round-trips through `fromWorkout`/`toSteps`.
- **e2e**: author `0:30 max @ 32 spm`, save, reopen — detail shows `ALL OUT`
  and no nudge buttons; edit round trip unchanged. Design sweep over the
  builder **with MAX selected** (the hidden-stepper layout is a new state; a
  sweep of the split-ref state only would repeat the `kind:"w"`-fixture
  blind spot).
- **Screenshots**: builder capture includes a MAX step; detail capture shows an
  effort step's `ALL OUT`.

## Exit criteria

- `0:30 max @ 32` can be authored by chip or bulk import, saves, and reads
  back as `ALL OUT` on the detail screen with no nudge buttons.
- A distance step at MAX keeps a library duration and bucket.
- Every pre-existing workout validates, resolves, and renders exactly as
  before the change.
- The seed-audit table is in the PR and James has reviewed it.
- All gates green: lint, typecheck, format, unit+client+integration with
  per-file coverage read, e2e, screenshots opened and checked.
