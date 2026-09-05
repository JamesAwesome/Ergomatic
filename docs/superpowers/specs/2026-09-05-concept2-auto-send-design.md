# Wave E follow-on — automatic Concept2 sends: OFF · MANUAL · AUTOMATIC

**Rev 2 (2026-09-05).** Rev 1 took the full antagonist pass (TRIAD, phase-open
anchor): eight claims falsified, all folded below, and one product ruling
taken to James (§3.4, "A"). The pass's attacked-and-held claims are this
phase's vetted ground (§7).

## 1 · What and why

Today every Concept2 send is a tap: a rower opens a finished monitor row and
presses Send. This adds a per-rower **sending mode** so a row can go to
Concept2 the moment it is saved, with no tap. The control reads as a
progression — **OFF → MANUAL → AUTOMATIC** — where OFF is the unlinked state,
MANUAL is today's per-row Send, and AUTOMATIC is "the Send button pressed for
you" right after the row saves. The outcome lives on the row's block exactly as
a manual send's does — **and, because a silent failure under AUTOMATIC has
nowhere else to show, the You row also warns when sends are failing** (§3.4).

**Rulings (James, 2026-09-05), not re-opened here:**

1. **OFF = unlinked.** No "linked but paused" state. Once linked the setting is
   binary; OFF on the control is the door to unlink.
2. **AUTOMATIC is silent at save time.** No toast or banner when the row saves.
3. **A fresh link lands in MANUAL.** Automatic is opt-in.
4. **Switching to AUTOMATIC sends rows saved from then on**, never a backlog.
5. **The send fires client-side, right after the row saves**, through the same
   route the Send button uses (approach 1 of three).
6. **Failures under AUTOMATIC surface on the You row** ("A", after the
   antagonist pass): one sticky server-side flag on the link, set when an
   eligible send fails, cleared on the next success; the You row shows it, the
   screen names the reason.

**TRIAD** — two stored shapes (a mode and a failure flag on the link row) and a
number leaving for a third party on a trigger nobody tapped. Full antagonist on
this spec (done, rev 1 → rev 2; a DELTA pass on rev 2's new mechanisms is owed,
§7), PM gate on the PR, and a **Gate 0** for the redrawn card and the You row's
new state.

## 2 · Research record

- **Does the underlying system have the concept?** The question is answered by
  Concept2's API, not by ErgData: `POST /api/users/me/results` accepts a row
  from any client at any time; nothing in it distinguishes a tapped send from
  an automatic one. **Rev 1 cited "an observed ErgData post" for ErgData
  auto-uploading; the cited document says the opposite** (_"not an observed
  ErgData post … remains open"_, INFERENCE). Withdrawn. That ErgData uploads
  automatically is common knowledge and untagged here; it is not load-bearing.
- **Concept2's dedup is real, measured, and is a vendor HEURISTIC, not our
  guard.** PRIMARY (logbook design spec, "Dedup", quoted): _"the Logbook filters
  for duplicate workouts, so will return a Duplicate Entry error if you post a
  workout which has the same date, time and distance as an existing workout"_;
  observed live as `409 Duplicate Result` (PR C's measurement). Its `date`
  granularity is marked "Unknown" in our own notes. **So it is the backstop,
  not the mechanism**: §3.3 gives the send route its own in-process claim so
  two simultaneous sends for one row never both reach the wire.
- **Rate limits:** none (PRIMARY, logbook design spec). One request per saved
  row.
- **Webhooks exist** and are not needed; the send's own response is the
  outcome.
- **One save seam — HELD under attack.** Every log row is created by
  `useLogForm`'s `postLog` (`src/session/LogSession.tsx`), whose 201 path calls
  `onSaved(logId)`. Exactly one `api("/api/logs", …)` in `app/src`; no
  server-side row creation. Fire-and-forget from that path survives the
  navigation `onSaved` performs (HELD: `src/api.ts` attaches no abort to
  unmount).
- **The platform gap, named (RF19).** If iOS suspends or kills the WebView
  between the save and the send, the send does not happen; no instrument here
  can observe how often. The row is saved and shows Send; and since rev 2 the
  You row does NOT warn for this case (nothing reached the server), so it is
  the one automatic failure that stays silent. Stated in the PR body. §4 adds
  the diagnostic that makes the first "automatic isn't working" report
  diagnosable.
- **Migration numbering:** the next index at head is 0024; the plan checks
  open PRs for a competing 0024 and REGENERATES if this branch merges second
  (agent-briefing rule) — the number is not pinned here.

## 3 · The design

### 3.1 Two columns on the link row

`concept2_links` gains:

- `auto_send boolean NOT NULL DEFAULT false` — the mode. Default false is
  ruling 3, and the `DEFAULT` makes every existing link MANUAL with no
  backfill.
- `send_failed_at timestamptz NULL` and `send_failed_reason text NULL` — the
  failure flag (ruling 6): the instant of the most recent eligible-send failure
  and its route error code (`no_weight_class` | `c2_error`), both cleared to
  `NULL` on the next successful send.

**Rollback (RELEASING.md floor):** the previous server ignores unknown columns
(Drizzle selects by name — HELD, measured with `.toSQL()`); the new server
against a DB without them fails at first read, so the migration runs ahead of
the deploy exactly as every additive column here has. Rollback-safe both ways;
the plan adds the RELEASING.md row.

**Read.** `GET /api/concept2/link`'s linked shape gains `autoSend: boolean`,
`sendFailedAt: string | null`, `sendFailedReason: string | null`.
`normalizeLink` carries `autoSend` as `raw.autoSend === true` — absent,
unreadable, `"true"`, `1` all read `false` (A2, fail-closed by construction —
HELD); the failure pair as nullable strings. `LINK_UNAVAILABLE` gains all
three with `false`/`null`/`null`, and its all-fields-literal test gains them
(F6). **Four coordinated edits, not two:** `normalizeLink` + its test,
`LINK_UNAVAILABLE`'s test, `scripts/webauth-contract.test.ts` (pins the link
key set against a literal), and `monitor/Concept2LinkProbe.tsx` (renders the
key set). All named in the plan; the first commit that adds the key without
them is red.

**Write.** One new endpoint, `PATCH /api/concept2/link`, body
`{ autoSend: boolean }`, signed-in and cohort-gated like the router, `204`;
`409 unlinked` with no link row. The router's writes are otherwise unchanged:
the failure flag is written by the SEND route, not by any client.

**Unlink** deletes the row (HELD — `DELETE /link` deletes, not nulls), so both
columns go with it; relink after unlink starts false. **Relink WITHOUT unlink
(F7):** `upsertLink`'s conflict path today preserves every column, so an
account switch (a different `c2_user_id` landing on the same user) would carry
AUTOMATIC onto a different Concept2 account with no tap. **Rule: on the upsert
conflict path, `auto_send` resets to `false` and the failure flag clears when
`c2_user_id` changes; a reconnect of the same account keeps the mode.** Gated
by a store test with both branches.

**Lifetime table (RF27):**

| state | mint | cleared by | survives |
| --- | --- | --- | --- |
| `auto_send` | link row created (false) | `PATCH`; `DELETE /link` (row gone); upsert with a NEW `c2_user_id` (→ false) | every device, relaunch, reconnect of the same account |
| `send_failed_at/_reason` | the send route, on an eligible send's `no_weight_class` or `c2_error` | the send route on the next success; `DELETE /link`; upsert with a new `c2_user_id` | as above |
| `link.autoSend` / `sendFailed*` (client) | each `GET /link` | the next read | per hook instance — mount, foreground, `pageshow` |
| in-flight send claim (§3.3) | the send route, per `logId`, on entry | `finally` on exit | per server process only |

No client-side cache of the mode; the form reads the live link (§3.3).

### 3.2 The control on `/you/concept2` — replaces Unlink

**Placement is forced by RF23.** OFF means unlink (ruling 1); a control beside
the card's `Unlink Concept2` button would be two affordances for one
destructive action. So **the control replaces the Unlink button** in the card's
`.c2-card-act` column. That spends PR A's R6 (the card's markup changes) and
**R8 too — the control is a new tier**, said plainly (F5). Gate 0 draws it.

**The control, when LINKED — three buttons, NOT a radiogroup (F4).** Rev 1
prescribed the `PaceRefInput` roving-tabindex radiogroup idiom; that idiom
commits on arrow, so one arrow key would have armed the unlink and arrows across
MANUAL/AUTOMATIC would have fired a `PATCH` each. The honest shape for a group
whose third member is destructive-armed is **three `<button>`s with
`aria-pressed`**, arrows moving FOCUS only, commit on click / Enter / Space.
(And for the record: four hand-rolled radiogroups already exist, not three.)

- **OFF** — arms the existing two-tap unlink (4-second disarm, the disclosure
  sentence, both kept per the walk-fixes spec's R9). The position does not
  commit until the second tap; disarm returns the pressed state to the current
  mode.
- **MANUAL** — `PATCH { autoSend: false }`.
- **AUTOMATIC** — `PATCH { autoSend: true }`.

**The mode line beneath the control — Gate 0's copy, and it must not promise
what the link cannot keep.** Rev 1's candidate for AUTOMATIC, _"Finished
monitor rows are sent when you save them."_, is wrong in two states the pass
found: **linked-but-`needsReauth`** (every automatic send 409s while the card
above reads `CONCEPT2 STOPPED ACCEPTING THIS LINK`) and **failure-flagged**
(§3.4). The line therefore reads from the same inputs the You row does, and
Gate 0 sees three variants: the promise (healthy), _"Sends are paused until you
reconnect."_ (needsReauth), and the failure line (§3.4). The card's existing
linked helper _"Finished monitor rows can be sent from the log."_ contradicts
AUTOMATIC and is replaced by the mode line (F5); the UNLINKED card's explainer
_"…one row at a time, from the log."_ now describes one of two modes and is a
Gate 0 copy question (smaller item).

**When UNLINKED**, the card is today's (CONNECT). The control is not shown —
nothing to set (ruling 1). The unified pre-link control is named and NOT built
(a new lifetime across the web arm's OAuth unload for one saved tap); Gate 0
draws it once beside the chosen screen so the rejection is a choice.

**Pending / failed writes (A7):** the control is `disabled` while a `PATCH` is
in flight; a non-2xx or throw leaves the pressed state on the SERVER's value
(the hook re-reads the link) and shows _"Couldn't change this. Try again."_

### 3.3 The automatic send — the Send button pressed for you

In `useLogForm`'s 201 path, after `onSaved(logId)`:

```
if (logId !== null && link !== null && link.available && link.linked && link.autoSend) {
  void api(`/api/concept2/results/${logId}`, { method: "POST", body: { tz, trigger: "auto" } });
}
```

- **No client eligibility check (F3).** Rev 1 gated on `isSendable(savedRowShape)`;
  that predicate reads a STORED row's nullable totals, and a form body has
  different fields, so two of its clauses were inert. The server re-derives
  eligibility and is the authority; the client fires for every saved row when
  AUTOMATIC, and a `422 not_eligible` on a manual or timer row is the expected
  answer, swallowed, and does NOT set the failure flag (§3.4). Cost: one 422
  per non-monitor save for an AUTOMATIC rower.
- **The link is the form's own `useConcept2Link()` instance**, mounted with the
  form. If it has not resolved (`link === null`) or failed, **no automatic send
  fires** (A4). The pass could not measure how often a fast submit beats the
  read — no instrument sees it — which is why the `trigger` field exists (§4).
- **Fire-and-forget; navigation is not held** (A5, HELD). The server writes the
  outcome onto the row (`c2_result_id`) or onto the link (the failure flag);
  the row's block and the You row read those on their next mount. No
  client-side outcome state.
- **The in-process claim (F1).** The send route's existing short-circuit
  (`c2_result_id` present → return the stored id) covers a RETRY; it does not
  cover two sends in flight, because both read the row before either writes,
  and there is no lock on `session_logs`. Rev 1 said Concept2's dedup made the
  race harmless — that leans on a vendor heuristic and, when it fires, shows
  the tapping rower `ALREADY THERE` for a row they never sent. **Rule: the
  route holds a per-process `Map<logId, Promise<result>>`; a second caller for
  a `logId` already in the map awaits the first's promise and returns its
  result; the entry clears in `finally`.** One process serves the API, so
  per-process is the whole surface. Deterministic gate (PR #269's lesson): hold
  `client.postResult` on a deferred, issue two requests, resolve once, assert
  Concept2 was called once and both callers got the same `resultId`.
- **`trigger: "auto" | "manual"`** rides the send body for ONE purpose: the
  server's log line names which arm fired (the `rowingActive` pattern the pass
  recommended). Nothing is stored from it; the route's behavior does not branch
  on it (A3 — a send is a send). Without it, the first "automatic isn't
  working" report is undiagnosable, since A3 makes the two indistinguishable by
  design.

### 3.4 Failures under AUTOMATIC — the You row warns (ruling 6, "A")

**The finding (F2):** the log detail's block is the ONLY surface in the client
that renders a row's sent state (`git grep c2ResultId -- src/` → one renderer).
Of the send route's six outcomes, one had a proactive surface (`needs_reauth`,
by way of a server flag set for another reason); the rest were silent from
Today, You and the history. The systematic case is `no_weight_class`: a rower
with no Concept2 declaration and no usable profile weight — the brand-new
account most likely to switch AUTOMATIC on — fails every row, forever,
identically, with no signal. James chose to surface it on the You row.

**Mechanism:** the send route sets `send_failed_at = now()`,
`send_failed_reason = <code>` when an **eligible** send fails with
`no_weight_class` or `c2_error` — regardless of `trigger` (a manual failure
means sends are failing too) — and clears both on any successful send.
`not_eligible` never sets it (not a failure of the link); `needs_reauth` has its
own flag and takes precedence. Client network failure and the iOS gap cannot
set it (nothing reached the server) — the one silent case, named in §2.

**The You row gains a fifth string — `SEND FAILED` — and the decision table of
the walk-fixes spec §5.1 gains a cell class.** Precedence over the retained
link: `needsReauth` → `RECONNECT NEEDED`; else `sendFailedAt !== null` →
`SEND FAILED`; else `linked` → `LINKED ✓`. Both server-sticky states beat a
transient read failure for the reason ruling 5 gave (a read that failed cannot
have cleared them). This is new copy on the row (R1 said the row mints none)
— Gate 0 rules the string and its weight, beside `RECONNECT NEEDED`.

**The screen names the reason.** The mode line (§3.2) in the failure-flagged
state reads from `sendFailedReason` using the block's own strings for that
code (`concept2Send.ts`'s describe map — no new failure copy), e.g. the
no-weight line the block already renders, followed by the block's own remedy
(the OPEN CONCEPT2 PROFILE link-out). Gate 0 draws it.

**The block after an automatic failure** shows UNSENT with Send (the response
was discarded); the reason is on the screen and the row, not the block. Gate 0
draws this beside the manual-failure frame so the difference is approved on
sight.

### 3.5 Invariants

- **A1** — a fresh link is MANUAL; unlink→relink resets; an upsert with a
  different `c2_user_id` resets (F7).
- **A2** — AUTOMATIC requires a literal `true` from the server.
- **A3** — an automatic send is the manual send route with a diagnostic
  `trigger`; no branch on it, no second server send path.
- **A4** — nothing is sent while the form's link read is unresolved or failed.
- **A5** — the send never holds save or navigation; a failed send leaves the
  row saved and sendable.
- **A6** — OFF is the two-tap unlink, arm intact; no key or tap unlinks in one.
- **A7** — the control shows the server's value, never an optimistic one.
- **A8** — the You row's existing four strings are unchanged; it gains exactly
  one, `SEND FAILED`, from a server-sticky flag, with `RECONNECT NEEDED` above
  it and both above `COULDN'T READ`.
- **A9** — no retroactive send.
- **A10** — two concurrent sends for one row reach Concept2 once (§3.3's
  claim), and both callers see the same result.
- **A11** — the failure flag is set only by eligible-send failures the server
  observed, and cleared by the next success; `not_eligible` never sets it.

## 4 · What can and cannot be gated

- **Unit — the setting:** `normalizeLink` `autoSend` `true` → true; absent /
  `false` / `"true"` / `1` → false; `LINK_UNAVAILABLE` literal test gains the
  three fields; `webauth-contract.test.ts` and `Concept2LinkProbe` updated (F6).
  `PATCH`: 204 flips the column; 409 on no link; cohort gate. Mutations: drop
  `=== true` → string case red; drop the not-linked check → red.
- **Unit — upsert (F7):** same `c2_user_id` keeps `auto_send` true; a different
  one resets to false and clears the flag. Mutation: remove the reset → red.
- **Unit — the control:** three `aria-pressed` buttons show the server's value;
  OFF arms (no `DELETE` on first tap, `DELETE` on second, disarm after 4 s);
  MANUAL/AUTOMATIC `PATCH` the right body; arrow keys move focus and fire
  NOTHING (F4 — mutation: make arrows commit → red); a failed `PATCH` shows the
  error line and the pressed state returns to the server's (A7).
- **Unit — the automatic send (RF24, upstream of the producer):** render the
  form with a mocked `api` answering `GET /link` `{…, autoSend: true}` and the
  log POST `201 {id}`; submit; assert `POST /api/concept2/results/<id>` with
  `trigger: "auto"`. Negatives — `autoSend: false`, `link === null`, a failed
  read — assert NO send, each gated on `onSaved` having fired, not on time.
  Mutations: invert the flag → red; drop the null guard → red.
- **Unit — the in-flight claim (A10), deterministic:** deferred
  `client.postResult`; two requests; resolve once; one wire call; equal
  `resultId`s. Mutation: delete the map → two wire calls → red. (Not a
  `Promise.all` race — PR #269.)
- **Unit — the failure flag (A11):** the route on `no_weight_class` sets
  `send_failed_*`; on success clears; on `not_eligible` leaves them untouched;
  on `needs_reauth` sets `needs_reauth_at` only. Mutation each way.
- **Unit — the row's fifth string:** `rowState` gains cells for
  `sendFailedAt` set × `failed` null/set × `needsReauth`; RECONNECT beats
  SEND FAILED beats LINKED; SEND FAILED beats COULDN'T READ. Mutations on each
  ordering.
- **e2e — the seam, two tests:** fake `linked({ autoSend: true })`, log a
  sendable row through the real form, poll `fake.sends` to 1, open the row →
  SENT · RESULT. Then `autoSend: false`, same row, poll `fake.linkReads` past
  the form's read, `fake.sends` stays 0. **The fake gains a PATCH BRANCH**, not
  just a counter — its handler today sends every non-DELETE `/link` request
  down the `linkReads` arm, so an un-branched PATCH would corrupt the very
  poll the negatives gate on (smaller item).
- **e2e — the control and the row:** three positions render; OFF arms without
  DELETE on one tap; AUTOMATIC issues the PATCH (`fake.patches` → 1); with the
  fake's link carrying `sendFailedAt`, the You row reads `SEND FAILED` and the
  screen's mode line names the reason; `design.spec.ts` registers the redrawn
  card's control heights and tap targets in both orientations.
- **The diagnostic (A3/A4):** the server log line carries `trigger`; the PR
  body shows one auto and one manual line from the e2e stack.
- **Captures:** MANUAL, AUTOMATIC, OFF-armed, needsReauth-with-control,
  failure-flagged (card + You row), both orientations, opened and looked at.
- **Cannot be gated:** the iOS suspend gap and how often A4's silence fires;
  Concept2's dedup granularity (vendor heuristic, our backstop only).

## 5 · What a rower sees (Gate 0 owes all of it)

- The redrawn card, LINKED: MANUAL and AUTOMATIC, portrait and landscape,
  beside today's card — the control where Unlink was, the mode line beneath,
  the identity line above.
- OFF **armed**: pressed OFF, the disclosure sentence, the 4-second caption.
- **needsReauth with the control** (smaller item): `RECONNECT CONCEPT2` above,
  the control below, the mode line reading paused — so AUTOMATIC's promise is
  never drawn beside `STOPPED ACCEPTING THIS LINK`.
- **Failure-flagged:** the You row reading `SEND FAILED` beside `RECONNECT
  NEEDED` (weight and colour as numbers), and the screen's mode line naming the
  reason with the block's own remedy.
- UNLINKED: today's card, its explainer's "from the log" copy with the
  alternative wording drawn; the unified pre-link control drawn once beside it.
- The log detail block after an automatic failure (UNSENT, Send) beside the
  manual-failure frame (the reason shown) — the difference approved on sight.
- `ALREADY THERE` is NOT a frame this design produces any more (F1's claim
  removes the race); Gate 0 need not draw it.
- Every pairing as a ratio; every hit target ≥ 44 px.

## 6 · Out of scope, named

- Sending the backlog (ruling 4).
- Per-row failure reason (`c2_last_error`): the link-level flag (§3.4) is the
  ruled answer; per-row storage is a follow-on if the PM wants the block to
  name the reason without a tap.
- The unified pre-link control (§3.2).
- Server-side or queued sends (approaches 2, 3).
- Verification-code display on the MACHINE CONFIRMED block — parked until the
  confirming send proves PR C's codes (own ROADMAP row).
- A multi-process server: the in-flight claim is per-process because one
  process serves the API; if that changes, the claim moves to a DB-level
  conditional update and this line is the tripwire (RF18: a comment naming its
  own precondition).

## 7 · Vetted ground and what is still owed

**Held under the rev 1 pass (14):** the one save seam; fire-and-forget survives
navigation; the row's block reads the row fresh on mount; A2's normalizer is
fail-closed; a 409 duplicate renders correctly in the block; the migration is
rollback-safe both ways (measured); `DELETE /link` deletes the row; the You row
reads `needsReauth` from the server flag; the send route's already-sent
short-circuit covers retries; the 4-second disarm and disclosure sentence stay;
no other unlink affordance exists on the row or the send block; the cohort gate
applies to every router write; `store.get` selects every column; the block's
describe map covers every route error code.

**Owed before the plan:** a DELTA antagonist pass on rev 2's NEW mechanisms —
the in-process claim (§3.3), the failure flag and its precedence on the You
row (§3.4), the `trigger` diagnostic, and the upsert reset (F7). Then Gate 0.
