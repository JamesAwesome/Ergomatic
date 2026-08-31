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

**Timezone: CONSISTENT, not confirmed by C2 (corrected at James's #244
review, finding 3 — the earlier "CONFIRMED LIVE" wording was a mirror).**
C2's `date`/`date_utc` pair derives from the tz WE submitted, so their
agreement with the capture's wire-vs-wall −4 h shows our arithmetic is
self-consistent, nothing more. The evidence that the erg's zone is
America/New_York remains capture-internal (every wire-vs-wall stamp across
two walks is −4 h) plus the operator's environment — and **James confirmed
it directly (2026-08-31): "yes its in america/new_york."** The fixture's
`tz` is settled on operator authority, with the capture stamps as
corroboration.

## Auth + state-echo probe

Authorization-code grant completed manually (browser consent on log-dev,
code pasted). The first run's echo observation spanned two processes and
was ruled non-durable at James's #244 review (finding 1); the harness was
then changed to ENFORCE state (abort before any exchange on
missing/mismatch) and to write a sanitized receipt. **A single-process
re-auth on 2026-08-31 landed it — `state` IS ECHOED, Branch A PROVEN:**

```json
{
  "nonceSha256": "225c34121dc760afdeee4fce8d1ed811034875c4543b5369dcc5490c678801d2",
  "echoedSha256": "225c34121dc760afdeee4fce8d1ed811034875c4543b5369dcc5490c678801d2",
  "equal": true,
  "at": "2026-08-31T17:43:44.422Z"
}
```

(sha256 of the run's nonce and of the callback's echoed state, computed
and compared inside the one process that generated the nonce; the abort
path is mutation-proven in the unit suite.)

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

**Layer named (finding 3):** this proves the API ENCODING — hand-built
payload from capture-transcribed values, through C2's validator, back
matching. It does NOT exercise the stored-row producer → upload route →
GET seam; that is PR1's RF24 seam test, against these transcripts.

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
  second)**. → The pre-committed datetime branch fires. **The ErgData
  consequence is an INFERENCE (finding 3), stated as such:** measured
  second-granularity + the wire date's minute resolution imply an
  ErgData copy of the same physical row would not collide; no actual
  ErgData post was observed. PR2's duplicate-warning copy rests on this
  inference; the direct observation (post one physical row from both
  apps) stays open on the wave.
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

**MEASURED on the spec's full predicate (James, prod, 2026-08-31,
recounted at #244 finding 4): 6 eligible of 20 total rows**, with
`ended_by = 'finished' AND work_seconds IS NOT NULL AND work_meters IS
NOT NULL AND device_name IS NOT NULL`. The first count (same 6/20,
without the provenance term) was an upper bound; the recount shows every
work-column row also carries `device_name`, so 6 is the true count. The
Send affordance has a real first audience, and RC-1's columns are
confirmed populating in production (unlike the machineSummary precedent
this check exists because of).

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

## Mutation ledger (durable record — #244 re-review asked for names, not adjectives)

Fix-round guards, each mutation run against a committed tree and reverted
green (suite 32/32 both sides):

| guard | mutation | exact failure |
| --- | --- | --- |
| state enforcement (`verifyState`) | inverted mismatch check (`!==` → `===`) | 4 tests red, e.g. `expected { ok: false } to strictly equal { ok: true, receipt: {...} }` |
| scope at token exchange | dropped the `scope` body key | `expected [...5 keys] to strictly equal [...6 keys]` (diff: `- scope`) |
| session file 0600 | dropped `mode` option AND `chmod` | `expected undefined to strictly equal { mode: 384 }` (384 = 0o600) |
| red-proof fresh-201 guard | dropped `status === 201` clause | `expected { ok: true, id: '998877' } to strictly equal { ok: false, message: "RED-PROOF ABORTED: expected fresh 201, got 409" }` |
| fetchResult non-2xx throw | removed `if (!res.ok) throw` | `expected [Function] to throw error matching /fetchResult failed: 401.*invalid_token/ but got 'malformed result response'` |

(Earlier task-loop mutations — c2Tenths `expected 60 to be 600`,
formatC2Date zone drop, rest-guard inversion, timezone-key drop,
verdict-always-match — are recorded in PR #244's Record block; the P1
round's id-equality and red-verdict mutations are appended to this table
in the P1 commit.)

## Verdict against RC exit (d)

*"a row posted to the Concept2 sandbox comes back through `export/`
matching what we stored, or the reason it cannot is documented."*

**MET AT THE ENCODING LAYER, on the documented-reason branch for
`export/`; the layer is named (finding 3):** capture-transcribed stored
values come back through C2's result object matching on all ten posted
fields, and C2's own derived `time_formatted` reconciles with our
work/rest split (374.8 s = 254.8 + 120 — a C2-side computation over our
numbers, not an echo of a field we sent). `export/` specifically cannot
return the row because C2's export endpoint requires `stroke_data`,
which this wave omits for RC-11's documented reason — a C2-side bound,
within the exit's bounded hatch ("a field C2 rejects or does not
return"). **Not yet exercised, owed to PR1:** the stored-row → upload
route → GET seam (RF24). The report's two operator residuals are CLOSED
(2026-08-31): the single-process state receipt is committed above, and
the census stands at 6 of 20 on the full predicate. The stroke_data
follow-on reopens the export oracle.
