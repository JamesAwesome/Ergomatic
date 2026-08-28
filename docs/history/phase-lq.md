> **KILLED at the 2026-08-28 roadmap rebalance.** The variety debt is invisible to a rower who rows one workout a day, and the rating item argued against itself in its own text.
>
> Archived verbatim below. Nothing here is scheduled.

## Phase LQ — Library quality and what rowers think of it

**Status:** Not started. Split out of Phase CL2 on 2026-08-20 (James).
**Goal:** the library stops containing workouts a rower cannot tell
apart, and starts collecting their opinion of the ones they row.

**Why these two belong together.** Both answer "is this workout any
good?" — one from the authoring side, one from the rower's. They also
feed each other: ratings are the only mechanism that could ever tell us
whether a near-duplicate pair actually matters to anyone, so building the
rating first and letting it run may well re-order the retune list. That
is a sequencing question for the phase's own brainstorm, not a decision
to make here.

- [ ] **Pay down the O2|60+ variety debt** (James, 2026-08-10, at the
      rebalance's Gate 2): Fair Wind / Morning Mist / Sleet / Glass Sea
      (+ Altostratus after its retune) are near-identical long
      continuous singles. Retune 2-3 into distinct shapes WITHIN the
      cell so the grid holds; the `variety.test.ts` KNOWN_DEBT entry
      for O2|60+ shrinks with them (ratchets only ever go down). **M**
- [ ] **Pay down the rebalance's other flagged pairs** (James,
      2026-08-10, at the PR #78 merge: "any flagged workouts bump to
      CL2"). The full list, from the PR's disclosure section: O2|30-45
      Silver Thaw <> Halo Ring; AT|30-45 Anticyclone <> Jet Streak,
      Inversion Layer <> Gap Wind, Deepening Low <> Thermal Wind,
      Thermal Low <> Heat Low; TR|30-45 Gulf Stream <> Piteraq,
      Southerly Buster <> Cold Snap; AN|20-30 Downburst <> Rope
      Tornado. Same rules as the cluster above: differentiate WITHIN
      the cell, grid holds, ratchets shrink. **M**
- [ ] **Workout rating system** (James, 2026-08-10): unscoped —
      **brainstorm first**, and the brainstorm owes the house
      does-it-exist question before any of it. Open questions: what a
      tester rates (the workout as a recipe, or the session they just
      rowed — these are different things and the app already collects
      the second as thumbs + hold + pain); where it surfaces (post-save,
      library, detail); and whether ratings feed selection or stay
      informational. **Note the overlap that must be settled, not
      papered over:** the post-workout reflection ALREADY asks for a
      thumbs up/down on "do you want more sessions like this one". A
      second rating control that means something almost-but-not-quite
      the same is worse than none. **M, brainstorm before sizing**

**Exit:** the O2|60+ cluster reads as five different workouts, no flagged
pair survives as a near-duplicate, and a rower can say what they thought
of a workout in a way the app can act on.
