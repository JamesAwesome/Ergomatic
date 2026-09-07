# Phase RW PR C — The stored skip: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower can leave the three baseline doors without setting one ("Row without one for now"), Today shows the ordinary suggestion instead, and one quiet row keeps the doors a tap away until a baseline exists. The choice survives a reinstall.

**Architecture:** One new boolean on `preferences`, `baselines_skipped`, migration `0026`, served additively by `GET`/`PUT /api/prefs`. The doors card renders iff `baselines === null && !baselinesSkipped`. Two writes: the card's skip line sets it true, Today's return row sets it false; `DELETE /api/baselines` clears it server-side so a reset rower meets the doors again. No domain change, no new screen, no route.

**Tech Stack:** TypeScript, React 19, Drizzle + Postgres, Vitest (`unit`, `client`, `integration` — the last needs Docker), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-row-without-baselines-design.md` §3 (all of it, including the §3.2 lifetime table), §2.1 (the detail caption's link — see the third writer below), §2.5 (Today's two states), §6 (PR C's scope and the migration collision). Gate 0 approved 2026-09-07 (`docs/design/rw-gate0/today-doors.png`, `today-skipped.png`, both orientations).

**Antagonist delta pass RUN 2026-09-07: 2 blocking, 4 substantive, 3 held.** Every finding is folded below and marked `(delta …)`. The held claims: the flag is per-user by construction (`preferences.userId` is the PK, no localStorage on the path), two devices cannot reach a state neither can leave (a boolean, last-write-wins, no compound state), the reset's no-flash claim holds at the ROUTER (`shell/AppRoutes.tsx` is a plain `<Routes>`, so leaving the reset screen unmounts it and remounts Today), and "becomes irrelevant, never cleared" is safe because `stores.baselines.clear` has exactly ONE production caller (`grep -rn "stores.baselines" app/server/`).

## Global Constraints

- **TRIAD (stored shape).** This plan gets an antagonist delta pass before Task 1, a PM final gate on the PR, and the full review. Say the antagonist verdict in the PR body.
- **Migration collision, live — and the mechanism is NOT the index (delta T4).** `drizzle-orm`'s migrator selects the newest applied row and applies every journal entry whose `when` (`folderMillis`) is strictly greater; the `0026` filename plays no part. The hazard is GENERATION TIME vs MERGE ORDER: a migration generated before the newest already-applied one is skipped **with no error and no log line**. RW C generates on 2026-09-07; if Phase DE PR 3's 2026-09-12 migration lands first and RW C merges without regenerating, RW C's `ADD COLUMN` never runs — and because `db.select().from(preferences)` selects every declared column, GET and PUT `/api/prefs` then 500 for every rower, which is "Couldn't load your preferences" on Today.
  **No gate in this repo can see it:** every integration suite starts a fresh `PostgreSqlContainer` where nothing is applied yet, so `when` never excludes anything; deploy's health check is a DB ping that reads no schema. **The two sides are asymmetric:** RW C is an ADD (fatal if skipped), DE PR 3's DROP is benign if skipped. So the owner check is explicit and belongs in Task 4: after PR C merges and deploys, `curl` the deployed `/api/prefs` and confirm `baselinesSkipped` is in the response body. That is the only instrument that exists.
- **Additive API only between tags, and the claim is DIRECTIONAL (delta T3).** Old client → new server holds: `PUT /api/prefs` builds its patch only from validated present keys and `preferences.ts`'s `put` does `onConflictDoUpdate({ set: patch })`, so an absent key never enters the SET clause (already contract-tested for the generic case). New client → OLD server does NOT hold, and a rollback to `$PREV` (`scripts/deploy.sh`) makes that a supported state: the route silently ignores an unrecognised key and its empty-patch guard then returns **200 with the current row**, so `res.ok` is true for a write that stored nothing. **The writer therefore branches on the RETURNED VALUE, not on `res.ok`** — compare the response row's `baselinesSkipped` against what was sent and treat absent-or-mismatched as failure (RF25's instruction, made able to see the failure it exists for).
- **No em-dashes in user-facing strings.** Copy is Gate 0's, verbatim: the skip line reads `Row without one for now`; the return row reads `NO BASELINE SET` with a `Set one up` control beside it; the caption reads `~ times are estimates until you set a baseline`.
- Tests pin independent literals (RF21); every new assertion has a stated mutation; **confirm each commit LANDED (`git log -1`) before running a probe** (CLAUDE.md RF22), and **a probe against the compose stack must COMPILE** — a failed `docker compose up --build` leaves the old bundle serving and the probe proves nothing (PR B, measured).
- `git rev-parse --show-toplevel` before every commit; it must print `/Users/james/projects/github/jamesawesome/Ergomatic-wt-rw`.
- Single-file runs: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project <unit|client> <file>` from `app/`. Integration tests need Docker: `pnpm test --project integration`.

## The lifetime table (spec §3.2, restated here because this plan is what implements it)

| | |
|---|---|
| **What it is** | One boolean per user: "this rower chose to go on without a baseline." |
| **Mint** | `PUT /api/prefs {baselinesSkipped: true}`, from the doors card's skip line. There is no other writer of `true`. |
| **Clear** | (a) `PUT /api/prefs {baselinesSkipped: false}`, from Today's return row; (b) the SAME write from the workout detail's caption link (delta T5 — spec §2.1 promises "the link clears the flag on tap" and §3.3's list omitted it; without this a skipped rower taps "Set one up" on the detail screen and is shown a second "Set one up" on Today); (c) `DELETE /api/baselines` (the You reset row) clears it server-side, so a rower who resets meets the doors again. |
| **Survives** | Reinstall, sign-out, relaunch, a second device (it is server state, not localStorage). |
| **Becomes irrelevant, never cleared** | A full baseline pair being set: the card's condition is `baselines === null && !skipped`, so the flag stops mattering without being touched. |
| **A PARTIAL pair** | Still `baselines === null` (every screen collapses a half pair to null), so the flag still decides. This is the one state the phase creates and it is deliberate: a rower who skipped, then rowed the 2K test and accepted, has k2 only, still sees the suggestion, and the return row is still there. |
| **Invariant** | The doors card renders **iff** `baselines === null && !baselinesSkipped`. Nothing else reads the flag. |

---

### Task 1: The column, the store, the route

**Files:**
- Modify: `app/server/db/schema.ts` (after `startHereDismissed`, ~line 464)
- Create: `app/drizzle/0026_*.sql` (generated, not hand-written)
- Modify: `app/server/stores/preferences.ts` (`PreferencesRow`, `PREFERENCES_DEFAULTS`, the `get` mapping)
- Modify: `app/server/routes/data.ts` (`PUT /api/prefs` validation, ~line 2201; `DELETE /api/baselines`, ~line 1151)
- Test: `app/server/routes/data.test.ts` — the prefs ROUTE tests live here, in the **unit** project on `makeFakeStores` (delta T6: `data.integration.test.ts` does not exist, and the plan's original grep would have run zero of these).
- Test: `app/server/routes/baselineReset.integration.test.ts` — the DELETE-clears-the-skip case belongs here; it already boots a real Postgres container and already imports `createPreferencesStore`.
- Test: `app/server/stores/stores.integration.test.ts:471-477` (the defaults assertion, a literal object). **Not** `storeContracts.ts:211`, which asserts `toStrictEqual(PREFERENCES_DEFAULTS)` — it imports the constant it gates and can never go red on a new field (RF21).

**Interfaces:**
- Produces: `PreferencesRow.baselinesSkipped: boolean`; `GET /api/prefs` returns it; `PUT /api/prefs` accepts it (boolean, else 400 naming the field); `DELETE /api/baselines` clears it.

- [ ] **Step 1: Write the failing integration tests.**

In the prefs route integration file, beside the existing `startHereDismissed` cases:

```ts
it("round-trips baselinesSkipped and defaults it to false (Phase RW PR C)", async () => {
  const before = await get("/api/prefs");
  expect(before.body.baselinesSkipped).toBe(false);

  const put = await put("/api/prefs", { baselinesSkipped: true });
  expect(put.status).toBe(200);
  expect(put.body.baselinesSkipped).toBe(true);
  expect((await get("/api/prefs")).body.baselinesSkipped).toBe(true);

  await put("/api/prefs", { baselinesSkipped: false });
  expect((await get("/api/prefs")).body.baselinesSkipped).toBe(false);
});

it("rejects a non-boolean baselinesSkipped, naming the field", async () => {
  const res = await put("/api/prefs", { baselinesSkipped: "yes" });
  expect(res.status).toBe(400);
  expect(res.body.field).toBe("baselinesSkipped");
});

it("a PUT that omits baselinesSkipped leaves it alone (an older build's write)", async () => {
  await put("/api/prefs", { baselinesSkipped: true });
  await put("/api/prefs", { countdownSeconds: 7 });
  const after = await get("/api/prefs");
  expect(after.body.baselinesSkipped).toBe(true);
  expect(after.body.countdownSeconds).toBe(7);
});

it("DELETE /api/baselines clears the skip so the doors come back", async () => {
  await put("/api/baselines", { k2Seconds: 112, k6Seconds: 122 });
  await put("/api/prefs", { baselinesSkipped: true });
  const del = await del("/api/baselines");
  expect(del.status).toBe(200);
  expect((await get("/api/prefs")).baselinesSkipped ?? (await get("/api/prefs")).body.baselinesSkipped).toBe(false);
});
```
Use the file's own request helpers and their exact shapes (read the top of the file; the `get`/`put`/`del` names above are placeholders for whatever it defines, and the body accessor may be `res.body` or a parsed json — copy the neighbouring `startHereDismissed` test's idiom exactly). Add `baselinesSkipped: false` to `stores.integration.test.ts:477`'s expected defaults object.

- [ ] **Step 2: Run them red.** The route cases: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit server/routes/data.test.ts`. The reset case: `pnpm test --project integration` (needs Docker). Expected: `baselinesSkipped` undefined / no 400 / the DELETE leaves it true. Read BOTH summary lines.

- [ ] **Step 3: Implement.**

`schema.ts`, after `startHereDismissed`:
```ts
  // Phase RW PR C (spec §3): "this rower chose to go on without a
  // baseline." The doors card on Today renders iff the pair is unset AND
  // this is false. Cleared by `DELETE /api/baselines` so a rower who
  // resets meets the doors again; nothing else reads it.
  baselinesSkipped: boolean("baselines_skipped").notNull().default(false),
```
Generate the migration with the repo's own command (read `package.json` for the drizzle-kit script; do NOT hand-write the SQL), then open the generated file and confirm it is exactly one `ADD COLUMN ... NOT NULL DEFAULT false` and that its index is `0026`. `preferences.ts`: add the field to `PreferencesRow`, `PREFERENCES_DEFAULTS` (`false`), and the `get` mapping. `data.ts` `PUT /api/prefs`, beside the `startHereDismissed` block:
```ts
    if (body.baselinesSkipped !== undefined) {
      if (typeof body.baselinesSkipped !== "boolean") {
        badRequest(
          res,
          "baselinesSkipped must be a boolean",
          "baselinesSkipped",
        );
        return;
      }
      patch.baselinesSkipped = body.baselinesSkipped;
    }
```
`DELETE /api/baselines`:
```ts
  router.delete("/api/baselines", async (req, res) => {
    // Phase RW PR C (spec §3.2): clear the skip FIRST, then the pair. Two
    // store calls, not a transaction (they are different stores). If the
    // second fails the rower has a false flag and intact baselines, which
    // renders exactly as before the tap; if the first fails nothing
    // changed. Neither order can strand a rower behind a hidden card with
    // no baselines.
    // On a user with no preferences row this takes the INSERT arm and
    // materialises a defaults row (delta T2). Every value equals its column
    // default, so no read changes; noted because the repo elsewhere asserts
    // that `get()` on an absent row inserts nothing.
    await stores.preferences.put(req.user!.id, { baselinesSkipped: false });
    await stores.baselines.clear(req.user!.id);
    res.json({ k2Seconds: null, k6Seconds: null });
  });
```

- [ ] **Step 4: Run** `pnpm test --project integration`, then `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Commit, then probe.** `git add app/server app/drizzle && git commit -m "Phase RW PR C: preferences.baselines_skipped, served additively; the baselines reset clears it"`. Confirm with `git log -1`, then: delete the `preferences.put` line from the DELETE handler → the reset test fails; change the validation to accept any type → the 400 test fails. Revert each after `git status` shows only that file.

---

### Task 2: The client hook and the two writes

**Files:**
- Modify: `app/src/api/usePreferences.ts` (`PreferencesData`, and a ready-arm `setBaselinesSkipped` + refetch)
- Modify: `app/src/today/DoorsCard.tsx` (the skip line)
- Modify: `app/src/today/Today.tsx` (`needsDoors`, the return row, the caption)
- Modify: `app/src/workout/WorkoutDetail.tsx` (the caption's "Set one up": clear the flag, then navigate — delta T5)
- Modify: `app/src/index.css`
- Test: `app/src/today/DoorsCard.test.tsx`, `app/src/today/Today.test.tsx`, `app/src/api/usePreferences.test.ts` (if it exists; else the hook is covered through Today)

**Interfaces:**
- Consumes: `PreferencesData.baselinesSkipped: boolean` from Task 1's route.
- Produces: `DoorsCard` takes `onSkip: () => void`; Today owns the write and the re-render.

- [ ] **Step 1: Failing tests.**

`DoorsCard.test.tsx`:
```ts
it("offers Row without one for now beneath the three doors and calls onSkip (Phase RW PR C)", async () => {
  const onSkip = vi.fn();
  render(<MemoryRouter><DoorsCard onSkip={onSkip} /></MemoryRouter>);
  const skip = screen.getByRole("button", { name: "Row without one for now" });
  expect(skip).toBeInTheDocument();
  // It sits after all three doors, not among them.
  const doors = screen.getAllByRole("link");
  expect(doors).toHaveLength(3);
  await userEvent.click(skip);
  expect(onSkip).toHaveBeenCalledTimes(1);
});
```
`Today.test.tsx` (mock `usePreferences` the way the file already mocks it; grep `usePreferences` there for the idiom):
```ts
it("shows the doors card when the pair is unset and the rower has not skipped", …)
it("shows the suggestion, the NO BASELINE SET row and the ~ caption once skipped", …)
it("Set one up writes baselinesSkipped:false and the doors come back", …)   // assert the PUT body
it("shows neither the card nor the row once a baseline is set, whatever the flag says", …)
```
Each asserts a rendered consequence, not a call count alone (RF4). **Delta T6 (blocking): the third test must NOT mock `usePreferences`** — `Today.test.tsx:328` mocks it as a constant object with no writer, so no PUT is issued and the return value cannot change between renders, and the test as first written was unwritable. Mock `api` instead and let the real hook run, so the test crosses write → refetch → re-render and can pin the request body.

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement.**
- `usePreferences.ts`: add `baselinesSkipped: boolean` to `PreferencesData`, and put a `setBaselinesSkipped` on the READY arm beside `preferences`, following `src/api/useBaselines.ts`'s own `save` idiom (PUT → check → bump a `generation` so the hook refetches). Delta T7: this hook has had NO writer and no ready-state refetch since 2026-08-23, so there is no other idiom to follow, and a bare module-level function would leave `preferencesState` stale and the doors on screen. **It resolves false on failure, and failure means the response row's `baselinesSkipped` is absent or not what was sent** — not `res.ok` (delta T3). The caller leaves the UI as it was and surfaces an error rather than a silent no-op (RF25).
- **Delta T7, stated so nobody reads a green suite as coverage:** adding a writer to the ready arm breaks every `vi.doMock` of this hook (`Today.test.tsx` ×4, `Countdown.test.tsx`), and Vitest factories are not typechecked against the module, so it surfaces as a runtime TypeError inside one new test, never as a typecheck failure. Equally, a missing `baselinesSkipped` in an existing fixture reads `undefined` → falsy → doors card, so old Today tests keep passing with the flag effectively false.
- `DoorsCard.tsx`: `onSkip` prop; a `<button type="button" className="doorscard-skip">Row without one for now</button>` after the doors div.
- `Today.tsx`: `const needsDoors = baselines === null && !preferences.baselinesSkipped;` and, in the else arm, above the suggestion header, the row + caption from Gate 0's render (`docs/design/rw-gate0/today-skipped.png`).
- `index.css`: `.doorscard-skip` (44px min-height, `--ink-3`, underlined, centred) and `.today-nobaseline-row` / `-line` / `-link`. **The caption reuses `.library-caption`** rather than minting a twin: PR A already shipped that rule at `--ink-3` 13px with the same 6.69:1 recorded in its own comment (delta T5, minor — a second identical rule is RF5 in advance). Rename it if a shared name reads better, but do not duplicate it.
- `WorkoutDetail.tsx`: the caption's "Set one up" becomes a control that clears the flag and then navigates to `/today`, so the rower lands on the doors card rather than on a second "Set one up" (delta T5, blocking). No copy and no layout change: both arrival states are already approved Gate 0 renders (`today-doors.png`, `today-skipped.png`), and this only decides which one you get. Say so in the PR body and let the PM final gate judge whether it needs James's eye.

- [ ] **Step 4: Run** the three test files, `pnpm typecheck`, `pnpm lint`.

- [ ] **Step 5: Commit, then probe:** make `needsDoors` ignore the flag → the skipped-state test fails; make the return row's write send `true` → the "doors come back" test fails.

---

### Task 3: e2e, captures, the article

**Files:**
- Modify: `app/e2e/today.spec.ts` (or wherever Today's onboarding flow is walked — grep `doorscard` under `e2e/`)
- Modify: `app/e2e/screenshots.spec.ts` (`today-onboarding` gains the skip line; add `today-skipped`)
- Modify: `app/e2e/design.spec.ts` (tap targets on the new controls; the caption's token)

- [ ] **Step 1: The e2e walk** (in `e2e/design.spec.ts`, which is where `doorscard` is walked today, not `today.spec.ts`). A fresh account: the doors card is on Today; tap `Row without one for now`; the suggestion appears with the `NO BASELINE SET` row and the caption; **reload the page** and assert the suggestion is still there (this is the half that proves the write is server-side, not component state); tap `Set one up`; the doors return; reload again and they are still there. **This reload is the ONLY oracle for server-side persistence in the whole PR** (delta T6: every client test mocks the hook), so it gets its own stated mutation: make the skip set component state instead of PUTting, and the post-reload assertion must go red. Run it.
- [ ] **Step 1b: The detail-screen leg (delta T5).** Skip, open a pace-bearing workout, tap the caption's "Set one up", and assert Today shows the DOORS card (not the return row) — the flag cleared on the way.
- [ ] **Step 2: The reset leg.** Set a baseline through the API, reset it from You, and assert the doors card is back on Today (the server-side clear from Task 1).
- [ ] **Step 3: Captures.** `pnpm screenshots`; `today-onboarding.png` now shows the skip line (Gate 0: `today-doors.png`), and `today-skipped.png` is new (Gate 0: `today-skipped.png`). Open both and compare against those renders. Revert date-only moves.
- [ ] **Step 4: Commit.**

---

### Task 4: The PR, the gates, the phase close

- [ ] **Step 1: PR.** Body per CLAUDE.md (~120 words above the fold, Record below), the two captures inline, the antagonist delta verdict quoted, the migration-collision note, gates spoken.
- [ ] **Step 2:** Branch review + PM final gate (TRIAD). Present both and stop; no merge without James's word.
- [ ] **Step 2b: After the deploy, run the migration check (delta T4):** `curl` the deployed `/api/prefs` and confirm the response carries `baselinesSkipped`. No gate can catch a skipped migration; this is the instrument.
- [ ] **Step 3: After merge, the phase closes:** the notes PR and ONE tag (the PM's ruling), the ROADMAP ledger row + archive to `docs/history/phase-rw.md`, the six exit criteria checked with their named oracles, the agent-config question answered aloud, and the TestFlight release recommendation.
