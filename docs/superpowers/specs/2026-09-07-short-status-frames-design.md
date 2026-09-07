# Short status frames: a monitor older than 2018 is silently unusable

**Date:** 2026-09-07 · **Class:** TRIAD (wire semantics — what we decode off
the wire feeds every number the app reports) · **Status:** DRAFT, awaiting
James's spec review · **Gate 0:** none — this PR changes no user-visible copy
or layout · **Antagonist:** owed on this spec before implementation.

## What and why

A friend of James's rowed for five minutes on 2026-09-07 and the app recorded
nothing. It sat on `READY` the whole time, gave no warning, and disconnected.
The work was on the monitor and the app kept none of it.

The cause is one length check. Concept2 appended a field to a status packet in
2018; our parser was written against the newer form and rejects anything
shorter, so on a monitor whose firmware predates that change we throw away
every one of those packets. The field we insist on is the only field in the
packet that nothing in the app reads.

That alone would have cost stroke rate and heart rate. What made it total is
the driver's frame gate: it publishes a reading only once all three status
characteristics have parsed at least once, and the flag for this one is set
only inside the successful-parse callback. No parse, no flag, no readings, ever
— for the whole session, with no signal to the rower.

**This spec fixes the parse for both affected characteristics and nothing
else.** The missing warning and the firmware read are named as follow-ons with
their own PRs.

## Root cause, sourced

The vendor document's revision history (PM5 Bluetooth Smart Communication
Interface Definition, revision 1.30, Table 1), quoted verbatim — the
load-bearing line, and the attribute it establishes is that the field was
**added**, and is **last**:

```
11/2/2018   Mark Lyons   Added Erg Machine Type parameter to characteristic 0x0032/0x0080/
                         V1.26.
11/8/2018   Andrew Dombek   Added Erg Machine Type parameter to characteristic 0x0038.
                            Clarifications added for MultiErg workouts.
                            V1.27.
```

The same document's attribute table gives the GATT form of `0x0032` as
17 bytes ending on `Erg Machine Type`, and `0x0038` as 19 bytes ending on the
same field. A monitor on firmware predating each revision therefore emits a
clean prefix one byte shorter, not a corrupt frame.

**Not truncation.** The reporting session decoded a full 19-byte `0x0031` in
the same connection while every `0x0032` arrived at 16 bytes, so the radio was
not clipping notifications.

**The family is exactly two.** The revision history was read end to end. Only
V1.26 and V1.27 append a field to a status characteristic we decode. V1.28 adds
two Device Info characteristics (`0x0017`, `0x0018`), which are new
characteristics rather than extensions. `0x0031`, `0x0033` and `0x0037` have
never gained a trailing field and keep their strict guards.

## Evidence from the reporting session

- Hundreds of consecutive `frame-error` ring entries reading
  `0x0032: expected 17 bytes, got 16`, at the full sample cadence.
- `resume-frames` reporting `phase=ready` and `rowingActive=unseen`, the
  `unseen` proving the hook never received a single frame.
- A decoded `0x0031` whose raw bytes are 19 long, in the same session.

## What changes

1. **`parseAdditionalStatus1` (`0x0032`) accepts 16 bytes.** Every field we
   consume (elapsed, speed, stroke rate, heart rate, current split, average
   split, rest distance, rest time) occupies bytes 0 to 15. `ergMachineType`
   becomes optional and is read only when byte 16 is present.
2. **`parseAdditionalSplitIntervalData` (`0x0038`) accepts 18 bytes**, by the
   same rule, with `ergMachineType` at byte 18 optional.
3. **`AdditionalStatus1.ergMachineType` and
   `AdditionalSplitIntervalData.ergMachineType` become optional.** Neither has
   a consumer anywhere in `app/src` or `app/domain` — MEASURED:
   `grep -rn ergMachineType app/src app/domain`, excluding tests, the parser,
   the encoder and the fake, returns nothing. The only readers are the parser
   that produces them and the encoder that writes them.
4. **The encoders gain an explicit short form.**
   `buildAdditionalStatus1Bytes` and `buildAdditionalSplitIntervalDataBytes`
   take a flag selecting the pre-addition length, and omit the trailing byte
   when it is set. A flag rather than an optional input field, so a caller
   that simply forgets to set `ergMachineType` still gets the long frame and
   cannot produce a short one by accident.

## What deliberately does not change

- **No firmware-version gating.** We tolerate a short frame because the
  trailing field is documented as a later addition, never because we recognise
  a version string. Gating on a version we have not met is a new way to reject
  a monitor.
- **The frame gate stays as it is.** Relaxing `seen.general && seen.as1 &&
  seen.as2` to general alone would hand consumers zeros for rate and pace,
  which is a fabricated reading (recurring failure 11). The gate is correct;
  its input was wrong.
- **`checkLength` keeps rejecting genuinely short frames** for `0x0031`,
  `0x0033` and `0x0037`, and for `0x0032`/`0x0038` below their pre-addition
  lengths.

## The existing test that must change, and why that is not loosening

`parse.test.ts`'s length-guard block currently asserts, for all five
characteristics:

> "%s: one byte short of the documented length still errors (off-by-one, not
> just wildly short)"

For `0x0032` and `0x0038` that assertion is now known to be wrong: one byte
short is a legitimate frame from a monitor older than 2018. Those two rows move
to a new case asserting the opposite — a short frame decodes, every consumed
field is correct, and `ergMachineType` is absent. **The other three rows stay
exactly as they are**, and the spec records that the strict guard is retained
deliberately rather than swept.

## Test plan

Failing test first, per the repo's TDD rule.

1. **Parser, both characteristics.** A 16-byte `0x0032` and an 18-byte
   `0x0038` decode with every consumed field matching the long form's value and
   `ergMachineType` undefined. Built by truncating the encoder's own output, so
   the fixture cannot drift from the layout.
2. **Still rejects too-short.** 15 bytes for `0x0032` and 17 for `0x0038` remain
   typed errors, with the reported `expected` naming the new floor.
3. **The seam test, upstream of the producer** (recurring failure 24). One test
   starts at the transport, feeds a session of SHORT `0x0032` frames alongside
   normal `0x0031`/`0x0033`, and asserts the driver emits frames and the hook
   leaves `ready`. Today's suites all seed past this break — MEASURED, not
   assumed: `grep -rl "expected 17 bytes" docs/monitor/sessions/` returns 0 of
   30 capture directories, so no existing replay can go red on this.
4. **Mutation probe** (recurring failure 21). Revert the `0x0032` floor to 17
   and confirm test 3 fails, and record what the failure said. Commit the real
   change before running the probe, per recurring failure 22, and anchor on a
   string confirmed unique first.

## Risks

- **The fake gains a shape it did not have.** Modelling a short frame is
  RC-8's territory (the fake contradicting the real wire on this exact field).
  Low stakes: the field has no consumer.
- **We have no capture of a real short frame.** The fixtures are truncations of
  our own encoder, which is an inference about the wire, not an observation of
  it. It is a sound one — the field is documented last and additive — but the
  spec records it as inference. A capture from the reporting monitor would
  upgrade it, and the firmware-read follow-on is what would let us ask.

## Follow-ons, each its own PR

- **Surface a persistent decode failure.** A monitor we cannot read should say
  so instead of leaving the rower on `READY`. Adds a rower-facing state, so it
  carries a Gate 0.
- **Read and log the firmware revision.** Documented at characteristic `0x0014`
  (20 bytes, READ) in the C2 Device Information service `0x0010`. Our
  `Transport` interface has no read method, so this touches both real
  transports, the fake, replay and three decorators. A connect-time ring entry
  would have answered this whole investigation from the log we were already
  sent. **Check while implementing:** `DEVICE_INFO_SERVICE_UUID` is built from
  handle `0x0000`, while the document gives the service as `0x0010`; the
  constant's own comment concedes we never established whether it or the name
  prefix matched at discovery.
