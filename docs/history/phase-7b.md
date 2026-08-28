> **Archived 2026-08-28** from `ROADMAP.md` (lines 1198-1307 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 7B — PM5 connected surface

**Status:** Done (2026-08-08, Tasks 1-8). The core exit criterion is met
**against the fake transport**: `e2e/connected.spec.ts` walks connect →
pairing → programming → ready → the surface → paused → resumed → End → the
log screen in a real browser, in both orientations, through the real
component chain, but through `createFakeTransport()`, never a radio. Real
hardware came afterwards, in walks 1-4
(`docs/monitor/pm5-interface-notes.md` §18, 2026-08-08), which is where
this surface's remaining defects were found and fixed; the Record and Exit
lines below say what hardware has and has not shown.
**Goal:** A rower can actually connect a PM5 from the app and row against
it — the screens 7A's domain was built to sit underneath.
**Design:** the connected surface's own handoff
(`docs/design/handoffs/2026-08-05-connected-mode/`), reconciled against
7A's shipped types, with every departure from it recorded in
`docs/design/DEVIATIONS.md`.

- [x] The Connect affordance: `WorkoutDetail`'s `ConnectAction` button
      (shipped on the workout DETAIL screen, ahead of Confirm, rather than
      "on Confirm targets" as the plan first worded it), gated on
      `resolveDefaultTransport()`/`navigator.bluetooth` availability
      (`src/monitor/transports/index.ts`); manual NEXT remains untouched,
      and a disconnect mid-workout degrades to the `"disconnected"` phase
      rather than crashing
- [x] Live actual pace against target and live stroke rate against
      prescribed SPM: `ConnectedSurface`'s three panes (Timer/Live/Grid,
      `src/workout/connected/`), fed by `useMonitorSession`'s `frame`
      events, with distance steps auto-advancing on `intervalComplete`
      through `toActualIndex`'s forward-attribution rule
      (`domain/monitor/pm5/intervalIndex.ts`)
- [x] **Guard wiring is NOT uniform (final-review M-1 — read before touching
      any guard that reads `RUN_KEY`/`MONITOR_RUN_KEY`).** Most guards that
      only need "is anything live, and on which side" migrate onto
      `src/monitor/monitorRun.ts`'s `anyLiveSession()` mechanically, as
      7A's design spec §6 describes. Two do NOT, because they need the
      UNLOGGED distinction `anyLiveSession()` deliberately collapses to
      "none": WorkoutDetail's unlogged-run staged confirm (the 6B F5
      fix — a completed-but-unlogged prior session is exactly what its
      "Replace" warning is FOR) and Today's cold-start stale-draft-discard
      guard (already correctly reading `loadMonitorRun()` directly, with
      its own comment explaining why — that code is 7A's reference
      pattern for this phase's own new guard). Routing either through
      `anyLiveSession()` silently downgrades "unlogged" to "none" and
      reintroduces the F5 data-loss class (a real, previously-shipped bug:
      a stale run record silently discarded instead of protected). When
      adding a NEW guard, ask "does this care about unlogged specifically,
      or just live-vs-not" before picking which of the two patterns to
      follow.
- [x] The reverse cross-clear direction: an existing live `MonitorRun` is
      cleared the same way `createMonitorRun` already clears a `SessionRun`
      — shipped in `WorkoutDetail.tsx`'s `startSession`, behind the Replace
      confirm, not in the spec-named `buildRun`/`saveRun` home;
      `session/run.ts`'s `saveRun` comment carries the three reasons and
      the DEVIATIONS table's reverse-cross-clear row records the move
- [x] **A second `program()` call during the prepare-settle wait strands the
      first.** `driver.ts`'s `pendingAck`/`pendingVerify` single-flight
      class gained a third member with fix-3's settle,
      `pendingPrepareSettle`, which widened the stranding window from
      microtasks to up to `prepareSettleTicks` of wall time (~5 s at the
      default). Pre-existing class, not a fix-3 regression. **Fixed in Task
      1:** `program()` checks an in-flight flag FIRST, before `sendPrepare`
      and before any wire traffic, and throws a new `ProgramBusyError` for
      a concurrent call (deliberately NOT a `ProgramRejectionReason`
      member; that union stays machine-statements-only, since no frame was
      ever sent for the rejected call). The busy call costs zero writes and
      never affects the first call's outcome; the flag clears on every exit
      path via `program()`'s own `try`/`finally`, and
      `driver.test.ts`'s "ProgramBusyError" describe block is the coverage
- [x] The real device name reaches the record: `createPm5Driver` used to
      hardcode `capabilities.deviceName: "PM5"` because its constructor had
      no `DiscoveredMonitor` to read a name from. **Fixed in Task 1:** it
      accepts `options.deviceName` (`DriverOptions.deviceName`), which
      flows into `capabilities.deviceName` and from there into
      `MonitorRun.deviceName`, falling back to the `"PM5"` placeholder only
      when no name was given and never fabricated otherwise;
      `scripts/pm5-lab.ts` threads its own `scan()` result through as the
      reference caller
- [x] Full behaviour tested against the fake transport in CI (Task 8):
      `e2e/connected.spec.ts`'s browser-driven walk at 390×844 and 844×390,
      the surface reachable by rail AND swipe, plus 2812 passing
      unit/client tests

**Record:** the hardware walks that exercised this surface are §18's
2026-08-08 entry (walks 1-4, PM5 432331249): the interstitial walked clean;
PAUSED fired on a real program once its derivation was corrected to a
three-field key; `rowingActive` read true on the first pull, which was the
unobserved premise the ready gate rested on; the 1.2 s ready dwell was
removed as an operator ruling; and 0x0031's Elapsed Time and Distance
turned out to be PER-INTERVAL rather than session-cumulative, which is why
`driver.ts` now keeps a session accumulator and the surface reads
`sessionElapsedSeconds`/`sessionDistanceMeters`. Every departure those
walks forced is a row in `docs/design/DEVIATIONS.md` (the removed dwell,
the inverted PAUSED band, the lost-link banner's descope, MISSED rows, the
diagnostics sheet's sequence numbering, the reverse cross-clear's home).
The reconnect follow-on this phase scoped out, the failed-`program()`
open-run question 7A-fix-2 parked, and the hardware readings still owed all
sit in Triggered follow-ons.

**Exit:** the fake-transport analogue is MET and gated in CI
(`e2e/connected.spec.ts`, both orientations): distance steps auto-advance,
live pace shows against target, and Connect degrades to manual on
disconnect. On real hardware, walks 1-4 (§18, 2026-08-08) took the surface
from Connect through programming, rowing, pause and resume to the end
hand-off on a 2×100 m distance program, closing §17 item 20 and capturing
real boundary actuals; still unrun are a genuine mid-piece disconnect and
§17 item 21's pairing/programming timing spans. (The button is one word,
`Connect`, `ConnectAction.tsx`, not "Connect PM5" as the plan's original
wording had it.)
