# Storage Spine PR 2 — Work and Rest Come Apart (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RC-1 — the stored record carries work and rest as separate quantities per interval and per session; every fused number becomes a display sum; the fake stops lying about exactly these fields first, so green means something.

**Architecture:** Fake truth first (RC-8's remaining corrections — `intervalRestTimeSeconds: 0` hardcode, `ergMachineType: 1` in two fake sites + domain fixtures, off-rest `restSeconds`, `splitIntervalType`), then the domain/driver fold (`IntervalActual` gains `restSeconds?`/`type?` from 0x0037's already-decoded offsets 12/16), then session-level separated quantities on the stored record + additive server columns beside the stored heroes, with the display-sum invariant pinned to the rounding law. No screen changes; no backfill.

**Tech Stack:** TypeScript; Vitest unit/client/integration; Drizzle additive migration; the rest-bearing committed captures (session-2, pyramid) as the work-only oracle.

**Spec:** `docs/superpowers/specs/2026-08-23-storage-spine-design.md` §3 (binding; on conflict with observation, report — rule 10).

## Global Constraints

- Worktree `.claude/worktrees/rc-spine2`, branch `rc-spine2`. `git rev-parse --show-toplevel` before every commit. `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` every shell.
- TDD; gates FOREGROUND; `pnpm test --project unit|client|integration` only (integration needs Docker, foreground).
- TRIAD (stored shape, client AND server): additive-only everywhere — `IntervalActual` fields optional; server columns nullable, additive migration, **no backfill** (old rows fused-only forever, stated); API additive-only; `isMonitorRun` untouched (its positive conjunction is the tolerance; `v` stays 2).
- **The display-sum invariant pins the ROUNDING LAW**: displayed totals equal legacy rendering to the digit — `round(Σ(work+rest))`, one rounding at the end, never `round(Σwork)+round(Σrest)`; the pin includes a case where the two laws differ.
- **The work-only pins use the REST-BEARING captures** (session-2: work 1535 m vs fused 1599; pyramid: 1300 vs 1347) — the r0 keystone cannot discriminate and is not evidence here.
- The stored rest is the machine's rest FIELD (a readback of programmed rest on all committed evidence) — every comment and name says so; never "measured".
- End-during-rest bound: an END during a trailing rest loses the just-finished interval's 0x0037 — fields absent, never estimated; documented in DEVIATIONS.
- The fake must tell the truth BEFORE RC-1's tests run (Task 1 precedes all): capture-replay pins prove meaning, fake pins prove plumbing.
- PM final gate on the PR; no merge on green alone.

## File map

- Modify: `app/src/monitor/transports/fake.ts` (:955/:1057 `ergMachineType: 1`→0; :1064 `intervalRestTimeSeconds: 0` hardcode → scripted rest; off-rest `restSeconds`; `splitIntervalType` from script kind) + domain fixtures carrying `ergMachineType: 1` (grep; the delta pass counted three); `app/domain/monitor/types.ts` (`IntervalActual` + `restSeconds?`/`type?`); `app/src/monitor/driver.ts` (the boundary fold carries 0x0037's offsets 12/16 into the actual); `app/src/monitor/monitorRun.ts` (session-level `workSeconds`/`workMeters`/`restSeconds`/`restMeters` computed at close from actuals, additive-optional); `app/src/session/summaryModel.ts` (display sums unchanged — pinned, not modified, unless reading the new fields simplifies nothing: it must NOT read them this PR); `app/server/db/schema.ts` + a new additive migration + `app/server/routes/data.ts` (four nullable columns beside the stored heroes ~:201, POST accepts them additively, GET returns them); `app/src/session/logDraft.ts` or the POST builder (send the four sums when present); `docs/design/DEVIATIONS.md` (end-during-rest row); `ROADMAP.md` (tick RC-1 + RC-8's remaining items, with the narrowed notes).

---

### Task 1: The fake stops lying (RC-8's remaining corrections)

**Files:**
- Modify: `app/src/monitor/transports/fake.ts`, plus the domain fixtures carrying `ergMachineType: 1` (grep `ergMachineType` across `app/domain` and test files; the spine delta pass counted the hardcode at two fake sites + three fixtures)
- Test: `app/src/monitor/transports/fake.test.ts`

**Interfaces:** none new — the fake's emitted bytes change to match the real wire; `FakeScript` gains nothing unless a scripted rest needs expressing (follow the script's existing interval shape — rests are already scripted; the fix is EMITTING them).

- [ ] **Step 1: Failing capture-truth pins.** For each corrected field, a test asserting the fake's emitted value against the REAL wire's committed value: `ergMachineType` 0 (real machine: 0 in 3448/3448 frames — cite), `intervalRestTimeSeconds` equal to the scripted interval's rest (not 0 — the exact field RC-1 stores; a rest-bearing script must emit the scripted rest on its boundary 0x0037), `restSeconds` 0 only when the script HAS no rest, `splitIntervalType` reflecting the scripted kind (verify the real values from the captures via the corpus decode before asserting — if the real enum values are unestablished for a case, pin only the established ones and say so).
- [ ] **Step 2: Verify failures** (`pnpm test --project client` / unit per file).
- [ ] **Step 3: Implement; fix the three domain fixtures the same way.** Any test that BREAKS because it relied on the lie gets retargeted with a comment naming the lie (rule 10 in reverse — the fixture was wrong, not the test's intent).
- [ ] **Step 4: Green; byte-for-byte write-verify tests untouched; self-mutation** (restore each lie → its pin red).
- [ ] **Step 5: Commit** `fix: the fake tells the truth about rest, machine type, and interval kind`.

### Task 2: The interval carries its rest (domain + driver fold)

**Files:**
- Modify: `app/domain/monitor/types.ts` (`IntervalActual`), `app/src/monitor/driver.ts` (the boundary fold)
- Test: `app/src/monitor/driver.test.ts`, plus a capture-replay pin

**Interfaces:**
- Produces (Task 3 relies on): `IntervalActual` gains `restSeconds?: number` (0x0037 offset 12, `intervalRestTimeSeconds` — the machine's rest field, a READBACK per spec §1, the doc comment says so) and `type?: number` (offset 16, `splitIntervalType`, stored raw, enum unverified — comment says so). Additive-optional (`restDistanceMeters` precedent, same file).

- [ ] **Step 1: Failing tests** — (a) driver: a rest-bearing boundary 0x0037 folds `restSeconds`/`type` into the actual (fake-driven, now truthful per Task 1); (b) capture replay: a rest-bearing committed capture's boundary produces an actual whose `restSeconds` equals the wire's offset-12 value (decode independently in the test — name file+seq); (c) the synthesized-final fallback omits both fields (absent, not 0 — the end-during-rest bound's stored shape); (d) a rest-free boundary stores `restSeconds: 0` if the wire says 0 (the field is present when the wire delivered it — absence means the wire never spoke).
- [ ] **Step 2: Verify failures at project scope.**
- [ ] **Step 3: Implement** — the fold reads the already-decoded `parseSplitIntervalData` fields; no new wire work.
- [ ] **Step 4: Green; coverage; self-mutation** (drop each field's fold → its pin red).
- [ ] **Step 5: Commit** `feat: each interval remembers its rest — the machine's number, named as a readback`.

### Task 3: The session's quantities come apart (client store + server columns)

**Files:**
- Modify: `app/src/monitor/monitorRun.ts` (close-time sums), `app/server/db/schema.ts` + new migration `app/drizzle/*`, `app/server/routes/data.ts` (POST validation + GET), the POST builder (grep who sends the stored heroes — `logDraft.ts`/`LogSession.tsx`), `docs/design/DEVIATIONS.md`, `ROADMAP.md`
- Test: `app/src/monitor/monitorRun.test.ts`, `app/src/session/summaryModel.test.ts`, the server integration tests

**Interfaces:**
- Produces: `MonitorRun` gains `workSeconds?`, `workMeters?`, `restSeconds?`, `restMeters?` — computed ONCE at natural close from actuals (work = Σ `elapsedSeconds`/`distanceMeters`; rest = Σ `restSeconds`/`restDistanceMeters` where present), additive-optional, absent on records closed before this PR and on link-lost/terminate closes with incomplete actuals (never estimated). Server: four nullable integer columns beside the stored heroes (`schema.ts` ~:201 block), additive migration, POST accepts them (validated: non-negative integers or absent — follow `endedByError`'s validator idiom), GET returns them.

- [ ] **Step 1: Failing tests** — (a) close-time sums from a rest-bearing actuals set (REAL values from the session-2 capture's actuals: work 1535 ≠ fused 1599 — the work-only discrimination pin); (b) **the rounding-law pin**: an actuals set where `round(Σ(w+r)) ≠ round(Σw)+round(Σr)` (e.g. work 10.4 + rest 10.4: fused rounds 21, split-then-round gives 20) — assert the DISPLAY path still renders the fused-law value and the stored quantities are the raw sums; (c) `summaryModel`'s displayed totals byte-identical on a record WITH the new fields vs the same record without (the display must not read them this PR — pin by construction); (d) server round-trip: POST with the four fields → GET returns them; POST without → nulls; invalid (negative/non-integer) → 400 with the route's error idiom; (e) migration is additive (the schema test idiom if one exists; otherwise the migration file's shape reviewed by eye + integration green against a migrated DB).
- [ ] **Step 2: Verify failures** (client + integration, Docker foreground).
- [ ] **Step 3: Implement** — client sums at the natural-close site (grep `completeMonitorRun`'s natural-finish path); POST builder sends them when present; server columns/validators/GET additive.
- [ ] **Step 4: Green everywhere** (`pnpm test` both lines); per-file coverage on monitorRun/data.ts touched regions.
- [ ] **Step 5: Docs** — DEVIATIONS row: end-during-rest loses the trailing interval's 0x0037 (fields absent, stated bound, never estimated); ROADMAP: tick RC-1 (with the no-backfill sentence) and RC-8's corrected items (noting Task 1's scope); RC-5 explicitly NOT closed (one line).
- [ ] **Step 6: Commit** `feat: work and rest stored apart — same numbers on every screen, no backfill`.

### Task 4: Gates and assembly

- [ ] **Step 1: Full gate, foreground:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (both summary lines), `pnpm build` + `bash scripts/dist-grep.sh`, `pnpm e2e` (full count), `pnpm screenshots` (zero committed diffs expected — nothing draws; investigate any).
- [ ] **Step 2: Commit any stragglers and report done** — the controller assembles the PR (no-backfill above the fold; PM final gate follows).

---

## Self-review (done at write time)

- Spec §3 coverage: fields → T2; session quantities + server → T3; rounding law → T3(b); rest-bearing pins → T1/T2/T3(a); fake corrections → T1; end-during-rest → T2(c)+T3 docs; no-backfill → T3 + PR body; display unchanged → T3(c).
- Interfaces: `restSeconds?`/`type?` on `IntervalActual` named identically in T2/T3; the four session fields named identically in T3's client and server halves.
- No placeholders. PR 3 (F2b) stays its own plan.
