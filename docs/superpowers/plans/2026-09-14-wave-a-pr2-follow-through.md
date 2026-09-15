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

## Revision 4, after the antagonist pass on revision 3 (2026-09-15)

Revision 3 came back **NOT READY** on one gap, and it is a real one: the design
has the attempt adopt a minted session, and **nothing in the wire union or in
either transport can put that session in the client's hands while the attempt is
still alive.** The antagonist's own verdict is that `finalize()` needs no edit —
that still holds — but `finalize()` is reached through `requireUser`, and the
rower has no session to present until the mint that the follow-through performs.
Four independent confirmations, all read in the tree at `45e6843a`:

- **`app/shared/auth.ts`** makes `SignedIn` and `link_ready` MUTUALLY EXCLUSIVE
  members of `AuthStep`, and the `link_ready` member is
  `(AttemptView & { outcome: "link_ready" })` — no session, and **no `profile`**,
  which the post-proof confirmation also needs.
- **`view()` (`frontDoorRoutes.ts:121`)** returns exactly
  `{ ...base, outcome: "link_ready" }`. Only the `confirm` branch carries a
  profile.
- **`result()` (`frontDoorRoutes.ts:150-159`)** answers `signed()` **or**
  `{outcome:"linked"}` **or** `view()`. Never a session beside an attempt.
- **The web callback's attempt-surviving branch (`frontDoorRoutes.ts:~402`)**
  sets the attempt cookie and redirects `?authAttempt=`; it never calls
  `signed()`, so no `Set-Cookie` for the session is emitted on that path at all.
- **The client discards the attempt on a session.** `finishSignedIn`
  (`src/adapters/authFlow.ts:339`) sets `context.operation.current = null`, and
  `acceptStep` returns immediately after calling it (`authFlow.ts:457-459`).

**This is an editing pass, not a redesign.** The design's shape survives; what
was missing is the transport that carries it. Revision 4 names the edits.

### The fifth confirmation, which no gate had found: the client auto-finalizes

`acceptStep`'s `link_ready` branch (`src/adapters/authFlow.ts:476-479`) calls
`finalizeLink` **unconditionally, with no pause.** Today that is right: the only
producer of `link_ready` is a link attempt started from You, where the rower
already consented on the way in. For PR2 it is exactly wrong — a signin
follow-through arriving at `link_ready` would attach the identity with no
confirmation shown, **defeating James's confirm-after-the-proof ruling in the
client while every server test stayed green.** The branch must be qualified by
`step.purpose`, and that qualification is a Task 5 step with its own failing
test.

### The transport edits, named

1. **`app/shared/auth.ts`, edit one — the `link_ready` member carries a
   profile**, so the post-proof confirmation can name what is about to be
   attached. It is the carried (target-provider) identity, not the one just
   proven: the rower is confirming the Apple identity the attempt has held since
   its first exchange.
2. **`app/shared/auth.ts`, edit two — the `link_ready` member carries the
   adopted session** beside the attempt. One declaration both sides compile
   against, so a renamed field is a build error rather than a silently absent
   one (RF33). The web surface's copy of it carries no token — `signed()`
   strips it and sets the cookie (`frontDoorRoutes.ts:144-149`) — and native's
   does, which is the existing asymmetry, not a new one.
3. **`result()` gains the both-at-once case**, and the web callback's
   attempt-surviving branch gains the session `Set-Cookie` it does not emit
   today. Whichever shape these take, the test that decides them is the one in
   Task 4 Step 1: a follow-through's response must leave the client able to call
   `finalize` without a second sign-in.

**None of the three is named in any revision-3 task.** They are added below.

### Three corrections revision 3 carries, all measured

- **The `consistent()` widening is ASYMMETRIC, and revision 3's wording is not.**
  Revision 3 says "widen `consistent()`'s signup rule so a signin attempt may sit
  at `reauth_authorize`, `reauth_exchanging` and `link_ready`". Read literally —
  add those three stages to the `signup` array at `attempts.ts:77` — it
  **refuses every link and every delete at the stage they start at**, because
  the rule is `(purpose === "signin") !== signup` and `begin()` starts both at
  `reauth_authorize` (`attempts.ts:351`:
  `input.purpose === "signin" ? "authorize" : "reauth_authorize"`). The stages
  are SHARED. The rule must admit a signin at the extended set **without**
  refusing a link or a delete there.
- **The `verified` clause must be PURPOSE-QUALIFIED for the same reason.**
  `verified` is `["confirm","link_ready"].includes(stage)` (`attempts.ts:78`).
  Extending it to `reauth_authorize`/`reauth_exchanging` unqualified would
  require `verified_*` columns on a LINK attempt at its first stage, where they
  are legitimately NULL. The carried identity must be required at those stages
  **for a signin**, and not for a link or a delete.
- **The session TTL is 60 days, not 30.** `SESSION_TTL_MS` is
  `60 * 24 * 60 * 60 * 1000` (`app/server/auth/sessions.ts:7`). Revision 3's
  DBA rollback bullet says "a minted session at its 30-day TTL"; corrected in
  place. It matters only as the window over which a reverted migration leaves a
  minted session live, and that window is twice what was written.
- **`requireAccess` goes before the new `mintSession` call.** Both existing
  mints are guarded — `attempts.ts:254` before `256`, and `728` before `729` —
  so an unguarded one in the signin arm would be the only mint in the module
  that skips the access policy, on the one path that reaches it without a
  confirm-stage check. The email to check is the RESOLVED ACCOUNT's, which is
  the account the session is being minted for.

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

**Revision 2 proposed a two-state arm and the DBA gate FAILED it: the design has
THREE states, and the missing one is where the rower spends the entire second
round trip.** While they are away at their usual provider's consent screen, the
attempt sits at `reauth_authorize` with `existing_provider` SET and
`original_session_id` still NULL — no session can exist yet. Measured, both as
an INSERT and as `followThrough`'s real UPDATE from a `confirm` row: refused,
23514. `attemptProvider()` reads `existing_provider` at every `reauth_*` stage
and three `frontDoorRoutes.ts` call sites use it in exactly that window.

The arm is therefore keyed on STAGE, naming all three states:

    (purpose='signin' and (
       (stage in ('authorize','exchanging','confirm')
          and original_session_id is null and existing_provider is null) or
       (stage in ('reauth_authorize','reauth_exchanging')
          and original_session_id is null and existing_provider is not null
          and existing_provider <> target_provider) or
       (stage='link_ready'
          and original_session_id is not null and existing_provider is not null
          and existing_provider <> target_provider)))

The looser alternative — deleting `original_session_id is not null and` from the
revision-2 arm — also admits all five states, and was measured and rejected: it
silently admits `reauth_authorize` with `existing_provider` NULL, which is a
`followThrough` that forgot its write, and `attemptProvider()` then hands `null`
to the authorize-URL builder. The stage-keyed form refuses that, and refuses
`confirm` with `existing_provider` set.

**A CHECK is evaluated PER STATEMENT, so the arm dictates statement
granularity.** Measured: `SET stage='reauth_authorize'` alone raises 23514;
`SET stage=..., existing_provider=...` together succeeds. Same at the other
boundary. `save()` writes neither column, so Tasks 2 and 3 each need their own
single-statement UPDATE. That is the predicate earning its keep, not a cost.

**STORED SHAPE. The DBA gate applies at plan (done, FAIL, folded here) and at
PR, and the TRIAD's full treatment with it.** What it measured, so nothing here
is re-litigated from memory:

- **Lock:** `AccessExclusiveLock`, and it blocks READS as well as writes. The
  whole DROP+ADD transaction is **0.564 ms** at realistic size; the ADD scans at
  ~49 µs per 1,000 rows. `auth_attempts` is CAPPED at ~512 signin rows plus one
  per live session — **160 kB** at that ceiling — so no migration cost on this
  table can matter. It was judged on correctness.
- **The ADD validates against live rows and aborts the whole Drizzle
  transaction if any fails.** One row of each of the 11 states the shipped
  machine can produce was seeded; all validate clean.
- **Rollback is clean and loud.** An older image applies nothing and boots
  (PRIMARY, from Drizzle's own migrator). A hand-written narrowing aborts while
  a widened row is live and succeeds after the 5-minute sweep. No
  `docs/RELEASING.md` floor row is owed. What a revert cannot undo: a minted
  session at its **60-day** TTL (`app/server/auth/sessions.ts:7`; revision 3
  said 30 and was wrong), and `users.apple_sub` if `finalize()` ran.
- **No deadlock is available** between the follow-through and a concurrent
  delete, proven by held transactions in both interleaves with an RF21 control
  that DOES deadlock. But see the two rows below.

### Two consequences the DBA traced, which are now tasks

1. **`begin()`'s pre-sweep deletes an in-flight follow-through.** Its
   `DELETE FROM auth_attempts WHERE original_session_id=$1` exists to dodge
   `auth_attempts_link_session_unique`; the moment a signin attempt can hold a
   session, starting a link or delete from that session silently removes it.
   The end state is benign, the client's attempt id goes stale. And the FK's
   `ON DELETE CASCADE` now lets signout and the expiry sweep reach a signin
   attempt for the first time.
2. **A concurrent account delete raises 23503 and nothing maps it.**
   `transaction()`'s catch converts only 23505 on the two subject uniques, so
   `INSERT INTO sessions` meeting a just-deleted user propagates
   `sessions_user_id_users_id_fk` raw — a 500 where `account_changed` is right.

### The three edits in `attempts.ts`

1. **`consistent()` — THREE edits, not two, and the first two are
   ASYMMETRIC (revision 4).** Admit a SIGNIN attempt at `reauth_authorize`,
   `reauth_exchanging` and `link_ready` **without refusing a link or a delete
   there** — the stages are shared, and `begin()` starts both of those at
   `reauth_authorize` (`attempts.ts:351`), so adding the stages to the `signup`
   array refuses every link and every delete at the stage they start at;
   require the carried `verified_*` columns at those stages **for a signin
   only**, since a link legitimately carries none at its first stage;
   **and widen the separate
   `(stage.startsWith("target_") || stage === "link_ready") && purpose !== "link"`
   clause**, the one added to close RF34's mirror case. The DBA applied only the
   first edit to `consistent()` extracted verbatim and measured the result:
   `reauth_authorize` and `reauth_exchanging` then PASS and `link_ready` STILL
   THROWS. Without the third edit, Task 3 Step 7's falsification test fails and
   would read as the design's central claim being wrong. Without the second half the machine stops
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

**Files:** create `app/drizzle/00NN_*.sql` via `pnpm db:generate` — NOT
`app/server/db/migrations/`, which does not exist; `app/drizzle.config.ts` is
`out: "./drizzle"` and all 33 migrations live there;
modify `app/server/db/schema.ts`; test
`app/server/db/schema.integration.test.ts`.

- [ ] **Step 1** — failing test on real Postgres, SEVEN rows, not four. The
      four revision 2 named, plus the three the DBA added: the follow-through
      middle state (`reauth_authorize`, `existing_provider` set,
      `original_session_id` NULL) ADMITTED — this is the one revision 2's
      predicate refused; `reauth_authorize` with a session already adopted
      REFUSED; `confirm` with `existing_provider` set REFUSED.
- [ ] **Step 2** — run, and confirm the middle state is among the failures.
- [ ] **Step 3** — edit the CHECK in `schema.ts`, run `pnpm db:generate`, and
      confirm it emits exactly one `ALTER TABLE` and no `CREATE TABLE`.
- [ ] **Step 4** — re-run; all SEVEN cases hold, and they are inserted into the
      REAL table, not a scratch one: a bare table carrying only the arm's five
      columns has none of the sibling CHECKs, FKs or the partial unique index,
      and admits two rows this design produces that the real schema refuses
      (23505 on `auth_attempts_link_session_unique`, 23503 on the sessions FK).
- [ ] **Step 5** — DBA gate at PLAN: DONE 2026-09-14, verdict FAIL, folded
      above. What remains for the PR gate is the migration as actually written.
- [ ] **Step 6** — map 23503 on `sessions_user_id_users_id_fk` to
      `account_changed` in `transaction()`'s catch, with a held-transaction test
      rather than a race: a concurrent account delete is the only producer.
- [ ] **Step 7** — commit.

### Task 1: the machine admits the state

**Files:** modify `app/server/auth/attempts.ts`; test
`app/server/auth/attempts.integration.test.ts`.

- [ ] **Step 1** — failing test: read back a signin attempt at
      `reauth_authorize`, then at `reauth_exchanging`, then at `link_ready`.
      Today all three throw `attempt_expired` from `consistent()`; that is the
      proof this task is needed, and it is the antagonist's own probe.
- [ ] **Step 2** — run, confirm all three fail.
- [ ] **Step 2b (revision 4)** — failing test FIRST, before any widening: a
      LINK attempt and a DELETE attempt at `reauth_authorize`, each with
      `verified_*` NULL, read back today. They must STILL read after Task 1.
      This is the guard on the asymmetry: the naive widening (adding three
      stages to the `signup` array at `attempts.ts:77`) makes both of these go
      red, because the rule is `(purpose === "signin") !== signup` and `begin()`
      starts a link and a delete at `reauth_authorize` (`attempts.ts:351`).
      Green now, and green at the end of the task, is the whole assertion.
- [ ] **Step 3** — widen `consistent()`'s signup rule ASYMMETRICALLY: admit a
      signin at the extended stage set without refusing a link or a delete
      there. Re-run Step 2b. Expect `link_ready` to STILL throw after this edit
      alone; that is measured, not a surprise.
- [ ] **Step 3b** — widen the `link_ready && purpose !== "link"` clause, and
      re-run Step 1 expecting all three to read.
- [ ] **Step 4** — failing test for the OTHER half: a SIGNIN attempt at
      `reauth_exchanging` with `verified_subject` NULL must be refused. Without
      extending the `verified` clause, the machine stops protecting the carried
      identity at exactly the stages that carry it. **The clause is
      purpose-qualified (revision 4)** — Step 2b's link attempt at
      `reauth_authorize` carries no `verified_*` and must keep reading.
- [ ] **Step 5** — run, implement, re-run.
- [ ] **Step 6** — assert `attemptProvider()` returns the USUAL provider for a
      follow-through row, with `existing_provider` set by the migration. No edit
      expected; if one is needed, the migration is wrong.
- [ ] **Step 7** — mutation probe: revert the `verified` clause alone and
      confirm Step 4 goes red while Step 1 stays green. Record the failure.
- [ ] **Step 7b (revision 4)** — second mutation probe, on the asymmetry: make
      the widening symmetric (add the three stages to the `signup` array
      outright) and confirm Step 2b goes red while Step 1 stays green. This is
      the one mutation that separates a correct widening from the one revision
      3's wording described.
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
- [ ] **Step 3** — implement the signin arm ahead of that dereference,
      **calling `requireAccess` on the RESOLVED ACCOUNT's email before
      `mintSession` (revision 4)**. Both existing mints are guarded
      (`attempts.ts:254` before `256`, `728` before `729`); an unguarded one
      here would be the only mint in the module that skips the access policy.
- [ ] **Step 3b (revision 4)** — failing test: the resolved account's email is
      outside the access policy, and the follow-through is refused with
      `access_denied` rather than minting. Then a mutation probe removing the
      `requireAccess` call, confirming it goes red.
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

**Files:** modify `app/shared/auth.ts` and
`app/server/auth/frontDoorRoutes.ts`; test
`app/server/auth/frontDoorRoutes.integration.test.ts`.

**Revision 4 added Steps 1b-1d. They are the antagonist's blocking finding:
without them the rower reaches `link_ready` holding no session and cannot call
`finalize` at all.**

- [ ] **Step 1** — failing test: `POST .../attempts/:id/follow-through` on both
      surfaces, with NO session, returns an authorize target.
- [ ] **Step 1b (revision 4)** — failing test on the WEB surface, the one that
      decides the wire shape: drive the second callback to completion and
      assert the response BOTH delivers the session (a session `Set-Cookie`,
      which `frontDoorRoutes.ts:~402`'s attempt-surviving branch does not emit
      today) AND leaves the attempt alive. Then assert the rower can call
      `finalize` with only what that response gave them. **Assert the
      consequence, not the field** — the field shape is whatever makes this
      pass.
- [ ] **Step 1c (revision 4)** — the same on NATIVE, where `signed()` returns
      the token in the body rather than a cookie
      (`frontDoorRoutes.ts:144-149`). The two surfaces' asymmetry is existing;
      the test is what keeps it from becoming a third shape.
- [ ] **Step 1d (revision 4)** — failing test: the `link_ready` view for a
      SIGNIN attempt carries the profile of the CARRIED identity (the target
      provider's, proven in the first exchange), pinned as an independent
      literal. `view()`'s `link_ready` branch returns no profile at all today
      (`frontDoorRoutes.ts:121`); only `confirm` does. Task 5 Step 3 renders it.
      Implement Steps 1b-1d together: they are one edit to `AuthStep`'s
      `link_ready` member in `app/shared/auth.ts`, plus `result()` and the web
      callback branch.
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
- [ ] **Step 6** — name, in a test or a comment with its reason, that `begin()`'s
      pre-sweep and a signout now delete an in-flight follow-through. The end
      state is benign; the stale attempt id is what the client must survive.
- [ ] **Step 7** — commit.

### Task 5: the client, and the copy

**GATE 0 HAS ALREADY RUN** — it blocks Task 0, not this task (see Gates). The
confirmation is user-visible copy and now sits after the proof, so the screen is
new; James approves the rendered thing, at phone width, in both orientations,
with every colour pairing computed as a number, before ANY implementation task
starts. If it has not run, stop here.

- [ ] **Step 1** — failing test: `useUsualSignIn()` no longer calls
      `cancelActive`. Assert the CONSEQUENCE — the attempt survives and the view
      advances — never the absence of a call.
- [ ] **Step 2** — run, implement, re-run.
- [ ] **Step 2b (revision 4) — the client auto-finalizes today, and no gate
      had found it.** `acceptStep`'s `link_ready` branch
      (`src/adapters/authFlow.ts:476-479`) calls `finalizeLink`
      UNCONDITIONALLY. A signin follow-through arriving at `link_ready` would
      attach the identity with NO confirmation shown, defeating James's
      confirm-after-the-proof ruling in the client while every server test
      stayed green. Failing test first: a signin `link_ready` renders the
      confirmation and performs NO attach; a LINK `link_ready` still finalizes
      immediately, unchanged. Qualify the branch by `step.purpose`. Mutation
      probe: drop the qualification and confirm the signin leg goes red.
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
- [x] **Step 4 — DONE, landed ahead of this PR.** The RFC 9700 correction went
      into the spec and the handoff on 2026-09-14 rather than waiting here, on
      the PM's ruling: a dangling citation reads as evidence (RF16), and holding
      the fix inside a TRIAD PR that may not be built for weeks leaves it
      standing for weeks.
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
- [x] **Step 7 — DONE, landed ahead of this PR**, in the spec's corrected
      citation block. Was: record the NIST 800-63C-4 §3.8 notice deviation. The spec's
      "the You screen is the only detection channel" departs from a SHALL
      ("notify the subscriber via a mechanism independent of the transaction",
      800-63B-4 §4.1.2). The deviation may well be right at this cohort; it
      belongs in the record with its citation beside it.
- [ ] **Step 8** — commit.

### Task 7: the copy round riding this PR (revision 4)

Four ROADMAP rows on the two screens PR2 already edits. They ride this PR at
James's instruction (2026-09-15) and share its Gate 0. **Row 1 and row 3 are
open QUESTIONS, not known fixes** — they go into Gate 0 as questions, and
nothing is implemented until James rules.

- [ ] **Step 1 — `Delete account` never says a provider re-auth is coming.**
      James found it running the deletion twice for real. Disclosing it puts the
      confirm screen's whole shape in question, so this is a Gate 0 item, not a
      sentence. Present the screen, not the wording.
- [ ] **Step 2 — the redundant link-success notice.** "Apple is now connected.
      You can sign in either way." duplicates the row beneath it, which already
      reads CONNECTED. The second sentence does work the row cannot; the first
      is the duplication. Failing test on the rendered surface first.
- [ ] **Step 3 — naming the "You" screen has no consistent treatment.** Five
      user-facing strings, two quoted by #444 and three not, including
      `Today.tsx`'s "You can type the other in on You" — pronoun and screen name
      in one sentence, neither marked. **The treatment is the open question**,
      not just the inconsistency; the quotes were James's own suggestion and he
      flagged the grammar himself. Gate 0 decides the treatment, then one sweep
      applies it to all five and a test pins the census count.
- [ ] **Step 4 — the `--rule` hairline measures 1.47:1 on `--surface`.**
      Pre-existing, decorative, outside WCAG's 3:1 non-text minimum. Recompute
      the ratio as a number in the Gate 0 pack and let James decide whether a
      decorative hairline is worth changing.
- [ ] **Step 5** — tick the four rows, and commit.

---

## Gates

- **Gate 0:** REQUIRED, and it runs **FIRST, before Task 0** — the PM moved
  it there and the reason is that James's confirm-after-the-proof ruling is the
  load-bearing input to the whole architecture. If the rendered screen sends the
  confirmation back before the proof, Tasks 0-4 are partly wasted. RC-24 is the
  precedent. It also covers the copy round below, which is why rolling those
  rows in is grouping rather than scope creep: **one Gate 0 instead of four.**
- **DBA:** REQUIRED at plan (Task 0 Step 5) and at PR. Revision 1 skipped it on
  a claim that turned out to be true about the schema and false about the work.
- **Antagonist:** lens 1 has run TWICE (both NOT READY, both folded here).
  **Revision 4 goes back to it for the TRANSPORT fix only** — Task 4 Steps
  1b-1d and Task 5 Step 2b — not for the whole plan; the rest is vetted ground. The design CHANGED
  shape afterwards, and the route through was the antagonist's own INFERENCE
  which it did not build — so Task 3 Step 7 is the falsification test: if
  `finalize()` needs editing, the central claim is wrong and the plan comes back
  to James rather than being patched.
- **Lens 2:** SKIPPED, said aloud — this plan prescribes no code blocks, because
  the controller implements inline (CLAUDE.md's accepted shape) rather than
  handing a transcription to a subagent.
- **PM final-PR gate:** REQUIRED — TRIAD, twice over now (auth AND stored shape).
