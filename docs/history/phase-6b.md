> **Archived 2026-08-28** from `ROADMAP.md` (lines 430-505 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 6B — Live timer

**Status:** Done (2026-08-02, PR #TBD)
**Goal:** A confirmed session runs itself, start to finish, with nothing but
a phone against the erg.
**Design authority:** `docs/superpowers/specs/2026-08-01-phase-6b-timer-design.md`.

- [x] Keep-awake adapter (`src/adapters/keepAwake.ts`): native
      `@capacitor-community/keep-awake` behind a lazy import, Screen Wake
      Lock API on web (best-effort, re-acquires on `visibilitychange`); on
      for the whole countdown → timer → complete span, released on exit
- [x] Countdown (`/session/countdown`, configurable via
      `preferences.countdownSeconds`, skippable, 0 = off): builds and saves
      the `SessionRun` on mount (not at zero) so the timer starts with no
      setup lag; CANCEL un-starts the draft coherently (`draft.ts`'s
      `cancelStart`); wall-clock countdown, not an accumulated tick
- [x] Live timer (`/session/run`, replacing 6A's placeholder): portrait —
      dots, STEP line, 96px numeral (count-down for a timed phase, count-UP
      stopwatch for a distance phase), phase progress bar, TARGET SPLIT/RATE
      cards, UP NEXT, TOTAL LEFT + ruler, ◀ / Pause / ▶ (or NEXT → on a
      distance phase); landscape at 844×420 reflows to the handoff's own
      two-column layout (128px numeral, an added "then …" UP NEXT line);
      warm-up/rest/test phases and effort-ref targets show "Easy"/"Rest"/
      "ALL OUT" (never a bare dash, never the numeric estimate behind an
      effort ref); tabs hidden on every session route
- [x] Distance phases (manual mode, works on every device forever): target
      meters folded into the STEP line, resolved range or effort word, a
      count-UP stopwatch, "NEXT →"; elapsed time yields the actual average
      split with zero hardware, logged as `actualSource:'stopwatch'`. A
      split more than 2× or under half the domain-estimated duration stages
      a Keep/Discard choice instead of recording silently (a long suspend,
      or NEXT mis-tapped moments after starting a piece)
- [x] Staged confirms (BaselineEditor's idiom, never a modal): END abandons
      the whole session (nothing saved); ▶ or NEXT on the last phase stages
      "Finish this session?" (completion is a documented one-way door); the
      suspect-actual choice above. Baselines are required to START — an
      unset pair blocks at the existing no-target/`/you` idiom rather than
      building a run against a dummy pair
- [x] Session complete (`/session/complete`, new — not in the original
      handoff, which reserves the richer post-workout review for 6C):
      TOTAL wall-clock time, every recorded distance actual, Back to Today.
      Deliberately does not clear the draft or run record — 6C's own
      log-writing screen still needs them
- [x] Today's stale-discard rule amended: a completed-but-unlogged run now
      protects its draft from the 24h staleness sweep, so finishing a
      session and leaving without logging it doesn't silently lose the
      record before 6C can write it
- [x] Timer resilience: reload mid-phase restores the correct remaining
      time (wall-clock reconstruction, never accumulated ticks); reload
      while paused restores frozen, not still-counting; a `visibilitychange`
      catch-up walk fires the instant a locked screen wakes, multi-phase if
      the suspend spanned several timed phases; an unknown/malformed
      persisted run clears and redirects rather than throwing
- [x] Structural design coverage (`e2e/design.spec.ts`) and screenshots
      (`countdown.png`, `timer.png`, `timer-landscape.png`,
      `session-complete.png`) for every session screen against real,
      non-empty workouts — a timed phase, a distance phase, an effort
      target, the landscape frame, and each staged confirm swept
      individually — caught and fixed a real defect: `.countdown-screen`
      and `.session-complete-screen` shared `.timer-screen`'s pre-fix
      landscape `min-height` formula and carried the identical 18px of dead
      vertical scroll at 844×420, invisible in portrait's taller frame

**On-device checks (James, post-merge):** lock-screen tick survival,
keep-awake actually holding the screen on, and app-kill/resume — Chromium
cannot prove any of these; the design spec's own Testing section says so.

**Exit:** MET — a seeded workout runs end to end (countdown → every phase
kind → complete) with per-step stopwatch actuals for distance phases;
reload mid-phase and mid-pause both restore exactly; effort phases read
"ALL OUT"/"EASY", never a number, never a dash; all gates green, all three
screens' screenshots (plus the timer's landscape frame) opened and checked.
6C (log-writing screen, Held/Under/Over, pain, notes, `doneN` advance UI)
remains — the holder this phase leaves behind (an unlogged completed run)
is exactly what 6C's own save flow is for.
