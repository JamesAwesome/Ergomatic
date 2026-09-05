# What does Concept2 compare a verification code against? — research pass for Wave E PR C, exit criterion C1

Scope: §5.4 question 1 of `docs/superpowers/specs/2026-09-04-concept2-walk-fixes.md`
("What does Concept2 actually compare the code against?"). No checkout was
written to; this file is the only output. Tags: PRIMARY / SECONDARY / INFERENCE,
per `.claude/agent-briefing.md`'s citation rule — each load-bearing claim below
quotes the line it rests on.

## Sources fetched, in the order the brief specified

1. **Concept2 Logbook developer documentation** — `log.concept2.com/developers/documentation/`
   (redirects to the `http://` origin; fetched twice, independently, same result
   both times) and `log.concept2.com/help`.
2. **Concept2's PM5/CSAFE wire spec** — `PM5_CSAFECommunicationDefinition.pdf`
   (rev 0.27, the C2 PM CSAFE Communication Definition, which is the document
   that actually carries the BLE GATT attribute table — `pdftotext -layout`
   extracted locally after WebFetch saved the binary; the concept2.cn mirror of
   the separate "Bluetooth Smart Interface Definition" PDF failed TLS
   verification and was not used).
3. **Concept2's own regional support/FAQ pages** (`concept2southafrica.com`,
   `concept2.ch` mirror 404'd) and **forum threads** (`c2forum.com`,
   `www.c2forum.com`) — the forum returned **HTTP 403 to every direct WebFetch
   attempt** (four URLs tried); what is reported from it below is a search
   engine's summary of the page, not text I opened and read myself, and is
   flagged accordingly.
4. **The repo's own record** — `docs/superpowers/specs/2026-09-04-concept2-walk-fixes.md`
   §3.8/§5.4, `docs/monitor/c2-crossconnect-2026-09/README.md` (our own prior
   live desk-harness walk against `log-dev.concept2.com`), `docs/monitor/pm5-interface-notes.md`,
   `app/server/concept2/mapping.ts`, `app/src/monitor/monitorRun.ts`,
   `app/src/monitor/driver.ts`.

## A — What Concept2 says the code is validated against

**PRIMARY**, `log.concept2.com/developers/documentation/`, the Add Result
endpoint's `verification_code` parameter description, fetched twice
independently with identical wording both times:

> "The verification code for the piece. For the verification code to be
> accepted, the date, time, distance, workout_type and machine type must
> match that of the code."

So the check is field-by-field: five named fields on the **submitted result**
(`date`, `time`, `distance`, `workout_type`, `machine_type`) must match
whatever those same five things are for the code (i.e., the piece the code
identifies) — not a single opaque distance-only check, and not the overall
work+rest figure (rest is not in the list — see D).

The same page's `verified` field, quoted for context (not this question, but
adjacent): "Whether the result should be considered verified. Only trusted
clients are able to verify workouts. Please contact Concept2 for more
information." This is the mechanism ErgData/Concept2 Utility use to set
`verified: true` directly without a code at all (corroborated below, §ours).

**Nothing on `log.concept2.com/help`** beyond the general ranking FAQ,
**PRIMARY**, quoted: "Verification is not required to rank a piece, however,
to flag a manually entered piece as 'verified', you can use the verification
code from your PM3, PM4 or PM5." No field-level detail there.

## B — Tolerance: exact match or a band?

**PRIMARY** (same quote as A): the verb is "must match" — no numeric band is
stated anywhere in the fetched developer docs.

**SECONDARY, and flagged as lower-confidence than usual — the source page
itself could not be opened (c2forum.com returned HTTP 403 to WebFetch on
every attempt; this is a search engine's summary of the thread, not text I
read directly):** a c2forum thread ("Verification Code", `t=172323`) is
reported by the search summary as saying "The verification code only works
if you get the exact distance, right date and right elapsed time (including
the tenths)." This is consistent with A's "must match" reading exact,
tenths-of-a-second precision on time — but I could not verify the exact
wording myself, so treat it as corroborating direction rather than a quote.

**PRIMARY, our own prior measurement** (`docs/monitor/c2-crossconnect-2026-09/README.md`,
"Dedup granularity" section, live against `log-dev.concept2.com`,
2026-08-31): posting the identical row with `date` +30 s produced a fresh
`201` rather than colliding with the original — "DATETIME-GRANULAR (to the
second)" — and a `time` +0.1 s also produced a fresh row ("`time` is in the
key"). That is C2's **dedup** key granularity, not the verification-match
tolerance, but it is the closest thing we have measured ourselves to
sub-second precision mattering to this API, and it is consistent with B's
"exact, to the tenth" reading rather than contradicting it.

## C — Derived from the PM5's own logged piece, or a checksum of submitted fields?

**INFERENCE, now better-supported than the spec's own §3.8 inference, on a
PRIMARY wire citation.** `PM5_CSAFECommunicationDefinition.pdf` rev 0.27,
the `0x003F` "C2 rowing logged workout characteristic" (15 bytes), quoted
verbatim from the attribute table:

> "Logged Workout Hash (Lo), CSAFE_GET_CURRENT_WORKOUT_HASH, Logged Workout
> Hash, Logged Workout Hash, Logged Workout Hash, Logged Workout Hash,
> Logged Workout Hash, Logged Workout Hash (Hi), CSAFE_GET_INTERNALLOGPARAMS,
> Logged Workout Internal Log Address (Lo), Logged Workout Internal Log
> Address (Mid Lo), Logged Workout Internal Log Address (Mid Hi), Logged
> Workout Internal Log Address (Hi), Logged Workout Size (Lo), Logged
> Workout Size (Hi), Erg Model Type"

and the command table entry for the hash itself, `CSAFE_PM_GET_CURRENT_WORKOUT_HASH`
(`0x72`): 8 opaque hash bytes, no algorithm stated. **The hash is packaged
together with a pointer into the PM5's own internal log memory** (the
"Internal Log Address" and "Log Size" of the entry the hash belongs to) —
this is a reference to a specific record the machine itself already wrote to
its own storage, not a value independently recomputable by hashing whatever
fields a client happens to submit. That structure supports the spec's §3.8
inference — "Concept2 validates the code against the piece the monitor
logged" — one level further: the wire evidence is that the code names an
entry in the *machine's own log*, so the fields it is checked against (A)
are most naturally the machine's own stored values for that entry, not a
formula over arbitrary submitted numbers.

**Gap, stated plainly:** neither this doc nor the developer-docs page states
the hash's input formula (which fields feed it, in what order, what hash
function). "The code is a reference to the PM5's own logged record" is
supported; "the hash is literally date‖time‖distance‖machine_type" is not
stated anywhere I could read — it is INFERENCE dressed one notch better by a
structural citation, not a proven algorithm.

**Corroborating, PRIMARY, our own prior measurement**
(`c2-crossconnect-2026-09/README.md`, "Verification stretch"): posting the
capture's actual raw 0x003F bytes, hex-grouped into C2's example code
shape, came back `201` with `verified: false` — silently ignored, not an
error. Quoted: "our raw bytes are not C2's code format as-is; verification
needs the format documented by C2 or observed from ErgData." This is
independent evidence that the wire hash is not simply reformatted into the
16-digit code (or if it is, we don't have the transform) — one more reason
C leans toward "the code addresses the machine's stored record" rather than
"the code IS a client-computable checksum."

## D — What "time" means, and does `rest_distance` participate?

**PRIMARY** (A's quote): the five fields C2 names as required to match are
`date`, `time`, `distance`, `workout_type`, `machine type` — **`rest_distance`
is not among them.** Read plainly, that is evidence the match is on
work-only `distance`/`time`, not the work+rest overall — which, if it holds,
answers spec §5.4 question 4 directly: rest is irrelevant to this refusal,
and the fix is about which WORK number to send, not about the overall.

**PRIMARY, our own prior measurement**, corroborating what "time" is *for
display* even though it doesn't itself resolve which "time" the verification
check reads: `c2-crossconnect-2026-09/README.md`'s "The post" section —
"`time_formatted: 6:14.8` — that is 374.8 s = work + rest, so C2's own
display fuses work and rest while `time` stays work-only." Our own `time`
field (what we submit and what C2 stores under that name) is already
work-only, consistent with a work-only field being the one A's quote names.

**Caveat:** A's quote does not itself say "`time` means work time only" — it
only names the field. The above is the field being the same one our own
POST already populates with work-only seconds (`mapping.ts:493`,
`c2Tenths(workSeconds)`), not a vendor statement about the field's meaning.

## E — How a multi-interval piece is logged (total row vs interval rows)

**PRIMARY, this repo's own record**, `docs/monitor/pm5-interface-notes.md`
§27.1, verbatim (quoted again here from the spec, which quotes it from the
source file): "Both §23 premises therefore hold: 0x0039 is a whole-workout
cumulative total, and it counts work only." **PRIMARY, James's hardware
measurement, 2026-09-04**: on the walk in question, the PM5's own View Detail
total row (25:00.0 / 5706 m) disagreed with the sum of its own displayed
interval rows (2837+1953+918 = 5708 m) by 2 m — "the monitor's own total
disagrees with the sum of its own intervals."

**Nothing in either vendor document fetched in this pass explains that 2 m
internal disagreement** — no description of how the PM5 computes its
View Detail total row versus its interval rows, and no description of how
either relates to the internally-stored log record C's 0x003F hash points
at. What C's citation does support: the hash addresses ONE stored record
(not a re-derivation from split rows), so if that record's own distance
field is what 0x0039/the total row reads from, then INFERENCE (unchanged in
strength from the spec's own): the code most likely validates against the
**total-row number (5706)**, not the interval sum (5708) we currently send —
but this pass found no document that states it outright.

## F — What was not found, scoped precisely

- **No vendor document (dev docs page, PM5 CSAFE Communication Definition
  rev 0.27, or the two regional support pages fetched) states the
  verification hash's input formula** — which raw fields it hashes, in what
  order, or what function. The CSAFE doc names the characteristic and its
  companion internal-log pointer; it does not publish the hash algorithm.
- **No numeric tolerance is stated anywhere fetched.** "Must match" (dev
  docs) is the strongest wording found; the only "including the tenths"
  language came from a forum page WebFetch could not open directly (HTTP 403
  on `c2forum.com` across four distinct thread URLs) and is reported only as
  a search-engine summary, not a verified quote.
  the ErgData/RowsAndAll/painsled algorithm angle: WebSearch found no
  algorithm-level discussion of the verification code in any indexed
  RowsAndAll blog post or forum thread it returned — this is a **search
  gap**, not a confirmed absence, because c2forum (where such detail is most
  likely to live) was unreadable to WebFetch in this session.
- **`log.concept2.com/help` was fetched and searched**; it carries only the
  general ranking-verification sentence quoted in A, nothing field-level.
- **The concept2.cn mirror of the separate "PM5 Bluetooth Smart Interface
  Definition" PDF failed TLS verification** and was not read; the CSAFE
  Communication Definition PDF (rev 0.27, fetched from concept2.sg)
  substitutes for it and does carry the full BLE GATT attribute table, so
  this is not believed to be a meaningful gap, but it is named because it is
  a document the brief asked for that was not actually opened.
- **The PM5's own internal log-record binary format (`LOGHEADER` /
  `LOGFIXEDHEADERDATA` field-by-field layout) is not in this document** —
  only the record-type enum names are listed (`pdftotext` output, "Log
  Structure Identifiers" section) — so E's inference about which total the
  logged record stores could not be checked against a byte-level field
  description.

## Cheapest walk to settle what the documents leave open

Take the SAME divergent interval row James already has the code for
(`D9BD-F964-32E2-7F18`, work 5708/rest 525, monitor total 5706) and submit it
to the API three times with date/time/workout_type/machine_type held
identical: once with `distance: 5708` (ours), once with `distance: 5706`
(the monitor's total-row number), and once as a Just Row or single-interval
piece from the same session if available. Enter the one PM5-displayed code
against all three. **If 5706 verifies and 5708 does not**, C is settled by
observation — the total-row number is what the machine's own logged record
carries and question 2 (which number is authoritative) is answered without
needing the hash algorithm at all. **If neither verifies**, the failure is
not distance alone (date/time/workout_type/machine_type must be checked
next, isolated one at a time) — and if the Just Row/single-interval leg
verifies while both interval submissions fail, that independently confirms
§3.8's mechanism (one boundary/one summary can't diverge) regardless of
which distance number turns out right.

## Answers, one line each (A–F)

- **A — PRIMARY.** Five named fields must match: date, time, distance, workout_type, machine_type.
- **B — PRIMARY exact / SECONDARY-unverified tenths.** "Must match"; no stated numeric band.
- **C — INFERENCE, wire-supported.** Hash addresses the PM5's own internal log record, not a submitted-field checksum.
- **D — PRIMARY.** `rest_distance` absent from the five; `time` is our work-only field already.
- **E — PRIMARY fact, INFERENCE conclusion.** 0x0039 is work-only cumulative; which total the log record stores is unstated.
- **F — Two real gaps.** Hash algorithm undocumented; c2forum unreadable (403) this session.

## Walk proposal, two lines

Post the SAME divergent interval row three ways (distance 5708, distance 5706, and a Just Row/single-interval sibling), same code entered each time.
5706 verifying and 5708 not settles which number is authoritative without the hash algorithm; neither verifying isolates the failure to date/time/workout_type/machine_type instead.
