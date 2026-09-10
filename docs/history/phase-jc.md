# Phase JC — the rower chooses what red and blue mean

**Archived 2026-09-10** — closed 2026-09-09 · #371 · released in v0.45.0.

Four judged slots, each RED / BLUE / OFF, obeyed by the connected pane and the post-workout summary; defaults are exactly the old appearance.

---

## Phase JC — the rower chooses what red and blue mean

**Status: GATE 0 CLOSED 2026-09-08 — cleared to implement.** The anchor
antagonist pass returned two blocking findings and four majors, all folded;
Gate 0's nine rulings are tabled in the spec. Shape approved by James
2026-09-07: four slots, each RED / BLUE / OFF; both the connected pane and the
post-workout summary obey; device-local; a new SETTINGS door in You. Spec:
[docs/superpowers/specs/2026-09-08-judge-colours-design.md](docs/superpowers/specs/2026-09-08-judge-colours-design.md).

Blue-for-faster and red-for-slower were a tester's request in August 2026 and
have been hardcoded since. Some rowers read red on a number as an alarm; some
want the split coloured and the stroke rate left alone. It is a preference,
so it becomes one. Defaults are exactly today's appearance.

TRIAD (a stored shape), so the spec takes a full antagonist pass and the PR
takes a PM final gate. It changes user-visible copy and layout, so Gate 0 —
the rendered screen, the door group, and before/after captures of a connected
pane and a summary — is approved before task 1.

- [x] **Gate 0 — CLOSED 2026-09-08.** Nine rulings, tabled in the spec. The
      three that change the build: door order is BASELINES, CONCEPT2,
      SETTINGS, DIAGNOSTICS with the group staying FLAT; **the summary's
      `← FASTER (BLUE) · SLOWER (RED) →` legend is DELETED** rather than
      derived from the slots; and the parked comfort settings do NOT ride this
      PR. **S**
- **LESSON FOUND MID-IMPLEMENTATION, 2026-09-08 — candidate recurring failure,
      to be decided at the merge-time agent-config check.** Phase JC's rename moved
      the summary's verdict classes onto a shared family ~5000 lines UP `index.css`,
      and `.summary-row-pace { color: var(--ink) }` sits below them at identical
      (0,1,0) specificity — so later won and **every judged row on the post-workout
      summary rendered plain ink**. The old `.summary-row-faster` had sat 30 lines
      BELOW that rule and beaten it, which is why nothing ever had to know. **No
      class-name assertion could see this by construction** (jsdom resolves no
      `var()`); `pnpm e2e` caught it. `index.css` already stated the rule in prose
      after the identical bug on a connected pane's hero — prose is not a gate.
      Shape: *moving a rule in a stylesheet silently changes which of two
      equal-specificity rules wins, and only a real browser can see it.*
- **SECOND LESSON, same phase, 2026-09-08 — also for the merge-time
      agent-config check.** Phase JC's seam test rests on navigating by CLICK
      rather than `page.goto`, because the settings screen's inline root
      properties survive a client-side nav and die on a reload — that asymmetry
      is what makes its two legs test different things. The plan defended that
      in PROSE and gated nothing. Measured: swap the click for a `goto` and
      **every colour assertion still passes** (the boot apply repaints from
      storage, so the cell is the right colour either way) while the two-legs
      claim is silently false. A same-document sentinel, asserted present in one
      leg and absent in the other, is what closes it. Shape: *a test whose value
      depends on HOW it navigated needs an assertion about the navigation, or
      the requirement is a comment.*
- **THIRD, from the PM final gate — an amendment to an EXISTING CLAUDE.md rule
      rather than a new one.** The "after withdrawing a claim, grep its
      PHRASING across every file that repeated it" bullet caught the deleted
      legend's literal words and missed five present-tense sentences in
      `app/src/news/content/releaseNotes.ts` asserting the same fact in
      different words. Proposed addition: *"and grep the PROPOSITION, not only
      the string: a shipped release note asserting the same fact in different
      words is the copy most likely to survive the sweep."* Decide at the
      merge-time agent-config check.
- **`/you/settings` gets NO `DEVIATIONS.md` row, decided at the Task 8 sweep
      (2026-09-08) — recorded so the next author does not re-open it.** Three
      reasons. The handoff has no settings screen, so there is nothing to
      deviate FROM; the file's own inclusion test is the SPM-target row's
      ("recorded here since this is a genuinely NEW cell, not a re-use of an
      existing color decision") and every colour on this screen is a re-use —
      `--ink`/`--ink-3` at ratios the file already records many times over,
      `--accent` as the checked state (the onboarding chip's own idiom), the
      swatch inks from the judgement-palette row, and a decorative sub-3:1
      `--rule-3` border that `.diag-copy` and `.onb-option` already ship
      rowless on the SHUFFLE/FILTER-chip row's precedent. And insertion
      is not free: this table numbers rows BY POSITION, so a new row would rot
      every "see row N" above it, including the three this phase just
      reconciled — the migration-to-stable-IDs item is still open below.
      (Cited by subject, not by number, on purpose: main added a row at the
      file's line 81 while this branch was open, so every number above it has
      already moved once.) The
      screen's full computed-contrast table, including the one figure under
      3:1 and why it is decoration, lives in its own `index.css` block instead.
- [x] **The PR — MERGED as #371 (`e162c091`), ticked 2026-09-09.** Built and
      PM-gated (PASS WITH CONDITIONS); the whole-branch review and James's merge
      approval were given and it landed.
      **This row's own rule is why it took a sweep to tick it, and the rule is
      RIGHT:** it said "unticked deliberately — a ticked box whose text says it
      is not done has been wrong on main for weeks at a time here." So the tick
      and the TEXT move together, or neither moves. What the rule does not
      supply is anyone to come back and do it: this box stayed open for a day
      after its own PR merged, and three others like it were open when the
      Phase OD sweep ran.
      Eight tasks, spec §"PR shape". The load-bearing one is the
      e2e seam test: Vitest mocks every `.css` import to an empty string here,
      so **no client test can prove a colour lands on a pixel** — only e2e can
      start upstream of the producer (recurring failure 24). Shipped: the
      `you/judgeColors.ts` store; the palette split into two raw inks and four
      resolvable slots; four `.judge-{pace,spm}-{faster,slower}` rules where two
      pairs stood; the six judged call sites taking a REQUIRED metric; the
      legend deletion; a generalised `OptionGroup`; `/you/settings` behind
      You's third door; the `main.tsx` boot apply; and the two-leg seam test.
      **M**

**Three structural notes worth keeping even if the phase changes shape.**
`index.css` documented "ONE PAIR SERVES BOTH JUDGED METRICS ... There is no
per-metric colour branch to keep in step"; per-slot control retired that
sentence (Task 3 deleted it along with the pair), and the six judged call
sites each already knew their own metric, so nothing new threads through
`surfaceModel`. **But there were TWO judged class pairs, not one** —
`.summary-row-faster`/`-slower` was a second, independent pair on the summary
screen, and the honest blast radius (measured at phase open) was 114
references across 29 files including 12 committed e2e HTML fixtures and
`design.spec.ts`'s own judged-colour harness; Task 3 folded both pairs onto
the shared `.judge-{pace,spm}-{faster,slower}` family and retired the old
ones. **And the summary screen named both colours in hardcoded copy**
(`← FASTER (BLUE) · SLOWER (RED) →`, pinned by an e2e `toHaveText`), which
eight of the nine reachable pace configurations made false; Gate 0 ruled it
DELETED on `TraceChart.tsx`'s own precedent ("naming a colour here would just
be a second thing to get wrong later"), and Task 4 removed the element, its
CSS rule, the `hasJudgedRow` guard that was its only consumer, and the e2e
pin (now its negative). And `--judge-slower` was doing two
jobs — the judged tint AND `.connected-lost`'s red alarm background — which is
why the spec splits raw inks (`--judge-red`/`--judge-blue`) from resolved
slots rather than overriding the existing tokens in place. Overriding in place
would have been fewer lines and would have turned the LOST THE MONITOR banner
blue for any rower who chose all-blue.
