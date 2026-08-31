# Concept2 cross-connect (PR0) — desk harness walk report

Skeleton created by Task 3 (spec `2026-08-31-concept2-pr0-crossconnect`).
Sections below are filled during Task 6's live run against `log-dev`.

## Fixture (capture citation)

## Auth + state-echo probe

Operator caution: the authorize URL (`buildAuthorizeUrl`) carries `client_id`
in the query string. Don't paste it into transcripts, chat logs, or this
report verbatim.

## The post

## Field-by-field diff (result object)

## Export contents (csv columns recorded verbatim; fit/tcx status)

## Per-field oracle visibility table

## Red-proof (what the failure said)

## Dedup granularity (three pre-committed branches from the spec, answer marked)

## Zero-rest post

## Verification stretch

## Eligible-population count

## Result web URL shape

Does the logbook row's URL need the user id, or does C2 resolve it from the
result id alone? PR2's View-on-Concept2 link-out depends on the answer.

## Encoding notes

The POST is sent as JSON (`content-type: application/json`, set in
`authedFetch`). If C2 rejects it with every field missing, the fix is to
switch to `application/x-www-form-urlencoded` (as `exchangeCode` already
does for the token endpoint) — record here which encoding actually worked.

## Verdict against RC exit (d)
