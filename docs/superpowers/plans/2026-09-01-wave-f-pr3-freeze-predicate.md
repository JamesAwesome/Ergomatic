# Wave F PR 3 — Freeze Predicate Implementation Plan (SKELETON — DO NOT EXECUTE)

> **GATED (spec §4, binding): no predicate change until §3's field
> measurements exist and have been read — FIRST as the instruments' own
> acceptance test, THEN as data (the PM #258 gate's corollary).** v0.33.0
> puts the instruments on James's phone; his ordinary backgrounds/locks
> produce the numbers; the DIAGNOSTICS door brings them back. This skeleton
> is everything that does not depend on those numbers: the invariants, the
> lifetime table, the reading protocol, and the antagonist's target list.
> The task sections are written AFTER the first field reading, not before.

**Goal (from spec §4):** the pause predicate distinguishes "the rower
stopped" from "the stream stopped delivering fresh frames" — the
`pause-declared` at 66 spm false positive — using whatever §3's
measurements show actually separates the two, with frame-arrival timing the
candidate the instruments were built to evaluate.

**Spec:** `docs/superpowers/specs/2026-08-31-lifecycle-design.md` §4 (and
§3 for the instruments' shapes). RF27 binds this plan: invariants below,
mechanisms only after the data.

## Invariants (the plan's contract — the antagonist attacks THESE)

- I1 — A genuine pause still declares: every committed capture that fired
  `pause-declared` before this change still fires it after (corpus
  regression over all committed recordings, the RC-25 posture).
- I2 — A resume-edge staleness episode never declares a pause by itself:
  frames that repeat the pre-background freezeKey (per §3's `stale=true`
  evidence) do not count toward `PAUSED_FRAME_HOLD` — or whatever narrower
  rule the field numbers justify; the invariant is "staleness alone is not
  a stop", the mechanism is TBD-from-data.
- I3 — The predicate stays a pure function of its inputs (the
  `nextFreezeRun`/`isPausedRun` export shape survives; replay tests keep
  driving it frame-by-frame).
- I4 — No number a rower sees changes meaning: the frozen-hero mirror and
  PULL TO RESUME copy keep their semantics; only WHEN they engage moves.
  (This is the TRIAD-adjacency: if the field data forces a
  meaning-of-a-number change, STOP — full TRIAD treatment, PM at the PR.)
- I5 — Every new input to the predicate appears in the ring at the moment
  it influences a decision (measure-and-record, assert-no-cause).

## Lifetime table (RF27 — complete before any implementation task is written)

| State | Mint site | Clear sites | Survives teardown? relaunch? re-arm? |
| --- | --- | --- | --- |
| `freezeRef` (`FreezeRun`) | first rowing frame per interval | non-rowing frame; per-run resets (`program()`/`beginFreeRow()`/RC-37 exit); `connect()` | no / no / no |
| `resumeEdgeArmedRef` | foreground lifecycle edge | first post-resume frame (consume); the three fresh-arm sites; `connect()` | no / no / no |
| `preBackgroundFreezeKeyRef` | background lifecycle edge | same as armed ref | no / no / no |
| `resumeStaleRunRef` | first stale post-resume frame | differing frame; second resume; fresh arm; teardown | no / no / no |
| ANY new predicate input added by §4 | MUST be rowed into this table with all three columns before the task is written | — | — |

## The field-ring reading protocol (runs BEFORE any task is drafted)

1. James backgrounds/locks his phone during ordinary connected use on
   v0.33.0+; after a session that included at least one background, he
   copies the log via You → DIAGNOSTICS → Monitor logs and pastes it here.
2. **Acceptance pass first (RF11 guard):** does `resume-first-frame`
   appear at all; is `gapMs` plausible against the ~2.2/s baseline; does
   `framesWhileHidden` agree with the platform story (suspended, not
   throttled); does `latch-count` carry sane totals. A ring that fails
   this is a §3 bug report, not §4 data.
3. **Then the data pass:** how often is `stale=true`; how long do
   `resume-stale-run`s run; does any `pause-declared` correlate with a
   resume edge (the 66 spm shape) vs genuine stillness. Three or more
   backgrounds across two or more sessions before any design is drafted —
   n=1 designs are what §0.5 exists to forbid.
4. Findings land in this file's Data section verbatim (ring lines quoted),
   then the task sections get written and the antagonist gets the pass —
   NO SKIP (RF27's own lesson; this plan invents a predicate change, which
   is a new mechanism by definition).

## Antagonist target list (for the pass that follows the data)

- The mechanism chosen vs the invariant I2 (does it treat cause or symptom).
- Whether the fix belongs in `nextFreezeRun` (pure, replay-testable) or in
  the frame handler (stateful) — and what each costs the replay corpus.
- The interaction with `beginFreeRow()`'s arm (the merge-added third arm).
- RF21 on every new leg: the mutation that makes it fail, named.
- Whether any committed capture can exercise the fix (likely NOT — §0.4's
  recordings-vs-lifecycle deferral — so the gate story must say what is
  constructed vs real, the PR 1 seam-test precedent).

## Data (empty until the first field rings arrive)

_None yet. v0.33.0 released 2026-09-01; awaiting James's first
post-background log via the door._
