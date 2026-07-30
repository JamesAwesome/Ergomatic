# Phase 5D — Builder Simplification — Design

Approved 2026-07-30. A second round of device feedback on the builder, after
5C. James opened the screen, could not tell what the `SET` cell did, and asked
— which is the finding. Eight items, all from real use.

## Decisions

| Question | Decision |
|---|---|
| Repeat model | **No per-row marking.** The repeat block is implicit: every authored row repeats. One `×N` control at the bottom is the only input |
| The `SET` cell | Becomes a **clone** button — duplicates that row directly beneath it, which is how you actually build `5×1′` |
| Warm-ups | **Not authored per workout.** `+ WARM-UP` is removed; warm-up comes from the rower's `warmupMinutes` preference, pulled forward from Phase 9 |
| Warm-up storage | The preference is **applied at session time, never baked into a workout's steps** — otherwise changing the preference would leave old workouts untouched |
| Duration input | **Numeric field + a MIN / M unit toggle.** No apostrophe, no grammar, no placeholder that reads like a format string |
| SPM input | **Stays optional.** Empty by default; 44px −/+ either side, and the FIRST press of either button lands on 20. Clearable back to empty |
| Rest input | **Stays minutes-only — no unit toggle** (considered and rejected; see below). Gains an explicit `MIN` marking so it can't be misread beside the duration field's new toggle |
| Dice | Fixed — see the diagnosis below. It is not a no-op; it returns the same name every press against a real library |
| Selection styling | Selected states get a **filled tint**, not an outline. The pain picker's red outline was hard to see and drew mis-taps |
| Cooldowns | Not built. A **named seam** is left: the repeat span is computed by excluding *bookend* row kinds, a list that today holds `wu` and later `cd` |
| Save button | `Save to library` → `Save` |

## The dice defect — diagnosed, with the repro

Not a no-op. Reproduced against the real starter library:

```
empty library →  Zephyr, Squall, Doldrums, Derecho     (seeds 0,1,2,3)
real  library →  Riptide, Riptide, Riptide, Riptide    (seeds 0,1,2,3)
```

`generateName` picks a start index from the seed and then **probes linearly
forward** for the first untaken name. The generator's noun list opens with the
same weather words as the 35 starter workouts, so those leading slots are all
taken and every seed inside that cluster slides to the same first-free slot.

Every existing test passed an empty or single-name `existing` array, so the
collapse was invisible. **Fix:** collect the untaken indices and select
`untaken[seed mod untaken.length]`. Different seeds then yield different names
whenever two or more are free, regardless of how the taken ones cluster. Add a
test that uses the actual `STARTER_WORKOUTS` titles — the fixture that would
have caught it.

## Repeat, clone, and the cooldown seam

The whole per-row marking model goes: no `marked` flag, no `setBlockStart`, no
`setRowIds`, no positional-suffix invariant, no "N rows marked" readout. The
domain is unchanged — `toSteps` still emits exactly one `reps` marker — but the
split point is now derived rather than chosen.

**The repeat span** = the authored rows minus any *bookend* kinds. Bookends are
a named constant (`BOOKEND_ROW_KINDS`), holding `"wu"` today. This is not a
speculative seam: the 35 starter workouts contain stored `wu` steps, and
opening one in the builder must not start repeating its warm-up — so the
exclusion is load-bearing and exercised from day one. Adding cooldowns later
means adding a `cd` kind to the domain and one entry to that list.

`toSteps` therefore emits: leading bookend rows, then `{k:"reps", count}` when
`N > 1` and at least one non-bookend row exists, then the rest. At `×1` no
marker is emitted at all.

**Totals** simplify to `bookend minutes + (span minutes × N)`, plus the
warm-up line described below.

**Clone** copies a row — every field, including its pace base and offset — and
inserts it immediately after the original, then focuses the new row's duration
field so a `5×1′` build is tap-tap-tap.

## Warm-ups

`+ WARM-UP` is removed. A new `usePreferences` client hook reads
`GET /api/prefs` (already implemented server-side, `warmupMinutes` validated
0..60, default 10). The builder shows the warm-up as context beneath TOTAL —
`+ 10′ warm-up (from your preferences)` — and **does not write a `wu` step**.
Phase 6's session flow prepends it when a workout is started.

Stored `wu` steps in the starter library keep rendering in edit mode as
read-only bookend rows and round-trip unchanged; they are simply no longer
authorable. A workout carrying one shows both it and the preference line, which
is honest about what will actually happen at session time.

## Duration input

The `dur` text field and its `5' or 2500m` placeholder are replaced by a
numeric input plus a two-state MIN / M toggle (44px, same chip idiom). Minutes
keep the domain's 0.5-step and 0.5..180 bounds; meters stay integer 100..42195.
`parseDurationInput` remains for the **bulk-paste** path only, which is still
free text — the builder no longer parses anything.

## SPM

The `spm` field gains 44px −/+ buttons either side of its value, but
**remains optional** — the domain declares `spm?`, and 5D keeps it that way.

- A new work row starts **empty**, not at 20.
- The **first press of either button sets it to 20** — up and down both wake
  the control at 20 rather than 21/19. From there each press moves by 1.
- The field stays a clearable numeric input, so emptying it returns the row to
  "no SPM" and the next press wakes at 20 again.
- Clamped to the domain's `10..60` (`app/domain/validate.ts`). That is the
  storable range, not the 18–32 guidance used when authoring starter content —
  do not enforce 18–32 here.

**No normalisation.** A stored step without `spm` loads empty and saves without
one; nothing is added to a rower's existing data by opening a workout. An
earlier draft made SPM mandatory-in-practice and would have silently written a
value into every edited workout — explicitly rejected.

**Layout warning.** The row now wants: clone, duration + unit toggle, SPM with
two steppers, rest, delete — plus the pace control already on its own line
beneath. That will not fit across 390px. The implementer must verify the real
viewport and, if it overflows, give SPM its own line the way the pace control
got one; do not shrink any control below 44px to make it fit. Whatever layout
results, the e2e tap-target sweep and a screenshot are the acceptance evidence.

## Rest stays minutes — and why

A meters option for rest was requested and **deliberately rejected**. Record
the reasoning here so it isn't re-litigated:

A work step converts meters into time using its own pace ref
(`resolveSplit`). **Rest carries no pace ref**, so a meters rest cannot be
turned into minutes at all — and minutes are what `estimateMinutes` needs to
produce the builder's TOTAL, the Library's per-workout duration, and plan
estimates, and what Phase 6's timer needs to count a rest phase down. Any
meters rest would therefore force one of: an invented recovery-pace constant
that silently shifts every affected total, or a workout whose duration reads
"—" everywhere it appears.

Distance recovery is still authorable, and more honestly: add a work row at an
easy pace (`500m @ 6k+30`). That is what a paddle actually is — a work step
with a recovery target — and it keeps every total exact.

**Consequence for this phase:** with duration gaining a MIN / M toggle, a
neighbouring rest field carrying no unit becomes ambiguous. Rest must be
explicitly marked as minutes — a static `MIN` affix on the field or in its
column header, not a placeholder that disappears once typing starts.

## Selection styling

Every selected control gets a filled tint rather than a bare outline. The pain
picker is the reported case: its selected cell had only a red border, while
TYPE and DIFFICULTY chips beside it fill solid — so the one control whose
selection mattered least visually was also the least visible. Selected pain
cells fill with a tint of their own ramp colour and keep a border for
non-colour redundancy. Audit the other selected states (`2K`/`6K`, MIN/M,
TYPE, DIFFICULTY) for the same inconsistency and make them one family.
Contrast must be measured, not eyeballed: text on any filled state ≥ 4.5:1,
the fill itself ≥ 3:1 against the page.

## Testing & exit criteria

- **Unit:** the dice fix tested against the **real `STARTER_WORKOUTS` titles**
  (four consecutive seeds must yield four distinct names); `toSteps` emitting
  no marker at `×1`, one marker at `×N`, and bookend rows staying outside the
  span; clone copying every field including pace base/offset; totals with and
  without bookends.
- **Component:** the builder renders no `SET` cell and no `+ WARM-UP`; clone
  inserts directly beneath and focuses the new row; the unit toggle switches a
  stored distance step to M on load; the warm-up line reflects the preference;
  Save reads `Save`.
- **SPM:** a new row starts empty; the first press of EITHER button yields
  exactly 20; subsequent presses move by 1 and clamp at 10 and 60; clearing
  the field returns it to empty and the next press wakes at 20 again; a
  stored step without `spm` loads empty and round-trips **without** one.
- **Rest:** its minutes unit is visible without focusing or typing into the
  field, and it offers no unit toggle.
- **Contrast:** computed ratios for every new filled state recorded in the
  task report, not asserted by eye.
- **e2e:** author `5×1′ @ 6k−2` using clone and the `×N` control, save, and
  confirm the detail screen resolves `1:59.0–2:01.0` — the Phase 5 exit
  criterion, now reached through the new controls; a stored starter workout
  opens in edit mode with its warm-up intact and round-trips unchanged.
- Design assertions extended to the new controls; screenshots re-captured.
- Coverage gate 90×4; `domain/**` stays 100 (untouched — the domain does not
  change this phase).

## Out of scope

Cooldowns themselves. The rest of the preferences screen (Phase 9) — only
`warmupMinutes` is consumed here. Phase 6's session flow, which is what will
actually prepend the warm-up. The `num` column drop (Phase 6's first two
releases). Unifying the three hand-rolled single-select ARIA patterns
(recorded Phase 6 follow-up).
