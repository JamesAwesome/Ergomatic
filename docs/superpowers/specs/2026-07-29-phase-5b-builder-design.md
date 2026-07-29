# Phase 5B — Builder, Bulk Import, Authoring Loop — Design

Approved 2026-07-29. Completes ROADMAP Phase 5 (5A shipped the read path:
tokens, tab shell, Library, Workout detail, baseline editor). This phase is
the WRITE path: authoring your own workouts.

**Nothing server-side changes.** `POST /api/workouts`, `POST
/api/workouts/bulk`, `PUT /api/workouts/:id`, `DELETE /api/workouts/:id` all
exist and are tested; `parseBulk` already handles distance steps and per-line
errors; `validateWorkoutInput`/`validateSteps` already enforce every rule this
screen must respect. 5B is purely the screens that drive them.

`docs/design/` is the UI authority except where `docs/design/DEVIATIONS.md`
overrides. 44×44 hit targets and WCAG AA are hard requirements.

## Decisions

| Question | Decision |
|---|---|
| Scope | **Full authoring loop**: create + edit + delete of the rower's own workouts. Global starter rows stay read-only — the UI shows no edit/delete affordance for them at all (the server already 403s; never offer what will be refused) |
| Pain picker | **Build the SVG smiley picker now** as a shared component; Phase 6's log screen imports it rather than reinventing it. Supersedes the differentiation spec's tentative "Phase 6" scheduling, which predates the 5A/5B split |
| Edit route | Same builder screen, prefilled, at `/library/:id/edit`, saving with PUT. One component, two modes — not a second screen |
| Validation | Client-side checks mirror the domain validators for inline feedback; the SERVER stays the authority. Never diverge the rules — where a bound exists (spm 10..60, rest 0.5..60, minutes 0.5..180, num 1..9999, title 1..80, ≤100 steps, ≤1 reps marker, ≥1 work/test step), the client reuses the same numbers |
| Row state | A pure, separately unit-tested module — row add/remove/mark, repeat math, totals. Components stay thin |

## Pain picker (`src/components/PainPicker.tsx`)

Five 44×44 cells. Each renders a minimal ink-stroke SVG face (the paper
style: 1px `--ink` stroke, no gradients, no shadows) filled from a muted
green→red ramp, **with the numeral always beside the face** — never a face
alone. Selected cell gets the accent border treatment used by chips.

Ramp (a deliberate palette extension; measured, not guessed):

| Pain | Hex | vs `--surface` | vs `--page` |
|---|---|---|---|
| 1 | `#4f6b4a` | 5.84 | 5.26 |
| 2 | `#6d7c3f` | 4.48 | 4.04 |
| 3 | `#94742a` | 4.31 | 3.88 |
| 4 | `#a85423` | 5.22 | 4.70 |
| 5 | `#b5341f` (= `--accent`) | 5.94 | 5.35 |

All five clear the 3:1 floor WCAG 1.4.11 sets for meaningful graphics
(worst 3.88). Adjacent steps differ mainly in HUE, not luminance, so color
alone never carries the meaning — the numeral and the mouth curve each
convey it independently (WCAG 1.4.1). Added to `tokens.css` as
`--pain-1`…`--pain-5` and recorded in DEVIATIONS.md with these ratios.

## Builder (`/library/new`, replacing 5A's placeholder)

Per handoff §Screens → "11. New workout (builder)", one screen:

- **Header fields**: `No.` (num) and `Title`.
- **TYPE**: AN / O2 / AT / TR chips, 44px, active chip filled with that
  type's own color (`--type-*`) and cream text.
- **DIFFICULTY**: EASY / MEDIUM / HARD chips (deviation: was
  Introductory/Moderate/Advanced).
- **EXPECTED PAIN**: the picker above (deviation: 1–5, was 1–10).
- **Step table** under the column header `SET · DUR · PACE REF · SPM · REST ·
  SPLIT`. Each row carries: a 44px **SET** toggle (dim ↻; when marked, accent
  fill with cream ↻ plus a 3px accent left rule on the row) that flags the row
  as part of the repeat block; **DUR** accepting minutes OR meters with an
  explicit unit (`10'`, `2500m` — same grammar `parseBulk` uses, so the two
  input paths agree); **PACE REF** (accent text) validated live by
  `parsePaceRef`; **SPM**; **REST**; a 44px delete ×; and **the resolved split
  on a second line**, computed live from the rower's baselines via
  `resolveSplit`/`toleranceRange`.
- **`+ ADD ROW`** dashed row.
- **REPEAT (OPTIONAL)**: −/+ ×N with the handoff's readout `1 row marked ·
  7:00 per set`. Maps to the domain's single `reps` marker step, which the
  validators cap at 1..12 and forbid as the last step.
- **TOTAL**: loose minutes + set minutes × reps.
- **`+ PASTE TO BULK IMPORT`** toggle revealing the dashed textarea.
- **`Save to library`**.

Warm-up and rest steps are authored as their own row kinds (`wu`, `r`), since
`validateSteps` models them separately from work steps.

## Bulk import

The textarea's placeholder is the handoff's "One workout per block, blank
line between". Submits the raw text to `POST /api/workouts/bulk`, which
returns `{created, errors:[{line, message}]}`. Render BOTH halves honestly:
what was created, and each error with its line number — a twelve-workout
paste with one bad line must say exactly which line and why. Do not discard
partial success, and do not report a partial success as a failure.

The grammar is already implemented and tested in `app/domain/bulk.ts` — the
UI documents it inline (header `num | title | TYPE | difficulty | pain`, then
step lines `wu 10`, `x4`, `w 1' 6k-2 @22 r5`, `r 5`) rather than
reimplementing any parsing client-side.

## Edit and delete

- Detail screen gains `Edit` and `Delete` for personal workouts only
  (`isGlobal === false`). Globals render neither.
- `Edit` → `/library/:id/edit`, the builder prefilled from the existing
  workout, saving via PUT.
- `Delete` asks for confirmation before destroying, then returns to
  `/library`. Logs survive by design (`workout_id` nulls on delete, and the
  log keeps frozen title/type copies) — the confirmation says so plainly
  rather than implying history is lost.

## Errors

- Field-level problems render inline next to the field, in the same voice as
  the rest of the app.
- A `409` num-clash reads "that number's taken", never a raw status.
- A failed save keeps the rower's work on screen — never clear the form on
  error.
- No baselines set: rows still author fine; the SPLIT column shows the same
  "no target" treatment 5A established, with a link to You.

## Testing & exit criteria

- **Unit:** the row-state module — add/remove rows, SET marking, repeat count
  bounds, totals with and without a repeat block, and the minutes-vs-meters
  duration parse. Pure functions, no React.
- **Component:** required-field validation surfacing; the bulk result view
  rendering created rows AND per-line errors together; global workouts
  showing no edit/delete controls.
- **e2e:** author a workout whose step is **`6k -2 @ 22 SPM`**, save it, open
  its detail, and assert the resolved range from real baselines — this is
  the literal exit criterion ROADMAP Phase 5 has carried since the start and
  which 5A could not reach (no seeded workout has a negative 6k offset).
  Plus: a bulk paste with one bad line reports that line and still creates
  the good ones; editing a workout changes what detail shows; deleting
  removes it from the library.
- **Design:** builder registered in `design.spec.ts` (44×44 sweep, axe
  `wcag2a`/`wcag2aa`, token pins); screenshots of the builder and the bulk
  panel into `docs/screenshots/`, embedded in the PR.
- Coverage gate 90×4 holds; `domain/**` stays 100 (untouched — this phase
  consumes it).
- **Exit:** the `6k -2 @ 22 SPM` round trip passes on the deployed app.

## Out of scope

Today/Plan/Trend screens, session flow, timer, logging (Phase 6+). Copy-on-write
editing or hiding of GLOBAL workouts (recorded Phase 5 follow-ons — this phase
only makes personal rows editable). Preferences, multi-account, test history.
JSON import/export and the parametric generator (backlog follow-ons). PM5.
The app-icon redraw (already recorded, gated on external TestFlight).
