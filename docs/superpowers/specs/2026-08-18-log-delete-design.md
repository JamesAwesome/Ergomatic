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
2. **Deletion un-counts the plan, TERMINAL ONLY** (narrowed 2026-08-18
   after the antagonist proved the counter is positional while a log's
   index is immutable history — un-counting a middle session strands the
   sessions above it): deleting your LATEST plan session un-ticks it;
   deleting an earlier plan session removes the row and keeps the tick —
   the plan counts sessions done, and deleting old history does not
   renumber your plan. Old-cycle logs never touch the counter.
3. **Hard delete.** Two-tap staged confirm, no trash, no undo machinery,
   no new stored state. The confirm copy carries the weight.

## §1 The affordance

| Property | Value |
|---|---|
| Where | The from-the-log view (`/today/log/:id`) ONLY — never on list rows, never on the live post-workout summary (a just-rowed session's remedy is Discard, which already exists there) |
| Placement | Bottom of the view, below the plan footer — last, quiet, away from Edit |
| Idiom | The house staged destructive confirm — `.baseline-confirm`/`.baseline-actions`: first tap stages, copy names the exact consequence, Cancel + confirm pair, 44px targets. **Reconciled 2026-08-18 (Task 2 review handoff):** the pattern is `WorkoutDetail.tsx`'s own **"Replace session"** panel (`replaceStage`), not its delete button — that button moved to the armed-in-place L4 idiom in fix round 1 (DEVIATIONS row 42) and no longer matches this description at all |
| Copy, row carries plan linkage (`plan_key` non-null on the fetched row — client-decidable from the one fetch it already makes) | `This removes the session and its reflection. If it is your latest plan session, the checkmark un-ticks.` confirm button `Delete session` |
| Copy, no linkage | `This removes the session and its reflection.` confirm button `Delete session` |
| Who decides the un-count | THE SERVER, at delete time (antagonist B3: the client cannot evaluate the newest-wins condition from the fetches it has, and cross-device staleness makes advance agreement impossible by construction). The conditional copy promises nothing the server may decline; `DELETE` responds `200 {unCounted: boolean}` and the client's post-delete state reflects what actually happened |
| In-flight | Confirm disabled while the DELETE is in flight; failure re-enables with the server's message — EXCEPT a 404, which means another tab already deleted it: treat as success-and-navigate (antagonist minor: an error toast for an operation that succeeded) |
| After success | Navigate to the origin (`resolveLogBack`'s target — the same origin-faithful rule the back affordance uses); the list/plan refetch shows the row gone |
| Stale deep link after deletion | The existing 5F not-found state (`This session is gone.` with `← LOG`) — already shipped, no new work |

## §2 The API and the un-count rule (TRIAD — the API's first DELETE, and a plan-counter write)

`DELETE /api/logs/:id` — owner-checked, 404 on absence or another user's
row (the GET/PATCH precedent, no existence leak). A second delete of the
same id 404s; the CLIENT treats a confirm-time 404 as success (§1).

**The un-count rule (TERMINAL ONLY — James's narrowed ruling, after
antagonist B1 proved the positional-count orphan).** In the same
transaction as the row deletion, `plan_state.doneN` decrements by exactly
one iff ALL THREE hold:

1. the log's `plan_key` equals the CURRENT `plan_state.planKey` (a
   Switch means old-plan logs never touch the new plan's counter);
2. the log's `plan_index` equals `doneN - 1` EXACTLY — the terminal
   (latest done) session. A middle index never decrements: the counter is
   positional, indexes are immutable history, and un-counting the middle
   would strand every session above it (antagonist B1, proven live).
3. the log is the NEWEST-WINS holder of its `(plan_key, plan_index)` —
   spec 2's own resolution rule. Deleting an OLDER same-index duplicate
   removes the row only.

Consequences, all stated:
- Terminal delete: the checkmark un-ticks, that slot becomes the next
  session to row. An older duplicate at that index (if any) stays plain
  history, reachable from `/today/log` — a today-slot row consults no
  link.
- Non-terminal plan-linked delete: the row goes, the TICK STAYS (the plan
  counts sessions done; deleting old history does not renumber the plan —
  the ruling's own words). The checkmark's link re-points to the
  next-newest same-index log if one exists, else the done row renders
  UNLINKED plain text (spec 2's pre-linkage precedent, already shipped).
- No other write: `plan_key`/`plan_index` on OTHER logs are never
  rewritten (linkage is history, spec 2's rule — upheld, not retracted).

**Transaction shape (antagonist B4 — read-committed makes a split
read-decide-write guard no guard at all; a concurrent Reset/Switch could
drive `done_n` to -1, and -1 reaches user-facing copy as the word
"undefined"):** the transaction takes `SELECT … FROM plan_state WHERE
user_id = $1 FOR UPDATE` first (serializing against `create()`'s upsert,
which already row-locks), and the decrement carries conditions 1+2 in the
UPDATE's own WHERE (`… AND plan_key = $key AND done_n = $index + 1`). The
`GREATEST(done_n - 1, 0)` clamp stays as depth; with the lock and the
WHERE, the floor is unreachable BY CONSTRUCTION and the contract test
asserting unreachability is sound.

- API stays additive-only otherwise; no request body; response
  `200 {unCounted: boolean}` (§1 — the server reports what it did).

## §3 Blast radius, honest

Everything that reads logs updates naturally on refetch, and each gets a
witness: Today's LAST THREE (row gone), history (row gone), plan links
(link gone or re-pointed to the older duplicate), and the LAST DONE
suggestion exclusion — a deleted workout can immediately reappear as
today's suggestion, which is CORRECT and gets a test saying so, not a bug
report later. The localStorage monitor record is untouched (its lifecycle
is the live session's, not the log's).

## §4 Research note (house rule)

- **Mechanism:** REST DELETE with 200-and-report/404 — standard, nothing invented (the 200 body over a bare 204 is B3's server-authoritative report, precedented by the repo's own PATCH returning the row).
  The ONE invented mechanism is the un-count rule (§2), built entirely
  from parts spec 2 already vetted (newest-wins, the linkage-as-history
  rule, the atomic plan_state write pattern); the antagonist pass anchors
  here.
- **Does the system have the concept?** Row deletion: yes, ordinary. The
  plan counter's decrement is OUR assertion on the plan's behalf — the
  plan never had "un-complete a session"; we assert it means "the LATEST
  done slot reopens when its newest record stops existing", terminal only.
- **The accepted remedy gap, named (antagonist B6):** a session with a
  WRONG NUMBER (the Sun-fret class) or logged against the wrong workout
  has exactly one remedy — delete it and re-log by hand — and the re-log
  stamps today's date (`logged_at` is a DB default, not settable), so a
  mistake discovered the next day cannot be re-recorded on its own date,
  and re-logging a non-terminal plan session appends at the top of the
  plan rather than refilling its old slot. For the LATEST session this
  self-heals (delete un-ticks the slot, re-log refills it). ACCEPTED as
  the cost of remove-only; recorded here so the next spec that touches
  log lifecycle starts from it.
- Nothing OS-owned, no wire semantics. Nothing found contradicting;
  recorded per the nothing-found rule.

## §5 Exit criteria

1. Every §1 property has a named passing witness; the copy/decision
   honesty test is a TABLE of server decisions vs rendered outcomes
   (antagonist B5 — a shared imported predicate would be true by
   construction), INCLUDING a state where plan state changed between the
   fetch and the confirm: the copy's conditional wording stays true and
   `unCounted` reports what actually happened.
2. The un-count rule's three conditions each have a red-provable witness:
   terminal newest link decrements; wrong plan key does not; NON-TERMINAL
   index does not (the B1 orphan fixture: two advancing saves, delete the
   first — tick stays, counter unchanged, index-1 session still linked
   and reachable); older same-index duplicate does not.
3. Two e2e legs replace the broken original (antagonist B2 proved its
   fixture drives `doneN` to 0 and the tick vanishes): (a) terminal
   delete — save, delete from the detail view, the checkmark un-ticks and
   the slot reads as today's session; (b) the re-point case — three saves
   (one pre-Reset at index 0, one post-Reset at index 0, one at index 1),
   delete the MIDDLE one (newest holder of index 0, non-terminal): tick
   stays, counter unchanged, the index-0 checkmark now opens the
   pre-Reset log.
4. Deleting a log never mutates any other log's row (contract-suite
   byte-comparison on a bystander row).
5. The §3 suggestion consequence has its test: delete the only log of a
   workout, LAST DONE exclusion releases it.
6. The notes PR line for the next release: you can delete a session from
   its own page; deleting your LATEST plan session un-ticks its checkmark;
   deleting older history never renumbers your plan; AND the accepted gap
   said plainly — re-logging a deleted session stamps today's date, so a
   mistake found the next day can't be put back on its own day (PM gate
   C1: a gap named in a spec is not disclosed until it is in the notes).
8. Implementation note with teeth (the antagonist's operational catch):
   the worktree's compose stack can serve many-commits-stale code — its
   probe found a session_logs with NO plan_key column. Before any e2e of
   this feature, verify the stack serves a schema with the newest columns
   or rebuild; the plan's Task briefs carry this.
7. v0.12.0 clients against this server: unaffected (new route only) —
   stated, no witness needed beyond the additive-API rule.

## §6 Vetted ground inherited

Spec 2's §7-vetted ground carries: newest-wins resolution, linkage as
history (Reset/Switch never rewrite), the atomic plan_state write, the
owner-404 idiom, resolveLogBack's origin rule, the 5F not-found state.
The antagonist pass is FULL (triad: the first DELETE + a counter write),
anchored on §2's three-condition rule and the §1 predicate-agreement row.
