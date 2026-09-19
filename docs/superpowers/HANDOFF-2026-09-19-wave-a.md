# Handoff — Wave A after the account submenu

Written for a session starting with no memory of this one. Everything here is
verified against the repo at main `1d31b46a` or is a quoted ruling; where
something is unknown it says so.

## Where things stand in one paragraph

**The ACCOUNT submenu shipped.** PR #474 merged 2026-09-19 as `1d31b46a`; main's
post-merge run including `deploy` is green, so prod serves it. The sign-in
methods list and the delete box left the You screen for a new `/you/account`,
reached by one quiet ACCOUNT row at the top of You's doors group, and
`Delete account` now says the re-auth is coming. **It is NOT released** — James,
2026-09-19: _"Not ready to release."_ The tag stands at v0.50.6 and there is no
notes PR. **Wave A's exit criterion was struck the same day** (below), so the
wave now closes by ruling its remaining rows rather than against a test nobody
can run.

## What shipped in #474, so nobody re-derives it

Option A of the 2026-09-15 Gate 0 (pack: `docs/design/account-submenu-gate0/`,
ruling verbatim at the foot of its README). Spec:
`docs/superpowers/specs/2026-09-18-account-submenu-design.md`.

- `/you/account` (`app/src/you/AccountScreen.tsx`) holds the whole account
  block. `/you/sign-in-methods` is untouched and still flow-only.
- The door and the route read `app/src/you/accountDoor.ts`, and **the two
  predicates deliberately disagree on one state**: the door hides while the
  auth options read is in flight, the route WAITS on it. Refusing on unknown
  bounced every deep link and every OAuth return to `/you`; e2e caught it,
  no client test did.
- `destinationFor` sends terminal link and delete outcomes to `/you/account`.
  **The route and the notice are one fact** — if the list ever moves again,
  that line moves with it, or every one of those notices lands on a screen
  that cannot draw it (finding I1, by a new route).
- A failed `/api/auth/methods` now says so. It used to render nothing, which
  was survivable on You and a dead end behind a door promising a screen. The
  two reads have different lifetimes: options once per document, methods on
  every mount.

**Three lessons worth carrying, all paid for once already:**

- **Moving a control falsifies every sentence that says where it is.** Four
  copy sites named the old place; the first sweep found three. Grep the
  proposition, not the string.
- **A test title is a claim.** One leg still said "sends the rower to You"
  while asserting `/you/account`.
- **Playwright name matching is inexact by default.** The link screen carries
  a header `← CANCEL` and an action-row `Cancel`; `{ name: "Cancel" }` matches
  both and the click dies on strict mode. CI found it, not the local run.

## Wave A's exit criterion is struck, and what replaces it

**James, 2026-09-19: "Strike that exit condition."** It described a stranger
installing from TestFlight, signing up, and deleting in-app — public sign-up,
which he deferred out of the wave on 2026-09-14 (_"we're not going public in
staging … That will be a final 'production' phase, don't worry about authoring
it yet."_). The criterion had been unmeetable since.

**The wave now has no exit criterion until the production phase is authored.**
Its rows stand on their own `dies` dates and it closes when they are ruled.
Do not reinstate a stranger-shaped exit; do not author the production phase
unasked.

## The next priority, and why the others are not it

**Revoke the attempt's `apple_refresh_token` on deletion** (ROADMAP row,
`dies 2026-10-14`). The only remaining Wave A row that is a live defect rather
than a gap or a measurement: a rower holding a second attempt on another
session has that attempt cascade away through `sessions` on
`DELETE FROM users`, taking an unrevoked Apple refresh token with it. The fix
shape is already stated — revoke held attempt tokens inside `deleteAccount`'s
transaction, the way `apple_grants` is handled there.

**It is James's to start.** His 2026-09-14 ruling reserved it as TRIAD twice
(a stored credential's lifetime, and auth), so it carries the antagonist pass
and the DBA gate and does not belong in a fix round.

The rest, with the reason each is not next:

- **Apple private-relay round trip** (`dies 2026-10-10`) — needs a second
  Apple ID. James, 2026-09-14: _"I don't have a second Apple account."_ His
  call, not schedulable.
- **Concept2 deauthorize on deletion** (`dies 2026-10-10`) — a research spike
  first; nobody has established that Concept2 exposes revocation at all.
- **A locked-out rower cannot delete in-app** (`dies 2026-10-10`) — already
  corrected down to an operator misconfiguration with an obvious remedy, and
  the flip that makes 5.1.1(v) bind retires it.
- **Re-registration name defect** (`dies 2026-10-10`) — the real fix is a
  rename surface, which is unscoped product work.
- **Four PR2 leftovers** (all `dies 2026-11-15`): the redirect purpose
  ambiguity, Back landing on `/you` after an attach, the failed-attach notice,
  and `begin()`'s pre-sweep destroying an in-flight follow-through. Small, and
  **the failed-attach notice is now unblocked** — the methods list has settled
  where its clause said it was waiting for.
- **Confirm the `appleAuth` flake is dead** (`dies 2026-10-15`) — a job-log
  sweep, not a code change (RF42: count from JOB LOGS, never the run list).
  Good to pair with anything.
- **"You" naming treatment** (`dies 2026-10-12`) — copy with a design gate.

## Release state

**Recommended and NOT taken: v0.51.0, minor.** A screen moved, a new screen
exists, copy changed on four surfaces. A tester who knows deletion was on You
will look there and not find it, so the note must say where it lives now.
James is not ready; **do not cut the tag without him asking.** When it happens:
notes PR first (RF15 — `git log v0.50.6..main --oneline`, no `--merges`).

## Standing state a new session needs

- **Main checkout clean** at the strike-PR's base; the `account-submenu`
  worktree, its branch and its compose stack (`down -v`) are all gone.
- **The machine is 16 GB and shared.** A concurrent session's compose stack
  pinned memory pressure at warning for about an hour on 2026-09-19 and the
  local-work controller refuses EVERY gate at warning — tests, lint,
  typecheck, and the pre-commit and pre-push hooks. Wait; do not arm retry
  loops (four of them were OOM-killed), do not `--no-verify`, and do not down
  another live worktree's stack. `docker compose -p <project> down` on your
  OWN stack after e2e is the courteous half.
- **One item owed and never written:** a recurring-failure entry for "green
  tests, red job" — an unhandled rejection fails the vitest job while every
  test passes. It hit twice on 2026-09-15. **James has not approved adding
  it**, and instruction-corpus edits take the full cycle, so ask first.
- `docs/superpowers/HANDOFF-2026-09-17-account-submenu.md` is spent — its
  work is merged. Delete it when convenient; it is untracked.

## The sweep, run at this commit

Nothing overdue. The earliest live stamp is `dies 2026-09-26`. Use the
wrap-safe form, never a bare grep:

```
tr '\n' ' ' < ROADMAP.md | grep -oE "dies +20[0-9]{2}-[0-9]{2}-[0-9]{2}" | sort -u
```
