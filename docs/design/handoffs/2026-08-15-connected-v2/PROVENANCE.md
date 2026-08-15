# Provenance and known contradictions

Delivered by James 2026-08-15 as `CR2-designs.zip`, commissioned per ROADMAP
Phase CR2 items 2 and 4 ("I'll have Claude design make a recommendation"). It is
the design input for **CR2 spec 3 (redesign)**; specs 1 and 2 do not implement
from it.

Committed verbatim, as received. Nothing in this directory has been edited —
this file is the only addition.

## Which file is authoritative

`README.md` describes itself as turn 2 and says the turn-2 section at the top of
`Ergomatic connected mode.dc.html` (frames tagged `R2 · …`, badges 2A–2D) is the
design to implement.

**`Connected screen recommendation.md` is turn-1 rationale and is superseded on
every number it disagrees about.** Read it for reasoning, not for values. The
disagreements are not subtle:

| Thing | recommendation.md (turn 1) | README.md (turn 2) |
| --- | --- | --- |
| Hero sizes, landscape | 96 / 80 | 112 / 92 |
| Tenths / target | 50 / 40 | 58 / 40 |
| `LEFT IN INTERVAL`, `HR` cells | kept, grown to 15px | **cut** (PM5 duplicates) |
| Paused | full-surface wash, reworded `NOT ROWING` / `STOPPED` | **dropped entirely — do not build the overlay** |
| Metric-row labels | kept at 15px | cut; band becomes ZONE / CAL / TOTAL LEFT |

## Contradictions to resolve before spec 3 is written

Recorded here rather than resolved, because resolving them is spec 3's job and
guessing is how a wrong number ships.

1. **"The counter bug is moot on LIVE (fields removed)"** (`README.md`, §States &
   data) is **half true**. `TOTAL M` is cut, but frame 2A still shows
   `TOTAL LEFT 38:20`, and tracing the accumulator's consumers this session finds
   three: `meters` (`surfaceModel.ts:470` — the only one the redesign cuts),
   `totalLeftSeconds` (`:528`) and `elapsedDisplay` (`:562`, which is PaneLive's
   clock *and* `ConnectionLogSheet.tsx:119`'s `SESSION` value). Two of the three
   survive the redesign, and neither has a machine authority available — 0x0031
   carries no Total Work Time at all.
2. **"Compute from plan + elapsed, not the broken accumulator" is STALE —
   do not implement it as written** (reconciled 2026-08-15, post-merge, PM
   spec-2 gate). The accumulator it calls broken was replaced by spec 1's
   register map and corroborated against the machine three independent ways
   on hardware: its own display (184 = 184, one frame), its 0x0039 summary
   (367 vs 367.8), and an a-priori oracle (500 vs 499.5) — see
   `docs/monitor/sessions/walk-2026-08-15/`. An implementer following the
   original line would discard a hardware-corroborated number for a
   plan-derived estimate. The GRID header should read the accumulator.
3. **Item 3's hardware question is still open.** Frame 2D shows rate as `0` in
   plain ink pre-row. Our captures prove the *wire* carries the previous piece's
   rate on piece two (eight armed frames reading 13/16/43/46/50/80/88/96), so
   whether 2D is right depends on what the PM5's own screen displays — unanswered,
   and owed from James at the erg.
4. **Item 1's pause question may be moot.** The README drops the paused state
   entirely. ROADMAP item 1 still asks for the honest *word*. If the state is not
   built, the word is not needed — that is spec 2's call, not an editorial one.

## Not part of the design

`support.js` is mockup runtime only, per the README. The `.dc.html` is a design
reference built in HTML, explicitly not production code: recreate it in the app's
own patterns, do not ship it.
