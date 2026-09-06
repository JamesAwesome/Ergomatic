# Wave E follow-on — automatic Concept2 sends: OFF · MANUAL · AUTOMATIC

**Rev 3 (2026-09-05).** Rev 1 took the full antagonist pass (TRIAD, phase-open
anchor): eight falsified, one ruling to James (§3.4, "A"). Rev 2 took the DELTA
pass on its four new mechanisms: eight more falsified, one ruling to James
(§3.4, `no_weight_class` only). Both folded; the antagonist's own call is that
no third pass is needed. Attacked-and-held claims are §7's vetted ground.

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
   antagonist pass): one sticky server-side flag on the link; the You row shows
   it, the screen names the reason.
7. **Only `no_weight_class` sets that flag** (after the delta pass). `c2_error`
   is the route's retryable family — a transient outage must not warn a rower
   until their next send — and its rows keep their Send button.

**TRIAD** — two stored shapes (a mode and a failure flag on the link row) and a
number leaving for a third party on a trigger nobody tapped. Full antagonist on
this spec (anchor on rev 1, delta on rev 2 — both done, §7), PM gate on the PR,
and a **Gate 0** for the redrawn card and the You row's new state — owed next.

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
  the one automatic failure that stays silent. Stated in the PR body. **No
  instrument sees a send that never fired** — rev 2's `trigger` diagnostic was
  withdrawn for exactly that reason (it could attribute arms only among sends
  that arrived, the case nobody reports).
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
  failure flag (rulings 6, 7): set only when an eligible send fails with
  `no_weight_class`, and the reason column carries the route's **sub-reason**
  (`no_weight` | `unreadable_weight` | `no_gender` — the key the block's own
  copy is chosen by; the route code alone cannot pick a sentence). Both clear
  to `NULL` on every outcome that leaves the row at Concept2 (§3.4) and on
  every relink.

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
(F6). **Four coordinated edits on the wire key set, not two:** `normalizeLink` + its
test, `LINK_UNAVAILABLE`'s test, `scripts/webauth-contract.test.ts` (pins the
key set against a literal), and `monitor/Concept2LinkProbe.tsx` (renders it).
**And every typed `Concept2Link` literal grows three fields** — 26
`logbookBaseUrl:` fixture sites across 11 files in `src`/`e2e`/`scripts`
(measured), plus the e2e fake's `LinkBody`. The plan lists them; the first
commit that adds the key without them is red.

**Write.** One new endpoint, `PATCH /api/concept2/link`, body
`{ autoSend: boolean }`, signed-in and cohort-gated like the router, `204`;
`409 unlinked` with no link row. The router's writes are otherwise unchanged:
the failure flag is written by the SEND route, not by any client.

**Unlink** deletes the row (HELD — `DELETE /link` deletes, not nulls), so both
columns go with it; relink after unlink starts false. **Relink WITHOUT unlink
(F7):** `upsertLink`'s conflict path today preserves every column, so an
account switch (a different `c2_user_id` landing on the same user) would carry
AUTOMATIC onto a different Concept2 account with no tap. **Two rules on the
upsert conflict path, split (delta F4):** `auto_send` resets to `false` only
when `c2_user_id` changes (a reconnect of the same account keeps the mode); the
failure flag clears on **every** upsert, because a relink replaces the grant the
failure was evidence about — the same statement already clears
`needs_reauth_at`, and a flag that survived it would flip the row from RECONNECT
NEEDED straight to SEND FAILED. Expressible in Drizzle (`CASE WHEN
excluded.c2_user_id = concept2_links.c2_user_id …`, emitted and run on a scratch
Postgres, both branches correct). Gated by a store test per branch.

**Lifetime table (RF27):**

| state | mint | cleared by | survives |
| --- | --- | --- | --- |
| `auto_send` | link row created (false) | `PATCH`; `DELETE /link` (row gone); upsert with a NEW `c2_user_id` (→ false) | every device, relaunch, reconnect of the same account |
| `send_failed_at/_reason` | the send route, on an eligible send's `no_weight_class` (sub-reason stored) | the send route on any outcome that leaves the row at Concept2 (200 post, 200 already-sent, 409 duplicate); EVERY upsert; `DELETE /link` | as above |
| `link.autoSend` / `sendFailed*` (client) | each `GET /link` | the next read | per hook instance — mount, foreground, `pageshow` |
| in-flight send claim (§3.3) | the send route, per `userId:logId`, on entry | `finally` on exit — including a THROWN send | per router instance (one process in prod; one per test app) |

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

In `useLogForm`'s 201 path, after `onSaved(logId)`, the form takes **one fresh
link read** and decides on its result (delta F5's deterministic alternative to
"hope the mount-time read won"):

```
const fresh = await readLink();            // the hook's own reload(); resolves to the parsed link or null
if (logId !== null && fresh !== null && fresh.available && fresh.linked && fresh.autoSend) {
  api(`/api/concept2/results/${logId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  }).catch(() => {});                       // fire-and-forget; the row and the link carry the outcome
}
```

**The call is the manual site's shape verbatim** (`Concept2SendBlock.tsx`) —
`api()` takes a `RequestInit`, so a bare `body: {…}` does not typecheck, and
without the `Content-Type` header `express.json()` skips the body and every
automatic send 400s silently (delta F1). §4's gate reads the PARSED wire body.

- **No client eligibility check (F3).** Rev 1 gated on `isSendable(savedRowShape)`;
  that predicate reads a STORED row's nullable totals, and a form body has
  different fields, so two of its clauses were inert. The server re-derives
  eligibility and is the authority; the client fires for every saved row when
  AUTOMATIC, and a `422 not_eligible` on a manual or timer row is the expected
  answer, swallowed, and does NOT set the failure flag (§3.4). Cost: one 422
  per non-monitor save for an AUTOMATIC rower.
- **The decision waits for a fresh read, so it is never made on a stale or
  pending link (A4).** The form mounts `useConcept2Link()` (a `GET /link` on
  every log door — programmed, Just Row, timer, hand entry: four `useLogForm`
  call sites, three of which had no such read before; named as a cost) and,
  after the 201, calls the hook's reload once more and awaits it. A failed read
  → no send. This converts an unobservable silence into a decision; the save's
  own round trip means the extra read costs the rower nothing visible.
- **Fire-and-forget; navigation is not held** (A5, HELD). The server writes the
  outcome onto the row (`c2_result_id`) or onto the link (the failure flag);
  the row's block and the You row read those on their next mount. No
  client-side outcome state.
- **The in-process claim (F1) — and it is a refactor, not a line.** The send
  route's short-circuit covers a RETRY, not two sends in flight (both read the
  row before either writes; no lock on `session_logs`). Rev 1 leaned on
  Concept2's dedup — a vendor heuristic. **Rule: `createConcept2Router` holds a
  `Map<"userId:logId", Promise<{status, body}>>`; a second caller for a key
  already present awaits the first's promise and answers with its result; the
  entry clears in `finally`, including when the send THREW.** Keyed by user as
  well as row (the 200 carries a weight class), scoped to the router instance
  (one process in production — `container_name` in compose makes `--scale`
  impossible, measured; one per test app so route tests do not share a table).
  **The cost, said plainly (delta F7): the upload handler's exits — seventeen
  `res.status(...)` calls over ~585 lines — become a returned `{status, body}`
  the claim can store; the plan sizes that refactor as its own task.** Sharing
  a failure between callers is correct in both directions: a manual tap that
  joins a failing automatic send gets the 422 it can act on.
- **No `trigger` field** (rev 2's diagnostic, withdrawn at the delta pass): a
  client-asserted arm label rides only on sends that ARRIVE, and both silent
  failure modes produce no request. The route stays blind to the arm by design
  (A3); the fresh-read decision above is what replaced "hope" with a branch the
  code takes.

### 3.4 Failures under AUTOMATIC — the You row warns (ruling 6, "A")

**The finding (F2):** the log detail's block is the ONLY surface in the client
that renders a row's sent state (`git grep c2ResultId -- src/` → one renderer).
Of the send route's six outcomes, one had a proactive surface (`needs_reauth`,
by way of a server flag set for another reason); the rest were silent from
Today, You and the history. The systematic case is `no_weight_class`: a rower
with no Concept2 declaration and no usable profile weight — the brand-new
account most likely to switch AUTOMATIC on — fails every row, forever,
identically, with no signal. James chose to surface it on the You row.

**Mechanism (rulings 6 and 7):** the send route sets `send_failed_at = now()`
and `send_failed_reason = <sub-reason>` when an **eligible** send fails with
`no_weight_class` — manual or automatic alike, since a manual failure means
sends are failing too — and **clears both on every outcome that leaves the row
at Concept2:** the 200 post, the 200 already-sent short-circuit, and the 409
duplicate (which records the colliding id) — delta F3: "cleared on success"
enumerated from the branch that SAYS 200 missed the two exits an ErgData user
produces. Also cleared on every relink (§3.1). **`c2_error` does not set it**
(ruling 7): transient, retryable, one branch even means Concept2 accepted the
row; its rows keep their Send button. `not_eligible` never sets it;
`needs_reauth` has its own flag and takes precedence. Client network failure
and the iOS gap cannot set it — the one silent case, §2.

**The You row gains a fifth string — `SEND FAILED` — and the decision table of
the walk-fixes spec §5.1 gains a cell class.** Precedence over the retained
link: `needsReauth` → `RECONNECT NEEDED`; else `sendFailedAt !== null` →
`SEND FAILED`; else `linked` → `LINKED ✓`. Both server-sticky states beat a
transient read failure for the reason ruling 5 gave (a read that failed cannot
have cleared them). This is new copy on the row (R1 said the row mints none)
— Gate 0 rules the string and its weight, beside `RECONNECT NEEDED`.

**The screen names the reason — and that is Gate 0 copy, not a reuse (delta
F2).** The block's three no-weight sentences are chosen by the SUB-reason
(`no_weight` / `unreadable_weight` / `no_gender`), which is why the column
stores it; but those sentences were written for a tap's immediate response, and
a persistent status line on the You screen is a different sentence. Gate 0
sees three variants drawn (one per sub-reason), each followed by the block's
own remedy (the OPEN CONCEPT2 PROFILE link-out).

**The card's own status pill mirrors the row.** Today it says `LINKED ✓` or
`RECONNECT NEEDED`; it gains `SEND FAILED` with the same precedence, so the
row and the card above it never disagree (the delta pass's rider). Gate 0
draws the pill.

**The block after an automatic failure** shows UNSENT with Send (the response
was discarded); the reason is on the screen and the row, not the block. Gate 0
draws this beside the manual-failure frame so the difference is approved on
sight.

### 3.5 Invariants

- **A1** — a fresh link is MANUAL; unlink→relink resets; an upsert with a
  different `c2_user_id` resets (F7).
- **A2** — AUTOMATIC requires a literal `true` from the server.
- **A3** — an automatic send is the manual send route, indistinguishable to
  the server; no second server send path.
- **A4** — the send decision is made on a fresh link read taken after the 201;
  a failed read sends nothing.
- **A5** — the send never holds save or navigation; a failed send leaves the
  row saved and sendable.
- **A6** — OFF is the two-tap unlink, arm intact; no key or tap unlinks in one.
- **A7** — the control shows the server's value, never an optimistic one.
- **A8** — the You row's existing four strings are unchanged; it gains exactly
  one, `SEND FAILED`, from a server-sticky flag, with `RECONNECT NEEDED` above
  it and both above `COULDN'T READ`; the card's pill carries the same string
  with the same precedence.
- **A9** — no retroactive send.
- **A10** — two concurrent sends for one row reach Concept2 once (§3.3's
  claim), both callers see the same result, and a send that THREW releases the
  claim so the next send reaches the wire.
- **A11** — the failure flag is set only by an eligible send's
  `no_weight_class`, and cleared by every outcome that leaves the row at
  Concept2 (200 post, 200 already-sent, 409 duplicate) and by every relink;
  `not_eligible` and `c2_error` never set it.

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
  form with a mocked `api` answering the mount read and the post-201 fresh
  read `{…, autoSend: true}` and the log POST `201 {id}`; submit; assert
  `POST /api/concept2/results/<id>` was called with `method: "POST"`, the JSON
  `Content-Type` header, and a body whose parsed `tz` is a string. Negatives —
  fresh read `autoSend: false`, fresh read failed — assert NO send, gated on
  `onSaved` having fired. Mutations: invert the flag → red; drop the header →
  red (the body assertion sees it).
- **e2e — ONE gate that sees the wire body (delta F1):** the fake's results
  handler records `req.postDataJSON()` (the `connectBodies` idiom) and the
  automatic-send test asserts the parsed body carries a string `tz` — a
  counted send with an unparseable body must NOT pass.
- **Unit — the in-flight claim (A10), deterministic and NOT a race:** deferred
  `client.postResult` that also signals ENTERED; issue request 1; await the
  entered signal; issue request 2; resolve once; assert one wire call and equal
  results. A second case: the first send's `postResult` REJECTS; assert the
  claim cleared and a third request reaches the wire. Mutations: delete the map
  → two wire calls; drop the `finally` → the third request hangs/500s → red.
- **Unit — the failure flag (A11), one row per outcome:** `no_weight_class`
  sets `send_failed_*` with the sub-reason; the 200 post clears; the 200
  already-sent short-circuit clears; the 409 duplicate clears; `not_eligible`
  leaves untouched; `c2_error` leaves untouched; `needs_reauth` sets only
  `needs_reauth_at`. Mutation each way — the duplicate row is the one that
  would have caught delta F3.
- **Unit — the upsert, two branches:** same `c2_user_id` keeps `auto_send`
  AND clears the flag; a different one resets both. Mutation each.
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
- **Captures:** MANUAL, AUTOMATIC, OFF-armed, needsReauth-with-control,
  failure-flagged (card pill + You row + the three reason lines), both
  orientations, opened and looked at.
- **Cannot be gated:** the iOS suspend gap; Concept2's dedup granularity
  (vendor heuristic, our backstop only). No instrument sees a send that never
  fired; the PR body says so instead of claiming one.

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
- `ALREADY THERE` stays a frame: the claim removes OUR self-race, not the
  duplicate outcome, which Concept2's own dedup still produces against a rower
  who also runs ErgData (delta F8). Unchanged from today; not redrawn.
- **The card's pill reading `SEND FAILED`** beside the row's, so they are
  approved as one state.
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

**Held under the rev 2 delta pass (measured):** per-process is structural
(`container_name`; one `.listen`, no cluster); the upsert's conditional
`CASE` is expressible in Drizzle and correct in both branches on a scratch
Postgres; the account-switch path has a supported producer (`/connect` has no
already-linked guard); the fifth row string breaks no existing test and the
decision table grows 11 → 15 cells.

**Gate 0 APPROVED (James, 2026-09-05)** on
`docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-05-autosend.html`
(artifact 5ef07651…), with the page's recommendations: mode-line copy (a) for
both modes; the armed OFF spans the whole control as today's full-width
_Tap again to unlink_ (James, on sight: the third-width label sat off-centre);
needsReauth line _"Sends are paused until you reconnect."_; the three reason
lines with the _"Rows aren't being sent:"_ prefix and the OPEN CONCEPT2 PROFILE
remedy; `SEND FAILED` at `--ink-3` on the row, `--ink` 600 on the card's pill
(the pill's existing `.on` treatment); the unlinked explainer unchanged; the
unified pre-link control not built; UNSENT-without-reason after an automatic
failure accepted. **Next: the plan.**
