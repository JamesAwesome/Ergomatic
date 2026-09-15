# Handoff — PR2 (the follow-through) with the copy round rolled in

Written for a session starting with no memory of this one. Everything here is
verified against the repo or is a quoted ruling; where something is unknown it
says so.

## Where things stand in one paragraph

**PR2 is the main remaining feature in Wave A and nothing is in front of it.**
James ruled on 2026-09-14 that public sign-up is deferred to a future
"production" phase — *"we're not going public in staging, you can strike that
for now"* — which removed the only row that outranked PR2 and, with it, Wave A's
written exit sentence. PR2's plan exists at revision 3 and is **NOT READY** on
one real design gap: the transport cannot deliver a signed-in session to the
client while a sign-in attempt is still open. Fixing that is an editing pass on
the plan, not a redesign. Four copy rows on the same two screens are being
rolled into the same PR at James's instruction, which means **one Gate 0 covers
all of it**.

## What PR2 is, in one paragraph, because the row's own wording oversells it

Sign in with a provider Ergomatic does not recognise and you get a choice:
create an account, or "I already have an account". Today the second button
cancels the attempt and destroys the verified subject, so the same screen
returns on every future sign-in with that provider. PR2 carries the attempt
through a fresh authentication with the rower's usual provider and attaches the
identity. **It is not a rescue from a dead end** — `SignIn.tsx` has printed the
two-step recovery ("sign in the way you usually do and add {provider} from
You") since #436, and `Add Apple ›` is live on the You methods list. PR2 turns
two steps into one. Price it that way.

## The rulings that are settled — do not re-open

- **The confirmation comes AFTER the proof** (James, 2026-09-14). A confirmation
  is a control only when the account owner is the one reading it. The earlier
  design put it first and defended that with `binding_hash`, which collapses the
  attack to one device and two people — and therefore puts the attacker in front
  of the screen.
- **Public sign-up is deferred** to an unauthored production phase.
- **Duplicate accounts are resolved by DELETION ONLY** (2026-09-13). Merge and
  one-way transfer are both rejected.
- **The copy round rides this PR** (James, 2026-09-15).

## The plan, and the one thing wrong with it

`docs/superpowers/plans/2026-09-14-wave-a-pr2-follow-through.md`, **revision 3**,
on branch `wave-a-pr2`. Three gates ran on it: DBA **PASS WITH ROWS**, PM
**shape approved** (sequencing objection now void, see above), antagonist
**NOT READY**.

**The blocking gap.** The design has the attempt adopt a session minted for the
resolved account, after which the existing `finalize()` does the attach
unchanged. `finalize()` really does work unchanged — every precondition was
walked. But its second argument is `req.sessionId` behind `requireUser`, and
nothing can put that session in the client's hands while the attempt is alive:

- the web callback's attempt-surviving branch never calls `signed()`;
- `result()` returns a session **or** an attempt view, never both;
- `finishSignedIn` nulls `operation.current`, discarding the attempt;
- `AuthStep` makes `SignedIn` and `link_ready` **mutually exclusive union
  members** (`app/shared/auth.ts`).

So `shared/auth.ts` must change twice — once to carry the session beside a live
attempt, once to carry the `profile` the post-proof confirmation needs, since
`view()`'s `link_ready` branch returns no profile at all. **Neither edit is
named in any task.** That is revision 4's job.

**Revision 4 also owes**, all measured: the `consistent()` widening must be
stated ASYMMETRICALLY and its `verified` clause made purpose-qualified, because
the literal wording refuses every link and every delete at the stage they start
at; `requireAccess` before the new `mintSession` call, which would otherwise be
the only mint in the module that skips it; and the session TTL is **60 days**,
not the 30 one folded note claims.

## Vetted ground — attacked and held, do not re-derive

- **`finalize()`'s body needs no edit.** Every precondition but the session
  binding is satisfiable by an adopted-session signin attempt.
- **The migration is right.** A stage-keyed three-state arm on
  `auth_attempts_session_check`, verified seven cases against the real migrated
  schema. The two-state form refuses the state the rower sits in for the whole
  second round trip.
- **Writes must be single statements.** A CHECK is evaluated per statement and
  `save()` writes neither governed column, so the two crossing transitions each
  need their own UPDATE.
- **No deadlock is available** between the follow-through and a concurrent
  delete, proven by held transactions in both interleaves with a control that
  does deadlock.
- **The confirmation ordering holds under attack.** After the second proof the
  reader is the account owner, and an abandoner holds only the session their
  own credential already entitled them to.
- **The migration's cost is immaterial** — 0.564 ms of exclusive lock on a table
  structurally capped at 160 kB — and rollback is clean and loud.
- **Cross-surface subject continuity** closed 2026-09-13 on real hardware.

## The copy round rolling in

Four ROADMAP rows, all on the two screens PR2 already edits. **This is why
rolling them in is right rather than scope creep: they share one Gate 0 with
PR2's confirmation screen instead of needing three separate design gates.**

1. **`Delete account` never says a provider re-auth is coming.** James found it
   running the deletion twice for real. The fix is probably not one sentence —
   disclosing it puts the confirm screen's whole shape in question.
2. **"Apple is now connected. You can sign in either way."** duplicates the row
   beneath it, which already reads CONNECTED. The second sentence does real work
   the row cannot; the first is the duplication.
3. **Naming the "You" screen has no consistent treatment.** Five user-facing
   strings, two quoted by #444 and three not, including `Today.tsx`'s *"You can
   type the other in on You"* — pronoun and screen name in one sentence, neither
   marked. **The treatment is the open question**, not just the inconsistency;
   quotes were James's own suggestion and he flagged the grammar himself.
4. **The `--rule` hairline measures 1.47:1** on `--surface`. Pre-existing,
   decorative, outside WCAG's 3:1 non-text minimum.

## Gates

- **Gate 0 FIRST, before Task 0** — the PM moved it, and the reason is that
  James's confirm-after ruling is the load-bearing input to the whole
  architecture. If the rendered screen sends the confirmation back before the
  proof, the server work is partly wasted. RC-24 is the precedent.
- **DBA at the PR** — stored shape. Its plan gate is discharged.
- **Antagonist** — it has run twice; revision 4 should go back to it only for
  the transport fix, not for the whole plan.
- **PM final-PR gate** — TRIAD.

## Traps measured on 2026-09-14, so you do not re-learn them

- **A conflicting PR gets NO CI run at all**, and `gh pr checks` says "no checks
  reported" — absent, not red. Check `mergeStateStatus` before waiting.
- **A CHECK constraint is not the authority on which rows a state machine
  admits.** `consistent()` in `attempts.ts` is, and it is called from both
  `load()` and `save()`.
- **Testing one arm of a multi-arm CHECK in isolation is sound for refusals and
  unsound for admits.**
- **The denial string cannot tell a deleted account from a stranded one.** Only
  the account count answers it.
- **RFC 9700 contains no account-linking section.** The real primaries are NIST
  SP 800-63C-4 §3.8.1 and Sudhodanan & Paverd, USENIX Security 2022 §6.2.2. The
  spec and the old handoff are corrected; do not reintroduce it.

## What is owed elsewhere, so it is not lost

Wave A's exit sentence describes a stranger installing from TestFlight, and
public sign-up just left the wave. **Whoever closes Wave A rewrites that exit or
says plainly that it moved.** Nothing has been released since v0.48.0; #444's
conflict-recovery copy is tester-visible and untagged.
