> **Archived 2026-08-28** from `ROADMAP.md` (lines 7313-7510 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Bugfix rounds

Ad hoc fix rounds outside the phase sequence — small bundles of device
reports and quick fixes shipped as their own PR rather than waiting on the
next phase. One line per round, newest first.

- **SHIPPED (2026-08-24, the honest-empty / one-control round — James's
  report): an unset baseline now LOOKS unset, and one control does both
  entry jobs on all three baseline surfaces.** Two defects in one change.
  (1) `SplitInput`'s `seconds` was non-nullable, so a baseline the rower
  had never entered rendered the app's own seed as the field's VALUE in a
  saved number's accent ink; the only unset marker was an 11px line shown
  when BOTH sides were null, so a half-set account got no marker at all.
  An unset side is `null` end to end now, renders EMPTY with the seed as
  an `--ink-4` placeholder (5.29:1 on `--surface`, computed), and the
  first ± tap materialises that seed exactly. (2) Entry affordances were
  split — the You editor and door 2 typed only, door 1's adjust step
  nudged only — so `you/BaselineField.tsx` is now the one control
  everywhere (`[−][typable split][+]`, the house `Stepper` visual,
  settle-then-nudge, `aria-disabled` dead ends, a polite live region).
  `BaselineRow` and `.onb-field-box` retired. **Review fix, same day:**
  the new empty field and the existing derivation offer are two
  suggestion mechanisms that met on one row and disagreed (placeholder
  2:25.0 above a button offering 2:23.0), and a single stepper tap
  materialised the generic seed — a value that is not the offer's — which
  made the estimate unreachable and wrote the seed as `manual`. An
  offer-eligible side now takes the offer's value as its seed. Also
  fixed: the live region kept stale text after a Discard and then went
  SILENT on the next identical announcement (a polite region fires on a
  DOM mutation, and React bails on an unchanged string), so an
  announcement is now bound to the value it names. **QUEUED, found while
  shipping it:** the derive slot's inert line still reads `ESTIMATED ·
  TYPE TO ADJUST` — true but now half the story, since that same field
  nudges. The brief froze the derive slot, so the copy was left alone
  deliberately; it is a words-only change (two e2e assertions and one
  client test name it) and belongs to the next PR that touches the You
  editor. **ALSO QUEUED:** door 1's adjust step shows a PROPOSED number
  with no provenance eyebrow of its own — the offer step it came from is
  the only place the fill's source is named. Fine today; revisit if that
  step ever becomes reachable without passing the offer.

- **ANSWERED (PM final-PR gate, 2026-08-18, PR #121 → `docs/superpowers/
  specs/2026-08-18-log-delete-design.md`): a logged session can be
  deleted, remove-only, from its own from-the-log view.** Spec 2 made
  every log reachable and stored three client-supplied hero numbers the
  server bounds-checks but cannot truth-check; the measured record was
  immutable by design and `data.ts` had no DELETE route, so a Sun-fret-
  class wrong number was permanent. `DELETE /api/logs/:id` now removes
  the row; deleting your LATEST plan session un-ticks its checkmark
  (terminal-only, §2's three-condition rule — a middle delete keeps the
  tick, the plan counts sessions done and old history never renumbers
  it). **NOT fully closed — the spec's own §4 accepted gap:** a session
  with a WRONG NUMBER or logged against the wrong workout has exactly
  one remedy — delete it and re-log by hand — and `logged_at` is a DB
  default, not settable, so a mistake found the next day can't be
  re-dated onto its own day, and re-logging a non-terminal plan session
  appends at the top rather than refilling its old slot. Accepted as the
  cost of remove-only (re-association and number-editing were both
  DECLINED, James's ruling); the next spec that touches log lifecycle
  starts from this gap, not from rediscovering it. **The next release's
  notes carry the gap in plain words** (PM gate C1, 2026-08-18: spec +
  ROADMAP + notes is the full disclosure chain for an accepted limit).
- **QUEUED (final-review fix round observation, 2026-08-18): `today.png`'s
  regen diff showed an onboarding read-marker difference** unrelated to
  the branch that surfaced it — reverted there, unexplained. Owner: the
  next Today-capture pass; explain or fix before committing that capture.
- **ABSORBED INTO PHASE LT SPEC 1 (2026-08-18 — see the Phase LT section; originally): the
  INTERVALS section judges each interval against ITS OWN TARGET.** He beat
  every target in a three-interval session (2:14.9/2:13.4/2:11.5 vs
  2:17/2:16/2:15) and the screen painted two rows RED (+2.0/+0.5 vs the
  session average) with no target visible anywhere (multi-target sessions
  render no hint by the single-target rule) — the first real tester
  misread the baseline on his first real workout. His words: "that
  section needs to be about performance against target per int." Scope:
  per-row deviation/bars re-baseline from session-working-average to the
  row's own target (supersedes spec 1's R-C/R-E ROW semantics; the AVG
  SPLIT hero keeps the session average, neutral ink); the target renders
  INLINE per row (reverses #117's column removal, device evidence);
  no-target rows abstain (absence idiom); CAPTURE measured SPM per
  interval (wire delivers it, nothing stores it) and fold the parked
  `MONITOR_SPM_MIN = 0` floor item in the same round. Stored
  `LogStep.targetSplit` already exists, so history re-judges without new
  split storage; from-the-log's §5C updates in the same round. **TRIAD
  WEIGHT** (number meaning + stored shape): full antagonist on the spec,
  PM final-PR gate, despite the bugfix framing. Photos:
  `~/Desktop/tule-fog` at ruling time; the reconciled arithmetic is in
  the session record.
- **ABSORBED AS PHASE LT-0 (2026-08-18 — ships FIRST as its own PR; the fallthrough diagnosis is in LT spec 1 §3; originally): discard missing on an
  early-ended workout's summary.** He ended a workout early and the
  post-workout summary offered no "Discard without logging" — only save
  paths. Scope, his ruling: **audit every surface where SAVE is an option
  and ensure DISCARD is present beside it** (the spec-1 §2F save stacks
  per door, the interrupted-session row's doors, and any early-END path),
  not just the one repro. The house two-tap staged discard
  (`useStagedDiscard`) is the pattern. Runs as its own bugfix round AFTER
  Phase PW spec 2 merges; the repro screenshot is in the session record.

- **PR #TBD** (2026-08-09, "crosslink" round, full cycle) — the ui-notes
  round below fixed the reader's own NEXT link but missed the two IN-PROSE
  cross-links inside article bodies (`workoutTypes.tsx`'s "Picking a
  workout", `pickingAWorkout.tsx`'s "pain from 1 to 5" — raw
  `react-router-dom` `Link`s added in the persona round), so tapping one
  mid-chain still dropped the reading chain's origin and BACK/✕ fell back
  to NEWS (James's 2026-08-09 recording: Today → START HERE step 3 → the
  picking-a-workout article → the cross-link → ✕ → NEWS, not Today).
  `useReadingOrigin` extracts Reader's own origin-read (behavior unchanged,
  proven by Reader's existing tests passing untouched) and a new
  `ArticleLink` component — THE one door an article body may use to link to
  another article — applies `replace` plus the same origin-carry NEXT
  already had; a source-sweep test pins every future body against a raw
  `Link` reappearing. e2e locks down James's exact path plus the depth-lock
  he required: one `goBack()` through a cross-link hop, not just a NEXT hop.
- **PR #TBD** (2026-08-09, "ui-notes" round) — three James device notes
  post-v0.6.0: (1) the reader's NEXT link pushed with the wrong origin
  (`state={{from: location.pathname}}`, the article being LEFT, not the
  chain's true start), so mid-chain BACK fell back to NEWS and escaping
  took multiple backs — NEXT now replaces and threads the ORIGINAL
  `location.state.from` through unchanged, and the reader gains a 44×44 ✕
  Close (Today's own icon-control idiom) resolving the same origin BACK
  does; (2) the baselines editor offers to estimate whichever split is
  unset from the one that's real (`domain/deriveBaseline.ts`,
  `K2_K6_OFFSET_SECONDS = 7`) — an offer only, never automatic, bounded by
  the editor's own MIN/MAX split range; found capturing this state's own
  screenshot, the editor's "No baselines yet" prompt used to fire whenever
  EITHER side was unset, falsely denying a real, rowed value sitting right
  next to the new offer — narrowed to the genuinely both-unset case; (3) `yourFirstRow.tsx`'s "Prefer
  the short test?" paragraph and `baselines.tsx`'s two-baselines paragraph
  are rewritten to stop implying both baselines are needed with no way to
  get there without rowing both tests.
- **PR #TBD** (2026-08-08) — e2e retries actually retry: two red main runs
  traced to fixture non-idempotency, not code. The stack's users are
  find-or-create by email and its volume persists, so a mid-test failure
  stranded an imported fixed-title workout and the retry re-imported it
  into a strict-mode duplicate. `signInViaBackdoor` now suffixes every
  email with a per-process `RUN_ID`, the connected walks carry unique
  titles, and `library.spec`'s one-shot scroll read became a poll.
- **PR #TBD** (2026-08-08) — type rows unified to O2 · AT · TR · AN (the
  pyramid's base-first order) across Today's type-swap chips, the Library
  filter sheet's TYPE cells and Builder's classification card, with the
  design README amended to match; Today's plan line also gains the
  currently-effective type's descriptor word (`TYPE_WORDS`, extracted from
  `builderState.ts` to a shared `src/components/typeWords.ts`).
- **PR #TBD** (2026-08-08, round 4 on the same bug, architectural) — the
  reader and release-notes screens become fixed overlays (`.overlay-screen`,
  `position: fixed; inset: 0; overflow-y: auto`) scrolling in their OWN
  element instead of the window, after three window-scroll fixes in a row
  each lost to real iOS WebKit; a freshly mounted element starts at
  `scrollTop 0` by construction, so there is nothing for iOS to restore.
  `Reader.tsx` gains `key={article.slug}` so the NEXT footer remounts a
  fresh scroller, and both roots gain `tabIndex={0}` for keyboard scrolling
  (axe's `scrollable-region-focusable` was already satisfied by each
  screen's focusable `BackLink`, verified against the rule's own source).
  Round 3's `holdScrollTop` helper and its test are deleted outright.
  **Correction to the round's own premise:** the architecture does NOT hand
  News its BACK position back, because a fixed overlay collapses
  `document.body`'s scroll height and the browser clamps `window.scrollY`
  to 0; the tradeoff below stands. Full reasoning: `.overlay-screen`'s
  comment in `index.css`.
- **PR #TBD** (2026-08-07/08, round 3 on the same bug) — a shared
  `holdScrollTop` helper (`src/shell/holdScrollTop.ts`) set the top and
  held it at rAF cadence for ~30 frames, aborting on `touchstart`/`wheel`/
  `keydown` so it never fought a rower's own scroll. It lost on device too,
  in BOTH iOS browsers, which ruled out a browser-chrome-specific cause;
  the mechanism was never directly observed, because no harness here can
  inject a real touch gesture. The recorded next step, taken by round 4
  above, was architectural.
- **PR #56** (2026-08-07, follow-up to the News polish round below) — PR
  #55's `useEffect`-timed `window.scrollTo(0, 0)` ran and landed (proven
  under instrumented desktop-WebKit and iPhone emulation) but on the real
  device Safari's own scroll pass re-scrolled the reader ~150px down
  afterwards (James's screen recording). Fix targets the layer that
  misbehaved: `history.scrollRestoration = "manual"` claimed at App mount,
  since every scroll-sensitive screen already self-manages, plus both news
  scroll effects moved to `useLayoutEffect`. **Known tradeoff, deliberate:**
  BACK from an article now lands News at the top on iOS, which costs one
  small flick at today's ~1.15-screen feed; if the shelf grows, News gets
  the Library's own scroll-memory pattern rather than browser restoration
  (Phase CL).
- **PR #55** (2026-08-07) — News polish: the reader and release notes
  scroll to the top on open instead of keeping the feed's scroll position;
  "heart rate monitor" replaces "heart rate strap" throughout; a prose pass
  removes em dashes and AI-tell constructions from all four articles;
  workout-types' four type mentions render as inline `TypeBadge` chips;
  a new training-pyramid SVG figure illustrates the four-type stack;
  workout-types now names the four types properly (aerobic, anaerobic
  threshold, transport, anaerobic) rather than just describing the job;
  baselines gains a paragraph on why 2k/6k are the two reference distances
  (racing: sprint and head-race lengths).
- **PR #TBD** (2026-08-02) — history-aware `← BACK`: every back link now
  returns to wherever its screen was entered from (Today → suggestion →
  detail → BACK lands on Today, not a hardcoded `/library`) via a shared
  `BackLink` component; Library remembers its scroll position across a
  detail round trip (BACK restores it, a tab tap starts fresh at the top).
- **PR #36** (2026-08-02) — CUSTOM indicator on workout detail; iOS
  input-zoom floor (every builder/import/you field now computes
  `font-size >= 16px`); head-race preset blurb reworded to match sprint's;
  Plan sequence's scroll-in-a-box removed (flows with the page, Library-style).
