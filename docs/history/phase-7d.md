> **Archived 2026-08-28** from `ROADMAP.md` (lines 1349-1381 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 7D — Phone BLE

**Status:** Done (merged 2026-08-11 as PR #79, after a THREE-DAY
hardware walk that found and fixed four wire truths live). Shipped to
TestFlight in v0.7.0, build 564.
**Goal:** The PM5 connects, programs, rows, and saves on an iPhone
through the existing transport seam, closing 7B/7C's owed hardware
walk on a real device instead of the fake transport.
**Design authority:**
`docs/superpowers/specs/2026-08-10-phone-ble-design.md` (plan:
`docs/superpowers/plans/2026-08-10-phone-ble.md`).

- [x] `capacitorBle.ts`'s scan pipeline, typed errors at the seam, and
      the abandoned-sheet queue invariant (spec §3)
- [x] `permission-denied` end to end and the `picking` backdrop
      (`phase` gains no `"choosing"`; the sheet is the plugin's own,
      not an OS picker on iOS — spec §4/§5)
- [x] The Bluetooth capability adapter; `WorkoutDetail`'s Connect
      probe moves onto it (spec §6)
- [x] `cap sync ios` wires `@capacitor-community/bluetooth-le` into
      the Swift package for the first time (spec §8)
- [ ] The hardware walk: spec §10's 8 steps on James's iPhone,
      James-operated at the erg, one question per step

**Release gate:** the v0.7.0 tag and TestFlight build wait on this
phase (James, 2026-08-10: "phone side testing matters for the first
users") — not on the library rebalance or Phase CL2's debt pay-down,
neither of which touches the transport.

**Exit:** the hardware walk (spec §10, all 8 steps) passes on a real
PM5 from a dev build on James's iPhone, and James gives the merge
word.
