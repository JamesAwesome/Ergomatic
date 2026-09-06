# Phase NF follow-on — implementation plan (2026-09-06)

**Spec:** `docs/superpowers/specs/2026-09-06-phase-nf-followon-design.md` (Gate 0
approved by James 2026-09-06 with two copy rulings: "monitor tag", and a line
break between the not-advertising card's sentences; option A).
**Shape:** inline implementation in task-sized commits, failing test first,
controller as author (CLAUDE.md, "Inline implementation is an accepted
shape"); the REVIEW half is a whole-branch review. This plan is task-level
(seams, tests, mutations, gates) and prescribes NO code blocks, so `/harden`
lens 2 is skipped aloud: "no prescribed blocks; lens 2 skipped." Lens 1 runs
as a DELTA pass on the two mechanisms named in the spec.
**Worktree:** `.claude/worktrees/phase-nf2-followon`, branch `codex/phase-nf2-followon`.

## Global constraints

- No new colour token; no new user-facing string beyond the four Gate 0
  approved (`Scan NFC` on Just Row is the existing string; `Looking for
  <name>`, `Keep the PM5 on and close by.`, `Couldn't reach <name>.` +
  `Check nothing else is connected to it, then try again.`, `Couldn't scan
  the monitor tag. Try again.`). No em-dashes in copy.
- Every new assertion gets a biting mutation, recorded in
  `docs/monitor/sessions/phase-nf-followon/MUTATIONS.md`.
- `pnpm e2e` + `pnpm screenshots` before done (RF1); captures opened and read
  (RF7); DEVIATIONS reconciled (RF9); the old not-advertising line grepped
  in both directions after replacement.

## Tasks

### Task 1 — not-advertising copy (copy + one render rule)

- `useMonitorSession.ts`: `TARGETED_FAILURE_COPY.TargetMonitorNotAdvertisingError`
  becomes a builder over the request's exact name; `detail` carries the two
  sentences separated by `\n`.
- `ConnectedInterstitial.tsx` `renderFailureScreen`: when `error.detail`
  contains a newline, the serif line is the first line and the remainder
  renders as `connected-body-line` (one rule, any reason). The DETAIL panel
  keeps the full string (its `connected-detail-line` gets
  `white-space: pre-line`).
- Tests: hook test pins the two lines with an independent name literal;
  interstitial test pins serif/body split; `useMonitorSession.test.ts`'s copy
  table row updated; `e2e/connected.spec.ts` "not-advertising" assertion
  updated (both lines). Mutation: drop the `\n` → both split tests fail;
  drop the name → hook test fails.
- Grep `Open Connect Device on this PM5` over `app/` (src + e2e): zero after.

### Task 2 — tag-read copy (Swift patch + JS mapping)

- Patch (`pnpm patch @capgo/capacitor-nfc@8.2.5 --edit-dir`): the
  `rejecting:` message for a failed `readNDEF` becomes `Couldn't scan the
  monitor tag. Try again.`; `NdefSessionEndingTests.swift` pins the string;
  `xcodebuild … test` 31+ green; `pnpm patch-commit`.
- `runNfcAttempt.ts` `endingCopy`: `NfcInvalidatedError` with cause
  `tagFailure` → `Couldn't scan the monitor tag. Try again.`; `NfcInlineCopy`
  union grows by one; every other invalidation unchanged.
- Tests: `runNfcAttempt.test.ts` table; `WorkoutDetail.nfc.test.tsx` states
  table row (`invalidated`/`tagFailure`). Mutation: map tagFailure back to
  the generic line → both fail.

### Task 3 — the targeted-scan screen with Cancel

- `ConnectedInterstitial.tsx` `picking` branch: if `request.kind ===
  "advertised-name"`, render `CONNECT` / `Looking for <exactName>` /
  `Keep the PM5 on and close by.` and a `.button-l2` Cancel bound to
  `handleCancel`; picker kind unchanged.
- Tests: interstitial test (targeted request → the three strings + Cancel;
  picker request → no Cancel, old copy); Cancel during a pending
  `scanTarget` aborts its signal and calls `onExit` (hook-level assertion
  exists for the abort — add the screen-level one). e2e (Phase NF describe):
  scripted not-advertising path shows `Looking for` + Cancel, Cancel returns
  to detail with both buttons. Captures: `connected-looking.png` +
  `-landscape` (a gated fake scanTarget that never settles). `design.spec.ts`:
  Cancel is 52 px and inside the actions stack.
- Mutations: remove the Cancel → tests fail; render the variant for picker
  kind → picker test fails.

### Task 4 — `useNfcEntry` + Scan NFC on Just Row

- New `src/monitor/nfc/useNfcEntry.ts`: owns reader resolution, the
  capability probe (moved from `WorkoutDetail`), `busy`/`accepted`, the abort
  ref, the mounted ref, and `runAttempt(attemptId, onTarget)` — the body of
  today's `handleNfcProceed` with the handoff delegated to `onTarget(request,
  trace): boolean` (detail: `proceedWithRequest`; Just Row:
  `session.connect(request, trace)` + `setStarted`). Lifetimes unchanged
  (spec "State and lifetime"). `WorkoutDetail.tsx` consumes it; its
  behaviour and every existing test hold unchanged.
- `JustRow.tsx`: `nfcCapability` from the hook; `handleProceed` branches on
  intent kind; `lastRequestRef` replaces `lastAttemptRef`; `retryConnect`
  replays the last request.
- Tests: `JustRow.nfc.test.tsx` routed proof (click → scripted reader → fake
  radio `scanTarget` → READY; the request at the seam is asserted from the
  fake's sink, never constructed); presence/absence by capability; inline
  error copy on Just Row (where does it render? — the door has no
  `connectError`; add the same `baseline-error` line under the stack);
  Try again after a targeted failure replays the targeted request (hook
  spy). `WorkoutDetail.nfc.test.tsx` unchanged and green. e2e: Just Row
  Phase NF describe (valid → READY, no picker). Captures:
  `just-row-nfc.png` + `-landscape`. `design.spec.ts`: Just Row pair 56 px,
  gap 12, fern fill.
- Mutations: Just Row proceeds a picker request on an nfc intent → routed
  test fails; retry mints a picker after a targeted failure → replay test
  fails; hook drops `discardStagedRetire` on a non-handoff outcome →
  existing detail test fails (proves the extraction kept it).

### Task 5 — records and gates

- DEVIATIONS: the two-primaries row extends to Just Row; a row for the
  targeted-scan screen. ROADMAP NF block: tick the five rows; walk section
  of the NF spec: note the copy landed. CLAUDE.md: RF31 candidate (a fix is
  a new claim and gets the original's gate; walk the state machine on both
  machines; a runsheet carries a timer table with an exit for every hold) —
  landed here as a docs change riding this PR.
- Gates: typecheck, lint, format, `test:coverage` (per-file numbers for the
  new hook), build + dist-grep, e2e, screenshots, native patch tests.
- PR body per the house shape; whole-branch review; James's word to push;
  James's approval to merge; TestFlight recommended after merge (release
  held until then by James).
