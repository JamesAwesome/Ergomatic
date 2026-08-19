# The log screen tells the whole truth, spec 1: targets, judgment, SPM, discard

## What and why

The summary's interval rows start answering the question the rower is
actually asking: did I hit MY TARGETS? James beat every target in his first
real logged workout and the screen painted two rows red — because the bars
judged him against his own session average, silently, with no target
visible anywhere (the tule-fog session, 2026-08-18; photos in the session
record). This spec re-baselines every row judgment to the row's own
target, puts the target inline, surfaces the stroke rate we already record
but never show, and closes his other device report: discard present
wherever save is. Phase LT's spec 1 of 3 (§8 carries the slate).

**James's rulings (2026-08-18, standing):**

1. **"That section needs to be about performance against target per
   int."** Row deviation, bar, and color re-baseline from the session
   working average to EACH ROW'S OWN TARGET. Supersedes spec 1 (PW)
   R-C/R-E ROW semantics — that spec's Measured-row cell already points
   here.
2. **The target renders inline per row** (reverses #117's column removal,
   on device evidence: multi-target sessions showed no target anywhere).
3. **Discard is present wherever save is an option** (his earlier erg
   report: an early-ended workout's summary offered no discard).
4. Standing from the PW phase: the AVG SPLIT hero stays the session
   average, neutral ink, unjudged; UNDER = FASTER; option-B labels; the
   abstention idiom (absence, never an empty widget).

## §1 The row, re-baselined

| Property | Value |
|---|---|
| Columns | index · duration · TARGET (new, inline: the row's target split `m:ss.t`, absent when the row has none) · actual pace (measured) · deviation bar · `±n.n` |
| Judgment | `deviationSeconds = actualSplit − targetSplit` for THIS row. Negative = faster than target = blue (`--judge-faster`); positive = slower = red (`--judge-slower`). The PW bar geometry formula carries over unchanged (14px track, center tick, 8px bar, `min(50%, max(1.2%, |dev|/1.6 × 50%))`) — only the baseline changes. |
| Judged when | The row has BOTH a measured `actualSplit` AND a `targetSplit`. No lone-row gate any more — a single measured interval WITH a target is judged against it (the comparison is real now; the old count>=2 abstention existed because a lone row judged against its own average was a tautology). |
| Abstains when | No target (effort-only, by-feel rows) or no measured actual — no TARGET cell, no bar, no ±, the absence idiom. A prescribed-only row renders as today. |
| Warm-up row | Unchanged: labeled, measured values shown, never judged, no TARGET cell (a warm-up has no target by definition — `wu` rows carry none). |
| The legend | `← FASTER (BLUE) · SLOWER (RED) →` carries over; the caption `PACES OFF <ref>` carries over (it names the pace anchor, still true). |
| The session-average comparison | GONE from the rows. The AVG SPLIT hero keeps the session average (ruling 4). Nothing else renders it. |
| The tule-fog oracle (§6.1) | Replaying James's own session (targets 2:17.0/2:16.0/2:15.0; actuals 2:14.9/2:13.4/2:11.5) renders THREE BLUE rows, −2.1/−2.6/−3.5 — the screen that made him file the report now agrees with him. |

## §2 SPM: the field is overloaded, and the fix is a split (TRIAD — stored shape)

**Found at source (2026-08-18):** `LogStep.spm` means TARGET stroke rate
on the timer and manual doors (`logDraft.ts:377/:484` copy the authored
value) and MEASURED average stroke rate on the monitor door (`:774` writes
`actual.avgSpm`). One field, two meanings, distinguishable only by door.
Nothing renders either. James's report ("we fail to capture SPM anywhere")
is half right: the monitor door captures it and everything then ignores it.

| Decision | Value |
|---|---|
| The split | `LogStep.actualSpm?: number` (new, additive, inside the existing `steps` jsonb — no SQL migration): the measured interval average, monitor door only. `spm` reverts to ONE meaning: the authored target rate, all doors. `buildMonitorLogSteps` moves its measured write to `actualSpm` and copies the seed's authored `spm` through like the other doors. |
| Old rows (saved before the split) | Derivable, not guessed: `deviceName` non-null → the row was monitor-sourced → its `spm` holds a MEASURED value; render it as measured. `deviceName` null → `spm` is the target. One documented back-compat rule in the read path, never a stored rewrite. |
| The floor (the parked `MONITOR_SPM_MIN = 0` item, folded here by ruling) | `MONITOR_SPM_MIN` becomes 1: a zero average stroke rate is not a measurement of rowing, it is the monitor's placeholder — a 0 reading DROPS the field (the same drop-the-field treatment the split/HR bands already apply), never persists as real. Changes what gets persisted → part of this spec's triad surface. Existing stored zeros: rendered as absent by the read path (`> 0` guard), never rewritten. |
| Display | The summary row gains an SPM cell: measured (`24 spm`) when present; absent otherwise (no target-spm fallback in the row — the target rate already lives in the row label's authored text where present). From-the-log renders the same cell by the same rule. |
| Server validation | POST already bounds pm5 spm 0..99 (`PM5_SPM_MIN/MAX`); the new `actualSpm` key gets the same bounds with min 1, field-named 400s. v0.12.0+ clients that never send it: unaffected (additive). |

## §3 Discard wherever save is (his erg report, scoped by his ruling)

The audit, surface by surface — each row becomes a witness:

| Surface | Today | This spec |
|---|---|---|
| Session (timer) door save stack | Staged discard present (`handleDiscardClick`) | Witnessed, unchanged |
| Monitor door save stack | Staged discard present (`handleMonitorDiscardClick`) | Witnessed, unchanged |
| By-hand (manual) door | NO discard, by documented comment ("unlike the other two") — the door creates no records until save, so there was "nothing to discard" | The comment's premise is checked and the answer DESIGNED, not inherited: the by-hand door still holds form state (reflection, notes); leaving via Back already abandons it silently (N6's model). RULING APPLIED: James's scope is "discard wherever save is an option" — the door gains the same staged discard, whose action is exactly the silent-abandon Back already does, made visible and deliberate. One idiom everywhere beats a documented exception nobody remembers. |
| The early-END path (his repro) | The audit's open finding: reproduce ending a connected workout early (END before program completion) and record which door state renders and whether its discard is reachable — the implementation task FILES what it finds before fixing it (recurring failure #10: report, then fix) | Discard reachable in every terminal state of every door, witnessed per state |
| The interrupted-session row's doors (Today → Log it) | Log it / Discard pair exists on the Today row | Witnessed, unchanged |

## §4 History follows (from-the-log)

`storedSummary`'s §5C re-judges by the same §1 rule: stored
`targetSplit` per step (already stored since 6C) vs stored `actualSplit`,
same judged-when/abstains-when table, TARGET cell inline, SPM cell per
§2's back-compat rule. The stored `avg_split_seconds` hero is untouched
(it IS the session average, still the hero). No new columns; the only
stored-shape changes are §2's jsonb field and floor.

## §5 Research note (house rule)

- Verified at source before design (2026-08-18): the overload
  (`logDraft.ts:377/:484` vs `:774`); `MONITOR_SPM_MIN = 0` admitting
  zero as real (`:677`, the carried-debt item); the manual door's
  deliberate discard omission (`LogSession.tsx:1217` comment);
  `IntervalActual.avgSpm` flows on the wire and is band-gated today.
- **Mechanism:** nothing invented — a baseline change on an existing
  formula, a field split inside an existing jsonb shape, a floor change
  on an existing band, and an idiom already shipped applied to one more
  door. The antagonist anchor attacks §1's judged-when table and §2's
  back-compat rule hardest.
- **Does the system have the concept?** Per-interval targets: yes —
  authored, compiled into the program, already stored per step. Measured
  interval stroke rate: yes — 0x0037's own field, already parsed. A
  target for a warm-up: no, and the spec asserts none.
- Nothing found contradicting; recorded per the nothing-found rule.

## §6 Exit criteria

1. THE TULE-FOG ORACLE: a fixture built from James's own session (the
   photo-transcribed targets and actuals) renders three blue rows with
   −2.1/−2.6/−3.5 — named test, spec-level, both live summary and
   from-the-log.
2. Every §1 table row has a named witness incl. the no-target abstention
   and the single-measured-row-now-judged case (the PW lone-row
   abstention is RETIRED for targeted rows and its old test rewritten,
   not deleted — the tautology it guarded is gone, the history note in
   the test says why).
3. §2: the split is round-trip proven (monitor save → `actualSpm` stored,
   `spm` = target; old-shape row with deviceName renders its `spm` as
   measured — fixture posts the pre-split shape verbatim); the zero-floor
   drop has a red-provable witness; bounds 400s field-named.
4. §3: one witness per audit row; the early-END repro's finding is FILED
   in the task report and its fix witnessed.
5. Screenshots: the summary capture recaptured showing TARGET + SPM cells
   and a mixed judged/abstained list; opened, heroes recomputed by eye,
   AND the row judgments recomputed against their inline targets (the
   sharpened recurring-failure-7 both ways).
6. The notes clause for the next release: interval rows now judge against
   their own targets with the target shown (what you asked for at the
   erg); stroke rate appears on measured intervals; discard is everywhere
   save is.
7. v0.12.0+ clients unaffected (additive `actualSpm`; no SQL migration;
   POST accepts old shapes verbatim — pinned).

## §7 Vetted ground inherited

PW spec 1's §7 and spec 2's vetted ground carry (formatters, absence
idiom, option-B labels, the stored-heroes provenance, owner-404s). The PW
lone-row-unjudged ruling is SUPERSEDED for rows with targets by ruling 1
(recorded in §2's own history note); the abstention idiom itself carries.

## §8 The Phase LT slate (for the phase-open PM gate)

1. **Spec 1 (this): targets, judgment, SPM, discard** — triad (number
   meaning + stored shape), the anchor spec.
2. **Spec 2: series capture** — record the already-flowing per-tick
   {t, d, pace, spm, hr} series at save, C2-logbook-shaped, riding the
   existing POST; the research memo (2026-08-18, scratchpad
   `spec3-series-research.md`, to be committed with spec 2) settles rate
   (~2 Hz measured), budget (~70-380 KB/70min decimated), and the
   capture-during-row necessity (the PM5 stores no series).
3. **Spec 3: render the traces** — per-interval charts on the summary
   and from-the-log; HR when a belt is paired (belt delivery unverified
   on James's PM5 — a walk item).
