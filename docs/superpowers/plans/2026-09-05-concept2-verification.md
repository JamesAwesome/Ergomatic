# Wave E PR C — send the machine's own total to Concept2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Post the monitor's own distance and time (`machine_work_meters`/`machine_work_seconds`) to Concept2 for the code-checked fields, instead of our interval sums, so a rower's PM5 verification code accepts the row.

**Architecture:** Thread the two already-stored machine totals through `SessionLogRow` and `toMappingRow`; `buildC2Payload` posts them using the hero's OWN `!== null && > 0` predicate (NOT `??` — a `0` machine total must fall back to our sum, matching what the app displays). Pure server-side; the columns already exist, no schema, no migration.

**Tech Stack:** Express 5, Vitest (unit project), Drizzle (read-only here).

**Spec:** `docs/superpowers/specs/2026-09-05-concept2-verification.md` (rev 3: full antagonist pass + lens 2 folded). Live evidence: `docs/superpowers/research/2026-09-05-c2-verification-measurement.md` (5706 verifies, 5707 and 5708 do not).

**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc`, branch `wave-e-c2-verification`, base `6dea0fc6`. All commands from its `app/`.

**Paste-test record:** the entire diff below was applied at `6dea0fc6`, typechecked, and run: `mapping.test.ts` 44 passed, `concept2.test.ts` 143 passed, and the four mutations in Task 1 Step 4 measured (failure text verbatim). Then reset.

## Global Constraints

- **TRIAD** (a number's meaning changes on the wire): the spec took the full antagonist pass; the PR takes a PM gate. Does not bundle.
- **Authoritative number = `machine_work_meters`** (0x0039's own total), proven live. Posted via the hero's `!== null && > 0` predicate, else fall back to `work_meters`/`work_seconds` (today's behavior; that row could not verify anyway).
- **No rower-visible number moves:** the hero (`LogRow.tsx`) and MACHINE CONFIRMED block (`FromTheLog.tsx`) already display the machine totals with the SAME `> 0` guard. PR C makes the wire match. No Gate 0 (confirm by grep, Task 2).
- **`time` moves with distance** — seconds diverge for real (`oracleCorpusReplay` KEYSTONE 138.7 vs 138.8); gated by a seeded unit test at this seam, and by `oracleCorpusReplay` upstream.
- **RF22:** commit before mutating; `grep -c` each anchor to 1; `git checkout -- <file>` to revert.
- **`NODE_OPTIONS=--no-experimental-webstorage`** on every bare vitest call.

---

## Task 1: send the machine's total; the seam test; the mutations

**Files:** `server/concept2/mapping.ts` (SessionLogRow + buildC2Payload's `> 0` predicate), `server/routes/concept2.ts` (toMappingRow), `server/concept2/mapping.test.ts` (3 unit tests: machine-value, null-fallback, 0-fallback + fixture field), `server/routes/concept2.test.ts` (the RF24 seam test), `server/routes/completedAt.integration.test.ts` (fixture field — a SessionLogRow literal the type change forces).

- [ ] **Step 1: apply the change and its tests (one paste-tested diff).**

Apply this patch (`git apply --recount <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc`, one block per file; if it fails the tree drifted from `6dea0fc6` — stop, do not hand-merge):

```diff
diff --git a/app/server/concept2/mapping.ts b/app/server/concept2/mapping.ts
index 344a6824..f96eb333 100644
--- a/app/server/concept2/mapping.ts
+++ b/app/server/concept2/mapping.ts
@@ -36,6 +36,15 @@ export interface SessionLogRow {
   workMeters: number | null;
   restSeconds: number | null;
   restMeters: number | null;
+  // Wave E PR C: the monitor's OWN totals (0x0039), stored per row as
+  // `machine_work_meters`/`machine_work_seconds` — what the PM5's
+  // verification code is minted over, so what Concept2 checks it against
+  // (proven live: 5706 verifies, our 5708 sum does not —
+  // docs/superpowers/research/2026-09-05-c2-verification-measurement.md).
+  // Nullable: a pm5/finished row can lack them, then the send falls back to
+  // our interval sums.
+  machineWorkMeters: number | null;
+  machineWorkSeconds: number | null;
   machineSummary: Record<string, unknown> | null;
   source: LogSource;
   endedBy: string | null;
@@ -489,8 +498,27 @@ export function buildC2Payload(
     type: "rower",
     date: formatC2Date(instant, tz),
     timezone: tz,
-    distance: workMeters,
-    time: c2Tenths(workSeconds),
+    // Wave E PR C: the monitor's own total, not our interval sum, for the
+    // two code-checked numeric fields (workout_type is already machine-
+    // sourced below; date is the row's own instant). The predicate is the
+    // hero's OWN — `!== null && > 0` (`src/log/LogRow.tsx` heroDistanceMeters
+    //) — NOT `??`: a `0` machine total is a value `??`
+    // would post while the hero falls back to our sum, reintroducing the
+    // send≠display split this PR closes (lens 2). Falls back to our interval
+    // sums for a row with no 0x0039 summary — today's behavior, which could
+    // not verify anyway. `time` moves with `distance`: seconds DO diverge on
+    // real captures (oracleCorpusReplay KEYSTONE, machine 138.7 vs ours
+    // 138.8), gated by a seeded unit test at this store→payload seam while
+    // oracleCorpusReplay gates the wire→machine_work_seconds step.
+    distance:
+      row.machineWorkMeters !== null && row.machineWorkMeters > 0
+        ? row.machineWorkMeters
+        : workMeters,
+    time: c2Tenths(
+      row.machineWorkSeconds !== null && row.machineWorkSeconds > 0
+        ? row.machineWorkSeconds
+        : workSeconds,
+    ),
     weight_class: weightClass,
   };
```

Apply this patch (`git apply --recount <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc`, one block per file; if it fails the tree drifted from `6dea0fc6` — stop, do not hand-merge):

```diff
diff --git a/app/server/routes/concept2.ts b/app/server/routes/concept2.ts
index 6508a86e..f5b9a84d 100644
--- a/app/server/routes/concept2.ts
+++ b/app/server/routes/concept2.ts
@@ -212,6 +212,8 @@ function toMappingRow(row: {
   workMeters: number | null;
   restSeconds: number | null;
   restMeters: number | null;
+  machineWorkMeters: number | null;
+  machineWorkSeconds: number | null;
   machineSummary: unknown;
   source: LogSource;
   endedBy: string | null;
@@ -224,6 +226,11 @@ function toMappingRow(row: {
     workMeters: row.workMeters,
     restSeconds: row.restSeconds,
     restMeters: row.restMeters,
+    // Wave E PR C: carried so the payload posts the monitor's own total (the
+    // code-checked number), not our interval sum. `store.get` selects every
+    // column, so nothing upstream changes.
+    machineWorkMeters: row.machineWorkMeters,
+    machineWorkSeconds: row.machineWorkSeconds,
     machineSummary: row.machineSummary as Record<string, unknown> | null,
     source: row.source,
     endedBy: row.endedBy,
```

Apply this patch (`git apply --recount <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc`, one block per file; if it fails the tree drifted from `6dea0fc6` — stop, do not hand-merge):

```diff
diff --git a/app/server/concept2/mapping.test.ts b/app/server/concept2/mapping.test.ts
index c2372e25..b77fbc9e 100644
--- a/app/server/concept2/mapping.test.ts
+++ b/app/server/concept2/mapping.test.ts
@@ -39,6 +39,8 @@ const FINISHED_ROW: SessionLogRow = {
   workMeters: 935,
   restSeconds: 120,
   restMeters: 274,
+  machineWorkMeters: null,
+  machineWorkSeconds: null,
   machineSummary: { avgStrokeRate: 24, workoutType: 8 },
   source: "pm5",
   endedBy: "finished",
@@ -194,6 +196,65 @@ describe("buildC2Payload", () => {
     });
   });
 
+  // Wave E PR C: the send posts the monitor's OWN totals for the two
+  // code-checked numeric fields, so the PM5 verification code accepts the
+  // row (proven live: 5706 verifies, our 5708 sum does not —
+  // docs/superpowers/research/2026-09-05-c2-verification-measurement.md).
+  it("posts machineWorkMeters as distance and machineWorkSeconds as time when present", () => {
+    // James's walk row: interval sum 5708 (workMeters) diverges from the
+    // monitor's own 5706 total (machineWorkMeters); the code was minted over
+    // 5706. Seconds diverge on real captures too (oracleCorpusReplay
+    // KEYSTONE: machine 138.7 vs ours 138.8); here they are given an
+    // independent seeded divergence (1500 vs 1499.8) so this store→payload
+    // test pins BOTH fields at the machine value with independent literals
+    // (RF21). oracleCorpusReplay gates the wire→machine_work_seconds step;
+    // this gates the seam PR C touches.
+    const row: SessionLogRow = {
+      ...FINISHED_ROW,
+      workMeters: 5708,
+      workSeconds: 1500,
+      machineWorkMeters: 5706,
+      machineWorkSeconds: 1499.8,
+    };
+    const payload = buildC2Payload(row, LINK, "UTC");
+    expect(payload.distance).toBe(5706);
+    expect(payload.time).toBe(14998); // c2Tenths(1499.8), NOT c2Tenths(1500)=15000
+  });
+
+  it("falls back to workMeters/workSeconds when the machine totals are null (no 0x0039 summary)", () => {
+    // A pm5/finished row that never received a machine summary keeps today's
+    // behavior — it could not verify anyway; the point is no regression.
+    const row: SessionLogRow = {
+      ...FINISHED_ROW,
+      workMeters: 5708,
+      workSeconds: 1500,
+      machineWorkMeters: null,
+      machineWorkSeconds: null,
+    };
+    const payload = buildC2Payload(row, LINK, "UTC");
+    expect(payload.distance).toBe(5708);
+    expect(payload.time).toBe(15000);
+  });
+
+  it("falls back to workMeters/workSeconds when the machine totals are 0, matching the hero's own >0 guard", () => {
+    // A `0` machine total is a value `??` would post while the hero
+    // (LogRow.heroDistanceMeters, `!== null && > 0`) falls back to our sum —
+    // send≠display, the split this PR closes (lens 2). The send uses the
+    // hero's predicate, so a 0 here posts the interval sum, not 0.
+    const row: SessionLogRow = {
+      ...FINISHED_ROW,
+      workMeters: 5708,
+      workSeconds: 1500,
+      machineWorkMeters: 0,
+      machineWorkSeconds: 0,
+    };
+    const payload = buildC2Payload(row, LINK, "UTC");
+    expect(payload.distance).toBe(5708);
+    expect(payload.distance).not.toBe(0);
+    expect(payload.time).toBe(15000);
+    expect(payload.time).not.toBe(0);
+  });
+
   it("uses loggedAt + effectiveTz when completedAt/tz are both null (legacy row)", () => {
     const legacyRow: SessionLogRow = {
       ...FINISHED_ROW,
```

Apply this patch (`git apply --recount <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc`, one block per file; if it fails the tree drifted from `6dea0fc6` — stop, do not hand-merge):

```diff
diff --git a/app/server/routes/concept2.test.ts b/app/server/routes/concept2.test.ts
index eeee1ad6..bf87e49b 100644
--- a/app/server/routes/concept2.test.ts
+++ b/app/server/routes/concept2.test.ts
@@ -2098,6 +2098,40 @@ describe("upload (POST /api/concept2/results/:logId)", () => {
     expect(stored?.c2UserId).toBe(LINK_INPUT.c2UserId);
   });
 
+  // Wave E PR C, the RF24 seam: A (the store) writes machineWorkMeters, B
+  // (buildC2Payload, via toMappingRow) reads it. This test starts at the
+  // stored row — NOT at a hand-built SessionLogRow — so the mutation that
+  // drops the field in `toMappingRow` (leaving the payload to fall back to
+  // workMeters while the app still DISPLAYS the machine number) is caught
+  // here and nowhere else. The number is the walk's own: interval sum 5708,
+  // monitor total 5706; the code was minted over 5706 and verifies against
+  // it live (docs/superpowers/research/2026-09-05-c2-verification-measurement.md).
+  it("posts the monitor's OWN total (machineWorkMeters), not our interval sum, end to end", async () => {
+    const store = makeFakeConcept2Store();
+    await store.upsertLink(userA.id, freshLink());
+    const client = makeStubClient();
+    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 91001 });
+    const { app, logs } = buildApp({ store, client });
+    // A divergent row: our sum 5708, the machine's own total 5706.
+    const id = await seedEligibleLog(logs, userA.id, {
+      workMeters: 5708,
+      machineWorkMeters: 5706,
+    });
+
+    const res = await asA(
+      request(app)
+        .post(`/api/concept2/results/${id}`)
+        .send({ tz: "America/New_York" }),
+    );
+    expect(res.status).toBe(200);
+    const posted = vi.mocked(client.postResult).mock.calls[0]![1];
+    // The authoritative number, INDEPENDENT literals (RF21): 5706 posted,
+    // 5708 (our sum) NOT. Reverting buildC2Payload to `workMeters`, or
+    // dropping the field in toMappingRow, posts 5708 and reddens this.
+    expect(posted.distance).toBe(5706);
+    expect(posted.distance).not.toBe(5708);
+  });
+
   it("legacy row: persists tz on the first attempt; a failed-then-retried upload from a DIFFERENT zone posts the SAME date (dedup stability)", async () => {
     const store = makeFakeConcept2Store();
     await store.upsertLink(userA.id, freshLink());
```

Apply this patch (`git apply --recount <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc`, one block per file; if it fails the tree drifted from `6dea0fc6` — stop, do not hand-merge):

```diff
diff --git a/app/server/routes/completedAt.integration.test.ts b/app/server/routes/completedAt.integration.test.ts
index 7b80c193..69eb07e2 100644
--- a/app/server/routes/completedAt.integration.test.ts
+++ b/app/server/routes/completedAt.integration.test.ts
@@ -261,6 +261,8 @@ describe("POST/GET /api/logs: completedAt/tz round-trip through the real route a
         workMeters: 5000,
         restSeconds: null,
         restMeters: null,
+        machineWorkMeters: null,
+        machineWorkSeconds: null,
         machineSummary: null,
         source: "pm5",
         endedBy: "finished",
```

- [ ] **Step 2: typecheck and run both suites.**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc/app
pnpm typecheck
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit server/concept2/mapping.test.ts server/routes/concept2.test.ts
```
Expected: typecheck clean (E2E membership 20/20); `Tests 187 passed` (44 + 143). If the integration-test fixture is the only typecheck error, a FOURTH SessionLogRow literal exists — add the two null fields and report it (the type change forces every literal; the plan found three: the two test fixtures in the diff plus `completedAt.integration.test.ts`).

- [ ] **Step 3: commit BEFORE mutating.**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc
git rev-parse --show-toplevel
git add app/server/concept2/mapping.ts app/server/routes/concept2.ts app/server/concept2/mapping.test.ts app/server/routes/concept2.test.ts app/server/routes/completedAt.integration.test.ts
git commit -m "PR C: post the monitor's own total/time to Concept2 so the verification code accepts the row"
```
- [ ] **Step 4: mutations (each anchor `grep -c` to 1; revert with `git checkout -- <file>`; MATCH the measured column).**

| # | mutation | measured failure |
| --- | --- | --- |
| M1 distance | `mapping.ts`: the `distance:` ternary → `distance: workMeters,` | `mapping.test.ts` AND `concept2.test.ts` each `1 failed` — `expected 5708 to be 5706` (unit `:219`, seam `:2131`) |
| M2 time | `mapping.ts`: the `time:` ternary → `time: c2Tenths(workSeconds),` | `mapping.test.ts` `1 failed` — `expected 15000 to be 14998` |
| M3 seam (RF24) | `routes/concept2.ts`: `machineWorkMeters: row.machineWorkMeters,` → `machineWorkMeters: null,` | `mapping.test.ts` **stays 44 passed** (builds `SessionLogRow` directly); `concept2.test.ts` `1 failed` — `expected 5708 to be 5706`. Only the row-level test catches a `toMappingRow` drop. |
| M4 the `> 0` guard | `mapping.ts`: the `distance:` ternary → `distance: row.machineWorkMeters ?? workMeters,` | `mapping.test.ts` `1 failed` — `expected +0 to be 5708` (the 0-fallback test; `??` posts a machine `0` the hero would not display) |

Record each verbatim.

---

## Task 2: the C5 grep, final gates, the PR, and STOP

- [ ] **Step 1 (C5 — no rower-visible number moves):** paste

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc/app
grep -rn "machineWorkMeters\|machineWorkSeconds\|workMeters\|> 0" src/log/LogRow.tsx src/log/FromTheLog.tsx
```
and confirm every rower-facing distance/time prefers the machine total under the SAME `!== null && > 0` guard the send now uses (so send = display in every tier — null, 0, and valued). If any surface shows `work_meters` while the machine total is present and > 0, STOP: Gate 0 opens.

- [ ] **Step 2: merge main, then the whole gate** (each result one per line; `pnpm screenshots` NOT run — no screen changes, say so).

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2prc
git fetch origin && git merge --no-edit origin/main
cd app
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test --project unit --project client
pnpm build
pnpm dist:grep
pnpm e2e
```
- [ ] **Step 3 (RF28):** `gh run list --branch main --limit 3` — state main's latest conclusion.
- [ ] **Step 4: the PR body.** Line one "This PR …"; ~6 bullets, ~120 words above the fold, counted; the rest in `<details><summary><strong>Record (for agents and audits)</strong></summary>`. The Record carries: the live measurement (5706/5707/5708, the committed file); the four mutations verbatim; the C5 grep; the two-gate story for time (seam seeded test + `oracleCorpusReplay` KEYSTONE 138.7/138.8); the proof contract and its strongest conclusion (CI proves which stored number we post; the live API test proved acceptance once, log-dev, one distance); and the **owed clean confirming send** — a fresh 5708 API test needs James's real log-dev row deleted first, or a production hardware send after ship — as a ROADMAP row (RF14), not only here.
- [ ] **Step 5: present and STOP.** No merge without James. Do not remove the worktree.
- [ ] **Step 6 (after merge):** TestFlight release recommendation, and the agent-config check.

## Self-review

- **Spec coverage:** C1/C2/C3 (§2, committed measurement), C4 (Task 1 seam M3 + seeded M2 + the M4 `>0` guard), C5 (Task 2 Step 1), C6 (antagonist on the spec; PM on the PR).
- **Type-change coupling (RF10):** three `SessionLogRow` literals — the two fixtures in the diff plus `completedAt.integration.test.ts`; Step 2 names the tell if a fourth exists.
- **No placeholders; every expected value measured at `6dea0fc6`.**
