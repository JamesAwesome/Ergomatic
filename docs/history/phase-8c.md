> **KILLED at the 2026-08-28 roadmap rebalance.** No demand was ever observed. The phase existed because James said in the 2026-08-12 session that he "may one day" want it. 8A's `kind` discriminant seam stays built.
>
> Archived verbatim below. Nothing here is scheduled.

## Phase 8C — Rower-authored prescriptions (phase two: the rower suggests)

**Status:** Not started. Unscoped: brainstorm before sizing.
**Goal:** A rower can pre-plan their own routine, reserving a specific workout
in advance, and the app suggests it when that day comes.

- [ ] Brainstorm first. Open questions to settle there: is a reservation keyed to a DATE or to a plan session index (8A's producer is index-keyed, and `done_n` advances per logged session with no calendar awareness, so these are genuinely different features); does a reservation survive a plan switch or reset, both of which zero `done_n`; and what a rower sees on a day where their own reservation and a plan checkpoint both apply.
- [ ] **The precedence hierarchy, re-decided against a real second producer.** The 2026-08-12 draft records "rower wins all → a theoretical date → plan prescription" with a displaced lower tier simply dropped. That was decided in a session with no reservations in it, and the losing case is a rower who reserves a workout on a checkpoint day and silently loses the measurement every other workout's targets resolve against. Revisit before building. **M**
- [ ] Refs by id, not title, for anything the rower authored: titles are user-editable and `server/db/schema.ts` has no uniqueness constraint, so a rename would silently break a reservation. 8A's ref carries the `kind` discriminant for exactly this. **S**
- [ ] The escape verb. A checkpoint is escaped by SHUFFLE, an ephemeral per-day pick that returns on reload. A reservation the rower made must be CANCELLED instead, which needs a persisted, server-side channel that `todayPick`'s localStorage record cannot provide. **M**
- [ ] Multiple options for one day ("A or B"), if the brainstorm wants it.

**Trigger:** James asks, or a second rower asks. **No demand has been observed** —
this exists because James said in the 2026-08-12 session that he "may one day"
want it, and the honest record is that the seam is prepared and the feature is
not scheduled.

**Exit:** A rower reserves a specific workout for a future day, sees it
suggested when that day arrives, and can cancel it without shuffling.
