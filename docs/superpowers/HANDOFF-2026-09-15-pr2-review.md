# Handoff — PR #453, Wave A PR2, for a fresh review session

Written for a session with no memory of this one. Everything here is verified
against the repo or is a quoted ruling; where something is unknown it says so.

## What you are reviewing, in one paragraph

**PR #453, branch `pr2-follow-through`, head `d60f38ab`, 24 commits, 46 files.**
A rower who signs in with a provider Ergomatic has never seen gets a choice:
create an account, or "I already have an account". Today the second button
cancels the attempt and destroys the identity they just proved, so the same
screen returns on every future sign-in with that provider. This PR carries the
attempt through a second authorization with their usual provider and attaches
the identity. **It turns six steps into three; it is not a rescue from a dead
end** — `SignIn.tsx` has printed the two-step recovery since #436, and still
does. Price it that way.

## Read this before you form an opinion

**The branch is one commit behind `origin/main`** (`1a2ffe41`). Merge before
judging, or your diff includes someone else's work.

**Three gates have run and all three found something real.** Their reports are
summarised below. **Do not re-run them** — what is owed is a THIRD verify pass
on the code review's own findings, because the last two rounds each found a
defect inside the previous round's fix.

**CI at `d60f38ab` was `app` and `e2e` PENDING when this was written.** RF39:
assert the run's `headSha` equals the PR head and its conclusion is `success`
before believing anything about it.

## The review history, because the pattern is the point

| Round | Verdict | The finding that mattered |
|---|---|---|
| PM | NOT NOW, 4 conditions | "Your five rulings are all in" was FALSE (two built, three carried); "nothing ships dark" was BACKWARDS — under `restricted` the allowlist IS the cohort, so this is live for every tester |
| DBA | PASS WITH ROWS | The plan's Task 0 Step 6 (23503 → `account_changed`) shipped UNIMPLEMENTED; measured as a 500 through the real `accept()` against a held delete |
| Code review 1 | CHANGES REQUESTED | **The web follow-through was dead.** `view()` hard-coded `session: null`, the client threw, and because the callback had set the cookie, `me` resolved IN so the error had no surface |
| Code review 2 (verify) | CHANGES REQUESTED | **B1 had MOVED, not closed.** The client now set the view, but `attach_confirm`'s only mount point was `SignIn`, which renders only when signed OUT |
| Code review 3 (verify) | CHANGES REQUESTED, landing only | Giving it a frame silently reversed James's Today ruling — the rower was left on `/you` |

**Five findings, three of them inside a fix for an earlier finding.** That is
the reason a third verify pass is owed rather than a merge.

## What is owed, in order

1. **A third verify pass on the code review's findings**, scoped — not a fresh
   full review. The reviewer's own last word: "B1, B2 and N6 are closed and I
   could not move them again." Confirm that at `d60f38ab`, and confirm the
   `attached` terminal did not introduce a fourth relocation.
2. **CI green at the head SHA.**
3. **James's merge approval.** He has not given it. No PR merges without it.

## Things a fresh session will get wrong unless told

- **`view()` returns the session TOKEN-LESS on purpose.** The browser holds the
  cookie; a bearer in a JSON body is a credential the web surface has never
  needed. Native never takes that path — it resumes through `/proof`.
- **`ownsAttachScreen` includes `busy`, `destinationFor` does not.** The busy
  arm keeps the route's element mounted through the request; routing on it
  would send every signin `busy` to the auth surface. Two failing route tests
  proved that distinction.
- **`attached` is a terminal that DRAWS NOTHING.** It exists so the landing is
  a value tests can assert. `idle` cannot do the job — it is the resting state,
  and routing on it would send a rower home from anywhere the flow resets.
- **The comment on `ownsAttachScreen` documents a wrong reason that was
  corrected.** A signed-in rower CAN be at `busy`/`signin`, because the
  link/delete success redirect omits `authPurpose`. What makes it safe is
  LOCATION, not purpose. The root-cause fix was tried and BACKED OUT — it
  breaks four integration tests that pin the exact redirect location, two about
  stale-callback safety. Filed as a ROADMAP row. **Do not "fix" it without
  reading that row.**
- **Five mutation probes initially reddened NOTHING**, and each was a hole in a
  gate rather than in the code. If you are tempted to trust a green, check it
  can go red.

## Settled rulings — do not re-open

- **Gate 0, five rulings (James, 2026-09-15):** "Not now" is the decline; the
  second sign-in RESETS the 300-second window; the delete re-auth is disclosed
  at the tap; the "You" treatment is "the You tab"; the `--rule` hairline STAYS
  at 1.47:1 with an `--ink-4`-for-meaning policy instead.
- **Landing: Today, signed in, no notice** (Gate 0). Reversed by accident once
  already — see round 3.
- **The account submenu is option A** (James, 2026-09-15), filed as a row and
  NOT built here: it is a navigation change against an auth state machine plus
  a stored shape, which fails the repo's own split test.
- **Public sign-up is deferred** to an unauthored production phase.

## What the PM said that is NOT this PR's business

- **Wave A's exit sentence has been unmeetable since 2026-09-14** and the PM
  wants the rewrite put to James as its own question, not deferred to close.
  Four rows carry `dies 2026-10-12` serving an exit that moved.
- **Release: v0.50.0 recommended on merge** — first tester-visible change since
  v0.49.0, and per the reachability measurement it is visible to everyone
  testing.

## Rows this work filed

Four, all with dates and clauses: the account submenu (2026-10-12); `begin()`'s
pre-sweep destroying an in-flight follow-through (2026-11-15); a failed attach
telling the rower nothing (2026-11-15); the redirect purpose / blank-route
shadow (2026-11-15). Two rows were TICKED: the redundant link notice and the
hairline, both done here.

## Where things live

- Plan: `docs/superpowers/plans/2026-09-14-wave-a-pr2-follow-through.md`,
  **revision 5**.
- Gate 0 packs: `docs/design/pr2-gate0/` and
  `docs/design/account-submenu-gate0/`, each with its rulings recorded.
- Worktree: `/Users/james/projects/github/jamesawesome/Ergomatic-worktrees/wave-a-pr2`.
  Its compose stack is `ergomatic-62979` — tear it down with
  `docker compose -p ergomatic-62979 down -v` at teardown, not `E2E_KEEP=0`.
