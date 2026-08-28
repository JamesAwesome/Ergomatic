> **Archived 2026-08-28** from `ROADMAP.md` (lines 1696-1732 of the
> pre-rebalance file, main `39e9430`). **This section was still LIVE when it
> was archived.** Split: the two single-rower comfort settings and the suggestion-preference items are deferred; the warm-up bullet was reversed outright by Phase WU.
>
> It is kept verbatim so no detail is lost, and it is a RECORD: the work is
> maintained in `ROADMAP.md`'s live slate, not here. Do not work from this file.

## Phase 9 — Preferences & You completion

**Status:** Not started
**Goal:** The suggestion engine and session flow honor per-user preferences.

- [ ] Suggest-workouts-at difficulty chips + time-available cap, live "N of M match" readout, feeding Today and clearing `todayPick`
- [x] **Warm-ups leave the workouts and become a setting** (James,
      2026-08-08, superseding the earlier "override library warm-ups"
      line): the library's own warmup steps are DROPPED; a rower who
      wants one sets it once in preferences — duration as TIME or
      METERS, plus an OPTIONAL trailing rest — and the session flow
      prepends it. Shipped 2026-08-09, home:
      `docs/superpowers/specs/2026-08-09-warmup-setting-design.md`.
      Follow-on, replacing the earlier "recompute the library's
      time-range percentages" clause: **RESOLVED 2026-08-10 — the
      library rebalance**. The rebalance report's MOVED row (what the
      strip did to each type/band) became the input to a new,
      warm-up-free target grid authored by a feasibility solve (ruling
      B: longer by intent, mode at 30-45), and 93 workouts were
      retuned plus 11 replaced to land the library on it exactly, 0
      debt in all 20 cells. Home:
      `docs/superpowers/specs/2026-08-10-library-rebalance-design.md`
      (the grid and rules) and
      `docs/superpowers/specs/2026-08-10-library-rebalance-move-plan.md`
      (the per-workout moves). `patterns.json`'s `targets` block is now
      the live grid — `library-balance.ts` and `library.test.ts`'s
      quota gate both read it — and `AFT-TGT` is the report's real
      signal (0 everywhere the phase is done); the pre-rebalance
      `DESIGN_GRID_2026_08_03`/`FAITHFULNESS CHECK` pair is retained
      only as a historical note behind `--history`, since it checks
      the replay against a grid the library no longer targets
- [ ] Pre-workout countdown length 0–60 s (staged)
- [ ] Pace tolerance (0–3 s) and accent color as real settings
- [ ] All preferences persisted per-user

**Exit:** Two users with different preferences get different Today suggestions and timer behavior.
