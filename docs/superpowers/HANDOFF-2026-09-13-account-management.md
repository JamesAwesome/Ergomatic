# Handoff — Wave A account management, 2026-09-13

Written for a session starting with no memory of this one. Read this, then the
spec. Everything below is either verified in this session or explicitly tagged
as unverified.

## Where things stand in one paragraph

Apple sign-in shipped and is live on staging. Two defects it caused were found
by a real rower within the hour and are fixed and merged. The next piece —
account deletion, unlink, and following through to a link — has an **approved,
hardened spec** and no implementation. It is blocked on nothing for PR1. The
single most valuable thing a human can do next is sign in with Apple **on the
phone**, because that closes a release gate no desk test can.

## What is merged

| PR | What | State |
|---|---|---|
| #425 | Apple sign-in, account creation, explicit linking | MERGED `10ed2c2a`, deployed to staging, `deploy` job green |
| #429 | Name struck from sign-in copy; bfcache fix for dead buttons; ROADMAP rows | MERGED `436c38b8`, main's run green |
| #431 | Spec revision 2 (docs only) | **OPEN — needs review** |

## What is live and PROVEN, versus assumed

**Proven on staging, with database evidence:**

- Apple sign-in works on **web**. One account holds both `apple_sub` and
  `google_sub`; one `apple_grants` row with
  `client_id = haus.waffle.ergomatic.web.staging`.
- Linking works, and it linked two **different** email addresses onto one
  account (`james@wesome.nyc` ↔ `jamestheawesome@gmail.com`), which is the
  design working: identity is the provider subject, never the email.
- Six accounts exist. Only one has Apple.

**NOT proven, and this is the gap that matters:**

- **Apple sign-in on the phone has never run.** Native/web subject continuity is
  therefore untested. If the App ID and the Services ID are not grouped under one
  primary App ID, the same person gets two subjects and silently forks into two
  accounts — `users.email` has no unique constraint, so nothing errors. This is a
  PM release gate and the highest-value next action.

## The decisions that are settled (do not re-litigate)

All James's, 2026-09-13:

1. **Duplicate accounts are resolved by DELETION ONLY.** Merge and one-way
   transfer are both rejected. Merge would additionally require destroying a
   `concept2_links` row, contradicting his own 2026-09-02 ruling.
2. **Graduated confirmation:** reauth to delete; plain confirm for unlink and for
   the link follow-through.
3. **Delete immediately, revoke afterwards, best effort.**
4. **Bounded retry**, and (after hardening) guarded by an Apple-subject check.
5. **Design for multiple containers from the first line** — he may run more than
   one someday.
6. **PR split:** PR1 = deletion + unlink + conflict copy. PR2 = follow-through.
7. **Gmail dots:** leave the allowlist as exact-match. It fails closed.
8. The confirm screen's button hierarchy was raised and then **explicitly
   dropped** — do not reopen it.

## The spec, and what to trust about it

`docs/superpowers/specs/2026-09-13-account-management-design.md`, **revision 2**.

Revision 1 was hardened and came back **NOT READY** with five blocking findings,
three inside its own citations. Revision 2 folds all of them. Its foot carries a
"what revision 1 got wrong" list — read it, because two of those mistakes are the
recurring kind.

**The single most important lesson from this session:** revision 1 quoted Apple
verbatim and presented it as verified, when only the *transcription* had been
checked. The sentence was a **conditional** whose condition we do not meet. A
verbatim quote is not a verified argument. The same discipline then caught a
paraphrased quote coming *back* from the hardening agent.

**Vetted ground** (attacked and held — do not re-attack without new information):
the unlink guard-in-the-`WHERE` shape; that unlink can never strand a live link
attempt (the preconditions are mutually exclusive); that no unlink path exists
today; that eleven FKs cascade directly from `users`; that
`session_logs.workout_id`'s set-null is irrelevant to account deletion.

**Still unknown, and honestly so:** whether a *successful* Apple revoke harms a
re-registered account. Six Apple documents searched; nothing addresses it.

## What to do next, in order

1. **Sign in with Apple on the phone** (human). Closes native/web continuity.
   If it lands on the existing account rather than creating a seventh, the gate
   is closed. This blocks PR2 and nothing else.
2. **Review and merge #431** (the spec).
3. **Write the implementation plan for PR1** via the writing-plans skill. PR1 is
   deletion + unlink + the conflict copy. It carries **two** stored-shape changes
   (a migration widening `auth_attempts.purpose`, and the `apple_revocations`
   outbox), so it needs the DBA gate and a PM final-PR gate.
4. **PR2 only after** the phone test AND PR1, the latter for a security reason:
   unlink is the compensating control that makes a wrong attach recoverable.

## Traps this session hit, so you do not

- **`pnpm exec vitest --project integration` hangs** on container startup in this
  environment. `pnpm test --project integration` works. (Also: `pnpm test
  --project client -- <pattern>` silently runs the whole suite.)
- **A mutation probe's `git checkout --` erased uncommitted work** in a file that
  also held a real edit. Commit before probing, always.
- **node-postgres returns an ARRAY** for a multi-statement query string, and
  `SET LOCAL` only binds inside a transaction. A "bounded" diagnostic written the
  obvious way reads `undefined`, throws, gets swallowed by its own catch, and
  reports a silent zero.
- **A squash-merge orphans later commits** on the branch. Revision 2 had to be
  cherry-picked onto a fresh branch off main.
- **CI green on a PR says nothing about main's post-merge run**, which is where
  `deploy` actually executes.

## Open rows filed on main

Nine in `ROADMAP.md`, all dated, from the PM engagement and the #429 review. The
ones most likely to bite: unlink (dies 2026-10-10), the follow-through (same),
`account_conflict` naming its recovery (2026-09-26), and the fourth denial
surface in `native/signin.ts` that says a third different thing (2026-09-26).

Plus two recorded in the spec rather than the register: a locked-out rower cannot
delete in-app (5.1.1(v) exposure, bounded today by the household cohort), and
Concept2 tokens are never deauthorized at Concept2 on deletion.

## Operational facts worth not rediscovering

- Host is `~/Ergomatic` on `birdsexier`; the compose service is **`postgres`**,
  not `db`, and the role/database both default to **`ergomatic`**.
- One combined pre-deploy check lives in `docs/deploy.md` — it reports counts
  rather than addresses, so its output is safe to paste.
- `APPLE_PRIVATE_KEY` must be **double-quoted** in the host `.env`. Unquoted and
  single-quoted both leave the `\n` literal, and a present-but-invalid key fails
  the boot outright, taking the whole API down rather than just Apple.
- The rate limiter's in-memory store does **not** share across containers, so the
  120/min budget becomes 120 × N. Relevant the moment he scales.
