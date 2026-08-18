# Phone leg — 2026-08-18 (Phase CS Item A, the swipe)

**Verdict: PASSED. The gesture works on the device, including the drag
that starts on a grid row — the case that was dead before this phase.**

Medium: native Capacitor app (WKWebView) on James's iPhone, run from
Xcode, connected to a **real PM5**. No rowing: the program was armed and
the surface reached via "Show me the numbers", which renders the grid
without a stroke. Program: ten 250m intervals, so the row list genuinely
overflowed its scroller (the probe's own blind spot — a short grid cannot
scroll, and a walk on one proves nothing new).

## Results

| Case | Outcome | Reading |
| --- | --- | --- |
| Horizontal drag from the hero | pages | the path that always worked, still works |
| **Horizontal drag starting ON a grid row** | **pages** | **the fix, on hardware.** Dead on device before this phase |
| Tap a rail button | switches pane | the segmented control is unharmed; swipe stayed additive |
| Vertical drag on the rows | scrolls the list, pane unchanged | no regression from `touch-action: pan-y` |
| **Deliberately diagonal drag from inside the scrolling rows** | **scrolls the rows; does not page** | the predicted WebKit limit — see below |

## The diagonal case — CORRECTED 2026-08-18, and the first reading was wrong

**What this walk actually established: a drag steeper than 45° starting in
the rows scrolls the list instead of paging. It did NOT establish why, and
the most likely cause is our own code, not the platform.**

The original text here said this "resolved exactly as W3C Pointer Events
issue #303 predicts" and called it the limit the platform leaves us at.
Both claims failed the phase's exit pass:

- **#303 is CLOSED**, resolved by
  [PR #351](https://github.com/w3c/pointerevents/pull/351), which added a
  normative **SHOULD** pointing the other way: once the UA has decided at
  the START of a gesture, "a subsequent change in the direction of the same
  gesture SHOULD be ignored by the user agent for as long as that pointer
  is active." Verified directly against the tracker, not quoted from
  memory. The report itself is about **iOS 13, filed 2019**.
- **Our own rule produces this observation with the UA doing nothing.**
  `swipe.ts` refuses any gesture where `|dx| > |dy|` is false — so a
  *deliberately* diagonal drag (45° or steeper) is refused by us, by
  design. The walker was asked for the extreme, and the extreme is the
  input class our own guard rejects.
- **The probe a day earlier recorded diagonal drags WORKING** on this same
  device and build. The difference between the two is most simply angle,
  not engine.

A third mechanism also fits: a `pointerup` delivered at coordinates frozen
where scrolling took over yields a sub-threshold `dx`.

**Three producers, one observation, and the instrument that would tell them
apart was inert** (below). The honest state is: unexplained, with our own
threshold the leading candidate. What remains untested is the population
that matters — a *near*-horizontal drag from a real hand, which is neither
extreme the walk exercised.

The disposition rule written before the walk (plan, Task 4) still
classifies the OUTCOME correctly: **a drag that fails to take is a limit;
a drag that changes the WRONG pane, or a grid that stops scrolling, is a
failure.** Neither disqualifier happened, so the swipe ships. What the
rule cannot do — and what the first version of this record wrongly used it
for — is settle the CAUSE or the FREQUENCY. Neither is known.

**Named consequence nobody wrote down until the exit pass:** a refused
swipe gives the rower no feedback at all. Someone who tries it twice from
the rows and gets nothing does not conclude "hold it straighter"; they
conclude it is broken — and this cohort has already learned once that
swipe does not work. That argues against advertising a "limit" in release
notes before we know whether the limit is ours and adjustable.

## One thing the walk could not instrument, and why

The `pointercancel` readout exists precisely to record this case, and it
was **inert for this walk**: it rides the same build-time gate as the
fake-monitor seam (`VITE_ENABLE_FAKE_MONITOR`), and the walk card had
just been corrected to drop that flag — because the fake cannot drive a
native build at all (`adapters/monitorTransport.ts` takes the Capacitor
BLE arm whenever `isNative()`). Dropping it removed the instrument along
with the unreachable fake. The plan now says to keep the flag on for
walks. What we have here is the walker's observation ("scrolled the rows
up and down"), which is sufficient to identify the UA taking the gesture,
but it is not the trace the design asked for.

## A defect the walk found that no test had

Dragging across the hero raised an **iOS text selection** mid-gesture —
James: "that could cause accidental fumbling of the phone." A swipe
surface that selects text under the thumb is a real defect, and nothing
in the unit, e2e or screenshot suites could have caught it: selection is
a platform behaviour of a real touch drag. Fixed the same day
(`user-select: none` + `-webkit-touch-callout: none` on
`.connected-surface`), pinned by computed style on both the hero and a
grid row so the pin proves the property reaches the element the finger
lands on rather than merely existing above it.
