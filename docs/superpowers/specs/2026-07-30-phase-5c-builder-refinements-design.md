# Phase 5C — Builder Refinements — Design

Approved 2026-07-30. Comes from James using the shipped 5B builder on his
phone and hitting seven real problems no test caught. Every item below is a
usability defect found in actual use, not a speculative improvement.

Evidence: two device screenshots — one showing `num must be a whole number
1..9999` under an empty field, one showing a work row with four simultaneous
inline errors (`8k` typed as a pace ref, `500` spm, `5'` in rest) and
`TOTAL 0 MIN`.

## Decisions

| Question | Decision |
|---|---|
| Pace ref | **Structured input**: `2K`/`6K` chips + a numeric offset stepper. Free text made `8k` reachable |
| Duration | **Bare numbers mean minutes.** `5` = 5 minutes; `5'` still accepted; `2500m` for distance. The apostrophe was hostile on a phone keyboard |
| Rest | **REST column only, labelled optional** (James's call). The `+ REST` button goes — but the builder keeps RENDERING standalone rest steps so a bulk-imported workout stays editable |
| Numbers | **Dropped from the UI everywhere** (James's call) — builder, Library rows, detail |
| `num` column | **Retired**, replaced by `sort_order` + `created_at`. Made nullable and unwritten this phase; `DROP COLUMN` is the first commit of Phase 6 so the health-gated rollback stays armed |
| Globals vs customs | **One table, nullable owner** — splitting was considered and rejected (would force a polymorphic FK the DB can't enforce, voiding the logs-survive-delete guarantee) |
| Bulk paste header | **Number optional**: accept 4 or 5 fields, so existing paste text keeps working |
| Save | Scrolls to and focuses the first invalid field, with a count at the button |
| Bulk import | **Its own screen** at `/library/import`, off the Library header |
| Name generator | Curated combinatorial (~1,550 names), **not faker** — see below |

## Why not faker

Validated on request and rejected. `@faker-js/faker` 10.5.0 is 2.9 MB
unpacked and its vocabulary is generic business/lorem — there is no weather
or natural-force dictionary, so it would produce names ("Intelligent Plastic
Chair") nothing like the starter library's register, and the on-theme word
lists would still have to be written by hand. A curated generator is
smaller, on-brand, dependency-free, and deterministically testable.

## Pace ref input

Replaces the free-text field. `2K` / `6K` as two 44px chips (single-select,
one always active), plus an offset stepper defaulting to `0`, stepping by
1, bounded to **±60** to match `validate.ts`'s `checkRef`. Displays as
`6k −2` using U+2212. `parsePaceRef` remains the sole parser for the bulk
path — the builder now constructs a `PaceRef` directly, so an invalid ref is
structurally unreachable in the form.

## Duration input

`parseDurationInput` gains a bare-number branch: `/^\d+(\.\d+)?$/` → minutes.
The existing `5'` and `2500m` forms are unchanged. **The bulk grammar gains
the same branch**, so typing and pasting still agree — the property 5B
established and must not regress. Minutes keep the domain's 0.5-step and
0.5..180 bounds; meters stay integer, 100..42195.

## Rest

The `+ REST` control is removed; `REST` on a work row is the only way to
author rest, with the column header reading `REST (OPT)` and an empty value
meaning none. `RowKind` keeps `"r"` and `StepRowEditor` keeps rendering it,
because `parseBulk` can still produce standalone rest steps and a workout you
pasted must remain editable. This is why the row kind is not deleted outright.

Verified before deciding: the 35 starter workouts use `restMinutes` **32
times and standalone rest steps zero times**, so the shipped content loses
nothing.

## Dropping numbers

- **UI:** no `No.` field in the builder; Library rows show the title without
  a `12.` prefix; detail's meta line drops `NO. 12 ·`.
- **Storage — `num` is RETIRED, not repaired.** Once numbers leave the UI the
  column has no job: display identity is gone (James's call), and uniqueness
  on a number nobody can see protects nothing. It is an ordering key wearing
  a display column's clothes.
  - Add `sort_order int` (nullable). Backfill from `num`. Globals keep their
    curated order; personal rows sort by `created_at`.
    `ORDER BY sort_order NULLS LAST, created_at` gives the starter library
    first in its authored order, then the rower's own by creation.
  - Make `num` **nullable**, drop its partial unique indexes, and stop
    writing it. Nothing reads it after this phase.
  - **Do NOT drop the column this phase.** `scripts/deploy.sh` rolls back to
    the previous image when a deploy comes up unhealthy; if the same release
    both drops `num` and ships code that no longer needs it, an unhealthy
    deploy rolls back to old code that still `SELECT`s a column that no
    longer exists — so the rollback fails too, turning a recoverable deploy
    into a dead site. **The `DROP COLUMN` is the first commit of Phase 6**,
    after one green deploy has proven the new code runs without it.
- **No `max(num) + 1`.** An earlier draft of this spec proposed computing the
  next number at insert time. That is a contention anti-pattern — it
  serializes concurrent inserts and needs a lock or a retry loop. With `num`
  retired there is nothing to compute: `sort_order` is NULL for personal rows
  and `created_at` orders them.
- **Single table stays.** Splitting globals and personal rows into two tables
  was considered and rejected: `session_logs.workout_id` is a real FK with
  `ON DELETE SET NULL`, and a split forces either two nullable FK columns on
  every log or a polymorphic `type`+`id` pair — an antipattern the database
  cannot enforce a foreign key against (SQL Antipatterns ch. 7; GitLab bans
  it outright), which would silently void the "your logged sessions are kept"
  guarantee. Copy-on-write editing of globals (a recorded Phase 5 follow-on)
  is also an `INSERT … SELECT` in one table and a cross-table copy in two.
  One table with a nullable owner is the standard shared-reference-rows
  pattern.
- This departs from the handoff, which features `NO. 159` prominently, so it
  gets a DEVIATIONS row.

## Save-time error surfacing

On a failed `toSteps`, the Save button's region shows a count
("3 fields need attention"), and the first invalid field is scrolled into
view and focused. The `role="alert"`/`aria-invalid` wiring added at the end
of 5B stays; this adds the visual and focus half, which is what the device
screenshots show missing — errors existed but sat off-screen while Save
appeared to do nothing.

## Bulk import as its own screen

Moves to `/library/import`, reached from a control in the Library header
beside `+ NEW`. The builder loses the toggle entirely. Same component, same
endpoint, same both-halves result rendering; only the route and entry point
change. The grammar help moves with it and documents the now-optional number.

## Name generator

A 🎲 control beside Title. Names come from `app/src/builder/nameGenerator.ts`:
roughly 50 weather/natural-force nouns (Zephyr, Riptide, Haboob, Nor'easter,
Maelstrom, Whiteout, Downburst, Sirocco…) × ~30 modifiers (Long, Bitter,
Rolling, Iron, Northern, Midnight…), plus the bare nouns — about **1,550**
distinct names. The generator takes the caller's existing titles and skips
any already used; when the pool is exhausted it falls back rather than
looping forever. Pure and seedable so tests are deterministic (no
`Math.random()` in the module's own logic — the seed is injected).

## Testing & exit criteria

- **Unit:** the pace-ref stepper's ±60 clamping; `parseDurationInput`'s bare
  number, apostrophe, and meters forms; the same three forms through
  `parseBulk`; the name generator's uniqueness-vs-existing-titles and
  pool-exhaustion behavior; `num`-absent auto-assignment.
- **Integration (Testcontainers):** the library returns globals in their
  curated `sort_order` followed by personal rows in `created_at` order;
  creating a workout writes no `num`; two workouts created concurrently both
  succeed (nothing to collide over now).
- **Component:** Save with an off-screen invalid field focuses it and shows
  the count; the builder renders a bulk-imported standalone rest row and
  round-trips it; no `No.` field exists; the 🎲 fills Title with a name not
  already present.
- **e2e:** author a workout with the structured pace input and a bare-number
  duration, save it with no number, and see it resolve on detail; import via
  the new `/library/import` screen; confirm no `NO.` or `12.` appears on
  Library or detail.
- Design assertions extended to the new import screen and the builder's
  error state (5B's review noted only the blank builder was swept).
- Coverage gate 90×4; `domain/**` stays 100 — it changes this phase
  (duration grammar, optional header number), so its tests grow with it.
- **Exit:** James can author a workout on his phone without typing an
  apostrophe, without inventing a number, without reaching an invalid pace
  ref, and with Save telling him what's wrong when it refuses. Nothing in the
  codebase reads `workouts.num` afterwards — verified by grep, which is the
  precondition for Phase 6's `DROP COLUMN`.

## Out of scope

Phase 6 (Today, timer, logging). The follow-ups recorded at 5B's merge that
this phase does not touch: DUR field width for `42195m`, the `×N` stepper
retaining its value after the block is cleared, an unsaved-changes guard,
partial-bulk re-import resubmitting created blocks, and the bulk endpoint's
sequential non-transactional inserts. The app-icon redraw.
