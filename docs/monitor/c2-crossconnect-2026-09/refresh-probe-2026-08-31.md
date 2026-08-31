# Refresh-token probes (PR1 planning, 2026-08-31)

Run live against `log-dev.concept2.com` with the dev credential pair
(`LOGBOOK_CLIENT_ID_DEV`/`LOGBOOK_CLIENT_SECRET_DEV`), operator-authorized
session (log-dev user 2211, `~/.ergomatic-c2-dev.json`). Three probes; every
body verbatim except tokens, which are redacted to their lengths. These are
the transcription source for PR1's token-endpoint stubs — committed here
because a measurement that lives only in a conversation is not evidence
(agent briefing; the PR1 premise pass flagged exactly this).

All token-endpoint requests were `application/x-www-form-urlencoded` and
carried `scope=user:read,results:write` — C2 marks `scope` `Required: Yes`
at the token endpoint, refresh calls included (their own refresh example
body carries `scope=user:read`).

## Probe 0 — deliberately invalid refresh token (garbage string)

`grant_type=refresh_token`, `refresh_token=deliberately-invalid-refresh-token-probe`:

```
HTTP 400
{"message":"The refresh token is invalid.","status_code":400}
```

## Probe A — genuine refresh (valid stored refresh token)

```
HTTP 200
{"access_token":"<40 chars>","token_type":"<6 chars — "Bearer">","expires_in":604800,"refresh_token":"<40 chars>"}
```

A NEW refresh token came back beside the new access token — rotation
confirmed live (doc claim V3 now measured). `expires_in` 604800 matches the
doc example and PR0's exchange.

## Probe B — the OLD refresh token, immediately after Probe A's rotation

Same request as Probe A but with the pre-rotation refresh token:

```
HTTP 400
{"message":"The refresh token is invalid.","status_code":400}
```

**Rotation invalidates the old refresh token IMMEDIATELY.** The genuine
dead-grant response is byte-identical to Probe 0's garbage-token response —
the `{"message","status_code"}` envelope, NOT the `{error,
error_description}` shape C2's doc shows for the token endpoint's 400/401
examples. So the token endpoint emits at least two error dialects and no
client may key on either shape alone; status plus (when present)
`body.error` is the readable surface.

## Related shape, measured the same day

`GET /api/users/me` with an expired access token:

```
HTTP 401
{"message":"Invalid OAuth access token","status_code":401}
```

## What these settle for PR1

1. A dead/rotated refresh token is a 400 with the message above (n=2:
   garbage and genuinely-invalidated both measured).
2. The rotation race is REAL: two concurrent refreshes with the same stored
   token — the loser's token is already dead the instant the winner's
   response lands. Refresh must be serialized per user (`SELECT … FOR
   UPDATE` on the link row), not raced and heuristically repaired.
3. C2's documented 400 (`invalid_request` — a malformed call, their example
   says `Check the "client_secret" parameter`) and 401
   (`invalid_credentials` — CLIENT credentials) mean a 400/401 can also be
   OUR bug or OUR config. Therefore no automatic path ever deletes a link
   on a token-endpoint error: it sets `needs_reauth_at`, preserving the
   stored `weight_class`, so a misclassified status costs a re-consent
   prompt, never the PII answer.
