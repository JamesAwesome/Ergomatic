# The app says nothing when it cannot read a monitor

**Date:** 2026-09-07 · **Class:** TRIAD-adjacent (a new rower-facing state on
the connected surface; no stored shape, no number's meaning, no auth) ·
**Status:** DRAFT · **Gate 0:** APPROVED by James 2026-09-07, Option 1 (the
warning REPLACES the READY state) from a rendered mockup with every colour
pairing computed · **Antagonist:** owed on this spec before implementation.

## What and why

A friend of James's rowed five minutes on 2026-09-07 while the app sat on
`READY` and recorded nothing. The cause was a parse failure we have since
fixed (#350), but the SILENCE is a separate defect and it survived the fix:
if any status characteristic ever fails to decode again, the app publishes no
readings, waits forever, and says nothing. The rower is left on a screen
promising a piece that will never start.

We cannot fix an unreadable monitor from inside the app. So the only useful
thing to say is the truth and the way out, which the app already has: row the
piece on the machine and log it by hand.

**Gate 0 chose Option 1**: the phase word becomes `CAN'T READ THIS MONITOR`,
the warning sits under it, and the programmed plan greys to reference. James's
reasoning, recorded because it decides the shape: a banner above a screen that
still reads `READY` annotates the lie rather than correcting it.

## Research

**RF18 checks, run first.** `ls docs/superpowers/research/` — thirteen
documents, none about decode failure or monitor health. `grep` of ROADMAP for
the symptom returns only this item's own row and its sibling about the ring.
No prior work to re-derive.

### Does the system already have this concept? Nearly, and reusing it would be wrong

`onCharacteristicDegraded` exists on the transport (`capacitorBle.ts`, mirrored
on the fake) and looks like the answer. It is not. It reports a characteristic
that could not be SUBSCRIBED, not one that cannot be DECODED, and
`useMonitorSession.ts:5139` consumes it by writing one ring line. Its own
comment says the rest out loud:

> *"The ring names the dead characteristic; the session and its driver never
> hear about it."*

So the adjacent concept is a subscription fact that dead-ends in diagnostics.
Decode failure is a different fact, at a different layer, and there is no
existing carrier for it.

### What escapes the driver today: nothing

`driver.ts:2306-2314`, the `mergeStatus` decode path, on a typed parse error:
records a `frame-error` ring line and `return`s. **No event is emitted, no
state changes, and `maybeEmitFrame` is never reached.** The hook cannot know,
so the surface cannot either. The signal has to be built.

### Who solved this already — in this repo, twice

The trigger is a new mechanism, which the brainstorming rule says must be
researched rather than invented. The best prior art is our own, and it has
already survived an adversarial pass:

- **`armedWatch` / `structure-left`** (`driver.ts:5406-5490`) fires only when
  BOTH a consecutive-tick count AND an elapsed-window threshold are met, on a
  STABLE repeated observation. CLAUDE.md records why both halves exist:
  *"BOTH halves, never one alone — the false economy an antagonist pass already
  caught in an earlier revision of this spec."* A payload that keeps changing
  is a machine still settling, not a machine in a steady wrong state.
- **The liveness watchdog** (`transports/liveness.ts`) is the counter-example
  worth naming: it fires on SILENCE. Ours must not, because our failure mode is
  the opposite — bytes arriving healthily and failing to decode. A rower whose
  monitor goes quiet already gets the lost-monitor path, and conflating the two
  would produce the wrong sentence for both.

**So the trigger copies `armedWatch`'s shape and not the watchdog's**: two
thresholds, on a steady condition, on a signal that only fires while bytes are
actually flowing.

## The trigger

Fire when ALL of:

1. **A characteristic has failed to decode `N` consecutive times** (no
   successful decode of that characteristic in between), AND
2. **at least `W` milliseconds have passed** since the first of that run, AND
3. **no `frame` has EVER been emitted this session.**

Condition 3 is what makes this safe and is the one worth defending. It is
exactly the latch the incident turned on: `maybeEmitFrame` requires
`seen.general && seen.as1 && seen.as2`, all one-way. If a frame has ever been
published, the app is working; a later parse hiccup is a hiccup, and the
lost-monitor and stale paths already cover its consequences. **This warning is
therefore only ever reachable on a monitor we have never once read**, which is
precisely the reported case and cannot be triggered mid-row.

Recovery: if a frame is ever emitted, the state clears. It cannot re-arm,
because condition 3 can never be true again in that session.

**Values are NOT set here.** The antagonist pass should attack them, and
`armedWatch`'s own constants are the reference point rather than a default to
copy blindly.

## The tooling question James asked: build now or reorder first?

**Build now. The tooling gap is real but it is one task inside this work, not a
roadmap reorder.**

The gap, measured rather than assumed. `FakeControls.injectGarbledFrame()`
exists and its doc comment claims it *"exercises `pm5/parse.ts`'s length-guard
`Pm5ParseError` path end-to-end"*. It cannot exercise THIS defect, for two
independent reasons:

- **It targets the wrong characteristic.** It notifies `GENERAL_STATUS_UUID`
  (0x0031) with two bytes. In the reported incident 0x0031 decoded perfectly
  and 0x0032 never did. A test built on this control would corrupt the half
  that works and leave the half that failed healthy.
- **It is one-shot.** It injects a single notification "RIGHT NOW, regardless
  of the script/clock". The trigger above needs a SUSTAINED condition across
  ticks, which is the whole point of the two thresholds.

`preV126Firmware` (added #350) is not a substitute either: it emits SHORT
frames, and short frames now DECODE. It reproduces the old bug's input and the
new code's success, which is the opposite of what is needed.

**Required tool, and it is small:** a fake control that makes a NAMED
characteristic persistently undecodable for the rest of the session — the
existing `failSubscribe(characteristicId)` is the shape to copy, one level
down. Roughly one field and one branch at the notify site.

**Why this is not a reorder.** The tool is a prerequisite for the test, not for
the design, and it is smaller than the feature. The one thing that WOULD
justify reordering is absent: we do not need new hardware, a new capture, or a
walk. The condition is reproducible entirely in the fake once it can hold a
characteristic broken.

**What we still cannot do, stated plainly:** we hold no capture of a real
undecodable monitor (measured 2026-09-07: 0x0032 is 17 bytes in 8248 of 8248
notifications across all committed recordings). So every test here drives
synthetic corruption, and this spec claims only that the app behaves correctly
when decoding fails — never that it has been seen doing so against real
hardware.

## Scope

- `driver.ts` — emit a new event when the trigger fires.
- `useMonitorSession.ts` — carry it into session state.
- `surfaceModel.ts` / the connected panes — the Option 1 rendering.
- `transports/fake.ts` — the persistent-corruption control.
- No server change, no stored shape, no migration.

## Test plan

Failing test first, and the seam test starts upstream of the parse
(recurring failure 24).

1. **Trigger, at the driver.** With 0x0032 held undecodable and 0x0031/0x0033
   healthy, the driver emits the new event once both thresholds are met, and
   NOT before either one alone.
2. **It cannot fire once the app is working.** Emit frames normally first, THEN
   hold a characteristic broken: no event, because condition 3 is false. This
   is the assertion that stops a mid-row false alarm.
3. **The surface.** The phase word reads `CAN'T READ THIS MONITOR`, the warning
   renders with its `role="alert"`, and the plan greys.
4. **Mutation probes**, each recorded verbatim: drop condition 3 (test 2 goes
   red); drop the elapsed threshold (a burst inside one tick fires it); drop
   the consecutive requirement (an interleaved success no longer breaks the
   run); render the warning without changing the phase word (test 3 goes red on
   the word, proving Option 1 rather than Option 2 shipped).
5. **Contrast, measured on the BUILT thing.** Gate 0 flagged one estimate: the
   greyed plan at 42% puts `--ink` at roughly 6.5:1 on `--page`, computed from
   a composite rather than a token pairing. Measure it before merge.

## What this deliberately does not do

- **It does not diagnose.** The rower is told we cannot read the monitor, not
  which characteristic or why. The ring carries that for us, and a byte count
  on a workout screen helps nobody holding an erg handle.
- **It does not retry or reconnect.** There is no evidence a reconnect helps a
  monitor whose firmware we cannot parse, and inventing a remedy we have not
  tested would be worse than the honest dead end.
- **It does not replace the lost-monitor path.** Silence and unreadability are
  different failures with different sentences.
