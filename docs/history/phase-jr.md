> **Archived 2026-08-28** from `ROADMAP.md` (lines 6928-7000 of the
> pre-rebalance file, main `39e9430`). **This section was still LIVE when it
> was archived.** Deferred under "After the strangers", with PR 0b's capture walk carved out to ride the next erg session. The spec at docs/superpowers/specs/2026-08-24-just-row-design.md remains live.
>
> It is kept verbatim so no detail is lost, and it is a RECORD: the work is
> maintained in `ROADMAP.md`'s live slate, not here. Do not work from this file.

## Phase JR — Just Row (observe the machine's own free row)

**Status:** Spec at rev 2 (phase-open gates run 2026-08-24: antagonist
anchor pass, 12 findings folded; PM GO-WITH-CONDITIONS, all conditions
landed). Implementation waits behind Phase RC's wave; the capture walk is
its own erg session, James-scheduled.
**Spec:** `docs/superpowers/specs/2026-08-24-just-row-design.md`
**Goal:** A rower taps Just Row on Today, the app connects and OBSERVES the
PM5's own native Just Row — no program, no targets, no baseline required.
Done in the app, Menu on the erg, or the monitor's own idle power-off ends
it; the machine's numbers are offered to the log screen and the row lands
in history marked `JustRow` (Concept2's own enum word).

- [ ] **PR 0a — the observe-only instrument.** No app path connects
      without programming (the interstitial auto-programs on pairing), so
      the capture walk needs a dev-only observe mode first: connect,
      subscribe (0x0037-0x003A included), record, never program. Capture
      leg is the laptop/Chrome web arm (the byte recorder composes there
      only). **S/M**
- [ ] **PR 0b — the capture walk** (hardware, own session, James
      schedules). Closes the spec's seven OPENs — headline question:
      do 0x0031 elapsed/distance RESET at the PM's 5-minute auto-splits
      (if yes, a naive observer stores ~5 minutes of a 30-minute row).
      Capture becomes PR 2's replay fixture. **S (erg time)**
- [x] **DECIDED 2026-08-26: `workout_type` is NULL for a free row, not
      `"JustRow"`.** PR 1 was going to close `session_logs.workout_type`
      to `AN/O2/AT/TR/JustRow`, putting one of Concept2's STRUCTURAL codes
      beside our four INTENSITY codes. An engineer pass killed the premise:
      C2's `workout_type` is documented **`Required: No`** with `unknown`
      first-class, so a future upload can omit it; and the structural value
      is **totally derivable** because `commands.ts:158` arms the PM5 as
      `VARIABLE_INTERVAL` unconditionally (hardware-confirmed stable at 8
      across all three shapes) — deriving is also more correct, since C2
      requires that field to match the verification code we already store.
      **Ruling (James): one column, made NULLABLE, intensity only.** A free
      row stores `null` = "no intensity was prescribed", which is also true
      of the targetless-workout follow-on. History shows no badge; PS gets
      four intensity buckets plus an honest "no type" bucket rather than a
      fifth fake peer. Recorded in the spec under "The stored type,
      decided". **Folded into PR 1 as a `DROP NOT NULL`** on the migration
      it already writes — no extra tag. Also learned: the first thing a C2
      sync would actually owe is `weight_class` (required for rower
      results, absent from this codebase, and PII).
- [ ] **PR 1 — every stored shape (TRIAD, tagged BEFORE PR 2 — the R-A
      read-side-first discipline).** `session_logs` branch (`steps: []`
      iff the type is NULL, and `workout_type` gains `DROP NOT NULL`), the
      new `ended_by: idle` enum member (migration), plan refusal both
      halves (client posts `advancesPlan: false` AND server refuses for a
      null type — the server's default advances today), the null/unknown
      badge handling (today it degrades to 1.11:1 invisible text), the
      MonitorRun additive `mode` field. Full antagonist pass + PM
      final-PR gate. **M**
- [ ] **PR 2 — surface + session + log door (L; after RC's wave and PR
      0b's answers).** `/justrow` route + lean observer surface/hook
      (intent+motion detection, no workout-type sniffing — falsified by
      our own captures; no re-open after Ended, guarding the PM's
      auto-rearm housekeeping; coexistence guard; rebuilt session
      concerns priced in), the NEW workout-less log door (no existing
      route fits a null-workout run), Today recovery routing, the
      series-recorder key fix. Tested against PR 0b's capture. **L**
- [ ] **Exit walk:** both screens in one photograph, ended once by Done
      and once by Menu; the comparison is a TRANSCRIPTION check (our
      number IS the PM's counter transcribed) — the one derived number,
      avg split, is checked by arithmetic from the photographed
      time/distance; the Done-ended row's PM entry is expected LONGER
      (coast-down), recorded as a delta, not a disagreement.

Six frozen per-PR exit criteria live in the spec (plan `done_n`
unchanged, cross-version badge render, empty-steps rendering, link-drop
recovery, honest close reasons, coexistence guard). Release call: PR 2
is the first taggable tester surface (MINOR); PR 1 tags read-side-first
at patch level; notes owe "a Just Row never advances your plan".
