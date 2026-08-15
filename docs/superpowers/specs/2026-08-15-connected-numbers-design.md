# Connected numbers — Phase CR2, spec 1 of 3

**Status:** design approved by James 2026-08-15. Antagonist pass owed before a
plan is written.
**Branch:** `cr2-numbers`, worktree `.claude/worktrees/cr2-numbers`.

## Why this exists

On 2026-08-13 James rowed "Sun fret" on a real PM5 and photographed the monitor
beside the phone. The erg read **4384 m total**. The app read **TOTAL M
16938** — 3.9x — and TOTAL LEFT had hit `0:00` during the first rest and never
recovered. A nine-task wave, three adversarial reviews, a test-integrity sweep
and a five-item hardware walk had all passed over that defect, because every
gate this repo owns checks the app against itself. That is `CLAUDE.md` recurring
failure #11, and this spec is the first of the three that answer it.

Phase CR2 is decomposed into three spec → plan → implement cycles (James,
2026-08-15):

| Spec | Contents | Surface |
| --- | --- | --- |
| **1 — numbers (this one)** | R0, item 0, F7 | none; driver and record only |
| 2 — state axes | CR2 items 3 + 1 (review F3: one enum, four concerns), **plus F6** | model, light visual |
| 3 — redesign | CR2 items 2 + 4, the design handoff v2 recreation | both panes, both orientations |

The order is deliberate. The axes give the redesign the model its first-frame
and stale states need, and the redesign deletes work that would otherwise be
done twice in item 1.

## Evidence this spec rests on

Everything below was verified this session against code and the committed
captures, not inherited from prose. The review that raised these findings is
`docs/monitor/state-architecture-review.md`; its own §F2 warns that the ROADMAP's
original hypothesis and oracle for this item were both measured false, so nothing
here is taken on testimony.

### The fold's failure shape

`app/src/monitor/driver.ts:1678-1690` banks the previous frame's
`(elapsedSeconds, distanceMeters)` into `offsetElapsed`/`offsetDistance` whenever
the elapsed clock drops by more than `SESSION_RESET_ELAPSED_DROP` (2 s,
`driver.ts:830`). Its founding premise, asserted at `driver.ts:1062-1063` and
again on the public type at `types.ts:37-39` — that *both* fields reset together
at each new work interval — is false on the wire.

Replaying `docs/monitor/sessions/pm5-session4b-final.log.gz` and classifying
every elapsed-drop over the threshold: **25 drops, of which 9 do not reset
distance, and 6 of those carry real distance.** (The other three bank zero and
are harmless.) All six land in `state: "terminated"` with distance standing
exactly still. This reconciles §F2's figure of 9 precisely — it did not split
the harmless three out.

```
rowing      0  33.57  23.9   ->  terminated  21.51  23.9      banks 23.9
rowing      0  31.55  20.9   ->  terminated  15.52  20.9      banks 20.9
terminated    24.78  13.4    ->  terminated  13.88  13.4      banks 13.4
terminated    25.70  23.9    ->  terminated  14.29  23.9      banks 23.9
rowing      0  25.98  25.8   ->  terminated  13.85  25.8      banks 25.8
rowing      None 110.51 31.5 ->  terminated  23.42  31.5      banks 31.5
```

This is CSAFE-DEF footnote 12's documented Terminate behaviour, quoted in the
driver's own comments twenty lines above the bug. The fold banks a distance the
machine never cleared and then keeps counting it, which is where the exact 2.00x
comes from.

**No threshold change fixes it.** Measured across all three captures, the bad
drops span **10.9 s to 87.1 s** — every one of them far above any threshold that
still catches a real 60 s interval. The constant is not mistunable; it is the
wrong mechanism.

### Why a terminate cannot corrupt an interval-keyed map

`toProgramIndex` (`app/domain/monitor/pm5/intervalIndex.ts:165-183`) returns
`null` for every state that is not `rowing` or `resting` — `idle`, `armed`,
`finished`, `terminated` included, and that `null` is a deliberate business rule
with its own doc comment, not an accident. A terminated frame therefore carries
no interval identity at all.

The same function clamps a candidate exactly one step past the program's last
interval onto that interval (`intervalIndex.ts:177`). For the trailing-rest
phantom index that is the correct attribution here: it is the same interval's
counter still running.

### Why the machine's own total cannot be the fix yet

`totalWorkDistanceMeters` is decoded at `app/domain/monitor/pm5/parse.ts:135`
(U24LE at byte 11 of 0x0031) and is read by nothing outside tests and the fake.
Decoding all 16 `structure` entries across the three committed captures:

| Goal type | `durationType` | Samples | `totalWorkDistanceMeters` reads |
| --- | --- | --- | --- |
| Time | 0 | 20.9 m, 23.9 m, 25.8 m rowed | 20, 23, 25 — metres rowed, truncated |
| Distance | 128 | 13.4 m and 31.5 m rowed, goal 500 | **500, 500, 500, 500 — the goal** |

So a naive read displays 500 m the instant a 500 m piece is armed.

**CORRECTION, PM design gate 2026-08-15 — and it is a correction to this spec's
own first draft.** That draft claimed the field was "unsettleable offline"
because it appears in the captures only in those 16 `structure` entries. That
inference was false, and it was false in a way this repo has a name for: it
described **our logging policy, not the machine**.

`parseGeneralStatus` decodes TWD on *every* 0x0031 notification — roughly twice a
second, all session — and the driver then drops it: it never reaches
`MonitorFrame`, and its bytes reach the ring only inside the `structure` entry,
which fires **only when `workoutType`/`workoutDurationRaw`/`workoutDurationType`
change** (`driver.ts:2656-2668`, state at `:1107-1110`). That guard is a
deliberate flood defence whose own comment says 0x0031 "notifies ~2/second, a
flood the 500-entry ring cannot survive". The machine has been sending this
number the whole time. We have been throwing it away.

Two consequences, both of which change work:

1. **The table above is measured entirely in arm-adjacent windows.** Every
   `structure` entry fires at a program or arm change, so all sixteen samples sit
   in roughly the first 30 m of a piece. Whether distance-goal TWD *stays* at the
   goal, counts down, or begins tracking after that is **unobserved** — not
   observed-and-contrary. §7.2's caveat inherits the same limit.
2. **R0 must widen** (see below) so that the next capture settles this offline
   instead of leaving it unmeasurable for no reason.

Reading the machine's total (review R7) stays **out of scope for this spec** —
its semantics are genuinely unknown mid-piece and the map ships first regardless
— but it is gated on *a capture that records the field*, which R0 now produces,
not on some property of the protocol.

## Design

### 1. The accumulator becomes a per-interval register map

Replace the state at `driver.ts:1089-1093`:

```ts
// before
let session = {
  offsetElapsed: 0,
  offsetDistance: 0,
  prev: null as { elapsedSeconds: number; distanceMeters: number } | null,
};

// after
let session = {
  seen: new Map<number, { elapsedSeconds: number; distanceMeters: number }>(),
};
```

**The write rule.** On every 0x0031 frame, after `intervalIndex` is normalized
and before the frame is finished:

- `intervalIndex !== null` → merge into `seen` at that key by **taking the
  maximum of each field**, not by overwriting.
- `intervalIndex === null` → write nothing.

**Why maximum and not last-write-wins** (PM design gate, 2026-08-15). The key is
**not injective**: `toProgramIndex` clamps both ends (`intervalIndex.ts:180-182`,
`candidate === -1 → 0` and `candidate === programLength → programLength - 1`), so
two different machine indices can land on one of ours. Under last-write-wins a
clamped write can overwrite a completed interval's reading with a *smaller* one
and silently undercount. F8 already names exactly this non-injectivity as a
defect for `toActualIndex`; adopting last-write-wins here would import the same
shape one file over.

Maximum is safe because the machine's per-interval counters are **monotone within
an interval** — they only ever grow until they reset, and a reset means a new
interval, which means a new key. So in every honest case maximum *equals* last,
and in the dishonest cases it refuses to go backwards. It also cannot overcount,
which last-write-wins can.

**The read rule.**

- `seen` non-empty → `sessionElapsedSeconds` and `sessionDistanceMeters` are the
  sums over `seen`'s values.
- `seen` empty → the current frame's own raw pair.

The current interval is not a special case. It is the key being overwritten
twice a second, so the live reading is already inside the total and there is no
`offset + current` composition anywhere.

**Lifecycle.** `seen` clears at the one site that already resets this state:
`program()` opening a new run (`driver.ts:3676`), beside `boundaryHalves` and
the pending reconcile. Nothing else touches it.

**What this deletes.** `prev`, `SESSION_RESET_ELAPSED_DROP` (`driver.ts:830`),
the drop comparison, and both offset fields. No edge is detected anywhere, so
there is no edge to miss, misread, or re-tune.

**The type premise gets corrected too.** `types.ts:37-39` and
`driver.ts:1062-1063` both assert the both-fields-reset-together premise that
§F2 measured false. Both are rewritten to state what is actually true, and the
old doc comment's "up to one status tick short per boundary" caveat stops being
an error term and becomes the definition — the map holds the last reading we
saw, which is what last-seen means.

**Enumerated edge cases**, each of which needs a test:

| Case | Behaviour | Why it is right |
| --- | --- | --- |
| Terminate mid-piece | no key written, total unchanged | terminated frames carry no identity |
| Re-arm after terminate | no key written until rowing resumes | armed carries no identity either |
| Trailing rest of the last interval | overwrites that interval's key with a larger reading | the clamp attributes it to the interval whose rest it is |
| 1-interval program, phantom indices | all collapse onto index 0 | there is only one interval; maximum is correct and clamp-proof |
| JustRow, no program armed | `programLength <= 0` → every index `null` → `seen` empty → total is the raw pair | a single continuous piece; per-interval *is* the session |
| `rowing` with `intervalIndex === null` (divergence) | reading is excluded from the total | already logged as `divergence`; inventing an attribution would be worse |
| `program()` replaces an open run | `seen` cleared | a new program's totals start at zero |
| Link gap **inside** an interval | key overwritten on resume; total converges | last-write-wins is idempotent |
| Link gap **across** a whole interval | that interval's key is never written; its distance is lost | **bounded loss — stated, not hidden** |

That last row is the honest limit of this approach and must be written down in
the driver as well as here. Three things make it acceptable, and they belong in
the spec so nobody re-opens the question later:

1. **It errs in the safe direction.** An undercount makes TOTAL LEFT read high
   and TOTAL M read low, so a rower who trusts it rows *more*. Today's defect
   errs the unsafe way — the clock says finished while the piece is still
   running. That asymmetry, not the magnitude, is the argument.
2. **The loss is narrower than "a gap loses data".** Within an interval the
   machine's counter is absolute, so a gap covering an interval's *start* still
   converges the moment one frame arrives. The map only loses an interval that
   produced **zero** frames — which, from the app's point of view, is an interval
   that never happened.
3. **The loss is made visible, not silent.** The review's worst outage shape is
   damning precisely because "an entire 261 m interval vanishes with no event, no
   log line and no visual difference". So: compare `seen.size` against the armed
   program's interval count at the finish and log a `divergence` when they
   disagree. Same idiom as R0, near-zero cost, and it converts a silent hole into
   a signal.

It is still not the full fix. The full fix is a machine-owned absolute total, and
R0 below is what makes that measurable.

### 2. R0 — put the accumulator into the comparison that already exists

`logSummaryTotals` (`driver.ts:2001-2018`) already prints 0x0039's decoded
whole-workout totals against the sum of the recorded actuals and the program's
rest allowance. It does not print the accumulator. It gains
`sessionElapsedSeconds`, `sessionDistanceMeters` and `raw.totalWorkDistanceMeters`
beside them.

On "Sun fret" that line would have read `0x0039 decoded: distance=4384m` next to
an accumulator holding 16938 — in the app's own stash, on the first
multi-interval row, with no camera. Both of item 0's verification routes are
blocked without it: the iPhone has no per-frame capture, only the 500-entry ring.

**Two amendments to what the ROADMAP asks for**, because the map changes them:

1. The ROADMAP asks for a `divergence` entry "when the fold banks". Nothing banks
   any more, so that trigger does not exist. It becomes a divergence entry when
   the summed map disagrees with `totalWorkDistanceMeters` beyond a tolerance —
   the comparison that actually matters, and the one that arms the R6 walk.
   Because TWD reads the goal on distance-goal pieces, the entry must record
   `workoutDurationType` alongside both numbers rather than asserting a fault.
2. **R0 lands first, on its own commit, before the map.** The instrumentation
   must exist on the broken code, so the walk can be replayed against both and
   the fix is demonstrated rather than asserted.

**And R0 widens (PM design gate, 2026-08-15).** `logSummaryTotals` fires once, at
the finish — one more arm-distant TWD sample, which does not produce the *series*
R7 needs. So R0 also emits a **bounded-cadence mid-piece TWD sample**: its own
`lastLogged` on a quantised value, in the same on-change idiom
`lastLoggedStructure` and the `frame` entry already use, so the 500-entry ring
survives a long piece. Quantising on whole metres of TWD change is the obvious
candidate; the exact cadence is an implementation call bounded by a stated ring
budget.

Cost: one counter and one string. Payoff: **the next capture taken settles R7's
distance-goal semantics offline**, instead of that question staying unmeasurable
because of a flood guard nobody revisited. Without it the map ships as the
interim fix while the thing that would retire it stays unobservable.

_Cost against it:_ it adds entries to a 500-entry ring already tight on a long
piece. Accepted — it is one entry per finish plus a bounded divergence entry.

### 3. F7 — the finish-grace cancel throws away a summary we already hold

At a natural finish the driver opens a 3000 ms grace and schedules the reconcile
(`armSummaryReconcile`, `driver.ts:2066`); the hook opens a 3500 ms hand-off
hold. Drop the link at t+400 ms, *after* 0x0039 has arrived, been decoded and
been logged: the disconnect handler cancels the reconcile at
`driver.ts:1506-1507`, the run is closed so the drop is not even announced, and
the rower is handed a log screen reading `0 OF 1 INTERVALS MEASURED` with the
workout's real numbers sitting in the trace.

The comment authorising that cancel (`driver.ts:1495-1505`) gives two reasons and
both are false for this case:

- *"Cancelling costs the run nothing it still had"* — false. The fill is
  synthesized entirely from evidence already in hand and needs no wire traffic.
- *"a screen that is being torn down"* — false. The 3500 ms hold exists
  specifically to keep it mounted. This is testimony that was true of an earlier
  design and was never revisited when the hold landed.

**The corrected rule:** cancel the deadline's ability to *wait for more wire
evidence*; do not cancel the verdict it can already reach. The implementation
must check the hook's hold is still open rather than assume it, and the comment
is rewritten whatever the behaviour ends up being — a comment that argues from a
screen lifetime that no longer exists is a trap for the next reader.

### 4. F6 is NOT in this spec — moved to spec 2

An earlier draft of this spec took F6's "closing half" on the grounds that it
needs no stored shape. **James moved it to spec 2 on 2026-08-15**, after the PM
design gate showed that the one-line framing — "a reload can close the stranded
run and make it loggable" — concealed three decisions rather than describing a
cheap fix. All three were verified against the code:

1. **"Close" asserts something the system cannot support.** A reload is not
   evidence the session ended; the common cause is iOS reaping the tab while the
   rower is still on the erg. Stamping `completedAt` asserts on the machine's
   behalf that the piece is over. That is the exact shape of the PAUSED state
   this repo shipped and regretted — and CLAUDE.md's own does-it-exist rule
   exists because of it. Who is wrong when it matters: the rower who kept rowing,
   whose remaining intervals now belong to no run.
2. **It is not a stamp, it needs a door.** `monitorModeRun` returns `null` unless
   the URL carries `?from=monitor` (`LogSession.tsx:281`), and after a reload no
   route reaches that. Making the run loggable requires a new entry point with
   new copy — real product surface, and the part the framing hid.
3. **It would ship a wrong number inside the spec whose subject is a wrong
   number.** `monitorLogTotals` (`LogSession.tsx:330-337`) computes the header
   duration as wall-clock `completedAt - startedAt`, and `IntervalActual`
   (`domain/monitor/types.ts:114-146`) carries no timestamps. Stamp
   `completedAt = now` on a run stranded overnight and the log reads "840 MIN".

**Its home is spec 2.** F3 lists "the session lifecycle (`live`, `ended`)" among
the four concerns the enum conflates, and F6 *is* a session-lifecycle bug.
Answering it there costs nothing and stops the lifecycle question being answered
twice.

The generalisation, for whoever writes spec 2: **a "half" described by what it
does not need — "no stored shape" — has not been described.**

## Testing

The lesson of this phase is that the app has only ever been checked against
itself. The suite's entire notion of the machine is a 1905-line fake we wrote,
and **25,511 captured frames in `docs/monitor/sessions/` are read by no test at
all.**

1. **A capture-replay rung** (review R12), new file. It reads
   `docs/monitor/sessions/*.log.gz`, drives the **real** `createPm5Driver`, and
   asserts the summed map against **each interval's own final pre-reset
   reading**. Written failing first.

   The three segment results below are §F2's replay measurements, not mine — I
   verified the drop *shape* that produces them (the table above) but not the
   driver's output. **The first job of this test is to reproduce them.** If it
   does not, the plan stops and the discrepancy is investigated before any fix
   is written; a fix aimed at numbers we could not reproduce would be a fix
   aimed at nothing.

   | Segment | Truth | §F2 says the driver reports |
   | --- | --- | --- |
   | 3 x 1:00 with rest, both fields resetting | 455.1 m | 455.1 m, exact |
   | a 24 m piece ended by Terminate | 23.9 m | 47.8 m, exactly 2.00x |
   | a segment with no completed interval | 0 m | 108.4 m |
2. **Not the boundary sum.** That oracle is unsound and the reason is measured:
   0x0031's per-interval pair includes the trailing rest while `IntervalActual`
   is work only — one 30 s rest contributed 76.1 m of coasting — so on the one
   sound segment in the record it reports a 2.14x failure for a fold that is
   correct. The captures also contain zero events named `boundary` (14 are
   `intervalComplete`).
3. **The fake learns the terminate shape.** `transports/fake.ts` cannot currently
   produce elapsed jumping backwards to a smaller non-zero value while distance
   stands still, so a fix verified against it is verified against a machine that
   cannot exhibit the bug. Teaching it is part of this spec's cost, not a
   follow-up.
4. **Both halves of the gap behaviour are pinned**, including the losing one:
   a gap inside an interval converges; a gap spanning a whole interval loses it.
   A test that only pins the good half would document a guarantee we do not have.
5. **Per-file coverage is checked for every file touched.** The 90×4 gate is
   repo-wide and has let brand-new files ship with whole branches uncovered four
   times (recurring failure #2).
6. **Assert consequences, not existence** (docs/TESTING.md §3, recurring failure
   #4). Every test here invokes the driver and asserts a number.

7. **`pnpm e2e` runs and must be green with NO screenshot churn** (PM design
   gate). The spec claims this cycle changes nothing visible; a changed
   screenshot is that claim being false. This is the cheap proof, and it inverts
   recurring failure #1 — the diff does touch `app/src/`, so the suite runs
   regardless of the claim.

## Non-goals

- Reading `totalWorkDistanceMeters` as the session's authority (R7). Its mid-piece
  semantics are unknown; R0 is what makes the next capture able to settle them.
- Retuning `SESSION_RESET_ELAPSED_DROP`. No value of it helps; the constant is deleted.
- Any change to `ConnectedPhase`, `SurfaceStatus`, or the panes. That is spec 2.
- Any visual change at all. That is spec 3.
- **F6 in either half.** Moved to spec 2 by James's ruling; see §4.
- `MONITOR_SPM_MIN` (`logDraft.ts:773-777`). Persisted rows; belongs with item 3 in spec 2.
- **The liveness axis (R5).** Tempting beside the map, but it needs a
  hardware-derived threshold and it is an *axis* — spec 2's subject.

## Exit criteria

1. The capture-replay test passes against all three committed captures, using the
   per-interval-final oracle, driving the real driver.
2. The terminate segment reports 23.9 m for 23.9 m of rowing (§F2 measures 47.8 m
   today, and the test reproduces that before the fix lands).
3. The segment with no completed interval reports 0 m (§F2 measures 108.4 m today).
4. The sound segment that is already correct **stays** correct at 455.1 m — the
   regression guard, and the one §F2's rejected oracle got wrong.
5. A drop inside the finish grace, after 0x0039 has arrived, produces a filled log
   screen rather than `0 OF 1 INTERVALS MEASURED`.
6. `summary-totals` prints all five numbers; the mid-piece TWD samples appear at
   a bounded cadence in a replayed capture; and the divergence entry fires both
   when the map and TWD disagree and when `seen.size` disagrees with the
   program's interval count.
8. Scoped gates green: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`
   with no screenshot churn, per-file coverage inspected for every file touched.
9. **`app/domain/monitor/types.ts:37-39` is corrected.** "BOTH fields reset
   TOGETHER at each new work interval" is false on the wire, it sits on a public
   type, and it survived the review. Same for `driver.ts:1062-1063`.
10. Each of §5.2's outage shapes has a test **with its expected bounded loss
    stated as a number**, including the one where an entire 261 m interval
    vanishes — that case must now produce the key-count `divergence` entry.

**THE WALK GATES THE MERGE (PM design gate, 2026-08-15 — this overturns the
first draft, which said it did not).** The first draft treated the photograph as
a phase-level exit. It is not: item 0's own text says "any fix should be walked
the same way, with both screens in one frame", and a sentence inside an item
binds independently of the phase's exit line. Decomposing a phase into cycles
does not dissolve per-item bars into the phase gate.

So spec 1's PR is reviewed and approved on CI, and **merges on the walk, not on
CI.** Per recurring failure #11, a green replay against our own captures proves
nothing about the erg. The walk item: row a multi-interval piece, read
`summary-totals` from the stash, and confirm the accumulator, 0x0039 and TWD
agree — with the PM5 and the phone photographed in one frame.

**Sequencing note the decomposition did not carry:** spec 2 needs the *same* erg
session (item 3's "on piece two, before the rower pulls, what does the PM5's own
screen show for rate?"), and the review's R6 is already written as one walk
covering items 0 and 3 together. So the order is: implement spec 1 → walk R6
once → merge spec 1 and finalise spec 2's design from that session. Asking twice
spends the scarcest resource in this phase.

## Open questions

1. **Divergence tolerance.** What delta between the summed map and
   `totalWorkDistanceMeters` should raise the entry? TWD is truncated to whole
   metres, so the floor is at least 1 m plus one status tick of rowing. Proposed:
   log unconditionally at the finish, and raise a `divergence` only above 5 m or
   5%, whichever is larger. **Needs the antagonist's view before it is fixed.**
2. **Distance-goal suppression.** Because TWD reads the goal on distance-goal
   pieces, the divergence comparison is meaningless there. Proposed: record the
   numbers, suppress the divergence verdict when `workoutDurationType === 128`,
   and say so in the entry.
