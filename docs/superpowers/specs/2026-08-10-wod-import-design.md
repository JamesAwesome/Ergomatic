# WOD import tooling — the fetcher and the `wod-import` skill

**Date:** 2026-08-10
**Decided with James:** on-demand skill-driven workflow (no cron/ntfy in
v1 — dropped by James's redesign; revivable later on the same fetcher);
raw third-party text lives OUTSIDE the repo; translations reach the app
only through James's own paste into `/library/import`.

## What this builds

Two artifacts:

1. **A deterministic fetcher** (`scripts/wod/fetch-wods.mjs`) that pulls
   Concept2 Workout-of-the-Day pages for arbitrary dates and appends them
   to a local JSONL dump.
2. **A project skill** (`.claude/skills/wod-import/SKILL.md`,
   user-invocable) that orchestrates pull → curate → translate →
   present-for-James, with persistent state so it never re-offers what
   he has ruled on.

## Evidence base (verified 2026-08-10, this session)

- `https://log.concept2.com/wod/{YYYY-MM-DD}/rowerg` is server-rendered
  HTML carrying the day's workout text verbatim; verified for
  2026-08-10 ("Complete six 500 meter pieces…"), 2026-07-15 ("Four 4
  minute pieces…"), and 2025-11-03 ("20 rounds of 45 seconds work…") —
  the archive is date-addressable at least that deep, no auth, no JS.
- Post-warmup-setting bulk grammar (`app/domain/bulk.ts` header, read
  this session): well-formed `wu` lines are dropped-and-counted; imports
  are all-or-nothing (Phase CL). Translations therefore emit `w`/`r`
  lines plus the `title | type | difficulty | pain` header only.

## Part 1 — the fetcher

`scripts/wod/fetch-wods.mjs`, plain Node (stdlib `fetch`, zero deps, no
build step; node exists everywhere this runs — dev Macs and the deploy
host both run pnpm already).

- **Invocation:** `node scripts/wod/fetch-wods.mjs --date 2026-08-10` or
  `--range 2025-01-01 2025-03-31`. Range mode paces requests at ~1/sec
  (politeness to their leaderboard infra).
- **Extraction:** date, title (when the page names one), the verbatim
  instruction text, source URL, retrievedAt. Fixture-driven: today's
  real HTML committed under `scripts/wod/fixtures/` (ONE page as a
  structural fixture is test apparatus, not a content archive — the
  policy line below governs the dump, which stays out of the repo).
- **Output:** append-only JSONL at `~/.ergomatic/wods/raw.jsonl` — one
  `{date, equipment: "rowerg", title, raw, sourceUrl, retrievedAt}` per
  line. Dates already present are skipped (idempotent re-runs). A page
  whose shape the extractor doesn't recognize appends
  `{date, error, excerpt}` — explicit, never silent. Path overridable
  via `--out` (tests use a temp dir).
- **Why home-dir, not repo:** house content policy (the Erg Book's
  originals never entered the repo; same posture for third-party WOD
  text) plus worktree-independence — a repo-relative dump would fragment
  across worktrees.

## Part 2 — the skill

`.claude/skills/wod-import/SKILL.md` (project skill, user-invocable as
`/wod-import`; description tuned so "add workouts from the Concept2
WODs" triggers it).

**State:** `~/.ergomatic/wods/state.json` —
`{cursor: <oldest date pulled>, ruled: {"<date>": {status: "imported" | "rejected" | "pending", title?, reason?}}}`.
The skill owns read-modify-write; the fetcher never touches it. The
SKILL.md documents the state contract explicitly (its falsifying line:
a self-check step instructing the agent to re-read state after writing
and confirm the just-ruled dates are present).

**The workflow the skill encodes:**

1. Parse the ask ("~N workouts"); read state; run the fetcher for
   roughly 2×N dates the state hasn't seen, walking backward from the
   cursor (initial cursor: today).
2. **Curate** the new pulls: keep candidates that (a) translate cleanly
   to the app's step model — time or distance work steps with optional
   rests; skip team/relay/ergathlon/choice-of-machine shapes and
   anything whose prose defies a faithful structure; (b) add variety
   against BOTH the existing library's type×duration distribution and
   the state's already-imported set; (c) don't structurally duplicate an
   existing library workout.
3. **Translate** each candidate to one bulk-grammar block: an original
   title in the app's naming voice (never C2's text), type/difficulty/
   pain classified per the house rubric — the skill cites its own
   reading list: the types article (`app/src/news/content/bodies/
   workoutTypes.tsx`), `app/domain/generation/patterns.json`'s bands,
   docs/TESTING or DEVIATIONS conventions for the 1–5 pain scale. `w`/
   `r` lines only. Every block must be VALIDATED before presentation by
   running it through the real parser (`node` one-liner importing
   `domain/bulk.ts`'s `parseBulk` — the skill includes the exact
   command); a block that fails to parse never reaches James.
4. **Scale on request:** variants by interval count (more/fewer rounds)
   or intensity (pace ref, SPM). A variant is presented BESIDE its
   faithful translation with the delta stated ("original 6×500m; scaled
   8×500m"). Scaling respects type semantics (an AN piece doesn't scale
   into a 40-minute grind and keep its label).
5. **Present:** a table per candidate — date, raw text, translated
   block, variants — for James's opinion calls. On his ruling, update
   state (`imported` after he confirms the paste; `rejected` with his
   reason; `pending` if unruled) and re-verify the write per the state
   contract.

**Not in the skill's power:** touching the app's DB, the seed files, or
the API; committing raw WOD text anywhere in the repo. Promotion of any
translated workout to the GLOBAL library is a separate per-batch
decision with its own seed-file process — the skill's output lands as
James's personal workouts via his own paste.

## Testing

- Fetcher: vitest unit project (`scripts/wod/fetchWods.test.ts` —
  confirm the unit glob covers `scripts/**` or place per convention;
  the plist round used `server/` for exactly this reason — follow that
  precedent if needed). Cases: extraction against the committed
  fixture; unknown-shape → error line; JSONL append + skip-existing
  (temp dir); range pacing (fake timers over the delay helper);
  CSV—n/a. Self-mutations per the briefing.
- Skill: its structure follows superpowers:writing-skills if available;
  minimum bar — the state contract is written as testable steps, and
  the validation command in it is real (run it once against a known
  block during implementation and record the output in the PR).

## Out of scope, recorded

Cron + ntfy revival on this fetcher; SkiErg/BikeErg equipment;
automatic Claude API translation (the skill IS the translator while
tokens-on-demand is the preference); global-library promotion.
