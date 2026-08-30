# Hand-off Store Implementation Plan (draft — lands on the fresh branch)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkboxes.

**Goal:** implement the approved hand-off store protocol (rev 4) — one
authority for the connected record — restoring #230's preserved behaviors
on the new substrate.

**Spec:** `docs/superpowers/specs/2026-08-30-handoff-protocol-design.md`
(rev 4, James-approved 2026-08-30). Binding sections: §1 (store API +
single-session invariant + named committer), §3 (the main defect + row 8),
§5 (destroyer census — re-run against this branch's base before coding),
§6 (snapshot-is-the-copy claims), §7 (cached verdicts, retryDurable, no
auto-heal), §8 (precedence/hydration), §10 (gate rows 1–12 + exit
criteria), §11 (restore/rewrite file lists).

## Global Constraints

- Worktree + fresh branch off current main; SDLC bullet verbatim; no merge
  without James.
- TDD: §10's rows are written red-first where the substrate allows; row 8
  (the stillLive defect) is red against main's `recordActual` on the FIRST
  commit.
- Names verbatim from the spec: `handoffStore`, `commit(sessionKey,
  expectedRevision, next)` (null = expect-absent), `retryDurable`,
  `read`/`currentUnretired`, `retire(set, reason)`, tombstones, receipts
  (`store-second-key-refused`, `handoff-dropped reason=richer-at-save`,
  retire receipts w/ claim state), `lastAcceptedRevisionRef`,
  `durableRevision` + `durableComplete`.
- Writer gates become PURE; the hook is the sole committer.
- Restore-verbatim and rewrite file lists per §11; the restored
  `WorkoutDetail.connectedRecovery.test.tsx` + `WorkoutDetail.test.tsx`
  get the budgeted comment pass (they narrate the deleted slot).
- No Gate-0 owed (no rendered change) — stated, per the spec's exit
  criteria; the held-error frame restores verbatim IN THE SAME PR as its
  producer.
- Mutations per RF21/22 as §10 names them, incl. one module-boundary gate
  (nothing outside the store writes the durable key).

## Tasks (sized for the SDD loop)

1. **Row 8 red against main** — the payload-inspecting stub (deny the
   first write whose payload carries non-null `completedAt`) + the
   finish-grace-boundary leg proving today's re-open defect. Commit red.
2. **The store module** — entry/revision/tombstone/claim-state machinery +
   `commit`/`retryDurable`/`read`/`currentUnretired`/`retire` + receipts +
   hydration rules (§8, never during render; malformed-bytes deferral) +
   the single-session invariant. Unit tests: every §1 semantic (CAS
   accept/stale/retired/second-key; verdict caching; durableComplete;
   tombstone masking; retire sets + per-entry receipts; no-op retire
   emits nothing).
3. **The producer rewrite** — `useMonitorSession.ts` on the store: writer
   gates pure, hook-as-sole-committer with `lastAcceptedRevisionRef`,
   verify → cached verdict at the release funnel, `retryDurable` behind
   Retry, held-error state machine unchanged in behavior; `stillLive`
   deleted. Rows 2/4/5/7/8 green; legacy replay legs retargeted.
4. **The consumer rewrite** — `LogSession.tsx` reader on
   `read`/claims (snapshot-is-the-copy; claim = {key, renderedRevision};
   save posts the snapshot; save-success retire + richer-at-save
   receipt); `Today.tsx` unlogged row on the store (the product gain) +
   reload-vanish receipt; rows 3/9/10 green.
5. **The doors** — `ConnectAction`/`useStartWorkout`/`WorkoutDetail`
   (row-instead terminus)/manual-discard on `currentUnretired` +
   key-bound retire sets; row 1/6 green; restore the §11 verbatim files;
   comment pass on the two named test files.
6. **Close-out** — full mutation ledger (§10's named set), per-file
   coverage, full gates incl. e2e + screenshots (held-error captures
   restore), ROADMAP (store item; AUD-016 struck? stays until the PM
   final gate + James), census re-run documented.

Every task: implement → task review → fix loop, per the SDD skill; final
whole-branch review; PM final-PR gate (TRIAD); James's merge word.
