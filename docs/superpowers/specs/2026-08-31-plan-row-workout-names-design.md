# Plan rows name what you rowed — consolidated design record

**What and why.** A completed day on the Plan screen used to show only a
checkmark. It now names the workout that closed it, marks days rowed as
something other than the plan asked (`INSTEAD OF <x>`), and treats the
two designated test workouts as real workouts rather than uppercase
labels. This spec is RETROACTIVE consolidation (James, 2026-08-31: "did
we write a proper spec?") — the work shipped across #233 (v0.28.0) and
the edge-marks PR under bounded-path Gate 0 artifacts; every decision
below carries the ruling that settled it, and this file is now the one
home the artifacts and PR bodies point to.

## Decisions, each with its ruling

1. **Which rows name a workout.** Done rows name what was rowed; the
   three checkpoint days name their prescribed test even before they
   happen; other upcoming days name nothing. One class
   (`.plan-row-name`), one voice — sentence case at `--ink`, never the
   uppercase label treatment (James, 2026-08-30: "a 2k test is just a
   specific workout on a specific day"). `.plan-row-checkpoint` is
   deleted.

2. **What "swapped" means.** Two triggers, one mark, checkpoint branch
   wins: (a) a checkpoint day not rowed as prescribed; (b) any other day
   whose rowed type differs from the plan's. Derived, never stored
   (Gate 0, 2026-08-30) — accepted cost: editing a preset's session
   types rewrites history retroactively (warning sits above
   `SPRINT_WEEKS`).

3. **Checkpoint identity is the LINKED workout row's own
   `(title, isGlobal)` pair** — `resolvePrescribed`'s predicate one
   layer down, both facts off one row. Mixing the log's snapshot title
   with the join's ownership was two live P1s (James's #233 reviews):
   the two sources are free to disagree because `POST /api/logs`
   resolves `workoutId` only for ownership. The snapshot title (via
   `canonicalTitle`) is the fallback only when no linked row exists.
   Unknown identity never manufactures a mark.

4. **The badge shows the type ROWED** (readable stored type), else — for
   a linked row with an unreadable pre-validation type — a bordered
   shaded box (`--rule-2` fill, `--rule-3` border) that IS a
   `.type-badge` with two no-break spaces, so its box model equals every
   neighbour by construction (James, 2026-08-31: shaded box; border;
   size checked against the others). Unlinked rows keep the plan's
   badge: legitimately the plan's own claim.

5. **Mark wording: `INSTEAD OF <x>` everywhere** (option D, James,
   2026-08-31). The workout's own name in its own case; a type code
   uppercase because it genuinely is one.

6. **The designated titles are RESERVED at all three workout-writing
   doors** (James, 2026-08-31, after verifying name conflicts are
   otherwise allowed — `workouts.title` carries no unique constraint).
   `POST`, `PUT`, and `POST /api/workouts/bulk` reject "2K Test"/
   "6K Test" for personal rows — bulk was unguarded in the first cut and
   the PM gate caught it (its C1: enumerate the VALIDATOR's callers, not
   the routes you changed). One message, `title is reserved. Pick
   another name` (James's pick, discharging the copy's Gate 0), mirrored
   at the Builder field. Exact match. Legacy rows keep rendering, stay
   suggestable, and are separated by decision 3 — and editing one
   WITHOUT renaming it is rejected too (James, declining the narrower
   changed-into rule: "I don't want to engineer a solution to an
   imaginary problem"). General title conflicts remain allowed. **This
   reservation is a fence around the app's string-keyed identity for its
   test workouts, not a product principle** (PM gate): the retirement
   trigger is a stable seed key replacing `isOnboardingTitle`'s
   remaining call sites, at which point the names can be released.

7. **Type validation at the writer.** `POST /api/logs` validates
   `workoutType` against the union (the O2→AT drift is between valid
   members, so the union accepts all documented history). Reads stay
   tolerant for pre-validation rows — which is the entire population
   decision 4 exists for.

8. **Accepted, with rulings, not built:** deletion of a same-titled
   personal workout un-marks a completed row (James: "2 is fine I don't
   need a mock up"; the stored-provenance column is TRIAD and
   deliberately not built). `workoutIsGlobal: null` is UNKNOWN, never
   "personal".

## Testing posture (docs/TESTING.md governs; this section is the map)

- Store contracts pin the identity pair against BOTH backends (the fake
  resolves via the workouts store where the real store LEFT JOINs).
- The e2e seam suite (`log.spec.ts`) drives POST → real workout row →
  plan-links response → hook → rendered row: the cross-linked falsifier,
  the global no-mark case (gated on the resolved link — the false-green
  fix from #235's review lineage), and the reservation at the front
  door. The personal same-title e2e RETIRED with the reservation — its
  supported producers all guarded (the PM gate corrected the first
  "producer gone" claim, which had missed bulk); the legacy class keeps
  store+client gates.
- `globalOnly: false` is pinned via a mocked prescription — its only
  producer.
- Every new assertion has a recorded biting mutation (RF21) in the PR
  records of #233/#235/edge-marks.

## Cross-references

Gate 0 artifacts (session-local; this file supersedes them as the
citable record): swapped-plan-rows (2026-08-30), plan-row-edge-marks
(2026-08-31). PR records: #233, #235, #237, and the edge-marks PR.
ROADMAP rulings: reservation, wording D, deletion acceptance, unknown
box — all under "Small, queued" with RESOLVED/RULED prefixes.
