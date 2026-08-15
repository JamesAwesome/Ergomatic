# Hardware walk, 2026-08-15 — PR #99's merge gate, and its falsification

Two diagnostics-ring dumps from James's erg session validating CR2 spec 1
(PR #99), captured from the app's own stash (triple-tap diagnostics), pasted
verbatim. **Provenance differs from the sibling captures**: those are
bridge-mirrored lab logs (line-oriented, per-frame); these are the phone's
500-entry ring as JSON arrays — frames appear only on state change, but the
`twd-sample` entries (R0, this PR) are the first mid-piece TWD observations
in any capture.

| File | Session | What it holds |
| --- | --- | --- |
| `session-a-multitest.json` | 3-interval mixed program (1:00 wu · 1:00 @6k r30 · 500 m @6k) | TWD oscillation on a distance-goal interval; the METERS LEFT stale-reference session |
| `session-b-poisoned.json` | 2×1:00 @6k, r30/r0 | **THE FALSIFYING CAPTURE** — the poisoned-register overcount photographed at TOTAL M 353 vs ≈195 honest |

## What the walk established

**Falsified — and it gates the merge:**

- **The register map's write rule is poisoned at the work→rest boundary, and
  max-merge makes the poison permanent.** Session B, photographed: at ~23 s
  into interval 2 the PM5 read 19 m into the interval while the phone read
  TOTAL M **353** against an honest **195.5–198.7**. Mechanism (upgraded from
  inference to SECONDARY by the antagonist's premise pass): `parse.ts` maps
  **workoutState 8, `INTERVALWORKTIMETOREST`** — an ephemeral transition
  state at the work→rest boundary — to `"rowing"`, and **session A seq 26 is
  a captured 0x0031 sample in state 8** carrying the completed interval's
  pair (60.05 s / 181.2 m), one entry before the `resting` flip. If 0x0033's
  count has already incremented at that tick (the one unrecorded half), the
  completed pair OPENS the next interval's register, and max-merge means the
  honest readings that follow can never lower it. Last-write-wins would have
  healed this shape; max cannot. The clamp protects final boundaries, so an
  N-interval program takes exactly **N−1 poisons** — consistent with both
  sessions. The max-merge order constraint (`key0 ≥ key1`, since key 0 keeps
  receiving rest ticks after the poison) bounds the decomposition to
  key1 ∈ [173.3, 176.5] / key0 ∈ [176.5, 179.7] and pins the poison to
  within ~3 s of the boundary. **One implication:** TOTAL M was already ~350
  during the rest, ~30 s before the resume James named — his "skyrocketed at
  the resume" is likely when he looked, not when it happened; re-walk item 1
  settles it by reading TOTAL M during the rest. The spec-pass reviewer's
  warning was exact either way: *"the clean boundaries in the capture were
  clean for a reason that does not generalise."*

**Confirmed fixed (spec 1's claims that survived):**

- **Symptom B**: TOTAL LEFT held a real number during interval 1's rest and
  the bar stopped short of full (v0.9.0 pinned at 0:00 here). Fill sat
  slightly past the notch — see open items.
- **The finish-grace machinery** worked live twice: a boundary arriving after
  the machine's `finished` tick was accepted inside the grace and the log
  door showed all intervals measured (session A seq 45-52, session B seq
  37-44).
- The terminate double-count did not reproduce anywhere.

**New wire facts (R0's instrumentation, no camera needed):**

- **Distance-goal TWD OSCILLATES between the true cumulative and
  cumulative-plus-goal** (session A seq 36-42: 696/196 alternating,
  696−196 = the 500 m goal; at completion both converge, 696 = 196+500).
  The lab's "TWD reads the goal" was a fresh-session artifact where prior
  cumulative was 0. Mid-piece distance-goal TWD is unusable; the divergence
  suppression ruling is upgraded from prudent to necessary.
- **Time-goal TWD tracks live** (session B seq 25: 173 m at 173.3 m rowed) —
  walk Q3 answered: yes, it tracks mid-piece. One anomaly parked: session A
  seq 26 read TWD=192 against 181.2 m rowed (+11 m, unexplained).
- **The 0x0039 loses a race to navigation on-device**: the handoff release
  navigates to the log screen, teardown disconnects, and the machine's
  summary never lands — session A's and B's rings both end with no
  `summary-totals`. R0's flagship entry may rarely fire in production; the
  lab never saw this because the harness never navigates. Spec 2's lifecycle
  work owns it.
- **The PM5's own screen shows 0 for stroke rate before the first pull of
  piece two** (the wire carries the previous piece's value; the monitor does
  not display it). CR2 item 3's hardware question: answered — **mirror the
  machine, show 0**, exactly frame 2D's drawing.
- **METERS LEFT is wrong on mixed programs with an exact signature**:
  phone 578 vs erg 398 on the 500 m piece — 578 = 500 − (102.7 − 181.2),
  a stale interval-start reference (interval 0's final distance) inside
  `computeRemainingForFrame`, which this PR deliberately did not touch and
  which had never been run on a time→distance program. Spec 2 evidence.

## THE RE-WALK PASSED (2026-08-15, evening — Chrome/Web Bluetooth from the worktree dev server)

**Row 1, the falsifying shape re-rowed (2×1:00 @6k r30):** 1:1 at the exact
minute that read 373 in the afternoon — mid-rest photo, phone TOTAL M 184
beside the PM5 rest screen's `m total` 184 (the rest screen DOES show a live
session total, falsifying the vendor-docs sweep's conclusion; it also
explains the original Sun fret "4384 m total" photo). `final-totals`:
accumulator 367.8 m/120 s vs the machine's own 0x0039 summary 367 m/120 s —
agreement to the machine's truncation. The 0x0039 arrived BEFORE the finished
frame (beating navigation), and its elapsed test settled interface-notes §23:
cumulative AND rest-exclusive. `terminal-raw`: finish byte 0x0c (ordinal 12,
WORKOUTLOGGED). One false alarm caught and fixed the same evening: the TWD
verdict fired at 0x0039-time against a not-yet-settled machine total
("differ by 183.8m", one tick before TWD read 367) — moved to the terminal
(commit e1cb329). No refused-open fired: the boundary poison did not occur
this session, consistent with the mechanism being intermittent.

**Row 2, the keystone (2×250 m, r0, no warm-up):** a-priori truth 500.
`final-totals`: accumulator 499.5 m (last-seen semantics, documented),
registers `0:(80.1s,249.5m) 1:(85.1s,250m)`, machine's own TWD **500 m**.
Both r0 boundaries crossed clean, and the lagging 0x0033 skew was logged
live at both (`intervalIndex=0 vs actual.index=1`) — the guard's premise
observed on hardware twice. `terminal-raw`: finish byte 0x0a (ordinal 10,
WORKOUTEND) — so real finishes arrive as 10 OR 12, both now documented with
bytes. The PM5's finish screen for a distance-goal piece shows TIMES, not
meters (the result is the complement of the goal dimension) — the display
comparison for distance pieces lives on the rest screen or in Memory.

**Merge-gate verdict: MET.** Machine-display agreement (184=184, one frame),
machine-summary agreement (367 vs 367.8), a-priori oracle (500 vs 499.5),
symptom B re-observed fixed, no session-killer recurrence (the afternoon
kill remains one occurrence, ordinal unknown; terminal-raw now convicts any
recurrence).

**Was still open before the re-walk (now historical):**

1. **Re-row the falsifying shape** (2×1:00 with rest) on the fixed build:
   TOTAL M must track ≈1:1 through the rest and the resume — and **read
   TOTAL M DURING the rest**, which discriminates the boundary-poison from
   any resume-time mechanism (on the broken build it is already ~350 there).
   The same photograph carries a second channel: session elapsed should read
   honest (~113 s at the photo moment), not inflated by a duplicated
   interval (~150 s).
2. **A double-distance piece: 2× distance, NO warm-up, NO rest** (James's
   addition) — a distance→distance r0 boundary exists in no capture (the
   lagging-skew evidence was time→time), and it is **the keystone
   comparison**: with no rest there are no rest-coast metres to argue
   about, so the summary total must read exactly twice the piece on both
   screens. The only confound-free totals oracle available (see item 3).
3. **The app's half of the comparison comes from the ring, not the screen**
   (James's protocol change; `final-totals` entry, commit c3e0505): at the
   terminal transition the driver writes the accumulator pair, the machine's
   TWD, and every register into the diagnostics ring, which survives the
   auto-navigation via the stash. The PM5's half is the finish summary
   screen — the machine's ONLY session-cumulative figure (researched
   2026-08-15, vendor docs: every live Display view during intervals is
   split-scoped; the finish screen's "final result for the total distance"
   is PRIMARY, Concept2 Viewing Workouts/Memory). **Protocol: photograph the
   PM5 summary before touching Menu; read `final-totals` from diagnostics
   afterwards. One photo, zero phone timing.** Open reconciliation, one
   line: the original Sun fret photo showed "4384 m total" live — which no
   documented interval view provides; what view that was is unrecorded and
   worth one glance if it recurs.
4. Walk Q4 — whether the machine's total includes rest-coasting metres —
   is undocumented even in vendor docs (checked; the logbook tracks work
   and rest meters as two figures, SECONDARY/forum). Settle it by
   subtraction: item 2's no-rest piece pins the honest baseline; a
   with-rest piece whose summary gap ≈ coast distance answers Q4 without a
   single new instrument.
5. The bar sitting slightly past the notch at rest (noted, unexplained,
   possibly the rest-coasting inclusion).
