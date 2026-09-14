# Handoff — Wave A account management, 2026-09-13

Written for a session starting with no memory of this one. Read this, then the
spec. Everything below is either verified in this session or explicitly tagged
as unverified.

## Where things stand in one paragraph

Apple sign-in shipped and is live on staging. Two defects it caused were found
by a real rower within the hour and are fixed and merged. **The phone gate
closed 2026-09-13**: Apple sign-in on Kaito landed on the existing account
(`apple_grants` 1 → 2, `users` stayed 6, `with_apple` stayed 1) — native/web
subject continuity is proven, not just designed for. **PR1 — deletion,
unlink, and the conflict copy — is implemented and complete** on branch
`wave-a-pr1` (Tasks 1-5; migration, unlink, deletion, the You-screen UI, the
conflict copy and this record reconciliation all landed and reviewed clean).
It has not yet been opened as a PR against main. The next piece is opening
that PR and getting it reviewed and merged; PR2 (the link follow-through) is
next after that.

## What is merged

| PR | What | State |
|---|---|---|
| #425 | Apple sign-in, account creation, explicit linking | MERGED `10ed2c2a`, deployed to staging, `deploy` job green |
| #429 | Name struck from sign-in copy; bfcache fix for dead buttons; ROADMAP rows | MERGED `436c38b8`, main's run green |
| #431 | Spec revision 2, plus this handoff (docs only) | MERGED `be7838aa` |
| — | PR1: migration, unlink, deletion, You-screen UI, conflict copy | **Complete on `wave-a-pr1`, not yet opened as a PR** |

## What is live and PROVEN, versus assumed

**Proven on staging, with database evidence:**

- Apple sign-in works on **web**. One account holds both `apple_sub` and
  `google_sub`; one `apple_grants` row with
  `client_id = haus.waffle.ergomatic.web.staging`.
- Linking works, and it linked two **different** email addresses onto one
  account (`james@wesome.nyc` ↔ `jamestheawesome@gmail.com`), which is the
  design working: identity is the provider subject, never the email.
- Six accounts exist. Only one has Apple.

**Now also proven, closed 2026-09-13:**

- **Native/web subject continuity.** Apple sign-in on Kaito (native) landed on
  the *existing* web-created account rather than forking a new one:
  `apple_grants` went 1 → 2 (the web grant plus a new native grant on the same
  `user_id`), `users` stayed at 6, and the account's Apple-linked count stayed
  at 1. The App ID/Services ID grouping is correct. This was the PM release
  gate; it is closed.

## The decisions that are settled (do not re-litigate)

All James's, 2026-09-13:

1. **Duplicate accounts are resolved by DELETION ONLY.** Merge and one-way
   transfer are both rejected. Merge would additionally require destroying a
   `concept2_links` row, contradicting his own 2026-09-02 ruling.
2. **Graduated confirmation:** reauth to delete; plain confirm for unlink and for
   the link follow-through.
3. **Delete immediately, revoke afterwards, best effort.**
4. **No retry.** James withdrew the `apple_revocations` outbox this decision
   originally described, later the same day, mid-implementation: revocation is
   synchronous, best effort, one attempt per grant, no queue, no subject
   check. See the spec's "Revocation is synchronous and best effort" section.
5. **Design for multiple containers from the first line** — he may run more than
   one someday.
6. **PR split:** PR1 = deletion + unlink + conflict copy. PR2 = follow-through.
7. **Gmail dots:** leave the allowlist as exact-match. It fails closed.
8. The confirm screen's button hierarchy was raised and then **explicitly
   dropped** — do not reopen it.

## The spec, and what to trust about it

`docs/superpowers/specs/2026-09-13-account-management-design.md`, **revision 3**.

Revision 1 was hardened and came back **NOT READY** with five blocking findings,
three inside its own citations. Revision 2 folds all of them. Revision 3 strikes
the `apple_revocations` outbox revision 2 designed, after James withdrew it
mid-implementation, and replaces it with the three rulings that supersede it
(new section: "Revocation is synchronous and best effort"). Its foot still
carries "what revision 1 got wrong" — read it, with item 2 now noting the
second stored shape it names was itself withdrawn in revision 3.

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

**Steps 1 and 2 of the original list are done: the phone gate closed
2026-09-13 (see above), and #431 (spec revision 2, plus this handoff) merged
as `be7838aa`.** The list below replaces the original rather than extending
it.

1. **Open PR1 as a PR against main** from `wave-a-pr1` (Tasks 1-5, complete
   and reviewed clean task-by-task). It carries the TRIAD twice — a stored
   shape (one, not two: `auth_attempts.purpose` widened; the outbox never
   shipped) and auth — so it needs the DBA gate and a PM final-PR gate before
   merge, and the roadmap hand-back (five new rows Task 5 proposes, plus
   whatever in `ROADMAP.md` is overdue) goes to James in the same message.
2. **James reviews and merges.** No merge on green CI alone where the TRIAD
   gate applies.
3. **After merge:** the release recommendation and the agent-config check
   (both standing rules), and confirm main's own post-merge CI run is green,
   not just the PR's.
4. **PR2 (the link follow-through) starts only after PR1 merges**, for a
   security reason, not a sequencing one: unlink is the compensating control
   that makes a wrong attach recoverable.

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

**Task 5 proposes five more**, still awaiting James's hand-back approval at
PR1's opening (not struck without him): the locked-out rower's in-app deletion
gap and the Concept2 deauthorization gap — both previously recorded only in the
spec, now proposed as register rows too — plus the re-registration name defect
(now with no retry in front of it, a consequence of the outbox's removal), the
three-times-seen `e2e/appleAuth.spec.ts` navigation flake (dies 2026-10-15,
load-bearing because its evidence lives under the git-excluded `.superpowers/`),
and the `--rule` hairline at 1.47:1 on `--surface` (pre-existing, decorative,
outside WCAG's 3:1 non-text minimum, recorded so a later reader does not assume
it was cleared).

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
