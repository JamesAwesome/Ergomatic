> **Archived 2026-08-28** from `ROADMAP.md` (lines 6422-6452 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase CS — Connected polish: the swipe returns, NEXT says more

**Status:** SHIPPED 2026-08-17/18 (#116 the enriched NEXT line, released in
v0.11.0; #119 the swipe, released in v0.12.0; #120 the walk-skill and
instruction-evidence fixes). Recorded here at the PM's third
roadmap-absence finding — this section was written at CM's final gate, a
phase late, which is itself the finding.
**What shipped:** the footer names the next interval
(`NEXT · WORK 2000m · 2:06.0 @22`); swipe LIVE↔GRID returned after a
device probe convicted our own `[role]` guard wildcard (not WebKit) of
refusing every grid-origin drag; `user-select` off the swipe surface.
**Standing facts this phase established** (full record:
`docs/monitor/sessions/probe-2026-08-17-swipe/README.md` and
`walk-2026-08-18-swipe/README.md`):
- The fake monitor CANNOT drive a native build — `monitorTransport.ts`
  takes the Capacitor arm whenever `isNative()`; walks connect to a real
  PM5, no rowing required for screen-only checks.
- `touch-action` must sit on the grid scroller itself (intersection stops
  at the first scroll container); deleting it reddens the gesture, not
  just a style pin.
- A drag steeper than 45° starting in the rows scrolls instead of paging.
  Cause UNSETTLED (our own dominance rule is the leading candidate, not
  WebKit — the #303 citation was corrected at the exit pass); the shallow
  off-horizontal drag rides CM's walk.
- [ ] Follow-up: the e2e stack-reap race (a sibling worktree boot once
      produced 117 ECONNREFUSED; suspected `stack-reap` racing
      `git worktree list`) — previously filed only in #116's PR body.
- [ ] Follow-up: `connection log text is no longer hand-selectable`
      (`user-select: none` inherits into the sheet); COPY LOG is the only
      route out — fine while COPY LOG works, a trap if it ever breaks.
