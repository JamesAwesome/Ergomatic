# Short status frames: a monitor older than 2018 is silently unusable

**Date:** 2026-09-07 · **Class:** TRIAD (wire semantics — what we decode off
the wire feeds every number the app reports) · **Status:** REV 2, after the
antagonist anchor pass · **Gate 0:** none — this PR changes no user-visible
copy or layout · **Antagonist:** anchor pass complete; verdict "fix is correct,
I could not break it", four must-adds and three corrections folded in below.

## What and why

A friend of James's rowed for five minutes on 2026-09-07 and the app recorded
nothing. It sat on `READY` the whole time, gave no warning, and disconnected.
The work was on the monitor and the app kept none of it.

The cause is one length check. Concept2 appended a field to a status packet in
2018; our parser was written against the newer form and rejects anything
shorter, so on a monitor whose firmware predates that change we throw away
every one of those packets. The field we insist on is the only field in the
packet that nothing in the app reads.

Losing that packet alone would already cost **live pace and the rest
countdown** as well as stroke rate and heart rate — pace being the number the
rower actually reads. What made it total is the driver's frame gate: it
publishes a reading only once all three status characteristics have parsed at
least once, `seen.as1` is a **one-way latch** set only inside the
successful-parse callback, and no parse ever succeeded. No latch, no readings,
ever — for the whole session, with no signal to the rower.

**This spec fixes the parse for both affected characteristics and nothing
else.** The missing warning and the firmware read are named as follow-ons with
their own PRs.

## Root cause, sourced

### How the family was actually determined

The defect's real criterion is **a length floor that discards a whole frame
over a byte no consumer reads**. That is a property of our own source, so it is
computed from our own source, over all nine parsers in `pm5/parse.ts`:

| parser | floor | highest byte consumed | slack |
| --- | --- | --- | --- |
| `parseGeneralStatus` 0x0031 | 19 | 18 (`dragFactor`) | 0 |
| **`parseAdditionalStatus1` 0x0032** | **17** | **15** (`restSeconds`, u24 @13) | **1** |
| `parseAdditionalStatus2` 0x0033 | 20 | 19 (`lastSplitDistanceMeters`) | 0 |
| `parseSplitIntervalData` 0x0037 | 18 | 17 (`splitIntervalNumber`) | 0 |
| **`parseAdditionalSplitIntervalData` 0x0038** | **19** | **17** (`splitIntervalNumber` @17) | **1** |
| `parseEndOfWorkoutSummary` 0x0039 | 20 | 19 (`avgPaceSecondsPer500m`) | 0 |
| `parseAdditionalSummaryRest` 0x003A | 17 | 16 | 0 |
| `parseAdditionalSummary` 0x003A | 19 | 18 (`avgCalPerHour`) | 0 |

**The family is exactly `{0x0032, 0x0038}`**, and this route does not depend on
the vendor's changelog being complete.

**Why the changelog is not the method.** A revision history is a log of edits
to the DOCUMENT, not a changelog of the wire: a row exists only where an
engineer wrote one. The anchor pass found three GATT-versus-multiplexed layout
divergences carrying no revision row at all, one of which (`0x003A`, 19 against
18) is not explained by the multiplexed 20-byte ceiling. The changelog below is
kept as corroboration, not as proof.

### The vendor citation

Revision history, rev 1.30 Table 1, verbatim — this establishes **added**, and
nothing else:

```
11/2/2018   Mark Lyons   Added Erg Machine Type parameter to characteristic 0x0032/0x0080/
                         V1.26.
11/8/2018   Andrew Dombek   Added Erg Machine Type parameter to characteristic 0x0038.
                            Clarifications added for MultiErg workouts.
                            V1.27.
```

The V1.26 row also names `0x0080`, the multiplexed form. **We decode no
multiplexed path**: `pm5/uuids.ts` defines no `0x0080` and
`grep -rn "0x0080" app/src app/domain` returns nothing.
`docs/monitor/pm5-interface-notes.md:504-517` already records that the
multiplexed restatements are not byte-identical to the GATT forms.

**Last** comes from a different line — rev 1.30 Table 3's field ordering for
`0x0032`, which ends `Rest Time Hi` then `Erg Machine Type`, counting
3+2+1+1+2+2+2+3+1 = 17 with the field at offset 16. `0x0038` likewise ends on
it at offset 18. Both match `parse.ts:170` and `parse.ts:281`.

**INFERENCE, labelled:** the document nowhere states that the pre-V1.26 form
was 16 bytes. That an older frame is a clean prefix follows from additive
language plus trailing position. It is sound, and it is corroborated
independently (see Prior art), but it is not an observation.

### Why 0x0038 must ship in the same PR

Not because of the vendor row. Because of what our code does without it:
`noteBoundaryHalf` (`driver.ts:3120-3157`) emits `intervalComplete` only when
BOTH 0x0037 and 0x0038 arrive carrying the same split/interval number. With
0x0038 failing to parse, `boundaryHalves.asSplit` is never set, no boundary
ever fires, and **no `IntervalActual` is ever recorded**. Fixing 0x0032 alone
would give a pre-2018 rower live numbers and a stored session with zero
per-interval rows.

## Evidence, and the one thing it cannot tell us

From the reporting session's ring export:

- Hundreds of consecutive `frame-error` entries reading
  `0x0032: expected 17 bytes, got 16`, at the full sample cadence.
- `resume-frames` reporting `phase=ready` and `rowingActive=unseen`. That
  string is `lastFrame?.rowingActive ?? "unseen"` (`useMonitorSession.ts:5283`),
  so it can only be produced by the hook never having received a frame.
- A decoded `0x0031` whose raw bytes are 19 long, in the same session, so the
  radio was not clipping notifications.

**What it cannot tell us, and why we cannot recover it.** The fix depends on
that monitor's `0x0033` parsing, since the gate needs `seen.as2` too. If its
0x0033 is also short, this fix restores nothing. The driver records
`notify-first <char> (<n>B)` on first arrival of every characteristic and
BEFORE the decode (`driver.ts:2301`), so the answer for all five was in the
ring — **but the ring holds 500 entries (`eventLog.ts:51`) and the export runs
seq 5432 to 5931, exactly 500.** It had already rolled over.

**This is a finding, not just a gap: the flood evicts its own diagnosis.** A
frame error at roughly eight per second fills the whole buffer in about a
minute, discarding the connect-time entries that identify the monitor. A fresh
export from the same rower would be equally useless. Recorded as a follow-on.

**Consequence for this PR, stated plainly:** the 0x0038 half rests on the
vendor document and on the mechanical audit, with **zero observational
support**, and the 0x0033 assumption is unverified. Neither blocks the fix —
lowering a floor cannot make a currently-working monitor worse — but the spec
does not claim they are observed.

## What changes

1. **`parseAdditionalStatus1` (`0x0032`) accepts 16 bytes.** Every consumed
   field occupies bytes 0 to 15. `ergMachineType` becomes optional, and the
   property is **omitted entirely** rather than set to `undefined` when byte 16
   is absent.
2. **`parseAdditionalSplitIntervalData` (`0x0038`) accepts 18 bytes**, same
   rule, `ergMachineType` at byte 18.
3. **Both `ergMachineType` fields become optional.** Neither has a consumer in
   `app/src` or `app/domain` — verified, and verified indirectly too: absent
   from `MonitorFrame` and `IntervalActual`, and the recording format carries
   raw `(char, bytes)` rather than decoded objects. **Both must change
   together**: `RawPm5Status` is an intersection of the two interfaces, so
   making one optional leaves the intersection required and changes nothing.
4. **The encoders take an explicit short-form flag.**
   `buildAdditionalStatus1Bytes` and `buildAdditionalSplitIntervalDataBytes`
   omit the trailing byte when it is set. A flag rather than an optional input
   field, so a caller that forgets cannot produce a short frame by accident.
   **The long-form branch needs `s.ergMachineType ?? 0`**: `writeU8` takes
   `number`, `strict` is on, and an optional property reads as
   `number | undefined`, so without the default this does not typecheck.
5. **The fake gains its own short-form switch** so a whole session can be
   driven with short frames. The encoder flag alone is not enough; the seam
   test drives the fake, which builds its `0x0032` at `fake.ts:1064`.

## What deliberately does not change

- **No firmware-version gating.** The receipt, rather than a bare assertion:
  PM5 versions are not one ordered sequence. The vendor's own attribute table
  prints, for a single characteristic, "(Valid for PM5 V150 – V199.99 only)
  (Valid for PM5 V204 – V299.99 only)", and Concept2's firmware timeline gives
  RowErg, SkiErg and BikeErg separate number ranges. A version comparison is
  therefore not an order relation, and a gate built on one is a heuristic
  wearing a number. The length check, by contrast, is deterministic: the
  transport REPORTS `bytes.length`, and a truncated notification has no
  supported producer because ATT does not deliver partial PDUs.
- **The frame gate stays as it is.** Relaxing `seen.general && seen.as1 &&
  seen.as2` to general alone would hand consumers zeros for rate and pace,
  which is a fabricated reading (recurring failure 11). The gate is correct;
  its input was wrong. **But note what is being deferred:** the rower's actual
  experience was not the gate's strictness, it was its silence. `mergeStatus`
  logs `frame-error` and returns (`driver.ts:2307-2315`) and the caller
  proceeds as though the characteristic merely had not arrived yet. That is
  recurring failure 25 exactly. **This spec fixes the rower, not the class.**
- **`checkLength` keeps rejecting genuinely short frames** for the other
  characteristics, and for these two below their pre-addition lengths.
- **`0x0039` is left alone, deliberately.** It returns `null` under 20 bytes
  and its trailing two bytes ARE consumed, so a short one would discard the
  whole end-of-workout summary rather than one field. No revision row supports
  that happening on the GATT form and no producer was found. SUSPECTED only;
  recorded here so a future reader need not re-derive it.

## Prior art

ErgometerJS's `handleRowingAdditionalStatus1` reads the same eight fields with
no length guard and gates the trailing field on observed `byteLength`, never
reading `ergMachineType` at all. **Its effective minimum for `0x0032` is 16
bytes — the identical floor, reached independently.** Its motivation is
unifying the GATT and multiplexed forms rather than old firmware, so it
corroborates the floor and the mechanism and is **not** an observation of a
real short frame from a real monitor. The INFERENCE tag above stands.
SECONDARY: implementation source, read verbatim, not a summary.

## Test plan

Failing test first.

1. **Parser, both characteristics.** A 16-byte `0x0032` and an 18-byte
   `0x0038` decode with every consumed field matching the long form, built by
   truncating the encoder's own output so the fixture cannot drift.
   **The assertion is key ABSENCE, not `undefined`:**
   `expect(Object.hasOwn(decoded, "ergMachineType")).toBe(false)`. This is
   load-bearing. `readU8` is `bytes[offset]!` and neither
   `noUncheckedIndexedAccess` nor `exactOptionalPropertyTypes` is set, so an
   implementer who lowers the floor and leaves the read UNGUARDED gets
   `ergMachineType: undefined` typed `number`, with no throw and no typecheck
   error. A test asserting `undefined` is green for both the correct fix and
   that half-fix; key-absence discriminates.
2. **Still rejects too-short.** 15 bytes for `0x0032` and 17 for `0x0038`
   remain typed errors, with `expected` naming the new floor.
3. **The seam test, upstream of the producer** (recurring failure 24). One test
   starts at the transport, drives a session of SHORT `0x0032` frames alongside
   normal `0x0031`/`0x0033`, and asserts the driver emits frames and the hook
   leaves `ready`. **No valid long `0x0032` may pass at any point, arming
   included** — `seen.as1` is a one-way latch (`driver.ts:1810`, `:5077`), so a
   single well-formed frame during the arm sequence opens it and the test goes
   green while proving nothing. This is why `driver.test.ts:4165`'s existing
   garbled-frame test is green today: it calls `programAndArm` first.
4. **Two mutation probes** (recurring failure 21), each recorded with what its
   failure said. (a) Revert the floor to 17 and confirm test 3 fails. (b) The
   half-fix: lower the floor but leave the trailing read unguarded, and confirm
   test 1 fails. Commit the real change before running either probe (recurring
   failure 22) and confirm each anchor string is unique first.

**Existing tests that must change.** `parse.test.ts:529-586` holds **three**
`it.each` tables over the same five characteristics, not one: an empty-input
block whose `expected` value changes to 16 and 18; the one-byte-short block,
whose two affected rows flip to asserting a successful decode; and an
exact-length block that stays green. **The other three characteristics keep the
strict off-by-one guard in all three tables**, deliberately, and the spec
records that as a decision rather than an omission.

## Risks

- **No capture of a real short frame.** Fixtures are truncations of our own
  encoder. MEASURED, independently and twice: across all 20 committed
  recordings, `0x0032` is 17 bytes in 8248 of 8248 notifications and `0x0038`
  is 19 bytes in 42 of 42. Every monitor we have ever captured is post-V1.26.
  Replay is byte-length agnostic (`transports/replay.ts:188` delivers opaque
  `(char, bytes)`), so a real short-frame capture would become a genuine
  regression oracle the moment one is committed.
- **The fake gains a shape it did not have** (RC-8's territory). Low stakes:
  the field has no consumer.

## Follow-ons, each its own PR

- **Surface a persistent decode failure.** Recurring failure 25's shape, and
  the detection already exists — only the surfacing is missing. Adds a
  rower-facing state, so it carries a Gate 0.
- **Stop the flood evicting its own diagnosis.** A repeated identical
  `frame-error` should be rate-limited or counted rather than recorded once per
  arrival, or connect-time entries should be reserved from eviction. Today a
  monitor we cannot read destroys the evidence of which monitor it was.
- **Read and log the firmware revision.** Characteristic `0x0014` (20 bytes,
  READ) in the C2 Device Information service `0x0010`. `Transport` has no read
  method, so this touches both real transports, the fake, replay and three
  decorators. **Check while implementing:** `DEVICE_INFO_SERVICE_UUID` is built
  from handle `0x0000` while the document gives `0x0010`, and the constant's
  own comment concedes we never established whether it or the `PM5` name prefix
  matched at discovery.
