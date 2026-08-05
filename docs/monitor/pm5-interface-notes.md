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
| 6      | Workout Type (enum, §7 above / Appendix A)                                                                                                                 | —                                                                                                                                                                                                                                                                                   |
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

None of these change the SHAPE of `parse.ts`'s output — each is a specific
value-mapping choice made and clearly commented at its call site, listed
here together for the laptop-vs-real-PM5 session (alongside the three
disputed checksums in §6):

1. **Interval numbering base.** `CSAFE_PM_GET_WORKOUTINTERVALCOUNT`'s
   READ-side value (0x0033 offset 3, "Interval Count") and 0x0037/0x0038's
   "Split/Interval Number" are never shown with a worked example's decoded
   value in either document (unlike the WRITE-side index in §12, confirmed
   0-based). `parse.ts` passes the raw byte through unadjusted into
   `MonitorFrame.intervalIndex`/`IntervalActual.index` — if the real PM
   reports a 1-based count here, every consumer downstream is off by one
   until the laptop session confirms it. **These are also two SEPARATE wire
   fields, not one value read twice**: `MonitorFrame.intervalIndex` comes
   from 0x0033's "Interval Count" (a live-status characteristic, sampled at
   the general/additional-status rate, §4); `IntervalActual.index` comes
   from 0x0037/0x0038's "Split/Interval Number" (an interval-boundary
   characteristic). Nothing in either document guarantees these two
   counters stay in lockstep frame-to-frame — a 7C consumer correlating a
   `frame` event's `intervalIndex` against an `intervalComplete` event's
   `actual.index` is matching two independently-incrementing fields by
   value, not reading one field from two places; a driver-level skew
   between them (a dropped notification, a boundary race) would surface as
   a real but silent mismatch, not a crash.
2. **0x0038's Work/Rest Heartrate sentinel.** Only 0x0032's Heartrate field
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
   single largest untested assumption.** Every worked programming example
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
   flow** (§11-13 — `CSAFE_RESET_CMD`/`CSAFE_GOIDLE_CMD` are PUBLIC CSAFE
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
