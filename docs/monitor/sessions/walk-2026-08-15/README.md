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

- **The register map's write rule is poisoned by a LEADING 0x0033 increment at
  a work→rest boundary.** Session B, photographed: at ~23 s into interval 2
  the PM5 read 19 m into the interval while the phone read TOTAL M **353** —
  ≈ 176 (interval 1 + rest coast) + **177 (interval 1's reading again, in
  interval 2's register)**. Mechanism: near interval 1's end, 0x0033's
  Interval Count increments EARLY — at least one tick reads
  `rowing, count=1` while 0x0031's pair still carries interval 1's large
  values (~173 m) — writing interval 1's reading into interval 2's key. And
  **max-merge makes the poison permanent**: interval 2's honest readings can
  never lower it. Last-write-wins would have healed this shape; max cannot.
  This is the mirror image of the LAGGING skew found at no-rest boundaries
  (pm5-session4b L2835-2838), and the spec-pass reviewer's own warning was
  exact: *"the clean boundaries in the capture were clean for a reason that
  does not generalise."* The lab record contains no leading increment; the
  erg does. James's symptom report matches to the tick: "pretty 1:1 until we
  resumed from rest," then TOTAL M "skyrocketed."

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

**Still open — the re-walk list (James, 2026-08-15):**

1. **Re-row the falsifying shape** (2×1:00 with rest) on the fixed build:
   TOTAL M must track ≈1:1 through the rest and the resume.
2. **A double-distance piece: 2× distance, NO warm-up, NO rest** (James's
   addition) — a distance→distance r0 boundary exists in no capture (the
   lagging-skew evidence was time→time), and it is a clean totals oracle:
   the session must read exactly twice the piece, on both screens.
3. The PM5's **total-meters display view** photographed beside the phone
   (the strict both-totals-one-frame item; the interval view resets per
   interval and is not a session total).
4. Walk Q4 — whether the machine's displayed total includes rest-coasting
   metres — read off that same view.
5. The bar sitting slightly past the notch at rest (noted, unexplained,
   possibly the rest-coasting inclusion).
