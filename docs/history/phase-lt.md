> **Archived 2026-08-28** from `ROADMAP.md` (lines 6515-6817 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase LT — The log screen tells the whole truth

**Status:** OPENED 2026-08-18 (absorbs the target-judgment and discard
bugfix rounds; both QUEUED entries below re-dispositioned). Spec 1 at
`docs/superpowers/specs/2026-08-18-target-truth-design.md`; phase-open
gates run (PM GO-WITH-CHANGES + antagonist anchor, both folded; the
anchor's attacked-and-held claims are the phase's vetted ground, in the
ledger). LT-0 SHIPPED (#128). **Spec 1 IMPLEMENTED 2026-08-19** (Tasks
1-4 done on branch `lt-truth`: the split/floor/server bound, the row/SPM
model and shared band, both renderers, and the witness sweep +
reconciliation) — awaiting final review, the triad's PM final-PR gate,
and James's merge approval. **Spec 2 IMPLEMENTED 2026-08-19** (Tasks 1-4
done on branch `lt-series`: the decimating recorder, the flush policy +
localStorage sacrifice, the server `series` column + route-scoped 1mb
limit + POST sacrifice, and the remaining storage proofs — S2's real-
Chrome byte-identical probe, S3's real forced-quota leg, the fake-driven
full loop through `GET /:id`) — awaiting final review, the triad's PM
final-PR gate (TRIAD: two stored shapes, `MonitorRun.series` and the
jsonb column, plus an invented mechanism — §7's own citation), and
James's merge approval. This spec ships no notes clause of its own
(§6 exit criterion 7: internal-only, rower-invisible until spec 3 renders
the trace — stated here so the next release gate does not go hunting for
one). **Spec 3 IMPLEMENTED 2026-08-20** (Tasks 1-3 done on branch
`lt-traces`: the pure scale/axis primitives, the trace model + hand-rolled
SVG chart component, and both hosts wired below their own intervals block
with the witness sweep + recaptured `log-monitor`/`log-monitor-landscape`/
`log-detail` screenshots) — awaiting final review, a PM final-PR gate
(NOT the triad's full treatment: no number's meaning changed, no stored
shape moved, no auth touched — spec §8's own "the antagonist pass is a
DELTA pass" ruling), and James's merge approval. **Owed at the next tag**:
exit criterion 8's own notes clause — "your connected sessions now draw a
trace — pace by default, stroke rate and heart rate a tap away; sessions
rowed before this release have no trace to draw."
**DISCHARGED** as v0.14.0's fifth clause (PR #132).
**Goal:** the summary's interval rows answer "did I hit MY targets" —
target inline, judgment vs the row's own target with the connected
surface's shared ±0.5s band, stroke rate shown (`24 / 22`), and discard
wherever save is.
**Slate:** LT-0 = the discard fix (its own small PR, FIRST — the manual
door is the app's only discard-less save surface and the monitor path's
fallthrough); spec 1 = targets/judgment/SPM (TRIAD: number meaning +
stored shape); spec 2 = series capture (re-gated at its own open: memo
committed, storage ceiling ruled); spec 3 = traces, pace/rate/HR all three
(the HR descope lifted 2026-08-19 — the phase-close erg bundle's own
S5b pass witnessed a real belt on the wire, ROADMAP's own "unblocks spec
3's descoped HR leg" line above).
**DISCHARGED in v0.14.0's notes (2026-08-20, PR #132 — the entry ships
five clauses; range v0.13.0..main re-settled with `git merge-base
--is-ancestor`, and #130's series capture is deliberately unnoted per its
own criterion 7). Kept here as the record of what was owed:**
four notes clauses: (1) rows judge against their own targets with the
target shown (the erg ask); (2) stroke rate on measured intervals;
(3) discard everywhere save is (#128 — a NORMAL v0.14.0 clause; CORRECTED
at the 2026-08-19 PM gate: v0.13.0 is `e22bc31` (#126) and #127/#128/#129
all landed AFTER it, so nothing here is retroactive — settle tag membership
with `git merge-base --is-ancestor <sha> vX.Y.Z^{commit}`, never by reading
a tag message or a ledger line); (4) HISTORY RE-JUDGES TOO — sessions already viewed
change colour (tule-fog rows go red→blue), plus #124's accepted re-log
gap if still unannounced (retroactive, same chain).
**Owed upstream from spec 3's delta pass (capture-side, NOT fixed in spec
3):** `seriesRecorder.ts` stores `p`/`spm` of 0 for both "no reading" and
"the machine said 0" — 26% of samples across the committed captures carry
`p === 0`, 262 in state `rowing`. Spec 3 renders honestly around it
(zeros are absent, never drawn); a follow-up should decide whether the
recorder omits the field instead of storing a sentinel. Stored-shape
question, its own gate.

**THE PHASE-CLOSE ERG BUNDLE — WALKED 2026-08-20.** Record:
`docs/monitor/sessions/walk-2026-08-20-lt-close/`. Items A/B/C (occlusion
both rotations, the mis-hit test, triple-tap on the phone) **PASS** and are
closed after being owed since CR2 shipped. Item D **FAILED HARD** and
produced the two findings below, which are the walk's real output. Item E's
DISTANCE oracle is **CLOSED** against the PM5's own View Detail screen — our
hero (1156) and the machine's Total Work Distance (1154) are both correct and
track two PM5 numbers the PM5 itself does not reconcile, its displayed
interval rows summing to 901 against its own stated 899. **Still owed:** the
phone→server trace leg (the piece ended up on web) and one read of the TIME
hero off the screen.

**F-1 / F-2, the walk's findings — an armed screen that lies, and a native
app that bricks.** Armed, walked out of range, cycled Bluetooth off and on:
the surface never changed, holding `1 OF 3 · READY` throughout, and rowing
produced nothing. Then reconnect failed with `LINK-FAILED`; a force-quit did
not clear it and neither did restarting the PM5, while the same PM5
programmed fine from the laptop web build seconds later — **deleting and
reinstalling the app was the only fix.** That isolates it to the **native path** —
but NOT, as first written, to app-local state: the PM gate's storage census
found no persisted key is an input to `scan()`, `connect()`, `program()` or
any driver decision, so a `localStorage` clear would not have fixed it.
"Reinstall fixed it, therefore our storage" is a guess about a BOUNDARY, not
a mechanism; **why a force-quit did not clear it is UNESTABLISHED and is the
open question.** v0.14.0 (688) carries it but does not OWN it —
`git diff --stat v0.13.0 v0.14.0 -- app/src/monitor/transports/
app/src/adapters/` is empty and the native BLE arm is unchanged since
v0.10.0, so a rollback would ship the same defect minus five notes clauses.
**What IS established:** `1 OF 3 · READY` is structurally impossible once
`phase === "disconnected"` (`surfaceModel.ts:787`), so its persistence proves
the phase never moved — the app never learned the link was gone. Its only
lost-link detector is the plugin's disconnect callback, with no frame-silence
watchdog anywhere, and the plugin fires that callback only from
`didDisconnectPeripheral`. James, 2026-08-20: "i think some of the bluetooth
problems deserve their own phase with dedicated connection management
research" — **PM verdict returned 2026-08-20 and is
awaiting James's word** — summarised here because it re-scopes the ask:
open the phase, but as **"the link can be lost, and the app has to say
so"** (detection, recovery, diagnosability, plus re-reasoning the failed-
`program()`-leaves-a-run-open item), with **RECONNECT ITSELF OUT**. The
argument: the harm was not failing to rejoin, it was never being told and
then not coming back — both fixable with zero reconnect — while reconnect
is the most invention-heavy piece available (`createPm5Driver` subscribes
only at construction, has no teardown, and rebuilding a live driver
double-processes every notification). The `LOST THE MONITOR` banner
already exists and shipped (DEVIATIONS row 75); the job is to make it
fire. The phase is created by **DELETING** the "Reconnect and background
scan, five pieces" follow-on, not sitting beside it — its trigger has now
fired twice and two homes for one body of work is the CP/CR2 mistake.
**A third symptom, from James the same day: "sometimes when I go to
connect we're actually still connected."** Same defect, opposite
direction — and checked: there is NO already-connected guard on the
connect path (no `isConnected`/`getConnectedDevices` call anywhere in
`capacitorBle.ts` or `useMonitorSession.ts`), and `createTransport`
builds a fresh transport per attempt. The app never asks iOS whether it
already holds the peripheral. Since the PM5 is single-central, a
forgotten-but-live connection is exactly the shape that ends in
`LINK-FAILED`, and it fits the force-quit/reinstall asymmetry. Whatever
the phase's final scope, **the app's connection state being a local
belief rather than an observation is the thing all three symptoms
share.** Proposed sequence: LT close → this phase → CL2 → LQ → PROD, on the
grounds that it is a PROD precondition (PROD's exit, an empty-phone
install reaching a logged row unaided, is unreachable while a link drop
bricks the app). **F-3, the reason both findings are
evidence-poor:** a TestFlight build can be neither inspected nor recorded
(`isInspectable` false since iOS 16.4, `CAPACITOR_DEBUG` reaches Debug
configurations only, and the recording tap is web-arm only), so a
native-only defect leaves no machine-readable evidence at all.

**THE ORIGINAL BUNDLE (James, 2026-08-19: "lets do those at phase
close").** Five parked device items now travel together as ONE session at
LT's close, so the close gate finds them in one place instead of
rediscovering five parked rows. Two need no rowing, three ride a single
rest-bearing piece:
- NO ROWING — CR2's phone pass items 5, 6, 8, still REQUIRED and owed
  since that phase shipped: the mis-hit test toward END, both-rotations
  occlusion (real safe-area insets; desktop Chrome reports 0 and no gate
  can see it) plus the iOS-26 `100dvh` portrait eye, and triple-tap
  diagnostics (`walk-phase-cr2-exit/RUNSHEET.md`, the tagged handoff list).
- NO ROWING — the stale-while-armed observation (same runsheet): arm,
  kill the link before stroke one, switch to GRID, record header/up-next/bar.
- ONE REST-BEARING PIECE, ~4 min. **REVISED 2026-08-20 by the phase-exit
  antagonist pass — the original three-item framing was wrong in three
  places and is kept below only so the corrections are legible:**
  - the same-frame DISTANCE photo (PW's PM-gate C3 row) — **the original
    said "at a rest, never after finishing" and that is BACKWARDS.** The
    oracle is the SUMMARY's DISTANCE hero, Σ over `IntervalActual`
    (`summaryModel.ts:577-583`), which does not exist until after
    `Log it`; the number visible at a rest is the register-map
    accumulator (`PaneLive.tsx:150-155`), a different derivation that
    already got its same-frame check on 2026-08-18. Photograph the
    summary hero against the PM5's **Memory screen**, after the piece.
  - **F-2 is ANSWERED, with no hardware.** "Does the native transport
    sample TWD at all" is malformed: TWD is bytes 11-13 of `0x0031`
    (`pm5-interface-notes.md:459`; `parse.ts:135`), the characteristic
    every frame rides, so no transport can deliver frames and omit it.
    Decoding the committed corpus shows what 2026-08-19 actually saw —
    TWD reads ZERO through every first work interval and first goes
    nonzero at a completed boundary (0/94 frames on step-4's abandoned
    single interval; 152/391 and 145/287 on the two 2×250 captures). A
    45-second single-interval paddle can never produce a nonzero
    `machineTotal`. Keep it only as a free observation, not a question.
  - **F-1 CANNOT be re-observed by this piece.** Its two surviving
    theories are interruption-specific (a fourth actual written by
    something only a real browser reload does). A normal END → `Log it`
    shares the TIME-hero formula (`measuredSessionSeconds` is a literal
    alias of `interruptedTotalSeconds`, `monitorRun.ts:665`) but cannot
    exercise the theory. Either add a native force-quit-and-relaunch
    mid-piece — **UNVERIFIED, nobody has run that on native, so it does
    not go to James as an instruction until someone has** — or state
    plainly that F-1's reload theory stays open.
  - **The pre-save storage dump is IMPOSSIBLE on a TestFlight build.**
    `WKWebView.isInspectable` defaults false since iOS 16.4;
    Capacitor sets it from `CAPACITOR_DEBUG`, whose xcconfig is the base
    configuration for the DEBUG configs only, and `ios-release.sh`
    archives `-configuration Release`. The 2026-08-19 dump worked because
    it was an Xcode DEBUG build. Use the in-app `MONITOR LOG · COPY`
    control for the ring before `Log it`, and pull the trace from the
    SERVER afterwards — `GET /api/logs/:id` returns the `series` column
    unprojected, which also closes the gap below.
- **NEW, from the same pass — two obligations nobody had listed:**
  - **No committed capture of this phase's flagship feature shows real
    data.** `log-detail`'s series is hand-built (already labelled), and
    `log-monitor`'s — called "a genuine recorder replay" — is the real
    recorder fed hand-scripted, self-admittedly wire-impossible fake
    events. Neither can show the 26% sentinel breaks or a real 41 s gap,
    the two behaviours the honesty rules exist for. The rules are
    unit-proven; the RENDERING of them has never been looked at. Fix by
    replaying a committed capture into a capture fixture.
  - **The phone→server→`series` column path is proven only in CI and on
    the laptop.** The 2026-08-19 phone leg posted into a prod schema that
    predated migration 0011. Prod now carries the column
    (`server/db/schema.ts:191`); one phone session logged and then read
    back through `GET /api/logs/:id` settles it, and the walk above
    produces exactly that for free.
  - **The tule-fog "upgrade the pin to an oracle" idea is CLOSED, and
    should not be reopened** (James, 2026-08-20: "that was just a visual
    bug"). The exit pass suggested asking whether a recording of that
    session survives, per the spec's own "asked, not assumed" clause.
    Asked and answered: only the prod DB row survives, it predates series
    capture so carries no trace, and — the actual point — the pin does
    not want one. Read the test (`summaryModel.test.ts:1704`): it hands
    the model three targets and three actuals and asserts blue rows at
    −2.1/−2.6/−3.5. That checks a RULE James ruled on (judge each row
    against its own target, ±0.5s band), not a number against the
    machine. Tule-fog's actuals were never in dispute; the baseline the
    colour was computed from was. A recording would answer "did our
    actuals match the erg" — a real question, covered elsewhere, and
    never this bug. **Being a regression pin rather than an oracle is
    CORRECT here, not a weakness to fix.**

**LT spec 2's accepted limit (PM gate C1):** POST /api/logs' route-scoped
1 MB body parser registers before auth, so the pre-auth buffer ceiling on
that one route is 1 MB (was 100 KB app-wide). Ordering pre-existing, no
amplification path, accepted; owner = the next server-touching phase.
**LT's device items live on CR2's runsheet** (`docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md`
— the standing phone pass James still owes): the iOS storage probe, the
`persist()` grant observation, and the fast-rate re-measure. **DONE 2026-08-19** (walk-2026-08-19-series: S2 PASS, S6 denied-as-predicted, fast rate ~10 Hz with the decimator unaffected — spec 3 is unblocked on this condition). **S5b MEASURED 2026-08-19 (second pass, laptop path): 5.04× compression on a real trace, ~30 KB per typical session, ≈9 MB/year per rower — #130's last inferred number is now measured.** That same pass WITNESSED HEART RATE for the first time (83→123 bpm on the wire), which unblocks spec 3's descoped HR leg. The PM ruling that produced them: **these land BEFORE spec 3 is implemented** — a device-specific
recorder defect would be invisible AND permanent (frames evaporate, the
record is immutable, PATCH refuses series), so the check moves in front of
the renderer.
**Riding follow-ups (PM gate 2026-08-19):** ~~`pnpm e2e -- -g` needs the
double-dash form documented (pnpm swallows bare -g)~~ **CORRECTED, Phase
WU close (2026-08-22): the double-dash form does not fix it — `pnpm e2e
-- -g "pattern"` still silently runs the FULL suite; pnpm swallows `-g`
even after `--`. The working form is `pnpm exec playwright test
--grep`.** See Phase WU's "What this phase taught" note below. A
frozen-clock
screenshot fixture (17 captures churn on wall-clock date stamps) —
**scope note (trace-truth Task 2 review, 2026-08-20): freezing the
wall-clock date alone will NOT fix this.** A second, independent churn
source lives in `e2e/helpers.ts`'s own `RUN_ID` (`Date.now()` + a random
suffix, baked into every generated e2e user's email via
`signInViaBackdoor`), which changes on EVERY run regardless of calendar
date — confirmed on `you-derive-offer.png`: the string itself differs
AND its own rendered LENGTH varies run to run (the exact sub-mechanism
is not yet isolated — `RUN_ID`'s own two components are each
nominally fixed-length in the current era, so the wrap is either a rarer
edge case in one of them or a third source not yet found), which
reflows the whole page wherever that email renders — measured at 26,327
pixels differing across 13 row bands down to y=527, not a localized
diff. **The fixture fix must neutralise the identity's own printed
LENGTH (a fixed-width stub, not merely a frozen value) or the reflow
keeps happening even once the string is otherwise deterministic; isolate
the exact length-varying sub-mechanism before assuming a frozen `RUN_ID`
alone fixes it.** **DONE 2026-08-20 (trace-axis PR, grouped item G2):**
`RUN_ID` now builds both halves to a PROVABLY fixed width — the
timestamp is `padStart`-ed to 13 digits rather than trusted to stay
there, and the random suffix is built one character at a time
(`randomBase36(6)`) rather than sliced off `Number.prototype.
toString(36)`, whose own spec (ECMA-262) guarantees only the shortest
round-tripping string, not a minimum length — the length-varying
sub-mechanism this note above says was "not yet isolated" either was
that slice or is now moot regardless, since the new construction cannot
vary.
**THAT `DONE` WAS WRONG, AND THIS NOTE CONTAINED THE WARNING THAT WOULD
HAVE CAUGHT IT (falsified 2026-08-27, antagonist pass; fixed the same
day).** The instruction three lines up — *"isolate the exact
length-varying sub-mechanism before assuming a frozen `RUN_ID` alone
fixes it"* — was not followed; the close asserted the sub-mechanism was
"moot regardless". It was not. **What was made invariant is LENGTH. The
layout reads WIDTH.** Archivo carries no tabular figures, so at 13px ten
`1` measure 67.734px against ten `8` at 74.625px, and a 6-character
base36 suffix spans `jjjjjj` 17.41px to `mmmmmm` 67.09px; twelve sampled
run ids spread **9.23px** at identical length, straddling the wrap
boundary. So the same-length address rendered two lines or three
depending on which characters it drew. `you-derive-offer.png` — the very
file this note measured at 26,327px — was still churning at **48,610px
across the same 13 row bands**, 1.85x the figure the fix was declared
against. Measured by running the capture suite TWICE IN ONE DAY and
diffing run against run, which holds the calendar constant for free.
**Fixed at the layout instead of the string** (`.you-identity`'s
`min-width: 0` plus the address clamped to one line — `index.css`, and
`design.spec.ts`'s "reflow the identity block" pin, which measures the
element against its OWN line box): the block's height no longer depends
on its content at all, so no future identity scheme can reintroduce it.
Residual churn on those six captures is now 541-3,090px confined to rows
45-91, the address text itself. Constraining `RUN_ID`'s alphabet to
equal-width glyphs was measured as an alternative and REJECTED: it only
narrows the spread to 0.52px, because kerning is not additive, so it
makes the flip rare rather than impossible.
The wall-clock date-stamp churn is a SEPARATE source and is NOT a defect
— per James's 2026-08-27 ruling the capture suite does not gate CI, so
date churn is absorbed by regenerating at release time rather than
fought. Measured composition of a same-commit regeneration: 7 captures
date text, 5 time-of-day, 2 sub-perceptual rasterizer flicker (max
channel delta 2-3, invisible but the bytes change). Covers both sources or captures will keep re-churning
after it ships; `judge()`'s
documented-unreachable dead-even branch (discriminated union if a second
producer appears); the live summary's judged-state capture (closed by
this PR's C1 recapture — verify at close).
**Standing rulings:** same dead band everywhere; SPM cell `24 / 22`;
supersedes PW spec 1's ROW semantics (its Measured-row cell points here);
retires the lone-row abstention for targeted rows; `MONITOR_SPM_MIN`
0→1 lands here (taken over from Phase LG, closed below).
