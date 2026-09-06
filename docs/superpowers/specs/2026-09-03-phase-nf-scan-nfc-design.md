# Phase NF — Scan NFC to connect and program a PM5

**Date:** 2026-09-03
**Status:** HARDENED AND APPROVED — James approved the written design after
hardening on 2026-09-03. Product implementation remains separately unscheduled.
**Branch:** `codex/phase-nf-nfc-design`, based on `main@c2182ef5`.
**Risk:** architectural platform-input and radio-concurrency work; no stored
shape, authentication, or server change.
**Design baseline:** `pnpm --dir app test` on the clean application tree at
`main@c2182ef5` — 255 files passed, 6,963 tests passed, 1 skipped.
**Contract paste-test:** the TypeScript blocks below were compiled and linted
together at `app/domain/monitor/nfcSpecPasteTest.ts` on the hardening worktree
based on `codex/phase-nf-nfc-design@ee3dea77` with
`pnpm --dir app typecheck` and `pnpm --dir app lint`; both passed, then the
temporary file was removed.
**Gate 0:**
[`docs/design/handoffs/2026-09-03-phase-nf-scan-nfc/gate0.html`](../../design/handoffs/2026-09-03-phase-nf-scan-nfc/gate0.html).
**Gate -1 proof plan:**
[`docs/superpowers/plans/2026-09-03-phase-nf-gate-minus-one.md`](../plans/2026-09-03-phase-nf-gate-minus-one.md).

## What and why

Workout detail already has the complete PM5 programming handoff, but choosing a
monitor still opens a list. A rower standing at one erg should be able to use the
NFC tag built into that PM5 to identify it, then let Ergomatic connect and program
the workout without a Bluetooth picker or a second confirmation.

On an NFC-capable iPhone, workout detail gains a filled muted-green **Scan NFC**
button immediately above the existing filled blue **Connect** button. The two
are equal primary hardware routes. A successful read gives success haptics and a
brief `✓ PM5 found` state, then enters the existing connected interstitial,
connects only to the advertised PM5 name encoded by the tag, and programs the
already-compiled workout. The existing **Connect** path remains unchanged.

This phase is a convenience path, not a new monitor session. NFC identifies a
candidate; the established Bluetooth transport, `useMonitorSession`, PM5 driver,
`armed` acceptance point, connected surface, and logging flow remain authoritative.

## Approved rulings

1. The trigger is explicit. Ergomatic does not listen merely because workout
   detail is open.
2. The label is exactly **Scan NFC**.
3. The button appears only when the native NFC adapter reports supported
   hardware. Unsupported devices, the simulator, and web render no placeholder.
4. It sits directly above **Connect**, uses a muted fern fill, and has the same
   56 px primary geometry and visual weight as **Connect**.
5. After a valid PM5 record, Ergomatic commits and paints the success state,
   then automatically connects and programs. There is no second app tap or
   duration timer.
6. NFC narrows discovery to the tag's advertised PM5 name. It never falls back
   to a general picker or a strongest-signal guess.
7. If that PM5 is not advertising, show:
   `Open Connect Device on this PM5, then try again.`
8. A non-PM5 record shows: `Unsupported NFC tag`.
9. The NFC route uses the same stale/unlogged-session safety authorization as
   **Connect**. It cannot bypass or duplicate that guard.
10. Phase NF ships for the native iOS app only. Android is a future adapter;
    web remains a test harness and never displays the button.

## Does the underlying system have the concept?

Yes, with hardware proof still owed.

- Concept2's PM5 Bluetooth interface definition says a PM5 exposes an NFC-A NDEF
  tag. Its first record is the external type
  `concept2.com:bleconnectinfo`, containing a six-byte BLE address, a one-byte
  address type, and an advertising name of up to 31 bytes. Concept2 states that
  the record is sufficient to establish a BLE connection. The same document
  says the PM5 advertises while on **Connect Device**. Those are real PM5
  concepts, not identifiers invented by Ergomatic.
- iOS Core NFC can read NDEF external-type records in a foreground reader
  session. It cannot silently listen while workout detail is open, and the PM5's
  external record cannot use iOS's URI-only background-tag launch route. A
  user-initiated system scan sheet is therefore the native shape.
- CoreBluetooth gives the app an opaque peripheral identifier, not the BLE
  address in the NFC payload. The hardware address is ignored on iOS. The bridge
  from NFC to CoreBluetooth is the PM5 advertising name.
- `@capacitor-community/bluetooth-le@8.3.0` exposes a non-picker
  `requestLEScan` callback whose `localName` comes from the current advertisement
  packet. That is the field to compare. Its `device.name` and native
  `CBPeripheral.name` can be cached and are not identity evidence.

The load-bearing owed fact is exact string identity on James's actual PM5: the
ASCII name decoded from the complete NFC record must equal the same unit's live
CoreBluetooth `localName`.
The checked-in Flipper capture does not prove this. It stops after the NDEF
header; it proves compatible TNF/type-length/payload-length fields, not the
literal type or payload bytes.

## PM5 NFC availability (added 2026-09-06; no copy change, no Gate 0)

**What and why.** On 2026-09-05 an iPhone NDEF reader session found no PM5 tag
in two consecutive 60 s windows minutes after a successful tag read and BLE
connect on the same erg, with the phone held at the spot; a PM5 battery pull
preceded the next observed successful read. The cause is not identified and
five alternatives remain live (PM5 RF-silent, PM5 NDEF-layer fault, phone Core
NFC fault, PM5 asleep, suppression while BLE-connected); a control-tag bracket
the next evening did not reproduce it. Full record:
`docs/superpowers/research/2026-09-05-pm5-nfc-availability.md` (rev 2).
This design had assumed the tag is always present. It is not a sticker: the
PM5 emulates a Type 2 tag on its own controller (CC `E1 10 7C 0F`, non-NXP
UID; `docs/monitor/nfc/README.md`), so an availability state on the PM5 side
is possible, and Concept2's firmware notes describe NFC "wake-up behaviour"
without saying when the tag is or is not offered. The product therefore
designs for "no tag found" as an ordinary outcome rather than an anomaly.

**Rules (binding on the product PR):**

1. **No tag found is an expected outcome, not an error class.** The existing
   `system reader timeout` state and its copy (`No NFC tag detected. Try
   again.`, states table above) already handle it, returning to workout
   detail where the manual `Connect` action remains. No new state, copy or
   surface is added; no Gate 0 is triggered.
2. **Do not attribute a cause.** Copy, logs, receipts and analytics record the
   reader ending as observed (Core NFC code, duration) and never assert
   "PM5 off", "phone fault" or "too far". One occurrence, five explanations,
   no oracle that separates them in the field.
3. **No rule may be conditioned on the PM5's power cycle or session history.**
   The app cannot observe when the erg was last powered up or whether a prior
   connect happened on this power cycle; any behaviour keyed on that would be
   untestable and unimplementable.
4. **Manual `Connect` staying present is not the rejected picker fallback.**
   "Fallback to the picker on timeout" (Rejected approaches) means automatically
   opening the device picker, which silently changes an exact-target intent;
   it stays rejected. "Target timeouts never degrade to manual" (Failure and
   concurrency contract) governs the BLE targeting stage after a successful
   read. Neither is touched by a reader that found no tag: the user is back on
   workout detail with the same two actions they started with.
5. **Instrumentation.** Each attempt's receipt carries the reader ending code
   and rf-active duration (already emitted by the diagnostic trace as
   `ndef.ending` with `code`), so a future field pattern can be attributed
   from data rather than from a single evening.

**Consequence for Gate -1.** Criterion 9's remaining device-probe cases were
cut as ship gates on 2026-09-06 (antagonist verdict; `REMAINING-PROOF.md`,
"Ship decision"): they exercised probe-only stage holds, and the harm ceiling
of any interference is exactly rule 1's recoverable return to workout detail.

## Reader-ending seam (found 2026-09-06; ruled the same day: option A)

**What and why.** Gate -1 criterion 7 asks the native receipts to distinguish
user cancellation, the no-tag timeout and a forced generic invalidation, and
the failure contract below promises that zero or multiple tags "fail closed as
`Unsupported NFC tag`". Writing the native-injected test for criterion 8
showed that the second promise could not be kept by the plugin as first
patched, and that the third leg of criterion 7 was never producible on
hardware. James ruled for option A the same day: **the controller says why it
ended a session**, so the JS layer never infers a rejection from a code that
also means Cancel. Implemented in the checked-in patch with injected tests
(record in `REMAINING-PROOF.md`); the spec's states table and copy are
unchanged, so no Gate 0.

**Evidence.**

- PRIMARY, CoreNFC SDK header `NFCError.h` (Xcode 26.6): the five session
  invalidation codes are `UserCanceled = 200`, `SessionTimeout` (201),
  `SessionTerminatedUnexpectedly` (202), `SystemIsBusy` (203),
  `FirstNDEFTagRead` (204). `NFCReaderSession.h` documents
  `invalidateSessionWithErrorMessage:` only as "Closes the reader session … The
  specified error message and an error symbol will be displayed momentarily on
  the action sheet"; it names no error code for the delegate.
- PRIMARY, our captures (`NORMAL-TRACE-V8-RESULT.md`, v7 likewise): the ending
  that follows the probe's own `stopScanning` (a programmatic `invalidate()`
  after a successful read) carries Core NFC code 200, the same code a Cancel
  tap produces (`PRE-REPAIR.md`, `sheet-cancel` → `userCancelled`).
- PRIMARY, the plugin as first patched (`nfcSessionEndReason`): the
  `nfcSessionEnd` reason was computed from the Core NFC code alone
  (200 → `userCancelled`, 201 → `sessionTimeout`, 204 → no event, anything
  else → `invalidated`), and the controller's own rejections carried no cause,
  so a multi-tag rejection was indistinguishable from Cancel at the JS seam.
- INFERENCE: `invalidate(errorMessage:)` also delivers 200. The header is
  silent; v5's generation-2 trace (`error → ending`, code 200, private under
  R) came from a run where the probe also issued a stop, so it does not
  separate the two. The rule below holds for every code, so nothing depends
  on this inference; the injected test drives both 200 and 202.
- PRIMARY, `PRE-REPAIR.md` and the receipt census (`grep '"action"'` over the
  committed receipts): only `sheet-cancel` and `no-tag-timeout` endings were
  ever produced on the device. Codes 202 and 203 originate in the system and
  no operator action forces them, so the "forced generic invalidation" leg of
  criterion 7 is provable only by injection, and now is.

**Rule (binding on the product PR).** The patched NDEF controller records why
it ended a session and publishes it:

```
nfcSessionEnd { attemptId, reason: "invalidated", cause: "multipleTags" | "tagFailure" }
```

- `multipleTags`: the delegate delivered zero or several tags; the sheet shows
  `Present exactly one NFC tag.` and nothing was connected. (Corrected
  2026-09-06, hardening lens 1: the plugin implements `didDetectTags:`, so
  every session is a read-write session and `didDetectNDEFs:` is never
  called — `NFCNDEFReaderSession.h`, PRIMARY: _"A read-write session does not
  trigger the -readerSession:didDetectNDEFs: method."_ The controller's
  several-messages rejection and its injected test are unreachable defence in
  depth, not a producer.) `tagFailure`: connect, query or read failed on the
  one tag — INCLUDING the plugin's read-failure path that publishes a tag
  event with no `ndefMessage` and does not invalidate (reachable because
  Ergomatic sets `invalidateAfterFirstRead: false`); the JS reader settles
  that event as `tagFailure` rather than waiting for an ending that never
  comes (lens 1, F3).
- Endings the controller did not force carry no `cause`, and their `reason`
  stays code-derived (200 `userCancelled`, 201 `sessionTimeout`, 204 silent,
  else `invalidated`). A `cause` always comes with `reason: "invalidated"`,
  whatever code Core NFC delivered.
- JS maps: `cause: multipleTags` → `Unsupported NFC tag` (the failure contract
  line stands as written); `cause: tagFailure` and bare `invalidated` (202/203)
  → `NFC scan stopped. Try again.`; bare `userCancelled` → quiet return; bare
  `sessionTimeout` → `No NFC tag detected. Try again.`. This is not an inferred
  distinction: the controller knows what it did.
- Scope: the NDEF reader session only. The plugin's `NFCTagReaderSession`
  path keeps its released behaviour; Ergomatic never starts it
  (`iosSessionType: "ndef"`).

**Lifetime of the cause.** One entry per attempt ID in a session-queue-only
dictionary. Minted when the controller invalidates a LIVE owned session with a
message (never on a plain stop, never on a session it no longer owns).
Consumed by that attempt's own `didInvalidateWithError`, the only reader, and
removed there whether or not an ending is published. A superseding start,
WebView reload or relaunch cannot alias it: a new attempt with the same ID
starts only after the old one drained, which consumed the entry (injected
test `testForcedCauseIsConsumedByItsOwnEndingAndCannotReachAReusedAttemptId`).

## Gate -1 — real hardware truth before product implementation

No product UI or connection behavior is implemented until a disposable native
probe on a real iPhone and PM5 proves all of the following:

1. The exact `@capgo/capacitor-nfc@8.2.5` package with Ergomatic's checked-in
   pnpm patch, using `iosSessionType: "ndef"`, receives the PM5 record as raw
   `tnf`, `type`, and `payload` byte arrays.
2. The observed record has TNF `0x04` and literal type bytes decoding exactly to
   `concept2.com:bleconnectinfo`.
3. The payload's actual padding/termination rule is recorded. The Concept2 table
   describes the three fields but does not explain the partial capture's
   40-byte payload, so implementation must not guess where the variable-length
   name ends.
4. On separate fresh NFC/BLE attempts, the ASCII-decoded advertising name
   equals the live `ScanResult.localName` string from that same PM5 exactly. The
   BLE plugin exposes no raw advertising-name bytes, so this gate does not claim
   a byte comparison across that seam.
5. `requestLEScan` discovers the PM5 with no device sheet and its returned
   `deviceId` connects successfully.
6. A signed device build starts a reader session with the NFC Tag Reading
   capability, nonempty `NFCReaderUsageDescription`, and generated
   `com.apple.developer.nfc.readersession.formats` entitlement present in the
   built app.
7. On-device receipts distinguish user cancellation, the system no-tag timeout,
   and a forced generic invalidation. If the released plugin collapses those
   native endings, the product copy collapses with it rather than guessing.
   (Resolved 2026-09-06, "Reader-ending seam": cancel and timeout proven on
   device; generic invalidation is system-originated and proven by injection;
   the controller's own rejections publish a `cause` so no copy collapses.)
8. The patched native session controller echoes the caller's opaque attempt ID
   on every record and ending, rejects a delegate callback containing zero or
   multiple physical tags, and resolves stop only after that exact session can
   no longer emit.
9. An injected-native lifecycle test covers attempt A (the gate; countable exit
   1 and the NO-GO list route drain/identity here — the device probe's
   stop-during-connect result of 2026-09-06 corroborates and is on file, and its
   remaining stage-hold cases were cut as ship gates the same day, see
   `docs/monitor/sessions/phase-nf-gate-minus-one/REMAINING-PROOF.md`)
   stopping during connect/query/read, a process-live WebView reload, and an
   immediate attempt B. No retained or late A callback can settle, stop, or
   clear B.

The proof receipt records the iPhone model and iOS version, PM5 model and
firmware, UTC timestamp, captured record bytes, decoded name, live `localName`,
and observed time from BLE scan start to first matching advertisement for each
attempt. It adds a complete, redacted native-shaped capture beside
`docs/monitor/nfc/pm5-tag-2026-08-31-partial.nfc` and corrects that README's
current overclaim that the partial file proves the literal type. Redaction may
zero the six address bytes, but must preserve record framing, address type,
padding, and advertising-name bytes so the parser fixture stays faithful.

Failure of the NDEF shape, exact-name bridge, nonmodal discovery, signed reader
session, or native identity/drain contract is NO-GO for this architecture. If
native receipts cannot distinguish the reader-ending reasons, the product uses
one honest state and copy rather than inferred distinctions. Do not replace
exact matching with RSSI, a `PM5` prefix, a cached name, or the NFC MAC address.
Return to design.

## Product scope

### In

- Native iOS capability probe and conditional workout-detail action.
- A checked-in patch to the exact NFC dependency version, with native session
  identity, drain, and single-physical-tag enforcement.
- Foreground NDEF scan of one tag per attempt.
- Strict PM5 record parsing into an ephemeral advertising-name target.
- Success haptic/check state followed immediately by the existing connected
  interstitial.
- Picker-free exact-name BLE discovery, including an already-connected-device
  check.
- Existing safety guard, programming, `armed` acceptance, retry, cancellation,
  connected surface, and log flow.
- Redacted instrumentation and a replayable native-shaped NFC fixture.
- iOS entitlement, usage description, dependency, project, signing, and release
  verification.

### Out

- Background NFC reading or launching Ergomatic with the app closed.
- Android NFC/AAR handling.
- Web NFC.
- Pairing a PM5 that is not on **Connect Device**.
- Using the six-byte BLE address on iOS.
- Trusting NFC as authentication. A copied/spoofed tag or an unobserved
  duplicate advertised name can misdirect this convenience lookup.
- Persisting tag identifiers, raw payloads, BLE addresses, or a preferred PM5.
- Replacing the manual **Connect** picker.
- Automatically putting the PM5 into advertising mode.
- General NFC actions, workout selection from a tag, or starting a phone-timer
  session.
- Any PM5 driver, CSAFE, workout compilation, monitor-run, or log schema change.

## Gate 0 — interaction and visual contract

### Placement and hierarchy

Workout detail's action stack becomes:

1. **Scan NFC** — 56 px, filled `--action-nfc` fern.
2. **Connect** — the existing 56 px `--action-connect` blue.
3. **Start Timer** — existing L2.
4. **Log it after** — existing L2.
5. Existing owner actions.

The user selected the two-equal-routes option. This deliberately supersedes the
current source comments and design assertion that **Connect** is the screen's
single primary (`ConnectAction.tsx:28-35`, `WorkoutDetail.tsx:468-475`, and
`e2e/design.spec.ts`'s primary-action check). Implementation creates a
screen-specific `.button-nfc`, not a stray `.button-l1`, and amends the design
test and design reference in the same PR.

The NFC-absent layout is exactly today's layout: no disabled button, empty gap,
caption, or reserved height. During the initial async capability state it is
also absent. Capability may be cached for the app process after first resolution;
it is never persisted.

### Tokens and accessibility

| Use                       | Token/value                   |                Measured contrast |
| ------------------------- | ----------------------------- | -------------------------------: |
| NFC rest fill             | `--action-nfc: #49624f`       | cream text `#fffdf7`: **6.57:1** |
| NFC boundary against page | `#49624f` / `#f4f1e8`         |                       **5.92:1** |
| NFC pressed fill          | `--action-nfc-hover: #3f5545` |           cream text: **7.95:1** |
| Existing Connect fill     | `#2a6275`                     |           cream text: **6.65:1** |
| Existing secondary        | ink / surface                 |                      **17.11:1** |
| Inline message            | ink / sunken                  |                      **14.50:1** |
| Failure marker            | accent / sunken               |                       **5.03:1** |
| iOS-sheet sample text     | `#111111` / `#f2f2f7`         |                      **16.92:1** |
| iOS-sheet sample glyph    | fern / white                  |                       **6.68:1** |

Both hardware buttons retain the 56 px control height, exceeding the 44 px
target floor. Text and filled boundaries clear WCAG AA. Focus treatment follows
the existing screen-level control rule and must remain visible against both
fills.

The accepted portrait cost is 68 px: 56 px control plus the stack's 12 px gap.
On a 390×844 personal-workout detail (the Gate 0 workout: 20:00 @ 6k, then
0:30 @ MAX), **Delete workout**'s bottom edge drops under the tab bar on the
initial fold — its label still reads, and it remains reachable by normal
vertical scroll. That is what the committed capture shows
(`docs/screenshots/workout-detail-nfc.png`, unscrolled, 2026-09-06); the
Gate 0 artifact's own sentence ("moves below the initial fold") over-stated
the cost by roughly one control's height and is superseded by the capture
(whole-branch review B5). The workout and all happy paths remain in the first
viewport. Landscape keeps today's centered, scrolling document column; Phase NF
does not invent a landscape reflow.

### User-visible states and copy

| State                     | Surface                     | Copy/behavior                                                                           |
| ------------------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| ready                     | workout detail              | `Scan NFC`                                                                              |
| system scan               | iOS NFC sheet               | `Hold your iPhone near the PM5.`                                                        |
| accepted                  | NFC button position         | `✓ PM5 found`; success haptic; one committed paint, no duration timer                   |
| wrong/malformed record    | workout detail inline error | `Unsupported NFC tag`                                                                   |
| user cancelled sheet      | workout detail              | quiet return; no error                                                                  |
| system reader timeout     | workout detail inline error | `No NFC tag detected. Try again.`                                                       |
| reader invalidated        | workout detail inline error | `NFC scan stopped. Try again.`                                                          |
| target not advertising    | connected failure card      | approved copy; exact-target **Try again** or **Cancel**                                 |
| exact target already held | connected failure card      | `End this PM5's current connection, then try again.`; exact retry                       |
| duplicate exact targets   | connected failure card      | `More than one PM5 has this name. Use Connect.`; no targeted retry                      |
| target scan interrupted   | connected failure card      | `Connection interrupted. Try again.`; exact retry or **Cancel**                         |
| BLE cleanup failed        | connected failure card      | `Bluetooth cleanup failed. Restart Ergomatic before trying again.`; no in-process retry |
| Bluetooth/program failure | connected flow              | existing mapped copy and actions                                                        |

`NFCReaderUsageDescription` is:
`Scan a PM5 to connect and program your workout.`

The approved not-advertising copy remains
`Open Connect Device on this PM5, then try again.` The new targeted error
reasons suppress the existing generic `End whatever is showing...` sentence.
For an already-held target, **Try again** repeats exact-name discovery after the
rower ends the existing connection; it never invokes manual discovery. The
system-connected-device query may contain several peers and exposes only cached
names, so routing this state to today's manual **Connect** could program its
first held device instead of the tagged PM5. For an ambiguous live target,
**Cancel** returns to workout detail, where the unchanged manual **Connect**
action remains available.

The success haptic is best-effort. `@capacitor/haptics` failure must not delay or
fail Bluetooth discovery; the visual state remains the confirmation. React may
batch a state assignment and the interstitial mount into one commit, so the
handoff waits on an injected paint barrier implemented with consecutive
`requestAnimationFrame` turns. This promises one observable paint, not a
time-based delay; abort/unmount cancels the pending barrier.

## Architecture

### 1. One platform adapter owns NFC

Add an adapter port with no React, workout, PM5-driver, or persistence knowledge.
`ConnectionAttemptId` is a UUID minted with `crypto.randomUUID()` at the shared
detail entry owner. It is opaque correlation, not authentication; native and JS
reject a missing or empty value and compare it only by exact equality.

```ts
type ConnectionAttemptId = string;

type NfcCapability = "supported" | "unsupported";

interface NfcRecord {
  tnf: number;
  type: readonly number[];
  payload: readonly number[];
}

interface NfcReader {
  capability(): Promise<NfcCapability>;
  readOne(options: {
    attemptId: ConnectionAttemptId;
    alertMessage: string;
    signal: AbortSignal;
  }): Promise<readonly NfcRecord[]>;
}
```

The production adapter dynamically imports the exact
`@capgo/capacitor-nfc@8.2.5` package only on iOS. The lockfile and
`pnpm.patchedDependencies` bind a reviewed patch under `app/patches/`; dependency
updates cannot silently drop it. Web and simulator resolve `unsupported`; no
production web bundle imports native NFC code. Tests inject a scripted reader
that replays native-shaped records and session endings.

The adapter synchronously creates its terminal guard and requests abort,
`nfcEvent`, and `nfcSessionEnd` subscriptions, then awaits all asynchronous
handles before calling `startScanning`. Every handle that resolves after
abort/unmount removes itself, and no native session starts. **Withdrawn
2026-09-06 (hardening lens 1, F1): the pre-start "native current-state read".**
An earlier revision required the reader to re-read the app state immediately
before native start and refuse on non-foreground. The only read the plugin
offers is `App.getState().isActive`, which returns the payload of the
`appStateChange` event this repo already convicted as the wrong axis (Phase
LM); Gate -1's own console recorded `isActive` going false as a normal
consequence of the NFC sheet appearing
(`BACKGROUND-OBSERVATIONS.md`, "Reader start after App.getState returned
true. appStateChange false."), so the guard would have refused a second tap
taken while the previous sheet dismissed — silently, since the refusal mapped
to the quiet return. Real backgrounding is handled on the correct axis: the
detail screen holds the attempt's `AbortController` and aborts it on the
`pause` event through `adapters/appLifecycle.ts`; an abort before native
start prevents the start, an abort after it awaits the explicit stop.

The reader uses `iosSessionType: "ndef"` and `invalidateAfterFirstRead: false`
deliberately. A successful read does not reliably auto-invalidate, so Ergomatic
explicitly stops every session.

The released plugin is not sufficient as-is. Its retained events have no
session identity, its NDEF delegate chooses `tags.first`, and its stop promise
does not mean old connect/query/read closures are drained. The checked-in native
patch therefore:

- passes the caller's `ConnectionAttemptId` into native start and echoes it on
  every record, error, and session-ending event;
- binds that ID to the concrete `NFCNDEFReaderSession` generation and checks
  both at every delegate and connect/query/read closure before emitting or
  clearing state;
- accepts exactly one physical tag in a delegate callback, failing closed before
  reading when `tags.count != 1`;
- serializes a new start behind invalidation of any prior generation, including
  one surviving a process-live WebView reload; and
- resolves stop for an ID only after that generation is invalidated, cleared by
  identity, and mechanically incapable of emitting.

Capacitor may retain native events while JavaScript listeners are absent. A new
document therefore rejects any retained event whose native-carried ID is not its
current attempt; a JavaScript module token alone is not accepted as a drain.
When the app leaves the foreground, the armed lifecycle callback synchronously
claims the local abort outcome before beginning native stop, so a queued success
cannot mount the interstitial on resume. Targeted BLE discovery independently
acquires the same foreground lease before its first native call and aborts to the
named interrupted state on background; the existing connected-stream lifecycle
behavior takes over only after GATT connection.

### 2. A strict parser produces the only cross-radio value

The Capacitor event enters the adapter as `unknown`; plugin declarations are not
runtime validation. The adapter requires a non-null object, a matching nonempty
attempt ID, and an array of record objects. Every `tnf` is an integer and every
`type`/`payload` element is an integer in `[0, 255]`; absent, null, non-array,
fractional, negative, and oversized values fail closed before domain parsing.

The parser is pure domain code over those validated integer arrays. It:

1. requires the captured PM5 record structure established by Gate -1;
2. requires external TNF `0x04`;
3. requires exact ASCII type `concept2.com:bleconnectinfo`;
4. validates the captured payload length/padding rule;
5. ignores the six-byte address and address-type value after structural
   validation;
6. validates and decodes the advertising name bytewise as strict printable
   ASCII with the capture-proven termination rule; it does not use
   `TextDecoder("ascii")`, whose label aliases Windows-1252;
7. requires a nonempty `PM5 ` advertising name within Concept2's 31-byte limit;
8. rejects duplicates, malformed UTF-8/ASCII, embedded control characters,
   truncation, and extra ambiguous matching records.

It returns only:

```ts
interface Pm5NfcTarget {
  advertisingName: string;
}
```

No raw record, tag UID, address, address type, or payload crosses into workout or
session state.

### 3. One connection-entry owner shares the safety lock

`ConnectAction` currently owns both the button and the replacement authorization
(`ConnectAction.tsx:112-201`). Duplicating it for NFC would create two local
stages and two independently staged retire receipts. Phase NF extracts or
generalizes that ownership so the hardware-entry group has exactly one guard and
one pending intent:

```ts
type ConnectionEntryIntent =
  | { kind: "manual"; attemptId: ConnectionAttemptId }
  | { kind: "nfc"; attemptId: ConnectionAttemptId };
```

A press mints its ID and stages the existing `connectGuardStage` authorization
under that ID before opening either native sheet. If confirmation is required,
the panel replaces the hardware-entry group and retains the complete pending
intent. **Cancel** discards only that attempt's staged retire receipt and returns
both buttons. **Connect anyway** resumes the same intent and ID. Execution of
retirement remains downstream at the existing wire `armed` event; Phase NF does
not move that acceptance point.

The shared owner explicitly transfers the keyed staged receipt to the connecting
handoff. Before that transfer, every terminal path discards it: confirmation
cancel, NFC abort/cancel/timeout/invalidation/start failure, unsupported tag,
compile or baseline failure, and detail unmount. After transfer, the existing
session's recoverable retry retains it, `armed` consumes it, and explicit
Cancel, row-instead, unrecoverable failure, or true route unmount discards it.
Cleanup is compare-by-attempt-ID, so late A cleanup cannot discard B's
authorization.

React StrictMode rehearses effect setup → cleanup → setup. A hook-effect cleanup
therefore cannot itself mean the connection attempt died. The route-level
handoff owns an identity-bound mount lease: cleanup queues a microtask release
for that attempt ID, and the replayed setup reclaims the same lease before the
release commits. A real unmount has no reclaim and discards the receipt. Explicit
user terminal actions still discard synchronously. The lease cannot be reclaimed
by another ID and owns no duration threshold.

Only one entry attempt may exist. Starting NFC disables both hardware buttons.
Manual Connect cannot begin until NFC has settled and drained; NFC cannot begin
while the connected interstitial owns a monitor attempt.

### 4. Workout detail resolves NFC before the existing handoff

For manual intent, `handleConnectProceed` keeps today's behavior.

For NFC intent:

1. run the shared safety authorization;
2. start the NFC reader;
3. on one record event, claim the attempt and explicitly close the reader;
4. parse the PM5 target or show `Unsupported NFC tag` and remain on detail;
5. fire best-effort success haptics and render `✓ PM5 found`;
6. cross the one-paint barrier while the same attempt remains current;
7. compile the same nudged workout, phases, identity, baselines, and log seed as
   today's `handleConnectProceed` (`WorkoutDetail.tsx:224-277`);
8. add the ephemeral discovery request to the in-memory `connecting` handoff;
9. render the existing `ConnectedInterstitial`.

The success visual adds no timer. It receives one real paint before the
interstitial render; failure to remain current at the paint boundary performs
only keyed cleanup.

```ts
type MonitorDiscoveryRequest =
  | { kind: "picker"; attemptId: ConnectionAttemptId }
  | TargetedMonitorDiscoveryRequest;
```

`ConnectedInterstitial` passes this request to `session.connect(request)` on its
existing mount-once effect (`ConnectedInterstitial.tsx:300-327`). Retry preserves
the same request. A targeted failure retries the same exact name; it never opens
the picker and does not require a second NFC read.

### 5. Transport gains a fail-closed targeted operation

Do not overload optional `Transport.scan()` options. Missing options would mean
today's broad picker and turn a dropped target into a privilege downgrade. Keep
manual `scan()` unchanged and add a separate structural capability:

```ts
interface TargetedMonitorDiscoveryRequest {
  kind: "advertised-name";
  attemptId: ConnectionAttemptId;
  exactName: string;
}

interface TargetedScanTransport {
  scanTarget(
    request: TargetedMonitorDiscoveryRequest,
    signal: AbortSignal,
  ): Promise<DiscoveredMonitor[]>;
}
```

`useMonitorSession` discriminates the handoff request. Picker/legacy callers use
today's `transport.scan()`. An advertised-name request requires
`TargetedScanTransport`; an absent capability or invalid request raises a named
targeted failure before any picker or radio call. There is no fallback from
`scanTarget` to `scan`. Capacitor, fake, and replay implement the capability;
web production does not need it because web cannot produce the NFC action.

Runtime validation happens before any radio call: `attemptId` must be a valid,
nonempty minted UUID and `exactName` must be nonempty printable ASCII, start
with `PM5 `, and fit the capture-proven limit. The target comparison is guarded
by `typeof result.localName === "string"`; missing target/name values can never
compare equal. Every returned candidate must carry a nonempty string
`deviceId` before deduplication or selection.

Adding a structural method is not proof that production composition preserves
it. Implementation begins with a repository-wide census of every `Transport`
implementation, decorator, factory, and call site. `withLiveness`, recording,
hold-open, auto-ticking/test wrappers, fake, replay, web, and Capacitor have
explicit targeted-capability behavior. A production-composed test enters through
`defaultTransport`, traverses `withLiveness`, and proves the same request object
and `AbortSignal` reference reach the native Capacitor `scanTarget` seam. A
missing method must fail closed, never invoke `scan()`.

The Capacitor adapter's `scanTarget` branch installs its terminal/abort owner
before any await, rejects a pre-aborted signal without a native call, and is:

1. await the prior raw-operation drain, then recheck the signal;
2. initialize once, then recheck the signal;
3. verify Bluetooth is enabled immediately after initialization, then recheck
   the signal;
4. query
   `getConnectedDevices([ROWING_SERVICE_UUID, CONTROL_SERVICE_UUID])` because
   the plugin drops already-connected peripherals from scan callbacks, then
   recheck the signal;
5. never select a held device from cached `device.name`; use a cached exact-name
   equality only to fail closed with `TargetAlreadyConnectedError` and instruct
   the rower to end that connection before an exact retry;
6. immediately before the native call, recheck the signal, then start
   `requestLEScan` with no device-list mode, name filter, or PM5 service
   filter;
7. compare only `ScanResult.localName === exactName`, deduplicating repeat
   callbacks by opaque `deviceId`;
8. wait up to the hardware-evidenced targeted deadline for the first live match,
   then keep scanning for the hardware-evidenced, test-injected collision
   window;
9. one unique live match wins, while any second distinct device with the same
   exact name fails closed with `TargetMonitorAmbiguousError`;
10. await `stopLEScan()` before returning the sole match's opaque
    `device.deviceId` or reporting ambiguity;
11. on the targeted timeout, await `stopLEScan()` and throw a named
    `TargetMonitorNotAdvertisingError` mapped to the approved copy;
12. on `signal.abort`, claim that terminal path, await `stopLEScan()`, and reject
    with `AbortError` only after the native scan is stopped.

Each plugin callback is decoded from `unknown`, not trusted because a TypeScript
declaration exists. Absent/null/non-object shapes and invalid/empty IDs fail
closed; a missing `localName` is a valid nonmatch. No candidate is inserted into
the deduplication set before its ID and name fields are validated.

Do not pass `{ name: exactName }`: the inspected iOS plugin filters
`CBPeripheral.name`, which may be cached. Do not pass the rowing/control service
UUIDs: the existing adapter already records that 0x0030 is not advertised
(`capacitorBle.ts:429-489`), and CoreBluetooth combines filters. Scan broadly at
the native radio seam, expose nothing broadly to the user, and settle only on the
exact live advertisement name.

Gate -1's observed scan latencies set the bounded target deadline and post-match
collision window; the implementation plan freezes both as named, test-injected
constants. `requestLEScan` has no native timeout. No unmeasured default enters
product code, and collision detection cannot be removed. Every settle path
awaits `stopLEScan()` before connect/retry/abort resolution so BleClient's
serialized queue cannot carry a stale scan into the next operation.

The Capacitor adapter also owns a module-level FIFO operation tail shared by
targeted scans and today's manual picker scan. Each operation captures its
predecessor and installs its own identity-bound drain before its first native
radio call; only that operation can release its drain. A targeted drain follows
`requestLEScan` through matching `stopLEScan()` completion. A manual drain
follows the complete raw, unraced picker pipeline, not the outer UI timeout
race: `stopLEScan()` cannot dismiss the native picker, so a timeout may reject
the UI while every later scan remains intentionally blocked until the rower
cancels or selects in the old sheet and its raw promise settles. This ownership
survives interstitial unmount and a fresh hook or transport instance.

`stopLEScan()` rejection has explicit ownership. Cleanup failure outranks match,
timeout, abort, and ambiguity: no device connects, the trace records
`ble-scan-cleanup-failed`, and the module tail enters a poisoned state. Every
later manual or targeted scan rejects without a native call and shows the
restart-required copy. The app process must restart before radio work is
eligible again; swallowing the error or releasing the tail is forbidden.

Map target failures to explicit connected-error reasons:
`target-not-advertising`, `target-already-connected`, `target-ambiguous`,
`target-interrupted`, and `scan-cleanup-failed`. They are lookup/cleanup
failures, not machine refusals, and never inherit the existing generic
instruction to end what is showing on the PM5.
`target-not-advertising`, `target-already-connected`, and `target-interrupted`
enable exact-target retry; `target-ambiguous` keeps **Cancel** as the route back
to workout detail. `scan-cleanup-failed` offers no in-process retry.

### 6. Existing monitor-session authority remains unchanged

`useMonitorSession.connect` already rejects re-entry, allocates an attempt token,
checks supersession across awaits, and owns the driver (`useMonitorSession.ts:
4323-4549`). `program` synchronously enters programming to suppress duplicates,
and `cancel`/unmount invalidate the attempt (`useMonitorSession.ts:3840-3867,
4886-4939, 5117-5222`). For advertised-name discovery, Phase NF adds a
per-attempt `AbortController` owned by the hook: it is stored before awaiting
`transport.scanTarget(request, signal)` and aborted synchronously at the start
of Cancel, unmount, supersession, or background. The ref is cleared only if it
still owns that controller, so a late A `finally` cannot erase B's controller.

Before calling `scanTarget`, the hook fully acquires an asynchronous foreground
listener and re-reads current native state. A late listener handle self-removes;
background while registration is pending or an already-background state starts
no scan. Once GATT connects, the pre-connect listener is removed and today's
connected-stream lifecycle listener owns the session. A background abort before
GATT maps to `target-interrupted` and never to not-advertising.

The UI may navigate immediately; the adapter-level raw-operation tail blocks the
next native scan until cleanup completes. The incoming `ConnectionAttemptId` is
stored unchanged beside the session attempt; the existing numeric `attemptRef`
remains a local stale-await counter and is not presented as cross-layer
identity. Phase NF passes the discovery request through those existing gates;
it does not create a parallel driver path.

The established sequence remains:

```text
detail authorization
  → NFC target (NFC route only)
  → compile + in-memory handoff
  → interstitial
  → session.connect(discovery request)
  → transport scan + connect
  → session.program
  → driver verifies armed
  → existing ready/live/ended flow
```

Nothing creates or retires a `MonitorRun` before the existing `armed` acceptance
point. Nothing changes first-rowing-frame run creation or terminal logging.

## State and lifetime ledger

| State                                                  | Owner and identity                                                       | Begins                                        | Every clear/transfer                                                                                                    | Teardown and re-arm                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| NFC capability                                         | JS NFC adapter cache                                                     | first probe                                   | document/process reset                                                                                                  | unsupported surfaces never arm; a new document may probe again                                                                            |
| connection attempt ID                                  | shared detail entry owner; UUID                                          | hardware-button press                         | pre-handoff terminal clears; accepted handoff transfers unchanged; the session holds it until the next `connect()` overwrites it (never cleared by a session terminal — a keyed take on a stale ID is a pure read, F7) | does not survive a document reset; old native events retain the old ID and cannot join a new attempt                                      |
| pending entry intent                                   | shared detail guard; attempt ID                                          | hardware-button press                         | confirmation cancel clears; authorization transfers same ID                                                             | detail unmount clears; next press mints a new ID                                                                                          |
| staged retire receipt and mount lease                  | handoff store; attempt ID plus existing session key/revision set         | safety check; lease at interstitial ownership | every pre-handoff terminal discards by ID; handoff transfers; `armed` consumes; explicit terminal/true unmount discards | StrictMode cleanup queues release and same-ID setup reclaims; module reset loses it safely; retry keeps the same ID                       |
| native NFC generation                                  | patched plugin; attempt ID plus concrete session identity                | accepted native start                         | matching record/error then matching stop, invalidation, or superseding start                                            | survives process-live WebView reload only long enough to be drained; new start serializes behind it                                       |
| NFC and foreground listener handles                    | JS NFC adapter; attempt ID                                               | registration begins before native start       | success, rejection, abort, invalidation, or start failure removes all; a late-resolving handle self-removes             | document reset drops JS listeners; retained native events remain ID-labelled; re-arm waits for every new handle and current-state read    |
| NFC terminal guard                                     | JS NFC adapter; attempt ID                                               | synchronously before listener awaits          | first outcome claims; all later outcomes cleanup only                                                                   | foreground loss and unmount claim before awaiting stop; next read owns a new guard                                                        |
| raw NDEF records                                       | parser call; current attempt                                             | matching native event                         | parse returns or throws                                                                                                 | never stored or transferred                                                                                                               |
| `Pm5NfcTarget`                                         | detail attempt; attempt ID                                               | successful parse                              | handoff transfer or any pre-handoff terminal                                                                            | no reload survival; exact retry uses handoff copy only                                                                                    |
| success check/haptic/paint barrier                     | detail render; attempt ID                                                | target accepted                               | one committed paint then handoff, or attempt abort                                                                      | no duration timer; pending frames cancel on unmount; re-arm uses fresh barrier                                                            |
| discovery request                                      | connecting handoff/session; attempt ID                                   | compile succeeds                              | connect terminal, cancel, or unmount                                                                                    | exact retry retains same value and ID; manual request carries no NFC target                                                               |
| scan abort controller and pre-connect foreground lease | monitor-session attempt; object identity plus attempt ID                 | before `transport.scanTarget`                 | owning scan settle, GATT transfer, cancel, background, unmount, or supersession                                         | compare-by-object clear prevents late A from clearing B; late listener self-removes; retry creates fresh owners under the same attempt ID |
| targeted timers and match sets                         | Capacitor operation identity                                             | immediately before `requestLEScan`            | matching stop completion on match, ambiguity, timeout, error, or abort                                                  | never cross operations; re-arm allocates fresh timers and sets                                                                            |
| targeted raw BLE operation/drain                       | Capacitor module FIFO tail; operation identity                           | before first targeted native call             | matching `stopLEScan()` completes                                                                                       | survives component/transport replacement; successor awaits captured predecessor; stop rejection poisons tail until process restart        |
| manual raw picker/drain                                | Capacitor module FIFO tail; raw `requestDevice` promise identity         | before raw picker call                        | raw promise settles after selection/cancel, even if UI timeout already won                                              | survives component/transport replacement; no successor radio operation starts while old sheet remains live                                |
| redacted attempt trace                                 | bounded in-memory attempt log; attempt ID owner but no ID value recorded | hardware press                                | adopted by connected session log or retained as latest completed attempt for process-local diagnostics                  | no raw tag/name/address data; next attempt replaces only after prior snapshot remains observable                                          |
| monitor session/driver/run                             | existing owners; incoming attempt ID beside existing local generation    | existing connect/armed/first-frame points     | existing cancel/terminal rules                                                                                          | local numeric generation still suppresses stale awaits; no PM5 run rule changes                                                           |

## Failure and concurrency contract

- One `ConnectionAttemptId` is carried unchanged from the detail press through
  native NFC events, keyed staged receipt, target handoff, session, and BLE
  discovery. Any callback carrying another ID is ignored after performing only
  identity-bound cleanup; JavaScript-local counters remain subordinate.
- The first terminal NFC outcome wins: record, user cancel, timeout,
  invalidation, abort, or start rejection. Duplicate plugin events cannot parse,
  connect, or report twice.
- Native accepts exactly one physical tag. Zero or multiple tags fail closed as
  `Unsupported NFC tag`; JavaScript is never asked to infer array order.
- A record event closes/drains its exact Core NFC generation before starting
  BLE. BLE stops before connect. These radios do not overlap after the tag read.
- Detail unmount or foreground loss synchronously claims abort, discards that
  attempt's pre-handoff receipt, removes every listener including late-resolving
  handles, and prevents a late event from mounting the interstitial.
- Interstitial cancel and unmount use the existing session attempt invalidation
  and synchronously abort the targeted scan. A new manual/NFC native scan awaits
  that operation's identity-bound drain even after the old hook unmounts.
- Haptic rejection is swallowed after instrumentation. It cannot become a
  connection failure.
- Invalid tags never reach Bluetooth. Target timeouts never degrade to manual
  discovery. Programming failures never return to NFC.
- No held device is auto-selected from cached `device.name`. A held exact-name
  conflict requires ending the current connection and retrying the same target;
  a different held PM5 does not win merely because it is array-first.
- Zero exact matches time out; more than one distinct exact match fails closed.
  Neither outcome may choose a device by arrival order or signal strength.
- `Try again` after target-not-advertising reuses the in-memory exact target. The
  target disappears when the rower cancels back to detail.
- Bluetooth permission/off failures and programming/link failures retain their
  current named classification and recovery behavior.
- Exit claims cover NFC listeners and BLE scan callbacks owned by this phase.
  Existing connection/disconnect and enabled-state listeners retain their
  established lifecycle; Phase NF does not falsely claim they are absent.

## Instrumentation and replay

This is a new platform input above the current transport recorder. Without a new
seam, every browser/e2e/replay gate would replace the code most likely to be
wrong. Phase NF adds both:

1. **Scripted NFC reader.** Unit/integration tests feed native-shaped record and
   session-end events through the production parser and detail coordinator. The
   Gate -1 capture becomes the canonical valid fixture.
2. **Redacted connection-attempt trace with an observable sink.** A bounded
   in-memory `ConnectionAttemptTrace` is created at the hardware press and
   injected through reader, detail, handoff, and session. On successful GATT it
   becomes the prefix of the existing monitor event log; before connection, the
   session's `exportLog()` window (the failure screen's **View connection log**)
   serialises the pending attempt's entries in the ring's own shape under the
   same `nfc-attempt:` prefix, ahead of any ring a previous session left.
   **Every attempt terminal publishes the trace** — a pre-handoff terminal on
   detail, and on the session a targeted failure, a superseded attempt or the
   ring-prefix copy — so the process-local latest snapshot is never a
   pre-scan copy of a handed-off attempt (whole-branch review B3, 2026-09-06:
   before this, only a successful connect ever published, and every failure
   the instrument exists for discarded it). The capability probe is not an
   attempt: it publishes only while no attempt has completed in this process,
   so a rejected or timed-out probe reaches the sink on a fresh launch and
   never clobbers a real attempt's snapshot. Tests assert the production sink,
   not a mock callback.

The trace records timestamps and fixed outcome kinds only: supported,
unsupported, capability-failed, capability-timed-out, listener-registration-
failed, session-requested, start-failed, tag-event, invalid-native-event,
stale-ID-dropped, parser-accepted/rejected, haptic-failed, reader-settled,
foreground-abort, held-device-conflict, BLE-scan-started/matched/timed-out,
invalid-scan-result, abort-requested, scan-drain-settled,
BLE-scan-cleanup-failed, and handoff-accepted. Never record attempt ID, tag UID,
BLE address, raw payload, or arbitrary scanned device names. The accepted PM5
display name may join the existing connection log only once it is the chosen
device. Gate -1 sets the named capability-probe deadline; rejection or timeout
keeps the button absent and records a distinct outcome, while genuine
unsupported records `unsupported`. NFC start rejection uses the approved
`NFC scan stopped. Try again.` presentation and its own diagnostic kind.

The actual routed producer-to-consumer test must replay the canonical
native-shaped NDEF fixture through:

```text
WorkoutDetail Scan NFC click
  → injected native-shaped NFC event
  → real NfcReader + PM5 parser
  → real detail authorization and connecting handoff
  → real ConnectedInterstitial + useMonitorSession.connect
  → injected native radio seam behind production-composed Transport.scanTarget
  → real driver program → armed
```

Only the NFC/plugin and radio boundaries are injected. The test independently
asserts the literal capture-decoded PM5 name at `scanTarget`, injects a fixed
attempt-ID mint and asserts that independent literal at the consumer, and then
reaches `armed`. It does not construct the expected discovery request itself.
This routed test is distinct from parser units, native patch tests, and transport
composition tests; adjacent mirrors are not accepted as seam proof.

## Validation contract

### Automated

- Parser table: canonical capture, wrong TNF, wrong type, missing record,
  duplicate record, truncated address/type/name, capture-proven bad padding,
  empty/overlong/control-character/non-PM5 name, and absent/null/non-array or
  fractional/negative/oversized byte values at the raw bridge boundary.
- NFC adapter: listener-before-start ordering, start rejection, record success,
  user cancellation, system timeout, generic invalidation, the two published
  causes (`multipleTags` → `Unsupported NFC tag`, `tagFailure` → the
  invalidated copy) and a cause arriving with a non-`invalidated` reason
  (fails closed as invalidated), abort, duplicate
  event, late event after abort, explicit stop, foreground loss, shutdown drain,
  and a new start blocked until the prior session ends. Abort/background while
  any asynchronous NFC or lifecycle handle is pending must self-remove the late
  handle and never call native start; an already-background current-state read
  does the same.
- Patched native NFC controller: attempt ID round-trip on every event, exact
  session/generation checks at each delegate and connect/query/read closure,
  zero/multiple-tag rejection with its published cause, tag-failure cause,
  cause consumed by its own ending and absent from every unforced ending,
  identity-bound invalidation, stop completion, A
  late completion after stop followed by B, and process-live WebView reload
  between A and B. These are native-injected tests, not JS mocks of the desired
  event order.
- Capability: supported renders **Scan NFC** above **Connect**; unknown,
  unsupported, web, and simulator do not render it.
- Shared guard: manual and NFC stage the identical warnings/receipt; cancel
  clears it; confirm resumes the correct pending intent; rapid cross-button
  presses produce one attempt. One actual `<StrictMode>` route reaches `armed`
  through effect replay without losing authorization, while true route unmount
  with no same-ID reclaim discards it.
- Success paint: the actual detail component cannot mount the interstitial until
  `✓ PM5 found` has committed across the injected consecutive-animation-frame
  barrier. Immediate-handoff and single-frame mutations fail.
- Transport propagation: a census covers every implementation and decorator;
  the production composition through `defaultTransport` and `withLiveness`
  preserves the same target object and `AbortSignal` reference all the way to
  the Capacitor seam. Recording, hold-open, auto-ticking/test wrappers, fake,
  replay, and web have explicit targeted-capability behavior; missing capability
  proves no `scan()` or radio call occurred.
- Targeted transport: pre-aborted input; abort after each preflight await;
  Bluetooth-enabled check before held lookup; exact-name held conflict with
  exact retry; nonmatching and multiple held devices; unfiltered
  `requestLEScan`; `localName` match; deliberate nonselection from cached
  `device.name`; missing `localName`; duplicate callback deduplication; two
  distinct exact-name devices; target timeout; abort-before-match;
  abort-after-match; stop-before-connect; cleanup on every settle path; and a
  new targeted/manual scan blocked until the prior abort drain resolves.
- Runtime targeted boundary: absent/null/non-object request/results; empty,
  absent, malformed, and valid attempt IDs, exact names, `localName` values, and
  device IDs. Missing names are nonmatches and can never equal missing targets;
  invalid device IDs never enter the deduplication set.
- Shared BLE operation tail: manual picker outer timeout leaves B blocked until
  A's raw picker promise settles; old Cancel/selection then releases only A and
  B may start. A canceled and late-settling targeted scan cannot clear B's abort
  controller or drain. `stopLEScan()` rejection after match, timeout, abort, and
  ambiguity always wins, connects nothing, emits its diagnostic, poisons the
  tail, and makes successor B fail without a native call.
- Handoff: NFC target survives detail → interstitial → retry; manual has no
  target and still opens the existing picker. The same attempt ID reaches every
  layer, and a mismatched or absent ID fails closed.
- Session: NFC path connects once, programs once, accepts `armed` once, preserves
  staged-retire timing, and tears down on navigation/cancel/program failure.
  The keyed staged receipt is discarded on every named pre-handoff terminal
  path and cannot be cleared by a late prior attempt.
- UI: approved copy, order, 56 px geometry, fern token, contrast, absent-layout
  parity, portrait scroll, and landscape action region.
- Diagnostics: capability rejection/timeout, listener/start failure, stale-ID
  drop, invalid bridge values, haptic failure, foreground abort, and BLE cleanup
  failure each reach the production attempt-trace sink; haptic failure still
  proceeds.
- Bundle/config: web production bundle excludes NFC/Haptics native code; built
  iOS app contains the usage description and signed NFC entitlement.

Deadline and collision-window boundary tests use independent literal clock
advances on both sides of each boundary. They do not import, derive, or echo the
production constants they are meant to constrain.

### Self-mutation

At minimum, temporarily mutate each load-bearing seam and prove a named test
fails:

1. accept a nonmatching record type;
2. use `device.name` instead of `localName`;
3. remove exact equality or allow prefix matching;
4. remove NFC stop/drain;
5. remove BLE stop on timeout;
6. remove the shared single-flight guard;
7. drop the discovery request at detail/interstitial/session handoff;
8. move staged retirement before `armed`;
9. render the button while capability is unknown/unsupported.
10. connect immediately to the first exact-name result without checking for a
    second distinct match.
11. auto-select an exact-name held device from cached `device.name`.
12. drop or ignore the targeted scan's abort signal on Cancel/unmount.
13. let a new manual or targeted scan bypass the prior scan-drain barrier.
14. strip the native attempt ID from one retained NFC event or clear native
    session state without checking the concrete generation.
15. select `tags.first` when the native delegate receives multiple tags.
16. start NFC before every NFC/lifecycle handle resolves, skip the current-state
    read, or retain a handle that resolves after abort.
17. let a transport decorator drop `scanTarget`, or fall back to `scan()` when
    targeted capability/request validation fails.
18. omit one targeted-preflight abort check or move the enabled check after the
    held-device query.
19. clear the session's abort-controller ref without object-identity comparison.
20. attach the manual BLE drain to the outer timeout race instead of the raw
    picker promise.
21. leave the keyed staged-retire receipt live on one pre-handoff terminal path.
22. allow foreground loss to leave the detail attempt armed.
23. discard the staged receipt during StrictMode rehearsal, or let another
    attempt ID reclaim its mount lease.
24. mount the interstitial before the accepted state crosses its paint barrier.
25. swallow `stopLEScan()` rejection or release the poisoned operation tail.
26. trust one typed bridge value without validating its absent, empty, and
    valued runtime forms.
27. drop one named diagnostic before the production attempt-trace sink.
28. replace the routed Scan-NFC-to-`armed` test with a request constructed by the
    test, or derive a timing assertion from its production constant.

Commit before probes and revert each mutation immediately afterward. The final
tree must be clean.

### Native hardware walk

After automated gates, a real iPhone and PM5 walk proves (runsheet
`docs/monitor/sessions/phase-nf-product-walk/RUNSHEET.md`, v2 — the ten legs
first written here were cut to five at the PM readiness gate on 2026-09-06;
each retired leg names the evidence that settles it instead):

1. **Primary target:** the signed NFC-capable build shows **Scan NFC**; a valid
   tag → success haptic → no Bluetooth picker → the exact PM5 name → with the
   PM5 on **Connect Device**, connect, program, verified `armed`, first pull,
   terminal logging (former legs 1, 2, 3; leg 1's geometry half is
   `e2e/design.spec.ts`'s pinned pair, its device half is this leg's
   precondition);
2. **Not advertising:** PM5 off Connect Device → approved targeted message, no
   general picker; opening **Connect Device** then **Try again** connects
   without another NFC read (former leg 4);
3. **Re-arm:** rapid NFC/manual alternation — Scan NFC, Cancel, Connect, cancel
   the picker, Scan NFC (valid) — one session, READY once (former leg 7;
   load-bearing: the antagonist's 2026-09-06 necessity ruling cut Gate -1's
   recovery cases 2-4 partly on this leg's strength, so it is mandatory);
4. **Background during a live reader:** side-button lock while the sheet is
   up, unlock → quiet return, both buttons back, no late interstitial (former
   leg 9; a bounded feasibility experiment — whether a lock during a live Core
   NFC sheet delivers `pause` to the WebView is genuinely unknown, and an
   unknown outcome is a recorded result, not a failure);
5. **Manual Connect unchanged:** today's picker, the same workout to READY, no
   rowing (former leg 10).

Retired from the walk, each with its substitute evidence:

- former leg 5 (unsupported tag via a Flipper NTAG text emulation): an
  undemonstrated physical action (the PM ledger's Flipper precedent needed a
  serial-verified replica); the rejection is `parsePm5NfcTarget` under
  mutation S1, and `e2e/connected.spec.ts`'s "unsupported tag" flow through
  the real screen;
- former leg 6 (sheet Cancel and reader timeout): already observed on this
  phone and this patched plugin — `PRE-REPAIR.md` records `sheet-cancel /
  userCancelled` and `no-tag-timeout / sessionTimeout` — and the JS half
  (ending → copy) is `runNfcAttempt.ts` under `WorkoutDetail.nfc.test.tsx`'s
  states table;
- former leg 8 (held exact-name PM5 fails closed): NOT PERFORMABLE on the
  product build — every route back to detail (`cancel()`, navigation) tears
  the link down, so no product path leaves the app on detail holding a PM5,
  and another device holding it stops the PM5 advertising, which is leg 2's
  copy. The invariant is transport mutation T3-5 ("held device not refused",
  BIT) and its named test.

Keep the redacted NFC capture and connection log under `docs/monitor/sessions/`
or `docs/monitor/nfc/` per the hardware-walk contract. Teardown the per-worktree
stack after the walk.

## Scheduling gate

This design fires Phase NF's trigger; it does not silently reorder the roadmap.
The existing roadmap places this polish behind the front-door Wave A work.
Product implementation begins only after James explicitly schedules NF. That
ruling may place it ahead of Wave A or keep it behind Wave A; Wave A clearing
does not itself grant authority. Written-spec approval is not that scheduling
decision.

## Phase/PR shape

### Proof task — disposable, before feature commits

Run Gate -1 in the feature worktree. The probe may expose diagnostics, but its
UI is not product code. The exact-version pnpm patch and its native tests are
proof infrastructure first: keep them for the product only if the hardware gate
is GO. Other durable output is the redacted capture, the corrected NFC README,
and the stated GO/NO-GO result. Delete disposable UI/code before continuing the
product PR.

### One atomic product PR

After Gate -1 is green, one product PR owns the complete rower outcome:

- locked NFC and Haptics dependencies plus the reviewed, checked-in NFC patch;
- iOS capability, usage description, entitlement/signing configuration;
- NFC adapter, strict parser, scripted/replay fixture, and instrumentation;
- fail-closed `TargetedScanTransport.scanTarget` capability and routed request;
- native attempt identity/single-tag/drain controller;
- Capacitor held-device conflict + picker-free exact-`localName` scan and raw
  manual/targeted operation tail;
- fake/replay/web parity and unit/self-mutation proof;
- shared connection-entry guard/intent;
- conditional **Scan NFC** action and tokens;
- success/error/haptic states;
- target handoff through interstitial/session and targeted retry;
- design reference, browser/e2e, screenshots, bundle assertions; and
- the full native hardware walk.

Exit: every named hardware-walk leg passes, as do `pnpm --dir app format:check`,
`lint`, `typecheck`, `test`, `test:coverage`, `build`, `dist:grep`, `e2e`, and
`screenshots` against the product branch merged with current `origin/main`. The
implementation plan owns their prerequisites, order, and repeated-run policy.
The PR remains open until James explicitly approves merge.

Native configuration without its consumer is not a complete rower outcome and
creates provisioning surface prematurely. Review-size pressure may be handled
with internal commits, but not stacked product PRs: configuration, radio seams,
UI, and the working rower outcome are reviewed and released in one PR.

### Release and provisioning

Ship in the next available minor release; do not reserve a version during
design. Before merge, verify the Near Field Communication Tag Reading
capability on the App ID and Xcode target, the nonempty usage description, the
regenerated provisioning profile, and the signed archive's effective
`com.apple.developer.nfc.readersession.formats = [TAG]` entitlement. After
merge, send the release candidate through TestFlight and exercise it before
release.

The main checkout already contains user-owned edits to `Info.plist` and the
Xcode project. Feature implementation remains isolated and reconciles those
files explicitly; it never overwrites or reverts them.

## Countable phase exits

Phase NF closes only when:

1. Gate -1 proves the NDEF shape, exact-name bridge, nonmodal discovery, and
   signed reader session on real hardware, while native-injected tests prove
   session identity, single-tag handling, and drain; reader-ending reasons are
   either distinguished or produce one explicitly approved collapsed state and
   copy.
2. The approved Gate 0 artifact and copy match the shipped UI in portrait and
   landscape.
3. Supported iPhones show **Scan NFC**; every unsupported surface shows no trace
   of it.
4. One valid PM5 scan reaches the same existing `armed`/ready/live/log path with
   no Bluetooth picker and no second app confirmation.
5. Unsupported tags and nonadvertising PM5s produce the approved, distinct copy
   and no untargeted connection.
6. Manual **Connect** is behaviorally unchanged.
7. NFC sessions/listeners and BLE scans/callbacks owned by this phase are absent
   after every terminal path proven by automated tests and the hardware walk.
8. The native-shaped producer-to-consumer replay and every mutation listed under
   **Self-mutation** bite.
9. The product-PR gate commands, signed-device install, entitlement inspection,
   and every named hardware-walk leg are green on the required tree.
10. The one product PR receives explicit merge approval; no agent merges or
    tears down a live worktree early.
11. James has explicitly scheduled NF, either ahead of or behind Wave A.

## Rejected approaches

- **Listen whenever detail opens.** Core NFC requires a foreground session and
  system sheet; unsolicited presentation is noisy and not the user-approved
  trigger.
- **Call `requestDevice({ name })` after NFC.** It still presents a second device
  UI and violates automatic connection.
- **Use `requestLEScan({ name })`.** The plugin filters cached
  `CBPeripheral.name`, not the live advertisement field.
- **Use the NFC BLE address.** CoreBluetooth does not expose a comparable MAC on
  iOS.
- **Choose nearest/strongest or any `PM5` prefix.** A gym can contain many PM5s;
  this can program the wrong machine.
- **Fallback to the picker on timeout.** It silently changes an exact-target
  request into a different-device request and contradicts the approved recovery.
- **Make targeting an optional `scan()` option.** Omission is indistinguishable
  from today's picker intent, so one dropped parameter broadens discovery. A
  separate capability fails closed instead.
- **Use the released NFC plugin without a native patch.** Its retained events
  have no session identity, it chooses the first physical tag, and its stop
  promise does not drain late native closures.
- **Use a JavaScript-only attempt token or delay before re-arm.** Neither labels
  native retained events nor prevents an old invalidation from clearing a newer
  native session.
- **Send an already-connected target to manual Connect.** Today's manual native
  path may return the first of several held PM5s. The safe recovery ends the
  held connection and retries the same exact target.
- **Build a new native BLE bridge.** The installed plugin already exposes the
  non-picker scan and opaque connect identifier needed.
- **Use raw `NFCTagReaderSession`.** The PM5 is NDEF-formatted and the plugin's
  NDEF session exposes the raw external record fields. Raw tag access adds
  entitlement and polling complexity without product value.

## Residuals accepted for review

- Advertising-name equality is deterministic targeting, not authentication. A
  cloned tag or one spoofed advertiser can still misdirect the lookup. Multiple
  concurrently observed exact-name devices fail closed, but absence from the
  finite collision window is not proof of uniqueness.
- If a PM5 firmware version encodes or advertises its name differently, exact
  matching fails closed with the Connect Device instruction. It never guesses.
- NFC capability probing reports device support, not valid code signing. Archive
  and device gates remain necessary.
- The targeted deadline and collision window are Ergomatic policies, not
  platform facts. Gate -1 evidence sets their initial values; changing fallback
  or identity rules requires a design delta.
- A held-device cached-name equality is used only to refuse connection. It can
  produce an unnecessary retry but cannot select or program that cached device.
- The native manual picker cannot be programmatically dismissed. If its UI
  timeout wins while the sheet is still open, subsequent BLE operations remain
  intentionally blocked until the raw picker resolves by user action.
- The checked-in NFC patch is part of the safety mechanism. Any NFC or Capacitor
  upgrade must reapply/review the patch and rerun native identity, retention,
  drain, and WebView-reload tests before dependency acceptance.
- **Delete workout** dropping partly under the tab bar on the initial portrait
  fold (Gate 0 said "below the fold"; the capture shows the label still in
  frame) was visible in Gate 0 and accepted. No compensating layout compression
  ships in this phase.
- **Backgrounding during the targeted BLE scan can poison the tail** (whole-
  branch review SF3, 2026-09-06). A `pause` aborts the scan; the abort's
  `stopLEScan()` and its 10 s cleanup deadline both ride the process, which iOS
  may suspend; on resume the deadline and the plugin's reply race, and a
  deadline win sets the never-cleared poison (`Restart Ergomatic`). The harm
  ceiling is the poison's own copy on the next attempt; manual **Connect** on a
  fresh launch is unaffected. Not walked (no leg backgrounds during the BLE
  half); recorded here and in the ROADMAP NF block as owed observation, with
  "do not arm the cleanup deadline on a background-caused abort" as the
  candidate fix if it is ever seen.

## Primary sources and inspected implementation

- `docs/superpowers/research/2026-09-05-pm5-nfc-availability.md` (rev 2) —
  PM5 NFC availability: observations (PRIMARY, our captures), Concept2 firmware
  timeline "NFC wake-up behaviour" (PRIMARY, establishes wake-on-NFC only),
  Concept2 troubleshooting battery reset (PRIMARY), forum "static data"
  (SECONDARY), and the five live alternatives.

- Concept2, _PM5 Bluetooth Smart Communications Interface Definition_, rev 1.30,
  pp. 6 and 35:
  <https://www.concept2.nl/files/pdf/us/monitors/PM5_BluetoothSmartInterfaceDefinition.pdf>
- Apple, _Building an NFC Tag-Reader App_:
  <https://developer.apple.com/documentation/corenfc/building-an-nfc-tag-reader-app>
- Apple, NFC Human Interface Guidelines:
  <https://developer.apple.com/design/human-interface-guidelines/nfc>
- Apple, NFC reader-session formats entitlement:
  <https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.nfc.readersession.formats>
- Apple, background tag reading (URI-record constraint):
  <https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading>
- Capgo NFC 8.2.5 source, pinned inspected revision:
  <https://github.com/Cap-go/capacitor-nfc/blob/b9e1d8f8132abbf7f795b27c8c9f8c13ad585d71/ios/Sources/NfcPlugin/NfcPlugin.swift>
- Capacitor 8.5.0 retained-event and listener implementation:
  <https://github.com/ionic-team/capacitor/blob/8.5.0/ios/Capacitor/Capacitor/CAPPlugin.m#L42-L103>
- Capacitor Community Bluetooth LE 8.3.0 iOS source, pinned inspected revision:
  <https://github.com/capacitor-community/bluetooth-le/blob/13f2bac3ac0c89a7fe8f8f74afdf69279b408e17/ios/Sources/BluetoothLe/Plugin.swift>
- Capacitor Community Bluetooth LE 8.3.0 queued JavaScript client:
  <https://github.com/capacitor-community/bluetooth-le/blob/13f2bac3ac0c89a7fe8f8f74afdf69279b408e17/src/bleClient.ts#L416-L449>
- Apple, `retrieveConnectedPeripherals(withServices:)`:
  <https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/retrieveconnectedperipherals(withservices:)>
- Installed local sources at design time:
  `app/node_modules/@capacitor-community/bluetooth-le/ios/Sources/BluetoothLe/`
  and an isolated `npm pack @capgo/capacitor-nfc@8.2.5` probe.

One secondary clarification is recorded rather than promoted to platform law:
an Apple engineer states that the old `NDEF` entitlement value has been replaced
by `TAG` and can fail distribution validation:
<https://developer.apple.com/forums/thread/781403>. The implementation plan must
recheck this against the installed SDK, generated entitlements, and signed
archive rather than trusting forum prose alone.

## Next gate

The Gate -1 proof plan is written. Scheduling remains a separate explicit
ruling: do not execute the probe or begin product implementation until James
places Phase NF ahead of or behind Wave A. A GO receipt then supplies the
payload and timing evidence for the separate atomic product implementation
plan.
