# Per-user gate on the Concept2 surface

**Why.** PR2 merged dark. James wants it on for HIS account first — link a real
account, send a real row, read the result in the logbook — without the rest of
the sign-in allowlist seeing an unfinished surface, and without waiting on
Concept2's live write approval. The same gate is what makes the live cutover
safe later: turn the real logbook on for one person, prove a row lands, then
widen.

**Gate class, spoken rather than assumed.** This is authorization keyed on
identity, so it is TRIAD-adjacent and does NOT take the fast path: failing
tests first, a mutation per assertion, and a review. It gets **no antagonist
pass**: it invents no mechanism, touches no stored shape, and changes no
number's meaning — it reuses the allowlist primitive this repo already ships
and tests. That skip is stated here rather than left silent.

## The design

Today `computeAvailable(flag, clientId, clientSecret)` runs once at boot and
`concept2.available()` returns it. Keep that, and add a second, per-request
check:

- **New env `C2_ALLOWED_EMAILS`**, same shape as `ALLOWED_EMAILS`, parsed with
  the SAME `parseAllowlist`/`isAllowed` pair in `server/auth/allowlist.ts` —
  already unit-tested, case-insensitive, comma-separated, trims.
- **Fail closed.** Unset or empty means NOBODY, not everybody. The boot warning
  must say so, in the shape `ALLOWED_EMAILS`'s own warning uses.
- **`available` becomes two deps**, because the six call sites do not all have a
  user:
  - `available()` — unchanged, flag AND both credentials. Keeps its five
    existing meanings and stays the callback's check.
  - `availableFor(email)` — `available()` AND the email is on the C2 list.
- **The authed routes use `availableFor(user.email)`**: the mint, the
  exchange, `GET /link`, and the send. **SUPERSEDED IN TWO PLACES by fix round
  1 below, and this bullet is the current statement:** `DELETE /link` is NOT
  per-user gated (F4 — a capability gate closes use, not revocation), and the
  web callback takes BOTH checks — `available()` first, before it has a
  principal, then `availableFor(user.email)` at step 3b once it has resolved
  one (F2). The original bullet said the callback had "no user to check";
  the handler resolves a full `SessionUser` at step 3 and reads its email at
  step 8, so that was false.
- **No client change.** `GET /link` already answers `{available:false}` for a
  user outside the list, and both surfaces already render `null` on that. Prove
  that rather than assuming it.

## Tests, each with a mutation that makes it fail

1. `availableFor` is false for an email off the list, true for one on it, with
   the flag and both credentials set.
2. Unset and empty `C2_ALLOWED_EMAILS` both deny everyone — the fail-closed
   direction, which is the one a wrong default gets backwards.
3. Case and whitespace: `JAMES@…` and ` james@… ` both match a lower-cased
   entry, since that is what `parseAllowlist` promises.
4. Route level: a signed-in user off the list gets `{available:false}` from
   `GET /link` and 403 from the mint and the send. One test per verb, driven
   through the real router.
5. **SUPERSEDED by F2 below.** As written this said the callback answers on
   the global check alone. It now takes both: an off-list principal is refused
   at step 3b, before any peek or consume, and a signed-OUT caller still reads
   `notSignedIn` rather than a capability answer.
6. The boot warning fires when the list is empty while the flag is on.

Mutations to run, each anchored on a grep-confirmed unique string: flip the
fail-closed default to allow-all; drop the `available()` conjunct from
`availableFor` so the C2 list alone opens the surface; and swap one route's
`availableFor` back to `available`.

**Added by fix round 1:** the reviewer's own mutation (the C2 list swapped for
the sign-in list) must redden, which is what forces the composition out of
`index.ts`; and the boot count must redden both when it echoes an address and
when it stops being the parsed size.

## Also

- `docs/deploy.md` gains `C2_ALLOWED_EMAILS` beside the other C2 variables,
  with one line saying unset means nobody.
- Check whether `compose.yml` needs to pass it through, the way it passes
  `C2_LINK_ENABLED`. If it does, the committed compose-env test may need a row.

## Gates

From `app/`: typecheck, lint, format:check, unit, client, integration (Docker
is up), and `pnpm e2e` only if anything under `app/src/` changes — it should
not. Commit before any probe; revert single files.


---

# Fix round 1 — review rulings

The implementation of the above was reviewed; spec compliance APPROVED, task
quality CHANGES-REQUESTED. The rulings that CHANGED THE DESIGN are recorded
here, because code comments cite this file and the design above is no longer
the whole of it. The review-hygiene items (dangling citations, test-shape
fixes, prose nits) are not repeated — they left no product decision behind.

## F1 (severe) — the line that decides the gate has no gate on it

The reviewer replaced `c2Allowlist` with `allowlist` in `server/index.ts` — the
SIGN-IN list, same type, same scope, two characters away. Typecheck clean,
**6842 passed, zero red**: the Concept2 surface open to every signed-in user,
which is the exact failure this gate exists to prevent, with nothing red
anywhere.

Your report calls this narrowed as far as possible. The same commit disproves
that: you extracted `c2Warnings` out of `index.ts` for precisely this reason.

**Fix: extract the composition too.** `c2Gate(env)` in
`server/concept2/availability.ts`, with a test where the rower is on
`ALLOWED_EMAILS` but NOT on `C2_ALLOWED_EMAILS`.

**Round 2 amended this, and the amendment is the current statement.** The
extraction above was real but insufficient: `index.ts` still hand-wired the
two finished checks, and `availableFor: c2.available` typechecked clean with
1878 unit tests green — the same bivariance hole one line further along, and
a total per-user bypass. `c2Gate` now returns
`{ gate: { available, availableFor }, bootLines }` and `index.ts` spreads
`...c2.gate`, so it names neither function.

**Round 2 also struck this paragraph's own residue claim.** It said the
residue shrinks to "one env var name"; the round-1 comments repeated it as
"four env var names". Both were false and both over-sold in the author's
favour. The measured census — four env var names, four mutually-assignable
field literals, the boot-line dispatch, and the fact that the spread is a
convention rather than a guarantee (hand-writing the two assignments back
still typechecks green) — lives on `c2Gate` in `concept2/availability.ts`,
with the command that measured each claim. Nothing should restate it; point
at it.

## F2 — the callback's comment claims something the same function falsifies

The comment says gating the callback per-user "would mean inventing a
principal". Step 3 resolves a full cookie `SessionUser`, and a later step
already reads `user.email` to render the Linked page. The reviewer built the
alternative: it typechecks, invents nothing, and reddens exactly one test.

**Ruling: move the gate to just after step 3, and keep the global check where
it is.** The residue the old comment hid is real — a rower removed from the
list within the attempt's 15-minute window still completes the callback and
gets a link row with live tokens — and closing it is the whole point of a
one-person rollout. Update the test the reviewer says reddens, and say in the
comment that the principal exists and we refuse it, rather than that it does
not exist.

## F4 — revocation must not be gated

`DELETE /link` on `availableFor` means an off-list rower cannot disconnect
their own Concept2 account: the row and its live tokens persist with no
self-service exit. **Ruling: `DELETE` goes back to `available()`**, with a
comment saying a capability gate closes USE, not revocation. The operator
remedy is in `docs/deploy.md`'s C2 section.

## F5 — the boot log must distinguish a typo from an absent variable

The empty-list warning fires only when the list is empty, so a typo'd address
gave a silent boot and an absent card, indistinguishable from correct
configuration. **Ruling: print the parsed COUNT at boot, never the addresses**
(`AUTH_VIA_LOG` is the precedent).
