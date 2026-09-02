# Handoff: Just Row without the monitor (time only)

**Origin:** Gate 0 for the first Phase JR follow-on — the tester-requested
UNCONNECTED Just Row: no erg link, the phone's count-up clock, a row saved
with TIME ONLY. James's rulings (2026-09-02): time only, distance never
typed or fabricated; the door's action is `Start Timer`; **every label is
lifted from a shipped screen, mechanically.**

**Status: REV 2d PRESENTED for Gate 0, 2026-09-02.** Not yet approved.
Rev 1 invented three labels (`Done`, `PHONE CLOCK`, `Time it without the
monitor`); James: "Match the prose to the other screens. Again make it
all mechanical." Rev 2 replaces every invented word with the shipped one.

## How rev 2 was derived — the mechanical reference

The real app was driven through a one-step test workout on 2026-09-02
(`import "Just Row Mech | O2 | easy | 1" + "test Just Row"`, Start Timer,
SKIP, wait, ▶, Finish session, Save without logging, History, detail) and
each screen captured. The captures are in `mechanical-reference/`; each
board is the corresponding capture with the fewest possible words changed.

| Board | Source capture | What changes, and why |
| --- | --- | --- |
| `Main.dc.html` | `1-detail.png` (workout detail) | The detail's own second action `Start Timer`, same outlined shape, same slot under Connect. The meta line loses `NEEDS THE MONITOR` (no longer true); no new words. |
| `Clock.dc.html` | `3-timer.png` | Two words: the STEP slot reads `JUST ROW` (the approved connected surface's word where a programmed row reads `2 OF 5 / WORK`), and TARGET SPLIT reads `Free` (the approved connected surface shows Free in both slots; the test workout printed `All out`). ELAPSED, `UP NEXT · FINISH`, Pause, ◀ ▶, END untouched. |
| `ClockFinish.dc.html` | `5-finish-confirm.png` | Verbatim: ▶ stages `Finish this session?` with `Keep going` / `Finish session`. Finish lands on `/justrow/log`. |
| `ClockLandscape.dc.html` | `4-timer-landscape.png` | Same two words as portrait. |
| `LogDoor.dc.html` | approved Just Row log door (2026-09-01) + `6-log-door.png` | Card cut to TIME. Provenance word `TIMER` from `summaryModel.ts`'s own vocabulary (`PM5 <id>` / `TIMER` / `LOGGED BY HAND`). |
| `History.dc.html` | `8-history.png` | A row with no avg split and no distance gets NO second line (`LogRow.heroSnippet` returns `""`) — so title and date only. No badge (`workout_type` null). |
| `Detail.dc.html` | `9-detail.png` | The shipped timer-row detail: `FROM YOUR LOG`, `← LOG`, title, `SEP 2 · 21:57 · TIMER`, TIME block, `Add how it felt`, `Delete session`. INTERVALS absent because `steps` is `[]`. |

**One thing the reference exposed for the plan, not the design:** the
shipped test-workout row read `LOGGED BY HAND` in its detail
(`9-detail.png`) because a test phase's stopwatch actual is never
recorded (`Timer.tsx`'s `applyDistanceActual` returns early with no
metres). The free-row producer must store `timeSeconds` so the detail's
provenance predicate says `TIMER`; that is an implementation invariant
the plan carries, and the board shows the intended result.

## The JR chip (added rev 2c, James 2026-09-02: "it's just missing the JR chip")

Follow-on item 4 rides this board. The chip appears where type chips
appear: the door's badge row above the title (the workout detail's own
slot) and the History rows' badge slot — on BOTH free rows, connected and
phone-timed. It is `TypeBadge`'s 30×22 mono shape in **`--ink-3`, the fill
`TypeBadge.tsx` itself already uses for a non-intensity value**
("metadata, not a new intensity", 7.43:1 computed there) — the same rule
`.workout-row-custom` records. Rev 2c used `--ink`; James: "get the
chip's colour not to conflict with TR" (TR's chip is the dark one), so
rev 2d takes the warm mid-grey the code already reserves for exactly
this case. It is DERIVED from
`workout_type: null` + `workout_id: null`, never stored — `"JR"` can
never live in `workout_type` (the PM close gate: `isFreeRow` is
load-bearing three times). Not on the detail screen or the log door,
because no type chip appears there for any row (`9-detail.png`,
`6-log-door.png`).

## Contrast (computed, WCAG AA floor 4.5:1)

| pairing | ratio |
| --- | --- |
| on-color on ink-3 (the JR chip) | 7.43:1 |
| ink on page | 15.41:1 |
| ink-2 on page | 9.74:1 |
| ink-3 on page | 6.69:1 |
| ink-2 on sunken band | 9.16:1 |
| ink-3 on sunken | 6.30:1 |
| on-color on accent (Save, Finish session) | 5.94:1 |
| on-color on teal Connect | 6.65:1 |
| accent on page (END, Delete) | 5.35:1 |
| ink-4 placeholder on surface | 5.29:1 (lowest; shipped notes placeholder) |

Tap targets: buttons 52–56 px, arrows 52 px, pain cells 44 px.

## Not on the boards, on purpose

- No wake lock. The shipped Timer holds none; the clock is wall-clock
  based with a `visibilitychange` catch-up, so a locked phone loses nothing.
- No distance entry of any kind (ruling above).
- No Today changes: Today already shows an unlogged timer run with
  `Log it`; that link routes to `/justrow/log` for this run.
