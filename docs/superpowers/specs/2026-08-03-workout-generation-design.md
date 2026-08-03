# Workout Generation Phase — Design

**Date:** 2026-08-03 · **Status:** approved in brainstorm, pending James's spec review
**Sequence:** after Today enhancements (PR #42), before Phase 7 (PM5). Roadmap: the
"workout-generation phase" queue entry (ROADMAP.md ~line 636).

## Goal

Replace the 35-workout starter library with ~300 original workouts so TestFlight
testers have realistic content, using James's Erg Book photos as the structural
reference — **patterns and parameters only, never entries/titles/prose** (content
policy, ROADMAP.md line 724 / docs/design/DEVIATIONS.md line 13). Also produce a
private CSV of the book originals for James's personal use.

## Decisions (made in brainstorm, 2026-08-03)

| Decision | Choice |
|---|---|
| Destination | Seeded global library — offline generation pass, no runtime generator |
| Existing 35 starters | **Regenerated away** — clean 300 replaces them |
| Duration distribution | Sweet-spot heavy: 10% <20', 25% 20–30', 40% 30–45', 15% 45–60', 10% 60'+ |
| Type spread | O2 30% / AT 25% / TR 25% / AN 20% |
| Naming | Weather/atmospheric theme expanded to ~300 (intensity maps to violence of phenomenon, per starter convention) |
| Originals CSV | Personal use, lands on James's Desktop, **never enters the repo** |
| Review gate | James approves the generated batch before it ships; normal SDLC (worktree → PR → explicit approval) |

## Inputs

66 JPEG photos (`ergbook_photos.zip`, extracted to session scratchpad), each a
two-page spread of the book's workout catalog. Cards carry: number + title,
warm-up line, work/rest lines, and chips for total minutes, section, pain (1–5),
and type (O2/AT/TR/AN, plus an Intro section).

## Pipeline

```
photos → EXTRACT → originals.json (private) → DIGEST → patterns.json (repo)
              ↓                                    ↓
       originals CSV (Desktop)              GENERATE (quota grid)
                                                   ↓
                                        VALIDATE → seed library (repo)
                                                   ↓
                                     James reviews → PR → seed migration
```

### 1. Extraction (vision, double-read)

Subagents read photo batches and emit one JSON record per workout: book number,
title, section, type chip, pain chip, total-minutes chip, and steps pre-mapped to
domain shapes (`SplitRef`/`EffortRef`, spm, reps, rest), plus a `rawText` field
for prescriptions the step grammar cannot express (e.g. "30-second bursts at max
rating every 5'") — those are kept as text, never force-fitted. A second
independent pass re-reads every photo; a script diffs the two passes and flags
disagreements for a third read. Integrity checks:

- computed step-sum vs. the printed total-minutes chip;
- book-number continuity across pages (catches skipped cards / duplicate spreads).

Non-workout pages (section intros, tests chapter) are recorded but skipped.
Cards still ambiguous after three reads go on a re-shoot list for James.
All extraction artifacts live in the session scratchpad, outside the repo.

### 2. Originals CSV (personal)

One row per book workout: book number, title, section, type, pain, book total,
warm-up, steps rendered in app notation (2k/6k offsets, max/min efforts, spm,
reps/rest), plus raw text where the grammar didn't fit. Written to
`~/Desktop/ergbook_originals.csv`. Not committed anywhere.

### 3. Pattern digest (repo-safe)

A script aggregates the reconciled originals into
`app/domain/generation/patterns.json`: per type × duration band —
interval-shape frequencies (n×time, n×distance, pyramid, ladder, variable-rate,
continuous), work:rest ratio ranges, pace-offset distributions per base, spm
bands, warm-up conventions, rep-count ranges. **Aggregate statistics only — no
titles, no prose, no per-workout rows.** This file is the fixture the future
runtime parametric generator (ROADMAP "Parametric workout generator") reuses.

### 4. Quota grid

Exact per-cell counts held in the generation script (adjustable at review):

| | O2 | AT | TR | AN | Total |
|---|---|---|---|---|---|
| <20 min | 2 | 5 | 9 | 14 | **30** |
| 20–30 | 14 | 19 | 22 | 20 | **75** |
| 30–45 | 36 | 34 | 32 | 18 | **120** |
| 45–60 | 18 | 13 | 9 | 5 | **45** |
| 60+ | 20 | 4 | 3 | 3 | **30** |
| **Total** | **90** | **75** | **75** | **60** | **300** |

Duration = total time including warm-up and rests. Difficulty/pain are not a
third quota axis: authors assign them per starter conventions (O2 mostly
easy/pain 1–2, AT 2–4, TR 2–4, AN hard/4–5); the validator rejects implausible
pairs. A ~320-name weather pool is generated and deduped up front, allocated
per cell so authors cannot collide.

### 5. Authoring + mechanical gate

Subagents each fill one or two cells, briefed with their cell's digest slice,
name allocation, and the starter library's authoring conventions (spm bands by
type, pace-ref conventions, comment style). Every workout must pass a
validation script:

- domain `validate.ts` passes;
- computed total lands inside the cell's duration band;
- spm within the type's band (O2 18–22, AT 22–26, TR 24–28, AN 26–32);
- rep-count and rest sanity;
- difficulty/pain plausibility pairs;
- structural dedup within the 300;
- **no structure+parameter clone of any book entry** (rowing-commons shapes —
  8×500m, 4×1000m, standard pyramids — exempted);
- quota grid exactly satisfied.

Failures bounce back to their authoring agent. The validator ships as a
permanent test over the seed content, not a throwaway script.

### 6. Seed replacement + migration

`STARTER_WORKOUTS` (app/server/seed/starter.ts) is replaced by the generated
300 — checked into the repo as original content — with sortOrder grouped by
type then easy→hard, matching current library ordering. New accounts seed 300.
Existing accounts get a one-time migration: unmodified seeded workouts are
swapped for the new library; session logs keep their rows and lose their
workout link (`session_logs.workout_id` is `ON DELETE SET NULL`) — acceptable
at current TestFlight scale and stated in the PR. User-created customs are
untouched, and a seeded workout the user has since edited counts as a custom
(kept, not swapped) — if the store cannot distinguish edited-seeded from
pristine-seeded, the migration errs toward keeping. Double-seed protection (`pg_advisory_xact_lock`) is preserved.

### 7. Product check + testing

- Library screen at 300 rows: re-run `pnpm e2e` and `pnpm screenshots` against
  the full seed; explicitly check list performance and that the type filters
  (PR #42) keep the library navigable. Screenshots must show the real seeded
  library (recurring failures #1, #7).
- Seed tests extend to the new content (starter.test.ts pattern).
- Fixtures that assumed "the 35" update to the real 300 (recurring failure #3).
- Per-file coverage checked for every file touched (recurring failure #2).

### 8. Review gate

Before merge: James receives the originals CSV (Desktop) and a review artifact
of the generated 300 — a rendered table grouped by grid cell (name, structure,
pace refs, spm, pain) supporting rejection of individual workouts or whole
cells. Rejections regenerate. Then normal SDLC: PR with screenshots and the
migration note; **no merge without James's explicit approval**.

## Error handling

| Failure | Handling |
|---|---|
| Photo illegible / passes disagree ×3 | Re-shoot list for James; extraction proceeds without the card |
| Prescription outside step grammar | Kept as `rawText` in originals; digest notes the motif; generation only uses expressible structures |
| Generated workout fails validation | Bounced to its authoring agent with the failure reason |
| Quota unfillable for a cell (digest too thin) | Cell shrinks, neighbor cell grows, noted in review artifact |
| James rejects workouts at review | Regenerate rejected slots before PR |

## Out of scope

- Runtime parametric generator ("generate me a 45' AT workout") — separate
  queued roadmap item; this phase only produces its `patterns.json` fixture.
- Library pagination/virtualization — only if the 300-row check reveals a real
  problem, and then as its own decision.
- Any change to workout schema, logging, or plans.

## Risks

- **Log-link loss on migration**: existing logs point at seeded workout IDs;
  regeneration nulls those links. Accepted at TestFlight scale; called out in PR.
- **Extraction ambiguity**: mitigated by double-read + arithmetic and
  continuity checks; residue goes to the re-shoot list rather than shipping.
- **Same-y content at 300**: mitigated by digest-grounded authoring, structural
  dedup, and James's cell-level review.
- **Content-policy drift**: only `patterns.json` (aggregates) and the original
  300 enter the repo; originals.json and CSV stay outside. The validator's
  no-clone check enforces structural distance from book entries.
