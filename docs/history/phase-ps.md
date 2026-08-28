> **Archived 2026-08-28** from `ROADMAP.md` (lines 1633-1675 of the
> pre-rebalance file, main `39e9430`). **This section was still LIVE when it
> was archived.** Deferred under "After the strangers", carrying its RC-5 metres hazard with it.
>
> It is kept verbatim so no detail is lost, and it is a RECORD: the work is
> maintained in `ROADMAP.md`'s live slate, not here. Do not work from this file.

## Phase PS — Personal stats

**Status:** Not started. Sequenced AFTER Phase 8B (James, 2026-08-24:
"make it its own phase and put it after 8B — re-brainstormed when we get
there. The phase will be all about personal stats"). Promoted from Phase
6J (Trend charts on You), whose section above is now a tombstone.

**Goal:** A rower can see whether they are getting faster — the app's
personal-stats story, in one phase.

**RE-BRAINSTORM REQUIRED at phase open** — the 6J sketch is an input,
not a design. Inputs the brainstorm inherits:

- The 2026-08-07 News-tab handoff's decision 9 (Trend folds onto You):
  a sketch, with its own open question ("the three Trend charts need
  real ranges, bucketing and empty states").
- The three chart groups relocated from Phase 8B's old Progress bullet:
  metres per week, O2 pace per session vs target, time by type — plus
  2k/6k test-trend bars.
- Everything Phase RC has stored since that sketch was drawn: work/rest
  as separate quantities, machine-confirmed summary totals
  (display-gated on the walk photograph), `endedBy`, and the baselines
  history Phase BL added — the stats story should be re-scoped against
  what the record NOW holds, not what it held in August's first week.
- **RC-5's own hazard for "metres per week" (Task 3 fix round 4, PM gate
  finding 8): `session_logs.distance_meters`/`time_seconds`/
  `avg_split_seconds` mean FUSED (work + rest) before this merge and
  WORK-ONLY (tier-appropriate) after it — with NO stored marker on the
  row saying which** (`storedSummary.ts`'s own FALLBACK/TIER-B2 branches;
  `schema.ts`'s corrected `distance_meters` comment). A brainstorm that
  sums this column across a rower's whole history, or per week, will
  silently sum two different definitions of "metres" side by side unless
  it either re-derives a consistent population per row (mirroring
  `storedSummary.ts`'s own tier logic) or explicitly accepts the seam and
  says so. Settle this BEFORE writing "metres per week" arithmetic, not
  after a chart ships with an unexplained kink at the cutover date.
- The dataviz house rules (charts follow docs/design tokens; honest
  empty states below two sessions — never sample data).

**Exit (provisional, re-set at the brainstorm):** a rower with real
history sees real trends on You; below the honest threshold, an honest
empty state.
