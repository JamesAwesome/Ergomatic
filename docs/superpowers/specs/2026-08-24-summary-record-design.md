# The machine's own summary, kept and shown — RC-2/RC-3 wave design

**What and why.** The exit-7 walk (2026-08-24, `docs/monitor/sessions/
walk-2026-08-24/`) proved on the production build that the numbers we
capture from the PM5's finish burst match the machine's own memory
screen digit for digit — and unlocked the ROADMAP's display gate. But
today the record keeps only two of those numbers (work-only elapsed and
distance) plus the raw verification bytes, while `parseEndOfWorkoutSummary`
already decodes nine more fields that nobody stores — six of them
columns Concept2's own logbook keeps and our reconciliation table marks
NOT CAPTURED. This wave stores the machine's full end-of-workout summary
on the run record AND on the saved log's server row (RC-3 — the log
detail is server-backed, so numbers that stay client-side die at save),
decodes the burst's log date/time for diagnosis (RC-2), and shows the
rower the machine-confirmed line and verification code on the log
detail. It also widens capture to
Menu-terminated pieces, because the same walk's lab leg proved a
terminate emits the identical burst (`pm5-interface-notes.md` §25).

Approved by James 2026-08-24 ("looks right") after three scoping
answers: display = confirmed line + code; storage = client record only;
terminate capture = in this wave. TWO of those were then revised the
same day after the antagonist's full pass proved the display target and
the storage answer jointly impossible (the log detail is server-backed
and the client record is deleted at save success): storage is now
HYBRID SERVER (James's ruling after a footprint-quantified
Eng/DBA/PM argument — typed columns for the two machine totals, one
jsonb for the rest; footprint ~100-250 B/row, ~50-125 KB/year,
explicitly a non-issue), and terminate capture is OBSERVATIONS-ONLY
through four named gates (§1).

## Evidence base (research pass)

All wire semantics in this spec are already hardware-established; no new
mechanism is invented — the wave extends an existing writer and an
existing parser.

- PRIMARY (hardware, 3 captures): the finish burst and its ordering —
  `pm5-interface-notes.md` §24 (walk-2026-08-23 keystone, both race
  sides) and the exit-7 walk's production ring
  (`walk-2026-08-24/phone-exit7-ring.json`).
- PRIMARY (hardware, 1 capture): Menu-terminate emits the full burst,
  0x003F included — §25 (`walk-2026-08-24/lab-terminate-ring.json`).
  Residual stated there: the 0x0039 byte read as `workoutType` came back
  `01` on the terminated piece vs `08` on the completed one — raw,
  uninterpreted. This spec stores the byte verbatim and interprets
  nothing.
- PRIMARY (BLE doc pp.21-22 + hardware §23): the 0x0039 field layout the
  parser implements, including the /10 pace scale caveat and the
  heart-rate zero sentinels (`domain/monitor/pm5/parse.ts`,
  `parseEndOfWorkoutSummary` — shipped, tested, zero consumers).
- PRIMARY bytes, INFERENCE formula: log date/time u16 packing — date =
  `month | day<<4 | (year-2000)<<9`, time = `minutes | hours<<8`, NO
  seconds on the wire. The captures are hardware (exit-7 ring seq 60:
  `0x3588/0x0F03` = Aug 24 2026 15:03 vs the app's 15:04 header; the lab
  ring's `0x0F0E` = 15:14), but both share ONE date and one hour — year
  offset and month/day boundaries are unobserved, the BLE doc states no
  format (§23: "UNCERTAIN"), and a search for vendor documentation of
  the packing found nothing (recorded as a result). Contained: this
  spec's own ruling keeps the stamp diagnostic-only.
- PRIMARY (hardware, photographed): 0x003F's eight bytes rendered as two
  LE u32 words equal the PM5's on-screen verification code —
  walk-2026-08-23's `photo-w4-verification-code.jpeg` shows
  `6EF3-D827 5B55-52E1` against wire `27 d8 f3 6e | e1 52 55 5b`, exact.
  (This spec originally under-tagged this as INFERENCE; the antagonist's
  full pass corrected it — the equation is settled by the machine's own
  screen. C2-LOGBOOK equivalence remains unestablished and display copy
  still claims only "the monitor's verification code".)

Does-the-system-have-it: the PM5 has the concept this wave displays — a
per-workout verification code shown on its own Memory screen, and a
work-only summary row. We assert nothing on the machine's behalf; every
displayed number is bytes the machine sent.

## §1 — Capture: `summaryDetail` on the record (TRIAD, PR 1)

**The shape.** `MonitorRun` gains one optional observation field beside
`summaryTotals`/`verificationBytes`:

```ts
summaryDetail?: {
  avgStrokeRate: number;
  endingHeartRateBpm: number | null;
  avgHeartRateBpm: number | null;
  minHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  dragFactorAverage: number;
  recoveryHeartRateBpm: number | null;
  workoutType: number; // raw wire byte, uninterpreted (§25 residual)
  avgPaceSecondsPer500m: number; // SECONDS per 500m, already descaled by
  // parseEndOfWorkoutSummary (the 0.1 s/lsb caveat is the WIRE field's)
};
```

Values come verbatim from `parseEndOfWorkoutSummary` — no re-decoding,
no derived fields, no unit changes. Elapsed/distance stay in
`summaryTotals` (unchanged shape); this field never duplicates them.
Null sentinels pass through as null. Same contracts as its siblings:
additive-optional, write-once, never migrated, tolerated-but-unwritten
on old records, and `isMonitorRun` gains no check for it.

**The writer.** `appendSummaryObservations` takes the parsed summary in
its `observations` argument and writes `summaryDetail` in the same
single write as `summaryTotals` (one call, one `saveMonitorRun`). Its
write-once guard stays keyed on `summaryTotals !== undefined` — one
door for the whole observation set. The pinned sequence rider lands
here: a test asserting totals-first-bytes-second within the single
written object is replaced by the real pin — one atomic write carrying
all three fields, asserted by reading the record back once.

**Terminate admission — FOUR gates, observations-only (rewritten after
the antagonist's full pass killed the original one-line version).**
Production today hears NOTHING on a Menu-terminate: walk-2026-08-23's
`ring-phone-3-menu-terminate.json` is a production phone ring of exactly
this event and ends at `terminal terminated` with no
0x0039/0x003A/0x003F — teardown runs immediately on the rower-ended path
(`useMonitorSession.ts`'s `naturalFinish` check admits only
`endedBy === "finished"` to the linger) while the burst arrives ~1s
later (§25's lab measurement). Capture therefore requires four changes,
in series, each named so no implementer treats this as one widening:

1. **The linger** (`useMonitorSession.ts` teardown): the deferred-
   disconnect/second-stash branch admits `endedBy ∈ {"finished",
   "rower"}`. The honest predicate is "the link was still up when this
   closed" — the complement of `link-lost`/`program-failed` — which
   stays correct even if walk question W8 (a PM5 inactivity
   auto-terminate) lands in `"rower"` later.
2. **The driver door** (`driver.ts` `noteSummary`): a terminate-shaped
   admission for closed-by-rower runs that does NOT share `graceIsOpen`
   with the split path — the terminate's own partial 0x0037 keeps taking
   `boundary-out-of-run` (CSAFE-DEF footnote 12's post-terminate
   housekeeping boundary must never be filed as a real interval actual).
3. **An observations-only drain**: a summary admitted on the terminate
   path reaches `appendSummaryObservations` and NOTHING else. It must be
   structurally unable to reach `reconcileSummary`'s
   `filled-from-summary` branch — that branch synthesizes a COMPLETED
   final interval (`intervalComplete{finalBoundary:true}`), which on an
   abandoned run would corrupt the record's meaning, the heroes, and
   `buildMonitorLogSteps`. The branch list is the scope: of
   `reconcileSummary`'s branches, a terminate summary may reach the
   observation write alone.
4. **The writer guard** (`monitorRun.ts` `appendSummaryObservations`):
   admits the same "link was up" predicate as gate 1.

Evidence gaps, stated: the app-STOP venue (the End button issues the
CSAFE terminate and tears down in the same function) has ZERO captures
on either arm — exit criterion 1 claims only the Menu venue plus fake
coverage of the STOP shape, not a wire fact for STOP; and only one
terminate ordering (burst after terminal) has ever been observed. The
next natural hardware walk owes a PM5 memory photograph of a terminated
piece (the terminate path currently has no SCREEN oracle at all).

**The server tier (same PR — the numbers must outlive the save).** The
log-detail screen reads only the server row, and `LogSession`'s save
success deletes the client MonitorRun — so the machine's numbers reach
`session_logs` WITH the save, or they are gone. Hybrid shape (James's
ruling, 2026-08-24, after the Eng/DBA/PM argument):

- `machine_work_seconds` `doublePrecision`, nullable — 0x0039's
  work-only elapsed, in seconds (wire tenths; the PR #182 precision
  lesson binds).
- `machine_work_meters` `integer`, nullable — 0x0039's work-only
  distance, whole meters (wire is decimeters; store `Math.round` of the
  parsed value, and the validator names the rounding).
- `machine_summary` `jsonb`, nullable — one object carrying
  `verificationBytes` and the nine `summaryDetail` fields verbatim.
  Migration 0011's `series` is the precedent: monitor-observed,
  display-verbatim, never `WHERE`'d yet; Phase PS promotes keys to typed
  columns when its real query shape exists.
  **Task-6 correction:** the client stores the FULL 0x003F payload (19
  bytes on this firmware), not a length-8 array — the server validates
  `verificationBytes` as 1..32 ints 0-255 (`routes/data.ts`); display
  later reads only the first 8 of the stored array.

Migration 0016: additive, nullable, no defaults, NO backfill — old rows
read null and the display renders nothing for them. The save API gains
one optional field on `POST /api/logs`' body (additive-only rule between
tags holds; old clients omit it, the server tolerates absence). The
client sends the observation set it holds at save time; a save that
races ahead of the burst (sub-2s window) simply stores nulls — stated
residual, no update path in this wave.

**Riders (this PR).** (a) `FakeBurst`'s single `pendingBurst` slot gets
a loud overwrite (throw or console.error naming both scripts) instead
of silent replacement. (b) The FakeBurst offsets doc note is corrected
to the spec notation's two offsets (the plan prose said three).
(c) NEW residual recorded in `pm5-interface-notes.md` §25: the lab
terminate capture's 0x0039 avgStrokeRate decodes to 44 while the same
burst's 0x0038 reads 22 and 0x0032 reads 29 instantaneous — physically
22 is the true value (8.5 m/stroke vs an impossible 4.3). Stored
verbatim anyway; the terminate replay test pins the capture's 44 so the
anomaly stays visible.

## §2 — RC-2: log date/time, decoded and logged, stored nowhere

`parseEndOfWorkoutSummary` (or a sibling `parseSummaryLogStamp` if the
return shape would churn consumers) additionally decodes bytes 0-3:
`logDate` u16 and `logTime` u16 per the settled formats. The driver
emits ONE ring entry per burst:

    summary-log-stamp: wire=2026-08-24 15:03 wall=2026-08-24T15:04:12
    delta=-72s (wire carries no seconds)

**Ruling recorded here so nobody re-derives it:** the wire stamp is a
DIAGNOSTIC, not an identity. C2's logbook keys carry seconds; the wire
carries minutes. No dedup, no matching, and no storage may use this
stamp until the C2-link work (RC-5-era) decides a tolerance with C2's
API contract in hand. The ring entry exists to accumulate evidence for
that future decision (clock skew magnitude across real sessions).

## §3 — Display: the MACHINE CONFIRMED block (PR 2)

On the log detail (`src/log/FromTheLog.tsx`, via `storedSummary`'s read
path — which reads the SERVER row; `StoredLog` gains the three new
nullable fields), a row whose server row carries `machine_work_seconds`
renders a compact block:

    MACHINE CONFIRMED
    2:04.0 work · 500m
    CODE AF99-4706 C021-B054

- Time formatted in house elastic-positional style; meters labelled.
- The code renders only when `machine_summary.verificationBytes` is
  present: the first eight bytes as two LE u32 words, uppercase hex,
  `XXXX-XXXX` per word — the exact rendering the PM5's own Verification
  screen uses (PRIMARY: walk 2026-08-23 photograph, digit-exact).
  Absent bytes = no CODE line, no placeholder.
- Rows without observations render NOTHING — no dashes, no empty state
  (older records are the common case for a long time).
- Copy uses no em-dashes (house style). "MACHINE CONFIRMED" and "CODE"
  are the only new strings; both live with the other log-detail copy.
- The block is informational, not a hero: it must not displace the
  stored heroes or intervals; place it below the interval table, above
  MONITOR LOG · COPY, matching the section rhythm already on the screen.
  **CORRECTED (PM gate fix wave, 2026-08-25, condition 5): "above
  MONITOR LOG · COPY" was wrong — that diagnostics button lives on the
  LIVE summary (`LogSession.tsx`), which this stored view (`FromTheLog.
  tsx`) has no equivalent of at all. The shipped placement is directly
  below the interval table and above the trace chart** (`FromTheLog.tsx`
  already carried this correction in its own code comment at ship time;
  this is the spec catching up to it).
- The nine detail fields are STORED in PR 1 but NOT displayed in this
  wave (drag factor, HR, avg pace have no settled product surface yet);
  the display reads only the two machine totals + the verification
  bytes. Phase PS (personal stats) is the natural consumer later.
- Accessibility: the block is a labelled group; 44px targets don't
  apply (nothing tappable); AA contrast computed and reported for any
  new token use (recurring failure 6).

**MARKED AMENDMENT (James's ruling, 2026-08-25, summary-display wave PR
2 — `docs/superpowers/plans/2026-08-25-summary-display.md`'s Global
Constraints).** Two changes to the text above, both already reflected
in the implementation and its tests:

- **The label ruling.** "MACHINE CONFIRMED" above is superseded by
  **`MACHINE CONFIRMED · WORK ONLY`**, and the block gains a fourth
  line, a caption. **CORRECTED (PM gate fix wave, 2026-08-25, condition
  2):** the caption first shipped as `Rest metres excluded. The totals
  above include rest.`, which points only at the heroes ABOVE the
  block — the trace chart BELOW it also includes rest, and the caption
  never said so. The shipped caption is **`Rest metres excluded.
  Everything else on this screen includes rest.`** The worked example
  is now:

      MACHINE CONFIRMED · WORK ONLY
      2:04.0 work · 500m
      CODE AF99-4706 C021-B054
      Rest metres excluded. Everything else on this screen includes rest.

- **The axis-collision resolution.** ROADMAP's RC phase carried a
  NOT-DEFERRABLE finding (#191's PM gate): this block's WORK-ONLY total
  and `traceModel.ts`'s work-plus-rest `t`/`d` axes would read as one
  number contradicting another on the same screen (500m beside a
  d-axis running to 742.7m on the exit-7 piece, 48% apart). James's
  ruling resolves the collision **by labelling, not by changing what
  either number means**: the WORK ONLY qualifier plus the caption name
  the split explicitly, so the two numbers read as two honestly-labelled
  different quantities rather than a disagreement. The chart's own axes
  are UNCHANGED by this ruling — whether `traceModel.ts` should ever
  become a true work-only clock stays open, tracked separately in
  ROADMAP under Phase RC, not resolved here.

## §4 — Testing

- **Replay oracle (PR 1):** the walk-2026-08-23 keystone recording
  replayed end-to-end asserts every `summaryDetail` field equals the
  hand-decoded bytes of its 0x0039 (the capture's own values, not
  fixture-invented ones — recurring failure 3/11).
- **Terminate path (PR 1):** a fake script shaped like
  `lab-terminate-ring.json` (rower-ends mid-interval, burst ~1s later)
  driven through `useMonitorSession` WITH a real unmount/teardown — a
  driver-level test is structurally blind to the linger gate (gate 1)
  and must not be the oracle. Asserts: the "rower"-ended run receives
  `summaryTotals` + `summaryDetail` + `verificationBytes`; the record's
  actuals/heroes are UNCHANGED by the summary (observations-only — the
  `filled-from-summary` branch unreached); and the stored avgStrokeRate
  is the capture's own 44 (the anomaly stays visible). Must FAIL before
  the four-gate build and pass after.
- **Write-once and atomicity (PR 1):** second burst refused; the single
  write carries all three fields or (no 0x003F) exactly two.
- **RC-2 (PR 1):** parser unit tests on the two real capture stamps
  (0x3588/0x0F03 → Aug 24 2026 15:03; the §23 walk's stamp) plus
  boundary stamps (Jan 1, Dec 31, 00:00, 23:59); one driver test
  asserting the ring entry fires once per burst.
- **Server round-trip (PR 1, integration):** migration 0016 against real
  Postgres — a pre-migration row reads null; a save carrying REAL
  fractional machine values (124.0 s from the capture, and a tenths
  value like 24.3 s from the terminate capture — not whole-number
  fixtures, the PR #182 lesson) round-trips through `POST /api/logs` and
  `GET /api/logs/:id`; a save with no machine field stores nulls.
- **Display (PR 2):** component tests against a realistic stored record
  (real observation values from the walk), the no-observation case
  (renders nothing), and the totals-without-bytes case (no CODE line);
  `pnpm e2e` + `pnpm screenshots` (layout change on the log screen).
- Per-file coverage checked for every touched file (recurring failure 2).

## PR shape and gates

- **PR 1 (TRIAD, lands alone):** capture + client observation + server
  columns/migration/save-path + terminate admission (four gates) + RC-2
  logging + riders. Full antagonist pass on this spec DONE (2026-08-24:
  BLOCK verdict, both kills folded into this revision); PM final-PR
  gate on the PR.
- **PR 2 (UI):** the MACHINE CONFIRMED block. PM final gate RESTORED
  (the PM's own ruling: the original waiver was written against the
  client-only premise and does not survive the correction — PR 2 now
  displays server-stored values). Antagonist SKIP stated: inherits this
  spec's vetted ground, no new invariant class.
- Explicitly NOT in this wave: any use of the wire date/time beyond the
  ring, display of the nine detail fields, C2 posting (RC-5), the
  chart-gap diagnosis, and the 1m-counter revert (both queued
  separately in ROADMAP).

## Exit criteria

1. A natural finish and a Menu-terminate both leave client records
   carrying `summaryTotals`, `summaryDetail`, and (firmware permitting)
   `verificationBytes` — proven by replay + fake tests. The Menu-venue
   terminate test drives a real `useMonitorSession` unmount/teardown
   (driver-level alone is blind to the linger gate); the app-STOP venue
   is covered by fake shape only and SAID to be (no wire capture
   exists). No new hardware walk gates this wave; the next natural walk
   owes the terminated-piece PM5 photograph.
2. A saved log's server row carries the two machine totals and the
   `machine_summary` blob; pre-wave rows read null. The log detail shows
   the MACHINE CONFIRMED block for new rows and nothing for old ones;
   screenshots committed showing real data.
3. The ring carries one `summary-log-stamp` entry per 0x0039
   NOTIFICATION (the documented ~1-minute recovery-HR re-fire of 0x0039
   legitimately produces a second entry — §23 offset 16); nothing
   anywhere stores or compares the wire stamp.
4. `isMonitorRun` still accepts pre-wave records unchanged.
