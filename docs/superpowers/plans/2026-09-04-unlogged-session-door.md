# Unsaved workout recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every retained workout protected by an unsaved warning reachable from Today without discarding it, and save supported recordings through the existing pipeline.

**Architecture:** A source/key-bound review route selects an existing mount snapshot and composes the existing programmed or Just Row summary. Today renders the same recovery component outside unrelated fetch gates; warning View actions use cancel cleanup. Missing metadata is form-local explicit type selection; unreconstructable recordings receive a read-only copy/keep/discard view.

**Tech Stack:** Existing React 19, React Router 7, TypeScript, Vitest/RTL and Playwright/compose. No dependency, persistence, server or protocol change.

**Spec:** `docs/superpowers/specs/2026-09-03-unlogged-session-design.md` (normal treatment approved September 3; fallback treatment approved September 4).

## Global Constraints

- No new queue, server API, persisted shape, BLE reconnect, background recording, automatic saving, or arithmetic. Correct Resume remains deferred.
- Keep unqualified existing finish-time routes compatible.
- Invalid/missing source or key cannot select a default.
- A destructive completion may clear only a still-matching run, never a newer timer record.
- User-chosen missing type is form-local, wins over a subsequently resolving library lookup, and resets on unmount.
- Preserve existing monitor claim/retire identity, timing and reasons; no revision in the URL.
- Unknown `isGlobal`, expected pain and designated-test status stay unknown; do not award a test result from title alone.
- Local recovery renders during unrelated Today loading/errors. Live phone timers remain Resume only.
- Hit targets ≥44×44 CSS px, text contrast ≥4.5:1, inputs 16px; existing tokens/fonts, 2px radii, no shadows or animation.
- Worktree only. Read `CLAUDE.md`, `.claude/agent-briefing.md`, and `docs/TESTING.md`. Before every commit verify the worktree with `git rev-parse --show-toplevel`. No merge or publish authority.

## Source map and seams

Baseline: product code at `c5015c2e`; opening/approval docs precede this plan.

- `Today.tsx:437` returns loading before any recovery row; error branches follow. Its local snapshots are already above that gate. `TodayView` owns the ready layout, while `UnloggedRow`/`UnloggedMonitorRow` own discard state. The completed-programmed omission is at `Today.tsx:1529`.
- `Today.tsx:744` explicitly closes an open monitor record via `completeInterruptedRun` plus key/revision commit. Closed records return the same object and need no commit. This action stays on Review, never render.
- `ConnectAction.tsx:134` stages the observed key/revision. Its Cancel handler clears staged authorization; View must call the same handler before navigation. `useStartWorkout.ts:147` and `JustRow.tsx:476` own the other warning paths.
- `LogSession.tsx:323` gates old monitor intent. `ManualDoorLog` rejects missing library metadata before its programmed monitor branch (`:1789`, `:1815`). Extract that branch's presentation/payload, not a second numeric implementation.
- `SessionDoorLog` (`LogSession.tsx:1230`) loads draft/run, blocks on missing draft plus pending library (`:1336`), and clears both records on success. Recovery must remove that fetch dependency and scope clearing to its selected key without changing the ordinary legacy door's classification fallback.
- `JustRowLog.tsx:100` chooses the newer source on unqualified visits. Its timer success clears the global run unconditionally (`:181`). Recovery supplies an explicit selected entry and key-guards timer clearing; legacy precedence remains intact.
- `handoffStore.ts:754` is a non-hydrating key-filtered read. Follow `LogSession.tsx`'s module-level non-render hydration before route mount. Reload must work without passing Today first.
- `AppRoutes.tsx` registers the existing summary routes. The review child must remount when search changes, so navigation between two retained recordings cannot reuse the first snapshot.
- `connected.spec.ts:463` and `:543` drive the genuine connected writer using the existing fake transport. `:145` and `:695` explicitly end by the rower, not natural finish. Reuse setup for the upstream-to-downstream proof, but add a natural-finish story rather than relabeling that existing walk.

## Lifetime contract

| State                  | Mint                       | Clear / survival                                                                                                      |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| URL source + startedAt | clicked Today row          | survives reload; each route mount validates exactly that source/key; changed query remounts                           |
| selected monitor entry | hydrated key-filtered read | immutable mount snapshot; existing claim and key/revision retirement; different current key never consumed            |
| selected timer run     | key-matched load           | immutable mount snapshot; success/discard may clear only matching current startedAt; do not clear a replacement draft |
| missing type selection | explicit change            | form-local; user choice wins later fetch; reset on source/key remount                                                 |
| copy feedback          | Copy recording press       | form-local success/failure, reset on remount; no storage effect                                                       |
| discard arm            | existing useStagedDiscard  | existing blur/timeout rules; no state copy to parent fetch branches                                                   |
| warning stage/count    | existing guard press       | clear on Cancel/View; View also discards Connect's staged authorization                                               |

No additional session refs, counters, module caches or storage keys are authorized.

### Task 1: Complete source-bound review and access

**Files:**

- Create `app/src/session/reviewSelector.ts`, `app/src/session/reviewSelector.test.ts`, `app/src/session/ReviewSession.tsx`, `app/src/session/ReviewSession.test.tsx`.
- Create `app/src/today/UnsavedWorkouts.tsx` for the moved recovery rows and `app/src/session/UnsavedWorkoutWarning.tsx` for shared warning presentation; focused tests beside them when not covered by callers.
- Modify `app/src/session/LogSession.tsx`, `app/src/session/PostWorkoutSummary.tsx`, `app/src/justrow/JustRowLog.tsx`, `app/src/shell/AppRoutes.tsx`, `app/src/today/Today.tsx`, `app/src/monitor/ConnectAction.tsx`, `app/src/session/useStartWorkout.ts`, `app/src/workout/WorkoutDetail.tsx`, `app/src/justrow/JustRow.tsx`, and `app/src/index.css`.
- Modify their existing client tests, especially `Today.test.tsx`, `LogSession.test.tsx`, `PostWorkoutSummary.test.tsx`, `JustRowLog.test.tsx`, `ConnectAction.test.tsx`, `useStartWorkout.test.tsx`, `WorkoutDetail.test.tsx`, `JustRow.test.tsx`, `AppRoutes.test.tsx`.
- Update existing selectors/assertions in `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts` and other existing e2e callers of the renamed recovery actions so Task 1's own full gates remain green. Task 2 subsequently owns the new upstream journey and new variant registrations in those files; it does not defer fixing existing red tests.
- Small extracted modules under `app/src/session/` may contain the moved programmed-summary body, missing-type field and read-only recording view if needed to keep a component focused. They must share existing builders/form logic, not fork payload arithmetic.

**Interfaces:**

- Consumes existing `HandoffEntry`, `SessionRun`, `useLogForm`, `buildSummaryModel`, `buildMonitorLogSteps`, `buildLogSteps`, `freeRowTotals`, `useStagedDiscard`, and current claim/retire functions.
- Produces `ReviewSource`, `ReviewSelector`, `parseReviewSelector(search: string): ReviewSelector | null`, `reviewLocation(source: ReviewSource, startedAt: string): string`, and default `ReviewSession()` route component.
- `UnsavedWorkouts` receives the parent's existing `run: SessionRun | null` and `monitorEntry: HandoffEntry | null`; it owns row/discard state independently of fetch status. The parent renders it once before the ready/loading/error content.
- `UnsavedWorkoutWarning` receives `count: number`, `replacement: "Connecting" | "Starting a new one"`, `onView: () => void`, `onCancel: () => void`, `onReplace: () => void`, and `replaceLabel: string`. In-progress guard presentation remains unchanged.
- Review mode is explicit required selected-record input to shared summary bodies, never inferred from a nullable optional prop. Existing unqualified route adapters own their legacy selectors separately.

- [ ] **Step 1: Write route-selector tests and reproduce the existing dead end.**

The complete selector test is:

```ts
import { describe, expect, it } from "vitest";
import { parseReviewSelector, reviewLocation } from "./reviewSelector";

describe("source-bound review navigation", () => {
  it.each([
    "",
    "?source=&startedAt=x",
    "?source=monitor",
    "?source=monitor&startedAt=",
    "?source=other&startedAt=x",
    "?source=timer&source=monitor&startedAt=x",
    "?source=timer&startedAt=x&startedAt=y",
  ])("refuses an absent or ambiguous selector: %s", (search) => {
    expect(parseReviewSelector(search)).toBeNull();
  });

  it("preserves a monitor key without choosing a newer source", () => {
    expect(
      parseReviewSelector(
        "?source=monitor&startedAt=2026-09-04T12%3A00%3A00.000Z",
      ),
    ).toStrictEqual({
      source: "monitor",
      startedAt: "2026-09-04T12:00:00.000Z",
    });
  });

  it("encodes the clicked timer key as a single query value", () => {
    expect(reviewLocation("timer", "legacy + key&x=1")).toBe(
      "/session/review?source=timer&startedAt=legacy%20%2B%20key%26x%3D1",
    );
  });
});
```

Run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session/reviewSelector.test.ts` from `app/`; before implementation the valued-source tests must fail on missing behavior. Use a typed null/empty shell if module-resolution failure would obscure the behavioral RED.

Change the old Today completed-programmed omission test into a routed recovery regression: replace its minimal empty-interval/missing-seed fixture with real library → draft/buildRun → compiled program/buildLogSeed data, render Today with the actual review route, select Review & save, assert retained title and PM5 summary, no manual form and no POST. Run the focused case before changing production; the absent action must make it RED. Extend that same component harness one behavior at a time using the acceptance table below; each gets its own RED/GREEN cycle, not a later coverage-only sweep.

- [ ] **Step 2: Add the source selector.**

`app/src/session/reviewSelector.ts`:

```ts
export type ReviewSource = "timer" | "monitor";
export interface ReviewSelector {
  source: ReviewSource;
  startedAt: string;
}
export function parseReviewSelector(search: string): ReviewSelector | null {
  const params = new URLSearchParams(search);
  const sources = params.getAll("source");
  const keys = params.getAll("startedAt");
  if (sources.length !== 1 || keys.length !== 1) return null;
  const source = sources[0];
  const startedAt = keys[0];
  if ((source !== "timer" && source !== "monitor") || !startedAt) return null;
  return { source, startedAt };
}
export function reviewLocation(
  source: ReviewSource,
  startedAt: string,
): string {
  return `/session/review?source=${source}&startedAt=${encodeURIComponent(startedAt)}`;
}
```

Run the selector command again: all its cases pass. The key is opaque existing identity, not a timestamp to normalize or compare.

- [ ] **Step 3: Route selected snapshots to the existing summary bodies.**

Register `/session/review` in `AppRoutes`. `ReviewSession` reads location.search and renders a child keyed by that search. The child lazily parses and reads only the named source: monitor `read(startedAt)` after module-level hydrate; timer `loadRun()` then exact startedAt match. Invalid selector, absent/mismatching record, or live timer renders Recording unavailable + Back to Today, with no automatic redirect to another summary. Mode comes only from the matched record (timer workout/justrow, monitor justrow versus existing programmed legacy mode); no caller-selected mode and no new stored identity.

Require `completedAt !== null` on a selected monitor snapshot BEFORE either programmed or Just Row summary, claim, or save. An open selected monitor record gets the same Recording unavailable + Back to Today state. The builders do not supply this closure gate (`LogSession.tsx:333` and `JustRowLog.tsx:72` do in legacy adapters, whereas `summaryModel.ts:1194` accepts missing completion). A direct/deep-linked route must not close the record. Test direct-open URLs and a refused Today close, not only the successful Today click.

Preserve mount-snapshot semantics. Reuse the Just Row renderer with an explicit selected `DoorEntry`; keep its legacy `doorEntry()` confined to the `/justrow/log` adapter. Move its success/discard ownership into the selected-record body and guard timer clears against the current startedAt.

Extract the programmed monitor presentation/save branch of `ManualDoorLog` into a reusable body with explicit retained entry plus optional library context. Preserve every payload field from `handleMonitorSave`, including optional machine totals/detail/verification bytes, series, source, endedBy and work/rest values. Legacy adapter continues its present gate; recovery adapter uses retained workoutId/title, current matched library type if available, otherwise an explicit selected type. Do not change `useLogForm` rejected-workoutId or series retry policies. Continue the existing claim in the committed summary effect; read-only fallback does not claim.

Reuse `SessionDoorLog`'s timer summary builder/form through an explicit selected-run adapter. In recovery only, a missing matching draft cannot block on library loading or fall back to O2. Use a valid matching draft type, then matched library type, else explicit selection. Draft matching still uses workoutId for labels/paces. On success/discard, clear the run only when its current startedAt equals the snapshot's; clear its draft only when it is still the matching draft, never a newly queued replacement draft. Ordinary legacy route behavior remains compatible.

Draft context matching is NOT clear authorization: `createdAt`, draft `startedAt`, and run `startedAt` have different mint sites (`draft.ts:61`, `:243`, `engine.ts:93`). Capture the matched draft at mount; inside the still-matching-run clear branch, clear a draft only if its current serialized contents equal that captured draft. A changed or newly queued draft survives. Do not equate draft.startedAt with run.startedAt, and do not call unconditional `useStagedDiscard.fire()` from source-bound recovery or its Today row.

Use existing `buildSummaryModel`/log-step builders in a non-mutating try/catch before rendering supported data. Catch unreadable nested input as well as missing/misaligned logSeed; non-finite summary data is unsupported, not a zero. Do not add repaired numeric values. For unsupported records render retained metadata, complete selected run JSON in a read-only selectable field, Copy recording, Keep unsaved, and two-tap selected discard. Clipboard writes that exact text on explicit tap using `ConnectionLogSheet`'s existing try/catch idiom; report failure visibly. Keep never clears storage. Missing-type selector is AN/O2/AT/TR with no default; Save disabled and handler refuses submission until a valid type exists. Explicit choice wins a late response. Keep existing plan/default advancement rules and known-global-only test offers.

`PostWorkoutSummary` may expose a `beforeSaveSlot?: ReactNode` (same presentation-slot idiom as its existing `stripSlot`) to place the missing-type field immediately before its action stack, and `saveDisabled?: boolean` default false, ORed with `saving` on both save actions. Recovery's submit handler still checks the type independently; disabling a control alone is not a save guard. Existing callers that omit both props remain unchanged.

- [ ] **Step 4: Put recovery before Today fetch-dependent content.**

Move the existing row implementations to `UnsavedWorkouts`; update their obsolete exclusion comments. Today retains its existing snapshots/hooks and renders one stable recovery component before a child containing the ready/loading/error branches. Do not put separate recovery instances inside those branches: fetch completion must not reset a two-tap arm. Include every retained monitor entry, completed or interrupted, and completed timer entries; keep live timer Resume accessible. Display retained title/source/start date and Not saved, with accessible action names distinguishing both source and title.

Timer Review links use `reviewLocation("timer", run.startedAt)`. Monitor Review runs the existing explicit interrupted-close action only if still open, then navigates to `reviewLocation("monitor", entry.sessionKey)`. A refused close must lead to an honest unavailable/read-only state, not silently save an open record or fall through to manual. Existing record-specific Today discard reason stays `today-discard`. Scope timer clear to the clicked record. Recovery remains visible for every unrelated request loading/error; only the lower content shows loading/Retry.

- [ ] **Step 5: Give every unsaved warning the safe exit.**

At guard staging, count completed timer plus current monitor records for singular/plural copy. Do not change the priority or replacement behavior of an in-progress timer guard. Use `UnsavedWorkoutWarning` for ConnectAction, WorkoutDetail's Start warning, and JustRow's Start Timer warning (including ConnectAction when used there). Copy is "You have an unsaved workout." / "You have unsaved workouts." followed by review-from-Today and explicit replacement consequence. View unsaved is primary; Cancel and red-outlined replacement are secondary. Connect's View calls the SAME cancel cleanup (`discardStagedRetireHandoff`, reset stage) then navigates Today. Start View resets its existing local stage then navigates; no draft/run/monitor mutation. Do not retire on View, Cancel, summary mount or failed save.

- [ ] **Step 6: Finish focused coverage and commit the implementation.**

| Fixture / ordering                                                          | Independent observable                                                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| completed / interrupted programmed PM5                                      | visible Today row → PM5 summary, frozen actuals; closed completedAt unchanged                                   |
| cold hydrated or memory-only current monitor                                | same-process route works; durable cold mount works without visiting Today                                       |
| complete / live workout timer; Just Row timer                               | complete review uses selected record, live offers Resume without ending                                         |
| distinct timer and monitor Just Rows, each selected                         | that source's independently pinned duration/title; legacy newer-completion route unchanged                      |
| library pending/error/deleted; null id                                      | summary visible; missing type required; chosen AT posts AT even after late library O2                           |
| missing/invalid seed or malformed nested summary input                      | full selected JSON shown; no summary/manual fallback or POST; copy success/failure keeps recording              |
| source/key absent, empty, duplicate, replaced before mount or changed query | Recording unavailable or newly selected source, never previous/other snapshot                                   |
| direct URL to open programmed/Just Row monitor; refused Today close         | unavailable, no summary claim/POST/automatic close; retained entry intact                                       |
| every unrelated Today loading/error branch                                  | same local recovery usable; Retry cannot reset discard arm                                                      |
| each warning View; singular and both retained                               | Today reached; retained bytes unchanged; Connect staged authorization empty                                     |
| failed save then retry                                                      | error visible and record retained, success retires selected once; different-source and newer-key record survive |
| two-tap row/read-only/summary discard                                       | selected record only; no POST; first tap and blur never discard                                                 |
| known/unknown global metadata and plan loading/error                        | existing plan semantics; no invented designated-test offer                                                      |

Use real library → draft/compiled program fixtures; unsupported shapes are explicit variants of those fixtures. Query visible roles/names, assert independent payload literals, not expectations recomputed with the production summary builder. Per-file HTML coverage is authoritative. Every new behavioral test needs a targeted self-mutation recorded with failing and restored passing results. Commit real changes before temporary mutation probes; restore surgically with apply_patch, never reset/checkout/stash.

Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test --project unit --project client`, and `pnpm e2e` from app. Layout changes also require `pnpm screenshots`, opening the images and computing contrast. Before committing, verify the worktree root; stage only Task 1 files. Commit subject: `fix: make retained workouts reachable and reviewable`.

### Task 2: Prove the complete recovery journey and rendered variants

**Files:** Modify `app/e2e/connected.spec.ts`, `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`; create `docs/testing/2026-09-04-unlogged-session-evidence.md` and generated screenshot artifacts under the existing screenshot convention. Update the spec and roadmap only with measured evidence, not anticipated results.

**Interfaces:** Consumes Task 1's `/session/review?source=...&startedAt=...` route and accessible Review & save / View unsaved / Copy recording / Keep unsaved controls. Produces connected-producer-to-history proof and portrait/landscape design registrations. No production changes unless a failing seam test establishes a bug, reported to the controller for the Task 1 worker.

- [ ] **Step 1: Extend the connected writer journey before claiming recovery works.**

In `connected.spec.ts`, reuse the existing fake-injection/setup style and compiled five-interval workout. Start with no retained monitor record. Add a natural-finish story that delivers every interval boundary and the real fake transport's WORKOUTEND status, then the summary burst; wait for the actual producer to navigate and verify its retained `endedBy` is `finished`. Do not use `walkSurfaceToLog` for that assertion: its existing story deliberately stops during interval 1 and presses End, so it covers rower-ended retention separately. After natural completion, leave without saving via ordinary navigation, visit another workout and stage its warning, View unsaved → Today → Review & save. Pin PM5 provenance, original captured actuals and retained title. Observe no POST until Save and byte-identical retained storage across warning/View. Save, then inspect the API-created history row and verify a later start does not warn for that record. Repeat with reload between leaving and recovery so hydration is exercised. Failure/retry gets a real intercepted API failure, not a fake useLogForm.

Run `pnpm e2e connected.spec.ts` for the new scenario. The author records RED by removing the specific Task 1 access condition in a committed tree, then restores surgically and records GREEN. This is a connected production-writer proof under supported fake transport, not evidence of natural BLE interruption incidence.

- [ ] **Step 2: Register and exercise recovery rendering.**

Add design sweeps for Today retained PM5 plus timer, warning singular/plural, missing-type summary, read-only legacy recording and unavailable recording. Use real-library-derived fixtures for healthy data and explicit legacy variants. Sweep both 390×844 and 844×390, long titles, all controls ≥44×44, axe zero violations and token checks. Cover Today pending/failed request while its retained row remains clickable. Capture these actual app variants through `screenshots.spec.ts`, open each generated image, describe content/overflow, and compute text contrast; no new pixel-diff gate.

- [ ] **Step 3: Run full verification and record limits.**

Run from app: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm test:coverage`, `pnpm build`, `pnpm e2e`, and `pnpm screenshots`. Read touched-file coverage from HTML, not only the aggregate. Document every behavioral test's self-mutation and restore result, with exact tree and commands. Keep unrelated stacks/data untouched. Final review receives spec, plan, whole-branch diff, task reports and evidence.

Native acceptance remains the approved phone recovery walk: finish connected work, leave unsaved, return via warning/Today, save retained actuals, then no warning for that consumed record. It validates this door only, not Correct Resume or failed-local-write process durability. The operator/hardware step requires James and the hardware-walk skill; do not mark it completed with a browser substitute. No merge/publish until separately authorized for this feature.

Before the Task 2 commit verify the worktree root; commit only its tests/evidence with subject `test: cover retained workout recovery end to end`.

## Author checks and hardening

The prescribed selector module and test were pasted at their real relative paths in `/tmp/ergomatic-unlogged-plan.8PRjqb`, an isolated archive of `52dd7f81`; they are not application implementation in the active worktree. Typed shell behavior was exercised RED before the implementation: the selector command produced two behavioral failures (valid parse and encoded navigation). The prescribed implementation passed all nine cases. `pnpm --config.verify-deps-before-run=false typecheck` and `pnpm --config.verify-deps-before-run=false lint` passed in that archive; the config flag prevented pnpm from replacing the linked dependency directory. Broader UI work above is a source-bound refactoring contract, not uncompiled replacement component blocks or guessed test-count targets. The implementer owns the full TDD cycles and probes for those changes.

Self-review: approved routing, fetch independence, both source kinds, malformed/type fallbacks and warnings are Task 1; upstream producer ordering, design registrations, screenshots and branch gates are Task 2. Shared interface is the source/key URL and accessible controls, with no parallel production writers. No forecast gate counts or document-internal line citations are used.
