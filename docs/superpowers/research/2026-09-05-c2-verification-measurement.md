# PR C measurement — which distance the PM5 verification code accepts

**PRIMARY, run live 2026-09-05 against `log-dev.concept2.com`**, account 2211
(the dev token, `~/.ergomatic-c2-dev.json`), by the controller. This file is the
evidence PR C's spec §2 rests on; the sibling `2026-09-05-c2-verification-code.md`
is the C1 documentation research and ends with the *proposal* for this test —
this file is the *result*.

## What was posted

`POST /api/users/me/results` (JSON; the API rejects form-encoding with
`400 Invalid JSON or missing Content-Type`), every field held equal to James's
real walk row 85921 — `date 2026-09-04 17:19:22`, `timezone America/New_York`,
`time 15000` (25:00.0), `weight_class H`, `rest_time 3000`, `rest_distance 525`,
`stroke_rate 21`, `workout_type VariableInterval`, `type rower` — and the PM5's
own displayed code `verification_code: D9BD-F964-32E2-7F18`. Only `distance`
varied.

| distance | what it is | HTTP | `verified` |
| --- | --- | --- | --- |
| **5706** | the monitor's own 0x0039 total (`machine_work_meters`) | 201 | **`true`** |
| **5707** | neither number — a negative control | 201 | **`false`** |
| 5708 | our interval sum (`work_meters`), = the existing row 85921 | 409 Duplicate | — |

Test rows 85942 (5706) and 85943 (5707) were **deleted** immediately
(`DELETE …/results/{id}` → 200 each). The logbook was confirmed back to its
prior state afterward: only the real row 85921 (5708, `verified: false`) remains
for that date. The real row was never modified.

## What this proves, and what it does not

- **PROVEN, clean:** the code accepts **5706** and rejects **5707** — the check
  is distance-specific and pinned exactly at the monitor's own total, not "any
  decodable code passes." A fresh POST, not an inherited row.
- **PROVEN, by construction:** log-dev accepted a code minted by a physical PM5
  against a plain API POST with no trusted-client relationship and no ErgData
  upload — so the check is against the **submitted fields**, reproducible by us.
- **NOT independently tested:** 5708 + code as a fresh POST — the duplicate
  guard (keyed on date+time+distance) returned 409 against the existing 5708 row
  before it could be evaluated. That 5708 does not verify rests on two other
  things instead: it is ≠ 5706 (the code is pinned there, per the 5707 control),
  and James's own live website entry of this code against the 5708 row was
  refused on 2026-09-04 (walk-fixes spec §3.8). A fresh 5708 control would need
  the real row 85921 deleted first; not done, because it mutates James's actual
  record for no additional certainty.
- **NOT tested:** production (only log-dev), and time-divergence (this row's
  time agreed at 25:00.0, so nothing here exercises a wrong `time`).

## The one confirming step still worth taking (optional)

A single hardware send on James's real logbook, of a future interval row whose
0x0039 total differs from our interval sum, verifying with the machine number
after PR C ships — closes the log-dev-vs-production gap. Not required for the
number to be settled; the API result above settles which of our two stored
numbers is authoritative.

## Follow-up, 2026-09-07: the code verifies WITH `workout.intervals[]`

**PRIMARY, run live against `log-dev.concept2.com`**, same dev account 2211 and
session file, by the controller, to close the gap this file's own limits
section named before merging PR #336 (which sends `verification_code` on rows
that always carry the interval array).

Every field held exactly at this file's verified arm — `date 2026-09-04
17:19:22`, `time 15000`, `distance 5706`, `rest_time 3000`, `rest_distance 525`,
`stroke_rate 21`, `workout_type VariableInterval`, code
`D9BD-F964-32E2-7F18` — with `workout.intervals[]` added: three intervals summing
exactly to the top-level totals (3 × 5000 tenths, 3 × 1902 m, 3 × 1000 tenths
rest, 3 × 175 m rest distance), so the array could not be refused on its own
numbers.

| arm | distance | array | HTTP | `verified` | row |
| --- | --- | --- | --- | --- | --- |
| **B** | 5706 (the monitor's own total) | 3 intervals | 201 | **`true`** | 86044 |
| **C** | 5707 (negative control) | 3 intervals | 201 | **`false`** | 86045 |

Both rows were **deleted immediately** (`DELETE …/results/{id}` → 200 each). The
arms ran sequentially with the row deleted between them, so the date+time+distance
dedup key never fired and neither arm is confounded by the other.

- **PROVEN:** `workout.intervals[]` does **not** interfere with verification —
  the array and the code coexist, and the check stays pinned to the monitor's
  own distance. This is the exact payload shape PR #336 produces.
- **PROVEN (RF21):** the probe can come back `false` — arm C is the same payload
  with the same array at a distance the code was not minted over. Arm B's `true`
  is the code being checked, not the API rubber-stamping a well-formed post.
- **STILL NOT TESTED:** production (both arms are log-dev), and the INFERENCE
  that Concept2 hides its own Verify button on rows carrying interval data
  (n=4 against one control, build and payload shape confounded). The parity
  walk settles both.
