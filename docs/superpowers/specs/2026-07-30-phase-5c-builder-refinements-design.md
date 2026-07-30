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
| Numbers | **Dropped from the UI everywhere** (James's call) — builder, Library rows, detail. `num` survives as an invisible ordering key, auto-assigned server-side |
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
- **Storage:** `workouts.num` stays NOT NULL with its existing partial unique
  indexes — no destructive migration (expand-only rule). It becomes an
  invisible ordering key, which is exactly how `list()` already sorts
  (`orderBy(asc(workouts.num))`), so the curated starter order is preserved
  and new personal workouts append in creation order.
- **Assignment:** `num` becomes **optional** in `POST /api/workouts` and the
  bulk endpoint (additive — the API rule allows this). When absent the server
  assigns `max(num) + 1` **within the caller's own space** (personal rows for
  a user; globals are seeded, not created through this path). It must be
  assigned server-side inside the insert's transaction, not computed by the
  client, so two devices cannot race to the same value. A unique-violation
  retry covers the remaining race.
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
- **Integration (Testcontainers):** two workouts created without `num`
  receive distinct numbers; concurrent creates do not collide.
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
  ref, and with Save telling him what's wrong when it refuses.

## Out of scope

Phase 6 (Today, timer, logging). The follow-ups recorded at 5B's merge that
this phase does not touch: DUR field width for `42195m`, the `×N` stepper
retaining its value after the block is cleared, an unsaved-changes guard,
partial-bulk re-import resubmitting created blocks, and the bulk endpoint's
sequential non-transactional inserts. The app-icon redraw.
