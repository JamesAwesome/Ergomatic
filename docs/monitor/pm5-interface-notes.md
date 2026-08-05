# PM5 interface notes — cited facts for the CSAFE codec

Every constant and byte example in `app/domain/monitor/csafe.ts` and
`app/domain/monitor/pm5/framer.ts` cites an entry in this file; every entry
here cites the primary document. This file states facts and citations, not
the documents themselves.

**Documents used** (fetched 2026-08-05 via WebFetch from the concept2.nl
mirror — the concept2.co.in mirror fails TLS verification and was not used):

| Document | Revision | URL | Local page count (pdftotext) |
|---|---|---|---|
| Concept2 PM Bluetooth Smart Communication Interface Definition | 1.30 | `https://www.concept2.nl/files/pdf/us/monitors/PM5_BluetoothSmartInterfaceDefinition.pdf` | 39 |
| Concept2 PM CSAFE Communication Definition | 0.27 | `https://www.concept2.nl/files/pdf/us/monitors/PM5_CSAFECommunicationDefinition.pdf` | 162 |

Page counts match the adversarial review's independent fetch exactly
(`.superpowers/sdd/2026-08-05-phase-7a/spec-review.md`), confirming these are
the same document revisions. All facts below were re-extracted independently
from the fetched PDFs (via `pdftotext -layout`), not copied from the review.

## 1. Frame structure (CSAFE doc, standard frame — no extended addressing)

```
Standard Start Flag | Frame Contents | Checksum | Stop Flag
```

**Table 5 — Unique Frame Flags** (CSAFE doc p.9):

| Description | Value |
|---|---|
| Extended Frame Start Flag | `0xF0` |
| Standard Frame Start Flag | `0xF1` |
| Stop Frame Flag | `0xF2` |
| Byte Stuffing Flag | `0xF3` |

**Table 6 — Byte Stuffing Values** (CSAFE doc p.9): each occurrence of a flag
byte *within the frame contents or checksum* is replaced by two bytes —
the Byte Stuffing Flag followed by a code byte:

| Frame Byte Value | Byte-Stuffed Value |
|---|---|
| `0xF0` | `0xF3, 0x00` |
| `0xF1` | `0xF3, 0x01` |
| `0xF2` | `0xF3, 0x02` |
| `0xF3` | `0xF3, 0x03` |

"The impact of this technique on the data link is that the frame size could
increase in size by a factor of two in the worst case" (CSAFE doc p.9).
Stuffing applies to the checksum byte too, not only the payload — the
document's own Fixed Distance example (proprietary, 2000m/500m splits)
response frame is annotated `F3 or 72 Stuff byte flag (checksum = F2) or
checksum`, i.e. *if the computed checksum happens to equal a flag value, the
checksum byte itself gets stuffed* (CSAFE doc p.81 — the same citation used
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
*unstuffed* bytes; stuffing is applied afterward to the payload-plus-checksum
byte sequence before framing.

## 3. Frame budget (CSAFE doc p.9)

> "1. A maximum frame size of 120 bytes including start/stop flags, checksum
> and byte stuffing
> 2. All flow control handled natively as part of physical link"

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
`pm5/commands.ts` (a later task), which assembles one command's bytes at a
time and is responsible for not asking `packPayload` to split mid-command.

## 4. BLE write/notify byte budget (BLE doc p.12)

| Characteristic | Value | Notes |
|---|---|---|
| `0x0021` C2 PM receive (control write) | Up to 20 bytes | WRITE — control command as a CSAFE frame |
| `0x0022` C2 PM transmit (control response) | Up to 20 bytes | READ/NOTIFY — response as a CSAFE frame |

This is why a packed CSAFE frame (up to 120 bytes) must be further split
into ≤20-byte pieces for the BLE write — `chunkFrames` in `pm5/framer.ts`.

`0x0034` (BLE doc p.16) sets the general/additional-status notification
rate: `0` = 1 s, `1` = 500 ms (**default if not explicitly set**), `2` =
250 ms, `3` = 100 ms. Not used by Task 1's pure codec/framer, but recorded
here since it is read from the same document pages and future tasks (the
driver) must write it at connect.

## 5. Workout state enum (BLE doc Appendix A, p.37) — for later tasks

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
document, matching the adversarial review's citation exactly) so a later
task does not re-fetch the document to get it.

## 6. Byte-vector examples (CSAFE doc pp.79–90) — non-exhaustive

**This list is not the complete set of worked examples in the document** —
it is the ones exercised by `csafe.test.ts` and `framer.test.ts`, plus a
handful more recorded here because a later task (`pm5/parse.ts`, response
parsing) needs verified RESPONSE-side vectors and Task 1 had none. The
document has other worked examples (Fixed Calories, Fixed Calorie Interval,
Predefined list selection, force-curve polling, etc. — see p.77–90 generally)
not all of which are transcribed here.

**Methodology:** every byte value below comes from the document's row-by-row
command tables. Two of the document's *own* forms of the same example
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

| # | Example | Doc page | Frame (hex) | Checksum |
|---|---|---|---|---|
| 1 | Predefined — Standard List Workout #3 (public CSAFE, short frame) | p.79–80 | `F1 24 02 03 00 25 F2` | `0x25` |
| 2 | JustRow (proprietary) | p.80 | `F1 76 07 01 01 01 13 02 01 01 61 F2` | `0x61` |
| 3 | Fixed Distance 2000m/500m splits (proprietary) | p.81 | `F1 76 18 01 01 03 03 05 80 00 00 07 D0 05 05 80 00 00 01 90 14 01 01 13 02 01 01 28 F2` | `0x28` |
| 4 | Fixed Time 20:00/4:00 splits (proprietary) | p.81–82 | `F1 76 18 01 01 05 03 05 00 00 01 D4 C0 05 05 00 00 00 5D C0 14 01 01 13 02 01 01 E0 F2` | `0xE0` |
| 5 | Fixed Distance Interval 500m/:30 rest (proprietary) | p.83 | `F1 76 15 01 01 07 03 05 80 00 00 01 F4 04 02 00 1E 14 01 01 13 02 01 01 0A F2` | `0x0A` |
| 6 | Variable Interval Undefined Rest v100m…2 (proprietary) | p.87–88 | `F1 76 45 18 01 00 01 01 08 17 01 04 03 05 80 00 00 00 64 04 02 00 00 06 04 00 00 32 C8 14 01 01 18 01 01 17 01 03 03 05 00 00 00 2E E0 04 02 00 00 06 04 00 00 32 C8 14 01 01 01 01 09 05 05 80 00 00 00 00 13 02 01 01 8F F2` | `0x8F` |
| 10 | Fixed Distance 2000m/500m splits (**public** CSAFE, `CSAFE_SETHORIZONTAL_CMD`) | p.79 | `F1 21 03 02 00 21 1A 07 05 05 80 F4 01 00 00 34 03 C8 00 58 24 02 00 00 E8 F2` | `0xE8` |
| 11 | Fixed Time 20:00/4:00 splits (**public** CSAFE, `CSAFE_SETTWORK_CMD`) | p.79–80 | `F1 20 03 00 14 00 1A 07 05 05 00 C0 5D 00 00 34 03 64 00 58 24 02 00 00 9A F2` | `0x9A` |
| 12 | Fixed Calories 100 Cals/20 Cal splits (proprietary) | p.82–83 | `F1 76 18 01 01 0A 03 05 C0 00 00 00 64 05 05 C0 00 00 00 14 14 01 01 13 02 01 01 17 F2` | `0x17` |
| 13 | Get Force Curve — `CSAFE_PM_GET_STROKESTATE` command | p.90 | `F1 1A 01 BF A4 F2` | `0xA4` |
| 14 | Get Force Curve — `PM_CSAFE_GET_FORCEPLOTDATA` command | p.90 | `F1 1A 03 6B 01 14 67 F2` | `0x67` |

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

| # | Example | Doc page | Frame content (hex, incl. status, excl. flags/checksum) | Checksum (status=`01`) | Checksum (status=`81`) |
|---|---|---|---|---|---|
| R1 | Fixed Distance response (public CSAFE) | p.79 | `01\|81 1A 00` | `0x1B` | `0x9B` |
| R2 | JustRow response (proprietary) | p.80 | `01\|81 76 02 01 13` | `0x67` | `0xE7` |
| R3 | Get Force Curve — `CSAFE_PM_GET_STROKESTATE` response | p.90 | `09 1A 03 BF 01 04` (status here is `09`, not `01`/`81` — this response reports live StrokeState, not a program-command ack) | `0xAA` | — |

R1 and R2 are the pair the design spec's own byte-vector discipline
(§Errata) was written against but never enumerated; R3 is a genuinely
different response shape (a data-read response, not a programming-command
ack) confirming the same checksum rule applies uniformly to both.

### 3 errata (document checksum does NOT match the XOR rule — §Errata, M1)

For each, the test suite asserts **our computed checksum against the rule**,
never the document's printed (wrong) value — a test encoding the printed
value would fail against a correct implementation.

| # | Example | Doc page | Frame content (hex, excl. checksum/flags) | Doc checksum | Computed (XOR rule) |
|---|---|---|---|---|---|
| 7 | Fixed Time Interval 2:00/:30 rest | p.83–84 | `76 15 01 01 06 03 05 00 00 00 2E E0 04 02 00 1E 14 01 01 13 02 01 01` | `0x0A` | `0xB0` |
| 8 | Variable Interval v500m/1:00r…4 | p.85–87 | `76 6F 18 01 00 01 01 08 17 01 01 03 05 80 00 00 01 F4 04 02 00 3C 06 04 00 00 27 10 14 01 01 18 01 01 17 01 00 03 05 00 00 00 46 50 04 02 00 00 06 04 00 00 27 10 14 01 01 18 01 02 17 01 01 03 05 80 00 00 03 E8 04 02 00 00 06 04 00 00 27 10 14 01 01 18 01 03 17 01 00 03 05 00 00 00 75 30 04 02 00 78 06 04 00 00 27 10 14 01 01 13 02 01 01` | `0xC6` | `0x09` |
| 9 | Terminate Workout | p.89 | `76 04 13 02 01 02` | `0x62` | `0x60` |

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

| ID | Name |
|---|---|
| `0x01` | `CSAFE_PM_SET_WORKOUTTYPE` |
| `0x03` | `CSAFE_PM_SET_WORKOUTDURATION` |
| `0x04` | `CSAFE_PM_SET_RESTDURATION` |
| `0x05` | `CSAFE_PM_SET_SPLITDURATION` |
| `0x06` | `CSAFE_PM_SET_TARGETPACETIME` |
| `0x13` | `CSAFE_PM_SET_SCREENSTATE` |
| `0x14` | `CSAFE_PM_CONFIGURE_WORKOUT` |
| `0x17` | `CSAFE_PM_SET_INTERVALTYPE` |
| `0x18` | `CSAFE_PM_WORKOUTINTERVALCOUNT` (during programming: the zero-based **index** of the interval being configured, not a count — the same ID read back is a count; naming trap noted by the review, M1) |
| `0x21` | `CSAFE_SETHORIZONTAL_CMD` (public CSAFE) |
| `0x24` | `CSAFE_SETPROGRAM_CMD` (public CSAFE) |
| `0x76` | C2 proprietary wrapper |
| `0x1A` | `CSAFE_SETUSERCFG1_CMD` (public CSAFE wrapper) |

Not used by Task 1's implementation (no command semantics in `csafe.ts` or
`framer.ts` — both are byte/frame-level only); recorded for `pm5/commands.ts`
(a later task) to cite without re-fetching the document.
