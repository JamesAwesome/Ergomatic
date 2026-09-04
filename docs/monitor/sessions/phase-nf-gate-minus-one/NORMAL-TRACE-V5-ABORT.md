# NF-NORMAL-TRACE-v5 pre-device abort — 2026-09-04

| Field | Observed value |
| --- | --- |
| Approved runsheet | `NF-NORMAL-TRACE-v5` at `5f1c716b` |
| Controller | `4604f3be` |
| Outcome | INCONCLUSIVE — pre-device abort |
| NFC attempts | 0 |
| PM5 actions | 0 |
| Rowing / heart rate / captures | 0 / 0 / 0 |
| Operator actions | USB connection and unlock only |

The checked preflight passed and created a fresh empty capture directory. The
controller then printed its `READY` instruction and started its 45-second
acknowledgement timer. James replied `ready`, but the acknowledgement did not
reach the retained controller process before that timer expired. The process
exited 1 with `Timed out waiting for READY`; feeding the acknowledgement then
returned that already-final error.

The controller performs its first `devicectl` call only after accepting
`READY`, so it installed nothing and launched no phone process. The capture
directory contained no files and was removed. No PM5, NFC or BLE operation
occurred, and there was no lab stack to tear down.

This is a controller/operator-transport defect, not a hardware result. A
future walk must not place a short in-process acknowledgement timer across a
Codex/user turn boundary. v5 authorizes no retry; another attempt requires a
new bounded runsheet, PM PASS and James's separate agreement.
