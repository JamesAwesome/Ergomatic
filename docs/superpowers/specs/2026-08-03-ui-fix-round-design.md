# UI-fix round — exact targets, discard everywhere, one button system

**Date:** 2026-08-03
**Status:** Pending James's review
**Design authority for this round:** `docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md`
(the design session's decisions, with `mockup.html` beside it — final for
colors/sizes/states; its inline markup becomes our classes/tokens). Where
that file and this spec disagree, DESIGN.md governs visuals and this spec
governs behaviour/scope.

## What this round is

James's four device notes went to a design session; the answers came back
as those four fixes PLUS a control-system normalization the screens were
already asking for. Scope, in the design's own structure:

1. **Exact targets** — every displayed pace band (`2:21.0–2:23.0`)
   becomes the single resolved split (`2:22.0`). The timer's sub-line
   becomes the REF (`6K +16`, mono 11px `--ink-3`, uppercase). UP NEXT
   exact. `toleranceRange()` STAYS in the domain (off-target nudge
   judgments feed on it) — only display call sites change: `StepRow`,
   `Builder` target row, `ConfirmTargets`, `TimerTargets` (sub-line + UP
   NEXT). Effort/rest/warm-up words unchanged, never a bare dash.
2. **Discard, three surfaces, one voice** — copy `Discard without
   logging` → armed `Tap again to discard`, staged everywhere, no one-tap
   destructive anywhere:
   - SessionComplete: new level-4 block below Back to Today, under a 1px
     rule; armed fills accent in place.
   - Today's unlogged row: keeps `Log it`, gains a 44×44 accent-outlined
     ✕; arming swaps the ROW'S CONTENTS (border → accent, text →
     "Discard *{title}* without logging?", ✕ → solid accent `Tap again`);
     row height/position fixed. Discard clears draft+run records, no
     POST (the 6C Discard's exact behaviour, new surface).
   - Log screen: the existing staged Discard adopts the same copy and
     the level-4 look.
3. **SHUFFLE** — stays short (James's call): chip geometry, 44px, 1px
   `--rule-3` border, transparent fill, mono 11px/0.14em `--ink-1`,
   right of the SUGGESTED FOR TODAY header. Disabled: `--ink-5` label,
   DASHED `--rule-3` border, no fill.
4. **The button system** — every whole-screen action becomes a
   full-width block in one bottom-anchored stack, 12px gap, five levels
   (DESIGN.md's table: 56px accent primary, ONE per screen; 52px
   outlined secondary; 48px solid-ink commit-in-card; 52px
   accent-outlined destructive + its armed solid state). Deliberate
   exceptions: transport row and steppers (compound controls), SHUFFLE.
5. **Selected-state color rework** — type chips ALWAYS the type color
   (existing tokens `--type-an/o2/at`, TR/TEST = `--ink`; Today's
   accent-red selected chip is the named bug); every other selection =
   `--ink` fill, cream label (difficulty, time cap, pain, MIN/M,
   2k/6k/MAX/MIN, HELD/UNDER/OVER — Builder's gold pain selection goes).
   Accent red means exactly four things afterwards: level-1 action,
   resolved split/duration, destructive control, active tab mark.
   Inactive controls: transparent, `--rule-3` border, `--ink-3` label.
6. **Contrast sweep** — no 10–11px mono label may sit at `--ink-4` on
   `--page` (fails 4.5:1); move survivors to `--ink-3`. (`--ink-4` uses
   exist today at index.css:418/511/565 among others — audit all.)

Per-screen change lists: DESIGN.md's own section is the checklist
(Today · Workout detail · Session complete · Confirm · Timer · Builder).
Notable singles: Confirm's small START becomes a full-width level-1
`Looks right, start` below the TOTAL line; WorkoutDetail's stack becomes
Start/Log it after/Edit/rule/Delete, nothing paired.

## Verified against the codebase

- The design's type hexes are ALREADY our tokens (`app/src/theme/
  tokens.css:22-24`) — the chips reference tokens, no new color enters.
- `toleranceRange` display call sites confirmed: StepRow.tsx:138,
  Builder.tsx:50, ConfirmTargets.tsx, TimerTargets.tsx, expand.ts:150
  (expand builds phase labels — check whether that label reaches display
  or only the engine; if display, it changes too, if engine-only it
  stays).
- `--ink-4` has live uses at 10-11px labels; the sweep is real work, not
  a no-op.

## Behaviour rules (this spec's half)

- Discard from ANY surface = clear draft + run records, no POST, then:
  SessionComplete/Log screen → navigate `/today`; Today's row → the row
  disappears in place. All three share one armed-state timing rule:
  auto-disarm on blur or 4s.
- The Today ✕ must not be reachable while a LIVE run exists (the row
  only renders for completed-unlogged runs — keep it that way).
- No server, domain-math, or storage-shape changes anywhere in the
  round. The `toleranceRange` label's consumers change; its math and the
  engine's use don't.
- Existing e2e selectors keep working or their specs update in the same
  commit — never a skipped test.

## Testing

- Unit/client: the discard state machine on all three surfaces (arm,
  fire, disarm-on-timeout, disarm-on-blur); records cleared no-POST;
  exact-split rendering per surface incl. the timer sub-line ref and
  effort words; button-level classes present per screen; chip selected
  states (type color vs ink) — computed-style assertions.
- design.spec: the five levels' heights (56/52/48/52) and one-primary-
  per-screen; the contrast sweep (no small `--ink-4` labels); tap
  targets; axe on every touched screen.
- e2e: SessionComplete discard → Today shows nothing to log, plan
  counter unchanged; Today's ✕ staged round trip (arm → timeout →
  disarmed; arm → tap → gone); the full-loop e2e still green (its
  buttons moved); screenshots re-captured for all six screens, opened.
- Self-mutation DoD; two back-to-back e2e runs.

## Out of scope

Chips' shape/size, in-card actions, `choose a plan →`, Library/Plan
screens (beyond zero-regression), domain math, server, PM5. The
DEVIATIONS rows the design mandates (5 listed in DESIGN.md) land with
the implementation.

## Exit criteria

- No pace band renders anywhere; the timer sub-line shows the ref.
- A session can be discarded at all three surfaces with identical
  staged copy; nothing destructive fires in one tap.
- Every whole-screen action sits in a bottom stack at its level; accent
  means only its four things; the contrast sweep holds in CI.
- Full gates; six screenshots re-captured and reviewed.
