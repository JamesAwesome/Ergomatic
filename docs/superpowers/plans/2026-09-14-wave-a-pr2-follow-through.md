# Wave A PR2 — "I already have an account" attaches the identity it just proved

> **For agentic workers:** this plan is a DECISION and TASK document, not a code
> transcription. The controller implements inline in task-sized commits with the
> failing test first, and dispatches the REVIEW half (CLAUDE.md, "inline
> implementation is an accepted shape"). Steps use `- [ ]` for tracking.

**Goal:** a rower who signs in with a second provider and says "I already have an
account" ends up with that provider attached to their existing account, instead
of back where they started with a fresh chance to make a duplicate.

**Spec:** `docs/superpowers/specs/2026-09-13-account-management-design.md`,
revision 3, §"Following through to a link (PR2)". The plan argues from the spec;
read both.

**Architecture:** the `confirm` stage gains a THIRD exit. Today it has two —
`attempts.confirm()` creates the account, and the client's `useUsualSignIn()`
cancels the attempt outright. The third carries the attempt forward through a
fresh authorization with the rower's usual provider and, on return, attaches the
identity the attempt already proved.

**Tech stack:** unchanged. Express 5, node-postgres, Drizzle schema, React 19.
No new dependency.

---

## Global constraints

Copied from the spec, verbatim where it matters.

- **The second sign-in is a fresh authentication inside the attempt**, never the
  reuse of a live cookie or bearer.
- **The confirmation names the provider AND the relay address.**
- **The carried subject is bound to the attempt's five-minute expiry.**
- **The You screen is the only detection channel; that is the accepted control.**
- House copy rules: no em-dashes in user-facing strings; the erg's display is
  "the monitor", never "PM5" (not reached here, but the lint of habit applies).

---

## Revision 2, after the antagonist pass (2026-09-14)

Revision 1 came back **NOT READY** with four blocking findings. Three of them
killed its central claim, and the fourth was ruled by James rather than fixed.
The corrections are the durable part, so they are recorded here rather than
quietly rewritten.

**What revision 1 got wrong: it argued from the DDL.** It proved that
`auth_attempts_session_check` and `auth_attempts_stage_check` admit a
`purpose='signin'` row at a `reauth_*` stage — true, proven both ways on
`postgres:18.4` with all 33 migrations applied — and concluded "PR2 carries no
migration". The authority is not the schema. It is `consistent()` in
`attempts.ts`, which revision 1 never read, and which refuses that row on BOTH
the read path (`load()`) and the write path (`save()`). Measured through the
real `createAttempts(...).read()`, one row, three stages, nothing else varied:

    signin@confirm            -> READ OK
    signin@reauth_authorize   -> THREW attempt_expired
    signin@reauth_exchanging  -> THREW attempt_expired

**And two consequences revision 1 missed.** `attemptProvider()` is
`a.stage.startsWith("reauth_") ? a.existingProvider! : a.targetProvider` — a
non-null assertion over a column the CHECK forces NULL for signin, so the
second callback's `attemptProvider(a) !== provider` guard rejects BOTH
providers with `invalid_proof`. And revision 1's "decision 2c" named the wrong
arm of `accept()`: `reauth_exchanging` is tested FIRST with an early return,
and its first statement dereferences `a.originalSessionId!`.

**James ruled the ordering: the confirmation comes AFTER the proof** (2026-09-14).
The rower proves their usual account first, then sees what is about to be
attached, because a confirmation is a control only when the account owner is the
one reading it. Revision 1 put it first and defended that with `binding_hash`,
which collapses the attack to one device and two people — and therefore puts the
attacker in front of the confirmation. NIST SP 800-63C-4 §3.8.1 endorses the
shape ("the RP SHALL require an authenticated session with the subscriber
account for all linking functions"); nothing found in nine sources addresses
consent ORDERING, so this was a judgment call and is recorded as one.

**The RFC 9700 citation is withdrawn.** The spec, revision 1 of this plan and
`HANDOFF-2026-09-14-apple-login-leftovers.md` all cite RFC 9700 for "the OAuth
pre-account-linking attack". It contains no such section. Measured twice,
independently: `curl https://www.rfc-editor.org/rfc/rfc9700.txt` is 2569 lines,
`grep -ci linking` is 0, and all four `account` hits are the idiom "take into
account". The repo's four PRIOR RFC 9700 citations are real sections, which is
what made the transfer plausible (RF16's second corollary). Replaced by NIST SP
800-63C-4 §3.8.1 and by Sudhodanan & Paverd, *Pre-hijacked Accounts*, USENIX
Security 2022 §6.2.2.

## The design

The second exchange's identity is **consumed, never stored**. That is what
makes confirm-after affordable: the attempt keeps carrying the Apple identity in
its single set of `verified_*` columns, while the usual provider's subject is
used once, inside the transaction, to resolve the account and mint a session the
attempt then ADOPTS.

Once the attempt holds a session, `finalize()` does the attach **unchanged**.
The spec's condition 1 says its `currentSessionId === a.originalSessionId`
binding "does not exist here and must be replaced". It does not need replacing.
It needs earning.

### The migration

One `ALTER TABLE`, widening the `signin` arm of `auth_attempts_session_check`.
The arm today is:

    (purpose='signin' and original_session_id is null and existing_provider is null)

It becomes a two-state arm: both columns NULL before the follow-through, both
set after it, and never one without the other.

    (purpose='signin' and (
       (original_session_id is null and existing_provider is null) or
       (original_session_id is not null and existing_provider is not null
        and existing_provider <> target_provider)))

Setting `existing_provider` on the follow-through is what makes
`attemptProvider()` correct for the second leg with no change to it, and the
`<>` clause carries over the link arm's own rule that the two providers differ.

**STORED SHAPE. The DBA gate applies at plan and at PR, and the TRIAD's full
treatment with it.** Two consequences the antagonist named and did not trace,
which the DBA gate must:

1. `auth_attempts_link_session_unique` — unique on `original_session_id` where
   not null — begins covering signin rows.
2. `bound()` starts locking the session row for these attempts, so
   `original()`'s lock-order comment starts applying to this path.

### The three edits in `attempts.ts`

1. **`consistent()`** — widen the signup rule so a signin attempt may sit at
   `reauth_authorize`, `reauth_exchanging` and `link_ready`, AND extend its
   `verified` clause to those stages. Without the second half the machine stops
   requiring the carried `verified_*` columns at exactly the stages the design
   needs them to survive. This is the module's central invariant guard; editing
   it is TRIAD-weight work in the machine, which is the cost that moved out of
   the schema and did not disappear.
2. **`attemptProvider()`** — unchanged, provided the migration lets the
   follow-through write `existing_provider`.
3. **`accept()`, the `reauth_exchanging` branch** — a signin arm that runs
   BEFORE the existing `original(tx, a.originalSessionId!, true)`: resolve the
   user by the proven subject, mint a session, adopt it onto the attempt, set
   `reauthenticated_at`, advance to `link_ready`, and leave every `verified_*`
   column alone.

### What the antagonist corrected in the invariants

- **Invariant 2's second clock is decoration and is deleted.** `expires_at` is
  never refreshed on this path and `load()` enforces `expires_at > now()`, while
  `reauthenticated_at >= ` the first exchange — so the second check can never
  bite first, and revision 1's Step 3b prescribed a state the design cannot
  produce. `expires_at` alone holds the lifetime.
- **Invariant 1 is a property, not a gate, at the store layer** — and its gate
  must sit at the ROUTE, because `attachProven` took no session parameter and so
  could not go red for the defect it named.
- **`state` and `nonce` are minted on the follow-through transition**, as the
  lifetime table already required and revision 1's task list omitted.

### Open, and owed to the PM rather than to the code

`accept()`'s `exchanging` arm calls `requireAccess(identity.email)` before the
confirm stage, and the access policy defaults to `restricted`, where an Apple
private-relay address is never on `ALLOWED_EMAILS`. If staging is restricted,
PR2 ships a path nobody can reach until public activation. Settle it against the
live `ACCESS_MODE` before implementation, not after.

## Tasks

Every task ends with a mutation probe that bites, run against a COMMITTED tree
(RF22), anchored on a string grepped and confirmed unique first.

### Task 0: the migration

**Files:** create `app/server/db/migrations/00NN_*.sql` via `pnpm db:generate`;
modify `app/server/db/schema.ts`; test
`app/server/db/schema.integration.test.ts`.

- [ ] **Step 1** — failing test on real Postgres: the four rows the widened arm
      must admit or refuse. Both columns NULL: admitted. Both set with differing
      providers: admitted. `original_session_id` set, `existing_provider` NULL:
      refused, 23514. `existing_provider = target_provider`: refused.
- [ ] **Step 2** — run, confirm the middle two are the ones that fail today.
- [ ] **Step 3** — edit the CHECK in `schema.ts`, run `pnpm db:generate`, and
      confirm it emits exactly one `ALTER TABLE` and no `CREATE TABLE`.
- [ ] **Step 4** — re-run; all four cases hold.
- [ ] **Step 5** — DBA gate on the migration before going further: lock
      behaviour on `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT`, and the
      two untraced consequences named in the design section.
- [ ] **Step 6** — commit.

### Task 1: the machine admits the state

**Files:** modify `app/server/auth/attempts.ts`; test
`app/server/auth/attempts.integration.test.ts`.

- [ ] **Step 1** — failing test: read back a signin attempt at
      `reauth_authorize`, then at `reauth_exchanging`, then at `link_ready`.
      Today all three throw `attempt_expired` from `consistent()`; that is the
      proof this task is needed, and it is the antagonist's own probe.
- [ ] **Step 2** — run, confirm all three fail.
- [ ] **Step 3** — widen `consistent()`'s signup rule.
- [ ] **Step 4** — failing test for the OTHER half: a signin attempt at
      `reauth_exchanging` with `verified_subject` NULL must be refused. Without
      extending the `verified` clause, the machine stops protecting the carried
      identity at exactly the stages that carry it.
- [ ] **Step 5** — run, implement, re-run.
- [ ] **Step 6** — assert `attemptProvider()` returns the USUAL provider for a
      follow-through row, with `existing_provider` set by the migration. No edit
      expected; if one is needed, the migration is wrong.
- [ ] **Step 7** — mutation probe: revert the `verified` clause alone and
      confirm Step 4 goes red while Step 1 stays green. Record the failure.
- [ ] **Step 8** — commit.

### Task 2: the follow-through transition

**Produces:** `followThrough(expected: Attempt): Promise<AttemptResult>` —
`confirm` to `reauth_authorize`, minting `state` and `nonce`, writing
`existing_provider`, leaving `verified_*` and `expires_at` untouched.

- [ ] **Step 1** — failing test: after `followThrough`, read the row back and
      assert the carried `verified_subject` is unchanged, `existing_provider` is
      the usual provider, `expires_at` is byte-identical to its previous value,
      and `state`/`nonce` are both DIFFERENT from their previous values. The
      last one is the replay surface; assert it explicitly.
- [ ] **Step 2** — run, implement, re-run.
- [ ] **Step 3** — failing test: `followThrough` from any stage other than
      `confirm`, and from a `link` or `delete` attempt, throws.
- [ ] **Step 4** — run, implement, re-run.
- [ ] **Step 5** — mutation probe: carry the old `state` forward and confirm
      Step 1 goes red.
- [ ] **Step 6** — commit.

### Task 3: the second exchange resolves, mints, and adopts

**Files:** modify `accept()` in `app/server/auth/attempts.ts`.

- [ ] **Step 1** — failing test on real Postgres, starting UPSTREAM of the
      producer (RF24): an account holding Google; a signin attempt carrying a
      proven Apple subject; drive the SECOND exchange with that account's Google
      identity. Assert the attempt is now `link_ready`, its
      `original_session_id` names a session belonging to that account, and its
      `verified_subject` is STILL the Apple one.
- [ ] **Step 2** — run, confirm it fails inside the existing branch's
      `original(tx, a.originalSessionId!, true)`.
- [ ] **Step 3** — implement the signin arm ahead of that dereference.
- [ ] **Step 4** — failing test: the proven subject belongs to NO account. The
      rower must reach a stated outcome, not a thrown 500.
- [ ] **Step 5** — run, implement, re-run.
- [ ] **Step 6** — failing test: `finalize()` then attaches, UNCHANGED, and the
      account ends holding both subjects with the Apple grant written.
- [ ] **Step 7** — run; expect it to pass without editing `finalize`. If it does
      not, the design's central claim is wrong and the plan returns to James.
- [ ] **Step 8** — mutation probe: forge the proven subject AT the seam, so the
      arm resolves a different account, and confirm Step 1 goes red (RF21's
      cross-seam rule).
- [ ] **Step 9** — commit.

### Task 4: the routes, and invariant 1's gate

**Files:** modify `app/server/auth/frontDoorRoutes.ts`; test
`app/server/auth/frontDoorRoutes.integration.test.ts`.

- [ ] **Step 1** — failing test: `POST .../attempts/:id/follow-through` on both
      surfaces, with NO session, returns an authorize target.
- [ ] **Step 2** — run, implement, re-run.
- [ ] **Step 3** — **invariant 1's real gate, at the layer that can reach it**
      (the antagonist's finding 7): drive the second callback while the client
      holds a live session cookie for a DIFFERENT account, and assert the attach
      follows the PROVEN subject, not the cookie. A route test, never a store
      test — `finalize`'s signature cannot express this.
- [ ] **Step 4** — run, implement, re-run.
- [ ] **Step 5** — mutation probe for Step 3: make the arm resolve the account
      from `req.sessionId` instead of the proven subject, and confirm it goes
      red. This is the one mutation that matters in this task.
- [ ] **Step 6** — commit.

### Task 5: the client, and the copy

**GATE 0 APPLIES AND BLOCKS THIS TASK.** The confirmation is user-visible copy
and now sits after the proof, so the screen is new. James approves the rendered
thing, at phone width, in both orientations, with every colour pairing computed,
before Step 1.

- [ ] **Step 1** — failing test: `useUsualSignIn()` no longer calls
      `cancelActive`. Assert the CONSEQUENCE — the attempt survives and the view
      advances — never the absence of a call.
- [ ] **Step 2** — run, implement, re-run.
- [ ] **Step 3** — failing test: the post-proof confirmation names the provider
      and the carried relay address, from the attempt's `verifiedEmail`, pinned
      as an independent literal.
- [ ] **Step 4** — run, implement, re-run.
- [ ] **Step 5** — failing test: a follow-through that fails leaves a way
      forward. PR #444 just spent a Gate 0 on this screen's dead ends; it does
      not get to grow a new one.
- [ ] **Step 6** — run, implement, re-run.
- [ ] **Step 7** — per-file coverage on both files (RF2).
- [ ] **Step 8** — commit.

### Task 6: the seam leg, and the record

- [ ] **Step 1** — one e2e leg starting at the sign-in screen with NO session,
      through the follow-through, asserting the account afterwards holds both
      providers.
- [ ] **Step 2** — run against an already-booted stack; confirm `pnpm build`
      SUCCEEDED before reading any mutation result (RF12's corollary).
- [ ] **Step 3** — mutation probe on that leg.
- [ ] **Step 4** — **the RFC 9700 correction**, in all three files that carry
      it: the spec, this plan, and
      `docs/superpowers/HANDOFF-2026-09-14-apple-login-leftovers.md`. Replace
      with NIST SP 800-63C-4 §3.8.1 and Sudhodanan & Paverd, USENIX Security
      2022 §6.2.2, quoting the load-bearing line in each case.
- [ ] **Step 5** — **commit the deletion evidence before citing it.** James
      completed the real-provider deletion on staging 2026-09-14; the account
      row was confirmed absent by a count query. The antagonist correctly
      refused to let the plan tick that ROADMAP row while the only evidence
      lived in a conversation. Record the measurement, THEN tick the row, THEN
      replace the spec's "Claim limits" paragraph.
- [ ] **Step 6** — tick the follow-through row and correct its "a ninth stage in
      an eight-stage machine" premise: the stages are reused, and what the work
      actually costs is a CHECK widening plus an edit to the machine's central
      invariant guard.
- [ ] **Step 7** — record the NIST 800-63C-4 §3.8 notice deviation. The spec's
      "the You screen is the only detection channel" departs from a SHALL
      ("notify the subscriber via a mechanism independent of the transaction",
      800-63B-4 §4.1.2). The deviation may well be right at this cohort; it
      belongs in the record with its citation beside it.
- [ ] **Step 8** — commit.

---

## Gates

- **Gate 0:** REQUIRED, blocks Task 5.
- **DBA:** REQUIRED at plan (Task 0 Step 5) and at PR. Revision 1 skipped it on
  a claim that turned out to be true about the schema and false about the work.
- **Antagonist:** lens 1 has run (NOT READY, folded here). The design CHANGED
  shape afterwards, and the route through was the antagonist's own INFERENCE
  which it did not build — so Task 3 Step 7 is the falsification test: if
  `finalize()` needs editing, the central claim is wrong and the plan comes back
  to James rather than being patched.
- **Lens 2:** SKIPPED, said aloud — this plan prescribes no code blocks, because
  the controller implements inline (CLAUDE.md's accepted shape) rather than
  handing a transcription to a subagent.
- **PM final-PR gate:** REQUIRED — TRIAD, twice over now (auth AND stored shape).
