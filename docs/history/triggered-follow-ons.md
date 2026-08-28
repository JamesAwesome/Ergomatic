> **Archived 2026-08-28** from `ROADMAP.md` (lines 7511-7869 of the
> pre-rebalance file, main `39e9430`). **This section was still LIVE when it
> was archived.** Pruned and redistributed into the live slate, the open-item register, and the deferred section. Two entries were duplicates of Phase PROD items and one had been closed with a measurement table.
>
> It is kept verbatim so no detail is lost, and it is a RECORD: the work is
> maintained in `ROADMAP.md`'s live slate, not here. Do not work from this file.

## Triggered follow-ons (not scheduled — each has an explicit trigger)

- [ ] **TL-1: the type descriptor renders under the WRONG chip.** Select AN
      on Today or in the Library filter and `SPEED WORK` renders at x=20 —
      under the **O2** chip, roughly 250px from the chip it names. `.type-word`
      is a full-width `<p>` in its own row (`index.css:952-963`), so the word
      never moves regardless of which chip it describes. It looks correct in
      `today.png` and `library-filtered.png` only because O2 happens to be
      first. Found 2026-08-26 by the type-label design pass.
      **Cross-ref: Phase PROD's "the four workout types teach themselves"
      item.** Option A (the leaning design) deletes `.type-word-row` outright
      and puts each word inside its own chip, which retires this bug rather
      than fixing it — so **if that redesign is close, do nothing here.**
      If PROD slips, fix it standalone: the word belongs in the selected
      chip's column, or the row goes. **Trigger:** the next PR touching
      Today's or Library's chip rows, or PROD's design pass starting,
      whichever comes first. **S**
- [ ] **TL-2: two different plain-word vocabularies ship at once.**
      `src/components/typeWords.ts` says AT = `COMFORTABLY HARD`,
      O2 = `LOW & SLOW`. `PyramidFigure.tsx` (inside the pinned
      `workout-types` article) says AT = `THRESHOLD`,
      O2 = `GENERAL ENDURANCE`. So the figure a rower meets first — the one
      that teaches all four at a glance — uses **different words from every
      chip he meets afterwards**, and one of them (`THRESHOLD`) is exactly
      the jargon the disclosure work exists to replace. Found 2026-08-26.
      **Independent of the redesign: fix now.** `PyramidFigure` should read
      from `TYPE_WORDS` rather than carrying its own strings, so the two can
      never diverge again, and its `aria-label` updates with it.
      **Cross-ref: Phase PROD's disclosure item**, which assumes one
      vocabulary exists. **Trigger:** next PR touching News content or
      `typeWords.ts`. **S**
- [ ] **TL-3: the pyramid's plain words render at 7.44px**, a quarter below
      the house 10px mono floor. `PyramidFigure.tsx` sets `fontSize="7"` in a
      `viewBox="0 0 320 190"` that `.reader-figure svg { max-width: 340px }`
      renders at scale 1.0625. Measured 2026-08-26. The persona's "this
      taught me the whole thing in two seconds" reaction was to text the
      design system forbids. **Independent of the redesign: fix now.**
      `fontSize="10"` (10.63 CSS px) was checked band by band and every label
      still fits, tightest case `SPEED WORK` in the AN tip with ~5 units
      slack. **Belongs to PROD's "Accessibility audit" item as well** — it is
      a text-size floor violation, not a nicety. **Cross-ref: Phase PROD's
      disclosure item** (same figure, same words). **Trigger:** next PR
      touching News content, or the accessibility audit. **S**

- **A READ IS LOST IF YOU LEAVE AN ARTICLE BEFORE ITS READ-STATE GET
  LANDS** (found 2026-08-21 by the flake hunt, by REPRODUCING the flake
  rather than re-running it). **This is an app bug, not a test bug, and
  the test that catches it is right.**
  `Reader.tsx`'s mark-read effect fires only when
  `reads.state === "ready"` — deliberately, so it has a `markRead` to
  call. But an article's PROSE IS STATIC and renders instantly, while the
  read state waits on a network GET. So the whole screen can be up and
  readable while `reads` is still loading, and a rower who taps BACK in
  that window unmounts the Reader before `markRead` is ever called. **The
  read is silently dropped — permanently.** Reproduced under load: the
  News unread count held `7 UNREAD` against an expected `6` across 13
  polls over a full 5 s timeout, i.e. it never converged, because nothing
  was ever written.
  **The existing barrier does not cover this.** `useArticleReads.ts`'s
  read-after-write barrier (2026-08-12) fixes the OPPOSITE direction — a
  new screen's GET overtaking an in-flight PUT — and its own comment
  records that same lesson ("the test was right, the app was racing").
  It cannot help when no PUT is ever issued.
  **NOT fast path** — the failure mode is a lost record, which the fast
  path explicitly excludes. Wants a spec: the honest fix is probably to
  mark on unmount as well as on ready, or to issue the write from a
  layer that outlives the screen, and either choice needs the
  does-it-exist question asked of the offline/failed-PUT case.
  **Until it is fixed, `news.spec.ts:140` will flake under load — and it
  SHOULD. Do not make that test wait the app's race away; that would
  delete the only thing telling us about this.** **Trigger:** next News
  or article-reads work, or sooner if a tester reports a read not
  sticking. **M**
- **An e2e fixture that exercises a REST** — spec
  `2026-08-20-est-left-design.md`'s exit criterion 6, recorded HALF MET
  rather than reworded. The fake reports Rest Time honestly and
  `FakeStatusEvent.restSeconds` is scriptable, but no e2e or screenshot
  fixture drives `state: "resting"` with a scripted rest value, so the
  countdown-through-a-rest behaviour is proven only at the replay layer
  (a real capture through the production driver) plus a DOM-level wiring
  test. The PM gate ruled that sufficient for MERGE and the fixture a
  follow-up — recorded here because it lived only in the spec and a PR
  body, which is recurring failure 14's seventh occurrence in eight
  gates. **Trigger:** the next work touching the connected surface's e2e
  fixtures. **S**
- **HUNT THE E2E FLAKES — James, 2026-08-20: "post release lets hunt down
  the flake".** Scheduled work, not a footnote. There are at least TWO
  distinct recurring flakes and every prior sighting was disposed of the
  same way — "passed on re-run" — which is how a real race stays alive for
  months. **What is known, so nobody re-derives it:**
  - **The manual-door tap-target flake.** Recurred across multiple gates
    during Phase LT (PR #129's own record: "isolated-rerun-confirmed each
    time"), and again on 2026-08-20 during PR #144's gates: one run at
    **399/401 with a non-zero exit, then 401/401 twice on re-run.** A
    failure that reproduces across unrelated diffs and months is a race in
    the app or the harness, not noise.
  - **The `design.spec.ts` layout-settling flake** (`stableBoundingBox`,
    `:1677`/`:1697`) — already recorded under Phase CR2 as wanting "a
    tracked fix rather than another per-task footnote". Same disposition,
    same outcome. Fold both into one hunt.
  **Why it matters beyond annoyance:** a suite that goes red for reasons we
  have taught ourselves to ignore is a suite whose red has stopped meaning
  anything. Today the controller had to decide, live, whether a 399/401 was
  a regression or the known flake — and got it right only by re-running
  twice. The next person may not, in either direction.
  **First moves, cheapest first:** capture the actual failure (Playwright's
  trace/video on retry, which CI may already be discarding) rather than
  re-running until green; check whether the failures cluster by worker
  index or by ordering, which separates a harness race from an app race;
  and only then reach for the code. **Trigger: immediately after v0.15.0
  ships.**
- **CLOSED 2026-08-20 (PR #144, measurement recorded) — `intervalRestTimeSeconds`
  agrees with the PROGRAMMED rest in every committed capture, so no stored TIME
  hero is wrong.** The open question (raised the same day by the fake-vs-parser
  audit, `docs/monitor/fake-vs-parser-audit.md`) was whether `summaryModel.ts`'s
  TIME hero, which sums work seconds plus **programmed** rest for completed
  intervals (R-D), is understating or overstating sessions where the machine's
  own settled rest differed. It does not: `0x0037` offsets 12-13 decoded across
  every completed interval in every committed wire recording — 14 records over
  5 sessions — report exactly the programmed value, to the second.

  | capture | programmed rests | `intervalRestTimeSeconds` decoded |
  | --- | --- | --- |
  | `walk-2026-08-16/session-1-keystone-2x250r0.jsonl` | r0, r0 | 0, 0 |
  | `walk-2026-08-16/session-2-wu-4unequal.jsonl` | r0, r30, r30, r30, r0 | 0, 30, 30, 30, 0 |
  | `walk-2026-08-17/step-2-*.jsonl` | r0, r0 | 0, 0 |
  | `walk-2026-08-17/step-3-*.jsonl` | r0, r30 | 0, 30 |
  | `walk-2026-08-18-metrics/pyramid-*.jsonl.gz` | r1, r1, none | 60, 60, 0 |

  The mechanism behind the agreement is the one the item guessed: on a
  PM5-programmed interval workout the machine ends the rest itself, so there is
  no rower behaviour that can move the number. **Nothing is owed** — no
  migration, no release note, no correction to a stored hero. The field stays
  decoded and unconsumed on purpose; wiring it would add a second source for a
  number that already has a correct one. **Re-open only if** a capture ever
  shows a divergence (a manually-ended rest, a JustRow split, a firmware that
  reports the elapsed rest rather than the settled one).
- **The connected bar's fill and its notches are two axes on DISTANCE work,
  and the estimate holds still for seconds at each handover** (measured
  2026-08-20 at PR #144's PM gate; accepted and documented, `docs/design/
  DEVIATIONS.md`'s third EST LEFT row). `estElapsed` banks each completed
  phase's PROGRAMMED length while `intervalBoundaries` re-anchors its notches
  to the MEASURED ones, so a rower off target sees EST LEFT and the bar stand
  still into the rest — **6.6 s and 20.8 s** on the pyramid capture, pinned by
  `surfaceModel.test.ts`'s "the DISTANCE-work limit, measured on a replay".
  **The obvious repair was replayed and does not work:** banking measured
  seconds changes nothing, because the PM5 emits an interval's 0x0037/0x0038
  boundary record at the END of its rest, so the finished interval's actual
  does not exist during its own rest. Neither does `frame.elapsedSeconds`
  survive the rest coast (78.64 -> 88.67 -> 84.88 within one rest, same
  capture). **Trigger:** a spec that wants the countdown and the notches on
  one axis — it needs a wire source for the just-finished interval's work
  time that arrives AT the boundary, and finding one is the first task, not
  an assumption. TRIAD weight (it changes what a number means): full
  antagonist pass on that spec.
- **23 citations across 11 tracked files point into `.superpowers/`, which
  is git-EXCLUDED and therefore unreachable to everyone except the session
  that wrote it** (found 2026-08-20 at PR #141's PM gate, which caught three
  such citations in that PR and required them replaced; the remaining 23 are
  pre-existing and out of that PR's scope). `.git/info/exclude:7` excludes
  `.superpowers/`, so `docs/superpowers/sdd/` does not exist and never did —
  the SDD workspace is per-session scratch by design. Affected files include
  `app/src/monitor/driver.test.ts`, `docs/TESTING.md`,
  `docs/monitor/pm5-interface-notes.md`, and eight plans and specs.
  **Why it matters rather than being tidy-up:** every one of these was
  written as the AUTHORITY for a claim — a measurement, a ruling, a
  rejected alternative — and a reader who follows it finds nothing, which
  is indistinguishable from the claim being unsupported. The #141 gate's
  own phrasing: a dangling citation is worse than no citation, because it
  reads as evidence. **The durable authority for a measurement is the TEST
  that pins it**, or a committed capture, or a ledger entry — never a
  scratch report. **Trigger:** the next time any of those files is opened
  for another reason, fix the citations in it; or one sweep if someone
  wants the whole set gone. Do not create `docs/superpowers/sdd/` to make
  the paths resolve — the scratch genuinely should not be committed.
- **An EXTERNAL oracle for the trace: the PM5's own internal log, and the
  logbook** (James, 2026-08-20, from the erg: "there's a verification id
  that the pm can give you for a row. Is checking if we can derive the
  same verification id a way to validate our logbook traces are
  correct?"). **The verification hash itself is NOT the lever** — it is a
  workout SIGNATURE the PM5's firmware produces, and ErgZone's own issue
  #117 closes the question in as many words: the workout-signing
  cryptographic hash is one "we simply can't create (nor should we)". It
  proves the machine's record was not tampered with en route to Concept2;
  recomputing it is what it exists to prevent, and succeeding would only
  prove we hashed the numbers we already hold.
  **What the question DOES point at, and it is valuable** — this repo's
  standing weakness is recurring failure 11, verifying the app only
  against itself:
  - `CSAFE_PM_GET_INTERNALLOGPARAMS` (0x99) plus
    `CSAFE_PM_GET_INTERNALLOGMEMORY1/2/3` (0x6A) read out the machine's
    own stored log, whose structure identifiers include `LOGSPLITDATA`
    and the fixed/variable interval headers. That is an independent check
    on our accumulator's BOUNDARIES and TOTALS, obtainable after the fact
    with no rowing. **Hard limit, and it is decisive:** the identifier
    list is exhaustive and contains **no per-stroke or per-sample
    record**, and the logged-workout size field is 2 bytes — so it can
    never validate the 1 Hz SHAPE, only the boundaries the shape hangs
    on.
  - A Concept2 logbook entry, for any session that goes up via ErgData,
    carries authoritative splits at zero cost to us.
  - **Cheap and worth taking whenever we next touch subscriptions:**
    characteristic **`0x003F`** notifies the just-logged workout's hash,
    internal log address and size after every workout. **We do not
    subscribe to it** (we hold `0x0031`-`0x003A`). Storing that hash
    beside our own log verifies nothing by itself, but it makes our
    record LINKABLE to a logbook entry later — which is the
    "spendable to logbook" question James asked when the series format
    was designed.
  **Deliberately NOT in the trace-truth spec** (2026-08-20): a new
  subscription plus a new CSAFE conversation, on a spec already carrying
  triad weight. **Trigger:** the next work that touches monitor
  subscriptions or CSAFE, or the first time a trace's correctness is
  disputed and our own corpus cannot settle it.
- **App icon redraw** — **MOVED to Phase PROD** (James, 2026-08-20),
  where the corrected description lives. Correction worth keeping here so
  it does not come back: the arc is NOT misspelled. It reads ERGOMATIC;
  the rabbit's ear covers the final C. This entry asserted "ERGOMATIO"
  for weeks and it was repeated into a phase plan before James corrected
  it — nobody had opened the PNG. Verify artwork by looking at it.
- **Apple sign-in**: required the moment a build goes to EXTERNAL TestFlight or the App Store (guideline 4.8; internal TestFlight is exempt). Works with the existing openid-client stack (ES256 client secret, form_post callback, name/email on first auth only); design the allowlist story for private-relay emails first.
- **Apple Health (HealthKit)**: when workout data should flow to Health — write rowing workouts (distance/duration/energy) from the iOS shell; needs entitlements + privacy strings; plugin choice re-verified at build time.
- **Concept2 Logbook sync**: post-workout cloud import; only compelling if ErgData-during-row becomes a habit.
- **Parametric workout generator**: "generate me a 45' AT workout" from the library's authoring rules — the differentiator a static book can't match. Trigger: after Phase 6 makes workouts rowable end-to-end. **Trigger FIRED** — Phase 6 (6A–6D) closed the full card→log loop, both doors, real completion; this is now eligible to schedule, not just a standing intention. Its structural-reference loading is now DONE: Phase 6E's offline pipeline produced `app/domain/generation/patterns.json` (per type×duration-band interval-shape frequencies, work:rest ratios, pace-offset distributions, spm bands, warm-up conventions, rep-count ranges — aggregates only, no titles/prose/per-workout rows, per the content policy), the exact fixture this generator would consume. Phase 6F's UI-fix round is done too, so nothing sits ahead of it in the queue any more — not started, but eligible to schedule now, not just eligible in principle.
- **"Which days did I override, and what was the other suggestion?"** (James, 2026-08-12, during the plan-prescriptions design). Two different questions wearing one sentence. The CHECKPOINT half needs no new capture at all once Phase 8B stamps `plan_key`/`done_n` on each log: a prescription is authored, deterministic data — though NOT from the log's own `workout_title` as this entry originally said: `workout_title` is a save-time snapshot, pre-rename logs carry `First 2k` forever, and the sound method is `plan_index ∈ {6,34,62}` via the columns PW already shipped (corrected at the 2026-08-22 gate). The FREE-FORM half — what the ordinary suggestion would have been on a day the rower shuffled away — is genuinely not backfillable, because `suggest()` depends on the account's preferences and every entry's recency at that instant. It is also NOT one column: the suggestion in force lives on Today, and reaching the save means a new field on the versioned `SessionDraft` localStorage record plus every `buildDraft` entry point that never sees Today at all (Library, WorkoutDetail, BaselineCard, the manual log door). Priced accordingly here rather than smuggled into a checkpoint phase as "two nullable columns." **Trigger:** James wants the retrospective screen, not the column. Then design the screen first, and let it say which of the two questions it is actually asking.
- **A third prescription producer and a real precedence hierarchy** (James, 2026-08-12). Phase 8A ships one producer (the plan) called from one place, so precedence is a comment, not a mechanism. **Trigger:** a second producer becomes real (8C's reservations are the likely first). Then introduce the resolver that orders them, with an asserting test, and settle what a displaced tier does — see 8C's own re-decide item.
- **Retire `LEGACY_TITLE_RENAMES`** (the 8A seed rename map). Permanent code the moment it lands. **Trigger:** every deployed environment has booted past the rename, so no WORKOUTS row can still carry `First 6k`/`First 2k`. Scope corrected at the 2026-08-22 gate: `session_logs.workout_title` is a save-time snapshot and keeps the old spelling FOREVER — the trigger is about the workouts table only, and any query over historical log titles needs both spellings permanently.
- **Harden the post-save offer against the library-loading race** (filed
  2026-08-23 after the flake fired on three branches in one day): when the
  library is still loading at save time, `LogSession` honestly reads "not
  the designated test" and navigates to Today before the post-test offer
  renders — under e2e load this flakes `post-test-prompt` captures and
  `retest.spec` prompt waits, and on a slow real device it can eat a real
  rower's offer. The fix is product-shaped (await the library read before
  deciding, or re-offer on Today), not a test tweak — there is no UI
  signal a test could await today. **Trigger:** next PR touching the
  post-save flow, or the flake reaching CI red. **S/M**
- **Row without a baseline set** (James, 2026-08-23, during BL PR C): a
  no-baseline account can currently browse and row effort-ref workouts, but
  split-ref workouts gate on `needsBaselines` and lose their targets — James
  wants EVERY workout rowable with no baseline: targets simply absent, and
  the set-your-baseline reminder surfaced the way the no-baseline state
  does today. Interaction worth holding: this deliberately softens the
  "half-functional limbo" his option-C ruling rejected at the doors
  brainstorm — the doors stay the fast path to a FULLY working app (targets,
  suggestions, estimates), but nobody is ever blocked from just rowing.
  Touches `needsBaselines` gating, the timer/judge target-less rendering,
  and the reminder's surface. **Partially delivered by Phase JR** (2026-08-24): the "nobody is ever
  blocked from just rowing" half ships as the connected Just Row door; the
  every-workout-targetless half remains this follow-on. **Trigger:** James
  schedules it.
- **Pin the type-to-baseline convention with a test** (found 2026-08-26,
  premise pass). `plans.ts:29-30` says in prose that AN/TR paces resolve
  against the 2k and AT/O2 against the 6k — which is the entire reason the
  sprint plan re-tests the 2k and the head plan the 6k. **The code does not
  implement it**: `pace.ts:33` keys on `ref.base`, stored per work step, and
  a repo-wide search finds ZERO behavioural branches on a `WorkoutType`
  literal in product code. **But the corpus obeys it perfectly** — counted:
  `an.ts` 68/0 and `tr.ts` 218/0 on the 2k, `at.ts` 0/193 and `o2.ts` 0/206
  on the 6k, 286/286 and 399/399, zero crossings across all 300 seeded
  workouts. It is enforced by nothing but that comment: `library.test.ts`'s
  authoring gates all key on `ref.base`, never on `w.type`. An ~8-line test
  in `library.test.ts` moves a 100%-held invariant out of prose and into a
  gate. **Trigger:** next PR touching the seed library or `plans.ts`. **S**
- **Rename trap, recorded so a future grep does not eat it:**
  `surfaceModel.ts:1573` is `if (digits.startsWith("8")) return "AN";` —
  the English article in "AN 800 M PIECE", not the workout type. Any rename
  of a short uppercase token greps for homographs FIRST.
- **Library export/import (private JSON)**: household members share their own transcriptions. Trigger: second active rower asks for it.
- **Auto-capture baselines from the onboarding log**: Phase 6I's no-baseline
  card ends with a manually-entered baseline (You → baseline editor) —
  the log already carries the exact measured stopwatch split
  (`actualSource:"stopwatch"`) for the designated workout's own distance
  phase, so the number a rower would type in by hand already exists on the
  row they just saved. Not built this phase (spec's own "Out of scope":
  "auto-capture of baselines from a logged first row (recorded follow-on)").
  Trigger: a rower feedback signal that manual entry after finishing the
  baseline test is a real friction point, not just a theoretical one. Then:
  read the just-saved log's own step actual and pre-fill (never silently
  overwrite) the relevant baseline field.
- **Move programming limits onto `MonitorCapabilities`**: `domain/monitor/
program.ts` hardcodes PM5 Table 19 limits (`MIN_TIME_SECONDS = 20`,
  `MIN_DISTANCE_METERS = 100`, `MAX_REST_SECONDS = 595`,
  `MAX_INTERVALS = 50`) and its six `CompileError` branches emit
  user-facing copy naming "the PM5" directly. `compileProgram` is the only
  producer of `WorkoutProgram`, and `MonitorCapabilities` has no channel
  for programming limits today, so a second monitor would silently inherit
  PM5 limits and PM5-branded rejection copy instead of its own. Disclosed
  and accepted as correct for now at `program.ts:112` (single-monitor app,
  cheap to fix later) — not a defect to fix today. Trigger: a second
  monitor integration becomes real. Then: add a programming-limits channel
  to `MonitorCapabilities`, move the four constants there per-monitor, and
  template the six `CompileError` messages instead of hardcoding "PM5".
- **Remove the `PULL TO RESUME` block** — CROSS-NOTE 2026-08-22: James
  also observed the band FLASHING for a split second at flywheel-gated
  work-interval starts (fully extended at the catch when the interval
  opens). **§2b's suspected mechanism was FALSIFIED, not fixed:** Task 2
  replayed all 6 committed captures through the real driver and found zero
  PAUSED firings at any post-rest work-interval start — the existing
  `distanceMeters<=0` guard already excludes that case, so there was
  nothing to suppress and no speculative fix shipped. The flash's real
  mechanism is still unexplained; the walk card's capture ask (Task 5)
  is the way it gets settled — copy the connection log immediately if it
  recurs during a walk. The removal this entry wants remains separate and
  is strengthened by the report regardless of cause.
  Original entry: **Remove the `PULL TO RESUME` block** (James, 2026-08-17: "we never got
  rid of the pull to resume screen"): the stale-state band on
  `ConnectedSurface.tsx` (~line 584) still renders its inverted ink field
  when strokes stop mid-piece. CR2 2a task 5 only re-worded and un-occluded
  it (PAUSED noun retired, in-flow, instruction not status); James's flag is
  that the screen itself was supposed to go, not get politer. Work item:
  decide what the stale frame state shows instead (nothing but the live
  numbers? the END/AGAIN chip alone?), then remove the band, its CSS
  (`connected-paused-*` family), the DEVIATIONS paused-treatment rows, and
  the design/e2e witnesses that pin it. Owner: next connected-surface
  phase — pairs naturally with James's stale-while-armed observation, still
  owed from the CR2 phone pass.
- **Anonymous-run logging (`workoutId: null`)** — every storage and server
  layer already accepts the record (nullable column, guards key on
  `completedAt` alone), but no product path can CREATE an anonymous run: the
  only connect door stamps a real workout id (`WorkoutDetail.tsx`), and
  `ANONYMOUS_RUN` is dead code by its own comment. The save door lands WITH
  its first consumer, not before. **Trigger:** a door that creates anonymous
  runs ships — a free-row entry point, or PM5-initiated sessions.
- **Hardware session shopping list (operator-run, one row at the erg)** —
  `docs/monitor/pm5-interface-notes.md` §17 item 21 (the three pairing/
  programming latency spans, still unmeasured against a real PM5) and item 22
  (whether `0x0037`'s Split/Interval Time is the work portion alone or work
  plus its trailing rest, which decides whether `buildMonitorLogSteps` needs
  a re-derivation); §17 item 5's unrowed question, whether a full multi-FRAME
  distance program retains all its intervals when rowed to completion from a
  clean state; and §18's own readings-still-owed list, the PAUSED tick count
  from a full log and RATE at normal pace on a sustained piece. Add a genuine
  mid-piece disconnect to the same row, which no walk has ever exercised. **One
  `.5` pace target on the wire** — every workout programmed so far has carried
  whole-second targets, so `representableCentiseconds`, the fix that let
  baseline-derived splits like `2:14.5` compile at all, has never been sent to
  a real PM5 (§18, walk 1). One row with a `.5` target settles it silently, so
  it rides along with the shopping list above. **Trigger:** James's next
  session at the erg (checklist in PR #70's body).
- **Cron+ntfy revival on the WOD fetcher**: `scripts/wod/fetch-wods.mjs`
  is pull-only today (the `wod-import` skill runs it on demand). Trigger:
  James wants WODs pushed instead of pulled. Then: a cron job runs the
  fetcher on a schedule and an ntfy notification surfaces new unruled
  candidates without a skill invocation.
- **Abandoned-start draft janitor** — the fast-follow phase's
  `startedAt`-stamps-immediately design (spec §3, ruling B1) means a
  rower who taps Start then browser-BACKs away, instead of pressing
  CANCEL, leaves a started draft plus a live run behind that
  `Today.tsx`'s existing janitor can no longer reap: it only discards
  drafts with `startedAt === null`, a state the app can no longer
  produce. Every later Start anywhere then costs a two-press "A
  session is in progress. Replace it?" confirm instead of a silent
  replace. Spec-intended (CANCEL is the documented clean exit),
  surfaced to James rather than fixed silently (Task 4 review, M-2).
  **Trigger:** James accepts the residue as everyday behavior
  (pending) — then a time-based janitor reaps a stamped-but-untouched
  draft a few hours after it starts.
