# Deliberate deviations from the design handoff

The handoff in this directory is the UI/UX authority EXCEPT where listed
here. These are intentional product decisions (spec:
`docs/superpowers/specs/2026-07-28-differentiation-design.md`) — do not
"fix" screens back to the handoff's literals.

| Handoff shows | Ergomatic builds | Why |
|---|---|---|
| Pain 1–10 (`PAIN 5/10`, 10-segment bars, 1–10 pickers) | Pain **1–5**: `PAIN n/5`, 5-segment bars, five 44px picker cells | Differentiation; simpler scale |
| `PAIN ≤5` library filter chip | `PAIN ≤3` | Midpoint of the 1–5 scale |
| Difficulty `Introductory / Moderate / Advanced` (chips `INTRO/MODERATE/ADVANCED`) | `Easy / Medium / Hard` (chips `EASY/MEDIUM/HARD`) | Differentiation |
| Sample data: 11 book-derived workouts ("Lucky Penny", …) | Original ~35-workout starter library (original names), seeded per new account | Content policy |
| "11 OF 375 ENTERED" library counter | Plain count of the user's library (no fixed denominator) | 375 is the book's scale, not ours |
| `ink-4` `#8a8478` for mono labels (e.g. "33D AGO", step sub-lines) | `ink-4` **`#6f6a5f`** | `#8a8478` measures 3.29:1 on `--page` and 3.65:1 on `--surface` — below the handoff's own WCAG AA (≥4.5:1) requirement for this text size. `#6f6a5f` measures 4.76:1 on `--page` and 5.29:1 on `--surface`, passing AA while preserving the four-tier ink hierarchy (ink → ink-2 → ink-3 → ink-4) rather than collapsing small labels into ink-3. AA is the hard requirement; the literal hex was not. The builder redesign's own step-index numeral (`StepCard.tsx`'s `.step-card-index`) uses this same substitution for the same reason — its handoff explicitly calls out `#8a8478` there too (~3.4:1) and says to move it to `#6f6a5f` if axe flags it; it does, so it's already `#6f6a5f` in `tokens.css`, and `e2e/design.spec.ts`'s accordion-states sweep pins the resolved colour structurally |
| `+ ADD ROW`'s mockup `nwRows` model has no `kind` field at all — every added row is implicitly a work row | A single `+ ADD STEP` control, work rows only — no `+ WARM-UP` any more. Warm-up leaves the workout entirely: it's read from the rower's preferences (`GET /api/prefs`'s `warmupMinutes`) and shown as a line beneath TOTAL, applied at session start rather than authored per workout | `+ WARM-UP` existed for one phase because the domain distinguishes warm-up, work, and rest steps and every starter workout in the book opens with one — a builder that could only ever add work rows couldn't author a warm-up from scratch. A later round of device feedback found authoring one per workout was pointless friction: every session uses the same easy warm-up regardless of which workout follows it, so it moved to a one-time preference instead of a per-workout row. `addStepLike`'s "+ ADD STEP" (`builderState.ts`) and `StepEditor.tsx`'s `wu`/`r` minutes-only branch stay in the code — bulk import and edit-mode `fromWorkout` can still produce/keep a stored `wu`/`r` step, and a pasted or previously-saved workout that already has one must stay editable — it's just not authorable from a blank builder any more. There is likewise no `+ REST` control: rest is authored via a work row's own REST stepper instead, for the same "not reachable from a create-mode button, but still editable" reason |
| The builder-redesign handoff's own `rows` state models **only work steps** — no `kind` field at all (just `dur`/`unit`/`ref`/`off`/`spm`/`rest`) | `wu`/standalone `r` steps still render, are still editable, and still round-trip through Save unchanged — `StepEditor.tsx`'s minutes-only editor branch (header, DUR, DONE — no PACE/SPM/REST/TARGET), `builderState.ts`'s `stepToRow`/`toSteps` | Same standing reason as the `+ ADD ROW` row above, restated because this redesign's own handoff repeats the omission rather than fixing it: the domain distinguishes warm-up/work/rest steps and all 35 starter workouts (plus anything bulk-imported) can contain a stored `wu`, so a builder that silently dropped it on open-and-save would destroy data the moment an existing workout was edited. `StepCard.tsx`'s collapsed summary is equally honest about it (`stepSummary`/`stepSubSummary` read `row.kind` rather than fabricating a pace reference a `wu`/`r` row never had) |
| Free-text `DUR` field (`input placeholder="1'"`) — the encoding (minutes vs. meters) is implied only by what the rower happens to type | A numeric value field paired with a two-chip **MIN / M** unit toggle (`DurationInput`), each control ≥44px | Free text left the unit ambiguous — a rower had to remember whether to type a bare number, `10'`, or `2500m`, the same category of defect (an invalid or ambiguous hand-typed value) that started this phase for PACE REF below. The toggle makes both encodings equally easy to author with nothing to remember, and the value field alone stays a plain number `toSteps` bounds-checks directly, no grammar involved |
| New handoff's SPM stepper: `+` from empty jumps to **18** ("Interactions & behaviour") | Ergomatic's SPM stepper (`StepEditor.tsx`, built on the shared `Stepper.tsx`) wakes at **20** instead, and clamps to a ceiling of **60** and a floor of **10 before clearing back to FREE** rather than the handoff's implied `0..40` | 20 is the wake value Ergomatic's SPM control has used since before this redesign (the now-deleted `SpmInput.tsx`'s own free-text-plus-steppers control, itself mirroring James's own rule for the wake value) — the redesign changed which control renders SPM, not what pressing `+` from empty should land on, so the value carried through unchanged. The handoff's `18`/`40` are its own prototype's picks, never reconciled against a real cadence; `60` matches `domain/validate.ts`'s actual `int(s.spm, 10, 60)` ceiling. The `10` floor does **not** carry the same "server accepts it" justification — *absent* spm is equally acceptable to the server (SPM stays optional), so `−` at 10 clears to `""`/FREE rather than sticking at 10; only the ceiling is a real server-bound clamp |
| Workout numbers everywhere (`NO. 159`, `159. Lucky Penny`, a `No.` field in the builder) | No numbers in the UI at all; `sort_order` orders the library invisibly | The number is a book-catalogue artifact. Requiring one when authoring forced an invented value, and globals and personal rows number independently so the same number could appear twice. Ordering is what the column was actually doing |
| §11's 64px accent-text `PACE REF` field, accepting free text (`2k`/`6k-2`/`2k+4`) per a named regex | A `2K`/`6K` chip pair plus a ±60 offset stepper, on its own line beneath the row | Free text let a rower type `8k` and get an inline error — the defect that started this phase; a structured control makes an invalid ref unrepresentable. Four extra tappables (two base chips, two stepper buttons) don't fit inline at 390px |
| New handoff's PACE offset stepper: `±1s` per tap, clamped **`−15…+30`** ("Interactions & behaviour") | Ergomatic clamps the same stepper (`PaceRefInput.tsx`, reused wholesale by `StepEditor.tsx`) to **`±60`** | `±60` is the domain's own bound (`domain/validate.ts`), already in place before this redesign — see the `PACE REF` row above, from the free-text-field defect this phase started with. The redesign changed the offset stepper's surrounding card, not its bound. The handoff's tighter `−15…+30` is the prototype's own scope, never reconciled against what the server actually accepts; matching it would make some previously-valid, already-saved workouts unrepresentable in the builder |
| §11's `+ PASTE TO BULK IMPORT` toggle on the New-workout screen | Its own screen at `/library/import`, reached from a control in the Library header | James reported that mixing bulk paste into the single-entry form was confusing |
| Handoff's × on a step row deletes it immediately, no confirmation | `StepCard.tsx`'s collapsed × swaps the row's action group for an inline `DELETE?` / `YES` / `NO` confirm (`confirmingDelete` state) instead of deleting on the first tap | The × sits 44px away from the duplicate (⧉) cell in one joined action group, tapped mid-authoring on a phone — a mis-tap there must not silently destroy an already-configured step. `NO` restores the normal action group with nothing lost; only `YES` calls `onDelete` |
| N/A — the handoff has no notion of a "convenience" tap area smaller than a real control | `StepCard.tsx`'s collapsed card exposes two extra clickable areas that duplicate the 48×44 `EDIT` cell's action (`onExpand`) at less than 44×44: `.step-card-line1` (326×18, the index/summary/split line) and `.step-card-sub` (180×14, the sub-summary line) | Design doc §4a's own geometry (an **~86px** collapsed card holding an 18px summary line, a 14px sub-summary line, and a 48×44 `EDIT` cell side by side) makes a compliant-height summary line impossible without growing the card past spec. WCAG **2.5.8 Target Size (Minimum, AA)** — not 2.5.5 Enhanced (AAA), which does not apply here — requires 24×24 *or* one of several exceptions; the **Equivalent Control** exception is satisfied because the fully compliant 48×44 `EDIT` cell performs the identical action in the same card, so these two lines are a redundant path to that target, not the only one. CLAUDE.md's own rule ("every tappable ≥44×44") is flatter than WCAG and carries no such exception, so these two areas are a genuine, acknowledged violation of the *project's* rule — accepted as unavoidable given §4a's fixed card geometry, not fixed here |

Superseded by the builder redesign (`docs/design/builder-redesign/`, Phase
5E): the permanently-expanded row list (`StepRowEditor.tsx`, deleted this
phase) is replaced by an accordion — one card open at a time
(`StepCard.tsx`/`StepEditor.tsx`). The Save button reads **`Save to
library`**, the handoff's own label: an earlier `Save` shortening was tried
and reverted this phase at James's request, so there is currently no
deviation to record for it. Four rows previously listed above are retired
the same way — either reconciled into a row further up (against this
redesign's own handoff, not the pre-redesign one) or summarized in a bullet
below, so the table only ever describes what's actually shipped:

- The SET cell's old clone-button replacement (`↻`, `aria-label="Duplicate
  Row N"`) is gone along with the permanently-expanded row-list screen it
  belonged to. `StepCard.tsx`'s own collapsed `⧉` (`aria-label="Duplicate
  Step N"`) and `StepEditor.tsx`'s expanded `DUPLICATE` are its
  replacements; the reasoning for deriving the repeat span rather than
  marking individual rows (a non-contiguous mark set can't round-trip
  through the domain's single `reps` marker) still holds and needs no
  separate row of its own — nothing about the redesign changed that model.
- The `§11` column-header strip and its per-field-affix replacement (a
  visible `DUR`/`REST`/`SPM` label beside each control instead of a strip
  above the row) no longer apply: the accordion's collapsed card has no
  header at all (just a two-line summary), and the expanded editor's own
  per-row labels (`.step-editor-row-label`) are this redesign's own spec
  (§4b), not a workaround for a header that stopped fitting.
- The free-text-plus-steppers `SpmInput.tsx` (and its own 40px-tap-target
  fix, since the free-text field it wrapped was narrower than the 44px
  steppers beside it) is deleted; SPM is now a bare Stepper built directly
  into `StepEditor.tsx`, uniformly 44px like every other control, per the
  redesign's own SPM row spec (label + stepper, no typable field). Its
  wake-value/bound departure from the redesign's own handoff is recorded in
  its own row above now, rather than repeated here.
- The five-cell SVG-face pain picker (`--pain-1`…`--pain-5` and their
  `-fill` counterparts) is gone — `PainPicker.tsx` and those tokens were
  deleted this phase, replaced by `ClassificationCard.tsx`'s numerals-only
  EXPECTED PAIN control on the separate `--pain-ramp-1..5` family. This
  isn't just superseded, it's reconciled: the redesign handoff itself
  (`builder-redesign/README.md`, EXPECTED PAIN section) explicitly drops
  the ink-stroke faces, so numerals-only is no longer a deviation from the
  (current) handoff at all.

Everything else in the handoff (palette, type, spacing, 44px targets, AA,
2px radii, screen structures, pace math, timer behavior) remains binding.
