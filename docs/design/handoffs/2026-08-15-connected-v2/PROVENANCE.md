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
3. **Item 3's hardware question is ANSWERED and BUILT** (walk 2026-08-15;
   PR #102). The PM5's own screen shows 0 for rate before the first pull of
   piece two, so the ruling is MIRROR — and spec 2a implements it, at
   `armed` and at every mid-session pre-pull boundary. Frame 2D is now
   three-quarters built: rate 0 plain, split target ghost, nothing
   judged/no NOW/no gold mark/bar all-upcoming shipped; **the status
   caption still reads `1 OF N · WORK` where 2D draws `READY`** — that
   last word is spec 3's to place (see `docs/screenshots/
   connected-armed.png` for the shipped state).
4. **Item 1's pause question is SETTLED** (James, 2026-08-15; PR #102):
   there is no word. The block reads `PULL TO RESUME` alone, occludes
   nothing, and `paused` left `ConnectedPhase`. Spec 3 restyles the footer
   it lives in; the state work is done.
5. **The §"HR zone + calories" section's premise is FALSIFIED — do not
   implement it as written** (PM design gate, 2026-08-16). "Calories are
   derived from HR; both cells appear and disappear together" is wrong on
   this wire: the PM5 reports calories itself on 0x0033 bytes 6-7, strap or
   no strap — and that value is INTERVAL-scoped, resetting to 0 at every
   boundary (decoded from both committed walk-2026-08-16 recordings: the
   2×250 keystone ends reading 15 for a ~30-cal session; the 4-interval
   session resets four times). The 0x0039 summary carries no calorie field,
   so no machine-authoritative session calorie exists anywhere we decode.
   An honest CAL cell therefore needs the same register-fold discipline
   spec 1 built for distance. James's ruling (2026-08-16): CAL and ZONE
   are both out of spec 3; the band ships as up-next + TOTAL LEFT; "session
   calories, folded" is a filed follow-up. ZONE additionally needs a
   max-HR source the app does not have.
6. **The up-next line's "then" clause is RETIRED** (README §2A/§2C's own
   example, `up-next REST 2:00 · then WORK 2:09.0`, and §3's `WORK 10:00 ·
   then REST 1:00` — James's ruling, connected-polish design spec Item B,
   2026-08-17): one richer phase, not two. The band's `NEXT · ` line now
   names only the single coming phase, built with its own extent, split
   and rate (`connectedNextText`, `src/workout/connected/surfaceModel.ts`)
   instead of the handoff's short form plus a second appended phase.
   `SurfaceModel.thenNext` is gone from the interface, `.connected-band-
   upnext-then` is deleted from `index.css`, and every fixture/e2e
   assertion that pinned the word "then" in this band is gone with it.

## Not part of the design

`support.js` is mockup runtime only, per the README. The `.dc.html` is a design
reference built in HTML, explicitly not production code: recreate it in the app's
own patterns, do not ship it.
