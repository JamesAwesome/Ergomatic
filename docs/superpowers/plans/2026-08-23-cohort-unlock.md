# Cohort Unlock (F1+F3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Try again works on the failure screen the walk found it dead on, and a link-lost session's log detail finally says so.

**Architecture:** F1 widens `canRetry` in `ConnectedInterstitial.tsx` to include the `disconnected` phase (the failure JSX's second call site) — the retry path is `session.connect()` after Phase LL's disposal, hardware-proven from that state. F3 threads the already-stored `endedBy` through the sessions GET → client log types → `FromTheLog.tsx`'s detail header as one marked line for `"link-lost"` only.

**Tech Stack:** TypeScript, Vitest (client + integration projects), Express route in `app/server/routes/data.ts`.

**Spec:** `docs/superpowers/specs/2026-08-23-cohort-unlock-design.md` — on conflict with observation, say so in your report.

## Global Constraints

- Worktree `.claude/worktrees/rc-unlock`, branch `rc-unlock`. `git rev-parse --show-toplevel` before every commit. `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` in every shell.
- TDD, failing test first. Gates FOREGROUND. Vitest at PROJECT scope via `pnpm test --project client` / `--project integration` (never `pnpm exec vitest run` with a single file — jsdom escape; and `pnpm exec vitest run --project client` bypasses `NODE_OPTIONS` — use `pnpm test`).
- F3's copy, verbatim: `LINK LOST · the app lost the monitor before the end` — middle dot, no em-dash (house style); renders ONLY for `endedBy === "link-lost"`.
- The server change is an additive RESPONSE field only — no schema change, no migration, no new stored shape. Touching `app/server/` means NOT fast path (this plan runs the full cycle anyway).
- The detail screen's fixture must be a realistic stored record (recurring failure 3), not a minimal stub.

## File map

- Modify: `app/src/workout/ConnectedInterstitial.tsx` (:309 `canRetry`, :451-456 comment) + its test; `app/server/routes/data.ts` (the sessions GET response) + its integration test; `app/src/log/storedSummary.ts` + client log types (locate by grepping the GET consumer — likely `useLogHistory.ts`/`logTypes`) + `app/src/log/FromTheLog.tsx` + tests; `ROADMAP.md` (tick F1 in PROD's list with "fixed, see #PR"; update the Release-posture second arm to discharged-on-merge wording; tick F3's clause 4 branch).

---

### Task 1: F1 — the disconnected branch gets a working Try again

**Files:**
- Modify: `app/src/workout/ConnectedInterstitial.tsx:309` and the `:451-456` comment
- Test: `app/src/workout/ConnectedInterstitial.test.tsx`

**Interfaces:** none new — `canRetry` stays local to the component.

- [ ] **Step 1: Failing tests.** In `ConnectedInterstitial.test.tsx`, find the existing failure-screen tests (grep `Try again`) and their session-stub pattern. Add:

```tsx
it("the walk's dead button: disconnected with no open run renders Try again ENABLED, and a tap reaches connect()", () => {
  // session stub: phase "disconnected", run null, connect: vi.fn()
  // (copy the file's existing stub factory; only phase/run differ)
  // render, find the Try again button:
  // expect(button).toBeEnabled();
  // fireEvent.click(button);
  // expect(session.connect).toHaveBeenCalledTimes(1);
});
it("double-tap still guarded from the disconnected branch", () => {
  // click twice before the connect() promise resolves;
  // expect(session.connect).toHaveBeenCalledTimes(1);
});
```

Follow the file's real stub factory and query idioms — the sketch above names the assertions, the file's own patterns carry the mechanics. Keep the existing failed-phase tests untouched (they pin the first call site).
- [ ] **Step 2: Verify the new tests fail** (`pnpm test --project client`, check "Test Files" count) — the button renders disabled today.
- [ ] **Step 3: Implement** — `const canRetry = session.phase === "failed" || session.phase === "disconnected";` and rewrite the `:451-456` comment: the second call site's disabled button was the 2026-08-23 walk's F1 (a rower with a mid-session BT drop had no working retry), not belt-and-braces; the retry path from `disconnected` is the hardware-proven Cancel→Connect path minus the navigation.
- [ ] **Step 4: Client project green.** Also verify by grep/reading that the `disconnected`-WITH-run case cannot render this JSX (the surface owns it) — if a test pinning that doesn't exist, add one line of assertion to the nearest existing routing test; if it genuinely can render, STOP and report (spec conflict).
- [ ] **Step 5: Commit** `fix: Try again works after a mid-session drop — the walk's dead button`.

### Task 2: F3 — the link-lost line, threaded from the column to the screen

**Files:**
- Modify: `app/server/routes/data.ts` (sessions GET), `app/src/log/storedSummary.ts` + the GET's client-side type home (grep the response consumer), `app/src/log/FromTheLog.tsx`
- Test: `app/server/routes/data.*.test.ts` (integration — find the GET's existing test file), `app/src/log/storedSummary.test.ts`, `app/src/log/FromTheLog.test.tsx`

**Interfaces:**
- Produces: the sessions GET response gains optional `endedBy: "finished" | "rower" | "link-lost" | "program-failed" | "interrupted" | null`; client log shape mirrors it optionally.

- [ ] **Step 1: Failing server test** — in the GET's existing integration test file, POST a session with `endedBy: "link-lost"` (the POST already accepts it, `data.ts:1154`), GET it back, assert the response carries `endedBy: "link-lost"`; and a session posted without it returns `endedBy: null` (not absent — match the route's existing null idiom; if the route's list-vs-detail GETs differ, cover the one FromTheLog consumes, and say which in your report).
- [ ] **Step 2: Verify it fails** (`pnpm test --project integration` — Docker DB; foreground).
- [ ] **Step 3: Implement the GET field** — additive only; follow the route's existing column→response mapping idiom.
- [ ] **Step 4: Failing client tests** — storedSummary threads `endedBy` optionally (unit assert on a realistic stored payload); FromTheLog with a REALISTIC link-lost fixture (copy the file's fullest existing fixture and set `endedBy: "link-lost"`) renders exactly `LINK LOST · the app lost the monitor before the end` in the detail header region, and the same fixture with `endedBy: "finished"` renders nothing new (query by text, assert absence).
- [ ] **Step 5: Implement the threading + the line.** Style: reuse the header's existing secondary-line classes; if a new CSS rule is unavoidable compute the contrast ratio and put the number in a comment (recurring failure 6).
- [ ] **Step 6: All projects green** (`pnpm test` — both summary lines).
- [ ] **Step 7: ROADMAP riders** — PROD list: tick F1 with one line; Release posture second arm: "F1 fixed (this PR)" wording; the owed-clauses item's clause 4: mark the surface branch taken (the notes clause still owed at the tag).
- [ ] **Step 8: `pnpm e2e` foreground** (full count), `pnpm screenshots` — expect diffs ONLY if an existing capture flow covers the changed screens; open and look at any diff; commit a capture only when the change is this PR's own surface.
- [ ] **Step 9: Commit** `feat: a lost link finally shows in the log — and the riders land`.

---

## Self-review (done at write time)

- Spec §1 → Task 1; §2 → Task 2; §3's gates → Task 2 Steps 8 + the controller's PR flow; exit criteria 1 → T1, 2/3 → T2, 4 → T2 Step 8 + CI.
- No placeholders; test sketches name assertions and defer mechanics to the files' own idioms deliberately (both files have rich existing patterns an implementer must follow, not fight).
- One PR; not triad; antagonist skip + no PM gate both spoken in the spec.
