# Post-workout summary — design handoff

**Mock:** `Post workout summary.dc.html` (open in a browser; two toggle rows above the phone frame switch all four states)
**Frame:** 390 × 844 (iPhone portrait). Single scroll, no tabs.
**Date:** 2026-08-12

---

## 1. What this screen is

One screen serves two entry points:

| State | Reached by | Difference |
|---|---|---|
| **Just finished** | Row ends on a connected PM5, or the in-app timer stops | Eyebrow `WORKOUT COMPLETE`, back label `← DONE`, reflection card is an **input**, save/discard options at the bottom |
| **From the log** | Tapping a session in the log | Eyebrow `FROM YOUR LOG`, back label `← LOG`, reflection card is a **read-back**, footer shows plan linkage + edit affordance |

Crossed with two data sources:

| Source | Difference |
|---|---|
| **PM5 connected** | Full data: 3-up hero, intervals with deviation bars, pace + rate traces, HR zones, numbers drawer |
| **Time only** (no erg connection / hand-logged) | Single `45:00` time hero, no traces, no HR, no drawer. Prescribed **intervals** list retained for historical reference, marked `TARGETS ONLY · NOTHING MEASURED` |

All four combinations are legal and mocked.

---

## 2. Design intent — what changed vs ErgData

ErgData shows every number at equal weight in stacked label/value rows plus three full-height charts. Our version ranks:

1. **Avg split is the hero.** It's the number rowers quote. Time and distance are secondary cells in the same 3-up block.
2. **Intervals as deviation bars,** not a 7-column scrolling table. Bar grows left of the centre tick when the split was faster than average, right when slower. Numeric deviation (`+1.5`, `−1.1`) sits at the right edge.
3. **Two traces, not three,** with no axis furniture — pace (with dashed average line) and rate. Range printed in the header instead of on axes.
4. **HR is one block:** avg / max / calories on one line, a single stacked zone bar, then one row per zone. No five separate progress cards.
5. **Everything else** (avg power, avg rate, calories/hr, drag factor, rest distance) is collapsed into one `EVERY OTHER NUMBER` drawer, closed by default.
6. **Reflection replaces analysis prose.** The "just finished" state asks three things instead of narrating results.

---

## 3. Section order

**PM5 connected · just finished**
1. Status bar / `← DONE`
2. Title block — eyebrow, `Silver Thaw`, `AUG 10 · 18:57 · PM5 432331249`, 2px ink rule
3. Hero — AVG SPLIT `2:09.1` (rust, 30px) | TIME `25:50` | DISTANCE `6000`
4. Reflection card (input) — see §4
5. `INTERVALS` / `PACES OFF 6K 2:09.0` — deviation rows
6. Traces card — `PACE /500M`, `RATE S/M`
7. `HEART RATE` — stats line, stacked bar, 5 zone rows
8. `EVERY OTHER NUMBER` drawer (collapsed)
9. Save options

**Time only · just finished:** 1, 2 (meta = `LOGGED BY HAND`), time hero, reflection card, `INTERVALS` (prescribed), save options.

**From the log:** same minus the save options; reflection card becomes a dashed read-back block (`YOUR NOTES · HELD · PAIN 3/5 · LIKED` + note text), footer shows `Logged to Silver Thaw / SESSION 1 OF 84` and `Edit notes & pain rating`.

---

## 4. Reflection card (the polling box)

Ink-bordered card on `#fffdf7`, three questions, in this order:

1. **HOW DID IT FEEL?** — `↑ MORE LIKE THIS` (flex, fills) + `↓` (64px). Selected up = ink fill; selected down = rust fill. Tapping the active one clears it. **Feeds future workout generation** — this is the primary reason the control exists.
2. **DID YOU HOLD THE TARGETS?** — `HELD / UNDER / OVER`, equal thirds, selected = ink fill. Right-hand hint reads `TARGET 2:09` when connected, `BY FEEL` when time-only.
3. **ACTUAL PAIN** — 1–5, selected = rust fill; right-hand hint `EXPECTED 2/5` from the plan. Caption under the row: `TAP TO RATE` → `EASIER THAN PLANNED` (1) / `AS PLANNED` (2) / `HARDER THAN PLANNED` (3–5).
4. **NOTES** — dashed textarea on `#f4f1e8`, placeholder "What happened out there?", min-height 74px, no resize handle.

All three are optional; nothing blocks saving. Every control is ≥46px tall.

---

## 5. Save options (just finished only)

Stacked, 8px gap:
1. `Log against plan` — 54px, rust fill `#b5341f`, white text, 16px/600. Hover `#9c2c19`.
2. `Save without logging` — 48px, `#fffdf7` on 1px `#c9c3b2`, 15px.
3. `DISCARD WITHOUT SAVING` — 48px, no border/fill, mono 12px `#8a8478`, hover rust.

Discard should confirm before destroying data (dialog not designed — flag for product).

---

## 6. Tokens used

Inherited from the Erg Log system; nothing new introduced except the zone ramp.

| Role | Value |
|---|---|
| Desk / outside frame | `#ddd8cc` |
| Screen background | `#f4f1e8` |
| Card / raised | `#fffdf7` |
| Ink (primary text, borders) | `#1b1a17` |
| Body secondary | `#57544c` |
| Mono muted / labels | `#8a8478` |
| Hairline rule | `#ded8c9` — lighter `#ebe6d9` |
| Control border | `#c9c3b2` |
| Rust (accent, slower, pain, primary CTA) | `#b5341f` — hover `#9c2c19` |
| Blue (faster, cool zones) | `#1f4a5c` |

**Type:** Newsreader 500 for the workout title (32px). IBM Plex Mono 400/500 for all numbers, labels, and eyebrows (10–46px, letter-spacing `0.16em` on 10–11px labels). Archivo for sentences, buttons, and drawer labels (14–16px).

---

## 7. Semantics: blue = faster, red = slower

Applies to the interval pace value, its deviation bar, and the HR zone ramp.

- Interval faster than the workout average → pace text and bar `#1f4a5c`
- Interval slower → `#b5341f`
- Legend under the list: `← FASTER (BLUE) · SLOWER (RED) →`

HR zone ramp (cool → hot): Z1 `#c9d5da`, Z2 `#6f96a4`, Z3 `#1f4a5c`, Z4 `#c9713f`, Z5 `#b5341f`.

---

## 8. Shared row geometry

The interval list, prescribed-interval list, and HR zone list all use one skeleton so the screen reads as one system. Row: `9px 0` padding, 10px gap, 1px `#ded8c9` bottom rule.

| Column | Intervals (measured) | Intervals (prescribed) | HR zones |
|---|---|---|---|
| 14px | index | index | 10px swatch |
| 76px | split time | distance | — |
| 52px | pace (blue/red) | target pace | `Z5` (26px) + range (78px) |
| flex | deviation bar w/ centre tick | offset (`6K +8`) | proportional bar |
| 38–48px right | deviation `+1.5` | `—` | time, then % |

Deviation bar: track is `flex:1`, 14px tall, 1px centre tick `#c9c3b2`; bar is 8px tall, width = `|dev| / 1.6s × 50%` (min 1.2%), anchored left or right of centre.

---

## 9. Data requirements

**Connected:** avg split, elapsed time, distance, per-interval (time, distance, pace, watts), full pace + rate series for the traces, HR series with zone boundaries and time-in-zone, avg/max HR, calories (HR-derived), avg power, avg rate, cal/hr, drag factor, rest distance.

**Time only:** elapsed time and the plan's prescribed intervals (distance, target pace, offset from base). Nothing else — the screen must not render empty measurement affordances.

**Calories are estimated from heart rate.** Labelled `CAL EST.` in the stat line and `Calories from HR` in the drawer. If no HR strap is present, hide the calories stat rather than substituting a power-based estimate.

**Written back by this screen:** thumbs (`up` / `down` / null), hold (`HELD` / `UNDER` / `OVER` / null), actual pain 1–5, notes text, and whether the session was logged against the plan.

---

## 10. Removed on purpose

Weight class, per-workout privacy/visibility row, share and redo buttons, the favourite star, and the "Workout Analysis" / "Splits Table" accordion headers. Sharing and repeat live elsewhere in the app; privacy is an account-level setting.

---

## 11. Open questions

1. Discard confirmation dialog — copy and pattern not designed.
2. Time-only sessions currently can't be given distance. Should manual entry exist at all, or is the hold/pain/thumbs report enough for plan adjustment?
3. Does the thumbs signal need a reason ("too long", "too hard") to be useful to generation, or is direction sufficient for v1?
4. Connected rows show the deviation bar where prescribed rows show the offset (`6K +8`). If the plan target should be visible on measured rows too, the column needs splitting.
