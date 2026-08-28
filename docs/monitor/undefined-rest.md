# Undefined rest — what the PM5 offers and we do not

**Extracted 2026-08-28** from `ROADMAP.md`'s Phase UR section, which was
KILLED at the roadmap rebalance ("a machine capability we lack, not a reported
gap"). **The research was the valuable part and it survives here.** The phase
is archived at `docs/history/phase-ur.md`.

**Trigger for reopening it:** a tester asks for self-paced rest. **Sizing note
that survives with it:** `src/session/engine.ts` walks a frozen phase list on a
clock and has no phase kind that ends on a USER EVENT, which is the real cost —
plausibly L, not the grammar change it looks like.

---

**What we know today, checked, not assumed.** We do NOT support it at any
layer. Our grammar's only rest is `{k: "r", minutes}` with a fixed number,
plus an optional `restMinutes` on a work step (`app/domain/types.ts`), and
`app/domain/monitor/pm5/commands.ts:35-36` emits only `INTERVALTYPE_TIME`
(0x00) or `INTERVALTYPE_DIST` (0x01). `docs/monitor/pm5-interface-notes.md:566`
records the rest / undefined-rest / calorie / watt-minute variants of
`CSAFE_PM_SET_INTERVALTYPE` as unused, in as many words: "`compileProgram`
never emits an 'undefined rest' interval". Concept2's Logbook API carries
`VariableIntervalUndefinedRest` as a distinct `workout_type` member, so the
concept is theirs and first-class — we simply never reach for it.

**What the feature IS, from Concept2's own words** (PRIMARY, all from
<https://www.concept2.com/support/monitors/pm5/how-to-use>, section
"Setting Up a Workout with Undefined Rest" — the only page C2 publishes on
it; the PM manual PDF says nothing):
- It is **a value of the rest field, not a workout type in the menus**.
  You dial rest past its bottom: "Select the plus button. 'Undefined Rest
  Time' is displayed."
- **The rower presses Continue to end it** — this is the load-bearing
  fact: "When you are ready to start the next interval, select Continue
  and resume rowing." Rowing during the rest does NOT advance it, it just
  accrues rest metres ("262 meters were completed during the rest time").
- Purpose in their words: "helpful for workouts such as CrossFit workouts
  that combine indoor rowing/skiing with other activities off the indoor
  rower (box jumps, kettle bell swings, etc)."
- Capped at **10 minutes** per rest, and **cannot be saved as a favorite
  or custom workout** on the monitor.
- **Wire, from C2's CSAFE spec (PRIMARY):** interval types
  `TIMERESTUNDEFINED` 3, `DISTANCERESTUNDEFINED` 4, `RESTUNDEFINED` 5,
  `CALORIERESTUNDEFINED` 7; workout type
  `WORKOUTTYPE_VARIABLE_UNDEFINEDREST_INTERVAL` = **9** (we send 8
  unconditionally today). A FIXED interval workout with undefined rest has
  no wire form of its own — "should be programmed as variable interval
  workouts with undefined rest". And `SplitDurationDistance` must be 0
  when any undefined rest interval is configured, or Biathlon logic
  triggers.
- **Two unreconciled numbers, do not trust either across paths:** the
  how-to-use page says up to **29** undefined rest intervals; the CSAFE
  spec says **50**. Likely menu limit vs wire limit; C2 reconciles them
  nowhere.
- **OPEN, unfound in any C2 source:** whether the rest clock counts UP or
  DOWN on screen, and what happens AT the 10:00 cap (auto-advance? end?).

**Open questions for the brainstorm** (do not answer them here):
- **The phone timer needs a new phase kind — this is now ANSWERED, not
  open.** `src/session/engine.ts` walks a frozen phase list on a clock,
  and C2's own instruction is that the rower presses Continue. So an
  undefined rest is a phase that ends on a USER EVENT, which the engine
  has nowhere. That is the real cost, not the grammar. Size the phase on
  this, not on the `Step` union.
- **What does it do to work/rest accounting?** RC-1's spine stores
  `rest_seconds`/`rest_meters`. An undefined rest still produces real
  numbers there, but nothing PREDICTS them, so anything that compares
  planned against actual needs an answer.
- **What is the wire delta?** The exact `SET_INTERVALTYPE` value, whether
  `SET_RESTDURATION` becomes meaningless, and whether the workout-type
  ordinal changes from the 8 we send unconditionally (`commands.ts:158`).
  **Settle this against a capture, not a reading** — this phase's
  neighbours have twice had a stored shape justified from an unchecked
  citation (recurring failure 16's second corollary).
- **Is it wanted?** No demand has been observed. The Erg Book model
  authors fixed rests throughout, and the seeded 300 carry them; this is
  a machine capability we lack, not a reported gap.

**Trigger:** James asks, or a tester asks for self-paced rest. **Sizing
unknown until the engine question above is answered** — plausibly S if it
is grammar-only, plausibly L if the timer needs a new phase kind.
