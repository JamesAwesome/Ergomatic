# Phase DE PR 2 — Rename Pain to Effort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The word "pain" appears nowhere a rower reads and nowhere an agent can grep in product code (except release-note history and the compat API paths PR 3 removes), `grep effort` in product code means one thing, and an installed pre-PR-2 build against the new server saves and reads its figure unchanged for one tag cycle.

**Architecture:** One hand-written migration renames both Postgres columns and their CHECKs and moves the `article_reads` slug. The store layer speaks only `effort`; the route layer carries two adapters — inbound (accept `pain` or `effort`, preserve key presence, 400 on disagreement, log every `pain`-keyed write) and outbound (serve both keys with one value) — at every workout and log response site. The client renames everything and reads three localStorage keys with a one-release fallback. The pace-word identifier family becomes `PaceWord*` in TypeScript only; the stored step key `effort`, the builder draft's `refEffort`, the `patterns.json` key `effortShare`, and the runtime discriminant `targetKind: "effort"` do not move.

**Tech Stack:** TypeScript, React 19, Express 5, Drizzle 0.45 / drizzle-kit 0.31.10 (hand-authored migration), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-difficulty-out-effort-in-design.md` — §4 is this PR; §2 census; §5 the compat drop that follows; §8 vetted ground. Read it first.

**Shape (spoken):** inline implementation by the controller, task-sized commits, failing tests first; review half dispatched (Task 9). TRIAD (stored shape). Antagonist DELTA pass on this plan (owed by the spec: dual-field, rollback row, migration provenance) via `/harden` lens 1, plus lens 2 on the prescribed blocks; PM final gate on the PR.

**Gate 0 (copy only, per the spec):** the word list in §4.4 of the spec, restated in Task 4 below. No captures; the committed filter-sheet screenshots are refreshed in Task 8 because they show the literal word.

## Global Constraints

- **Migration 0024 is hand-written** (SQL, `meta/0024_snapshot.json`, `meta/_journal.json` — committed at `d0053846`; `schema.ts` is NOT yet renamed on this branch, Task 1 does that). Measured 2026-09-05: `pnpm db:generate` on a renamed `schema.ts` errors non-interactively (`Interactive prompts require a TTY terminal`) — it does not emit DROP+ADD. The gate is `pnpm db:generate < /dev/null` printing `No schema changes, nothing to migrate` with `schema.ts` renamed AND the 0024 snapshot present; measured green once on a scratch tree with both, and Task 1 re-runs it on the committed tree. The migration's `UPDATE article_reads` carries `AND NOT EXISTS (… slug = 'effort-scale')` so a pre-existing new-slug row (no supported producer today) cannot violate the `(user_id, slug)` PK. **Not rollback-safe** — the RELEASING.md floor row lands in this PR (Task 7).
- **API dual-field (spec §4.3):** every response that carried `pain` carries `pain` AND `effort` with one value; every write accepts either; both present and non-null and unequal → 400 `field: "effort"`; `effort: null` beside `pain: 3` is NOT a disagreement (null is "no answer"). The inbound adapter preserves KEY PRESENCE (`PATCH /api/logs/:id` branches on `"pain" in body`), treats a `pain` key valued `undefined` as absent, and passes a NON-RECORD body through untouched (Express 5 leaves `req.body` undefined for a bodiless or non-JSON request; the two workouts routes hand `req.body` straight to `validateWorkoutInput`, which already answers non-records with 400 — the adapter must not turn that into a 500).
- **The response-site census is a COMMAND, not a count:** `grep -nE 'res\.(status\([0-9]+\)\.)?json\(' server/routes/data.ts` filtered to workout/log rows. At the plan's base that is: workouts list (row map), create (201), get, PUT, bulk `created` array; logs list, log get, PATCH no-op read (the empty-patch early return) AND PATCH update — TEN sites, two of them on the PATCH route. The dual-field test drives every one.
- **`compat.pain_write`:** one `console.info` structured line per request whose body CARRIED a `pain` key (`sawPainKey`), whether or not that key's value won. PR 3's trigger; PR 3 deletes it.
- **Old-client error wording:** log routes keep `pain must be an integer 1..5 or null` under `field: "pain"` when the pain key won (`usedPainKey`); the workouts routes cannot — `validateWorkoutInput` returns joined messages with no field — so an old client sending a bad `pain` on a workout save reads "effort must be 1..5". Accepted and named here; a cosmetic wording change on a stale build's error toast.
- **Article-read compat is TWO-sided:** the migration moves stored `pain-scale` rows to `effort-scale` for new clients; the three `/api/article-reads` routes alias `pain-scale` ↔ `effort-scale` for old ones (GET lists `pain-scale` beside `effort-scale` when the latter is read; POST/DELETE of `pain-scale` act on `effort-scale`). Symmetric with `withPainAlias`; PR 3 deletes it.
- **Identifiers that do NOT move** (stored or committed data): step JSON key `ref.effort`; builder-draft row field `refEffort` (fingerprinted, persisted); `patterns.json` key `effortShare`; `EnginePhase.targetKind: "effort"` literal. Each gets a one-line comment saying so. `PaceRefInput.tsx`'s module-local chip discriminant `kind: "base" | "effort"` is NOT persisted and IS renamed (`"word"`), so it does not join this list.
- **Copy:** no em-dashes in new user-facing strings. The five level words (Motion, Work you could keep doing, Comfortably hard, Hard intervals, All out) do not change.
- **Gates per task:** typecheck, lint, scoped tests; before ready: `pnpm test`, `pnpm test:coverage` per-file check, `pnpm build && pnpm dist:grep`, `pnpm e2e`, `pnpm screenshots`, `pnpm test --project integration`, and the by-hand stale-build check (Task 8). All in `app/` of `/Users/james/projects/github/jamesawesome/Ergomatic-wt-de2`.
- **Every commit:** `git rev-parse --show-toplevel` first; commit BEFORE any mutation probe (RF22).
- **Two finishing greps**, pasted into the PR body:
  ```sh
  grep -rniE '\bpain' domain server src e2e scripts --exclude='*.test.*'      # only: release-note history, the compat adapters + their comments in server/routes/data.ts, the legacy bulk header strings
  grep -rnwE 'effort' domain src --exclude='*.test.*' | grep -vE 'effortLevels|\.effort\b|effort:|"effort"|effort \(|EFFORT|effort,|effort\)|effort;|effort\?' | wc -l   # per-LOCATION: every remaining bare `effort` token is the 1–5 figure, one of the four frozen keys, or prose; the PR body pastes the base-vs-head counts of `\beffort\b`, `PaceWord`, and the pace-word literal `"effort"` (frozen: targetKind only) so a surviving pace-word use cannot hide inside a deduplicated list
  ```

---

## File Structure

| File | Responsibility after PR 2 |
| --- | --- |
| `drizzle/0024_pain_to_effort.sql`, `drizzle/meta/0024_snapshot.json`, `drizzle/meta/_journal.json` (NEW/edited, already authored) | the rename migration |
| `server/db/schema.ts` | `effort` columns + `*_effort_check` |
| `server/routes/effortCompat.ts` (NEW) | `adoptEffortKey(body)`, `withPainAlias(row)`, `effortError()`, the log line |
| `server/routes/data.ts` | adapters applied at 9 response + 3 write sites; `painError` gone |
| `server/stores/{workouts,logs}.ts`, `server/testing/fakes.ts`, `server/compat/difficulty.ts`, `server/seed/**` | speak `effort` |
| `domain/types.ts`, `validate.ts`, `bulk.ts`, `suggest.ts`, `pace.ts`, `expand.ts`, `generation/archetype.ts`, `display/stepDetail.ts`, `needsBaselines.ts` | `WorkoutInput.effort`; `PaceWord*` family |
| `src/components/EffortBar.tsx` (renamed from `PainBar.tsx`) + CSS | the 5-segment bar |
| `src/today/*`, `src/library/*`, `src/builder/*`, `src/log/*`, `src/session/*`, `src/justrow/*`, `src/workout/*`, `src/api/*` | every label, aria-label, type and key says effort; three parsers fall back from `pain*` |
| `src/news/content/articles.tsx`, `Reader.tsx`, `bodies/effortScale.tsx` (renamed) | slug `effort-scale`, legacy alias, rewritten boundary paragraph |
| `docs/RELEASING.md`, `ROADMAP.md`, spec §4.5, `docs/design/DEVIATIONS.md`, both skills, `scripts/library-moves.ts`, `docs/screenshots/*.png` | reconciled |

---

### Task 0: Worktree and hook check

- [ ] `git rev-parse --show-toplevel` → `/Users/james/projects/github/jamesawesome/Ergomatic-wt-de2`; hook probe as in PR 1's plan (a `TS2322` file is blocked).

### Task 1: Migration 0024 + schema (already authored and paste-tested; commit with its tests)

**Files:** `app/drizzle/0024_pain_to_effort.sql`, `app/drizzle/meta/0024_snapshot.json`, `app/drizzle/meta/_journal.json`, `app/server/db/schema.ts`; Test: `app/server/db/schema.integration.test.ts`, `app/server/db/domainSchema.integration.test.ts`

- [ ] **Step 1: Failing integration assertion.** In `schema.integration.test.ts` add, in the migrations describe:

```ts
it("0024 renames pain → effort on workouts and session_logs, keeps the 1..5 CHECK under the new name, and moves the pain-scale read slug", async () => {
  const cols = await db.execute(sql`select table_name, column_name from information_schema.columns where table_name in ('workouts','session_logs') and column_name in ('pain','effort') order by 1`);
  expect(cols.rows.map((r) => `${r.table_name}.${r.column_name}`)).toStrictEqual(["session_logs.effort", "workouts.effort"]);
  const checks = await db.execute(sql`select conname from pg_constraint where conname in ('workouts_pain_check','workouts_effort_check','session_logs_pain_check','session_logs_effort_check') order by 1`);
  expect(checks.rows.map((r) => r.conname)).toStrictEqual(["session_logs_effort_check", "workouts_effort_check"]);
  await expect(db.insert(workouts).values({ userId: u.id, title: "x", type: "AN", difficulty: "hard", effort: 6, source: "user", steps: [] })).rejects.toThrow(/workouts_effort_check/);
});
```

(Use the file's existing `db`, `sql`, user fixture names — the top-level describe migrates the FULL folder in `beforeAll` and creates no user, so this block goes in a NEW describe.) The `article_reads` half uses the file's own truncated-folder pattern (migrations 0008–0021 each have one): migrate a fresh DB up to `0023`, insert a user and a `('pain-scale')` read row, migrate the rest, assert the row now reads `effort-scale` and that a user holding BOTH slugs pre-migration ends with exactly one `effort-scale` row (the `AND NOT EXISTS` guard) and no `pain-scale` row left behind — add a second `DELETE` statement to the migration for that residue if the assertion shows one.

- [ ] **Step 2:** `pnpm test --project integration -- server/db` is the footgun form; run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration server/db/schema.integration.test.ts`. Expected: FAIL (columns still `pain`) — note the migration files are already on disk; the assertion fails only if you run against a DB without 0024. If the harness migrates from the folder, it PASSES immediately; then the red half is Step 1's `effort: 6` rejection message, which pins the constraint NAME.
- [ ] **Step 3:** Rename in `schema.ts`: `pain: integer("pain")` → `effort: integer("effort")` on both tables, both CHECKs to `*_effort_check` over `t.effort`; update the three comments still saying `pain` (lines ~178, ~196-199, ~407-408) to say `effort` and cite 0024. Fix the other integration tests' raw inserts (`pain:` → `effort:`).
- [ ] **Step 4:** `pnpm db:generate < /dev/null` → `No schema changes, nothing to migrate`. Paste that line into the commit message.
- [ ] **Step 5:** Commit: `"Phase DE PR 2 task 1: migration 0024 renames pain → effort (hand-authored; db:generate reports no drift)"`.

### Task 2: Server — stores speak `effort`; route adapters; the log line

**Files:**
- Create: `app/server/routes/effortCompat.ts`, `app/server/routes/effortCompat.test.ts`
- Modify: `app/server/routes/data.ts` (`painError` → import; 9 response sites; 3 write sites), `app/server/stores/workouts.ts`, `app/server/stores/logs.ts` (`LogRow.pain`, `LogPatch.pain`, select map, `set.pain`, `create`), `app/server/testing/fakes.ts`, `app/server/compat/difficulty.ts` (`derivedDifficulty(effort)`), `app/server/seed/seed.ts` (`contentEqual`), `app/server/seed/library/*.ts` (`pain:` → `effort:` in 302 entries; section comments), `app/server/seed/library/library.test.ts`, `app/server/stores/contracts/storeContracts.ts`
- Test: `app/server/routes/data.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // server/routes/effortCompat.ts
  export function effortError(value: unknown): string | null;           // "effort must be an integer 1..5 or null" | null
  export type AdoptResult = { ok: true; sawPainKey: boolean; usedPainKey: boolean } | { ok: false; field: "effort"; error: string };
  export function adoptEffortKey(body: unknown): AdoptResult; // mutates a record body; presence-preserving; non-records pass through
  export function withPainAlias<T extends { effort: number | null }>(row: T): T & { pain: number | null };
  export function notePainWrite(route: string): void;                    // console.info(JSON.stringify({ event: "compat.pain_write", route }))
  ```

- [ ] **Step 1: Unit tests** `effortCompat.test.ts` — ON DISK and green (10/10 after the `/harden` fold: non-record bodies, `pain: undefined`, `sawPainKey` on the agree branch, `effortError(3.0)` is null). The block below is the pre-fold sketch; the file is authoritative.

```ts
import { describe, it, expect, vi } from "vitest";
import { adoptEffortKey, effortError, withPainAlias, notePainWrite } from "./effortCompat.js";

describe("adoptEffortKey (spec §4.3: presence-preserving, effort wins, disagreement is 400)", () => {
  it("leaves a body with neither key untouched — no effort key is created", () => {
    const body: Record<string, unknown> = { held: "held" };
    expect(adoptEffortKey(body)).toStrictEqual({ ok: true, usedPainKey: false });
    expect("effort" in body).toBe(false);
    expect("pain" in body).toBe(false);
  });
  it("copies a pain key to effort when effort is absent, including an explicit null (a clear)", () => {
    const b1: Record<string, unknown> = { pain: 3 };
    expect(adoptEffortKey(b1)).toStrictEqual({ ok: true, usedPainKey: true });
    expect(b1.effort).toBe(3);
    const b2: Record<string, unknown> = { pain: null };
    expect(adoptEffortKey(b2)).toStrictEqual({ ok: true, usedPainKey: true });
    expect("effort" in b2 && b2.effort === null).toBe(true);
  });
  it("effort wins when both are present and agree, and when pain is null", () => {
    const b1: Record<string, unknown> = { pain: 3, effort: 3 };
    expect(adoptEffortKey(b1).ok).toBe(true);
    expect(b1.effort).toBe(3);
    const b2: Record<string, unknown> = { pain: null, effort: 4 };
    expect(adoptEffortKey(b2).ok).toBe(true);
    expect(b2.effort).toBe(4);
  });
  it("pain wins when effort is null beside a non-null pain (null is 'no answer', not a disagreement)", () => {
    const b: Record<string, unknown> = { pain: 3, effort: null };
    expect(adoptEffortKey(b)).toStrictEqual({ ok: true, usedPainKey: true });
    expect(b.effort).toBe(3);
  });
  it("rejects two non-null values that disagree, naming effort", () => {
    const b: Record<string, unknown> = { pain: 2, effort: 4 };
    expect(adoptEffortKey(b)).toStrictEqual({ ok: false, field: "effort", error: "pain and effort disagree; send one" });
  });
  it("does not validate the value — that is effortError's job", () => {
    const b: Record<string, unknown> = { pain: "3" };
    expect(adoptEffortKey(b).ok).toBe(true);
    expect(b.effort).toBe("3");
    expect(effortError("3")).toBe("effort must be an integer 1..5 or null");
    expect(effortError(0)).toBe("effort must be an integer 1..5 or null");
    expect(effortError(null)).toBeNull();
    expect(effortError(undefined)).toBeNull();
    expect(effortError(5)).toBeNull();
  });
});

describe("withPainAlias", () => {
  it("adds pain equal to effort and keeps everything else", () => {
    expect(withPainAlias({ id: "a", effort: 3 })).toStrictEqual({ id: "a", effort: 3, pain: 3 });
    expect(withPainAlias({ id: "b", effort: null })).toStrictEqual({ id: "b", effort: null, pain: null });
  });
});

describe("notePainWrite", () => {
  it("emits one structured console.info line naming the route", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    notePainWrite("PATCH /api/logs/:id");
    expect(spy).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: "compat.pain_write", route: "PATCH /api/logs/:id" }));
    spy.mockRestore();
  });
});
```

- [ ] **Step 2:** Run it → FAIL (module missing).
- [ ] **Step 3: Implement `effortCompat.ts`:**

```ts
// Phase DE PR 2 (spec §4.3). The store speaks `effort`. For one tag cycle the
// API also speaks `pain`, because installed pre-PR-2 builds send and read it.
// Both adapters live here so Phase DE PR 3 deletes this file and its call
// sites and nothing else. `PATCH /api/logs/:id` decides what to touch by KEY
// PRESENCE ("pain" in body): absent = leave alone, present-null = clear — so
// adoptEffortKey never creates a key the caller did not send, and never
// assigns `undefined`.
export function effortError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) return null;
  return "effort must be an integer 1..5 or null";
}

export type AdoptResult =
  | { ok: true; usedPainKey: boolean }
  | { ok: false; field: "effort"; error: string };

export function adoptEffortKey(body: Record<string, unknown>): AdoptResult {
  const hasPain = "pain" in body;
  const hasEffort = "effort" in body;
  if (!hasPain) return { ok: true, usedPainKey: false };
  if (!hasEffort) {
    body.effort = body.pain;
    return { ok: true, usedPainKey: true };
  }
  const pain = body.pain;
  const effort = body.effort;
  if (effort === null || effort === undefined) {
    if (pain !== null && pain !== undefined) {
      body.effort = pain;
      return { ok: true, usedPainKey: true };
    }
    return { ok: true, usedPainKey: false };
  }
  if (pain !== null && pain !== undefined && pain !== effort) {
    return { ok: false, field: "effort", error: "pain and effort disagree; send one" };
  }
  return { ok: true, usedPainKey: false };
}

export function withPainAlias<T extends { effort: number | null }>(row: T): T & { pain: number | null } {
  return { ...row, pain: row.effort };
}

// PR 3's trigger (spec §5): zero of these over a container lifetime ≥ 7 days.
export function notePainWrite(route: string): void {
  console.info(JSON.stringify({ event: "compat.pain_write", route }));
}
```

- [ ] **Step 4:** Already committed with the plan (`d0053846`) and revised in the fold commit.
- [ ] **Step 5: Failing route tests** in `data.test.ts` (copy the file's `asA(request(app))` idiom):

```ts
describe("Phase DE PR 2 dual-field compat (spec §4.3)", () => {
  it("serves both pain and effort on every workout and log response", async () => {
    const app = appFor(makeStores());
    const created = await asA(request(app).post("/api/workouts")).send(validWorkoutBody({ effort: 4 }));
    expect(created.body).toMatchObject({ effort: 4, pain: 4 });
    const list = await asA(request(app).get("/api/workouts"));
    expect(list.body[0]).toMatchObject({ effort: 4, pain: 4 });
    const one = await asA(request(app).get(`/api/workouts/${created.body.id}`));
    expect(one.body).toMatchObject({ effort: 4, pain: 4 });
    const bulk = await asA(request(app).post("/api/workouts/bulk")).send({ text: "Bulk Both | AN | 2\nw 10' 6k+4 @20" });
    expect(bulk.body.created[0]).toMatchObject({ effort: 2, pain: 2 });
    const log = await asA(request(app).post("/api/logs")).send({ ...validLogBody(), effort: 3 });
    const logs = await asA(request(app).get("/api/logs"));
    expect(logs.body[0]).toMatchObject({ effort: 3, pain: 3 });
    const detail = await asA(request(app).get(`/api/logs/${log.body.id}`));
    expect(detail.body).toMatchObject({ effort: 3, pain: 3 });
    const put = await asA(request(app).put(`/api/workouts/${created.body.id}`)).send(validWorkoutBody({ effort: 1 }));
    expect(put.body).toMatchObject({ effort: 1, pain: 1 });
    const patched = await asA(request(app).patch(`/api/logs/${log.body.id}`)).send({ effort: 5 });
    expect(patched.body).toMatchObject({ effort: 5, pain: 5 });
    // The PATCH route's OTHER exit: an empty patch returns the row unchanged — aliased too.
    const noop = await asA(request(app).patch(`/api/logs/${log.body.id}`)).send({ unknownKey: 1 });
    expect(noop.body).toMatchObject({ effort: 5, pain: 5 });
  });
  it("a non-object body on POST/PUT /api/workouts is still a 400, not a 500", async () => {
    const app = appFor(makeStores());
    const res = await asA(request(app).post("/api/workouts")).set("content-type", "text/plain").send("pain");
    expect(res.status).toBe(400);
  });
  it("accepts an old client's pain on create and PATCH, stores it as effort, and logs compat.pain_write once per write", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const app = appFor(makeStores());
    const w = await asA(request(app).post("/api/workouts")).send({ ...validWorkoutBody(), effort: undefined, pain: 2 });
    expect(w.status).toBe(201);
    expect(w.body.effort).toBe(2);
    const log = await asA(request(app).post("/api/logs")).send({ ...validLogBody(), pain: 3 });
    expect(log.status).toBe(201);
    const p = await asA(request(app).patch(`/api/logs/${log.body.id}`)).send({ pain: 4 });
    expect(p.body.effort).toBe(4);
    // Agreeing keys still CARRY the old key: counted (sawPainKey), value not used.
    await asA(request(app).patch(`/api/logs/${log.body.id}`)).send({ pain: 4, effort: 4 });
    expect(spy.mock.calls.filter((c) => String(c[0]).includes("compat.pain_write"))).toHaveLength(4);
    spy.mockRestore();
  });
  it("a PATCH carrying neither key leaves effort untouched (presence contract)", async () => {
    const app = appFor(makeStores());
    const log = await asA(request(app).post("/api/logs")).send({ ...validLogBody(), effort: 3 });
    const p = await asA(request(app).patch(`/api/logs/${log.body.id}`)).send({ held: "held" });
    expect(p.body).toMatchObject({ effort: 3, pain: 3 });
  });
  it("article reads: an old client's pain-scale is served, marked and unmarked as effort-scale", async () => {
    const app = appFor(makeStores());
    await asA(request(app).post("/api/article-reads/pain-scale"));
    const list = await asA(request(app).get("/api/article-reads"));
    expect(list.body.slugs).toEqual(expect.arrayContaining(["effort-scale", "pain-scale"]));
    await asA(request(app).delete("/api/article-reads/pain-scale"));
    const after = await asA(request(app).get("/api/article-reads"));
    expect(after.body.slugs).not.toContain("effort-scale");
  });
  it("400s when pain and effort are both non-null and disagree, naming effort; pain-keyed validation errors still name pain", async () => {
    const app = appFor(makeStores());
    const log = await asA(request(app).post("/api/logs")).send({ ...validLogBody(), effort: 3 });
    const bad = await asA(request(app).patch(`/api/logs/${log.body.id}`)).send({ pain: 2, effort: 4 });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("effort");
    const badOld = await asA(request(app).patch(`/api/logs/${log.body.id}`)).send({ pain: 9 });
    expect(badOld.status).toBe(400);
    expect(badOld.body).toStrictEqual({ error: "pain must be an integer 1..5 or null", field: "pain" });
  });
});
```

(`validLogBody` — use whatever the file's existing log fixture builder is called; the two `GET /api/logs/:id`/`PATCH` shapes exist today.)

- [ ] **Step 6:** Run → FAIL. Implement: rename `pain` → `effort` in `stores/logs.ts` (`LogRow`, `LogPatch`, select map, `set.effort`, `create`), `stores/workouts.ts` (`derivedDifficulty(input.effort)`), `fakes.ts`, `compat/difficulty.ts` (`derivedDifficulty(effort: number)`), `seed.ts` (`row.effort === w.effort`), seed files (`sed -i '' 's/^\(\s*\)pain: \([1-5]\),$/\1effort: \2,/'` on the five, then grep-check 0 `pain:`), `library.test.ts` (`w.effort`, `PAIN_BY_TYPE` → `EFFORT_BY_TYPE`, titles), `storeContracts.ts`. In `data.ts`: import the four helpers; delete `painError`; at each write site call `adoptEffortKey(req.body)` FIRST (it tolerates a non-record; the workouts POST/PUT have no `body` local and must keep handing `req.body` to `validateWorkoutInput` unchanged) — `POST /api/workouts`, `PUT /api/workouts/:id`, `POST /api/logs`, `PATCH /api/logs/:id`; NOT `/bulk` (its body is text; the header parser owns the word). Return `badRequest(res, r.error, r.field)` on `ok: false`; call `notePainWrite("<METHOD> <route>")` when `sawPainKey`; on the LOG routes validate with `effortError`, and when `usedPainKey` report `msg.replace(/^effort/, "pain")` under `field: "pain"`. Wrap every site the census command lists (TEN, both PATCH exits) with `withPainAlias`. `POST /api/logs` returns `{ id }` only — no alias needed; say so in a comment. **Article reads (2c):** in the three `/api/article-reads` routes, map an incoming `pain-scale` to `effort-scale` before the store call and, on GET, append `pain-scale` to the list when `effort-scale` is present — one `LEGACY_READ_SLUGS` const in `effortCompat.ts`, deleted by PR 3.
- [ ] **Step 7:** `pnpm typecheck` (server) and the server unit project green. Commit: `"Phase DE PR 2 task 2b: stores and seed speak effort; routes serve pain+effort and accept either; compat.pain_write logged"`.
- [ ] **Step 8: Mutation probes (after commit):** (a) delete the `withPainAlias` at ONE site — the PATCH no-op read — → the dual-field test's `noop` assertion fails; (b) in `adoptEffortKey` replace the `!sawPainKey` early return with `body.effort = body.pain ?? body.effort` (the natural bug) → the "neither key" unit test fails (`"effort" in body` true); (c) remove the `isRecord` guard → the text/plain route test 500s. Record all three; revert with `git checkout`.

### Task 3: Domain — `WorkoutInput.effort`, `effortLevels`, `PaceWord*` family

**Files:** `domain/types.ts`, `validate.ts`, `bulk.ts`, `suggest.ts`, `pace.ts`, `expand.ts`, `generation/archetype.ts`, `display/stepDetail.ts`, `needsBaselines.ts`, `monitor/program.ts`; their tests.

- [ ] **Step 1:** Rename the figure: `WorkoutInput.pain` → `effort`; `validate.ts` message `"effort must be 1..5"`; `bulk.ts` `HeaderFields` `effort`, `parseHeader` returns `{ title, type, effort }`; `suggest.ts` `LibraryEntry.effort`, `SuggestPrefs.effortLevels`, reason part `"effort"` (was `"pain"`). Tests: `painLevels` → `effortLevels`, `pain:` → `effort:`, reason strings `"Nothing fit your time/effort filters"`.
- [ ] **Step 2: Pace-word family, TS only.** Apply this exact map with `sed`-free, IDE-safe edits (each is an identifier; grep the count before and after):

  | From | To | Note |
  | --- | --- | --- |
  | `Effort` (type) | `PaceWord` | `types.ts` |
  | `EffortRef` | `PaceWordRef` | property `effort` UNCHANGED — stored key; comment on the interface |
  | `isEffortRef` | `isPaceWordRef` | |
  | `effortWord` | `paceWordLabel` | returns `"ALL OUT" \| "EASY"` |
  | `effortFromWord` | `paceWordFromLabel` | |
  | `effortSpoken` | `paceWordSpoken` | |
  | `isEffort` (locals, `logDraft.ts`) | `isPaceWord` | |
  | `effortText` | `paceWordText` | |
  | `effortKey` | `paceWordKey` | |
  | `effortShare` (function, `archetype.ts`) | `paceWordShare` | the `patterns.json` KEY `effortShare` stays; the code reading it says so |
  | `effortCount`, `effortBucket`, `effortMatch` | `paceWordCount`, `paceWordBucket`, `paceWordMatch` | |
  | `isValidEffort` | `isValidPaceWord` | |
  | `PaceRefInput.tsx` chip `kind: "effort"` | `kind: "word"` | module-local `CHIPS` discriminant, not persisted (lens 1 verified) |
  | `refEffort` (BuilderRow field) | UNCHANGED | persisted in the builder draft + fingerprint; comment |
  | `targetKind: "effort"` | UNCHANGED | runtime discriminant; comment on `EnginePhase.targetKind` |

- [ ] **Step 3:** `pnpm typecheck && pnpm lint`; unit project green. Commit: `"Phase DE PR 2 task 3: domain says effort for the figure and PaceWord* for the pace word; stored keys untouched"`.

### Task 4: Client — every label, type, key; three parsers fall back; `EffortBar`

**Word list (Gate 0, copy only — approved with the spec):**

| Where | Before | After |
| --- | --- | --- |
| Filter sheets, both | `PAIN` | `EFFORT` |
| Today card | `PAIN n/5` | `EFFORT n/5` |
| Stored summary line | `HELD · PAIN 3/5 · LIKED` | `HELD · EFFORT 3/5 · LIKED` |
| `LogRow`, `WorkoutDetail`, `PostWorkoutSummary`, `LogSession`, `TimerRuler`, `JustRowLog` | `PAIN n/5`, `Pain n` aria | `EFFORT n/5`, `Effort n` |
| Classification card | `EXPECTED PAIN` | `EXPECTED EFFORT` |
| Filter tokens | `PAIN 1–3` | `EFFORT 1–3` |
| `EffortBar` aria | `pain n of 5` | `effort n of 5` |
| Article | "The pain scale, without a heart rate monitor", `/news/pain-scale` | "The effort scale, without a heart rate monitor", `/news/effort-scale` |
| Picking-a-workout link | "pain from 1 to 5" | "effort from 1 to 5" |
| Bulk help | unchanged from PR 1 | |

- [ ] **Step 1: Failing parser tests** (one per file, RF21-shaped — the reviewer's PR 1 lesson):

```ts
// todayFilters.test.ts
it("reads a pre-PR-2 set's painLevels as effortLevels when effortLevels is absent, and writes only effortLevels", () => {
  localStorage.setItem(TODAY_FILTERS_KEY, JSON.stringify({ v: 2, byKey: { AT: { ...AT_SET_WITHOUT_EFFORT, painLevels: [2, 4] } } }));
  const store = loadTodayFilters();
  expect(store.byKey.AT?.effortLevels).toStrictEqual([2, 4]);
  saveTodayFilters(store);
  expect(JSON.parse(localStorage.getItem(TODAY_FILTERS_KEY)!).byKey.AT).not.toHaveProperty("painLevels");
});
it("prefers effortLevels when both keys are present; a malformed effortLevels fails the set even with a valid painLevels beside it", () => { /* effortLevels: [1], painLevels: [5] → [1]; effortLevels: "x", painLevels: [5] → set undefined */ });
// libraryFilters.test.ts: NO fallback (sessionStorage) — a record with painLevels and no effortLevels is a wrong shape → EMPTY_FILTERS + scroll cleared; effortLevels: null → EMPTY_FILTERS
// builderDraft.test.ts: an EDIT-mode draft with form.pain: 3 and baseline.pain: 3 (no effort keys) loads with both halves' effort === 3 and no pain keys; a draft with both keys prefers effort; a NEW-mode draft with pain: null restores effort: null
```

- [ ] **Step 2:** Implement. **Today (`todayFilters.ts`, localStorage):** `const levels = o.effortLevels !== undefined ? o.effortLevels : o.painLevels;` then the existing array check on `levels` — so `effortLevels: null` is PRESENT and MALFORMED (that set fails, as any malformed field fails today), `effortLevels` absent falls back, both absent fails as today; write only `effortLevels`. Add `null` to the malformed table. **Library (`libraryFilters.ts`) gets NO fallback:** it is sessionStorage (`libraryFilters.ts:6`), whose lifetime ends at app relaunch, so no native pre-PR-2 record can reach the new bundle; the only producer would be a same-session bundle swap on web, and `loadLibraryFilters` already falls back to `EMPTY_FILTERS` whole on any unknown shape. Rename the key, keep the strictness, state this in the parser comment (spec §4.2's table is corrected in Task 7). **Builder draft (`builderDraft.ts`, localStorage):** `loadBuilderDraft` currently returns the parsed record from a loose guard with no reconstruction — add one: after the guard, for BOTH `form` and `baseline` (edit-mode drafts carry a baseline that `Builder.tsx` fingerprints against a fresh `fromWorkout`; a missing `effort` there stringifies as `null` and silently DISCARDS the draft), `effort = "effort" in f ? f.effort : (f.pain ?? null)`, then delete `pain`. Test the EDIT-MODE case with `pain: 3` on both halves and assert the restored draft's baseline fingerprint equals `formFingerprint(fromWorkout(workoutWithEffort3))`; mutation: drop the baseline half → that assertion fails.
- [ ] **Step 3: Rename sweep.** `PainBar.tsx` → `EffortBar.tsx` (`git mv`), component `EffortBar`, props `effort`, classes `.effort-bar`, `.effort-bar-segment`, token `--effort-empty` (tokens.css + `tokens.test.ts` census); `todayFilterTokens.ts`/`filterTokens.ts` `collapseEffort` → `EFFORT n`; `TokenKind "pain"` → `"effort"`, Today reset group `"pain"` → `"effort"`; sheets `label="EFFORT"`; `ClassificationCard` `EXPECTED EFFORT`, aria `Effort n`, `.classification-chip-effort`; `Builder.tsx` body `effort: form.effort`; `builderState.ts` `BuilderForm.effort`, `fromWorkout`; `useWorkouts.ts` `LibraryWorkout.effort`; `useRecentLogs.ts` `effort`; `FromTheLog.tsx` `edit.effort`/`patch.effort`; `LogSession.tsx` `effort` state + wire key; `PostWorkoutSummary`, `JustRowLog`, `LogRow` ("EFFORT n/5"), `storedSummary.ts`, `WorkoutDetail`, `Today.tsx` (`EFFORT {n}/5`, `effortLevels`), `TimerRuler`, `summaryModel.ts`, `traceModel.ts`/`TraceChart.tsx` (read comments; rename only the figure, not the pace word), `typeWords.ts`, `CellGrid.tsx`/`IntervalSegments.tsx`/`DurationInput.tsx`/`PaceRefInput.tsx` (pace-word family only — Task 3's map), `useMonitorSession.ts` (comments), `library-moves.ts`. Every test fixture `pain:` → `effort:`; every `"Pain n"` selector → `"Effort n"`; every `PAIN` text assertion → `EFFORT`.
- [ ] **Step 4: Article.** `bodies/painScale.tsx` → `effortScale.tsx`, `EffortScaleBody`; `articles.tsx` slug `"effort-scale"`, title `"The effort scale, without a heart rate monitor"`; add and export `LEGACY_ARTICLE_SLUGS: Record<string, string> = { "pain-scale": "effort-scale" }`; in `Reader.tsx`: `const canonical = slug ? LEGACY_ARTICLE_SLUGS[slug] ?? slug : undefined;` and `<Navigate replace to={`/news/${canonical}`} />` when `canonical !== slug`; `pickingAWorkout.tsx` link `to="/news/effort-scale"` text "effort from 1 to 5". Rewrite the boundary paragraph:

  > This scale is effort, not injury. Everything below describes the discomfort a hard row is supposed to produce, and it fades within the session or by the next day. Sharp, sudden, or joint-specific pain (a rib, a wrist, your lower back on the drive) is a different signal entirely: stop, and let it settle before you row again.

  `article` stays computed from the RAW `slug` (rules-of-hooks; `articleBySlug("pain-scale")` is now `undefined`), so the mark-read effect can never fire for the old slug. Tests: `articles.test.tsx` slugs; `bodies.test.tsx` href; `Reader.test.tsx`: `/news/pain-scale` renders the effort-scale article AND `markRead` is called with `"effort-scale"`, never `"pain-scale"`.
- [ ] **Step 5:** `pnpm typecheck && pnpm lint && pnpm lint:prune`; `pnpm test --project client` and `--project unit` green. Commit: `"Phase DE PR 2 task 4: the client says EFFORT everywhere; three localStorage parsers fall back from pain*; article moves to effort-scale with the old slug redirecting"`.
- [ ] **Step 6: Mutation probes (after commit):** in each parser, drop the `?? o.painLevels` fallback → the fallback test fails; in `Reader.tsx` drop the alias → the redirect test fails. Record, revert.

### Task 5: e2e and screenshots

- [ ] Sweep `e2e/*.ts`: `"PAIN"` group → `"EFFORT"`, `Pain n` → `Effort n`, tokens `PAIN n` → `EFFORT n`, fixtures `pain:` → `effort:`, `/news/pain-scale` → `/news/effort-scale` (plus ONE new e2e: visiting `/news/pain-scale` lands on the effort-scale article — the redirect is a real route). `helpers.ts` comment. `pnpm e2e` green (read BOTH summary lines). `pnpm screenshots` — both filter sheets and any capture showing the word change; open and LOOK (RF7). Commit.

### Task 6: Content, skills, DEVIATIONS, tooling

- [ ] `.claude/skills/wod-import/SKILL.md` "pain-scale article (`painScale.tsx`)" → "effort-scale article (`effortScale.tsx`)"; `hardware-walk/SKILL.md` legacy-form sentence unchanged (it names the OLD form on purpose). `docs/design/DEVIATIONS.md`: the "Pain 1–10" and "`PAIN ≤5` library filter chip" rows' second/third columns say EFFORT (current state) and cite Phase DE PR 2; `scripts/library-moves.ts` column `effort`. Commit.

### Task 7: RELEASING floor row, ROADMAP, spec §4.5

- [ ] `docs/RELEASING.md` § Rollback constraints — new row: `| the tag carrying migration 0024 (workouts.pain → effort, session_logs.pain → effort, article_reads slug; Phase DE PR 2) | One-way RENAME. A pre-0024 image selects a column named pain and 500s every workout and log read; deploy.sh's health-gated auto-rollback would restore exactly that image after the migration has run. FORWARD-FIX ONLY: fix and redeploy, or reverse the four RENAMEs and the article_reads slug UPDATE by hand in psql before rolling back. |`
- [ ] `ROADMAP.md`: PR 2 row ticked with `(#NNN)` once the PR exists; DELETE "Does not open until AUD-016's PR … has merged" (AUD-016 was struck 2026-08-31 in #240 — the aud016 worktree is a stale pre-#239 spec branch, PM misread; recorded in the PR body); status line updated. Spec §4.5: replace the AUD-016 paragraph with one sentence saying the same. Spec §4.2's localStorage table: the Library row becomes "sessionStorage — no fallback (no native producer)"; §4.3 gains the article-reads alias and the TEN-site census.
- [ ] Commit.

### Task 8: Gates, bundle probe, stale-build check

- [ ] `pnpm build && pnpm dist:grep`. Bundle probes: client `grep -rhoE '\bPAIN\b' dist/client/assets | wc -l` → 0; `EFFORT` > 0; `"pain"` (JSON key) → 0 in client; server `compat.pain_write` = 1, `withPainAlias` ≥ 1 (the compat is server-only, by design).
- [ ] `pnpm test:coverage` exit 0; per-file lines for `effortCompat.ts` (100%), `data.ts`, the three parsers, `Reader.tsx`, `EffortBar.tsx`. `pnpm test --project integration` green.
- [ ] **Stale-build check (spec §6.3), by hand:** `git worktree add /tmp/v0381 v0.38.1` (a THROWAWAY checkout), `pnpm install && pnpm build` there, serve `dist/client` with the worktree's compose stack's API (or `pnpm dev:server` from THIS branch with `DATABASE_URL` pointing at the e2e Postgres) — load Library, Today, Log; save a log with `pain: 3` from the old UI; `curl` the log detail from the new API and confirm `{ pain: 3, effort: 3 }`; confirm the old Library renders (rows show `PAIN n/5`, not blank) and a workout it creates carries a derived `difficulty`. Paste the commands and output into the PR body. Remove the throwaway worktree.
- [ ] Finishing greps (Global Constraints) pasted. Commit.

### Task 9: PR, review half

- [ ] Open the PR (human-first body ≤120 words / ≤25 per bullet; line one: "This PR renames PAIN to EFFORT everywhere…"; the one-tag line; the Record block with: migration provenance (the TTY error text; `No schema changes`), the nine alias sites and three adopt sites by line at the PR's base, both finishing greps, every mutation and its failure text, the stale-build transcript, the RELEASING row, the AUD-016 correction).
- [ ] Dispatch: `/harden` was run on THIS PLAN before Task 1 (lens 1 = antagonist delta on dual-field / rollback / provenance; lens 2 = the prescribed blocks); then the whole-branch review + PM final gate (TRIAD). Present verdicts; STOP — James merges. Tag follows the merge (both PRs ride it) with rower-words notes per spec §6.6.

---

## Self-review (author, 2026-09-05)

- **Spec coverage:** §4.1 invariant → Tasks 3-5 + Task 8's greps; §4.2 migration → Task 1 (authored, `No schema changes` measured), rollback row → Task 7, localStorage table → Task 4 steps 1-2; §4.3 dual-field → Task 2 (adapters, nine sites, three write sites, presence contract, disagreement rule, `compat.pain_write`); §4.4 word list + `PaceWord*` family + article → Tasks 3-4; §4.5 sequencing → Task 7 (AUD-016 condition retired with the reason); §6.3 stale-build → Task 8.
- **Frozen keys enumerated:** `ref.effort`, `refEffort`, `patterns.json:effortShare`, `targetKind: "effort"` — each with a comment task; `PaceRefInput`'s `kind` is renamed, not frozen.
- **`/harden` run (2026-09-05, both lenses, folded in this revision):** lens 1 falsified the "schema.ts already renamed" claim, the builder-draft fallback's home and its null-only test, the unguarded `req.body` at the workouts routes, the `sort -u` grep, the Library storage medium, the trigger's agree-branch hole, and the one-sided article-read compat; lens 2 added the non-object 400→500, the two unexercised alias sites, the truncated-folder migration test, `effortLevels: null`, the workouts error wording, and the Reader mark-read guard. One ledger entry landed.
- **Placeholders:** the parser tests in Task 4 step 1 are sketched for two of three files (`/* … */`) — the implementer writes them from the Today example, which is complete; `validLogBody` is named as "the file's existing log fixture builder" because its name must be read from `data.test.ts`.
- **Type consistency:** `adoptEffortKey`/`withPainAlias`/`effortError`/`notePainWrite` signatures match between the Interfaces block, the code block and the route steps; `effortLevels` is the one client key name across Today, Library and suggest.
