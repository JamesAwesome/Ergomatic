> **Archived 2026-08-28** from `ROADMAP.md` (lines 1308-1348 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 7C — PM5 logging

**Status:** Done (2026-08-08, Tasks 1-6; merged 2026-08-09), shipped
pending a hardware walk. The exit criterion is met against the fake
transport: `e2e/connected.spec.ts`'s connected walk (both orientations)
runs a full session through Save, and the stored log's steps come back off
`GET /api/logs` carrying `actualSource: "pm5"`, the verbatim wire numbers
(split, work time, distance, stroke rate) and the fake's own `deviceName`.
No PM5 has logged a real session through this build: walk 4 (§18) predates
this phase's own builder, so the seed → builder → screen → server pipeline
has only ever been proven against walk-4's fixture values and the fake's
driven session. Suite: 2927 unit / 244 e2e / 49 screenshots.
**Goal:** A PM5-driven session logs with the same fidelity a phone-timer
session does.
**Design authority:**
`docs/superpowers/specs/2026-08-08-phase-7c-pm5-logging-design.md`.

- [x] Per-step actual splits logged with `actualSource:'pm5'`
      (`IntervalActual` → the log's per-step actual, a third source
      alongside `logDraft.ts`'s existing `'assumed'`/`'stopwatch'`) —
      home: `buildMonitorLogSteps` (`app/src/session/logDraft.ts`)
- [x] The monitor-side log-writing path (`MonitorRun` → a save flow),
      mirroring 6C's `logDraft.ts`/`LogScreen` split for the phone-timer
      side — home: `LogSession.tsx`'s monitor mode (`ManualDoorLog`'s
      `?from=monitor` branch, with its own staged discard)

**Record:** the only real wire numbers this builder has ever decoded are
§18 walk 4's captured `0x0037`/`0x0038` pair, decoded through
`pm5/parse.ts` rather than hand-transcribed. The shape rulings live in the
design spec above and in three `docs/design/DEVIATIONS.md` rows: a
monitor-sourced effort interval keeps every measured field, a null-indexed
actual is dropped rather than misattributed, and `deviceName` rides on the
log. Anonymous-run logging and §17 item 22 (whether the split time the log
stores is work-only or work-plus-rest) are the two remainders this phase
leaves; both are in Triggered follow-ons.

**Exit:** MET against the fake transport — a session fully driven by a
connected PM5 saves a log indistinguishable in shape from a phone-timer
session, with real monitor-measured splits. The same walk on real hardware
is still owed.
