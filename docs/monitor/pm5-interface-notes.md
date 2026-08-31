# PM5 interface notes — cited facts for the CSAFE codec

Every constant and byte example in `app/domain/monitor/csafe.ts` and
`app/domain/monitor/pm5/framer.ts` cites an entry in this file; every entry
here cites the primary document. This file states facts and citations, not
the documents themselves.

**Documents used** (fetched 2026-08-05 via WebFetch from the concept2.nl
mirror — the concept2.co.in mirror fails TLS verification and was not used):

| Document                                                       | Revision | URL                                                                                       | Local page count (pdftotext) |
| -------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| Concept2 PM Bluetooth Smart Communication Interface Definition | 1.30     | `https://www.concept2.nl/files/pdf/us/monitors/PM5_BluetoothSmartInterfaceDefinition.pdf` | 39                           |
| Concept2 PM CSAFE Communication Definition                     | 0.27     | `https://www.concept2.nl/files/pdf/us/monitors/PM5_CSAFECommunicationDefinition.pdf`      | 162                          |

Page counts match the adversarial review's independent fetch exactly
(`.superpowers/sdd/2026-08-05-phase-7a/spec-review.md`), confirming these are
the same document revisions. All facts below were re-extracted independently
from the fetched PDFs (via `pdftotext -layout`), not copied from the review.

**§23's own fetch (2026-08-11) is the one exception to the `.nl` mirror
above**: it used `concept2.it` for the Bluetooth Smart Interface Definition
PDF instead (`concept2.co.in` still fails TLS, same as this table's own
note). Not a different document: the Task 1 review independently re-fetched
the SAME `.it` URL and re-extracted pp.20-22 via `pdftotext -layout`,
confirming byte-identical Revision 1.30 content — same printed page
footers, same field tables, word-for-word matching quotes. Recorded here
rather than silently switching this table to `.it`, since every other
section's citations were pulled from the `.nl` fetch and stay that way.

## 1. Frame structure (CSAFE doc, standard frame — no extended addressing)

```
Standard Start Flag | Frame Contents | Checksum | Stop Flag
```

**Table 5 — Unique Frame Flags** (CSAFE doc p.9):

| Description               | Value  |
| ------------------------- | ------ |
| Extended Frame Start Flag | `0xF0` |
| Standard Frame Start Flag | `0xF1` |
| Stop Frame Flag           | `0xF2` |
| Byte Stuffing Flag        | `0xF3` |

**Table 6 — Byte Stuffing Values** (CSAFE doc p.9): each occurrence of a flag
byte _within the frame contents or checksum_ is replaced by two bytes —
the Byte Stuffing Flag followed by a code byte:

| Frame Byte Value | Byte-Stuffed Value |
| ---------------- | ------------------ |
| `0xF0`           | `0xF3, 0x00`       |
| `0xF1`           | `0xF3, 0x01`       |
| `0xF2`           | `0xF3, 0x02`       |
| `0xF3`           | `0xF3, 0x03`       |

"The impact of this technique on the data link is that the frame size could
increase in size by a factor of two in the worst case" (CSAFE doc p.9).
Stuffing applies to the checksum byte too, not only the payload — the
document's own Fixed Distance example (proprietary, 2000m/500m splits)
response frame is annotated `F3 or 72 Stuff byte flag (checksum = F2) or
checksum`, i.e. _if the computed checksum happens to equal a flag value, the
checksum byte itself gets stuffed_ (CSAFE doc p.81 — the same citation used
throughout this file for this annotation; every occurrence of the "F3 or
XX ... Stuff byte flag" pattern in the document's response columns is this
same rule, restated per example).

**Resynchronization rule** (CSAFE doc p.9), cited by `pm5/framer.ts`'s
`reassemble()` for both its mid-frame resync branch and its frame-budget
cap:

> "The frame beginning and end are designated by the unique Start and Stop
> bytes. If a Start or Stop byte is missed, the frame is discarded and frame
> resynchronization occurs at the beginning of the next frame."

`reassemble()` implements this two ways: (a) if a new start flag arrives
before the previous (incomplete) frame's stop flag, the incomplete frame is
discarded and scanning restarts at the new start flag; (b) if an open frame
(start flag received, no stop flag yet) exceeds the 120-byte frame cap
(§3) without closing, it can never become a valid frame — it is discarded
the same way, and scanning resumes for the next start flag in the buffered
bytes (or waits for one to arrive).

**Out of scope:** extended-frame framing (`0xF0` start, with destination/
source addressing). `reassemble()` only ever recognizes the standard-frame
start flag (`0xF1`) as a synchronization point, matching `csafe.ts`'s
standard-frame-only scope (stated at the top of this section) — an `0xF0`
byte in a response stream is not treated as a resync point and is scanned
over as an ordinary content byte until a real `0xF1`/`0xF2` pair is found.

## 2. Checksum rule (CSAFE doc p.9)

> "Once a full frame is received and all 'byte-unstuffing' is performed, a
> one-byte checksum is computed with byte-by-byte XORing of the frame
> contents (e.g., excluding start/stop flags and addresses) to verify frame
> integrity."

For a standard frame (no address bytes), this means: **checksum = XOR of all
unstuffed payload bytes** (the frame contents, not including the checksum
byte itself, the start flag, or the stop flag). Checksum is computed on
_unstuffed_ bytes; stuffing is applied afterward to the payload-plus-checksum
byte sequence before framing.

## 3. Frame budget (CSAFE doc p.9)

> "1. A maximum frame size of 120 bytes including start/stop flags, checksum
> and byte stuffing 2. All flow control handled natively as part of physical link"

> "The only restrictions on the frame contents relate to length of frame and
> the requirement that individual commands/responses do not straddle a frame
> boundary (i.e., no partial commands/responses within a frame)."

The 120-byte cap is **post-stuffing** and **includes** the two flag bytes and
the (possibly stuffed) checksum byte. `packPayload` in `pm5/framer.ts`
accounts for this: it computes the stuffed length of every candidate byte
(and of the running checksum, since adding a byte changes the checksum,
which changes whether the checksum itself needs stuffing) before deciding
whether it still fits in the current frame.

Command-boundary alignment (never splitting a single CSAFE command across a
frame boundary) is **not** `packPayload`'s job — `packPayload` is a generic,
command-agnostic byte packer. Boundary-aware splitting is the job of
`pm5/commands.ts` (Task 3's `buildFrameGroups`, §12 below), which assembles
one interval block's bytes at a time and is responsible for not asking
`packPayload` to split mid-block.

## 4. BLE write/notify byte budget (BLE doc p.12)

| Characteristic                             | Value          | Notes                                    |
| ------------------------------------------ | -------------- | ---------------------------------------- |
| `0x0021` C2 PM receive (control write)     | Up to 20 bytes | WRITE — control command as a CSAFE frame |
| `0x0022` C2 PM transmit (control response) | Up to 20 bytes | READ/NOTIFY — response as a CSAFE frame  |

This is why a packed CSAFE frame (up to 120 bytes) must be further split
into ≤20-byte pieces for the BLE write — `chunkFrames` in `pm5/framer.ts`.

`0x0034` (BLE doc p.16) sets the general/additional-status notification
rate: `0` = 1 s, `1` = 500 ms (**default if not explicitly set**), `2` =
250 ms, `3` = 100 ms. Not used by Task 1's pure codec/framer, but recorded
here since it is read from the same document pages and future tasks (the
driver) must write it at connect.

## 5. Workout state enum (BLE doc Appendix A, p.37) — for `pm5/parse.ts`

```c
typedef enum {
  WORKOUTSTATE_WAITTOBEGIN,                        // 0
  WORKOUTSTATE_WORKOUTROW,                         // 1
  WORKOUTSTATE_COUNTDOWNPAUSE,                     // 2
  WORKOUTSTATE_INTERVALREST,                       // 3
  WORKOUTSTATE_INTERVALWORKTIME,                   // 4
  WORKOUTSTATE_INTERVALWORKDISTANCE,               // 5
  WORKOUTSTATE_INTERVALRESTENDTOWORKTIME,          // 6
  WORKOUTSTATE_INTERVALRESTENDTOWORKDISTANCE,      // 7
  WORKOUTSTATE_INTERVALWORKTIMETOREST,             // 8
  WORKOUTSTATE_INTERVALWORKDISTANCETOREST,         // 9
  WORKOUTSTATE_WORKOUTEND,                         // 10
  WORKOUTSTATE_TERMINATE,                          // 11
  WORKOUTSTATE_WORKOUTLOGGED,                      // 12
  WORKOUTSTATE_REARM,                              // 13
} OBJ_WORKOUTSTATE_T;
```

Not consumed by Task 1; recorded here (verified against the fetched
document, matching the adversarial review's citation exactly) for Task 3's
`pm5/parse.ts`, which consumes it directly — see §14's row-by-row
`WORKOUTSTATE` -> `MonitorFrame.state` mapping.

## 6. Byte-vector examples (CSAFE doc pp.79–90) — non-exhaustive

**This list is not the complete set of worked examples in the document** —
it is the ones exercised by `csafe.test.ts` and `framer.test.ts`, plus a
handful more recorded here because Task 3's `pm5/response.ts` (§16 below —
CSAFE response parsing, NOT `pm5/parse.ts`, which decodes the BLE status
characteristics and never touches the control-characteristic ack/reject
responses) needs verified RESPONSE-side vectors and Task 1 had none. The
document has other worked examples (Fixed Calories, Fixed Calorie Interval,
Predefined list selection, force-curve polling, etc. — see p.77–90 generally)
not all of which are transcribed here.

**Methodology:** every byte value below comes from the document's row-by-row
command tables. Two of the document's _own_ forms of the same example
sometimes disagree — its row-by-row table and its own convenience "hex
summary" line at the bottom of the table. Neither form is treated as
authoritative by default: **the value that satisfies the XOR checksum rule
wins, and both printed forms are recorded whenever they disagree.** (An
earlier draft of this file stated the opposite rule — "row tables over
summary lines, always" — which is itself contradicted by row 6 below:
Variable Interval Undefined Rest's own row-by-row table prints checksum
`0x46`, which fails the XOR rule; its summary line prints `0x8F`, which
this file's own computed value confirms. The rule is the checksum, not the
column.) Every checksum in the tables below was recomputed independently by
XORing the transcribed content bytes (everything between the start flag and
the checksum byte, excluding `F1`, the checksum itself, and `F2`, plus any
leading response `Status` byte for response frames) — the document's
printed checksum is reported alongside for comparison, per the errata
discipline in §Errata below.

### Good command frames (document checksum matches the XOR rule)

| #   | Example                                                                        | Doc page | Frame (hex)                                                                                                                                                                                                                     | Checksum |
| --- | ------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Predefined — Standard List Workout #3 (public CSAFE, short frame)              | p.79–80  | `F1 24 02 03 00 25 F2`                                                                                                                                                                                                          | `0x25`   |
| 2   | JustRow (proprietary)                                                          | p.80     | `F1 76 07 01 01 01 13 02 01 01 61 F2`                                                                                                                                                                                           | `0x61`   |
| 3   | Fixed Distance 2000m/500m splits (proprietary)                                 | p.81     | `F1 76 18 01 01 03 03 05 80 00 00 07 D0 05 05 80 00 00 01 90 14 01 01 13 02 01 01 28 F2`                                                                                                                                        | `0x28`   |
| 4   | Fixed Time 20:00/4:00 splits (proprietary)                                     | p.81–82  | `F1 76 18 01 01 05 03 05 00 00 01 D4 C0 05 05 00 00 00 5D C0 14 01 01 13 02 01 01 E0 F2`                                                                                                                                        | `0xE0`   |
| 5   | Fixed Distance Interval 500m/:30 rest (proprietary)                            | p.83     | `F1 76 15 01 01 07 03 05 80 00 00 01 F4 04 02 00 1E 14 01 01 13 02 01 01 0A F2`                                                                                                                                                 | `0x0A`   |
| 6   | Variable Interval Undefined Rest v100m…2 (proprietary)                         | p.87–88  | `F1 76 45 18 01 00 01 01 08 17 01 04 03 05 80 00 00 00 64 04 02 00 00 06 04 00 00 32 C8 14 01 01 18 01 01 17 01 03 03 05 00 00 00 2E E0 04 02 00 00 06 04 00 00 32 C8 14 01 01 01 01 09 05 05 80 00 00 00 00 13 02 01 01 8F F2` | `0x8F`   |
| 10  | Fixed Distance 2000m/500m splits (**public** CSAFE, `CSAFE_SETHORIZONTAL_CMD`) | p.79     | `F1 21 03 02 00 21 1A 07 05 05 80 F4 01 00 00 34 03 C8 00 58 24 02 00 00 E8 F2`                                                                                                                                                 | `0xE8`   |
| 11  | Fixed Time 20:00/4:00 splits (**public** CSAFE, `CSAFE_SETTWORK_CMD`)          | p.79–80  | `F1 20 03 00 14 00 1A 07 05 05 00 C0 5D 00 00 34 03 64 00 58 24 02 00 00 9A F2`                                                                                                                                                 | `0x9A`   |
| 12  | Fixed Calories 100 Cals/20 Cal splits (proprietary)                            | p.82–83  | `F1 76 18 01 01 0A 03 05 C0 00 00 00 64 05 05 C0 00 00 00 14 14 01 01 13 02 01 01 17 F2`                                                                                                                                        | `0x17`   |
| 13  | Get Force Curve — `CSAFE_PM_GET_STROKESTATE` command                           | p.90     | `F1 1A 01 BF A4 F2`                                                                                                                                                                                                             | `0xA4`   |
| 14  | Get Force Curve — `PM_CSAFE_GET_FORCEPLOTDATA` command                         | p.90     | `F1 1A 03 6B 01 14 67 F2`                                                                                                                                                                                                       | `0x67`   |

Example #1 (Predefined — Standard List Workout #3) is a **sixth good
command-frame example the adversarial review's table did not include** —
the review's table (`spec-review.md` M1) lists only 8 examples (5 good, 3
bad); this document has a 9th worked example (the "Predefined" public-CSAFE
frame, `CSAFE_SETPROGRAM_CMD` selecting a factory workout) that the review's
extraction pass did not examine, and it independently verifies against the
XOR rule. Finding it resolves the design spec's claim of "six verified-good
examples" — without it, only 5 of the document's checksum-agreeing examples
were known. Examples #10–14 are additional good command frames recorded for
`pm5/parse.ts`'s and `pm5/commands.ts`'s later use, not part of that "six".

### Good response frames

Response-frame content is the same rule, with one addition: every response
in these examples opens with a `Status` byte (`81` = failure/CommStatus,
or `01` = success — the two possible values print side by side in the
document as "`81 or 01`"), which **is** part of the checksummed content —
confirmed below because both status-byte values independently reproduce
both printed checksum alternatives exactly.

> **CORRECTION (2026-08-06, §19.1): "`81` = failure/CommStatus" is WRONG.**
> The status byte is a bitfield ([CSAFE-DEF] Table 9, p.11): bit 7 (`0x80`)
> is a frame-count toggle, bits 4-5 (`0x30`) are the previous-frame status
> (`0x00` Ok / `0x10` Reject / `0x20` Bad / `0x30` Not ready), bits 0-3 are
> the slave state. **`81` and `01` are the SAME successful response** —
> toggle-high and toggle-low — which is exactly why the document prints
> them side by side and prints both checksums, and exactly why both
> reproduce. Accept is `(status & 0x30) === 0x00`; reject is
> `(status & 0x30) === 0x10`. The checksum arithmetic in the table below is
> unaffected and remains correct as computed.

| #   | Example                                                                                                                               | Doc page | Frame content (hex, incl. status, excl. flags/checksum)                                                                      | Checksum (status=`01`) | Checksum (status=`81`) |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------- |
| R1  | Fixed Distance response (public CSAFE)                                                                                                | p.79     | `01\|81 1A 00`                                                                                                               | `0x1B`                 | `0x9B`                 |
| R2  | JustRow response (proprietary)                                                                                                        | p.80     | `01\|81 76 02 01 13`                                                                                                         | `0x67`                 | `0xE7`                 |
| R3  | Get Force Curve — `CSAFE_PM_GET_STROKESTATE` response                                                                                 | p.90     | `09 1A 03 BF 01 04` (status here is `09`, not `01`/`81` — this response reports live StrokeState, not a program-command ack) | `0xAA`                 | —                      |
| R4  | Variable Interval v500m/1:00r…4 response (proprietary, the full-length PROGRAMMING ack — the reviewer's newly verified fourth vector) | p.84-86  | `01\|81 76 1A 18 01 17 03 04 06 14 18 17 03 04 06 14 18 17 03 04 06 14 18 17 03 04 06 14 13`                                 | `0x7F`                 | `0xFF`                 |

R1 and R2 are the pair the design spec's own byte-vector discipline
(§Errata) was written against but never enumerated; R3 is a genuinely
different response shape (a data-read response, not a programming-command
ack) confirming the same checksum rule applies uniformly to both. R4 is
the doc's OWN response to its own 4-interval Variable Interval command
(§12) — self-consistent (both `FF`/`7F` printed alternatives independently
reproduced by computing the XOR over status=`01` and status=`81`
respectively, matching R1/R2's discipline; not a fourth errata) and the
best available conformance vector for `pm5/response.ts`'s `parseCsafeResponse`,
since it exercises the full-length, multi-command `0x76`-wrapper ack shape
Task 4's driver will actually see after a real `program()` call — the
wrapper's own "Wrapper command byte count" byte (`1A` = 26 decimal) is
itself the count of ECHOED OPCODES that follow (one byte per acked
sub-command, no lengths or data — `18,01,17,03,04,06,14` for interval 0
[including the one-time `SET_WORKOUTTYPE`, opcode `01`], then
`18,17,03,04,06,14` three more times for intervals 1-3, then `13` for the
trailing `SET_SCREENSTATE` — 7+6+6+6+1 = 26 opcodes, matching the wrapper's
declared count exactly).

### 3 errata (document checksum does NOT match the XOR rule — §Errata, M1)

For each, the test suite asserts **our computed checksum against the rule**,
never the document's printed (wrong) value — a test encoding the printed
value would fail against a correct implementation.

| #   | Example                           | Doc page | Frame content (hex, excl. checksum/flags)                                                                                                                                                                                                                                                                                                            | Doc checksum | Computed (XOR rule) |
| --- | --------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- |
| 7   | Fixed Time Interval 2:00/:30 rest | p.83–84  | `76 15 01 01 06 03 05 00 00 00 2E E0 04 02 00 1E 14 01 01 13 02 01 01`                                                                                                                                                                                                                                                                               | `0x0A`       | `0xB0`              |
| 8   | Variable Interval v500m/1:00r…4   | p.85–87  | `76 6F 18 01 00 01 01 08 17 01 01 03 05 80 00 00 01 F4 04 02 00 3C 06 04 00 00 27 10 14 01 01 18 01 01 17 01 00 03 05 00 00 00 46 50 04 02 00 00 06 04 00 00 27 10 14 01 01 18 01 02 17 01 01 03 05 80 00 00 03 E8 04 02 00 00 06 04 00 00 27 10 14 01 01 18 01 03 17 01 00 03 05 00 00 00 75 30 04 02 00 78 06 04 00 00 27 10 14 01 01 13 02 01 01` | `0xC6`       | `0x09`              |
| 9   | Terminate Workout                 | p.89     | `76 04 13 02 01 02`                                                                                                                                                                                                                                                                                                                                  | `0x62`       | `0x60`              |

Example 8 is the load-bearing structural example (116 bytes — the 4-interval
variable-interval frame the design's frame-budget arithmetic is built on;
CSAFE doc pp.85–87). Its own printed checksum (`0xC6`) fails the document's
own rule; the correct value per the rule is `0x09`. This matches the
adversarial review's finding exactly (`spec-review.md` §M1), independently
reconfirmed here from the primary document rather than copied from the
review.

Final authority for the disputed three checksums (per the design spec's
§Errata) is the laptop-vs-real-PM5 session via the WebBluetooth transport,
before the codec freezes — not resolved by this task.

**Possible fourth erratum, unresolved (flag for the laptop session too):**
the Predefined — Standard List Workout #3 **response** frame (p.80) prints
a single checksum, `0x24`, for content `01|81 24` (status byte + the echoed
`CSAFE_SETPROGRAM_CMD` byte `0x24`). The XOR rule computes `0x25`
(status=`01`) or `0xA5` (status=`81`) — neither matches the printed `0x24`.
Unlike the three confirmed errata above (each a fully self-consistent frame
with a wrong checksum), this could equally be an extraction artifact (a
digit dropped from the document's own table during OCR/transcription,
distinct from a computed-value error) — it is recorded as unresolved, not
as a fourth confirmed erratum, and is not encoded as a test vector pending
resolution on the laptop-vs-real-PM5 session.

**Fixed Calorie Interval note:** the document has an eleventh worked example
("Fixed Calorie Interval", 25c/1:00 rest, CSAFE doc p.83–84) whose own
convenience "hex summary" line at the bottom of the table disagrees with its
own row-by-row byte table in two places (a `3C` rest-duration byte in the
row table vs `0C` in the summary line; a `0A` printed checksum in the row
table vs `3F` in the summary line) — most likely because a `Revision 0.27
84` page-break footer lands mid-table and something got mis-transcribed on
one side of it. **Resolved: the summary-line form is the self-consistent
one** — rest duration `0x0C` and checksum `0x3F` together satisfy the XOR
rule exactly (content `76 15 01 01 0C 03 05 40 00 00 00 19 04 02 00 0C 14
01 01 13 02 01 01` XORs to `0x3F`); the row table's `3C`/`0A` pairing does
not satisfy the rule for the same content shape. This is the transcription
to trust if a later task needs this example; it is still excluded from the
tables above because it duplicates Fixed Calorie's proprietary-wrapper shape
(#12) rather than adding new coverage.

## 7. Command IDs used by the examples above

| ID     | Name                                                                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0x01` | `CSAFE_PM_SET_WORKOUTTYPE`                                                                                                                                                                           |
| `0x03` | `CSAFE_PM_SET_WORKOUTDURATION`                                                                                                                                                                       |
| `0x04` | `CSAFE_PM_SET_RESTDURATION`                                                                                                                                                                          |
| `0x05` | `CSAFE_PM_SET_SPLITDURATION`                                                                                                                                                                         |
| `0x06` | `CSAFE_PM_SET_TARGETPACETIME`                                                                                                                                                                        |
| `0x13` | `CSAFE_PM_SET_SCREENSTATE`                                                                                                                                                                           |
| `0x14` | `CSAFE_PM_CONFIGURE_WORKOUT`                                                                                                                                                                         |
| `0x17` | `CSAFE_PM_SET_INTERVALTYPE`                                                                                                                                                                          |
| `0x18` | `CSAFE_PM_WORKOUTINTERVALCOUNT` (during programming: the zero-based **index** of the interval being configured, not a count — the same ID read back is a count; naming trap noted by the review, M1) |
| `0x21` | `CSAFE_SETHORIZONTAL_CMD` (public CSAFE)                                                                                                                                                             |
| `0x24` | `CSAFE_SETPROGRAM_CMD` (public CSAFE)                                                                                                                                                                |
| `0x76` | C2 proprietary wrapper                                                                                                                                                                               |
| `0x1A` | `CSAFE_SETUSERCFG1_CMD` (public CSAFE wrapper)                                                                                                                                                       |

Not used by Task 1's implementation (no command semantics in `csafe.ts` or
`framer.ts` — both are byte/frame-level only); recorded for, and now used
by, Task 3's `pm5/commands.ts` (§12 below).

## 8. Table 19 — PM5 Workout Configuration Parameter Limits (for Task 2)

**Provenance (re-verified against the primary source 2026-08-05, Task 3):**
Table 19 ("PM5 Workout Configuration Parameter Limits", CSAFE doc p.49,
immediately below its PM3/PM4 sibling Table 18) was located directly in
the fetched CSAFE PDF via `pdftotext -layout` and re-transcribed row by
row — not taken from the adversarial review's secondhand citation
(`.superpowers/sdd/2026-08-05-phase-7a/spec-review.md` §H6). All four
bolded values match exactly what the review reported and what
`program.ts` already enforces; none differ, so this is a doc-only update
(no `compileProgram` change) per the standing instruction: "if they hold,
replace the provenance note with a primary-source line and drop the
inline caveat in `program.ts`."

Full table as transcribed (CSAFE doc p.49; only the four rows
`compileProgram` enforces are bolded — the others are recorded for
completeness/future tasks):

| Command Name                   | Description                         | Minimum  | Maximum  |
| ------------------------------ | ----------------------------------- | -------- | -------- |
| `CSAFE_SETTWORK_CMD`           | Workout time goal                   | :20      | 9:59:59  |
| `CSAFE_SETHORIZONTAL_CMD`      | Horizontal distance goal            | 100m     | 50,000m  |
| `CSAFE_PM_SET_SPLITDURATION`   | Fixed distance split duration       | 100m     | 60000m   |
| `CSAFE_PM_SET_SPLITDURATION`   | Fixed time split duration           | :20      | 1:30:00  |
| `CSAFE_PM_SET_SPLITDURATION`   | Fixed calorie split duration        | 5cal     | 65535cal |
| `CSAFE_PM_SET_WORKOUTDURATION` | Fixed distance duration             | 100m     | 999999m  |
| `CSAFE_PM_SET_WORKOUTDURATION` | Fixed time duration                 | :20      | 9:59:59  |
| `CSAFE_PM_SET_WORKOUTDURATION` | **Interval distance duration**      | **100m** | 999999m  |
| `CSAFE_PM_SET_WORKOUTDURATION` | **Variable interval time duration** | **:20**  | 99:59:59 |
| `CSAFE_PM_SET_WORKOUTDURATION` | Fixed interval time duration        | :20      | 59:59    |
| `CSAFE_PM_SET_WORKOUTDURATION` | Fixed calorie duration              | 5cal     | 65535cal |
| `CSAFE_PM_SET_WORKOUTDURATION` | Interval calorie duration           | 5cal     | 999cal   |
| `CSAFE_PM_SET_RESTDURATION`    | **Rest duration**                   | :00      | **9:55** |

Splits/intervals cap (**50**) is Table 19's own note 2: "The split duration
must not cause the total number of splits per workout to exceed the
maximum of **50**" (Table 18's parallel PM3/PM4 note 1 gives the same
sentence with **30**, confirming the "30 on PM3/PM4" line below). Note this
is literally a cap on **splits** (`CSAFE_PM_SET_SPLITDURATION`, a display
subdivision within a fixed workout), not literally on **variable-interval
COUNT** — `program.ts`'s `MAX_INTERVALS` treats "splits" and "intervals" as
the same cap, which the document never states outright as one rule; it is
the most natural reading (both share the PM's one internal slot-count
limit) but is this module's own inference, not a verbatim equivalence in
Table 19's text.

| Parameter                          | Min       | Max                    |
| ---------------------------------- | --------- | ---------------------- |
| Interval distance duration         | **100 m** | 999,999 m              |
| Variable interval time duration    | **:20**   | 99:59:59               |
| `CSAFE_PM_SET_RESTDURATION`        | :00       | **9:55** (595 s)       |
| Splits/intervals per workout (PM5) | —         | **50** (30 on PM3/PM4) |

`domain/monitor/program.ts`'s `compileProgram` enforces the four bolded
values (`MIN_TIME_SECONDS`, `MIN_DISTANCE_METERS`, `MAX_REST_SECONDS`,
`MAX_INTERVALS`) as its `interval-too-short` / `rest-too-long` /
`too-many-intervals` `CompileError` branches. The upper bounds (99:59:59,
999,999 m) are far above anything `domain/validate.ts` permits authoring
today and are not separately enforced.

## 9. UUIDs (BLE doc p.9) — for `pm5/uuids.ts`

> "The PM's UUID is CE06xxxx-43E5-11E4-916C-0800200C9A66, where xxxx is a
> 16-bit value used to identify the specific service or characteristic. The
> base UUID of the PM is CE060000-43E5-11E4-916C-0800200C9A66."

`pm5/uuids.ts` builds every service/characteristic UUID from this formula
plus its 16-bit handle (Table in BLE doc pp.11-20, the same attribute table
cited throughout this file): `0x0020` (C2 PM Control primary service),
`0x0021`/`0x0022` (control write/notify, §4 above), `0x0030` (C2 Rowing
primary service), `0x0031`/`0x0032`/`0x0033` (general/additional status,
§10 below), `0x0034` (sample rate, §4 above), `0x0037`/`0x0038`
(split/interval data, §10 below). Case: the doc prints hex uppercase: UUIDs
are case-insensitive (RFC 4122), and `pm5/uuids.ts` emits lowercase to
match the `navigator.bluetooth`/`@capacitor-community/bluetooth-le`
examples a later task's transports will be written against.

## 10. Status characteristic byte layouts (BLE doc pp.13-20) — for `pm5/parse.ts`

Every offset below was counted directly from the doc's own "Data bytes
packed as follows" field lists (confirmed against each characteristic's
stated byte count in Table 5/BLE doc pp.13-20; the doc restates the
identical 0x0031 layout verbatim in its Table 4, C2 Multiplexed Information
Data Definitions, p.25 — cross-checked, no discrepancy). Multi-byte fields
are little-endian: the doc lists them "Lo, Mid, High" or "Lo, Hi" in
ascending byte-offset order, i.e. byte 0 is the LEAST significant byte —
the OPPOSITE byte order from the CSAFE proprietary command bytes in §11/§12
below, which are documented MSB-first. This asymmetry (status reads:
little-endian; program writes: big-endian) is easy to miss and is the
reason `parse.ts` and `commands.ts` each define their own integer
read/write helpers rather than sharing one.

**General rule for un-annotated fields:** the doc is careful to explicitly
annotate every field whose scale is NOT 1:1 in its native unit (`0.01 sec
lsb`, `0.1 m lsb`, `0.001 m/s lsb`, etc. — see the stroke-data table's
`0.1 lbs`/`0.1 Joules` annotations for the same pattern outside this list).
A field with NO such annotation (Total Work Distance, Rest Distance,
Average Power, Total/Split Calories, Split/Interval Distance's sibling
"whole meter" fields) is therefore read as its plain integer value, no
scaling — inferred from the document's own consistent annotation practice,
not assumed silently.

**0x0031 — C2 rowing general status (19 bytes, BLE doc p.13):**

| Offset | Field                                                                                                                                                      | Scale                                                                                                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-2    | Elapsed Time                                                                                                                                               | 0.01 sec/lsb                                                                                                                                                                                                                                                                        |
| 3-5    | Distance                                                                                                                                                   | 0.1 m/lsb                                                                                                                                                                                                                                                                           |
| 6      | Workout Type (enum, Appendix A — final-review M-10: corrected from a misdirected "§7 above" cite; §7 is Command IDs and never transcribes `OBJ_WORKOUTTYPE_T`. §11's `CSAFE_PM_SET_WORKOUTTYPE` row is the one place a member is actually pinned, `0x08` = `WORKOUTTYPE_VARIABLE_INTERVAL`) | —                                                                                                                                                                                                                                                                                   |
| 7      | Interval Type (enum)                                                                                                                                       | —                                                                                                                                                                                                                                                                                   |
| 8      | Workout State (enum, §5 above)                                                                                                                             | —                                                                                                                                                                                                                                                                                   |
| 9      | Rowing State (enum: 0=Inactive, 1=Active)                                                                                                                  | —                                                                                                                                                                                                                                                                                   |
| 10     | Stroke State (enum)                                                                                                                                        | —                                                                                                                                                                                                                                                                                   |
| 11-13  | Total Work Distance                                                                                                                                        | whole meters                                                                                                                                                                                                                                                                        |
| 14-16  | Workout Duration                                                                                                                                           | 0.01 sec/lsb IF Workout Duration Type is Time (byte 17); undocumented for the other three duration types, so `parse.ts` reports it unscaled (`workoutDurationRaw`) and lets a caller interpret it against `workoutDurationType` rather than guess a scale for the untested branches |
| 17     | Workout Duration Type (enum: 0=Time, 0x40=Calories, 0x60=Watt-Min, 0x80=Distance — same encoding as `CSAFE_PM_SET_WORKOUTDURATION`'s identifier byte, §11) | —                                                                                                                                                                                                                                                                                   |
| 18     | Drag Factor                                                                                                                                                | whole units                                                                                                                                                                                                                                                                         |

**Elapsed Time and Distance are PER-INTERVAL, not session-cumulative**
(hardware walk 4, §18's 2026-08-08 entry — the doc says nothing either
way, and the scales above are all it ever claimed). On a 2x100m both
fields reset TOGETHER at each new work interval
(`state=resting elapsed=37.81 distance=101.8` -> `state=rowing elapsed=0
distance=0.7`), and each interval's count spans its own work plus its
trailing rest. Consumers that want a whole-session total read
`MonitorFrame.sessionElapsedSeconds`/`sessionDistanceMeters`, which
`src/monitor/driver.ts` accumulates across these resets; consumers that
want "how far into THIS interval" read these two fields directly (against
0x0033's Last Split Time/Distance, offsets 14-19 below).

**0x0032 — C2 rowing additional status 1 (17 bytes, BLE doc p.14):**

| Offset | Field                   | Scale                                                               |
| ------ | ----------------------- | ------------------------------------------------------------------- |
| 0-2    | Elapsed Time            | 0.01 sec/lsb                                                        |
| 3-4    | Speed                   | 0.001 m/s/lsb                                                       |
| 5      | Stroke Rate             | strokes/min, whole                                                  |
| 6      | Heartrate               | bpm; **`255` = invalid/no belt** (doc's own words) — maps to `null` |
| 7-8    | Current Pace            | 0.01 sec/lsb (seconds per 500 m)                                    |
| 9-10   | Average Pace            | 0.01 sec/lsb                                                        |
| 11-12  | Rest Distance           | whole meters (no lsb annotation given)                              |
| 13-15  | Rest Time               | 0.01 sec/lsb                                                        |
| 16     | Erg Machine Type (enum) | —                                                                   |

**0x0033 — C2 rowing additional status 2 (20 bytes, BLE doc p.14-15):**

| Offset | Field                                                | Scale                               |
| ------ | ---------------------------------------------------- | ----------------------------------- |
| 0-2    | Elapsed Time                                         | 0.01 sec/lsb                        |
| 3      | Interval Count (`CSAFE_PM_GET_WORKOUTINTERVALCOUNT`) | whole; **base ambiguous — see §15** |
| 4-5    | Average Power                                        | whole watts                         |
| 6-7    | Total Calories                                       | whole cals                          |
| 8-9    | Split/Interval Avg Pace                              | 0.01 sec/lsb                        |
| 10-11  | Split/Interval Avg Power                             | whole watts                         |
| 12-13  | Split/Interval Avg Calories                          | whole cals                          |
| 14-16  | Last Split Time                                      | **0.01 sec/lsb** — both C2 documents print 0.1 (wrong, RC-4, §20 item 17) |
| 17-19  | Last Split Distance                                  | whole meters                        |

**The multiplexed (`0x0080`) restatements of 0x0032/0x0033 are NOT
byte-identical to these GATT forms** (unlike 0x0031, which the doc restates
verbatim — see the general rule above): the multiplexed 0x0032 entry (BLE
doc Table 4, p.26) is **19 bytes**, not 17 — it inserts a 2-byte "Average
Power" field between Rest Time and Erg Machine Type that the direct GATT
0x0032 characteristic does not have. The multiplexed 0x0033 entry (Table 4,
p.27) is correspondingly **18 bytes**, not 20 — it DROPS the "Average
Power" field the direct GATT 0x0033 characteristic has (`parseAdditionalStatus2`'s
offset 4-5 above). In effect, the multiplexed restatement moves "Average
Power" from 0x0033 to 0x0032. `parse.ts` decodes the GATT forms exclusively
(`GENERAL_STATUS_UUID`/`ADDITIONAL_STATUS_1_UUID`/`ADDITIONAL_STATUS_2_UUID`
in `pm5/uuids.ts`, not the `0x0080` multiplexed characteristic) — wiring a
future driver to the multiplexed characteristic instead and reusing these
offset tables would silently decode the wrong field at the wrong scale for
both characteristics.

**0x0037 — C2 rowing split/interval data (18 bytes, BLE doc p.19):**

| Offset | Field                      | Scale                                                                                                                                                                                                          |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-2    | Elapsed Time               | 0.01 sec/lsb                                                                                                                                                                                                   |
| 3-5    | Distance                   | 0.1 m/lsb                                                                                                                                                                                                      |
| 6-8    | Split/Interval Time        | 0.1 sec/lsb                                                                                                                                                                                                    |
| 9-11   | Split/Interval Distance    | **whole meters (1 m/lsb)** — NOT the same scale as the cumulative Distance field three rows up, in the SAME characteristic; a real trap, not a typo (doc states `1m lsb` explicitly here vs `0.1 m lsb` above) |
| 12-13  | Interval Rest Time         | whole seconds (1 sec/lsb)                                                                                                                                                                                      |
| 14-15  | Interval Rest Distance     | whole meters (1 m/lsb)                                                                                                                                                                                         |
| 16     | Split/Interval Type (enum) | —                                                                                                                                                                                                              |
| 17     | Split/Interval Number      | whole; same base ambiguity as offset 3 above, §15                                                                                                                                                              |

**0x0038 — C2 rowing additional split/interval data (19 bytes, BLE doc p.19-20):**

| Offset | Field                          | Scale                                                                                                                                                                                                                        |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-2    | Elapsed Time                   | 0.01 sec/lsb                                                                                                                                                                                                                 |
| 3      | Split/Interval Avg Stroke Rate | strokes/min, whole                                                                                                                                                                                                           |
| 4      | Split/Interval Work Heartrate  | bpm; no sentinel stated for THIS field — `parse.ts` applies 0x0032's documented `255`=invalid convention by analogy (flagged, §15)                                                                                           |
| 5      | Split/Interval Rest Heartrate  | bpm; same analogy-sentinel                                                                                                                                                                                                   |
| 6-7    | Split/Interval Avg Pace        | **0.1 sec/lsb** — printed identically in both copies of this table (BLE doc pp.19-20 and its restatement), genuinely DIFFERENT from 0x0032/0x0033's pace fields (0.01 sec/lsb) — the trap this task's brief named explicitly |
| 8-9    | Split/Interval Total Calories  | whole cals                                                                                                                                                                                                                   |
| 10-11  | Split/Interval Avg Calories    | whole cals/hr                                                                                                                                                                                                                |
| 12-13  | Split/Interval Speed           | 0.001 m/s/lsb                                                                                                                                                                                                                |
| 14-15  | Split/Interval Power           | whole watts                                                                                                                                                                                                                  |
| 16     | Split Avg Drag Factor          | whole units                                                                                                                                                                                                                  |
| 17     | Split/Interval Number          | whole                                                                                                                                                                                                                        |
| 18     | Erg Machine Type (enum)        | —                                                                                                                                                                                                                            |

## 11. Programming commands used by `pm5/commands.ts` (CSAFE doc pp.68-71)

Byte layouts (all MSB-first — the opposite order from §10's status reads,
see that section's note), from the "C2 Proprietary Long Set Configuration
Commands" table:

| ID     | Name                                                                      | Data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0x01` | `CSAFE_PM_SET_WORKOUTTYPE`                                                | Byte 0: Workout Type (enum; `0x08` = `WORKOUTTYPE_VARIABLE_INTERVAL`, confirmed against Appendix A's `OBJ_WORKOUTTYPE_T` listing AND the worked example in §12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `0x02` | `CSAFE_PM_SET_STARTTYPE`                                                  | `<Not implemented>` — confirms the design's "no start()" call; the PM starts on stroke one, this command does nothing on real firmware                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `0x03` | `CSAFE_PM_SET_WORKOUTDURATION`                                            | Byte 0: identifier (`0x00`=Time, `0x40`=Calories, `0x60`=Watt-Min, `0x80`=Distance); Bytes 1-4: Duration, MSB-first, 0.01 sec/lsb if Time, whole meters if Distance (confirmed against §12's worked example: `500m` encodes as raw `0x000001F4` = 500 decimal; `3:00` encodes as raw `0x00004650` = 18000 = 180.00 s × 100)                                                                                                                                                                                                                                                                                                                                                                              |
| `0x04` | `CSAFE_PM_SET_RESTDURATION`                                               | Bytes 0-1: Duration, MSB-first, **whole seconds** — NOT the 0.01 sec/lsb scale the READ-BACK "Rest Time" field in §10 uses; a second, independent write/read scale mismatch on top of the one the brief already named for pace (confirmed: `1:00` encodes as `0x003C` = 60 decimal in §12's worked example)                                                                                                                                                                                                                                                                                                                                                                                              |
| `0x05` | `CSAFE_PM_SET_SPLITDURATION`                                              | Not used by `buildProgrammingSequence` — splits within an interval are a display feature this compiler/codec doesn't program                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `0x06` | `CSAFE_PM_SET_TARGETPACETIME`                                             | Bytes 0-3: Pace Time, MSB-first, 0.01 sec/lsb per 500 m (confirmed: `1:40` encodes as `0x00002710` = 10000 = 100.00 s × 100)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `0x13` | `CSAFE_PM_SET_SCREENSTATE`                                                | Byte 0: Screen Type (`0x01` = `SCREENTYPE_WORKOUT` — Appendix A lists `SCREENTYPE_NONE` first at ordinal 0 and `SCREENTYPE_WORKOUT` second at ordinal 1, though the doc's own inline `/**< ... (0) */` comment on `SCREENTYPE_WORKOUT` misprints it as 0; the Terminate Workout worked example's actual wire byte, `0x01`, confirms the ORDINAL position is correct and the inline comment is the error — same "trust the verifiable form over a printed annotation" rule this file already applies to checksums, §6); Byte 1: Screen Value (`0x01`=`SCREENVALUEWORKOUT_PREPARETOROWWORKOUT`, `0x02`=`SCREENVALUEWORKOUT_TERMINATEWORKOUT`, both confirmed by ordinal position AND worked-example bytes) |
| `0x14` | `CSAFE_PM_CONFIGURE_WORKOUT`                                              | Byte 0: Programming mode (`0`=Disable, `1`=Enable) — sent after EVERY interval in the worked example, not only once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `0x17` | `CSAFE_PM_SET_INTERVALTYPE`                                               | Byte 0: `0`=Time, `1`=Distance (others: rest/undefined-rest/calorie/watt-minute variants, unused — `compileProgram` never emits an "undefined rest" interval)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `0x18` | `CSAFE_PM_SET_WORKOUTINTERVALCOUNT` (aka `CSAFE_PM_WORKOUTINTERVALCOUNT`) | Byte 0: the zero-based interval index being configured — confirmed 0-based unambiguously in §12's worked example (`00` annotated "Interval #1", `01` annotated "Interval #2") — this is the WRITE side; the naming trap already on record (§7) is about the READ-side "Interval Count" (§10, §15), a different ambiguity                                                                                                                                                                                                                                                                                                                                                                                 |
| `0x76` | C2 proprietary wrapper                                                    | Byte 0: wrapper command byte count (1 byte, max 255 — never binding since the 120-byte CSAFE frame cap binds first); each CSAFE frame this task emits gets its OWN `0x76` wrapper around just the commands placed in that frame — the wrapper is a per-frame framing element, not a once-per-program header (confirmed: the Terminate Workout example, a single unrelated command, has its own `76 04` wrapper)                                                                                                                                                                                                                                                                                          |

## 12. The Variable Interval worked example (CSAFE doc pp.84-86) — the programming-sequence template

`v500m/1:00r…4` (4 intervals; this is example #8 in §6's table — the
116-byte structural example, printed checksum `0xC6`, computed `0x09` per
the errata). Decoded byte-for-byte (all one CSAFE frame, one `0x76`
wrapper):

```
18 01 00                a  WORKOUTINTERVALCOUNT(index=0)
01 01 08                a  SET_WORKOUTTYPE(VARIABLE_INTERVAL)      <- interval 0 ONLY
17 01 01                a  SET_INTERVALTYPE(DIST)
03 05 80 00 00 01 F4    a  SET_WORKOUTDURATION(DIST, 500m)
04 02 00 3C             a  SET_RESTDURATION(60s)
06 04 00 00 27 10       a  SET_TARGETPACETIME(100.00s/500m = 1:40)
14 01 01                a  CONFIGURE_WORKOUT(enable)                = 29 bytes (interval 0's block)

18 01 01                a  WORKOUTINTERVALCOUNT(index=1)
17 01 00                a  SET_INTERVALTYPE(TIME)
03 05 00 00 00 46 50    a  SET_WORKOUTDURATION(TIME, 180.00s = 3:00)
04 02 00 00             a  SET_RESTDURATION(0s)
06 04 00 00 27 10       a  SET_TARGETPACETIME(1:40)
14 01 01                a  CONFIGURE_WORKOUT(enable)                = 26 bytes (interval N>0's block)

... (interval 2, interval 3, each 26 bytes, same shape) ...

13 02 01 01             a  SET_SCREENSTATE(WORKOUT, PREPARETOROWWORKOUT) = 4 bytes (trailer)
```

This confirms the design spec's "26 bytes/interval" fact by construction —
the FIRST interval's block is 29 bytes (it carries the one-time
`SET_WORKOUTTYPE`); every subsequent interval's block is exactly 26 bytes;
the final `SET_SCREENSTATE` trailer is a separate, independent 4-byte CSAFE
command appended after the last interval's `CONFIGURE_WORKOUT`.
`pm5/commands.ts` treats each interval's block as one atomic packing unit
(never split across a frame boundary) and the trailer as its own atomic
unit — STRICTER than the document's literal rule (which only forbids
splitting a single CSAFE command, not a whole interval's six commands),
chosen deliberately for a simpler, more obviously-correct packer: never
splitting a 26-byte block trivially guarantees never splitting the smaller
commands inside it. For workouts whose total command bytes exceed one
120-byte frame (any workout with enough intervals — the design spec's own
estimate was "Sea Smoke, 25 intervals, ~6 frames"; Sea Smoke is 24
intervals in 6 frames as of 2026-08-09's warmup setting, MEASURED by
`domain/monitor/pm5/commands.test.ts`), `buildProgrammingSequence`
starts a new frame (a new `0x76` wrapper) at an interval-block boundary.

## 13. The Terminate Workout worked example (CSAFE doc p.89)

```
F1 76 04 13 02 01 02 62 F2
```

`76 04` (wrapper, 4 command bytes follow) `13 02` (`SET_SCREENSTATE`, 2
data bytes) `01 02` (`SCREENTYPE_WORKOUT`, `SCREENVALUEWORKOUT_
TERMINATEWORKOUT`) `62` (document's printed checksum — this is errata #9 in
§6's table; the XOR rule computes `0x60`, which is what `buildTerminate`'s
test asserts). `buildTerminate()` is exactly this one frame, wrapped and
chunked like any other.

## 14. Workout State -> `MonitorFrame.state` mapping (BLE doc p.37, CSAFE doc Appendix E p.162)

Appendix E ("PM State Transitions", CSAFE doc p.162 — the "Revision 0.27
161" footer in the extracted text precedes the "Appendix E" heading, i.e.
belongs to the PRECEDING page, so Appendix E itself starts on the next one)
gives named transition
sequences, e.g. `WaitToBegin->WorkoutRow->Terminate (user or
command)->Rearm->WaitToBegin` and `WaitToBegin->IntervalWorkDistance->
IntervalWorkDistanceToRest (may not see this state)->IntervalRest->
IntervalRestEndToWorkDistance (may not see this state)->...->WorkoutEnd->
WorkoutLogged->[Menu button]->WorkoutRearm->WaitToBegin` — cited per row
below. `MonitorFrame.state` has 6 members; `OBJ_WORKOUTSTATE_T` has 14 —
every row maps to exactly one `state` value, cited individually:

| #   | `WORKOUTSTATE_*`                | `state`      | Citation                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `WAITTOBEGIN`                   | `armed`      | Design spec §2 verbatim: "armed = WAITTOBEGIN"                                                                                                                                                                                                                                                                                                                    |
| 1   | `WORKOUTROW`                    | `rowing`     | Appendix E: the state entered immediately after `WaitToBegin` for a fixed-duration/JustRow workout while actively rowing, before `Terminate`/`WorkoutEnd`                                                                                                                                                                                                         |
| 2   | `COUNTDOWNPAUSE`                | `armed`      | NOT in any Appendix E transition sequence (absent from every diagram); positioned between `WaitToBegin`(0) and `WorkoutRow`(1) in the enum, and named as a pre-row countdown, not a mid-workout pause — the design spec's "no paused state on the wire" is about mid-workout, not this pre-start state (§15 flags this as the least-certain single-value mapping) |
| 3   | `INTERVALREST`                  | `resting`    | Appendix E: the named rest state between two work intervals                                                                                                                                                                                                                                                                                                       |
| 4   | `INTERVALWORKTIME`              | `rowing`     | Appendix E: a fixed-time interval's active work state                                                                                                                                                                                                                                                                                                             |
| 5   | `INTERVALWORKDISTANCE`          | `rowing`     | Appendix E: a fixed-distance interval's active work state                                                                                                                                                                                                                                                                                                         |
| 6   | `INTERVALRESTENDTOWORKTIME`     | `resting`    | Name decomposition: root `IntervalRest`, suffix `EndToWorkTime` — Appendix E lists it immediately after `IntervalRest` in the rest->work transition, "may not see this state" (ephemeral)                                                                                                                                                                         |
| 7   | `INTERVALRESTENDTOWORKDISTANCE` | `resting`    | Same reasoning as row 6, distance variant                                                                                                                                                                                                                                                                                                                         |
| 8   | `INTERVALWORKTIMETOREST`        | `rowing`     | Name decomposition: root `IntervalWorkTime`, suffix `ToRest` — Appendix E lists it immediately after `IntervalWorkTime`/`IntervalWorkDistance` in the work->rest transition, "may not see this state" (ephemeral)                                                                                                                                                 |
| 9   | `INTERVALWORKDISTANCETOREST`    | `rowing`     | Same reasoning as row 8, distance variant                                                                                                                                                                                                                                                                                                                         |
| 10  | `WORKOUTEND`                    | `finished`   | Design spec §2 verbatim: "finished = WORKOUTEND"                                                                                                                                                                                                                                                                                                                  |
| 11  | `TERMINATE`                     | `terminated` | Design spec §2 verbatim: "terminated = TERMINATE"                                                                                                                                                                                                                                                                                                                 |
| 12  | `WORKOUTLOGGED`                 | `finished`   | Appendix E: reached ONLY via `WorkoutEnd->WorkoutLogged` (never via `Terminate`), i.e. it is the post-finish "saved to log" state, not a further transition of `finished`                                                                                                                                                                                         |
| 13  | `REARM`                         | `idle`       | Appendix E: the state between a finished/terminated workout and the return to `WaitToBegin` (`...->Rearm->WaitToBegin`) — no program is active or armed during this reset tick, giving `idle` its only mapped source                                                                                                                                              |

## 15. Genuine ambiguities flagged for the laptop session (unresolved by document text alone)

None of these change the SHAPE of `parse.ts`'s output. **Final-review M-4:**
the claim that each is "clearly commented at its call site" was false for
four of these eleven when first written — #5 (`currentSplit`'s null path),
#6 (multi-frame retention), #7 (no wipe/reset), and #9 (trailing rest) had
no or near-no call-site comment anywhere in the codec/compiler/driver. Each
now carries one (`pm5/parse.ts`'s `toMonitorFrame` for #5; `pm5/
commands.ts`'s `buildFrameGroups` for #6 and `buildProgrammingSequence` for
#7; `program.ts`'s `compileProgram` doc comment for #9), so the claim holds
for all eleven, not just the majority it covered before this fix. Listed
here together for the laptop-vs-real-PM5 session (alongside the three
disputed checksums in §6):

1. **Interval numbering base — ANSWERED by laptop session 1, see §18 #3.**
   `CSAFE_PM_GET_WORKOUTINTERVALCOUNT`'s READ-side value (0x0033 offset 3,
   "Interval Count") and 0x0037/0x0038's "Split/Interval Number" are never
   shown with a worked example's decoded value in either document (unlike
   the WRITE-side index in §12, confirmed 0-based). **Correction (Task 5
   close-out): the sentence that used to stand here — "`parse.ts` passes
   the raw byte through unadjusted into `MonitorFrame.intervalIndex`/
   `IntervalActual.index`" — is now only half true and was left stale past
   the fix that made it so.** `pm5/parse.ts` itself still does exactly
   that: `toMonitorFrame`/`toIntervalActual` decode and pass the raw
   0x0033/0x0037/0x0038 byte through with no adjustment, by design (§16's
   layering rule keeps `pm5/` a byte-faithful codec, not a place to fold in
   business numbering). But since Phase 7A-fix Task 3
   (`domain/monitor/pm5/intervalIndex.ts`'s `toProgramIndex`, called from
   `src/monitor/driver.ts`), that raw value is normalized into OUR 0-based
   per-work-interval numbering **before** it reaches `MonitorFrame`/
   `IntervalActual` as any consumer (a `frame`/`intervalComplete` event
   listener, 7C's future log prefill) ever sees them — the raw machine
   value survives only in the event log, per the design spec's own "Index
   translation" decision. So: the real PM does report a 1-based-feeling,
   forward-attributed count exactly as this item worried it might (§18 #3
   confirms it, and worse — see below), but "every consumer downstream is
   off by one" is no longer true of this codebase; it is true of `parse.ts`
   in isolation and false of the seam anything outside `pm5/` reads. **These
   are also two SEPARATE wire fields, not one value read twice**: `MonitorFrame.intervalIndex` comes
   from 0x0033's "Interval Count" (a live-status characteristic, sampled at
   the general/additional-status rate, §4); `IntervalActual.index` comes
   from 0x0037/0x0038's "Split/Interval Number" (an interval-boundary
   characteristic). Nothing in either document guarantees these two
   counters stay in lockstep frame-to-frame — a 7C consumer correlating a
   `frame` event's `intervalIndex` against an `intervalComplete` event's
   `actual.index` is matching two independently-incrementing fields by
   value, not reading one field from two places; a driver-level skew
   between them (a dropped notification, a boundary race) would surface as
   a real but silent mismatch, not a crash. **Residual, still open:** the
   forward-attribution rule §18 #3 confirms is a resting-side rule only —
   what a work→work boundary with NO intervening rest reports is still
   unconfirmed (§17 item 13); do not read this item as fully closed.
   > **CORRECTION (2026-08-06, §19.8): ANSWERED, and the rest-keyed rule is
   > WRONG at a work→work boundary.** Laptop session 2 ran
   > `TWO_TIME_NO_REST_PROGRAM` and read `0x0037` = **1** against `0x0033` =
   > **0** at the work0→work1 boundary, with the state word `"rowing"`
   > throughout. Forward attribution is not resting-side only. Fixing
   > `intervalIndex.ts` is Phase 7A-fix-2's own task.
   > **DONE (Task 5):** `toActualIndex` applies `machineIndex - 1`
   > unconditionally (rowing or resting alike) for `IntervalActual.index`;
   > `toProgramIndex`/0x0033 keeps the rest-keyed rule, since that field's
   > own no-rest reading (`0`) matched identity. See §17 item 13's own
   > CORRECTION for the full evidence.
   > **CORRECTION (2026-08-24, storage-spine PR 3, spec §4 delta D4): the
   > base ambiguity this item opened with is settled for the interval-count
   > BOUND'S purposes, because the bound never reads the base.** F2b's new
   > `check()` clause is `after.intervalCount < before.intervalCount`, a
   > comparison invariant under any constant offset a 0-based-vs-1-based
   > reading might imply — whether 0x0033's Interval Count is genuinely
   > 0-based (matching the write-side index, §12) or only reads that way
   > because forward attribution puts every first-interval sample at 0
   > regardless of base, `after < before` cannot change sign from the
   > choice. Settled free by the sweep (`continuity.test.ts` PART 5): the
   > count reads 0 through the whole first interval and on every
   > 1-interval program — 78.3% of 30 s-gap corpus pairs see no count
   > change at all — consistent with either base, and the bound is
   > correctly inert there either way. This is a NOTE, not a gate: the base
   > question this item raised remains otherwise unanswered.
2. **0x0038's Work/Rest Heartrate sentinel — ANSWERED (D5), excluded from
   the numbered runsheet; see the paragraph below.** Only 0x0032's Heartrate field
   is explicitly documented as "255=invalid" (§10). `parse.ts` applies the
   same sentinel to 0x0038's two heartrate bytes by analogy (same firmware,
   same byte width, same physical belt-absent case) — not independently
   confirmed for this characteristic. **Counter-evidence that the analogy
   could be wrong:** the document's "invalid" sentinel convention is
   PER-FIELD, not universal — 0x0039's "Recovery Heart Rate" byte (BLE doc
   p.21) is explicitly documented as "(zero = not valid data...)", a
   DIFFERENT sentinel (0, not 255) for a different heart-rate field on the
   very same characteristic family. This is harmless either way in
   practice: 255 bpm is a physiologically impossible reading regardless of
   whether the document's authors intended it as 0x0038's sentinel too, so
   a wrong guess here can only ever turn a genuinely-impossible reading
   into `null` early or late, never fabricate a plausible-looking wrong
   value.
3. **`SET_TARGETPACETIME` for a no-target interval — record BOTH candidate
   behaviors, laptop decides.** Every worked example that DOES have a
   target pace field programs a real one; `compileProgram`'s
   `ProgramInterval.targetSplit` is `null` for warmup/effort/test
   intervals, and `buildProgrammingSequence` currently sends
   `0x00000000` (pace time zero) for that case — implemented and tested as
   such (interface-notes.md §12), on the assumption that 0 means "no
   enforced target" rather than "target an impossible 0-second/500m pace."
   **However:** five of the document's OWN worked examples OMIT
   `SET_TARGETPACETIME` (opcode `0x06`) ENTIRELY rather than sending it
   with a zero value — JustRow (§6 #2, p.80), Fixed Distance (§6 #3, p.81),
   Fixed Time (§6 #4, p.81-82), Fixed Distance Interval (§6 #5, p.83), and
   Fixed Calories (§6 #12, p.82-83) all program a workout with no per-
   interval pace target and none of them include a `0x06` command at all.
   This makes OMISSION at least as documented as sending zero — arguably
   more so, since it is directly observed in five real examples, while
   "zero means no target" is this module's own inference, observed in
   none. The current implementation (zero) is UNCHANGED by this finding —
   both are plausible, and choosing between them needs the laptop session,
   not another guess from the documents alone. If the real PM5 treats a
   zero pace target as an enforced (and unmeetable) 0:00/500m pace rather
   than "no target," `buildProgrammingSequence` needs to switch to omitting
   `SET_TARGETPACETIME` for `targetSplit === null` intervals instead.
4. **`MonitorFrame.intervalIndex`/`spm` nullability from `parse.ts`.**
   `spm` is decoded as the raw Stroke Rate byte and is never actually
   `null` from this module (no documented invalid-stroke-rate sentinel
   exists) — the type allows `null` for a caller with no data yet, not for
   anything `parse.ts` itself produces. `intervalIndex` IS mapped to `null`
   by this module, but only as a business rule (no interval is "current"
   outside the `rowing`/`resting` states), not from a wire sentinel.
5. **`MonitorFrame.currentSplit` has no null path either.** Like `spm`,
   `currentSplit` (0x0032's Current Pace) is decoded and passed through
   unconditionally — there is no documented "no pace data" sentinel for
   this field (unlike Heartrate's 255). In practice a stopped/idle erg's
   Current Pace reads `0` (infinite pace, not a sentinel) — whether the
   real PM5 actually reports exactly `0` while armed/resting, or holds the
   last real value, or something else, is unconfirmed; a screen rendering
   `currentSplit` as a pace string needs to decide what "0:00" or an
   erratic pace value means while idle, and that convention is not
   established by either document.
6. **Multi-frame programming retention is UNDOCUMENTED — this codec's
   single largest untested assumption. STILL OPEN — survives as §17 item
   5.** Laptop session 1 confirmed multi-INTERVAL programming works (one
   CSAFE frame, two intervals, rowed to completion) but never tested the
   genuinely multi-FRAME case this item is actually about — see §18 #5's
   "PARTIALLY answered" verdict. Every worked programming example
   in the CSAFE doc (§6, §12) is a SINGLE CSAFE frame; nothing in either
   document describes what the PM does with interval configuration state
   ACROSS multiple separately-acked frames. `buildProgrammingSequence`
   assumes (and `buildFrameGroups`, §12, is built on the assumption) that
   the PM accumulates interval configuration across as many ack-gated
   frames as it takes — Sea Smoke, the design spec's own named stress case,
   needs 6 frames for its 24 real intervals with this implementation's
   packing (24 since 2026-08-09's warmup setting took every seeded workout's `wu` step out; it was 25 when the sessions below were run, and a warm-up-on rower's own preference puts the 25th back), an interval count and frame count neither document ever
   exercises even once. If the real PM instead resets its "programming
   mode" state between frames (e.g. `CONFIGURE_WORKOUT`'s "Programming
   mode enable" byte, sent once per interval, turns out to gate something
   more session-like than a flag), a multi-frame program could silently
   configure only its LAST frame's intervals. This is the single fact this
   task is least confident about; it is first on the laptop session's list.
7. **No wipe/reset command exists in the documented proprietary programming
   flow — STILL OPEN, and now sharper than a documentation gap.** Laptop
   session 1 established the RULE (D1: the PM accepts a program only when
   nothing is loaded; a rejection wipes what was loaded), and a follow-up
   row (phase-7a-fix Task 1) established that `terminate()` is **not** a
   working clear — it was accepted with a completed workout present, yet
   the program sent right after was still rejected, twice. **The real clear
   command, if a dedicated one even exists, remains UNFOUND — this is the
   single top open question for the next hardware row** (§18 #6's "D1
   UPDATE"). Plan Task 2's clear→send→verify design does not depend on
   answering this (it sends `terminate()` as a best-effort clear, ignores
   its rejection, and verifies the actual outcome either way), so the
   product code is not blocked — but the underlying mechanism is still not
   understood.
   > **CORRECTION (2026-08-06, §19.5).** D1's "RULE" is withdrawn (§19.2)
   > and the "rejected twice" evidence was an accept both times (§19.1), so
   > neither sentence above evidences anything. The CONCLUSION — no
   > dedicated clear command exists, and terminate is not one — is
   > nevertheless correct and DOCUMENTED: terminate routes to *Rearm*,
   > Concept2's own word for re-arming the SAME workout ([CSAFE-DEF]
   > Appendix E; `WORKOUTSTATE_REARM` 13,
   > `SCREENVALUEWORKOUT_REARMWORKOUT` 3). `CSAFE_PM_SET_RESET_ALL` (`0xE0`)
   > is `<Not implemented>` and is NOT a candidate; the two untested ones
   > are `CSAFE_RESET_CMD` (`0x81`) and `SCREENVALUEWORKOUT_GOTOMAINSCREEN`
   > (6).
   (§11-13 — `CSAFE_RESET_CMD`/`CSAFE_GOIDLE_CMD` are PUBLIC CSAFE
   only, and the doc explicitly says public and proprietary modes "should
   not be mixed"). Re-programming a workout with FEWER intervals than the
   one currently loaded (e.g. 4 intervals after a previous 25-interval
   program) has no documented mechanism to clear the stale tail —
   intervals 5-25 from the prior program may remain configured on the PM
   after `buildProgrammingSequence` finishes sending only 4. Neither
   document says whether `SET_WORKOUTTYPE`/the first `CSAFE_PM_
WORKOUTINTERVALCOUNT`(index 0) implicitly truncates the PM's prior
   interval list, or whether a stale tail genuinely persists into the next
   row. Flagged for the laptop session alongside #6 — both are the
   codec's assumptions about MULTI-frame/MULTI-program PM behavior that no
   single-frame, single-program worked example can confirm.
8. **ANSWERED — CONFIRMED, see §18 #7** (58.92s remaining observed 1.08s
   into a 60s interval, re-rooted at 60.0 on the next interval; no further
   hardware testing needed for the cadence assumption itself). The
   lockstep half shared with item #1 above stays flagged there. The
   driver's `intervalRemaining` checkpoint ASSUMED 0x0033's "Last
   Split Time"/"Last Split Distance" (§10, offset 14-19) reported the
   SESSION-cumulative point at which the CURRENT interval began (i.e.,
   where the previous interval/split ended) continuously, on every
   regular status tick — not merely once, at a boundary. Neither document
   states an update cadence for these two fields beyond listing them in
   the characteristic's byte table. `src/monitor/driver.ts`'s
   `computeRemainingForFrame` SUBTRACTED this pair from
   `MonitorFrame.elapsedSeconds`/`distanceMeters` to recover "progress
   into this interval" with no local observation history at all
   (replacing an earlier, buggier design that rooted a checkpoint at
   whichever tick the driver happened to observe first) — correct only
   through interval indices 0-1, where the checkpoint happens to read
   zero (§20 item 17's corrected account).
   The same computation (and its sibling divergence check,
   `src/monitor/driver.ts`'s `"divergence"` log kind) also assumes
   `MonitorFrame.intervalIndex` (0x0033's Interval Count) and
   `IntervalActual.index` (0x0037/0x0038's Split/Interval Number, #1
   above) stay in lockstep frame-to-frame — #1 already flags these as two
   independently-incrementing fields with no documented guarantee of
   agreement; the driver LOGS a disagreement when one is observed (never
   corrects or picks a "winner" between the two). Both flagged for the
   laptop session alongside #1.
   **Walk-4 addendum (2026-08-09, reconciling this item with §18's
   per-interval finding):** walk 4 proved 0x0031's Elapsed/Distance pair
   is PER-INTERVAL on interval workouts, yet `intervalRemaining` stayed
   correct on the same walk. A truly SESSION-cumulative checkpoint
   subtracted from a per-interval elapsed cannot produce a correct
   remaining, so on interval workouts either the 0x0033 checkpoint pair
   also reads interval-relative, or it reads zero; the wording above
   (written against single-distance §18 #7 evidence) cannot be the whole
   story. No raw 0x0033 capture existed to distinguish the two at the
   time. **SETTLED, half-way (§20 entry 24, corrected):** the inversion of
   `intervalRemaining` out of `docs/monitor/sessions/walk-2026-08-15/`
   (225+161 frames, zero mismatches) showed the checkpoint reads ZERO
   through interval indices 0 and 1, then LAGS one boundary behind from
   index 2 on — wrong, not bug-free, from index 2 onward on any
   multi-interval program. CR2 spec 2a Task 6 deleted the checkpoint
   subtraction; `computeRemainingForFrame`/`computeAccruedForFrame` now
   read 0x0031's own per-interval pair directly. Still open: lag-by-one
   vs previous-split's-own-value (§20 item 24).
9. **ANSWERED — CONFIRMED accepted, see §18 #8** (the 2×(work/rest)
   session's final interval's own rest counted down fully before
   `WorkoutEnd`/`workoutComplete` fired, no early termination; no further
   hardware testing needed). Trailing-rest-on-final-interval acceptance is untested against any
   worked example.** `compileProgram` (`domain/monitor/program.ts`) folds a
   rest phase's seconds into the PRECEDING interval's `restSeconds` with no
   special case for whether that interval is the workout's last one — a
   workout authored as `[work, rest]` compiles to one `ProgramInterval`
   whose `restSeconds` is nonzero with nothing after it, and
   `pm5/commands.ts`'s `buildProgrammingSequence` programs that interval's
   `SET_RESTDURATION` exactly like any other, followed immediately by the
   trailing `SET_SCREENSTATE` (§12). Every worked programming example in
   both documents (§6, §12) ends on a WORK interval — none demonstrates a
   variable-interval workout whose PROGRAMMED last interval carries a
   nonzero rest, so there is no primary-source confirmation that the real
   PM5 finishes counting down that trailing rest cleanly (rather than, say,
   ending the workout early at the last work interval's own finish, or
   mishandling the rest-to-`WorkoutEnd` transition some other way).
   Practically significant, not a corner case: Task 2's review counted 161
   of the 300 seeded library workouts as compiling to a program whose last
   interval has `restSeconds > 0` (a workout authored with a cooldown-style
   trailing rest step is common). Flagged for the laptop session — this is
   a code-behavior assumption the review surfaced, not a document-text
   ambiguity like #1-8 above, so it has no doc-page citation of its own;
   its provenance is Task 2's review (`.superpowers/sdd/
   2026-08-05-phase-7a-monitor-domain/progress.md`), not the CSAFE/BLE PDFs.

## 16. CSAFE response parsing (for `pm5/response.ts`)

M5 (fix round after Task 3's first review): keeping ack/reject parsing out
of `pm5/parse.ts` is right (that module owns the BLE status
characteristics, 0x0031/0x0032/0x0033/0x0037/0x0038 — a fundamentally
different data path from the control characteristic's command responses),
but deferring it to Task 4 (the driver, `src/monitor/`) would put Concept2
byte-level knowledge in `src/` — the design's own rule (§Layering) is that
`pm5/` is the ONLY home of Concept2 bytes, and BOTH the driver (reading
acks) and the fake transport (Task 4, building synthetic acks to answer
its own programming writes) need this logic. It belongs in `pm5/`
alongside the codec that produces the commands being acked.

**The ack-echo format**, reverse-derived from R1-R4 above: a response frame
(post `csafe.parseFrame`) is `<status> <topOpcode> <count> <...>`.

- `status`: `0x01` = success, anything else (`0x81` explicit failure, or a
  genuinely different response shape like R3's `0x09`) is treated as
  non-success. `pm5/response.ts` exposes exactly two buckets
  (`"ok" | "reject"`), so R3's live-data status (`0x09`, not itself a
  program-command result at all) falls into `"reject"` by this binary
  reduction — R3 is included as a conformance vector to prove the parser
  handles an unexpected status byte without crashing, not because `"reject"`
  is R3's true semantic meaning (interface-notes.md's own R3 note already
  says it "reports live StrokeState, not a program-command ack").
  > **CORRECTION (2026-08-06, §19.1/§19.3): this bullet describes a BUG,
  > not a rule.** The status byte is a bitfield; the whole-byte comparison
  > `response.ts` implements is wrong. `0x81` is an ACCEPT (toggle-high,
  > previous-frame-OK, Ready) and `0x09` is an ACCEPT (previous-frame-OK,
  > slave state "Off line" — a monitor being rowed outside CSAFE master
  > control, exactly [CSAFE-DEF]'s own force-curve polling example). Both
  > were classified `"reject"` on real hardware in both laptop sessions.
  > The correct discriminators are `(status & 0x30) === 0x00` for accept and
  > `=== 0x10` for reject, with `status & 0x0F` carrying the slave state
  > that a two-bucket return type currently throws away. The fix — and the
  > tests for it — is Phase 7A-fix-2's own task; this note exists so nobody
  > reads the bullet above as a specification.
- `topOpcode` + what follows: ONLY `0x76` (the C2 proprietary wrapper —
  the one opcode the primary doc's own master ID table labels "Command
  Wrapper", alongside `0x77`/`0x7E`/`0x7F`, none of which `pm5/commands.ts`
  ever emits) gets the multi-opcode treatment: `count` is the number of
  ECHOED OPCODE BYTES that follow (confirmed by R2's `76 02 01 13` — two
  opcodes, `01` and `13`, exactly the two commands JustRow's own program
  sent — and R4's `76 1A <26 opcodes>`, §6). Any OTHER `topOpcode` (R1 and
  R3's `0x1A` — `CSAFE_SETUSERCFG1_CMD`, NOT one of the doc's four labeled
  "Command Wrapper" opcodes, even though it wraps sub-commands in OTHER,
  unrelated command contexts, §11) is treated as a single bare acked
  command: `commandIds = [topOpcode]`, and whatever follows `topOpcode`
  (R1's `00`, R3's `03 BF 01 04`) is NOT decoded as a further opcode list —
  `pm5/commands.ts` never emits a `0x1A`-wrapped command itself, so this
  path exists only so `parseCsafeResponse` doesn't crash or fabricate
  garbage on a response shape it wasn't built to fully understand, not
  because it's confirmed correct for that shape.

  > **CORRECTION (2026-08-06, Phase 7A-fix-2 Task 3): the sentence above
  > is now FALSE.** `pm5/commands.ts`'s `buildGetErrorType` (added by
  > Task 3) DOES emit a `0x1A`-wrapped command — `CSAFE_PM_GET_ERRORTYPE`
  > (`0xC8`), sent by `src/monitor/driver.ts`'s `sendGetErrorType` after
  > every genuine programming reject. The response-side reasoning
  > (parsing an unconfirmed `0x1A` reply shape without crashing) is
  > unaffected, but "never emits" no longer holds, and this path is no
  > longer merely defensive against a shape this codec doesn't produce —
  > it is now live on every reject. See §17's new pull-path item (added
  > by this same correction) for the still-open wrapper question this
  > raises on the REQUEST side.
- An ack-frame builder (`buildAckFrame(status, commandIds)`) is the
  inverse: `0x76`-wraps `commandIds` as a bare opcode list (mirroring R2/R4
  exactly) behind the requested status byte, then runs it through
  `csafe.buildFrame` — this is what the fake transport (Task 4) uses to
  answer `pm5/commands.ts`'s writes without needing its own copy of the
  wrapper format.

**Final-review M-6:** the non-`0x76` `topOpcode` fallback bullet above is an
explicitly-unconfirmed inference ("not because it's confirmed correct for
that shape") that §17 omitted before this fix — traced to §17's own source
list naming only "§6, §14, and §15" and never §16 itself. Now flagged at
§17 item 1 below, and §17's source list corrected to include this section.

**Coalescing (resolved, recorded here for completeness — not a laptop-
session item):** a single BLE notification callback can deliver TWO
complete response frames back to back (real notifications coalesce this
way under load) — `pm5/framer.ts`'s `reassemble()` documents the drain
contract this requires (keep pushing empty chunks until it returns `null`
again), and `src/monitor/driver.ts`'s own read loop follows it. This
resolved a real, proven bug (fix-round MED-1, Task 4: a coalesced second
frame arriving with nothing yet awaiting it used to be silently dropped,
hanging `program()` forever whenever a multi-frame program's ack coalesced
with the next) — pinned by a same-turn two-frame test and a mutation
(`while` -> `if` on the drain loop, which survived 50/50 pre-fix). This is
software-only and already proven in CI; it needs no laptop-session
confirmation and was never a candidate for one — recorded here purely
because a `grep` for "coalesc" across this file previously returned zero
hits despite the driver's own MED-1 correctness argument resting on it.

## 17. The laptop session runsheet

Phase 7A's own tasks resolved nothing by running actual bytes against a
real PM5 — every value above was, at the time this section was first
written, a documented-text or reviewed-code-behavior inference, each one
explicitly flagged as provisional. This section gathers every item already
flagged for "the laptop session" across §6, §14, §15, and §16, so a
laptop-vs-real-PM5 session has a single, RUNNABLE runsheet instead of a
scavenger hunt through the sections above.

**Update (Task 5 close-out, phase-7a-fix, 2026-08-05): laptop session 1 has
now happened.** §18 holds its results. This runsheet is updated in place —
each item below now carries its own status — rather than pruned, because a
fixed, numbered runsheet that shrinks after every session is harder to
audit than one that shows its full history. Two-tier summary:

- **ANSWERED, no further hardware needed:** the discovery filter's real
  shape; the XOR checksum rule (the PM's own ack checksums satisfy it,
  making the doc's three printed values errata as encoded); 0-based
  write-side interval indices; the GATT status parse (distance/elapsed/
  pace/spm cross-check); `intervalRemaining`'s checkpoint computation; the
  terminal-state latch (no un-finishing, confirmed in the field);
  multi-interval programming working end to end from a clean state; and
  **the structural readback (item 12 — SESSION 4a, 2026-08-07: outcome (a),
  unanimous across TIME/DISTANCE/rest-0, with the empty arm's own anatomy
  captured on the wire)**. See "Answered by laptop session 1" just below
  for the full list with citations.
- **STILL OPEN — must survive as executable runsheet items:** the real
  clear/wipe command remains UNFOUND (item 6 — `terminate()` was tried and
  is NOT it: accepted once with a completed workout present, yet the
  program sent right after was still rejected, twice); the no-rest
  work→work boundary index
  (item 13); and distance-kind intervals plus a genuinely multi-FRAME
  program (Sea Smoke's 24 intervals / 6 frames today, 25 / 7 when this
  runsheet was written — see §12's note), neither of which has ever
  been tried from a known-empty machine (item 5 — every distance/25-
  interval attempt so far ran immediately after a successful program,
  i.e. against a LOADED monitor, which D1 says gets rejected regardless of
  the bytes sent). "The pending verification row" below is this task's
  prepared, ready-to-run sequence for the next hardware session; it is
  NOT run yet — its Observed fields are deliberately blank.

> **CORRECTION (2026-08-06, §19).** Three claims in the paragraph above are
> no longer supported. (a) `terminate()` "was tried and is NOT it … still
> rejected, twice" — both of those were ACCEPTS (§19.1); terminate is still
> not a clear, but the documented reason is *Rearm*, not those two frames
> (§19.5). (b) "D1 says [a loaded monitor] gets rejected regardless of the
> bytes sent" — D1 is withdrawn (§19.2). (c) the no-rest work→work boundary
> index (item 13) is now ANSWERED by laptop session 2: forward attribution
> applies there too (§19.8).

> **CORRECTION (2026-08-07, SESSION 4a, §18).** The STILL-OPEN bullet
> above also lists item 5 as untested from a known-empty machine "whether
> [the] DISTANCE kind program[s] correctly." Session 4a armed a genuine
> DISTANCE program (3×500m r60) from a settled state and read its structure
> back correctly (`8` / `500` / `128`, §18 SESSION 4a). That substantially
> answers the DISTANCE half of item 5; the genuinely multi-FRAME retention
> half (Sea Smoke from a known-empty machine — 24 intervals / 6 frames
> today, 25 / 7 when this was written) is
> still untested and remains the item's open remainder.

This session remains a **James-device event**, run with a controller
driving the bridge (`app/scripts/pm5-bridge.mjs`) alongside him — never a
CI gate, and not required for any task's own gates to pass.

**Final-review M-5 (this wave's fix):** before this fix, this section was
an index, not a runsheet — every item was a bare cross-reference with no
expected-vs-observed field, no setup instructions, no results destination,
and its named vehicle (`webBluetooth.ts`) had ZERO call sites anywhere in
the repo, so running it required writing code first. All four gaps are
fixed below: setup steps, an expected/observed pair per item, §18 as the
results destination, and `app/scripts/pm5-lab.ts`/`.html` as the entry
point that actually exists now.

### Answered by laptop session 1 (2026-08-05) — no further hardware needed

Each of these closes the corresponding numbered item below (status noted
inline there too); listed together here so the "what's answered" question
has one place with a one-line answer per fact, not a hunt through §18's
narrative:

1. The discovery filter's real shape — 0x0030 (the rowing service) is not
   advertised and leaves Chrome's picker empty forever; device-info service
   OR name-prefix `"PM5"` surfaces the real device (§18, "Also fixed live
   this session").
2. The XOR checksum rule is the real one — the PM's own ack checksums
   satisfy it as this codec computes it; the doc's three printed values are
   errata, as encoded (§18 #1, item 1 below).
3. Write-side interval indices are 0-based, confirmed on the wire
   (`18 01 00/01/02/03`) (§18 #1, item 1 below).
4. The GATT status parse is right — distance/elapsed/pace/spm all
   cross-check against each other (§18 #1, item 1 below).
5. `intervalRemaining`'s checkpoint computation WAS correct as rebuilt onto
   0x0033's Last Split fields, through interval indices 0-1 only; CR2 spec
   2a Task 6 deleted the checkpoint subtraction after the inversion showed
   it wrong from index 2 on (§20 item 17's corrected account; §18 #7, item
   7 below).
6. The terminal-state latch holds in the field: `finished` +
   `workoutComplete`, no un-finishing, across a full multi-interval session
   (§18, "VALIDATED ON HARDWARE" / item 8's trailing-rest confirmation
   below).
7. Multi-INTERVAL programming works end to end from a clean/idle state
   (terminate → 2 time intervals → accepted → rowed to completion) — this
   is distinct from the still-open multi-FRAME question (item 5 below),
   which needs enough intervals to force more than one CSAFE frame (§18
   #5/#6 — **CORRECTION (2026-08-06):** not "D1's rule"; D1 is withdrawn,
   §19.2).

### Not hardware-resolvable (excluded from the numbered runsheet)

The Predefined Standard List Workout #3 response frame's possible fourth
checksum erratum (§6, "Possible fourth erratum, unresolved": doc prints
`0x24` for content `01|81 24`, matching neither XOR-rule candidate,
`0x25`/`0xA5`) is **not something a rowing machine can resolve** — the
notes' own text names the likely cause as an OCR/extraction artifact in the
PDF, not a computed-value error. No PM5 observation, correct or otherwise,
settles a transcription question; this needs a re-extraction of the source
PDF, not a laptop session. Recorded here so it stays tracked without
occupying a numbered slot that implies hardware can answer it.

The §15 #2 heart-rate 255-sentinel item is likewise excluded from the
numbered runsheet, for a different reason: its own row concludes the
answer is harmless either way (255 bpm is physiologically impossible, so
mapping it to `null` is correct whether or not it is the firmware's
sentinel convention). A hardware observation would satisfy curiosity but
change no code. It stays open in §15 as documentation; it earns no
runsheet slot. (This paragraph exists so §17's completeness guarantee —
every flagged item either numbered here or explicitly excused — holds.)

### Setup

1. Wake the PM5 — row a stroke, or press any button on the monitor — so it
   starts BLE advertising. It stays awake for a few minutes with no rower
   input; if a scan later comes back empty, wake it again.
2. From `app/`, run `pnpm dev` (Vite's dev server; no build step needed).
3. Open **Chrome or another Chromium browser** — Web Bluetooth is
   Chromium-only (`docs/superpowers/research/2026-07-27-pm5-ble-research.md`);
   no flags need setting for `localhost`, which Chrome treats as a secure
   context automatically.
4. Navigate to `http://localhost:5173/scripts/pm5-lab.html` — the dev lab
   harness (`app/scripts/pm5-lab.ts`, final-review M-5): wires
   `createWebBluetoothTransport` straight to `createPm5Driver` and a real
   event log, with console output plus an on-page `exportLog()` dump. NOT
   product UI — no design-system components, excluded from the coverage
   gate and mutation testing exactly like the two Transport adapters it
   drives.
5. Click **Scan & connect** and pick the PM5 from Chrome's own device
   picker (a user gesture is required for `requestDevice`, which is why
   this is a button rather than something that runs on page load — there
   is no separate pairing step; the picker handles discovery).
6. Use **Program test workout** / **Terminate** / **Disconnect** to drive
   the scenarios the items below name; watch the on-page log AND the
   devtools console (identical output). **Dump event log** prints
   `exportLog()`'s full chunk-by-chunk trace (design spec §5) for anything
   that needs the byte-level record, not just the human-readable line.
7. **Results destination:** append what you observe to §18 below, one
   entry per item number, dated. §18 is the only place these results live —
   this section (§17) stays a fixed runsheet across sessions, not a log.

**The settle toggle (`settle-off` / `settle-on`), added by Phase 7A-fix-3
Task 3.** Two REMOTE-only bridge commands (`curl -X POST
http://127.0.0.1:5178/command -d settle-off`) that decide whether the NEXT
driver this page builds passes `prepareSettleTicks: 0` — i.e. whether
`program()`'s prepare-settle wait (design spec §1b) runs at all. Session
4a's empty-arm capture and session 4b's detection row both need it OFF, so
that the §19.13 empty arm still reproduces and the structural readback has
something real to catch; everything else wants it ON (the default, 10
ticks). **It takes effect at driver CONSTRUCTION, so send the command and
then click Scan & connect again** — `createPm5Driver` has no teardown, and
rebuilding a live driver would leave the previous one's subscriptions
double-processing every notification. The command's own output says which
state it left the flag in and whether a reconnect is pending; there is no
BUTTON for either, deliberately, since a session that silently ran with the
settle off would be worse than one that needed a reconnect.

### The runsheet

1. **STATUS: ANSWERED (§18 #1).** The three confirmed checksum errata
   (§6, "3 errata" table).
   Expected (per the XOR rule, which the codec trusts): Fixed Time Interval
   2:00/:30 rest checksums `0xB0` (doc prints `0x0A`); Variable Interval
   v500m/1:00r×4 (the load-bearing structural example) checksums `0x09`
   (doc prints `0xC6`); Terminate Workout checksums `0x60` (doc prints
   `0x62`). Observed: does the PM5 accept frames built with the computed
   values, or does it reject them / behave as if it wanted the doc's
   printed ones?
2. **STATUS: OPEN — not isolated by session 1** (§18 #2: the state word
   was tracked `armed → rowing → resting → rowing → resting → finished`
   across a full session with no un-finishing, but no entry pinpoints a
   `COUNTDOWNPAUSE` ordinal specifically). COUNTDOWNPAUSE → `armed`
   (§14, row 2). Expected: `MonitorFrame.state`
   reads `"armed"` at some point between connecting and the first stroke —
   this mapping is the least-certain single row in the whole state table,
   absent from every Appendix E transition diagram, positioned by enum
   ordinal and naming alone. Observed: after programming a workout, watch
   `exportLog()`'s "frame" entries between `armed` and the first stroke —
   does a `COUNTDOWNPAUSE` state ever appear, and does the app's `"armed"`
   reading look right through it?
3. **STATUS: ANSWERED, and it's worse than "which base" (§18 #3).** The
   PM attributes rests FORWARD into the interval they're heading toward,
   structurally different from this codec's 0-based-per-work-interval
   numbering, not merely offset — `domain/monitor/pm5/intervalIndex.ts`'s
   `toProgramIndex`/`toMachineIndex` now do this translation (Task 3/4),
   confirmed no longer open. **Residual — RESOLVED (§19.8, item 13's own
   CORRECTION):** the RESTING half of the rule was confirmed here; the
   no-rest work→work boundary (once carried forward to item 13 as the only
   unresolved piece) is answered too, for 0x0037/38 specifically —
   `toActualIndex` (Task 5) applies the offset unconditionally there, while
   0x0033's own `toProgramIndex` above stays rest-keyed, unchanged.
   Interval numbering base (§15 #1). Expected: 0x0033's "Interval
   Count" and 0x0037/0x0038's "Split/Interval Number" are 0-based, like the
   CONFIRMED 0-based write-side index (§12). Observed: program the test
   workout (one interval) and watch the `"frame"`/`"interval-complete"`
   log entries' `intervalIndex`/`actual.index` values — do they start at 0
   or 1? Do the two ever disagree (watch for a `"divergence"` log entry —
   §15 #1's own lockstep question)?
4. **STATUS: OPEN — not tested session 1** (§18 #4: the harness's
   `TEST_PROGRAM` used a real target throughout). `SET_TARGETPACETIME` for a no-target interval: zero vs omit** (§15
   #3). Expected: sending `0x00000000` (this codec's current behavior)
   means "no enforced target." Observed: program a workout with no split
   ref (the harness's `TEST_PROGRAM` has `targetSplit: 120`, a real target
   — for this item specifically, edit the harness's constant to `null` and
   reload) and check whether the PM5 shows/enforces an impossible 0:00/500m
   pace instead of "no target."
5. **STATUS: OPEN — PARTIALLY answered, genuine multi-frame still
   untested from a clean state (§18 #5).** Multi-INTERVAL programming (one
   CSAFE frame carrying 2 intervals) is CONFIRMED working end to end,
   rowed to completion. The genuinely multi-FRAME case this item is
   actually about — several ack-gated frames for one program, e.g. Sea
   Smoke's 25 intervals / 7 frames — was attempted this session but only
   ever immediately after a successful single-interval program, i.e.
   against a LOADED monitor; D1 (item 6 below) says that gets rejected
   regardless of the bytes sent, so those attempts are confounded and
   prove nothing about multi-frame retention specifically.
   > **CORRECTION (2026-08-06, §19.1/§19.2).** D1 is withdrawn, so the
   > stated confound is not the reason. The stronger point stands and gets
   > stronger: those attempts were never rejected at all — the frame-0
   > `0x81` read as a "nak" was an ACCEPT — so multi-frame retention has no
   > evidence either for or against it. Re-derive from the raw traces.
   **Distance-kind
   intervals carry the same confound**: every DISTANCE program sent this
   session (3-interval, 25-interval) also ran against an already-loaded
   monitor. Neither "does a real multi-frame program retain all its
   frames" nor "does the DISTANCE kind program correctly" has been tested
   from a known-empty machine — both fold into "The pending verification
   row" below as follow-up work, since Task 2's clear→send→verify fix now
   makes starting from a genuinely clean state routine rather than
   something that has to be arranged by hand. Multi-frame programming retention (§15 #6, `pm5/commands.ts`'s
   `buildFrameGroups` comment). Expected: the PM accumulates interval
   configuration across every ack-gated frame it takes to program a
   workout — every worked example in both source documents is
   single-frame, so this is inferred, not observed. This is the single
   fact the whole codec is LEAST confident about. Observed: program a
   workout with enough intervals to force multiple frames (the harness's
   `TEST_PROGRAM` is one frame; a real multi-frame case needs a bigger
   `WorkoutProgram` — Sea Smoke's 24 intervals need 6, and needed 7 at 25
   before 2026-08-09's warmup setting) and confirm every
   interval the PM ends up armed with matches what was sent, not only the
   last frame's.
   > **CORRECTION (2026-08-06, laptop session 3, §18): STATUS: PARTIALLY
   > ANSWERED.** The merge-gate row's Step 5 sent a genuine 7-frame program
   > (25×100m, no rest) and every frame acked — the FIRST multi-frame
   > program completion this codec has ever achieved against real hardware.
   > The live bisect that followed (§18 "Live bisect") sent six further
   > shapes (single-frame and multi-frame, distance and count varied) from a
   > settled/armed-idle machine and every one armed correctly, including a
   > second 7-frame send (`bisect-frames`, 25×500m). But Step 5's own 7-frame
   > send was rowed only 108.4m into a program that turned out structurally
   > EMPTY (§19.13) — it landed on a RUNNING workout, not a clean one — so it
   > answers "does a 7-frame send ack and arm" (yes, from a settled state)
   > without yet answering "does a full 7-frame program retain all 25
   > intervals when rowed to completion." That remains UNROWED.
6. **STATUS: OPEN — ANSWERED then WEAKENED; the single top open question
   for the next hardware row (§18 #6).** The RULE is confirmed (D1: the PM
   accepts a program only when nothing is loaded; a rejected program WIPES
   what was loaded). But the follow-up row (phase-7a-fix Task 1) found
   `terminate()` is NOT a working clear: it was accepted once with a
   completed workout present, yet the program sent right after was still
   rejected — twice. **The real clear command, if one exists, remains
   UNFOUND.** This does not block the shipped code (Task 2's clear→send→
   verify sends `terminate()` as a best-effort clear, ignores its
   rejection, and verifies the real outcome either way — it never assumed
   a working clear), but the underlying accept/reject state model is still
   not understood, and "The pending verification row" below is built
   around confirming the fix works DESPITE that gap, not around closing
   the gap itself.
   > **CORRECTION (2026-08-06, §19.1/§19.2/§19.5).** The "RULE" is withdrawn
   > and the "rejected — twice" evidence was two acceptances. The absence of
   > a clear command is real and DOCUMENTED (terminate routes to *Rearm*),
   > but it was never established by this item's evidence. See §19.5 for the
   > candidate list, and note `CSAFE_PM_SET_RESET_ALL` (`0xE0`) is
   > `<Not implemented>`.
   No documented wipe/reset for a shorter re-program
   (§15 #7,
   `buildProgrammingSequence`'s comment). Expected: unknown — no command
   exists in the documented flow to clear a prior program. Observed:
   program a workout with N intervals, then immediately program a SECOND,
   shorter one (fewer intervals) without power-cycling the PM, and check
   whether the PM plays only the second program or a mix carrying a stale
   tail from the first.
7. **STATUS: ANSWERED — CONFIRMED (§18 #7), corrected by §20 item 17.**
   `intervalRemaining`'s checkpoint cadence (§15 #8,
   `computeRemainingForFrame`'s comment). Expected: 0x0033's "Last Split
   Time"/"Last Split Distance" hold steady at the current interval's start
   point for its whole duration, updating only at the next boundary.
   Observed: during a multi-interval test workout, watch whether the app's
   own `intervalRemaining` counts down smoothly and hits exactly 0 at each
   boundary, or jumps/glitches (a bad cadence assumption would show as a
   sudden jump partway through an interval, not a boundary). This session's
   single-interval capture never went past interval index 1, where the
   checkpoint reads 0 and "holds steady at the start point" is
   numerically indistinguishable from "reads zero"; §20 item 17's
   inversion found the actual semantics wrong from index 2 on.
8. **STATUS: ANSWERED — CONFIRMED accepted (§18 #8).** Trailing-rest-on-final-interval acceptance (§15 #9/program.ts's rest-
   folding comment). Expected: the PM cleanly finishes counting down a
   nonzero rest programmed onto the workout's LAST interval before
   `WorkoutEnd` — untested by any worked example, practically significant
   (161 of 300 seeded library workouts compile this shape). Observed:
   program a workout ending in a nonzero rest (edit the harness's
   `TEST_PROGRAM.intervals[0].restSeconds` to something nonzero, since it
   already is the only/last interval) and watch whether `WorkoutEnd`/
   `workoutComplete` fires only after the rest counts down, or early.
9. **STATUS: OPEN — not recorded session 1** (§18 #9). `currentSplit`'s idle/armed value (§15 #5, `toMonitorFrame`'s
   comment). Expected: unknown — neither document states what an armed or
   resting erg's Current Pace byte reads. Observed: while armed (before the
   first stroke) and while resting between intervals, watch `"frame"` log
   entries' `currentSplit` value — is it `0`, the last real pace, or
   something else?
10. **STATUS: ANSWERED (as expected) — nothing to report (§18 #10).**
    No ack of the unconfirmed shape appeared in any trace; stays on the
    runsheet unchanged in case a future session's `exportLog()` ever shows
    one. The non-`0x76` response `topOpcode` fallback (§16's own
    "Coalescing (resolved)" paragraph's neighbor — the unconfirmed-inference
    bullet in §16's ack-echo format list). Expected: `pm5/response.ts`
    never actually reaches this path in normal use (`pm5/commands.ts` never
    emits a `0x1A`-wrapped command), so it should be unobservable in
    ordinary operation. Observed: nothing specific to provoke — recorded so
    that if `exportLog()` ever shows an ack whose bytes don't match the
    `0x76`-wrapper shape (an `"ack"` entry that looks unlike every other
    one), that's this path firing and worth a closer look.

    > **CORRECTION (2026-08-06, Phase 7A-fix-2 Task 3): "should be
    > unobservable in ordinary operation" is now INVERTED, not merely
    > stale.** `pm5/commands.ts`'s `buildGetErrorType` (Task 3) makes
    > `src/monitor/driver.ts` emit exactly this `0x1A`-wrapped shape on
    > the REQUEST side on every genuine programming reject, and the reply
    > this item describes is the SAME response path `sendGetErrorType`
    > now reads (raw hex only, no decode claim). This item's own
    > "Observed: nothing specific to provoke" no longer holds either — a
    > lab session sending `program-two-time` (or any workout) against a
    > PM that genuinely rejects it will provoke this path directly. See
    > item 14 (added by this correction) for the REQUEST-side wrapper
    > question this raises, which item 10 itself never asked.
11. **STATUS: OPEN — no symptom observed, but INCONCLUSIVE (§18 #11).**
    No dropped-chunk symptom appeared across any multi-chunk write this
    session, but no single write was large enough to be a decisive stress
    case — recorded as answered-so-far, not proven, and left on the
    runsheet rather than promoted to the "no further hardware needed" list
    above. `writeValueWithoutResponse` for multi-chunk CSAFE frames**
    (`webBluetooth.ts`'s `write()` comment, final-review L-7). Expected: a
    multi-chunk frame (any programming write spanning more than one 20-byte
    BLE write) arrives intact even though each chunk is written with no
    per-chunk ack. Observed: program a workout large enough to span
    multiple chunks and watch for a `"frame-error"` log entry (a garbled/
    truncated frame on the PM5's response path) or a `ProgramRejectionError`
    with reason `"nak"` that wouldn't otherwise be expected — either would
    suggest a dropped chunk under this write mode.
12. **STATUS: ANSWERED (SESSION 4a, 2026-08-07, PM5 432331249) — outcome
    (a), unanimous across all three shapes. The structure IS readable back,
    and `verifyArmed` now gates on it.** Whether an accepted program's
    structure is readable back (plan 7A-fix Task 2 review, F2 —
    `src/monitor/driver.ts`'s `verifyArmed`). This item asked whether
    0x0031's `workoutType`/`workoutDurationRaw`/`workoutDurationType` echo
    what was sent, after a program the PM accepted. **Observed, on the
    wire:**

    | Arm | `workoutType` | `workoutDurationRaw` | `workoutDurationType` |
    |---|---|---|---|
    | TIME, 2×60s r30 | `8` | `6000` (60s × 100) | `0` (Time) |
    | DISTANCE, 3×500m r60 | `8` | `500` (whole metres) | `128` (Distance) |
    | REST-0, 2×60s r0 | `8` | `6000` | `0` (Time) |
    | pre-arm baseline | `0` | `0` | `128` |
    | **EMPTY ARM** (steady state) | **`1`** | **`0`** | **`128`** |

    Four findings this settles: the read-side TIME scale is 0.01 s/lsb, the
    same one we ENCODE with; distance is read/write symmetric in whole
    metres (previously assumed, now observed); `workoutType` is **STABLE at
    `8`** across all three shapes — no normalization to a rest-less sibling
    ordinal — so the type is a usable check rather than noise; and the
    fields **REFRESH while the machine is merely ARMED**, no rowing needed,
    which is what makes the readback usable at verification time at all.
    The empty arm's own anatomy was captured too (settle-off,
    `program-short` over a running piece, monitor showing `:00`, driver
    reporting acked-armed): the duration reads `0` AND the type degrades to
    `1`. **Mid-cycle transients (`type=1` carrying stale, NON-ZERO
    durations) were also seen** between the accept and the steady state —
    the recorded fact that a single mismatched tick is not yet evidence of
    a wrong arm. 4a's settle validation independently measured `"armed"
    observed on tick 4`, twice, so a several-tick unsettled window is the
    observed normal too.

    > **NOT a 4a reading, and not located anywhere in this document
    > (review I-1, fix-3 Task 4):** the fix-3 plan and Task 4's brief both
    > state that "2 of session 3's 5 clean arms carried the previous
    > program's 0x0031 payload on their first armed tick". §18's session-3
    > record contains no such observation, and could not — fix-3 Task 1
    > built the first log able to record a 0x0031 payload at all, so
    > session 3 predates the instrument. What session 3 did show is a
    > related but different observable: `verifyArmed` resolving on frames
    > whose ELAPSED fields still carried the previous workout. The figure
    > is recorded here as **plan-asserted, pending confirmation**; session
    > 4b confirms or retires it, and the driver's own first-sighting
    > `"structure-mismatch"` entry is the instrument that answers it. The
    > N=3 rule does not rest on it — the transients and the tick-4 settle
    > measurement above carry it on their own.

    **CONSUMED BY (fix-3 Task 4):** `verifyArmed` (`src/monitor/driver.ts`)
    now resolves only on a fresh post-send tick that is `armed` AND whose
    structure equals `expectedArmedStructure(p)` (`pm5/commands.ts`, which
    derives the prediction from the ENCODER's own constants so the two
    cannot drift). A mismatch rejects with the new
    `ProgramRejectionReason` member `"structure-mismatch"` after **3
    consecutive armed ticks reporting the SAME wrong structure** (the
    recorded transients are why the rule counts STABLE ticks — a payload
    that keeps changing is a machine still settling, so it restarts the
    count), or at the `verifyTicks` bound — which now
    DEFAULTS to 20 rather than meaning "unbounded", since an unbounded
    verify under a structure predicate turns a caught defect into a hang.
    The full 4a record lives in §18, "2026-08-07 session (PM5 432331249) —
    SESSION 4a" below; this table is the disposition, not the raw log.

    > **Superseded correction, kept for the trail (2026-08-06, laptop
    > session 3, §18/§19.13):** the live bisect's Step 5 send and its REPRO
    > row each produced a structurally EMPTY arm that nonetheless passed
    > the then-current state-only `verifyArmed` and acked every frame
    > cleanly — two hardware-confirmed cases where the bare state check
    > reported success on a program with no interval structure at all.
    > Both would have been caught by the check 4a's readings made
    > buildable, and session 4a's own deliberate repro is the third.
13. **STATUS: ANSWERED (§19.8) — the rest-keyed rule was wrong for
    0x0037/38; `index-unverified` retired.** Needs a
    `restSeconds: 0` interior interval, which the pending verification
    row's `program-two-time` shape does NOT have (both its intervals carry
    `restSeconds: 30`) — this item needs its own follow-up row with a
    different harness program, not a slot inside the pending row below.
    0x0037/38's index at a work→work boundary with NO intervening rest**
    (plan 7A-fix Task 3 review, critical finding — `domain/monitor/pm5/
    intervalIndex.ts`'s `toProgramIndex`). §18 #3's confirmed forward-
    attribution rule ("a rest reports the interval it is heading into") only
    has hardware evidence for the RESTING half — a boundary that transitions
    while the state word is still `"rowing"` throughout (a `restSeconds: 0`
    interval, which `seaFretProgram()`'s own warmup interval and
    `MINIMAL_PROGRAM` both are) never engaged the resting branch during that
    session, so what 0x0037/38 actually carries at THIS shape of boundary
    is genuinely unknown — today's code applies the rowing rule (pass the
    machine index through unadjusted) for lack of any confirmed alternative,
    NOT because it has been observed correct here. `src/monitor/driver.ts`
    logs an `"index-unverified"` entry every time this happens so the
    assumption is visible in the trace, never silent. Expected: unknown by
    design — this item exists to become known. Observed: send the harness's
    `program-no-rest` command (`TWO_TIME_NO_REST_PROGRAM` — two 60s TIME
    intervals, `restSeconds: 0` on both; added for this item precisely
    because `TWO_TIME_PROGRAM`'s 30s rests cannot answer it), row through
    the work0→work1 boundary, and dump
    `exportLog()`'s raw per-characteristic trace (the `"notify"` entries the
    §18 #3 session's own raw-logging fix produces) for 0x0037/38 — does the
    Split/Interval Number at that boundary read `0` (this interval, matching
    the rowing rule as applied today) or `1` (the interval it's heading
    into, matching the resting rule's own shape applied even with no rest)?
    That reading settles which rule (if either) actually governs a
    work→work boundary.
    > **CORRECTION (2026-08-06, Phase 7A-fix-2 Task 5): STATUS: ANSWERED.**
    > Laptop session 2 read the Split/Interval Number as `1` at exactly this
    > boundary shape (§19.8) — the interval-heading-into reading, not the
    > "rowing rule" identity pass-through this item's own text (above)
    > described as the untested assumption. 0x0033 read `0` (identity) at
    > the same instant, so the two wire fields disagree with each other:
    > 0x0037/38's forward attribution does not depend on the machine
    > actually being in a resting state, only on 0x0037/38 being the field
    > in question. `domain/monitor/pm5/intervalIndex.ts` now has a SECOND
    > function, `toActualIndex`, applying `machineIndex - 1` unconditionally
    > (whenever `machineState` is `"rowing"` or `"resting"`) for
    > `IntervalActual.index` alone — `toProgramIndex` (0x0033, this item's
    > own `intervalCount` field) is UNCHANGED, since its one hardware
    > reading for this exact shape (`0`) matches identity exactly. The
    > driver's `"index-unverified"` log entry, which existed to flag this
    > item while it was open, is RETIRED — the question it was flagging is
    > this correction.
    > **Cross-reference (2026-08-06, laptop session 3, §18):** the minus-1
    > rule this item settled for TIME intervals now also holds for a
    > DISTANCE interval's boundary — see item 17's own conversion,
    > `program-short`'s 500m first interval (`interval-complete index=0
    > (machine reported 1)`, raw `0x0037`/`0x0038` captured).
14. **STATUS: OPEN — added by Phase 7A-fix-2 Task 3's review (MINOR-1);
    did not exist before this commit, so no data yet.** Which wrapper a
    GET/pull command should actually carry on the REQUEST side — `0x1A`
    (`CSAFE_SETUSERCFG1_CMD`, per CSAFE-DEF's own worked "Get Force Curve"
    example, `F1 1A 01 BF A4 F2`, §6 example 13) vs `0x7E`/`0x7F`
    (csafe.h's own four-wrapper partitioning, §19.11 — one push/pull pair
    per command family, `0x76`/`0x77` and `0x7E`/`0x7F`, which would put a
    GET under `0x7E` or `0x7F` instead). `pm5/commands.ts`'s
    `buildGetErrorType` (Task 3) and any future
    `CSAFE_PM_GET_SCREENSTATESTATUS` send (design spec §7, `terminate()`'s
    still-undone documented fix) both follow the DOCUMENT'S worked bytes
    (`0x1A`) over the header's inference, but neither has ever been
    confirmed on real hardware — this codec has never sent a non-`0x76`
    command to a PM5. Expected: unknown by design — a real GET sent under
    `0x1A` either gets a coherent reply (settling the wrapper AND proving
    the pull path exists over this BLE transport in one observation) or
    gets silence/an error (CSAFE-DEF p.10's own "merely disregards an
    unrecognized command" applies here too — see item 10's own
    correction, and `src/monitor/driver.ts`'s `errorTypeTicks` bound,
    added for exactly this possibility). Observed: send `GetErrorType`
    (`buildGetErrorType()`, `f1 1a 01 c8 d3 f2`) from the lab against a
    clean-idle PM (no reject needed to provoke it manually — this item
    only needs the raw reply captured, not a real error to describe) and
    dump the raw response bytes. This single observation settles the
    wrapper choice, whether the pull path works over BLE at all, AND
    starts the decode `GetErrorType`'s own reply and
    `GetScreenStateStatus`'s pending/in-progress/inactive status
    (interface-notes.md §19.6) both still need — `buildGetErrorType`'s own
    doc comment and `DriverOptions.errorTypeTicks`'s doc comment both cite
    this item.

    > **Cross-reference (2026-08-06, Phase 7A-fix-2 Task 7): this item pairs
    > naturally with the session-3 merge-gate row below** (§17, "The
    > merge-gate row (session 3, RUN 2026-08-06 — results in §18)") — the
    > lab is already connected and idle right before that row's step 1,
    > exactly the state this item needs. **It did not get folded into
    > session 3** (§18) — still its OWN hardware action, not a sixth step of
    > that row: `app/scripts/pm5-lab.ts`'s `REMOTE` map has no
    > command that sends a bare `buildGetErrorType()` outside a genuine
    > programming reject (`src/monitor/driver.ts`'s `sendGetErrorType` is
    > only ever called internally, on a real `"nak"`), so answering this
    > item still needs either a deliberately-provoked reject or a small
    > harness addition — out of scope for this docs-only task. GetErrorType's
    > own decode and `SetScreenState`'s pending/in-progress/inactive status
    > (§19.6) both still wait on whichever session answers it.

15. **STATUS: OPEN — carried from Phase 7A-fix-2 Task 6's review (the fake's
    prepare-refusal rests on an uncaptured byte); did not exist before this
    commit, so no data yet.** Whether the PM genuinely refuses a bare
    `terminate()` sent to an idle machine (nothing loaded, nothing rowing).
    `src/monitor/transports/fake.ts`'s `onClearingFrameComplete` synthesizes
    `sendAck(loadedIntervalCount === null ? "reject" : "ok", …)` for exactly
    this case, and `src/monitor/driver.ts`'s `sendPrepare` doc comment calls
    the resulting refusal "the EXPECTED, common case — hardware showed the
    PM refuses a terminate when nothing is currently running or loaded"
    (`:1477-1481`), citing "interface-notes.md §18's clean-run observation."
    That citation is this file's own "S1 | CLEAN RUN 2: terminate, nothing
    loaded" row in §19.1's re-derivation table — an **NARR-NB** row: no byte
    was ever written down for that send, only the OLD PARSE's label
    ("rejected — nothing to terminate") survives. Every other "rejected"
    label the old parse produced across both sessions turned out, once
    decoded under the corrected bitfield rule, to be an ACCEPT (§19.1's
    twelve RAW rows, zero rejections) — the one piece of "evidence" behind
    this item is that exact parse, now known to mislabel acceptances as
    rejections, applied to a send whose byte nobody captured. Expected:
    unknown by design — this item exists to become known. Observed: from a
    clean/idle PM5 (freshly connected, nothing programmed, nothing rowing —
    the state the session-3 row's own setup leaves the machine in right
    before its first `program-two-time` send), send a bare `terminate` (the
    lab's `terminate` button / bridge command — standalone, never
    `program()`'s internal prepare step) and `dump` immediately after; read
    the raw status byte off the ack frame. Decoding it settles whether an
    idle terminate is a genuine reject (`(status & 0x30) === 0x10`) or
    another accept the old parse mislabeled. **What changes if it is NOT a
    genuine reject:** `fake.ts`'s `onClearingFrameComplete` refusal is then
    modelling a machine behaviour with no confirmed evidence behind it and
    should accept unconditionally instead (the fake would need a different,
    explicitly-synthetic hook to script a refusal, the way `injectNak`/
    `failNextProgramFrame` already do for the programming frame); and
    `driver.ts`'s `sendPrepare` comment's "hardware showed the PM refuses…"
    clause would need to drop the hardware-evidence claim. The
    swallow-as-routine BEHAVIOUR itself likely survives either way (ANY
    non-disconnected prepare outcome is already swallowed, by design) — only
    the STATED REASON for expecting a reject specifically would not.
    > **CORRECTION (2026-08-06, laptop session 3, §18): STATUS: ANSWERED.**
    > A standalone `terminate` (not `program()`'s internal prepare step) sent
    > from the machine's post-`program-many` armed-idle screen acked
    > `f1 81 76 01 13 e5 f2` with `slaveState=ready`, logged `terminate-sent`
    > (distinct from the `prepare-sent` kind `program()`'s internal step
    > logs). Decoded: bit 7 (`0x80`) = frame-count toggle, set; bits 4-5
    > (`0x30`) = `00` = previous-frame status OK; bits 0-3 (`0x0F`) = `01` =
    > slave state READY. **An ACCEPT, not a reject.** The idle-terminate
    > refusal `fake.ts`'s `onClearingFrameComplete` models never existed on
    > real hardware — it was exactly the pre-fix misparse this item's own
    > text predicted it might be. Two obligations follow, named here, NOT
    > implemented in this commit: `fake.ts`'s refusal should accept
    > unconditionally (moving any scripted refusal to an explicit synthetic
    > hook, `injectNak`'s pattern); `driver.ts`'s `sendPrepare` comment must
    > drop its "hardware showed the PM refuses…" clause. Both are scoped to
    > ROADMAP's Phase 7A-fix-3.
16. **STATUS: OPEN — added by Phase 7A-fix-2 Task 7; one of the "index
    shapes the merge row does not convert" (design spec §5).** Whether
    `toActualIndex`'s minus-1 rule (and 0x0033's own rest-keyed
    `toProgramIndex`) hold at a boundary that is neither a program's first
    nor its last — every hardware reading on record ([S1]'s CLEAN RUN 2,
    [S2]'s D1-D4, and the session-3 row's own steps 2/4 below) comes from a
    program with exactly ONE interior boundary (a 2-interval program has
    only a work0→work1 transition to observe). `app/scripts/pm5-lab.ts`'s
    `SHORT_PROGRAM` (3×500 m DISTANCE, rest 60 s — already wired as the
    `program-short` command, §17 item 6's own vehicle) is the smallest
    program with a genuinely interior boundary: work0→work1 (the first
    boundary, same shape already observed) and work1→work2 (the SECOND
    boundary — the first one this driver will ever have seen with a THIRD
    interval still to come after it). Expected: unknown — forward
    attribution and the minus-1 offset are stated as boundary-local rules
    with no dependency on position within the program, so both boundaries
    should read the same way relative to their own machine index, but
    nothing has tested that a program's second boundary behaves like its
    first rather than accumulating an error. Observed: **session 3's step
    5 now covers this** — `program-many` (25×100m, no rest) rowed through
    2-3 boundaries makes boundary 2 a genuinely interior one (22 intervals
    still to come); read 0x0037/38's Split/Interval Number at each crossed
    boundary — does the second normalize to 1 the same clean way the first
    normalizes to 0, or does something drift? (`program-short`, 3×500m,
    remains the dedicated fallback if step 5 is cut short.)
    > **CORRECTION (2026-08-06, laptop session 3, §18): STATUS: NOT
    > converted; fallback stands.** Step 5's `program-many` armed
    > structurally EMPTY (§19.13) — it produced no boundary of any kind,
    > converted or not, because it landed on a running workout instead of a
    > clean one. `program-short`'s work0→work1 boundary (the dedicated
    > fallback) WAS rowed and captured (item 17's own conversion, below),
    > but interval 2 (the program's actual middle boundary, work1→work2) was
    > never rowed — this item's own question, a program's SECOND boundary
    > behaving like its first, remains open and still needs its own
    > dedicated hardware action.
17. **STATUS: OPEN — added by Phase 7A-fix-2 Task 7; the other unconverted
    shape (design spec §5).** A DISTANCE-kind interval's ACTUAL. What
    0x0037/38 report when a DISTANCE interval actually completes has never
    been tested — every actual-index reading on record (§19.1's table; the
    session-3 row's own steps 2/4) is from a TIME interval. Expected:
    unknown — `toActualIndex`'s minus-1 rule is written as
    index-shape-agnostic (it reads the machine's reported Split/Interval
    Number, never the interval's own `kind`), so a DISTANCE interval's
    actual should normalize the same way a TIME interval's does, but this
    has never been observed. Observed: **session 3's step 5 now covers
    this** — its rowed 100m reps complete real DISTANCE intervals; read
    each crossed boundary's `intervalComplete` `index` (0, 1, ... via
    minus-1) alongside its averages, confirming they are DISTANCE-shaped
    (~100m, `value` in metres) and not silently coerced toward a TIME
    reading anywhere in the pipeline. (`program-short`'s 500m first
    interval remains the dedicated fallback.)
    > **CORRECTION (2026-08-06, laptop session 3, §18): STATUS: ANSWERED /
    > converted.** Step 5's own `program-many` rowing could not answer this
    > (it armed structurally empty, §19.13), but the dedicated fallback did:
    > `program-short` (3×500m r60) rowed to its first boundary, and the
    > state transitioned to a REAL `resting` (not the empty program's stuck
    > `rowing`). `intervalComplete` reported `index=0 (machine reported 1)`;
    > raw `0x0037`/`0x0038` were captured (`distanceMeters: 500`,
    > `avgSpm: 26`, `avgHeartRateBpm: 107`). A DISTANCE interval's actual
    > normalizes via the same minus-1 rule as a TIME interval's — CONFIRMED,
    > not merely expected.
18. **STATUS: OPEN — added by Phase 7A-fix-2 Task 7; the third unconverted
    shape (design spec §5).** A single-interval program has no INTERIOR
    boundary at all — only `WorkoutEnd` — so whatever forward-attribution/
    minus-1 machinery fires (if anything fires) at that transition has never
    been checked: every prior single-interval hardware run (the original
    `TEST_PROGRAM`; item 8's trailing-rest confirmation) recorded that
    `workoutComplete` fires correctly, but never recorded WHETHER an
    `intervalComplete` accompanies it, or with what raw index, when there is
    no "next" interval for a machine that attributes forward to attribute
    into. Expected: unknown — `toActualIndex`'s clamp only returns a value
    for raw machine indices in the explainable range `[0, L+1]` (`L` = the
    program's length, design spec §5); with `L === 1` that range is
    `[0, 2]`, narrower than every previously-tested `L === 2` case, so a
    single-interval program is the smallest input this rule has ever had to
    handle. Observed: `program` (the existing single-interval
    `TEST_PROGRAM`), row to `WorkoutEnd`, `dump`, and read whether an
    `intervalComplete` fires at all, and if so, its raw machine index
    alongside the normalized `index` the driver reports.
19. **STATUS: OPEN — added by Phase 7A-fix-2 Task 7; the fourth unconverted
    shape (design spec §5).** A mid-interval terminate's reported boundary
    number. [CSAFE-DEF] footnote 12 p.25 documents that the Split/Interval
    Number "will change depending on where you are in the interval when the
    workout is terminated," and design spec §5 scopes the minus-1 rule to
    apply only "WHEN a run this driver opened is active and the machine
    state is `rowing`/`resting`" — a terminated workout's state is neither,
    so today's code should emit `index: null` with a `"divergence"` log
    entry rather than a normalized number, but no hardware row has ever sent
    a terminate PARTWAY THROUGH an interval (as opposed to between
    intervals, or after `WorkoutEnd`) to confirm it. Expected: `index: null`
    plus a `"divergence"` log entry — the state guard should exclude
    `terminated` regardless of what raw index the machine reports. Observed:
    `program-two-time`, row partway into the FIRST interval (short of its
    60 s duration, short of any boundary), then `terminate` mid-stroke;
    `dump` and read whatever boundary event fires — does `index` come
    through `null` with `divergence` logged (matching the design), and
    separately, for the historical record, what RAW Split/Interval Number
    did the machine report at that mid-interval terminate (recorded even
    though the driver discards it, since footnote 12 predicts it may be a
    value this document has not yet catalogued)?

### The merge-gate row (session 3, RUN 2026-08-06 — results in §18)

**Update (Task 7 close-out, phase-7a-fix-2, 2026-08-06): this is the design
spec's own §8 merge-gate row** — the ONE short hardware row (~8 min,
James-operated) the spec's Decisions table requires before PR #52 leaves
draft ("Merge gate: One hardware row with the corrected parse … before PR
#52 leaves draft"). Sessions 1 and 2 (§18; §19's re-derivation table) both
ran against the OLD, whole-byte-comparison parse — every finding from them
is a RE-DERIVATION from raw bytes, not a fresh observation under the fix.
This row is the first time anything gets sent to real hardware running
Tasks 2-6's corrected code. Prepared here exactly like §17's earlier
"pending verification row"; its results destination is §18's own
session-3 heading below.

**Update (laptop session 3, 2026-08-06): the row has RUN.** All five steps
PASSED as designed (§18) and item 15 was answered alongside it. The row's
own live bisect then surfaced a NEW defect outside this row's own scope —
programming over a RUNNING workout arms structurally empty (§19.13) — which
does not fail any step below (none of the five programs a running workout)
but is scoped to its own follow-up, Phase 7A-fix-3 (ROADMAP). The port-check
paragraph immediately below turned out to matter in practice: the session
opened against a stale origin (repeated `ProgramRejectionError`s, the
pre-fix symptom) until the page was reloaded onto the corrected port —
recorded in §18's own setup note, evidenced by a Web-Bluetooth device
identifier change tied to page origin, not merely asserted.

**Port check, before anything else.** This repo runs multiple worktrees'
dev servers concurrently — Vite silently moves to 5174/5175/… whenever
5173 is already held by another worktree, per `pm5-bridge.mjs`'s own header
comment (a pinned port assumption already burned this project once). After
`pnpm dev` starts, confirm which port it actually bound, and before trusting
the lab page for anything, view its SERVED `driver.ts` (devtools → Sources,
or `view-source:http://localhost:<port>/src/monitor/driver.ts`) and confirm
it contains `errorTypeTicks` — a stale dev server (a different worktree's,
or a browser tab left open from before this branch's HEAD) would silently
run an OLDER build and manufacture exactly the false rejections this whole
phase exists to eliminate, at the one moment nobody would think to doubt
the page.

**Setup:** identical to §17's top-level "Setup" section above (wake the
PM5, `pnpm dev` from `app/`, Chrome, the port check just above, then the lab
page) plus `node scripts/pm5-bridge.mjs` in a second terminal — this row
reuses the same bridge and the same `REMOTE` map as "The pending
verification row," no new harness code. **New for this session: pair
James's Apple Watch to the PM5 as its heart-rate monitor before connecting
the lab page.** This is the PM5's OWN pairing (the monitor's own HR-source
menu), not anything this codebase drives or mediates — this project does
not send `CSAFE_PM_GET_HRM` and has no belt/watch pairing flow of its own
(§19.9's "one thing we are not doing"). Every prior session ran with NO
heart-rate source paired; this is the first chance to observe the
NON-sentinel (present) case rather than the `0`-with-no-belt sentinel
§19.9 already covers.

**The row.** James clicks **Scan & connect** (the one action needing a real
user gesture); the controller drives everything else via
`curl -X POST http://127.0.0.1:5178/command -d <command>`, waiting for the
command's `out()` line in the page / `pm5-session.log` before sending the
next one; James rows when a step says to. Verbatim from design spec §8:

1. Controller: `curl -X POST http://127.0.0.1:5178/command -d program-two-time`
   (`TWO_TIME_PROGRAM`: two 60 s TIME intervals, rest 30 s). **Expected:**
   the first CLEAN end-to-end accept under the corrected parse —
   `frameStatus "ok"`, `verifyArmed` resolves, no rejection anywhere in the
   trace (contrast every prior session, where the OLD parse logged a
   spurious `program-rejection` on sends shaped exactly like this one).
2. James rows both intervals (short) to completion, through the 30 s rest
   between them. **Expected:** actuals carrying OUR indices 0 and 1 (not the
   old mixed-boundary shape D4 produced), `workoutComplete` firing exactly
   once. This converts "a first boundary WITH rest" from unobserved to
   observed (design spec §5) — every prior hardware reading of forward
   attribution at a RESTING boundary was under the OLD parse. **Heart rate
   (OWNER ADDITION, watch paired per Setup above):** live `frame` events
   while rowing should carry `heartRateBpm` NON-NULL and plausible — not
   `0`, not `255` (both map to `null` by design, §19.9; a `null` reading
   WITH the watch paired is itself a finding worth recording the raw
   bytes for, not an expected outcome to wave past); the two
   `intervalComplete` actuals should carry real `avgHeartRateBpm` numbers,
   not the `null`/`0` sentinel this project has only ever observed with no
   HR source paired.
3. WITHOUT reconnecting, controller:
   `curl -X POST http://127.0.0.1:5178/command -d program-no-rest`
   (`TWO_TIME_NO_REST_PROGRAM`) — a DIFFERENT program (`restSeconds: 0` vs
   the loaded one's `30`), so acceptance-over-loaded is distinguishable
   from "was already the same." **Expected, precisely:** James reads the
   monitor and sees the NO-REST workout, not the two-time one still sitting
   there — the distinguishing tell on the PM5's own screen is what appears
   BETWEEN the two work intervals. The loaded (two-time) program shows a
   `0:30` rest countdown between them; the newly-sent (no-rest) program
   shows NO rest screen at all — the display goes straight from the end of
   interval 1 into interval 2 with nothing intervening. Seeing the `0:30`
   rest countdown at all, at this point in the sequence, is the
   disagreement to record — it would mean the earlier program is still
   loaded despite the accept.
4. James rows through the no-rest program's first boundary (work0→work1;
   the second interval need not be completed). **Expected:** a NEW run
   opens (design spec §4's fix, proven on hardware, not just CI — the
   driver must accept `program()` again with no reconnect after the FIRST
   program's `workoutComplete`), and the boundary's actual re-confirms
   minus-1 within this newly-opened run at a no-rest boundary (§17 item 13,
   originally answered under the old parse in session 2 — this is the
   first confirmation under the corrected one). **Heart rate (OWNER
   ADDITION):** the same live-frame expectation as Step 2 — `heartRateBpm`
   NON-NULL and plausible while rowing. What is genuinely new here: this is
   a NO-REST work→work boundary, and 0x0038's work/rest HR-average fields
   are per-field sentinel territory (§19.9's own caveat that the sentinel
   citations are per-field, not a blanket rule) — capture what the
   REST-average field reads on a boundary with no rest period at all. A
   sentinel there is plausible (there was no rest to average over) and
   would be consistent with the existing both-map-to-`null` handling; a
   real number would be new information either way. Record the raw
   0x0038 bytes for this boundary, not just the decoded value.
5. Controller: `curl -X POST http://127.0.0.1:5178/command -d program-many`
   (`MANY_PROGRAM`: 25 DISTANCE intervals of **100m each, no rest** — the
   Table 19 minimum, chosen because the armed screen does NOT show a full
   interval readout, so the count can only be read by rowing into the
   program; at 100m a boundary arrives every ~25s of easy rowing). **James
   rows through 2-3 boundaries** (~1-1.5 min), watching the monitor's
   interval counter, then stops; controller sends `terminate` and `dump`.
   **Expected:** the send acks clean (multi-FRAME programming has NEVER
   completed on real hardware before the corrected parse — the old code
   aborted at frame 0 — and DISTANCE-kind intervals have never been
   observed accepted; one send settles both); the monitor's interval
   counter advances through the reps and reads against a total of 25 (not
   a stale tail from an earlier frame group, not a truncation); the
   driver's frames show `intervalIndex` advancing 0 → 1 → 2; each crossed
   boundary emits an actual with OUR index (0, 1, ...) carrying real
   ~100m distance data. Rowing here also converts two never-observed
   actual shapes in one go — a DISTANCE interval's actual (item 17) and a
   MIDDLE boundary of a big program (item 16) — and the work→work
   boundaries double as DISTANCE-kind evidence for the state-free minus-1
   rule (§19.8 observed it for TIME only).

A disagreement with any Expected reading above is a FINDING TO RECORD, not
a failure to explain away or a reason to re-run until it looks right — the
same discipline "The pending verification row" states for session 2.

**Certification honesty (design spec §8's own closing line).** Step 2's
rowing verifies single-frame TIME programming end-to-end — acceptance,
boundary accounting, and completion: the full run lifecycle. Step 3 verifies
ACCEPTANCE and MONITOR DISPLAY ONLY for no-rest TIME (not rowed to
completion). Step 5's partial row verifies multi-frame DISTANCE acceptance
plus its EARLY boundaries and actuals (items 16/17 convert on the crossed
boundaries) — but NOT the shape's completion: 22+ intervals go unrowed, so
`workoutComplete` timing and the final boundary for multi-frame DISTANCE
stay uncertified. Items 16-19 above record which of their readings this
row now covers and what still needs a dedicated row. **Heart rate (OWNER ADDITION):** Steps 2 and 4
verify live HR and the actuals' averages over exactly ONE device pairing —
James's Apple Watch, linked to the PM5 as its HR source. That certifies the
non-sentinel (present) reading path end to end for this one link; it does
NOT certify a chest belt, and it does NOT exercise `CSAFE_PM_GET_HRM` or
belt-presence detection (§19.9's "one thing we are not doing") — both
remain future, untouched by this row.

**PR #52 leaves draft only after this row's five steps are run, §18 records
Expected-vs-Observed for each, AND James gives explicit approval** — running
the row is necessary, not sufficient.

> **Update (2026-08-06): the row has RUN and §18 records Expected-vs-Observed
> for all five steps (all PASSED) plus item 15 (ANSWERED).** James's
> explicit approval is a separate act from this row having run or from this
> documentation being written — **the merge decision remains James's**, not
> automatic on either. The row's own live bisect surfaced a defect outside
> this row's scope (§19.13); it is scoped to Phase 7A-fix-3 (ROADMAP), not
> treated here as a reason to re-run the merge-gate row itself.

### The pending verification row (prepared, NOT yet run)

Task 5 close-out (phase-7a-fix) prepared this exact sequence so the next
hardware session can verify Tasks 2-4's fixes (clear→send→verify, the
index normalization, the boundary-halves fix, the HR sentinel) cleanly,
without inventing a new harness action — every command below already
exists in `app/scripts/pm5-lab.ts`'s `REMOTE` map. **This is a JAMES +
controller row, per the plan's own Notes section: James operates the erg
and the one action that needs a real user gesture (Connect); the
controller drives everything else through the bridge.** The Observed
column is deliberately blank — nobody has run this yet, and no result
below should be read as anything but a template until it is.

**Setup**, in addition to the "Setup" steps above: from `app/`, run
`node scripts/pm5-bridge.mjs` in a second terminal (defaults to port 5178,
logs to `./pm5-session.log`); the lab page polls it automatically once
loaded (no extra step on James's side beyond having the page open).

**Sequence** (the controller enqueues each command with
`curl -s localhost:5178/command -d <command>` and waits for the
corresponding `out()` line in `pm5-session.log`/the page before sending
the next one; James rows when a command says to):

1. James: reload `http://localhost:5173/scripts/pm5-lab.html`, click
   **Scan & connect**, pick the PM5.
2. Controller: `curl -s localhost:5178/command -d terminate` — clears
   whatever state the monitor is in (a `0x81` here is expected/fine —
   **CORRECTION (2026-08-06, §19.1):** not "per D1", and not a rejection at
   all: `0x81` is an ACCEPT with the frame-count toggle high. The point is
   starting from a KNOWN state,
   not a successful clear specifically).
3. Controller: `curl -s localhost:5178/command -d program-two-time` —
   sends `TWO_TIME_PROGRAM` (two 60s/target-120/rest-30 intervals,
   `app/scripts/pm5-lab.ts`'s own constant). **UPDATED for fix-3 Task 4:**
   this resolves only once `verifyArmed` observes `state === "armed"` **AND**
   0x0031 reads back interval 0's own structure (`workoutType=8
   durationRaw=6000 durationType=0` for this program — §17 item 12's
   table). **A HANG IS NO LONGER POSSIBLE**: `verifyTicks` now defaults to
   20 unconditionally, so within ~10s at the observed 2 Hz cadence this
   either resolves or rejects with a typed reason. Three outcomes, all
   findings to RECORD:
   - resolves → a genuine, structurally-confirmed arm;
   - rejects `"structure-mismatch"` → the machine armed something other
     than what was sent; the rejection detail carries observed-vs-expected
     for all three fields;
   - rejects `"not-observed"` → it never reached WaitToBegin at all.

   **EXPECT one `"structure-mismatch"` log entry on a HEALTHY arm whose
   first armed tick lagged — that is an OBSERVATION, not a failure.** The
   entry fires once per verify phase at first sighting and reads `first
   sighting — …`; the verdict channel is separate (`program-rejection` is
   written only on an actual rejection, so grep that for outcomes). This
   entry is the instrument that confirms or retires the plan's asserted
   "2 of 5 arms lagged" figure — **record whether it appears on each clean
   arm, and what it observed.** Relatedly, expect a BURST of Task 1
   `"structure"` entries around any bad arm: that log dedups on change, and
   a payload changing every tick does not dedup (now bounded by the same
   20-tick default).
4. James: row both intervals to completion (through the rest between
   them, to `WorkoutEnd`).
5. Controller: `curl -s localhost:5178/command -d dump` — prints
   `exportLog()`'s full trace for the record.

**Expected, checked against the dump — a disagreement with any of these
is a FINDING TO RECORD, not a failure to explain away or a reason to
re-run until it looks right:**

- **Programming verified from machine state, not the bare ack.** The
  `"programmed"` log line (the ack) and the eventual `program()` resolution
  should be visibly separate events in the trace (Task 2's clear→send→
  verify), not the same tick — confirms the fix is actually exercised on
  hardware, not just in the fake.
- **Item 12, folded in as a free extra observation (no separate command
  needed):** once armed, do the `"frame"` entries' `workoutType`/
  `workoutDurationRaw`/`workoutDurationType` fields read back
  `WORKOUTTYPE_VARIABLE_INTERVAL` (`0x08`) and the first interval's
  programmed 60s? If yes, `verifyArmed` has a real structural check to
  upgrade to; if no, the state-only check stays the honest option (§17
  item 12 above). **CORRECTION (2026-08-06, fix-3 Task 1): this method
  never worked and could never have worked.** `toMonitorFrame`
  (`domain/monitor/pm5/parse.ts`) never carried `workoutType`/
  `workoutDurationRaw`/`workoutDurationType` into `MonitorFrame`, so no
  `"frame"` log entry has ever contained them, in any session past or
  future — the field never existed at that call site to read back. The
  driver now records a dedicated `"structure"` log entry instead
  (`src/monitor/driver.ts`'s `GENERAL_STATUS_UUID` handler, on a change in
  any of the three decoded fields only — 0x0031 notifies ~2/second and a
  per-tick entry would flood the ring the same way the old per-tick
  `"frame"` entry did): `workoutType=<n> durationRaw=<n> durationType=<n>
  raw=<19-byte hex>`. Read item 12 back from `"structure"` entries, never
  `"frame"` ones. **DONE — SESSION 4a (2026-08-07) read it back exactly
  this way and item 12 is ANSWERED; this bullet is kept as the method
  record, not as an outstanding ask.**
- **TWO `intervalComplete` events, carrying OUR indices 0 and 1** — not
  the one mixed-boundary event D4 produced before the fix. This is the
  direct hardware retest of plan Task 1's diagnosis and Task 4's fix
  (`boundaryHalves`, waiting for both 0x0037 and 0x0038 of the SAME
  boundary before emitting).
- **HR reads `null`, not `0`.** With no belt paired, `avgHeartRateBpm`
  should now come through as `null` on both events (parse.ts's D5 fix
  mapping both `0` and `255` to `null`) — the previously-observed raw `0`
  should not reach an event.
- **No un-finishing.** The state word should reach `finished` once, with
  `workoutComplete` firing once, and never cycle back through
  `armed`/`rowing` afterward (Appendix E's auto-rearm must stay invisible
  to consumers) — already confirmed once (§18 #8's session); this row
  re-confirms it survives Tasks 2-4's changes.

Item 13 (the no-rest boundary) is a SECOND, DISTINCT row — not an extra
folded into the sequence above, because `TWO_TIME_PROGRAM` has rest on both
intervals and cannot answer it. The harness now carries
`program-no-rest` (`TWO_TIME_NO_REST_PROGRAM`) so it can be run in the same
sitting without editing code at the erg: after the row above finishes,
`terminate`, `program-no-rest`, row through the work0→work1 boundary only
(the second interval need not be completed — the boundary is the whole
question), then `dump`. Read the Split/Interval Number on 0x0037 at that
boundary per item 13. Two 60s intervals means this costs about two minutes.

Items already resolved with no laptop dependency (not on this list on
purpose): `intervalIndex`/`spm` nullability is a business rule, not a wire
question (§15 #4); the write-side `CSAFE_PM_WORKOUTINTERVALCOUNT` index is
CONFIRMED 0-based by a worked example (§12), unlike the read-side fields in
item 3 above; coalescing is resolved and proven in CI (§16), not a laptop
question at all.

### The Task 8 connected-flow verification row (prepared, NOT yet run)

Phase 7B Task 8 built the real Connect → interstitial → surface walk (the
`ConnectedInterstitial`/`ConnectedSurface` screens, `useMonitorSession.ts`)
against `fake.ts` and CI's own browser gates exclusively — every
observation below is a documented-behavior or reviewed-code inference, same
disclaimer §17's own opening paragraph carries for the rest of this
runsheet. Two items this task's own code explicitly ships BEHIND that
uncertainty, named in the source rather than pretended away.

**Setup (both items — the PRODUCT APP; §17's shared Setup above, which
points at `pm5-lab.html`, does NOT apply to this row — the lab can never
render the connected surface).** Desktop Chromium only:
`navigator.bluetooth` is undefined on the Capacitor build, so
`resolveDefaultTransport()` returns `null` there. (1) Node 26 first —
`export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` (the machine
defaults to 25) — then `pnpm dev` from `app/` — the repo root has no
`dev` script — and open the printed URL in Chromium (a plain dev serve
talks to the REAL PM5: the fake engages only when a test fixture has
planted `window.__pm5FakeScript__`, never on its own); (2) sign in; (3) Library → open the workout DETAIL of a real
multi-interval workout (two or more TIMED work intervals with rest); (4)
the button is **Connect** — one word (`ConnectAction.tsx`), not "Connect
PM5"; if a confirm panel has replaced it (a prior unlogged or live
session), resolve the confirm FIRST — timing starts only at a clean
Connect press. **Run item 21 FIRST**: it needs the session's cold first
pairing; item 20 then reuses the established pair. Instruments: item 20's
tick counts come from the Connection log sheet on the connected surface
(COPY LOG once, paste into §18); the log is sequence-ordered and
deliberately clockless (DEVIATIONS' diagnostics-sheet row), so item 21's
DURATIONS come from a phone stopwatch or a screen recording of the
interstitial checklist, never from the log.

20. **STATUS: ANSWERED — 2026-08-08, hardware walks 1-2 (§18's
    2026-08-08 entry). The four-field premise was WRONG and the
    derivation is corrected in code.** Walk 1 (recording `test-20.mp4`):
    a stopped rower on a properly armed TIMED interval freezes only
    THREE fields — meters (pinned at 30), split (4:16.1), rate (68) —
    while the interval clock RUNS (LEFT IN INTERVAL counted 4:38 → 3:47)
    and the heart rate moves the whole hold (85 → 63, the exclusion
    theory confirmed). With `elapsedSeconds` in the freeze key the key
    never repeats on real hardware, so PAUSED could never fire; session
    3's frozen-elapsed stretch was an artifact of its structurally EMPTY
    arm (§19.13), exactly the caveat this item existed to test. The key
    is now `distanceMeters`/`currentSplit`/`spm` with a
    `distanceMeters > 0` guard replacing elapsed as the no-rest-boundary
    clearer, and walk 2 (`pause-worked.mp4`) CONFIRMED the corrected
    derivation firing on a real program. Still unread (any later
    full-log capture closes them): the exact tick count from the last
    stroke to the flip (the recordings sample at 1 fps), and a
    distance-interval stop (only WATCHED on a timed one; the clock runs
    on distance intervals too, so the same behavior is expected).
    The original sequence, kept executable for that re-run. Sequence
    (pair already established by item 21; the Setup workout is the
    program — `TWO_TIME_PROGRAM` is a lab constant and does not exist
    here): (1) from the workout detail press Connect and walk the
    interstitial to READY, then "Show me the numbers"; (2) row the first
    work interval normally; (3) mid-interval, STOP rowing completely —
    hands off the handle, touch nothing on the PM5; (4) read whether the
    surface renders `PAUSED · PULL TO RESUME` (confirming meters, split,
    and rate hold identically — the CLOCK KEEPS RUNNING through a real
    stop, so a moving countdown is expected, not a failure), and roughly
    how many seconds after the last stroke it appears (the derivation
    needs four consecutive identical three-metric frames);
    (5) with the HR belt on, record whether the heart-rate cell keeps
    moving through the hold (the field the derivation deliberately
    excludes, on the theory that it is the one that keeps moving when the
    rower stops — `PAUSED_FRAME_HOLD`'s own doc comment); (6) start rowing
    again — the paused chrome should clear on the first changed frame;
    (7) capture the log: mid-row, triple-tap a pager-rail button and
    COPY LOG; or after the row ends, from the SAME TAB's console,
    `copy(sessionStorage.getItem("ergomatic:last-rowed-log"))` — teardown
    stashes every session's trace on the way out (the rowed-only key
    survives later never-rowed attempts), because the ended frame
    navigates away before the sheet can be reached. Paste into §18 —
    step 4's tick count is read from the entries (`frame` entries carry
    state, elapsed, distance, `rowingActive`, and spm since walk 3). A
    genuine finding either way, not a pass/fail gate.
21. **STATUS: OPEN — `transports/index.ts`'s own `AUTO_TICK_MS`/
    `e2e/connected.spec.ts`'s `delayWritesMs` doc comments, added by Task
    8.** The fake's real-time auto-tick (100ms) and this task's e2e/
    screenshots fixtures' artificial write-latency knob (120-200ms per
    write, `FakeControls.delayWrites`) are both round numbers chosen for
    OBSERVABILITY in a browser-driven test, not measured against a real
    PM5's own pairing/programming latency — no laptop session has ever
    timed how long a real `requestDevice()` → GATT connect → multi-frame
    program send actually takes end to end. Expected: unknown — this task
    shipped these constants explicitly UNMEASURED, choosing "comfortably
    observable" over "hardware-accurate" for a fake nothing downstream
    trusts as a timing oracle. Sequence (run FIRST, on the session's cold
    pair): (1) with the PM5 awake on its main menu, press Connect — a
    CLEAN press, any confirm panel resolved beforehand; (2) the OS device
    picker opens — this IS `requestDevice()`, and time spent choosing is
    the operator's own, not a measured span: measurement starts the moment
    the PM5 is picked; (3) with the stopwatch or a screen recording of the
    interstitial checklist, time three spans — pick to the PAIRING line
    marking done (state 4's real duration), PAIRING-done to PROGRAMMING
    starting, and PROGRAMMING's own duration to READY for the known
    interval count; (4) record whether any of the three is anywhere near
    an order of magnitude off from this task's own 100-200ms range (a
    real PM5 running slower would mean the interstitial
    copy overlapping the actual send, a UX question, not a correctness
    one — nothing in `useMonitorSession.ts`'s own state machine assumes a
    particular latency).
22. **STATUS: OPEN — added by 7C Task 5**
    (`docs/superpowers/specs/2026-08-08-phase-7c-pm5-logging-design.md`
    §3, adversarial m1). `IntervalActual.elapsedSeconds`
    (`session/logDraft.ts`'s `actualSeconds`) maps from 0x0037's
    Split/Interval Time (offset 6-8, §10's table above), and whether
    that field measures the WORK portion of an interval alone or the
    work plus its trailing rest has never been read against a stopwatch
    on real hardware. The documented shape argues for work-only: 0x0037
    carries a SEPARATE Interval Rest Time field (offset 12-13, §10's
    same table), which would be redundant if Split/Interval Time already
    included the rest it names. Stored under that documented meaning
    (`logDraft.ts`'s own comment on `actualSeconds`); no walk's own
    numbers settle the question either way — a decode's internal
    time/distance/pace self-consistency cannot distinguish the two
    conventions, because `avgSplit` is itself PM5-computed FROM the same
    split's time and distance, so it would satisfy the identity
    regardless of which duration the machine used internally (Task 2's
    review, ruling the walk-4 arithmetic circular, not evidence). Expected:
    unknown. Sequence: row one work interval with a programmed rest
    immediately after it, time the work portion by stopwatch independent
    of the app, then compare against the logged `actualSeconds` for that
    interval (§18's runsheet, or the MONITOR LOG copy button's raw
    `0x0037` capture) — if it exceeds the stopwatch reading by roughly
    the rest duration, the field is work-plus-rest. If hardware later
    confirms work-plus-rest, the fix is a re-derivation in
    `buildMonitorLogSteps` (subtract the interval's own `restSeconds`),
    never a storage-shape change (`LogStep.actualSeconds`'s own doc
    comment already carries this contingency).

## 18. Laptop session observations (results destination for §17)

### 2026-08-08 session (PM5 432331249) — HARDWARE WALKS 1-4 (the PR #59 verification row, IN PROGRESS)

The first product-app walks — Connect from a workout detail against the
compose stack's production build, not the lab page. Four walks so far;
every finding below shipped as a fix on `phase-7b-connected` the same
day (commits `86963ff..`). Capture instruments grew mid-session: walk 1
is a 1 fps screen recording (`test-20.mp4`), walk 2 the same
(`pause-worked.mp4`), walk 3 the first wire log (the diagnostics sheet
mid-session, then the sessionStorage stash), walk 4 a wire log read
alongside a recording of the panes' own numbers.

**Walk 1 (`test-20.mp4`, 111 s):**

- The interstitial walk was CLEAN on real hardware: scan dismissed →
  "No monitor was picked" → re-pair → programming with the correct
  structural readback → ready. The 0x81 accept, the prepare's leading
  terminate, and the two-interval arm all behaved.
- **Item 20 ANSWERED** (see the item): the interval clock runs while a
  stopped rower sits still; meters/split/rate freeze; HR moves. PAUSED
  as shipped (four-field key) could never fire; corrected to the
  three-field key + `distance > 0` guard.
- The pace validation refused the workout outright — `2:14.5`-style
  splits, i.e. most baseline-derived targets. M-9's check had copied
  duration's whole-second contract onto a field whose wire unit is
  0.01 s (§12's own worked example). Corrected
  (`representableCentiseconds`); NOTE: a half-second pace value (e.g.
  raw `13450`) has still never been sent to a real PM5 — every workout
  programmed since carried whole-second targets. One row with a `.5`
  target settles it silently.
- READY auto-advanced without a tap (chased through two wrong gate
  fixes; resolved in walk 3).
- RATE read 57-68 at barely-moving stroke work — consistent with the
  PM5's instantaneous per-stroke rate (60 ÷ stroke period) and with the
  rate HOLDING its last value through a stop (walk 1 froze at 68), but
  unverified: no capture carries raw 0x0032 yet. Watch it at normal
  pace; if still absurd, log a raw 0x0032 sample.

**Walk 2 (`pause-worked.mp4`, 41 s):**

- **PAUSED CONFIRMED on a real program** — the corrected derivation
  fired mid-interval and cleared on resume. The operator missed the
  sunken-grey presentation entirely; the band is now ink-inverted
  (DEVIATIONS row).
- READY still skipped: TOTAL LEFT read 1:52 with 0 meters and rate 0 —
  the PM5 RUNS THE WORKOUT CLOCK at "row to begin", killing the
  elapsed-based gate v2.

**Walk 3 (the first wire logs):**

- A mid-session reprogram flipped READY on
  `state=rowing elapsed=0.78 distance=1.2` — real meters banked by a
  flywheel still coasting from the previous piece, on a workout the
  PM5's own glass did not consider started ("the pm5 knew i didnt start
  the interval"). 0x0031 byte 9 (Rowing State, 0=Inactive 1=Active —
  §10's table, parsed since 7A, never consumed) is where the machine
  says so; `MonitorFrame.rowingActive` now carries it and the
  ready→live/record-open gate requires it alongside flywheel evidence.
  **UNOBSERVED PREMISE, the next row's first reading:** that byte has
  never been captured on a first-pull frame — the gate's correctness on
  real hardware rests on it, and `frame` log entries now record it.
- The NEXT stash (17 entries, ending at `armed`) showed NO rowing frame
  ever reached the driver during a skip — the skip was never the hook's
  gate: `ConnectedInterstitial`'s own `READY_DWELL_MS` (handoff §2's
  "Ready dwell 1.2 s") auto-advanced past the ready screen on a
  setTimeout. Removed as an operator ruling (DEVIATIONS row); ready now
  holds until the button or the first pull, and the connected flow runs
  on no wall clock at all.
- The structural readback's healthy lag-tick was WITNESSED mid-session:
  first sighting `durationRaw=0`, one tick later the true
  `durationRaw=100`, then armed — fix-3's detector behaving exactly as
  designed over a real radio.
- The ended hand-off frame navigates away on first render, which killed
  every early attempt to copy the log post-row; teardown now stashes
  `ergomatic:last-monitor-log` (every exit) and
  `ergomatic:last-rowed-log` (record-opening sessions only) into
  sessionStorage.

**Walk 4 (2026-08-08, a 2x100m):**

- **The raw 0x0037/0x0038 pair for INTERVAL 2, verbatim from the
  operator's pasted wire log** (the diagnostics stash, seq 24-25 —
  interval 1's pair arrived before `notify` logging existed that
  session, so only its normalized `interval-complete` line survives):

  ```
  0x0037  eb 0c 00 49 04 00 23 01 00 64 00 00 1e 00 09 00 01 02
  0x0038  eb 0c 00 19 6b 67 af 05 05 00 b3 02 6c 0d 72 00 65 02 00
  ```

  These are the phase's only captured boundary bytes; 7C's builder
  fixture decodes them through `pm5/parse.ts`'s own functions rather
  than trusting any hand transcription.

- **`rowingActive` READ TRUE ON THE FIRST PULL** — the unobserved
  premise walk 3 flagged is now observed. The ready gate promoted on
  the INSTANT path; the five-frame distance fallback never ran. RATE
  read sane too (25, then 24), which reads walk 1's "57-68" as a
  barely-moving-stroke artifact rather than a decode fault.
  **This did NOT settle the byte — see §20 fact 13.** The reading stands
  as a session observation, but walk 2026-08-26 later recorded the
  OPPOSITE on the same machine (`false` on every frame of a whole row).
  Walk 3 was right to call byte 9 an unobserved premise; one true
  reading did not make it dependable.
- **0x0031's Elapsed Time AND Distance ARE PER-INTERVAL, not
  session-cumulative — found and FIXED here.** The frame log carries
  the pair: `state=resting elapsed=37.81 distance=101.8` followed
  immediately by `state=rowing elapsed=0 distance=0.7`, then
  `state=resting elapsed=29.44 distance=101` and
  `state=finished elapsed=33.07 distance=109.7`. Both fields reset
  TOGETHER at each new work interval, and each interval's count spans
  its own work plus its trailing rest. Two consumers had assumed
  session-cumulative and both broke on camera: TOTAL LEFT fell
  1:30 -> 1:11 and then ROSE to 1:38 at interval 2, and the METERS card
  fell 109 -> 50. The fix is a driver-side accumulator (`driver.ts`'s
  `session`) that folds each interval's last pre-reset reading into a
  running offset and emits `MonitorFrame.sessionElapsedSeconds`/
  `sessionDistanceMeters`; TOTAL LEFT, the METERS card and the log
  sheet's `SESSION m:ss` caption all read the accumulated pair now. The
  accumulator is a DISPLAY ESTIMATE: it can only bank the last reading
  it actually SAW, so up to one status tick (~0.5 s / ~1 m) per
  boundary may be undercounted. The RECORD is untouched — per-interval
  actuals come from 0x0037/0x0038. `intervalRemaining` is untouched
  too: walk 4 showed the interval countdown correct as it stood, and it
  reads the raw per-interval pair against 0x0033's own last-split
  reference on purpose. The two INTERVAL-scoped consumers in
  `useMonitorSession.ts` (the paused freeze key's `distanceMeters > 0`
  guard and the ready gate) keep reading the raw pair, and both now say
  in a comment that they depend on the reset.

**Readings still owed by the next row(s):** item 21's three timing
spans; the PAUSED tick count from a full log; RATE at normal pace on a
sustained piece; one `.5` pace target accepted by the machine.

### 2026-08-05 session (PM5 432331249) — LAPTOP SESSION 1

Run against the `pm5-lab` harness + bridge, before the fake modeled any of
this session's findings. Full raw trace: the 7A ledger's own "LAPTOP
SESSION 1" section (`.superpowers/sdd/2026-08-05-phase-7a-monitor-domain/
progress.md`).

#### Defects D1-D5, and the soft crash (design spec's own labels, gathered here for cross-reference)

Everything below is an OBSERVATION from this session (and, for D1's update,
a same-day follow-up row), never Concept2 documentation. The detailed
per-item writeups further down (numbered to match §17) carry the full
evidence; this block exists so the five named defects and the crash
correction are each findable as a single paragraph instead of scattered
across the numbered list.

**D1 — the PM accepts a program only when nothing is loaded; a rejection
WIPES what was loaded.** A failed 2-interval send did not leave the prior
1-minute workout intact — it left the monitor showing an empty `:00`
session. Confirmed twice. **D1 UPDATE** (phase-7a-fix Task 1's own hardware
row, same date): `terminate()` is NOT a reliable clear — it was ACCEPTED
once with a completed workout loaded, yet the program sent right after was
still REJECTED, twice. The accept/reject state model is still not
understood; the real clear command, if one exists, remains UNFOUND (full
detail: item 6 below).

> **CORRECTION (2026-08-06, §19.1/§19.2) — D1 IS WITHDRAWN; IT WAS OUR
> BUG.** Every "rejection" above was an ACCEPTANCE. `response.ts:72`
> compares the whole status byte against `0x01`, but the status byte is a
> BITFIELD: bit 7 (`0x80`) is a frame-count toggle that alternates on
> alternate frames, bits 4-5 (`0x30`) are the previous-frame status, bits
> 0-3 are the slave state. `0x81` is toggle-high / previous-frame-OK /
> Ready — an accept ([CSAFE-DEF] Table 9; `csafe.h:747-766`). Decomposed
> that way, not one status byte in either hardware session carries
> `(status & 0x30) === 0x10`: **there were no rejections at all.** The rule
> "the PM accepts a program only when nothing is loaded" was invented
> specifically to explain an alternation that was the toggle bit, and the
> "a rejection WIPES it" half no longer has a rejection to hang on. What
> actually emptied the monitor's display after that 2-interval send is now
> UNRESOLVED — programming over a live/loaded workout is the prime suspect,
> and 7B's "prove the monitor idle before programming" requirement stands
> on its own merits. Read §19.2 before citing any part of D1.

**D2 — an ack of `0x01` does not mean a program landed on the machine.**
Same command, same screen, three outcomes observed in the same session: a
LIVE Just Row session → ack `0x01`, nothing programmed (a silent no-op); a
live Just Row session → ack `0x81` reject, also nothing programmed;
idle/armed → ack `0x01`, and the workout was genuinely on the monitor
(James confirmed by reading the display). The pre-fix driver resolved
`program()` on the ack alone, so a no-op and a real success were
indistinguishable to any caller. Fixed by plan Task 2: `program()` now
clears, sends, then VERIFIES against the machine's own reported state
(`state === "armed"`) before resolving — an ack is necessary but was never
sufficient, and no longer is treated as such.

> **CORRECTION (2026-08-06, §19.1/§19.2) — D2's EVIDENCE WAS OUR BUG.** The
> "ack `0x81` reject" outcome above never happened: `0x81` is an accept
> (see D1's correction). The middle of the three outcomes is therefore not
> a third outcome at all, and the alternation this session recorded — "the
> SAME single-interval frame receiving both `0x01` accept and `0x81` reject
> on different sends, and the whole session alternating
> accept/reject/accept/reject/accept/reject/accept" — is fully explained by
> [CSAFE-DEF] Table 9's "Frame Toggle — `0x80` — Toggles between 0 and 1 on
> alternate frames". Identical command bytes legitimately produce status
> bytes differing in bit 7. **This was recorded here, in the design spec,
> and in ROADMAP.md as machine behaviour, and it was not.** What survives:
> the observation that an ack alone did not prove a workout was on the
> monitor during a live Just Row session (a real, separately-witnessed
> silent no-op), and the clear→send→VERIFY design, which stays — an ack now
> means what CSAFE says it means, but a `SetScreenState` ack still only
> means "queued" (§19.6), so verifying against the machine's own reported
> state remains the only sound way to know a program took.

**D3 — the PM attributes rests FORWARD, into the interval they're heading
toward; this codec's program indices are 0-based per WORK interval.** Full
detail and the confirmed table: item 3 below.

> **CORRECTION/EXTENSION (2026-08-06, §19.8) — D3 STANDS, but its SCOPE was
> wrong.** Forward attribution is real and is the one item on this list with
> no documentary corroboration anywhere (REAL PM5 BEHAVIOUR, UNDOCUMENTED).
> What was wrong is treating it as a RESTING-side rule: laptop session 2 ran
> the no-rest work→work boundary (`TWO_TIME_NO_REST_PROGRAM`) and 0x0037
> reported **1** while 0x0033 reported **0**, with the state word `"rowing"`
> throughout. Forward attribution applies at work→work boundaries too, so
> `intervalIndex.ts`'s rest-keyed rule is WRONG there. This answers §17 item
> 13.

**D4 — only ONE `intervalComplete` fired for a two-interval program.** The
first boundary produced no actual at all; the one actual this session did
produce carried mixed-boundary data. Full detail, the diagnosis, and the
fix: item 3 below (the "Follow-up hardware session" paragraph).

**D5 — the no-HR sentinel is `0`, not `255`.** With no belt paired,
`avgHeartRateBpm: 0` came through. Full detail and the fix: the "New defect
confirmed this session" paragraph near the end of this section.

> **CORRECTION (2026-08-06, §19.9) — the OBSERVATION and the FIX both
> stand; the REASONING did not.** The sentinels are documented per-field:
> live/average HR is "255=invalid" ([CSAFE-DEF] p.21, 0x0032) and Recovery
> HR is "zero = not valid data" ([CSAFE-DEF] p.24, 0x0039). So the claim
> below that "a per-field split would claim a distinction no source states"
> is false — a source does state it. Mapping BOTH `0` and `255` to `null`
> on every field is still the right defensive choice, and is corroborated
> behaviourally by `ergarcade/pm5-base`'s shipped
> `(n === 0 || n === 255) ? 'N/A'`. Only the justification changes.

**The soft crash — corrected record.** During this session, the PM5
soft-crashed once while programming attempts were being sent against a
running Just Row session; James pressed BACK on the monitor to recover,
which cleared the loaded session. **This is NOT a firmware hang and NOT
something recovered by a battery pull.** The session's own raw trace
initially described it more severely ("CRASHED (firmware hang, recovered
by battery pull)"); James corrected this in the same session ("the crash
was SOFT — he pressed Back and the session cleared; no power cycle, no
hang"), and this document should have always carried the corrected version
as ITS record rather than the initial overstatement — it did not until
this fix, since §18 previously omitted the crash entirely. Real
consequence, correctly scoped: a rower's in-progress session can be lost
this way (already the basis for 7B's "prove the monitor idle before
programming" requirement), but it is not a firmware brick and is not
independent evidence of PM5 instability beyond what D1/D2 already
establish about programming over a live session.

1. **Errata (§17 item 1): CONFIRMED.** The PM's OWN ack checksums satisfy
   the XOR rule as this codec computes it (e.g. ack `f1 01 76 08 ... 77
   f2`, hand-verified) — the doc's three printed values are errata, as
   encoded. `parseCsafeResponse` reads real firmware correctly (echoed
   command IDs decode right). The GATT status parse cross-checks too
   (distance/elapsed/pace/spm agree with each other). Write-side interval
   indices are 0-BASED (`18 01 00/01/02/03`), also confirmed.
2. **COUNTDOWNPAUSE → `armed`: not specifically isolated.** The state word
   was tracked transitioning `armed → rowing → resting → rowing → resting →
   finished` across a full 2-interval session with no un-finishing, but no
   entry pinpoints a `COUNTDOWNPAUSE` ordinal specifically — still flagged
   unconfirmed in §14.
3. **Interval numbering base (§17 item 3): ANSWERED, and it's worse than
   "which base."** A CLEAN 2×(1:00 work / 0:30 rest) session showed work0
   → idx 0, rest-after-work0 → idx 1, work1 → idx 1, rest-after-work1 → idx
   2 (a phantom third) — the PM attributes rests FORWARD (into the interval
   they're heading toward), while this codec's program indices are 0-based
   per WORK interval. The two numbering systems are structurally different,
   not merely offset by one. `divergence` never fired because
   `frame.intervalIndex` and `actual.index` agreed with EACH OTHER while
   both differed from ours (D3). **Follow-up hardware session (same date,
   phase-7a-fix Task 1's own diagnosis row):** 0x0038 consistently arrives
   AFTER 0x0037 at each boundary — the ONE `intervalComplete` this session
   produced for a 2-interval program carried MIXED-BOUNDARY data (interval
   2's identity from 0x0037, interval 1's averages from a STALE 0x0038 read
   left over from the prior boundary), confirming the "arrives-discarded"
   prediction over "never-arrives" (D4). Fixed in plan Task 4 by emitting
   per-boundary from a coherent snapshot rather than from whatever merged
   last: `src/monitor/driver.ts` now waits for BOTH halves of the same
   boundary (`boundaryHalves`), in either order, and the fake reproduces
   the observed 0x0037-then-0x0038 arrival order so CI exercises it.
4. **Zero vs omit for a no-target interval (§17 item 4): not tested this
   session** — the harness's `TEST_PROGRAM` used a real target throughout;
   still open.
5. **Multi-frame retention (§17 item 5): PARTIALLY answered.** The
   "multi-frame accumulation is broken" conclusion from an earlier reading
   of this same session was WITHDRAWN once the full byte trace showed the
   SAME single-interval frame getting both `0x01` and `0x81` on different
   sends — bytes were never the variable (see D1 below). A clean
   2-interval program (one CSAFE frame, no multi-frame split needed) WAS
   confirmed to work end-to-end, rowed to completion. The genuinely
   multi-FRAME case (several ack-gated frames for one program, e.g. Sea
   Smoke's 25 intervals / 7 frames) remains UNTESTED from a clean state —
   still open for the next session.
   > **CORRECTION (2026-08-06, §19.1).** The withdrawal above was right for
   > a reason this item could not see: the `0x01`/`0x81` difference on
   > identical bytes is the frame-count TOGGLE, and `0x81` is an accept. So
   > "multi-frame accumulation is broken" was never evidenced — the frame-0
   > `0x81` that produced it was an acceptance. The multi-FRAME question is
   > not merely untested; the only evidence ever offered against it was a
   > misread status byte. Re-derive it from the raw traces before treating
   > any part of it as answered.
6. **No documented wipe/reset for a shorter re-program (§17 item 6):
   ANSWERED, then WEAKENED.** `D1`: the PM accepts a program ONLY when
   nothing is loaded; programming over a loaded workout is REJECTED **and
   WIPES what was loaded** — a failed 2-interval send visibly wiped a
   working 1-minute program, leaving the monitor showing an empty `:00`
   session. This is CONFIRMED destructive behavior, observed twice.
   **`terminate()` when nothing is loaded: REJECTED** (0x81) — the clean-run
   observation, from the same laptop session (`.superpowers/sdd/
   2026-08-05-phase-7a-monitor-domain/progress.md:187`, "CLEAN RUN 2":
   "terminate (rejected — nothing to terminate) → 2 TIME intervals →
   accepted"). Recorded here as its own citable fact, since it was
   previously only in the raw trace and several source comments (`src/
   monitor/driver.ts`, `src/monitor/transports/fake.ts`) cited it to this
   section without it actually being here.
   **D1 UPDATE** (phase-7a-fix Task 1's hardware row, same date): a
   `terminate()` was ACCEPTED with a completed workout loaded, yet the
   FOLLOWING program was still REJECTED — twice. So (a) `terminate()` is
   NOT a reliable clear, and (b) "a rejection wipes it, the next one
   succeeds" does not hold generally. The state model behind accept/reject
   is still not understood; the actual clear command, if one exists,
   remains UNFOUND — the top open question for the next hardware row.
   Plan Task 2's clear→send→verify design survives this: it never assumed
   the clear works, only that VERIFICATION would decide success either way.
   > **CORRECTION (2026-08-06, §19.1/§19.2/§19.5).** Every "REJECTED" in
   > this item was an ACCEPT — `0x81` is toggle-high/prev-OK/Ready, and
   > "terminate (rejected — nothing to terminate)" was an accept too. So
   > neither the D1 rule nor the D1 UPDATE's "terminate is not a reliable
   > clear because the following program was still rejected" is evidenced.
   > The CONCLUSION that terminate does not clear a loaded workout is
   > nevertheless CORRECT and DOCUMENTED, for a different reason: terminate
   > routes to *Rearm* ([CSAFE-DEF] Appendix E), and "Rearm" is Concept2's
   > own word for making the SAME workout ready to run again
   > (`WORKOUTSTATE_REARM` 13, `SCREENVALUEWORKOUT_REARMWORKOUT` 3). No
   > command that clears a loaded workout is documented to exist.
   > `CSAFE_PM_SET_RESET_ALL` (`0xE0`) is NOT a candidate — [CSAFE-DEF]
   > marks it `<Not implemented>`. The two untested candidates are
   > `CSAFE_RESET_CMD` (`0x81` as a COMMAND — unrelated to `0x81` as a
   > status byte) and `SCREENVALUEWORKOUT_GOTOMAINSCREEN` (6). See §19.5.
7. **`intervalRemaining` checkpoint cadence (§17 item 7): CONFIRMED
   correct at the interval index this capture exercised (0/1) — corrected
   by §20 item 17.** 58.92 s remaining observed at 1.08 s into a 60 s
   interval, re-rooted at 60.0 at the next interval's start, matching
   `computeRemainingForFrame`'s then-current 0x0033-"Last Split"-based
   design — a design later found wrong from interval index 2 on and
   deleted (CR2 spec 2a Task 6).
8. **Trailing rest on the final interval (§17 item 8): CONFIRMED
   accepted.** The 2×(work/rest) session's final interval's own rest
   counted down fully before `WorkoutEnd`/`workoutComplete` fired, with no
   early termination.
9. **`currentSplit` idle/armed value (§17 item 9): not specifically
   recorded** this session — still open.
10. **Non-`0x76` fallback (§17 item 10): nothing to report**, as expected
    — no ack of that shape appeared in any trace.
11. **`writeValueWithoutResponse` multi-chunk integrity (§17 item 11): no
    dropped-chunk symptom observed** across any multi-chunk write this
    session (no unexplained `frame-error` or `nak`), though no single write
    this session was large enough to be a decisive stress case.
12. **Structural readback after an accepted program (§17 item 12,
    added post-review): not yet tested.** This item did not exist during
    this session — it was added by the Task 2 fix-round review (F2) after
    noticing 0x0031 already decodes `workoutType`/`workoutDurationRaw`/
    `workoutDurationType` but nothing has confirmed whether those fields
    echo an accepted program's real content. Open for the next session.
    **CLOSED by SESSION 4a (2026-08-07) — they do; §17 item 12 carries the
    readings and `verifyArmed` now gates on them.** **SCOPE LIMIT, widened
    2026-08-09 (the warmup setting):** the readback compares INTERVAL 0
    only, so it cannot tell a fresh arm from a lagging readback of a
    previous program whose interval 0 is byte-identical. That collision
    used to be incidental; for a rower with the warm-up SETTING on it is
    now every session's opening interval, hence systematic. See SESSION
    4b's carried watch-items and `src/monitor/driver.ts`'s `verifyArmed`
    doc comment.

**Also fixed live this session** (retro-tested by plan Task 4, D6): the
discovery filter (0x0030 is not advertised — filtering on it left Chrome's
picker empty forever; device-info service OR namePrefix "PM5" works); the
frame flood evicting the programming trace (fixed: log state CHANGES only,
~2/s was overwhelming the 500-entry ring in under 4 minutes); the GATT
characteristic cache surviving reconnects (`InvalidStateError` on every
post-reconnect write — would have broken the driver's whole reconnect path
on real hardware while passing CI, since the fake had no handle
invalidation); a duplicate `gattserverdisconnected` listener on reconnect;
raw per-characteristic notification logging (what made the item-3 boundary
diagnosis possible at all).

**New defect confirmed this session, not in the original §17 list:** the
no-HR sentinel is `0`, not `255` (D5) — with no belt paired,
`avgHeartRateBpm: 0` came through on 0x0038's work-heartrate field. Since
plan Task 4, `parse.ts` maps BOTH `0` and `255` to `null` on EVERY
heart-rate field it decodes, not only the one byte the session observed
(`HEARTRATE_NO_BELT`; §15 #2's own 0x0039 counter-evidence agreed with this
before the session ever ran, and a per-field split would claim a
distinction no source states — **CORRECTION (2026-08-06, §19.9): a source
DOES state it.** [CSAFE-DEF] documents `255=invalid` for live/average HR
(p.21, 0x0032) and `zero = not valid data` for Recovery HR (p.24, 0x0039);
§15 #2 above says the same thing. The both-map-to-`null` behaviour is still
correct — it is the defensive choice `ergarcade/pm5-base` also ships
(`(n === 0 || n === 255) ? 'N/A'`) — but this parenthetical's stated reason
for it is false). `statusFrames.ts` still ENCODES `null` as
the documented `255` — one encoder cannot write two sentinels for one
state — so the fake passes `HEARTRATE_NO_BELT` explicitly to put the
observed byte on its wire.

**Reconciliation (Task 5 close-out, phase-7a-fix, 2026-08-05): done.**
Folding these confirmations back into §6/§14/§15/§16's own
"unconfirmed"/"flagged" language, and §17's own items, was deferred here
in the earlier fix round as "plan Task 5's own job" — that reconciliation
is this section's own edit history now: §15 item 1's stale "`parse.ts`
passes the raw byte through unadjusted" sentence is corrected (it was true
of `parse.ts` alone and false of the driver-normalized value every
consumer actually reads, since Task 3); §15 items 6/7 carry the D1-update
and multi-frame-still-open language directly; §17's numbered items each
carry an explicit STATUS line reflecting this section's findings; and a
new "Answered by laptop session 1" summary sits near §17's top so the
two-tier answered/open split doesn't require reading this whole section
first. Items 2, 4, 9, and the genuine multi-FRAME half of item 5 (plus
distance-kind intervals, confounded the same way) stay open for the next
session, alongside items 12 and 13 — item 6's real clear command remains
the single top open question. "The pending verification row" in §17 is
this close-out's prepared, not-yet-run sequence for verifying Tasks 2-4's
fixes and picking up item 12 as a free extra observation.

### 2026-08-06 session (PM5 432331249) — LAPTOP SESSION 3

**Results for §17's "The merge-gate row (session 3, RUN 2026-08-06 —
results in §18)," plus a live bisect James drove immediately afterward on
the same connection.** Raw trace: the archived `pm5-session3-final.log`
(5,694 lines, nine `exportLog()` dumps); monitor photo: `IMG_6702.jpeg`
(Step 5's finding). Heart-rate source: James's Apple Watch, paired to the
PM5 as its own HR source per the PM5's own menu (not something this
codebase drives — §19.9's "one thing we are not doing" still holds; this
session only observes the reading, never the pairing).

**Setup note — the port DID move, and the row's own check caught it.** The
session opened against a STALE origin: every `program-two-time`/
`program-no-rest`/bare `terminate` sent before the reconnect noted below
came back `ProgramRejectionError: PM5 rejected frame 0` — the pre-fix
whole-byte-comparison symptom this entire phase exists to eliminate — across
twelve rejected sends and four reconnect cycles
(`pm5-session3-final.log:1-1857`). This is not asserted from the "port
moved" framing alone; it is visible IN the trace: Chrome's Web Bluetooth
device identifier is scoped to page origin, and for the SAME physical PM5
(432331249) it changes from `7UKkpFY5BiYqJRWFRRXkfQ==` to
`YPTJMh6WltwefIHNjXatJQ==` at the exact line the rejections stop
(`pm5-session3-final.log:1858`) — a fresh page navigation to the corrected
port, not a mere BLE reconnect (which reuses the same identifier). Every
result below is read from AFTER that line; the stale-origin preamble
produced no findings of its own and is recorded here only so the "port
moved again" note in this session's own briefing is traceable to evidence,
not just restated.

- **Step 1 — PASSED.** `program-two-time` (`pm5-session3-final.log:1956`):
  FIRST CLEAN ACCEPT in project history. `program(2 TIME intervals,
  discriminator): sending 2 interval(s)…` → ack → `verify: machine acked
  the send — waiting…` → `{"kind":"armed"}` two lines later (a fresh tick,
  no polling delay) → `acked, armed`. Zero `program-rejection`/
  `ProgramRejectionError` entries anywhere from line 1858 onward. JAMES:
  monitor showed the first interval, 1 min.
- **Step 2 — PASSED.** Rowed 2×1:00/0:30 to completion. `intervalComplete`
  index 0 (elapsedSeconds 60, distanceMeters 88, avgSplit 340.9,
  avgSpm 57, avgHeartRateBpm 77) and index 1 (elapsedSeconds 60,
  distanceMeters 82, avgSplit 365.8, avgSpm 13, avgHeartRateBpm 83); ONE
  `workoutComplete`. States traced exactly `armed`(154 frames)→
  `rowing`(117)→`resting`(58)→`rowing`(122)→`resting`(58)→`finished`(1) —
  no un-finishing. Frames kept flowing after `workoutComplete`: **92
  frames** before the next command was dispatched — the run-scoped latch,
  proven on hardware. **avgSpm 57 here, and avgSpm 66 at Step 4, are
  recorded as a machine-reported field oddity, observed twice — NOT
  explained.**
- **Step 2 — heart rate (OWNER ADDITION) — PASSED, with a correction to
  the pre-session compilation.** HR PRESENT end-to-end for the first time
  on real hardware — every frame before the reconnect (line 1858) was
  `heartRateBpm: null`; every one after carries a real reading. The first
  non-null frame in the entire log is **HR 59** (`line 1861`), not 61 as
  pre-compiled — 61 appears two frames later. Live HR during Step 2's
  `rowing`/`resting` states ranged **58–90** (53–90 if the pre-roll `armed`
  idle period is included) — narrower/wider by a few bpm than the
  pre-compiled "61–89," not a different story: never 0, never 255, always
  plausible. The two `intervalComplete` events' `avgHeartRateBpm` (77, 83)
  are both real numbers, confirmed above.
- **Step 3 — PASSED.** `program-no-rest` dispatched at line 2569,
  immediately after Step 2's `workoutComplete` (line 2476) — zero
  `scan()`/`connect()` events between them, confirming NO reconnect. Clean
  accept + `armed` (`program(2 TIME intervals, NO rest, §17 #13): acked,
  armed`). JAMES: monitor moved from the finished screen straight to a new
  1-min first interval, no `0:30` rest screen. First clean
  program-over-loaded observation on a single connection — closes the
  weakened Verdict (b) gap phase-7A-fix-2 flagged — and confirms
  `sendPrepare`'s documented `WorkoutLogged` exit working on hardware.
- **Step 4 — PASSED.** Rowed through the first boundary; JAMES: no rest
  screen at the changeover. `intervalComplete` reported `index=0 (machine
  reported 1)` (elapsedSeconds 60, distanceMeters 74, avgSplit 405.4,
  avgSpm 66, avgHeartRateBpm 94), opening a second run on the one
  connection. The trace's own `divergence` entry reads exactly
  `intervalIndex=0 (0x0033) vs actual.index=1 (0x0037/38)` — the EXPECTED
  forward-attribution disagreement; this log kind fires BY DESIGN at
  no-rest boundaries (§19.8), not a defect. Live HR ranged 56–97 during
  this interval.
- **Step 4 — heart rate (OWNER ADDITION) — PASSED, and answered.** Raw
  `0x0038` at this boundary: `09 00 00 42 5e 00 d6 0f 05 00 3e 01 d1 04 05
  00 58 01 00`. Decoded against §10's own byte table: offset 3 (Avg Stroke
  Rate) = `0x42` = 66, offset 4 (Work Heartrate) = `0x5e` = 94 — both
  cross-check the decoded event exactly, confirming the offset table — and
  offset 5 (**Rest Heartrate**) = `0x00`, the no-data sentinel, exactly as
  predicted ("a sentinel there is plausible — there was no rest to average
  over"). Raw `0x0037` for the same boundary: `09 00 00 00 00 00 58 02 00
  4a 00 00 00 00 00 00 00 01` — offset 9-11 (Split/Interval Distance) =
  `4a` = 74 m, offset 17 (Split/Interval Number) = `01` = 1, both matching
  the decoded event and each other.
- **Step 5 — PASSED. THE FINDING.** `program-many` (25×100m, no rest, 7
  frames) sent at `pm5-session3-final.log:2947`, ~52 s into the
  HALF-FINISHED no-rest workout (elapsedSeconds 51.4–51.9 at dispatch) —
  the trace shows `{"kind":"terminated"}` firing mid-send. All 7
  write-chunk groups acked (seven distinct `ack` entries in the dump): the
  FIRST genuinely multi-frame program completion against real hardware
  ever. `verifyArmed` PASSED (`{"kind":"armed"}` /
  `programmed 25 interval(s)`). JAMES + photo (`IMG_6702.jpeg`): the
  monitor showed **`:00`** — time zeroed, `/500m` split `:00`/`:00.0` both
  zeroed, 0 m, projected 30:00, **HR 67 with the heart icon live** on
  screen (matching the frame trace's HR 62–68 at that moment). Rowed to
  **108.4 m**: `intervalIndex` stayed pinned at `0` and `state` stayed
  `rowing` the entire way — no `resting` transition, no boundary, no
  `intervalComplete` at all. **No interval structure existed, despite
  `verifyArmed` reporting success.** The program that was accepted,
  verified, and displayed correctly was structurally empty.
- **Item 15 — ANSWERED.** A standalone `terminate` (`terminate-sent`, not
  `program()`'s internal `prepare-sent`) dispatched from the empty
  program-many's armed-idle screen (`line 3795`) acked
  `f1 81 76 01 13 e5 f2`, `slaveState=ready`. Decoded: bit 7 (`0x80`) set =
  frame-count toggle; bits 4-5 (`0x30`) = `00` = previous-frame status OK;
  bits 0-3 (`0x0F`) = `01` = slave state READY. **ACCEPTED.** The
  idle-terminate refusal `fake.ts`'s `onClearingFrameComplete` models never
  existed on real hardware — it was the pre-fix misparse this item's own
  text predicted it might be. Consequence, named but NOT implemented in
  this commit: `fake.ts`'s refusal and `driver.ts`'s `sendPrepare`
  "hardware showed the PM refuses…" comment both need revision — ROADMAP's
  Phase 7A-fix-3.
- **Items 16-19:** item 16 (a program's SECOND interior boundary) — NOT
  converted; the fallback (`program-short`'s work1→work2 boundary) was
  never rowed. Item 17 (a DISTANCE interval's actual) — ANSWERED via the
  same fallback (see "Live bisect," Extra row, below); Step 5 itself
  produced no boundary data of any kind, converted or not, because its
  program was empty. Items 18-19 (single-interval boundary-less completion;
  mid-interval terminate's reported number) — untouched this session, still
  their own hardware actions.

#### Live bisect (James-driven; monitor readings only, no rowing except where marked)

THE FINDING (Step 5) left one open question: which variable of
`program-many` (25 intervals × 100 m × no rest, 7 frames) — versus
`program-short` (3 intervals × 500 m × 60 s rest, 1 frame, already proven
good) — caused the empty arm. James drove a bisect on the same connection
immediately after Step 5/item 15, reading the monitor with NO rowing except
at the two rows marked.

| Row | Shape sent | State programmed over | Screen (JAMES) | Trace |
| --- | --- | --- | --- | --- |
| Extra | `program-short` (3×500m r60) | main menu, post item-15 `terminate` | 500 m ✓; **rowed** to the first boundary | armed; state rolled to a REAL `resting` (not stuck `rowing`); `interval-complete index=0 (machine reported 1)`, raw `0x0037`/`0x0038` captured — **§17 item 17 CONVERTED** (a DISTANCE actual, forward-attributed, minus-1 correct); item 16 NOT converted (interval 2 not rowed; fallback stands) |
| Round 1 | `bisect-100m` (3×100m r60 — isolates VALUE) | main menu | 100 m ✓ | armed cleanly |
| Round 1 | `bisect-rest0` (3×500m r0 — isolates REST) | main menu | 500 m ✓ | armed cleanly |
| Round 1 | `bisect-frames` (25×500m r60, 7 frames — isolates COUNT) | main menu | 500 m ✓ | armed cleanly, all frames acked |
| Round 2 | `bisect-count-value` (25×100m r60 — COUNT+VALUE pair) | main menu | 100 m ✓ | armed cleanly |
| Round 2 | `bisect-value-rest` (3×100m r0 — VALUE+REST pair) | main menu | 100 m ✓ | armed cleanly |
| Control | `program-many` (the original triple) re-sent | **ARMED-UNSTARTED** `bisect-value-rest` workout (JAMES correction: not main menu) | 100 m ✓ | armed cleanly; trace confirms `state=armed, elapsedSeconds=0, distanceMeters=0` at the moment of dispatch |
| REPRO | `program-short` (a shape proven good at the Extra row) | **RUNNING** `bisect-count-value` (25×100m), **rowed** to ~24 m (`state=rowing`) | `:00` | `{"kind":"terminated"}` mid-send; an out-of-run/mid-terminate boundary correctly emitted `{"index":null,...,"distanceMeters":24,...}`; all frames acked; `{"kind":"armed"}` / `programmed 3 interval(s)` — **`verifyArmed` PASSED** |

Every single-variable probe (Round 1) and every pair probe (Round 2) armed
correctly from a settled/idle machine — the program's SHAPE, alone or in
pairs, is innocent. The Control row (the original triple re-sent)
confirmed this the hard way: it too armed cleanly once corrected for what
it actually landed on — an armed-but-unstarted workout, not a running one.
The REPRO then sent an entirely DIFFERENT, already-proven-good shape
(`program-short`) over a SECOND running workout and reproduced the
identical empty arm.

**CONFIRMED, 2-for-2 with two unrelated shapes: programming over a RUNNING
workout arms empty. The condition is machine state, not program shape.**
The original bisect hypothesis (find the guilty variable among
count/value/rest) was the wrong axis; the real variable was WHEN the send
happened relative to the machine's own state, not WHAT was sent.
`program-many` (Step 5) and `program-short` (REPRO) both landed on a
machine that was still `rowing` and both armed structurally empty while
every checkpoint this codec currently reads — `frameStatus`, `verifyArmed`
— reported success.

**Both `:00` arms passed `verifyArmed`** (Step 5 and the REPRO) — the
state-only check (`state === "armed"` alone) could not distinguish a real
arm from an empty one. §17 item 12's structural-readback upgrade (reading
`0x0031`'s `workoutType`/`workoutDurationRaw`/`workoutDurationType` back
against what was sent) was **twice-justified by hardware** here, not merely
theorized.

> **RESOLVED (2026-08-07, SESSION 4a → fix-3 Task 4).** Item 12 is
> ANSWERED — the fields do echo an accepted program, in the units this
> codec encodes, and they refresh while merely armed (§17 item 12 carries
> the full table; the raw record is §18's "SESSION 4a" section below).
> `verifyArmed`
> (`src/monitor/driver.ts`) now gates on that readback and rejects
> `"structure-mismatch"`, so the two arms described above would no longer
> report success. 4a additionally captured the empty arm's own steady state
> on the wire — `workoutType=1 durationRaw=0 durationType=128` — which is
> the exact anatomy the new check catches.

**James's explicit approval:** recorded separately from this document —
the merge-gate row having run and this section being written are both
necessary, neither is sufficient. **The merge decision remains James's.**

### 2026-08-07 session (PM5 432331249) — SESSION 4a

Results for design spec §Session-4a (`docs/superpowers/specs/
2026-08-06-phase-7a-fix-3-design.md`) — the reading Stage 1's instrumentation
(fix-3 Tasks 1-3) existed to take. James-operated, ~6 minutes, one short row.
Raw trace: the archived `pm5-session4a-final.log` (line/dump counts not
carried into this ledger's summary — read the archive directly for the raw
`structure`/`prepare-settled`/`ack` entries this section disposes). Filed by
Task 6 from `.superpowers/sdd/2026-08-06-phase-7a-fix-3/progress.md`'s own
`## SESSION 4a` block, which remains the process record; this section is the
durable one. **Outcome: (a), unanimous** — the ternary tripwire (design spec
§1, "Outcome space") did not fire; Stage 2 was built as designed, not
redesigned.

**Item 12, per shape — TRACE-VERIFIED** (read directly off the driver's
`"structure"` log entries; not a monitor-screen reading). Three armed shapes
plus the pre-arm baseline, each read while the machine was merely `armed`,
no rowing:

| Arm | `workoutType` | `workoutDurationRaw` | `workoutDurationType` |
|---|---|---|---|
| TIME, 2×60s r30 (`program-two-time`) | `8` | `6000` (60s × 100) | `0` (Time) |
| DISTANCE, 3×500m r60 (`program-short`) | `8` | `500` (whole metres) | `128` (Distance) |
| REST-0, 2×60s r0 (`program-no-rest`) | `8` | `6000` | `0` (Time) |
| pre-arm baseline (nothing ever armed) | `0` | `0` | `128` |

`workoutType` held at `8` across all three shapes — no normalization to a
rest-less sibling ordinal (`6`/`7`/`9`) anywhere in the sample. The duration
pair mirrors interval 0 in the same units the encoder writes: seconds × 100
at identifier `0`, whole metres at identifier `128`. All three shapes and
the baseline refreshed with the machine merely `armed`; none needed a
stroke.

**The empty arm's own anatomy — TRACE-VERIFIED, cross-confirmed
JAMES-VERBAL.** Settle disabled (`settle-off`, so `prepareSettleTicks: 0`),
`program-short` sent over a running two-time piece, monitor showing `:00`,
driver reporting acked-armed:

- **Steady state:** `workoutType=1 durationRaw=0 durationType=128` — the
  duration-reads-0 hypothesis (a photograph-only inference before this
  session) is CONFIRMED on the wire, and the type degrades from `8` to `1`,
  which is what makes the type field alone sufficient to catch this shape
  (`EMPTY_ARM_STRUCTURE`, `domain/monitor/pm5/statusFrames.ts`).
- **Mid-cycle transients:** before the steady state settled, `structure`
  entries showed `workoutType=1` carrying STALE, NON-ZERO durations — raw
  hex for these is in the archived log, not reproduced here. This is the
  recorded fact that a single mismatched tick is not yet evidence of a
  wrong arm (`STRUCTURE_MISMATCH_TICKS`'s N=3 rule, `src/monitor/
  driver.ts`).

**The settle — TRACE-VERIFIED, twice, JAMES-VERBAL cross-confirmed.** Same
repro, settle ON (the default, 10 ticks): both runs logged
`prepare-settled: "armed" observed on tick 4 of the wait; released one tick
later (that tick's state: "armed")` — the design spec's derived "4-5
ticks" estimate is now a measurement, not an inference, and it lands
inside the estimate's own range. **This also ANSWERS Task 2 review's
carried M1** (the +1 grace tick may itself read `rowing`, not a settled
state): both runs' own +1 tick read `"armed"`, not `rowing` — the grace
tick was itself clean at this repro. Both times James read the
monitor and reported the REAL workout was showing, not `:00` — "surprisingly
the monitor shows a 500m" (JAMES-VERBAL, `program-short`'s shape). Two runs
is the full sample; both agree.

**Prepare ack from a rowing machine — TRACE-VERIFIED.** `f1 89 …`: bit 7
(`0x80`) set = frame-count toggle; bits 4-5 (`0x30`) = `00` = previous-frame
status OK; bits 0-3 (`0x0F`) = `09` = slave state OFFLINE. Consistent with
§19.3 (`0x09` mid-session is the documented reading for an erg being rowed
outside CSAFE master control) — the prepare's own terminate-shaped frame
gets the same "offline" ack any poll would get from a live erg, not a
rejection.

**Lab lesson — OPERATIONAL, JAMES-OBSERVED, not a wire finding.** A page
refresh resets the settle toggle (module state, `scripts/pm5-lab.ts`) — the
robust order is refresh → toggle → connect, never toggle → refresh →
connect. This is what makes the toggle command's own "which state it left
the flag in" echo (§17, "The settle toggle") load-bearing rather than
cosmetic; the session's own empty-arm and settle readings above both depend
on the toggle having actually taken effect before `Scan & connect`.

**Consumed by:** fix-3 Task 4 (`verifyArmed`'s structural predicate,
`STRUCTURE_MISMATCH_TICKS = 3`, `DEFAULT_VERIFY_TICKS = 20`) and Task 5
(`EMPTY_ARM_STRUCTURE`/`PRE_ARM_BASELINE_STRUCTURE`,
`domain/monitor/pm5/statusFrames.ts`) — see those files' own doc comments,
now pointed at this section rather than at the ledger's interim record.

### SESSION 4b (RUN 2026-08-07 — James-operated; PM5 432331249, watch-link
HR; raw capture `docs/monitor/sessions/pm5-session4b-final.log.gz`)

Design spec §Session-4b's two-row detection test. Both rows ran on the
final branch build (c1438ce, port-checked; construction `settle-mode`
lines verified before each row — the toggle-then-connect order §17
documents, after one aborted attempt in 4a taught it). ~4 minutes total.

1. **Settle-ON repro → structured arm, short row confirms the first
   boundary.** Send: with the settle at its default (ON, 10 ticks), row a
   few metres into a piece (any armed program), then `program()` a second
   shape over it while the machine is still `rowing`/`resting` (the §19.13
   repro recipe). Do: row through the resulting program's first boundary.
   Read: the `structure` log entries — do they show the SENT program's real
   `workoutType`/duration, not `EMPTY_ARM_STRUCTURE`'s `1`/`0`/`128`? Does
   the monitor display the real workout, not `:00`? Does `intervalComplete`
   fire at the first boundary with real data?
   **Also observe (Task 2 review's carried M2 — an `armed` reading can
   predate the PM acting on OUR terminate, `waitForPrepareSettle`'s own doc
   comment, Probe F): on this settle-ON row, does the armed tick that
   releases the settle come BEFORE or AFTER any visible reaction to our
   terminate (a `terminated`/`idle` `frame` entry in the dump)? A release
   with no such entry preceding it would be the predating shape landing on
   real hardware.**
   **Observed: PASS, all readings.** Machine `rowing` at 25.8m when
   `program-short` (3×500m) went out over the running two-time piece. The
   settle walked the full cycle — `terminated` (elapsed 13.85) → `idle` →
   `armed` — and `prepare-settled` read `"armed" observed on tick 4 of
   the wait; released one tick later (that tick's state: "armed")` — the
   THIRD hardware measurement of the span, third identical tick-4
   reading. Verification then resolved on `structure` `workoutType=8
   durationRaw=500 durationType=128` (the sent program's interval 0).
   JAMES: monitor showed 500m; a few strokes confirmed it counting down
   (the full-boundary conversion was 4a's; not repeated). **M2/Probe-F
   watch-line: the terminate reaction (`terminated` frame, seq 23) was
   visible BEFORE the releasing armed tick (seq 30) — the predating shape
   did NOT land on this row.** Mid-cycle the structure read the
   transitional `workoutType=1` shapes exactly as 4a recorded.
2. **The detection row — settle OFF, repro again → typed
   `structure-mismatch`, never silent.** Send: `settle-off` (then reconnect,
   per §17's toggle note), same repro recipe. Do: no rowing required beyond
   getting the machine mid-piece before the repro send. Read: does
   `program()` reject with `ProgramRejectionReason: "structure-mismatch"` —
   never a bare resolve, never a silent `:00` accept — with the rejection
   detail carrying the observed-vs-expected triple? This is the step that
   hardware-validates the load-bearing half of Stage 2: CI has proven the
   predicate rejects a scripted empty arm, but no real PM5 has yet been
   caught by it.
   **Observed: PASS — a real PM5 was caught.** Fresh driver constructed
   settle-OFF (construction line verified; the refresh→toggle→connect
   order). Machine still `rowing` in the prior 500m piece;
   `program-two-time` sent over it. The machine empty-armed exactly as
   §19.13 describes — the `structure` stream decayed through the
   transitional shapes to the captured anatomy (`workoutType=1
   durationRaw=0 durationType=128`) — and the driver REJECTED:
   `ProgramRejectionError: PM5 reported "armed" while holding a different
   workout than the one just sent`, after `3 consecutive armed tick(s)
   reporting the same wrong structure`, detail carrying observed
   (`1/0/128`) vs expected (`8/6000/0`). One `structure-mismatch` log
   entry, first-sighting semantics as designed. JAMES: monitor showed
   `:00` — the machine WAS empty-armed; the difference from sessions 1-3
   is that the software now says so, typed and loud. **The load-bearing
   half is hardware-validated in the failure direction.**
3. **Disagreement is a finding**, not a re-run trigger — same discipline as
   every prior row in this document. **Certification honesty:** the
   settle's latency claim (zero added ticks) is settle-scoped — it says
   nothing about the readback; the readback itself may cost ~1 tick where
   the payload lags behind the armed state (review I-1's "2 of 5 clean
   arms" figure, demoted in `driver.ts`'s `STRUCTURE_MISMATCH_TICKS`
   comment to ASSERTED-NOT-LOCATED — Task 4's review is precisely where
   this figure was found to have NO source in this repo, not where it was
   observed; treated here as a plausible cost pending this row's own
   confirmation or retirement, not an accepted one).

**Carried watch-items — observe alongside the two rows above, not as
separate hardware actions:**

- **Healthy-lag entry frequency on clean arms** (retires or confirms review
  I-1's "2 of 5 clean arms" figure, demoted in `driver.ts`'s
  `STRUCTURE_MISMATCH_TICKS` comment to ASSERTED-NOT-LOCATED). On every
  clean arm sent this session (both rows above, plus any additional
  settled-state program), watch for a `"structure-mismatch"` first-sighting
  log entry that does NOT escalate to a rejection — record whether it fires,
  and on how many of the clean arms sent. Read: does a healthy arm still
  resolve successfully after logging one?
- **Structure-entry count across a multi-interval row** (Task 1's own
  carried item, never exercised on a real multi-interval program). Row a
  full multi-interval program to `workoutComplete` and count `structure`
  entries in the dump — does it stay at one per genuine reprogram, or does
  something on real hardware change the fields mid-row the on-change dedup
  would need to catch?
- **Programming from a finished screen — the WaitToBegin-tick question**
  (Task 3 review's FINISHED ruling: the gate is right, no cycle is modelled,
  because Appendix E's `WorkoutLogged → WaitToBegin` exit is documented as
  direct — but never observed). Let a program reach `finished`/
  `workoutComplete`, then `program()` again with no reconnect. Read: does an
  intermediate `WaitToBegin`/`armed` tick appear between the prepare's ack
  and the first programming frame, or does it go straight through as the
  fake (and the driver's gate) currently assume?
- **The mid-auto-cycle dispatch row — unobserved territory** (Task 2
  review's M3: `waitForPrepareSettle`'s gate excludes `terminated`/`idle` at
  DISPATCH time, on the reasoning that a dispatch landing there is already
  past the interesting window — never tested). If the auto-cycle can be
  caught mid-transition (dispatching `program()` right as the machine
  reports `terminated` or `idle`, rather than `rowing`/`resting`), read
  whether the resulting arm comes back real or empty — the settle's own gate
  does not wait in this case today, by design, and no hardware reading
  confirms that is safe.
- **The item-12 false-verify window is now SYSTEMATIC for a warm-up-on
  rower** (added 2026-08-09 by the warmup-setting arc; the L-2 note this
  extends lives in `src/monitor/driver.ts`'s `verifyArmed` doc comment,
  and item 12's own limit is restated above in this section's item-12
  entry). 0x0031 carries one
  duration pair, so only INTERVAL 0 can ever be compared. Until this
  change, two consecutive programs colliding on interval 0 was an accident
  of content (many seeded workouts happened to open with a 300 s `wu`
  step). The `wu` step type is gone; a rower who has the warm-up SETTING
  on now programs the SAME interval 0 at the start of every session,
  whatever the workout, so back-to-back programs in that rower's day
  collide BY CONSTRUCTION. A warm-up-OFF rower is strictly safer than
  before (interval 0 is the workout's own first work interval, which
  varies far more). **Read on the next session:** program two DIFFERENT
  workouts back to back with an identical leading warm-up interval and
  confirm the second `program()` still resolves against its own arm rather
  than a lagging payload from the first — the prepare-settle wait
  (`waitForPrepareSettle`) is what is being tested here, since the
  structural check cannot discriminate two byte-identical interval 0s.

### [pending] Task 8 connected-flow verification (results destination for §17 items 20-21)

**Not yet run — this session's Observed fields are deliberately blank,**
same discipline as every other pending scaffold in this section. Results
land here once a James-operated laptop/device session runs §17's items 20
and 21 against the real interstitial/surface screens (not the fake).

- **Item 20 (PAUSED on a properly-armed workout).** Observed:
  _(blank — not yet run)_. Ticks-to-freeze, if any:
  _(blank)_. Heart rate behavior during the hold:
  _(blank)_.
- **Item 21 (real pairing/programming latency).** Observed
  `requestDevice()`→`connect()` duration: _(blank)_. Observed
  `connect()`→first-programming-write gap: _(blank)_. Observed full
  programming-send duration (record interval count alongside it):
  _(blank)_.

## 19. Idiosyncrasies, and whether they were ours

Two hardware sessions (§18, and session 2 on 2026-08-06) produced a list of
things the PM5 "does". Three research passes then checked that list against
Concept2's own primary sources and against every open-source PM5
implementation that could be found. **Most of the list was not the machine.**
This section is the definitive record: for each idiosyncrasy, what we
observed, what the sources actually say, and a verdict.

**Sources cited in this section** (in addition to §1's two fetched PDFs):

| Ref            | Document                                                                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[CSAFE-DEF]** | Concept2 PM CSAFE Communication Definition, **revision 0.31**, 173 pp (local copy; created 2025-07-17, modified 2026-03-12). §1's table cites revision 0.27 (162 pp) fetched from concept2.nl. Where both were read they agree; Table 9 is p.11 in both. Page numbers below are 0.31's, with 0.27's given where §1 already cites it. |
| **[CID-2010]** | Concept2 PM Communication Interface Definition, "**PRELIMINARY**", revision 0.15, 78 pp, 2010-08-23 — a PM3/PM4-era *host API* reference that ships inside the C2 PM SDK. A different document from [CSAFE-DEF], not an older revision of it.                                                     |
| **[SDK]**      | The C2 PM SDK's `Build/` tree: `csafe.h` (937 lines), `PM3CsafeCP.h`, `PM3DDICP.h`, and `main.cp` (1017 lines) — Concept2's own reference desktop application.                                                                                                                                    |
| **[OSS]**      | A survey of open-source PM5/CSAFE implementations (named per item).                                                                                                                                                                                                                              |
| **[S1]**       | Laptop session 1, 2026-08-05, PM5 432331249 — §18, raw trace in `.superpowers/sdd/2026-08-05-phase-7a-monitor-domain/progress.md`.                                                                                                                                                               |
| **[S2]**       | Laptop session 2, 2026-08-06, same erg and harness — raw trace in that session's own scratchpad log.                                                                                                                                                                                             |
| **[S3]**       | Laptop session 3, 2026-08-06 (the merge-gate row + live bisect), PM5 432331249 — §18, raw trace `pm5-session3-final.log`, photo `IMG_6702.jpeg`.                                                                                                                                                 |

**The verdicts** are drawn from exactly four values:

- `OUR BUG` — the machine was behaving correctly; our code or our reading
  manufactured the effect.
- `REAL PM5 BEHAVIOUR, DOCUMENTED` — the machine does this, and Concept2
  says so somewhere we had not read.
- `REAL PM5 BEHAVIOUR, UNDOCUMENTED` — the machine does this, and no
  source states it; our hardware readings are the only evidence.
- `UNRESOLVED` — not settled by anything currently in hand.

### 19.1 The status byte — **OUR BUG**

**What we observed.** `app/domain/monitor/pm5/response.ts:72` decides
accept-vs-reject with a whole-byte equality test:

```ts
const status: CsafeResponseStatus =
  statusByte === SUCCESS_STATUS_BYTE ? "ok" : "reject";   // SUCCESS_STATUS_BYTE = 0x01
```

with a companion constant `REJECT_STATUS_BYTE = 0x81` (`:34`). Under that
rule, every ack whose status byte was not exactly `0x01` was reported as a
rejection. [S2]'s twelve acks decompose as: five `0x01`, six `0x81`, one
`0x09` — e.g. `f1 81 76 0e 18 01 17 03 04 06 14 18 17 03 04 06 14 13 eb f2`
and `f1 09 76 0e 18 01 17 03 04 06 14 18 17 03 04 06 14 13 63 f2`, both
logged as `program-rejection … ack status=reject`. [S1] recorded the same
pattern, and its own raw-trace correction already noticed the shape without
being able to explain it: *"the SAME single-interval frame receiving both
`0x01` accept and `0x81` reject on different sends, and the whole session
alternating accept/reject/accept/reject/accept/reject/accept."*

**What the sources say.** The status byte is a **bitfield**, not an enum.

[SDK] `csafe.h:747-766`:

```c
#define CSAFE_PREVOK_FLG                    0x00
#define CSAFE_PREVREJECT_FLG                0x10
#define CSAFE_PREVBAD_FLG                   0x20
#define CSAFE_PREVNOTRDY_FLG                0x30
#define CSAFE_PREVFRAMESTATUS_MSK           0x30
#define CSAFE_SLAVESTATE_ERR_FLG            0x00
#define CSAFE_SLAVESTATE_RDY_FLG            0x01
/* … IDLE 0x02, HAVEID 0x03, INUSE 0x05, PAUSE 0x06,
      FINISH 0x07, MANUAL 0x08, OFFLINE 0x09 (0x04 deliberately absent) */
#define CSAFE_FRAMECNT_FLG                  0x80
#define CSAFE_SLAVESTATE_MSK                0x0F
```

[SDK] `PM3CsafeCP.h:131-156` restates the same layout independently and
ships ready-made extractors:

```c
#define SLAVE_STATE_MASK         0x0f
#define PREV_FRAME_STATUS_MASK   0x30
#define FRAME_COUNT_MASK         0X80
#define GET_SLAVE_STATE(val)     (val & SLAVE_STATE_MASK)
#define GET_FRAME_STATUS(val)    ((val & PREV_FRAME_STATUS_MASK) >> 4)
#define GET_FRAME_COUNT(val)     ((val & FRAME_COUNT_MASK) >> 7)

enum SLAVE_STATUSES { STATUS_OK, STATUS_PREV_REJECT, STATUS_PREV_BAD,
                      STATUS_PREV_NOT_READY };
```

[SDK] `main.cp` — **Concept2's own reference application** — decodes one
status byte three separate ways and never once compares the whole byte to
anything (`:629-631`, with the three decoders at `:737`, `:765`, `:822`):

```c
UpdateFrameCount(slaveStatus);   // GET_FRAME_COUNT  -> printed as a number
UpdateSlaveState(slaveStatus);   // GET_SLAVE_STATE  -> "Ready"/"Idle"/…/"Offline"
UpdateFrameStatus(slaveStatus);  // GET_FRAME_STATUS -> "Prev OK"/"Prev Reject"/…
```

The frame count is displayed as an ordinary counter on equal footing with
the other two fields; there is no error path keyed off bit 7 anywhere in the
file.

[CSAFE-DEF] p.11, prose and **Table 9 – Response Status Byte Bit-Mapping**:

> All responses have the same Frame Contents format as shown in Figure 5.
> The status byte is **bit-mapped** in order to indicate frame count, status
> and state machine state within the single byte.

| Description           | Bit Mask | Notes                                                                                                       |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| Frame Toggle          | `0x80`   | Toggles between 0 and 1 on alternate frames                                                                 |
| Previous Frame Status | `0x30`   | `0x00`: Ok / `0x10`: Reject / `0x20`: Bad / `0x30`: Not ready                                               |
| State Machine State   | `0x0F`   | `0x00` Error / `0x01` Ready / `0x02` Idle / `0x03` Have ID / `0x05` In Use / `0x06` Pause / `0x07` Finish / `0x08` Manual / `0x09` Off line |

**The killer evidence.** [CSAFE-DEF]'s worked-example chapter (pp.85-98)
documents the *same successful response* as **"81 or 01"**, and where the
arithmetic allows it prints **both** corresponding checksums. Recomputing
the XOR rule (§2) over the three dual-checksum examples:

| Example                        | Contents after status | status=`01` → | doc  | status=`81` → | doc  |
| ------------------------------ | --------------------- | ------------- | ---- | ------------- | ---- |
| Terminate Workout, p.98        | `76 01 13`            | `0x65`        | `65` | `0xE5`        | `E5` |
| Set Horizontal 2 km, p.85      | `1A 00`               | `0x1B`        | `1B` | `0x9B`        | `9B` |
| JustRow, p.86                  | `76 02 01 13`         | `0x67`        | `67` | `0xE7`        | `E7` |

**All six verify.** Concept2 documents one identical, successful response as
being validly either `0x01` or `0x81` — differing in nothing but bit 7 — and
carries that difference correctly through the checksum. The "81 or 01"
formulation appears in roughly fifteen worked examples, every one of them a
success case. Bit 7 cannot be an error flag. It is exactly what Table 9 says
it is: a toggle. (§6's own R1/R2/R4 rows already computed both alternatives
for this codec's conformance vectors — the arithmetic was in this file the
whole time; only the interpretation was wrong.)

Two caveats, recorded so the record is not tidier than the evidence:

- **[CSAFE-DEF] Table 8 contradicts Table 9** on the same page, listing the
  Status field's value range as `0x00 – 0x7F`, which would exclude `0x81`.
  This is copy-paste contamination from Table 7 one page earlier, where
  `0x00 – 0x7F` is the genuine range for *Long Command*. It is overruled by
  Table 9 (the more specific statement), by `csafe.h`, and by ~15 worked
  examples in the same document that print bit 7 set on real status bytes.
- **Bit 6 (`0x40`) is unassigned.** `0x80 | 0x30 | 0x0F = 0xBF`; no source
  assigns bit 6. Treat it as reserved — do not assume it reads 0, and do not
  fold it into any mask.

**The correct tests are therefore:** accept is `(status & 0x30) === 0x00`;
reject is `(status & 0x30) === 0x10`; `status & 0x0F` is the slave state;
`status & 0x80` is the toggle and must never be tested for failure.

**Verdict: OUR BUG.** Decomposed against Table 9, **every** status byte
seen in [S1] and [S2] carries `(status & 0x30) === 0x00` — previous frame
OK. `0x81` is toggle-high/prev-OK/Ready. `0x09` is toggle-low/prev-OK/Off
line. Every "rejection" in both sessions was an acceptance that our own
parser mislabelled. Several conclusions recorded in §18 as PM5 behaviour
follow from that mislabelling and are corrected below and in place.

> **CORRECTION (2026-08-06, fix-2, §19.1): "Not one genuine rejection was
> ever observed on this hardware" OVERSTATES the evidence.** Twelve status
> bytes were RECORDED as raw hex, all of them via [S2]'s `exportLog()`
> dumps (D1's `0x01`/`0x81`/`0x09`, D2's `0x81`/`0x01`/`0x81`, D3's
> `0x01`/`0x81`/`0x01`/`0x81`, D4's `0x01`/`0x81` — five `0x01`, six
> `0x81`, one `0x09`). All twelve decode `(status & 0x30) === 0x00`, so
> **none of the twelve RECORDED status bytes was a rejection.** [S1]'s
> narrative supplies additional known byte values for at least four more
> sends (transcribed as bare values in prose, not captured frames) — those
> are NOT part of the twelve; counting them separately is deliberate, not
> an omission, since a narrative byte carries no checksum or echoed
> command IDs to cross-check. Beyond both of these, roughly three further
> sends' status bytes are unknown outright — not "not a rejection", simply
> never captured. The honest claim is "none of [S2]'s twelve raw-captured
> status bytes was a rejection; [S1] adds several more known-but-unverified
> values; ~3 sends' bytes were never recorded at all", not a blanket
> statement about every send this hardware ever answered. The full
> per-send inventory, with sources, is the table immediately below.

#### Re-derivation: every send, decoded under the bitfield rule (fix-2 Task 1, 2026-08-06)

Two evidence sources, of very different quality. **[S1] has NO raw trace**:
its ledger records a bare status-byte value in prose for most sends (enough
to decode frame status/slave state/toggle, but not the surrounding frame —
no checksum, no echoed command IDs to cross-check), one send with a
genuinely partial hex (the accepted single-interval command block, not an
ack), and several sends where not even the byte was written down ("3
DISTANCE intervals → rejected" carries no byte at all). **[S2] has four
`exportLog()` dumps** (raw frames, full hex) plus a long stretch of
narrative-only console output between dumps 2 and 3 where **three sends'
bytes were never captured** — the `program-two-time` retries dispatched
before [S2]'s LAST reconnect in that stretch, logged only as
`ProgramRejectionError` text under the OLD (buggy) parse, with no byte
recorded. One of those three is the **only send this project ever made to
a PM parked in `WorkoutLogged`** — it fires immediately after a
`workoutComplete` event, exactly where Appendix E parks a naturally-
finished workout (§19.4).

> **CORRECTION (2026-08-06, fix-2, §19.1) — a correction to this task's own
> first pass, not a silent rewrite.** This subsection originally counted
> FOUR `program-two-time` retries plus one `program-no-rest` retry (five
> sends, "roughly six" with [S1] folded in) as never-captured, and flagged
> the design spec's "three" figure as a discrepancy rather than
> reconciling to it. That was wrong, caught on review:
> `app/src/monitor/eventLog.ts`'s `createEventLog()` has no reset method
> and `app/scripts/pm5-lab.ts` constructs exactly one, at module scope —
> the only way its `seq` counter can restart at `0` (which every dump's
> first entry does) is the whole module re-executing, i.e. a page reload.
> Between Dump 2 and Dump 3 there are TWO reconnect cycles in the raw log.
> The two sends this subsection called "retry #4" and the `program-no-rest`
> retry are the ONLY dispatches after the LAST of those two reconnects —
> and their write-byte signatures (`program-two-time` always encodes
> `restSeconds: 30`; `program-no-rest` always encodes `restSeconds: 0`) and
> their order match Dump 3's own two captured clear+program cycles exactly.
> They are not lost sends; they ARE the "S2 D3" rows below, and are no
> longer listed twice. The genuinely-uncaptured count between Dumps 2 and 3
> is **three**, matching the design spec's original figure — the earlier
> "not silently reconciled to the spec's count" framing had the direction
> of the error backwards. The WorkoutLogged identification is unaffected
> either way (it was, and remains, the third of the three).

**Source key:** RAW = full frame captured via `exportLog()`, byte value
verifiable independently of the driver's own labelling. NARR = a bare
status-byte value written down in prose (session narrative or live console
tail), not a captured frame. NARR-NB = narrative with **no byte at all** —
the old parse's accept/reject label is all that survives, undecodable.
**Dump-label note:** the table below uses `S2 D1`-`S2 D4` for [S2]'s four
`exportLog()` dumps. This is unrelated to the document's long-standing
`D1`-`D5` DEFECT labels used elsewhere (§19.2's heading, §19.8's "§18 #3,
D3") — a bare "D3" in prose below always means the defect, never a dump;
dumps are always written with the `S2` prefix.

| Session | Send | Src | Raw status byte | Frame status (`&0x30`) | Slave state (`&0x0F`) | Toggle (`&0x80`) | What the send was |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | 1 TIME interval, idle/armed | NARR | `0x01` | ok | ready (1) | false | SetProgram accepted; monitor showed "a 1 min workout loaded" |
| S1 | 2 TIME intervals, sent right after #1 (still loaded) | NARR | `0x81` | **ok** (old parse: reject) | ready (1) | true | SetProgram — **accepted**; monitor immediately showed an EMPTY `:00`/`:00` session — see Verdict (a) |
| S1 | 3 DISTANCE intervals (pre-A/B exploration) | NARR-NB | unknown | unknown | unknown | unknown | old parse logged "rejected"; no byte survives to re-derive |
| S1 | 25 DISTANCE intervals (pre-A/B exploration) | NARR-NB | unknown | unknown | unknown | unknown | old parse logged "rejected"; no byte survives to re-derive |
| S1 | (several unlogged sends, same single-interval frame) | NARR-NB | alternating `0x01`/`0x81` (exact sequence not preserved) | ok (both values) | ready (1, both values) | alternates | the "whole session alternating accept/reject/accept/reject" the ledger describes generally — every value in the alternation decodes ok; this is the toggle, not the machine changing its mind (§19.2) |
| S1 | mid-JustRow (user rowing, unprogrammed) | NARR | `0x01` | ok | ready (1) | false | SetProgram accepted at the CSAFE level; **nothing programmed** (James read the monitor) — Verdict (c) |
| S1 | mid-JustRow (same command/screen, different send) | NARR | `0x81` | **ok** (old parse: reject) | ready (1) | true | SetProgram; **nothing programmed** — Verdict (c) |
| S1 | CLEAN RUN 2: terminate, nothing loaded | NARR-NB | unknown | unknown | unknown | unknown | old parse logged "rejected — nothing to terminate"; no byte recorded |
| S1 | CLEAN RUN 2: 2×(1:00 work/0:30 rest) | NARR-NB | unknown (narrative says only "accepted") | unknown | unknown | unknown | landed; rowed to completion; produced the D3 phantom `index: 2` (§19.8) — this is the SAME program shape [S2]'s Dump 1 repeats with full hex, below |
| S2 D1 | terminate (standalone `terminate()`, NOT `program()`'s internal step — this build has none) | RAW | `f1 01 76 01 13 65 f2` → `0x01` | ok | ready (1) | false | logged `"terminate-sent"`, not `"clear-sent"` — the naming difference IS the "no clear step" provenance marker for this build |
| S2 D1 | SetProgram 2×TIME (60s/30s rest), 1st send | RAW | `f1 81 76 0e … eb f2` → `0x81` | **ok** (old parse: `program-rejection`) | ready (1) | true | accepted |
| S2 D1 | SAME SetProgram re-sent while erg already rowing (frame at seq13: `state=rowing elapsed=0.98`) | RAW | `f1 09 76 0e … 63 f2` → `0x09` | **ok** (old parse: `program-rejection`) | **OFFLINE (9)** | false | accepted at the CSAFE level, **no effect** — the erg is being rowed outside master control; raw-byte confirmation of the OFFLINE no-op mechanism cited in Verdict (c) |
| S2 D1 | (build provenance) | — | — | — | — | — | older build than D2-D4: no clear step (above), `interval-complete` logged as bare `"index=2"` with no "(machine reported N)" suffix, `avgHeartRateBpm: 0` reaches the event (not null) — see the provenance note below the table |
| S2 D2 | terminate (`program()`'s internal step), 1st attempt | RAW | `f1 81 76 01 13 e5 f2` → `0x81` | **ok** (old parse: `program-rejection`) | ready (1) | true | accepted; old parse retried it as if rejected |
| S2 D2 | terminate, retry (same command re-sent) | RAW | `f1 01 76 01 13 65 f2` → `0x01` | ok | ready (1) | false | logged `"clear-sent"` |
| S2 D2 | SetProgram 2×TIME (60s/30s rest) | RAW | `f1 81 76 0e … eb f2` → `0x81` | **ok** (old parse: `program-rejection`) | ready (1) | true | accepted |
| S2 gap | `program-two-time` retry #1 (state=armed) | NARR-NB | unknown | unknown | unknown | unknown | old parse: `ProgramRejectionError: PM5 rejected frame 0`; no byte captured (live console tail, not an `exportLog()` dump) |
| S2 gap | `program-two-time` retry #2 (state=armed) | NARR-NB | unknown | unknown | unknown | unknown | same as above |
| S2 gap | *(two `intervalComplete` events, `index: null`, then `workoutComplete` — a JustRow-shape row outside any driver-opened run)* | — | — | — | — | — | out-of-run boundaries, correctly `index: null` |
| S2 gap | `program-two-time` retry #3 — sent IMMEDIATELY after `workoutComplete` | NARR-NB | unknown | unknown | unknown | unknown | **the only send this project ever made to a PM parked in `WorkoutLogged`**; old parse: `ProgramRejectionError`; no byte captured |
| S2 gap | *(two reconnects, no sends — the SECOND is the last reconnect before Dump 3)* | — | — | — | — | — | — |
| S2 D3 | `program-two-time` dispatch (state=armed, post-reconnect) → internal terminate | RAW | `f1 01 76 01 13 65 f2` → `0x01` | ok | ready (1) | false | logged `"clear-sent"`; fresh ring since the last reconnect, accepted first try. **This dispatch's console line read `ProgramRejectionError` (old parse misreading the next ack, below) — it is NOT a separate uncaptured send; its bytes are these two D3 rows** |
| S2 D3 | …→ internal SetProgram 2×TIME, **rest = 30s** (`… 02 00 1e 06 04 …`, matches `program-two-time`'s hardcoded rest=30 payload) | RAW | `f1 81 76 0e … eb f2` → `0x81` | **ok** (old parse: `program-rejection`, hence the console's `ProgramRejectionError`) | ready (1) | true | **accepted**; not rowed — the ring's next entry is `state=terminated` with no intervening rowing/resting frame (this is the same spontaneous termination, not a second, separate one) |
| S2 D3 | `program-no-rest` dispatch → internal terminate, 2nd cycle | RAW | `f1 01 76 01 13 65 f2` → `0x01` | ok | ready (1) | false | logged `"clear-sent"` |
| S2 D3 | …→ internal SetProgram 2×TIME, **rest = 0** (`… 02 00 00 06 04 …`, matches `program-no-rest`'s hardcoded rest=0 payload) | RAW | `f1 81 76 0e … eb f2` → `0x81` | **ok** (old parse: `program-rejection`, hence the console's `ProgramRejectionError`, then `"dispatched: dump"` → Dump 3) | ready (1) | true | **accepted** — **byte-identical ack to the rest-30 send above** (the echo carries command IDs, not parameter values, so this pair CANNOT by itself distinguish "replaced" from "was already the same") |
| S2 gap | **CORRECTION (2026-08-06, fix-2, §19.1):** *(Dump 3 fires (`dispatched: dump`), then `disconnect()`/`connect()` — a RECONNECT, on a fresh module instance)*. This row previously placed the rowing evidence for Verdict (b) HERE, between D3's two sends and D4, describing it as following D3's rest-0 send "without reconnecting." The raw log's state stream for the whole of D3's driver lifetime (both the rest-30 and the rest-0 sends above) is `[['armed', 280], ['terminated', 1]]` — **nobody rowed under D3 at all.** The rowing followed D4's OWN send below, on this reconnected connection. See the corrected row under S2 D4. | — | — | — | — | — | superseded placement — moved to S2 D4, below |
| S2 D4 | terminate | RAW | `f1 01 76 01 13 65 f2` → `0x01` | ok | ready (1) | false | logged `"clear-sent"` |
| S2 D4 | SetProgram 2×TIME, rest = 0 | RAW | `f1 81 76 0e … eb f2` → `0x81` | **ok** (old parse: `program-rejection`) | ready (1) | true | accepted; another terminate+re-program cycle, on the reconnected connection above — **this is the send the rowing evidence below actually follows** |
| S2 D4 | *(no send — the ONLY elapsed-reset-while-rowing in the whole log, and the first no-rest work→work boundary: continuous `state=rowing` from `elapsed=0` through `elapsed≈60` FOLLOWING D4's OWN SetProgram send directly above, an `intervalComplete` at `elapsed:60`, then the very next frame resets `elapsed` to 0 with `state` still `"rowing"` — NO `"resting"` state anywhere in this stretch. This IS the discriminating evidence for Verdict (b) — corrected below — and it is the SAME boundary as the `interval-complete` line to the right, not a second, separate observation; the two were previously double-counted)* | — | — | — | — | — | `interval-complete: "index=null (machine reported 1)"`; `divergence: intervalIndex=0 (0x0033) vs actual.index=1 (0x0037/38)` — answers §17 item 13 (§19.8); **no raw hex for this boundary** — only the decoded log line (§5's no-raw-hex caveat) |

**Dump 1's build provenance, stated plainly:** it predates dumps 2-4 within
the SAME [S2] log (the harness was rebuilt mid-session). Evidence: (1) its
terminate is logged `"terminate-sent"` (the standalone `terminate()` call)
rather than `"clear-sent"` (the label `program()`'s own internal prepare
step uses in every later dump) — this build's `program()` had no internal
clear step, so the harness called `terminate()` and the program write as
two separate dispatched actions; (2) its `interval-complete` reads bare
`"index=2"` with no "(machine reported N)" diagnostic suffix, unlike D4's
`"index=null (machine reported 1)"`; (3) its `intervalComplete` carries
`avgHeartRateBpm: 0` (not `null`), i.e. pre-dates §19.9's both-sentinels
mapping reaching this code path; (4) that same `intervalComplete` (`index:
2`, the D3 phantom third index) is the exact shape `ba180c3` later fixed —
a boundary whose two halves (0x0037/0x0038) were paired without checking
they name the same boundary. **The index byte (`2`) is a wire fact — the
machine really did send that Split/Interval Number on the wire — but
nothing else about that combined event (its averages, its pairing with a
particular 0x0038) is trustworthy evidence post-`ba180c3`,** since the old
pairing logic could have combined halves from different boundaries. This
caveat is carried into §19.8 below.

**Verdict (a) — the `:00` empty display: STANDING OPEN, not explained.**
The table's second [S1] row is the only human reading across this exact
transition: idle/armed, a 1-interval program lands (`0x01`), James reads
"a 1 min workout" on the monitor, a 2-interval program is sent immediately
after (`0x81`), and James reads an EMPTY session, `:00` time and `:00`
split. Under the corrected parse `0x81` is an ACCEPT
(`(0x81 & 0x30) === 0x00`), not the reject the old code reported — so the
old explanation ("a rejection wipes the display") is gone, and nothing in
hand replaces it. What we do NOT have: the full frame for that specific
send (narrative-only, no echoed command IDs to cross-check against what
actually got programmed); a `SetScreenState`/`GetScreenStateStatus` read at
the moment James looked (§19.6 documents the ack as "queued", not "done" —
a candidate TIMING explanation, but nothing here confirms the screen was
still catching up rather than genuinely empty); and no repeat of this exact
transition in [S2] to corroborate or refute it (S2's own program-over-loaded
sequence, Verdict (b) below, shows the SECOND program landing correctly,
not an empty screen). Forcing a conclusion here would outrun the evidence;
this stays UNRESOLVED per the design spec's own instruction, and 7B's
"prove the monitor idle before programming" requirement is independently
justified regardless of how this resolves.

**Verdict (b) — program-over-loaded: WORKS.** The byte-identical repeat
sends (any two `0x81` acks in the table, e.g. [S2] D3's rest-30 and rest-0
programs) cannot be the evidence — the ack echoes command IDs, not
parameter values, so an unchanged program would ack identically to a
replaced one. The discriminating evidence is BEHAVIOURAL, from the table's
[S2] D3→gap→D4 sequence: D3 sent a 2×TIME/rest-30 program (accepted,
`0x81`), then — without reconnecting — a 2×TIME/**rest-0** program over it
(also accepted, byte-identical `0x81`). The row that followed (captured
live, not in an `exportLog()` dump) shows continuous `state=rowing` from
`elapsed=0` through `elapsed≈60`, an `intervalComplete` at the 60s mark,
and the very next frame resetting `elapsed` to 0 while `state` stays
`"rowing"` — **no `"resting"` state anywhere in the transition.** Had the
rest-30 program still been active, a ~30s resting interval would have
intervened. Its absence is direct behavioural proof the rest-0 program
REPLACED the rest-30 one, not merely that the same program was resent. This
confirms the design spec's own anticipated outcome (§3: "if §Re-derivation
additionally shows program-over-loaded works without the [clear/prepare]
step, that is recorded as robustness, not grounds for removal") — it does
not argue for removing the prepare step, and does not touch §5's minus-1
scoping.

> **CORRECTION (2026-08-06, fix-2, §19.1): the paragraph above misdescribes
> the evidence chain — the conclusion survives, but not by this argument.**
> "The row that followed" is misplaced: the raw log's state stream for the
> whole of D3's driver lifetime — from the rest-30 send through the rest-0
> send — is `[['armed', 280], ['terminated', 1]]`. **Nobody rowed while D3's
> connection was live.** After D3's rest-0 send, Dump 3 fires, then the
> harness disconnects and RECONNECTS (a step the paragraph above elides
> entirely, stating "without reconnecting" for a chain that includes one),
> and only THEN, on the fresh connection, does D4 send its own rest-0
> program. The rowing — the one and only elapsed-reset-while-rowing in the
> whole log — follows THAT send, not D3's. The table above is corrected to
> place the row under S2 D4, where the log puts it.
>
> **The conclusion still holds, on a weaker argument than the one originally
> written.** The D3 rest-30 → rest-0 pair supplies only byte-identical acks,
> which — as this Verdict already says — cannot by themselves distinguish
> "replaced" from "was already the same." What actually settles it is
> simpler: whatever program the machine held across the reconnect (rest-30,
> if D3's rest-0 send had no effect; rest-0, if it did) was then subject to
> D4's OWN rest-0 send, and the observed run was rest-free either way. So "a
> program sent over a loaded workout is accepted and replaces it" is still
> supported by this data — just not by an unbroken "without reconnecting"
> chain, and not by two independent observations (the "S2 gap" row and D4's
> boundary row described the SAME boundary; the table previously
> double-counted it as two).
>
> **This is exactly what session 3's Step 3 is for.** §17's merge-gate row
> sends `program-no-rest` over the loaded two-time program on a SINGLE
> connection, WITHOUT reconnecting, and has James read the monitor live —
> the clean, single-connection observation this Verdict has been missing.
> Until that row runs, Verdict (b)'s conclusion rests on the weaker
> reconnect-spanning argument above, not on the stronger single-connection
> one this section originally (and wrongly) claimed to already have.

**Verdict (c) — D2's silent no-op: SURVIVES.** "An ack does not mean a
program landed" is not a casualty of the bitfield fix: `0x01` is an accept
under BOTH the old whole-byte compare and the corrected bitfield parse
(`(0x01 & 0x30) === 0x00`), so [S1]'s mid-JustRow `0x01` send — accepted,
nothing programmed, James confirmed on the monitor — reads the same way
either way. The documented mechanism the design spec cites (slave state
OFFLINE, "user starts workout before equipment is configured", §19.3) has
DIRECT raw-byte confirmation in this table: [S2] Dump 1's second
SetProgram send, re-sent after the frame stream already showed
`state=rowing elapsed=0.98`, acked `0x09` — `(0x09 & 0x30) === 0x00` (ok)
with slave state `9` (OFFLINE). The CSAFE frame validated; the erg was
already being rowed outside master control; nothing programmed. [S1]'s own
mid-JustRow sends do not have a full captured byte to confirm slaveState
directly (only the bare value `0x01`/`0x81`, which decode to slave state
`ready`, not `offline` — the CSAFE communications task and the erg's own
workout-state machine are documented as decoupled, §19.6, so this is not a
contradiction, just a gap this table does not paper over). The GENERAL
claim survives either way: an accepted frame is a statement about frame
validity, not about a workout being loaded, and `verifyArmed` staying in
`program()` is justified on exactly this evidence.

### 19.2 D1 ("accepts only when nothing is loaded") and D2 ("identical bytes, both accept and reject") — **OUR BUG**, both

**What we observed.** §18's D1: *"the PM accepts a program only when
nothing is loaded; a rejection WIPES what was loaded"*, "confirmed twice",
later weakened by a D1 UPDATE in which a `terminate()` was accepted and the
following program was "still REJECTED, twice". §18's D2: *"an ack of `0x01`
does not mean a program landed"* — the same command, same screen, producing
`0x01` and `0x81` on different sends. [S1]'s own trace states the pattern
outright: the same single-interval frame receiving both values, "the whole
session alternating accept/reject/accept/reject/accept/reject/accept".

**What the sources say.** [CSAFE-DEF] p.11 Table 9: "Frame Toggle — `0x80` —
**Toggles between 0 and 1 on alternate frames.**" [CSAFE-DEF] Figure 8
(p.63) shows the toggle in a captured-style ladder diagram — eight
successive response frames `07, 87, 07, 87, 07, 85, 02, 87`, bit 7 running
`0, 1, 0, 1, 0, 1, 0, 1` — every one of them a successful exchange.

**Verdict: OUR BUG, both.**

D2 is now **fully explained and needs no PM5-side mechanism at all**: the
toggle alternates on alternate frames, so identical command bytes
legitimately produce status bytes that differ in bit 7, and a parser that
compares the whole byte to `0x01` will report exactly the alternating
accept/reject/accept/reject sequence [S1] recorded. The alternation was the
toggle. It was never the machine changing its mind.

D1 was built on top of D2: the "accepts only when nothing is loaded"
hypothesis was constructed specifically to explain the alternation ("a
rejection wipes it, so the NEXT attempt succeeds — that is the alternation,
exactly"). With the alternation explained by bit 7, the hypothesis has no
evidence left supporting it. **Both were recorded in this document, in the
design spec, and in the roadmap as machine behaviour, and they were not.**

What survives, and what does not:

> **CORRECTION (2026-08-06, fix-2, §19.2): the "Does NOT survive" line
> wrongly included "an ack of `0x01` does not mean a program landed."**
> That observation is NOT built on a reject-that-was-actually-an-accept —
> `0x01` is an accept under BOTH the old whole-byte compare and the
> corrected bitfield parse. It never depended on the mislabelling this
> section otherwise corrects, so the bitfield fix changes nothing about it.
> It belongs in a "SURVIVES" bullet, not "Does NOT survive". See §19.1's
> re-derivation table, Verdict (c), for the raw-byte-confirmed mechanism
> (slave state OFFLINE) and the corrected list below.

- **Does NOT survive:** "the PM accepts a program only when nothing is
  loaded"; "a rejection wipes what was loaded"; "`terminate()` is not a
  reliable clear because the following program was rejected twice". Each
  rests on at least one reject that was actually an accept.
- **SURVIVES:** "an ack of `0x01` does not mean a program landed."
  [S1]'s mid-JustRow send acked `0x01` — an accept either way — and
  programmed nothing (James read the monitor). The mechanism, per
  §19.3/§19.1's re-derivation (Verdict (c)): mid JustRow the PM can be in
  slave state OFFLINE, "user starts workout before equipment is
  configured" — not under CSAFE master control. An `"ok"` frame status is
  a statement about frame validity, not about a workout being loaded. This
  is why `verifyArmed` stays in `program()`, for the reason now stated
  correctly.
- **Genuinely still open:** James read an empty `:00` session off the
  monitor after a 2-interval send during [S1]. *Something* emptied that
  display. What it was is now **UNRESOLVED** — it can no longer be
  attributed to "a rejection wipes it", because there was no rejection.
  Programming over a live/loaded workout remains the prime suspect, and 7B's
  "prove the monitor idle before programming" requirement stands on its own
  merits regardless. (§19.1's re-derivation, Verdict (a), lays out what was
  and was not checked before leaving this open.)
- **Also still true:** verifying a program against the machine's own
  reported state rather than against the ack is good engineering and stays.
  Its stated justification changes — an ack now means what CSAFE says it
  means, but a `SetScreenState` ack still only means "queued" (§19.6), and
  `program()` has no other way to know a configuration took.

### 19.3 Slave state `0x09` (OFFLINE) on a live erg — **REAL PM5 BEHAVIOUR, DOCUMENTED**

**What we observed.** [S2], one ack out of twelve:
`f1 09 76 0e 18 01 17 03 04 06 14 18 17 03 04 06 14 13 63 f2` — status
`0x09`, arriving from a connected, responsive, actively-rowing erg
immediately after a `frame` showing `state=rowing elapsed=0.98`. §16 had
already met `0x09` on paper (R3, the Get Force Curve vector) and shrugged at
it: "a genuinely different response shape … falls into `"reject"` by this
binary reduction".

**What the sources say.** `0x09` is not a whole-byte code at all; it is
toggle-low, prev-frame-OK, slave state `0x09` = "Off line" — a **healthy,
accepted frame**. And "Off line" does not mean disconnected.

[CSAFE-DEF] Figure 7, p.49, "Public CSAFE State Machine Diagram": the
`Offline` box has exactly **one** entry arrow, from `Ready`, labelled

> "User starts workout before equipment is configured"

with attached notes "1. Return to Ready state when workout is
completed/aborted and user selects MenuBack. 2. No timeout condition
implemented". OFFLINE is the state a PM enters when the rower starts rowing
at the monitor before a CSAFE master has programmed it. The erg is alive,
rowing, logging, and answering polls; it is "offline" only in the sense that
the CSAFE state machine is not the thing driving the session.

[CSAFE-DEF] pp.98-99, "Get Force Curve" — the spec's own multi-poll example
against an **actively rowing** erg — shows status `09` on **every frame**:

```
Command Frame                          Response Frame
F1  Standard frame start flag          F1  Standard frame start flag
1A  PM-specific wrapper                09  Status
01  Wrapper command byte count         1A  PM-specific wrapper
BF  CSAFE_PM_GET_STROKESTATE           03  Wrapper command byte count
A4  Checksum                           BF  CSAFE_PM_GET_STROKESTATE
F2  Standard frame stop flag           01  Command byte count
                                       04  StrokeState: Recovery
                                       AA  Checksum
                                       F2  Standard frame stop flag
```

`09^1A^03^BF^01^04 = 0xAA` — the checksum verifies, and the payload is real
force-curve data. [CID-2010] p.12 Table 4 enumerates the same state list,
and [SDK] `main.cp:793` maps `STATE_OFFLINE` to the display string
"Offline".

**Verdict: REAL PM5 BEHAVIOUR, DOCUMENTED.** `0x09` mid-session is the
expected reading for an erg being rowed outside CSAFE master control, which
is precisely what our harness does. It was our parser, not the machine, that
turned a healthy frame into a rejection.

### 19.4 The driver going deaf after a terminal state — **OUR BUG**

**What we observed.** [S2], three times: after
`[event] {"kind":"workoutComplete"}` fires, **zero** further `frame` events
are emitted — not a slowed stream, not stale repeats, nothing. The final
`workoutComplete` at the log's last line is followed by no events at all.
And after an explicit `disconnect()` + re-`scan()` + `connect()`, frames
resume **instantly** (`capabilities: {…}` then an unbroken run of
`state=armed` frames on the very next lines). We had been reading this as
the monitor going quiet at the end of a workout and needing a reconnect.

**What the sources say.** The monitor never stops responding.

[CSAFE-DEF] **Appendix E**, "PM State Transitions" (p.173 in rev 0.31; the
p.162 this file's §14 already cites in rev 0.27):

> For any fixed duration workout or JustRow (no defined end) that is
> terminated prior to reaching its defined end:
> `WaitToBegin->WorkoutRow->Terminate (user or command)->Rearm->WaitToBegin`
>
> For any fixed duration workout (defined end) that reaches its defined end:
> `WaitToBegin->WorkoutRow->WorkoutEnd->WorkoutLogged->[Menu button]->WorkoutRearm->WaitToBegin`
>
> `WaitToBegin->WorkoutRow->WorkoutEnd->WorkoutLogged->[Terminate command]->WaitToBegin`

**The FIRST sequence was missing from this transcription until 2026-08-31,
and its absence cost a spec claim.** It is the only Appendix E sequence that
names JustRow, and the only exit it gives one. Phase JR's spec read our
truncated version, correctly noticed no JustRow attribution here, and
concluded "the link was our own gloss" — filing a PRIMARY fact as
UNVERIFIED for a week. **Consequence worth carrying: a JustRow has no
documented timed exit at all**, which is why the 2026-08-31 capture saw
`WorkoutRow` hold for 896.8 s with the rower away (
`docs/monitor/sessions/walk-2026-08-31-justrow/`) — expected, not anomalous.

**Related, and a standing trap:** `OBJ_WORKOUTSTATE_T` (rev 0.31 pp.102-103)
enumerates 0-13 — WAITTOBEGIN, WORKOUTROW, COUNTDOWNPAUSE, INTERVALREST, …,
WORKOUTEND(10), TERMINATE(11), WORKOUTLOGGED(12), REARM(13) — and has **no
Paused member**. The "6 s inactivity → Paused" transition belongs to the
PUBLIC CSAFE SLAVE state machine (Table 16 p.47), a different layer, and is
**unobservable in 0x0031 byte 8 by construction**. COUNTDOWNPAUSE is a
countdown pause, not an inactivity pause. Any report of the form "we saw no
Paused transition in the frames" is reporting on a field that could never
have shown one.

On natural completion the PM **parks in `WorkoutLogged` and stays there**,
answering CSAFE throughout — CSAFE is strictly poll-response in every state
([CSAFE-DEF] Table 17: no unsolicited status uploads, no unsolicited command
lists, and "Ack Disable" is listed as unsupported, i.e. every command is
answered by at least a status byte). It leaves `WorkoutLogged` on the user
pressing Menu **or** on the master issuing a Terminate command — **that is
the documented client recovery path, and we were not using it.** Note the
asymmetry the spec is careful about: terminate from `WorkoutLogged` goes
straight to `WaitToBegin`, whereas terminate mid-workout routes via `Rearm`
(§19.5). [CSAFE-DEF] Table 17 also warns that the PM deliberately deviates
from stock CSAFE here — there is no Finished-state timeout back to Idle;
"the Ready state is entered instead of the Idle state" — so expect low
nibble `0x01`, not `0x02`, after a workout concludes.

The silence is ours: at the time of [S2], `src/monitor/driver.ts` latched
terminal states (`terminalLatched`, `:233`/`:617-628`) and short-circuited
every subscription callback afterwards, by design ("Appendix E's auto-cycle
never un-finishes a session"). Reconnecting reset the latch, which is
exactly why frames resumed instantly — the radio and the erg were never the
variable.

> **FIXED (2026-08-06, fix-2 Task 4 — spec §4).** The latch is now scoped
> to the RUN, not the driver: `activeRun` is opened by `program()` and only
> by `program()` (a state-driven trigger would let the Terminate → Rearm →
> WaitToBegin cycle above fabricate runs), and a terminal state closes that
> run while every subscription stays live. Frames keep flowing after
> `workoutComplete`, `program()` works again with no reconnect, and a
> boundary arriving outside an open run is emitted with `index: null` plus
> a `boundary-out-of-run` log rather than being filed against the finished
> workout. The protection [S1] confirmed (no un-finishing, no un-completing)
> is unchanged — `workoutComplete` still fires exactly once per run.

**Verdict: OUR BUG.** The latch itself is a legitimate design choice and
[S1] confirmed it does its job (no un-finishing). What was wrong was the
*conclusion drawn from it* — that the PM5 goes quiet after a workout and
needs a reconnect. It does not. [OSS] adds a supporting note from the other
direction: nobody else documents a "PM goes silent at workout end" symptom,
and the spec explicitly promises continued notifications for at least a
minute after the end (the revised recovery-HR summary, §19.9). A driver that
wants to keep working after `workoutComplete` should send terminate and
carry on, not drop the connection.

### 19.5 No command clears a loaded workout — **DOCUMENTED ABSENCE** (relabelled)

**What we observed.** §15 #7 and §17 item 6 flagged the missing wipe/reset
as an open question; `commands.ts` asserts twice that no such command
exists. [S1]/[S2] left it unanswered, and the D1 UPDATE's "terminate is not
a reliable clear" reasoning is now void (§19.2).

**What the sources say.** A search of both PDFs across the command tables,
the proprietary command list, and every enumeration finds **no command
documented as clearing or unloading a programmed workout** — and the spec's
own vocabulary explains why. Terminate routes to *Rearm*:

- [CSAFE-DEF] Appendix E: terminate mid-workout gives
  `…->Terminate (user or command)->Rearm->WaitToBegin`.
- `WORKOUTSTATE_REARM` (13) and `SCREENVALUEWORKOUT_REARMWORKOUT` (3) are
  both first-class, named states (Appendix A).

**"Rearm" is Concept2's own word for making the SAME workout ready to run
again.** The designed post-terminate destination is a re-armed identical
workout, not an empty slot. So "terminate does not clear the loaded workout"
is correct and documented — it just was never evidenced by the reject that
§18 cited for it.

Two corrections to the candidate list this project has been carrying:

- **`CSAFE_PM_SET_RESET_ALL` (`0xE0`) is NOT a candidate.** The SDK audit
  raised it as a promising, in-family short command under the same `0x76`
  wrapper we already use (`csafe.h:548-570`, `CSAFE_SETPMCFG_CMD_SHORT_MIN
  = 0xE0`), and on the header alone that reading is fair. But
  [CSAFE-DEF] marks `CSAFE_PM_SET_RESET_ALL` **`<Not implemented>`**. Do not
  spend a hardware row on it.
- **The two genuinely untested candidates are:** `CSAFE_RESET_CMD`
  (`0x81`, public short command; [CID-2010] p.12 Table 4 describes it as
  "Reset CSAFE state machine and related parameters" — scoped to the CSAFE
  state machine, with neither document saying it discards a programmed
  workout), and `SCREENVALUEWORKOUT_GOTOMAINSCREEN` (**6**, Appendix A —
  navigates the UI, no documented effect on the loaded workout). Note that
  `0x81` as a *command* is unrelated to `0x81` as a *status byte*
  (§19.1) — the value is overloaded across the two directions, and
  conflating them is an easy search error.

The only documented way to change what workout is loaded remains
"program a new one" — accumulate `Set*` commands and commit with
`SetProgram`, which overwrites.

> **CORRECTION (2026-08-06, fix-2, §19.5): the verdict label misapplied
> REAL-DOCUMENTED to what is actually a documented ABSENCE.** What the
> sources positively document is the terminate→Rearm transition (Appendix
> E) and Rearm's own named states — that part is real, documented PM5
> behaviour. "No clear command exists" is a DIFFERENT kind of claim: an
> exhaustive-search negative over both PDFs, with two candidates
> (`CSAFE_RESET_CMD` `0x81`, `SCREENVALUEWORKOUT_GOTOMAINSCREEN` 6)
> genuinely untested on hardware. A search finding nothing is not the same
> evidentiary class as a source stating a behaviour outright; the section
> heading is relabelled to make that distinction visible rather than
> folding both into one verdict tag.
>
> **The WorkoutLogged asymmetry, recorded here as well as in §19.4:**
> terminate does NOT route through Rearm uniformly. Mid-workout, terminate
> gives `…->Terminate->Rearm->WaitToBegin` (Appendix E). But terminate from
> `WorkoutLogged` (a naturally-finished workout, §19.4) goes **straight to
> `WaitToBegin`**, with no Rearm step — the two exits differ in shape, not
> just in name, and `program()`'s leading terminate (§3) has to work
> correctly from either starting state.

**Verdict: the terminate→Rearm transition is REAL PM5 BEHAVIOUR,
DOCUMENTED; "no clear command exists" is a DOCUMENTED ABSENCE** (an
exhaustive negative search, not a positive behavioural citation) with two
untested candidates and one confirmed asymmetry (WorkoutLogged's exit
skips Rearm). Rearm is the reason a clear command was never going to exist:
the designed post-terminate destination is the SAME workout, re-armed.

### 19.6 `SetScreenState`'s ack means "queued", not "done" — **REAL PM5 BEHAVIOUR, DOCUMENTED**

**What we observed.** Nothing directly — this is a hazard the sources
surfaced that our code walks into. `src/monitor/driver.ts`'s terminate step
and `program()`'s clear step both send `buildTerminate()`
(`SET_SCREENSTATE`/TERMINATEWORKOUT, §13) and treat the ack as completion
before proceeding.

**What the sources say.** [CSAFE-DEF] p.65 (verbatim):

> The ScreenType command is unique in that it is initially processed by the
> communication task and 'posted' for processing by the UI task. **The CSAFE
> frame response is sent immediately** by the communications task. Since the
> UI task only runs periodically (e.g., 2 - 5 Hz) there is some delay before
> the full effect of the command is realized. The options are to delay
> sufficiently long for the command to complete (e.g., 1 second or more), or
> to poll for the status of ScreenType commands. Using the
> `CSAFE_PM_GET_SCREENSTATESTATUS`, the status will be set to
> `APGLOBALS_SCREENPENDINGFLG_PENDING` when the command is received …
> `_INPROGRESS` while processing and … `_INACTIVE` when complete.

[CSAFE-DEF] Figure 9 (p.64) adds a related practical caution for
back-to-back workouts: after Set Finished, "Delay several seconds to Allow
logging to complete" before starting the next.

**Verdict: REAL PM5 BEHAVIOUR, DOCUMENTED.** An OK status on a
`SetScreenState` means the command was *received and queued*, not that the
screen changed. **This affects our terminate and clear steps directly**, both
of which treat the ack as completion and immediately send the next thing.
The documented remedy is to poll `CSAFE_PM_GET_SCREENSTATESTATUS` until
`_INACTIVE` (a fixed ≥1 s delay is the spec's own weaker alternative). We do
neither today.

### 19.7 Workout programming is atomic — **REAL PM5 BEHAVIOUR, DOCUMENTED**

**What the sources say.** [CSAFE-DEF] p.50 (verbatim):

> When the SetProgramCmd is issued by the Master to program the previously
> configured workout, all pertinent workout parameters are checked against
> their respective limits. **If any parameter violates its limits, the
> entire workout configuration operation is aborted resulting in a
> "PrevReject" frame status.** The Master must issue a PM-specific
> GetErrorType command to determine the specific error information.

Three consequences. (i) Validation is **deferred to the commit** — the
individual `SetHorizontal`/`SetTWork`/`SetSplitDuration`-family commands are
accumulated first and checked at `SetProgram`. (ii) The commit is
all-or-nothing for workout configuration. (iii) **The reject is not
self-describing**: recovering *why* requires a follow-up `GetErrorType`,
which this codec has never sent. The doc's word "PrevReject" is exactly
`csafe.h`'s `CSAFE_PREVREJECT_FLG` (`0x10`), tying the prose to the bitfield
in §19.1.

**The scope of the atomicity matters.** A CSAFE frame is *not* atomic in
general. [CSAFE-DEF] p.10:

> The virtue of the Data Byte Count field in the long command is to allow
> slave devices to handle unrecognized commands by **merely disregarding the
> command and its data, while continuing to process succeeding commands
> within the same frame.**

So an unrecognized command is skipped and the monitor carries on executing
the rest of the frame — **a frame can be partially applied**, and one status
byte covers a whole multi-command frame ([CSAFE-DEF] p.10: a multi-command
frame yields one response frame with one status). Do not infer from a
non-OK status that nothing in the frame took effect. The all-or-nothing
guarantee is specific to workout configuration at `SetProgram`.

**Verdict: REAL PM5 BEHAVIOUR, DOCUMENTED.** Practical consequence for us:
when a genuine `(status & 0x30) === 0x10` finally does appear, the correct
next move is `GetErrorType`, not a retry and not a guess.

### 19.8 Forward-attributed interval numbering — **REAL PM5 BEHAVIOUR, UNDOCUMENTED**

**What we observed.** [S1], a clean 2×(1:00 work / 0:30 rest) session: work0
→ idx 0, rest-after-work0 → idx 1, work1 → idx 1, rest-after-work1 → **idx
2** — a phantom third index on a two-interval workout (§18 #3, D3). The PM
attributes a rest **forward**, into the interval it is heading toward, while
this codec's program indices are 0-based per WORK interval — two
structurally different numbering systems, not an off-by-one. [S2] reproduced
the phantom on the same program shape, with the raw bytes this time:
`{"kind":"intervalComplete","actual":{"index":2,…}}` off 0x0037
`1e 19 00 95 07 00 58 02 00 b9 00 00 1e 00 09 00 00 02`.

[S2] answered the question §17 item 13 was written for: the no-rest
work→work boundary, run with `TWO_TIME_NO_REST_PROGRAM` (two 60 s TIME
intervals, `restSeconds: 0` on both). At the work0→work1 boundary the driver
logged, in order:

```
{"seq":16,"kind":"interval-complete","detail":"index=null (machine reported 1)"}
{"seq":17,"kind":"index-unverified","detail":"actual.index=null (0x0037/38) normalized
  while state=rowing — no rest tick preceded this boundary (restSeconds may be 0 on the
  completed interval), so the machine's work-to-work numbering at this exact boundary
  shape is UNCONFIRMED by hardware (interface-notes.md §17 item 13)"}
{"seq":18,"kind":"divergence","detail":"intervalIndex=0 (0x0033) vs actual.index=1 (0x0037/38)"}
```

**`0x0037` reported 1 while `0x0033` reported 0, at the boundary out of
interval 0.** That is forward attribution, at a boundary with no rest in it
at all.

**What the sources say.** Nothing. Not the spec, not the SDKs, not any
open-source project.

- [CSAFE-DEF] lists `Split/Interval Number` as a payload field on BLE
  characteristics `0x0037` and `0x0038` (pp.23-24) and defines
  `CSAFE_PM_GET_WORKOUTINTERVALCOUNT` on the CSAFE side, but **neither
  document states whether the number reported at a boundary refers to the
  interval just completed or the one being entered.**
- The nearest guidance is about interval *type*, not number — footnote 10
  (p.23): "This value will change depending on where you are in the interval
  (work, rest, etc)"; footnote 12 (p.25), the same for termination. Both
  weakly favour "wherever you currently are", but that is inference.
- [SDK] names the commands and gives no indexing convention.
- [OSS] found nothing: `BoutFitness/Concept2-SDK` (and its forks
  `paschmann/concept2_rower`, `RowBotics/Concept2-SDK`, `hanahanj/SAIL-V3`,
  `morria/PMKit`) carries `intervalNumber` with a byte-offset comment and no
  semantics; `ergarcade/pm5-base` has `intervalCount`/`splitIntervalCount`
  with no note; GitHub code search and the c2forum threads turned up nothing
  on point. **Our two hardware readings are the only evidence that exists.**

The spec does supply one relevant warning, which is about sampling rather
than numbering: the transitional workout states
`WORKOUTSTATE_INTERVALWORKDISTANCETOREST` and
`_INTERVALRESTENDTOWORKTIME` (Appendix A) exist precisely at these
boundaries and Appendix E flags that a client "may not see this state".
**Boundary sampling is documented as racy** — a reason to treat a single
boundary reading as evidence about numbering only when it is corroborated,
which here it is (two boundary shapes, same direction).

**Verdict: REAL PM5 BEHAVIOUR, UNDOCUMENTED.**

**[S2] answers §17 item 13, and the answer invalidates our rule.** The rule
`domain/monitor/pm5/intervalIndex.ts` applies today is rest-keyed: forward
attribution is treated as a *resting-side* phenomenon, and a boundary that
transitions while the state word is still `"rowing"` passes the machine
index through unadjusted. [S2] shows `0x0037` reporting **1** on exactly
that boundary. **Forward attribution applies at work→work boundaries too, so
the rest-keyed rule is WRONG there** — and the `index-unverified` log entry
above, which existed to make the assumption visible rather than silent, did
its job: it fired on the very boundary that disproves the assumption.

> **CORRECTION (2026-08-06, fix-2, §19.8): two caveats added, per the
> fix-2 re-derivation (§19.1).**
>
> **Build provenance on the `index: 2` phantom-third reading.** The raw
> bytes cited above (`{"kind":"intervalComplete","actual":{"index":2,…}}`
> off `0x0037 1e 19 00 95 07 …`) come from [S2]'s Dump 1, which the
> re-derivation identifies as an OLDER BUILD than the rest of [S2] — no
> internal clear/prepare step, `interval-complete` logged without a
> "(machine reported N)" diagnostic, `avgHeartRateBpm: 0` reaching the
> event uncorrected — AND, separately, the exact shape `ba180c3` later
> fixed: a boundary whose two halves (0x0037/0x0038) were paired without
> checking they name the same boundary. **The index byte (`2`) itself is a
> wire fact** — the machine genuinely put that value on the wire, and it is
> what makes this a corroborating SECOND reading of forward attribution
> alongside [S1]'s. But nothing else in that combined event (its averages,
> which particular 0x0038 it was paired with) should be treated as
> independently reliable evidence, since the pairing logic that produced it
> is the one `ba180c3` replaced.
>
> **The pairing-gate and no-raw-hex caveats, for the no-rest boundary
> (`0x0037` reporting `1`, [S2] Dump 4).** Since `ba180c3`, the driver's own
> pairing gate REQUIRES a 0x0037/0x0038 pair to name the same boundary
> before emitting an actual — so "both halves agree" for this reading is
> now ENFORCED by the driver, not independently EVIDENCED by two
> free-standing observations that happened to match. And the boundary's raw
> hex was never captured: only `notify-first` logs a characteristic's first
> raw payload, so this specific boundary's re-derivation cites the decoded
> log line (`"interval-complete","detail":"index=null (machine reported
> 1)"` / the `divergence` entry) rather than a captured frame. Both facts
> are honestly disclosed, not fatal to the finding: the gate enforcing
> agreement is a correctness improvement, not a source of false agreement,
> and the decoded log line is itself driver output over a real BLE
> notification, not a fabrication.

### 19.9 Heart-rate sentinels — **REAL PM5 BEHAVIOUR, DOCUMENTED** (and our handling is right for the wrong stated reason)

**What we observed.** [S1], D5: with no belt paired, `avgHeartRateBpm: 0`
came through on 0x0038's work-heartrate field. §18 recorded this as "the
no-HR sentinel is `0`, not `255`", and `parse.ts` was changed to map **both**
`0` and `255` to `null` on every heart-rate field, with §18's own reasoning
that "a per-field split would claim a distinction no source states".

**What the sources say.** A source does state the distinction — the
sentinels are **per-field**:

- Live/average HR: [CSAFE-DEF] p.21, BLE characteristic `0x0032` (C2 rowing
  additional status 1) — "**Heartrate (bpm, 255=invalid)**".
- Recovery HR: [CSAFE-DEF] p.24, characteristic `0x0039` (end-of-workout
  summary) — "**Recovery Heart Rate, (zero = not valid data.** After 1
  minute of rest/recovery, PM5 sends this data as a revised End Of Workout
  summary data characteristic unless the monitor has been turned off or a
  new workout started)".
- `CSAFE_GETHRCUR_CMD` (`0xB0`) documents only "Byte 0: Beats/Min" with **no
  sentinel stated** for the CSAFE path; `CSAFE_GETHRAVG_CMD` and
  `CSAFE_GETHRMAX_CMD` are `<Not implemented>`.

So §18's premise was wrong ("no source states" the distinction — one does),
while the conclusion it reached happens to be the right defensive choice.
That choice is corroborated behaviourally, not just by analogy:
**`ergarcade/pm5-base`** ([OSS]), a shipped Web Bluetooth PM5 library used
across the sibling `pm5-detail`/`pm5-overlay`/`pm5-dump` projects, formats
heart rate as

```js
(n === 0 || n === 255) ? 'N/A' : n + ' bpm'
```

— a real client defensively treating **both** sentinels as no-data rather
than trusting "255=invalid" alone. c2forum reports of a PM5 showing 0 during
belt acquisition are consistent (anecdotal, weak).

> **CORRECTION (2026-08-06, fix-2, §19.9): the restated justification above
> still leans on the wrong argument.** "The sources distinguish them
> per-field, and defensive clients show both values in the wild" is
> corroborating, not load-bearing — §15 #2 is explicitly double-edged (a
> per-field convention cuts against generalizing 0x0039's `0`-sentinel to
> 0x0032/0x0038 just as much as it supports it), and per-field citations
> alone cannot justify mapping BOTH sentinels on all three fields at once.
> The argument that actually carries the weight is the one already in
> `domain/monitor/pm5/parse.ts`'s own doc comment (`HEARTRATE_NO_BELT`,
> field-independent, not per-field): **no heart-rate field on this machine
> can carry a true `0` or a true `255` — a rower producing zero beats per
> minute is not a rower, and 255 bpm is equally unreachable** — so mapping
> both to `null` can never discard a genuine measurement on ANY of the
> three heart-rate fields this module decodes, independent of which
> sentinel any one document happens to state for that field. The per-field
> citations and the `ergarcade/pm5-base` behavioural evidence remain useful
> corroboration; they are not the reason.

**Verdict: REAL PM5 BEHAVIOUR, DOCUMENTED.** Keep the both-map-to-null
behaviour. Its justification is the FIELD-INDEPENDENT argument above (no
rower has an HR of 0 or 255, on any of the three fields), corroborated —
not established — by the per-field sentinel citations and by
`ergarcade/pm5-base` treating both values as no-data in the wild.
`statusFrames.ts` continuing to ENCODE `null` as the documented `255` also
stays right — one encoder cannot write two sentinels for one state.

**One thing we are not doing.** Belt presence has its own query and is not
inferable from the HR value: `CSAFE_PM_GET_HRM` (`0x84`) returns "Byte 0:
Channel Status — 0 Inactive / 1 Discovery / 2 Paired", plus manufacturer
bytes when paired; `CSAFE_PM_GET_EXTENDED_HRM` (`0xEA`) is the longer form.
This codec uses neither. If a screen ever wants to say "no belt connected"
as distinct from "no reading right now", `0x84` is the correct source.

### 19.10 The open-source tally

[OSS] surveyed every open-source CSAFE/PM5 implementation that could be
found. **Seven mask the status byte correctly** — i.e. extract `0x30`/`0x0F`
(and usually `0x80`) as separate fields rather than comparing the whole
byte:

| Implementation                       | Language   | Evidence                                                                                                    |
| ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `tijmenvangulik/PM3Monitor`          | C/C++      | `concept2/csafe.h` — vendored copy of Concept2's own constants                                              |
| `tijmenvangulik/ErgometerJS`         | TypeScript | live parse path in `performancemonitorBase.ts`: `currentByte & SLAVESTATE_MSK`, `(currentByte & PREVFRAMESTATUS_MSK) >> 4` |
| `raralabs/pm5-emulator`              | Go         | `protocol/csafe/csafe-defs.go` — correct layout baked into a PM5 emulator                                   |
| `gamelaster/node-concept2`           | C header   | `include/PM3CsafeCP.h` — `GET_SLAVE_STATE`/`GET_FRAME_STATUS`/`GET_FRAME_COUNT` macros                      |
| `ff-fab/concept2mqtt`                | Rust       | `packages/csafe-codec/src/response/mod.rs` — explicit `& 0x80` / `(& 0x30) >> 4` / `& 0x0F`                  |
| `seagrayinc/gorow`                   | Go         | `internal/csafe/csafe.go` — three named bit masks in the frame-parse path                                    |
| `OpenRowingCommunity/csafe-fitness`  | Dart       | `CsafeStatus.fromByte` — `(byte & 0x80) >> 7`, `(byte & 0x30) >> 4`, `byte & 0x0F`                          |

**Zero implementations reproduce our exact bug** (comparing the whole status
byte against a fixed value). Nobody else made this particular mistake.

**Two have nearby bugs**, worth recording because they show this table is a
genuine trap rather than an obvious read:

- **`wmmnpr/flutter_ble_c2pm`** (Dart) —
  `lib/src/csafe/csafe_constants.dart:484-493` declares all four
  `PREVIOUS_FRAME_STATUS` enum members with `id = 0x00` instead of
  `0x00/0x10/0x20/0x30`. The mask (`v & 0x30`) is applied correctly, but the
  lookup table behind it is wrong, so `fromInt` only ever resolves `Ok` and
  **throws "Bad state: No element"** for any Reject/Bad/NotReady — a crash
  where we produced a misclassification.
- **`droogmic/Py3Row`** (Python, the most commonly cited Python PM3/4/5
  library) — `pyrow/csafe/csafe_cmd.py` pops the status byte and stores it
  raw; `pyrow/pyrow.py` later masks `& 0xF` for display of the slave state.
  It **never inspects bits 4-5 at all**, so a genuinely rejected command is
  indistinguishable from an accepted one to its callers. A third distinct
  failure mode: not a wrong compare, but silently ignoring the field that
  would report a rejection.

Two independent plain-text transcriptions of Concept2's own spec
(`Aho0526/RowPilot`'s `tmp/csafe_text.txt` and
`gamalamadingdong/erg-link`'s `docs/concept2-pm5-reference/PM5_CSAFE_SPEC.md`)
reproduce Table 9 identically, which rules out an OCR or misreading error on
our side.

### 19.11 What the SDK cannot corroborate

The C2 PM SDK is a **pre-BLE PM3/PM4 artifact** (it targets an M68SZ328 CPU
over USB/serial). It defines the generic CSAFE opcode space, the frame
format, and the status byte authoritatively — which is why §19.1 leans on it
so hard. It has **no BLE content at all**, so it can neither corroborate nor
refute:

- the BLE-proprietary enums this codec relies on —
  `WORKOUTTYPE_VARIABLE_INTERVAL = 0x08`, `INTERVALTYPE_TIME`/`_DIST`,
  `SCREENTYPE_WORKOUT`, `SCREENVALUEWORKOUT_PREPARETOROWWORKOUT`/
  `_TERMINATEWORKOUT`, and `parse.ts`'s full `WORKOUTSTATE_TO_STATE` table
  (0-13);
- the `0x76`-wrapper **ack-echo format** (`<status> <topOpcode> <count>
  <…opcodes>`) that §16 reverse-derived and `response.ts`/`buildAckFrame`
  implement;
- the byte-stuffing code assignment (`0xF0→0x00 … 0xF3→0x03`) —
  `csafe.h:170`'s `CSAFE_FRAME_MAX_STUFF_OFFSET_BYTE = 0x03` is consistent
  with four stuff codes but never names which flag maps to which;
- the XOR checksum algorithm itself — no checksum source exists anywhere in
  the SDK's readable files (it lives in the compiled `.a` libraries), and
  `main.cp:322` has the reference app asking the *user* to type the checksum
  in by hand.

All of those still rest on the BLE doc (rev 1.30) alone, exactly as §1 says.

**Frame size is unsettled, in Concept2's own artifact.** `csafe.h:189` says
`#define CSAFE_FRAME_MAXSIZE 96`, while the *same file's* revision log
(`csafe.h:46-48`) records: *"31 4/24/07 10:00a Mlyon — Increased CSAFE Frame
size maximum from 96 to 120 (to fit in the largest USB report size
supported)."* The 2010 SDK shipped with the header still saying 96 despite
its own changelog. This **does not settle our 120-byte cap either way**
(`framer.ts:13`, cited to §3 / [CSAFE-DEF] p.9): the SDK's constant is
PM3/PM4 USB, ours is PM5 BLE from a newer document. Do not treat
`CSAFE_FRAME_MAXSIZE = 96` as overriding it, and do not treat the changelog
as confirming it.

**Everything the SDK *can* speak to, it confirms.** All eight opcodes
`commands.ts` emits match `csafe.h`'s `CSAFE_PM_LONG_PUSH_CFG_CMDS` enum
byte for byte (`0x01`, `0x03`, `0x04`, `0x06`, `0x13`, `0x14`, `0x17`,
`0x18`), as does the `0x76` wrapper (`CSAFE_SETPMCFG_CMD`, one of four
push/pull wrappers alongside `0x77`/`0x7E`/`0x7F` — §16's characterisation
of that family is exactly right). The frame flags
(`0xF0`/`0xF1`/`0xF2`/`0xF3`), the single-byte checksum length
(`CSAFE_FRAME_CHKSUM_LEN = 1`), and the standard-frame-only design (only
*extended* frames carry the two address bytes) all match.

### 19.12 One more wart, recorded

[CID-2010] p.50's `CSAFE_GETVERSION_CMD` worked example prints a checksum
that does not verify: the response
`0xF0 0x00 0xFD 0x81 0x91 0x07 0x16 0x02 0x03 0xA4 0x01 0x84 0x03 0xA3 0xF2`
states `0xA3`, and XOR over the contents gives **`0x22`** (including the
address bytes gives `0xDF`, also not `0xA3`). The payload itself is
self-consistent and correct — `0x16` = 22 = Manufacturer ID, `0x02` = Class
Identifier 2, `0x03` = Model 3 = PM3, matching [CSAFE-DEF] Table 10 — so
this is a printing typo in a document stamped "PRELIMINARY", not a different
checksum rule. The standard-frame example immediately above it on the same
page (`F1 80 80 F2` / `F1 01 80 01 01 81 F2`) verifies exactly
(`01^80^01^01 = 0x81`). This is **consistent with the three errata this file
already tracks** (§6) — the documents' printed checksums are the least
reliable thing in them, and every one of this project's vectors asserts the
computed value against the rule, never the printed value. Two further
[CSAFE-DEF] examples ("Fixed Time" p.86, "Predefined List #3" p.86) print a
single checksum where the status is given as "81 or 01", so neither
alternative matches — the authors simply forgot to dualise those two cells.

### 19.13 Programming over a running workout arms empty — **REAL PM5 BEHAVIOUR, UNDOCUMENTED**

**What we observed.** [S3] (laptop session 3, 2026-08-06, §18): `program-many`
(25×100m, no rest, 7 frames) sent ~52 s into a HALF-FINISHED `program-no-rest`
workout — the machine still `rowing` — acked all 7 frames, passed
`verifyArmed`, and displayed a workout with NO interval structure: rowed to
108.4 m with `intervalIndex` pinned at 0 and no boundary ever firing. The
monitor's own screen showed `:00` throughout — time, both splits, distance
all zeroed (`IMG_6702.jpeg`). A live bisect immediately afterward (§18,
"Live bisect") isolated the cause: seven single- and pair-shape probes
(100m vs 500m VALUE; rest-0 vs rest-60 REST; 3- vs 25-interval/7-frame
COUNT) sent from a settled `armed`/idle machine all armed CORRECTLY; the
SAME triple shape (`program-many`) also armed cleanly once it landed on an
armed-but-unstarted workout instead of a running one (the "Control" row).
The REPRO row then sent an entirely DIFFERENT, already-proven-good shape
(`program-short`, 3×500m r60) over a SECOND running workout (25×100m,
~24 m in) and reproduced the identical empty arm — `terminated` mid-send,
all frames acked, `verifyArmed` PASSED, monitor `:00`.

**Two shapes, one condition, 2-for-2.** The variable is not the program's
content — it is whether the target machine is mid-piece (`rowing`/
`resting`) versus settled (`armed`, idle, or a finished/logged workout) at
the moment `program()`'s `sendPrepare()` step fires and the frames that
follow are sent.

**What the sources say.** Nothing directly. [CSAFE-DEF]'s Appendix E
auto-cycle diagrams document `WaitToBegin`/Rearm as the recovery path a
terminate-shaped prepare step drives the machine through (§19.5), but
neither source document describes what happens to a NEW program's payload
if it is written while the machine is still executing an OLD one — every
worked example in both documents programs from an idle state. No
open-source PM5 implementation surveyed for §19.10 sends a program
mid-piece either; this is untested territory across every project we could
find, not just this one.

**Verdict: REAL PM5 BEHAVIOUR, UNDOCUMENTED.** The PM5 accepts and
structurally arms an empty workout when programmed over a running one, and
at the time of this session the accept **was** indistinguishable from a real
one at every checkpoint this codec read (`frameStatus`,
`state === "armed"`). This likely
**recontextualizes session 1's Verdict (a)** — the still-STANDING-OPEN
`:00`/`:00` empty-display transition (§19.1; §19.2's correction) — as its
leading explanation: a program sent while the machine was still live, not
a rejection-driven wipe (that mechanism was withdrawn). This is offered as
the closest match on record, not as independent confirmation of the SAME
root cause — **Verdict (a) stays OPEN; this is now its leading candidate
explanation, not its answer.**

> **NO LONGER INDISTINGUISHABLE (2026-08-07, SESSION 4a → fix-3 Task 4).**
> The machine's behaviour above is unchanged and still undocumented — what
> changed is our ability to SEE it. Session 4a captured the empty arm's own
> 0x0031 steady state on the wire (`workoutType=1 durationRaw=0
> durationType=128`, against a healthy arm's `8` plus interval 0's real
> duration — §17 item 12's table), and `verifyArmed`
> (`src/monitor/driver.ts`) now reads those three fields back and rejects
> `"structure-mismatch"`. Both `:00` arms described above would fail
> verification today rather than resolving as successes. This section's
> present-tense claim that no checkpoint can tell the two apart was true
> when written and is retained above in the past tense; the fix-3 remedies
> are the PREVENTION (`waitForPrepareSettle`, Task 2) and the DETECTION
> (the structural readback, Task 4) together.

**Follow-up:** ROADMAP's Phase 7A-fix-3 ("program over a live piece").

## 20. What the official documents do not tell you (Phase 7 field summary)

Phase 7 put real bytes on a real PM5 across six sittings: laptop sessions 1
to 4b (§18, §19) and the 2026-08-08 product-app walks 1-4 (§18). This
section is the five-minute digest of what those sittings taught that a
reader of Concept2's two documents alone would not know, or would believe
wrongly. It DISTILLS and CITES; it never re-litigates. Each entry gives the
claim, the official position (silent, or says otherwise, cited to the page
§§6-16 already carry), and where the evidence lives. Where an entry and the
section it cites differ in emphasis, the section above is the record and
this one is only the index; the claims here are compressed to the point of
losing their caveats.

One standing warning before the list. Most of the "PM5 idiosyncrasies" this
project recorded in its first two sessions turned out to be our own defects
(§19's verdicts), so treat a surprising machine behaviour as a parse bug
until the raw bytes say otherwise.

### The CSAFE control path

**1. The response status byte is a BITFIELD, and `0x81` is an ACCEPT.**
Accept is `(status & 0x30) === 0x00`, reject is `(status & 0x30) === 0x10`,
`status & 0x0F` is the slave state, and bit 7 is a frame-count toggle that
alternates on successive frames and must never be tested for failure. Bit 6
(`0x40`) is unassigned; treat it as reserved.
**Official docs:** they SAY SO, in a place easy to miss, and contradict
themselves on the same page. [CSAFE-DEF] p.11 Table 9 gives the bit map;
Table 8, immediately before it on that page, lists the Status field's range
as `0x00-0x7F`, which would exclude `0x81`. Roughly fifteen worked examples
print one successful response as "81 or 01", three of them with both
checksums, and all six of those checksums verify.
**Evidence:** §19.1 (the derivation, the `csafe.h`/`main.cp` corroboration,
and the per-send re-derivation table), §19.2, §19.10. This was the phase's
founding discovery: under a whole-byte comparison every one of the twelve
raw-captured status bytes from sessions 1 and 2 was mislabelled a rejection,
and three "PM5 behaviours" (D1, D2, and "multi-frame accumulation is
broken") were invented to explain the resulting alternation.

**2. An accepted frame means the FRAME was valid, never that a workout
landed.** Mid Just Row the monitor answers CSAFE while its own workout state
machine runs outside master control: a program sent then is accepted at the
CSAFE level and programs nothing.
**Official docs:** SILENT on the consequence, though the mechanism is
documented. [CSAFE-DEF] Figure 7 p.49 shows `Offline` entered from `Ready`
on "user starts workout before equipment is configured", and the Get Force
Curve example (pp.98-99) shows status `09` on every frame of a poll against
an actively rowing erg.
**Evidence:** §19.1 Verdict (c), with a raw `f1 09 ...` ack captured
immediately after a `state=rowing` frame; §19.3; §19.2. This is why
`program()` verifies against the machine's own reported state rather than
the ack.

**3. A `SetScreenState` ack means "queued", not "done".** The communications
task answers immediately and the UI task applies the command later, so the
screen has not changed when the ack arrives.
**Official docs:** they SAY SO, [CSAFE-DEF] p.65, which puts the UI task at
2 to 5 Hz. The documented remedy is polling
`CSAFE_PM_GET_SCREENSTATESTATUS` until `_INACTIVE`, with a delay of a second
or more as the weaker alternative; Figure 9 p.64 adds "delay several seconds
to allow logging to complete" after Set Finished.
**Evidence:** §19.6. This codec's terminate and prepare steps both treat the
ack as completion and neither remedy is implemented; the measured prepare
settle (entry 6) is the empirical stand-in.

**4. Workout configuration is atomic at the commit; a CSAFE frame is not.**
Parameter limits are checked at the commit, and one violation aborts the
whole configuration with a "PrevReject" status. But an unrecognized command
inside a frame is skipped while the rest of that frame executes, and one
status byte covers the whole frame, so a non-OK status does not mean nothing
took effect. A genuine reject is also not self-describing: recovering the
reason requires a follow-up `GetErrorType`.
**Official docs:** they SAY SO, [CSAFE-DEF] pp.50 and 10.
**Evidence:** §19.7. No genuine reject has ever been provoked on this
hardware, so `GetErrorType`'s own reply shape and even its request-side
wrapper remain unconfirmed (§17 item 14).

**5. The documents' printed checksums are the least reliable thing in them.**
Three worked examples print a checksum that fails the document's own XOR
rule, a fourth is unresolved, [CID-2010] p.50 carries another, and two "81
or 01" examples print a single checksum matching neither branch. The PM's
own ack checksums satisfy the XOR rule exactly as this codec computes it.
Compute the value; never copy a printed one.
**Official docs:** they SAY OTHERWISE, in the sense that the printed values
are simply wrong.
**Evidence:** §6's errata table, §18 #1 (hand-verified against a real ack),
§19.1's dual-checksum table, §19.12.

### Programming and arming

**6. Programming over a RUNNING piece arms structurally EMPTY, while acking
everything.** Two unrelated program shapes sent to a machine still `rowing`
each armed a workout with no interval structure: every frame acked, the
state word read `armed`, the monitor showed `:00`, and 108.4 m were rowed
with `intervalIndex` pinned at 0 and no boundary ever firing. The variable
is the machine's state at send time, not the program's content; seven
single-variable and pair probes of the same shapes armed correctly from a
settled machine.
**Official docs:** SILENT. Every worked programming example in both
documents programs from an idle machine, and no surveyed open-source
implementation sends a program mid-piece either (§19.10's survey).
**Evidence:** §19.13, §18 session 3 (Step 5 and the live bisect's REPRO
row), §18 SESSION 4b row 2.
The empty arm has a readable anatomy on 0x0031: `workoutType=1`,
`workoutDurationRaw=0`, `workoutDurationType=128`, against a healthy arm's
`8` plus interval 0's own duration in the units the encoder writes, and a
never-armed baseline of `0`/`0`/`128` (§17 item 12's table, §18 SESSION 4a).
Those three fields refresh while the machine is merely armed, no stroke
needed, which is what makes a structural readback usable at verification
time. Two caveats that cost real debugging: the readback lags the armed
state by about a tick on HEALTHY arms (walk 3 witnessed a first sighting of
`durationRaw=0` and the true `durationRaw=100` one tick later), and
mid-cycle transients carry `workoutType=1` with stale, NON-ZERO durations,
so a single mismatched tick is not evidence of a bad arm. Waiting for
several consecutive armed ticks reporting the SAME wrong structure is what
separates the two. On the prevention side, a terminate-shaped prepare walks
the machine `terminated`, `idle`, `armed`, with the armed tick observed on
tick 4 of the wait in three independent measurements (§18 SESSION 4a twice,
SESSION 4b once).

**7. "Armed" is a LEVEL reported on every status tick, not an edge.** 0x0031
notifies at roughly 2 Hz and reports `armed` on every one of those ticks for
as long as the machine holds an armed program: session 3 counted 154
consecutive `armed` frames before the first stroke, and the structure fields
refresh throughout. Anything verifying an arm must read the CURRENT decoded
state per tick rather than wait for a one-shot.
**Official docs:** SILENT. The BLE doc gives the sample-rate characteristic
(p.9's attribute table, §9) and the state enum (Appendix A, p.37, §5) but
never says whether a state arrives as an event or as a repeated level.
**Evidence:** §18 session 3 Step 2's state census, §17 item 12 (the fields
refresh while merely armed), §18 SESSION 4a and 4b's tick-4 settle
readings. Modelling it as a one-shot is what made the fake's armed status
stealable by any tick landing between the last frame's ack and the verifier
subscribing (`app/src/monitor/transports/fake.ts`'s `armedLevel`).

**8. Nothing clears a loaded workout; terminate RE-ARMS it.** The only
documented way to change what is loaded is to program a new one.
**Official docs:** a DOCUMENTED ABSENCE plus a documented transition.
Appendix E routes a mid-workout terminate through `Rearm`, Concept2's own
word for making the SAME workout ready to run again, and
`CSAFE_PM_SET_RESET_ALL` (`0xE0`) is marked `<Not implemented>`. A terminate
from `WorkoutLogged` instead goes straight to `WaitToBegin` with no Rearm
step, so a prepare step has to work from either starting state.
**Evidence:** §19.5 (including the two untested candidates,
`CSAFE_RESET_CMD` and `SCREENVALUEWORKOUT_GOTOMAINSCREEN`), §19.4. Two
field facts soften this in practice: a terminate sent to an IDLE machine is
accepted, not refused (§17 item 15, §18 session 3), and programming over a
loaded but SETTLED workout replaces it cleanly, read live off the monitor
(§18 session 3 Step 3, §19.1 Verdict (b)).

**9. The monitor never goes quiet at the end of a workout.** It parks in
`WorkoutLogged` and answers CSAFE in every state, leaving on the user
pressing Menu or on a Terminate command. A client that wants to keep working
after a workout completes should terminate and carry on, not drop the
connection.
**Official docs:** they SAY SO. Appendix E (p.173 in [CSAFE-DEF] rev 0.31,
the p.162 §14 cites in rev 0.27) and Table 17, which also warns that the PM
deliberately deviates from stock CSAFE here: there is no Finished-state
timeout back to Idle, so expect low nibble `0x01` (Ready), not `0x02`
(Idle), once a workout concludes.
**Evidence:** §19.4. The silence we saw was our own terminal-state latch
short-circuiting the subscriptions.

**10. Multi-frame programming acks end to end; retention rowed to completion
is still unproven.** A 25-interval program packed into 7 ack-gated CSAFE
frames had every frame acked, twice.
**Official docs:** SILENT. Every worked programming example in both
documents is a SINGLE frame, which made accumulation across frames this
codec's largest untested assumption (§15 #6).
**Evidence:** §18 session 3 Step 5 and the live bisect's `bisect-frames`
row. Stated plainly: what is proven is that seven frames ack and arm from a
settled state. Step 5's own send landed on a running machine and armed empty
(entry 6), so nothing yet shows all 25 intervals surviving to be rowed (§17
item 5's open remainder).

**11. A nonzero rest programmed onto the FINAL interval is honoured.** The
last interval's own rest counts down fully before `WorkoutEnd` and
`workoutComplete`, with no early termination.
**Official docs:** SILENT. Every worked programming example in both
documents ends on a work interval.
**Evidence:** §18 #8, §17 item 8. Practically significant rather than a
corner case: 161 of this app's 300 seeded library workouts compile to a
program whose last interval carries a nonzero rest.

### Reading the status characteristics

**12. 0x0031's Elapsed Time AND Distance are PER-INTERVAL on an interval
workout.** Both fields reset together at each new work interval, and each
interval's count spans its own work plus its trailing rest. A 2x100m read
`state=resting elapsed=37.81 distance=101.8` and then, on the very next
frame, `state=rowing elapsed=0 distance=0.7`.
**Official docs:** SILENT. The BLE doc's layout (pp.13-20, §10's table)
gives the scales and nothing else, and both field names read as session
totals.
**Evidence:** §18 walk 4 and §10's own note. Two consumers had assumed
session-cumulative and both broke on camera: a total-remaining readout fell
1:30 to 1:11 and then ROSE to 1:38 at interval 2, and a meters card fell 109
to 50. A whole-session total has to be accumulated across the resets, and
such an accumulator is a display estimate: it can only bank the last reading
it actually saw, so up to one status tick per boundary goes uncounted. The
per-interval pair is still the right input for "how far into THIS interval".

**13. The workout clock runs before the first pull and through a stopped
rower; byte 9 is the only field that distinguishes a pull from a coast — and
it is NOT dependable.** The PM5 starts the workout clock at "row to begin",
so elapsed time moves with zero meters and zero rate. A rower who stops
mid-interval freezes meters, split and rate while the interval clock keeps
counting down and heart rate keeps moving. A flywheel still coasting from a
previous piece banks real meters on a piece the monitor does not consider
started. 0x0031's byte 9 (Rowing State, 0 = Inactive, 1 = Active) is the
machine's own declaration that rowing has begun, and nothing else on the
wire carries that fact — but it does not always carry it either.

**Both readings have now been observed on the same PM5 (432331249):**

- **TRUE on the first pull, and that is the ordinary case.** §18 walk 4
  (2026-08-08, a 2×100 m) promoted on the instant path; the five-frame
  distance fallback never ran. It has held ever since: across the 16
  committed diagnostics rings from seven phone/laptop walks between
  2026-08-15 and 2026-08-25, **every ring that got past the ready screen
  carries at least one `rowingActive=true` frame line**, and
  `docs/monitor/sessions/walk-2026-08-25/rests-finished-ring.json`'s own
  first rowing frame reads `state=rowing elapsed=0.98 distance=3
  rowingActive=true spm=0` — one day before the falsifying walk, same
  machine, same phone stack.
- **FALSE on every frame of an entire real row** — walk 2026-08-26
  (`docs/monitor/sessions/walk-2026-08-26/README.md`, "Second finding";
  `phone-ring.json` seq 30 and 34), a PROGRAMMED single-interval 2000 m
  distance goal (`durationRaw=2000 durationType=128`) on iOS build 775.
  The frame line reads `state=rowing elapsed=24.03 distance=32.9
  rowingActive=false spm=24`; elapsed and distance advance sanely
  throughout, so this is not a misaligned decode. **The session opened its
  record only because the five-frame strictly-increasing-distance fallback
  fired** (`rowing-active-fallback`, seq 34) — the only time that entry
  appears in any committed capture, and the fallback's first observed save
  on hardware.

**So "byte 9 goes Active when the rower pulls" is FALSIFIED as a dependable
gate, while remaining the usual behaviour.** Any predicate requiring
`rowingState === 1` must carry a fallback or it can lose a whole session
silently; any predicate requiring `=== 0` silently degenerates to its other
conjuncts when the byte sticks.

**What is NOT established.** One session, one machine, one workout — the
byte is not known to be generally useless, and nothing here says why it read
false.

- **No cause is known and none is asserted.** Firmware version was not
  captured. A free row is ruled out (the ring shows the full programming
  handshake, seq 11-19). Workout-goal type is a weak hypothesis at best:
  walk 4, which read TRUE, was also a distance goal. What differed from the
  passing walks — a single long interval rather than several short ones, a
  2.5 s frame-stream silence immediately before the first rowing frame
  (seq 27) — is recorded as difference, not as mechanism.
- **What byte 9 actually held.** `pm5/parse.ts` reads a strict
  `rowingState === 1`, so ANY other value decodes to `false`, and the
  diagnostics ring stores only the decoded boolean. That walk kept no
  `.jsonl.gz` recording, and the raw-`0x0031` ring lines the driver does
  emit fire on terminal states only — all of this session's raw
  `structure` entries predate the row. **So this capture cannot
  distinguish "the machine said Inactive" from "the machine said something
  we do not decode."**
- **Whether it recovers within a session.** It read false on every frame
  that session logged; no later frame shows it going true, and no walk
  since has re-tested it.

**Official docs:** SILENT on all of it. Byte 9 appears in the BLE doc's
layout (p.13, §10's table) as a bare enum with no stated semantics, and
nothing describes when the clock starts.
**Evidence:** §18 walks 1, 2, 3 and 4; the 16 rings under
`docs/monitor/sessions/`; and `walk-2026-08-26/phone-ring.json`.
Consequences worth stating: a gate keyed on elapsed time or on banked meters
is wrong on real hardware; a paused-detection key that includes elapsed can
never fire; and a gate keyed on byte 9 ALONE loses the session with no error
anywhere, which is why `useMonitorSession.ts` carries
`ROWING_ACTIVE_FALLBACK_FRAMES`.

**14. Stroke rate is instantaneous per stroke and HOLDS its last value
through a stop.** 0x0032's Stroke Rate is 60 divided by the stroke period,
not a windowed average, and it keeps reporting the last computed value once
the rower stops. Barely-moving strokes therefore read absurdly high but
legitimately: walk 1 saw 57 to 68 and froze at 68, while at real cadence
walk 4 read 25 then 24, which reads walk 1's numbers as a slow-stroke
artifact rather than a decode fault.
**Official docs:** SILENT on both the derivation and the hold. The field is
documented only as "strokes/min" (§10's 0x0032 table, BLE doc p.14).
**Evidence:** §18 walks 1 and 4. Not fully closed: no capture carries a raw
0x0032 sample yet (walk 1's own caveat), and 0x0038's `avgSpm` reported 57
and 66 across two slow rows (§18 session 3, Steps 2 and 4), recorded there
as an unexplained machine-reported oddity.

**15. Interval numbering is 0-based on the write side and FORWARD-attributed
on the read side, and the two read-side fields legitimately disagree.**
`CSAFE_PM_SET_WORKOUTINTERVALCOUNT`'s index is 0-based, confirmed by §12's
worked example and again on the wire (`18 01 00/01/02/03`). But
0x0037/0x0038's Split/Interval Number names the interval being ENTERED
rather than the one just completed, including at a work-to-work boundary
with no rest in it, so a two-interval workout produces a phantom index 2. At
one such boundary 0x0033's Interval Count read `0` while 0x0037 read `1`:
these are two independently incrementing fields, and correlating them is
matching values, not reading one field twice.
**Official docs:** SILENT. Neither document says which interval a reported
number refers to; the nearest guidance, footnotes 10 (p.23) and 12 (p.25),
concerns interval TYPE and termination and only says the value changes with
where you are.
**Evidence:** §19.8, §18 #3 (D3), §17 item 13, §15 #1. What follows in code:
subtract one unconditionally for an interval's actual, keep the rest-keyed
rule for 0x0033, and expect a logged divergence between the two at every
no-rest boundary by design.

**16. 0x0038 consistently arrives AFTER 0x0037 at a boundary.** Pairing the
two halves without checking they name the SAME boundary yields a mixed
actual: one boundary's identity carrying the previous boundary's averages.
Wait for both halves of one boundary, in either order.
**Official docs:** SILENT on notification ordering between characteristics.
**Evidence:** §18 #3's follow-up diagnosis row (D4), and §19.8's own caveat
about which readings predate the fix.

**17. 0x0033's Last Split Time is 0.01 s/lsb, not the 0.1 s/lsb both C2
documents print (RC-4, 2026-08-22) — and the checkpoint pair is
DIMENSION-CONDITIONAL, never a countdown checkpoint at any scale.**
Settled without a new erg session: nine capture pairs (0x0033's u24LE@14
is the exact hundredths value whose truncation to tenths equals 0x0037's
already-established Split/Interval Time) and the PM5's own memory screen
(M4 fix, final-review — corrected citation: the README line
`walk-2026-08-17/README.md:14` reads "PM5 memory interval 2 = 1:14.7
matches wire 74.71s exactly", binding the screen reading to Elapsed
Time/0x0037's 747 tenths, never to 0x0033's own `7476`) agree against
both documents' printed 0.1. `parse.ts` had divided by 10 instead
of 100 since CR2 spec 2a Task 6; `statusFrames.ts`'s fake encoder mirrored
the identical error, so no round trip could ever have caught it — pinned
instead by a REPLAY against committed capture bytes (`parse.test.ts`,
`walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl` seq 1195: raw
`7476` decodes to `74.76 s`, 0.05 s off the SAME frame's Elapsed Time of
`74.71 s` — transiently live mid-interval, not zero and not a lagging
boundary value). That reading contradicts this item's original "reads
ZERO through indices 0-1, then LAGS one boundary behind" characterization
as a universal rule, which held on the captures below; paralleling item
25's own Total Work Distance finding on this same characteristic and this
same session, the pair reads as dimension-conditional (its behavior
differs by interval goal type) rather than as one fixed rule. On no
dimension is it usable as a countdown checkpoint: CR2 spec 2a Task 6
already stopped trying and reads 0x0031's own per-interval Elapsed
Time/Distance pair directly instead (no checkpoint).
**The original finding, still the record for the captures it was measured
on:** 225 time frames + 161 distance frames at interval index 1, zero
mismatches, independently re-verified by inverting `intervalRemaining` out
of the lab captures — the pair does NOT hold the current interval's own
start point there, and it does not refresh to a fresh value at every
boundary either; it holds the PREVIOUS boundary's cumulative point — at
interval index 2 it reads interval 0's end value — one boundary behind the
interval a consumer is actually in, on every regular status tick observed
in that data.
**Official docs:** SILENT on update cadence, and WRONG on scale — the BLE
doc lists Last Split Time at 0.1 sec/lsb (pp.14-15, §10's 0x0033 table,
now corrected) and nothing about behavior.
**Evidence:** the inversion off `docs/monitor/sessions/walk-2026-08-15/`
(225+161 frames, zero mismatches) settled the original lag finding. §18
#7, §17 item 7: 58.92 s remaining observed 1.08 s into a 60 s interval —
correct only because that capture never left interval index 1, where the
checkpoint happens to read 0 and "holds steady at the start point" and
"reads zero" are numerically indistinguishable. §15 #8's walk-4 addendum
first raised the contradiction this resolves. RC-4's
`walk-2026-08-17/step-2-...jsonl` seq 1195 (§20 item 24) settles the scale
and supplies the transiently-live counter-example.
**Still open** (§20 item 24): whether the original lag, where it applies,
is "one boundary behind" or "previous split's own value" — both fit every
capture in hand and imply the same fix; only a 4-UNEQUAL-interval walk row
separates them. Also open: which interval-goal dimension each behavior
belongs to, beyond the one distance-goal capture in hand.

**18. Heart rate has two sentinels in the field, and only one of them is the
documented one.** With no belt paired, 0x0038's work-heartrate field
delivered `0`, not `255`. Map BOTH values to `null` on EVERY heart-rate
field: no rower reads 0 bpm and none reads 255, so neither mapping can
discard a genuine measurement. A rest-heartrate average at a boundary with
no rest in it also reads `0`.
**Official docs:** they SAY OTHERWISE, per field. 0x0032's Heartrate is
documented "255=invalid" (BLE doc p.14, §10's table; [CSAFE-DEF] p.21),
0x0039's Recovery Heart Rate is documented "zero = not valid data"
([CSAFE-DEF] p.24), and 0x0038's two heart-rate bytes have NO stated
sentinel at all.
**Evidence:** §18's D5 and its correction, §19.9, §18 session 3 Step 4 (raw
0x0038 captured, offset 5 reading `0x00` at a no-rest boundary). One thing
the value can never tell you: belt presence has its own query,
`CSAFE_PM_GET_HRM` (`0x84`), reporting Inactive, Discovery or Paired.

**19. The scale, byte-order and layout traps, indexed.** Every one of these
is stated somewhere in the BLE or CSAFE doc, and every one is easy to read
past. §10 and §11's tables are the authority; this is only the index.

- 0x0038's Split/Interval Avg Pace is **0.1 s/lsb**, while 0x0032's and
  0x0033's pace fields are **0.01 s/lsb** (BLE doc pp.19-20 against p.14).
- `CSAFE_PM_SET_RESTDURATION` writes **whole seconds** while the read-side
  Rest Time on 0x0032 is **0.01 s/lsb** (CSAFE doc pp.68-71 and §12's worked
  example, against BLE doc p.14): a write and a read of the same quantity at
  two different scales.
- Inside 0x0037, Split/Interval Distance is **1 m/lsb** while the cumulative
  Distance three rows above it is **0.1 m/lsb** (BLE doc p.19). Same
  characteristic, two distance scales.
- Status reads are **little-endian**; the CSAFE programming writes are
  **big-endian** (§10's header note, §11). This is why the parser and the
  encoder keep separate integer helpers.
- The multiplexed `0x0080` restatements of 0x0032 and 0x0033 are NOT
  byte-identical to the GATT characteristics: the multiplexed 0x0032 is 19
  bytes and the multiplexed 0x0033 is 18, because Average Power moves from
  one to the other (BLE doc Table 4, pp.26-27). 0x0031 is the one
  characteristic restated verbatim. Reusing the GATT offset tables against
  the multiplexed characteristic silently decodes the wrong field at the
  wrong scale.

**Official docs:** all STATED, none highlighted.
**Evidence:** §10, §11, §12.

**20. `CSAFE_PM_SET_TARGETPACETIME` is 0.01 s/lsb, so half-second splits are
wire-legal.** A 2:14.5 target encodes as raw 13450 and is perfectly
representable. A validator that copies the whole-second contract of
`CSAFE_PM_SET_RESTDURATION` onto pace will refuse most realistic targets.
**Official docs:** they STATE the scale plainly (CSAFE doc pp.68-71; §12's
worked example encodes 1:40 as `0x00002710`, that is 10000).
**Evidence:** §11, §12, and §18 walk 1, where exactly that mistaken check
refused a whole workout and was corrected on the spot. Still owed by a
future row: no `.5` target has actually reached a real PM5 yet, since every
workout programmed since has carried whole-second targets.

### Transport and discovery

**21. Three things about the BLE link that neither document mentions.**

- The C2 Rowing service (`0x0030`) is NOT advertised. Filtering discovery on
  it leaves Chrome's picker empty forever; filter on the device-information
  service or on the name prefix `PM5`.
- GATT characteristic handles do not survive a reconnect: every write after
  one throws `InvalidStateError` until the characteristics are re-fetched.
- One notification callback can deliver TWO complete CSAFE response frames
  back to back, so a reassembler has to be drained until it yields nothing
  rather than read once per callback.

**Official docs:** SILENT on all three. The BLE doc gives the UUID formula
and the attribute table (p.9, §9) and says nothing about what is advertised.
**Evidence:** §18's "Also fixed live this session" for the first two, both
found and fixed on hardware in session 1; §16's coalescing paragraph for the
third, a proven bug with its own regression test.

**The wire's representable ranges exceed every plausible band, so
consumers guard per FIELD, never per record.** 0x0037/0x0038's decodes
put Stroke Rate in 0..255 (`readU8`, `pm5/parse.ts:271`) and average
pace in 0..6553.5 s/500m (`readU16LE / 10`), while real readings above
the app's own storage bands were observed on hardware the same day the
bands were set (avgSpm 66 on light rowing, walk 1's split artifacts).
The consumer rule that shipped: a wire-legal reading outside a band
drops ITS OWN FIELD and keeps the rest of the record
(`src/session/logDraft.ts`'s `MONITOR_SPLIT_MAX`/`MONITOR_SPM_*`
constants and the 7C design spec §3). Rejecting the whole record for
one outlandish field would have discarded real sessions.
**Official docs:** SILENT on value ranges for every read-side field.
**Evidence:** `pm5/parse.ts`'s decode widths; §18 walk 1's rate
readings; the 7C branch review (review-derived, code-cited).

### Still open, and honestly so

**22. Whether 0x0037's Split/Interval Time is work-only or work plus rest —
SETTLED work-only (state-architecture review §7, then RC-5 hero-truth,
2026-08-25, §26 below).** An interval's logged elapsed time maps from that
field and is stored under the work-only reading. The documented shape
argues for it: 0x0037 carries a SEPARATE Interval Rest Time field at
offsets 12-13, which would be redundant if Split/Interval Time already
included the rest it names. Two INDEPENDENT (non-circular) confirmations,
neither the `avgSplit` self-consistency arithmetic this item originally
correctly rejected as circular:
- **First (state-architecture review §7):** a distance-interval boundary
  decodes `splitIntervalTimeSeconds = 60.0` with `intervalRestTimeSeconds =
  30` in the SAME frame, while that SAME interval's 0x0031 elapsed counter
  (a continuous stopwatch that keeps running through rest — B8, §7) reached
  91.31s by the time the following rest itself ended — 60+30=90, within
  1.3s of the independently-tracked 91.31 (reset-timing slop, not the same
  quantity twice). If Split/Interval Time already fused in the rest, it
  would read ~90, not 60.
- **Second (RC-5 hero-truth, §26 below):** the exit-7 capture's last
  boundary (seq 53) decodes `splitIntervalTimeSeconds = 56.1` with
  `intervalRestTimeSeconds = 60` in the SAME frame; the PM5's own screen
  (`walk-2026-08-24/README.md`) shows that interval's split as 56.1, not
  116.1.
**Official docs:** SILENT.
**Evidence:** §17 item 22 (original open framing); state-architecture
review §7 (first settlement); §26 below (second, independent capture).
`app/src/session/logDraft.ts`'s `actualSeconds` doc comment carries the
corrected, settled claim.

**23. Real pairing and programming latency has never been measured.** Three
spans are unknown: device pick to pairing complete, pairing complete to the
first programming write, and the programming send's own duration for a known
interval count.
**Official docs:** SILENT, and could not be otherwise.
**Evidence for the open state:** §17 item 21. The fake's 100 ms auto-tick
and the e2e fixtures' 120-200 ms write latency were chosen for observability
in a browser test, never measured against hardware, and nothing downstream
treats them as a timing oracle.

**24. What 0x0033's Last Split checkpoint pair actually reports on
interval workouts — HALF-SETTLED, scale corrected (RC-4, 2026-08-22).**
§15 #8's session-cumulative reading and walk 4's per-interval 0x0031
finding could not both be whole truths, because the driver subtracted one
from the other and the countdown was CORRECT on hardware only through
interval indices 0-1. The inversion of `intervalRemaining` out of the lab
captures (225 time frames + 161 distance frames, zero mismatches,
independently re-verified) settled WHICH, for those captures: the
checkpoint reads ZERO through interval indices 0 and 1, then LAGS one
boundary behind from index 2 on — not session-cumulative, not
interval-relative. `src/monitor/driver.ts`'s `computeRemainingForFrame`/
`computeAccruedForFrame` no longer read this pair at all (CR2 spec 2a
Task 6); 0x0031's own per-interval Elapsed Time/Distance pair is read
directly instead.
RC-4 adds a second, CONTRADICTING data point on top of correcting the
scale bug (`parse.ts`/`statusFrames.ts` had decoded/encoded Last Split
Time at 0.1 s/lsb; the field is 0.01 s/lsb — nine capture pairs and the
PM5's own memory screen agree; see §20 item 17): the committed
`walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl` seq 1195, a
2×250m distance-goal keystone, decodes Last Split Time to `74.76 s`
against the SAME frame's Elapsed Time of `74.71 s` — 0.05 s apart, neither
zero nor a stale boundary value. The checkpoint pair is
DIMENSION-CONDITIONAL (paralleling item 25's Total Work Distance finding
on this same characteristic, same session) and transiently live
mid-interval on at least one dimension; on neither dimension is it a
countdown checkpoint, which is why no consumer reads it that way
(`driver.ts` above; `parse.test.ts`'s replay pin exists to keep the scale
honest, not to license using the field as a clock).
**Still open:** whether the original lag, where it applies, is "one
boundary behind" (interval 0's own end value, repeating unchanged at
every later boundary until the checkpoint itself next advances) or
"previous split's own value" (each boundary contributing its own distinct
prior value) — both fit every capture in hand and imply the same fix;
only a raw 0x0033 capture across a 4-UNEQUAL-interval program separates
them, since equal intervals make the two hypotheses numerically
identical. Also open: which interval-goal dimension each behavior belongs
to.
**Official docs:** SILENT (no update cadence, no basis stated) and WRONG
on scale (both documents print 0.1 s/lsb; §20 item 17).
**Evidence:** §15 #8's walk-4 addendum first raised the contradiction; the
inversion above (also §20 item 17) settled it half of the way; the
2026-08-15 connected-axes design spec §3 ("The interval clock") records the
adjudication. RC-4's `parse.test.ts` replay pin against seq 1195 settles
the scale and supplies the transiently-live counter-example. The deciding
walk row (4 unequal intervals) is queued on the spec-2 walk list,
`docs/monitor/sessions/walk-2026-08-15/README.md`.

**25. Total Work Distance (offsets 11-13) is a BOUNDARY ACCUMULATOR on a
distance-goal interval, not a live rowed-distance reading — and on a
time-goal interval it is frozen through the whole work bout and only ticks
during the trailing rest.** **CORRECTED (RC-9c, 2026-08-25, design spec
`2026-08-25-free-oracles` §2 — a pre-spec oracle-soundness pass decoding
every committed capture byte-level): the headline claim above is WRONG,
byte-for-byte, and is kept here (not deleted) so the correction is legible
against what was believed.** Total Work Distance is an **ODOMETER of
metres genuinely rowed — work plus rest coast — that LAGS the interval
currently in progress and catches up in a jump at each boundary.** It is
not a "boundary accumulator of INTENDED work": `docs/monitor/sessions/
walk-2026-08-16/session-1-keystone-2x250r0.jsonl` (a 2×250m,
`workoutDurationType` **128 — a DISTANCE-goal program — throughout**, so
this is the exact shape the old claim's "distance-goal" half was about)
reads TWD **0** through the entire span of interval 1 while 250 m are
genuinely rowed, **250** through interval 2, and **500** only once, at
WORKOUTEND. The two samples the old "INTENDED work" claim actually rested
on are `pm5-session4b`'s ring seq 3 and 14 — both **BEFORE `program()`'s
own writes at seq 7+**, i.e. a stale pre-arm monitor state observed twice,
never a running program at all (`src/monitor/continuity.ts`'s header
comment carries the same correction with the same citations). First found
by Phase CM (`recordTwdVerdict`, `src/monitor/driver.ts`, "500 m goal read
against 13.4 m genuinely rowed, mid-row" — the verdict itself was
**RETIRED by RC-9c**, since both sides of that comparison are the same
work-plus-rest-coast quantity and a green result certified nothing about
the stored row); re-confirmed and given its mechanism by Phase LL Task 4's
review (2026-08-22), against two more captures:
- `docs/monitor/sessions/walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl`,
  a 2x250m: mid the FIRST 250 (elapsed 12.32 s, distance 9.7 m genuinely
  rowed, `workoutState: 5`/rowing), this field reads `500` — the SECOND
  interval's own goal, not the first's, and not anything rowed yet. Over
  the interval's own span the field is observed at exactly three values —
  `0`, `250`, `500` — each a WHOLE-PROGRAM position, not a distance: `0`
  before the piece starts, `250` for the interval actually being rowed,
  `500` once the machine has already committed to the NEXT interval's own
  goal, all before a single metre of interval 2 is rowed. It is the
  machine's own running total of INTENDED work, stepped at each interval
  boundary, not an odometer of metres actually pulled. **CORRECTED
  (RC-9c): "mid the FIRST 250" is wrong** — TWD had already stepped
  `0`→`250` at the interval-1/interval-2 boundary 84 ticks earlier (seq
  733→738, where `elapsed`/`distance` also reset to `0`); the sample
  quoted above (seq 822: elapsed 12.32 s, distance 9.7 m) is **12 s into
  interval TWO**, not the first. And it is not a settled "commit to the
  next goal" either: it is a **1.6 s TRANSIENT that reverts** — seq 822
  reads `500`, seq 831 (1,619.9 ms later) reads `250` again, and the field
  does not settle at `500` for good until seq 1193, at the real
  interval-2→WORKOUTEND boundary (`workoutState` 5→10). So this sample is
  TWD briefly overshooting to the position it will eventually settle at,
  then un-committing, then re-committing for real 1.6 s later — not a
  single clean step to "the next goal." The mixed-pyramid capture below
  shows the identical shape: seq 3255 reads `1347` (an early overshoot,
  `workoutState: 5`), seq 3273 reverts to `1047` 2.97 s later, and seq
  3276 recommits `1347` for good as `workoutState` moves 5→10
  (WORKOUTEND). TWD is non-monotonic in the instants right around a
  boundary, in both captures, before it settles.
- `docs/monitor/sessions/walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz`
  (a mixed pyramid, every interval distance-goal): the field changes value
  on 41 of 1085 status ticks in the capture, and every one of those 41
  ticks reads `workoutState: 3` (resting) at the moment of the change — it
  is frozen for the entire work bout of every interval and only advances
  while the machine is in its trailing rest, confirming the "rest-window"
  half of the mechanism independently of the step-2 capture's own
  boundary-jump evidence. **CORRECTED (RC-9c): the "every one of those 41"
  claim is false — re-decoded directly against `parseGeneralStatus` over
  the full capture, the histogram is `workoutState` **36 × 3 (resting), 3
  × 5 (rowing), 1 × 9 (`INTERVALWORKDISTANCETOREST`, the ephemeral
  work→rest transition), 1 × 10 (`WORKOUTEND`)** — 41 changes total, the
  original count stands, but the universal does not. The five exceptions
  are exactly where the mechanism lives, not noise: seq 1331→1334
  (`330`→`332`, `workoutState` 3→5 — rest ENDING into work, the mirror
  image of the "advances during rest" story); seq 2422→2425
  (`332`→`1032`, `workoutState` 5→9 — the work→rest transition into the
  NEXT pyramid leg, where the boundary jump is largest because that leg's
  own goal is largest); and the seq 3255/3273/3276 overshoot-revert-
  recommit trio above (`workoutState` 5, 5, 10). Every exception sits on a
  state TRANSITION instant. TWD moves at boundaries, full stop — this
  capture's boundaries mostly land inside a rest window because most of
  its rests are long relative to the tick rate, not because "resting" is
  what triggers the field.
**Official docs:** SILENT on both halves. The BLE doc's table (§10) gives
only the scale (whole metres) and the name, which reads as a live,
monotonic rowed-distance total — the assumption both the original Phase CM
defect and this task's own first-draft continuity rule (`docs/superpowers/
specs/2026-08-22-link-truth-design.md` §4) made before the corpus corrected
it, and the assumption this item's own original headline claim ALSO made
in the opposite direction (an "intended work" total instead of a rowed-work
one) — SILENT docs cost this repo the same wrong-then-wrong-differently
mistake twice on the same field.
**Evidence:** `src/monitor/driver.ts`'s `recordTwdVerdict` (Phase CM,
`distanceGoal` suppression: `workoutDurationType === 128` OR the armed
program contains a distance interval) **— the verdict itself is RETIRED as
of RC-9c; the suppression predicate it defined lives on in
`continuity.ts`'s reset-detector guard, a different use of the same wire
fact, unaffected by the retirement**; `src/monitor/continuity.ts`'s own
header comment (now carrying this same correction with the same
`pm5-session4b`/`session-1-keystone-2x250r0`/pyramid citations) and
`continuity.test.ts`'s corpus-derivation describe block (Phase LL Task 4),
which reproduces both captures' own numbers as a live CI gate. Consequence
for anything that reads this field going forward: never trust it as
"metres rowed AT THIS INSTANT" on any interval kind — it lags and jumps at
boundaries, and jumps non-monotonically for up to ~3 s right around one —
but it IS a true (delayed) odometer of metres genuinely rowed, work plus
rest coast, never a total of goals or intentions.

**26. 0x0033's Interval Count changes at REST ONSET, not at the boundary
0x0037 reports — with the opposite timing on a no-rest boundary.** On the
corpus's rest-bearing gaps the count changes 29.8 s ahead of that
interval's own 0x0037 on a 30 s-rest program and 59.7 s ahead on a
60 s-rest program: in both cases a few tenths of a second into the REST,
not at the rest's end where 0x0037 lands. On a no-rest boundary there is
no rest to onset into and the timing flips: the count instead LAGS
0x0037, by 0.28–0.72 s, changing just after the split reports rather than
before it. This independently corroborates the storage-spine design
spec's own §3 end-during-rest bound (PR 2, RC-1): an END landing inside a trailing rest
can genuinely lose the just-finished interval's 0x0037 (arrives only at
rest END) while the count has already moved on, since the count's own
transition sits near the rest's START on every rest-bearing boundary this
corpus has.
**Official docs:** SILENT on when within a boundary 0x0033's count field
updates; §10's table gives only the offset and width, no update cadence.
**Evidence:** storage-spine design spec (`docs/superpowers/
specs/2026-08-23-storage-spine-design.md`) §4, delta D1 — the spec's own
delta-antagonist pass swept 8 boundaries across the corpus's rest-bearing
and no-rest shapes (`walk-2026-08-16/session-1-keystone-2x250r0.jsonl`
(r0), `session-2-wu-4unequal.jsonl` (r30), `walk-2026-08-17/step-3-*`
(r30), `walk-2026-08-18-metrics/pyramid-*` among them) and reported these
figures; the count axis itself (0x0033's raw Interval Count, carried as
`MonitorFrame.rawIntervalCount`) is exercised as a live CI gate by
`continuity.test.ts` PART 5, though this specific onset-timing figure is
the reviewed spec's own finding, not a re-derivation from raw capture
timestamps in this doc.

Other readings owed by the next hardware row are listed at the end of §18's
2026-08-08 entry.

## 21. iOS/Capacitor transport facts (phone walk, 2026-08-10, PM5 432331249)

Everything below was observed live at the erg over `@capacitor-community/bluetooth-le@8.2.0` on a real iPhone, with the byte streams captured tick-by-tick. Where a fact contradicts an assumption the desktop path never had to test, the desktop reason is given.

1. **The plugin keeps ONE notification listener per characteristic.** `startNotifications` removes the previous listener for the same device+characteristic key before adding its own (`bleClient.js:293`). Web Bluetooth stacks `characteristicvaluechanged` listeners; the plugin replaces them. The driver's legitimate double-subscribe of 0x0031 (startup loop + program watcher) therefore silently unplugged the frame pipeline: bytes crossed the bridge continuously while the state machine heard nothing. The transport multiplexes now (one plugin slot, fan-out registry); any future transport must preserve multi-subscriber semantics.
2. **The PM5 updates its 0x0031 structure report in TWO steps after programming.** Observed: workoutType flips to the programmed value first while workoutDuration stays 0 with durationType 0x80 (the idle pattern); the duration populates ~180ms (~2 status ticks) later and is stable thereafter. Any post-program verification that samples this window sees a half-updated structure. The desktop path never saw it because its CCCD setup takes >1.5s (the first status notification ever delivered arrives after the transition is over); the iOS path subscribes fast enough to watch it happen. Verification gates must tolerate the transition by wall clock, not tick count.
3. **Status ticks arrive at ~90-180ms spacing on iOS** (vs the slower effective cadence the desktop walks logged). Tick-count-calibrated logic is transport-relative; wall-clock windows are not.
4. **End-of-workout split frames DO arrive on iOS**: 0x0037 (18B) and 0x0038 (19B) delivered 1ms apart at the finish of a 1-interval piece, AFTER the general-status frame that reports the workout ended. The 7C capture path still recorded 0 of 1 intervals — an ordering problem, not a transport loss (7C was never hardware-walked before today on any platform). **CORRECTED 2026-08-11 (walk day 2, §22 below): the layer named here was wrong.** This item originally read "a driver/record-layer ordering race"; the driver's finish grace and the record's acceptance rule were both built on that reading, both are correct, and neither was ever reached. The producer is one layer up, in the app's own hand-off — see §22 item 1. The 1ms figure above is the load-bearing observation and stands unchanged.
5. **Cancellation rejects with the literal `"requestDevice cancelled."`** and permission denial with `"BLE permission denied"` (denied and restricted are the same string). Both confirmed on device; the transport translates both to typed names at the seam.
6. **The scan sheet is modal and cannot be dismissed programmatically.** After the plugin's own 30s scan stop, the sheet retitles to our `noDeviceFound` copy and its rows STAY TAPPABLE; a stale pick after our 35s timeout resolves the abandoned promise (swallowed; no connect is issued) and the timeout card is what the rower sees. The card visibly renders UNDER the still-open sheet until Cancel — accepted behavior, recorded here so nobody files it as a bug.
7. **A 15-20s screen lock did NOT drop the GATT link** (no `bluetooth-central` background mode declared; the session resumed ticking on unlock). Long suspensions remain unmeasured — a reconnect-phase question, not settled by this walk.
8. **Flipping the Bluetooth permission in Settings relaunches the app** (iOS kills on privacy toggle). The Open Settings door lands on Ergomatic's own Settings page; after re-allow, connect works with no further prompt.
9. **A `namePrefix`-only request reaches CoreBluetooth as scan-for-everything** (empty services array) and the PM5 appears in the list promptly — the §3.1 premise, settled on device.

## 22. What the second phone walk taught (walk day 2, 2026-08-11, PM5 432331249)

One rowed 1:00 piece, the previous day's two fixes on the device, and the app's own wire-log stash (`sessionStorage["ergomatic:last-rowed-log"]`) read afterwards.

1. **The end-of-workout split loses to the app's own hand-off, not to the driver or the record** (correcting §21 item 4's attribution). The chain, all of it inside the microtask flush that follows the `finished` status tick: the driver emits `workoutComplete`; the session hook closes the record and flips to `ended`; React commits; the connected surface fires its `onEnded` hand-off; the caller navigates to the log screen; the interstitial unmounts; the hook's unmount teardown unsubscribes the driver listener **and hangs up the radio**. The split pair arrives ~1 ms later as a NEW TASK — i.e. after every microtask, and therefore always after the teardown. There was no race to win. A second producer sits behind it: the log screen snapshots the record in a mount-time initializer, so even a late write would not be visible to the screen the rower is reading. Fix shipped: the ended FRAME still renders immediately, but the HAND-OFF is held until the vouched final boundary lands, the machine's next status tick arrives (where the driver's own finish grace expires anyway), or a 250 ms backstop expires — whichever is first, and only when the run is actually missing its last interval's actual.
2. **A wire-log stash proves ordering, not delivery.** The day-2 stash ended at `terminal finished` with no split entry of any kind, which reads at first glance as "the splits never arrived" — the opposite of §21 item 4's own capture from the day before. It is not: the stash is EXPORTED INSIDE the teardown, so anything arriving after the teardown could never appear in it, whether or not it was received. Before concluding a frame was never delivered, check where the capture instrument's own snapshot is taken relative to the event. (The app now logs `split-half` on every 0x0037/0x0038 arrival, `record-actual` with the record's verdict on every actual, and `handoff-hold`/`handoff-released` with the reason — and the hold means all of them land inside the exported window.)
3. **The two-step structure transition fix (§21 item 2) VERIFIED on device.** Across multiple connects the rowed log shows the transition sighted (`structure-mismatch` first-sighting entry), the correct structure two ticks later, then `armed` — `program()` resolves, no false mismatch card. The wall-clock persistence window is the rule that decides on this hardware.
5. **MEASURED (walk day 3, 2026-08-11): the end-of-workout split arrives LATER than one status tick after `finished`, and well inside 3 s.** The app's own stash, with the hand-off held for a widened 3000 ms and the next-tick release disabled for the measurement:

   ```
   seq 19  terminal             finished
   seq 20  handoff-hold         machine finish with interval 0 unmeasured (3000ms)
   seq 21  notify-first         0x0037 (18B)
   seq 22  split-half           0x0037 for Split/Interval Number 1 (run closed, state=finished)
   seq 23  notify-first         0x0038 (19B)
   seq 24  split-half           0x0038 for Split/Interval Number 1 (run closed, state=finished)
   seq 25  boundary-out-of-run  Split/Interval Number 1 (state=finished) — no open run, index=null
   seq 26  record-actual        index=null finalBoundary=false recordClosed=true -> REFUSED
   seq 27  handoff-released     backstop — 0 actual(s) measured
   ```

   Between seq 19 and seq 21 the PM5 sends further, identical `finished` status frames (the wire log records a `frame` entry only on a state CHANGE, so they do not appear above — the emit path sees every one). That is what killed both of the previous day's fixes: the driver's finish grace expired "before the machine's next status sample", and the app's hand-off released on "the next status tick", and BOTH bounds are the machine's cadence rather than the split's arrival. Day 1's "1 ms apart" (§21 item 4) is the gap between the two HALVES of the pair, and the app inferred from it that the pair shared the terminal frame's sample instant. It does not. **Anything waiting for the end-of-workout split must wait on a clock — 3000 ms is the measured-safe bound — and must ignore post-finish status ticks entirely.** Housekeeping is discriminated by what it always was: natural-finish-only (never post-terminate, footnote 12), an index the offset rule explains against the armed program, an interval the run is still missing, consumed once, and the record's own independent re-derivation of the last two.

6. **CONFIRMED (2026-08-11 afternoon):** the finding-3 fix's confirming row landed — "ALL 1 INTERVALS MEASURED", with the stash reading exactly the predicted chain: `handoff-hold` → `split-half` x2 → `interval-complete` (THE FINISH GRACE, vouched, normalized against the last active state) → `record-actual index=0 finalBoundary=true recordClosed=true -> accepted (actuals 0 -> 1)` → `handoff-released final-boundary`. The same row re-confirmed the structure window (transition sighted-and-resolved, no card) and handled a stale pre-program "terminated" frame via the out-of-run path. What remains open is one unexplained observation — `localStorage["ergomatic.monitorRun"]` read as `null` on the save screen before saving, which no code path on the ended→log route explains (the record's own loader deletes a record that fails its shape check, which is the first thing to rule out if it recurs). Day 3 confirmed the hand-off hold itself WORKS — the stash above shows the session waiting, the split arriving, and every gate downstream reporting its own verdict, which is the whole reason the remaining valve was findable in one read.

## 23. End-of-workout summary pair byte layout (0x0039/0x003A, BLE doc pp.21-22) — for `pm5/parse.ts`

R1 (`pm5-ble-ecosystem-review.md`'s Recommendations section, "R1. Subscribe
the end-of-workout summary pair 0x0039/0x003A...") and the fast-follow
design spec (`2026-08-11-fast-follow-design.md` §5) both require this
layout land here, cited to the BLE doc, BEFORE any parser pins an offset —
the adversarial review's finding I6: "no in-repo source currently states
0x0039/0x003A's byte layout... land the BLE-doc layout excerpt in
interface-notes BEFORE the plan pins parser offsets, not after the walk."
Fetched live 2026-08-11 via WebFetch from the `concept2.it` mirror
(`concept2.co.in` fails TLS verification — the same finding this file's own
header table already records for the `.nl` mirror's siblings): **Concept2
PM Bluetooth Smart Communication Interface Definition, Revision 1.30** —
the identical revision this file's header table cites for §§1-16, confirmed
by the printed page footers matching exactly (0x0039 on the doc's own p.21,
0x003A on p.22 — the same pagination the ecosystem review cites, "BLE doc
pp.21-24").

Cross-checked at the field-NAME level against the ecosystem review's own
readers of these two characteristics (`pm5-ble-ecosystem-review.md` §1.2,
§1.4): c2bluetooth's `WorkoutSummary.fromBytes` (Flutter,
`lib/models/ergometer.dart`) builds its entire workout result from exactly
these two characteristics and no others; OpenRowingMonitor's own
`PM5_Interface.md` names 0x0039/0x003A as the pair ErgZone/Kinomap
subscribe at session stop, sent AFTER the splits ("splits-then-summaries"
ordering, review line 242). Neither source publishes its own byte-offset
table (the review's own words: "two new parse tables (BLE doc pp.21-24)...
no fields") — the offsets below come from the BLE doc's own attribute table
alone, the same primary source every other table in this file cites.

**Same 20-byte notification ceiling as every other pairing in this file**
(§4 above: "Up to 20 bytes" per notify/read). **0x0039 is exactly 20
bytes — the ceiling itself** — so no further end-of-workout field could be
appended to it without exceeding the documented notify budget.
**0x003A (19 bytes) carries what would not fit**: Split/Interval
Type/Size/Count, Total Calories, Watts (average power for the whole
workout), Total Rest Distance, Interval Rest Time, and Avg Calories/hr.
This is the identical shape 0x0037 (18 bytes, near the ceiling) forced onto
0x0038 (19 bytes) for split data (§10 above) — the doc splits every summary
that needs more than the ~20-byte ceiling into a base characteristic plus
an "additional" one, and 0x0039/0x003A is the workout-totals instance of
the same pattern.

**0x0039 — C2 rowing end of workout summary data characteristic (20 bytes,
BLE doc p.21):**

| Offset | Field                | Scale                                                                                                                                                                                                                                                                                              |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-1    | Log Entry Date         | Lo/Hi. **DECODED AND WALK-VERIFIED — walk item 1 is CLOSED.** The bit-packing is stated on no C2 page; it was read off the wire against the monitor's own screen (walk-2026-08-23 W3) and shipped as `parseSummaryLogStamp` (`parse.ts`): `year = 2000 + (date >> 9)`, `month = date & 0x0f`, `day = (date >> 4) & 0x1f` |
| 2-3    | Log Entry Time         | Lo/Hi, same walk, same parser: `hours = time >> 8`, `minutes = time & 0xff`. **The wire carries NO SECONDS** — settled, not a resolution we chose |
| 4-6    | Elapsed Time           | 0.01 sec/lsb (explicitly annotated). **Whole-workout-total reading CONFIRMED on the wire, and WORK-ONLY — see §27.1, which supersedes this row's original UNCONFIRMED flag and walk item 2.** The flag was raised by analogy to 0x0031's identically-scaled, identically-named field, which hardware walk 4 proved is PER-INTERVAL (§10 above); the analogy does not carry — `walk-2026-08-25/rests-finished-recording.jsonl.gz` reads 254.8 s against three intervals summing to exactly 254.8 s, over a program carrying 120 s of rest it excludes entirely. Pinned by `app/src/monitor/oracleCorpusReplay.test.ts` |
| 7-9    | Distance               | 0.1 m/lsb (explicitly annotated). Same as Elapsed Time above and settled with it — 935 m against three intervals summing to 935 m, §27.1                                                                                                                                                           |
| 10     | Average Stroke Rate    | strokes/min, whole (unannotated — §10's general rule for un-annotated fields)                                                                                                                                                                                                                       |
| 11     | Ending Heartrate       | bpm. No sentinel stated on THIS page for this field; `255`=invalid is 0x0032's documented convention (§10), applied here **by analogy only** — the same caution §10/§15 #2 already give 0x0038's Work/Rest Heartrate bytes — walk item 3                                                          |
| 12     | Average Heartrate      | bpm, same analogy-sentinel caution as Ending Heartrate — walk item 3                                                                                                                                                                                                                                |
| 13     | Min Heartrate          | bpm, same analogy-sentinel caution — walk item 3                                                                                                                                                                                                                                                    |
| 14     | Max Heartrate          | bpm, same analogy-sentinel caution — walk item 3                                                                                                                                                                                                                                                    |
| 15     | Drag Factor Average    | whole units (unannotated — §10's general rule, same convention as 0x0031's own Drag Factor field)                                                                                                                                                                                                    |
| 16     | Recovery Heart Rate    | bpm; **explicitly documented on this page**, quoted verbatim: "(zero = not valid data. After 1 minute of rest/recovery, PM5 sends this data as a revised End Of Workout summary data characteristic unless the monitor has been turned off or a new workout started)". This is the ecosystem review's own "re-fire wrinkle" (R1): 0x0039 notifies a SECOND time, roughly a minute after the finish, once real recovery-HR data lands — the design spec's §5 I5 finding names the same behavior and requires a consumed-once guard against it |
| 17     | Workout Type           | enum, the same `OBJ_WORKOUTTYPE_T` field as 0x0031 offset 6 (§10)                                                                                                                                                                                                                                    |
| 18-19  | Avg Pace               | 0.1 sec/lsb — **explicitly annotated on this page** — the same scale as 0x0038's Split/Interval Avg Pace (§10) and DIFFERENT from 0x0032/0x0033's 0.01 sec/lsb pace fields (§10's own documented trap, recurring here)                                                                             |

**0x003A — C2 rowing end of workout additional summary data characteristic
(19 bytes, BLE doc p.22):**

| Offset | Field                | Scale                                                                                                                                             |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-1    | Log Entry Date         | Lo/Hi, same field as 0x0039 offset 0-1 — DECODED, see that table and `parseSummaryLogStamp`                                                         |
| 2-3    | Log Entry Time         | Lo/Hi, same field as 0x0039 offset 2-3 — DECODED, see that table and `parseSummaryLogStamp`                                                         |
| 4      | Split/Interval Type    | enum. Footnote on this page, quoted: "This value will change depending on where you are in the interval when the workout is terminated. Use workout type to determine whether the intervals are time or distance intervals" — the same base ambiguity §15 #1 already flags for Split/Interval Type/Number elsewhere |
| 5-6    | Split/Interval Size    | Lo/Hi, "(meters or seconds)" per the doc's own note — unit depends on Split/Interval Type (offset 4), whole units, no lsb scale given                |
| 7      | Split/Interval Count   | whole; same base (0- vs 1-based) ambiguity as 0x0033 offset 3 / 0x0037 offset 17 (§10, §15 #1)                                                       |
| 8-9    | Total Calories         | whole cals                                                                                                                                              |
| 10-11  | Watts                  | whole watts, no scale/max annotation stated on THIS page (unlike 0x0038's Split/Interval Power, which DOES carry "max = 65.534 kW" on p.20 — Task 1 review's own independent re-fetch caught an earlier draft of this row borrowing that quote for the wrong characteristic; corrected) — average power for the WHOLE workout (distinct from 0x0033's per-tick Average Power, §10)                |
| 12-14  | Total Rest Distance    | 1 m/lsb — explicitly annotated on this page                                                                                                          |
| 15-16  | Interval Rest Time     | whole seconds — explicitly annotated on this page                                                                                                    |
| 17-18  | Avg Calories           | whole cals/hr — explicitly annotated on this page, same unit as 0x0033's Split/Interval Avg Calories (§10)                                            |

**`parseEndOfWorkoutSummary` (Task 1 of the fast-follow plan) decodes
0x0039 only** — the design spec's I5 ruling (§5): "all needed fields ride
0x0039; pair-gating on 0x003A would recreate the drop fragility." 0x003A is
subscribed for observability/enrichment only (receipt logged, `summary-half`,
same as 0x0039) and has no dedicated parser in this task; a later task adds
one only if the reconciliation gate ever needs one of its fields. Neither
characteristic's Log Entry Date/Time (offsets 0-3 of both) is decoded by
`parseEndOfWorkoutSummary` itself — but **that is now a division of labour,
not an open question**: RC-2 shipped `parseSummaryLogStamp` for exactly those
four bytes, and walk-2026-08-23 W3 verified its output against the monitor's
own screen. The bit-packing is still stated on no C2 page; it was read off the
wire. This paragraph originally justified LEAVING it undecoded, which is no
longer the situation it describes.

`parseEndOfWorkoutSummary` reuses `parse.ts`'s own `heartRate()` helper
(255-and-0-both-null, D5's field-independent reasoning above) for ALL FIVE
heart-rate fields on 0x0039, including Recovery Heart Rate — even though
the document states only the `0` sentinel for that one field. D5's own
argument is why: no heart-rate field on this machine can carry a genuine
`0` or `255`, so the convention is deliberately the SAME across every field
this parser touches, documented sentinel or analogy alike.

**Genuine ambiguities recorded here for the walk** (§17-style, not yet
folded into that numbered runsheet since this pair has never been on this
project's wire):

1. ~~Log Entry Date/Time's bit-packing format (0x0039 offsets 0-3, 0x003A
   offsets 0-3) — irrelevant to `parseEndOfWorkoutSummary`'s current field
   list, but any future consumer needs it decoded first.~~ **CLOSED by
   RC-2 and walk-2026-08-23 W3** — `parseSummaryLogStamp` decodes it and
   the walk checked it against the machine's own screen. Left struck rather
   than deleted because the "any future consumer needs it decoded first"
   sentence is what the Concept2 logbook phase would otherwise read on its
   first day and re-derive.
2. Whether 0x0039's Elapsed Time/Distance are genuinely whole-workout
   cumulative totals, or could exhibit some other reset the way 0x0031's
   identically-scaled, identically-named fields surprised hardware walk 4
   (§10 above). The characteristic's own name and the design's §5
   derivation both argue yes; nothing on the wire has confirmed it yet.
   **DISCHARGED (walk-2026-08-24, exit-7 leg): a real 2×250m r60 piece's
   0x0039 read Elapsed 124.0s / Distance 500m — the SUM of the two
   250m intervals' own splits, `1:07.9 + :56.1 = 2:04.0`, not either
   interval's own smaller number and not a per-interval reset the way
   0x0031 surprised walk 4. n=1, but discriminating: a per-interval or
   reset reading would have shown 56.1s/250m (the LAST interval alone),
   not the cumulative 124.0s/500m the wire actually delivered — the two
   hypotheses predict different numbers, and the observed number picks
   one. Record: `docs/monitor/sessions/walk-2026-08-24/README.md`.**
3. Whether the `255`/`0` heart-rate sentinel convention (§10, D5) genuinely
   extends to 0x0039's Ending/Average/Min/Max/Recovery Heartrate bytes as
   cleanly as it does to 0x0032's live Heartrate and 0x0038's Work/Rest
   Heartrate — applied here by the same by-analogy reasoning, same caution
   as §15 #2.
4. **Whether 0x0039's Elapsed Time/Distance INCLUDE rest, and whether
   0x0037's Split/Interval Time/Distance do — i.e. whether the two measure
   the same span.** Added 2026-08-11 (fast-follow Task 2 review): this is
   the premise the summary-fallback gate's multi-interval subtraction
   actually rests on, and it is a SEPARATE question from item 2. The gate
   derives the final interval as `0x0039 total − Σ(recorded 0x0037
   per-interval values)`, which is only arithmetic if both sides treat rest
   the same way — both counting each interval's trailing rest, or both
   excluding it. A mismatch in either direction leaves the derived final
   interval wrong by the workout's whole rest allowance.

   **Why the silence is the danger, and why this outranks item 2 on the
   runsheet.** Item 2 fails LOUDLY: under a per-interval reading the
   summary carries the last interval's own smaller numbers, the
   subtraction goes non-positive, and the driver declines and says so
   (`driver.ts`'s `deriveFinalIntervalFromSummary`). This one fails
   QUIETLY: a rest-inclusive total over rest-exclusive priors yields a
   final interval too LONG by the total rest — positive, plausible, and
   invisible to that guard. It is the "plausible-looking, wrong, and
   silent" corruption shape D4 refuses elsewhere, arriving through the one
   door no predicate watches. Nothing in the app can settle it; only the
   wire can.

   **The evidence, suggestive and not conclusive.** 0x003A carries **Total
   Rest Distance** (offsets 12-14) and **Interval Rest Time** (15-16) as
   fields of their own, which argues 0x0039's totals are work-only — a
   machine folding rest into the summary's Elapsed Time would have little
   reason to report it separately one characteristic over. Against that:
   walk 4 measured 0x0031's Elapsed Time spanning each interval's work
   PLUS its trailing rest (§18), so this machine demonstrably does bundle
   rest into an identically-named field somewhere.

   **How to settle it — REVISED BY THE WALK (2026-08-11).** The 2×1'
   with 1' rest was rowed and the premise read turned out to be
   PHYSICALLY UNAVAILABLE on a healthy row: the final split wins the
   race so decisively that the hand-off releases and teardown kills the
   subscriptions before 0x0039 is ever delivered — no `summary-totals`
   entry can exist on the very rows a conductor would use to look for
   one. The entry (and the premise check) becomes observable exactly
   when it matters: a dropped final split holds the door open, the
   summary arrives, and `filled-from-summary`'s `how` string prints the
   full arithmetic. Both premises therefore stay OPEN, quarantined
   behind the derivation's own detectors (a violated premise 1 declines
   loudly on negative subtraction; premise 2's rest-inclusive failure is
   the one silent-positive case, exposed by the `how` string whenever a
   real fill fires). The check, when a fill ever happens, is one
   subtraction: if the derived final interval exceeds its
   programmed work by about the rest allowance, the two sides disagree and
   `deriveFinalIntervalFromSummary` is the single function that changes. A
   single-interval row cannot settle it (no prior to subtract, no rest
   between anything), and neither can a rest-free one.

   **DISCHARGED (walk-2026-08-24, exit-7 leg) — a rest-BEARING 2×250m
   r60 row finally settles both halves.** 0x0039 read Elapsed 124.0s /
   Distance 500m: exactly `1:07.9 + :56.1` and `250 + 250`, the two
   intervals' own WORK splits summed with NEITHER rest window (60s
   apiece, 147m + 95m) folded in — 0x0039 EXCLUDES rest. The SAME row's
   0x0031 Total Work Distance (TWD, read separately, decoded to the
   metre) came back 742 = `500 + 147 + 95`, i.e. work PLUS both rests —
   confirming the two characteristics measure DIFFERENT spans, as
   suspected, and settling which one is which: 0x0039/0x0037 share the
   work-only span (the subtraction premise's own "both sides treat rest
   the same way" now holds, since both are work-only), TWD is the
   separate rest-inclusive one. n=1, but discriminating the same way
   item 2's discharge is: a rest-inclusive 0x0039 would have read
   244.0s/742m here, not 124.0s/500m — the two hypotheses predict
   different numbers on THIS row, and the wire delivered the work-only
   one. Record: `docs/monitor/sessions/walk-2026-08-24/README.md`.

## 24. The burst-first race (walk 2026-08-23 keystone) — for `src/monitor/driver.ts`'s summary-fallback gate (storage-spine design spec §1/§2)

One rowed 2×250m/no-rest piece (`docs/monitor/sessions/walk-2026-08-23/
keystone-pm5-recording-1787491974452.jsonl.gz`, that walk's own README.md:
"the laptop keystone (2×250m, no rest) with the hold-open armed"), captured
with a dev instrument holding 0x003F's own subscription open for 90.3s past
the finish so the whole natural-finish burst is on the wire, byte for byte
— the first capture in this repo to carry 0x0039/0x003A/0x003F at all.
Every figure below was re-decoded directly off the raw capture for this
section (not carried from the design spec by memory) and is pinned against
the same bytes, through the real driver and the real `useMonitorSession`
hook, by `src/monitor/burstReplay.test.ts`.

1. **The machine's own finish burst, in order, at exact recorded offsets
   from its own final split (0x0037, seq 514, t=171859.9ms):** 0x0038
   (seq 515) +0.4ms; 0x0039 (seq 516) +269.6ms; 0x003A (seq 517) +270.7ms
   (1.1ms after 0x0039); 0x003F (seq 518) +307.8ms. `transports/fake.ts`'s
   own `FakeBurst` type defaults to these same two offsets (269.6/307.8)
   verbatim, cited to this capture.
2. **State 5→12 directly: state 10 (WORKOUTEND) is never observed on the
   wire.** The last General Status tick before the burst (seq 511,
   t=171319.3ms) reads workoutState byte `0x05` (INTERVALWORKDISTANCE,
   rowing); the next one this driver ever sees (seq 519, t=172309.3ms,
   +449.4ms after the final split) reads `0x0c` (12, WORKOUTLOGGED)
   directly — no intermediate 0x0031 notification anywhere in this capture
   carries state 10. §14's own mapping table names state 12 "reached ONLY
   via `WorkoutEnd->WorkoutLogged` (never via `Terminate`)"; this capture is
   the first evidence that the intermediate WorkoutEnd state can be
   entirely invisible to a BLE subscriber, not merely brief.
3. **The burst beats our own terminal transition on THIS capture** —
   0x0039/0x003A/0x003F, seq 516-518, all land by t=172167.7ms —
   141.6-179.8ms BEFORE the driver's own terminal 0x0031 at t=172309.3ms;
   the final SPLIT, 0x0037 at t=171859.9ms, is earlier still, 449.4ms
   ahead of the terminal, but that gap is item 1's own figure for a
   different, excluded event, not the summary/verification trio this item
   is about. **CORRECTED (final whole-branch review, MEDIUM-1): this is
   n = 1, not "3 of 5".** This walk is the ONLY capture in this repo that
   carries 0x0039/0x003A/0x003F at all (this section's own opening line:
   "the first capture in this repo to carry 0x0039/0x003A/0x003F at
   all") — there is no second burst-bearing recording to count a
   fraction against, and no statistic about the BURST's own race can be
   stated as a fraction of 5. **The "3 of 5" figure that used to sit here
   is real, but it counts a different race**: storage-spine design spec
   §1 and the antagonist ledger both state it as "split-before-terminal
   in 3 of 5 [committed natural finishes]" — the SPLIT (0x0037/0x0038)
   arriving before our own terminal 0x0031, a statistic every committed
   recording can answer because every recording carries a split. This
   capture's own split-vs-terminal reading (449.4ms ahead) is consistent
   with that population but is one data point, not the fraction. The
   correction matters beyond wording: restating a split-vs-terminal
   statistic as a burst-vs-terminal one is recurring-failure #16's shape
   (an unsourced premise repeated until it reads as fact), and reading
   "the summary is late" as the race's usual shape rather than "the
   split is late" was the most plausible origin of the final-review
   HIGH-1 finding — a genuine late-side defect this same PR round fixed
   (`driver.ts`'s `noteSummary` admission gate; item 4 below is unaffected
   by this correction, since it already scoped its own fix to the general
   case, not to a specific fraction).
4. **THE GATE-DISCARD MECHANISM this race exposed, fixed by storage-spine
   design spec §2 (PR 1).** Before that fix, `driver.ts`'s `noteSummary`
   (via `graceIsOpen`) only ever accepted a 0x0039 arriving AFTER this
   driver's own run had closed (`run.closed === true`) — a summary landing
   while the run still read open, however briefly, was routed to the
   out-of-window branch and discarded UNREAD, even though the link
   delivered it perfectly. On the burst-first side of this race that is
   EVERY 0x0039: by construction, the summary is still ahead of the
   terminal 0x0031 that would close the run. The fix adds a bounded BUFFER
   (`noteSummary`'s `currentIndex === lastIndex` branch, gated on this
   run's own `toProgramIndex` reading already naming its LAST interval): a
   0x0039 arriving in that window is held (`run.summaryInGrace`) instead of
   discarded, and is folded onto the record the instant the terminal
   transition's own `maybeReconcileImmediately` finds both the split and
   the held summary already in hand — no `FINISH_GRACE_MS` wait needed on
   this capture's own shape. See `driver.ts`'s `noteSummary`/
   `reconcileSummary`/`maybeReconcileImmediately`, and
   `src/monitor/burstReplay.test.ts`'s end-to-end replay of this exact
   capture for the pinned regression test (byte-identical against a
   burst-stripped control of the same recording, but for the two
   observation fields the fix adds).

## 25. Menu-terminate emits the full log-commit burst (walk 2026-08-24, lab leg) — for the RC-2/RC-3 wave

A mid-piece **Menu** press is a log commit, not a silent abort. Observed
on the web arm with the hold-open instrument (main @ e4afbe5, PM5
432331249, fw 459.069), 1×60s piece terminated at 24.26s/75.6m: the PM5
sent the partial interval's own final 0x0037 (elapsed 24.26s, 75.6m,
rest field 0), then 0x0039 (work-only totals 24.30s/76.0m, log date/time
Aug 24 2026 15:14), 0x003A, and 0x003F — the identical sequence a
natural finish gets (§24), about 1s after the terminate-state 0x0031.
The piece was logged to the PM5's memory the same way. Two residuals,
stated honestly: the 0x0039 byte that reads workoutType came back `01`
on the terminated piece vs `08` on the completed one (raw observation,
not yet interpreted), and the terminate-transition 0x0031 carried
workoutState byte `0b` (with `0d` after the burst) — neither is decoded
anywhere yet. Capture: `docs/monitor/sessions/walk-2026-08-24/
lab-terminate-ring.json`. Consequence for production: the terminated
path needs the same linger/observation capture the finished path got in
storage-spine PR 1 — the machine speaks there too.

### §25 addendum (antagonist pass, 2026-08-24): two more terminate residuals, one falsified hypothesis

- **The layout does NOT shift on a terminated piece** — hypothesis
  falsified by hand-decode: elapsed, distance, drag factor and avg pace
  all land on cross-checking values at their documented offsets
  (24.30s × 500 / 76.0m = 159.87 vs the wire's own 159.8 s/500m).
- **The `01` vs `08` workoutType byte** is most plausibly the machine
  logging a terminated piece under its default/JustRow type
  (`walk-2026-08-23/ring-phone-3-menu-terminate.json` seq 6 shows
  `workoutType=1` before programming) — plausible reading, still
  uninterpreted in code.
- **avgStrokeRate anomaly:** the terminate capture's 0x0039 decodes
  avgStrokeRate 44 while the same burst's 0x0038 reads 22 and 0x0032
  read 29 instantaneous; 22 is the physically coherent value
  (8.5 m/stroke vs an impossible 4.3). One capture, no SCREEN oracle on
  the terminate path yet — the owed terminated-piece PM5 memory
  photograph settles it. Stored verbatim meanwhile.
- **Production hears none of this today**: `ring-phone-3-menu-terminate.json`
  (production phone arm, same event) ends at the terminal with no burst —
  teardown drops the link ~1s before it arrives. The summary-record wave
  spec's four-gate terminate capture is the fix.

**SHIPPED 2026-08-24**: production capture of terminate bursts ships with
the summary-record wave's PR 1 — the four gates (observations-only) —
per `docs/superpowers/specs/2026-08-24-summary-record-design.md` §1.
Production now hears the terminate burst; a terminate-path SCREEN oracle
is still owed (ROADMAP.md's Phase RC owed-walk item).

## 26. Two established facts from the hero-truth antagonist pass (RC-5, 2026-08-25) — for `docs/superpowers/specs/2026-08-25-hero-truth-design.md`

**The PM5 TRUNCATES its own displayed/computed pace; we round.** Two
independent captures, both PRIMARY:

- **lab-terminate-ring.json** (§25): a 1×60s piece terminated at
  24.30s/76.0m. The 0x0039 summary's own Avg Pace reads **159.8** s/500m
  where the quotient `500 × 24.30 / 76.0 = 159.868` would round to 159.9.
  159.8 is the truncation of 159.868 to one decimal, not its rounding.
- **walk-2026-08-20** (`walk-2026-08-20-lt-close/README.md`): the PM5's
  own View Detail screen prints the piece's total split as **2:21.7**
  where its own Total Time (4:14.9 = 254.9s) over its own Total Work
  Distance (899m) gives `500 × 254.9 / 899 = 141.768` s/500m = 2:21.768,
  which rounds to 2:21.8, not the 2:21.7 the machine shows.

`domain/format.ts`'s `fmtSplit` uses `Math.round`. This is why §1 of the
hero-truth spec renders the machine's OWN `avgPaceSecondsPer500m` field
verbatim on tier A rather than a quotient of ours — any quotient we
compute would differ from the screen about half the time, on a machine
whose own displayed number is not obtained by rounding.

**The PM5's Totals row is not the sum of its own displayed interval
rows.** Landing the wire-note candidate `walk-2026-08-20-lt-close/README.md`
flagged but never filed here: that walk's PM5 View Detail screen shows
interval distances 198 + 500 + 203 = **901** m, while its own **total**
row states **899** m — a 2m self-disagreement from rounding each
displayed row before summing. Consequence: any oracle built by summing
the PM5's own displayed per-interval rows carries this error and is not
digit-identical to the machine's own stated total — which is exactly why
the hero-truth spec's tier A reads the machine's OWN totals fields
(`machine_work_seconds`/`machine_work_meters`, and now
`avgPaceSecondsPer500m`) rather than re-deriving them by summing rows we
already have, and why tier B (no machine totals; computed from our own
recorded actuals) never claims digit-identity with the machine.

**Two stale claims this pass found and closed:**

- `app/src/monitor/monitorRun.ts`'s `computeWorkRestSums` doc comment
  used to assert "every committed capture's last boundary [reads 0x0037
  rest] 0, since there is no trailing rest left to measure." **False** —
  the exit-7 capture's own last boundary (`phone-exit7-ring.json` seq 53,
  the FINAL interval of a natural 2×250m/r60 finish) decodes
  `intervalRestTimeSeconds = 60` and `intervalRestDistanceMeters = 95` in
  its own 0x0037 frame (raw `71 27 00 7f 0d 00 31 02 00 fa 00 00 3c 00 5f
  00 01 02`; offsets 12-13 `3c 00` = 60, offsets 14-15 `5f 00` = 95) — a
  real, nonzero trailing rest reading on the machine's own final boundary
  of a completed piece. The comment is corrected in place.
- `LogStep.actualSeconds`'s UNIT CAVEAT (`app/src/session/logDraft.ts`)
  is now SETTLED, not open — see item 22's correction above. The SAME
  seq-53 frame that closes the first stale claim also settles this one:
  `splitIntervalTimeSeconds` (offset 6-8) decodes to `56.1`, matching the
  interval's own real work duration and the PM5's screen (walk table:
  "elapsed :56.1 (56.1s)"), while `intervalRestTimeSeconds` in the SAME
  frame is a separate 60 — proving `actualSeconds` is work-only, not
  work-plus-trailing-rest (a fused reading would show 116.1, not 56.1).

## 27. What the 2026-08-25 walk decoded (0x0037/0x0038/0x0039/0x003A) — for `pm5/parse.ts` and `src/monitor/driver.ts`

Record: `docs/monitor/sessions/walk-2026-08-25/`. Two committed captures —
a three-interval rest-bearing piece closed by a natural finish
(`rests-finished-recording.jsonl.gz`) and a Menu-terminated smoke
(`smoke-terminated-recording.jsonl.gz`) whose PM5 Memory → View Detail screen
was photographed. Every number below was computed from the recordings, not read
off by eye. Field NAMES for previously-unlabelled offsets are tagged INFERENCE
where only consistency supports them; VALUES confirmed by the monitor's own
screen or by an independent formula are tagged PRIMARY.

### 27.1 0x0039 is cumulative and rest-exclusive (settles §23 items 2 and 4)

PRIMARY. The rest-bearing capture's 0x0039 reads 254.8 s / 935 m. Its three
0x0037 splits' OWN time/distance fields (see 27.3) sum to 60.0 + 134.8 + 60.0 =
254.8 s and 218 + 500 + 217 = 935 m — identical. The program carried 120 s of
programmed rest and 0x0039 excludes all of it.

Both §23 premises therefore hold: 0x0039 is a whole-workout cumulative total,
and it counts work only. Every previous 0x0039 in this repo came from a
zero-rest piece, which is why this could not be settled before.

### 27.2 work + rest = Total Work Distance, in the machine's own three numbers

PRIMARY. Same capture: 935 m (0x0039 distance) + 274 m (0x003A Total Rest
Distance) = 1209 m, which is exactly the Total Work Distance the 0x0031 stream
reported at the finish. This is the fact CLAUDE.md's recurring-failure #11 was
written about — TWD is work PLUS rest-coast metres, which is why comparing our
own work-plus-rest accumulator against it was always a mirror. Now witnessed
end to end within one workout, using three independent fields of the machine's.

### 27.3 0x0037's first two fields are workout-cumulative, NOT the interval's own

The interval's own numbers are `[6..8]` (0.1 s) and `[9..11]` (1 m).
`[0..2]`/`[3..5]` are the workout's running elapsed/distance, and on a DISTANCE
interval's boundary they have **already reset**: the rest-bearing capture's
interval 2 reports 0.04 s / 0.2 m in those fields for an interval that really
ran 134.8 s / 500 m. The driver already reads the correct pair; this is written
down so nobody "corrects" it toward the wrong one.

Per-interval rest also lives here: `[12..13]` (1 s) and `[14..15]` (1 m).

| split | `[6..8]` own time | `[9..11]` own dist | `[12..13]` rest time | `[14..15]` rest dist |
| --- | --- | --- | --- | --- |
| 1 | 60.0 s | 218 m | 60 s | 130 m |
| 2 | 134.8 s | 500 m | 60 s | 144 m |
| 3 | 60.0 s | 217 m | 0 s | 0 m |

### 27.4 0x003A's Interval Rest Time is the FINAL interval's, not a total

From the table above: 130 + 144 = 274 m = 0x003A's Total Rest Distance to the
metre, and split 3 — the last, with no trailing rest — reports 0 s, which is
exactly what 0x003A's Interval Rest Time reports in the same burst.

That explains all three captures that read 0: every capture this repo holds
ENDS on a work interval. The field is neither dead nor mis-scaled. It is still
never gated on, but it is now explained rather than merely distrusted.

### 27.5 Average watts: `0x0038[14..15]` and `0x003A[10..11]`

PRIMARY (independent formula, not a mirror of anything we compute). Checked
against Concept2's published power relation `P = 2.80 / pace³` with pace in
s/m, computed from each frame's OWN pace field, four times:

| frame | watts field | predicted from its own pace |
| --- | --- | --- |
| 0x0038 split 2 | 143 | 142.9 |
| 0x0038 split 3 | 132 | 132.6 |
| 0x0038 smoke | 119 | 119.4 |
| 0x003A rests | 139 | 138.5 |

Agreement under 1 W on all four. `0x003A[7]` = split/interval count (3 and 1,
both correct) and `0x003A[8..9]` = calories — both INFERENCE, both consistent
across the two captures.

### 27.6 0x0039's Average Stroke Rate reads exactly DOUBLE on a terminate

**The operational rule: never display 0x0039's average stroke rate for a
terminated piece. Use 0x0038's per-split value.**

| capture | 0x0039 `[10]` | 0x0038 `[3]` | PM5 View Detail `s/m` |
| --- | --- | --- | --- |
| smoke, TERMINATED | **46** | 23 | **23** (PRIMARY — photographed) |
| rests, finished | 24 | 24 / 23 | not photographed |

The monitor's own memory screen sides with 0x0038. The previously committed
terminate capture shows the identical shape (44 against 0x0038's 22): two
terminate captures, both exactly 2×, and the natural finish in the same walk is
clean. **Cause unknown and deliberately not guessed here** — do not write a
mechanism into this section without a capture that shows one.

### 27.7 The terminate path's first screen oracle, and it passes

Everything else on that View Detail screen is digit-identical to the wire, which
is the first independent confirmation that the 0x0039 observations the terminate
path stores are what the monitor itself remembers:

| quantity | PM5 screen | 0x0039 | our accumulator |
| --- | --- | --- | --- |
| time | `:31.5` | 31.5 s | 30.81 s |
| distance | `110` | 110 m | 108.6 m |
| /500m | `2:23.1` | 143.1 s | — |

Our accumulator is short by 1.4 m / 0.7 s because its register closes at the
terminal frame while the machine takes one more sample — expected, and precisely
why the observations are stored alongside it.

### 27.8 `0x0038[4]` carries the value the View Detail screen prints rightmost

INFERENCE on the name, PRIMARY on the value. The byte reads 111 on the smoke,
which is exactly what the photographed screen prints in its rightmost column;
117 and 120 on the rest-bearing capture's later splits. The values track effort
and are physiologically plausible, so this is almost certainly heart rate — which
would mean the belt IS delivering, something this repo had never witnessed (no
belt was asked for on this walk). Note the tension: 0x0039's heart-rate bytes
read 0 in the same burst. Do not build on this until a walk deliberately wears
and does not wear a belt and compares.
