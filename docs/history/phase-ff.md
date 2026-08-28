> **Archived 2026-08-28** from `ROADMAP.md` (lines 5617-5678 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase FF — Fast-follow: finish authority, one door to start

**Status:** Done (merged 2026-08-11 as PR #85, walk passed on a real
PM5). Shipped to TestFlight in v0.8.0, build 587.
**Goal:** three tester-facing hardenings, first post-release wave
after v0.7.0 (build 564, on TestFlight): (a) a dropped final split
can no longer cost the last interval's data; (b) no connect path
anywhere can hang unbounded; (c) starting a workout has ONE nudge
model and ONE visual hierarchy, the Connect card's, on both the
timer and PM5 paths.
**Design authority:**
`docs/superpowers/specs/2026-08-11-fast-follow-design.md` (plan:
`docs/superpowers/plans/2026-08-11-fast-follow.md`).

- [x] R1 — the finish-line summary pair (0x0039/0x003A) becomes a
      driver-side FALLBACK, never a replacement: the split stays
      authoritative and immediate inside the grace window; the
      summary fills only at grace expiry, only when every prior
      interval is recorded, with per-interval avg fields honestly
      omitted rather than faked
- [x] R2-web — `webBluetooth.ts`'s `connect()` races `gatt.connect()`
      against the same 10s bound the iOS plugin already enforces, and
      disconnects the zombie link on a late resolve instead of just
      dropping the reference
- [x] ConfirmTargets (642 lines, its own route) removed outright; its
      five entry points rewire directly onto the countdown, with
      `startedAt` restamped at every one so the in-progress guard
      keeps working
- [x] Connect becomes the screen's single primary: new
      `--action-connect` blue token, L1 geometry, positioned above
      Start; "Start" renames to "Start Timer" and demotes to L2
- [ ] The erg confirmation row (James, one step at a time): a nudged
      MULTI-INTERVAL workout that CARRIES REST, rowed start to save
      on the phone, discriminating both premises the R1 subtraction
      rests on (cumulative-vs-per-interval totals, and whether the
      totals include rest) — `pm5-interface-notes.md` §23 walk items
      2 and 4. Plus one timer-path start: card nudge -> Start Timer
      -> countdown directly, nudged target visible in the session.

**Ruling recorded (James, 2026-08-11):** the nudge unification was
CL2 filing, pulled forward into this wave; rate stays read-only
display, pace is the only nudgeable field (Phase CL2's own line
above records the same resolution).

**Remaining ecosystem follow-ons** (from
`docs/monitor/pm5-ble-ecosystem-review.md`'s ranked list; R1/R2
close in this phase, R5/R6 are no-action/design-input already) —
explicitly NOT this wave's scope:

- **R3** — switch `webBluetooth.ts`'s CSAFE writes from
  without-response to acked `writeValue`, matching every surveyed
  client and our own iOS path; cheap insurance against a chunk
  silently dropping on the web/desktop dev path. Trivial effort.
- **R4** — try `services: [CE060000]` (the C2 base service) in
  discovery at the next hardware walk, alongside the existing
  `namePrefix: "PM5"` filter, to shrink the picker sheet to ergs;
  revert instantly if the sheet goes empty.

**Exit:** the erg row (multi-interval, carrying rest, both premise
discriminators settled on the wire) and the timer-path row both pass
on James's iPhone against a real PM5, and James gives the merge word.
