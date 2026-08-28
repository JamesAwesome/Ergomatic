> **Archived 2026-08-28** from `ROADMAP.md` (lines 506-572 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 6C — Log & completion

**Status:** Done (2026-08-02, PR #TBD)
**Goal:** A finished session becomes history the same day it happened.
**Design authority:** `docs/superpowers/specs/2026-08-02-phase-6c-log-session-design.md`.

- [x] `logDraft.ts`'s three pure builders (`buildLogSteps(run, draft)`,
      `buildManualLogSteps(workout, baselines)`, `logTotals(run)`): both
      doors' step labels compose through one shared `refPaceLabel`
      function, fed the draft's real, un-resolved `PaceRef` whenever a
      matching draft is on hand (session door) or the workout's own steps
      directly (manual door) — not the phase's already-resolved split —
      so a nudged/offset step reads identically either way
- [x] The Log screen, two doors sharing one `LogScreen` presentational
      component and one `useLogForm` save/retry hook: `/session/log` (the
      session door — the timer's own hand-off from `/session/complete`,
      and Today's unlogged line's real `Log it` link) and
      `/library/:id/log` (the manual door — WorkoutDetail's "Log it after",
      real once baselines are set, else the existing no-target/Set
      baselines idiom). Paces frozen at save ("PACES LOCKED AT …", showing
      only the base(s) the workout's own steps actually reference — never
      a bare dash, see `docs/design/DEVIATIONS.md`), the per-step list
      (frozen split + a stopwatch-only ACTUAL line), Held/Under/Over, pain
      **1–5** (Ergomatic's scale, not the handoff's 1–10), notes, `Save
session` (54px, pinned by a computed-style regression test). The
      session door hides the tab bar and offers a staged `Discard without
logging`; the manual door has neither — nothing staged to discard,
      so the tab bar stays visible there as the only way out
- [x] Save posts to the already-existing `POST /api/logs` route (no NEW
      route or store needed this phase — the one server change was Task
      1.5's same-day amendment loosening `validateLogStepEntry`,
      `server/routes/data.ts`, to make `targetSplit` optional and pair
      `actualSplit`/`actualSource`, once `logDraft.ts` proved the old
      validation predated effort refs; additive-only, so every previously-
      valid payload stays valid): a 201 clears the
      draft/run records (session door only — the manual door never reads
      or writes either) and returns to Today; a `workoutId`-specific 400
      retries once with `workoutId: null`; any other failure surfaces
      inline with retry, leaving both records intact
- [x] Full-loop e2e for both doors (Today → suggestion/Library → Confirm →
      Countdown SKIP → tiny timer session → complete → Log → Held + pain +
      notes → Save → Today), structural design coverage (both doors swept
      independently — visibly distinct chrome, not a re-sweep of shared
      markup — plus the staged-Discard panel open), and screenshots for
      both doors (`log-session.png`, `log-session-manual.png`)

**Note:** the server side of "save advances `doneN`" **already existed** —
`server/stores/logs.ts`'s `create` has bumped `plan_state.done_n` on every
`POST /api/logs` call since the Phase 4 schema work, so 6C's job was the
log-writing screen that calls the existing route, not new plumbing.

**Exit:** MET — **every arrow in the core loop closes**: Today → suggestion/
Library → Confirm → Countdown → Timer → complete → Log → Today, each hand-off
proved against the real compose stack (extending the existing loop specs
rather than adding a third parallel one) with the plan's session counter read
both before and after (advanced by exactly one) and Today's LAST THREE
showing the logged session dated today; a mid-workout reload survives (6B);
frozen log paces stay unchanged after a later baseline edit (reconstructed
from the draft's own frozen ref, not re-read live); the manual door proves
the same save path from a workout's own detail screen for an off-app row,
without ever touching the draft/run records an in-progress session elsewhere
might be using. One seam was left unspanned at close — no single browser
session ran the WHOLE card→log arc in one continuous test, each hand-off
was its own proof — and Phase 6D's `today.spec.ts` "the type-swap loop"
closed it, the one e2e in the repo that drives the whole arc in a single
page.
