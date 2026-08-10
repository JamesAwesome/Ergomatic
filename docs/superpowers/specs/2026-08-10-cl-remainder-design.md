# Phase CL remainder — builder draft persistence, the anon-run re-file, and the release staging

**Date:** 2026-08-10
**Decided with James:** anonymous-run logging is re-filed with a trigger,
not built (its save door has no possible customer today); the builder
unsaved-changes item ships as DRAFT PERSISTENCE, not a navigation guard
(James's explicit choice between three presented shapes). The release is
PREPARED but not fired: notes drafted and merged, tag waits for the
library-rebalance PR (James's recorded ruling: testers meet the
rebalanced library).

## Evidence base (explored 2026-08-10, this session, three read-only sweeps)

- Builder: no dirty flag, no draft persistence, no baseline comparison
  anywhere (`app/src/builder/builderState.ts`, whole-file grep;
  `Builder.tsx:123` seeds `useState` from `mode?.initial ?? newForm()`
  and nothing snapshots it). Every exit discards silently: `BackLink`
  (`Builder.tsx:364`), edit-mode's fixed back link (`Builder.tsx:356-362`),
  and the tab bar, which stays LIVE over the builder (`AppRoutes.tsx:44-46`
  hides it only for `/session/*` prefixes). React Router's `useBlocker`
  cannot run under the app's declarative `<BrowserRouter>`
  (`App.tsx:30`) — it throws "must be used within a data router"
  (verified in the installed react-router 7.18.2) — which is why the
  navigation-guard shapes lost to persistence.
- Session-draft precedent: `app/src/session/draft.ts` (`DRAFT_KEY =
  "ergomatic.sessionDraft"`, `saveDraft`/`loadDraft`/`clearDraft`,
  shape-validated load). The builder gets the same idiom, not a new one.
- Anonymous runs: `workoutId: null` is fully supported at every layer
  that stores or accepts a record — `MonitorRun.workoutId: string | null`
  (`monitorRun.ts:50`), guards key only on `completedAt`
  (`monitorRun.ts:391-397`, `461-471`), `POST /api/logs` accepts null
  (`data.ts:585-600`), the column is nullable with `ON DELETE SET NULL`
  (`schema.ts:97-99`) — and yet NO production path can create one: the
  only door into the connect flow stamps a real id
  (`WorkoutDetail.tsx:348-354`), and `ANONYMOUS_RUN` is consumed only by
  `NO_IDENTITY`, "never read" by its own comment
  (`useMonitorSession.ts:174-188`; adversarial finding m4,
  `2026-08-08-phase-7c-adversarial-review.md:435-442`). A save door
  built now is an unconsumed helper with tests — the spec-blind
  anti-pattern this repo has already paid for once.
- Release notes: `app/src/news/content/releaseNotes.ts`, newest-first
  `RELEASE_NOTES` array of `{version, date, items: string[]}`
  (`types.ts:24-28`). Latest entry is v0.5.1 — v0.6.0 shipped without
  one, so the next entry covers everything testers receive since
  v0.5.1, per James's ruling.

## Part 1 — builder draft persistence

New module `app/src/builder/builderDraft.ts`, mirroring
`session/draft.ts`'s discipline:

- **Key:** one localStorage key `ergomatic.builderDraft`. The stored
  value is `{mode: "new"} | {mode: "edit", workoutId: string}` plus
  `{form: BuilderForm, baseline: BuilderForm, savedAt: ISO string}`.
  One draft at a time — starting a different edit (or a new workout)
  overwrites; that matches the session draft's single-slot semantics
  and avoids unbounded key growth.
- **Row ids force fingerprint comparison, not raw equality.**
  `newForm()`/`fromWorkout()` are NOT call-stable: row ids come from a
  module-local monotonic counter (`builderState.ts:69-76`, "this
  module-local counter never resets"), so two pristine forms built at
  different moments carry different `r<N>` ids and raw
  `JSON.stringify` equality never holds across calls. All comparisons
  below therefore use a `formFingerprint(form)` helper (new, in
  `builderDraft.ts`): the form serialized with every row's `id`
  stripped. Ids stay in the STORED form (the restore needs them) but
  never participate in equality.
- **Save:** an effect in `Builder.tsx` watches `form` and writes the
  draft whenever `formFingerprint(form)` differs from the pristine
  baseline's fingerprint (captured once at mount from
  `mode?.initial ?? newForm()`). A pristine form CLEARS any stored
  draft instead of writing one, so "typed, then undid it by hand"
  leaves no residue and a mere visit never litters storage.
- **Restore:** on mount, a draft is restored only when ALL hold:
  shape-valid (validated field-by-field like `loadDraft`; anything
  else is dropped silently), same mode, same `workoutId` in edit mode,
  AND the stored baseline FINGERPRINT still equals the current
  pristine form's fingerprint (`fromWorkout(workout)` freshly computed
  in edit mode, `newForm()` in new mode). The fingerprint check is the
  staleness guard: if the workout was edited elsewhere since the draft
  was taken, the draft is dropped, never merged.
- **Restored ids are remapped, never trusted.** A stored row id like
  `r3` can collide with what this session's live counter hands the
  next added row (duplicate React keys, silent row corruption). On
  restore, every row gets a FRESH id via a new `adoptForm(form)`
  helper in `builderState.ts` (the counter is module-private, so the
  remap lives beside it), preserving everything but `id`.
- **Notice row:** a restored draft shows a one-line notice above the
  form — `Draft restored.` — with a `START OVER` button beside it,
  wired through the house two-tap arm idiom (`.button-l4` /
  `.button-l4-armed`, copy swap to `Tap again to start over`, auto
  disarm like `useStagedDiscard`'s 4s). Firing clears the draft and
  resets `form` to the pristine baseline. No notice when nothing was
  restored. Copy has no em dash (house rule).
- **Clear:** successful save (`Builder.tsx:336`'s navigate path) clears
  the draft BEFORE navigating; START OVER clears it; a dropped-stale
  draft is deleted on detection.
- **Out of scope, stated:** no navigation interception of any kind, no
  data-router migration, no `beforeunload`. Multi-draft slots and a
  drafts list are YAGNI.

### Testing (docs/TESTING.md governs)

- Unit: `builderDraft.test.ts` — round-trip, shape rejection (garbage,
  wrong mode, wrong workoutId), staleness rejection (baseline drift),
  clear semantics. Behavioral assertions (restore returns the form and
  the caller renders it), not existence checks.
- Client: `Builder.test.tsx` additions — typing writes the draft;
  reverting to pristine removes it; mount-with-draft restores and shows
  the notice; START OVER two-tap resets; save clears. At least one
  edit-mode test starts from a REAL library workout via `fromWorkout`
  (briefing's realistic-fixture rule).
- e2e (`builder.spec.ts`): the flow that motivated the item — type into
  `/library/new`, tap a tab, come back, content intact; save, leave,
  return, form pristine. There is ZERO existing e2e coverage of
  leaving the builder (verified this session), so these are new pins.
- Self-mutation per the briefing for every behavioral test.

## Part 2 — anonymous-run logging: re-filed, not built

ROADMAP edit only. The CL line moves to "Triggered follow-ons" as:

> **Anonymous-run logging (`workoutId: null`)** — every storage and
> server layer already accepts the record (nullable column, guards key
> on `completedAt` alone), but no product path can CREATE an anonymous
> run: the only connect door stamps a real workout id
> (`WorkoutDetail.tsx`), and `ANONYMOUS_RUN` is dead code by its own
> comment. The save door lands WITH its first consumer, not before.
> **Trigger:** a door that creates anonymous runs ships — a free-row
> entry point, or PM5-initiated sessions.

The adjacent m5 stranding (a NORMAL finished run orphaned by a deleted
workout or cleared baselines) is a different defect and stays where it
is (7C's review record); this spec only relocates the anonymous line.

## Part 3 — CL list close-out adjudications (ROADMAP edits, same PR)

Per CL's exit rule (shipped / re-filed with trigger / declined in
writing), the remaining unchecked lines:

- **Reconnect five-parter (L):** re-filed under Triggered follow-ons,
  trigger: "Capacitor BLE lands (PM5 reaches the phone), or a tester
  reports a mid-piece lost link." Not tester-blocking today
  (desktop-preview surface).
- **Failed `program()` re-reasoning (M):** folded into the reconnect
  follow-on line — the re-reasoning draft already lives in PR #70's
  body, and the fix shares the reconnect item's machinery. Trigger:
  same as above.
- **Hardware shopping list + the `.5` pace target (M+S, operator):**
  re-filed as one Triggered follow-on, trigger: "James's next session
  at the erg" — the checklist itself lives in PR #70's body and the
  hardware-session-pacing rules apply. These were never build items.
- **Anonymous-run logging:** Part 2 above.
- **Builder unsaved-changes guard:** shipped by Part 1.

After this PR, every CL line is checked, re-filed, or declined in
writing, and the phase's exit criterion reads MET pending the release.

## Part 4 — the release, staged not fired

- **Notes** (`releaseNotes.ts`, new entry; version `v0.7.0` — the next
  minor per RELEASING.md's tag rules; if James rules a different number
  at tag time the string is a one-line follow-up). Draft, no em dashes,
  one rower-noticing item per line:
  - "Today now starts you off: a START HERE guide walks your first
    week, and a baseline-setting workout appears until your 2k and 6k
    are in."
  - "Workouts no longer carry their own warm-ups. Set yours once on
    You and every session includes it automatically."
  - "New in News: articles on setting baselines and picking a workout,
    plus a Start here shelf for new rowers."
  - "Reading flows properly now: BACK walks you through the articles
    you came from, and the close button returns you to where you
    started."
  - "The News feed remembers your scroll position."
  - "Bulk import is all-or-nothing: a bad line means nothing lands, so
    fixing and re-pasting never duplicates workouts."
  - "Connect a PM5 from a workout's page and row with live splits
    (desktop browsers today; phone support is on the way)."
- **Order in the array:** the new entry goes first (newest-first array).
- **Tag checklist, staged** (fires only after the rebalance PR merges;
  James's ruling): RELEASING.md's five steps verbatim, with the CLI
  archive+upload path from the v0.6.0 release (ios-activation-facts) as
  the proven alternative to Xcode: tag `v0.7.0` annotated on main, then
  `GOOGLE_IOS_CLIENT_ID` from the plist's reversed URL scheme,
  `pnpm ios:build`, `xcodebuild archive` + upload with
  `DEVELOPMENT_TEAM=QYA37BHP3N`, confirm in App Store Connect. Post
  the release recommendation per the standing rule.

## PR shape

Two PRs out of this spec, both from this worktree's branch family:

1. **`cl-remainder`** — Part 1 (code + tests + e2e), Parts 2-3
   (ROADMAP edits). Full subagent cycle (product code + the client/e2e
   surface). Expect a textual ROADMAP rebase when the rebalance lands.
2. **Release-notes PR** — Part 4's `releaseNotes.ts` entry alone, fast
   path (one content file, James reviews the copy in the PR). Merges
   ahead of the tag so the build carries its own notes.

## Out of scope, recorded

Free-row entry point (the anon-run trigger); data-router migration;
multi-draft slots; `beforeunload` handling; the m5 stranded-run fix;
Phase CL2 (post-release, James's explicit sequencing).
