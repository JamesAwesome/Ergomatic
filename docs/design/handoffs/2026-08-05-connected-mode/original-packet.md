# Ergomatic Phase 7 — the PM5 connected mode: design handoff packet

**Date:** 2026-08-05 · **From:** the build session · **For:** the design
session, before implementation. The brainstorm is done; every product
parameter below is DECIDED (James's rulings) — your job is the screens.
Reference screenshots in `reference/` (ErgZone, James's own captures);
our current screens in `current-screens/`.

## What the phase is

The app programs a Concept2 PM5 over Bluetooth and runs the session from
the machine's own truth. WorkoutDetail gains **Connect** (a level-2
block below Start): it runs the existing Confirm screen (nudged targets
become the programmed targets), then a pairing/programming interstitial,
then lands on a **swipeable connected surface**. The phone-timer path
(Start) is untouched; the PM5 is optional forever.

## The design system (unchanged from the UI-fix round)

- Authority: `docs/design/README.md` — the five-level button table and
  the accent rule are standing law now. Accent means exactly four
  things: level-1 action, resolved split/duration, destructive, active
  tab mark. Never "selected", never decoration.
- Tokens only; serif display (Newsreader) titles; IBM Plex Mono for
  labels/status/numbers; Archivo for controls. ≥44px targets, WCAG AA
  (CI-enforced, incl. a no-small-`--ink-4`-labels sweep).
- Idioms available: the sheet (SheetShell — dialog, focus-trapped), the
  staged confirm (destructive two-tap), chip geometry, mono captions,
  the timer's card idiom (big value + mono caption + sub-line ref —
  see `current-screens/timer.png`).

## Decided parameters (do not reopen; design within them)

1. **Three swipeable panes, pager dots** (ErgZone-style dots, see
   references): (A) **our standard timer** rendered from machine data —
   same layout family as `timer.png`; (B) **the live view** — big
   numbers straight off the machine: current pace, SPM, meters, HR;
   (C) **the interval grid** — one row per programmed interval.
2. **PM5-authoritative**: the machine drives elapsed/distance/interval
   position. Pausing on the erg pauses the display. There is no phone
   clock in connected mode.
3. **Confirm-then-connect**: the flow passes through the existing
   Confirm targets screen (unchanged, see `confirm.png`).
4. **PM5 actuals feed the Log screen** (per-interval splits, SPM, HR)
   — the post-session flow reuses SessionComplete → Log unless design
   argues a connected variant; if so, propose it.
5. **The grid shows TIME REMAINING on the active row** (counts down),
   not elapsed/total. Completed rows show their actuals; upcoming rows
   show programmed values (the ErgZone grid's structure, our values).
6. **Information wants to be free**: everything ErgZone locks (HR%,
   etc.) is shown, always. No lock icons exist in this app. When the
   machine genuinely lacks a metric (no HR belt paired), the cell shows
   `—` — a capability degradation, never a hidden column.
7. **Monitor-agnostic naming**: screens/copy say "monitor" or the
   device's actual name once connected ("PM5 430123456") — the UI never
   hardcodes PM5-isms structurally (a future non-Concept2 monitor slots
   in). Column set: Time, Meters, /500m, SPM, HR, Rest (matching the
   normalized frame the driver layer emits).

## What needs designing

### 1. Connect's placement (small)
`workout-detail.png`: the stack is Start (L1) / Log it after (L2) /
Edit (L2) / rule / Delete (L4). Connect joins as an L2 — where in the
order, and does it read `Connect` / `Row connected` / other? (Copy
yours; one word preferred; it must not compete with Start.)

### 2. The pairing/programming interstitial — the state machine (the real work)
Full-screen (like Countdown) or a sheet — your call. States to design,
each needing copy + affordances:
- **Scanning** (no monitor found yet; how long before we suggest
  checking the erg is awake?)
- **Multiple monitors found** (gym case — a pick list, device names)
- **Pairing** (connecting to the chosen one)
- **Programming** (pushing the workout; usually <2s)
- **Programming failed / rejected** (retry + fall back to the phone
  timer — the escape hatch must always offer the Start path)
- **Ready → auto-advance** to the connected surface
- Every state needs a cancel that lands back on the detail screen.

### 3. The three panes (the centerpiece) — PORTRAIT AND LANDSCAPE BOTH
Landscape is the primary context (phone mounted on the erg). Panes:
- **(A) Our timer, connected**: start from `timer.png` /
  `timer-landscape.png`. What changes when the machine drives: the
  connection indicator (subtle — mono caption family?), machine-paused
  state (the erg's own pause, not our button — what does the transport
  row become? there is no Pause button the phone owns in connected
  mode), and actual-vs-target when the machine reports current pace.
- **(B) The live view**: pure machine data, biggest possible numbers —
  the at-a-distance glance. Pace, SPM, meters, HR (— when absent),
  elapsed/remaining. Compare `reference/ergzone-live.png`; ours should
  out-legibility it at 2 meters in landscape.
- **(C) The grid**: `reference/ergzone-grid.png` is the structure.
  Ours: Time / Meters / /500m / SPM / HR / Rest columns, ALL visible;
  active row counts down (time remaining); completed rows = actuals;
  upcoming = programmed values in the muted treatment; the active row
  needs a clear now-marker. Fitting six columns at 390px portrait is
  the hard part — landscape is roomier; decide what compresses in
  portrait (never hides).
- **Pager dots**: position (clear of the erg mount's likely crop),
  tap targets, and which pane is the landing default (the grid? the
  timer? say which and why).
- **Mid-session states across all panes**: erg-paused, connection lost
  (reconnecting — the session continues on the erg; the phone must say
  so honestly and rejoin gracefully), reconnected.

### 4. The landscape rules
- The connected surface must NEVER scroll in landscape — everything
  fits or compresses. (The existing timer has a vertical-scroll-in-
  landscape bug being fixed this phase; your landscape specs should
  assume a non-scrolling canvas, 844×390 as the design frame.)
- Assume a mount crops nothing but hands are wet/gloved: swipe targets
  generous, no precision taps mid-session.

### 5. The observability hook (one small design ask)
The connection's event log (state transitions, programming acks, frame
errors) is captured for debugging — bug-prone territory. Design wants:
a quiet entry point to a diagnostics view (dev/tester-facing, not
polished — a mono text log with a copy/export action) reachable from
the connected surface without being tappable by accident. One idea: a
long-press on the connection indicator; yours may be better.

## Out of scope for design

The BLE protocol, transports, the fake driver, CI, the log screen
itself (already shipped; it just gains prefilled actuals), the phone
timer path, anything server.

## Deliverables wanted back

The same shape as last time (it worked): a README with decisions +
exact values, mockups (HTML or images) for the interstitial's states
and the three panes in BOTH orientations, DEVIATIONS-worthy calls
named explicitly, and any copy you invent marked as yours.
