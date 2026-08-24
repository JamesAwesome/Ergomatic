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
on the run record (RC-3), decodes the burst's log date/time for
diagnosis (RC-2), and shows the rower the machine-confirmed line and
verification code on the log detail. It also widens capture to
Menu-terminated pieces, because the same walk's lab leg proved a
terminate emits the identical burst (`pm5-interface-notes.md` §25).

Approved by James 2026-08-24 ("looks right") after three scoping
answers: display = confirmed line + code; storage = client record only
(no server columns — RC-5/C2-link work adds those against C2's real API
shape later); terminate capture = in this wave.

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
- PRIMARY (hardware, 2 captures): log date/time u16 formats — date =
  `month | day<<4 | (year-2000)<<9`, time = `minutes | hours<<8`, NO
  seconds on the wire (§23 walk + exit-7 ring seq 60: `0x3588/0x0F03` =
  Aug 24 2026 15:03 vs the app's 15:04 header).
- INFERENCE (standing, unphotographed): 0x003F's eight bytes rendered as
  two LE u32 words equal the PM5's on-screen verification code. Display
  copy therefore says what the code IS ("the monitor's verification
  code") without claiming C2-logbook equivalence; the tag lives in code
  comments, not user copy.

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
  avgPaceSecondsPer500m: number; // 0.1 s/lsb scale, parser's own caveat
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

**Terminate admission.** The writer's guard widens to admit
`endedBy ∈ {"finished", "rower"}` (today it admits only `"finished"`) —
"rower" is the venue-blind close reason Menu-at-the-erg and
the app's own STOP both write (`CloseReason`'s doc comment). "link-lost"
and "program-failed" stay refused: no link, no burst to trust. The
driver's summary admission path (`noteSummary` and the linger) must
deliver a burst on the rower-ended path the same way it does on the
finished path; if the driver's gate currently keys on the
final-interval/grace machinery in a way a terminated run never
satisfies, the implementer widens THAT gate for closed-runs-by-rower —
and the fake gains a terminate-shaped burst script to pin it (see §4).
The riskiest claim in this spec is exactly here: that the production
admission path passes a terminate burst end-to-end. One lab capture
supports it; the antagonist should attack this seam first.

**Riders (this PR).** (a) `FakeBurst`'s single `pendingBurst` slot gets
a loud overwrite (throw or console.error naming both scripts) instead
of silent replacement. (b) The FakeBurst offsets doc note is corrected
to the spec notation's two offsets (the plan prose said three).

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

On the log detail (`src/log/FromTheLog.tsx` area, via `storedSummary`'s
read path), a row whose stored record carries `summaryTotals` renders a
compact block:

    MACHINE CONFIRMED
    2:04.0 work · 500m
    CODE AF99-4706 C021-B054

- Time formatted in house elastic-positional style; meters labelled.
- The code renders only when `verificationBytes` is present: the first
  eight bytes as two LE u32 words, uppercase hex, `XXXX-XXXX` per word —
  the exact rendering the PM5's own Verification screen uses (walk
  2026-08-23 photograph). Absent bytes = no CODE line, no placeholder.
- Rows without observations render NOTHING — no dashes, no empty state
  (older records are the common case for a long time).
- Copy uses no em-dashes (house style). "MACHINE CONFIRMED" and "CODE"
  are the only new strings; both live with the other log-detail copy.
- The block is informational, not a hero: it must not displace the
  stored heroes or intervals; place it below the interval table, above
  MONITOR LOG · COPY, matching the section rhythm already on the screen.
- `summaryDetail`'s nine fields are STORED in PR 1 but NOT displayed in
  this wave (drag factor, HR, avg pace have no settled product surface
  yet); the display reads only `summaryTotals` + `verificationBytes`.
  Phase PS (personal stats) is the natural consumer later.
- Accessibility: the block is a labelled group; 44px targets don't
  apply (nothing tappable); AA contrast computed and reported for any
  new token use (recurring failure 6).

## §4 — Testing

- **Replay oracle (PR 1):** the walk-2026-08-23 keystone recording
  replayed end-to-end asserts every `summaryDetail` field equals the
  hand-decoded bytes of its 0x0039 (the capture's own values, not
  fixture-invented ones — recurring failure 3/11).
- **Terminate path (PR 1):** a fake script shaped like
  `lab-terminate-ring.json` (rower-ends mid-interval, then the burst)
  asserts a "rower"-ended run receives `summaryTotals` +
  `summaryDetail` + `verificationBytes`. This test must FAIL before the
  admission widening and pass after (failing-test-first, and it is the
  spec's riskiest claim).
- **Write-once and atomicity (PR 1):** second burst refused; the single
  write carries all three fields or (no 0x003F) exactly two.
- **RC-2 (PR 1):** parser unit tests on the two real capture stamps
  (0x3588/0x0F03 → Aug 24 2026 15:03; the §23 walk's stamp) plus
  boundary stamps (Jan 1, Dec 31, 00:00, 23:59); one driver test
  asserting the ring entry fires once per burst.
- **Display (PR 2):** component tests against a realistic stored record
  (real observation values from the walk), the no-observation case
  (renders nothing), and the totals-without-bytes case (no CODE line);
  `pnpm e2e` + `pnpm screenshots` (layout change on the log screen).
- Per-file coverage checked for every touched file (recurring failure 2).

## PR shape and gates

- **PR 1 (TRIAD, lands alone):** capture + storage + terminate
  admission + RC-2 logging + riders. Full antagonist pass on this spec
  before the plan; PM final-PR gate on the PR.
- **PR 2 (UI):** the MACHINE CONFIRMED block. No PM gate (display of
  already-gated numbers, gate discharged by the walk); antagonist SKIP
  stated: inherits this spec's vetted ground, no new invariant class.
- Explicitly NOT in this wave: server columns (RC-5-era), any use of the
  wire date/time beyond the ring, display of the nine detail fields,
  the chart-gap diagnosis, and the 1m-counter revert (both queued
  separately in ROADMAP).

## Exit criteria

1. A natural finish and a Menu-terminate both leave records carrying
   `summaryTotals`, `summaryDetail`, and (firmware permitting)
   `verificationBytes` — proven by replay + fake tests; no new hardware
   walk required (the production path was walked at exit 7).
2. The log detail shows the MACHINE CONFIRMED block for new rows and
   nothing for old ones; screenshots committed showing real data.
3. The ring carries one `summary-log-stamp` entry per burst; nothing
   anywhere stores or compares the wire stamp.
4. `isMonitorRun` still accepts pre-wave records unchanged.
