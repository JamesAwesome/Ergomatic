# Does `GET /api/users/me/results` carry `verified`?

**YES. PRIMARY, measured live 2026-09-08** against `log-dev.concept2.com`,
account 2211, with the dev credentials from the repo-root `.env`
(`LOGBOOK_CLIENT_ID_DEV` / `LOGBOOK_CLIENT_SECRET_DEV` — note the names; the
`c2-crossconnect.ts` script reads `C2_CLIENT_ID`/`C2_CLIENT_SECRET`, which are
different variables for the same values). One read-only GET. Nothing was
created, modified or deleted.

## Why this file exists

Phase AV's reconciliation reads Concept2's own `verified` off the results list
the send path already fetches for the weight-class declaration. That the LIVE
response carries the field was **INFERENCE** — PRIMARY only for the vendor's
documented example response — and no capture of a list response existed
anywhere in the repo. The spec blocked every implementation task that depends
on the field until this was measured (RF30 as amended in #354: a capability
asserted in a clause needs the receipt).

## The request

    GET https://log-dev.concept2.com/api/users/me/results?number=5
    Authorization: Bearer <dev token>

Token refreshed first via `POST /oauth/access_token` with
`grant_type=refresh_token` and scope `user:read,results:write` — the scope the
repo's own client uses (`server/concept2/client.ts`'s `SCOPE`). **A refresh
with `results:read` is REJECTED**: `400 {"message":"The requested scope is
invalid, unknown, or malformed. Check the \"results:read\" scope."}`. Worth
knowing before anyone writes a narrower-scope refresh.

## The result

`HTTP 200`, five rows. **Every row carries `verified`, and the values vary**
(`[true, false, false, false, true]`), so the field is populated per row and
not a constant.

The full key set on a list row, verbatim:

    calories_total, comments, date, date_utc, distance, drag_factor, id,
    privacy, ranked, real_time, rest_distance, rest_time, source,
    stroke_data, stroke_rate, time, time_formatted, timezone, type,
    user_id, verified, weight_class, workout, workout_type

`verified` sits beside `weight_class`, which our mapper already parses off
this exact endpoint. `server/concept2/client.ts` projected FOUR fields and
dropped the rest; with `verified` it keeps five, and drops the rest still —
the rower's other logbook data is not ours to hold.

## What this settles, and what it does not

- **SETTLED:** the reconciliation can read `verified` from a response the send
  path already makes. No new wire call, no new token scope, no new page.
- **NOT SETTLED:** production (this is log-dev, same as every other
  measurement in this phase), and whether `verified` can ever go true → false
  at Concept2. The second matters because the reconciliation is upgrade-only
  by design and the rendered mark is a past-tense claim; nothing here tests a
  transition in either direction.
- **UNCHANGED:** the reconciliation still only fires ON A SEND, reads one page
  of 50, and never walks `links.next` — so a stored `false` still means "not
  verified the last time we happened to look, which may be never", and the
  surface still may not state the negative.
