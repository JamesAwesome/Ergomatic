# Walk runsheet, 2026-08-16 — spec 2a validation + Stage B capture session

**Authority on conflicts:** ROADMAP §"Infrastructure — PM5 record-and-replay
harness". The recorder (PR #100 Stage A) rides this walk as a passenger; this
walk doubles as Stage B's capture session. Branch `cr2-axes` (PR #102, head
carries the recorder via the Task 9 rebase onto `75228f5`).

**Walk medium is BINDING:** Chrome + Web Bluetooth from the worktree dev
server, recording tab foregrounded, display awake. The phone's native
adapter routes past the tap and records nothing.

**Two evidence streams, label which is which everywhere:** the WIRE
(recording: every 0x0031 tick ~2/s with elapsed/distance/raw state byte/TWD
in bytes 11-13, every 0x0033 count in true arrival order, 0x0037/38 splits,
CSAFE writes/acks, 0x0039 IF it beats teardown) versus the SCREENS
(photographs: what the rower-facing displays showed, and when). Machine-side
totals no longer depend on the screen — TWD is in every tick. Photographs
cover only what the wire cannot.

**HISTORICAL NOTE (CR2 spec 3 Task 6, 2026-08-16):** this runsheet's own
`TOTAL M` rows (session 2 item 3, "photograph it beside the phone's
TOTAL M") describe the PRE-REDESIGN surface. `TOTAL M` no longer exists on
the live connected pane — the connected redesign cut it outright, and the
session-meters comparison moved to the log sheet's `SESSION` line
(`docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md`). This note is the
only edit this task makes to this file; everything below is the unedited
record of the walk that actually happened.

---

## Session 0 — the download dry run (Chrome only, NO erg, ~2 min)

The gzip arm of `downloadRecording` is untestable under jsdom; this is the
only check the walk's one deliverable ever gets. The seam exists before any
PM5 connection.

1. Open the connected screen → log sheet → **Download recording**.
2. `gunzip` the file; confirm it parses: `pm5-recording/v1` header + the
   armed program present (Claude runs `parseRecording` over it).
3. A failure here costs two minutes; found later it costs a re-walk. STOP
   and fix before any rowing if it fails.

## Session 1 — the keystone (Stage B's committed fixture)

**Program: 2×250 m, r0, NO warm-up.** A-priori truth 500 m; no rest means no
coast-metres to argue about.

- During piece 2: glance TOTAL M (should read 250 + progress; the walk
  README's poison signature would read ~750).
- **At the finish: LINGER before touching anything** — give the handoff-hold
  time to collect the final split and, ideally, 0x0039 into both the ring
  and the recording.
- Then photograph the PM5 **memory/summary per-interval detail screens**
  (the backstop for per-interval actuals if 0x0039 loses the navigation
  race — a known race; if it lost, the recording won't have it either,
  because the tap only sees what the transport delivers).
- **Download the recording and save the file BEFORE navigating or
  reconnecting** — the seam is latest-session-wins; a reconnect silently
  discards it.
- Read `final-totals` from diagnostics after (existing protocol).
- Stage B exit criterion 1 is THIS file: replayed through the real driver,
  reproducing accumulator vs machine TWD to the re-walk's tolerance
  (499.5 vs 500), zero divergences.

## Session 2 — the unequal-intervals clock row (PR #102's primary hardware check)

**Program: 4 unequal intervals — 1:00 / 2:00 / 500 m / 1:00, r30.** The one
shape that also separates lag-by-one from previous-split's-own-value (the
interval-clock mechanism's open question), and the first observation EVER of
intervals ≥3 with a remaining value.

Rows, in time order:

1. **Boundary mirror** (spec 2a item 3): before the first pull of each
   interval, the heroes read 0/unjudged with the split showing the target
   ghost. Does it read deliberate? One glance per boundary.
2. **THE PRIMARY ROW — the interval clock, both screens in one frame:** at
   intervals 3 AND 4, photograph LEFT IN INTERVAL (and METERS LEFT on the
   500 m piece) beside the PM5's own countdown. Expected: agreement within
   ~1 m / one truncation step (the 2026-08-15 case read 397 vs 398). These
   are the indices where the old code was wrong by a whole interval.
3. **Mid-rest stop, ~10 s** (spec 2a item 1): the block reads
   `PULL TO RESUME` with NO noun; TOTAL LEFT stays visible and draining.
   **Same-frame totals photo here**: the PM5 rest screen shows a live
   session total (2026-08-15 re-walk: 184=184) — photograph it beside the
   phone's TOTAL M. Do NOT plan a totals photo at the end screen (the PM5's
   end-of-workout screen shows no total meters). This photo, taken with
   recording on, doubles as the tap-neutrality check.
4. **Natural finish: linger** (as session 1), then PM5 memory screens,
   then download + save, then diagnostics `final-totals`.

## Optional session 3 — END finals (spec 2a item, cheap)

Connect, row ~20 strokes, END twice mid-interval: diagnostics must carry
`final-totals` (the END path writes it at terminate-dispatch now). Download
this recording too if convenient (a terminate-shaped capture has value).

## After the walk (Claude)

1. **Before trusting any app-vs-erg number: the inter-arrival check.** The
   recording's 0x0031 inter-arrival distribution against the committed
   baseline (~2.2/s, modal 0.50 s). The tap sits in the measurement path
   now; the distribution is the cheap discriminator between "real defect"
   and "instrument perturbed delivery" (Stage B exit criterion 2, evaluated
   FIRST per ROADMAP).
2. Commit the gunzipped recordings to `docs/monitor/sessions/` with a
   README row each: date, program, photo transcriptions labelled by
   evidence stream (screen vs wire).
3. The recording's in-band 0x0033 counts satisfy spec 2a's exit criterion 4
   instrument check, are the first capture that can settle the
   boundary-poison mechanism (currently SECONDARY for want of exactly those
   bytes), and answer the named "is the 100 ms sample-rate write honoured"
   question.
4. Stage B's CI rung (the replay test over the keystone recording, its
   red-provable mutation, and the four exit criteria) follows as its own
   task after the walk.
