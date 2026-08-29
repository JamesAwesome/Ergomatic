# Walk 2026-08-28 — codebase audit discriminators

This walk removed two P1 device hypotheses for this PM5, preserved the one
completed native interval through a deliberate radio loss, and left the
zero-target question open because the PM5 screen was not a semantic control.

Budget held: eight 100 m intervals plus about ten seconds of a ninth. No heart
rate was used. Laptop legs ran against audit HEAD `a561cd6`; product code was
byte-identical to baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
The native leg ran in the installed production iPhone app. PM5 serial:
`432331249`; firmware was not recorded.

## Provenance

| Files                                                                                                                           | Leg                                                      | Evidence                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| `frame-fingerprint-recording.jsonl(.gz)`, `frame-fingerprint-ring.json`, `frame-fingerprint-*.jpg`, `zero-target-pm5-ready.jpg` | 6×100 m long program                                     | Raw Web Bluetooth stream, app ring, PM5/app photos          |
| `short-replacement-recording.jsonl(.gz)`, `short-replacement-ring.json`, `short-replacement-*.jpg`                              | 2×100 m replacement                                      | Raw Web Bluetooth stream, app ring, PM5/app endpoint photos |
| `native-recovery-ring.json`, `native-recovery-*.jpg`                                                                            | 100 m, 60 s rest, partial second interval, Bluetooth off | Native ring, PM5/app rest photos, saved-detail screenshot   |

The PM5 and app photos are correlated pairs, not literally the same camera
frame. The raw stream/ring supplies ordering for the first two legs; the native
ring plus the saved-detail screenshot supplies the native persistence path.
That limitation is decisive for AUD-009 and is not hidden.

## Results

| Audit question                      | Result                                           | Independent evidence                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUD-010 later-frame retention       | **Cleared for this PM5 in these observed runs.** | The authored fingerprint put intervals 5 and 6 in the second CSAFE frame. The raw recording contains split numbers 1–6 in order; interval 5 carries the authored 60 s rest and interval 6 completes before natural finish. Firmware was not recorded.                                                                          |
| AUD-007 long→short stale tail       | **Cleared for this PM5 in these observed runs.** | Immediately after the six-interval program, the same PM5 received a two-interval program with the same first interval. The raw recording contains only split numbers 1 and 2, then workout state 10 (finished) at 200 m; the PM5 screen says interval 2 and the app log says 200 m. Firmware was not recorded.                 |
| AUD-009 zero pace as “untargeted”   | **Still unknown.**                               | The programming ring proves pace bytes `00 00 00 00`; the PM5 READY screen shows `:00 /500m`. That display is also the live/current-pace field, so without an otherwise-equivalent omitted-pace control it cannot establish sentinel meaning or enforcement.                                                                   |
| AUD-001 native interruption-to-save | **No P1 outcome; narrowed for this exact path.** | Before radio-off, the PM5/ring reported the completed first 100 m at about 28.7 s and 2:23.8/500 m. The saved detail contains exactly one completed interval: 100 m, 0:29, 2:23.5/500 m. The app exposed `LOST THE MONITOR · 1 interval kept`, allowed End/save, and did not invent an actual for the partial second interval. |

## Independent decode

`parseRecording` accepted both files as `pm5-recording/v1`: 976 events for
the six-interval leg and 520 for the replacement.

The raw 0x0037/0x0038 pairs decode as:

```text
frame fingerprint: 1  28.5s 100m
                   2  28.1s 100m
                   3  28.7s 100m
                   4  29.6s 100m
                   5  29.8s 100m  rest=60s rest-distance=46m
                   6  28.4s 100m

short replacement: 1  29.3s 100m
                   2  28.5s 100m
terminal 0x0031: workoutState=10, totalWorkDistance=200m
```

Those values were decoded directly from raw characteristic bytes using the
documented field offsets. They do not use Ergomatic's expected interval list
as the oracle.

## Native lifecycle observation

Opening the iPhone camera during the rest produced a 2.5 s liveness-silence
latch and a transient LOST THE MONITOR banner. The ring then recorded a
4.613 s resume gap and `liveness-recovery` 34 ms later, with no disconnect.
This is a confirmed self-recovering false warning for that background gap, not
lost work and not a ranking-changing P1.

Later, disabling Bluetooth produced the actual native disconnect callback.
The ring had already accepted interval 0 (`actuals 0 -> 1`), and the saved row
retained it. Callback ordering, buffering, and other iOS/firmware combinations
remain unknown; one successful path cannot clear that whole native surface.
