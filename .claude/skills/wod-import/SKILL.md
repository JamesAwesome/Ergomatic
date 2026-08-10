---
name: wod-import
description: Pull Concept2 Workouts-of-the-Day, curate and translate them into Ergomatic's bulk grammar (optionally scaled), and present them for James's import decisions. Use when James asks to add workouts from the C2 WODs, mentions the workout of the day, or wants the WOD backlog mined for library material.
---

# wod-import

You are curating third-party workouts into Ergomatic's vocabulary for
James to review. You never touch the app's database, API, or seed files,
and raw WOD text never enters the repo. Your output is bulk-grammar
blocks James pastes into /library/import himself.

## State (read first, every run)

`~/.ergomatic/wods/state.json`:

    {
      "cursor": "YYYY-MM-DD",   // oldest date ever pulled
      "ruled": {
        "YYYY-MM-DD": { "status": "imported" | "rejected" | "pending",
                         "title": "...", "reason": "..." }
      }
    }

If the file is missing, initialize it with cursor = today and empty
ruled. The raw dump is `~/.ergomatic/wods/raw.jsonl` (the fetcher owns
it; you only read it).

State discipline: after EVERY write, re-read the file and confirm the
dates you just ruled are present with the status you wrote. A run that
cannot verify its own state write stops and says so.

## The workflow

1. Parse the ask into a target count N (default 5 if unstated).
2. Read state and the dump. Collect unruled dates already in the dump
   first; if fewer than 2xN, run the fetcher backward from the cursor:
   `node scripts/wod/fetch-wods.mjs --range <cursor minus K days>
   <cursor minus 1 day>` with K sized to bring unruled candidates to
   about 2xN. Update cursor. Error records in the dump count as ruled
   rejected (reason: scrape error); record them so they are never
   re-pulled.
3. Curate. Keep a candidate only if ALL hold:
   - It translates faithfully to time/distance work steps with optional
     rests. Skip team/relay/choice-of-equipment/technique-drill shapes;
     when the prose is ambiguous, skip rather than guess.
   - It adds variety: check the type x duration spread of BOTH the
     app's library (read `app/server/seed/library/index.ts`'s grid
     comment for the bands) AND the state's already-imported titles.
   - It is not a structural duplicate of an existing library workout
     (same interval count, durations, and rest shape).
4. Translate each keeper into ONE bulk-grammar block:
   - Original title in the app's naming voice. Never C2's own text as
     the title.
   - Type, difficulty, and pain per the house rubric. Read, in this
     order, before your first classification of the run:
     `app/src/news/content/bodies/workoutTypes.tsx` (what the types
     mean), `app/domain/generation/patterns.json` (work:rest and spm
     bands per type x duration), and the pain-scale article
     (`painScale.tsx`) for the 1-to-5 semantics.
   - `w`/`r` lines only. Never author `wu` lines: the app dropped
     workout-owned warm-ups (the warmup setting); the import would
     drop them anyway.
   - VALIDATE before presenting: write the block to a temp file and run
     `WOD_BLOCK_FILE=/tmp/block.txt pnpm --dir app exec vitest run
     --project unit server/wodBlockValidation.harness.test.ts --reporter=verbose`
     with the block's text in that file. A block that does not print OK
     never reaches James; fix it or drop the candidate.
5. Scaling, only when James asks (in the original request or per
   candidate): produce a variant block beside the faithful one, delta
   stated in one line ("original 6x500m; scaled 8x500m" or "original
   open rate; scaled @26"). Two levers only: interval count, and
   intensity (pace ref or spm). A scale that would change the workout's
   honest type is not a scale; reclassify or do not offer it.
6. Present a table: date, C2 title, raw text (short), your block (and
   variant), your classification reasoning in one line each. Ask for
   James's calls.
7. On his rulings: imported -> status imported with the final title
   (only after he confirms the paste landed); rejected -> status
   rejected with his reason verbatim; unruled -> pending. Write state,
   then re-verify per the discipline above.

## Hard limits

- Never insert into the app, never edit seed files, never commit raw
  WOD text (the one HTML fixture under scripts/wod/fixtures/ is test
  apparatus and not yours to grow).
- Fetch politely: the fetcher's built-in pacing is the floor; never
  parallelize pulls.
- If the fetcher reports error records for a whole range, the page
  shape may have changed: stop, show James the excerpt, and suggest
  re-running the fetcher's own tests against a fresh fixture.
