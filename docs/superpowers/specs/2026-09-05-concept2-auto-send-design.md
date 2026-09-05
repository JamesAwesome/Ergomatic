# Wave E follow-on — automatic Concept2 sends: OFF · MANUAL · AUTOMATIC

## 1 · What and why

Today every Concept2 send is a tap: a rower opens a finished monitor row and
presses Send. This adds a per-rower **sending mode** so a row can go to
Concept2 the moment it is saved, with no tap. The control has three positions
that read as a progression — **OFF → MANUAL → AUTOMATIC** — where OFF is the
unlinked state (James, 2026-09-05: _"off is unlinked"_), MANUAL is today's
per-row Send, and AUTOMATIC is "the Send button pressed for you" right after
the row saves (James: _"go A"_ — silent; the outcome lives on the row's block
exactly as a manual send's does).

**Rulings already made (James, 2026-09-05), not re-opened here:**

1. **OFF = unlinked.** There is no "linked but paused" state. Once linked the
   setting is binary — manual or automatic — and OFF on the control is the door
   to unlink.
2. **AUTOMATIC is silent.** No save-time toast or banner. The row's Concept2
   block shows SENT · RESULT id, or the same refusal-with-retry the manual
   path shows, whenever the rower opens it.
3. **A fresh link lands in MANUAL.** Nothing leaves the account without a tap
   until the rower flips it. Automatic is opt-in.
4. **Switching to AUTOMATIC sends rows saved from then on**, never the backlog
   of older unsent rows (my recommendation, not objected to).
5. **The send fires client-side, right after the row saves** (approach 1 of
   three, James: _"1 is good"_): it is the same call the Send button makes.

**Why this is TRIAD** — it adds a stored shape (one boolean on the link row),
and it makes a number leave for a third party on a trigger the rower did not
tap. Full antagonist pass on this spec; PM gate on the PR. It also changes what
a rower sees on `/you/concept2` (a new control replaces the Unlink button), so
it carries a **Gate 0**: the rendered control in every state, both
orientations, contrast ratios as numbers, before any implementation task.

## 2 · Research record

- **Does the underlying system have the concept?** Yes. Concept2's own
  ErgData app uploads automatically after a piece (SECONDARY — the logbook
  design spec §"The mapping" records an observed ErgData post; not re-fetched
  here). Concept2's API needs nothing new from us for this: the same
  `POST /api/users/me/results` the manual send uses.
- **Concept2's own guard against double-sends is real and already measured.**
  PRIMARY (logbook design spec, "Dedup", quoted): _"the Logbook filters for
  duplicate workouts, so will return a Duplicate Entry error if you post a
  workout which has the same date, time and distance as an existing workout"_;
  observed live as `409 Duplicate Result` naming the colliding id (PR C's
  measurement, 2026-09-05). Our own guard sits in front of it: the send route
  short-circuits any row already carrying `c2_result_id`. So an automatic send
  that races a manual tap, or a retry after an app kill, cannot create two
  rows at Concept2.
- **Rate limits:** PRIMARY (logbook design spec, "Rate limits: none
  currently"). An automatic send per saved row is one request per row, the
  same volume a diligent manual rower produces.
- **Webhooks exist** (logbook design spec) and are **not needed**: nothing
  here waits on Concept2 telling us anything; the send's own response is the
  outcome.
- **One save seam.** Every log row — programmed, Just Row, timer, manual —
  is created by `useLogForm`'s `postLog` (`src/session/LogSession.tsx`), whose
  201 path calls `onSaved(logId)`. That is the single place an automatic send
  can hook, and it already carries the created row's id, which the send route
  keys on. Confirmed by grep: exactly one `api("/api/logs", …)` in `app/src`.
- **The platform gap, named (RF19).** The send is a second request after the
  save. If iOS suspends or kills the WebView between them, the send does not
  happen. No instrument this repo owns can observe that (the e2e stack is web;
  `src/native/**` is coverage-exempt). **The design accepts it because the
  fallback is exactly today's product:** the row is saved, its block shows Send,
  and the next open of the row is one tap from sent. Nothing is lost; a row is
  merely not yet sent. Stated in the PR body, not as a claim of reliability.
- **Nothing found:** no Concept2 setting for "auto-verify" or server-side
  push; the mode is purely ours.

## 3 · The design

### 3.1 The setting — one boolean on the link row

`concept2_links.auto_send boolean NOT NULL DEFAULT false`. Migration `0024`.
Default false is ruling 3 (a fresh link lands in MANUAL); a `DEFAULT` on the
column is also what makes every existing link row MANUAL with no backfill.

- **Read:** `GET /api/concept2/link` gains `autoSend: boolean` on the linked
  shape. `normalizeLink` (`api/useConcept2Link.ts`) carries it as a required
  boolean — `raw.autoSend === true`, so an old server that does not send the
  key reads as `false` (manual), never as automatic. **Fail-closed by
  construction**: the only way to be automatic is a literal `true`.
- **Write:** one new endpoint, `PATCH /api/concept2/link` with body
  `{ autoSend: boolean }`, signed-in and cohort-gated like the rest of the
  router, `204`. Refuses with `409 not_linked` when there is no link — the
  setting has no meaning without one (ruling 1). **The router grows no other
  write.**
- **Unlink clears it implicitly** — `DELETE /api/concept2/link` deletes the
  row, and the column goes with it. Relinking starts at false (ruling 3).

**Lifetime table (RF27):**

| state | mint | cleared by | survives |
| --- | --- | --- | --- |
| `auto_send` | link row created (false) | `PATCH` (either way); `DELETE /link` (row gone) | server-side: every device, every relaunch, until unlink |
| `link.autoSend` (client) | each `GET /link` | the next read | per hook instance; read on mount, foreground, `pageshow` — the same lifetime as `link.linked` |

There is no client-side cache of the mode. The form reads it from the live link
(§3.3); a stale read costs at most one send that the rower did or did not
expect, and the row's block shows which.

### 3.2 The control on `/you/concept2` — replaces Unlink

**Where it lives is forced by RF23.** OFF means unlink (ruling 1). If the
control sat beside the card's existing `Unlink Concept2` button, the screen
would carry two affordances for one destructive action — the shape RF23 exists
to stop. So **the control replaces the Unlink button** inside the card's
`.c2-card-act` column, and the card's markup changes. That spends PR A's R6
("the card's markup does not change") — knowingly: four committed fixtures
regenerate, the `innerHTML` equality test updates, and `design.spec.ts`'s
control-height table gains the control's rows. **Gate 0 draws the redrawn
card.**

**The control, when LINKED:** a three-position segmented control (the
`PaceRefInput` / `ClassificationCard` roving-tabindex radiogroup idiom —
CLAUDE.md RF8 says reuse it and copy its keyboard tests, not hand-roll a
fourth):

- **OFF** — selecting it **arms** the existing two-tap unlink (ruling 1 makes
  it destructive; the 4-second disarm and the disclosure sentence _"Unlink
  removes this app's access. Rows already sent stay on Concept2."_ both stay,
  per the walk-fixes spec's R9). The position does not commit until the second
  tap; disarming returns the selection to the current mode.
- **MANUAL** — `PATCH { autoSend: false }`. The default; today's behavior.
- **AUTOMATIC** — `PATCH { autoSend: true }`. One line beneath the control
  states the promise in the rower's words (copy is Gate 0's; the spec's
  candidate: _"Finished monitor rows are sent when you save them."_ vs. for
  MANUAL _"Send each row from the log."_).

**When UNLINKED**, the card is unchanged from today: CONNECT TO CONCEPT2. The
control is not shown, because there is nothing to set (ruling 1). **The
alternative — a unified control where tapping MANUAL or AUTOMATIC while
unlinked starts the link with that mode — is named and NOT built:** the chosen
mode would have to survive the web arm's document unload through the OAuth hop,
which means a new lifetime (on the server's `concept2_auth_attempts` row, or in
storage) for a convenience that saves one tap. It is the RF27 shape for a
YAGNI gain; Gate 0 sees the simpler screen. If James wants the unified control,
it is a follow-on with its own lifetime table.

**Pending / failed writes:** while a `PATCH` is in flight the control is
`disabled`, and a non-2xx or thrown write leaves the selection on the SERVER's
value (the hook re-reads the link after the write) and shows one line, _"Couldn't
change this. Try again."_ — never a selection that claims a mode the server did
not accept (RF25: the caller branches on the failure it can see).

**The You row does not change.** It keeps its four strings (walk-fixes spec R1
— the row mints no copy). Whether `LINKED ✓` should read the mode is a Gate 0
copy question; the spec's answer is no: the mode is a preference, not a state
the rower needs warned about, and the row's job is warnings.

### 3.3 The automatic send — the Send button pressed for you

In `useLogForm`'s 201 path, after `onSaved(logId)`:

```
if (logId !== null && link?.available && link.linked && link.autoSend
    && isSendable(savedRowShape)) {
  void sendToConcept2(logId, tz);   // the same POST /api/concept2/results/:logId the block makes
}
```

- **The link comes from `useConcept2Link()`**, mounted by the form (one more
  `GET /link` per log-form mount, the same read You and the log detail already
  make). If the read has not resolved (`link === null`) or failed, **no
  automatic send fires** — silence on uncertainty; the row's block still offers
  Send. Fail-closed.
- **Eligibility is checked twice, and the client check is a courtesy.** The
  client's `isSendable` (pm5 · finished · work totals) avoids a wasted request
  on a manual or timer row; the SERVER route re-derives eligibility and the
  weight class exactly as for a manual send and is the authority. The client
  never decides the row is sendable on its own.
- **Fire-and-forget, and navigation is not held.** `onSaved` navigates to
  Today today; the send is started, not awaited. Its outcome is written by the
  server onto the row (`c2_result_id`, or nothing on refusal), and the row's
  block reads the row on mount — so the block shows SENT, or the refusal, the
  next time the rower opens the row (ruling 2). **No state is added to hold
  the outcome client-side**; the row is the record.
- **The same call, the same server path, the same guards.** The route's
  already-sent short-circuit (`c2_result_id` present → return the stored id)
  and Concept2's 409 dedup make the automatic send idempotent against a manual
  tap that races it and against a retry after a kill.
- **Failure copy is the block's own.** A 422 `no_weight_class`, a 409
  `needs_reauth`, a network error — each renders in the block exactly as a
  manual attempt's would, because it IS a manual attempt's response, stored
  the same way. **One new thing is owed here and is named:** today the block
  learns a failure from the tap's own response in memory. An automatic
  failure's response is discarded (fire-and-forget), so **the block will show
  the row as UNSENT with a Send button, not the refusal reason** — the reason
  surfaces on the rower's next tap. That is honest and un-lossy (the row is
  unsent; Send is right there) but it is a difference from the manual path,
  and Gate 0 sees the frame. If the PM wants the reason preserved, that is a
  stored `c2_last_error` on the row — a second shape, out of scope here and
  filed in §6.

### 3.4 Invariants

- **A1 — a fresh link is MANUAL.** `auto_send` defaults false; relink resets.
- **A2 — automatic requires a literal `true` from the server.** Absent,
  unreadable, or any other value reads as manual.
- **A3 — an automatic send is indistinguishable from a manual one on the
  server**, and is guarded by the same already-sent short-circuit and the same
  eligibility. No new server send path.
- **A4 — nothing is sent while the link read is unresolved or failed.**
- **A5 — an automatic send never holds the save or the navigation**, and a
  failed automatic send leaves the row saved and sendable.
- **A6 — OFF is the two-tap unlink, arm intact.** The control never unlinks
  in one tap.
- **A7 — the control shows the server's value**, never an optimistic one a
  failed write did not land.
- **A8 — the You row is unchanged** (four strings, no mode).
- **A9 — switching to AUTOMATIC sends nothing retroactively.** The hook is on
  the save path only; no scan of unsent rows.

## 4 · What can and cannot be gated

- **Unit — the setting:** `normalizeLink` maps `autoSend` `true` → `true`,
  absent/`false`/`"true"`/`1` → `false` (A2). The `PATCH` route: 204 and the
  column flips; 409 on no link; the cohort gate applies. Mutations: drop the
  `=== true` → the string case passes → red; drop the not-linked check → red.
- **Unit — the control:** the radiogroup renders the server's value; OFF arms
  (no `DELETE` on first tap, `DELETE` on second, disarm after 4 s — the card's
  existing tests, retargeted); MANUAL/AUTOMATIC `PATCH` the right body; a
  failed `PATCH` shows the error line and the selection returns to the
  server's value (A7 — mutation: keep the optimistic value → red). Keyboard
  tests copied from `PaceRefInput` (RF8).
- **Unit — the automatic send (RF24, and it must start upstream of the
  producer):** render the log form with a mocked `api` that answers `GET /link`
  `{…, autoSend: true}` and the log POST `201 {id}`, submit a sendable row, and
  assert `POST /api/concept2/results/<id>` fires; with `autoSend: false`, with
  `link === null` (pending), with a failed link read, and with a non-sendable
  row (source `manual`), assert it does NOT. Mutations: invert the `autoSend`
  check → the false case sends → red; drop the `link === null` guard → the
  pending case sends → red (A4). And the RF21 tell to avoid: the "does not
  send" negatives must wait on the 201 having been processed (`onSaved`
  called), not on time.
- **e2e — the whole seam, one test:** in `e2e/concept2.spec.ts`, with the
  fake link `linked({ autoSend: true })`, log a sendable monitor row through
  the real form and poll `fake.sends` to 1; then open the row and see SENT ·
  RESULT. With `autoSend: false`, log the same row, poll `fake.linkReads` past
  the form's read, and assert `fake.sends` stays 0 — the negative gated on a
  positive observable (the read), per the walk-fixes spec §6.1.
- **e2e — the control:** the three positions render on the screen, OFF arms
  and does not `DELETE` on one tap, AUTOMATIC issues the `PATCH` (the fake
  gains a `patches` counter), and `design.spec.ts` registers the redrawn
  card's control heights and the radiogroup's tap targets in both orientations
  (TESTING.md — a changed screen re-registers).
- **Captures:** the screen in MANUAL, AUTOMATIC, and OFF-armed, both
  orientations, opened and looked at (RF7).
- **What cannot be gated, said plainly:** the iOS suspend-between-save-and-send
  gap (§2). No instrument reaches it; the fallback is today's product. And
  whether a rower *wants* automatic — that is the default (ruling 3), not a
  test.

## 5 · What a rower sees (Gate 0 owes all of it)

- The redrawn card, LINKED, in MANUAL and in AUTOMATIC: the control where
  Unlink was, its one-line promise beneath, the identity line above — portrait
  and landscape, beside today's card.
- The card with OFF **armed**: the control's OFF position selected, the
  disclosure sentence, the 4-second caption — both orientations.
- The card UNLINKED: unchanged from today (CONNECT), shown so the "control
  appears only when linked" decision is approved on sight, and the unified
  alternative is drawn once beside it so the rejection is a choice.
- The log detail's block after an automatic send: SENT · RESULT (identical to
  manual — drawn to show it IS identical), and after an automatic **failure**:
  the block reading UNSENT with Send, no reason (§3.3's named difference),
  beside the manual-failure frame that does show the reason.
- Every colour pairing as a ratio; the radiogroup's hit targets ≥ 44px.
- The You row, unchanged, beside the redrawn screen — so A8 is approved, not
  assumed.

## 6 · Out of scope, named

- **Sending the backlog** when flipping to AUTOMATIC (ruling 4). A follow-on
  if anyone asks; it would need a "send all unsent" affordance with its own
  gate.
- **Preserving an automatic failure's reason on the row** (`c2_last_error`).
  §3.3 names the frame; the PM rules whether the UNSENT-with-Send fallback is
  enough. If not, it is a second stored shape and its own TRIAD PR.
- **The unified pre-link control** (choose the mode while unlinked, then
  link). Named in §3.2 with its lifetime cost.
- **A server-side or queued send.** Approaches 2 and 3, rejected for coupling
  the save to a third party (RF25's shape) and for infrastructure the fallback
  does not need.
- **Verification-code display on the MACHINE CONFIRMED block** (hide the raw
  code, show "verified" once Concept2 accepts it, debug reveal). James's
  request of 2026-09-05, **parked until the confirming send proves PR C's
  codes verify on new rows** — its own ROADMAP row.
- **Showing the mode on the You row** (A8). Gate 0 may reopen it.
