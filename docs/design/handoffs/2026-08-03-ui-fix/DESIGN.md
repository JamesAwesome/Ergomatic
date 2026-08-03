# Ergomatic UI-fix round — design decisions back to the build session

**Date:** 2026-08-03 · **From:** design · **For:** implementation (one PR)
**Answers:** `ui-fix-handoff.md` (copied here as `original-packet.md`)
**Mockup:** `Ergomatic UI fix - System A.dc.html` — open in any browser. Spec sheet at
the top, then the six screens built to it (Today, Workout detail, Session complete,
Confirm, Timer, Builder). `support.js` must sit beside it.

The mockup is a design reference, not code to copy. Colors, sizes and states are
final and should be matched; markup is inline-styled and should become the
codebase's own classes/tokens.

---

## The rule this round adds

**Every action that acts on the whole screen is a full-width block in a single
bottom-anchored stack, 12px gap.** Five levels, no other button shapes:

| Level | Look | Height | Where |
|---|---|---|---|
| 1 · primary | solid `--accent`, cream label, Archivo 16/600 | 56px | Start · Looks right, start · Save to library · Log this session. **One per screen.** |
| 2 · secondary | surface fill, 1px `--ink` border, ink label, same type | 52px | Log it after · Back to Today · Edit · Retry. May stack; never share a row. |
| 3 · commit-in-card | solid `--ink`, mono 12/600, 0.16em | 48px | Closes an editor without leaving the screen: builder step DONE, staged baseline Apply. Ink so it can't read as level 1. |
| 4 · destructive | surface fill, 1px `--accent` border, accent label | 52px | Delete workout · Discard without logging. Last in the stack, under a 1px `--rule` divider. |
| 4 · armed | fills solid `--accent`, cream label, copy changes | 52px | "Tap again to discard". Auto-disarms on blur or 4s. |

Exceptions, deliberate: transport (`◀ Pause ▶`) and steppers (`− +`) stay in a row —
they are one control, not several actions. SHUFFLE stays sub-full-width (below).

### Selected-state color — the fix for Today vs Builder

- **Type chips → always the type color.** `AN #5c4382` · `O2 #2a6275` · `AT #8a5f18`
  · `TR/TEST #1b1a17`, cream label, border same as fill. Identical chip whether the
  rower is filtering (Today) or authoring (Builder). Today's accent-red O2 chip is
  the bug; it goes.
- **Every other selection → `--ink` fill, cream label.** Difficulty, time cap, pain,
  MIN/M, 2k/6k/MAX/MIN, HELD/UNDER/OVER. Builder's gold pain selection goes.
- **Accent red now means exactly four things:** the level-1 action, a resolved split
  or duration, a destructive control, the active tab mark. It no longer means
  "selected". That single subtraction is what makes the screens read as one app.
- Inactive control: transparent fill, `--rule-3` border, `--ink-3` label.

### Contrast note

`--ink-4 #8a8478` does not clear 4.5:1 on `--page` at 10–11px. All small mono labels
in the mockup are `--ink-3 #57544c` or darker, including inactive tab labels and the
LAST THREE meta lines. `design.spec.ts` should keep passing; if any 10px `--ink-4`
label survives in the app, move it to `--ink-3`.

---

## Item 1 — exact targets

Straight swap to the single resolved split everywhere the band appeared:

| Surface | Now | Becomes |
|---|---|---|
| Detail `StepRow` | `2:21.0–2:23.0` | `2:22.0` (accent, right-aligned) |
| Builder TARGET row | `TARGET 2:21.0–2:23.0` | `TARGET 2:22.0` |
| Confirm target row | same band | `2:22.0` |
| Timer UP NEXT | `WORK · 2:18.0–2:20.0` | `WORK · 2:18.0` |
| Timer sub-line under the big split | `2:21.0–2:23.0` | **the ref**, mono 11px `--ink-3`, uppercase: `6K +16` |

The timer sub-line answers "where did this number come from", which the band never
did, and keeps the card's three-line rhythm identical to the RATE card beside it.
`toleranceRange()` stays in the domain and keeps feeding off-target nudge judgments —
only its display call sites change. Nothing in the UI should imply tolerance is gone.

Rest/warm-up/test phases keep the existing words (`Easy` / `Rest` / `All out`),
never a bare dash.

## Items 2 + 3 — discard, three surfaces, one voice

Copy is identical at all three: **`Discard without logging`** → armed
**`Tap again to discard`**. Same outcome, same words, staged everywhere.

- **Session complete** (new): level 4 block below `Back to Today`, under a 1px rule.
  Stack order: Log this session (56, accent) · Back to Today (52, outline) · rule ·
  Discard without logging (52, accent outline). Armed fills accent in place.
- **Today's unlogged row** (new): the row keeps `Log it` (level-2 geometry, 44px) and
  gains a 44×44 accent-outlined `✕`. Tapping it swaps **the row's contents**, not the
  layout: border → accent, text → "Discard *Mackerel Sky* without logging?", the ✕
  becomes a solid accent `Tap again` button. Row height and position don't move.
  The mockup shows both states labelled DEFAULT / ARMED — implement one row.
- **Log screen**: existing staged Discard adopts the same copy and the level-4 look.

Recommendation held from the packet: no one-tap destructive anywhere.

## Item 4 — SHUFFLE

Stays short by James's call, but stops being its own species: **chip geometry** —
44px tall, 1px `--rule-3` border, transparent fill, mono 11px/0.14em `--ink-1`,
label `SHUFFLE ↻`, parked at the right of the `SUGGESTED FOR TODAY` header row. The
label stays alone on the left. Hover/press darkens the border to `--ink`.

Disabled (pool ≤ 1): `--ink-5` label, **dashed** `--rule-3` border, no grey fill —
the same dashed idiom the app already uses for empty/removed states, and quiet enough
that a disabled control never shouts.

---

## Per-screen change list

**Today** — type chips to type color · difficulty/time/pain selections to ink ·
SHUFFLE re-cut to chip geometry · unlogged row gains the armed ✕ · card target shows
the exact split.

**Workout detail** — exact splits · action stack becomes Start (56 accent) /
Log it after (52 outline) / Edit (52 outline) / rule / Delete workout (52 accent
outline). Nothing shrinks or pairs.

**Session complete** — the two half-width buttons become full-width blocks, plus the
new Discard (see above).

**Confirm** — the small bottom-right `START` becomes a full-width level-1
`Looks right, start` (56px) below the `TOTAL 8 MIN` line, matching Detail and Builder.
REMOVE stays a 44px text control inside its card. Targets exact.

**Timer** — sub-line becomes the ref · UP NEXT exact · transport row unchanged
(documented exception), Pause is level 1 between two 56×56 level-2 squares.

**Builder** — TYPE active to the type color · DIFFICULTY and PAIN active to ink ·
MIN/M and 2k/6k/MAX/MIN active to ink · TARGET row exact · step editor `DONE` is
level 3 (solid ink, was already black — now a named level) · `Save to library`
unchanged at level 1.

---

## Rows for DEVIATIONS.md

1. **Level 3 (solid-ink commit-in-card)** is a third button idiom beyond the README's
   `.button-primary` / `.button-outline`. Reason: an in-card confirm that must not
   compete with the screen's primary.
2. **Level 4 destructive** introduces an accent-*outlined* button; the README's
   accent was solid-only. Reason: destructive needs a danger signal without a solid
   block competing with the happy path.
3. **SHUFFLE is sub-full-width**, the only screen-level control that is. Explicit
   product decision, not an oversight.
4. **Transport and steppers sit in rows**, exempt from the full-width rule as one
   compound control.
5. **Pace bands removed from display**; `toleranceRange()` retained in the domain.

## Not touched, by request

Chips' own shape/size, in-card actions, `choose a plan →`, the Library and Plan
screens, all domain math beyond the formatter call sites.
