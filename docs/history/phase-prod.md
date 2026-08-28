> **Archived 2026-08-28** from `ROADMAP.md` (lines 1749-2050 of the
> pre-rebalance file, main `39e9430`). **This section was still LIVE when it
> was archived.** REDISTRIBUTED, not killed. Its eleven items became Wave A (Apple sign-in), Wave C (icon, type disclosure, accessibility, calm motion, cold start), Wave D (simulator, native fake flag, e2e typecheck) and the deferred section (store metadata, PWA). The phase was named for an outcome its item list did not cover.
>
> It is kept verbatim so no detail is lost, and it is a RECORD: the work is
> maintained in `ROADMAP.md`'s live slate, not here. Do not work from this file.

## Phase PROD — Productionization (the last phase before strangers)

### What the research settled about O2 / AT / TR / AN (2026-08-26)

Recorded here so the design pass this phase owes does not re-derive it, and
so the REJECTED options stay rejected for their actual reasons. Sources are
cited because two claims in this thread were stated unsourced and had to be
retracted (recurring failure 16).

**A rename was investigated and rejected — but NOT on the cost grounds first
argued.** The database is cheap: PostgreSQL `ALTER TYPE ... RENAME VALUE` is
catalog-only, no table rewrite, ordering preserved
(<https://www.postgresql.org/docs/current/sql-altertype.html>), so
`workouts.type` is four DDL lines and `session_logs.workout_type` (plain
`text`, `schema.ts:147`, NOT the pgEnum at `:46`) is one UPDATE. The real
cost is ~1230 literal occurrences across 88 files, five e2e specs, 84
captures — and, decisively, **eight documented invariants that stop being
READABLE**: the strict `O2 > AT > TR > AN` plan pyramid (`plans.test.ts:49`),
the `["AN","TR"]`-speed vs `["O2","AT"]`-endurance partition (`:71-79`), the
deload rule, the monotone spm/pain authoring bands
(`library.test.ts:65-79`), `patterns.json`'s quota grid, and the pinned
app-wide display order. Neutral names (`Type1..Type4`) preserve every one of
them MECHANICALLY and destroy their legibility. **"Does a rename break the
code" and "does it break the audit" are different questions; for a taxonomy
the second is the expensive one.**

**The maintainability argument for genericising was measured and does not
hold.** `git log -L1,1:app/domain/types.ts` returns two commits in the
repo's life: the file's creation, and a prettier quote change. **The members
have never changed.** The only nearby taxonomy event went the other way —
`PlanCode`'s `"TEST"` member was RETIRED (ROADMAP:1445). And the decoupling
the instinct wants already exists: `typeWords.ts` is the display registry;
`TypeBadge` simply chooses to render the code instead of the word.

**Why not heart-rate zones 1-5,** the genuinely wider vocabulary (Apple ships
zones with no names at all; number-primary products cover ~420M accounts):
this app has **no heart rate** (`judge.ts:44-47` says so), so adopting an
HR-defined ladder for bands actually defined by pace offset and rest ratio
asserts a concept the system does not have — the same shape as the PAUSED
state the PM5 does not have. It is also not a clean relabel: our four map to
five zones with O2 spanning two of them and AN having no HR zone at all. And
"Zone 2" is itself contested — in the 3-zone model it sits BETWEEN the
thresholds, in the 5-zone model just BELOW the first, so the same label names
non-overlapping intensities (Sitko et al., *IJSPP* 2025;20(11):1614-1617,
a 14-expert panel convened to settle one label).

**Why not plain words alone** (Easy / Steady / Hard / Sprint): they were
MEASURED failing. Given the descriptors the WHO and NHS publish, 129
participants self-selected 58.7% of max HR for "moderate" against a 64-76%
guideline, and 52% asked to walk at a health-beneficial pace walked at light
effort (Canning et al., *PLoS ONE* 2014;9(5):e97927); a second study (n=498)
found numeric ratings separated intensity levels while verbal cues did not
(Kim et al., *JMIR Public Health Surveill* 2020;6(2):e16303). They would also
**collide with the app's own EASY / MEDIUM / HARD difficulty axis**, printed
on the same rows — a card would read "Sprint · EASY".

**The one durable finding under all of it:** ordered labels communicate RANK
reliably and MAGNITUDE unreliably (Dawes et al., *Arch Phys Med Rehabil*
2005;86(5):912-916 — every group placed Borg's anchor words in the right
ORDER, and disagreed on their spacing). Which is why the pyramid figure
teaches in two seconds: it ranks by POSITION, not by hue.

**Where the vocabulary actually comes from, cited.** UT2/UT1/AT/TR/AN is
Concept2 UK's own ladder, from the *Indoor Rowing Training Guide* (O'Neill,
Atkinson & Atkinson, "produced by Concept II Ltd"; TR expands to "Oxygen
Transportation") — copy at
<https://trondhjems-roklub.no/files/c2_training_v1.pdf>. **No current
Concept2 consumer product uses it:** their heart-rate article ships Zone 1-5
(<https://www.concept2.com/blog/heart-rate-training-with-your-concept2-erg>),
their Workout of the Day explicitly refuses zones for three defined plain
words — "Hard" / "Sustainable" / "Light pressure"
(<https://www.concept2.com/training/wod>) — their training plans are labelled
by goal only, and their Logbook API carries no intensity field at all beyond
a numbered `heart_rate_zone` 0-5
(<https://log.concept2.com/developers/documentation/>). The ladder survives
in club rowing (British Rowing's seven-band matrix, which bolts an RPE column
onto the codes precisely because the plain words were not landing between
coach and rower) and in ErgZone. **A peer teardown of seven connected-rowing
products (Hydrow, Peloton Row, Aviron, Ergatta, CityRow, Asensei, Kinomap)
found ZERO shipping a two-letter intensity code, and zero shipping this
ladder.** Their three strategies are: collapse intensity into the type name
(Hydrow's Breathe / Sweat / Drive — "Sweat" is anaerobic threshold with the
jargon stripped), COMPUTE it and never name it (Ergatta's auto-recalibrating
intensity, Peloton Row's "Harder than your usual"), or omit it entirely
(Aviron). Where a code does survive, it is glossed at every point of use, not
in a help article (Ergatta's Meteor / Echo / Pulse). Note the explanation
cost this implies: **Hydrow ships a YouTube video per label for three plain
English verbs.** Nobody found three or four words self-explanatory.

**Live defects the design pass found.** Three real bugs, filed as their own
items under "Triggered follow-ons" (TL-1 misaligned descriptor, TL-2 two
plain-word sets, TL-3 the pyramid's sub-floor text) rather than recorded only
here. **Two of the three are independently fixable and should NOT wait for
this phase.** They cross-reference this item; this item cross-references them.

**Rejected with reasons, so it is not re-proposed: an intensity COLOUR
ramp.** A warm ramp needs a red at the hot end and lands back on `--accent`,
which is the exact bug that made `--type-tr` an alias of `--ink`
(`tokens.css:113-131`, DEVIATIONS row 59). The app already carries three
distinct reds (`--accent`, `--judge-slower`, `--pain-ramp-5`), and
**`--pain-ramp-3` #8a5f18 is byte-identical to `--type-at`**, a collision
that has already been misread as a type once (`ClassificationCard.tsx:47-51`).
The "black reads as disabled" complaint is real but is a convention read, not
a contrast failure: TR measures **17.11:1**, the best of the four. The word
fixes the read; no disabled control says HARD INTERVALS.

**Copy note, separable and NOT decided:** the rank breaks at position four.
`LOW & SLOW` -> `COMFORTABLY HARD` -> `HARD INTERVALS` climbs cleanly;
`SPEED WORK` reads as a different CATEGORY, and is itself coach jargon.
`ALL-OUT SPRINTS` would preserve the ascent and still fit every layout
measured. A copy change with its own gate; do not fold it in silently.
And never reuse `EASY` or `HARD` as a type word — that is the difficulty
vocabulary, printed on the same rows.


**Status:** Not started. **This is the final phase** (James, 2026-08-20:
"the app icon and Apple login etc should all go into a productionization
final phase"). It exists because a set of items share one trigger and one
deadline rather than one subsystem: every one of them is a thing App
Review, or a tester who is not James, will meet first.

**Goal:** the app can be handed to someone outside the household without
an apology.

**The line this phase defends.** Internal TestFlight is exempt from all of
it, which is why none of these have blocked anything so far. The moment a
build goes to EXTERNAL TestFlight or the App Store, they all bind at once.
Nothing here should be discovered at submission time.

- [x] **F1 from Phase LL's exit walk (2026-08-23): the failure screen's
      Try again is DEAD after a mid-session BT-off** — three compounding
      defects, not the walk's own filed listener theory (struck below: the
      review proved it irrelevant — `canRetry` never reads enabled state,
      so a torn-down `onEnabledChanged` was never in the causal chain).
      PROD's exit is an empty-phone install reaching a logged row UNAIDED;
      a dead button with no feedback defeats "unaided" directly. **FIXED
      (cohort-unlock PR, 2026-08-23, two fix rounds):** (1) `canRetry` was
      `phase === "failed"` only, so the `disconnected`-no-run branch
      rendered the button disabled by construction — widened to also cover
      `session.phase === "disconnected"`. (2) Enabling it alone was not
      enough: the `disconnected` event handler never disposed the driver,
      so `connect()`'s own `driverRef.current !== null` guard silently
      no-op'd every tap — fixed by disposing (unsubscribe, null
      `driverRef`, hang up the transport) inside the handler itself,
      deliberately WITHOUT clearing `deviceName` (the disconnected-WITH-
      run surface's LOST header needs it). (3) That deliberate choice then
      broke re-programming: `programmedForDeviceRef` only resets when
      `deviceName` goes `null`, which this disposal no longer does, so a
      retry connected to the same PM5 but the pairing effect saw
      "already programmed" and never called `program()` — the rower
      landed stuck on CONNECTING/SENDING THE WORKOUT with only Cancel,
      caught by a fake-driven walk test before merge and fixed by
      resetting that ref explicitly in `handleTryAgain`.
- [ ] **App icon redraw** (was a triggered follow-on). Replace the
      AI-generated icon with a clean SVG. What is actually wrong with it,
      checked against the asset itself
      (`app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`,
      2026-08-20) rather than repeated from this file: the top arc DOES
      read ERGOMATIC — **the rabbit's ear crosses the final C and hides
      it**, so at icon size the wordmark loses its last letter. (An
      earlier version of this line claimed the arc was misspelled
      "ERGOMATIO"; that was wrong, it propagated for weeks, and James
      corrected it. Nobody had opened the file.) The real blockers:
      **the erg rail carries a third-party brand wordmark and logo**,
      which has to come off; the icon bakes in its own rounded corners
      and drop shadow, doubling up with iOS's mask; and the whole thing
      is AI-generated raster art at one size. **App Review would reject
      the third-party mark** — this is the hardest gate in the phase and
      the only one needing a human with taste. **M**
- [ ] **Apple sign-in** (was a triggered follow-on). Guideline 4.8:
      required the moment a build leaves internal distribution. Works
      with the existing openid-client stack (ES256 client secret,
      form_post callback, name and email on first auth ONLY — Apple
      sends them once and never again). **Design the allowlist story for
      private-relay addresses FIRST**: `ALLOWED_EMAILS` cannot match a
      relay address the rower has never seen, so the current door does
      not survive contact with Apple sign-in unchanged. AUTH — triad
      weight, full antagonist pass on its spec plus a PM final-PR gate. **L**
- [ ] **Store metadata and the legal surface.** Not previously on this
      roadmap in any form, and every item is required for submission: a
      privacy policy at a real URL, a support URL, the App Privacy
      questionnaire answered truthfully against what we actually store
      (sessions, series traces, heart rate — heart rate is health data
      and is answered as such), age rating, and store screenshots at the
      required sizes. The screenshots are cheap here: `pnpm screenshots`
      already produces honest captures of real data. **M**
- [ ] **The four workout types teach themselves, or a stranger meets a
      bare `TR`.** (James asked 2026-08-26 whether O2/AT/TR/AN should
      borrow more universal language; researched, designed, deferred to
      here with him leaning Option A and wanting a fuller design pass
      before anyone builds it.) **The verdict was NOT a rename** — see
      the "What the research settled" block below for why, and for the
      three live defects the design pass found on the way. What ships
      here is DISCLOSURE: the app already owns plain words
      (`src/components/typeWords.ts`) and shows them one at a time, only
      for the chip already selected, `aria-hidden` in two of three
      places, with every other badge bare and unnamed to a screen
      reader. **Leaning Option A** (chips become a 2x2 grid, each
      carrying its own word) — the only shape where all four fit at a
      legal size, measured: four phrases in one row needs 586.8px
      against the 350px a 390px phone has, a 68% overrun, and forcing it
      would need 5.4px type against a 10px floor. Fold in, whichever
      chip shape wins: the badge STAYS BARE on Library and history rows
      with a visually-hidden name (a visible word costs 118px of a 168px
      history title, cutting every workout name to ~7 characters, and
      fails outright by 50px on custom Library rows), and the workout
      detail screen carries the word plus one plain sentence. **No
      tooltips** — hover does not exist on touch, and NN/g is explicit
      that a label needing interaction is not a label. **M**
- [ ] **Accessibility audit against the handoff's hard rules** — every
      target ≥ 44×44 px, all text ≥ 4.5:1 AA, computed and reported as
      numbers rather than judged by eye (recurring failure 6). **Moved
      here from Phase 10**: it is a release gate, not household polish,
      and the phases that shipped since have each added surfaces it has
      never covered. **M**
- [ ] **Calm-motion pass** — no animation beyond the timer tick and the
      progress bars. **Moved here from Phase 10** for the same reason:
      `prefers-reduced-motion` is an App Review-adjacent accessibility
      expectation, not a nicety. **S**
- [ ] **PWA installability** (manifest, icons, standalone display).
      **Moved here from Phase 10** — it shares the icon work above and
      the same "someone outside the household installs this" trigger. **S**
- [ ] **A cold-start pass on a device that has never run the app.**
      Every walk and every gate this repo has ever run started from a
      populated account. Nobody has watched a genuinely empty install
      reach its first logged row — the onboarding cards, the no-baselines
      door, and the first connect all exist and are tested, but only
      against fixtures we seeded (recurring failures 3 and 11, together).
      One run, one new account, no shortcuts. **The iOS simulator covers
      the WEBVIEW half and no more** — an erased simulator is a genuine
      never-run-the-app webview state, so empty-account onboarding
      through to a by-hand logged row runs there and costs a menu item
      instead of wiping a phone. It does NOT cover the things a real
      first run is actually made of, and the exit pass was explicit
      about this: no OS permission prompts (no BLE at all —
      `capacitorBle.ts:138-145`), no TestFlight install flow, no
      Keychain/secure-storage first run. So the simulator PRE-SCREENS
      and the phone SETTLES; a green simulator run is not this item's
      exit. **S**
- [ ] **Stand the simulator up as a standing instrument, not a one-off.**
      (James, 2026-08-20: "make sure to consider the iOS simulator".)
      It is currently used nowhere — `grep -ri simulator` across the repo
      returns only the FAKE TRANSPORT's own prose, never Apple's
      simulator. Three of this phase's items want it and one other thing
      does:
      - **Store screenshots at the required sizes** — the simulator is
        the standard instrument for these, and it is the only way to hit
        Apple's exact device dimensions without owning each device.
      - **The accessibility audit** — real Dynamic Type, VoiceOver, and
        Reduce Motion, none of which desktop Chrome can produce and all
        of which the audit is supposed to check.
      - **The cold-start pass** above.
      - **Layout pre-screening for future connected work**, with the
        limit stated precisely — an earlier draft of this bullet got the
        MECHANISM wrong and the antagonist's exit pass corrected it
        (2026-08-20), so the correction is kept here rather than quietly
        overwritten. A WEB build carrying `VITE_ENABLE_FAKE_MONITOR=1`
        opened in the simulator's Mobile Safari DOES reach the fake
        transport (`transports/index.ts:251`; `isNative()` is false in
        Safari), giving an armed connected surface with no erg and no
        BLE. The draft said its safe-area insets are not the shell's;
        **that is wrong.** WebKit documents `env(safe-area-inset-*)` as
        determined by "the physical features of the device itself, not
        the browser's UI" (webkit.org/blog/7929, PRIMARY) — the insets
        DO transfer. What does not transfer is the **height model**:
        Safari's chrome collapses on scroll, so `100dvh` there is a
        moving target, while the shell's WKWebView is fullscreen with
        none. So: Safari-in-simulator is pre-screening for layout, and
        **never authoritative for a `100dvh` question**, which is
        precisely half of what the connected-surface occlusion check
        tests. **S**
- [ ] **app/e2e/ is not typechecked** (James, 2026-08-23 — owner assigned;
      previously a trap note): tsconfig.app.json covers only
      src/domain/scripts and Playwright erases types; a hand-rolled config
      over e2e/ surfaced 14 pre-existing errors when last tried. Fix the
      errors, wire the config into pnpm typecheck.
- [ ] **Let a build flag reach the fake transport on NATIVE.** One line
      in `src/adapters/monitorTransport.ts`, and it is the difference
      between "the simulator can never see a connected screen" and "every
      layout, safe-area and `100dvh` question is answerable at a desk
      forever". Today `isNative()` sends the simulator down the Capacitor
      arm, `initialize()` rejects `BLE unsupported`, and the armed screen
      is unreachable (`capacitorBle.ts:138-145`; Apple TN2295 — the
      Simulator has no Bluetooth). A native DEBUG build in the simulator
      is the real shell, with real insets and a real fullscreen height
      model — authoritative for exactly the questions Safari cannot
      settle. This is also the SAME defect recurring failure 13 records
      (only the web arm reaches the fake seam), so fixing it retires a
      standing trap rather than adding a feature. Dev/debug builds only,
      proven absent from the production bundle by `dist-grep.sh` in both
      directions per recurring failure 12. **S**

**Deliberately NOT in this phase:** Apple Health, Concept2 Logbook sync,
the parametric generator, multi-rower switching. They are features with
their own triggers; bundling them here would turn a release gate into an
open-ended wish list and guarantee the phase never closes.

**Exit:** a build passes App Review's mechanical checks with no
placeholder artwork, a real sign-in path for a rower with no Google
account, a truthful privacy declaration, and an empty-phone install that
reaches a logged row without a hand from us.
