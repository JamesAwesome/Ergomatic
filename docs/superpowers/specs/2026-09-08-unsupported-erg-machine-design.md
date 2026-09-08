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
`pdftotext -layout`; page count 39, matching that table):

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

**(a) The field is PER-INTERVAL, not per-connection.** The same footnote hangs
off every carrier of the field. On 0x0032, verbatim: *"See Appendix for
enumerated values definitions. For MultiErg workouts, this will be the Machine
Type of the current interval, which may not be the same as the connected
Machine."* This matters because it says the value can legally CHANGE within one
sitting — but only on a MultiErg, and the enum gives MultiErg its own disjoint
values (224-226). The denylist below therefore names only STATIC ski and bike
values, and a value in that set cannot be a MultiErg interval. **This is the
argument that lets a single observation be trusted; it is not a convenience.**

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

A pure domain module, `app/domain/monitor/pm5/ergMachine.ts`, holding the
denylist and nothing else.

```
unsupportedErgMachine(value: number | undefined): "ski" | "bike" | null
```

- `128`, `143` -> `"ski"`
- `192`, `193`, `194`, `207` -> `"bike"`
- `undefined` (absent) -> `null`
- **every other value, including values this enum does not name** -> `null`

**Denylist, not allowlist, and the direction is the decision** (James,
2026-09-08). An allowlist over the named static-RowErg values would also catch
a machine Concept2 invents after rev 1.30 — and would refuse a **RowErg** model
added after rev 1.30, turning a working erg into an unusable one. A false
refusal is total and silent-until-reported; a missed future non-rowing machine
leaves us exactly where we are today. The asymmetry decides it.

The consequence is stated rather than hidden: `STATIC_DYNAMIC` (8), the
`SLIDES_*` family (16-20, 32), `STATIC_DYNO` (64) and the `MULTIERG_*` family
(224-226) all proceed, and a piece on any of them is still posted to Concept2
as `type: "rower"` when Concept2's own enum has `dynamic`, `slides` and
`multierg` members for three of them. That is pre-existing and unchanged. It is
not smuggled in as "out of scope": it is a deliberate consequence of the
approved fail direction, it is a smaller wrong than a SkiErg (all of them ARE
rowing except the Dyno), and it gets a ROADMAP register row in this PR rather
than a sentence in a PR body (RF14).

## The trigger

The driver classifies inside the callbacks it already runs on a successful
decode of 0x0032 and 0x0038 (`driver.ts`'s `mergeStatus` calls). It emits a new
event:

```
| { kind: "unsupported-machine"; machine: "ski" | "bike"; value: number }
```

**Two consecutive readings of the SAME characteristic must agree** before the
event fires, keyed per characteristic exactly as #361's streak is, and for the
same stated reason: a shared counter lets unrelated characteristics combine.
Cost of the second reading: one sample interval. The sample rate is set to the
fastest documented value at connect (`buildSampleRateConfig()`,
interface-notes.md §4).

Why a streak at all, when the value is a constant device property (0 in
3448/3448 committed frames, `pm5-ble-ecosystem-review.md:389`): the outcome of
a false positive is refusing a working erg outright, so one frame of insurance
against a single anomalous byte is bought deliberately. **This is the weakest
claim in the spec and is flagged for the antagonist pass.** If the pass finds
the streak buys nothing over a single observation, delete it — a threshold
nobody can make fire is RF21.

The event fires **at most once per driver instance**.

## Lifetime table (RF27)

| State | Minted | Cleared | Survives teardown? | Survives reconnect? | Survives relaunch? |
| --- | --- | --- | --- | --- | --- |
| `lastUnsupported` (per characteristic, driver-local) | first non-null classification of that characteristic | on any reading that classifies `null`, and with the driver closure | no | no — reborn with the driver | no |
| `emitted` latch (driver-local) | on emit | with the driver closure | no | no | no |
| `session.error` (`ConnectedError`, hook state) | `fail()` | next `connect()` / `cancel()` | no | no | no |

**#361's hardening trap does not apply here, and the reason is written down
rather than assumed.** That feature's fact was "this sitting has NEVER produced
a readable frame" — a negative that a fresh driver cannot re-derive, so it had
to move up a layer. Ours is a positive fact re-derived from the very next frame
of any reconnect, in one sample interval. A driver-local latch is therefore
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
**no run is ever opened** (`driver.ts`: "a run is opened by `program()` and ONLY
by `program()`", after `verifyArmed()` resolves), and therefore nothing can be
stored or sent.

**Try again is OFFERED, not refused.** The two existing no-retry reasons
(`target-ambiguous`, `scan-cleanup-failed`) are refused because retrying cannot
help. Here it can: the likeliest cause of this screen is picking the wrong
device out of a chooser listing several PM5s, and Try again re-opens that
chooser.

### Ordering, and why the interstitial is the screen

`ConnectedInterstitial.tsx:329-341` fires `program()` on the **pairing** phase
transition, not on any frame, and the program write is queued ahead of the
status subscriptions (`driver.ts:1070`). So we will normally have already
programmed the erg when the refusal lands — which is exactly why the terminate
is chained rather than optional.

The refusal is expected to precede `armed` by a wide margin, and the margin is
measured rather than assumed: `armed` requires the program ack plus a
structural readback, and a CSAFE frame's ack at connect time was measured at
1698-2058 ms (`docs/monitor/sessions/ack-latency-census.py`), while status
samples tick at the fastest documented rate. Two ticks is far inside that
window. **The late case is nevertheless specified rather than argued away:**
`fail()` is safe after `armed` too — it disposes the link and clears
`deviceName`, and the connected surface's own routing already handles a
disposed session. A test drives that ordering explicitly.

## Copy — GATE 0

User-visible copy, so nothing is implemented until James approves the RENDERED
screen. The gate presents the interstitial failure screen at real proportions
in both orientations, against the screen it replaces, with contrast ratios
computed as numbers.

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

Draft for the gate, not approved: **"Ergomatic records rowing only. This
monitor is on a SkiErg, so nothing here will start."**

## What this deliberately does not do

Each of these gets a ROADMAP register row in this PR rather than a PR-body
mention (RF14).

1. **No stored column.** Option A means no row from an unsupported machine can
   exist, so there is nothing to record. Option C's column and migration were
   priced and declined for a machine nobody owns.
2. **`mapping.ts`'s `type: "rower"` literal is untouched.** It is correct for
   every row this app can now produce. It stays wrong for `dynamic`, `slides`
   and `multierg` machines, which the approved denylist lets through — row 3.
3. **No handling for a machine we cannot identify.** Absent means old firmware,
   and refusing on ignorance would break working ergs. Reading `0x0016` would
   settle it and needs `Transport.read`, which is already an open register row.

## Testing

Following docs/TESTING.md. Domain gets the heaviest coverage.

- **Domain** (`ergMachine.test.ts`): every named enum value, both boundaries of
  each family, `undefined`, and the unnamed values between families. The table
  is written from the quoted enum, with independent literals — never derived
  from the module's own map, which would make a mistyped constant self-
  consistent (RF21's first smell).
- **Producer-first, not seeded past it (RF24).** At least one test starts
  UPSTREAM: it feeds real 0x0032 bytes through `parseAdditionalStatus1` into
  the driver and asserts the refusal, rather than handing the driver a decoded
  object. `statusFrames.ts`'s builder already encodes `ergMachineType` at both
  offsets.
- **Fake control.** The fake hardcodes `ergMachineType: 0` at two sites; it
  gains a `FakeScript` field so a ski/bike sitting can be driven end to end.
  None of the existing controls can stand in — `preV126Firmware` removes the
  field, `injectGarbledFrame` breaks the decode.
- **Seam test across `armed`.** One test lands the refusal AFTER `armed` and
  asserts the same disposal, because every other test would sit before it.
- **Mutation probes, each reported with what its failure said** (RF21): remove
  a family from the denylist; invert the absent case; delete the terminate
  argument to `fail()`; drop the streak to one reading. Each probe is run
  against a COMMITTED tree (RF22) and anchored on a string grep proven to
  return one hit.
- `pnpm e2e` and `pnpm screenshots` if the rendered screen changes, per RF1.

## Exit criteria

1. A ski sitting driven from real 0x0032 bytes produces the refusal, and no
   `MonitorRun` is ever opened.
2. The terminate is sent before the disconnect, asserted by ordering, not by
   both merely happening.
3. Absent `ergMachineType` behaves exactly as HEAD does, asserted against a
   pre-V1.26 fixture.
4. Every unnamed enum value proceeds.
5. Gate 0 approved on the rendered screen with stated contrast numbers.
