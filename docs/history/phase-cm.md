> **Archived 2026-08-28** from `ROADMAP.md` (lines 6453-6514 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase CM — Connected metrics: the interval's average, the session's metres

**Status:** MERGED #123 (main `3d0088c`, 2026-08-18), released as
v0.13.0. Exit walk PASSED (`docs/monitor/sessions/walk-2026-08-18-metrics/`):
three totals sub-metre in one frame, AVG digit-identical to the monitor's
own average, WebKit convicted on the off-horizontal swipe cancel with the
`pointercancel` readout's first field evidence. Post-merge, James's calm
rule quantised the counter to 5m steps (rounded — floor was falsified at
the walk's own finish) in a width-pinned slot. **RECONCILED (PM gate fix
wave, 2026-08-25, PR #192): the 5m calm-rule quantisation was itself
reversed by James on 2026-08-25 — the counter is back to a realtime 1m
count, `PaneLive.tsx`'s `fmtMeters`.** TRIAD (number semantics).
Spec at
`docs/superpowers/specs/2026-08-18-connected-metrics-design.md` — blocked
once in full by the antagonist and rewritten; every load-bearing claim
decoded from committed captures.
**Goal:** `3,842m` on the progress-bar row (the driver's reconciled
accumulator — the machine's own TWD field is frozen during work and
rest-inclusive, proven unusable live); the interval's average
(`0x0033`'s own value) beside the target, judged only during rests.
**Wire facts banked:** TWD = work + rest exactly (1599 = 1535 + 64);
`0x0033` holds the finished interval's average through the whole rest
(≤0.2 s vs the boundary record); the emitted interval referent lagged
450-540 ms at boundaries and is now monotone (both driver clamps
mirrored).
- [x] The walk (spec criterion 2), DONE 2026-08-18: pyramid program with
      DISTINCT targets, phone + monitor photographed mid-work AND
      mid-rest, the summary screen photographed after (three totals, one
      record), the final-interval-verdict question, the shallow drag.
      Record: `docs/monitor/sessions/walk-2026-08-18-metrics/`.
- [ ] Follow-up (PM final gate): cross-pin `sessionDistanceMeters`
      against `monitorDistanceMeters` (the summary's Σ over
      IntervalActual) over the same capture — two derivations of one
      user-facing quantity currently ship on two screens with nothing
      comparing them; the replay harness exists, it stubs `actuals: []`.
- [ ] Follow-up: a `connected-pane-rest` fixture/screenshot — the one new
      colour this phase adds has no committed picture of its judged state.
- [x] Follow-up (James, 2026-08-20, from the device): **the session-meters
      counter has room reserved for four digits, and the bar shrinks once at
      10,000m.** `.connected-progress-meters` reserves
      `min-width: calc(6ch + 0.12em)`, which holds `9,999m`; at `10,000m` the
      cell grows to seven characters and takes ~13px from the flexing bar
      beside it. Nothing clips or wraps — `white-space: nowrap`, `flex: none`,
      and the bar carries `min-width: 0` — so this is a one-time layout shift,
      not breakage, and the CSS comment currently defends it ("a milestone,
      not noise"). **Two reasons to change it anyway.** (1) That defence is
      inconsistent with why the reserve exists at all: the same jolt at
      999→1,000m was MEASURED at 27.3px and judged unacceptable, and the
      10,000m case was waved through by assertion rather than measurement.
      (2) **Nothing tests it.** The largest meters fixture anywhere in the repo
      is 3,842, while the seeded library ships **Calm Sea at 10,000m** — a
      rower can reach the five-digit case today, on a workout we authored, and
      no gate has ever rendered it. Fix: reserve 7ch and add a five-digit
      fixture to both the unit test and the design sweep. Fast-path sized;
      **James's ruling: do it at a logical point, not now.** **DONE 2026-08-20
      (trace-axis PR, grouped item G3):** `min-width: calc(7ch + 0.12em)`;
      `PaneLive.test.tsx` gained a real 10,000m (Calm Sea) fixture; the design
      sweep gained a real-browser no-clip/no-bar-shift check against the same
      total. **S**
- [ ] Follow-up: the fake's `restDistanceMeters` resets with no ~3-frame
      lag (fine while nothing renders it directly).
