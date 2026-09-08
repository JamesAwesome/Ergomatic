# The app refuses a SkiErg instead of recording it as a row

**Phase MT.** Status: spec. Shape approved by James 2026-09-08 (Option A,
denylist). TRIAD — it decides what a stored row is allowed to MEAN — so this
spec takes a full antagonist pass and its PR takes a PM final gate.

## What and why

The PM5 is the same monitor on a RowErg, a SkiErg and a BikeErg. Ergomatic
has never asked which one it is talking to. So a SkiErg passes our BLE name
filter, accepts our programmed workout, streams frames we decode happily, and
its piece is stored as a **row** — every number internally consistent and
quietly wrong about what was done. Nobody in the household owns one, so this
is defensive work: the app should never be able to record a sport it does not
support, even once.

The fix is to notice and stop. When the monitor tells us it is a SkiErg or a
BikeErg, Ergomatic terminates the workout it just sent, hangs up, and says so
on the screen the rower is already looking at. No run opens, so no row can be
stored and nothing can reach Concept2.

## The harm, stated precisely

Two harms, and the second is the one that made this worth doing now.

1. **Local.** A stored row means rowing everywhere in the app: pace per 500 m,
   the workout library, the 2K/6K baselines, "row" throughout the copy.

2. **External, and hard to retract.** `server/concept2/mapping.ts:543` posts
   `type: "rower"` as a hardcoded literal. Concept2's results documentation
   makes `type` **required** and enumerated — verbatim: *"Must be one of:
   rower, skierg, bike, dynamic, slides, paddle, water, snow, rollerski,
   multierg"* (PRIMARY, `log.concept2.com/developers/documentation/`, fetched
   2026-09-08). So a SkiErg piece does not merely store wrong locally: it is
   uploaded into the rower's Concept2 logbook as a **rowing result**, into a
   ranking population it does not belong to. The same page, on
   `verification_code`, verbatim: *"For the verification code to be accepted,
   the date, time, distance, workout_type and machine type must match that of
   the code."* — so such a row's verification is guaranteed to be rejected by
   Concept2 for machine-type mismatch, which is a symptom we would have chased
   as a verification bug.

This spec does not change `mapping.ts`. Under Option A no such row can be
created, so the hardcoded literal becomes unreachable-by-construction rather
than wrong. See "What this deliberately does not do".

## The wire fact

`ergMachineType` is decoded today by `domain/monitor/pm5/parse.ts` from two
characteristics — 0x0032 offset 16 and 0x0038 offset 18 — and has no consumer
anywhere in `app/src` or `app/domain` (the type's own doc comment says so).

**The enum, PRIMARY, quoted verbatim from Concept2 PM Bluetooth Smart
Communication Interface Definition Revision 1.30, Appendix A "Erg Machine
Type"** (fetched 2026-09-08 from the `concept2.nl` mirror this repo's
`docs/monitor/pm5-interface-notes.md` §1 already names, extracted with
`pdftotext -layout`; `pdfinfo` reports `Pages: 39`, matching that table's
own recorded page count):

```
typedef enum {
  ERGMACHINE_TYPE_STATIC_D,
  ERGMACHINE_TYPE_STATIC_C,
  ERGMACHINE_TYPE_STATIC_A,
  ERGMACHINE_TYPE_STATIC_B,
  ERGMACHINE_TYPE_STATIC_E = 5,
  ERGMACHINE_TYPE_STATIC_SIMULATOR = 7,
  ERGMACHINE_TYPE_STATIC_DYNAMIC = 8,
  ERGMACHINE_TYPE_SLIDES_A = 16,
  ERGMACHINE_TYPE_SLIDES_B,
  ERGMACHINE_TYPE_SLIDES_C,
  ERGMACHINE_TYPE_SLIDES_D,
  ERGMACHINE_TYPE_SLIDES_E,
  ERGMACHINE_TYPE_SLIDES_DYNAMIC = 32,
  ERGMACHINE_TYPE_STATIC_DYNO = 64,
  ERGMACHINE_TYPE_STATIC_SKI = 128,
  ERGMACHINE_TYPE_STATIC_SKI_SIMULATOR = 143,
  ERGMACHINE_TYPE_BIKE= 192,
  ERGMACHINE_TYPE_BIKE_ARMS,
  ERGMACHINE_TYPE_BIKE_NOARMS,
  ERGMACHINE_TYPE_BIKE_SIMULATOR = 207,
  ERGMACHINE_TYPE_MULTIERG_ROW = 224,    /**< Multi-erg row type (224). */
  ERGMACHINE_TYPE_MULTIERG_SKI,          /**< Multi-erg ski type (225). */
  ERGMACHINE_TYPE_MULTIERG_BIKE,        /**< Multi-erg bike type (226). */
ERGMACHINE_TYPE_NUM
} OBJ_ERGMACHINETYPE_T;
```

Two attributes of this document are load-bearing and are quoted rather than
summarised, per RF16's second corollary.

**(a) The field is PER-INTERVAL, and the vendor does NOT say the MultiErg
values are disjoint on the carriers we read.** An earlier revision of this spec
claimed the same footnote hangs off every carrier of the field, and used it to
argue that observing `STATIC_SKI` (128) cannot be a MultiErg interval. That was
false. `grep -n "MultiErg workouts"` over the extracted document returns four
distinct footnote bodies across five carriers:

| carrier | footnote | text, verbatim |
| --- | --- | --- |
| GATT 0x0032 (17B) | 7 | "For MultiErg workouts, this will be the Machine Type of the current interval, which **may not** be the same as the connected Machine." |
| GATT 0x0038 (19B) | 11 | identical to 7 |
| mux 0x0032 (19B) | *(none)* | no footnote marker at all |
| mux 0x0038 (18B) | 22 | "...which **will not** be the same as the connected Machine" |
| 0x003C (10B) | 23 | "...this will be **the one of the MultiErg Machine Types**, which may not be the same as the connected Machine." |

The sentence the disjointness argument needs is footnote 23's, and footnote 23
is on **0x003C — the one carrier this design does not subscribe.** The two we
read say only "the Machine Type of the current interval". A drafter who spelled
out "one of the MultiErg Machine Types" in one place and not the others meant
the difference.

**So the risk is STATED rather than argued away:** a MultiErg running a ski
interval may legally report `128` on 0x0032, and this design would refuse the
whole sitting — a total false refusal, the exact class the denylist direction
was chosen to avoid. It is accepted because nobody in the household owns a
MultiErg and no capture or vendor sentence tells us what one reports on 0x0032.
It is an unowned risk with a ROADMAP row, not a case the document excludes.

**(b) The field is ABSENT, not zero, on old firmware.** 0x0032's carrier was
added in interface revision V1.26 (11/2/2018) and 0x0038's in V1.27
(11/8/2018) — `pm5-interface-notes.md` §10 quotes both revision rows. PR #350
made `parse.ts` omit the property rather than set it `undefined`, and
`parse.test.ts` pins that with `Object.hasOwn`. Absence means *we do not know*,
and this design does nothing on absence.

**A third carrier exists and is deliberately not used.** 0x003C ("C2 rowing end
of workout additional summary data characteristic 2", 10 bytes) carries Erg
Machine Type as its last field, and `0x0016` in the Device Information service
is a READ-only "Connected Erg Machine Type". We subscribe to neither. 0x003C
arrives only at the END of a workout, which is far too late for a refusal;
0x0016 needs a `Transport.read`, which does not exist and is already its own
open-item register row. Recorded so a later reader does not think they were
missed.

## The classification

A pure domain module, `app/domain/monitor/pm5/ergMachine.ts`, holding the rule
and nothing else.

```
export type UnsupportedMachine = "ski" | "bike" | "dyno";
unsupportedErgMachine(value: number | null): UnsupportedMachine | null
```

**`number | null`, never `number | undefined` (RF33).** An optional-typed input
fails OPEN on absence: a call site that mistypes or forgets the field proceeds
silently and no assertion can see it. Requiring the parameter with `null`
meaning "absent" makes the compiler the gate. The caller reads
`decoded.ergMachineType ?? null` at the one site that knows the property may be
omitted.

**The rule, in one sentence: refuse every value the vendor NAMES as not
rowing; allow everything else, named or not.**

| Value | Vendor name | Result |
| --- | --- | --- |
| `64` | `ERGMACHINE_TYPE_STATIC_DYNO` | `"dyno"` |
| `128`, `143` | `STATIC_SKI`, `STATIC_SKI_SIMULATOR` | `"ski"` |
| `192`, `193`, `194`, `207` | `BIKE`, `BIKE_ARMS`, `BIKE_NOARMS`, `BIKE_SIMULATOR` | `"bike"` |
| `225` | `MULTIERG_SKI` | `"ski"` |
| `226` | `MULTIERG_BIKE` | `"bike"` |
| `224` | `MULTIERG_ROW` | `null` — a MultiErg on a rowing interval IS rowing |
| `null` | the field was absent from the frame | `null` |
| anything else | unnamed by rev 1.30 | `null` |

**This is still a DENYLIST and the fail direction is unchanged** (James,
2026-09-08): an unnamed value proceeds, so a RowErg model Concept2 adds after
rev 1.30 can never be bricked by us. What changed is that the list now matches
the rule James stated rather than a subset of it.

**Why the Dyno is in, having been left out of the first revision.** An earlier
option list offered to "widen the denylist" and bundled `STATIC_DYNO` with all
three `MULTIERG_*` values including `MULTIERG_ROW` — which is rowing. That
bundle was the controller's invention, not the vendor's grouping, and it made a
bad option out of a good half; James declined it on those terms. Taken on its
own, `64` is a strength machine with no 500 m pace and nothing this app models.
Leaving it out would put a Dyno in a published "supported" tier, which is not a
hedge but a falsehood — and the denylist's own justification does not cover it,
because that justification is about UNNAMED FUTURE values ("an allowlist would
refuse a RowErg model added after rev 1.30"), while `64` is named, quoted, and
cannot become a RowErg. RF34: a spec that states "the app should never be able
to record a sport it does not support" and then applies it to two of the three
named non-rowing machines in the enum it quoted.

**Why `225`/`226` are in and `224` is not.** These are the MultiErg subfamily,
and the vendor's own 0x003C footnote spells out that a MultiErg reports "one of
the MultiErg Machine Types". A monitor reporting `225` is on a ski interval, so
refusing it is the CORRECT case rather than a new risk class — it is the same
judgement as `128`, one enum family over. `224` is a MultiErg on a rowing
interval and proceeds. The residual MultiErg risk in wire fact (a) is
unchanged and points the other way: a MultiErg might report a STATIC ski value
and be refused for the whole sitting.

The consequence still stated rather than hidden: `STATIC_DYNAMIC` (8) and the
`SLIDES_*` family (16-20, 32) proceed, and a piece on either is posted to
Concept2 as `type: "rower"` when Concept2's own enum has `dynamic` and `slides`
members. Unchanged, and it has a ROADMAP row.

## The trigger

The driver classifies inside the callbacks it already runs on a successful
decode of 0x0032 and 0x0038 (`driver.ts`'s `mergeStatus` calls), and emits:

```
| { kind: "unsupported-machine"; machine: UnsupportedMachine; value: number }
```

**On the FIRST classifying observation. There is no streak, and the reason it
was removed is worth keeping.** An earlier revision required two consecutive
agreeing readings, priced as "one sample interval of insurance". Measured, that
was wrong twice over:

- The 1698-2058 ms connect-time CSAFE ack is not margin. `releaseStatusSubscriptions("arm")`
  fires at the END of the programming sequence (`driver.ts`), so the status
  subscriptions do not exist until that ack lands — it is a shared prefix of
  both events, not a head start for one. The real margin, subtracted from the
  committed native ring `docs/monitor/sessions/walk-2026-09-03-connect-sooner/ring-3-programmed-workout.json`,
  is **544 ms** (`notify-first 0x0032` at +540 ms after `status-subscribe: arm`,
  `armed` at +1084 ms), and it comes from subscribe ORDER inside the deferred
  group, not from the ack.
- The tick rate is not 100 ms. Counting `dir: "rx"` arrivals per characteristic
  across eight committed recordings gives **508 ms** on six and **1008 ms** on
  two — never the 100 ms `buildSampleRateConfig()` writes, which `driver.ts`'s
  own `DEFAULT_PREPARE_SETTLE_TICKS` comment already concedes ("at the ~2Hz
  sample rate").

So a two-reading streak spent 94% of the margin on the 2 Hz captures and
REVERSED the ordering on the 1 Hz ones. And it guarded an event with no
evidence of existing: BLE PDUs carry a 24-bit CRC and are retransmitted, a
short or garbled 0x0032 returns a typed `Pm5ParseError` and never reaches
classification at all, and the field reads 0 in 3448 of 3448 committed frames.
Neither a false positive nor a false negative could be constructed — which by
RF21 makes it decoration.

The event fires **at most once per driver instance**.

## Why no record can be stored — an invariant, not a race

This is the load-bearing claim of the whole design, and it does not depend on
ordering, tick rate, or which door the rower came through.

`driver.ts`'s `maybeEmitFrame()` opens with:

```
if (!(seen.general && seen.as1 && seen.as2)) return;
```

`seen.as1` is set only by a successful 0x0032 decode — the same decode that
classifies. And the stored record opens only at the `ready` -> `live`
transition, which is driven by a `frame` event (`useMonitorSession.ts`: "a run
only opens at the `ready` -> `live` transition").

**Therefore no `frame` can exist before a 0x0032 has decoded, and no record can
open before a `frame`.** The classification is available strictly before the
first moment anything can be stored, on both connect doors.

An earlier revision argued this from a race ("the refusal lands before `armed`")
and cited `driver.ts`'s "a run is opened by `program()` and ONLY by `program()`".
That comment is about the DRIVER's `activeRun`, not the stored `MonitorRun`, and
the same file falsifies it nineteen lines later for `beginFreeRow()`. The
invariant above is both stronger and simpler, and it is what this design rests
on.

## The free-row door, and the one thing that IS reachable

`/justrow` (`src/justrow/JustRow.tsx`) is a second connect door on the same
hook. `beginFreeRow()` emits `armed` on the p.80 CSAFE ack — and that ack is
what releases the status subscriptions — so on that door `armed` precedes the
first classifiable frame **structurally**, measured at 449 ms in
`ring-2-free-row.json`. No tuning changes the sign.

That does not endanger the record (see the invariant above), but one thing does
happen inside the `armed` handler: a staged handoff retire fires
(`retireHandoff(staged, "connect-guard-armed")`), tombstoning a previous
unlogged monitor record. Its own comment states the precondition this design
violates: *"This event is the first point a failed or cancelled attempt CANNOT
reach ... which is what makes retiring HERE safe."*

**Ruling (James, 2026-09-08): accept it, correct the comment, file a row.** The
loss is not silent — reaching a staged retire at all requires the rower to have
already confirmed "connect anyway" over that record, so it is a consented
discard followed by a refused sitting. The cost of the alternative was measured
and declined: holding the free row's `armed` until classification would delay
READY by ~449 ms on every Just Row for everyone, forever, to protect against a
machine nobody owns.

**Two obligations follow, and neither is optional (RF34 — a change that
half-applies its own principle is worse than one that never stated it):**

1. The `armed` handler's comment is corrected IN THIS PR. It currently reads as
   a guarantee, and this design makes it false. It must name the refusal as the
   failure that can now reach it.
2. A ROADMAP row records the residual: on the free-row door only, a refused
   sitting can retire a record the rower consented to discard for a piece they
   never got.

## Lifetime table (RF27)

| State | Minted | Cleared | Survives teardown? | Survives reconnect? | Survives relaunch? |
| --- | --- | --- | --- | --- | --- |
| `emitted` latch (driver-local) | on the first classifying observation | with the driver closure | no | no — reborn with the driver | no |
| `session.error` (`ConnectedError`, hook state) | `fail()` | next `connect()` / `cancel()` | no | no | no |

The table is short because the streak is gone: with a single-observation
trigger there is no per-characteristic counter to have a lifetime at all. That
is the second reason to prefer it.

**#361's hardening trap does not apply here, and the reason is written down
rather than assumed.** That feature's fact was "this sitting has NEVER produced
a readable frame" — a negative that a fresh driver cannot re-derive, so it had
to move up a layer. Ours is a positive fact re-derived from the very first
0x0032 of any reconnect — and, since no frame can be emitted before that decode,
re-derived before anything downstream can act on its absence. A driver-local latch is therefore
correct AND self-healing: reconnecting to the same SkiErg re-refuses;
reconnecting to a RowErg does not inherit a stale refusal. Nothing about the
device needs to outlive the driver.

## The refusal

`useMonitorSession` gains one `ConnectedError` reason, `"unsupported-machine"`,
and on the event calls the existing failure path:

```
fail({ reason: "unsupported-machine", detail: <approved copy> },
     driver.terminate())
```

Both halves of that call are checked against the real declarations rather
than assumed: `fail` is
`(error: ConnectedError, pendingTerminate?: Promise<void>) => void` and
`MonitorDriver.terminate` is `terminate(): Promise<void>`
(`domain/monitor/types.ts`).

`fail()` already does every part of what Option A means, and this design adds
no new mechanism to it:

- it unsubscribes every listener, then **chains** the disconnect behind the
  passed terminate promise (its own comment records why: hanging up while a
  terminate write is in flight can abort it and leave the erg ARMED with the
  workout we just sent — DEVIATIONS row 63);
- it clears `driverRef` and `deviceName`, which is what the interstitial's Try
  again branches on;
- it renders the failure screen with `detail` as copy-ready prose.

So: the workout we pushed onto the SkiErg is withdrawn, the link is dropped,
and — by the frame invariant two sections above, not by this call's timing —
**no record can ever have opened**, so nothing can be stored or sent.

**Try again is OFFERED, and what it does depends on how the rower got here.**
`ConnectedInterstitial.tsx`'s `request` is *"passed unchanged to
`session.connect(request)` on mount AND on Try again, so a targeted retry
repeats the exact target and never opens the picker."* So:

- from a PICKER request, Try again reopens the chooser, which is genuinely
  useful — the likeliest cause of this screen is picking the wrong monitor from
  a list;
- from a TARGETED request (an NFC scan, a remembered device), Try again repeats
  the same machine and refuses again.

It is still offered rather than refused, because the picker case is real and a
dead button is worse (the 2026-08-23 walk found exactly that). **The copy must
not promise a chooser**, since half the callers will not get one — this is a
Gate 0 constraint, not a note.

### Which screen the rower is on

`ConnectedInterstitial.tsx` fires `program()` on the **pairing** phase
transition, not on any frame (the effect is gated
`session.phase === "pairing" && programmedForDeviceRef.current !== session.deviceName`).
So we have normally already programmed the erg when the refusal lands, which is
exactly why the terminate is chained rather than optional.

The refusal therefore renders on the interstitial's failure screen on the
programmed door, and on `JustRow.tsx`'s own failure frame on the free-row door.
**Both are user-visible and both are in Gate 0's scope** — `JustRow.tsx`
hardcodes the heading "Could not connect" and renders only `session.error.detail`
beneath it, and that heading is a lie for this refusal: we connected perfectly,
which is precisely how we know what the machine is.

## Copy — GATE 0

User-visible copy, so nothing is implemented until James approves the RENDERED
screens — **plural**. The gate presents BOTH failure surfaces at real
proportions in both orientations, against what each replaces, with contrast
ratios computed as numbers:

1. `ConnectedInterstitial.tsx`'s failure screen (the programmed door), whose
   current form is committed as `docs/screenshots/connected-interstitial-failed.png`
   and `-landscape.png`;
2. `JustRow.tsx`'s failure frame (the free-row door), whose hardcoded
   "Could not connect" heading this refusal falsifies and which therefore needs
   a decision, not just a `detail` string.

**No new colour pairing is introduced** — the refusal reuses the shipped
classes — so every ratio below is a re-measurement of what already ships,
computed rather than eyeballed (RF6):

| pairing | where | ratio |
| --- | --- | --- |
| `--ink` on `--page` | serif line | 15.41:1 |
| `--ink-2` on `--page` | body line | 9.74:1 |
| `--ink-3` on `--page` | status label, reassurance, DETAIL title | 6.69:1 |
| `--ink-2` on `--surface-sunken` | DETAIL lines | 9.16:1 |

Three of those reproduce numbers `index.css` already records (6.69, 10.81,
17.11 for the `--surface` variants), which cross-checks the arithmetic.

Constraints the copy must satisfy, decided here so the gate argues about words
and not principles:

- **Name the machine, not the monitor.** RF32 anonymises "PM5" in copy, and
  this is the exception the rule itself names: the whole sentence is about
  WHICH machine this is. "SkiErg" and "BikeErg" are the machine's names, not
  the monitor's.
- **The subject is Ergomatic, not the erg.** #361's precedent. The rower's
  SkiErg is not broken; we are the ones who only do rowing.
- **Say what to do next**, as #361's does ("Row your piece on the machine,
  then log it by hand from Today").

**How the copy is actually rendered, which constrains its shape.**
`ConnectedInterstitial.tsx` holds `NOT_A_MACHINE_REFUSAL`, an EXHAUSTIVE
`Record` over every `ConnectedError["reason"]` — so adding
`"unsupported-machine"` is a compile error until it is classified, by design
("a `Set` compiles even if a future reason is never added to it"). It is
classified `true`: the PM5 is not refusing our workout, we are refusing the
machine. That has two consequences the copy must live inside:

- the serif headline IS `error.detail`, split on `\n` into a serif line plus
  optional body lines;
- the standing line "End whatever is showing on the monitor, then try again."
  is suppressed, which is correct — it would be nonsense here.

**Approved (James, 2026-09-08):** serif **"Erg type not supported"**, body
**"This monitor is on a SkiErg. Nothing here will start."** — with "BikeErg" or
"Dyno" substituted for what the machine actually is. Per the Try again finding
above, no line promises a chooser.

The headline is a terse fragment because its neighbours are: `Could not
connect`, `Lost the monitor` and `Bluetooth permission needed` are the other
hard-coded serif lines on these two screens, and none is a sentence. The PM
argued for reverting to the earlier full sentence on the grounds that a status
code invites an explanation link; the register evidence does not support that
reading, and James kept his. Both are in `pm-ledger.md`.

### The link to the support matrix

**Approved (James, 2026-09-08), with the design pass's recommendation and
against the PM's — both recorded.** The screen carries one link,
**`WHICH ERGS WORK ›`**, into the existing `connect-the-monitor` article.

Every number here is MEASURED: the design pass replicated the real CSS and
faces in Playwright on chromium and webkit at 390x844 and 844x390, and
validated the harness against the committed landscape capture first (predicted
action-stack top 96 px, capture ~97 px).

- **NOT a fifth button.** The landscape column is 338 px. Four buttons leave
  78 px of body; five leave **14 px** — less than one 11 px mono line. That is
  a deleted screen, not a compressed one.
- **NOT an inline anchor** inside `.connected-body-line`. `e2e/design.spec.ts`'s
  `assertTapTargets` sweeps every `a, button, [role=button], input, select` for
  44 px in BOTH dimensions with one carve-out, and already runs on the failed
  interstitial. A 13 px mono anchor is ~18 px tall and fails the gate.
- **A block link** in the `.reader-next` idiom (`display: flex; align-items:
  center; min-height: var(--tap)`), measured **350x44 portrait, 440x44
  landscape**.
- **Position is load-bearing, not taste.** `.connected-interstitial-body` is
  `justify-content: center`, so DOM order decides what the 78 px landscape
  window shows at rest. After the body line and before `.connected-reassurance`
  it is fully visible at rest on both engines; placed last, below DETAIL, it
  needs a scroll to 99 (chromium) / 101 (webkit). Stress-tested at rest across
  a longer device name, a BikeErg body line, a two-line headline, and a DETAIL
  panel with no raw line — visible in all four, both engines.
- **Keep the DETAIL panel.** It is ballast that holds the link inside the
  visible band, and it is what a tester needs if the machine-type read is ever
  wrong.
- **Ink, not accent.** `--ink` on `--page` = 15.41:1, the app's most-used
  pairing, so this introduces NO new colour pairing. Accent would have passed
  (5.35:1) and still been wrong: `Try again` is already solid accent,
  `.button-connect` exists precisely because two reds compete, and
  `docs/design/README.md`'s "accent means exactly four things" does not include
  a text link. The underline carries the affordance the colour cannot.
- **A router `Link` carrying `state={{ from: location.pathname }}`.** An
  `<a href>` full-page-navigates and tears the app down. Without the `from`
  key, Reader's ✕ resolves `origin ?? "/news"` and dumps the rower on the News
  tab — `ArticleLink.tsx`'s own recorded field bug, verbatim. `ArticleLink`
  itself is NOT reusable here: it reads `useReadingTrail()`, which a product
  screen has no trail for.
- **Both doors, same link, same words, same position.** JustRow has room and
  then some: two buttons leave a 206 px landscape body against 149 px of
  content, so it does not scroll at all with the link added.

**The cost, stated because both opinions found it independently:** the link is
an EXIT, not a detour. `started` is local `useState` in `WorkoutDetail.tsx` and
`JustRow.tsx`, so navigating away unmounts the refusal frame — keep-awake off,
mount lease released — and the rower returns to the workout detail, which
offers Connect again, not to this screen. Accepted: by the time the refusal
renders, `fail()` has already disconnected and cleared `driverRef`, so there is
no live session to strand.

**This is the app's first product→article link since the 2026-08-23
teaching-surfaces ruling.** The PM recommended against spending that precedent
on this screen; its reasoning is in `pm-ledger.md`. James ruled for the link.

## The support matrix

Published as a section in the existing `connect-the-monitor` article — NOT a
new article, and NOT a table: `.reader-body`'s CSS set is body, inset, figure,
header, meta, title, next and close, with no table rules at all, so a table
would be new CSS and a bad screen in a 320 px column. Three `h2`-led tiers,
prose and plain lists, using only what the reader already renders.

**The tier names are James's** (2026-09-08), and the honesty goal he gave them
decides how the middle one is WRITTEN: by its named limitation, not by our
confidence in it.

- **Supported — confirmed.** One row, and that is the point: the only erg this
  project has ever measured reports `0`, which the vendor enum names
  `STATIC_D`. Every other RowErg model is an inference from a sibling enum
  value, which is the tier below.
- **Supported — best effort.** Dynamic RowErg, RowErg on slides, MultiErg on a
  rowing interval, RowErg models A/B/C/E, a monitor too old to say which
  machine it is, and any value rev 1.30 does not name. Written as what is true
  rather than as a confidence claim: *the piece itself is right — it is rowing,
  and pace per 500 m means what it says — but Ergomatic tells Concept2 it was a
  plain RowErg, so the logbook entry names the wrong machine and its
  verification code will not be accepted.* That is deterministic, not a risk:
  Concept2's own documentation makes the code conditional on machine type
  matching, and `mapping.ts` sends `rower`.
- **Unsupported.** SkiErg, BikeErg, Dyno. Refused: nothing programmed, nothing
  recorded, nothing sent.

**Word budget, so the registry stays honest.** `connect-the-monitor` is
recorded at 217 words / `minutes: 2`, and ceil(360/180) = 2, so under 143 added
words leaves `minutes` untouched. The recount is recorded either way — the
registry comment requires the number, not the change.

**Gate 0 for the article is WORDING-ONLY** — James reads the prose, no captures
(the no-screenshots-for-copy ruling, 2026-08-23).

**A published matrix is a claim later PRs can falsify**, the same class as a
shipped release note. Its ROADMAP row names the reconciliation trigger, and so
does a comment in the article's own source beside the recount habit already
living there.

## What this deliberately does not do

Each of these gets a ROADMAP register row in this PR rather than a PR-body
mention (RF14). **The count is checkable against the Phase MT
section** — an earlier revision claimed three and filed two.

1. **No stored column.** Option A means no record from a named unsupported
   machine can open, so there is nothing to store. Option C's column and
   migration were priced and declined for a machine nobody owns. *Row: none
   needed — this is the approved shape itself, not an owed follow-up. Stated
   here because the earlier revision counted it as a row that was never filed.*
2. **`mapping.ts`'s `type: "rower"` literal is untouched.** Correct for every
   record this app can now open. Still wrong for `dynamic`, `slides` and the
   MultiErg-on-a-rowing-interval case, which the denylist lets through — and
   the published matrix now states that limitation in the app's own voice, so
   this row also carries the reconciliation trigger: changing `mapping.ts` or
   the denylist reconciles the article's middle tier and recounts `minutes`.
3. **No handling for a machine we cannot identify.** Absent means pre-2018
   firmware, and refusing on ignorance would break a working erg. **`0x0016` is
   NOT the safe fallback an earlier revision implied:** rev 1.30's own revision
   history reads *"2/3/2017 ... Deleted Machine Type information in Device Info
   Service as firmware unable to support it. V1.21."* — so the parked answer
   may not exist on the wire at all, and the row says so.
4. **A MultiErg reporting a STATIC ski or bike value would be refused for the
   whole sitting** (see wire fact (a)). Unowned risk, accepted, no capture and
   no vendor sentence to settle it. Note the direction: `MULTIERG_SKI`/`_BIKE`
   (225/226) being refused is the CORRECT case and is now in the denylist; this
   row is about a MultiErg reporting `128`/`192` instead, which we cannot
   distinguish from a real SkiErg.
5. **The refused machine is remembered.** `ConnectedInterstitial.tsx` calls
   `saveLastDevice(session.deviceName)` on every successful pair, so a refused
   SkiErg still becomes `LAST USED` on workout detail. Cosmetic, and fixing it
   inside this PR would widen a refusal change into the handoff-memory surface.

## Testing

Following docs/TESTING.md. Domain gets the heaviest coverage.

- **Domain** (`ergMachine.test.ts`): every named enum value, both boundaries of
  each family, `null`, and the unnamed values between families. The table is
  written from the quoted enum with independent literals — never derived from
  the module's own map, which would make a mistyped constant self-consistent
  (RF21's first smell). **`224` and `225` are adjacent and disagree**, which is
  the pair most likely to be typo'd into agreement; both get their own row and
  the test title says why.
- **Producer-first, not seeded past it (RF24).** At least one test starts
  UPSTREAM: real 0x0032 bytes through `parseAdditionalStatus1` into the driver,
  asserting the refusal — never a hand-built decoded object. `statusFrames.ts`'s
  builder already encodes `ergMachineType` at both offsets, so the bytes are
  producible.
- **The invariant, tested as an invariant.** One test asserts that no `frame`
  event is emitted before a 0x0032 has decoded, and one asserts no record opens
  on a refused sitting — these gate the claim the whole design rests on, and
  neither may be replaced by a timing assertion.
- **Both doors.** The free-row door gets its own test, because its `armed`
  ordering is the opposite sign and every programmed-door test would sit on the
  wrong side of it.
- **Fake control.** The fake hardcodes `ergMachineType: 0` at two sites
  (`fake.ts`); it gains a `FakeScript` field so a ski/bike sitting can be driven
  end to end. None of the existing controls can stand in — `preV126Firmware`
  removes the field, `injectGarbledFrame` breaks the decode.
- **Mutation probes, each reported with what its failure said** (RF21): remove a
  family from the denylist; make absence classify as unsupported; delete the
  terminate argument to `fail()`; delete the `seen.as1` conjunct from
  `maybeEmitFrame`. Each probe runs against a COMMITTED tree (RF22), anchored on
  a grep proven to return exactly one hit.
- **The link, gated where it can go red.** One test drives the link and asserts
  it carries `state.from`, because the failure it prevents (Reader's ✕ landing
  on the News tab) is invisible to a test that only asserts the link renders —
  RF4's "assert it works, not that it exists". The design sweep's
  `assertTapTargets` already runs on the failed interstitial and covers the
  44 px floor with no carve-out needed.
- `pnpm e2e` and `pnpm screenshots`, per RF1 — the diff touches `app/src/`.

## Exit criteria

1. A ski sitting driven from real 0x0032 bytes produces the refusal, on BOTH
   doors, and no record opens on either.
2. No record can open before a 0x0032 has decoded — asserted from the frame
   invariant, not from any measured ordering.
3. The terminate is sent before the disconnect, asserted by ordering, not by
   both merely happening.
4. Absent `ergMachineType` behaves exactly as HEAD does, asserted against a
   pre-V1.26 fixture.
5. Every unnamed enum value proceeds.
6. Gate 0 approved on BOTH rendered screens, with the stated contrast numbers.
7. The `armed` handler's comment no longer claims a precondition this design
   falsifies.
8. A Dyno (`64`) and a `MULTIERG_SKI` (`225`) are refused; a `MULTIERG_ROW`
   (`224`) is not — asserted per value, from the quoted enum.
9. The link carries `state.from`, proven by a test that fails without it.
10. The article's middle tier states the Concept2 `type` limitation, and the
    registry's `minutes` recount is recorded whether or not it changed.
