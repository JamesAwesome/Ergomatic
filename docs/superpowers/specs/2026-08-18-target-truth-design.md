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
| Columns | index · duration · TARGET (new, inline: the row's target split `m:ss.t`, absent when the row has none) · actual pace (measured) · SPM (`24 / 22` — §2's ruled cell) · deviation bar · `±n.n` (bar and ± absent within the band or unjudged) |
| Judgment | `deviationSeconds = actualSplit − targetSplit` for THIS row, **with the SAME ±0.5s dead band the connected rest verdict ships** (James's ruling 2026-08-18: same band everywhere — the wire fields the two surfaces read agree to ≤0.12s across every rest-bearing capture, so the erg and the summary must never disagree about one interval). Within the band: ON TARGET — plain ink, no bar, no ±. Outside: negative = faster = blue (`--judge-faster`); positive = slower = red (`--judge-slower`). The band constant is ONE shared import with `surfaceModel.ts`'s `ON_TARGET_BAND_SECONDS` (extracted to a shared home; a drift test pins the two surfaces to one value). The PW bar geometry formula carries over unchanged — only the baseline changes. |
| Judged when | `targetSplit` present AND `actualSource` is `"pm5"` or `"stopwatch"` — the member set NAMED (antagonist B4: "measured" is not a field; `"assumed"` actuals EQUAL their targets by construction (`logDraft.ts:481-483`, `:398-400`) and judging them paints the whole by-hand door `+0.0`). `"assumed"` rows never judge. No lone-row gate any more — a single genuinely-measured interval with a target is judged (the old count>=2 abstention guarded a self-comparison tautology that no longer exists). |
| Abstains when | The TARGET cell keys on `targetSplit` alone (antagonist B5: a pm5 pairing-exception row — avgSplit dropped, time/meters real — is measured with no pace, and hiding its target removes a true number). Only the BAR and `±` key on judgeability. No measured actual and no target → the full absence idiom. A prescribed-only row renders as today. |
| Warm-up row | Unchanged: labeled, measured values shown, never judged, no TARGET cell (a warm-up has no target by definition — `wu` rows carry none). |
| The legend | `← FASTER (BLUE) · SLOWER (RED) →` carries over; the caption `PACES OFF <ref>` carries over (it names the pace anchor, still true). |
| The session-average comparison | GONE from the rows. The AVG SPLIT hero keeps the session average (ruling 4). Nothing else renders it. |
| The tule-fog oracle (§6.1) | James's own session (targets 2:17.0/2:16.0/2:15.0; actuals 2:14.9/2:13.4/2:11.5) renders THREE BLUE rows, −2.1/−2.6/−3.5 — all outside the band, so the ruling changes nothing here; the screen that made him file the report now agrees with him. |

## §2 SPM: the field is overloaded, and the fix is a split (TRIAD — stored shape)

**Found at source (2026-08-18):** `LogStep.spm` means TARGET stroke rate
on the timer and manual doors (`logDraft.ts:377/:484` copy the authored
value) and MEASURED average stroke rate on the monitor door (`:774` writes
`actual.avgSpm`). One field, two meanings, distinguishable only by door.
Nothing renders either. James's report ("we fail to capture SPM anywhere")
is half right: the monitor door captures it and everything then ignores it.

| Decision | Value |
|---|---|
| The split | `LogStep.actualSpm?: number` (new, additive, inside the existing `steps` jsonb — no SQL migration): the measured interval average, monitor door only. `spm` reverts to ONE meaning: the authored target rate, all doors. `buildMonitorLogSteps` moves its measured write to `actualSpm` and copies the authored rate from **`ProgramInterval.displaySpm`** (antagonist B2: the seed's steps are `{label, kind}` only — the authored rate lives on the compiled interval, set at compile from `phase.spm`). |
| Old rows (saved before the split) | The discriminant is ROW-LOCAL (antagonist B3 — the earlier deviceName rule was wrong for new rows and unnecessary): `actualSource === "pm5" && actualSpm === undefined` → this row predates the split and its `spm` holds a MEASURED value; render it as measured with no target half. Any other row's `spm` is the authored target. `"pm5"` is written unconditionally beside the only measured-spm write and by no other builder — exact, no age heuristic, never a stored rewrite. |
| The floor (the parked `MONITOR_SPM_MIN = 0` item, folded here by ruling) | `MONITOR_SPM_MIN` becomes 1, justified by the FIELD'S TYPE, not device folklore (antagonist: no committed capture has ever shown avgSpm 0 — all 14 boundary records read 23-29; the claim "0 is a placeholder" is unwitnessed): `avgSpm` is a u8 at 1 spm/lsb, so a sub-1 average is unrepresentable and the floor can only drop an EXACT 0 — an interval with no strokes, which is not a stroke-rate measurement. Same drop-the-field treatment as the split/HR bands. Changes what gets persisted → triad surface. Existing stored zeros: rendered as absent (`> 0` read guard), never rewritten. |
| Display | **RULED (James, 2026-08-18): one compact cell, `24 / 22`** — measured first, authored target after the slash in quiet ink; absent halves drop (target-only rows show `/ 22` quiet; measured-only shows `24`). Both gates broke this spec's earlier claim that the target rate was already visible (`refPaceLabel` composes `duration @ paceref` — no rate, anywhere, on any door): the cell that shows a measured value shows its target beside it, the lesson this spec exists to apply. From-the-log renders the same cell by the same rule. |
| Server validation | POST already bounds pm5 spm 0..99 (`PM5_SPM_MIN/MAX`); the new `actualSpm` key gets the same bounds with min 1, field-named 400s. v0.12.0+ clients that never send it: unaffected (additive). |

## §3 Discard: SPLIT OUT as LT-0, shipping AHEAD of this spec

**Re-scoped at the phase-open gates (PM C2 + the antagonist's own trace),
restoring James's original sequencing ruling ("its own bugfix round").**
Both gates independently located the defect at source: END closes the
record and the monitor door's discard is unconditional — the ONLY save
surface with no discard is the manual door (`discardSlot={null}`,
`LogSession.tsx:1218`), which is exactly where the monitor path FALLS
THROUGH on any `monitorModeRun` gate miss (including its catch-all
`catch {}`). James's early-END repro is almost certainly that fallthrough.

**LT-0 (its own small full-cycle PR, before spec 1):** the manual door
gains the staged discard; its action clears whatever records exist (a
fallen-through monitor run is real and must die like the monitor door's
discard kills it) and, for a pure by-hand entry, honestly discards the
form state Back already silently abandons — the witness asserts the
CONSEQUENCE (records/state gone, Today shows no unlogged row), never the
button. The gate-miss states are FORCED in tests (corrupt
`logSeed.steps.length`, mismatched `workoutId`, the catch-all), not
walked. The diagnosis notes the BUILD question: his repro lives in the
TestFlight binary he rowed, and the fix's witness pins main. Not fast
path (a broken discard loses a record). Spec 1's own audit table then
only WITNESSES the (now three) discard-bearing surfaces.
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

1. THE TULE-FOG REGRESSION PIN (the antagonist's honest relabel: both
   sides are transcriptions of our own screen, so it catches a wrong
   BASELINE, not a wrong actual — it is a pin, not an external oracle):
   a fixture built through `buildMonitorLogSteps` from a real
   `MonitorRun` shape (never a hand-built `LogStep[]`) with James's
   photo values renders three blue rows, −2.1/−2.6/−3.5. If a recording
   of that session exists on his devices, committing and replaying it
   upgrades this to an external oracle — asked, not assumed.
2. Every §1 table row has a named witness incl. the no-target abstention
   and the single-measured-row-now-judged case (the PW lone-row
   abstention is RETIRED for targeted rows and its old test rewritten,
   not deleted — the tautology it guarded is gone, the history note in
   the test says why).
3. §2: the split is round-trip proven (monitor save → `actualSpm` stored
   AND `spm` = the authored target rendered as the cell's quiet half —
   the case the dropped deviceName rule got wrong, pinned; old-shape row
   — `actualSource "pm5"`, no `actualSpm` — posts the pre-split shape
   verbatim and renders its `spm` as measured with no target half); the
   zero-floor drop has a red-provable witness; bounds 400s field-named.
3b. THE WIRE-SCOPING PROOF (the PM's named gap): the judged
   `actualSplit`/`avgSpm` are proven scoped to OUR interval, not the
   PM5's own split bookkeeping, by decoding a committed rest-bearing
   capture and comparing per-interval (the anchor pass already measured
   ≤0.12s agreement across every rest-bearing capture — the test commits
   that comparison as a named witness, red-provable by mis-scoping the
   index).
3c. THE BAND IS ONE CONSTANT: the summary and `surfaceModel.ts` import
   the same `ON_TARGET_BAND_SECONDS`; a drift test fails if either
   surface grows its own copy; a within-band row (dev 0.3s) renders
   plain ink on BOTH surfaces' fixtures.
4. §3: LT-0 shipped first (its own PR); spec 1 witnesses the three
   discard-bearing surfaces only.
5. Screenshots: the summary capture recaptured showing TARGET + SPM cells
   and a mixed judged/on-target/abstained list; opened, heroes recomputed
   by eye, AND the row judgments recomputed against their inline targets.
   **A hero that disagrees with its rows is a FAILING capture, not a
   note** (the PM's rule; the #117 precedent).
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

0. **LT-0: the discard fix** (§3) — its own small full-cycle PR, FIRST.
1. **Spec 1 (this): targets, judgment, SPM** — triad (number meaning +
   stored shape), the anchor spec.
2. **Spec 2: series capture** — re-gated at its own open (PM condition)
   on: the research memo COMMITTED (it lives in a scratchpad today, which
   is not a record), a stated storage ceiling with an eviction-or-not
   ruling (a per-session series lands on a table that just gained its
   first DELETE and has no size story), and rate/budget per the memo
   (~2 Hz measured; ~70-380 KB/70min decimated; capture-during-row is the
   only route — the PM5 stores no series).
3. **Spec 3: render the traces** — per-interval charts on the summary
   and from-the-log. **HR descoped until a belt is confirmed on James's
   PM5** (PM condition: delivery is unwitnessed; no rendering path ships
   that nothing can exercise).
