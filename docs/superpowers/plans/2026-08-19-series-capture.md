# Series Capture Implementation Plan (Phase LT spec 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every connected session's pace/rate/HR series is recorded at 1 Hz on a work clock, survives storage failure without ever costing the run, and saves with the log.

**Architecture:** A pure decimating recorder (work clock, cap) feeding an in-memory buffer; the hook flushes it onto `MonitorRun.series` at boundaries/30s/close with the sacrifice ordering inside `saveMonitorRun`; the log POST carries it through a route-scoped body limit with its own sacrifice retry; every §4 storage assumption gets its named check.

**Tech Stack:** Existing throughout; no new dependencies.

## Global Constraints

- VALUE AUTHORITY: `docs/superpowers/specs/2026-08-19-series-capture-design.md` — §1 (sample/decimation/cap), §2 (flush/loss/storage home), §3 (both sacrifice orderings, the route-scoped limit, bounds), §4 (the S-table: every check is a deliverable), §6. THE SPEC GOVERNS on any mismatch.
- TRIAD: two stored shapes (`MonitorRun.series?` + `session_logs.series` jsonb) + an invented mechanism (the recorder). Antagonist pass run and folded (five breaks absorbed — the work clock, the rest freeze, the body limit, the oracle, the flush ownership); PM final-PR gate at the end.
- The sample: `{t, d, p, spm, hr?}` — C2 semantics verbatim (t cumulative WORK tenths, d cumulative decimeters, p tenths/500m, spm whole, hr omitted when the wire says 255/no-belt).
- The work clock: recorder-owned `baseTenths` + current interval's wire elapsed; `baseTenths` folds each interval's final pre-reset reading at every elapsed reset — INCLUDING the `restSeconds: 0` boundary where wState never leaves 4. Never wall clock, never the raw per-interval field alone, never `sessionElapsedSeconds`.
- Rests produce ZERO samples (the wire's clock freezes — proven); the series is a work-time trace, C2's own semantics.
- Cap 14,400 samples; at cap: stop appending, `truncated: true` once. Worst case ≈ 720 KB (50 B/sample measured).
- Flush: after each boundary write lands, on a 30s timer, at close; recorder stops at close. Loss window ≤30s of trace, run integrity untouched.
- Sacrifice orderings BOTH: localStorage (retry inside `saveMonitorRun`'s catch without series + `seriesDropped: true`; honest claim — odds return to today's) and POST (non-ok with series → one retry omitting series → only THAT failure surfaces the save error).
- Server: migration 0011 nullable `series` jsonb; route-scoped `express.json({limit: "1mb"})` on POST /api/logs ONLY (the app default stays); samples shape-validated (t/d/p/spm integer bands, hr 20-254 optional), max 14,400, field-named 400s, unknown sample keys ignored; list projection excludes `series` (drift pin updates: list = get − steps − series); PATCH never accepts it.
- §4's S-checks are DELIVERABLES: S1 write-count, S2 Chrome worst-case probe (+ iOS walk item), S3 mocked-throw AND forced-real-quota, S4 stringify perf number stated, S5 full-worst-case Postgres round trip through the real middleware, S6 persist()-once + ring-logged outcome (denial expected on iOS, tolerated), S7 dual-rate decimation.
- Commands in app/; `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first; `pnpm test --project client` for src (never unit); failing-test-first; e2e + screenshots FOREGROUND (blocking, 590000ms — never background); per-file coverage; self-mutations byte-identical-restored; `git rev-parse --show-toplevel` before every commit; known tap-target flake (isolated rerun via full suite, report not dismiss).

---

### Task 1: The recorder

**Files:** Create `app/src/monitor/seriesRecorder.ts` (+test); Test also uses the committed recordings via the replay decode idiom (`summaryModel.test.ts`'s wire-scoping witness shows the readFileSync + parse pattern — reuse it).

**Interfaces:** Produces `createSeriesRecorder(): { onFrame(f: MonitorFrame): void; snapshot(): SeriesData | undefined; stop(): void }` where `SeriesData = { samples: Sample[]; truncated?: true }` and `Sample = { t: number; d: number; p: number; spm: number; hr?: number }`. Pure per-frame consumption — no storage, no timers (Task 2 owns those). `snapshot()` returns undefined until the first sample (a reader never sees an empty series object).

- [ ] Failing tests first, the §6.1 oracle legs against the committed recordings (decode `walk-2026-08-17/step-2` and `step-3` through the real parsers): sample counts exactly 139 and 243; each interval's segment ends within one whole second of that interval's own final pre-reset reading; cumulative `t` at each boundary equals the fold of preceding finals — including step-2's `restSeconds: 0` boundary (wState 4→4, elapsed 59.77→0.00); zero samples across step-3's 30s rest (the frozen-clock proof as a test).
- [ ] The dual-rate test (S7): a synthetic 10 Hz stream decimates to the same series as the real ~2 Hz recording over the same frames' values.
- [ ] Cap: sample 14,401 never appends; `truncated` set exactly once (feed a synthetic long stream).
- [ ] `hr`: present only when the frame's heartRateBpm is non-null; omitted otherwise (both legs).
- [ ] Self-mutation: break the fold at the restSeconds:0 boundary (count/boundary tests red); break the first-frame-wins key (dual-rate red). Restore byte-identical, diff-verified. `pnpm test --project client`, full `pnpm test`. Commit.

### Task 2: Storage — the flush policy and the localStorage sacrifice

**Files:** Modify `app/src/monitor/monitorRun.ts` (`MonitorRun.series?`, `seriesDropped?`, the sacrifice inside `saveMonitorRun`), `app/src/monitor/useMonitorSession.ts` (recorder wiring: onFrame feed, boundary/30s/close flushes, stop-at-close), types as needed; Test monitorRun.test.ts, useMonitorSession.test.ts.

**Interfaces:** Consumes Task 1's recorder. Produces `MonitorRun.series?: SeriesData; seriesDropped?: true` (additive-optional, never-migrate-sanctioned — the validator's positive conjunction tolerates them, VETTED); `saveMonitorRun` keeps its `void` contract with the retry-without-series inside its catch.

- [ ] Failing tests: the never-migrate leg (a pre-series record round-trips exactly as before; a record WITH series+flags validates); the sacrifice both legs (mocked throwing storage → run survives series-less with `seriesDropped: true`; the retry ALSO throwing → today's behavior, nothing worse); S1's write-count (instrumented storage across a replayed session ≈ boundaries + ⌈duration/30s⌉ + 2, red-provable by flushing per sample); the 30s timer flush; stop-at-close (a post-close finish-grace actual updates the run, the series does not grow).
- [ ] S4 perf probe: `JSON.stringify` of a 14,400-sample record, measured ms printed in test output, asserted < 100ms.
- [ ] S6: `navigator.storage.persist()` called once at first monitor connect; grant/denial logged to the diagnostics ring; denial tolerated (no behavior change). Witness: call-once + outcome-logged tests.
- [ ] Self-mutation: remove the sacrifice retry (both sacrifice tests red); remove the stop-at-close (its test red). Restore. `pnpm test --project client`, full `pnpm test`, `pnpm e2e` FOREGROUND (hook code changed). Commit.

### Task 3: The server column, the route limit, and the POST sacrifice

**Files:** Create `app/drizzle/0011_*.sql`; Modify `app/server/db/schema.ts`, `app/server/routes/data.ts` (route-scoped json limit + series validation), `app/server/stores/logs.ts` + `app/server/testing/fakes.ts` + contracts (store the field; projection), `app/src/session/LogSession.tsx` (POST carries series from the loaded run; the sacrifice retry); Test data.test.ts, contracts both stores, `contracts.real.integration.test.ts`, LogSession.test.tsx.

**Interfaces:** Consumes Tasks 1-2's shapes. Produces `session_logs.series` jsonb nullable; POST accepts `series: {samples, truncated?}` optional; `GET /:id` carries it; list excludes it (drift pin: list = get − steps − series).

- [ ] Migration 0011: exactly one ADD COLUMN, nullable, no default. Failing contract tests: round trip the full worst case (14,400 samples) through REAL Postgres; the projection pin updates deliberately.
- [ ] Route: `express.json({limit: "1mb"})` scoped to POST /api/logs only (read how the app mounts routes; the scoping must not widen the app default — a test posts >100KB to ANOTHER route and still 413s). Validation per §3 bounds, field-named 400s, unknown sample keys ignored. The frozen v0.14-era body (no series) pinned 201.
- [ ] S5 through the REAL middleware: the integration probe posts the full 720 KB worst case end to end (middleware → validator → store → read-back sample-identical); the list query proven not to select the column.
- [ ] Client: the POST body attaches `series` from the loaded run when present; the sacrifice retry (non-ok with series → one retry without → only that failure surfaces the error). Failing tests: the 413 leg (mocked route rejecting the first body, accepting the second — the log saves series-less); the success leg (series arrives).
- [ ] Self-mutation: drop the retry (the 413 leg red); widen the json limit app-wide (the other-route 413 test red). Restore. Full `pnpm test`, `pnpm e2e` FOREGROUND. Commit.

### Task 4: The remaining S-checks, e2e, and reconciliation

**Files:** Modify `app/e2e/` (the S2 Chrome probe; the S3 forced-real-quota leg; a full-loop e2e: connected fake session → log → the stored series visible via GET), `docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md` or the phase walk sheet (the three §6.8 device items), `ROADMAP.md` (LT spec 2 status); Test e2e.

**Interfaces:** Consumes Tasks 1-3.

- [ ] S2: the e2e probe writes a worst-case record+series to localStorage in the real Chrome context and reads it back byte-identical.
- [ ] S3's real leg: fill origin storage with junk keys until `setItem` throws, then drive a session close — assert the run survived with `seriesDropped` (clean up the junk after).
- [ ] The full loop: fake-driven connected session (the fake's frames now feed the recorder — extend the fake seam only if needed), finish, log, `GET /api/logs/:id` shows the series with plausible values (count vs session seconds; the drift pin already guards the list).
- [ ] Walk sheet: §6.8's three device items appended (iOS storage probe, persist() grant observation, the fast-rate re-measure). ROADMAP: LT spec 2 status.
- [ ] Full gates: `pnpm test` (both summary lines), `pnpm e2e` FOREGROUND, `pnpm screenshots` (only if a capture changes — capture-only spec: none should; state it). Self-mutation: break the full-loop's series assertion (red). Commit.

---

## Self-review

- Spec coverage: §1→T1; §2→T2; §3→T3; §4: S1→T2, S2→T4, S3→T2(mock)+T4(real), S4→T2, S5→T3, S6→T2, S7→T1; §6: 1→T1, 2→(the S-table's homes), 3→T1, 4→T2+T3, 5→T1, 6→T2(never-migrate)+T3(frozen body), 7→stated (internal-only, no notes clause owed), 8→T4.
- Placeholders: none; exact values in the spec's tables.
- Type consistency: `SeriesData`/`Sample` (T1) = MonitorRun.series (T2) = the POST/column shape (T3); `seriesDropped` written in T2, read nowhere yet (audit-trail only — stated).
