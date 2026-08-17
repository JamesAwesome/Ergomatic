# Provenance and known contradictions

Delivered by James (desktop zip, surfaced 2026-08-17 at the Phase LG/PW
brainstorm); authored 2026-08-12 — BEFORE the CR2 walks, whose findings
overrule it in three places below. It is the design input for **Phase PW**
(the post-workout summary), which absorbs Phase LG's filed question.
Committed verbatim; this file is the only addition. `support.js` and the
`.dc.html` are mockup runtime/reference — recreate in the app's patterns,
never ship the HTML.

## James's rulings at the brainstorm (2026-08-17)

1. **Phase shape: summary-first.** Spec 1 = the summary screen from data
   already recorded (no traces, no HR); spec 2 = the from-the-log entry
   (history surface + edit path); traces/HR = a later spec gated on
   series-capture research.
2. **UNDER = FASTER than target** (under the target NUMBER — a lower
   split). The direction the codebase never wrote down now exists; the
   README's own `TARGET m:ss` hint is what anchors it on screen. Note this
   is the OPPOSITE of the retired live-judgement convention (where "over"
   was faster) — `domain/judge.ts`'s header records that history.
3. **Replace wholesale:** the summary IS the post-row flow; SessionComplete
   and the log screen's doors converge on it.
4. **Thumbs lands in spec 1, stored now** (generation consumes later).

## Corrections to the README — do not implement as written

1. **§9 "Calories are estimated from heart rate" + §2's HR block:**
   deferred wholesale with the HR section (spec 1 has no HR). When the HR
   spec comes: the estimation model does not exist yet, and note the wire's
   own calorie field is FALSIFIED as a session total — 0x0033's
   `totalCalories` is interval-scoped (decoded from the committed
   2026-08-16 walk recordings; `2026-08-15-connected-v2/PROVENANCE.md`
   item 5) — so HR-estimation vs a register fold is a real design choice,
   not a given.
2. **§7's palette (blue `#1f4a5c` faster / rust `#b5341f` slower):** the
   DIRECTION matches the shipped convention; the HEXES do not. The
   2026-08-13 tester ruling's tokens govern (`--judge-faster` `#1d4e89`,
   `--judge-slower` `#962718`) — the same precedent CR2 spec 3 set against
   its own handoff's stale palette. Rust doubling as slower AND the
   primary CTA would also re-create the two-reds confusion the gold-marker
   ruling fixed.
3. **§9's connected data list includes per-interval watts, pace + rate
   series, HR series, drag factor, rest distance:** none are recorded
   today. Spec 1 renders only what `IntervalActual` carries; the series
   are spec 3's subject, with the recording mechanism (sampling rate,
   localStorage budget) as the research question.
4. **§5's discard "dialog not designed — flag for product":** the house
   two-tap staged discard is the pattern (`useStagedDiscard`), not a
   dialog.
5. **§11 open question 2 (manual distance entry for time-only):** stays
   open, deferred until use answers it — spec 1 must not render empty
   measurement affordances (the README's own rule).
