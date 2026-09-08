# Optional auto-verification — design

**Status:** DRAFT, revised after a full antagonist pass (TRIAD). Gate 0 not yet
presented, and one question below is owed James before it can be.
**Lens 2 (prescribed code) SKIPPED and on the record:** this spec prescribes no
executable blocks — one type-shape line and one SQL fragment described in
prose. Nothing to paste-test.
**Trigger:** James, 2026-09-07 — auto-verification as a setting the rower turns
on, defaulted off, after Just Row parity (merged #351).
**Supersedes nothing.** PR #336 shipped this behaviour unconditionally and
PR #337 reversed it; this is the same mechanism behind a switch.

## What and why

When you send a row to Concept2, the monitor's own verification code can ride
along, and Concept2 marks the row verified the moment it lands. We shipped
that once and took it away again, because verifying a row is something the
rower does on purpose — Concept2's own app leaves it to them, and doing it for
them is the opposite of the parity this phase is about.

But the code is only typeable on Concept2's website when the row's overall
distance or time hits a ranking standard, and **most rows do not — a claim
nobody has counted** (RF30). The predicate to count it with already exists and
is measured (`concept2OffersVerification`), and the count belongs beside the
gate's copy, since that copy will be judged on it. The reasoning for expecting
it to be true, offered as INFERENCE and not as evidence: the rule reads on
OVERALL distance, work plus rest coast, and rest coast metres are arbitrary, so
any row with rest essentially never lands on a listed figure. So for most
pieces the rower has no way to verify at all, and the code the monitor printed
is dead. This setting gives that back: leave it off and nothing changes; turn
it on and every row we send arrives verified, including the ones the website
would never have offered you a box for.

## The measured ground

Everything below is already in the repo. Nothing here is new research.

**M1. The API verifies against five submitted fields, and rest is not one of
them.** PRIMARY, Concept2's developer documentation, quoted in
`docs/superpowers/research/2026-09-05-c2-verification-code.md`: `date`, `time`,
`distance`, `workout_type` and `machine_type` on the submitted result "must
match that of the code."

**M2. The distance it must match is the MONITOR's total, not our interval
sum.** PRIMARY, live against `log-dev`, 2026-09-05
(`…/2026-09-05-c2-verification-measurement.md`): distance 5706, the monitor's
own 0x0039 total, returned `verified: true`; 5707, a negative control, returned
`false`. Our interval sum 5708 was refused by James's own hand-entry on the
website the day before. **This is already handled** — PR C (#307) made
`buildC2Payload` post `machineWorkMeters`/`machineWorkSeconds` when present.

**M3. The interval array does not interfere.** PRIMARY, same source, follow-up
2026-09-07: arm B (5706 plus three intervals) verified, arm C (5707 plus the
same three intervals) did not. The probe can come back false, so arm B is the
code being checked rather than a well-formed post being rubber-stamped.

**M4. The API ignores the website's own eligibility rule.** PRIMARY,
`…/2026-09-07-c2-verification-field-rule.md`: row 86049 was 200 m — a figure
whose Verification Code field the website never shows — and it is
`verified: true` because the code was posted through the API. **This is the
value of the setting**: it verifies rows the rower could not verify by hand.
**But read it against M10 before pricing it** — the odd distances this most
obviously helps are disproportionately free rows, and free rows cannot be
uploaded at all today.

**M10. Only naturally-finished PROGRAMMED pieces can reach Concept2.**
`eligibilityFailure` refuses anything whose `endedBy !== "finished"`
(`mapping.ts:95`). A free row's only close writes `"rower"` or `"link-lost"`
(`useMonitorSession.ts:5668`); the sole producer of `"finished"` is
`endByMachine` on the driver's `workoutComplete`, and a Just Row never reaches
the terminal state that fires it (`useMonitorSession.ts:2874-2875`, and the
Just Row spec's own 1660-status-frame census: only states 0, 1 and 11 ever
appeared). **`JustRowLog.tsx:332-334` asserts the opposite in a comment** — "a
free row that ends `finished` is as uploadable as any other" — which is
aspirational, and a tripwire this spec is recording rather than stepping over.
Consequence: every eligible row is a programmed piece that finished naturally,
which is why `workout_type` is deterministic (byte 17 reads `08`), and why the
population this setting serves is narrower than M4 alone suggests.

**M5. The website's rule, for the copy's sake.** Same source: the field is
visible if and only if the row's overall distance is one of 100, 500, 1000,
2000, 5000, 6000, 10000, 21097, 42195 or 100000 m, or its overall time is one
of 1:00, 4:00, 30:00 or 60:00 — matched exactly, to the metre and the tenth.
Measured over 21 rows including both boundaries and three negatives.

**M6. A verified row shows no editable form on Concept2.** Same source, side
finding, **n = 1** (row 86028): the page came back with no `distance` input.
Marked as the single observation it is. If it generalises, turning this setting
on trades away the ability to correct those rows on the website, and the gate's
copy owes the rower that sentence.

**M7. The code is only honoured at CREATE.** PRIMARY, measured against
`log-dev` in commit `7ee5c759`, recorded in
`docs/superpowers/specs/2026-09-07-verify-by-hand-design.md`: four arms plus a
control. `PATCH {verification_code}` returned 200 with `verified: false`;
PATCH with all five identifying fields alongside, the same; `POST
/results/{id}`, the same; and the control `POST /results` carrying the code
returned 201 with `verified: true`. The load-bearing sentence: *"Concept2's
developer documentation lists `verification_code` among the update endpoint's
parameters; that is a documentation error, and no error is returned when it is
ignored."* So the setting is **forward-only by force, not by choice**.

**M8. `date` is one of the five checked fields, and it is the PHONE's, not the
monitor's.** Of M1's five, `distance` and `time` are numbers the machine sent
us (PR C posts `machineWorkMeters`/`machineWorkSeconds`, `mapping.ts:520-527`)
and `workout_type` is deterministic on the eligible population (M10). **`date`
is ours**: `completionStamp.ts:42-53` returns `run.completedAt` — the phone's
clock — plus the phone's `Intl` timezone, and `mapping.ts:531` formats that.
The monitor reports its OWN log date and time on the very frame that carries
the code; `parseSummaryLogStamp` decodes 0x0039 offsets 0-3 and
`driver.ts:3316-3332` writes one ring line comparing them. **That comparison
reaches no record, no server and no payload.** It is a free oracle we already
compute and discard.

**M9. The two clocks disagree, measured — and the disagreement is not the
piece's duration.** Seven committed captures carry the ring comparison
(`walk-2026-08-25` ×2, `walk-2026-08-28`, `walk-2026-08-28-codebase-audit` ×2,
`walk-2026-09-03-resume-edge`, `walk-2026-09-04-wave-f`). The monitor's stamp
reads **1.29 to 3.23 minutes EARLIER** than the wall clock at the summary, in
all seven. The obvious innocent explanation — that the stamp is the piece's
START — is falsified by the numbers: subtracting each capture's own elapsed
widens the spread from 116 s to 227 s instead of collapsing it toward zero.
The residual trends upward with date (08-25 ≈ 1.3-2.1 min, 08-28 ≈ 2.2-2.5,
09-03/09-04 ≈ 2.6-3.2), which is what a slowly drifting monitor RTC looks
like. **Caveats, stated:** the wire stamp is minute-granular, so each reading
carries up to 60 s of truncation, and this is one monitor with one owner.

**M9a. And the live test verified anyway — which is evidence, not luck.** The
2026-09-05 arm that returned `verified: true` posted a PHONE-sourced date
against this same monitor. So one of three things is true: Concept2's `date`
check carries at least a few minutes of tolerance, it is not checked as
tightly as the documentation's "must match" implies, or the code does not
encode the monitor's log date at all. **All three are good for this feature**,
and none of them is established. n = 1.

## What this owes

- The setting itself, its storage, and its default.
- A Gate 0 on where it lives and how it reads, per the design-gate rule: this
  is user-visible copy, and M4 and M6 both have to be sayable in it.
- The send condition, which is one predicate over the mechanism #337 removed.

## What this does NOT owe

- Any new wire research. M1-M5 are measured and the payload shape is unchanged.
- Any change to which distance we post. PR C settled that.
- A retroactive path. M7 forecloses it.

## Where the flag lives, and why not the obvious place

**DECIDED: `concept2_links.auto_verify`, not a `preferences` column.** The
preferences table is the reflex answer and it is the wrong one, for a reason
the link table already documents about its sibling.

`concept2_links.autoSend` carries this, `schema.ts:585-588`: *"Reset to false
by `upsertLink` when the conflict path lands a DIFFERENT `c2_user_id` (an
account switch must not carry AUTOMATIC onto another Concept2 account); a
reconnect of the same account keeps it."* The mechanism is a `CASE` in the
upsert (`stores/concept2.ts:186`).

**Auto-verification wants that property.** Sending a row to a Concept2 account
the rower did not choose it for is bad; verifying one there is worse, because
M7 guarantees it cannot be undone through any path this app offers. **M6 is
deliberately NOT part of this argument** — it is n=1 and flagged untested at
Gate 0, and a claim cannot be a hedge in one section and a premise in another.
A `preferences` column has no account to reset against and would silently
carry the setting across a relink.

**Two honest qualifications, because the borrowed property is weaker here than
it is for `autoSend`.**

- **The reset is SILENT.** When `autoSend` resets, the You screen shows MANUAL
  and rows stop uploading — the rower notices within a session. When
  `auto_verify` resets, nothing changes anywhere they look, and rows quietly
  stop being verified. See "What the rower can see", which is this spec's open
  question.
- **The `CASE` fires on ONE path.** The ordinary account switch is unlink then
  Connect, and the row is DELETED there, so the flag goes by deletion, not by
  the `CASE`. The `CASE`'s ELSE branch is reachable only via RECONNECT, which
  the card offers only while `linked && needsReauth`
  (`Concept2Card.tsx:710-723`) and where the rower signs into a different
  Concept2 account at Concept2's own page. That is a supported producer, so the
  argument stands — but it is one narrow path, not a broad property.
- **A cost, named rather than waved off:** a rower who deliberately moves to a
  new Concept2 account and expects the setting to follow is overridden
  silently. That is the trade, and it is the right one, but it is a trade.

It is also cheaper. `Concept2RouterDeps` (`routes/concept2.ts:49-80`) has no
preferences store and `app.ts:125-135` wires exactly that list, so a
preferences column costs a new router dependency and a wiring line; the link
row is already read on the send path.

### Lifetime table (RF27)

| Value | Mint | Clear / reset | Unlink → relink, same account | Relink, different account, no unlink | Token expiry / re-consent |
| --- | --- | --- | --- | --- | --- |
| `concept2_links.auto_verify` | `upsertLink` INSERT, `DEFAULT false` | `setAutoVerify` (PATCH); row DELETE on unlink (`stores/concept2.ts:266`) | **false** — row deleted, fresh insert | **false** — the `CASE`'s ELSE branch | **kept** — `c2UserId` equal, so the THEN branch |
| the `autoVerify` value used by ONE send | resolved once, before the first post | end of request | — | — | **must not be re-read on the retry** |

**Shape:** `autoVerify: boolean("auto_verify").notNull().default(false)`,
matching every other boolean in this schema. Reset alongside `autoSend` in the
same `CASE`. `PATCH /api/concept2/link` gains one validator block beside the
`autoSend` one.

## Mechanism

**One assignment returns, behind one predicate.** `#337` deleted the send
block and left a nine-line comment in its slot (`mapping.ts:635-643`); every
other piece of `#336` survives — `wireVerificationCode()` in
`domain/monitor/verificationCode.ts`, the `verified` field on `C2PostResult`,
the `usedMachineMeters`/`usedMachineSeconds` derivation, the bytes reaching
`buildC2Payload` on `machineSummary.verificationBytes`. There is no dead
branch and no flag to flip: the code is genuinely not sent.

`buildC2Payload(row, weightClass, effectiveTz)` takes no user and no
preference, so it gains a fourth argument. The send route already holds the
link row.

**`autoVerify` is resolved ONCE per request**, before the first post, and the
retry reuses that value. `buildC2Payload` is called twice
(`routes/concept2.ts:1308` and `:1333`) and `lockedLink` is REASSIGNED between
them, so re-reading the flag off the refreshed row would let one send carry two
policies if the rower toggles mid-send. The sibling field already states this
rule at the second call site — *"Same class, deliberately: resolved ONCE per
request (ruling R13), reused across this retry so one send can never carry two
classes."* The same sentence now covers this flag.

**The 4xx fallback: the ENTRANCE widens, the STRIP stays conditional.** `#336`
had it strip `workout` AND `verification_code` together (label
`without_workout_and_code`); `#337` narrowed it to `workout` alone. Restoring
the combined strip would be a real regression on exactly the opted-in
population: an ARRAY-caused 4xx would also drop the code, and by M7 that row
can then never be verified by any route — whereas today it arrives thinned but
verified. So: a code-carrying row with no array may now enter the fallback at
all (it cannot today), and the strip drops `workout` when present and drops
`verification_code` only when there is no array to blame.

**And the condition being remedied has never been observed.** #336's own
comment said so and an earlier draft of this spec dropped the sentence: a
WRONG well-formed code returned 201 `verified: false`, not a 4xx (the 5707
control); a malformed one was never measured, and our producer cannot make one
— `wireVerificationCode` returns `null` rather than a padded guess
(`verificationCode.ts:18-37`), and the byte band is enforced at the write door
(`routes/data.ts:970-983`) and re-checked in the mapper. The fallback is
insurance against an unobserved failure, and is priced as such.

**One false clause gets fixed rather than inherited.** `routes/concept2.ts:1370-1372`
says *"401 and 409 never reach here as `c2_error` with those statuses."* True
of 401; false of 409 — `client.ts`'s `postResult` returns
`{kind: "c2_error", status: 409}` when a 409 body carries no numeric `id`, and
409 is inside `400..499`, so a duplicate we cannot parse would re-POST a row
Concept2 already has. No observed Concept2 409 lacks an `id`, so this is
hardening debt rather than a live defect — but the widened entrance strictly
enlarges the population that reaches the sentence, so it is fixed here.

**`codeSent` returns to the `c2_send` log line.** `#337` deleted it. It is the
only evidence a send leaves about whether the code went out, and the "say
verified" row downstream reads that log.

## What this breaks, and what it owes elsewhere

- **`mapping.test.ts:866-894` and `concept2.test.ts:2476` go red by design.**
  Both pin the withholding, and one says so in its own body: *"Re-adding the
  send reddens this."* They become conditional: withheld with the setting off,
  sent with it on. **Neither is deleted** — the off arm is now the default and
  needs the stronger test, not the weaker.
- **The "hide it, say verified" row (`ROADMAP.md:1205-1221`) loses its
  premise.** It reads *"a verification the ROWER performed, never one we
  caused."* For an opted-in rower we DO cause it. That row is amended in this
  PR, not silently invalidated.
- **A stale comment gets fixed in passing.** `mapping.ts:516-519` still says
  the derivation feeds *"the verification-code guard below"*. `#337` deleted
  that guard. The comment has been wrong since 11:23 on 2026-09-07.
- **The TRIAD register row at `ROADMAP.md:2261-2288`** ("a verification code
  cannot validate") predates PR #307 and is unamended. #307 closed its main
  case by posting the monitor's own total. **The question it actually leaves
  open is not the one an earlier draft of this spec substituted for it.** The
  row asks, at `ROADMAP.md:2282-2284`: *"whether a single-interval or JustRow
  row verifies fine (the two numbers coincide there), which would explain why
  nothing caught it."* M10 answers the JustRow half — such a row cannot be
  sent at all — and leaves the single-interval half open. The row is amended
  to that, not to a limit it never named.

## What the setting can and cannot do

Stated plainly because the gate's copy has to be true.

| | |
| --- | --- |
| Rows it verifies | every row we send that carries a 0x0039 summary, INCLUDING ones Concept2's own website would never offer a code box for (M4) |
| Rows it cannot | any row with no monitor summary — we fall back to our interval sums, which the code was not minted over (M2, `mapping.ts:541`) |
| Rows already sent | none. The code is honoured at create and ignored on update (M7) |
| Free rows | none. They cannot be uploaded at all (M10) |
| Undo | turning the setting off stops future sends. It cannot un-verify a row **through any path this app offers** — Concept2's own `DELETE /results/{id}` exists and returned 200 on 28 test rows, but has not been tested on a verified one |

**The "can never verify" row is a non-event, not a silent failure.**
`verificationBytes` only ever travels inside the `summaryTotals`-gated block at
all three writers (`driver.ts:4415-4422`, `monitorRun.ts:1394-1419`, and both
doors), so a row with no summary carries no code to send, and #336's own
two-part guard refuses to send one. That guard survives verbatim. The caveat:
the SERVER validates the three fields independently with no cross-field rule
(`routes/data.ts:1856-1878`), so the pairing is producer discipline rather than
a stored-shape constraint — the mapper's guard is what makes it safe.

## What the rower can see — the open question

**Nothing, as specced, and this is the spec's weakest point.** Concept2's 201
body carries `verified`. We receive it (`routes/concept2.ts:1416`), log it to a
server console, and stop: it is absent from our own 200 body (`:1455-1459`),
never stored (`stores/logs.ts:995-1007` writes `c2ResultId`/`c2UserId` only,
and no column exists), and read by nothing in `app/src`. The route's own
comment concedes it — *"until it is stored, the server log is where it
accumulates."*

So a code that verified, a code that was refused, and a code that was never
sent are **indistinguishable to the rower**. Returning `codeSent` to the log
line answers this for us, not for them. Combined with M8/M9 — a `date` field
we have never validated against the monitor, on a monitor measurably 1-3
minutes off — the failure mode is: the rower turns it on, nothing visibly
changes, and nothing ever tells them whether it worked.

**DECIDED (James, 2026-09-07): bundle the observable.** The setting ships with
Concept2's own verdict stored and rendered, not on its own. The reason it is
worth the extra column: with an observable, M8/M9's date risk stops being
silent — a monitor whose clock has drifted out of tolerance shows up as rows
that do not say verified, instead of as nothing at all.

### The observable, and the one thing it may never say

Store the 201 body's `verified` on the session log beside `c2ResultId` — one
writer, `recordC2Result` (`stores/logs.ts:995-1007`), which already takes the
result id and the account id from the same response and is the only place a
send's outcome lands.

**The asymmetry that governs every word of the copy.** Our 201 tells us
whether the row verified AT RECEIPT.

- `verified: true` — true, and it stays true. Say so.
- `verified: false` — means "not verified at receipt", and **nothing more**.

**An earlier draft justified this by saying nothing re-reads a row from
Concept2 after the send. That is false, and the correction matters.** Every
send already calls `client.fetchResults(token, 50)` for the weight-class
declaration (`routes/concept2.ts:1142`) and intersects that page with our own
stored result ids (`:1152-1155`); the route's own comment says *"the results
list contains the rows this app posted."* Concept2's documented Get Results
response carries `"verified"` two lines below the `"weight_class"` we already
parse off that same endpoint — PRIMARY for the documented example, INFERENCE
for our live responses, since no LIST capture is committed anywhere. **One
authenticated GET against log-dev settles it and is owed before this ships**
(RF30 as amended in #354: a cost or capability asserted in a clause needs the
receipt).

**The conclusion survives, on three honest grounds rather than the false one:**

1. The read fires **only on a send**. A rower who verifies by hand and never
   uploads again is never seen.
2. **One page, 50 rows, and the caller never walks `links.next`** (the
   client's own comment). A row falls out of view permanently once 50 newer
   rows exist, and a future-dated row can pin the top.
3. So a stored `false` means *"not verified the last time we happened to
   look, which may be never"* — still not a present-tense claim.

**And one internal contradiction, corrected rather than left standing:** this
spec argues that most rows have no way to verify at all, AND that the rower
can type the code in afterwards. M5's measured rule makes the second available
only on a listed distance or time — the very population the first calls rare.
Both cannot be load-bearing at full strength. The asymmetry rests on grounds
1-3 above, not on how common the hand-verified case is; a rare case is still a
case, and it is the worst possible reader to be wrong about.

So the surface may state the positive and **may never state the negative**. "Not
verified" would be a claim about the present tense that we cannot support, and
it would be wrong precisely for the rower who did the thing this phase exists
to respect. The absence of the mark is the only honest rendering of the
`false` case, and the gate's copy is judged on that.

**The row it inherits is NARROWED, not fulfilled, and the spec says so.**
`ROADMAP.md:1205-1220` asks for *"a verification the ROWER performed, never one
we caused."* The receipt-time observable can see exactly one thing —
verification at receipt, caused by us — which is the opposite of what the row
asked for. Amending it to "Concept2 accepted this row as verified when we sent
it" answers a different question, and landing that as THE amendment would
retire the ask silently. So the row is amended to record both: what this work
delivers, and that **the rower-performed half stays OPEN**, with the
declaration read named as the mechanism that could close it.

**The census of the withdrawn premise runs past ROADMAP.** Correcting the
claim where it was argued and leaving it where it was used is the failure
PR #246 is named for. The hits:

- `ROADMAP.md:1220` — amended here.
- **`docs/superpowers/specs/2026-09-06-logbook-parity-design.md:524-531` — the
  phase's own governing spec**, carrying the absolute in its strongest form:
  *"Reverted in full — the mapper withholds the code even on a row that would
  verify, and a test pins that."* This is where the claim was ARGUED and an
  earlier draft of this spec missed it.
- `mapping.test.ts:864` and `routes/concept2.test.ts:2475` — comments
  repeating *"Concept2's own app leaves verification to the rower"* on the two
  tests going two-armed; reconciled in the same round as the tests.
- `src/news/content/releaseNotes.ts:22` — a HISTORICAL range record of what
  #337 did. It stands, deliberately, and is listed so it is not read as an
  unswept hit.

### The observable's lifetime table, and the stale-true bug it exposes

| Value | Mint | Clear | Second write | |
| --- | --- | --- | --- | --- |
| `session_logs.verified` | `recordC2Result`'s 2xx branch (`routes/concept2.ts:1426`), from the 201 body's `verified: boolean \| null` | **NONE — nothing clears it, and nothing clears `c2ResultId`/`c2UserId` either** | `recordC2Result`'s **409-duplicate** branch (`:1477`), which today has no `verified` value to pass | |

An earlier draft said this column is "cleared by whatever clears those." There
is no such clear: `recordC2Result` only ever SETs, and `deleteLink` removes the
LINK row and touches `session_logs` not at all.

**The concrete bug that falls out, and its fix.** A row sent to account A with
the setting on stores `verified: true` and `c2UserId: A`. The rower reconnects
to account **B**; `auto_verify` resets to false, but the already-sent
short-circuit does not fire, because it requires `row.c2UserId === link.c2UserId`
(`:891`) and its own comment says resending after relinking to a different
account is deliberately allowed. The row posts to B with no code, comes back
unverified or 409s, `recordC2Result` overwrites the account id to B's — **and
the mark now reads VERIFIED against a row account B never verified.**

Two rules close it:

- **Every `recordC2Result` call site passes `verified` explicitly**, including
  the 409-duplicate branch, which passes `null`: a 409 tells us Concept2 has
  the row and nothing about its state. A writer with one function and two
  callers has two lifetimes, not one.
- **The mark renders behind the existing account gate**, `sentResultId(row,
  link) !== null` (`src/log/concept2Send.ts:101-106`) — the rule that already
  hides a sent state whose account no longer matches. Without it the mark
  outlives the state that justifies it.

**`null` and `false` render identically** — as no mark — and the column's
comment must say so, or a future author will build a "we asked and it said no"
surface on a difference the reader never sees. The column is NOT a mirror of
Concept2's current state.

**The past tense is load-bearing and stays.** Tested against four drifts — the
rower deletes the row, un-verifies it, edits it, or relinks — *"Concept2
accepted this row as verified when we sent it"* survives all of them, because
it is a claim about a past moment. It would stop being the whole truth the
moment a reconciliation lands, which is the open scope question below.

## The reconciliation — TAKEN (James, 2026-09-07)

The declaration read hands us, on every send, up to 50 of the rower's recent
Concept2 rows with our own ids already marked. An **upgrade-only**
reconciliation is therefore available at no wire cost: for each returned row
whose id is ours and whose `verified` is `true` while our stored value is not,
write `true`. Monotonic, no new call, no new token scope, no new page, and it
reads `verified` only for ids that are ours — the client's projection comment
is explicit that the rower's other logbook rows are not ours to hold.

**It is the only mechanism that can ever see the rower's OWN act**, which is
what the inherited ROADMAP row actually asked for and what this phase's north
star is about. It also changes the stored field's meaning from "at receipt" to
"as of the last time we looked", so the surface would then owe a vaguer tense
than the past-tense sentence above.

**DECIDED: in scope.** It is what makes the mark mean "this row is verified"
rather than "we verified this row", and it is the only path to the thing the
inherited ROADMAP row asked for.

**Consequences that follow, and they are not free even if the wire call is:**

- **The stored field stops meaning "at receipt".** It becomes "verified as of
  the last time we looked", so the surface's past-tense sentence
  ("…when we sent it") no longer covers it. The Gate 0 copy is written against
  the new meaning, and a `verifiedAt` timestamp is the obvious way to keep the
  claim honest — decided at the gate, with the rendered thing in hand.
- **The asymmetry is UNCHANGED.** Reconciliation only upgrades. It still cannot
  support a negative, for the three reasons above: it fires only on a send, it
  reads one page of 50 with no pagination, and a row falls out of view
  permanently once 50 newer rows exist.
- **It reads `verified` only for ids that are ours.** The client's projection
  comment is explicit that the rower's other logbook rows are not ours to hold,
  log or render, and that stays true — the field is read and discarded for
  every row not in our own id set.
- **A third write site.** Reconciliation writes the column outside
  `recordC2Result`, so the lifetime table gains a row and the "written once per
  send" phrasing goes.

**RECEIPT OWED, AND CURRENTLY BLOCKED.** That the list response carries
`verified` is PRIMARY for Concept2's documented example and INFERENCE for our
live responses — no LIST capture is committed anywhere in `docs/monitor/`. One
authenticated GET settles it. **It cannot be run right now:** the log-dev token
at `~/.ergomatic-c2-dev.json` expired 2026-09-07 20:04 UTC, and
`app/scripts/c2-crossconnect.ts` needs `C2_CLIENT_ID` and `C2_CLIENT_SECRET`,
which are not in the environment. **No implementation task that depends on the
field may start before this is measured** — that is RF30 as amended, applied to
this spec's own capability claim rather than to someone else's.


## Gate 0 — what James approves before anything is built

A rendered artifact, per the design-gate rule, showing:

1. The control on `/you/concept2` beside SENDING MODE, at real proportions, in
   both orientations, against the screen as it stands today.
2. Every colour pairing's contrast ratio as a number.
3. The copy, which must carry M4 (it verifies rows you could not verify by
   hand) and, if M6 holds, that a verified row may no longer be editable on
   Concept2. **M6 is n=1 and is presented as untested unless measured first**
   — per RF30, an unmeasured cost does not get to shape the decision silently.

## Testing

- **RF24, and the producer is the BYTES, not the setting.** A test that starts
  at the send route with the flag on is upstream of the setting and downstream
  of the thing that has actually broken here — the client writing
  `machineSummary.verificationBytes` through `POST /api/logs`, which is RF24's
  own case study. Seed through `logs.create` with a stored `machineSummary`,
  never a hand-built mapping row. The pattern already exists three lines away
  (`routes/concept2.test.ts:2479-2484`, which starts at `logs.create` because
  *"dropping `series` in `toMappingRow` typechecks fine and silently posts a
  row with no heart rate"*).
- **The pinning tests become two-armed** rather than being deleted. Note their
  fixture is a naturally-finished programmed row, so the ON arm exercises the
  one shape that always works; it is not evidence for the capability table.
- **A biting mutation per assertion**, reported with what the failure said.
- **The account-switch reset is tested against REAL POSTGRES**, in
  `app/server/stores/concept2.integration.test.ts` (where `autoSend`'s lives at
  `:192-213`) — not against `testing/fakes.ts:999-1005`, which reimplements the
  `CASE` in JavaScript and would prove the mirror rather than the SQL (RF11).
  **The two flags are set to DIFFERENT values in that test** (`autoSend: false,
  autoVerify: true`), because the copy-paste failure this guards is a second
  `CASE` that reads `autoSend` inside the `autoVerify` assignment — and a test
  setting both to `true` stays green through exactly that mutation.
- **No new wire research.** M1-M5 are measured; this spec adds no claim about
  what Concept2 does.

## Gates this work carries

**TRIAD — two stored shapes.** `concept2_links.auto_verify` and the session
log's `verified`. The full antagonist pass ran on the first and its findings
are folded; **the observable is new ground the pass never saw, so it gets a
DELTA pass before Gate 0** — RF27's own lesson is that waving a novel mechanism
through on "inherits the spec's vetted ground" buys the churn back at about one
invariant per review round. PM gate on the PR. Gate 0 before implementation.
