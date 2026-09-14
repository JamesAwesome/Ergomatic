# Handoff — what is left of the Apple login work, 2026-09-14

Written for a session starting with no memory of this one. **Everything named
here is verified against the repo today, not recalled.** Where something is
unknown, it says so.

## Where things stand in one paragraph

Apple sign-in, account creation, account deletion and sign-in-method removal are
all **shipped and live**: PR1 merged as `638e79eb`, and **v0.48.0 (build 993) is
on TestFlight** carrying Apple sign-in and deletion in one build. The phone gate
closed on 2026-09-13 — Apple sign-in on Kaito landed on the existing account, so
native/web subject continuity is proven. What remains is **one product feature
(PR2), one verification James owes, and six dated rows.** Nothing is blocked on
code that does not exist.

## What shipped, and where to read it

| Thing | Where |
|---|---|
| Apple sign-in, account creation, explicit linking | #425 `10ed2c2a` |
| Two live-staging defects | #429 `436c38b8` |
| Spec revision 2 + first handoff | #431 `be7838aa` |
| **Deletion, unlink, conflict copy** | **#436 `638e79eb`** |
| v0.48.0 release notes | #437 `c77b3792` |
| Two command footguns (agent-config check) | #441, open at time of writing |

**The spec is `docs/superpowers/specs/2026-09-13-account-management-design.md`,
revision 3, and it is authoritative.** Revision 2's transactional outbox
(`apple_revocations`) was **withdrawn by James on 2026-09-13** — revocation is a
synchronous post-commit best-effort call, no table, no retry, no queue. If you
find a document describing an outbox, it is stale; revision 3 is not.

## THE ONE THING JAMES OWES, and why it blocks a claim

**No account deletion has ever completed against real Apple or real Google.**
The re-auth leg has only run against a synthetic provider — the spec says so
under "Claim limits", and the PM gate made it condition 4 of its PASS.

So: **delete one throwaway allowlisted account on staging, on build 993.** Until
that happens, nothing may claim App Review 5.1.1(v) compliance, and #436's PR
body deliberately does not. This is a desk test, not a hardware walk; no walk
gate applies.

## PR2 — the link follow-through

**Unblocked.** Both of its gates are now satisfied: the phone gate closed
2026-09-13, and PR1's unlink shipped in #436 (unlink is the compensating control
that makes a wrong attach recoverable — the dependency was security, not
sequencing).

**What it does.** Today "I already have an account" cancels the attempt and
destroys the verified subject and the Apple grant, so the same screen returns on
every future sign-in — a fresh chance to create a duplicate each time. PR2
carries the confirmed attempt across the second provider's round trip and
attaches the identity.

**It is TRIAD work (auth), so it takes the full cycle.** The spec's §"Following
through to a link (PR2)" lists five conditions, all required together. The two
that will bite:

1. **The second sign-in must be a FRESH authentication inside the attempt**,
   never the reuse of a live cookie or bearer. A `signin`-purpose attempt has
   `original_session_id IS NULL` by CHECK, so `finalize()`'s
   `currentSessionId === a.originalSessionId` binding **does not exist here and
   must be replaced**. Without it, a signed-in session on a shared iPad attaches
   an attacker's subject with one tap and no victim action.
2. **The confirmation names the provider AND the relay address** — for Apple it
   is often an address the victim has never seen, so the discriminating power is
   weakest exactly where permanence is worst.

The security shape is the OAuth pre-account-linking attack (RFC 9700). What
bounds it is `auth_attempts.binding_hash`, a per-attempt secret the client holds,
which forces attacker and victim onto the same client instance. **The
confirmation alone is not sufficient** — revision 1 thought it was.

## The six rows this work filed, all dated

Read them in `ROADMAP.md`; each carries a `· dies · why` clause.

| Row | dies |
|---|---|
| A locked-out rower cannot delete in-app | 2026-10-10 |
| Concept2 tokens never deauthorized at Concept2 | 2026-10-10 |
| A cancelled/discarded attempt's refresh token is never revoked | 2026-10-14 |
| The re-registration name defect, now with no retry in front of it | 2026-10-10 |
| Confirm the `appleAuth` navigation flake is dead | 2026-10-15 |
| Raise the `--rule` hairline (1.47:1) | 2026-10-14 |

**Two carry corrections worth reading before you act on them.** The locked-out
row **overstates its own gap** — only `restricted` mode checks `ALLOWED_EMAILS`,
so `ACCESS_MODE=public` retires that path outright, and the requirement does not
bind under restricted at all because an App Review reviewer cannot create an
account to delete. And the flake row was filed as "a watch with no reproduction"
and then **superseded the same day** when the cause was found; it now records the
evidence.

## The flake, and the session that owns the measurement

`e2e/appleAuth.spec.ts:211` was the repo's highest-rate live flake — 3 events in
22 CI jobs, **every one retry-saved, so every job reported green** (RF42). The
flake-hunting session (`Ergomatic - FlakeNukem`) confirmed the cause with a
`playwright-report` page snapshot showing the rower on `/today`.

**#436's `App.tsx` destination guard is the fix.** The mechanism: `App.tsx`
mounts no `<Routes>` while `/api/me` is in flight; `AppRoutes.tsx`'s `path="/"`
is `<Navigate to="/today" replace>`; `<BrowserRouter>` carries no
`useTransitions`, so react-router 7.18.3 wraps its location update in
`React.startTransition` while `/api/me` resolving is an ordinary `setState`. The
session can commit ahead of the pending transition, mounting the route tree
against a stale `/`, where the root redirect replaces the pushed destination.

**They are re-measuring after the merge and will report back.** Do not re-derive
this. Their reporting order, agreed: survivor's screen first (a Today snapshot
refutes the guard, full stop), then the verbatim assertion, then their six
established sibling tests as a contention control, then the suite-wide control
against a pre-merge baseline of 4-6%, and **the rate last, explicitly weakest**.

**Caveat they and I both hold:** #436 changes the mechanism AND adds 199 lines to
that spec file, so the post-merge rate confounds the experiment in both
directions. A clean rate is consistent-with-fixed, never proof.

## Traps, measured this session

- **A `CHECK` constraint does not fire on a cascade `DELETE`** — it cannot inject
  the write failure an RF25 gate needs. Use a `BEFORE DELETE` trigger.
- **`ON CONFLICT DO UPDATE` that leaves the FK column unchanged takes no lock on
  the parent**, so a `FOR UPDATE` on `users` does not serialize writes to
  `apple_grants`. Read grants with `DELETE … RETURNING`, never `SELECT`.
- **A lock-order claim is about the whole transaction.** `deleteAccount` locks
  every session of the owner BEFORE `bound()`, because `bound()` → `original()`
  takes the `users` row first. A concurrency test seeded with ONE session proves
  nothing; with two, the naive order deadlocks and the AUTH transaction is the
  victim.
- **A notes PR makes THREE edits**, and RELEASING.md's §"the one that hides" is
  right: `releasePin.ts`, `news.spec.ts`'s `toHaveCount(N)`, and its `nth()`
  ladder — where the oldest entry needs a NEW assertion or it is silently
  dropped while the ladder still reads correctly. I made one of the three and CI
  caught it.
- **`gh run list --branch main` mixes workflows.** A red "Dependabot Updates" run
  sits next to a green CI run on the same SHA. Check `workflowName` before
  concluding anything about main.
- **`--` scopes neither `pnpm test` nor `pnpm e2e`**, for two different reasons.
  See #441.

## What I could not establish

- Whether a *successful* Apple revoke harms a re-registered account. Spec Open
  Question 1; Apple is silent across six documents. The synchronous design
  narrows the window to ~3s rather than closing it.
- Whether `revokeApple` succeeds against Apple in production at all — nothing has
  exercised it against real Apple.
- Whether `ergomatic.waffle.haus` stays "staging" through public activation.
  `docs/deploy.md` says it is staging and there is no second host.
