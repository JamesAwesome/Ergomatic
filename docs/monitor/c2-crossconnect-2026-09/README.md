# Concept2 cross-connect (PR0) — desk harness walk report

**Run 2026-08-31**, live against `log-dev.concept2.com`, operator James
(log-dev user 2211), harness `app/scripts/c2-crossconnect.ts` at this
report's commit. Raw transcripts: `raw-output.txt` (this directory; grepped
for `access_token` — clean). Every probe below has a measured answer;
nothing is inferred from documentation alone.

## Fixture (capture citation)

`docs/monitor/sessions/walk-2026-08-25/` piece 1, natural finish
(`rests-finished-recording.jsonl.gz`): work 254.8 s / 935 m
(`oracleCorpusReplay.test.ts:715-716`, `rests-finished-ring.json:67`),
rest 120 s / 274 m (walk README W-9; corroborated `oracleCorpusReplay:485`),
avgStrokeRate 24 and workoutType ordinal 8 (`rests-finished-ring.json:65-66`),
end wall-stamp `2026-08-25T21:42:03.110Z` (ring line 66).

**Timezone ruling CONFIRMED LIVE:** posted `tz=America/New_York`; C2's
response carried `date: 2026-08-25 17:42:03` beside
`date_utc: 2026-08-25 21:42:03` — exactly the capture's wire-vs-wall −4 h.
The original LA guess would have filed the row three hours wrong, invisibly
to the echo oracle.

## Auth + state-echo probe

Authorization-code grant completed manually (browser consent on log-dev,
code pasted). **`state` IS ECHOED** — undocumented on C2's page, but the
callback URL returned `state=63ed…` byte-identical to the nonce the run
generated. (The harness transcript's own "NOT ECHOED" line is an artifact:
the code was exchanged in a second process whose fresh nonce could not
match the first run's; the byte-identity above is the real answer.)
**Consequence: the spec's Branch A is chosen** — https callback, server
binds the user by the state-linked attempt row, no iOS URL scheme needed.

Operator caution: the authorize URL (`buildAuthorizeUrl`) carries
`client_id` in the query string. Don't paste it into transcripts, chat
logs, or this report verbatim.

Token exchange: `application/x-www-form-urlencoded`, 200, `expires_in`
604800 (7 days, matching the doc example), refresh token present.

## The post

`POST /api/users/me/results`, sent as JSON → **201**, result id **85557**.
Every field we sent came back verbatim, plus C2-derived fields; notable:
`time_formatted: "6:14.8"` — that is 374.8 s = work + rest, so **C2's own
display fuses work and rest while `time` stays work-only**. Their derived
reading agrees with our stored split exactly (254.8 + 120).

## Field-by-field diff (result object)

10/10 match after the visibility fix (see below): type, date, timezone,
distance, time, weight_class, rest_time (1200), rest_distance (274),
stroke_rate (24), workout_type (VariableInterval).

**Research correction, measured:** the claim that the result object omits
top-level `rest_time`/`rest_distance`/`stroke_rate` is WRONG — both the
POST echo and a fresh GET return all three. The harness's hardcoded
blind-list was replaced with per-response visibility (commit a4d05a28);
the report's oracle table below reflects the measured surface.

## Export contents

**All three exports 404 with `{"message":"Stroke data not found"}`**
(csv, fit, tcx; both `/users/me/` and `/users/2211/` forms). The export
endpoint exists only for rows carrying `stroke_data`, which this wave
deliberately omits (RC-11's clock mismatch — spec §Out of scope). So the
`export/` half of RC exit (d) is **unavailable to a summary-level row by
C2's design**; the result-object GET is the round-trip oracle instead.
CSV columns therefore remain unrecorded until the stroke_data follow-on.

## Per-field oracle visibility table

| field | POST echo | GET result | export/ |
| --- | --- | --- | --- |
| type, date, timezone, distance, time, weight_class, workout_type | seen | seen | n/a (404, no stroke data) |
| rest_time, rest_distance, stroke_rate | seen | seen | n/a |
| date_utc, time_formatted | C2-derived, seen | seen | n/a |

## Red-proof (what the failure said)

Posted the fixture with `time` deliberately encoded in SECONDS (255, not
tenths) as id 85559; a **fresh GET** (not the POST echo) diffed against
the stored row read `time: expected 2548 got 255 → MISMATCH`. The gate
can go red on a wrong encoding, proven live before any green was trusted.

## Dedup granularity (pre-committed branches, answer marked)

- A fresh post → 201 (id 85560)
- B exact repost → **409 "Duplicate Result"**, and the body NAMES the
  colliding id (85560) — the product can link "already has this row" to
  the existing result.
- C same values, date +30 s → **201** ⇒ **DATETIME-GRANULAR (to the
  second)**. → **The pre-committed datetime branch fires:** an ErgData
  copy of the same physical row (posted with the monitor's own minute
  date) will NOT collide with ours; two rows for one piece coexist.
  PR2's send copy carries the duplicate warning, and the wave ships with
  that said.
- D same instant, time +1 tenth → 201 ⇒ `time` is in the key.
- E next-day sanity → not run as designed; it instead measured a
  validation bound: **dates ~3+ days in the future are 422-rejected**
  ("The date of the workout is too far in the future"; +2 days accepted,
  +3 rejected, from 2026-08-31).

## Zero-rest post

**201** (id 85563): `workout_type: VariableInterval` with NO rest fields
is accepted. `rest_time`'s "Depends" is permissive — `workout_type`
omission is never forced for continuous rows (anchor F11 answered).

## Verification stretch

Posted the fixture's real 0x003F payload (19 bytes,
`rests-finished-ring.json:71`) hex-grouped in C2's example shape
(`F0EE-FE4F-…-00-`) as id 85564 → **201 with `verified: false`** and no
error: C2 silently ignores a code it does not accept. Measured answer:
**our raw bytes are not C2's code format as-is**; verification needs the
format documented by C2 or observed from ErgData. Stays a follow-on;
additionally the code must match the MONITOR's own date (wire-minute
17:40) which our second-precision `date` (17:42:03) does not — two
independent reasons this cannot pass yet.

## Eligible-population count

**OWED — James runs on prod** (deploy host, `~/Ergomatic`):

```sql
SELECT count(*) FILTER (WHERE ended_by = 'finished'
                        AND work_seconds IS NOT NULL
                        AND work_meters IS NOT NULL) AS eligible,
       count(*) AS total_rows
FROM session_logs;
```

## Result web URL shape

Measured: `https://log-dev.concept2.com/profile/2211/log/85557` → 200;
`/log/85557` and `/results/85557` → 404. **The link-out needs BOTH ids**
(`/profile/{c2_user_id}/log/{result_id}`) — which is what storing
`c2_user_id` beside `c2_result_id` on the row provides (spec §Stored
shapes).

## Encoding notes

**JSON worked** (`content-type: application/json`) — no form fallback
needed on results. Token endpoint stays form-encoded. Future-date bound
as measured above. Rows posted this run and left on log-dev (the dev DB
is periodically reset by C2): 85557, 85559-85564.

## Verdict against RC exit (d)

*"a row posted to the Concept2 sandbox comes back through `export/`
matching what we stored, or the reason it cannot is documented."*

**MET, on the documented-reason branch for `export/` and better than the
criterion asked elsewhere:** the row comes back through C2's result
object matching what we stored on all ten posted fields (and C2's own
derived `time_formatted`/`date_utc` independently reconcile with our
split and our zone); `export/` specifically cannot return it because C2's
export endpoint requires `stroke_data`, which this wave omits for RC-11's
documented reason — a C2-side bound, within the exit's bounded hatch
("a field C2 rejects or does not return"). The stroke_data follow-on
reopens the export oracle.
