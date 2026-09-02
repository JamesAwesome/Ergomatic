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
  `pause-declared` before this change still fires it after. (A corpus
  regression asserting the `pause-declared` RING STRING is TO BE BUILT
  with §4 — no committed suite asserts that string today. The nine-
  recording corpus already pins pause ONSET FRAMES through the pure
  predicate: `useMonitorSession.test.ts` ~:8329's Phase LL minor 3
  `it.each` over `LL_RECORDED_MID_INTERVAL_STOPS`, which is what the
  hook's own "corpus regression over all nine committed recordings"
  comment refers to. Named under Gates with the RC-25 edge leg and the
  pure-predicate `isPausedRun` position replay.)
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

---

## §4 Design — REJECTED at the antagonist pass (2026-09-02); parked pending timing

**The first design (a post-resume "distance advanced" latch) is dead, killed
by its own founding capture.** The antagonist traced Reading 2's literal
frames: the stall value (`d=115.3`) is itself an advance over the resume
frame (`110.8`), so any "advanced since resume" latch clears at the FIRST
frame of the very stall it must suppress — three frames before the pause
fires. Both candidate shapes (advance-since-resume; survive-one-fresh-frame)
fail identically. Root lesson, now in the antagonist ledger: **a
discriminator keyed on a monotonic quantity cannot separate two cases that
are both monotonic-then-frozen** — a re-emission stall and a genuine
row-then-stop look identical in distance. Three further regressions the
latch would have shipped: resume→already-stopped never clears (I1 broken);
every foreground edge re-arms it (second resume suppresses a real stop);
the absolute-distance reference goes stale across an interval boundary
where `distanceMeters` resets to 0.

**What survived:** the defect's location and cause (a post-resume
repeat-stall on a fresh value; `stale`'s pre-vs-post window genuinely
cannot gate it) and I3 (pure predicate, stateful suppression).

**The only deterministic axis is frame ARRIVAL TIMING** — the spec's own
original candidate, which the rejected design silently dropped. Were the
four `115.3` frames a bunched post-resume burst (re-emission) or normal
~2.2/s cadence (indistinguishable from a stop)? **The current ring does not
record inter-frame arrival gaps, so Reading 2 cannot answer it.**

**Ruling (James, 2026-09-02, option 1): add the timing to the instrument
first; ship it; one capture-at-close decides.** §4's mechanism stays parked
until that field comes back. If the stall frames arrive bunched, timing is
the discriminator and §4 becomes deterministic; if they arrive at cadence,
no signal in the ring separates the cases and §4 is a crude resume-window
mute with its over-suppression stated as accepted cost — James's call then.

### §3 timing addendum (this PR's actual content)

Instrument-only; no predicate change; measure, assert no cause.

- **`pause-declared` gains arrival timing:** `gapsMs=[g1,g2,g3]` — the
  inter-arrival gaps (ms) between the consecutive frames that formed the
  `PAUSED_FRAME_HOLD`-long identical run — and `sinceResumeMs=<n|none>`,
  the time since the most recent foreground edge (or `none` if no resume
  has happened in this RUN — a mid-session `program()`/`beginFreeRow()`
  clears it exactly like `resumeEdgeArmedRef`, so a pause declared right
  after such a reset reads `none` even if the session resumed earlier,
  under a prior run). Answers, for every future pause declaration: bunched
  or cadence, and resume-adjacent or not.
- **`resume-first-frame` gains `nextGapsMs=[…]`** — the arrival gaps of the
  first `PAUSED_FRAME_HOLD` frames after the resume, recorded when the
  fourth arrives — or `truncated` if the session ends first, or
  `superseded frames=<n>` if a second resume lands before the fourth
  frame (the open window is closed with its count before a fresh one is
  minted; a window is never silently discarded). This captures
  the post-resume cadence even when no pause is declared, so a
  no-false-positive session still yields the baseline.

**Lifetime table (RF27):**

| State | Mint (set) | Clear | Survives teardown/relaunch/re-arm |
| --- | --- | --- | --- |
| `frameArrivalsRef: number[]` (last `PAUSED_FRAME_HOLD` rowing-frame `atMs`) | each rowing frame | non-rowing frame; per-run resets (program/beginFreeRow/RC-37); connect; teardown | no / no / no |
| `lastResumeAtMsRef: number \| null` | foreground edge (beside `resumeEdgeArmedRef`) | per-run resets; connect; teardown | no / no / no |
| `postResumeArrivalsRef: number[] \| null` (collecting the first HOLD post-resume arrivals) | foreground edge (empty array) | when it reaches HOLD-1 gaps (recorded, then null); a second foreground edge while open (recorded `superseded frames=<n>`, then re-minted empty); per-run resets; connect; teardown (recorded `truncated` if non-null) | no / no / no |

**Invariants:** the predicate's behaviour is byte-identical (I3 — `nextFreezeRun`/`isPausedRun` untouched; every existing pause leg still passes with the same declarations); the only change is what the two ring entries SAY; time comes from the hook's injected `now`, never `Date.now()` (the existing idiom). Edge-only recording (one entry per pause / per resume).

**Gates:** unit legs with an injected clock — (a) a bunched stall (gaps `[40,40,40]`) after a resume records `gapsMs=[40,40,40] sinceResumeMs≈<n>`; (b) a cadence stall (`[450,450,450]`) with no resume records `sinceResumeMs=none`; (c) `nextGapsMs` recorded exactly once per resume after the fourth frame, `truncated` on early teardown, `superseded frames=<n>` when a second resume lands before the fourth frame; five new legs, plus four unmodified regressions that stayed green: the RC-25 `pause-declared` edge leg (`useMonitorSession.test.ts` ~:8541-8552), the pure-predicate `isPausedRun` position replay (~:7872-7905), the nine-recording onset-frame corpus replay (~:8329, `LL_RECORDED_MID_INTERVAL_STOPS`), and `lifecycleReplay.test.ts`'s hook-driven replay of a committed recording. Mutations (RF21): swap gaps to record the wrong frames (off-by-one) → leg (a) red; drop the `sinceResumeMs` write → leg (a) red on `none`; record `nextGapsMs` per frame → leg (c) red on count; drop the `superseded` record → leg (c)-supersession red (`expected [...] to have a length of 2 but got 1`); drop the `truncated` record in `teardown()` → leg (c)-truncation red on the same length assertion.

**Antagonist skip, SPOKEN:** this addendum IS the instrument the antagonist's own verdict demanded ("the plan needs the ONE thing it does not have — the arrival-timing profile"); it invents no discriminator and changes no behaviour a rower sees. The pass resumes on §4's mechanism once the field numbers exist.

**Release:** rides the next tag as a diagnostics change (no rower-visible item; the notes owe nothing). A capture-at-close on that build supplies the timing profile.
