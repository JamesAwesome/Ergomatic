# Phase 5E — Builder Redesign — Design

Approved 2026-07-30. Implements the design review's handoff, now committed at
`docs/design/builder-redesign/` (README + `Builder redesign.dc.html` +
`support.js`). That handoff is **high-fidelity and is the authority for this
screen**, superseding `docs/design/README.md` §11, except where this spec
records a deliberate departure.

The functionality shipped in 5D was correct; the layout was not. Each step
occupied three or four permanent lines, so two steps nearly filled a phone and
a realistic six-step workout was a long scroll of near-identical boxes.

## The core change

**An accordion.** At most one step is expanded (`editing = rowId | null`);
every other step collapses to a ~86px two-line summary card carrying its own
`EDIT` / duplicate / delete actions. A six-step workout becomes a scannable
list instead of a wall of inputs.

Collapsed line 1: index, summary (`20′ @ 6k +10` or `2000 m @ 2k ±0`),
resolved split. Line 2: `20 spm · rest 1:30` plus the joined action group.
Expanded: the seven-row editor (header, DUR, PACE, SPM, REST, TARGET strip,
DONE).

## Everything else the handoff changes

- **Classification card** — TYPE / DIFFICULTY / EXPECTED PAIN move into one
  card so they read as a unit.
- **Pain faces are dropped** (James approved). Numerals only, plus the current
  level's word on the right of the label row: `EASY BREATH · COMFORTABLE ·
  WORKING · HURTS · BRUTAL`. This does the job the faces were meant to do and
  clears contrast easily — the faces at ~20px were the weakest element on the
  screen.
- **Three deliberate "selected" treatments, not five:** type colour (TYPE
  only), ink (DIFFICULTY and the ink action buttons), pain ramp (EXPECTED PAIN
  only). **Accent red is reserved** for the in-row unit / pace-ref toggles and
  Save. DIFFICULTY moves from accent to ink for exactly this reason.
- **Rest becomes a stepper**, ±30s, `0…900`, rendering `m:ss` or `NONE`.
- **SPM becomes a stepper** with `FREE` at zero.
- **`↻ AUTO NAME`** replaces the 🎲 — the emoji read as a label, not a button.
- **`+ ADD STEP`** appends a copy of the last step (or a sensible default when
  the list is empty) and opens it.
- **Two duplicate entry points, different intent:** collapsed `⧉` copies and
  stays collapsed (fast `5×1′` building); expanded `DUPLICATE` copies and opens
  the copy (duplicate-then-tweak).
- **`REPEAT ALL STEPS`** replaces `REPEAT (OPTIONAL)` — it states the data
  model rather than leaving scope ambiguous.
- **TARGET strip** in the expanded editor renders the resolved range in **ink,
  not accent** — it is output, not a selected state.

## Departures from the handoff (recorded)

| Handoff says | Ergomatic builds | Why |
|---|---|---|
| SPM `+` from 0 jumps to **18** | Wakes at **20** | James's explicit call, twice. Otherwise the stepper behaviour is the handoff's |
| Pace offset clamped **−15…+30** | Clamped **±60** | The domain permits ±60 (`validate.ts`). A narrower stepper would make a legally-stored workout impossible to edit back to its own value |
| Every step is a work step | `wu` and standalone rest steps still render | Bulk import and the 35 starter workouts contain them. They stay editable via their existing minutes-only editor; they are simply not authorable. Dropping the renderer would make imported workouts uneditable |
| Collapsed `×` deletes immediately | **Confirms first** | James's call. The `×` sits 44px from duplicate in a joined control, on a phone, mid-authoring; a mis-tap silently destroys a configured step. Matches how workout deletion already confirms |

`Save to library` is **kept** at the handoff's wording (James's call), reverting
5D's `Save` shortening. Update the existing DEVIATIONS row rather than leaving
a contradicting one.

## Answering the handoff's open questions

1. **Confirm before delete?** Yes — recorded above.
2. **Step reordering?** Out of scope; not requested and not in the data model's
   critical path. Recorded as a follow-on.
3. **Where does bulk import live?** Already answered — it moved to its own
   screen at `/library/import` in Phase 5C, reached from the Library header. It
   does not return to the builder.

## What must not regress

The redesign is a re-layout, not a re-model. These are all already proven and
must survive:

- **The domain is untouched.** `app/domain/**` stays at 100% coverage with an
  empty diff.
- **The repeat span stays derived** from `BOOKEND_ROW_KINDS` — leading `wu`
  rows sit outside the repeat; everything else repeats. `REPEAT ALL STEPS`
  describes this accurately for authored workouts, which have no warm-up.
- **`hasMidSpanReps` still refuses** to open a workout whose stored repeat
  marker the row model cannot place, rather than silently re-saving it with
  different meaning.
- **SPM stays optional** — empty round-trips as absent; `FREE` is the zero
  rendering, and it must still emit no `spm` field.
- **Rest stays minutes-only.** The handoff's stepper works in seconds for
  display (`m:ss`); it must store minutes, and 30-second increments map
  exactly onto the domain's 0.5-minute half-steps.
- **Client bounds mirror `app/domain/validate.ts`** and the server stays the
  authority.
- **The Phase 5 exit criterion:** a `6k −2` step at 22 spm resolves to
  `1:59.0–2:01.0` on the detail screen.

## Testing & exit criteria

- **Unit:** the accordion reducer (at most one expanded, `DONE` closes, adding
  opens the new step, deleting closes); rest seconds ↔ domain minutes at the
  bounds; SPM `FREE`/wake-at-20/clamps; summary and sub-summary string
  formatting including `±0`, `rest none`, and omitted spm.
- **Component:** only one card expanded at a time; collapsed `⧉` duplicates
  *without* expanding while expanded `DUPLICATE` opens the copy; delete asks
  first; a stored `wu` row still renders and round-trips.
- **Contrast:** every new fill measured, not eyeballed. The handoff flags pain
  ramp `#6e7040` as the tightest at ~4.6:1 — verify and do not lighten it. The
  step-index grey `#8a8478` is ~3.4:1; if axe flags it, move to `#6f6a5f` as
  the handoff itself instructs.
- **e2e:** build `5×1′ @ 6k−2` using the collapsed duplicate action and
  `REPEAT ALL STEPS`, save, and assert `1:59.0–2:01.0` on detail; a stored
  starter-shaped workout opens and round-trips unchanged.
- **Design assertions** extended to the collapsed and expanded card states;
  screenshots re-captured showing both.
- Coverage gate 90×4; `domain/**` stays 100.
- **Exit:** a six-step workout is scannable on one phone screen without
  scrolling past the fold to see what the steps are.

## Out of scope

Step reordering. Any change to the domain, the API, or the Library/detail/import
screens. Phase 6's session flow. The two-release `num` column drop (still Phase
6's opener). The app-icon redraw.
