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
| **1 — numbers (this one)** | R0, item 0, F7, the closing half of F6 | none; driver, hook and record only |
| 2 — state axes | CR2 items 3 + 1 (review F3: one enum, four concerns) | model, light visual |
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

**And, new this session: the field is unsettleable offline.** It appears in the
captures *only* in those 16 `structure` entries, which are arm and terminate
moments. There is not one mid-piece sample on a time-goal multi-interval piece
anywhere in the record. Separately there is **no Total Work Time in 0x0031's 19
bytes at all**, so the elapsed half of TOTAL LEFT has no known machine source and
any eventual fix may be asymmetric.

Reading the machine's total (review R7) is therefore **out of scope for this
spec** and gated on the R6 hardware walk — which is precisely what R0 below
exists to arm.

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

- `intervalIndex !== null` → `seen.set(intervalIndex, { elapsedSeconds, distanceMeters })`, last write wins.
- `intervalIndex === null` → write nothing.

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
| 1-interval program, phantom indices | all collapse onto index 0 | there is only one interval; last write wins is correct |
| JustRow, no program armed | `programLength <= 0` → every index `null` → `seen` empty → total is the raw pair | a single continuous piece; per-interval *is* the session |
| `rowing` with `intervalIndex === null` (divergence) | reading is excluded from the total | already logged as `divergence`; inventing an attribution would be worse |
| `program()` replaces an open run | `seen` cleared | a new program's totals start at zero |
| Link gap **inside** an interval | key overwritten on resume; total converges | last-write-wins is idempotent |
| Link gap **across** a whole interval | that interval's key is never written; its distance is lost | **bounded loss — stated, not hidden** |

That last row is the honest limit of this approach and must be written down in
the driver as well as here. It is strictly better than the fold, which loses or
doubles without bound, and it is not the full fix; the full fix is a
machine-owned absolute total, which the walk has to unblock first.

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

### 4. F6 — closing half only

The connected surface is not a route: it exists only while `WorkoutDetail`'s
`connecting` state is non-null, and a reload destroys it. Nothing in the monitor
flow calls `loadMonitorRun` (`monitorRun.ts:188`), and `completeMonitorRun`
(`monitorRun.ts:414`) has one caller operating on an in-memory ref the reload
destroyed (`useMonitorSession.ts:761`). So `completedAt` can never be stamped
after a reload, and every consumer reads `completedAt: null` as *live*:

- `monitorModeRun` requires `completedAt !== null`, so the PM5's measured actuals
  become permanently unreachable and the rower re-types numbers the app is
  holding in `localStorage`.
- `connectGuardStage()` (`monitorRun.ts:580`) returns `"in-progress"` forever, so
  every future Connect is preceded by "A session is in progress. Replace it?".
- `Today.tsx` treats it as live and permanently suppresses stale-draft cleanup.

**In scope:** a stranded run can be **closed** and made loggable, so `completedAt`
gets stamped, the actuals are reachable through the monitor log door, and the
guard stops firing forever. This needs no persisted shape.

**Out of scope, by James's ruling 2026-08-15:** adopting an existing
`MonitorRun` — the capability reconnect needs, and the one that forces
`EnginePhase[]` into storage. That goes with the reconnect spec, where the
review sequences it as R10.

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

`pnpm e2e` and `pnpm screenshots` are **not** required by this spec — the diff
touches nothing under `app/src/` that renders. If that stops being true mid-
implementation, both become required (recurring failure #1).

## Non-goals

- Reading `totalWorkDistanceMeters` as the session's authority (R7). Hardware-gated; see above.
- Retuning `SESSION_RESET_ELAPSED_DROP`. No value of it helps; the constant is deleted.
- Any change to `ConnectedPhase`, `SurfaceStatus`, or the panes. That is spec 2.
- Any visual change at all. That is spec 3.
- Adopting an existing `MonitorRun`. That is the reconnect spec.
- `MONITOR_SPM_MIN` (`logDraft.ts:773-777`). Persisted data, carried debt, not this spec.

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
6. A reload mid-session leaves a run that can be closed and logged, and a
   subsequent Connect does not ask "Replace it?".
7. `summary-totals` prints all five numbers, and the divergence entry fires on a
   replayed capture where the map and TWD disagree.
8. Scoped gates green: `pnpm lint`, `pnpm typecheck`, `pnpm test`, per-file
   coverage inspected for every file touched.
9. **The hardware walk is owed but does not gate this PR.** CR2's phase exit
   requires the erg's own screen photographed in the same frame as the phone's;
   that is a phase-level exit, and R0 shipping here is what makes the walk
   decisive. The walk item this spec creates: read `summary-totals` from the stash
   after a multi-interval row and confirm the accumulator, 0x0039 and TWD agree.

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
