# Optional auto-verification — design

**Status:** DRAFT. Gate 0 not yet presented.
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
distance or time hits a ranking standard, and most rows do not. So for most
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
whole value of the setting**, and it is also the thing that makes it more than
parity: it verifies rows the rower could not verify by hand.

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

**M7. The code is only sent at CREATE.** `verification_code` is accepted on the
POST that creates a result; a later PATCH does not carry it. So the setting is
**forward-only by force, not by choice** — turning it on cannot verify a row
already uploaded, and the design does not get to offer that.

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

**Auto-verification wants exactly that property and wants it more.** Sending a
row to a Concept2 account the rower did not choose it for is bad; VERIFYING a
row on an account they did not choose it for is worse, because M6 suggests a
verified row may no longer be editable and M7 guarantees it cannot be undone
through our upload path. A `preferences` column has no account to reset
against and would silently carry the setting across a relink.

It is also cheaper. `Concept2RouterDeps` (`routes/concept2.ts:49-80`) has no
preferences store and `app.ts:125-135` wires exactly that list, so a
preferences column costs a new router dependency and a wiring line; the link
row is already read on the send path.

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

**The 4xx fallback widens back.** `#336` had it strip `workout` AND
`verification_code` (label `without_workout_and_code`); `#337` narrowed it to
`workout` alone. It widens again, because a row refused with a code should be
retried without one rather than lost — but only when a code was actually sent.

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
- **A stale comment gets fixed in passing.** `mapping.ts:514-518` still says
  the derivation feeds *"the verification-code guard below"*. `#337` deleted
  that guard. The comment has been wrong since 11:23 on 2026-09-07.
- **The TRIAD register row at `ROADMAP.md:2252-2279`** ("a verification code
  cannot validate") predates PR #307 and is unamended. #307 closed its main
  case by posting the monitor's own total. The sub-case it names survives and
  is this spec's own limit: **a row with no 0x0039 summary falls back to our
  interval sums and can never verify**, setting or no setting
  (`mapping.ts:541` says so in the code). The row is amended to say which half
  closed.

## What the setting can and cannot do

Stated plainly because the gate's copy has to be true.

| | |
| --- | --- |
| Rows it verifies | every row we send that carries a 0x0039 summary, INCLUDING ones Concept2's own website would never offer a code box for (M4) |
| Rows it cannot | any row with no monitor summary — we fall back to our interval sums, which the code was not minted over (M2, `mapping.ts:541`) |
| Rows already sent | none. The code is honoured at create and ignored on update (M7) |
| Undo | turning the setting off stops future sends; it cannot un-verify a row |

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

- **RF24:** one test starts upstream of the producer — the send route with the
  link's flag on — and asserts the posted body downstream. Both arms.
- **The pinning tests become two-armed** rather than being deleted.
- **A biting mutation per assertion**, reported with what the failure said.
- **The account-switch reset is tested at the store**, the way `autoSend`'s is:
  relink with a different `c2_user_id` clears it; relink with the same one
  keeps it.
- **No new wire research.** M1-M5 are measured; this spec adds no claim about
  what Concept2 does.

## Gates this work carries

**TRIAD — a stored shape.** Full antagonist pass on this spec, PM gate on the
PR. Gate 0 before implementation. Said aloud rather than assumed.
