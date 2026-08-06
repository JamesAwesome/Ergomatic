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
| 14-16  | Last Split Time                                      | 0.1 sec/lsb                         |
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
estimate is "Sea Smoke, 25 intervals, ~6 frames"), `buildProgrammingSequence`
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
   frames as it takes — Sea Smoke, the design spec's own named stress case
   with 25 real intervals, needs 7 frames with this implementation's
   packing, an interval count and frame count neither document ever
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
   driver's `intervalRemaining` checkpoint assumes 0x0033's "Last
   Split Time"/"Last Split Distance" (§10, offset 14-19) report the
   SESSION-cumulative point at which the CURRENT interval began (i.e.,
   where the previous interval/split ended) continuously, on every
   regular status tick — not merely once, at a boundary. Neither document
   states an update cadence for these two fields beyond listing them in
   the characteristic's byte table. `src/monitor/driver.ts`'s
   `computeRemainingForFrame` subtracts this pair from
   `MonitorFrame.elapsedSeconds`/`distanceMeters` to recover "progress
   into this interval" with no local observation history at all
   (replacing an earlier, buggier design that rooted a checkpoint at
   whichever tick the driver happened to observe first) — correct only if
   the field genuinely holds steady at the interval's start point for
   that interval's whole duration, updating only at the NEXT boundary.
   The same computation (and its sibling divergence check,
   `src/monitor/driver.ts`'s `"divergence"` log kind) also assumes
   `MonitorFrame.intervalIndex` (0x0033's Interval Count) and
   `IntervalActual.index` (0x0037/0x0038's Split/Interval Number, #1
   above) stay in lockstep frame-to-frame — #1 already flags these as two
   independently-incrementing fields with no documented guarantee of
   agreement; the driver LOGS a disagreement when one is observed (never
   corrects or picks a "winner" between the two). Both flagged for the
   laptop session alongside #1.
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
  terminal-state latch (no un-finishing, confirmed in the field); and
  multi-interval programming working end to end from a clean state. See
  "Answered by laptop session 1" just below for the full list with
  citations.
- **STILL OPEN — must survive as executable runsheet items:** the real
  clear/wipe command remains UNFOUND (item 6 — `terminate()` was tried and
  is NOT it: accepted once with a completed workout present, yet the
  program sent right after was still rejected, twice); whether an accepted
  program's structure is readable back from 0x0031 rather than trusted on
  the bare `armed` ack (item 12); the no-rest work→work boundary index
  (item 13); and distance-kind intervals plus a genuinely multi-FRAME
  program (Sea Smoke's 25 intervals / 7 frames), neither of which has ever
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
5. `intervalRemaining`'s checkpoint computation is correct as rebuilt onto
   0x0033's Last Split fields (§18 #7, item 7 below).
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
   confirmed no longer open. **Residual, still open:** the RESTING half of
   the rule is confirmed; the no-rest work→work boundary is not — see item
   13 below, which carries the only unresolved piece of this item forward.
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
   `WorkoutProgram` — Sea Smoke's 25 intervals need 7) and confirm every
   interval the PM ends up armed with matches what was sent, not only the
   last frame's.
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
7. **STATUS: ANSWERED — CONFIRMED (§18 #7).** `intervalRemaining`'s checkpoint cadence (§15 #8,
   `computeRemainingForFrame`'s comment). Expected: 0x0033's "Last Split
   Time"/"Last Split Distance" hold steady at the current interval's start
   point for its whole duration, updating only at the next boundary.
   Observed: during a multi-interval test workout, watch whether the app's
   own `intervalRemaining` counts down smoothly and hits exactly 0 at each
   boundary, or jumps/glitches (a bad cadence assumption would show as a
   sudden jump partway through an interval, not a boundary).
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
12. **STATUS: OPEN — not yet tested; folded into "The pending
    verification row" below as an extra observation on the same row
    (§18 #12).** Whether an accepted program's structure is readable back (plan
    7A-fix Task 2 review, F2 — `src/monitor/driver.ts`'s `verifyArmed`).
    `program()`'s verification today checks only `state === "armed"`: no
    laptop session has yet read 0x0031's `workoutType`/`workoutDurationRaw`/
    `workoutDurationType` back AFTER a program the PM accepted, so there is
    no confirmed evidence either way that these fields echo what was sent.
    Expected: unknown — `workoutType` should read back
    `WORKOUTTYPE_VARIABLE_INTERVAL` (`0x08`, the only type this codec ever
    sends) and `workoutDurationRaw`/`Type` should match the FIRST
    interval's programmed duration, if the PM treats 0x0031 as an honest
    mirror of its own configuration. Observed: program a workout, wait for
    `"armed"`, and dump `exportLog()`'s `"frame"` entries around that
    point — do `workoutType`/`workoutDurationRaw`/`workoutDurationType`
    match what was sent? If yes, `verifyArmed` can upgrade from "armed
    alone" to a real structural check (comparing against `p`, not just its
    length); if no (or if the PM doesn't refresh these fields until
    rowing starts), the current state-only check stays the strongest
    honest option.
13. **STATUS: OPEN — did not exist during session 1 (added afterward by
    phase-7a-fix Task 3's review), so no data yet.** Needs a
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
   `app/scripts/pm5-lab.ts`'s own constant), which resolves only once
   `verifyArmed` observes `state === "armed"` on the machine (Task 2's
   fix) — a hang here (past `VERIFY_TICKS`, ~10s) is itself a finding, not
   something to route around.
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
  item 12 above).
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

## 18. Laptop session observations (results destination for §17)

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
   correct.** 58.92 s remaining observed at 1.08 s into a 60 s interval,
   re-rooted at 60.0 at the next interval's start, matching
   `computeRemainingForFrame`'s 0x0033-"Last Split"-based design exactly.
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
line. **Not one genuine rejection was ever observed on this hardware.**
Every "rejection" in both sessions was an acceptance that our own parser
mislabelled. Several conclusions recorded in §18 as PM5 behaviour follow
from that mislabelling and are corrected below and in place.

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

- **Does NOT survive:** "the PM accepts a program only when nothing is
  loaded"; "a rejection wipes what was loaded"; "an ack of `0x01` does not
  mean a program landed"; "`terminate()` is not a reliable clear because
  the following program was rejected twice". Each rests on at least one
  reject that was actually an accept.
- **Genuinely still open:** James read an empty `:00` session off the
  monitor after a 2-interval send during [S1]. *Something* emptied that
  display. What it was is now **UNRESOLVED** — it can no longer be
  attributed to "a rejection wipes it", because there was no rejection.
  Programming over a live/loaded workout remains the prime suspect, and 7B's
  "prove the monitor idle before programming" requirement stands on its own
  merits regardless.
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

> For any fixed duration workout (defined end) that reaches its defined end:
> `WaitToBegin->WorkoutRow->WorkoutEnd->WorkoutLogged->[Menu button]->WorkoutRearm->WaitToBegin`
>
> `WaitToBegin->WorkoutRow->WorkoutEnd->WorkoutLogged->[Terminate command]->WaitToBegin`

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

The silence is ours: `src/monitor/driver.ts` latches terminal states
(`terminalLatched`, `:233`/`:617-628`) and short-circuits every subscription
callback afterwards, by design ("Appendix E's auto-cycle never un-finishes a
session"). Reconnecting resets the latch, which is exactly why frames
resumed instantly — the radio and the erg were never the variable.

**Verdict: OUR BUG.** The latch itself is a legitimate design choice and
[S1] confirmed it does its job (no un-finishing). What was wrong was the
*conclusion drawn from it* — that the PM5 goes quiet after a workout and
needs a reconnect. It does not. [OSS] adds a supporting note from the other
direction: nobody else documents a "PM goes silent at workout end" symptom,
and the spec explicitly promises continued notifications for at least a
minute after the end (the revised recovery-HR summary, §19.9). A driver that
wants to keep working after `workoutComplete` should send terminate and
carry on, not drop the connection.

### 19.5 No command clears a loaded workout — **REAL PM5 BEHAVIOUR, DOCUMENTED**

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

**Verdict: REAL PM5 BEHAVIOUR, DOCUMENTED.** No clear command exists; the
absence is deliberate, and Rearm is the reason.

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
above, which exists to make the assumption visible rather than silent, did
its job: it fired on the very boundary that disproves the assumption.

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

**Verdict: REAL PM5 BEHAVIOUR, DOCUMENTED.** Keep the both-map-to-null
behaviour; correct its stated justification from "no source distinguishes
them" to "the sources distinguish them per-field, and defensive clients
(and this hardware) show both values in the wild". `statusFrames.ts`
continuing to ENCODE `null` as the documented `255` also stays right — one
encoder cannot write two sentinels for one state.

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
