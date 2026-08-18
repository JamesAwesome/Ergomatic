# Deleting a session: the record stays honest by removal, never by rewrite

## What and why

A wrong session — a duplicate save, a test row, a botched attempt — can now
be removed, and removing it un-lies the plan. This closes the gate the PM
filed at PR #121: spec 2 made every log browsable forever while the app
offers no way to correct or remove one. The answer keeps the house
principle intact: nobody edits the machine's numbers ("fix" beyond deletion
was considered and DECLINED — remove-only, James's ruling), but a session
that should never have existed can stop existing, and stop counting.

**James's rulings at the brainstorm (2026-08-18):**

1. **Remove only.** The measured record stays immutable; a wrong number's
   remedy is deleting the session. Re-association (fixing the workout a
   session was logged against) and measured-number editing both declined.
2. **Deletion un-counts the plan** when the deleted log is what a current
   checkmark actually points at; old-cycle logs never touch the counter.
3. **Hard delete.** Two-tap staged confirm, no trash, no undo machinery,
   no new stored state. The confirm copy carries the weight.

## §1 The affordance

| Property | Value |
|---|---|
| Where | The from-the-log view (`/today/log/:id`) ONLY — never on list rows, never on the live post-workout summary (a just-rowed session's remedy is Discard, which already exists there) |
| Placement | Bottom of the view, below the plan footer — last, quiet, away from Edit |
| Idiom | The house staged destructive confirm (`WorkoutDetail.tsx`'s delete is the pattern: first tap stages, copy names the exact consequence, Cancel + confirm pair, 44px targets) |
| Copy, plan-linked (the log currently resolves as a current checkmark's link) | `This removes the session. It stops counting toward your plan.` confirm button `Delete session` |
| Copy, not plan-linked | `This removes the session and its reflection.` confirm button `Delete session` |
| Which copy renders | Decided by the same §2 predicate the server applies, evaluated client-side from the fetched row + current plan state — the two must use the same rule so the warning never promises an un-count the server declines (or vice versa) |
| In-flight | Confirm disabled while the DELETE is in flight; failure re-enables with the server's message; success navigates |
| After success | Navigate to the origin (`resolveLogBack`'s target — the same origin-faithful rule the back affordance uses); the list/plan refetch shows the row gone |
| Stale deep link after deletion | The existing 5F not-found state (`This session is gone.` with `← LOG`) — already shipped, no new work |

## §2 The API and the un-count rule (TRIAD — the API's first DELETE, and a plan-counter write)

`DELETE /api/logs/:id` — owner-checked, 404 on absence or another user's
row (the GET/PATCH precedent, no existence leak). A second delete of the
same id 404s (the row is gone; idempotent in effect, honest in status).

**The un-count rule.** In the same transaction as the row deletion,
`plan_state.doneN` decrements by exactly one iff ALL THREE hold:

1. the log's `plan_key` equals the CURRENT `plan_state.planKey` (a
   Switch means old-plan logs never touch the new plan's counter);
2. the log's `plan_index` is strictly below the current `doneN` (a stale
   future index from a longer pre-Reset cycle cannot decrement);
3. the log is the NEWEST-WINS holder of its `(plan_key, plan_index)` —
   the same resolution rule spec 2 shipped for links — i.e. it is the log
   a current done checkmark actually points at. Deleting an OLDER
   same-index log (a pre-Reset duplicate) removes the row only.

Consequences, stated: the checkmark un-ticks because the counter shrank,
and that slot becomes the next session to row. `doneN` never goes below
zero (condition 2 guarantees a decrement only when `doneN >= 1`). The
deleted log's own `plan_key`/`plan_index` need no tombstone — the row is
gone, and the next-newest same-index log (if any) becomes the checkmark's
link by the existing newest-wins read, which is correct: that older log
really was that plan session's record before the duplicate.

- The decrement is `GREATEST(done_n - 1, 0)`-shaped in SQL only as
  belt-and-braces; condition 2 makes the floor unreachable, and the
  contract test asserts the unreachability rather than relying on the
  clamp.
- No other write: `plan_key`/`plan_index` on OTHER logs are never
  rewritten (they are records of what happened, spec 2's rule).
- API stays additive-only otherwise; no request body; response 204.

## §3 Blast radius, honest

Everything that reads logs updates naturally on refetch, and each gets a
witness: Today's LAST THREE (row gone), history (row gone), plan links
(link gone or re-pointed to the older duplicate), and the LAST DONE
suggestion exclusion — a deleted workout can immediately reappear as
today's suggestion, which is CORRECT and gets a test saying so, not a bug
report later. The localStorage monitor record is untouched (its lifecycle
is the live session's, not the log's).

## §4 Research note (house rule)

- **Mechanism:** REST DELETE with 204/404 — standard, nothing invented.
  The ONE invented mechanism is the un-count rule (§2), built entirely
  from parts spec 2 already vetted (newest-wins, the linkage-as-history
  rule, the atomic plan_state write pattern); the antagonist pass anchors
  here.
- **Does the system have the concept?** Row deletion: yes, ordinary. The
  plan counter's decrement is OUR assertion on the plan's behalf — the
  plan never had "un-complete a session"; we assert it means "the newest
  record of that slot stopped existing", and when it matters (a rower who
  wanted the checkmark kept), the answer is that the checkmark was
  counting a session they chose to delete.
- Nothing OS-owned, no wire semantics. Nothing found contradicting;
  recorded per the nothing-found rule.

## §5 Exit criteria

1. Every §1 property has a named passing witness; the confirm copy
   matches the server's actual un-count decision in both directions
   (a client/server predicate-agreement test).
2. The un-count rule's three conditions each have a red-provable witness:
   current-plan newest link decrements; wrong plan key does not; stale
   future index does not; older same-index duplicate does not (and the
   checkmark re-points to it after the newest is deleted — the §2
   consequence proven end to end).
3. The criterion-2 duplicate case runs as an e2e: save twice into the
   same plan slot (Reset between), delete the newest, the checkmark
   stays ticked and now opens the older log.
4. Deleting a log never mutates any other log's row (contract-suite
   byte-comparison on a bystander row).
5. The §3 suggestion consequence has its test: delete the only log of a
   workout, LAST DONE exclusion releases it.
6. The notes PR line for the next release: you can delete a session from
   its own page; deleting one that counted toward your plan un-ticks it.
7. v0.12.0 clients against this server: unaffected (new route only) —
   stated, no witness needed beyond the additive-API rule.

## §6 Vetted ground inherited

Spec 2's §7-vetted ground carries: newest-wins resolution, linkage as
history (Reset/Switch never rewrite), the atomic plan_state write, the
owner-404 idiom, resolveLogBack's origin rule, the 5F not-found state.
The antagonist pass is FULL (triad: the first DELETE + a counter write),
anchored on §2's three-condition rule and the §1 predicate-agreement row.
