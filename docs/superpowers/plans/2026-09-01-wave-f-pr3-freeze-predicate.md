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

## Data

### Reading 1 — two rings, 2026-09-02 (v0.33.0 build 814, via the door)

**Acceptance pass: PASS.** Ring 2 (programmed 2×, terminated mid-work at
72 s / 214 m) carries two full lifecycle episodes:
`resume-first-frame gapMs=8357 stale=false rawRowingState=1
framesWhileHidden=1` (seq 29) and `gapMs=13893 stale=false
rawRowingState=1 framesWhileHidden=1` (seq 35); `latch-count latches=2
resumes=2` (seq 71) matches and rides the export. Ring 1 (free row, no
backgrounds) reads `latches=0 resumes=0` (seq 43). Gaps plausible for
hand-locks; framesWhileHidden=1 consistent with suspension.

**Data pass (n=2 backgrounds, 1 session — below protocol threshold):**

- BOTH resumes: `stale=false` — the first post-resume frame was fresh.
- `pause-declared` ×2 in ring 2 (seq 37 at d=162.4 split=143.34 spm=28,
  ~1.1 s after resume #2; seq 41 at d=214.4, ~2 s before End) and ×1 in
  ring 1 (seq 15, 2.5 s before End). **Confound, named:** the capture
  method (hand-locking) required stopping to handle the phone, so every
  pause-adjacent-to-resume here is plausibly a GENUINE stop. These
  sessions cannot separate the two hypotheses.
- TWD non-monotonic dip seen again (162→0→214, seq 38) — recorded;
  matches the register-row's known F2a-false-kill shape; no action.
- `storage-persist denied (tolerated)` opens both rings — known S6
  posture, not a finding.

**Discriminating capture requested:** the true pocket case — piece
started, phone face-down/pocketed WITHOUT hand-locking, rowing continuous
through auto-lock, retrieved 2-3 min later while still rowing, ended
normally, log copied. A `pause-declared` in that window with the rower
never stopping = §4's defect observed under instruments; none, with
`stale=false` again = the predicate may already be sound and §4 narrows
to (at most) the resume-adjacent guard.

### Reading 2 — the DISCRIMINATING capture, 2026-09-02 (build 814)

**The confound is removed and §4's defect is observed under instruments.**
Locked at `armed` (before the first pull — spec's flagship case), rowed
through a 35 s lock (`app-lifecycle resume gap=34785ms`, seq 26); first
resumed frame already `state=rowing elapsed=33.01 distance=110.8
rowingActive=true` (seq 29). Then **seq 33, ~2.2 s after the resume:**
`pause-declared frames=4 hold=4 pulled=true d=115.3 split=142.73 spm=28`
— WHILE distance was advancing (110.8→115.3→117.8→193.9, ~2 m/s
throughout) at spm 28. The rower never stopped; the predicate declared a
pause. This is the false positive §4 exists to fix, with the hand-lock
confound gone (distance advancing proves continuous rowing). `latches=1
resumes=1` (seq 67) — one resume, one latch, consistent.

**Mechanism, and it falsifies §3's `stale` flag's assumption:**
`resume-first-frame stale=false` (seq 30) is CORRECT — the first
post-resume frame (distance jumped 0→110.8 across the lock) does not
repeat the pre-background triple. But the defect is FOUR identical frames
AFTER resume: the resumed BLE stream stalled on `115.3|142.73|28` for
`PAUSED_FRAME_HOLD` frames while the flywheel kept turning, and
`freezeKey` read the stall as a stop. **`stale` checks the wrong window
(pre-vs-first-post); the defect is a post-resume repeat-stall.** §4 cannot
hinge on `stale` as defined. Two candidate shapes:
  (a) suppress `isPausedRun` for a short window after a resume edge (the
      edge is already timestamped — `resumeEdgeArmedRef`);
  (b) require the paused run's identical frames to NOT be the immediate
      tail of a resume (i.e. the stall must survive a fresh frame first).
Both are "gate the predicate near a resume", differing in how the window
closes. The antagonist pass weighs them against I1 (a genuine post-resume
stop must still declare) once one confirmation lands.

**Also present (not §4, noted):** 33 s late record-open (record opened at
seq 31 on the first seen rowing frame — the pocketed-phone late-open
shape); `divergence 1 of 4 programmed` + `registers=1 of 4`, actuals 0
(terminated mid-work — the in-flight-metres / pocketed-phone items, not
this one). TWD 0-dips again (seq 34), the known F2a shape.

**Status: §4 is characterized.** One confirming capture (same protocol:
lock, row through, unlock, keep rowing) showing another resume-adjacent
`pause-declared` with distance advancing closes the data phase; then the
task sections + antagonist pass (no skip).
