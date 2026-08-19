# Log Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wrong session can be deleted from its own page; deleting the latest plan session un-ticks its checkmark, and nothing else about the record ever rewrites.

**Architecture:** One store method carrying the whole §2 transaction (row delete + terminal-only un-count under FOR UPDATE with conditions in the UPDATE's WHERE), one route returning what it did (`200 {unCounted}`), one staged affordance on the from-the-log view, then the witness sweep.

**Tech Stack:** Existing: Express 5 + drizzle + Postgres (contract suite both stores), React 19, the house e2e/design layers.

## Global Constraints

- VALUE AUTHORITY: `docs/superpowers/specs/2026-08-18-log-delete-design.md` — §1 affordance table, §2 the un-count rule and transaction shape, §5 exit criteria. THE SPEC GOVERNS over any brief slice on mismatch.
- TRIAD: the API's first DELETE + a plan-counter write. Antagonist pass already run and folded (four proven breaks reshaped §1/§2/§5); PM final-PR gate at the end.
- The un-count fires iff ALL THREE: `plan_key` = current `plan_state.planKey`; `plan_index === doneN - 1` EXACTLY (terminal only — a middle index NEVER decrements); newest-wins holder of its `(plan_key, plan_index)`.
- Transaction shape verbatim: `SELECT … FROM plan_state WHERE user_id = $1 FOR UPDATE` first; decrement carries conditions in its own WHERE (`AND plan_key = $key AND done_n = $index + 1`); `GREATEST(done_n - 1, 0)` clamp kept as depth; floor unreachable BY CONSTRUCTION and the contract test asserts unreachability.
- Response `200 {unCounted: boolean}` — the server reports what it did; never 204. Owner-checked 404 both directions (absence + another user), no existence leak. Client treats a confirm-time 404 as success-and-navigate.
- Copy verbatim from §1: linkage rows `This removes the session. If it is your latest plan session, the checkmark un-ticks.`; no-linkage rows `This removes the session and its reflection.`; confirm button `Delete session`. No em-dashes in copy; 44px targets.
- No other write: other logs' `plan_key`/`plan_index` never rewritten; the localStorage monitor record untouched.
- STALE-STACK CHECK (spec §5.8, the antagonist's operational catch): before any e2e, verify the compose stack serves a schema with `plan_key` (e.g. the seeded response carries the field) or rebuild — a worktree stack can be many commits stale.
- Commands in app/; `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first; `pnpm test --project client` for src tests (never unit); failing test first; e2e + screenshots FOREGROUND (blocking, 590000ms); per-file coverage inspected; self-mutation with byte-identical diff-verified restores; `git rev-parse --show-toplevel` before every commit.

---

### Task 1: The store transaction and the route

**Files:** Modify `app/server/stores/logs.ts` (`delete()`), `app/server/stores/testing/fakes.ts` (mirror), `app/server/stores/contracts/storeContracts.ts` (the witness table), `app/server/routes/data.ts` (`DELETE /api/logs/:id`); Test storeContracts (runs both stores via `contracts.fake.test.ts` + `contracts.real.integration.test.ts`), `data.test.ts`, isolation.

**Interfaces:** Produces `stores.logs.delete(userId: string, id: string): Promise<{ deleted: boolean; unCounted: boolean }>` — `deleted: false` → route 404; route responds `200 {unCounted}` or 404. Nothing else changes shape.

- [ ] Failing contract tests first — the §5.2 witness table, each red-provable: terminal newest link → `{deleted: true, unCounted: true}`, doneN down one, checkmark's slot reopens (`?plan=` no longer lists the index at done depth); wrong plan key → unCounted false, counter untouched; NON-TERMINAL index (the B1 orphan fixture: two advancing saves, delete the FIRST) → unCounted false, counter untouched, the index-1 log still linked via `?plan=`; older same-index duplicate → row-only delete, and after deleting the NEWEST holder of a non-terminal index the `?plan=` link re-points to the older log.
- [ ] Floor-unreachability (§2): a contract test that runs delete concurrently-shaped against a Reset (sequenced via the store API: delete a terminal log whose plan was Reset after fetch — the WHERE declines, `unCounted: false`, `done_n` stays 0, never −1); assert `done_n >= 0` after every table case.
- [ ] Implement: one `db.transaction` — `SELECT … FOR UPDATE` on the plan_state row, `DELETE … RETURNING` the log row (owner-scoped `and(eq(userId), eq(id))`), then the conditional `UPDATE plan_state SET done_n = GREATEST(done_n - 1, 0) WHERE user_id = $1 AND plan_key = $key AND done_n = $index + 1` executed only when the deleted row carried linkage AND it was the newest-wins holder (the same `DISTINCT ON`/max-loggedAt+id resolution `listPlanLinks` uses — one shared helper, not a second copy). `unCounted` = that UPDATE's row count === 1. Fake mirrors exactly (its `seq` tiebreak stands in for `id`).
- [ ] Route: `app.delete("/api/logs/:id")` per the GET/PATCH idiom; 404 when `deleted: false`; `200 {unCounted}` otherwise. Bystander byte-comparison test (§5.4): a second user's row and the same user's OTHER logs read back byte-identical after a delete.
- [ ] Self-mutation: flip the terminal condition to `<=` (the B1 orphan returns — table case red); drop the FOR UPDATE + WHERE conditions for a bare decrement (floor test red). Restore byte-identical, diff-verified. Full `pnpm test`. Commit.

### Task 2: The affordance

**Files:** Modify `app/src/log/FromTheLog.tsx` (+test), `app/src/log/useLogFetch.ts` or sibling (the delete call), `app/src/index.css`; Test FromTheLog.test.tsx.

**Interfaces:** Consumes Task 1's route. Produces the §1 affordance; no new exports.

- [ ] Failing tests first, per §1's table: the Delete affordance renders at the bottom, below the plan footer, only on the detail view; first tap stages (WorkoutDetail.tsx's staged destructive idiom — read it and reuse its structure/classes, do not hand-roll); copy exact per linkage presence (`plan_key` non-null on the fetched row); Cancel unstages; confirm disabled in-flight; server error re-enables with the message; 404 navigates as success; success navigates to `resolveLogBack`'s target.
- [ ] The §5.1 honesty table as a component test: for each of [terminal linked, non-terminal linked, unlinked, stale-plan-changed-between-fetch-and-confirm], mock the server's `{unCounted}` decision and assert the rendered copy's conditional wording holds true in every row (the copy never promised what didn't happen). No shared client/server predicate exists to make this true by construction — the client only reads `plan_key` presence.
- [ ] Implement + CSS (44px targets; the staged confirm's contrast computed with numbers in the report).
- [ ] Self-mutation: swap the two copy strings (linkage test red); make 404 surface as error (the 404-as-success test red). Restore. `pnpm test --project client`, full `pnpm test`, `pnpm e2e` FOREGROUND (src changed; STALE-STACK CHECK first), `pnpm screenshots` FOREGROUND (new staged-confirm state: capture `log-delete-confirm.png` seeded with a plan-linked session, open it with Read, describe it). Commit.

### Task 3: The e2e legs, the suggestion witness, reconciliation

**Files:** Modify `app/e2e/log.spec.ts` (the two §5.3 legs), `app/e2e/today.spec.ts` or the suggestion spec home (§5.5), `docs/design/DEVIATIONS.md` (only if a row stales), `ROADMAP.md` (the PM-filed no-delete gap: mark ANSWERED by this spec, pointer to it); Test e2e.

**Interfaces:** Consumes Tasks 1-2.

- [ ] Leg (a), terminal: save through the shipped Log-against-plan button, open the log from Plan's checkmark, delete via the staged confirm, assert the checkmark un-ticks and the slot reads as today's session (id-from-href oracle per the spec-2 precedent).
- [ ] Leg (b), re-point: three saves (pre-Reset index 0, post-Reset index 0, index 1), delete the MIDDLE (newest holder of index 0, non-terminal): tick stays, counter unchanged, the index-0 checkmark now opens the PRE-RESET log (assert by captured id).
- [ ] §5.5: delete the only log of a workout → the LAST DONE exclusion releases it (the workout reappears in the suggestion pool — assert the consequence on Today, not the store).
- [ ] ROADMAP edit: the queued "no way to correct or remove" item gets its ANSWERED disposition with a pointer to this spec (the accepted remedy gap stays listed — it is NOT fully closed, §4's own words).
- [ ] Full gates: `pnpm test` (both summary lines), `pnpm e2e` FOREGROUND, `pnpm screenshots` (only if captures changed). Self-mutation: break leg (b)'s newest-wins consumption (red). Commit.

---

## Self-review

- Spec coverage: §1→T2 (+T3 leg a exercises the full path), §2→T1, §3→T3 (§5.5), §4 accepted-gap→T3's ROADMAP edit, §5: 1→T2, 2→T1, 3→T3, 4→T1, 5→T3, 6→post-merge notes (recorded), 7→additive (stated), 8→Global Constraints' STALE-STACK CHECK carried into T2/T3 gates.
- Placeholders: none; exact values in the spec's tables by design.
- Type consistency: `delete(userId, id) → {deleted, unCounted}` (T1) = the route's consumption (T1) = the client's response read (T2); the newest-wins helper is shared with `listPlanLinks`, not re-derived (T1).
