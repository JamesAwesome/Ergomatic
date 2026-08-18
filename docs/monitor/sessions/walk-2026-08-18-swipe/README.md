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

## The diagonal case is a documented limit, not a failure

This is the one case no Chromium run can see, and it resolved exactly as
W3C Pointer Events issue [#303](https://github.com/w3c/pointerevents/issues/303)
predicts: on iOS, a page that scrolls vertically claims a drag that
strays from a straight horizontal, and the app's gesture never completes.

The disposition rule written before the walk (plan, Task 4) classifies
this correctly: **a drag that fails to take is a limit; a drag that
changes the WRONG pane, or a grid that stops scrolling, is a failure.**
Neither happened. `pan-y` is already the strongest claim available —
`touch-action: none` on the scroller would fix the arbitration and kill
grid scrolling with it — so this is where the platform leaves us. The
rower's recourse is the same gesture, straighter, or the rail.

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
