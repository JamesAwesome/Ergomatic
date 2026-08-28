> **Archived 2026-08-28** from `ROADMAP.md` (lines 2051-2129 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase CL — Cleanup

**Status:** Done — list adjudicated 2026-08-10; the release it was staging shipped as v0.7.0 (2026-08-11, build 564)
**Goal:** One home for the remainders the phases above left behind, so a
close-out round can be scheduled from a list instead of rediscovered from a
grep. Collection only: every line below already existed somewhere, and
nothing here is new work. Effort guesses are S/M/L.

- [x] **The platform-conditional default transport** — the same root cause
      as the item above: `createCapacitorBleTransport` had no call site, a
      native build passed its own factory through
      `MonitorSessionDeps.createTransport`, and choosing between it and Web
      Bluetooth belonged in the adapter layer (`src/platform.ts`/
      `src/adapters/`), not the transport-resolution seam
      (`src/monitor/transports/index.ts`'s own doc comment). Fixed
      (BACK-walks-the-stack batch, batch A): `src/adapters/
monitorTransport.ts` adds the platform-conditional default — native
      dynamic-imports `createCapacitorBleTransport`, web delegates
      unchanged to `transports/index.ts`'s `resolveDefaultTransport` —
      wired through `useMonitorSession.ts`'s existing `??` fallback. **M**
- [x] **`intervalAccrued` on `MonitorFrame`** — pane C's active row showed
      `—` for the dimension that was not counting down, because no
      per-interval field existed for it. Closed as a DRIVER change, not a
      screen one (BACK-walks-the-stack batch, batch A):
      `computeAccruedForFrame` (`driver.ts`) mirrors `intervalRemaining`'s
      own per-interval baseline into `MonitorFrame.intervalAccrued`,
      wired through the per-frame path (`docs/design/DEVIATIONS.md`'s
      pane-C active-row row, task-7 review adjudication 4). **M**
- [x] **Phase 7A-fix-3's parked minors** — a byte-for-byte duplicated test
      helper (`stillArmedEmpty`/`stillArmedAtZero`, `driver.test.ts`) and
      three LOW-severity comment/instrumentation nits from its Task 2
      review: a timeout-not-assertion latency pin, the settle not logging
      its own configured bound, and an undocumented off-by-one in that
      bound's inclusivity. Items 2–4 fixed in batch A (4079a22); item 1
      (the dedupe) was initially declined there, citing a prior
      whole-branch review's "parked per reviewer ruling" note (32196d8) as
      more recent than this ROADMAP line — a real citation, but its
      recency argument read backwards: 32196d8 predates both this CL
      line (2026-08-09) and this batch's own brief, and CL is precisely
      the phase where a parked item comes due. Deduped in the
      BACK-walks-the-stack batch's fix round: one `stillArmedEmpty`
      helper, both call sites (`driver.test.ts`), driver suite green. **S**
- [x] **Bulk import has no transaction** — `POST /api/workouts/bulk`
      (`app/server/routes/data.ts`) used to insert block by block inside a
      plain loop, so a partial failure left the landed blocks behind and
      re-importing the same paste duplicated them. Recorded at Phase 5B's
      merge. Fixed (CL item, BACK-walks-the-stack batch): any error
      anywhere in the paste — parse-level or validation-level — now means
      NOTHING in the request is created; a fully clean paste reaches
      `stores.workouts.createMany`, itself one transaction in the real
      store, reused rather than re-implemented. **M**
- [x] **No unsaved-changes guard in the builder** — Fixed (CL remainder,
      this PR): draft persistence, not a navigation guard — `builderDraft.ts`
      single-slot autosave/restore with a fingerprint staleness guard and a
      two-tap START OVER; James's explicit shape choice over exit
      interception and a data-router migration (spec:
      `docs/superpowers/specs/2026-08-10-cl-remainder-design.md`). **S**
- [x] **Per-worktree compose scoping** — the e2e/screenshots stack used to
      be shared across sessions by container name (one Postgres volume, one
      `web`/`api` pair), so concurrent worktrees stomped each other's
      fixtures and could serve a bundle from the wrong branch. Fixed
      (Phase CL, PR #68): `app/scripts/stack-env.sh` derives
      `COMPOSE_PROJECT_NAME`, the `ERGO_STACK` container-name prefix, the
      host ports, and the Playwright baseURL from the worktree's own
      absolute path; `.claude/agent-briefing.md`'s stack section now
      documents the fix, not the workaround. **M**
- [x] **News scroll memory** — BACK from an article used to land News at
      the top, a tradeoff taken deliberately when the feed was about 1.15
      screens and confirmed still standing after the overlay-scroller
      round below. The shelf grew (six articles plus the Start-here pin),
      so News now takes the Library's own scroll-memory pattern —
      `newsScroll.ts` + `News.tsx`'s save/restore effects, `TabBar.tsx`'s
      clear-on-fresh-tap (CL item, BACK-walks-the-stack batch). **S**

**Exit:** MET 2026-08-10 for the list (every line shipped or re-filed with
its trigger above); the phase itself closes with the staged v0.7.0 release,
which fires only after the library-rebalance PR merges (James's ruling:
testers meet the rebalanced library).
