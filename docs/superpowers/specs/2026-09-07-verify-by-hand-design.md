# Verify a row by hand — design

**Status:** Gate 0 APPROVED (James, 2026-09-07, artifact
`94367040-7c9a-409a-b7c4-abfe57c9788c`). TRIAD: new stored shape.

## What and why

A rower can verify a Concept2 row by reading the verification code off the
monitor and typing it into Concept2's website. That only works when the piece
lands exactly on a rankable standard, so most Erg Book workouts cannot be
verified at all. Concept2's API has no such restriction. This spec puts the
code entry in our app: the rower types the code, we send it, the row comes back
verified.

The act stays the rower's. We hold the monitor's own code bytes and **never**
fill the field from them — typing a code you read off the machine is what makes
verification mean anything, and PR #336 was reversed the same day it shipped for
removing exactly that (James, 2026-09-07: "the behavior we wanted was you needed
to manually verify", "THAT MATCHES CONCEPT 2s OWN FUCKING APP").

## Evidence this is needed and possible

**Why the field disappears (MEASURED, log-dev, 2026-09-07).** Three rows posted
differing only in overall distance; the Verification Code field on Concept2's
edit form appeared for the first two and not the third:

| Overall | Rest | Field |
| --- | --- | --- |
| 2000 m | none | yes |
| 2000 m | 180 m | yes |
| 2180 m | 180 m | no |

Rest is not the cause. The overall figure landing off a standard is. James
confirmed each by eye. This also explains every row in his log: 86028 was
exactly 500 m and got the field; 85921 was an odd 6233 m but exactly 30:00
overall and got it; the 200 m rows and a 2180 m row got nothing.

**PRIMARY, `log.concept2.com/help`**, quoted: _"Verification is not required to
rank a piece, however, to flag a manually entered piece as 'verified', you can
use the verification code from your PM3, PM4 or PM5."_ Same page lists the
standard distances (100, 500, 1000, 2000, 5000, 6000, 10 000 m, half and full
marathon) and timed pieces (1, 4, 30, 60 minutes).

**PRIMARY, `log.concept2.com/developers/documentation/`**, the update endpoint:
`PATCH /api/users/{user}/results/{result_id}` accepts `verification_code` among
its parameters, so a code can be attached to a result that already exists — no
re-upload. The acceptance rule, quoted from the same page's `verification_code`
parameter: _"For the verification code to be accepted, the date, time, distance,
workout_type and machine type must match that of the code."_

**MEASURED, that the API ignores the website's restriction:** row 86049 is 200 m,
a distance whose form offers no code field, and it reads `verified: true` because
our server sent a code for it on 2026-09-07. Earlier arms established the check is
real rather than a rubber stamp: the monitor's own distance verifies and a control
distance one metre off does not, both with and without `workout.intervals[]`
(`docs/superpowers/research/2026-09-05-c2-verification-measurement.md`).

**FALSIFIED, 2026-09-07, and this spec is VOID as written.** The `PATCH` claim
was documented and never tested; it was tested first, and it does not work. A
code attached to an EXISTING result is accepted with `200` and silently ignored:

| Arm | Call | Result |
| --- | --- | --- |
| Create without a code, then `PATCH` the right code | `PATCH /results/{id}` `{verification_code}` | `200`, `verified: false`, still false on fresh read |
| `PATCH` the code **with** date, time, distance and workout_type alongside | as above plus the five identifying fields | `200`, `verified: false` |
| `POST` to the result id (docs say update "also accepts POST") | `POST /results/{id}` `{verification_code}` | `200`, `verified: false` |
| **Control:** create WITH the code | `POST /results` `{…, verification_code}` | `201`, **`verified: true`** |

The control rules out a bad code, a bad account and a stale token in the same
run. **The verification code is only honoured at CREATE.** Concept2's developer
documentation lists `verification_code` among the update endpoint's parameters;
that is a documentation error, and no error is returned when it is ignored.

Consequence: a row cannot be verified after it has been uploaded. Any design
that puts a code field on a SAVED row is impossible. Awaiting James's decision
on the reshape.

## Stored shape

One nullable column on `session_logs`, migration 0026:

```sql
ALTER TABLE session_logs ADD COLUMN c2_verified boolean;
```

**Lifetime table.** Invariants, not mechanisms.

| Value | Means | Written by | Cleared by |
| --- | --- | --- | --- |
| `null` | No code has been accepted or refused for the row's CURRENT Concept2 result | the send route, on writing a new `c2_result_id` | — |
| `true` | Concept2 answered `verified: true` for this exact `c2_result_id` | the verify route only | a new `c2_result_id` |
| `false` | Concept2 answered `verified: false` for this exact `c2_result_id` | the verify route only | a new `c2_result_id` |

Invariants:

1. **`c2_verified` is only ever about the result named by the row's current
   `c2_result_id`.** If that id changes, the flag is meaningless and is reset to
   `null` in the same write. A row that has never been sent has `null`.
2. **Never client input.** Same rule as `c2_result_id` and `c2_user_id`; the
   client cannot post it, and `routes/data.ts` rejects it if present.
3. **`true` is not a claim about the current state at Concept2**, only about
   what Concept2 answered when the rower verified. Concept2 can unverify a row
   and we would not know. The screen says "verified" because the rower verified
   it, which is the honest claim.

## Wire

Our endpoint, new: `POST /api/concept2/results/:logId/verify`, body `{ code }`.

Preconditions, each its own refusal:

| Condition | Answer |
| --- | --- |
| Row not found or not this user's | 404 |
| Row has no `c2_result_id` | 409 `not_sent` |
| Row's `c2_user_id` ≠ the live link's | 409 `wrong_account` |
| Row has no `verificationBytes` | 409 `no_code` |
| Typed code ≠ the code those bytes render | 400 `code_mismatch`, **no Concept2 traffic** |
| Already `c2_verified = true` | 200, no-op, reports verified |

Only after all of those do we `PATCH` Concept2 with `verification_code`, read
`verified` off the response body, store it, and return it.

**The local match check is a security property, not only a courtesy.** Because
a typed code must equal the one the stored bytes render before we call Concept2
at all, this endpoint cannot be used to guess codes against Concept2 — the
guesser would already need the answer. It also means a mistyped code costs no
round trip, which is what the approved design shows.

## Screen

Gate 0's six states, approved as rendered. `MachineConfirmedBlock` in
`src/log/FromTheLog.tsx`:

- **The stored code is no longer printed on the row.** It moves to
  You › Diagnostics, the debug reveal (James: "We don't show the code anywhere
  unless we're in debug mode").
- Sent and unverified: `NOT VERIFIED`, a code field, a Verify button, and the
  hint naming where the code lives on the monitor.
- Typed and matching: the button enables.
- Typed and not matching: the field takes an error border and the button stays
  disabled. Checked in the client against the same bytes, so no request.
- Verified: `VERIFIED · CONCEPT2`, no field, no button.
- Refused: `NOT VERIFIED` plus a line saying Concept2 did not accept it, and the
  button stays available to try again.
- No code bytes, or not yet sent: no field at all.

The block has never carried anything tappable. The input is 48 px and the button
52 px, both past the 44 px requirement. Contrast, computed: ink on paper 15.2:1,
ink-2 on paper 9.7:1, ink-3 on paper 6.69:1, accent on paper 5.35:1.

## What this deliberately does not do

- **No automatic send of the code, ever**, at upload or anywhere else.
- **No re-checking Concept2** on screen open. James approved storing the answer
  rather than a round trip every time the log door opens.
- **No unverify.** Concept2's own UI has no such action for a code-verified row
  and we are not inventing one.
